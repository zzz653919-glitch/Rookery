// Admin shell: sign-in, sidebar layout, hash router. Authorisation is enforced by the server on every API call;
// hiding menu entries here is only a convenience.
import { h, clear, icon, $ } from './dom.js';
import { get, post, session, can, onUnauthorized } from './api.js';
import { toast, confirmDialog, loadingState, errorState, field, input } from './ui.js';

const root = document.getElementById('root');

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard:read' },
  { sec: 'Content' },
  { id: 'lessons', label: 'Lessons', icon: 'book', perm: 'content:read' },
  { id: 'puzzles', label: 'Puzzles', icon: 'puzzle', perm: 'content:read' },
  { id: 'themes', label: 'Themes', icon: 'palette', perm: 'themes:read' },
  { sec: 'Site' },
  { id: 'settings', label: 'Chess settings', icon: 'gear', perm: 'settings:read' },
  { id: 'users', label: 'Users & progress', icon: 'users', perm: 'dashboard:read' },
  { sec: 'Administration' },
  { id: 'audit', label: 'Audit log', icon: 'log', perm: 'audit:read' },
  { id: 'admins', label: 'Administrators', icon: 'shield', perm: 'admins:manage' },
];
const VIEWS = {
  dashboard: () => import('./views/dashboard.js'), lessons: () => import('./views/lessons.js'), puzzles: () => import('./views/puzzles.js'),
  themes: () => import('./views/themes.js'), settings: () => import('./views/settings.js'), users: () => import('./views/users.js'),
  audit: () => import('./views/audit.js'), admins: () => import('./views/admins.js'), account: () => import('./views/account.js'),
};
const TITLES = { dashboard: 'Dashboard', lessons: 'Lessons', puzzles: 'Puzzles', themes: 'Themes', settings: 'Chess settings', users: 'Users & progress', audit: 'Audit log', admins: 'Administrators', account: 'My account' };

let cleanup = null, guard = null, token = 0, prevHash = '', shell = null;

export const navigate = (path) => { location.hash = path; };
export const setGuard = (fn) => { guard = fn; };

// ---------------------------------------------------------------------------------------------------- login
function renderLogin(info = {}, message = '') {
  cleanup?.(); cleanup = null; guard = null;
  clear(root);
  const user = input({ id: 'u', name: 'username', autocomplete: 'username', required: true, autofocus: true });
  const pass = input({ id: 'p', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const err = h('div', { class: 'notice bad', role: 'alert', hidden: !message }, message);
  const btn = h('button', { class: 'btn primary', type: 'submit', style: { width: '100%' } }, 'Sign in');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (!user.value.trim() || !pass.value) { err.hidden = false; err.textContent = 'Enter your username and password.'; return; }
    btn.disabled = true; btn.textContent = 'Signing in…'; err.hidden = true;
    try {
      const r = await post('/api/admin/login', { username: user.value.trim(), password: pass.value });
      pass.value = '';
      session.admin = r.admin; session.csrf = r.csrf;
      const s = await get('/api/admin/session');
      session.perms = s.perms;
      location.hash = location.hash && location.hash !== '#/login' ? location.hash : '#/dashboard';
      enterApp();
    } catch (e2) { err.hidden = false; err.textContent = e2.message; btn.disabled = false; btn.textContent = 'Sign in'; pass.value = ''; pass.focus(); }
  } },
  field('Username', user), field('Password', pass), err, btn);
  root.appendChild(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card stack' },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('chess', 20)), h('div', null, 'Rookery', h('small', null, 'Admin panel'))),
    h('div', null, h('h1', null, 'Sign in'), h('p', { class: 'muted' }, 'Administrators only. Players use the main site.')),
    info.setupNeeded ? h('div', { class: 'notice warn' }, h('strong', null, 'No administrator exists yet. '), 'Create the first one on the server, in a terminal:', h('br'), h('code', null, 'npm run admin:create -- --username <name>')) : null,
    form,
    h('p', { class: 'faint small', style: { margin: 0 } }, 'Sessions end after a period of inactivity. Repeated failed sign-ins are temporarily blocked.'))));
}

// ---------------------------------------------------------------------------------------------------- shell
function enterApp() {
  clear(root);
  const collapsed = (() => { try { return localStorage.getItem('rookery-admin:collapsed') === '1'; } catch { return false; } })();
  shell = h('div', { class: 'shell' + (collapsed ? ' collapsed' : '') });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Admin' }, NAV.map((n) => n.sec ? h('div', { class: 'sec' }, n.sec) : (can(n.perm) ? h('a', { href: `#/${n.id}`, dataset: { nav: n.id } }, icon(n.icon), h('span', { class: 't' }, n.label)) : null)));
  const side = h('aside', { class: 'side' },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('chess', 20)), h('div', { class: 'bt' }, 'Rookery', h('small', null, 'Admin'))), nav,
    h('div', { class: 'side-foot' },
      h('a', { class: 'btn ghost sm', href: '../', target: '_blank', rel: 'noopener', style: { justifyContent: 'flex-start' } }, icon('play', 16), h('span', { class: 't' }, 'Open player site')),
      h('button', { class: 'btn ghost sm collapse-btn', type: 'button', style: { justifyContent: 'flex-start' }, onclick: () => { shell.classList.toggle('collapsed'); try { localStorage.setItem('rookery-admin:collapsed', shell.classList.contains('collapsed') ? '1' : '0'); } catch { /* ignore */ } } }, icon('collapse', 16), h('span', { class: 't' }, 'Collapse menu'))));
  const title = h('h1', { id: 'page-title' }, '');
  const themeBtn = h('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Toggle light / dark theme', onclick: toggleTheme }, icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'));
  function toggleTheme() {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; try { localStorage.setItem('rookery-admin:theme', t); } catch { /* ignore */ }
    themeBtn.replaceChildren(icon(t === 'dark' ? 'sun' : 'moon'));
    window.dispatchEvent(new CustomEvent('admin-theme'));
  }
  const top = h('header', { class: 'top' },
    h('button', { class: 'btn ghost icon burger', type: 'button', 'aria-label': 'Open menu', onclick: () => shell.classList.toggle('drawer') }, icon('menu')),
    title, h('div', { class: 'grow' }), themeBtn,
    h('a', { class: 'btn sm', href: '#/account', title: 'My account' }, icon('users', 16), session.admin.username, h('span', { class: 'badge info' }, session.admin.role)),
    h('button', { class: 'btn sm', type: 'button', onclick: logout }, icon('logout', 16), 'Sign out'));
  const view = h('main', { class: 'page', id: 'view', tabindex: '-1' });
  shell.append(side, h('div', { class: 'scrim', onclick: () => shell.classList.remove('drawer') }), h('div', { class: 'main' }, top, view));
  root.appendChild(shell);
  route(true);
}

async function logout() {
  if (guard?.() && !(await confirmDialog({ title: 'Discard unsaved changes?', message: 'You have unsaved changes that will be lost.', ok: 'Sign out anyway', danger: true }))) return;
  try { await post('/api/admin/logout'); } catch { /* already signed out */ }
  session.admin = null; session.csrf = null; session.perms = [];
  location.hash = '#/login';
  renderLogin({}, '');
  toast('You have been signed out.', 'good');
}

function parse() {
  const parts = (location.hash || '#/dashboard').replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'dashboard', params: parts.slice(1) };
}

async function route(first = false) {
  if (!session.admin) return;
  const hash = location.hash;
  if (!first && guard?.() && hash !== prevHash) {
    const stay = !(await confirmDialog({ title: 'Discard unsaved changes?', message: 'You have unsaved changes on this page. Leaving now will lose them.', ok: 'Discard and leave', danger: true }));
    if (stay) { history.replaceState(null, '', prevHash || '#/dashboard'); return; }
  }
  guard = null;
  prevHash = hash;
  const { name, params } = parse();
  const my = ++token;
  cleanup?.(); cleanup = null;
  const view = $('#view'); if (!view) return;
  shell.classList.remove('drawer');
  view.replaceChildren(h('div', { class: 'card' }, loadingState(5)));
  const nav = NAV.find((n) => n.id === name);
  if (!VIEWS[name] || (nav && !can(nav.perm))) { view.replaceChildren(errorState({ message: VIEWS[name] ? 'You do not have access to this section.' : 'That page does not exist.' }, () => navigate('/dashboard'))); $('#page-title').textContent = 'Not available'; return; }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  $('#page-title').textContent = TITLES[name]; document.title = `${TITLES[name]} · Rookery Admin`;
  try {
    const mod = await VIEWS[name]();
    if (my !== token) return;
    const host = h('div');
    view.replaceChildren(host);
    cleanup = (await mod.mount(host, { params, navigate, setGuard, setTitle: (t) => { $('#page-title').textContent = t; } })) || null;
    if (my !== token) { cleanup?.(); cleanup = null; }
    window.scrollTo({ top: 0 });
  } catch (e) { if (my === token) view.replaceChildren(errorState(e, () => route(true))); }
}

window.addEventListener('hashchange', () => { if (session.admin) route(); });
window.addEventListener('beforeunload', (e) => { if (guard?.()) { e.preventDefault(); e.returnValue = ''; } });
onUnauthorized(() => {
  if (!session.admin) return;
  session.admin = null; session.csrf = null; session.perms = [];
  renderLogin({}, 'Your session has ended. Please sign in again.');
});

(async function start() {
  try {
    const s = await get('/api/admin/session');
    if (s.authenticated) { session.admin = s.admin; session.perms = s.perms; session.csrf = s.csrf; enterApp(); }
    else renderLogin(s);
  } catch (e) { clear(root); root.appendChild(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' }, errorState(e, () => location.reload())))); }
})();
