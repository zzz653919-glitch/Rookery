// Generates ORIGINAL puzzles from self-play games of the built-in engine.
// Every puzzle is verified by search: the solution is the unique winning continuation
// (or the unique forced mate), and a shallow search does not find it (so it is a real tactic).
//
//   node scripts/gen-puzzles.mjs --minutes 12 --workers 2     -> scripts/out/puzzles-raw.json
//
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Chess } from '../js/chess/rules.js';
import { Engine } from '../js/chess/engine.js';
import { classify, matDiff } from './lib/motifs.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = join(here, 'out');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const MATE = 30000;

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ worker
async function worker() {
  const id = +opt('worker', 0);
  const minutes = +opt('minutes', 10);
  const seedBase = +opt('seed', 1) * 100000 + id * 7919;
  const eng = new Engine(18);
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `puzzles-${id}.jsonl`);
  const deadline = Date.now() + minutes * 60000;
  const seen = new Set();
  let games = 0, cands = 0, found = 0;
  const D = 6;

  while (Date.now() < deadline) {
    const seed = seedBase + games++;
    const rng = mulberry(seed);
    const g = new Chess();
    const lw = 1 + Math.floor(rng() * 3), lb = 1 + Math.floor(rng() * 3);
    const positions = [];
    for (let ply = 0; ply < 90 && !g.isGameOver(); ply++) {
      if (ply >= 8 && !g.inCheck()) positions.push({ fen: g.fen(), keys: g.keys.slice(), ply });
      const lvl = g.turn() === 'w' ? lw : lb;
      const r = eng.search(g.fen(), g.keys, { level: lvl, timeMs: 150, rng });
      if (!r.move) break;
      g.move(r.move);
    }
    for (const pos of positions) {
      if (Date.now() > deadline) break;
      const key = pos.fen.split(' ').slice(0, 2).join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      const me = pos.fen.split(' ')[1];
      // cheap pre-filter: a tactic is "hidden" if depth 2 does not see it but depth 5 does
      eng.clear();
      const quick = eng.search(pos.fen, pos.keys, { depth: 2, timeMs: 2000 });
      if (quick.score >= 120) continue;
      const deep = eng.search(pos.fen, pos.keys, { depth: 5, timeMs: 4000 });
      if (deep.score < 250 || deep.score - quick.score < 200) continue;
      cands++;
      const puzzle = buildPuzzle(eng, pos, me, D);
      if (puzzle) {
        found++;
        appendFileSync(file, JSON.stringify(puzzle) + '\n');
        console.log(`[w${id}] puzzle ${found}  (${games} games, ${cands} candidates)  ${puzzle.themes.join('+')}  d${puzzle.depthNeeded}`);
      }
    }
  }
  console.log(`[w${id}] done: ${found} puzzles from ${games} games`);
}

function buildPuzzle(eng, pos, me, D) {
  const g = new Chess(pos.fen);
  g.keys = pos.keys.slice();
  const start = matDiff(g, me);
  const solution = [];
  let playerMoves = 0;
  let mated = false;
  for (let k = 0; k < 3; k++) {
    eng.clear();
    const sc = eng.rootScores(g.fen(), g.keys, D, 20000);
    if (sc.length < 2) return null; // forced single move: not a puzzle
    const best = sc[0], second = sc[1];
    const isMate = best.score > MATE - 100;
    if (k === 0) {
      if (best.score < 300) return null;
      if (!isMate && best.score - second.score < 180) return null;
      if (isMate && second.score > MATE - 100) return null; // two mating moves
    } else {
      if (best.score < 200) return null;
      if (!isMate && best.score - second.score < 100) return null;
      if (isMate && second.score > MATE - 100 && best.score === second.score) return null;
    }
    const mv = g.move(best.uci.length === 5 ? { from: best.uci.slice(0, 2), to: best.uci.slice(2, 4), promotion: best.uci[4] } : { from: best.uci.slice(0, 2), to: best.uci.slice(2, 4) });
    if (!mv) return null;
    solution.push(best.uci);
    playerMoves++;
    if (g.isCheckmate()) { mated = true; break; }
    const gain = matDiff(g, me) - start;
    // finished? we are clearly up material and the opponent cannot immediately take it back
    if (gain >= 2 && k >= 0) {
      const reply = eng.search(g.fen(), g.keys, { depth: D, timeMs: 3000 });
      if (!reply.move) return null;
      const g2 = new Chess(g.fen()); g2.keys = g.keys.slice();
      g2.move(reply.move);
      if (matDiff(g2, me) - start >= 2) break;
    }
    if (g.isGameOver()) return null;
    // opponent's best defence
    const reply = eng.search(g.fen(), g.keys, { depth: D, timeMs: 3000 });
    if (!reply.move) return null;
    const rmv = g.move(reply.move);
    if (!rmv) return null;
    solution.push(rmv.from + rmv.to + (rmv.promotion || ''));
    if (k === 2) {
      // third solver move not played yet: stop after two solver moves if material is won
      const gain2 = matDiff(g, me) - start;
      if (gain2 >= 2) { solution.pop(); break; }
      return null;
    }
    if (g.isGameOver()) return null;
  }
  if (!mated) {
    const finalGain = matDiff(new Chess(finalFen(pos.fen, solution)), me) - start;
    if (finalGain < 2) return null;
    if (solution.length % 2 === 0) return null; // must end on a solver move
  }
  if (solution.length > 5) return null;
  let cls;
  try { cls = classify(pos.fen, solution); } catch { return null; }
  // difficulty = shallowest depth at which the engine finds the first solution move
  let depthNeeded = D;
  for (let d = 1; d <= D; d++) {
    eng.clear();
    const s = eng.rootScores(pos.fen, pos.keys, d, 10000);
    if (s[0].uci === solution[0] && (s.length < 2 || s[0].score - s[1].score >= 100)) { depthNeeded = d; break; }
  }
  return {
    fen: pos.fen, turn: me, moves: solution, themes: cls.themes, mate: cls.mate,
    solverMoves: cls.playerMoves, depthNeeded, ply: pos.ply,
  };
}

function finalFen(fen, solution) {
  const g = new Chess(fen);
  for (const u of solution) g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return g.fen();
}

// ------------------------------------------------------------------ main
if (opt('worker', null) !== null) {
  await worker();
} else {
  const workers = +opt('workers', 2);
  const minutes = opt('minutes', '10');
  const seed = opt('seed', '1');
  mkdirSync(outDir, { recursive: true });
  const kids = [];
  for (let i = 0; i < workers; i++) {
    kids.push(new Promise((resolve) => {
      const p = fork(fileURLToPath(import.meta.url), ['--worker', String(i), '--minutes', minutes, '--seed', seed], { stdio: 'inherit' });
      p.on('exit', resolve);
    }));
  }
  await Promise.all(kids);
  const all = [];
  const dedupe = new Set();
  for (const f of readdirSync(outDir).filter((n) => n.startsWith('puzzles-') && n.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(outDir, f), 'utf8').split('\n').filter(Boolean)) {
      const p = JSON.parse(line);
      const key = p.fen.split(' ').slice(0, 2).join(' ');
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      all.push(p);
    }
  }
  writeFileSync(join(outDir, 'puzzles-raw.json'), JSON.stringify(all));
  console.log(`merged ${all.length} puzzles -> scripts/out/puzzles-raw.json`);
}
