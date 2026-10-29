// Strength sanity check: each difficulty level plays the level below it.
// Usage: node scripts/selfplay.mjs [gamesPerPair] [msPerMove]
import { Chess } from '../js/chess/rules.js';
import { Engine, LEVELS } from '../js/chess/engine.js';

const GAMES = +process.argv[2] || 6;
const MS = +process.argv[3] || 250;

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(g) {
  let s = 0;
  for (const row of g.board()) for (const c of row) if (c) s += (c.color === 'w' ? 1 : -1) * VAL[c.type];
  return s;
}

function game(whiteLevel, blackLevel, seed) {
  const g = new Chess();
  const rng = mulberry(seed);
  const eW = new Engine(16), eB = new Engine(16);
  for (let i = 0; i < 4; i++) { // random opening for variety
    const ms = g.moves({ verbose: true });
    const m = ms[Math.floor(rng() * ms.length)];
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
  }
  for (let ply = 0; ply < 160 && !g.isGameOver(); ply++) {
    const white = g.turn() === 'w';
    const eng = white ? eW : eB;
    const level = white ? whiteLevel : blackLevel;
    const r = eng.search(g.fen(), g.keys, { level, timeMs: MS, rng });
    if (!r.move || !g.move(r.move)) throw new Error('bad engine move');
  }
  const st = g.status();
  if (st.over) return st.result === '1-0' ? 1 : st.result === '0-1' ? -1 : 0;
  const m = material(g); // adjudicate by material
  return m >= 3 ? 1 : m <= -3 ? -1 : 0;
}

for (let hi = 2; hi <= 6; hi++) {
  const lo = hi - 1;
  let hiPts = 0, loPts = 0, draws = 0;
  for (let i = 0; i < GAMES; i++) {
    const hiWhite = i % 2 === 0;
    const res = hiWhite ? game(hi, lo, 1000 + i) : game(lo, hi, 2000 + i);
    const hiResult = hiWhite ? res : -res;
    if (hiResult > 0) hiPts++; else if (hiResult < 0) loPts++; else draws++;
  }
  console.log(`Level ${hi} vs Level ${lo}: ${hiPts}W-${draws}D-${loPts}L  (${GAMES} games, ${MS}ms/move cap)`);
}
