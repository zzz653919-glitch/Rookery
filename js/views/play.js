// Play against the computer (fully offline).
import { Chess } from '../chess/rules.js';
import { LEVELS as ENGINE_LEVELS, scoreText } from '../chess/engine.js';
import { engineClient } from '../engine-client.js';
import { BoardView, piecesFromGame, legalTargetsFor } from '../ui/board.js';
import { pieceSvg, PIECE_VALUES } from '../ui/pieces.js';
import { esc, icon, modal, confirmDialog, toast, fmtClock } from '../ui/dom.js';
import { store, markActivity } from '../store.js';
import { play as sfx, moveSound } from '../sound.js';
import { checkAchievements } from '../progress.js';
import { levelToEngine } from '../data/levels.js';
import { computerLevels, nearestEnabledLevel, timeControls } from '../content.js';
import { track } from '../telemetry.js';
import { t, th, tn } from '../i18n/core.js';


export async function mount(root) {
  const profile = store.get('profile');
  const saved = store.get('settings').playSetup || {};
  const setup = {
    color: saved.color || 'w',
    level: nearestEnabledLevel(ENGINE_LEVELS, saved.level || levelToEngine(profile.level)),
    time: timeControls().some((x) => x.id === saved.time) ? saved.time : 'none',
    practice: !!saved.practice,
  };

  let g = null;          // Chess
  let board = null;
  let human = 'w';
  let token = 0;         // invalidates in-flight engine searches
  let over = false;
  let thinking = false;
  let clock = null;      // { w, b, running, last, inc }
  let timer = null;
  let reviewPly = null;  // null = live
  let drawOfferPly = -99;
  let disposed = false;
  let startedAt = 0;

  // names / availability can be customised by the admin panel; strength (depth, time) always comes from the engine
  const levelList = computerLevels(ENGINE_LEVELS);
  const lvl = () => levelList.find((l) => l.id === setup.level) || ENGINE_LEVELS[setup.level - 1];

  // ------------------------------------------------------------------ setup
  function renderSetup() {
    cleanupGame();
    root.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">${t('Play')}</div><h1>${t('Play the computer')}</h1>
        <p>${t('The engine runs entirely on this device, so you can play without an internet connection.')}</p></div>
      </div>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,420px);align-items:start" id="setup-grid">
        <div class="card stack">
          <div class="opt-group"><label class="lbl">${t('You play')}</label>
            <div class="segmented" id="seg-color" role="group" aria-label="${t('Your colour')}">
              ${[['w', t('White')], ['b', t('Black')], ['r', t('Random')]].map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${setup.color === v}">${label}</button>`).join('')}
            </div></div>
          <div class="opt-group"><label class="lbl">${t('Difficulty')}</label>
            <div class="level-grid" id="levels">
              ${levelList.map((l) => `<button type="button" class="level-card" data-v="${l.id}" aria-pressed="${setup.level === l.id}"><b>${l.id}. ${esc(t(l.name))}</b><small>${esc(t(l.blurb))}</small></button>`).join('')}
            </div>
            <p class="faint" style="font-size:.82rem;margin:4px 0 0">${t('Levels are relative: each one searches deeper than the one before. They are not official ratings.')}</p>
          </div>
          <div class="opt-group"><label class="lbl">${t('Time control')}</label>
            <div class="segmented" id="seg-time" role="group" aria-label="${t('Time control')}">
              ${timeControls().map((tc) => `<button type="button" data-v="${tc.id}" aria-pressed="${setup.time === tc.id}">${esc(t(tc.label))}</button>`).join('')}
            </div></div>
        </div>
        <div class="card stack">
          <div class="setting-row" style="padding-top:0"><div><b>${t('Practice mode')}</b><small>${t("Enable undo and move hints. Practice games don't count toward results.")}</small></div>
            <label class="switch"><input type="checkbox" id="practice" ${setup.practice ? 'checked' : ''} aria-label="${t('Practice mode')}"><span></span></label></div>
          <div class="notice info">${icon('cpu', 16)} ${t('Engine status:')} <b id="eng-status">${t('checking…')}</b></div>
          <button class="btn primary lg block" id="start-btn" type="button">${icon('play', 20)} ${t('Start game')}</button>
          ${recentHtml()}
        </div>
      </div>`;
    const bindSeg = (id, key, conv = (x) => x) => {
      root.querySelectorAll(`#${id} button`).forEach((b) => b.onclick = () => {
        setup[key] = conv(b.dataset.v);
        root.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute('aria-pressed', x === b));
      });
    };
    bindSeg('seg-color', 'color');
    bindSeg('seg-time', 'time');
    bindSeg('levels', 'level', Number);
    root.querySelector('#practice').onchange = (e) => { setup.practice = e.target.checked; };
    root.querySelector('#start-btn').onclick = startGame;
    engineClient.ping().then(() => {
      const el = root.querySelector('#eng-status');
      if (el) el.textContent = engineClient.mode === 'worker' ? t('ready (runs locally in a background worker)') : t('ready (runs locally)');
    }).catch(() => {
      const el = root.querySelector('#eng-status');
      if (el) el.textContent = t('unavailable');
    });
  }

  function recentHtml() {
    const games = store.get('games').slice(-4).reverse();
    if (!games.length) return `<div class="empty" style="padding:20px"><div class="big" style="font-size:1.6rem">♟</div><p style="margin:0">${t('Your recent games will appear here.')}</p></div>`;
    return `<div><h3>${t('Recent games')}</h3><div class="stack" style="gap:8px">${games.map((r) => `
      <div class="row spread"><span>${r.result === 'win' ? '✅ ' + t('Win') : r.result === 'loss' ? '❌ ' + t('Loss') : '🤝 ' + t('Draw')} <span class="muted">${t('vs level {level}', { level: r.level })}</span></span>
      <span class="chip ${r.practice ? 'warn' : ''}">${r.practice ? t('Practice') : esc(t(r.reason))}</span></div>`).join('')}</div></div>`;
  }

  // --------------------------------------------------------------- game UI
  function startGame() {
    const sel = setup.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
    store.update('settings', (s) => { s.playSetup = { ...setup }; });
    begin(sel);
  }

  function begin(color) {
    cleanupGame();
    token++;
    human = color;
    g = new Chess();
    over = false; thinking = false; reviewPly = null; drawOfferPly = -99;
    startedAt = Date.now();
    const tc = timeControls().find((x) => x.id === setup.time) || timeControls()[0];
    clock = tc.base ? { w: tc.base * 1000, b: tc.base * 1000, running: null, last: 0, inc: tc.inc * 1000, tc } : null;
    engineClient.newGame().catch(() => {});
    renderGame();
    sfx('start');
    if (clock) { clock.running = 'w'; clock.last = performance.now(); timer = setInterval(tick, 100); }
    if (g.turn() !== human) requestComputer();
  }

  function renderGame() {
    const L = lvl();
    root.innerHTML = `
      <div class="page-head compact">
        <div><div class="eyebrow">${t('Play')}${setup.practice ? ' · ' + t('Practice mode') : ''}</div><h1>${th('You vs {name}', { name: t(L.name) })}</h1></div>
        <div class="btn-row"><button class="btn" id="new-btn" type="button">${icon('refresh', 18)} ${t('New game')}</button></div>
      </div>
      <div class="play-layout">
        <section aria-label="${t('Game board')}">
          <div class="player-bar" id="bar-top"></div>
          <div class="board-wrap"><div id="board"></div></div>
          <div class="player-bar" id="bar-bot"></div>
        </section>
        <aside class="side-panel">
          <div class="card">
            <div class="status-line" id="status" aria-live="polite"></div>
            <div class="notice" id="review-note" hidden style="margin:8px 0">${t('Viewing an earlier position.')} <button class="btn sm" id="live-btn" type="button">${t('Back to game')}</button></div>
            <div class="moves" id="moves" aria-label="${t('Move list')}"></div>
            <div class="empty" id="moves-empty" style="padding:22px;margin-top:6px">${t('Make your first move. Click a piece, then a highlighted square — or drag it.')}</div>
          </div>
          <div class="card">
            <div class="grid cols-2" style="gap:10px">
              <button class="btn" id="resign-btn" type="button">${icon('flag', 18)} ${t('Resign')}</button>
              <button class="btn" id="draw-btn" type="button">${icon('handshake', 18)} ${t('Offer draw')}</button>
              <button class="btn" id="undo-btn" type="button" ${setup.practice ? '' : 'hidden'}>${icon('undo', 18)} ${t('Undo')}</button>
              <button class="btn" id="hint-btn" type="button" ${setup.practice ? '' : 'hidden'}>${icon('bulb', 18)} ${t('Hint')}</button>
              <button class="btn" id="flip-btn" type="button">${icon('flip', 18)} ${t('Flip board')}</button>
              <button class="btn" id="restart-btn" type="button">${icon('refresh', 18)} ${t('Restart')}</button>
              <button class="btn" id="pgn-btn" type="button" style="grid-column:1/-1">${icon('copy', 18)} ${t('Copy PGN')}</button>
            </div>
          </div>
        </aside>
      </div>`;
    board = new BoardView(root.querySelector('#board'), {
      orientation: human,
      canSelect: (sq) => canSelect(sq),
      legalTargets: (sq) => legalTargetsFor(g, sq),
      onMove: (m) => onHumanMove(m),
    });
    board.setPosition(piecesFromGame(g));
    root.querySelector('#new-btn').onclick = async () => {
      if (!over && g.history().length > 1 && !(await confirmDialog({ title: t('Leave this game?'), body: t('The game in progress will be abandoned and not counted.'), ok: t('Leave game'), cancel: t('Cancel') }))) return;
      renderSetup();
    };
    root.querySelector('#resign-btn').onclick = onResign;
    root.querySelector('#draw-btn').onclick = onDraw;
    root.querySelector('#undo-btn').onclick = onUndo;
    root.querySelector('#hint-btn').onclick = onHint;
    root.querySelector('#flip-btn').onclick = () => board.flip() || refreshBars();
    root.querySelector('#restart-btn').onclick = async () => {
      if (!over && g.history().length > 1 && !(await confirmDialog({ title: t('Restart the game?'), body: t('The current game will be abandoned.'), ok: t('Restart'), cancel: t('Cancel') }))) return;
      begin(human);
    };
    root.querySelector('#pgn-btn').onclick = copyPgn;
    root.querySelector('#live-btn').onclick = () => setReview(null);
    refreshAll();
  }

  const canSelect = (sq) => {
    if (over || thinking || reviewPly !== null) return false;
    const p = g.get(sq);
    return !!p && p.color === human && g.turn() === human;
  };

  // ------------------------------------------------------------------ bars
  function capturedHtml(color) {
    const cap = g.captured()[color]; // pieces captured BY `color`
    const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
    const sorted = [...cap].sort((a, b) => order[a] - order[b]);
    const other = color === 'w' ? 'b' : 'w';
    const mine = sorted.reduce((s, p) => s + PIECE_VALUES[p], 0);
    const theirs = g.captured()[other].reduce((s, p) => s + PIECE_VALUES[p], 0);
    const adv = mine - theirs;
    return `<div class="captured" aria-label="${t('Captured pieces')}">${sorted.map((p) => `<span class="cp">${pieceSvg(p, other)}</span>`).join('')}${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}</div>`;
  }

  function barHtml(color) {
    const isHuman = color === human;
    const name = isHuman ? t('You') : `${t('Computer')} · ${esc(t(lvl().name))}`;
    const sub = isHuman ? (color === 'w' ? t('White') : t('Black')) : `${t('Level {n}', { n: setup.level })} · ${color === 'w' ? t('White') : t('Black')}`;
    const clockHtml = clock ? `<div class="clock" data-clock="${color}">${fmtClock(clock[color])}</div>` : '';
    return `<div class="avatar">${icon(isHuman ? 'user' : 'cpu', 20)}</div>
      <div><div class="name">${name}</div><div class="sub">${sub}</div>${capturedHtml(color)}</div>${clockHtml}`;
  }

  function refreshBars() {
    const top = board.orientation === 'w' ? 'b' : 'w';
    const bot = top === 'w' ? 'b' : 'w';
    root.querySelector('#bar-top').innerHTML = barHtml(top);
    root.querySelector('#bar-bot').innerHTML = barHtml(bot);
    updateClockStyles();
  }

  function updateClockStyles() {
    if (!clock) return;
    root.querySelectorAll('[data-clock]').forEach((el) => {
      const c = el.dataset.clock;
      el.textContent = fmtClock(clock[c]);
      el.classList.toggle('active', clock.running === c && !over);
      el.classList.toggle('low', clock[c] < 20000);
    });
  }

  function refreshMoves() {
    const hist = g.history();
    const el = root.querySelector('#moves');
    root.querySelector('#moves-empty').hidden = hist.length > 0;
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const n = i / 2 + 1;
      const cell = (ply) => hist[ply] ? `<button type="button" data-ply="${ply}" class="${(reviewPly === null ? hist.length - 1 : reviewPly) === ply ? 'cur' : ''}">${esc(hist[ply])}</button>` : '<span></span>';
      html += `<span class="num">${n}.</span>${cell(i)}${cell(i + 1)}`;
    }
    el.innerHTML = html;
    el.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const ply = +b.dataset.ply;
      setReview(ply === hist.length - 1 ? null : ply);
    });
    el.scrollTop = el.scrollHeight;
  }

  function setStatus(html, cls = '') {
    const el = root.querySelector('#status');
    if (el) el.innerHTML = `<span class="${cls}">${html}</span>`;
  }

  function refreshStatus() {
    if (over) return;
    if (thinking) setStatus(`<span class="spinner"></span> ${t('Computer is thinking')}<span class="dots"></span>`, 'thinking');
    else if (g.turn() === human) setStatus(g.inCheck() ? t('Check! Your move.') : t('Your move'));
    else setStatus(t('Computer to move'));
  }

  function refreshAll() {
    refreshBars();
    refreshMoves();
    refreshStatus();
    const draw = root.querySelector('#draw-btn'), resign = root.querySelector('#resign-btn');
    if (draw) draw.disabled = over;
    if (resign) resign.disabled = over;
    const undo = root.querySelector('#undo-btn'), hint = root.querySelector('#hint-btn');
    if (undo) undo.disabled = g.history().length === 0 || over && false;
    if (hint) hint.disabled = over || thinking || g.turn() !== human;
  }

  // --------------------------------------------------------- review mode
  function setReview(ply) {
    const hist = g.history({ verbose: true });
    reviewPly = ply;
    root.querySelector('#review-note').hidden = ply === null;
    if (ply === null) {
      board.setPosition(piecesFromGame(g), hist.length ? { from: hist[hist.length - 1].from, to: hist[hist.length - 1].to } : null);
      board.setCheck(g.checkSquare());
    } else {
      const tmp = new Chess(hist[ply].after);
      board.setPosition(piecesFromGame(tmp), { from: hist[ply].from, to: hist[ply].to });
      board.setCheck(tmp.checkSquare());
    }
    board.clearSelection();
    board.setArrows([]);
    refreshMoves();
  }

  // ----------------------------------------------------------- moves/turns
  function applyMove(mv, animated = true) {
    reviewPly = null;
    root.querySelector('#review-note').hidden = true;
    board.setPosition(piecesFromGame(g), { from: mv.from, to: mv.to });
    board.setCheck(g.checkSquare());
    board.setArrows([]);
    moveSound(mv, g);
    refreshAll();
  }

  async function onHumanMove({ from, to, promotion }) {
    if (over || thinking || g.turn() !== human) return false;
    const mv = g.move({ from, to, promotion });
    if (!mv) return false;
    onMoveMade(human);
    applyMove(mv);
    if (!afterMove()) requestComputer();
    return true;
  }

  function onMoveMade(color) {
    if (!clock) return;
    tick();
    clock[color] += clock.inc;
    clock.running = color === 'w' ? 'b' : 'w';
    clock.last = performance.now();
  }

  // returns true if the game is over
  function afterMove() {
    const st = g.status();
    if (st.over) { finish(st.result, st.reason); return true; }
    return false;
  }

  async function requestComputer() {
    if (over) return;
    const my = ++token;
    thinking = true;
    refreshAll();
    const t0 = performance.now();
    const L = lvl();
    let timeMs = L.timeMs;
    if (clock) timeMs = Math.min(timeMs, Math.max(150, clock[g.turn()] / 25 + clock.inc * 0.6));
    try {
      const res = await engineClient.search(g, { level: setup.level, timeMs });
      if (my !== token || disposed || over) return;
      const wait = Math.max(0, 420 - (performance.now() - t0));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (my !== token || disposed || over) return;
      thinking = false;
      if (!res.move) { afterMove(); return; }
      const mv = g.move(res.move);
      if (!mv) throw new Error('engine produced an illegal move');
      onMoveMade(g.turn() === 'w' ? 'b' : 'w');
      applyMove(mv);
      afterMove();
      if (!over) refreshAll();
    } catch (e) {
      if (my !== token) return; // cancelled
      console.error(e);
      thinking = false;
      toast(t('The computer could not move: {error}', { error: e.message || e }), 'bad');
      refreshAll();
    }
  }

  // -------------------------------------------------------------- clocks
  function tick() {
    if (!clock || !clock.running || over) return;
    const now = performance.now();
    clock[clock.running] -= now - clock.last;
    clock.last = now;
    if (clock[clock.running] <= 0) {
      clock[clock.running] = 0;
      const loser = clock.running;
      updateClockStyles();
      const winner = loser === 'w' ? 'b' : 'w';
      // timeout is a draw if the opponent cannot possibly mate
      const probe = new Chess(g.fen().replace(/ [wb] /, ` ${winner} `).replace(/ [a-h][36] /, ' - '));
      let drawn = false;
      try { drawn = probe.isInsufficientMaterial(); } catch { /* ignore */ }
      finish(drawn ? '1/2-1/2' : (winner === 'w' ? '1-0' : '0-1'), drawn ? 'timeout vs insufficient material' : 'time');
      return;
    }
    updateClockStyles();
  }

  // ------------------------------------------------------------ controls
  async function onResign() {
    if (over) return;
    if (!(await confirmDialog({ title: t('Resign this game?'), body: t('The computer will be awarded the win.'), ok: t('Resign'), cancel: t('Cancel'), danger: true }))) return;
    finish(human === 'w' ? '0-1' : '1-0', 'resignation');
  }

  async function onDraw() {
    if (over || thinking) return;
    const ply = g.history().length;
    if (ply < 2) { toast(t('Make a couple of moves before offering a draw.')); return; }
    if (ply - drawOfferPly < 10) { toast(t('The computer declined recently — try again in a few moves.')); return; }
    drawOfferPly = ply;
    thinking = true; refreshAll();
    setStatus(`<span class="spinner"></span> ${t('Computer is considering your offer')}<span class="dots"></span>`, 'thinking');
    const my = ++token;
    try {
      const res = await engineClient.search(g, { depth: 5, timeMs: 900 });
      if (my !== token || disposed || over) return;
      thinking = false;
      const engineSide = human === 'w' ? 'b' : 'w';
      // `score` is from the side to move; convert to the engine's point of view
      const engineScore = g.turn() === engineSide ? res.score : -res.score;
      if (engineScore <= 30) {
        toast(t('The computer accepted your draw offer.'), 'good');
        finish('1/2-1/2', 'agreement');
      } else {
        toast(t('The computer declined — it thinks it is doing well.'), 'bad');
        refreshAll();
        if (g.turn() !== human) requestComputer();
      }
    } catch (e) {
      if (my !== token) return;
      thinking = false; refreshAll();
    }
  }

  async function onUndo() {
    if (!setup.practice) return;
    const hist = g.history({ verbose: true });
    if (!hist.length) return;
    token++;                   // drop any computer move still being calculated
    engineClient.cancel();
    thinking = false;
    const lastMover = hist[hist.length - 1].color;
    if (over) { over = false; root.querySelectorAll('.modal-back').forEach((n) => n.remove()); }
    g.undo();
    if (lastMover !== human && g.history().length) g.undo(); // computer's move + the human's move before it
    reviewPly = null;
    root.querySelector('#review-note').hidden = true;
    const h2 = g.history({ verbose: true });
    board.setPosition(piecesFromGame(g), h2.length ? { from: h2[h2.length - 1].from, to: h2[h2.length - 1].to } : null);
    if (!h2.length) board.setLastMove(null);
    board.setCheck(g.checkSquare());
    board.setArrows([]);
    if (clock) { clock.running = g.turn(); clock.last = performance.now(); }
    sfx('move');
    refreshAll();
    if (g.turn() !== human) requestComputer();
  }

  async function onHint() {
    if (over || thinking || g.turn() !== human) return;
    thinking = true; refreshAll();
    setStatus(`<span class="spinner"></span> ${t('Looking for a good move')}<span class="dots"></span>`, 'thinking');
    const my = ++token;
    try {
      const res = await engineClient.search(g, { depth: 7, timeMs: 1500 });
      if (my !== token || disposed) return;
      thinking = false;
      if (res.move) {
        board.setArrows([{ from: res.move.from, to: res.move.to, color: '#4cc3ff' }]);
        setStatus(t('Hint: try <b>{move}</b> (evaluation {score})', { move: esc(res.move.san), score: scoreText(res.score, g.turn()) }));
      }
      refreshAll();
    } catch (e) { thinking = false; refreshAll(); }
  }

  async function copyPgn() {
    const pgn = g.pgn({ White: human === 'w' ? 'You' : `Computer (level ${setup.level})`, Black: human === 'b' ? 'You' : `Computer (level ${setup.level})` }); // PGN headers stay English: it is an interchange format
    try { await navigator.clipboard.writeText(pgn); toast(t('PGN copied to clipboard'), 'good'); }
    catch {
      const m = modal(`<h2>PGN</h2><textarea readonly id="pgn-text">${esc(pgn)}</textarea><div class="actions"><button class="btn primary" data-close>${t('Close')}</button></div>`);
      m.el.querySelector('#pgn-text').select();
      m.el.querySelector('[data-close]').onclick = () => m.close();
    }
  }

  // ---------------------------------------------------------------- finish
  async function finish(result, reason) {
    if (over) return;
    over = true; thinking = false;
    token++;
    clearInterval(timer); timer = null;
    if (clock) { clock.running = null; }
    board?.clearSelection();
    refreshAll();
    updateClockStyles();
    const humanWon = (result === '1-0' && human === 'w') || (result === '0-1' && human === 'b');
    const draw = result === '1/2-1/2';
    const outcome = draw ? 'draw' : humanWon ? 'win' : 'loss';
    const niceKey = { checkmate: 'by checkmate', stalemate: 'by stalemate', 'insufficient material': 'by insufficient material', 'threefold repetition': 'by threefold repetition',
      'fifty-move rule': 'by the fifty-move rule', resignation: 'by resignation', time: 'on time', agreement: 'by agreement', 'timeout vs insufficient material': 'on time (not enough material to mate)' }[reason] || reason;
    const nice = t(niceKey);
    sfx(outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'draw');
    setStatus(`${draw ? t('Draw') : humanWon ? t('You won') : t('Computer won')} ${nice}`, humanWon ? 'good' : '');
    const entry = {
      id: Date.now(), date: new Date().toISOString(), level: setup.level, color: human, result: outcome, reason,
      plies: g.history().length, practice: setup.practice, time: setup.time,
    };
    if (g.history().length >= 2 || reason === 'resignation') {
      await store.update('games', (list) => { list.push(entry); if (list.length > 100) list.splice(0, list.length - 100); });
      await markActivity();
      track('game_completed', outcome, setup.practice ? 'practice' : '', setup.level);
      const unlocked = await checkAchievements();
      unlocked.forEach((a) => toast(t('🏆 Achievement unlocked: {name}', { name: t(a.name) }), 'good'));
    }
    if (disposed) return;
    const emoji = draw ? '🤝' : humanWon ? '🏆' : '♟';
    const title = draw ? t('Draw') : humanWon ? t('You won!') : t('Computer wins');
    const m = modal(`
      <div class="result-banner">
        <div class="emoji">${emoji}</div>
        <h2>${title}</h2>
        <p class="muted">${esc(nice.charAt(0).toUpperCase() + nice.slice(1))} · ${t('vs {name} (level {n})', { name: esc(t(lvl().name)), n: setup.level })}${setup.practice ? ' · ' + t('practice') : ''}</p>
      </div>
      <div class="actions" style="justify-content:center">
        <button class="btn primary" data-rematch type="button">${icon('refresh', 18)} ${t('Rematch (swap colours)')}</button>
        <button class="btn" data-new type="button">${t('New game')}</button>
        <button class="btn ghost" data-close type="button">${t('Review game')}</button>
      </div>`);
    m.el.querySelector('[data-rematch]').onclick = () => { m.close(); begin(human === 'w' ? 'b' : 'w'); };
    m.el.querySelector('[data-new]').onclick = () => { m.close(); renderSetup(); };
    m.el.querySelector('[data-close]').onclick = () => m.close();
  }

  // --------------------------------------------------------------- cleanup
  function cleanupGame() {
    token++;
    clearInterval(timer); timer = null;
    engineClient.cancel();
    thinking = false;
    board?.destroy(); board = null;
  }

  const onKey = (e) => {
    if (!g || !board || document.querySelector('.modal-back')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const n = g.history().length;
    if (!n) return;
    const cur = reviewPly === null ? n - 1 : reviewPly;
    const next = e.key === 'ArrowLeft' ? Math.max(0, cur - 1) : Math.min(n - 1, cur + 1);
    setReview(next === n - 1 ? null : next);
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  renderSetup();
  return () => {
    disposed = true;
    document.removeEventListener('keydown', onKey);
    cleanupGame();
  };
}
