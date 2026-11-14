// Home: the dashboard of the platform — quick play, daily puzzle, learning, live games, tournaments, recent games, news.
import { store, currentStreak, todayISO } from '../store.js';
import { levelById } from '../data/levels.js';
import { LESSONS } from '../data/lessons.js';
import { OPENINGS } from '../data/openings.js';
import { ENDGAMES } from '../data/endgames.js';
import { recommendedLesson, pathProgress, puzzleAccuracy } from '../progress.js';
import { esc, icon, ring } from '../ui/dom.js';
import { avatarHtml, flag } from '../ui/user.js';
import { miniBoard } from '../ui/mini.js';
import { pieceSvg } from '../ui/pieces.js';
import { openAuth } from '../auth-ui.js';
import { dailyPuzzle, puzzleLevelFor } from './puzzles.js';
import { t, th, tn, getLang } from '../i18n/core.js';
import { levelName, levelFocus } from '../i18n/names.js';
import { net, get } from '../net.js';
import { tcLabel, resultText } from './game.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FAST = [[60, 0, 'Bullet'], [180, 2, 'Blitz'], [600, 0, 'Rapid'], [1800, 0, 'Classical']];
const CAT = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical' };
const dayOfYear = () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
const fdate = (iso) => { try { return new Date(iso).toLocaleDateString(getLang(), { month: 'short', day: 'numeric' }); } catch { return ''; } };

export function mount(root) {
  const profile = store.get('profile'), lv = levelById(profile.level);
  const rec = recommendedLesson();
  const prog = lv ? pathProgress(lv.id) : { done: 0, total: 0, pct: 0 };
  const ds = store.get('puzzles').daily[todayISO()];
  const acc = puzzleAccuracy();
  const dp = dailyPuzzle(todayISO(), puzzleLevelFor(profile.level || 'beginner'));
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('Good morning') : hour < 18 ? t('Good afternoon') : t('Good evening');
  const op = OPENINGS[dayOfYear() % OPENINGS.length], eg = ENDGAMES[dayOfYear() % ENDGAMES.length];
  const best = net.ratings ? Math.max(net.ratings.bullet.rating, net.ratings.blitz.rating, net.ratings.rapid.rating, net.ratings.classical.rating) : null;
  const online = net.available;

  root.innerHTML = `
    <div class="fx-ticker" id="fx-ticker" hidden></div>
    <section class="hero fade-in home-hero">
      <div><div class="eyebrow">${greet}${net.user ? ', ' + esc(net.user.username) : ''}</div>
        <h1>${t('The board is set.')} <em>${t('Your move.')}</em></h1>
        <p>${online ? t('Rated games against real players, Stockfish at every strength, lessons, puzzles and tournaments — in one place.') : t('Lessons that fit your level, puzzles, and Stockfish as a sparring partner — all on this device.')}</p>
        <div class="btn-row" style="margin-top:18px">
          <a class="btn primary lg" href="#/play${online ? '/online' : '/computer'}">${icon('play', 18)} ${online ? t('Play online') : t('Play the computer')}</a>
          ${online ? `<a class="btn lg" href="#/play/computer">${icon('cpu', 18)} ${t('Play the computer')}</a>` : `<a class="btn lg" href="#/play/local">${icon('users', 18)} ${t('Two players')}</a>`}
        </div>
        ${online ? `<div class="fx-chips">${FAST.map(([b, i, name]) => `<a href="#/play/online" data-b="${b}" data-i="${i}">${icon('clock', 15)} ${b / 60}+${i} ${t(name)}</a>`).join('')}</div>` : ''}
      </div>
      <div class="fx-stage">
        <div class="cap"><span>${lv ? levelName(lv) : t('Your board')}</span><b>${lv ? `${Math.round(prog.pct * 100)}%` : ''}</b></div>
        <div class="fx-board3d"><a href="#/play${online ? '/online' : '/computer'}" aria-label="${t('Play chess')}">${miniBoard(START, 'w', 380)}</a></div>
        <div class="cap"><span>${net.user ? esc(net.user.username) : t('Guest')}</span><b>${best ?? ''}</b></div>
      </div>
    </section>

    <div class="fx-modes">
      <a class="fx-mode gold" href="#/play${online ? '/online' : '/computer'}"><span class="tag">${icon('swords', 14)} ${online ? t('Ranked queue') : t('Practice')}</span><span class="art">${pieceSvg('n', 'w')}</span><h3>${online ? t('Play online') : t('Play the computer')}</h3><p>${t('Paired in seconds, any time control.')}</p></a>
      <a class="fx-mode green" href="#/play/computer"><span class="tag">${icon('cpu', 14)} ${t('Stockfish')}</span><span class="art">${pieceSvg('q', 'w')}</span><h3>${t('Play the computer')}</h3><p>${t('Eight Stockfish strengths.')}</p></a>
      <a class="fx-mode" href="#/puzzles"><span class="tag">${icon('puzzle', 14)} ${t('Puzzles')}</span><span class="art">${pieceSvg('b', 'w')}</span><h3>${t('Puzzles')}</h3><p>${t('Daily tactics and puzzle rating.')}</p></a>
      <a class="fx-mode teal" href="#/learn"><span class="tag">${icon('book', 14)} ${t('Learn')}</span><span class="art">${pieceSvg('r', 'w')}</span><h3>${t('Learn')}</h3><p>${t('Openings, endgames, strategy.')}</p></a>
    </div>

    <div class="fx-widgets">
      <div class="card fx-player">${net.user ? `<div class="eyebrow">${t('Player card')}</div>
        <div class="id">${avatarHtml(net.user, 56)}<div><b>${esc(net.user.username)}</b><small class="muted">${flag(net.user.country)} ${t('Rating')} ${best}</small></div></div>
        <div class="fx-rate">${['bullet', 'blitz', 'rapid', 'classical'].map((c) => `<div><small>${t(CAT[c])}</small><span>${net.ratings?.[c]?.rating ?? '—'}</span></div>`).join('')}</div>`
        : `<div class="eyebrow">${t('Player card')}</div><h3>${online ? t('Sign in to get a rating') : t('Progress on this device')}</h3><p class="muted">${online ? t('Create an account to play rated games online, save your progress and join tournaments — or sign in if you already have one.') : t('Lessons that fit your level, puzzles, and Stockfish as a sparring partner — all on this device.')}</p>${online ? `<button class="btn primary" id="fx-signup" type="button">${t('Sign up')}</button>` : ''}`}</div>
      <div class="card" id="t-card"><div class="eyebrow">${icon('trophy', 14)} ${t('Tournaments')}</div><div id="t-body">${online ? '<div class="muted">…</div>' : `<p class="muted">${t('Tournaments need the Rookery server.')}</p>`}</div></div>
      <div class="card"><div class="row spread"><div class="eyebrow">${icon('chart', 14)} ${t('Leaderboard')}</div><a class="small" href="#/leaderboard">${t('See all')} →</a></div><div id="lb-body">${online ? '<div class="muted">…</div>' : `<p class="muted">${t('Leaderboards need the Rookery server.')}</p>`}</div></div>
    </div>

    <div class="grid cols-4 stat-row" style="margin-top:16px">
      <div class="card stat"><b>${best ?? '—'}</b><span>${net.user ? t('Best rating') : t('Sign in for a rating')}</span></div>
      <div class="card stat"><b>${currentStreak()}</b><span>${t('Day streak')}</span></div>
      <div class="card stat"><b>${Object.keys(store.get('puzzles').solved).length}</b><span>${t('Puzzles solved')}${acc === null ? '' : ' · ' + Math.round(acc * 100) + '%'}</span></div>
      <div class="card stat"><b>${Object.keys(store.get('lessons').done).length}/${LESSONS.length}</b><span>${t('Lessons completed')}</span></div>
    </div>

    <div class="home-grid">
      <a class="card hover daily" href="#/puzzles/daily">${dp ? miniBoard(dp.fen, dp.fen.split(' ')[1] === 'b' ? 'b' : 'w', 150) : ''}<div><div class="eyebrow">${icon('clock', 14)} ${t('Daily puzzle')}</div><h3>${ds?.solved ? t('Solved today ✓') : t('Ready when you are')}</h3><p class="muted">${t('A fresh tactic every day. Keep your streak alive.')}</p><span class="more">${ds?.solved ? t('Practise more') : t('Solve it')} ${icon('arrow', 16)}</span></div></a>
      <a class="card hover" href="${rec ? '#/learn/' + rec.id : '#/learn'}"><div class="eyebrow">${icon('book', 14)} ${t('Learn')}</div><h3>${rec ? esc(rec.title) : t('Review your path')}</h3><p class="muted">${rec ? esc(rec.summary) : lv ? esc(levelFocus(lv)) : t('From the first move to master-level ideas.')}</p><span class="more">${rec ? t('Continue') : t('Open')} ${icon('arrow', 16)}</span></a>
      <div class="card" id="live-card"><div class="eyebrow">${icon('eye', 14)} ${t('Live now')}</div><div id="live-body">${online ? '<div class="muted">…</div>' : `<p class="muted">${t('Live games need the Rookery server.')}</p>`}</div></div>
      <div class="card" id="recent-card"><div class="eyebrow">${icon('swords', 14)} ${t('Recent games')}</div><div id="recent-body">${net.user ? '<div class="muted">…</div>' : `<p class="muted">${online ? t('Sign in to keep a history of your games.') : t('Your games against the computer appear in Progress.')}</p>`}</div></div>
      <div class="card" id="news-card"><div class="eyebrow">${icon('news', 14)} ${t('News')}</div><div id="news-body">${online ? '<div class="muted">…</div>' : `<p class="muted">${t('News needs the Rookery server.')}</p>`}</div></div>
    </div>

    <h2 style="margin:26px 0 12px">${t('Featured')}</h2>
    <div class="grid cols-3">
      <a class="card hover feat" href="#/openings"><div class="eyebrow">${t('Opening of the day')}</div><h3>${esc(op[1])}</h3><p class="muted"><b>${op[0]}</b> · ${esc(op[2])}</p><span class="more">${t('Explore openings')} ${icon('arrow', 16)}</span></a>
      <a class="card hover feat" href="#/endgames/${eg.id}"><div class="eyebrow">${t('Endgame of the day')}</div><h3>${esc(t(eg.name))}</h3><p class="muted">${eg.goal === 'win' ? t('Goal: win') : t('Goal: hold the draw')}</p><span class="more">${t('Train it')} ${icon('arrow', 16)}</span></a>
      <a class="card hover feat" href="#/analysis"><div class="eyebrow">${t('Analysis')}</div><h3>${t('Review a game with Stockfish')}</h3><p class="muted">${t('Import a PGN and find your mistakes.')}</p><span class="more">${t('Open analysis board')} ${icon('arrow', 16)}</span></a>
    </div>`;

  root.querySelectorAll('.fx-chips a').forEach((a) => { a.addEventListener('click', () => store.update('settings', (x) => { x.onlineTc = [+a.dataset.b, +a.dataset.i]; })); });
  root.querySelector('#fx-signup')?.addEventListener('click', () => openAuth('register'));
  if (online) loadOnline(root);
  return () => {};
}

async function loadOnline(root) {
  const $ = (s) => root.querySelector(s);
  const fill = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  get('/api/games/live').then(({ games }) => {
    fill('#live-body', games.length ? `<div class="live-mini">${games.slice(0, 3).map((g) => `<a href="#/game/${g.id}" class="lm">${miniBoard(g.fen, 'w', 92)}<span><b>${esc(g.players.w.username)}</b> <span class="muted">${g.players.w.rating}</span><br><b>${esc(g.players.b.username)}</b> <span class="muted">${g.players.b.rating}</span><br><small class="muted">${tcLabel(g)}</small></span></a>`).join('')}</div><a class="more" href="#/watch">${t('Watch more')} ${icon('arrow', 16)}</a>` : `<p class="muted">${t('No games right now.')}</p><a class="more" href="#/play/online">${t('Start one')} ${icon('arrow', 16)}</a>`);
  }).catch(() => fill('#live-body', ''));
  get('/api/tournaments').then(({ tournaments }) => {
    const list = tournaments.filter((x) => x.state !== 'finished').slice(0, 3);
    fill('#t-body', list.length ? `<div class="stack" style="gap:8px">${list.map((x) => `<a class="row spread" href="#/tournaments/${x.id}"><span><b>${esc(x.name)}</b><small class="muted"> ${x.base >= 60 ? x.base / 60 : x.base + 's'}+${x.inc}</small></span><span class="chip ${x.state === 'running' ? 'good' : ''}">${x.state === 'running' ? t('Running') : fdate(x.startsAt)}</span></a>`).join('')}</div>` : `<p class="muted">${t('No tournaments scheduled.')}</p>`);
  }).catch(() => fill('#t-body', ''));
  get('/api/leaderboard?category=blitz').then(({ players }) => {
    fill('#lb-body', players.length ? `<ol class="fx-lb">${players.slice(0, 5).map((p) => `<li><span class="n">${p.rank}</span><span class="grow"><a href="#/profile/${encodeURIComponent(p.username)}">${esc(p.username)}</a></span><span class="r">${p.rating}</span></li>`).join('')}</ol>` : `<p class="muted">${t('No rated players yet.')}</p>`);
  }).catch(() => fill('#lb-body', ''));
  Promise.all([get('/api/games/live'), get('/api/tournaments')]).then(([lg, tr]) => {
    const items = [];
    for (const g of lg.games.slice(0, 3)) items.push(`<a href="#/game/${g.id}">${esc(g.players.w.username)} ${g.players.w.rating} · ${esc(g.players.b.username)} ${g.players.b.rating}</a>`);
    for (const x of tr.tournaments.filter((y) => y.state !== 'finished').slice(0, 2)) items.push(`<a href="#/tournaments/${x.id}">${esc(x.name)}</a>`);
    const el = $('#fx-ticker'); if (!el || !items.length) return;
    el.hidden = false; el.innerHTML = `<span class="live"><i></i>${t('Live')}</span><span class="items">${items.join('<span class="sep">◆</span>')}</span>`;
  }).catch(() => {});
  get('/api/news').then(({ items }) => {
    fill('#news-body', items.length ? `<div class="stack" style="gap:8px">${items.slice(0, 3).map((n) => `<a href="#/news/${n.id}"><b>${esc(n.title)}</b><small class="muted"> ${fdate(n.published_at)}</small></a>`).join('')}</div>` : `<p class="muted">${t('No news yet.')}</p>`);
  }).catch(() => fill('#news-body', ''));
  if (net.user) get('/api/users/' + encodeURIComponent(net.user.username)).then((d) => {
    fill('#recent-body', d.games.length ? `<div class="game-list">${d.games.slice(0, 4).map((g) => { const mine = g.players.w?.username === net.user.username ? 'w' : 'b'; const opp = g.players[mine === 'w' ? 'b' : 'w']; const res = g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === (mine === 'w') ? 'w' : 'l'; return `<a class="game-row" href="#/game/${g.id}"><span class="res ${g.status === 'active' ? 'live' : res}">${g.status === 'active' ? icon('eye', 14) : res === 'w' ? t('W') : res === 'l' ? t('L') : t('D')}</span><span class="who"><b>${esc(opp?.username || '?')}</b></span><span class="muted small">${tcLabel(g)}</span></a>`; }).join('')}</div><a class="more" href="#/profile">${t('All games')} ${icon('arrow', 16)}</a>` : `<p class="muted">${t('No games yet.')}</p><a class="more" href="#/play/online">${t('Play your first game')} ${icon('arrow', 16)}</a>`);
  }).catch(() => fill('#recent-body', ''));
}
