import { h } from '../dom.js';
import { get, post, put, can } from '../api.js';
import { dataTable, modal, field, input, select, toast, badge, fmtDate, problemsBox, confirmDialog } from '../ui.js';

const stateOf = (t) => (t.status === 'cancelled' ? 'cancelled' : Date.now() < Date.parse(t.startsAt) ? 'upcoming' : Date.now() < Date.parse(t.endsAt) ? 'running' : 'finished');
const localInput = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export async function mount(host) {
  const writable = can('content:write');
  let controls = [];
  const table = dataTable({
    search: false,
    fetch: async () => { const r = await get('/api/admin/tournaments'); controls = r.controls; return { items: r.items, total: r.items.length, page: 1, pageSize: 100 }; },
    toolbarExtra: writable ? h('button', { class: 'btn primary', type: 'button', style: { marginLeft: 'auto' }, onclick: () => edit(null) }, 'New tournament') : null,
    columns: [
      { label: 'Tournament', render: (t) => h('div', null, h('strong', null, t.name), t.description ? h('div', { class: 'sub' }, t.description) : null) },
      { label: 'Time control', render: (t) => `${t.base >= 60 ? t.base / 60 : t.base + 's'}+${t.inc} · ${t.category}` },
      { label: 'Starts', render: (t) => fmtDate(t.startsAt) },
      { label: 'Duration', render: (t) => `${t.durationMin} min` },
      { label: 'Players', render: (t) => String(t.players) },
      { label: 'Status', render: (t) => { const s = stateOf(t); return badge(s, s === 'running' ? 'good' : s === 'cancelled' ? 'bad' : ''); } },
      { label: '', class: 'actions', render: (t) => writable ? h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        Date.parse(t.startsAt) > Date.now() && t.status !== 'cancelled' ? h('button', { class: 'btn sm', type: 'button', onclick: () => edit(t) }, 'Edit') : null,
        t.status !== 'cancelled' && stateOf(t) !== 'finished' ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Cancel tournament?', message: `“${t.name}” will disappear from the site.`, ok: 'Cancel tournament', danger: true })) { try { await put(`/api/admin/tournaments/${t.id}`, { status: 'cancelled' }); toast('Tournament cancelled.'); table.reload(); } catch (e) { toast(e.message, 'bad'); } } } }, 'Cancel') : null) : null },
    ],
    empty: { title: 'No tournaments yet', body: 'Schedule an arena event: players score points in a time window.' },
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Tournaments'), h('p', null, 'Arena tournaments: win 2 points, draw 1 — two wins in a row double the points.'))), table);

  function edit(t) {
    const name = input({ value: t?.name || '', maxlength: 80 }), desc = input({ value: t?.description || '', maxlength: 400 });
    const tc = select((controls.length ? controls : [[180, 0], [300, 0]]).map(([b, i]) => [`${b}+${i}`, `${b >= 60 ? b / 60 : b + 's'}+${i}`]), t ? `${t.base}+${t.inc}` : '180+0');
    const start = h('input', { type: 'datetime-local', value: localInput(t?.startsAt || new Date(Date.now() + 3600000).toISOString()) });
    const dur = input({ type: 'number', value: String(t?.durationMin || 60), min: 10, max: 720 });
    const box = h('div'), save = h('button', { class: 'btn primary', type: 'button' }, 'Save');
    const m = modal({ title: t ? 'Edit tournament' : 'New tournament', body: h('div', { class: 'stack' }, field('Name', name), field('Description (optional)', desc), field('Time control', tc), field('Starts at', start, { hint: 'In your local time.' }), field('Duration (minutes)', dur), box), footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });
    save.onclick = async () => {
      save.disabled = true; box.replaceChildren();
      const [base, inc] = tc.value.split('+').map(Number);
      const body = { name: name.value, description: desc.value, base, inc, startsAt: new Date(start.value).toISOString(), durationMin: +dur.value };
      try { t ? await put(`/api/admin/tournaments/${t.id}`, body) : await post('/api/admin/tournaments', body); toast('Saved.'); m.close(); table.reload(); }
      catch (e) { box.replaceChildren(problemsBox(e.details ? e.details.map((d) => (typeof d === 'string' ? { message: d } : d)) : [{ message: e.message }])); save.disabled = false; }
    };
  }
}
