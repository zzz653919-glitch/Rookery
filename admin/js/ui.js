// Shared UI pieces: toasts, confirm/modal dialogs, form fields, tables with search + pagination, states.
import { h, clear, icon, append, tr } from './dom.js';

export function toast(message, kind = 'good', ms = 4200) {
  const el = h('div', { class: `toast ${kind}`, role: kind === 'bad' ? 'alert' : 'status' }, message);
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---- modal -------------------------------------------------------------------------------------------
export function modal({ title, body, footer, wide = false, onClose }) {
  const root = document.getElementById('modal-root');
  const prevFocus = document.activeElement;
  const back = h('div', { class: 'modal-back', role: 'presentation' });
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', null, h('h2', null, title)), h('div', { class: 'body' }, body), footer ? h('footer', null, footer) : null);
  back.appendChild(box);
  const close = (result) => { back.remove(); document.removeEventListener('keydown', key); prevFocus?.focus?.(); onClose?.(result); };
  const key = (e) => { if (e.key === 'Escape') close(null); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
  document.addEventListener('keydown', key);
  root.appendChild(back);
  (box.querySelector('input, select, textarea, button.primary') || box).focus?.();
  return { close, box };
}

// Resolves true/false. `typeToConfirm` makes the user type a word (used for deletes).
export function confirmDialog({ title, message, ok = 'Confirm', danger = false, typeToConfirm = null }) {
  return new Promise((resolve) => {
    let input = null;
    const okBtn = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', disabled: !!typeToConfirm }, ok);
    const m = modal({
      title,
      body: h('div', { class: 'stack tight' }, h('p', null, message),
        typeToConfirm ? h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'confirm-in' }, `Type ${typeToConfirm} to confirm`),
          input = h('input', { type: 'text', id: 'confirm-in', autocomplete: 'off', oninput: () => { okBtn.disabled = input.value.trim() !== typeToConfirm; } })) : null),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close(false) }, 'Cancel'), okBtn],
      onClose: (r) => resolve(r === true),
    });
    okBtn.onclick = () => m.close(true);
  });
}

// ---- fields ------------------------------------------------------------------------------------------
let fid = 0;
export function field(label, control, { hint, error, id } = {}) {
  const i = id || `f${++fid}`;
  if (control.id === '' || !control.id) control.id = i;
  const wrap = h('div', { class: 'field' + (error ? ' invalid' : '') }, label ? h('label', { class: 'lbl', for: control.id }, label) : null, control,
    hint ? h('div', { class: 'hint' }, hint) : null, h('div', { class: 'err', hidden: !error }, error || ''));
  wrap.setError = (msg) => { wrap.classList.toggle('invalid', !!msg); const e = wrap.querySelector('.err'); e.textContent = tr(msg || ''); e.hidden = !msg; };
  wrap.control = control;
  return wrap;
}
export const input = (props = {}) => h('input', { type: 'text', autocomplete: 'off', ...props });
export function select(options, value, props = {}) {
  const s = h('select', props, options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) }, t); }));
  s.value = value ?? options[0]?.[0] ?? options[0];
  return s;
}
export function toggle(checked, onchange, label) {
  const i = h('input', { type: 'checkbox', checked: !!checked, 'aria-label': label, onchange: () => onchange?.(i.checked) });
  return h('span', { class: 'switch' }, i, h('span'));
}
export const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);

// Show server validation problems [{path,message}] in a box.
export function problemsBox(list, title = 'Please fix the following') {
  if (!list || !list.length) return null;
  return h('div', { class: 'problems', role: 'alert' }, h('strong', null, title), h('ul', null, list.map((p) => h('li', null, p.path ? h('code', null, p.path + ': ') : null, p.message))));
}

// ---- states ------------------------------------------------------------------------------------------
export const loadingState = (lines = 4) => h('div', { class: 'stack', 'aria-busy': 'true' }, Array.from({ length: lines }, (_, i) => h('div', { class: 'skeleton', style: { width: `${95 - i * 12}%` } })));
export const emptyState = (title, body, action) => h('div', { class: 'empty' }, h('div', { class: 'big' }, '♟'), h('h3', null, title), body ? h('p', null, body) : null, action || null);
export const errorState = (err, retry) => h('div', { class: 'empty' }, h('div', { class: 'big' }, '⚠️'), h('h3', null, 'Something went wrong'), h('p', null, err?.message || String(err)), retry ? h('button', { class: 'btn', type: 'button', onclick: retry }, 'Try again') : null);

// ---- paged, searchable table ---------------------------------------------------------------------------
// opts: { columns:[{label, render(row)->Node|string, class?}], fetch(params)->{items,total,page,pageSize}, filters:[{key,label,options:[[v,t]]}], search:true, empty:{title,body}, toolbarExtra:Node, rowKey }
export function dataTable(opts) {
  const state = { page: 1, q: '', filters: {}, loading: false };
  const root = h('div', { class: 'card flush' });
  const bar = h('div', { class: 'toolbar' });
  const tableHost = h('div', { class: 'table-wrap' });
  const pager = h('div', { class: 'pager' });
  let timer = null, seq = 0;
  if (opts.search !== false) {
    const s = h('input', { type: 'search', placeholder: opts.searchPlaceholder || 'Search…', 'aria-label': 'Search', oninput: () => { clearTimeout(timer); timer = setTimeout(() => { state.q = s.value.trim(); state.page = 1; load(); }, 280); } });
    bar.appendChild(h('div', { class: 'field grow' }, s));
  }
  for (const f of opts.filters || []) {
    const sel = select([['', f.label], ...f.options], '', { 'aria-label': f.label, onchange: () => { state[f.key] = sel.value; state.filters[f.key] = sel.value; state.page = 1; load(); opts.onFilter?.(state.filters); } });
    bar.appendChild(h('div', { class: 'field' }, sel));
  }
  if (opts.toolbarExtra) bar.appendChild(opts.toolbarExtra);
  root.append(bar, tableHost, pager);

  async function load() {
    const my = ++seq;
    clear(tableHost).appendChild(h('div', { style: { padding: '18px' } }, loadingState(5)));
    try {
      const data = await opts.fetch({ page: state.page, q: state.q, ...state.filters });
      if (my !== seq) return;
      state.data = data;
      render(data);
    } catch (e) { if (my === seq) { clear(tableHost).appendChild(errorState(e, load)); clear(pager); } }
  }
  function render(data) {
    clear(tableHost);
    if (!data.items.length) {
      const filtered = state.q || Object.values(state.filters).some(Boolean);
      tableHost.appendChild(emptyState(filtered ? 'No matches' : opts.empty?.title || 'Nothing here yet', filtered ? 'Try a different search or clear the filters.' : opts.empty?.body, filtered ? null : opts.empty?.action));
    } else {
      tableHost.appendChild(h('table', { class: 'data' },
        h('thead', null, h('tr', null, opts.columns.map((c) => h('th', { scope: 'col', class: c.class || '' }, c.label)))),
        h('tbody', null, data.items.map((row, i) => h('tr', { dataset: { key: opts.rowKey ? row[opts.rowKey] : i } }, opts.columns.map((c) => h('td', { class: c.class || '' }, c.render(row, i, data.items))))))));
    }
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    clear(pager);
    pager.append(h('span', null, `${data.total} ${data.total === 1 ? 'item' : 'items'}`),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', disabled: data.page <= 1, onclick: () => { state.page--; load(); } }, 'Previous'),
        h('span', null, `Page ${data.page} of ${pages}`), h('button', { class: 'btn sm', type: 'button', disabled: data.page >= pages, onclick: () => { state.page++; load(); } }, 'Next')));
  }
  root.reload = load; root.state = state;
  load();
  return root;
}

export const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
export const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!isFinite(s)) return '';
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return `${Math.floor(s / 86400)} d ago`;
};
export const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const fmtDuration = (s) => { const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${hh}h` : hh ? `${hh}h ${m}m` : `${m}m ${s % 60}s`; };
export { h, clear, icon, append };
