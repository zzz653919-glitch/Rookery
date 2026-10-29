// Shared puzzle verification: turns a candidate position into a search-verified puzzle (or null).
import { Chess } from '../../js/chess/rules.js';
import { classify, matDiff } from './motifs.mjs';

export const MATE = 30000;

export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toMove = (u) => (u.length === 5 ? { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] } : { from: u.slice(0, 2), to: u.slice(2, 4) });

function finalFen(fen, solution) {
  const g = new Chess(fen);
  for (const u of solution) g.move(toMove(u));
  return g.fen();
}

/**
 * pos: { fen, keys? , ply? }.  Returns a puzzle object or null.
 * Rules: unique best first move (>=180cp better than the 2nd best, or the only mating move),
 * the solver wins at least 2 pawns of material or mates, within 3 solver moves.
 */
export function buildPuzzle(eng, pos, D = 6) {
  const me = pos.fen.split(' ')[1];
  const g = new Chess(pos.fen);
  if (pos.keys) g.keys = pos.keys.slice();
  const start = matDiff(g, me);
  const solution = [];
  let mated = false;
  for (let k = 0; k < 3; k++) {
    eng.clear();
    const sc = eng.rootScores(g.fen(), g.keys, D, 20000);
    if (sc.length < 2) return null;
    const best = sc[0], second = sc[1];
    const isMate = best.score > MATE - 100;
    if (k === 0) {
      if (best.score < 300) return null;
      if (!isMate && best.score - second.score < 180) return null;
      if (isMate && second.score > MATE - 100) return null;
    } else {
      if (best.score < 200) return null;
      if (!isMate && best.score - second.score < 100) return null;
      if (isMate && second.score > MATE - 100) return null;
    }
    const mv = g.move(toMove(best.uci));
    if (!mv) return null;
    solution.push(best.uci);
    if (g.isCheckmate()) { mated = true; break; }
    const gain = matDiff(g, me) - start;
    const reply = eng.search(g.fen(), g.keys, { depth: D, timeMs: 3000 });
    if (!reply.move) return null;
    if (gain >= 2) {
      const g2 = new Chess(g.fen()); g2.keys = g.keys.slice();
      g2.move(reply.move);
      if (matDiff(g2, me) - start >= 2) break;
    }
    if (g.isGameOver()) return null;
    const rmv = g.move(reply.move);
    if (!rmv) return null;
    solution.push(rmv.from + rmv.to + (rmv.promotion || ''));
    if (g.isGameOver()) return null;
    if (k === 2) return null;
  }
  if (!mated) {
    if (matDiff(new Chess(finalFen(pos.fen, solution)), me) - start < 2) return null;
    if (solution.length % 2 === 0) return null;
  }
  if (solution.length > 5) return null;
  let cls;
  try { cls = classify(pos.fen, solution); } catch { return null; }
  let depthNeeded = D;
  for (let d = 1; d <= D; d++) {
    eng.clear();
    const s = eng.rootScores(pos.fen, pos.keys, d, 10000);
    if (s[0].uci === solution[0] && (s.length < 2 || s[0].score - s[1].score >= 100)) { depthNeeded = d; break; }
  }
  return {
    fen: pos.fen, turn: me, moves: solution, themes: cls.themes, mate: cls.mate,
    solverMoves: cls.playerMoves, depthNeeded, ply: pos.ply ?? 0,
  };
}
