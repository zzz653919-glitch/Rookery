import { h } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { dataTable, toast, badge, fmtDate, confirmDialog } from '../ui.js';
import { formModal } from '../world-form.js';

const LEVELS = [['', '—'], ['international', 'International'], ['continental', 'Continental'], ['national', 'National'], ['online', 'Online']];
const TCS = [['', '—'], ['standard', 'Classical'], ['rapid', 'Rapid'], ['blitz', 'Blitz']];
const STATUSES = [['', 'Automatic (from the dates and the feed)'], ['upcoming', 'Upcoming'], ['live', 'Live'], ['completed', 'Completed']];
const day = { toLine: (r) => `${r.name} | ${r.startsAt || ''}`, fromLines: (v) => v.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, startsAt] = l.split('|').map((x) => x.trim()); return { name, startsAt }; }) };

export async function mount(host) {
  const writable = can('content:write');
  const table = dataTable({
    searchPlaceholder: 'Search tournaments…',
    filters: [{ key: 'origin', label: 'All sources', options: [['admin', 'Added by editors'], ['lichess', 'Official feed']] }],
    fetch: ({ page, q, origin }) => get(`/api/admin/world/events?page=${page}&q=${encodeURIComponent(q || '')}&origin=${origin || ''}`),
    toolbarExtra: writable ? h('button', { class: 'btn primary', type: 'button', style: { marginLeft: 'auto' }, onclick: () => edit(null) }, 'New tournament') : null,
    columns: [
      { label: 'Tournament', render: (e) => h('div', null, h('strong', null, e.name), h('div', { class: 'sub' }, [e.location, e.format].filter(Boolean).join(' · '))) },
      { label: 'Status', render: (e) => [badge(e.status === 'live' ? 'Live' : e.status === 'completed' ? 'Completed' : 'Upcoming', e.status === 'live' ? 'bad' : e.status === 'completed' ? '' : 'good'), e.confirmed ? null : badge('Provisional', 'warn'), e.featured ? badge('Featured', 'info') : null] },
      { label: 'Dates', render: (e) => `${fmtDate(e.starts_on)} → ${fmtDate(e.ends_on)}` },
      { label: 'Source', render: (e) => (e.origin === 'lichess' ? (e.locked ? 'Official feed (corrected)' : 'Official feed') : 'Editors') },
      { label: '', class: 'actions', render: (e) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn sm', type: 'button', onclick: () => edit(e.id) }, writable ? 'Edit' : 'View'),
        writable && e.origin === 'lichess' ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { const r = await post(`/api/admin/world/events/${e.id}/sync`, {}); toast(`${r.done} / ${r.rounds}`); } catch (x) { toast(x.message, 'bad'); } } }, 'Import games') : null,
        writable && e.origin === 'admin' ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete tournament?', message: 'The tournament and its games will be deleted.', ok: 'Delete', danger: true })) { try { await del(`/api/admin/world/events/${e.id}?confirm=${e.id}`); toast('Deleted'); table.reload(); } catch (x) { toast(x.message, 'bad'); } } } }, 'Delete') : null) },
    ],
    empty: { title: 'No tournaments yet', body: 'Tournaments from the official feed appear here automatically. Add national events and other tournaments yourself.' },
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Chess World tournaments'), h('p', null, 'Official tournaments are imported from the Lichess broadcast feed. You can add events of your own and correct any entry; corrected entries are kept when the feed updates and every change is written to the history.'))), table);

  async function edit(id) {
    let e = { confirmed: 1, schedule: [] };
    if (id) { try { e = await get(`/api/admin/world/events/${id}`); } catch (x) { toast(x.message, 'bad'); return; } }
    formModal({
      title: id ? 'Edit tournament' : 'New tournament', values: e, history: id ? { entity: 'world_event', id } : null,
      fields: [
        { key: 'name', label: 'Name', maxlength: 160, readonly: !writable }, { key: 'level', label: 'Level', type: 'select', options: LEVELS }, { key: 'location', label: 'Location (city, country)', readonly: !writable },
        { key: 'starts_on', label: 'Starts', type: 'datetime' }, { key: 'ends_on', label: 'Ends', type: 'datetime' },
        { key: 'format', label: 'Format', readonly: !writable, hint: 'For example: 9-round Swiss' }, { key: 'tc', label: 'Time control', readonly: !writable }, { key: 'fide_tc', label: 'Rating category', type: 'select', options: TCS },
        { key: 'prize', label: 'Prize fund (only when officially published)', readonly: !writable }, { key: 'registration_url', label: 'Registration link', readonly: !writable }, { key: 'website', label: 'Official website', readonly: !writable }, { key: 'standings_url', label: 'Official standings link', readonly: !writable },
        { key: 'image', label: 'Image address (https)', readonly: !writable }, { key: 'players_text', label: 'Participants', type: 'textarea', rows: 2 },
        { key: 'schedule', label: 'Daily schedule', type: 'lines', rows: 4, ...day, hint: 'One round per line: Round 1 | 2027-03-01T14:00:00Z' },
        { key: 'confirmed', label: 'Schedule officially confirmed', type: 'toggle' }, { key: 'featured', label: 'Feature on the Chess World page', type: 'toggle' },
        { key: 'status_override', label: 'Status', type: 'select', options: STATUSES, hint: 'Use this only to correct a wrong status.' },
        { key: 'source_name', label: 'Source name', readonly: !writable }, { key: 'source_url', label: 'Source link', readonly: !writable },
      ].map((f) => (writable ? f : { ...f, readonly: true })),
      save: async (p) => { id ? await put(`/api/admin/world/events/${id}`, p) : await post('/api/admin/world/events', p); toast('Saved'); table.reload(); },
    });
  }
}
