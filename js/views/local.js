// Two players, one device: pass-and-play with optional clocks, undo, auto-flip and PGN.
import { Chess } from '../chess/rules.js';
import { BoardView, piecesFromGame, legalTargetsFor } from '../ui/board.js';
import { pieceSvg, PIECE_VALUES } from '../ui/pieces.js';
import { esc, icon, modal, confirmDialog, toast, fmtClock } from '../ui/dom.js';
import { play as sfx, moveSound } from '../sound.js';
import { timeControls } from '../content.js';
import { store } from '../store.js';
import { t } from '../i18n/core.js';
import { resultText } from './game.js';

export async function mount(root, { navigate }) {
  const saved = store.get('settings').local || {};
  let setup = { time: timeControls().some((x) => x.id === saved.time) ? saved.time : 'none', flip: saved.flip !== false, names: saved.names || ['', ''] };
  let g, board, clock = null, timer = null, over = false, result = null, review = null, disposed = false;

  function renderSetup() {
    clearInterval(timer); board?.destroy(); board = null;
    root.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">${t('Play')}</div><h1>${t('Two players, one device')}</h1><p>${t('Hand the board back and forth. No account and no internet needed.')}</p></div></div>
      <div class="card setup-card stack">
        <div><div class="field-label">${t('Time control')}</div><div class="segmented" id="tc">${timeControls().map((x) => `<button type="button" data-v="${x.id}" aria-pressed="${setup.time === x.id}">${esc(t(x.label))}</button>`).join('')}</div></div>
        <div class="setting-row"><div><b>${t('Turn the board after every move')}</b><small>${t('Handy when you sit on opposite sides of a phone or tablet.')}</small></div><label class="switch"><input type="checkbox" id="flip" ${setup.flip ? 'checked' : ''}><span></span></label></div>
        <div class="grid cols-2"><label class="field"><span>${t('White player')}</span><input type="text" id="n-w" maxlength="20" value="${esc(setup.names[0])}" placeholder="${t('White')}"></label><label class="field"><span>${t('Black player')}</span><input type="text" id="n-b" maxlength="20" value="${esc(setup.names[1])}" placeholder="${t('Black')}"></label></div>
        <button class="btn primary lg" id="start" type="button">${icon('play', 20)} ${t('Start game')}</button>
      </div>`;
    root.querySelectorAll('#tc button').forEach((b) => { b.onclick = () => { setup.time = b.dataset.v; root.querySelectorAll('#tc button').forEach((x) => x.setAttribute('aria-pressed', x === b)); }; });
    root.querySelector('#flip').onchange = (e) => { setup.flip = e.target.checked; };
    root.querySelector('#start').onclick = () => { setup.names = [root.querySelector('#n-w').value.trim(), root.querySelector('#n-b').value.trim()]; store.update('settings', (s) => { s.local = { ...setup }; }); begin(); };
  }
  const name = (c) => setup.names[c === 'w' ? 0 : 1] || (c === 'w' ? t('White') : t('Black'));

  function begin() {
    g = new Chess(); over = false; result = null; review = null;
    const tc = timeControls().find((x) => x.id === setup.time) || timeControls()[0];
    clock = tc.base ? { w: tc.base * 1000, b: tc.base * 1000, running: 'w', last: performance.now(), inc: tc.inc * 1000 } : null;
    draw();
    sfx('start');
    if (clock) timer = setInterval(tick, 100);
  }
  function tick() {
    if (!clock || over || disposed) return;
    const now = performance.now(); clock[clock.running] -= now - clock.last; clock.last = now;
    if (clock[clock.running] <= 0) { clock[clock.running] = 0; const loser = clock.running; finish(loser === 'w' ? '0-1' : '1-0', 'time'); }
    root.querySelectorAll('[data-clock]').forEach((el) => { const c = el.dataset.clock; el.textContent = fmtClock(clock[c]); el.classList.toggle('active', clock.running === c && !over); el.classList.toggle('low', clock[c] < 20000); });
  }
  const capt = (color) => { const other = color === 'w' ? 'b' : 'w'; const order = { q: 0, r: 1, b: 2, n: 3, p: 4 }; const s = [...g.captured()[color]].sort((a, b) => order[a] - order[b]); const adv = s.reduce((x, p) => x + PIECE_VALUES[p], 0) - g.captured()[other].reduce((x, p) => x + PIECE_VALUES[p], 0); return `<div class="captured">${s.map((p) => `<span class="cp">${pieceSvg(p, other)}</span>`).join('')}${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}</div>`; };
  const bar = (c) => `<div class="avatar">${icon('user', 20)}</div><div><div class="name">${esc(name(c))}</div><div class="sub">${c === 'w' ? t('White') : t('Black')}</div>${capt(c)}</div>${clock ? `<div class="clock" data-clock="${c}">${fmtClock(clock[c])}</div>` : ''}`;

  function draw() {
    root.innerHTML = `
      <div class="page-head compact"><div><div class="eyebrow">${t('Two players, one device')}</div><h1>${esc(name('w'))} ${t('vs')} ${esc(name('b'))}</h1></div><div class="btn-row"><button class="btn" id="new" type="button">${icon('refresh', 18)} ${t('New game')}</button></div></div>
      <div class="play-layout">
        <section><div class="player-bar" id="bar-top"></div><div class="board-wrap"><div id="board"></div></div><div class="player-bar" id="bar-bot"></div></section>
        <aside class="side-panel">
          <div class="card"><div class="status-line" id="status" aria-live="polite"></div><div class="notice" id="review-note" hidden style="margin:8px 0">${t('Viewing an earlier position.')} <button class="btn sm" id="live-btn" type="button">${t('Back to game')}</button></div><div class="moves" id="moves"></div><div class="empty" id="moves-empty" style="padding:22px;margin-top:6px">${t('Make your first move. Click a piece, then a highlighted square — or drag it.')}</div></div>
          <div class="card"><div class="grid cols-2" style="gap:10px">
            <button class="btn" id="undo" type="button">${icon('undo', 18)} ${t('Undo')}</button><button class="btn" id="flip" type="button">${icon('flip', 18)} ${t('Flip board')}</button>
            <button class="btn" id="res-w" type="button">${icon('flag', 18)} ${t('White resigns')}</button><button class="btn" id="res-b" type="button">${icon('flag', 18)} ${t('Black resigns')}</button>
            <button class="btn" id="draw" type="button">${icon('handshake', 18)} ${t('Draw by agreement')}</button><button class="btn" id="pgn" type="button">${icon('copy', 18)} ${t('Copy PGN')}</button>
          </div></div>
        </aside>
      </div>`;
    board = new BoardView(root.querySelector('#board'), { orientation: 'w', canSelect: (sq) => !over && review === null && g.get(sq)?.color === g.turn(), legalTargets: (sq) => legalTargetsFor(g, sq), onMove });
    board.setPosition(piecesFromGame(g));
    const $ = (s) => root.querySelector(s);
    $('#new').onclick = async () => { if (!over && g.history().length > 1 && !(await confirmDialog({ title: t('Leave this game?'), body: t('The game in progress will be abandoned.'), ok: t('Leave game'), cancel: t('Cancel') }))) return; renderSetup(); };
    $('#undo').onclick = () => { if (!g.history().length) return; const was = over; if (was) { over = false; result = null; if (clock) { clock.running = g.turn(); clock.last = performance.now(); } } const u = g.undo(); if (clock && !was) { clock.running = g.turn(); clock.last = performance.now(); } sync(u ? null : null); };
    $('#flip').onclick = () => { board.flip(); refresh(); };
    $('#res-w').onclick = () => !over && finish('0-1', 'resignation'); $('#res-b').onclick = () => !over && finish('1-0', 'resignation');
    $('#draw').onclick = async () => { if (over) return; if (await confirmDialog({ title: t('Agree to a draw?'), body: t('Both players accept the draw.'), ok: t('Draw'), cancel: t('Cancel') })) finish('1/2-1/2', 'agreement'); };
    $('#pgn').onclick = copyPgn;
    $('#live-btn').onclick = () => setReview(null);
    refresh();
  }
  function onMove({ from, to, promotion }) {
    if (over) return false;
    const mv = g.move({ from, to, promotion }); if (!mv) return false;
    if (clock) { const now = performance.now(); clock[clock.running] -= now - clock.last; clock[clock.running] += clock.inc; clock.running = g.turn(); clock.last = now; }
    sync(mv);
    const st = g.status(); if (st.over) finish(st.result, st.reason);
    return true;
  }
  function sync(mv) {
    review = null;
    const h = g.history({ verbose: true }); const l = h.length ? { from: h.at(-1).from, to: h.at(-1).to } : null;
    board.setPosition(piecesFromGame(g), l); board.setCheck(g.checkSquare()); board.setArrows([]);
    if (mv) moveSound(mv, g);
    if (setup.flip && !over) { const want = g.turn(); if (board.orientation !== want) setTimeout(() => { if (!disposed && board) { board.setOrientation(want); refresh(); } }, 450); }
    refresh();
  }
  function finish(res, reason) {
    if (over) return; over = true; result = { result: res, reason }; clearInterval(timer);
    sfx(res === '1/2-1/2' ? 'draw' : 'win'); refresh();
    const m = modal(`<h2>${esc(resultText({ status: 'finished', result: res, reason }))}</h2><p class="muted">${res === '1/2-1/2' ? '' : esc(name(res === '1-0' ? 'w' : 'b')) + ' ' + t('won the game.')}</p><div class="actions"><button class="btn primary" data-n>${t('New game')}</button><button class="btn" data-p>${t('Copy PGN')}</button><button class="btn ghost" data-c>${t('Close')}</button></div>`);
    m.el.querySelector('[data-n]').onclick = () => { m.close(); renderSetup(); }; m.el.querySelector('[data-p]').onclick = copyPgn; m.el.querySelector('[data-c]').onclick = () => m.close();
  }
  function setReview(ply) {
    review = ply; root.querySelector('#review-note').hidden = ply === null;
    const v = new Chess(); if (ply !== null) { for (const m of g.history({ verbose: true }).slice(0, ply + 1)) v.move({ from: m.from, to: m.to, promotion: m.promotion }); }
    const view = ply === null ? g : v; board.setPosition(piecesFromGame(view)); board.setCheck(null); refresh();
  }
  function refresh() {
    const top = board.orientation === 'w' ? 'b' : 'w';
    root.querySelector('#bar-top').innerHTML = bar(top); root.querySelector('#bar-bot').innerHTML = bar(top === 'w' ? 'b' : 'w');
    const hist = g.history(); root.querySelector('#moves-empty').hidden = hist.length > 0;
    let html = ''; for (let i = 0; i < hist.length; i += 2) { const cell = (p) => (hist[p] ? `<button type="button" data-ply="${p}" class="${(review === null ? hist.length - 1 : review) === p ? 'cur' : ''}">${esc(hist[p])}</button>` : '<span></span>'); html += `<span class="num">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}`; }
    const el = root.querySelector('#moves'); el.innerHTML = html; el.querySelectorAll('button').forEach((b) => { b.onclick = () => { const p = +b.dataset.ply; setReview(p === hist.length - 1 ? null : p); }; }); el.scrollTop = el.scrollHeight;
    root.querySelector('#status').innerHTML = over ? `<b>${esc(resultText({ status: 'finished', ...result }))}</b>` : `${g.turn() === 'w' ? t('White to move') : t('Black to move')}${g.inCheck() ? ' · ' + t('Check!') : ''}`;
    if (clock) root.querySelectorAll('[data-clock]').forEach((e) => { e.classList.toggle('active', clock.running === e.dataset.clock && !over); });
  }
  async function copyPgn() { const pgn = g.pgn({ White: name('w'), Black: name('b'), Result: result?.result || '*' }); try { await navigator.clipboard.writeText(pgn); toast(t('PGN copied to clipboard'), 'good'); } catch { const m = modal(`<h2>PGN</h2><textarea readonly id="pgn-text">${esc(pgn)}</textarea><div class="actions"><button class="btn primary" data-x>${t('Close')}</button></div>`); m.el.querySelector('#pgn-text').select(); m.el.querySelector('[data-x]').onclick = () => m.close(); } }

  renderSetup();
  return () => { disposed = true; clearInterval(timer); board?.destroy(); };
}
