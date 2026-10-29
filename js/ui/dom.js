// Small DOM helpers shared by all views.
import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, kind = '') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

// Modal dialog. Returns { close, el }. content is an HTML string.
export function modal(content, { dismissible = true, onClose } = {}) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${content}</div>`;
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (val) => {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
    onClose?.(val);
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(null); };
  document.addEventListener('keydown', onKey);
  if (dismissible) back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
  root.appendChild(back);
  const first = back.querySelector('[autofocus], button, [href]');
  first?.focus?.();
  return { close, el: back.firstElementChild, back };
}

export function confirmDialog({ title, body, ok = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const m = modal(`
      <h2>${esc(title)}</h2>
      <p class="muted">${body}</p>
      <div class="actions">
        <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>
        <button class="btn ghost" data-cancel>${esc(cancel)}</button>
      </div>`, { onClose: (v) => resolve(v === true) });
    m.el.querySelector('[data-ok]').onclick = () => m.close(true);
    m.el.querySelector('[data-cancel]').onclick = () => m.close(false);
  });
}

export function emptyState({ emoji = '♟', title, body, actionHtml = '' }) {
  return `<div class="empty"><div class="big">${emoji}</div><h3>${esc(title)}</h3><p>${body}</p>${actionHtml}</div>`;
}

export function loader(text = 'Loading') {
  return `<div class="row" style="justify-content:center;padding:40px;color:var(--muted)"><span class="spinner"></span><span>${esc(text)}<span class="dots"></span></span></div>`;
}

export function ring(pct, label) {
  const p = Math.max(0, Math.min(1, pct));
  return `<div class="ring" style="--p:${p}"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" cx="50" cy="50" r="46"/></svg><div class="lbl">${esc(label)}</div></div>`;
}

export function progressBar(pct) {
  return `<div class="progress"><i style="width:${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%"></i></div>`;
}

export const fmtClock = (ms) => {
  ms = Math.max(0, ms);
  const total = Math.ceil(ms / 1000);
  if (ms < 10000) { const t = Math.floor(ms / 100) / 10; return `0:${t.toFixed(1).padStart(4, '0')}`; }
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export { icon };
