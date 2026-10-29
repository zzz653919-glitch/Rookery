// Tactical motif detection used by the puzzle generator and the content tests.
import { Chess, mFrom, mTo, sqToName, nameToSq } from '../../js/chess/rules.js';

const KN = [-33, -31, -18, -14, 14, 18, 31, 33];
const KG = [-17, -16, -15, -1, 1, 15, 16, 17];
const BI = [-17, -15, 15, 17];
const RO = [-16, -1, 1, 16];
export const VAL = [0, 1, 3, 3, 5, 9, 100];

export const typeOf = (p) => p & 7;
export const colorOf = (p) => (p & 8 ? 'b' : 'w');
const SYM = '.pnbrqk';

// 0x88 squares attacked (or defended) by the piece standing on sq
export function attackedBy(g, sq) {
  const p = g.b[sq];
  if (!p) return [];
  const t = typeOf(p), out = [];
  const b = g.b;
  if (t === 1) {
    const dir = p & 8 ? -16 : 16;
    for (const d of [dir - 1, dir + 1]) { const s = sq + d; if (!(s & 0x88)) out.push(s); }
  } else if (t === 2 || t === 6) {
    for (const o of (t === 2 ? KN : KG)) { const s = sq + o; if (!(s & 0x88)) out.push(s); }
  } else {
    const offs = t === 3 ? BI : t === 4 ? RO : KG;
    for (const o of offs) {
      let s = sq + o;
      while (!(s & 0x88)) { out.push(s); if (b[s]) break; s += o; }
    }
  }
  return out;
}

export const material = (g, color) => {
  let s = 0;
  for (let q = 0; q < 128; q++) {
    if (q & 0x88) continue;
    const p = g.b[q];
    if (p && colorOf(p) === color) s += VAL[typeOf(p)] % 100;
  }
  return s;
};
export const matDiff = (g, color) => material(g, color) - material(g, color === 'w' ? 'b' : 'w');

// pins created by `color`'s sliders against the opponent: [{pinner, pinned, behind}] (algebraic)
export function pinsBy(g, color) {
  const res = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    const p = g.b[s];
    if (!p || colorOf(p) !== color) continue;
    const t = typeOf(p);
    if (t < 3 || t > 5) continue;
    const offs = t === 3 ? BI : t === 4 ? RO : KG;
    for (const o of offs) {
      let q = s + o, first = -1;
      while (!(q & 0x88)) {
        const x = g.b[q];
        if (x) {
          if (first < 0) { if (colorOf(x) === color) break; first = q; }
          else {
            if (colorOf(x) !== color && (typeOf(x) === 6 || VAL[typeOf(x)] > VAL[typeOf(g.b[first])])) {
              res.push({ pinner: sqToName(s), pinned: sqToName(first), behind: sqToName(q), absolute: typeOf(x) === 6 });
            }
            break;
          }
        }
        q += o;
      }
    }
  }
  return res;
}

// skewers: a slider attacks a valuable enemy piece A with a lesser piece B directly behind it
export function skewersBy(g, color) {
  const res = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    const p = g.b[s];
    if (!p || colorOf(p) !== color) continue;
    const t = typeOf(p);
    if (t < 3 || t > 5) continue;
    const offs = t === 3 ? BI : t === 4 ? RO : KG;
    for (const o of offs) {
      let q = s + o, first = -1;
      while (!(q & 0x88)) {
        const x = g.b[q];
        if (x) {
          if (first < 0) { if (colorOf(x) === color) break; first = q; }
          else {
            if (colorOf(x) !== color) {
              const a = g.b[first];
              if (typeOf(a) === 6 || VAL[typeOf(a)] > VAL[typeOf(x)]) res.push({ slider: sqToName(s), front: sqToName(first), behind: sqToName(q) });
            }
            break;
          }
        }
        q += o;
      }
    }
  }
  return res;
}

// Which enemy pieces does the piece on `sq` fork (>=2 targets worth winning)?
export function forkTargets(g, sq) {
  const p = g.b[sq];
  if (!p) return [];
  const me = colorOf(p), them = me === 'w' ? 'b' : 'w';
  const out = [];
  for (const s of attackedBy(g, sq)) {
    const x = g.b[s];
    if (!x || colorOf(x) !== them) continue;
    const defended = g.attacked(s, them === 'w' ? 0 : 8);
    if (typeOf(x) === 6 || VAL[typeOf(x)] > VAL[typeOf(p)] || !defended) {
      if (typeOf(x) === 1 && !defended && typeOf(p) !== 1) { out.push(sqToName(s)); continue; }
      if (typeOf(x) !== 1) out.push(sqToName(s));
    }
  }
  return out;
}

// Discovered attack: the moved piece uncovers a friendly slider's attack on a valuable enemy piece / king
export function discoveredBy(gBefore, mv) {
  const from = nameToSq(mv.from);
  const me = mv.color, them = me === 'w' ? 'b' : 'w';
  const g2 = new Chess(gBefore.fen());
  g2.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
  const res = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88 || s === from) continue;
    const p = g2.b[s];
    if (!p || colorOf(p) !== me) continue;
    const t = typeOf(p);
    if (t < 3 || t > 5) continue;
    const offs = t === 3 ? BI : t === 4 ? RO : KG;
    for (const o of offs) {
      // does the ray pass through the vacated square `from`?
      let q = s + o, passed = false;
      while (!(q & 0x88)) {
        if (q === from) passed = true;
        const x = g2.b[q];
        if (x) {
          if (passed && colorOf(x) === them && (typeOf(x) === 6 || VAL[typeOf(x)] >= 3) && q !== nameToSq(mv.to)) {
            res.push({ slider: sqToName(s), target: sqToName(q), check: typeOf(x) === 6 });
          }
          break;
        }
        q += o;
      }
    }
  }
  return res;
}

// Classify a puzzle (start FEN + solution as UCI list starting with the solver's move)
export function classify(fen, solution) {
  const g = new Chess(fen);
  const me = g.turn();
  const verbose = [];
  const playerMoves = [];
  let promo = false, mate = false, lastPlayer = null;
  for (let i = 0; i < solution.length; i++) {
    const u = solution[i];
    const before = g.fen();
    const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!mv) throw new Error('illegal solution move ' + u + ' in ' + before);
    verbose.push({ mv, before });
    if (i % 2 === 0) { playerMoves.push({ mv, before }); lastPlayer = mv; if (mv.promotion) promo = true; }
  }
  mate = g.isCheckmate();
  const n = playerMoves.length;
  const themes = [];
  if (mate) {
    themes.push('mate' + Math.min(3, n));
    const mm = lastPlayer;
    const kingSq = g.ksq[g.side >> 3];
    const kr = kingSq >> 4;
    if ((mm.piece === 'r' || mm.piece === 'q') && (kr === 0 || kr === 7) && ((mm.to[1] === '1' && kr === 0) || (mm.to[1] === '8' && kr === 7))) themes.push('backRank');
    if (mm.piece === 'n') {
      let surrounded = true;
      for (const o of KG) {
        const s = kingSq + o;
        if (s & 0x88) continue;
        const x = g.b[s];
        if (!x || colorOf(x) === me) { surrounded = false; break; }
      }
      if (surrounded) themes.push('smothered');
    }
  }
  if (promo) themes.push('promotion');
  const first = playerMoves[0];
  const g0 = new Chess(first.before);
  const g1 = new Chess(first.before); g1.move({ from: first.mv.from, to: first.mv.to, promotion: first.mv.promotion });
  const finalCap = lastPlayer && lastPlayer.captured ? lastPlayer.to : null;
  const toSq = nameToSq(first.mv.to);
  if (!mate) {
    const ft = forkTargets(g1, toSq);
    if (ft.length >= 2 && !first.mv.captured) themes.push('fork');
    else if (ft.length >= 2 && finalCap && ft.includes(finalCap)) themes.push('fork');
    const pins = pinsBy(g1, me).filter((p) => p.pinner === first.mv.to);
    if (pins.length && n >= 2) themes.push('pin');
    const sk = skewersBy(g1, me).filter((s) => s.slider === first.mv.to);
    if (sk.length && finalCap && sk.some((s) => s.behind === finalCap)) themes.push('skewer');
    const disc = discoveredBy(g0, first.mv);
    if (disc.length) themes.push(disc.some((d) => d.check) ? 'discoveredCheck' : 'discovered');
    if (!themes.length && n === 1 && first.mv.captured) themes.push('hanging');
  } else {
    const disc = discoveredBy(g0, first.mv);
    if (disc.length && n >= 1 && !themes.includes('discovered')) themes.push('discovered');
  }
  if (!themes.length) themes.push('tactic');
  return { themes, mate, playerMoves: n };
}
