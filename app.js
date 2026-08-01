/**
 * HushNote - Frontend Screen & State Wiring (app.js)
 * 
 * ATTACHMENT INSTRUCTIONS FOR STITCH HTML:
 * Add <script src="app.js" type="module"></script> at the bottom of index.html.
 * Ensure the following element IDs exist in your Stitch HTML screens:
 * 
 * - Screens: 'home-screen', 'consent-screen', 'recording-screen', 'format-screen', 
 *            'processing-screen', 'purpose-screen', 'review-screen', 'success-screen'
 * - Buttons & Inputs:
 *   - startSessionBtn       : Button to start session from hero screen
 *   - consentCheckbox       : Checkbox confirming client consent
 *   - confirmConsentBtn     : Button to proceed from consent screen
 *   - startRecordingBtn     : Button to start audio recording
 *   - stopRecordingBtn      : Button to stop recording and proceed to format selection
 *   - transcriptInput       : Textarea for pasting or viewing raw transcript
 *   - audioPlayback         : <audio> tag for playing temporary session recording
 *   - recordingTimer        : Element displaying timer (e.g., 00:42)
 *   - noteFormat            : Container or input holding format selection (DAP/SOAP/BOTH)
 *   - noteBody              : Editable container/textarea for generated note content
 *   - readinessLabel        : Status badge for note readiness
 *   - missingFields         : Container for missing fields checklist
 *   - evidenceChips         : Container for timestamped evidence quotes
 *   - approveDeleteBtn      : Button to approve note and purge raw data
 */

// Global Application State
const state = {
  currentScreen: 'home-screen',
  consentGiven: false,
  isRecording: false,
  mediaRecorder: null,
  speechRecognition: null,
  audioChunks: [],
  audioUrl: null,
  recordingSeconds: 0,
  timerInterval: null,
  baseTranscript: '',
  speechTranscriptBuffer: '',
  transcript: `Client: I've been feeling more anxious lately... it's like this tightness in my chest that won't go away regardless of what I do to try and relax.
Therapist: Let's explore what triggers that. Does it happen at specific times of the day or during certain activities?
Client: It usually starts right as I'm getting ready for work in the morning...`,
  selectedFormat: 'DAP', // 'DAP', 'SOAP', 'BOTH'
  selectedPurpose: 'progress', // 'progress', 'billing', 'insurance'
  generatedNoteResponse: null,
  isProcessing: false
};

// DOM Element Registry
let elements = {};

// Initialize HushNote Client App
document.addEventListener('DOMContentLoaded', () => {
  console.log('[HushNote Client] Initializing state wiring...');
  cacheDOMElements();
  bindEventListeners();
  checkBackendHealth();
  updateTimerDisplay();
  showScreen('home-screen');
});

/**
 * Cache DOM elements safely (works even if some Stitch IDs are missing or styled differently)
 */
function cacheDOMElements() {
  elements = {
    // Screens
    homeScreen: document.getElementById('home-screen') || document.getElementById('landing-screen'),
    consentScreen: document.getElementById('consent-screen'),
    recordingScreen: document.getElementById('recording-screen') || document.getElementById('screen-3'),
    formatScreen: document.getElementById('format-screen') || document.getElementById('formatSelectionContainer'),
    processingScreen: document.getElementById('processing-screen'),
    purposeScreen: document.getElementById('purpose-screen') || document.getElementById('purpose-form-container'),
    reviewScreen: document.getElementById('review-screen') || document.getElementById('review-cockpit'),
    successScreen: document.getElementById('success-screen') || document.getElementById('success-overlay'),

    // Interactive Elements
    startSessionBtn: document.getElementById('startSessionBtn') || document.querySelector('.orb-hover') || document.querySelector('[onclick*="transitionToConsent"]'),
    consentCheckbox: document.getElementById('consentCheckbox') || document.getElementById('consent-check'),
    confirmConsentBtn: document.getElementById('confirmConsentBtn') || document.getElementById('continue-btn'),
    backConsentBtn: document.getElementById('backConsentBtn'),
    
    // Recording Elements
    startRecordingBtn: document.getElementById('startRecordingBtn'),
    stopRecordingBtn: document.getElementById('stopRecordingBtn') || document.querySelector('[onclick*="screen-4"]'),
    transcriptInput: document.getElementById('transcriptInput') || document.getElementById('transcript-feed'),
    loadSampleTranscriptBtn: document.getElementById('loadSampleTranscriptBtn'),
    speechStatusBadge: document.getElementById('speechStatusBadge'),
    speechStatusText: document.getElementById('speechStatusText'),
    audioPlayback: document.getElementById('audioPlayback'),
    recordingTimer: document.getElementById('recordingTimer') || document.getElementById('timer'),

    // Options Elements
    formatOptions: document.querySelectorAll('[data-format]'),
    purposeOptions: document.querySelectorAll('input[name="purpose"]'),
    generateNoteBtn: document.getElementById('generateNoteBtn'),
    submitPurposeBtn: document.getElementById('submitPurposeBtn'),

    // Review & Finalization Elements
    readinessLabel: document.getElementById('readinessLabel'),
    readinessDetails: document.getElementById('readinessDetails'),
    missingFields: document.getElementById('missingFields'),
    evidenceChips: document.getElementById('evidenceChips'),
    noteBody: document.getElementById('noteBody'),
    approveDeleteBtn: document.getElementById('approveDeleteBtn') || document.getElementById('approve-btn'),
    
    // Reset/New Session Buttons
    startNewSessionBtn: document.getElementById('startNewSessionBtn')
  };
}

/**
 * Attach Event Listeners to Stitch HTML UI controls
 */
function bindEventListeners() {
  // 1. Start Session Button
  if (elements.startSessionBtn) {
    elements.startSessionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('consent-screen');
    });
  }

  // 2. Consent Checkbox
  if (elements.consentCheckbox) {
    elements.consentCheckbox.addEventListener('change', (e) => {
      state.consentGiven = e.target.checked;
      if (elements.confirmConsentBtn) {
        elements.confirmConsentBtn.disabled = !state.consentGiven;
        elements.confirmConsentBtn.classList.toggle('opacity-40', !state.consentGiven);
      }
    });
  }

  // 3. Confirm Consent Button
  if (elements.confirmConsentBtn) {
    elements.confirmConsentBtn.addEventListener('click', () => {
      if (!state.consentGiven && elements.consentCheckbox && !elements.consentCheckbox.checked) {
        alert('Please confirm client consent to proceed.');
        return;
      }
      showScreen('recording-screen');
      autoStartRecordingOrTimer();
    });
  }

  // 4. Recording Controls
  if (elements.startRecordingBtn) {
    elements.startRecordingBtn.addEventListener('click', startAudioRecording);
  }

  if (elements.stopRecordingBtn) {
    elements.stopRecordingBtn.addEventListener('click', stopAudioRecording);
  }

  // Live transcript input editing
  if (elements.transcriptInput && elements.transcriptInput.tagName === 'TEXTAREA') {
    elements.transcriptInput.addEventListener('input', (e) => {
      state.transcript = e.target.value;
    });
  }

  // Load Sample Clinical Transcript button
  if (elements.loadSampleTranscriptBtn) {
    elements.loadSampleTranscriptBtn.addEventListener('click', () => {
      const sample = `[00:00] Therapist: Welcome back, Sarah. How have things been going for you since our session last Thursday?
[00:45] Client: Thanks, Dr. Vance. Honestly, it’s been a really tough week. My anxiety has been through the roof, especially in the mornings, and I felt like I was running on empty by Wednesday.
[02:10] Therapist: I hear how exhausting that has been. When you say your anxiety was through the roof, what did that feel like physically and mentally?
[03:15] Client: Physically, it starts as this deep tightness right in the center of my chest, like someone is squeezing a vice. My breathing gets really shallow, and my hands get clammy. Mentally, my thoughts just start spiraling about work. I wake up at 6:00 AM and immediately think, "I have three project deadlines, I'm going to fail, my manager is going to realize I'm not cut out for this."
[05:30] Therapist: That somatic response—the chest tightness and shallow breathing—is your nervous system going into fight-or-flight mode. On a scale of 1 to 10, how intense was that anxiety during those morning peaks?
[06:40] Client: Easily an 8 or a 9 out of 10. On Tuesday morning, I actually had to sit on the edge of my bed for 20 minutes before I could even get up to brush my teeth because my heart was racing so fast.
[08:15] Therapist: Thank you for sharing that. Were you able to try any of the diaphragmatic breathing exercises or the 5-4-3-2-1 grounding technique we practiced last session?
[09:30] Client: I tried the 4-7-8 breathing on Tuesday when I was sitting on the bed. At first, it felt like my chest was too tight to take in a full breath, but after about 4 or 5 cycles, my heart rate did slow down a little bit. It brought the anxiety down from an 8 to maybe a 6. But the negative thoughts were still humming in the background.
[12:00] Therapist: That’s actually a really important victory. Lowering an 8/10 panic spike down to a 6 using diaphragmatic breathing proves your physiological state can respond to self-regulation, even when it feels overwhelming. Let me ask about those thoughts—when you think "I'm going to fail and my manager will realize I'm not cut out for this," what cognitive distortion do you recognize there?
[14:20] Client: Catastrophizing... and maybe mind reading, assuming my boss thinks I'm incompetent even though she gave me a good review last month.
[16:00] Therapist: Spot on. Catastrophizing and mind reading. Let's do a thought record exercise together right now. What evidence do you actually have for the thought "I am going to fail these deadlines"?
[18:15] Client: Evidence for... well, I am behind on two slide decks. But evidence against... I’ve delivered every single project on time for the past two years, and when I was overwhelmed last quarter, my manager helped me reprioritize.
[21:00] Therapist: That is a crucial piece of evidence against the catastrophic thought. How can we reframe "I am going to fail and get fired" into an objective, balanced thought?
[22:45] Client: Something like... "I have a heavy workload right now and feel stressed, but historically I complete my tasks successfully, and I can ask for support if needed."
[24:30] Therapist: How does your chest feel when you repeat that alternative thought to yourself right now?
[25:10] Client: A bit lighter, actually. Down to maybe a 3 or 4.
[27:00] Therapist: Excellent. Now let's discuss avoidance behaviors. Did the anxiety lead you to avoid any meetings, emails, or social situations this week?
[28:40] Client: Yes, I avoided opening my email inbox on Thursday evening, and I canceled lunch plans with a friend on Friday because I felt too drained and worried I'd be bad company.
[31:00] Therapist: Avoidance provides short-term relief, but it reinforces the anxiety loop in the long run. For our plan moving forward, let's establish a gradual exposure strategy. What is one small step you can take when you feel the urge to avoid emails or social contact?
[33:15] Client: I can commit to opening my inbox for just 5 minutes with a timer running, and if it feels too overwhelming, I can pause and do two minutes of box breathing before continuing.
[35:40] Therapist: That is a structured, actionable plan. Let's summarize our clinical focus for next week: 1) Practice 4-7-8 diaphragmatic breathing upon waking, 2) Complete a 3-column Thought Record for catastrophizing workplace thoughts, and 3) Utilize the 5-minute timed approach to prevent email avoidance. How does that feel to you?
[38:20] Client: That feels manageable and clear. I feel a lot more hopeful than when I walked in today.
[40:00] Therapist: I'm glad to hear that, Sarah. You did great work today. We'll touch base next Thursday at 2:00 PM.`;
      state.transcript = sample;
      state.baseTranscript = sample;
      state.speechTranscriptBuffer = '';
      if (elements.transcriptInput) {
        elements.transcriptInput.value = sample;
      }
      updateSpeechStatus('40-Min Session Loaded', 'idle');
    });
  }

  // 5. Format Selection Cards
  const formatCards = document.querySelectorAll('.selection-card[data-format]');
  formatCards.forEach(card => {
    card.addEventListener('click', () => {
      formatCards.forEach(c => c.classList.remove('active-selection', 'border-primary'));
      card.classList.add('active-selection', 'border-primary');
      state.selectedFormat = card.getAttribute('data-format') || 'DAP';
      console.log('[HushNote] Selected format:', state.selectedFormat);
    });
  });

  // Generate Progress Note button
  if (elements.generateNoteBtn) {
    elements.generateNoteBtn.addEventListener('click', () => {
      showScreen('purpose-screen');
    });
  }

  // 6. Purpose Selection
  const purposeForm = document.getElementById('purpose-form');
  if (purposeForm) {
    purposeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const selectedRadio = purposeForm.querySelector('input[name="purpose"]:checked');
      if (selectedRadio) {
        state.selectedPurpose = selectedRadio.value;
      }
      executeNoteGeneration();
    });
  }

  // 7. Approve & Delete Raw Data Button
  if (elements.approveDeleteBtn) {
    elements.approveDeleteBtn.addEventListener('click', executeApproveAndDelete);
  }

  // 8. New Session Buttons
  document.querySelectorAll('[data-action="new-session"]').forEach(btn => {
    btn.addEventListener('click', resetSessionState);
  });
}

/**
 * Screen Navigation Helper
 */
function showScreen(screenId) {
  state.currentScreen = screenId;
  console.log(`[HushNote Navigation] Switching to: ${screenId}`);

  const allScreenIds = [
    'home-screen', 'landing-screen', 'consent-screen', 'recording-screen',
    'format-screen', 'processing-screen', 'purpose-screen', 'review-screen',
    'success-screen'
  ];

  allScreenIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (id === screenId || (screenId === 'home-screen' && id === 'landing-screen')) {
      el.classList.remove('hidden', 'translate-y-full', 'opacity-0');
      el.classList.add('flex', 'opacity-100');
      el.style.display = '';
    } else if (id === 'consent-screen' && screenId !== 'consent-screen') {
      el.classList.add('translate-y-full', 'opacity-0');
      setTimeout(() => {
        if (state.currentScreen !== 'consent-screen') el.style.display = 'none';
      }, 500);
    } else {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });

  window.scrollTo(0, 0);
}

/**
 * Speech Recognition Status Helper
 */
function updateSpeechStatus(text, type = 'active') {
  if (elements.speechStatusText) {
    elements.speechStatusText.textContent = text;
  }
  if (elements.speechStatusBadge) {
    if (type === 'active') {
      elements.speechStatusBadge.className = 'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-[#E6EBDD] text-[#5A5A40] rounded-full border border-[#E6E2D3] flex items-center gap-1';
    } else if (type === 'warning') {
      elements.speechStatusBadge.className = 'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full border border-amber-200 flex items-center gap-1';
    } else {
      elements.speechStatusBadge.className = 'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-[#F3F0E6] text-[#8A8471] rounded-full border border-[#E6E2D3] flex items-center gap-1';
    }
  }
}

/**
 * Start Web Speech API Recognition
 */
function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[HushNote Speech] Web Speech API not supported in this browser environment.');
    updateSpeechStatus('Speech API unavailable - Type/Paste notes', 'warning');
    return;
  }

  try {
    if (state.speechRecognition) {
      try { state.speechRecognition.stop(); } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('[HushNote Speech] Real-time speech recognition active.');
      updateSpeechStatus('Listening to voice...', 'active');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        state.speechTranscriptBuffer += finalTranscript;
      }

      const currentSpeech = (state.speechTranscriptBuffer + interimTranscript).trim();
      const initialText = state.baseTranscript ? state.baseTranscript.trim() : '';

      const updatedFullText = initialText 
        ? `${initialText}\n${currentSpeech}`
        : currentSpeech;

      if (updatedFullText) {
        state.transcript = updatedFullText;
        if (elements.transcriptInput) {
          elements.transcriptInput.value = updatedFullText;
          elements.transcriptInput.scrollTop = elements.transcriptInput.scrollHeight;
        }
      }
    };

    recognition.onerror = (err) => {
      console.warn('[HushNote Speech] Recognition error:', err.error);
      if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
        updateSpeechStatus('Mic blocked - Type/Paste or load sample', 'warning');
      }
    };

    recognition.onend = () => {
      if (state.isRecording) {
        try { recognition.start(); } catch (e) {}
      } else {
        updateSpeechStatus('Recording stopped', 'idle');
      }
    };

    recognition.start();
    state.speechRecognition = recognition;
  } catch (err) {
    console.warn('[HushNote Speech] Failed starting SpeechRecognition:', err);
    updateSpeechStatus('Type/Paste or load sample', 'idle');
  }
}

/**
 * Audio Recording Flow using getUserMedia and MediaRecorder
 */
async function startAudioRecording() {
  state.audioChunks = [];
  state.isRecording = true;
  state.recordingSeconds = 0;
  state.speechTranscriptBuffer = '';
  
  if (elements.startRecordingBtn) elements.startRecordingBtn.disabled = true;
  if (elements.stopRecordingBtn) elements.stopRecordingBtn.disabled = false;

  startTimer();
  startSpeechRecognition();

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.mediaRecorder = new MediaRecorder(stream);

      state.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          state.audioChunks.push(event.data);
        }
      };

      state.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        state.audioUrl = URL.createObjectURL(audioBlob);
        if (elements.audioPlayback) {
          elements.audioPlayback.src = state.audioUrl;
          elements.audioPlayback.classList.remove('hidden');
        }
        console.log('[HushNote Audio] Temporary audio snippet created in memory.');
      };

      state.mediaRecorder.start();
      console.log('[HushNote Audio] Microphone recording started.');
    } else {
      console.warn('[HushNote Audio] getUserMedia not available; using simulated timer mode.');
      updateSpeechStatus('Timer mode (No mic stream)', 'warning');
    }
  } catch (err) {
    console.warn('[HushNote Audio] Microphone permission denied or unhandled:', err.message);
    updateSpeechStatus('Mic access blocked - Type/Paste or load sample', 'warning');
  }
}

function autoStartRecordingOrTimer() {
  startAudioRecording();
}

function stopAudioRecording() {
  state.isRecording = false;
  stopTimer();

  if (state.speechRecognition) {
    try {
      state.speechRecognition.stop();
    } catch (e) {}
    state.speechRecognition = null;
  }

  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
    // Stop microphone stream tracks to release device
    state.mediaRecorder.stream?.getTracks().forEach(track => track.stop());
  }

  updateSpeechStatus('Recording stopped', 'idle');
  showScreen('format-screen');
}

/**
 * Recording Timer Helper
 */
function startTimer() {
  stopTimer();
  state.recordingSeconds = 0;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.recordingSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimerDisplay() {
  const mins = Math.floor(state.recordingSeconds / 60).toString().padStart(2, '0');
  const secs = (state.recordingSeconds % 60).toString().padStart(2, '0');
  const display = `${mins}:${secs}`;
  if (elements.recordingTimer) {
    elements.recordingTimer.textContent = display;
  }
}

/**
 * Execute Note Generation API Call
 */
async function executeNoteGeneration() {
  showScreen('processing-screen');

  // Read current transcript from textarea or state
  let currentTranscript = state.transcript;
  if (elements.transcriptInput && elements.transcriptInput.value) {
    currentTranscript = elements.transcriptInput.value;
  }

  const payload = {
    transcript: currentTranscript,
    format: state.selectedFormat,
    purpose: state.selectedPurpose
  };

  try {
    console.log('[HushNote Client] Calling POST /api/generate-note with payload:', payload);

    const response = await fetch('/api/generate-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = await response.json();
    console.log('[HushNote Client] Received note generation response:', data);

    state.generatedNoteResponse = data;

    // Small delay to allow the loading animation to feel organic
    setTimeout(() => {
      renderReviewScreen(data);
      showScreen('review-screen');
    }, 1200);

  } catch (error) {
    console.error('[HushNote Client] Note generation error:', error);
    alert(`Note generation failed: ${error.message}. Please verify the backend server is running.`);
    showScreen('purpose-screen');
  }
}

/**
 * Render Review Screen with editable note fields, readiness check, and evidence chips
 */
function renderReviewScreen(data) {
  const { note = {}, evidence = [], missing_fields = [], readiness = {} } = data;

  // 1. Render Note Fields
  if (elements.noteBody) {
    let noteHtml = '';

    if (state.selectedFormat === 'SOAP' || state.selectedFormat === 'BOTH') {
      noteHtml += `
        <div class="note-section border-b border-[#E6E2D3] pb-4 mb-4">
          <label class="block font-bold text-[#5A5A40] mb-1.5 uppercase tracking-wider text-xs">Subjective</label>
          <textarea class="w-full bg-white border border-[#E6E2D3] focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] rounded-xl p-3 text-sm text-[#33322E] leading-relaxed">${(note.subjective || note.data || []).join('\n')}</textarea>
        </div>
        <div class="note-section border-b border-[#E6E2D3] pb-4 mb-4">
          <label class="block font-bold text-[#5A5A40] mb-1.5 uppercase tracking-wider text-xs">Objective</label>
          <textarea class="w-full bg-white border border-[#E6E2D3] focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] rounded-xl p-3 text-sm text-[#33322E] leading-relaxed">${(note.objective || []).join('\n') || 'Client was attentive and responsive during discussion.'}</textarea>
        </div>
        <div class="note-section border-b border-[#E6E2D3] pb-4 mb-4">
          <label class="block font-bold text-[#5A5A40] mb-1.5 uppercase tracking-wider text-xs">Assessment</label>
          <textarea class="w-full bg-white border border-[#E6E2D3] focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] rounded-xl p-3 text-sm text-[#33322E] leading-relaxed">${(note.assessment || []).join('\n')}</textarea>
        </div>
        <div class="note-section pb-2">
          <label class="block font-bold text-[#5A5A40] mb-1.5 uppercase tracking-wider text-xs">Plan</label>
          <textarea class="w-full bg-white border border-[#E6E2D3] focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] rounded-xl p-3 text-sm text-[#33322E] leading-relaxed">${(note.plan || []).join('\n')}</textarea>
        </div>
      `;
    } else {
      // DAP Format
      noteHtml += `
        <div class="note-section border-b border-[#E6E2D3] pb-4 mb-4">
          <label class="block font-bold text-[#5A5A40] mb-1.5 uppercase tracking-wider text-xs">Data</label>
          <textarea class="w-full bg-white border border-[#E6E2D3] focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] rounded-xl p-3 text-sm text-[#33322E] leading-relaxed">${(note.data || note.subjective || []).join('\n')}</textarea>
        </div>
        <div class="note-section border-b border-[#E6E2D3] pb-4 mb-4">
          <label class="block font-bold text-[#5A5A40] mb-1.5 uppercase tracking-wider text-xs">Assessment</label>
          <textarea class="w-full bg-white border border-[#E6E2D3] focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] rounded-xl p-3 text-sm text-[#33322E] leading-relaxed">${(note.assessment || []).join('\n')}</textarea>
        </div>
        <div class="note-section pb-2">
          <label class="block font-bold text-[#5A5A40] mb-1.5 uppercase tracking-wider text-xs">Plan</label>
          <textarea class="w-full bg-white border border-[#E6E2D3] focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] rounded-xl p-3 text-sm text-[#33322E] leading-relaxed">${(note.plan || []).join('\n')}</textarea>
        </div>
      `;
    }

    elements.noteBody.innerHTML = noteHtml;
  }

  // 2. Render Readiness Badge
  if (elements.readinessLabel) {
    elements.readinessLabel.textContent = readiness.label || 'Ready for therapist review';
    elements.readinessLabel.className = readiness.completed 
      ? 'px-3 py-1 bg-[#E6EBDD] text-[#5A5A40] rounded-full text-xs font-bold border border-[#E6E2D3]'
      : 'px-3 py-1 bg-[#F3F0E6] text-[#8A8471] rounded-full text-xs font-bold border border-[#E6E2D3]';
  }

  // 3. Render Timestamp Evidence Chips
  if (elements.evidenceChips) {
    if (evidence.length === 0) {
      elements.evidenceChips.innerHTML = `<span class="text-xs text-[#8A8471] italic">No explicit timestamp quotes referenced.</span>`;
    } else {
      elements.evidenceChips.innerHTML = evidence.map(ev => `
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full text-xs text-[#33322E] font-medium border border-[#E6E2D3]">
          <span class="material-symbols-outlined text-sm text-[#5A5A40]">schedule</span>
          <span class="font-bold text-[#5A5A40]">${ev.timestamp || '00:15'}</span>
          <span class="truncate max-w-[220px]" title="${ev.quote}">"${ev.quote}"</span>
        </div>
      `).join('');
    }
  }

  // 4. Render Missing Fields Checklist & Readiness Report Elements
  if (elements.missingFields) {
    const fields = missing_fields.length > 0 ? missing_fields : (readiness.missing || []);
    let fieldsHtml = '';

    // CPT Code Recommendation
    if (readiness.suggestedCpt) {
      fieldsHtml += `
        <div class="p-3.5 bg-[#E6EBDD] rounded-xl border border-[#E6E2D3] mb-3 text-xs text-[#33322E]">
          <div class="flex items-center justify-between font-bold text-[#5A5A40] mb-1">
            <span class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base">payments</span>
              <span>Suggested CPT Code</span>
            </span>
            <span class="bg-[#5A5A40] text-white px-2 py-0.5 rounded text-[11px] font-mono">CPT ${readiness.suggestedCpt.code}</span>
          </div>
          <div class="font-semibold text-[#5A5A40] text-xs mb-1">${readiness.suggestedCpt.title}</div>
          <p class="text-[11px] text-[#8A8471] leading-tight mb-2">${readiness.suggestedCpt.rationale}</p>
          <div class="text-[10px] text-[#8A8471] italic border-t border-[#E6E2D3] pt-1">
            *Draft recommendation for provider review. Confirm code in EHR prior to claim submission.
          </div>
        </div>
      `;
    }

    // Duration Verification
    if (readiness.sessionDuration) {
      fieldsHtml += `
        <div class="p-3 bg-white rounded-xl border border-[#E6E2D3] mb-3 text-xs text-[#33322E]">
          <div class="flex items-center gap-1.5 font-bold text-[#5A5A40] mb-1">
            <span class="material-symbols-outlined text-base">schedule</span>
            <span>Duration Verification</span>
          </div>
          <p class="text-[11px] text-[#8A8471] leading-tight">${readiness.sessionDuration}</p>
        </div>
      `;
    }

    // Medical Necessity Linkage
    if (readiness.medicalNecessity) {
      fieldsHtml += `
        <div class="p-3 bg-white rounded-xl border border-[#E6E2D3] mb-3 text-xs text-[#33322E]">
          <div class="flex items-center gap-1.5 font-bold text-[#5A5A40] mb-1">
            <span class="material-symbols-outlined text-base">medical_services</span>
            <span>Medical Necessity Linkage</span>
          </div>
          <p class="text-[11px] text-[#8A8471] leading-tight">${readiness.medicalNecessity}</p>
        </div>
      `;
    }

    // Audit Risk Flags Checklist
    if (readiness.auditFlags && readiness.auditFlags.length > 0) {
      fieldsHtml += `
        <div class="p-3 bg-[#FAF8F2] rounded-xl border border-[#E6E2D3] mb-3 text-xs text-[#33322E]">
          <div class="flex items-center gap-1.5 font-bold text-[#5A5A40] mb-2">
            <span class="material-symbols-outlined text-base text-[#8A8471]">shield</span>
            <span>Pre-Claim Audit Risk Checklist</span>
          </div>
          <div class="space-y-1.5">
            ${readiness.auditFlags.map(flag => `
              <div class="flex items-start gap-1.5 text-[11px] text-[#5A5A40]">
                <span class="material-symbols-outlined text-sm text-[#5A5A40] shrink-0">check_box</span>
                <span class="leading-tight">${flag}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Verified Compliance Checks
    if (readiness.checksPassed && readiness.checksPassed.length > 0) {
      fieldsHtml += `
        <div class="mb-3 space-y-1">
          <div class="text-[11px] font-bold text-[#5A5A40] uppercase tracking-wider mb-1">Verified Compliance Checks</div>
          ${readiness.checksPassed.map(chk => `
            <div class="flex items-center gap-2 text-xs text-[#5A5A40] font-medium p-2 bg-[#E6EBDD]/60 rounded-lg border border-[#E6E2D3]">
              <span class="material-symbols-outlined text-sm text-[#5A5A40]">check_circle</span>
              <span>${chk}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Missing Fields
    if (fields.length > 0) {
      fieldsHtml += `
        <div class="space-y-1">
          <div class="text-[11px] font-bold text-[#8A8471] uppercase tracking-wider mb-1">Missing / Required Fields</div>
          ${fields.map(f => `
            <div class="flex items-center gap-2 text-xs text-[#5A5A40] font-medium p-2 bg-[#F3F0E6] rounded-lg border border-[#E6E2D3]">
              <span class="material-symbols-outlined text-sm text-[#8A8471]">warning</span>
              <span>${f}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else if (!readiness.checksPassed || readiness.checksPassed.length === 0) {
      fieldsHtml += `
        <div class="flex items-center gap-2 text-xs text-[#5A5A40] font-medium p-2.5 bg-[#E6EBDD]/60 rounded-xl border border-[#E6E2D3]">
          <span class="material-symbols-outlined text-sm text-[#5A5A40]">check_circle</span>
          <span>All required clinical fields present</span>
        </div>
      `;
    }

    elements.missingFields.innerHTML = fieldsHtml;
  }
}

/**
 * Approve Note & Purge Raw Data
 */
async function executeApproveAndDelete() {
  if (elements.approveDeleteBtn) {
    elements.approveDeleteBtn.disabled = true;
    elements.approveDeleteBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">sync</span> Purging raw data...`;
  }

  try {
    console.log('[HushNote Client] Calling POST /api/delete-raw-session');

    const response = await fetch('/api/delete-raw-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'active' })
    });

    const resData = await response.json();
    console.log('[HushNote Client] Raw session purged response:', resData);

    // Clear raw audio and transcript from client memory
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
      state.audioUrl = null;
    }
    state.audioChunks = [];
    state.transcript = '';
    state.consentGiven = false;

    setTimeout(() => {
      showScreen('success-screen');
    }, 600);

  } catch (error) {
    console.error('[HushNote Client] Error purging raw session:', error);
    alert('Failed to delete raw session data from backend server.');
    if (elements.approveDeleteBtn) {
      elements.approveDeleteBtn.disabled = false;
      elements.approveDeleteBtn.textContent = 'Approve and Delete Raw Data';
    }
  }
}

/**
 * Reset App State for a new session
 */
function resetSessionState() {
  stopTimer();
  state.recordingSeconds = 0;
  state.consentGiven = false;
  state.audioChunks = [];
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = null;
  state.generatedNoteResponse = null;

  if (elements.consentCheckbox) elements.consentCheckbox.checked = false;
  if (elements.confirmConsentBtn) {
    elements.confirmConsentBtn.disabled = true;
    elements.confirmConsentBtn.classList.add('opacity-40');
  }

  updateTimerDisplay();
  showScreen('home-screen');
}

/**
 * Verify Backend API Health
 */
async function checkBackendHealth() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const info = await res.json();
      console.log('[HushNote Client] Backend connected:', info);
    }
  } catch (e) {
    console.warn('[HushNote Client] Backend health check failed:', e.message);
  }
}

// Export state & helpers to global scope for debugging or direct inline onclick handles
window.HushNoteApp = {
  state,
  showScreen,
  startAudioRecording,
  stopAudioRecording,
  executeNoteGeneration,
  executeApproveAndDelete,
  resetSessionState
};
