// Opening explorer and trainer.
import { Chess } from '../chess/rules.js';
import { BoardView, piecesFromGame, legalTargetsFor } from '../ui/board.js';
import { esc, icon, toast } from '../ui/dom.js';
import { OPENINGS, ECO_GROUPS, lineOf, identify, continuations } from '../data/openings.js';
import { store, markActivity } from '../store.js';
import { play as sfx, moveSound } from '../sound.js';
import { t } from '../i18n/core.js';

export async function mount(root) {
  const g = new Chess();
  let board, trainer = null, flipped = false, q = '', disposed = false, timer = null;
  const done = () => store.get('openingsDone') || {};
  const idOf = (o) => o[0] + ':' + o[2];

  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('Learn')}</div><h1>${t('Opening explorer')}</h1><p>${t('Play moves on the board to see which opening you are in and what usually comes next — or pick a line and practise it.')}</p></div></div>
    <div class="play-layout">
      <section><div class="board-wrap"><div id="board"></div></div>
        <div class="row" style="justify-content:center;margin-top:12px;gap:10px"><button class="btn icon-btn" id="back" type="button" aria-label="${t('Take back')}">${icon('undo', 18)}</button><button class="btn" id="reset" type="button">${icon('refresh', 18)} ${t('Start position')}</button><button class="btn icon-btn" id="flip" type="button" aria-label="${t('Flip board')}">${icon('flip', 18)}</button></div></section>
      <aside class="side-panel">
        <div class="card" id="info"></div>
        <div class="card"><h3>${t('Browse openings')}</h3><input type="search" id="q" placeholder="${t('Search by name, ECO code or moves')}" class="wide" aria-label="${t('Search openings')}"><div class="opening-list" id="olist"></div></div>
      </aside>
    </div>`;
  const $ = (s) => root.querySelector(s);

  board = new BoardView($('#board'), { orientation: 'w', canSelect: (sq) => !!g.get(sq) && g.get(sq).color === g.turn() && (!trainer || g.turn() === trainer.side), legalTargets: (sq) => legalTargetsFor(g, sq), onMove });
  board.setPosition(piecesFromGame(g));

  function onMove({ from, to, promotion }) {
    if (trainer) {
      if (g.turn() !== trainer.side) return false;
      const probe = new Chess(g.fen()); const mv = probe.move({ from, to, promotion });
      if (!mv) return false;
      const want = trainer.line[g.history().length];
      if (mv.san !== want) { toast(t('Not the book move here. Try again or press Hint.'), 'bad'); sfx('lose'); return false; }
    }
    const mv = g.move({ from, to, promotion }); if (!mv) return false;
    show(mv); if (trainer) setTimeout(trainerStep, 450); return true;
  }
  function show(mv) {
    const h = g.history({ verbose: true });
    board.setPosition(piecesFromGame(g), h.length ? { from: h.at(-1).from, to: h.at(-1).to } : null); board.setCheck(g.checkSquare()); board.setArrows([]);
    if (mv) moveSound(mv, g); render();
  }
  function trainerStep() {
    if (disposed || !trainer) return;
    const n = g.history().length;
    if (n >= trainer.line.length) { complete(); return; }
    if (g.turn() !== trainer.side) { const mv = g.move(trainer.line[n]); if (mv) { show(mv); if (g.history().length >= trainer.line.length) complete(); } }
  }
  async function complete() {
    const o = trainer.opening; trainer = null; sfx('win');
    await store.update('openingsDone', (d) => { d[idOf(o)] = new Date().toISOString(); }); markActivity?.();
    toast(t('Line learned: {name}', { name: o[1] }), 'good'); render();
  }
  function start(o, side) {
    g.load?.('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); trainer = { opening: o, line: lineOf(o), side };
    flipped = side === 'b'; board.setOrientation(flipped ? 'b' : 'w'); show(null); if (g.turn() !== side) setTimeout(trainerStep, 500);
  }
  function reset() { trainer = null; g.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); show(null); }

  function render() {
    const sans = g.history(); const id = identify(sans);
    if (trainer) {
      const n = sans.length, total = trainer.line.length;
      $('#info').innerHTML = `<div class="eyebrow">${t('Practising')}</div><h3>${esc(trainer.opening[1])} <span class="muted">${trainer.opening[0]}</span></h3><div class="progress" style="margin:10px 0"><i style="width:${Math.round(100 * n / total)}%"></i></div>
        <p class="muted">${g.turn() === trainer.side ? t('Your move — play the book move for {side}.', { side: trainer.side === 'w' ? t('White') : t('Black') }) : t('Opponent plays…')}</p>
        <div class="btn-row"><button class="btn" id="hint" type="button">${icon('bulb', 18)} ${t('Hint')}</button><button class="btn ghost" id="stop" type="button">${t('Stop practising')}</button></div>`;
      $('#hint').onclick = () => { const want = trainer.line[g.history().length]; const probe = new Chess(g.fen()); const mv = probe.move(want); if (mv) board.setArrows([{ from: mv.from, to: mv.to, color: 'good' }]); toast(want); };
      $('#stop').onclick = () => { trainer = null; render(); };
      return;
    }
    const next = continuations(sans);
    $('#info').innerHTML = `${id ? `<div class="eyebrow">${id.opening[0]}</div><h3>${esc(id.opening[1])}</h3>${id.opening[3] ? `<p class="muted">${esc(t(id.opening[3]))}</p>` : ''}<div class="row wrap"><button class="btn primary sm" id="p-w" type="button">${t('Practise as White')}</button><button class="btn sm" id="p-b" type="button">${t('Practise as Black')}</button></div>` : `<h3>${sans.length ? t('Out of book') : t('Starting position')}</h3><p class="muted">${sans.length ? t('This move order is not in the opening database.') : t('Play a first move, or choose an opening on the right.')}</p>`}
      ${next.length ? `<h4 style="margin-top:14px">${t('Book moves')}</h4><div class="book-moves">${next.map((c) => `<button type="button" class="chip hoverable" data-m="${esc(c.move)}">${esc(c.move)} <span class="muted">${c.count > 1 ? c.count + ' ' + t('lines') : esc(c.openings[0][1])}</span></button>`).join('')}</div>` : ''}`;
    $('#info').querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { const mv = g.move(b.dataset.m); if (mv) show(mv); }; });
    if (id) { $('#p-w').onclick = () => start(id.opening, 'w'); $('#p-b').onclick = () => start(id.opening, 'b'); }
    drawList();
  }
  function drawList() {
    const f = q.trim().toLowerCase();
    const items = OPENINGS.filter((o) => !f || o[1].toLowerCase().includes(f) || o[0].toLowerCase() === f || o[2].toLowerCase().includes(f));
    const d = done();
    const groups = {}; for (const o of items) (groups[o[0][0]] ||= []).push(o);
    $('#olist').innerHTML = Object.entries(groups).map(([k, list]) => `<div class="og"><div class="og-h">${k} · ${t(ECO_GROUPS[k])}</div>${list.map((o) => `<button type="button" class="og-i" data-o="${OPENINGS.indexOf(o)}"><span><b>${esc(o[1])}</b><small class="muted">${o[0]} · ${esc(o[2])}</small></span>${d[idOf(o)] ? icon('check', 14, 'ok') : ''}</button>`).join('')}</div>`).join('') || `<p class="muted">${t('Nothing found.')}</p>`;
    $('#olist').querySelectorAll('.og-i').forEach((b) => { b.onclick = () => { const o = OPENINGS[+b.dataset.o]; trainer = null; g.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); for (const m of lineOf(o)) g.move(m); show(null); }; });
  }
  $('#q').oninput = (e) => { q = e.target.value; drawList(); };
  $('#back').onclick = () => { if (trainer) return; g.undo(); show(null); };
  $('#reset').onclick = reset; $('#flip').onclick = () => { flipped = !flipped; board.setOrientation(flipped ? 'b' : 'w'); };
  render();
  return () => { disposed = true; clearTimeout(timer); board?.destroy(); };
}
