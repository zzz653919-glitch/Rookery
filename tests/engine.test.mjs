import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../js/chess/rules.js';
import { Engine, LEVELS, evaluate } from '../js/chess/engine.js';

// small deterministic PRNG so tests are reproducible
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const engine = new Engine(16);
const ask = (fen, opts = {}) => engine.search(fen, null, { depth: 4, timeMs: 5000, ...opts });

test('finds mate in one', () => {
  const r = ask('k7/8/1K6/8/8/8/8/7R w - - 0 1');
  assert.equal(r.move.san, 'Rh8#');
  assert.ok(r.score > 29000);
});

test('finds mate in one for black', () => {
  const g = new Chess('6k1/8/8/8/8/6r1/5q2/7K b - - 0 1');
  const r = ask(g.fen());
  g.move(r.move);
  assert.ok(g.isCheckmate(), r.move.san);
});

test('captures an undefended queen', () => {
  assert.equal(ask('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1').move.san, 'Rxd5');
});

test('does not capture a defended pawn with its queen', () => {
  // Qxd5 loses the queen to ...exd5 (pawn defends); engine must avoid it
  const r = ask('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', { depth: 5 });
  assert.notEqual(r.move.san, 'Qxd5');
});

test('escapes a mate threat (back-rank)', () => {
  const g = new Chess('6k1/5ppp/8/8/8/8/5PPP/r3R1K1 w - - 0 1');
  const r = ask(g.fen(), { depth: 4 });
  g.move(r.move);
  // after our move black must not have mate in one
  const reply = ask(g.fen(), { depth: 3 });
  const h = new Chess(g.fen());
  h.move(reply.move);
  assert.ok(!h.isCheckmate(), 'engine allowed mate in one: ' + r.move.san);
});

test('evaluation is symmetric', () => {
  const a = new Chess('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
  const b = new Chess('rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 2 3');
  assert.equal(evaluate(a), evaluate(b));
});

function converts(startFen, engineSide, plies, seed) {
  const g = new Chess(startFen);
  const rng = mulberry(seed);
  const eng = new Engine(16);
  for (let i = 0; i < plies && !g.isGameOver(); i++) {
    if (g.turn() === engineSide) {
      const r = eng.search(g.fen(), g.keys, { depth: 5, timeMs: 3000, rng });
      assert.ok(g.move(r.move), 'engine returned an illegal move');
    } else {
      const ms = g.moves({ verbose: true });
      const m = ms[Math.floor(rng() * ms.length)];
      g.move({ from: m.from, to: m.to, promotion: m.promotion });
    }
  }
  return g;
}

test('converts king+queen vs king (checkmate within 40 plies)', () => {
  const g = converts('8/8/8/4k3/8/8/Q7/4K3 w - - 0 1', 'w', 60, 7);
  assert.ok(g.isCheckmate(), 'not mated: ' + g.fen());
});

test('converts king+rook vs king (checkmate within 70 plies)', () => {
  const g = converts('8/8/8/4k3/8/8/8/R3K3 w - - 0 1', 'w', 100, 11);
  assert.ok(g.isCheckmate(), 'not mated: ' + g.fen());
});

test('every difficulty returns legal moves across a whole game', () => {
  for (const level of LEVELS.slice(0, 5)) {
    const g = new Chess();
    const rng = mulberry(level.id * 101);
    const eng = new Engine(16);
    for (let i = 0; i < 40 && !g.isGameOver(); i++) {
      const r = eng.search(g.fen(), g.keys, { level: level.id, timeMs: 400, rng });
      assert.ok(r.move, 'no move at ply ' + i);
      assert.ok(g.move(r.move), `level ${level.id} illegal move ${JSON.stringify(r.move)} in ${g.fen()}`);
    }
  }
});

test('engine reports a principal variation of legal moves', () => {
  const r = ask('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', { depth: 5 });
  assert.ok(r.depth >= 4);
  assert.ok(r.nodes > 500, 'engine must actually search');
  assert.ok(r.pv.length >= 1);
});

test('stalemate/checkmate positions return no move', () => {
  assert.equal(ask('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').move, null);
  assert.equal(ask('R6k/6pp/8/8/8/8/8/6K1 b - - 0 1').move, null);
});
