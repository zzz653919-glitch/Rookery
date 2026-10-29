// Builds small, clean tactical positions (few pieces) at random and keeps the ones where
// search proves a unique solution. Good for teachable forks, pins, skewers, discovered attacks, short mates.
//
//   node scripts/gen-motifs.mjs --worker 0 --minutes 10 --family fork
//
import { mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Chess } from '../js/chess/rules.js';
import { Engine } from '../js/chess/engine.js';
import { buildPuzzle, mulberry } from './lib/puzzle-builder.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const id = +opt('worker', 0);
const minutes = +opt('minutes', 5);
const family = opt('family', 'fork');
const rng = mulberry(+opt('seed', 7) * 1000 + id * 131 + family.length);
const outDir = join(fileURLToPath(new URL('.', import.meta.url)), 'out');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `puzzles-m-${family}-${id}.jsonl`);

const FAMILIES = {
  // [white pieces, black pieces]  (uppercase = white). Kings are always added.
  fork: [['N', 'P'], ['q', 'r', 'r', 'b', 'n', 'p']],
  fork2: [['N', 'B', 'P'], ['q', 'r', 'p', 'p']],
  pin: [['B', 'R', 'P', 'N'], ['n', 'b', 'r', 'q', 'p']],
  skewer: [['R', 'B', 'Q'], ['q', 'r', 'n', 'p']],
  discovered: [['R', 'B', 'N', 'P'], ['q', 'r', 'b', 'n', 'p']],
  mate1: [['Q', 'R', 'R', 'B', 'N'], ['p', 'p', 'p', 'r']],
  mate2: [['Q', 'R', 'R', 'B'], ['p', 'p', 'p', 'n']],
  hang: [['Q', 'R', 'B', 'N', 'P'], ['q', 'r', 'b', 'n', 'p', 'p']],
  promo: [['P', 'P', 'R'], ['p', 'r', 'b']],
};

function pick(arr, n) {
  const a = arr.slice();
  const out = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(rng() * a.length), 1)[0]);
  return out;
}

function randomFen(fam) {
  const [wp, bp] = FAMILIES[fam];
  const nW = 1 + Math.floor(rng() * Math.min(3, wp.length));
  const nB = 1 + Math.floor(rng() * Math.min(4, bp.length));
  const pieces = ['K', 'k', ...pick(wp, nW), ...pick(bp, nB)];
  const board = new Array(64).fill(null);
  for (const p of pieces) {
    for (let tries = 0; tries < 50; tries++) {
      const sq = Math.floor(rng() * 64);
      if (board[sq]) continue;
      const rank = sq >> 3;
      if ((p === 'P' || p === 'p') && (rank === 0 || rank === 7)) continue;
      board[sq] = p;
      break;
    }
  }
  let fen = '';
  for (let r = 7; r >= 0; r--) {
    let e = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) { e++; continue; }
      if (e) { fen += e; e = 0; }
      fen += p;
    }
    if (e) fen += e;
    if (r) fen += '/';
  }
  return fen + ' w - - 0 1';
}

const eng = new Engine(16);
const deadline = Date.now() + minutes * 60000;
const seen = new Set();
let tried = 0, found = 0;
while (Date.now() < deadline) {
  tried++;
  const fen = randomFen(family);
  let g;
  try { g = new Chess(fen); } catch { continue; }
  const key = fen.split(' ')[0];
  if (seen.has(key)) continue;
  seen.add(key);
  if (g.isGameOver() || g.inCheck()) continue;
  // quick reject: need a sizeable win at depth 5
  eng.clear();
  const quick = eng.search(fen, null, { depth: 4, timeMs: 1500 });
  if (quick.score < 250) continue;
  const p = buildPuzzle(eng, { fen }, 6);
  if (!p) continue;
  p.family = family;
  found++;
  appendFileSync(file, JSON.stringify(p) + '\n');
  if (found % 5 === 0) console.log(`[${family}#${id}] ${found} puzzles from ${tried} positions (last: ${p.themes.join('+')} d${p.depthNeeded})`);
}
console.log(`[${family}#${id}] finished: ${found} puzzles from ${tried} positions`);
