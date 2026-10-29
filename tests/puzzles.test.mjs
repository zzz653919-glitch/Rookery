import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../js/chess/rules.js';
import { Engine } from '../js/chess/engine.js';
import { PUZZLES } from '../js/data/puzzles.js';
import { mateMoves } from './lib/mate.mjs';

const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

test('puzzle set is non-empty, ids unique, levels 1-5, known themes', () => {
  assert.ok(PUZZLES.length >= 100, 'enough puzzles: ' + PUZZLES.length);
  assert.equal(new Set(PUZZLES.map((p) => p.id)).size, PUZZLES.length);
  for (const p of PUZZLES) {
    assert.ok(p.level >= 1 && p.level <= 5, p.id);
    assert.ok(['mate1', 'mate2', 'fork', 'pin', 'skewer', 'discovered'].includes(p.theme), p.id);
    assert.ok(p.hint && p.explain && p.solution, p.id);
  }
});
test('every puzzle: legal position, legal solution line, odd number of plies', () => {
  for (const p of PUZZLES) {
    const g = new Chess(p.fen);
    assert.equal(p.moves.length % 2, 1, p.id + ' ends on the solver move');
    for (const u of p.moves) assert.ok(g.move(mv(u)), `${p.id}: illegal ${u}`);
  }
});
test('mate puzzles: the solution really mates, and the first move is the ONLY forced mate (exhaustive solver)', () => {
  for (const p of PUZZLES.filter((x) => x.theme === 'mate1' || x.theme === 'mate2')) {
    const n = p.theme === 'mate1' ? 1 : 2;
    const g = new Chess(p.fen);
    for (const u of p.moves) g.move(mv(u));
    assert.ok(g.isCheckmate(), p.id + ' final position is mate');
    assert.deepEqual(mateMoves(p.fen, n), [p.moves[0]], p.id + ' unique mating first move');
  }
});
test('tactic puzzles: engine agrees with the stored first move (seeded sample)', () => {
  const eng = new Engine(16);
  const pool = PUZZLES.filter((x) => !x.theme.startsWith('mate'));
  let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const sample = pool.slice().sort(() => rnd() - 0.5).slice(0, 40);
  for (const p of sample) {
    eng.clear();
    const best = eng.rootScores(p.fen, null, 6, 15000)[0].uci;
    assert.equal(best, p.moves[0], `${p.id}: engine prefers ${best}`);
  }
});
