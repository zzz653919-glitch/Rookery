// Rookery app shell: layout, hash router, theme, offline status.
import { store, currentStreak } from './store.js';
import { icon, LOGO } from './ui/icons.js';
import { $, $$, esc, toast } from './ui/dom.js';
import { engineClient } from './engine-client.js';

const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'play', label: 'Play', icon: 'play' },
  { id: 'learn', label: 'Learn', icon: 'book' },
  { id: 'puzzles', label: 'Puzzles', icon: 'puzzle' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

const VIEWS = {
  home: () => import('./views/home.js'),
  play: () => import('./views/play.js'),
  learn: () => import('./views/learn.js'),
  lesson: () => import('./views/lesson.js'),
  puzzles: () => import('./views/puzzles.js'),
  progress: () => import('./views/progress.js'),
  settings: () => import('./views/settings.js'),
  welcome: () => import('./views/welcome.js'),
  test: () => import('./views/placement.js'),
};
const FOCUS_ROUTES = new Set(['welcome', 'test']);

let cleanup = null;
let navToken = 0;
const appEl = () => document.getElementById('app');

export function navigate(path) {
  if (location.hash === '#' + path) route();
  else location.hash = path;
}

export function parseRoute() {
  const raw = (location.hash || '#/home').replace(/^#/, '');
  const parts = raw.split('?')[0].split('/').filter(Boolean);
  const name = parts[0] || 'home';
  if (name === 'learn' && parts[1]) return { name: 'lesson', params: { id: decodeURIComponent(parts[1]) }, nav: 'learn' };
  if (name === 'puzzles' && parts[1]) return { name: 'puzzles', params: { mode: parts[1] }, nav: 'puzzles' };
  if (!VIEWS[name]) return { name: 'home', params: {}, nav: 'home' };
  return { name, params: {}, nav: name };
}

function buildShell() {
  const app = appEl();
  app.hidden = false;
  app.innerHTML = `
    <aside class="sidebar" aria-label="Main">
      <a class="brand" href="#/home" aria-label="Rookery home">${LOGO}<div><div class="brand-name">Rookery</div><div class="brand-sub">Chess academy</div></div></a>
      <nav class="nav" aria-label="Primary">
        ${NAV.map((n) => `<a href="#/${n.id}" data-nav="${n.id}">${icon(n.icon, 20)}<span>${n.label}</span></a>`).join('')}
      </nav>
      <div class="sidebar-foot">
        <div class="streak-chip" id="streak-chip">${icon('flame', 22)}<div><span id="streak-n">0</span> day streak<small id="streak-sub">Learn something today</small></div></div>
        <div class="chip" id="net-chip" title="Rookery stores everything on this device"></div>
        <button class="theme-toggle" id="theme-btn" type="button"></button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="brand" href="#/home">${LOGO}<div class="brand-name">Rookery</div></a>
        <button class="btn icon-btn ghost" id="theme-btn-m" type="button" aria-label="Switch theme"></button>
      </header>
      <main id="view" tabindex="-1"></main>
    </div>
    <nav class="bottomnav" aria-label="Primary mobile">
      ${NAV.map((n) => `<a href="#/${n.id}" data-nav="${n.id}">${icon(n.icon, 22)}<span>${n.label}</span></a>`).join('')}
    </nav>`;
  $('#theme-btn').onclick = $('#theme-btn-m').onclick = toggleTheme;
  updateThemeButtons();
  updateStreak();
  updateNet();
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  store.onChange((k) => { if (k === 'activity') updateStreak(); });
}

export function applyTheme() {
  const t = store.get('settings').theme;
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('rookery:theme-hint', t); } catch { /* ignore */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0c1311' : '#f5f2ea');
  updateThemeButtons();
}

function updateThemeButtons() {
  const dark = store.get('settings').theme === 'dark';
  const b = $('#theme-btn'), m = $('#theme-btn-m');
  if (b) b.innerHTML = `${icon(dark ? 'sun' : 'moon', 18)}<span>${dark ? 'Light theme' : 'Dark theme'}</span>`;
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
  el.textContent = n;
  $('#streak-sub').textContent = n ? 'Keep it going!' : 'Learn something today';
}

function updateNet() {
  const el = $('#net-chip');
  if (!el) return;
  const online = navigator.onLine;
  el.innerHTML = online ? `${icon('check', 14)} Works offline` : `${icon('wifioff', 14)} Offline — all good`;
  el.className = 'chip ' + (online ? '' : 'good');
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
  mount.innerHTML = `<div class="view"><div class="row" style="justify-content:center;padding:80px;color:var(--muted)"><span class="spinner"></span><span>Loading<span class="dots"></span></span></div></div>`;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));
  document.title = `${NAV.find((n) => n.id === r.nav)?.label ?? 'Rookery'} · Rookery`;

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
    mount.innerHTML = `<div class="view"><div class="empty"><div class="big">⚠️</div><h3>Something went wrong</h3><p>${esc(err.message || err)}</p><a class="btn" href="#/home">Back to Home</a></div></div>`;
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
  await store.init();
  applyTheme();
  buildShell();
  engineClient.start();
  window.addEventListener('hashchange', route);
  await route();
  const splash = $('#splash');
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 450);
  registerSW();
  if (store.mode === 'memory') toast('Storage is unavailable in this browser — progress will not be saved.', 'bad');
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('splash').innerHTML = `<div class="splash-inner"><div>Rookery could not start: ${esc(e.message || e)}</div></div>`;
});
