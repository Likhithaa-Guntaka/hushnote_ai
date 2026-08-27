/**
 * Approving a note and purging the raw session.
 *
 * Regression cover for the defect where approval kept whatever the model wrote
 * rather than the clinician's corrections, and for the privacy promise that the
 * transcript and audio are gone once the note is approved.
 *
 * The API is stubbed rather than reached over the network, so the suite runs
 * without a server or a model. What it asserts is client behaviour: which text
 * survives approval, and what is cleared afterwards. The server's own purge is
 * covered by server-side behaviour, not here.
 */
const { boot, fire, wait, createChecker } = require('./harness.cjs');

const DRAFTED_DATA = 'Client described a difficult week at work.';

function stubApi(window) {
  const calls = [];
  window.fetch = (url, options) => {
    calls.push({ url: String(url), body: options && options.body });

    if (String(url).includes('/api/generate-note')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          source: 'ollama_gemma',
          fallback: false,
          format: 'DAP',
          note: {
            data: [DRAFTED_DATA],
            subjective: ['Client reports increased stress before meetings.'],
            objective: ['Client was engaged and coherent throughout.'],
            assessment: ['Work-related stress, responsive to reframing.'],
            plan: ['Continue weekly sessions; practice grounding.'],
          },
          evidence: [{ quote: 'It has been a difficult week.', timestamp: '01:30', section: 'subjective' }],
          missing_fields: [],
          readiness: { completed: true, label: 'Ready', checksPassed: [], missing: [] },
        }),
      });
    }

    if (String(url).includes('/api/delete-raw-session')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };
  return calls;
}

module.exports = async function run() {
  const { check, results } = createChecker('approval');

  let calls;
  const { window, App, $ } = boot({ beforeLoad: (w) => { calls = stubApi(w); } });

  App.state.transcript = '[00:00] Therapist: Hello.\n[45:00] Client: That helped, thank you.';
  App.state.recordingSeconds = 2700;
  App.state.selectedFormat = 'DAP';
  App.state.selectedPurpose = 'billing_insurance';

  console.log('\n  -- generating a note reaches the API with the session duration');
  await App.executeNoteGeneration();
  await wait(1600); // the review render sits behind a deliberate delay

  const generateCall = calls.find((c) => c.url.includes('/api/generate-note'));
  const sent = JSON.parse(generateCall.body);
  check('durationSeconds sent as a number', typeof sent.durationSeconds, 'number');
  check('durationSeconds carries the recorded value', sent.durationSeconds, 2700);
  check('drafted text rendered into the field', $('note-data').value, DRAFTED_DATA);

  console.log('\n  -- the clinician corrects a section');
  const CORRECTION = 'Client denied chest pain. Reports sleep improving.';
  $('note-data').value = CORRECTION;
  fire(window, $('note-data'), 'input');
  check('correction differs from the draft', $('note-data').value !== DRAFTED_DATA, true);

  console.log('\n  -- approving keeps the correction, not the draft');
  await App.executeApproveAndDelete();
  await wait(900);

  check('approved note captured', !!App.state.approvedNote, true);
  check('approved note uses the correction', App.state.approvedNote.data, [CORRECTION]);
  check('approved note does not keep the draft', App.state.approvedNote.data.includes(DRAFTED_DATA), false);
  check('untouched section keeps its drafted text', App.state.approvedNote.plan, ['Continue weekly sessions; practice grounding.']);

  console.log('\n  -- the raw session is purged from the client');
  check('purge endpoint called', calls.some((c) => c.url.includes('/api/delete-raw-session')), true);
  check('transcript cleared', App.state.transcript, '');
  check('audio chunks cleared', App.state.audioChunks, []);
  check('consent cleared for the next session', App.state.consentGiven, false);

  window.close();
  return results;
};
