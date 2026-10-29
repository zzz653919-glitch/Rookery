import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../js/chess/rules.js';
import { LESSONS } from '../js/data/lessons.js';
import { PLACEMENT } from '../js/data/placement.js';
import { Engine } from '../js/chess/engine.js';
import { mateMoves } from './lib/mate.mjs';
const eng = new Engine(16);
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const uci = (m) => m.from + m.to + (m.promotion || '');
const legalUci = (g) => g.moves({ verbose: true }).map(uci);
function play(g, u) {
  const m = g.moves({ verbose: true }).find((x) => uci(x) === u);
  assert.ok(m, `illegal move ${u} in ${g.fen()}`);
  g.move(m);
}
function checkFen(fen, where) {
  try { return new Chess(fen); } catch (e) { throw new Error(`${where}: ${e.message}: ${fen}`); }
}

for (const L of LESSONS) {
  test(`lesson ${L.id}`, () => {
    assert.ok(L.steps.some((s) => s.type === 'quiz'), 'has quiz');
    assert.ok(L.steps.some((s) => s.type === 'task'), 'has task');
    L.steps.forEach((s, i) => {
      const where = `${L.id}#${i}`;
      if (s.type === 'quiz') {
        for (const qq of s.questions) { assert.ok(qq.answer >= 0 && qq.answer < qq.options.length, where + ' quiz answer'); assert.ok(qq.explain, where); }
      }
      if (s.fen) checkFen(s.fen, where);
      if (s.type !== 'task') return;
      if (s.kind === 'move') {
        const g = checkFen(s.fen, where);
        const legal = legalUci(g);
        for (const a of s.accept) assert.ok(legal.includes(a), `${where}: accept ${a} illegal`);
        for (const w of Object.keys(s.wrong || {})) assert.ok(legal.includes(w), `${where}: wrong-note move ${w} illegal`);
        if (s.verify === 'best') {
          eng.clear();
          const r = eng.search(s.fen, null, { depth: 6, timeMs: 8000 });
          const best = r.move.from + r.move.to + (r.move.promotion || '');
          assert.ok(s.accept.includes(best), `${where}: engine prefers ${best}, accept=${s.accept}`);
        }
        if (s.verify === 'parry') {
          const parry = legal.filter((u) => { const h = new Chess(s.fen); play(h, u); return !h.isGameOver() && mateMoves(h.fen(), 1).length === 0; });
          for (const a of s.accept) assert.ok(parry.includes(a), `${where}: ${a} does not stop the mate`);
          for (const w of Object.keys(s.wrong || {})) assert.ok(!parry.includes(w), `${where}: wrong-note move ${w} actually stops the mate`);
        }
        if (s.verify === 'mate') assert.ok(same(mateMoves(s.fen, 1), s.accept), `${where}: accept set != all mate-in-1 moves (${mateMoves(s.fen, 1)})`);
        if (s.verify !== 'parry' && (s.explain || '').includes('#') && !/would be stalemate/.test(s.explain)) {
          for (const a of s.accept) { const h = new Chess(s.fen); play(h, a); assert.ok(h.isCheckmate(), `${where}: ${a} is not mate`); }
        }
      } else if (s.kind === 'line') {
        const g = checkFen(s.fen, where);
        if (s.verify === 'mate2') {
          const first = mateMoves(s.fen, 2);
          assert.ok(same(first, s.steps[0].accept), `${where}: first-move set ${first} != accept ${s.steps[0].accept}`);
          const h = new Chess(s.fen); play(h, s.steps[0].accept[0]); play(h, s.steps[0].reply);
          assert.ok(same(mateMoves(h.fen(), 1), s.steps[1].accept), `${where}: second-step accept mismatch (${mateMoves(h.fen(), 1)})`);
        }
        for (const st of s.steps) {
          const ok = st.accept.filter((a) => legalUci(g).includes(a));
          assert.ok(ok.length, `${where}: no legal accept`);
          const lead = ok[0];
          play(g, lead);
          if (st.reply) play(g, st.reply);
        }
        if (!s.plain) assert.ok(g.isCheckmate(), `${where}: line does not end in mate`);
      } else if (s.kind === 'mc' && s.threat) {
        const parts = s.fen.split(' '); parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
        assert.ok(mateMoves(parts.join(' '), 1).includes(s.threat), `${where}: ${s.threat} is not a mate threat`);
      } else if (s.kind === 'squares') {
        checkFen(s.fen, where);
      }
    });
  });
}

// ---- placement items are validated exactly like lesson tasks ------------------------------------
test('placement: 23 items in four tiers with unique ids', () => {
  assert.equal(PLACEMENT.length, 23);
  assert.equal(new Set(PLACEMENT.map((p) => p.id)).size, 23);
  for (const t of [1, 2, 3, 4]) assert.ok(PLACEMENT.filter((p) => p.tier === t).length >= 5, 'tier ' + t);
  const kinds = new Set(PLACEMENT.map((p) => p.kind));
  assert.ok(kinds.has('mc') && kinds.has('move') && kinds.has('line'), 'mixes multiple choice and board tasks');
});
test('placement items are valid tasks', () => {
  const fake = { id: 'placement', steps: PLACEMENT.map((p) => ({ type: 'task', ...p })) };
  fake.steps.forEach((s, i) => {
    const where = 'placement#' + s.id;
    if (s.kind === 'mc') { assert.ok(s.answer >= 0 && s.answer < s.options.length, where); if (s.fen) checkFen(s.fen, where); if (s.threat) { const parts = s.fen.split(' '); parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-'; assert.ok(mateMoves(parts.join(' '), 1).includes(s.threat), where + ' threat'); } return; }
    const g = checkFen(s.fen, where);
    if (s.kind === 'move') {
      const legal = legalUci(g);
      for (const a of s.accept) assert.ok(legal.includes(a), where + ' accept illegal ' + a);
      if (s.verify === 'best') { eng.clear(); const r = eng.search(s.fen, null, { depth: 6, timeMs: 8000 }); assert.ok(s.accept.includes(r.move.from + r.move.to + (r.move.promotion || '')), where + ' engine disagrees'); }
      if (s.verify === 'mate') assert.ok(same(mateMoves(s.fen, 1), s.accept), where + ' mate set');
    } else if (s.kind === 'line') {
      if (s.verify === 'mate2') {
        assert.ok(same(mateMoves(s.fen, 2), s.steps[0].accept), where + ' first move set');
        const h = new Chess(s.fen); play(h, s.steps[0].accept[0]); play(h, s.steps[0].reply);
        assert.ok(same(mateMoves(h.fen(), 1), s.steps[1].accept), where + ' second step set');
      }
    }
  });
});
