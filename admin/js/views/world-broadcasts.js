import { h } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { dataTable, toast, badge, fmtDate, confirmDialog } from '../ui.js';
import { formModal } from '../world-form.js';

const PROVIDERS = [['youtube_live', 'YouTube channel (its current live stream)'], ['youtube_video', 'YouTube video or recording'], ['twitch', 'Twitch channel'], ['lichess', 'Lichess broadcast round (link only)'], ['link', 'Official web page (link only)']];
const STATUSES = [['', 'Automatic (from the times)'], ['upcoming', 'Upcoming'], ['live', 'Live'], ['completed', 'Completed']];

export async function mount(host) {
  const writable = can('content:write');
  const table = dataTable({
    search: false,
    fetch: async () => { const r = await get('/api/admin/world/broadcasts'); return { items: r.items, total: r.items.length, page: 1, pageSize: 200 }; },
    toolbarExtra: writable ? h('button', { class: 'btn primary', type: 'button', style: { marginLeft: 'auto' }, onclick: () => edit(null) }, 'New broadcast') : null,
    columns: [
      { label: 'Broadcast', render: (b) => h('div', null, h('strong', null, b.title), h('div', { class: 'sub' }, [b.channel_name, b.language].filter(Boolean).join(' · '))) },
      { label: 'Status', render: (b) => [badge(b.status === 'live' ? 'Live' : b.status === 'completed' ? 'Completed' : 'Upcoming', b.status === 'live' ? 'bad' : b.status === 'completed' ? '' : 'good'), b.featured ? badge('Featured', 'info') : null, b.official ? null : badge('Not official', 'warn')] },
      { label: 'Time', render: (b) => `${fmtDate(b.starts_at)} → ${fmtDate(b.ends_at)}` },
      { label: 'Provider', render: (b) => PROVIDERS.find((p) => p[0] === b.provider)?.[1] || b.provider },
      { label: '', class: 'actions', render: (b) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn sm', type: 'button', onclick: () => edit(b.id) }, writable ? 'Edit' : 'View'),
        writable ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete broadcast?', message: 'The broadcast will be removed.', ok: 'Delete', danger: true })) { try { await del(`/api/admin/world/broadcasts/${b.id}?confirm=${b.id}`); toast('Deleted'); table.reload(); } catch (x) { toast(x.message, 'bad'); } } } }, 'Delete') : null) },
    ],
    empty: { title: 'No broadcasts yet', body: 'Add only streams that the organisers publish themselves. The Live broadcasts page shows a clear message while there are none.' },
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Live broadcasts'), h('p', null, 'Official streams shown on the Live broadcasts page and on the Chess World page. The live status follows the start and end times unless you set it by hand.'))), table);

  async function edit(id) {
    let b = { provider: 'youtube_live', official: 1 };
    if (id) { try { b = (await get('/api/admin/world/broadcasts')).items.find((x) => x.id === id) || b; } catch (x) { toast(x.message, 'bad'); return; } }
    formModal({
      title: id ? 'Edit broadcast' : 'New broadcast', values: b, history: id ? { entity: 'world_broadcast', id } : null,
      fields: [
        { key: 'title', label: 'Title', maxlength: 160 }, { key: 'provider', label: 'Where it is streamed', type: 'select', options: PROVIDERS },
        { key: 'ref', label: 'Channel id, video, channel name or link', hint: 'YouTube channel ids start with UC. A video link or id works for recordings.' },
        { key: 'channel_name', label: 'Channel name' }, { key: 'official_url', label: 'Official page (https)' }, { key: 'language', label: 'Language' },
        { key: 'starts_at', label: 'Starts', type: 'datetime' }, { key: 'ends_at', label: 'Ends', type: 'datetime' },
        { key: 'event_id', label: 'Tournament number (optional)', type: 'number' },
        { key: 'description', label: 'Description', type: 'textarea', rows: 2 }, { key: 'commentary', label: 'Live commentary (optional)', type: 'textarea', rows: 3 },
        { key: 'official', label: 'This is an official stream of the organisers', type: 'toggle' }, { key: 'featured', label: 'Feature on the Chess World page', type: 'toggle' },
        { key: 'status_override', label: 'Status', type: 'select', options: STATUSES },
      ].map((f) => (writable ? f : { ...f, readonly: true })),
      save: async (p) => { id ? await put(`/api/admin/world/broadcasts/${id}`, p) : await post('/api/admin/world/broadcasts', p); toast('Saved'); table.reload(); },
    });
  }
}
