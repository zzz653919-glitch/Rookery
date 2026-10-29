// Tiny synthesized sound effects (WebAudio). No audio files, works offline.
import { store } from './store.js';

let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, { type = 'sine', gain = 0.08, when = 0, slideTo = null } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  move: () => tone(220, 0.07, { type: 'triangle', gain: 0.10, slideTo: 150 }),
  capture: () => { tone(160, 0.09, { type: 'square', gain: 0.07, slideTo: 90 }); tone(300, 0.05, { type: 'triangle', gain: 0.06 }); },
  check: () => { tone(520, 0.08, { type: 'sawtooth', gain: 0.05 }); tone(390, 0.12, { type: 'sawtooth', gain: 0.05, when: 0.08 }); },
  castle: () => { tone(200, 0.06, { type: 'triangle', gain: 0.09 }); tone(260, 0.07, { type: 'triangle', gain: 0.09, when: 0.07 }); },
  correct: () => { tone(523, 0.1, { gain: 0.07 }); tone(784, 0.16, { gain: 0.07, when: 0.09 }); },
  wrong: () => tone(180, 0.2, { type: 'sawtooth', gain: 0.05, slideTo: 110 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { gain: 0.07, when: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.07, when: i * 0.13 })),
  draw: () => { tone(440, 0.15, { gain: 0.06 }); tone(440, 0.2, { gain: 0.06, when: 0.18 }); },
  start: () => { tone(330, 0.08, { gain: 0.06 }); tone(494, 0.1, { gain: 0.06, when: 0.08 }); },
};

export function play(name) {
  try {
    if (!store.get('settings').sound) return;
    SOUNDS[name]?.();
  } catch { /* sound is optional */ }
}

export function moveSound(mv, game) {
  if (game && game.inCheck()) return play('check');
  if (mv.flags.includes('k') || mv.flags.includes('q')) return play('castle');
  if (mv.flags.includes('c') || mv.flags.includes('e')) return play('capture');
  return play('move');
}
