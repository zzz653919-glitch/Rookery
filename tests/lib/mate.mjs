// Brute-force forced-mate solver for tiny positions (used to verify lesson/puzzle content).
import { Chess } from '../../js/chess/rules.js';
export const uci = (m) => m.from + m.to + (m.promotion || '');

// true if side to move can force mate in <= n of its own moves
export function forcesMate(g, n) {
  if (n < 1) return false;
  for (const m of g.moves({ verbose: true })) {
    g.move(m);
    let ok;
    if (g.isCheckmate()) ok = true;
    else if (g.isGameOver() || n === 1) ok = false;
    else {
      ok = true;
      for (const r of g.moves({ verbose: true })) {
        g.move(r);
        const win = forcesMate(g, n - 1);
        g.undo();
        if (!win) { ok = false; break; }
      }
    }
    g.undo();
    if (ok) return true;
  }
  return false;
}
// all first moves (uci) that force mate within n
export function mateMoves(fen, n) {
  const g = new Chess(fen);
  const out = [];
  for (const m of g.moves({ verbose: true })) {
    g.move(m);
    let ok;
    if (g.isCheckmate()) ok = true;
    else if (g.isGameOver() || n === 1) ok = false;
    else {
      ok = true;
      for (const r of g.moves({ verbose: true })) {
        g.move(r);
        const win = forcesMate(g, n - 1);
        g.undo();
        if (!win) { ok = false; break; }
      }
    }
    g.undo();
    if (ok) out.push(uci(m));
  }
  return out;
}
