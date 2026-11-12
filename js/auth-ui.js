// Sign in / sign up dialog.
import { modal, esc, toast } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { t } from './i18n/core.js';
import { net, login, register } from './net.js';

let open = null;

// Resolves true when the player ends up signed in, false when the dialog is dismissed.
export function openAuth(mode = 'login') {
  if (open) return open.promise;
  let resolve; const promise = new Promise((r) => { resolve = r; });
  let current = mode;
  const m = modal('<div id="auth-body"></div>', { onClose: () => { open = null; resolve(!!net.user); } });
  open = { promise };
  const render = () => {
    const reg = current === 'register';
    m.el.querySelector('#auth-body').innerHTML = `
      <div class="auth-head">
        <div class="segmented auth-tabs" role="tablist"><button type="button" role="tab" data-m="login" aria-pressed="${!reg}">${t('Sign in')}</button><button type="button" role="tab" data-m="register" aria-pressed="${reg}">${t('Create account')}</button></div>
        <h2>${reg ? t('Join Rookery') : t('Welcome back')}</h2>
        <p class="muted">${reg ? t('Play rated games online, climb the leaderboards and keep your progress on every device.') : t('Sign in to play online and sync your progress.')}</p>
      </div>
      <form id="auth-form" novalidate>
        <label class="field"><span>${t('Username')}</span><input id="au-name" name="username" autocomplete="username" maxlength="20" required autofocus><small class="err" id="au-name-err"></small></label>
        <label class="field"><span>${t('Password')}</span><input id="au-pass" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" maxlength="128" required><small class="err" id="au-pass-err"></small></label>
        ${reg ? `<small class="muted">${t('Username: 3–20 letters, digits, dash or underscore. Password: at least 8 characters with letters and digits.')}</small>` : ''}
        <div class="notice bad" id="au-err" role="alert" hidden></div>
        <button class="btn primary wide" type="submit" id="au-go">${reg ? t('Create account') : t('Sign in')}</button>
      </form>`;
    m.el.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { current = b.dataset.m; render(); }; });
    const form = m.el.querySelector('#auth-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const u = form.username.value.trim(), p = form.password.value;
      const err = m.el.querySelector('#au-err'); err.hidden = true;
      m.el.querySelectorAll('.err').forEach((x) => { x.textContent = ''; });
      if (!u || !p) { err.hidden = false; err.textContent = t('Enter your username and password.'); return; }
      const btn = m.el.querySelector('#au-go'); btn.disabled = true;
      try {
        await (reg ? register(u, p) : login(u, p));
        toast(t('Signed in as {name}', { name: u }), 'good');
        m.close(true);
      } catch (ex) {
        btn.disabled = false;
        const det = Array.isArray(ex.details) ? ex.details : [];
        const f = (path) => det.find((d) => d.path === path)?.message;
        if (f('username')) m.el.querySelector('#au-name-err').textContent = t(f('username'));
        if (f('password')) m.el.querySelector('#au-pass-err').textContent = t(f('password'));
        if (!det.length || ex.status === 401 || ex.status === 429 || ex.status === 403) { err.hidden = false; err.textContent = t(ex.message); }
        else if (det.some((d) => d.path === 'password' && !f('password'))) { err.hidden = false; err.textContent = det.map((d) => t(d.message)).join(' '); }
        if (det.length && !f('username') && !f('password')) { err.hidden = false; err.textContent = det.map((d) => t(d.message || d)).join(' '); }
        form.password.value = '';
      }
    };
  };
  render();
  return promise;
}

// Use before any action that needs an account: await ensureSignedIn() — false means the player declined.
export async function ensureSignedIn(mode = 'login') {
  if (!net.available) { toast(t('Online play needs the Rookery server.'), 'bad'); return false; }
  if (net.user) return true;
  return openAuth(mode);
}
