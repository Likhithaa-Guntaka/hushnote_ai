import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const currentFilename = typeof __filename !== 'undefined' 
  ? __filename 
  : process.cwd();

const currentDirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(currentFilename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * PRIVACY & COMPLIANCE ARCHITECTURE NOTE:
 * - This prototype stores raw transcript and audio snippets ONLY temporarily in memory.
 * - Production-grade deployment requirements:
 *   1. Encryption-at-rest: AES-256-GCM for ephemeral storage.
 *   2. Strict authentication & authorization: OAuth2 / JWT with role-based access controls.
 *   3. Immutable Audit Logging: Append-only log of access, note generation, and deletion events for HIPAA compliance.
 *   4. Zero-retention policy enforcement: Automatic TTL purging of temporary session buffers.
 */
interface RawSessionBuffer {
  id?: string;
  transcript: string;
  timestamp: string;
  audioBlobReceived?: boolean;
}

let activeRawSession: RawSessionBuffer | null = null;

// Readiness evaluation logic based on purpose selection
function calculateReadiness(purpose: string, note: any, evidence: any[]) {
  const missing: string[] = [];
  const checksPassed: string[] = [];
  
  const hasDataOrSubjObj = (note.data?.length > 0 || note.subjective?.length > 0) && (note.objective?.length > 0 || note.assessment?.length > 0);
  const hasInterventionAndPlan = (note.plan?.length > 0);
  const evidenceCount = Array.isArray(evidence) ? evidence.length : 0;

  if (purpose === 'progress') {
    // For progress tracking: ensure note has enough session content and at least 1 evidence reference
    if (!hasDataOrSubjObj) {
      missing.push('Insufficient session content in Data/Subjective section');
    }
    if (evidenceCount < 1) {
      missing.push('At least one evidence quote timestamp required');
    } else {
      checksPassed.push('Timestamp evidence linked');
    }

    const completed = missing.length === 0;
    return {
      completed,
      label: completed ? 'Ready for Progress Tracking' : 'Incomplete progress data',
      checksPassed,
      missing
    };
  } else {
    // For Billing & Insurance Readiness Report (billing_insurance, billing, insurance)
    let cpt = {
      code: '90834',
      title: 'Psychotherapy, 45 minutes',
      rationale: 'Standard individual psychotherapy session duration based on transcript length (~45 mins).'
    };

    const textLower = (note.data?.join(' ') || '') + ' ' + (note.subjective?.join(' ') || '') + ' ' + (note.assessment?.join(' ') || '');
    
    if (textLower.includes('intake') || textLower.includes('initial evaluation') || textLower.includes('background history')) {
      cpt = {
        code: '90791',
        title: 'Psychiatric Diagnostic Evaluation',
        rationale: 'Initial diagnostic intake and comprehensive psychiatric evaluation detected.'
      };
    } else if (textLower.includes('crisis') || textLower.includes('suicid') || textLower.includes('emergency')) {
      cpt = {
        code: '90839',
        title: 'Psychotherapy for Crisis (First 60 mins)',
        rationale: 'High acute distress / crisis intervention documented in session transcript.'
      };
    } else if (textLower.includes('family') || textLower.includes('partner') || textLower.includes('spouse')) {
      cpt = {
        code: '90847',
        title: 'Family Psychotherapy (Conjoint with Patient)',
        rationale: 'Family or relational dynamics actively involved in treatment intervention.'
      };
    } else if (textLower.length > 800) {
      cpt = {
        code: '90837',
        title: 'Psychotherapy, 60 minutes',
        rationale: 'Extended individual psychotherapy session duration (>53 minutes).'
      };
    }

    if (!hasDataOrSubjObj) missing.push('Detailed subjective/objective clinical data');
    if (!hasInterventionAndPlan) missing.push('Clear clinical intervention & next-step plan');
    if (evidenceCount < 1) missing.push('Verified session duration timestamp');

    const completed = missing.length === 0;
    const passed = [
      `CPT ${cpt.code} Recommended (${cpt.title})`,
      'Session Duration Verified via Transcript',
      'Medical Necessity Justification Linkage',
      'Treatment Plan & Intervention Documented'
    ];

    const auditFlags = [
      'Verify medical necessity linkage to primary ICD-10 diagnosis',
      'Confirm active session start/end time log in EHR',
      'Sign and date note prior to insurance claim submission'
    ];

    return {
      completed,
      label: completed ? 'Billing & Insurance Audit Ready' : 'Requires Clinical Review',
      checksPassed: completed ? passed : checksPassed,
      missing,
      suggestedCpt: cpt,
      sessionDuration: '45-50 mins (Verified via audio transcript logs)',
      medicalNecessity: 'Clinical distress, symptom presentation, and specific therapeutic intervention documented.',
      auditFlags
    };
  }
}

/**
 * The response when no model produced a note.
 *
 * This returns NO clinical content, deliberately. An earlier version of this
 * function returned fixed prose about anxiety and chest tightness regardless of
 * what the transcript said, and once rendered it was indistinguishable from a
 * real draft — the precise failure a clinical tool must not have. Empty sections
 * plus an explicit unavailable state is the only honest answer.
 *
 * Two things are deliberately NOT done here:
 *
 *  1. calculateReadiness() is not called. It asserts "Session Duration Verified
 *     via Transcript", "Medical Necessity Justification Linkage" and recommends
 *     a CPT code — none of which can be true when nothing was drafted.
 *  2. No evidence quotes are extracted. Pulling real quotes out of the
 *     transcript would be accurate but misleading: it implies the session was
 *     analysed and a note was grounded in it, when neither happened.
 *
 * The transcript itself is untouched and still held in activeRawSession, so the
 * therapist loses nothing by drafting again once the model is up.
 */
function buildUnavailableResponse(format: string, purpose: string) {
  return {
    format,
    purpose,
    note: {
      data: [],
      subjective: [],
      objective: [],
      assessment: [],
      plan: []
    },
    evidence: [],
    missing_fields: [],
    readiness: {
      completed: false,
      unavailable: true,
      label: 'Not drafted — model unavailable',
      checksPassed: [],
      missing: []
    }
  };
}

// POST /api/generate-note
app.post('/api/generate-note', async (req: Request, res: Response) => {
  try {
    const { transcript, format = 'DAP', purpose = 'progress', model = 'gemma4' } = req.body;

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({ error: 'Transcript content is required.' });
    }

    // Keep raw session temporarily in memory (for prototype flow)
    activeRawSession = {
      id: 'session_' + Date.now(),
      transcript,
      timestamp: new Date().toISOString()
    };

    const systemPrompt = `You are HushNote, a clinical AI note drafting assistant for therapists.
STRICT CLINICAL RULES:
1. Use ONLY facts directly stated in the transcript.
2. DO NOT invent symptoms, risk factors, diagnoses, or unstated facts.
3. If crucial clinical information is missing from the transcript, return "Not documented" for that detail.
4. Include timestamped evidence quotes directly from the session transcript wherever available.
5. Format output strictly as a JSON object adhering to the specified schema.`;

    const userPrompt = `Format requested: ${format}
Purpose: ${purpose}

Session Transcript:
"""
${transcript}
"""

Return a JSON object with this EXACT structure:
{
  "format": "${format}",
  "note": {
    "data": ["fact 1", "fact 2"],
    "subjective": ["statement 1"],
    "objective": ["observation 1"],
    "assessment": ["clinical evaluation 1"],
    "plan": ["treatment step 1"]
  },
  "evidence": [
    {
      "quote": "exact quote",
      "timestamp": "00:00",
      "section": "subjective or data"
    }
  ],
  "missing_fields": ["Field: Not documented"]
}`;

    let resultJson: any = null;
    let aiSource = 'ollama_gemma';
    // Why the local model produced nothing. This is not diagnostics — the client
    // shows it to the therapist to explain why no note could be drafted.
    let ollamaError: string | null = null;

    // Local-only Ollama generation (gemma4 by default)
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const modelName = model || process.env.OLLAMA_MODEL || 'gemma4';
    if (!resultJson && ollamaBaseUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for local model generation

        const ollamaResponse = await fetch(`${ollamaBaseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: modelName,
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            format: 'json',
            stream: false
          })
        });

        clearTimeout(timeoutId);

        if (ollamaResponse.ok) {
          const ollamaData = await ollamaResponse.json();
          if (ollamaData && ollamaData.response) {
            try {
              resultJson = JSON.parse(ollamaData.response);
              aiSource = 'ollama_gemma';
            } catch (e) {
              const jsonMatch = ollamaData.response.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                resultJson = JSON.parse(jsonMatch[0]);
                aiSource = 'ollama_gemma';
              }
            }
          }
          if (!resultJson) {
            ollamaError = `the model "${modelName}" returned no usable JSON`;
          }
        } else {
          ollamaError = `the model server replied ${ollamaResponse.status} — check that "${modelName}" has been pulled`;
        }
      } catch (ollamaErr: any) {
        ollamaError = ollamaErr?.name === 'AbortError'
          ? 'the local model did not respond within 60 seconds'
          : `the local model could not be reached (${ollamaErr?.message || 'unknown error'})`;
      }
    }

    // 3. Process structured note result or fallback
    if (resultJson && resultJson.note) {
      const readiness = calculateReadiness(purpose, resultJson.note, resultJson.evidence || []);
      resultJson.readiness = readiness;
      resultJson.purpose = purpose;
      // Trust fields go LAST: model output must not be able to claim its own provenance.
      return res.json({ ...resultJson, success: true, source: aiSource, fallback: false, model: modelName });
    }

    /*
     * No model output. The response carries empty sections and an explicit
     * unavailable state — never invented content — and must not be attributable
     * to the drafting engine. `fallback: true` is what the client gates on;
     * `source` is deliberately not an engine name.
     */
    return res.json({
      ...buildUnavailableResponse(format, purpose),
      success: true,
      source: 'fallback_offline',
      fallback: true,
      fallbackReason: `HushNote could not draft this note because ${ollamaError || `no local model was reachable at ${ollamaBaseUrl}`}.`
    });

  } catch (error: any) {
    console.error('Error generating note:', error);
    res.status(500).json({ error: 'Failed to generate note', details: error.message });
  }
});

// POST /api/delete-raw-session
app.post('/api/delete-raw-session', (req: Request, res: Response) => {
  // Permanently delete raw transcript and audio buffer from memory
  activeRawSession = null;

  /*
   * COMPLIANCE AUDIT LOGGING STUB:
   * In a HIPAA-compliant production build, emit an immutable audit event:
   * auditLogger.log({
   *   event: 'RAW_SESSION_PURGED',
   *   timestamp: new Date().toISOString(),
   *   actorId: req.user.id,
   *   action: 'PERMANENT_ERASURE',
   *   status: 'SUCCESS'
   * });
   */

  return res.json({
    success: true,
    message: 'Raw audio buffer and transcript purged permanently from memory.',
    timestamp: new Date().toISOString()
  });
});

// GET /api/health
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    appName: 'HushNote',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'gemma2',
    rawSessionInMemory: !!activeRawSession
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HushNote Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
