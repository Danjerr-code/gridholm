const MUTE_KEY = 'gridholm_muted';

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setMuted(value) {
  try {
    localStorage.setItem(MUTE_KEY, value ? 'true' : 'false');
  } catch {
    // localStorage not available
  }
}

// Programmatic chime using the Web Audio API — no external file needed.
export function playTurnStartSound() {
  if (isMuted()) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    function note(freq, startTime, duration, volume = 0.25) {
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.connect(gain);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    const t = ctx.currentTime;
    // Two-note ascending chime: C5 then E5
    note(523.25, t, 0.6);
    note(659.25, t + 0.12, 0.7);

    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Web Audio API not available — silent fail
  }
}
