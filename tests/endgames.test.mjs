import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../js/chess/rules.js';
import { ENDGAMES } from '../js/data/endgames.js';

test('every endgame position is valid, not finished, and the trained side is a real side', () => {
  const ids = new Set();
  for (const e of ENDGAMES) {
    assert.ok(!ids.has(e.id)); ids.add(e.id);
    const g = new Chess(e.fen);
    assert.ok(!g.status().over, e.id + ' is already over');
    assert.ok(['w', 'b'].includes(e.user)); assert.ok(['win', 'hold'].includes(e.goal));
    assert.ok(g.legalMoves().length > 0);
    if (e.id === 'backrank') assert.ok(g.moves().includes('Rd8#'), 'back-rank mate is available');
  }
  assert.ok(ENDGAMES.length >= 10);
});
