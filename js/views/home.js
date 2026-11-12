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
import { dailyPuzzle, puzzleLevelFor } from './puzzles.js';
import { t, th, tn, getLang } from '../i18n/core.js';
import { levelName, levelFocus } from '../i18n/names.js';
import { net, get } from '../net.js';
import { tcLabel, resultText } from './game.js';

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
    <section class="hero fade-in home-hero">
      <div><div class="eyebrow">${greet}${net.user ? ', ' + esc(net.user.username) : ''}</div>
        <h1>${net.user ? t('Ready for your next game?') : lv ? th('Keep climbing, {name}.', { name: levelName(lv) }) : t('Play, learn and improve at chess.')}</h1>
        <p>${online ? t('Rated games against real players, Stockfish at every strength, lessons, puzzles and tournaments — in one place.') : t('Lessons that fit your level, puzzles, and Stockfish as a sparring partner — all on this device.')}</p>
        <div class="btn-row" style="margin-top:18px">
          <a class="btn primary lg" href="#/play${online ? '/online' : '/computer'}">${icon('play', 18)} ${t('Play chess')}</a>
          <a class="btn lg" href="#/play/computer">${icon('cpu', 18)} ${t('Play the computer')}</a>
          ${online ? `<a class="btn lg" href="#/play/friend">${icon('link', 18)} ${t('Play a friend')}</a>` : `<a class="btn lg" href="#/play/local">${icon('users', 18)} ${t('Two players')}</a>`}
        </div></div>
      <div class="row" style="justify-content:center">${lv ? `<div style="text-align:center">${ring(prog.pct, `${Math.round(prog.pct * 100)}%`)}<p class="muted" style="margin:8px 0 0">${th('{done} of {total} {level} lessons', { done: prog.done, total: prog.total, level: esc(levelName(lv).toLowerCase()) })}</p></div>` : `<a class="btn" href="#/welcome">${icon('target', 18)} ${t('Find my level')}</a>`}</div>
    </section>

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
      <div class="card" id="t-card"><div class="eyebrow">${icon('trophy', 14)} ${t('Tournaments')}</div><div id="t-body">${online ? '<div class="muted">…</div>' : `<p class="muted">${t('Tournaments need the Rookery server.')}</p>`}</div></div>
      <div class="card" id="recent-card"><div class="eyebrow">${icon('swords', 14)} ${t('Recent games')}</div><div id="recent-body">${net.user ? '<div class="muted">…</div>' : `<p class="muted">${online ? t('Sign in to keep a history of your games.') : t('Your games against the computer appear in Progress.')}</p>`}</div></div>
      <div class="card" id="news-card"><div class="eyebrow">${icon('news', 14)} ${t('News')}</div><div id="news-body">${online ? '<div class="muted">…</div>' : `<p class="muted">${t('News needs the Rookery server.')}</p>`}</div></div>
    </div>

    <h2 style="margin:26px 0 12px">${t('Featured')}</h2>
    <div class="grid cols-3">
      <a class="card hover feat" href="#/openings"><div class="eyebrow">${t('Opening of the day')}</div><h3>${esc(op[1])}</h3><p class="muted"><b>${op[0]}</b> · ${esc(op[2])}</p><span class="more">${t('Explore openings')} ${icon('arrow', 16)}</span></a>
      <a class="card hover feat" href="#/endgames/${eg.id}"><div class="eyebrow">${t('Endgame of the day')}</div><h3>${esc(t(eg.name))}</h3><p class="muted">${eg.goal === 'win' ? t('Goal: win') : t('Goal: hold the draw')}</p><span class="more">${t('Train it')} ${icon('arrow', 16)}</span></a>
      <a class="card hover feat" href="#/analysis"><div class="eyebrow">${t('Analysis')}</div><h3>${t('Review a game with Stockfish')}</h3><p class="muted">${t('Import a PGN and find your mistakes.')}</p><span class="more">${t('Open analysis board')} ${icon('arrow', 16)}</span></a>
    </div>`;

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
  get('/api/news').then(({ items }) => {
    fill('#news-body', items.length ? `<div class="stack" style="gap:8px">${items.slice(0, 3).map((n) => `<a href="#/news/${n.id}"><b>${esc(n.title)}</b><small class="muted"> ${fdate(n.published_at)}</small></a>`).join('')}</div>` : `<p class="muted">${t('No news yet.')}</p>`);
  }).catch(() => fill('#news-body', ''));
  if (net.user) get('/api/users/' + encodeURIComponent(net.user.username)).then((d) => {
    fill('#recent-body', d.games.length ? `<div class="game-list">${d.games.slice(0, 4).map((g) => { const mine = g.players.w?.username === net.user.username ? 'w' : 'b'; const opp = g.players[mine === 'w' ? 'b' : 'w']; const res = g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === (mine === 'w') ? 'w' : 'l'; return `<a class="game-row" href="#/game/${g.id}"><span class="res ${g.status === 'active' ? 'live' : res}">${g.status === 'active' ? icon('eye', 14) : res === 'w' ? t('W') : res === 'l' ? t('L') : t('D')}</span><span class="who"><b>${esc(opp?.username || '?')}</b></span><span class="muted small">${tcLabel(g)}</span></a>`; }).join('')}</div><a class="more" href="#/profile">${t('All games')} ${icon('arrow', 16)}</a>` : `<p class="muted">${t('No games yet.')}</p><a class="more" href="#/play/online">${t('Play your first game')} ${icon('arrow', 16)}</a>`);
  }).catch(() => fill('#recent-body', ''));
}
