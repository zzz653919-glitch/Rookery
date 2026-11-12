// Every line of the opening database must be legal, unique and identified correctly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../js/chess/rules.js';
import { OPENINGS, lineOf, identify, continuations } from '../js/data/openings.js';

test('all opening lines are legal and written in canonical SAN', () => {
  for (const o of OPENINGS) {
    const g = new Chess();
    const sans = [];
    for (const m of lineOf(o)) { const mv = g.move(m); assert.ok(mv, `${o[1]}: illegal move ${m} in "${o[2]}"`); sans.push(mv.san); }
    assert.equal(sans.join(' '), o[2], `${o[1]}: line is not in canonical SAN`);
    assert.match(o[0], /^[A-E]\d\d$/);
  }
});
test('no two openings share a line; names are present', () => {
  const seen = new Map();
  for (const o of OPENINGS) { assert.ok(o[1]); assert.ok(!seen.has(o[2]), `duplicate line ${o[2]}: ${o[1]} / ${seen.get(o[2])}`); seen.set(o[2], o[1]); }
  assert.ok(OPENINGS.length >= 90);
});
test('identify finds the most specific opening; continuations list the next moves', () => {
  assert.equal(identify(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3']).opening[1], 'Sicilian: Najdorf');
  assert.equal(identify(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']).opening[1], 'Ruy Lopez');
  assert.equal(identify(['a3']), null);
  const c = continuations(['e4']); assert.ok(c.some((x) => x.move === 'e5') && c.some((x) => x.move === 'c5'));
  assert.ok(continuations(['e4', 'e5', 'Nf3', 'Nc6']).some((x) => x.move === 'Bb5'));
});
