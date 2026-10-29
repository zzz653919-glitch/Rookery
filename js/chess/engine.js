// Rookery computer opponent: a real alpha-beta search engine (original code).
// Iterative deepening, transposition table, null-move pruning, late-move
// reductions, killer/history ordering, quiescence search, tapered evaluation.
// It runs entirely in the browser (in a Web Worker) and needs no network.

import {
  Chess, P, N, B, R, Q, K, WHITE, BLACK,
  F_CAP, F_PROMO, mFrom, mTo, mPromo, mFlags, sqToName,
} from './rules.js';

const INF = 32000, MATE = 30000;
const VAL = [0, 100, 320, 330, 500, 900, 0];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

// Piece-square tables (row 0 = rank 8 from White's point of view).
const PST = {
  [P]: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
    0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  [N]: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
    -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
    -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  [B]: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
    -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
    -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  [R]: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
    -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  [Q]: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
    -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10,
    -20,-10,-10,-5,-5,-10,-10,-20],
  KMG: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
    20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  KEG: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30,
    -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30,
    -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
};
const PASSED = [0, 5, 10, 20, 35, 60, 100, 0];

// Static evaluation from the point of view of the side to move.
export function evaluate(g) {
  const b = g.b;
  let mg = 0, phase = 0;
  const pawnFile = [new Int8Array(8), new Int8Array(8)];
  const wMin = new Int8Array(8).fill(8), bMax = new Int8Array(8).fill(-1);
  const bishops = [0, 0];
  const rooks = [[], []];
  let wk = 0, bk = 0, nonK = 0;
  let kMgW = 0, kMgB = 0, kEgW = 0, kEgB = 0;
  for (let s = 0; s < 120; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (!p) continue;
    const t = p & 7, black = (p & 8) !== 0;
    const f = s & 7, rk = s >> 4;
    const idx = black ? rk * 8 + f : (7 - rk) * 8 + f;
    if (t === K) {
      if (black) { kMgB = PST.KMG[idx]; kEgB = PST.KEG[idx]; bk = s; }
      else { kMgW = PST.KMG[idx]; kEgW = PST.KEG[idx]; wk = s; }
      continue;
    }
    nonK++;
    phase += PHASE_W[t];
    const v = VAL[t] + PST[t][idx];
    mg += black ? -v : v;
    if (t === P) {
      pawnFile[black ? 1 : 0][f]++;
      if (black) { if (rk > bMax[f]) bMax[f] = rk; } else if (rk < wMin[f]) wMin[f] = rk;
    } else if (t === B) bishops[black ? 1 : 0]++;
    else if (t === R) rooks[black ? 1 : 0].push(f);
  }
  // Tiny-material draws
  if (nonK <= 1 && phase <= 1 && !pawnFile[0].some((x) => x) && !pawnFile[1].some((x) => x)) return 0;

  let score = mg;
  if (bishops[0] >= 2) score += 30;
  if (bishops[1] >= 2) score -= 30;
  for (let c = 0; c < 2; c++) {
    const sign = c === 0 ? 1 : -1;
    for (let f = 0; f < 8; f++) {
      const n = pawnFile[c][f];
      if (!n) continue;
      if (n > 1) score -= sign * 10 * (n - 1);
      const iso = (f === 0 || !pawnFile[c][f - 1]) && (f === 7 || !pawnFile[c][f + 1]);
      if (iso) score -= sign * 12 * n;
    }
    for (const f of rooks[c]) {
      if (!pawnFile[c][f]) score += sign * (pawnFile[1 - c][f] ? 8 : 15);
    }
  }
  // passed pawns
  for (let s = 0; s < 120; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if ((p & 7) !== P) continue;
    const f = s & 7, rk = s >> 4;
    if (!(p & 8)) {
      let passed = true;
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) if (bMax[ff] > rk) { passed = false; break; }
      if (passed) score += PASSED[rk];
    } else {
      let passed = true;
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) if (wMin[ff] < rk) { passed = false; break; }
      if (passed) score -= PASSED[7 - rk];
    }
  }
  // tapered king
  const ph = Math.min(24, phase);
  const kmg = kMgW - kMgB, keg = kEgW - kEgB;
  score += Math.round((kmg * ph + keg * (24 - ph)) / 24);
  // endgame: drive the losing king toward the edge when far ahead
  if (ph <= 8 && Math.abs(score) > 300) {
    const lose = score > 0 ? bk : wk, win = score > 0 ? wk : bk;
    const lf = lose & 7, lr = lose >> 4;
    const centre = Math.max(3 - lf, lf - 4) + Math.max(3 - lr, lr - 4);
    const dist = Math.abs((lose & 7) - (win & 7)) + Math.abs((lose >> 4) - (win >> 4));
    const bonus = 10 * centre + 4 * (14 - dist);
    score += score > 0 ? bonus : -bonus;
  }
  score += g.side === WHITE ? 10 : -10; // tempo
  return g.side === WHITE ? score : -score;
}

// -------------------------------------------------------------------------
export const LEVELS = [
  { id: 1, name: 'Rookie',   depth: 1,  timeMs: 400,   margin: 350, blunder: 0.30, blurb: 'Plays quickly and often overlooks tactics. Great for learning the rules.' },
  { id: 2, name: 'Beginner', depth: 2,  timeMs: 600,   margin: 220, blunder: 0.18, blurb: 'Sees one move ahead for both sides. Makes plenty of mistakes.' },
  { id: 3, name: 'Casual',   depth: 3,  timeMs: 900,   margin: 140, blunder: 0.10, blurb: 'Spots simple tactics, still slips under pressure.' },
  { id: 4, name: 'Club',     depth: 4,  timeMs: 1400,  margin: 70,  blunder: 0.04, blurb: 'Solid tactically. Punishes loose pieces.' },
  { id: 5, name: 'Strong',   depth: 5,  timeMs: 2200,  margin: 30,  blunder: 0,    blurb: 'Calculates several moves ahead and rarely blunders.' },
  { id: 6, name: 'Advanced', depth: 7,  timeMs: 2500,  margin: 0,   blunder: 0,    blurb: 'Deeper search with time management.' },
  { id: 7, name: 'Expert',   depth: 9,  timeMs: 4000,  margin: 0,   blunder: 0,    blurb: 'Deep tactical calculation.' },
  { id: 8, name: 'Maximum',  depth: 14, timeMs: 7000,  margin: 0,   blunder: 0,    blurb: 'The strongest setting this built-in engine offers.' },
];

export class Engine {
  constructor(ttBits = 18) {
    this.size = 1 << ttBits;
    this.tkey = new Float64Array(this.size);
    this.tscore = new Int32Array(this.size);
    this.tdepth = new Int8Array(this.size);
    this.tflag = new Uint8Array(this.size); // 1 exact, 2 lower, 3 upper
    this.tmove = new Int32Array(this.size);
    this.g = null;
    this.killers = [];
    this.history = new Int32Array(16 * 128);
    this.nodes = 0;
    this.stopped = false;
    this.deadline = Infinity;
    this.nodeLimit = Infinity;
  }

  clear() {
    this.tkey.fill(0); this.tflag.fill(0);
    this.history.fill(0);
  }

  timeUp() {
    return this.nodes >= this.nodeLimit || Date.now() >= this.deadline;
  }

  isRepetition() {
    const g = this.g, keys = g.keys;
    const cur = keys[keys.length - 1];
    const limit = Math.min(g.half, keys.length - 1);
    for (let i = 2; i <= limit; i += 2) {
      if (keys[keys.length - 1 - i] === cur) return true;
    }
    return false;
  }

  hasPieces(side) {
    const b = this.g.b;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p && (p & 8) === side) { const t = p & 7; if (t !== P && t !== K) return true; }
    }
    return false;
  }

  scoreMoves(moves, ttMove, ply) {
    const g = this.g, b = g.b;
    const scores = new Array(moves.length);
    const k = this.killers[ply] || [0, 0];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      let s;
      if (m === ttMove) s = 10000000;
      else if (mFlags(m) & (F_CAP | F_PROMO)) {
        const victim = (mFlags(m) & 2) ? P : (b[mTo(m)] & 7);
        const attacker = b[mFrom(m)] & 7;
        s = 1000000 + VAL[victim] * 10 - attacker + (mPromo(m) ? VAL[mPromo(m)] : 0);
      } else if (m === k[0]) s = 900000;
      else if (m === k[1]) s = 800000;
      else s = this.history[(b[mFrom(m)] & 15) * 128 + mTo(m)];
      scores[i] = s;
    }
    return scores;
  }

  quiesce(alpha, beta, ply) {
    const g = this.g;
    if ((++this.nodes & 2047) === 0 && this.timeUp()) this.stopped = true;
    if (this.stopped) return 0;
    const stand = evaluate(g);
    if (ply >= 60) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = g.gen(true);
    const scores = this.scoreMoves(moves, 0, ply);
    const us = g.side;
    let best = stand;
    for (let i = 0; i < moves.length; i++) {
      let bi = i;
      for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[bi]) bi = j;
      if (bi !== i) { [moves[i], moves[bi]] = [moves[bi], moves[i]]; [scores[i], scores[bi]] = [scores[bi], scores[i]]; }
      const m = moves[i];
      if (!(mFlags(m) & F_PROMO)) {
        const victim = (mFlags(m) & 2) ? P : (g.b[mTo(m)] & 7);
        if (stand + VAL[victim] + 200 < alpha) continue; // delta pruning
      }
      g.make(m);
      if (g.attacked(g.ksq[us >> 3], us ^ 8)) { g.unmake(); continue; }
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      g.unmake();
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) { alpha = score; if (alpha >= beta) break; }
      }
    }
    return best;
  }

  negamax(depth, alpha, beta, ply, nullOk) {
    const g = this.g;
    if ((++this.nodes & 2047) === 0 && this.timeUp()) this.stopped = true;
    if (this.stopped) return 0;
    if (ply > 0) {
      if (g.half >= 100 || this.isRepetition()) return 0;
    }
    const inCheck = g.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    if (ply > 0) {
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    const isPv = beta - alpha > 1;
    const key = g.keys[g.keys.length - 1];
    const idx = key % this.size;
    let ttMove = 0;
    if (this.tkey[idx] === key && this.tflag[idx]) {
      ttMove = this.tmove[idx];
      if (!isPv && this.tdepth[idx] >= depth) {
        let sc = this.tscore[idx];
        if (sc > MATE - 200) sc -= ply; else if (sc < -MATE + 200) sc += ply;
        const fl = this.tflag[idx];
        if (fl === 1 || (fl === 2 && sc >= beta) || (fl === 3 && sc <= alpha)) return sc;
      }
    }
    const us = g.side;
    // null-move pruning
    if (nullOk && !isPv && !inCheck && depth >= 3 && this.hasPieces(us)) {
      if (evaluate(g) >= beta) {
        g.makeNull();
        const sc = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
        g.unmakeNull();
        if (this.stopped) return 0;
        if (sc >= beta) return sc >= MATE - 200 ? beta : sc;
      }
    }
    const moves = g.gen();
    const scores = this.scoreMoves(moves, ttMove, ply);
    let best = -INF, bestMove = 0, legal = 0;
    const origAlpha = alpha;
    for (let i = 0; i < moves.length; i++) {
      let bi = i;
      for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[bi]) bi = j;
      if (bi !== i) { [moves[i], moves[bi]] = [moves[bi], moves[i]]; [scores[i], scores[bi]] = [scores[bi], scores[i]]; }
      const m = moves[i];
      g.make(m);
      if (g.attacked(g.ksq[us >> 3], us ^ 8)) { g.unmake(); continue; }
      legal++;
      const quiet = !(mFlags(m) & (F_CAP | F_PROMO));
      const givesCheck = g.inCheck();
      let score;
      if (legal === 1) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let red = 0;
        if (depth >= 3 && legal > 3 && quiet && !inCheck && !givesCheck) red = legal > 8 && depth >= 6 ? 2 : 1;
        score = -this.negamax(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && (red > 0 || score < beta)) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
        }
      }
      g.unmake();
      if (this.stopped) return 0;
      if (score > best) {
        best = score; bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (quiet) {
              const k = this.killers[ply] || (this.killers[ply] = [0, 0]);
              if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
              this.history[(g.b[mFrom(m)] & 15) * 128 + mTo(m)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;
    // store
    let store = best;
    if (store > MATE - 200) store += ply; else if (store < -MATE + 200) store -= ply;
    this.tkey[idx] = key;
    this.tscore[idx] = store;
    this.tdepth[idx] = depth;
    this.tmove[idx] = bestMove;
    this.tflag[idx] = best <= origAlpha ? 3 : best >= beta ? 2 : 1;
    return best;
  }

  // Search a position. opts: { depth, timeMs, nodes, level, rng }
  search(fen, keys, opts = {}) {
    const g = this.g = new Chess(fen);
    if (keys && keys.length) g.keys = keys.slice();
    this.killers = [];
    const level = opts.level ? LEVELS[Math.max(0, Math.min(LEVELS.length - 1, opts.level - 1))] : null;
    const maxDepth = opts.depth || (level ? level.depth : 6);
    const timeMs = opts.timeMs || (level ? level.timeMs : 1500);
    const rng = opts.rng || Math.random;
    this.nodes = 0; this.stopped = false;
    this.nodeLimit = opts.nodes || Infinity;
    const start = Date.now();
    this.deadline = start + timeMs;

    const rootMoves = g.legalMoves();
    if (!rootMoves.length) return { move: null, score: g.inCheck() ? -MATE : 0, depth: 0, nodes: 0, pv: [] };
    if (rootMoves.length === 1) {
      return this.pack(rootMoves[0], 0, 1, 0, g);
    }

    const variable = level && (level.margin > 0 || level.blunder > 0);
    if (variable) {
      // Score every root move with a real search, then choose with controlled imperfection.
      this.deadline = start + timeMs;
      const scored = [];
      let ttm = 0;
      for (let d = 1; d <= maxDepth; d++) {
        const cur = [];
        const order = scored.length ? scored.map((x) => x.m) : rootMoves;
        for (const m of order) {
          g.make(m);
          const sc = -this.negamax(d - 1, -INF, INF, 1, true);
          g.unmake();
          if (this.stopped) break;
          cur.push({ m, score: sc });
        }
        if (this.stopped) { if (!scored.length) { for (const m of rootMoves) scored.push({ m, score: 0 }); } break; }
        cur.sort((a, b) => b.score - a.score);
        scored.length = 0; scored.push(...cur);
        ttm = d;
      }
      const best = scored[0].score;
      let pool;
      if (level.blunder > 0 && rng() < level.blunder) {
        pool = scored.filter((x) => x.score >= best - level.margin * 3 && x.score > -MATE + 300).slice(0, 6);
      } else {
        pool = scored.filter((x) => x.score >= best - level.margin);
      }
      if (!pool.length) pool = [scored[0]];
      const pick = pool[Math.floor(rng() * pool.length)];
      return this.pack(pick.m, pick.score, ttm, this.nodes, g);
    }

    let bestMove = rootMoves[0], bestScore = -INF, doneDepth = 0;
    let ordered = rootMoves.slice();
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -INF, curBest = 0, curScore = -INF;
      const scores = this.scoreMoves(ordered, bestMove, 0);
      const idxs = ordered.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
      const ord = idxs.map((i) => ordered[i]);
      let first = true;
      for (const m of ord) {
        g.make(m);
        let sc;
        if (first) sc = -this.negamax(d - 1, -INF, -alpha, 1, true);
        else {
          sc = -this.negamax(d - 1, -alpha - 1, -alpha, 1, true);
          if (sc > alpha && !this.stopped) sc = -this.negamax(d - 1, -INF, -alpha, 1, true);
        }
        g.unmake();
        if (this.stopped) break;
        first = false;
        if (sc > curScore) { curScore = sc; curBest = m; if (sc > alpha) alpha = sc; }
      }
      if (this.stopped) {
        // keep a partial result only if the previous best move was re-searched and improved
        if (curBest && doneDepth === 0) { bestMove = curBest; bestScore = curScore; }
        break;
      }
      bestMove = curBest; bestScore = curScore; doneDepth = d;
      ordered = ord;
      if (Math.abs(bestScore) > MATE - 200) break; // forced mate found
      if (Date.now() - start > timeMs * 0.55) break; // not enough time for another iteration
    }
    return this.pack(bestMove, bestScore, doneDepth, this.nodes, g);
  }

  // Score every legal root move with a full-window search at `depth`.
  // Returns [{uci, san, score}] sorted best-first (score = side to move's view).
  rootScores(fen, keys, depth, timeMs = 60000) {
    const g = this.g = new Chess(fen);
    if (keys && keys.length) g.keys = keys.slice();
    this.killers = [];
    this.nodes = 0; this.stopped = false; this.nodeLimit = Infinity;
    this.deadline = Date.now() + timeMs;
    const legal = g.legalMoves();
    const out = [];
    for (const m of legal) {
      const san = g.san(m, legal);
      g.make(m);
      const score = -this.negamax(depth - 1, -INF, INF, 1, true);
      g.unmake();
      out.push({ uci: sqToName(mFrom(m)) + sqToName(mTo(m)) + (mPromo(m) ? 'qrbn'[[Q, R, B, N].indexOf(mPromo(m))] : ''), san, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  pv(g, maxLen = 8) {
    const out = [];
    let n = 0;
    const seen = [];
    while (n < maxLen) {
      const key = g.keys[g.keys.length - 1];
      const idx = key % this.size;
      if (this.tkey[idx] !== key || !this.tmove[idx]) break;
      const m = this.tmove[idx];
      const legal = g.legalMoves();
      if (!legal.includes(m)) break;
      out.push(m); g.make(m); seen.push(m); n++;
    }
    for (let i = seen.length - 1; i >= 0; i--) g.unmake();
    return out;
  }

  pack(m, score, depth, nodes, g) {
    const pv = this.pv(g, 6);
    const desc = g.describe(m);
    return {
      move: { from: desc.from, to: desc.to, promotion: desc.promotion, san: desc.san },
      score, depth, nodes,
      pv: pv.length ? pv.map((x) => sqToName(mFrom(x)) + sqToName(mTo(x))) : [desc.from + desc.to],
    };
  }
}

// Score (centipawns, side to move) -> text
export function scoreText(score, sideToMove) {
  if (Math.abs(score) > MATE - 200) {
    const plies = MATE - Math.abs(score);
    const mate = Math.ceil(plies / 2);
    return (score > 0 ? '+' : '-') + 'M' + mate;
  }
  const v = (sideToMove === 'w' ? score : -score) / 100;
  return (v >= 0 ? '+' : '') + v.toFixed(1);
}
