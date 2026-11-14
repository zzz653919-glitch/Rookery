import { h } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { dataTable, toast, badge, fmtDate, confirmDialog } from '../ui.js';
import { formModal } from '../world-form.js';

export async function mount(host) {
  const writable = can('content:write');
  let cats = []; try { cats = (await get('/api/admin/world/categories')).items; } catch { /* the lists still work */ }
  const catOptions = () => cats.map((c) => [c.slug, c.name_en]);
  const refresh = async (btn) => { btn.disabled = true; try { const r = await post('/api/admin/world/refresh', { pages: 2 }); toast(`${r.events?.events ?? 0} / ${r.sources?.fetched ?? 0}`); sources.reload(); } catch (e) { toast(e.message, 'bad'); } btn.disabled = false; };
  const sources = dataTable({
    search: false,
    fetch: async () => { const r = await get('/api/admin/world/sources'); return { items: r.items, total: r.items.length, page: 1, pageSize: 100 }; },
    toolbarExtra: writable ? h('div', { class: 'row', style: { marginLeft: 'auto' } }, h('button', { class: 'btn', type: 'button', onclick: (e) => refresh(e.currentTarget) }, 'Refresh data now'), h('button', { class: 'btn primary', type: 'button', onclick: () => editSource(null) }, 'New source')) : null,
    columns: [
      { label: 'Source', render: (s) => h('div', null, h('strong', null, s.name), h('div', { class: 'sub mono' }, s.url), s.note ? h('div', { class: 'sub' }, s.note) : null) },
      { label: 'Status', render: (s) => [badge(s.enabled ? 'On' : 'Off', s.enabled ? 'good' : ''), s.official ? badge('Official', 'info') : null, s.last_status === 'error' ? badge('Error', 'bad') : s.last_status === 'ok' ? badge('Working', 'good') : null] },
      { label: 'Category', render: (s) => cats.find((c) => c.slug === s.category)?.name_en || s.category },
      { label: 'Last check', render: (s) => (s.last_fetch_at ? fmtDate(s.last_fetch_at) : '—') },
      { label: '', class: 'actions', render: (s) => writable ? h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { const r = await post(`/api/admin/world/sources/${s.id}/sync`, {}); const x = r.report?.[0]; toast(x?.ok ? `+${x.added}` : (x?.error || 'Error'), x?.ok ? 'good' : 'bad'); sources.reload(); } catch (e) { toast(e.message, 'bad'); } } }, 'Test now'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => editSource(s) }, 'Edit'),
        h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete source?', message: 'The source will no longer be read. Its articles stay.', ok: 'Delete', danger: true })) { try { await del(`/api/admin/world/sources/${s.id}?confirm=${s.id}`); toast('Deleted'); sources.reload(); } catch (e) { toast(e.message, 'bad'); } } } }, 'Delete')) : null },
    ],
    empty: { title: 'No sources yet', body: 'Add an RSS or Atom feed of an official chess source.' },
  });
  const catTable = dataTable({
    search: false,
    fetch: async () => { const r = await get('/api/admin/world/categories'); cats = r.items; return { items: r.items, total: r.items.length, page: 1, pageSize: 100 }; },
    toolbarExtra: writable ? h('button', { class: 'btn primary', type: 'button', style: { marginLeft: 'auto' }, onclick: () => editCat(null) }, 'New category') : null,
    columns: [
      { label: 'Key', render: (c) => h('code', null, c.slug) }, { label: 'English', render: (c) => c.name_en }, { label: 'Uzbek', render: (c) => c.name_uz }, { label: 'Russian', render: (c) => c.name_ru },
      { label: '', class: 'actions', render: (c) => writable ? h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn sm', type: 'button', onclick: () => editCat(c) }, 'Edit'),
        ['international', 'rookery'].includes(c.slug) ? null : h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete category?', message: 'Its articles move to International.', ok: 'Delete', danger: true })) { try { await del(`/api/admin/world/categories/${c.slug}?confirm=${c.slug}`); toast('Deleted'); catTable.reload(); } catch (e) { toast(e.message, 'bad'); } } } }, 'Delete')) : null },
    ],
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'News sources and categories'), h('p', null, 'Feeds are read about every twenty minutes and shown on the News page with their original source and date. Switch a source on only after checking that the feed is genuine and that you may show its headlines.'))), sources,
    h('h3', { style: { margin: '24px 0 10px' } }, 'Categories'), catTable);

  function editSource(s) {
    formModal({
      title: s ? 'Edit source' : 'New source', values: s || { enabled: 0, category: 'international', lang: 'en' }, history: s ? { entity: 'world_source', id: s.id } : null,
      fields: [{ key: 'name', label: 'Name' }, { key: 'url', label: 'Feed address (https)', maxlength: 400 }, { key: 'category', label: 'Category', type: 'select', options: catOptions() }, { key: 'lang', label: 'Language of the articles', type: 'select', options: [['en', 'English'], ['uz', 'Uzbek'], ['ru', 'Russian']] },
        { key: 'official', label: 'Official source', type: 'toggle' }, { key: 'enabled', label: 'Read this source', type: 'toggle' }, { key: 'note', label: 'Note', type: 'textarea', rows: 2 }],
      save: async (p) => { s ? await put(`/api/admin/world/sources/${s.id}`, p) : await post('/api/admin/world/sources', p); toast('Saved'); sources.reload(); },
    });
  }
  function editCat(c) {
    formModal({
      title: c ? 'Edit category' : 'New category', values: c || { sort: 50 }, wide: false,
      fields: [{ key: 'slug', label: 'Key (lower-case letters and dashes)', readonly: !!c }, { key: 'name_en', label: 'English' }, { key: 'name_uz', label: 'Uzbek' }, { key: 'name_ru', label: 'Russian' }, { key: 'sort', label: 'Order', type: 'number' }],
      save: async (p) => { const slug = c ? c.slug : p.slug; delete p.slug; await put(`/api/admin/world/categories/${encodeURIComponent(slug)}`, p); toast('Saved'); catTable.reload(); },
    });
  }
}
