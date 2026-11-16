// Web Audio API Synthesizer for Clean, Dependency-Free CRM Sound Effects

let audioCtx = null;
let lastBeepTime = 0;
let lastAlertTime = 0;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export const isAudioEnabled = () => {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem('crm_audio_notifications');
  return val === null ? true : val === 'true';
};

export const setAudioEnabled = (enabled) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('crm_audio_notifications', enabled ? 'true' : 'false');
};

/**
 * Normal Incoming Message Beep
 * Gentle, pleasant two-tone blip (WhatsApp/Slack style)
 */
export const playIncomingBeep = () => {
  if (!isAudioEnabled()) return;
  const wallNow = Date.now();
  if (wallNow - lastBeepTime < 500) return; // 500ms throttle
  lastBeepTime = wallNow;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Smooth frequency slide for a soft notification pop
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.08);

    // Envelope: quick attack, smooth exponential decay
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  } catch (err) {
    console.debug('Failed to play incoming beep:', err);
  }
};

/**
 * Urgent "Needs Human" Escalation Alert Sound
 * Attention-grabbing 4-note ascending bell chime + urgent alert tone
 */
export const playNeedsHumanAlert = () => {
  if (!isAudioEnabled()) return;
  const wallNow = Date.now();
  if (wallNow - lastAlertTime < 2000) return; // 2s throttle
  lastAlertTime = wallNow;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Harmonic escalation chime: C5 (523Hz), E5 (659Hz), G5 (784Hz), High C6 (1046Hz)
    const notes = [
      { freq: 523.25, start: 0.0, duration: 0.14, gain: 0.3 },
      { freq: 659.25, start: 0.12, duration: 0.14, gain: 0.32 },
      { freq: 783.99, start: 0.24, duration: 0.18, gain: 0.35 },
      { freq: 1046.50, start: 0.38, duration: 0.45, gain: 0.4 }
    ];

    notes.forEach(({ freq, start, duration, gain: maxGain }) => {
      const noteTime = now + start;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle'; // Rich bell-like harmonic overtone
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(maxGain, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + duration + 0.05);
    });
  } catch (err) {
    console.debug('Failed to play needs human alert:', err);
  }
};
