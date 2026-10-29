import { Chess } from '../chess/rules.js';

// Tiny builders that keep the lesson files readable.
// Moves are written in UCI ("e2e4"; promotions "a7a8q").

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const lesson = (o) => ({ minutes: 6, ...o });

// explanation step; o: { fen, orientation, marks:[{sq,kind}], arrows:[[from,to,color]], explore }
export const learn = (title, text, o = {}) => ({ type: 'learn', title, text, ...o });

export const move = (instruction, fen, accept, o = {}) => ({ type: 'task', kind: 'move', instruction, fen, accept: [].concat(accept), ...o });
export const line = (instruction, fen, steps, o = {}) => ({ type: 'task', kind: 'line', instruction, fen, steps, ...o });
export const squares = (instruction, fen, target, o = {}) => ({ type: 'task', kind: 'squares', instruction, fen, target, ...o });
export const coords = (instruction, o = {}) => ({ type: 'task', kind: 'coords', instruction, ...o });
export const choice = (instruction, q, options, answer, explain, o = {}) => ({ type: 'task', kind: 'mc', instruction, q, options, answer, explain, ...o });

export const quiz = (questions) => ({ type: 'quiz', questions });
export const q = (text, options, answer, explain, o = {}) => ({ kind: 'mc', q: text, options, answer, explain, ...o });

// piece "pill" for text, e.g. P('N') -> Knight
export const K = { color: '#ff6b6b' };
export const RED = '#ff6b6b', GREEN = '#46d39a', BLUE = '#4cc3ff', GOLD = '#f5b942';

// ---- SAN helpers (lines are validated at load time: an illegal move throws) ------------------
const toks = (san) => san.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean);
function ucisOf(san, fen = START) {
  const g = new Chess(fen);
  return toks(san).map((t) => { const m = g.move(t); if (!m) throw new Error('illegal SAN ' + t + ' in ' + san); return m.from + m.to + (m.promotion || ''); });
}
// position (FEN) after playing a SAN line from the start (or from `fen`)
export function fenAfter(san, fen = START) { const g = new Chess(fen); for (const t of toks(san)) if (!g.move(t)) throw new Error('illegal SAN ' + t); return g.fen(); }
// steps for a `line` task: the solver plays moves 1,3,5..., the replies are 2,4,6...
export function sanSteps(san, fen = START) {
  const u = ucisOf(san, fen);
  const steps = [];
  for (let i = 0; i < u.length; i += 2) steps.push(u[i + 1] ? { accept: [u[i]], reply: u[i + 1] } : { accept: [u[i]] });
  return steps;
}
