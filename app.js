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
  initTheme();
  buildWaveform();
  bindEventListeners();
  paintRadioCards('note-format');
  paintRadioCards('purpose');
  applyConsentState();
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
      applyConsentState();
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

  // 5. Format Selection Cards. The radio itself is the source of truth — the
  // card only paints the selected state, so keyboard selection stays in sync.
  document.querySelectorAll('input[name="note-format"]').forEach(input => {
    input.addEventListener('change', () => {
      state.selectedFormat = input.value || 'DAP';
      paintRadioCards('note-format');
      console.log('[HushNote] Selected format:', state.selectedFormat);
    });
  });

  document.querySelectorAll('input[name="purpose"]').forEach(input => {
    input.addEventListener('change', () => {
      state.selectedPurpose = input.value;
      paintRadioCards('purpose');
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
  document.querySelectorAll('[data-action="new-session"], #startNewSessionBtn').forEach(btn => {
    btn.addEventListener('click', resetSessionState);
  });

  // 9. Header lockup returns home. Mid-session it discards, so it confirms.
  const homeLockup = document.getElementById('homeLockup');
  if (homeLockup) {
    homeLockup.addEventListener('click', () => {
      const midSession = state.currentScreen !== 'home-screen';
      if (midSession && !window.confirm('Discard this session and return to the start?')) return;
      resetSessionState();
    });
  }

  // 10. Per-screen back links. `data-confirm` guards the destructive ones.
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const confirmText = btn.getAttribute('data-confirm');
      if (confirmText && !window.confirm(confirmText)) return;
      const target = btn.getAttribute('data-back');
      if (target === 'home-screen') resetSessionState();
      else showScreen(target);
    });
  });

  // 11. Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
    });
  }
}

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

const THEME_STORAGE_KEY = 'hushnote:theme';

/**
 * Two-state light/dark, defaulting to light. The inline boot script in
 * index.html applies the stored value before first paint; this only keeps the
 * toggle's icon and labels in sync afterwards.
 */
function applyTheme(theme) {
  const isDark = theme === 'dark';
  const root = document.documentElement;

  root.classList.toggle('dark', isDark);
  root.style.colorScheme = theme;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    // Private browsing / storage disabled — the in-memory theme still works.
  }

  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  const toggle = document.getElementById('themeToggle');
  const sun = document.getElementById('themeIconSun');
  const moon = document.getElementById('themeIconMoon');
  const srLabel = document.getElementById('themeToggleLabel');

  if (toggle) {
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('title', label);
  }
  if (sun) sun.hidden = isDark;
  if (moon) moon.hidden = !isDark;
  if (srLabel) srLabel.textContent = label;
}

function initTheme() {
  let stored = 'light';
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (e) {
    // Fall through to light.
  }
  applyTheme(stored);
}

/* ------------------------------------------------------------------ *
 * Selection painting
 * ------------------------------------------------------------------ */

const RADIO_CARD_ON = ['border-brand', 'bg-accent-soft', 'ring-2', 'ring-brand/25'];
const RADIO_CARD_OFF = ['border-line', 'bg-card', 'hover:border-line-strong', 'hover:shadow-e2'];
const RADIO_ICON_ON = ['bg-brand', 'text-on-brand'];
const RADIO_ICON_OFF = ['bg-surface', 'text-ink-muted'];

/**
 * Paints every card in a radio group from its input's checked state. The check
 * glyph is hidden rather than absent so the row height never shifts.
 */
function paintRadioCards(groupName) {
  document.querySelectorAll(`input[name="${groupName}"]`).forEach(input => {
    const card = input.closest('.radio-card');
    if (!card) return;

    const on = input.checked;
    card.classList.remove(...(on ? RADIO_CARD_OFF : RADIO_CARD_ON));
    card.classList.add(...(on ? RADIO_CARD_ON : RADIO_CARD_OFF));

    const icon = card.querySelector('.radio-icon');
    if (icon) {
      icon.classList.remove(...(on ? RADIO_ICON_OFF : RADIO_ICON_ON));
      icon.classList.add(...(on ? RADIO_ICON_ON : RADIO_ICON_OFF));
    }

    const check = card.querySelector('.radio-check');
    if (check) check.style.visibility = on ? 'visible' : 'hidden';
  });
}

/** Consent card + custom checkbox mark + the gated primary button. */
function applyConsentState() {
  const on = state.consentGiven;

  const card = document.getElementById('consentCard');
  if (card) {
    card.classList.toggle('border-brand', on);
    card.classList.toggle('bg-accent-soft', on);
    card.classList.toggle('shadow-e1', on);
    card.classList.toggle('border-line-strong', !on);
    card.classList.toggle('bg-surface', !on);
    card.classList.toggle('hover:border-brand', !on);
  }

  const mark = document.getElementById('consentMark');
  if (mark) {
    mark.classList.toggle('border-brand', on);
    mark.classList.toggle('bg-brand', on);
    mark.classList.toggle('text-on-brand', on);
    mark.classList.toggle('border-line-strong', !on);
    mark.classList.toggle('bg-card', !on);
    mark.classList.toggle('text-transparent', !on);
  }

  if (elements.confirmConsentBtn) elements.confirmConsentBtn.disabled = !on;
}

/* ------------------------------------------------------------------ *
 * Waveform
 * ------------------------------------------------------------------ */

const WAVEFORM_BARS = 28;

/** Edge bars sit back so the group reads as a single shape. */
function barOpacity(index) {
  const distance = Math.abs(index - (WAVEFORM_BARS - 1) / 2) / ((WAVEFORM_BARS - 1) / 2);
  return 0.35 + (1 - distance) * 0.65;
}

/**
 * Synthetic amplitude bars. Each bar gets its own duration and delay so the
 * group doesn't read as one loop.
 */
function buildWaveform() {
  const container = document.getElementById('waveform');
  if (!container || container.childElementCount) return;

  for (let i = 0; i < WAVEFORM_BARS; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'waveform-bar w-[3px] rounded-full bg-brand';
    bar.style.height = '100%';
    bar.style.opacity = String(barOpacity(i));
    bar.style.setProperty('--bar-duration', `${900 + (i % 5) * 120}ms`);
    bar.style.setProperty('--bar-delay', `${i * 43}ms`);
    container.appendChild(bar);
  }
}

/* ------------------------------------------------------------------ *
 * Processing steps
 * ------------------------------------------------------------------ */

const PROCESSING_STEPS = [
  'Reading the transcript',
  'Drafting each section',
  'Checking every claim against what was said',
];

let processingStepTimer = null;

function renderProcessingSteps(activeIndex) {
  const list = document.getElementById('processingSteps');
  if (!list) return;

  list.innerHTML = PROCESSING_STEPS.map((label, index) => {
    const reached = index <= activeIndex;
    const leading = index < activeIndex
      ? '<svg class="icon size-[15px] shrink-0 text-accent" viewBox="0 0 24 24" aria-hidden="true" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>'
      : `<span aria-hidden="true" class="size-2 shrink-0 rounded-full ${index === activeIndex ? 'animate-pulse bg-brand' : 'bg-line-strong'}"></span>`;

    return `
      <li class="flex items-center gap-3 rounded-panel border border-line px-4 py-3 text-body-sm transition-colors duration-500 ${
        reached ? 'bg-accent-soft text-accent-ink' : 'bg-surface text-ink-subtle'
      }">
        ${leading}
        <span>${label}</span>
      </li>`;
  }).join('');
}

function startProcessingSteps() {
  let step = 0;
  renderProcessingSteps(step);
  stopProcessingSteps();
  processingStepTimer = window.setInterval(() => {
    step = Math.min(step + 1, PROCESSING_STEPS.length - 1);
    renderProcessingSteps(step);
  }, 1800);
}

function stopProcessingSteps() {
  if (processingStepTimer) {
    window.clearInterval(processingStepTimer);
    processingStepTimer = null;
  }
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

  /*
   * Visibility is the `hidden` attribute alone. Each screen declares its own
   * layout in markup (the overlays are flex-centred, the pages are flex-col),
   * so the navigator must not impose a display mode of its own — doing that is
   * what previously laid the review header out as a row.
   */
  allScreenIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !(id === screenId || (screenId === 'home-screen' && id === 'landing-screen'));
  });

  // The processing overlay animates its checklist only while it is on screen.
  if (screenId === 'processing-screen') startProcessingSteps();
  else stopProcessingSteps();

  // Move focus to the new screen so keyboard and screen-reader users land at
  // its top rather than wherever the previous screen left them.
  const target = document.getElementById(screenId);
  if (target) {
    const focusTarget = target.matches('[tabindex]') ? target : target.querySelector('[tabindex="-1"]');
    (focusTarget || target).focus?.({ preventScroll: true });
  }

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
    const TONE = {
      active: { badge: 'bg-ok-soft text-ok', dot: 'bg-ok', pulse: true },
      warning: { badge: 'bg-warn-soft text-warn', dot: 'bg-warn', pulse: false },
      idle: { badge: 'bg-surface text-ink-muted', dot: 'bg-ink-subtle', pulse: false },
    };
    const tone = TONE[type] || TONE.idle;

    elements.speechStatusBadge.className =
      `inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-overline uppercase ${tone.badge}`;

    // Rebuild the dot alongside the label so the tone stays consistent.
    elements.speechStatusBadge.innerHTML =
      `<span aria-hidden="true" class="size-1.5 shrink-0 rounded-full ${tone.dot}${tone.pulse ? ' animate-pulse' : ''}"></span>` +
      `<span id="speechStatusText"></span>`;
    elements.speechStatusText = document.getElementById('speechStatusText');
    if (elements.speechStatusText) elements.speechStatusText.textContent = text;
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
          elements.audioPlayback.hidden = false;
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

/* Inline SVG glyphs reused across the generated review markup. */
const ICON = {
  clock: '<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>',
  banknote: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  stethoscope: '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  squareCheck: '<path d="M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344"/><path d="m9 11 3 3L22 4"/>',
  circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  triangleAlert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
};

/** `size` is a Tailwind size-* step; `tone` a text-* colour utility. */
function icon(name, size = 4, tone = '') {
  return `<svg class="icon size-${size} ${tone}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One labelled, editable section of the note. */
function noteField(label, lines) {
  return `
    <div class="space-y-1.5">
      <label class="block text-overline uppercase text-accent">${label}</label>
      <textarea rows="4"
        class="custom-scrollbar w-full resize-y rounded-field border border-line bg-surface p-3.5 text-body-sm leading-relaxed text-ink transition-colors duration-200 focus:border-line-strong focus:outline-none">${escapeHtml(lines.join('\n'))}</textarea>
    </div>`;
}

/**
 * Collapsed-by-default detail. Native <details> so it works without JS and is
 * announced correctly; the chevron is the only affordance it needs.
 */
function disclosure(summary, body) {
  return `
    <details class="group">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 rounded-control text-body-sm font-medium text-ink-muted transition-colors duration-200 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span>${summary}</span>
        ${icon('chevronDown', 4, 'transition-transform duration-200 group-open:rotate-180')}
      </summary>
      ${body}
    </details>`;
}

/**
 * Render Review Screen with editable note fields, readiness check, and evidence chips
 */
function renderReviewScreen(data) {
  const { note = {}, evidence = [], missing_fields = [], readiness = {} } = data;

  // 1. Note fields — SOAP carries an extra Objective section.
  if (elements.noteBody) {
    const soap = state.selectedFormat === 'SOAP' || state.selectedFormat === 'BOTH';

    elements.noteBody.innerHTML = soap
      ? [
          noteField('Subjective', note.subjective || note.data || []),
          noteField('Objective', note.objective && note.objective.length
            ? note.objective
            : ['Client was attentive and responsive during discussion.']),
          noteField('Assessment', note.assessment || []),
          noteField('Plan', note.plan || []),
        ].join('')
      : [
          noteField('Data', note.data || note.subjective || []),
          noteField('Assessment', note.assessment || []),
          noteField('Plan', note.plan || []),
        ].join('');
  }

  // 2. Readiness badge
  if (elements.readinessLabel) {
    elements.readinessLabel.textContent = readiness.label || 'Ready for therapist review';
    elements.readinessLabel.className = readiness.completed
      ? 'inline-flex items-center rounded-full border border-line bg-accent-soft px-3 py-1 text-overline uppercase text-accent-ink'
      : 'inline-flex items-center rounded-full border border-line bg-warn-soft px-3 py-1 text-overline uppercase text-warn';
  }

  // 3. Timestamped evidence chips
  if (elements.evidenceChips) {
    elements.evidenceChips.innerHTML = evidence.length === 0
      ? '<p class="font-display text-body-sm italic text-ink-subtle">No explicit timestamp quotes referenced.</p>'
      : evidence.map(ev => `
          <span class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-body-sm text-ink">
            ${icon('clock', 4, 'text-accent')}
            <span class="font-semibold tabular-nums text-accent">${escapeHtml(ev.timestamp || '00:15')}</span>
            <span class="truncate" title="${escapeHtml(ev.quote)}">&ldquo;${escapeHtml(ev.quote)}&rdquo;</span>
          </span>`).join('');
  }

  /*
   * 4. Readiness detail.
   *
   * One flat column rather than a stack of bordered boxes. What the clinician
   * has to act on is the only thing open by default; the audit trail is real
   * and stays available, but it sits behind a disclosure so the panel reads as
   * a verdict instead of a report.
   */
  if (elements.missingFields) {
    const fields = missing_fields.length > 0 ? missing_fields : (readiness.missing || []);
    const checks = readiness.checksPassed || [];
    const flags = readiness.auditFlags || [];
    const blocks = [];

    // a) Outstanding items — the actionable half, always visible.
    blocks.push(fields.length > 0
      ? `
        <div class="space-y-2">
          <p class="text-overline uppercase text-warn">Needs attention</p>
          <ul class="space-y-2">
            ${fields.map(field => `
              <li class="flex items-start gap-2.5 text-body-sm leading-snug text-ink">
                <span aria-hidden="true" class="mt-[0.4rem] size-1.5 shrink-0 rounded-full bg-warn"></span>
                <span>${escapeHtml(field)}</span>
              </li>`).join('')}
          </ul>
        </div>`
      : `
        <p class="flex items-center gap-2 text-body-sm text-ok">
          ${icon('circleCheck', 4)}
          <span>Nothing outstanding</span>
        </p>`);

    // b) The facts, as label/value rows. No nested cards, no icons per row.
    const facts = [];
    if (readiness.suggestedCpt) {
      facts.push(`
        <div class="space-y-1">
          <dt class="text-overline uppercase text-ink-muted">Suggested code</dt>
          <dd class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-sm text-ink">
            <span class="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-accent-ink">${escapeHtml(readiness.suggestedCpt.code)}</span>
            <span>${escapeHtml(readiness.suggestedCpt.title)}</span>
          </dd>
        </div>`);
    }
    if (readiness.sessionDuration) {
      facts.push(`
        <div class="space-y-1">
          <dt class="text-overline uppercase text-ink-muted">Duration</dt>
          <dd class="text-body-sm leading-snug text-ink">${escapeHtml(readiness.sessionDuration)}</dd>
        </div>`);
    }
    if (readiness.medicalNecessity) {
      facts.push(`
        <div class="space-y-1">
          <dt class="text-overline uppercase text-ink-muted">Medical necessity</dt>
          <dd class="text-body-sm leading-snug text-ink">${escapeHtml(readiness.medicalNecessity)}</dd>
        </div>`);
    }
    if (facts.length) blocks.push(`<dl class="space-y-4">${facts.join('')}</dl>`);

    // c) Everything verified or advisory, collapsed.
    if (checks.length) {
      blocks.push(disclosure(`${checks.length} check${checks.length === 1 ? '' : 's'} passed`, `
        <ul class="mt-2 space-y-1.5">
          ${checks.map(check => `
            <li class="flex items-start gap-2 text-body-sm leading-snug text-ink-muted">
              ${icon('circleCheck', 4, 'mt-0.5 shrink-0 text-ok')}
              <span>${escapeHtml(check)}</span>
            </li>`).join('')}
        </ul>`));
    }

    if (flags.length) {
      blocks.push(disclosure(`${flags.length} pre-claim audit item${flags.length === 1 ? '' : 's'}`, `
        <ul class="mt-2 space-y-1.5">
          ${flags.map(flag => `
            <li class="flex items-start gap-2 text-body-sm leading-snug text-ink-muted">
              ${icon('squareCheck', 4, 'mt-0.5 shrink-0 text-accent')}
              <span>${escapeHtml(flag)}</span>
            </li>`).join('')}
        </ul>`));
    }

    // d) The one claim that has to travel with a suggested code.
    if (readiness.suggestedCpt) {
      blocks.push(`
        <p class="font-display text-2xs italic leading-snug text-ink-subtle">
          Draft recommendation for provider review. Confirm the code in your EHR before submitting a claim.
        </p>`);
    }

    // Hairline rules between blocks carry the separation the boxes used to.
    elements.missingFields.innerHTML = blocks
      .map((block, index) => index === 0 ? block : `<div class="border-t border-line pt-5">${block}</div>`)
      .join('');
  }
}

/**
 * Approve Note & Purge Raw Data
 */
async function executeApproveAndDelete() {
  if (elements.approveDeleteBtn) {
    elements.approveDeleteBtn.disabled = true;
    elements.approveDeleteBtn.innerHTML =
      '<svg class="icon size-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Purging raw data…</span>';
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
      elements.approveDeleteBtn.innerHTML = '<svg class="icon size-[18px]" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg><span>Approve &amp; Wipe Raw Data</span>';
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
  applyConsentState();

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
