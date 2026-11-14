// A small form dialog used by the Chess World admin pages: describe the fields, get the payload back.
import { h } from './dom.js';
import { get } from './api.js';
import { modal, field, input, select, toggle, toast, problemsBox, fmtDate } from './ui.js';

const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

// fields: [{ key, label, type: text|textarea|select|toggle|datetime|number|lines, options, hint, rows, maxlength, readonly }]
export function formModal({ title, fields, values = {}, save, wide = true, history = null, extra = null }) {
  const ctl = {}, wraps = {}; const box = h('div');
  const rows = fields.map((f) => {
    const v = values[f.key];
    let c;
    if (f.type === 'textarea' || f.type === 'lines') { c = h('textarea', { rows: f.rows || 4, style: { width: '100%' }, maxlength: f.maxlength || 3000, disabled: !!f.readonly }); c.value = f.type === 'lines' ? (Array.isArray(v) ? v.map(f.toLine || String).join('\n') : '') : (v ?? ''); }
    else if (f.type === 'select') c = select(f.options, v ?? '', { disabled: !!f.readonly });
    else if (f.type === 'toggle') { c = h('input', { type: 'checkbox', checked: !!v, disabled: !!f.readonly }); const wrap = h('label', { class: 'row' }, toggle(!!v, (x) => { c.checked = x; }, f.label), h('span', null, f.label)); ctl[f.key] = c; wraps[f.key] = wrap; return wrap; }
    else if (f.type === 'datetime') c = input({ type: 'datetime-local', value: toLocal(v), disabled: !!f.readonly });
    else if (f.type === 'number') c = input({ type: 'number', value: v ?? '', min: f.min ?? 0, disabled: !!f.readonly });
    else c = input({ value: v ?? '', maxlength: f.maxlength || 200, disabled: !!f.readonly, placeholder: f.placeholder || '' });
    ctl[f.key] = c; const w = field(f.label, c, { hint: f.hint }); wraps[f.key] = w; return w;
  });
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Save');
  const hist = history ? h('button', { class: 'btn', type: 'button', onclick: () => showHistory(history) }, 'History') : null;
  const m = modal({ title, wide, body: h('div', { class: 'stack' }, rows, extra, box), footer: [hist, h('button', { class: 'btn', type: 'button', onclick: () => m.close(false) }, 'Cancel'), btn] });
  btn.onclick = async () => {
    btn.disabled = true; box.replaceChildren(); Object.values(wraps).forEach((w) => w.setError?.(''));
    const payload = {};
    for (const f of fields) {
      const c = ctl[f.key];
      if (f.readonly) continue;
      payload[f.key] = f.type === 'toggle' ? c.checked : f.type === 'datetime' ? fromLocal(c.value) : f.type === 'number' ? (c.value === '' ? null : +c.value) : f.type === 'lines' ? (f.fromLines ? f.fromLines(c.value) : c.value.split('\n').map((x) => x.trim()).filter(Boolean)) : c.value;
    }
    try { await save(payload); m.close(true); }
    catch (e) {
      const list = (e.details || []).map((d) => (typeof d === 'string' ? { message: d } : d)); let shown = false;
      for (const d of list) if (d.path && wraps[d.path]) { wraps[d.path].setError(d.message); shown = true; }
      if (!shown) box.replaceChildren(problemsBox(list.length ? list : [{ message: e.message }]));
      btn.disabled = false;
    }
  };
  return m;
}

export async function showHistory({ entity, id }) {
  let items = [];
  try { items = (await get(`/api/admin/world/history?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}`)).items; } catch (e) { toast(e.message, 'bad'); return; }
  const line = (c) => Object.entries(c || {}).map(([k, v]) => `${k}: ${v.from ?? '—'} → ${v.to ?? '—'}`).join(' · ');
  modal({ title: 'Change history', body: items.length ? h('ul', { class: 'list' }, items.map((r) => h('li', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, r.action), ' · ', r.username, h('div', { class: 'sub faint small' }, fmtDate(r.ts)), r.detail?.changes && Object.keys(r.detail.changes).length ? h('div', { class: 'mono small' }, line(r.detail.changes)) : null)))) : h('p', { class: 'muted' }, 'No changes recorded yet.') });
}
