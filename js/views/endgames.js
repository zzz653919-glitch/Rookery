// Endgame trainer: play a theoretical endgame against Stockfish until you win it (or hold the draw).
import { Chess } from '../chess/rules.js';
import { BoardView, piecesFromGame, legalTargetsFor } from '../ui/board.js';
import { esc, icon, toast, modal } from '../ui/dom.js';
import { miniBoard } from '../ui/mini.js';
import { ENDGAMES, MAX_MOVES } from '../data/endgames.js';
import { engineClient } from '../engine-client.js';
import { store, markActivity } from '../store.js';
import { play as sfx, moveSound } from '../sound.js';
import { t } from '../i18n/core.js';

const LEVELS = { 1: 'Basic mates', 2: 'Essential endings', 3: 'Classic positions' };

export async function mount(root, { params, navigate }) {
  const sel = ENDGAMES.find((e) => e.id === params.id);
  if (!sel) return list();
  return train(sel);

  function list() {
    const done = store.get('endgames').done;
    root.innerHTML = `<div class="page-head"><div><div class="eyebrow">${t('Learn')}</div><h1>${t('Endgame trainer')}</h1><p>${t('Endgames are won and lost by technique. Play each position against Stockfish until you convert it — or hold the draw.')}</p></div><span class="chip good">${Object.keys(done).length}/${ENDGAMES.length} ${t('completed')}</span></div>
      ${[1, 2, 3].map((lv) => `<h2 style="margin:22px 0 12px">${t(LEVELS[lv])}</h2><div class="grid auto">${ENDGAMES.filter((e) => e.level === lv).map((e) => `<a class="card hover eg-card" href="#/endgames/${e.id}">${miniBoard(e.fen, e.user, 150)}<div><div class="row spread"><b>${esc(t(e.name))}</b>${done[e.id] ? `<span class="chip good">${icon('check', 12)}</span>` : ''}</div><div class="muted small">${e.goal === 'win' ? t('Goal: win') : t('Goal: hold the draw')} · ${e.user === 'w' ? t('You play White') : t('You play Black')}</div></div></a>`).join('')}</div>`).join('')}`;
    return () => {};
  }

  function train(e) {
    let g, board, token = 0, over = false, moves = 0, thinking = false, hintTimer = null, disposed = false;
    const goal = MAX_MOVES[e.goal];
    root.innerHTML = `
      <div class="page-head compact"><div><a class="btn ghost sm" href="#/endgames">${icon('back', 16)} ${t('All endgames')}</a><h1 style="margin-top:10px">${esc(t(e.name))}</h1></div><div class="btn-row"><button class="btn" id="restart" type="button">${icon('refresh', 18)} ${t('Restart')}</button></div></div>
      <div class="play-layout"><section><div class="board-wrap"><div id="board"></div></div></section>
        <aside class="side-panel"><div class="card"><div class="status-line" id="status" aria-live="polite"></div><div class="progress" style="margin:10px 0"><i id="mprog" style="width:0"></i></div><div class="muted small" id="mcount"></div>
          <p style="margin-top:12px"><b>${e.goal === 'win' ? t('Goal: checkmate the opponent') : t('Goal: do not lose — hold the draw')}</b></p><p class="muted">${esc(t(e.tip))}</p></div>
          <div class="card"><div class="grid cols-2" style="gap:10px"><button class="btn" id="hint" type="button">${icon('bulb', 18)} ${t('Hint')}</button><button class="btn" id="flip" type="button">${icon('flip', 18)} ${t('Flip board')}</button></div></div></aside></div>`;
    const $ = (s) => root.querySelector(s);
    function begin() {
      token++; g = new Chess(e.fen); over = false; moves = 0; thinking = false;
      board?.destroy();
      board = new BoardView($('#board'), { orientation: e.user, canSelect: (sq) => !over && !thinking && g.turn() === e.user && g.get(sq)?.color === e.user, legalTargets: (sq) => legalTargetsFor(g, sq), onMove });
      board.setPosition(piecesFromGame(g)); engineClient.newGame().catch(() => {}); update();
      if (g.turn() !== e.user) reply();
    }
    function update() {
      const st = over ? null : g.status();
      $('#mprog').style.width = Math.min(100, 100 * moves / goal) + '%'; $('#mcount').textContent = t('Your moves: {n} of {max}', { n: moves, max: goal });
      $('#status').innerHTML = over ? $('#status').innerHTML : g.inCheck() ? t('Check!') : g.turn() === e.user ? t('Your move') : `<span class="spinner"></span> ${t('Stockfish is thinking')}`;
      void st;
    }
    function onMove({ from, to, promotion }) {
      if (over || thinking || g.turn() !== e.user) return false;
      const mv = g.move({ from, to, promotion }); if (!mv) return false;
      moves++; apply(mv); if (!check()) reply(); return true;
    }
    function apply(mv) { board.setPosition(piecesFromGame(g), { from: mv.from, to: mv.to }); board.setCheck(g.checkSquare()); board.setArrows([]); moveSound(mv, g); update(); }
    function check() {
      const st = g.status();
      if (st.over) {
        const won = st.winner === e.user;
        if (e.goal === 'win') finish(won, won ? t('Checkmate — well done!') : st.result === '1/2-1/2' ? t('Draw (%s). Try again — look out for stalemate and the 50-move rule.').replace('%s', t(st.reason)) : t('You lost this one. Try again.'));
        else finish(st.winner !== (e.user === 'w' ? 'b' : 'w'), st.winner === e.user ? t('You even won it!') : st.winner ? t('You lost. Try again.') : t('Draw secured — well held!'));
        return true;
      }
      if (e.goal === 'hold' && moves >= goal) { finish(true, t('You held the draw for {n} moves — well done!', { n: goal })); return true; }
      if (e.goal === 'win' && moves >= goal) { finish(false, t('Out of moves — the win has to come faster. Try again.')); return true; }
      return false;
    }
    async function reply() {
      thinking = true; update(); const my = ++token;
      try {
        const r = await engineClient.search(g, { level: 8, timeMs: 700 });
        if (my !== token || disposed) return;
        thinking = false;
        if (!r.move) { check(); return; }
        const mv = g.move(r.move); if (!mv) throw new Error('illegal engine move'); apply(mv); check();
      } catch (ex) { if (String(ex.message) !== 'cancelled') { thinking = false; toast(t('The engine could not answer: {error}', { error: ex.message }), 'bad'); } }
    }
    async function finish(ok, text) {
      over = true; thinking = false; $('#status').innerHTML = `<b>${esc(text)}</b>`;
      if (ok) { sfx('win'); await store.update('endgames', (s) => { s.done[e.id] = new Date().toISOString(); }); markActivity?.(); } else sfx('lose');
      const m = modal(`<h2>${ok ? t('Endgame completed!') : t('Not this time')}</h2><p class="muted">${esc(text)}</p><div class="actions"><button class="btn primary" data-r>${t('Try again')}</button>${ok && ENDGAMES[ENDGAMES.indexOf(e) + 1] ? `<button class="btn" data-n>${t('Next endgame')}</button>` : ''}<button class="btn ghost" data-l>${t('All endgames')}</button></div>`);
      m.el.querySelector('[data-r]').onclick = () => { m.close(); begin(); };
      const n = m.el.querySelector('[data-n]'); if (n) n.onclick = () => { m.close(); navigate('/endgames/' + ENDGAMES[ENDGAMES.indexOf(e) + 1].id); };
      m.el.querySelector('[data-l]').onclick = () => { m.close(); navigate('/endgames'); };
    }
    $('#restart').onclick = begin; $('#flip').onclick = () => board.flip();
    $('#hint').onclick = async () => { if (over || thinking || g.turn() !== e.user) return; thinking = true; try { const r = await engineClient.search(g, { timeMs: 800, depth: 16 }); thinking = false; if (r.move) { board.setArrows([{ from: r.move.from, to: r.move.to, color: 'good' }]); $('#status').innerHTML = `${icon('bulb', 16)} ${t('Try {move}', { move: `<b>${esc(r.move.san)}</b>` })}`; } } catch { thinking = false; } };
    begin();
    return () => { disposed = true; token++; engineClient.cancel(); board?.destroy(); };
  }
}
