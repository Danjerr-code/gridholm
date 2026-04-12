const MUTE_KEY = 'gridholm_muted';

// Play an MP3 file from /public at a normalized gain of 0.7.
function playSfx(path) {
  if (isMuted()) return;
  try {
    const audio = new Audio(path);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch {
    // Audio API not available — silent fail
  }
}

export function playSfxAttack() {
  if (isMuted()) return;
  try {
    const audio = new Audio('/sfx-attack.mp3');
    audio.volume = 0.4;
    audio.addEventListener('timeupdate', () => {
      if (audio.duration && audio.currentTime >= audio.duration * 0.9) {
        audio.pause();
      }
    });
    audio.play().catch(() => {});
  } catch {
    // Audio API not available — silent fail
  }
}
export function playSfxMove() { playSfx('/sfx-move.mp3'); }
export function playSfxDraw() { playSfx('/sfx-draw.mp3'); }
export function playSfxSpell() { playSfx('/sfx-spell.mp3'); }
export function playSfxNoMana() { playSfx('/sfx-nomana-.mp3'); }
export function playSfxWin() { playSfx('/sfx-win.mp3'); }
export function playSfxUheal() { playSfx('/sfx-uheal.mp3'); }
export function playSfxCheal() { playSfx('/sfx-cheal.mp3'); }
export function playSfxAttackBlock() { playSfx('/sfx-attackblock.mp3'); }

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

// Shared AudioContext singleton — avoids repeated suspend/resume issues.
let _audioCtx = null;

function getAudioContext() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

async function resumeAudioContext(ctx) {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

// Resume audio when the page becomes visible again (e.g. after tab switch).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {
        // Resume failed silently
      });
    }
  });
}

// Card play: soft descending whoosh, ~400ms.
export function playCardPlaySound() {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    resumeAudioContext(ctx).then(() => {
      try {
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.35);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.4);
      } catch {
        // Audio scheduling failed — silent fail
      }
    }).catch(() => {
      // AudioContext resume failed — silent fail
    });
  } catch {
    // Web Audio API not available — silent fail
  }
}

// Unit death: dull low thud with quick fade, ~300ms.
export function playUnitDeathSound() {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    resumeAudioContext(ctx).then(() => {
      try {
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.28, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.25);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.3);
      } catch {
        // Audio scheduling failed — silent fail
      }
    }).catch(() => {
      // AudioContext resume failed — silent fail
    });
  } catch {
    // Web Audio API not available — silent fail
  }
}

// Combat hit: sharp percussive strike, ~200ms.
export function playCombatHitSound() {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    resumeAudioContext(ctx).then(() => {
      try {
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.18);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.2);
      } catch {
        // Audio scheduling failed — silent fail
      }
    }).catch(() => {
      // AudioContext resume failed — silent fail
    });
  } catch {
    // Web Audio API not available — silent fail
  }
}

// Spell cast: brief magical shimmer, ~500ms.
export function playSpellCastSound() {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    resumeAudioContext(ctx).then(() => {
      try {
        const t = ctx.currentTime;

        function shimmer(freq, startTime, duration, volume) {
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

        shimmer(880, t, 0.45, 0.12);
        shimmer(1320, t + 0.04, 0.4, 0.09);
        shimmer(660, t + 0.1, 0.4, 0.07);
      } catch {
        // Audio scheduling failed — silent fail
      }
    }).catch(() => {
      // AudioContext resume failed — silent fail
    });
  } catch {
    // Web Audio API not available — silent fail
  }
}

// Champion damage: heavier resonant impact, ~400ms.
export function playChampionDamageSound() {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    resumeAudioContext(ctx).then(() => {
      try {
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.32, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(95, t);
        osc.frequency.exponentialRampToValueAtTime(48, t + 0.35);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.4);
      } catch {
        // Audio scheduling failed — silent fail
      }
    }).catch(() => {
      // AudioContext resume failed — silent fail
    });
  } catch {
    // Web Audio API not available — silent fail
  }
}

// Programmatic chime using the Web Audio API — no external file needed.
export function playTurnStartSound() {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    resumeAudioContext(ctx).then(() => {
      try {
        const t = ctx.currentTime;

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

        // Two-note ascending chime: C5 then E5
        note(523.25, t, 0.6);
        note(659.25, t + 0.12, 0.7);
      } catch {
        // Audio scheduling failed — silent fail
      }
    }).catch(() => {
      // AudioContext resume failed — silent fail
    });
  } catch {
    // Web Audio API not available — silent fail
  }
}

// Unit summon: warm sine sweep 220→440hz over 0.3s with soft attack and gentle decay, ~0.5s total.
export function playUnitSummonSound() {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    resumeAudioContext(ctx).then(() => {
      try {
        const t = ctx.currentTime;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(440, t + 0.3);

        // Delay feedback for a light reverb feel
        const delay = ctx.createDelay(0.1);
        delay.delayTime.value = 0.06;
        const delayGain = ctx.createGain();
        delayGain.gain.value = 0.15;
        delay.connect(delayGain);
        delayGain.connect(delay);

        osc.connect(gain);
        gain.connect(delay);
        gain.connect(ctx.destination);
        delayGain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.5);
      } catch {
        // Audio scheduling failed — silent fail
      }
    }).catch(() => {
      // AudioContext resume failed — silent fail
    });
  } catch {
    // Web Audio API not available — silent fail
  }
}
