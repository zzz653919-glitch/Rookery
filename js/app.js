// Rookery app shell: layout, hash router, theme, offline status.
import { store, currentStreak } from './store.js';
import { icon, LOGO } from './ui/icons.js';
import { $, $$, esc, toast, modal } from './ui/dom.js';
import { engineClient } from './engine-client.js';
import { loadRemoteContent } from './content.js';
import { net, onAuth, loadSession, logout, get } from './net.js';
import { connect, reconnect, onNotify } from './realtime.js';
import { startSync } from './sync.js';
import { openAuth, showAuthPrompt } from './auth-ui.js';
import { avatarHtml, flag } from './ui/user.js';
import { installErrorReporting, track } from './telemetry.js';
import { t, tn, LANGS, getLang } from './i18n/core.js';
import { initLanguage, reconcileLanguage, changeLanguage } from './i18n/runtime.js';
import { applyBundledTranslations } from './i18n/content-runtime.js';

// labels are English dictionary keys, translated where they are displayed
const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'play', label: 'Play', icon: 'play', main: true },
  { id: 'puzzles', label: 'Puzzles', icon: 'puzzle', main: true },
  { id: 'learn', label: 'Learn', icon: 'book', main: true },
  { id: 'world', label: 'Chess World', icon: 'globe' },
  { id: 'watch', label: 'Watch', icon: 'eye' },
  { id: 'tournaments', label: 'Tournaments', icon: 'trophy' },
  { id: 'leaderboard', label: 'Leaderboards', icon: 'crown' },
  { id: 'friends', label: 'Friends', icon: 'users', badge: 'friends' },
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];
const langSelect = (id) => `<select class="lang-select" id="${id}" aria-label="${t('Language')}">${LANGS.map((l) => `<option value="${l.id}" ${getLang() === l.id ? 'selected' : ''}>${l.short} · ${l.name}</option>`).join('')}</select>`;

const VIEWS = {
  home: () => import('./views/home.js'),
  play: () => import('./views/play-hub.js'),
  computer: () => import('./views/play.js'),
  local: () => import('./views/local.js'),
  online: () => import('./views/online.js'),
  game: () => import('./views/game.js'),
  watch: () => import('./views/watch.js'),
  world: () => import('./views/world.js'),
  news: () => import('./views/news.js'),
  tournaments: () => import('./views/tournaments.js'),
  leaderboard: () => import('./views/leaderboard.js'),
  friends: () => import('./views/friends.js'),
  profile: () => import('./views/profile.js'),
  openings: () => import('./views/openings.js'),
  endgames: () => import('./views/endgames.js'),
  analysis: () => import('./views/analysis.js'),
  learn: () => import('./views/learn.js'),
  lesson: () => import('./views/lesson.js'),
  puzzles: () => import('./views/puzzles.js'),
  progress: () => import('./views/progress.js'),
  settings: () => import('./views/settings.js'),
  welcome: () => import('./views/welcome.js'),
  test: () => import('./views/placement.js'),
};
const FOCUS_ROUTES = new Set(['welcome', 'test']);
// view name → which sidebar item is highlighted
const NAV_OF = { news: 'world', computer: 'play', local: 'play', online: 'play', game: 'play', lesson: 'learn', openings: 'learn', endgames: 'learn', progress: 'profile', analysis: 'learn' };

let cleanup = null;
let navToken = 0;
const appEl = () => document.getElementById('app');

export function navigate(path) {
  if (location.hash === '#' + path) route();
  else location.hash = path;
}

export function parseRoute() {
  const raw = (location.hash || '#/home').replace(/^#/, '');
  const parts = raw.split('?')[0].split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  let name = parts[0] || 'home';
  const sub = parts[1];
  if (name === 'learn' && sub) return { name: 'lesson', params: { id: sub }, nav: 'learn' };
  if (name === 'puzzles' && sub) return { name: 'puzzles', params: { mode: sub }, nav: 'puzzles' };
  if (name === 'play' && ['computer', 'local', 'online'].includes(sub)) return { name: sub, params: { mode: parts[2] }, nav: 'play' };
  if (name === 'play' && sub === 'friend') return { name: 'online', params: { mode: 'friend' }, nav: 'play' };
  if (name === 'world') return { name, params: { page: sub || 'hub', id: parts[2] }, nav: 'world' };
  if (['game', 'news', 'tournaments', 'profile', 'endgames', 'openings'].includes(name)) return { name, params: { id: sub, name: sub, rest: parts.slice(2) }, nav: NAV_OF[name] || name };
  if (!VIEWS[name]) return { name: 'home', params: {}, nav: 'home' };
  return { name, params: { id: sub }, nav: NAV_OF[name] || name };
}

const userCard = () => {
  if (!net.available) return `<div class="user-card offline">${icon('wifioff', 18)}<div><b>${t('Offline mode')}</b><small>${t('Online features need the Rookery server')}</small></div></div>`;
  if (!net.user) return `<div class="user-card guest"><div class="row"><button class="btn primary sm grow" id="btn-signin" type="button">${t('Sign in')}</button><button class="btn sm grow" id="btn-signup" type="button">${t('Sign up')}</button></div></div>`;
  const r = net.ratings; const best = r ? Math.max(r.bullet.rating, r.blitz.rating, r.rapid.rating, r.classical.rating) : 1200;
  return `<a class="user-card me" href="#/profile" title="${t('Profile')}">${avatarHtml(net.user, 40)}<div><b>${esc(net.user.username)}</b><small>${flag(net.user.country)} ${t('Rating')} ${best}</small></div></a>`;
};

function bindUserCard() {
  $('#btn-signin') && ($('#btn-signin').onclick = () => openAuth('login'));
  $('#btn-signup') && ($('#btn-signup').onclick = () => openAuth('register'));
  const box = $('#user-box'); if (!box) return;
  const out = document.getElementById('btn-signout'); if (out) out.onclick = async () => { await logout(); navigate('/home'); };
}
function renderUser() {
  const box = $('#user-box'); if (box) { box.innerHTML = userCard() + (net.user ? `<button class="btn ghost sm block" id="btn-signout" type="button">${icon('x', 16)} ${t('Sign out')}</button>` : ''); bindUserCard(); }
  const top = $('#top-user'); if (top) { top.innerHTML = net.available ? (net.user ? `<a href="#/profile" class="top-avatar" aria-label="${t('Profile')}">${avatarHtml(net.user, 34)}</a>` : `<button class="btn primary sm" id="btn-signin-m" type="button">${t('Sign in')}</button>`) : ''; $('#btn-signin-m') && ($('#btn-signin-m').onclick = () => openAuth('login')); }
  updateBadges();
}

let badges = { friends: 0 };
async function pollBadges() {
  if (!net.user) { badges = { friends: 0 }; updateBadges(); return; }
  try { const n = await get('/api/me/notifications'); badges.friends = n.friendRequests + n.challenges; } catch { /* offline */ }
  updateBadges();
}
function updateBadges() {
  $$('[data-badge]').forEach((el) => { const n = badges[el.dataset.badge] || 0; el.textContent = n > 9 ? '9+' : String(n); el.hidden = !n; });
}

function moreSheet() {
  const m = modal(`<h2>${t('Menu')}</h2><div class="more-grid">${NAV.filter((n) => !n.main && n.id !== 'home').map((n) => `<a class="more-item" href="#/${n.id}" data-close>${icon(n.icon, 24)}<span>${t(n.label)}</span></a>`).join('')}</div>
    <div class="row spread" style="margin-top:14px">${langSelect('lang-sel-sheet')}<button class="btn" id="sheet-theme" type="button"></button></div>`);
  m.el.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => m.close()));
  const tb = m.el.querySelector('#sheet-theme'); const dark = store.get('settings').theme === 'dark';
  tb.innerHTML = `${icon(dark ? 'sun' : 'moon', 18)} ${dark ? t('Light theme') : t('Dark theme')}`; tb.onclick = async () => { await toggleTheme(); m.close(); };
  m.el.querySelector('#lang-sel-sheet').onchange = (e) => changeLanguage(e.target.value);
}

function buildShell() {
  const app = appEl();
  app.hidden = false;
  const item = (n, size) => `<a href="#/${n.id}" data-nav="${n.id}">${icon(n.icon, size)}<span>${t(n.label)}</span>${n.badge ? `<i class="nav-badge" data-badge="${n.badge}" hidden></i>` : ''}</a>`;
  app.innerHTML = `
    <aside class="sidebar" aria-label="${t('Main')}">
      <a class="brand" href="#/home" aria-label="${t('Rookery home')}">${LOGO}<div><div class="brand-name">Rookery</div><div class="brand-sub">${t('Chess platform')}</div></div></a>
      <a class="btn primary lg block play-cta" href="#/play">${icon('play', 20)} ${t('Play chess')}</a>
      <nav class="nav" aria-label="${t('Primary')}">${NAV.map((n) => item(n, 20)).join('')}</nav>
      <div class="sidebar-foot">
        <div id="user-box"></div>
        <div class="streak-chip" id="streak-chip">${icon('flame', 22)}<div><span id="streak-n">0</span><small id="streak-sub">${t('Learn something today')}</small></div></div>
        <a class="btn sm block admin-link" href="/admin/" id="admin-link">${icon('lock', 16)} ${t('Admin')}</a>
        <div class="row foot-tools">${langSelect('lang-sel')}<button class="theme-toggle" id="theme-btn" type="button"></button></div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="brand" href="#/home">${LOGO}<div class="brand-name">Rookery</div></a>
        <div class="grow"></div>
        <a class="btn sm ghost admin-link" href="/admin/">${t('Admin')}</a>
        <div id="top-user"></div>
        <button class="btn icon-btn ghost" id="theme-btn-m" type="button" aria-label="${t('Switch theme')}"></button>
      </header>
      <main id="view" tabindex="-1"></main>
    </div>
    <nav class="bottomnav" aria-label="${t('Primary mobile')}">
      ${NAV.filter((n) => n.id === 'home' || n.main).map((n) => item(n, 22)).join('')}
      <button type="button" id="more-btn" data-nav="more">${icon('menu', 22)}<span>${t('More')}</span><i class="nav-badge" data-badge="friends" hidden></i></button>
    </nav>`;
  $('#theme-btn').onclick = $('#theme-btn-m').onclick = toggleTheme;
  $('#lang-sel').onchange = (e) => changeLanguage(e.target.value);
  $('#more-btn').onclick = moreSheet;
  updateThemeButtons();
  updateStreak();
  renderUser();
  onAuth(() => { renderUser(); pollBadges(); });
  onNotify((m) => { if (m.kind === 'challenge') toast(t('{name} challenged you to a game', { name: m.from }), 'good'); pollBadges(); });
  setInterval(pollBadges, 45000);
  store.onChange((k) => { if (k === 'activity') updateStreak(); });
}

export function applyTheme() {
  const theme = store.get('settings').theme;
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('rookery:theme-hint', theme); } catch { /* ignore */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c1311' : '#f5f2ea');
  updateThemeButtons();
}

function updateThemeButtons() {
  const dark = store.get('settings').theme === 'dark';
  const b = $('#theme-btn'), m = $('#theme-btn-m');
  if (b) b.innerHTML = `${icon(dark ? 'sun' : 'moon', 18)}<span>${dark ? t('Light theme') : t('Dark theme')}</span>`;
  if (m) m.innerHTML = icon(dark ? 'sun' : 'moon', 20);
}

async function toggleTheme() {
  const s = { ...store.get('settings') };
  s.theme = s.theme === 'dark' ? 'light' : 'dark';
  await store.set('settings', s);
  applyTheme();
}

function updateStreak() {
  const n = currentStreak();
  const el = $('#streak-n');
  if (!el) return;
  el.textContent = tn(n, '{n} day streak|{n} day streak');
  $('#streak-sub').textContent = n ? t('Keep it going!') : t('Learn something today');
}

async function route() {
  const token = ++navToken;
  const r = parseRoute();
  const profile = store.get('profile');
  if (!profile.onboarded && !FOCUS_ROUTES.has(r.name)) { location.hash = '/welcome'; return; }

  const app = appEl();
  const focus = FOCUS_ROUTES.has(r.name);
  app.classList.toggle('focus', focus);
  const sidebar = $('.sidebar'), topbar = $('.topbar'), bottom = $('.bottomnav');
  [sidebar, topbar, bottom].forEach((el) => { if (el) el.style.display = focus ? 'none' : ''; });
  app.style.gridTemplateColumns = focus ? '1fr' : '';

  const mount = $('#view');
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  mount.innerHTML = `<div class="view"><div class="row" style="justify-content:center;padding:80px;color:var(--muted)"><span class="spinner"></span><span>${t('Loading')}<span class="dots"></span></span></div></div>`;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));
  document.title = `${t(NAV.find((n) => n.id === r.nav)?.label ?? 'Rookery')} · Rookery`;
  document.body.dataset.route = r.name;

  try {
    const mod = await VIEWS[r.name]();
    if (token !== navToken) return; // a newer navigation started
    const view = document.createElement('div');
    view.className = 'view';
    mount.innerHTML = '';
    mount.appendChild(view);
    cleanup = (await mod.mount(view, { params: r.params, navigate })) || null;
    if (token !== navToken && cleanup) { cleanup(); cleanup = null; }
    window.scrollTo({ top: 0 });
    mount.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    mount.innerHTML = `<div class="view"><div class="empty"><div class="big">⚠️</div><h3>${t('Something went wrong')}</h3><p>${esc(err.message || err)}</p><a class="btn" href="#/home">${t('Back to Home')}</a></div></div>`;
  }
}

async function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  try {
    await navigator.serviceWorker.register('sw.js');
  } catch (e) {
    console.warn('Service worker registration failed (offline install unavailable):', e);
  }
}

async function boot() {
  await initLanguage();        // dictionary for the remembered / browser language, before anything is rendered
  await loadRemoteContent();   // optional: admin-managed lessons, puzzles, themes and settings (no-op without the server)
  await store.init();
  await loadSession();
  if (net.available) { connect(); startSync(); let uid = net.user?.id ?? null; onAuth(() => { const n = net.user?.id ?? null; if (n !== uid) { uid = n; reconnect(); } }); }
  if (reconcileLanguage()) { location.reload(); return; } // saved language differs from the early hint (e.g. restored backup)
  await applyBundledTranslations(getLang());
  installErrorReporting();
  try { if (!sessionStorage.getItem('rk_visit')) { sessionStorage.setItem('rk_visit', '1'); track('visit', null, getLang()); } } catch { /* storage blocked */ }
  applyTheme();
  buildShell();
  engineClient.start();
  window.addEventListener('hashchange', route);
  await route();
  const splash = $('#splash');
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 450);
  registerSW();
  setTimeout(showAuthPrompt, 600);
  if (store.mode === 'memory') toast(t('Storage is unavailable in this browser — progress will not be saved.'), 'bad');
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('splash').innerHTML = `<div class="splash-inner"><div>${t('Rookery could not start: {error}', { error: esc(e.message || e) })}</div></div>`;
});
