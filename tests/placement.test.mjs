import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePlacement } from '../js/placement-score.js';
import { PLACEMENT } from '../js/data/placement.js';

// helper: answer the first `n` questions of each listed tier correctly
const answer = (spec) => PLACEMENT.map((p) => {
  const k = spec[p.tier] ?? 0;
  const idxInTier = PLACEMENT.filter((q) => q.tier === p.tier).findIndex((q) => q.id === p.id);
  return { id: p.id, ok: idxInTier < k };
});
const lvl = (spec) => scorePlacement(answer(spec)).level;

test('no correct answers -> beginner', () => assert.equal(lvl({}), 'beginner'));
test('tier 1 mastered only -> elementary', () => assert.equal(lvl({ 1: 6 }), 'elementary'));
test('tiers 1-2 -> intermediate', () => assert.equal(lvl({ 1: 6, 2: 6 }), 'intermediate'));
test('tiers 1-3 -> advanced', () => assert.equal(lvl({ 1: 6, 2: 6, 3: 6 }), 'advanced'));
test('all correct -> expert', () => assert.equal(lvl({ 1: 6, 2: 6, 3: 6, 4: 5 }), 'expert'));
test('60% threshold: 4/6 on tier 1 counts as mastered', () => assert.equal(lvl({ 1: 4 }), 'elementary'));
test('3/6 on tier 1 is not mastered by itself', () => assert.equal(lvl({ 1: 3 }), 'beginner'));
test('bridge rule: 3/6 on tier 1 + strong tier 2 (>=80%) is mastered', () => assert.equal(lvl({ 1: 3, 2: 5 }), 'intermediate'));
test('levels are consecutive: strong tier 2 cannot skip a failed tier 1', () => assert.equal(lvl({ 1: 1, 2: 6, 3: 6, 4: 5 }), 'beginner'));
test('result carries per-skill totals, strengths and weaknesses', () => {
  const r = scorePlacement(answer({ 1: 6, 2: 6 }));
  assert.equal(r.total, PLACEMENT.length);
  assert.equal(Object.values(r.skills).reduce((n, s) => n + s.total, 0), PLACEMENT.length);
  assert.ok(r.strengths.length > 0);
  assert.ok(r.weaknesses.includes('calculation') || r.weaknesses.includes('strategy'));
  assert.ok(r.pct > 0 && r.pct < 100);
});
test('unanswered questions count as wrong', () => assert.equal(scorePlacement([]).level, 'beginner'));
