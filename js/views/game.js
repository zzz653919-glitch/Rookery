// Live game page: online games (as a player or a spectator), private-room lobby, clocks, chat, draw offers, rematch, PGN.
import { Chess } from '../chess/rules.js';
import { BoardView, piecesFromGame, legalTargetsFor } from '../ui/board.js';
import { pieceSvg, PIECE_VALUES } from '../ui/pieces.js';
import { esc, icon, modal, confirmDialog, toast, fmtClock, emptyState, loader } from '../ui/dom.js';
import { avatarHtml, flag, ratingText } from '../ui/user.js';
import { play as sfx, moveSound } from '../sound.js';
import { t, tn } from '../i18n/core.js';
import { net, get, post, ApiError } from '../net.js';
import { watchGame, onGame, onChat, sendSocket } from '../realtime.js';
import { ensureSignedIn } from '../auth-ui.js';

const REASONS = {
  checkmate: 'checkmate', resignation: 'resignation', time: 'time', agreement: 'agreement', stalemate: 'stalemate', 'insufficient material': 'insufficient material',
  'threefold repetition': 'threefold repetition', 'fifty-move rule': 'fifty-move rule', aborted: 'aborted', expired: 'expired', banned: 'banned', 'timeout vs insufficient material': 'timeout vs insufficient material',
};
export const resultText = (g) => {
  if (g.status === 'aborted') return t('Game aborted');
  const why = REASONS[g.reason] ? ' · ' + t(REASONS[g.reason]) : '';
  if (g.result === '1/2-1/2') return t('Draw') + why;
  return (g.result === '1-0' ? t('White wins') : t('Black wins')) + why;
};
export const tcLabel = (g) => `${g.base >= 60 ? g.base / 60 : g.base + 's'}${g.base >= 60 ? '' : ''}+${g.inc}`.replace(/^(\d+)\+/, '$1+');

export async function mount(root, { params, navigate }) {
  if (!net.available) { root.innerHTML = emptyState({ emoji: '📡', title: t('Online play needs the Rookery server'), body: t('This copy of Rookery runs without the server, so games against other people are not available. Play the computer instead.'), actionHtml: `<a class="btn primary" href="#/play/computer">${t('Play the computer')}</a>` }); return; }
  const id = params.id;
  root.innerHTML = loader();
  let state;
  try { state = await get('/api/games/' + encodeURIComponent(id)); }
  catch (e) { root.innerHTML = emptyState({ emoji: '🔎', title: t('Game not found'), body: t(e.message), actionHtml: `<a class="btn primary" href="#/play">${t('Play')}</a>` }); return; }

  let g = replay(state.moves), board = null, review = null, flipped = false, recvAt = performance.now(), disposed = false, tickTimer = null, lastFetch = 0, chat = [], sending = false;
  const myColor = () => state.you;
  const orientation = () => (flipped ? (myColor() === 'b' ? 'w' : 'b') : (myColor() || 'w'));

  function replay(moves) { const c = new Chess(); for (const m of moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }); return c; }
  const opp = (c) => (c === 'w' ? 'b' : 'w');

  // ---------------------------------------------------------------- layout
  root.innerHTML = `
    <div class="page-head compact">
      <div><div class="eyebrow" id="g-eyebrow"></div><h1 id="g-title"></h1></div>
      <div class="btn-row" id="g-head-actions"></div>
    </div>
    <div class="play-layout">
      <section aria-label="${t('Game board')}">
        <div class="player-bar" id="bar-top"></div>
        <div class="board-wrap"><div id="board"></div></div>
        <div class="player-bar" id="bar-bot"></div>
      </section>
      <aside class="side-panel">
        <div class="card" id="lobby" hidden></div>
        <div class="card">
          <div class="status-line" id="status" aria-live="polite"></div>
          <div id="banner"></div>
          <div class="notice" id="review-note" hidden style="margin:8px 0">${t('Viewing an earlier position.')} <button class="btn sm" id="live-btn" type="button">${t('Back to game')}</button></div>
          <div class="moves" id="moves" aria-label="${t('Move list')}"></div>
          <div class="empty" id="moves-empty" style="padding:22px;margin-top:6px">${t('No moves yet.')}</div>
        </div>
        <div class="card"><div class="grid cols-2" style="gap:10px" id="controls"></div></div>
        <div class="card chat" id="chat-card" hidden>
          <h3>${t('Chat')}</h3>
          <div class="chat-log" id="chat-log" aria-live="polite"></div>
          <form class="row" id="chat-form"><input type="text" id="chat-in" maxlength="200" placeholder="${t('Say something kind…')}" autocomplete="off" aria-label="${t('Message')}"><button class="btn icon-btn" type="submit" aria-label="${t('Send')}">${icon('send', 18)}</button></form>
        </div>
      </aside>
    </div>`;
  const $ = (s) => root.querySelector(s);

  board = new BoardView($('#board'), {
    orientation: orientation(),
    canSelect: (sq) => { if (state.status !== 'active' || review !== null || !myColor()) return false; const p = g.get(sq); return !!p && p.color === myColor() && g.turn() === myColor(); },
    legalTargets: (sq) => legalTargetsFor(g, sq),
    onMove: (m) => onHumanMove(m),
  });
  board.setPosition(piecesFromGame(g), lastMove(g));

  function lastMove(game) { const h = game.history({ verbose: true }); return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null; }

  // ---------------------------------------------------------------- moves
  async function onHumanMove({ from, to, promotion }) {
    if (state.status !== 'active' || g.turn() !== myColor()) return false;
    const probe = g.move({ from, to, promotion });
    if (!probe) return false;
    const uci = from + to + (probe.promotion || '');
    sending = true;
    showPosition(probe);
    send('move', { move: uci }).catch((e) => { toast(t(e.message || 'Move failed'), 'bad'); resync(); }).finally(() => { sending = false; });
    return true;
  }
  async function send(kind, extra = {}) {
    // WebSocket first (lowest latency); plain HTTP when there is no socket
    const ws = kind === 'move' ? { t: 'move', game: id, move: extra.move } : kind === 'resign' ? { t: 'resign', game: id } : kind === 'draw' ? { t: 'draw', game: id, action: extra.action } : null;
    if (ws) { try { await sendSocket(ws); return; } catch (e) { if (e.message !== 'no socket' && e.message !== 'timeout' && e.message !== 'Connection lost.') throw e; } }
    const path = { move: '/move', resign: '/resign', abort: '/abort', draw: '/draw' }[kind];
    const ns = await post('/api/games/' + id + path, kind === 'move' ? { move: extra.move } : kind === 'draw' ? { action: extra.action } : {});
    accept(ns);
  }
  function resync() { g = replay(state.moves); board.setPosition(piecesFromGame(g), lastMove(g)); board.setCheck(g.checkSquare()); refreshAll(); }

  function showPosition(mv) {
    review = null; $('#review-note').hidden = true;
    board.setPosition(piecesFromGame(g), lastMove(g));
    board.setCheck(g.checkSquare());
    board.setArrows([]);
    if (mv) moveSound(mv, g);
    refreshAll();
  }

  // a new state from the server (push or poll)
  function accept(ns) {
    if (disposed || ns.id !== id || ns.version < state.version) return;
    const prev = state;
    state = { ...ns, you: ns.you ?? prev.you };
    recvAt = performance.now();
    const same = prev.moves.length <= ns.moves.length && prev.moves.every((m, i) => m === ns.moves[i]);
    if (same && ns.moves.length === prev.moves.length + 1 && g.history().length === prev.moves.length) {
      const m = ns.moves.at(-1); const mv = g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      if (mv) { showPosition(mv); } else resync();
    } else if (same && ns.moves.length === g.history().length) { refreshAll(); }
    else { g = replay(ns.moves); review = null; board.setPosition(piecesFromGame(g), lastMove(g)); board.setCheck(g.checkSquare()); refreshAll(); }
    if (prev.status === 'active' && ns.status !== 'active') { sfx(ns.result === '1/2-1/2' ? 'draw' : ns.status === 'aborted' ? 'move' : (ns.you && ((ns.result === '1-0') === (ns.you === 'w')) ? 'win' : ns.you ? 'lose' : 'draw')); loadChat(); }
    if (prev.status === 'waiting' && ns.status === 'active') sfx('start');
    if (!prev.drawOffer && ns.drawOffer && ns.drawOffer !== myColor() && myColor()) sfx('start');
  }

  // ---------------------------------------------------------------- rendering
  const clockOf = (c) => {
    let v = state.clock[c];
    if (state.status === 'active' && state.clock.running && g.turn() === c) v -= performance.now() - recvAt;
    return Math.max(0, v);
  };
  function capturedHtml(color) {
    const cap = g.captured()[color]; // pieces captured BY this colour
    const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
    const sorted = [...cap].sort((a, b) => order[a] - order[b]);
    const other = opp(color);
    const adv = sorted.reduce((s, p) => s + PIECE_VALUES[p], 0) - g.captured()[other].reduce((s, p) => s + PIECE_VALUES[p], 0);
    return `<div class="captured" aria-label="${t('Captured pieces')}">${sorted.map((p) => `<span class="cp">${pieceSvg(p, other)}</span>`).join('')}${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}</div>`;
  }
  function barHtml(color) {
    const p = state.players[color];
    const delta = state.ratingChange && state.status === 'finished' ? state.ratingChange[color] : null;
    const name = p ? `<a class="ulink" href="#/profile/${encodeURIComponent(p.username)}">${esc(p.username)}</a>` : `<span class="muted">${t('Waiting for opponent…')}</span>`;
    const sub = p ? `${flag(p.country)} ${ratingText(p.rating, p.provisional)}${delta != null ? ` <b class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}</b>` : ''} · ${color === 'w' ? t('White') : t('Black')}` : (color === 'w' ? t('White') : t('Black'));
    const running = state.status === 'active' && state.clock.running && g.turn() === color;
    return `<div class="avatar">${p ? avatarHtml(p, 40) : icon('user', 20)}</div>
      <div><div class="name">${name}</div><div class="sub">${sub}</div>${capturedHtml(color)}</div>
      <div class="clock ${running ? 'active' : ''}" data-clock="${color}">${fmtClock(clockOf(color))}</div>`;
  }
  function refreshBars() {
    const top = orientation() === 'w' ? 'b' : 'w', bot = opp(top);
    $('#bar-top').innerHTML = barHtml(top); $('#bar-bot').innerHTML = barHtml(bot);
  }
  function tick() {
    if (disposed) return;
    for (const el of root.querySelectorAll('[data-clock]')) {
      const c = el.dataset.clock, v = clockOf(c);
      el.textContent = fmtClock(v);
      el.classList.toggle('active', state.status === 'active' && state.clock.running && g.turn() === c);
      el.classList.toggle('low', v < 20000 && state.status === 'active');
      if (v <= 0 && state.status === 'active' && state.clock.running && g.turn() === c && performance.now() - lastFetch > 1500) { lastFetch = performance.now(); get('/api/games/' + id).then(accept).catch(() => {}); }
    }
  }
  function refreshMoves() {
    const hist = g.history();
    $('#moves-empty').hidden = hist.length > 0;
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const cell = (ply) => (hist[ply] ? `<button type="button" data-ply="${ply}" class="${(review === null ? hist.length - 1 : review) === ply ? 'cur' : ''}">${esc(hist[ply])}</button>` : '<span></span>');
      html += `<span class="num">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}`;
    }
    const el = $('#moves'); el.innerHTML = html;
    el.querySelectorAll('button').forEach((b) => { b.onclick = () => { const ply = +b.dataset.ply; setReview(ply === hist.length - 1 ? null : ply); }; });
    el.scrollTop = el.scrollHeight;
  }
  function setReview(ply) {
    review = ply; $('#review-note').hidden = ply === null;
    const view = ply === null ? g : replay(state.moves.slice(0, ply + 1));
    board.setPosition(piecesFromGame(view), lastMove(view)); board.setCheck(view.checkSquare()); board.setArrows([]);
    refreshMoves();
  }
  function statusHtml() {
    if (state.status === 'waiting') return t('Waiting for your opponent to join…');
    if (state.status === 'finished' || state.status === 'aborted') return `<b>${esc(resultText(state))}</b>`;
    if (!myColor()) return `${icon('eye', 16)} ${t('You are watching')} · ${g.turn() === 'w' ? t('White to move') : t('Black to move')}`;
    if (g.turn() === myColor()) return g.inCheck() ? t('Check! Your move.') : t('Your move');
    return t("Opponent's move");
  }
  function refreshStatus() {
    $('#status').innerHTML = statusHtml();
    const mine = myColor();
    const p = state.players;
    $('#g-eyebrow').textContent = `${state.kind === 'rated' ? t('Rated') : t('Casual')} · ${tcLabel(state)} · ${t(state.category.charAt(0).toUpperCase() + state.category.slice(1))}`;
    $('#g-title').textContent = p.w && p.b ? `${p.w.username} ${t('vs')} ${p.b.username}` : t('Private game');
    document.title = `${$('#g-title').textContent} · Rookery`;
    const banner = $('#banner'); banner.innerHTML = '';
    if (state.status === 'active' && mine && state.drawOffer && state.drawOffer !== mine) {
      banner.innerHTML = `<div class="notice info row spread" style="margin:8px 0"><span>${t('Your opponent offers a draw.')}</span><span class="btn-row"><button class="btn sm primary" data-d="accept" type="button">${t('Accept')}</button><button class="btn sm" data-d="decline" type="button">${t('Decline')}</button></span></div>`;
      banner.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => send('draw', { action: b.dataset.d }).catch((e) => toast(t(e.message), 'bad')); });
    } else if (state.status === 'active' && mine && state.drawOffer === mine) banner.innerHTML = `<div class="notice" style="margin:8px 0">${t('Draw offered — waiting for an answer.')}</div>`;
    if ((state.status === 'finished') && state.ratingChange && mine) { const d = state.ratingChange[mine]; banner.innerHTML += `<div class="notice ${d >= 0 ? 'info' : ''}" style="margin:8px 0">${t('Rating change')}: <b>${d >= 0 ? '+' : ''}${d}</b></div>`; }
  }
  function refreshLobby() {
    const el = $('#lobby');
    if (state.status !== 'waiting') { el.hidden = true; return; }
    el.hidden = false;
    const mine = myColor();
    const link = location.href.split('#')[0] + '#/game/' + id;
    if (mine) {
      el.innerHTML = `<h3>${t('Invite a friend')}</h3><p class="muted">${t('Share this link. The game starts as soon as your friend opens it and signs in.')}</p>
        <div class="row"><input type="text" readonly id="lobby-link" value="${esc(link)}" aria-label="${t('Game link')}" style="flex:1"><button class="btn primary" id="copy-link" type="button">${icon('copy', 18)} ${t('Copy')}</button></div>
        <div class="row" style="margin-top:12px"><span class="spinner"></span><span class="muted">${t('Waiting for your opponent…')}</span></div>`;
      el.querySelector('#copy-link').onclick = async () => { try { await navigator.clipboard.writeText(link); toast(t('Link copied'), 'good'); } catch { el.querySelector('#lobby-link').select(); } };
      el.querySelector('#lobby-link').onfocus = (e) => e.target.select();
    } else {
      const host = state.players.w || state.players.b;
      el.innerHTML = `<h3>${t('You are invited')}</h3><p class="muted">${host ? t('{name} invited you to a {tc} game.', { name: host.username, tc: tcLabel(state) }) : ''}</p>
        <button class="btn primary lg block" id="join-btn" type="button">${icon('play', 18)} ${net.user ? t('Join the game') : t('Sign in to join')}</button>`;
      el.querySelector('#join-btn').onclick = async () => {
        if (!(await ensureSignedIn('register'))) return;
        try { accept({ ...(await post('/api/games/' + id + '/join', {})) }); } catch (e) { toast(t(e.message), 'bad'); }
      };
    }
  }
  function refreshControls() {
    const el = $('#controls'); const mine = myColor(); const act = state.status === 'active';
    const done = state.status === 'finished' || state.status === 'aborted';
    const btns = [];
    const add = (idn, ic, label, cls = '', full = false) => btns.push(`<button class="btn ${cls}" id="${idn}" type="button" ${full ? 'style="grid-column:1/-1"' : ''}>${icon(ic, 18)} ${label}</button>`);
    if (act && mine) { state.moves.length < 2 ? add('c-abort', 'x', t('Abort')) : add('c-resign', 'flag', t('Resign')); add('c-draw', 'handshake', t('Offer draw')); }
    add('c-flip', 'flip', t('Flip board'));
    if (done && mine && state.status === 'finished') add('c-rematch', 'refresh', t('Rematch'), 'primary');
    if (done) { add('c-pgn', 'copy', t('Copy PGN')); add('c-analyze', 'target', t('Analyze')); }
    if (done && mine && state.status === 'finished') add('c-report', 'flag', t('Report opponent'), 'ghost');
    if (done && mine) btns.push(`<a class="btn" href="#/play/online" style="grid-column:1/-1">${icon('play', 18)} ${t('New opponent')}</a>`);
    el.innerHTML = btns.join('');
    const on = (idn, fn) => { const b = el.querySelector('#' + idn); if (b) b.onclick = fn; };
    on('c-flip', () => { flipped = !flipped; board.setOrientation(orientation()); refreshBars(); });
    on('c-abort', async () => { try { await send('abort'); } catch (e) { toast(t(e.message), 'bad'); } });
    on('c-resign', async () => { if (await confirmDialog({ title: t('Resign this game?'), body: t('You will lose the game.'), ok: t('Resign'), cancel: t('Cancel'), danger: true })) send('resign').catch((e) => toast(t(e.message), 'bad')); });
    on('c-draw', () => send('draw', { action: 'offer' }).then(() => toast(t('Draw offered'))).catch((e) => toast(t(e.message), 'bad')));
    on('c-rematch', async () => { try { const r = await post('/api/games/' + id + '/rematch', {}); navigate('/game/' + r.id); } catch (e) { toast(t(e.message), 'bad'); } });
    on('c-pgn', copyPgn);
    on('c-analyze', () => { try { sessionStorage.setItem('rookery:analysis-pgn', state.pgn || ''); } catch { /* ignore */ } navigate('/analysis'); });
    on('c-report', report);
  }
  async function copyPgn() {
    const pgn = state.pgn || g.pgn();
    try { await navigator.clipboard.writeText(pgn); toast(t('PGN copied to clipboard'), 'good'); }
    catch { const m = modal(`<h2>PGN</h2><textarea readonly id="pgn-text">${esc(pgn)}</textarea><div class="actions"><button class="btn primary" data-x>${t('Close')}</button></div>`); m.el.querySelector('#pgn-text').select(); m.el.querySelector('[data-x]').onclick = () => m.close(); }
  }
  function report() {
    const them = state.players[opp(myColor())]; if (!them) return;
    const m = modal(`<h2>${t('Report {name}', { name: esc(them.username) })}</h2>
      <label class="field"><span>${t('Reason')}</span><select id="rp-reason"><option value="cheating">${t('Cheating')}</option><option value="abuse">${t('Abusive behaviour')}</option><option value="spam">${t('Spam')}</option><option value="other">${t('Other')}</option></select></label>
      <label class="field"><span>${t('Details (optional)')}</span><textarea id="rp-detail" maxlength="500" style="min-height:90px;font-family:inherit"></textarea></label>
      <div class="actions"><button class="btn primary" id="rp-go" type="button">${t('Send report')}</button><button class="btn ghost" data-x type="button">${t('Cancel')}</button></div>`);
    m.el.querySelector('[data-x]').onclick = () => m.close();
    m.el.querySelector('#rp-go').onclick = async () => { try { await post('/api/reports', { username: them.username, reason: m.el.querySelector('#rp-reason').value, detail: m.el.querySelector('#rp-detail').value, gameId: id }); toast(t('Thank you — a moderator will look at it.'), 'good'); m.close(); } catch (e) { toast(t(e.message), 'bad'); } };
  }
  function refreshAll() {
    refreshBars(); refreshStatus(); refreshLobby(); refreshControls(); refreshMoves();
    board.setCheck(review === null ? g.checkSquare() : null);
    $('#chat-card').hidden = !(myColor() && state.players.w && state.players.b);
    if (state.status === 'waiting' && myColor() === undefined) { /* spectator of a waiting room */ }
  }

  // ---------------------------------------------------------------- chat
  function renderChat() {
    const log = $('#chat-log'); if (!log) return;
    log.innerHTML = chat.length ? chat.map((m) => `<div class="msg ${m.username === net.user?.username ? 'mine' : ''}"><b>${esc(m.username)}</b> ${esc(m.text)}</div>`).join('') : `<div class="muted small">${t('No messages yet.')}</div>`;
    log.scrollTop = log.scrollHeight;
  }
  async function loadChat() { if (!myColor()) return; try { chat = (await get('/api/games/' + id + '/chat')).messages; renderChat(); } catch { /* not a player */ } }
  $('#chat-form').onsubmit = async (e) => {
    e.preventDefault(); const inp = $('#chat-in'); const text = inp.value.trim(); if (!text) return;
    inp.value = '';
    try { await post('/api/games/' + id + '/chat', { text }); } catch (ex) { toast(t(ex.message), 'bad'); inp.value = text; }
  };

  // ---------------------------------------------------------------- wiring
  $('#live-btn').onclick = () => setReview(null);
  const offGame = onGame((ns) => accept(ns));
  const offChat = onChat((m) => { if (m.game === id && !chat.some((c) => c.id === m.msg.id)) { chat.push(m.msg); renderChat(); if (m.msg.username !== net.user?.username) sfx('move'); } });
  const unwatch = watchGame(id);
  tickTimer = setInterval(tick, 100);
  const keys = (e) => { if (e.target.matches('input,textarea,select')) return; const h = g.history(); const cur = review === null ? h.length - 1 : review; if (e.key === 'ArrowLeft' && cur >= 0) { e.preventDefault(); setReview(cur - 1 < 0 ? -1 : cur - 1); } else if (e.key === 'ArrowRight' && review !== null) { e.preventDefault(); setReview(review + 1 >= h.length - 1 ? null : review + 1); } };
  document.addEventListener('keydown', keys);
  refreshAll(); loadChat(); renderChat();

  return () => { disposed = true; clearInterval(tickTimer); offGame(); offChat(); unwatch(); document.removeEventListener('keydown', keys); board?.destroy(); };
}
