import { h } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { dataTable, toast, badge, confirmDialog } from '../ui.js';
import { formModal } from '../world-form.js';

const ach = { toLine: (a) => `${a.year || ''} | ${a.text}${a.sourceUrl ? ' | ' + a.sourceUrl : ''}`, fromLines: (v) => v.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [year, text, sourceUrl] = l.split('|').map((x) => x.trim()); return { year, text, sourceUrl }; }) };

export async function mount(host) {
  const writable = can('content:write');
  const table = dataTable({
    search: false,
    fetch: async () => { const r = await get('/api/admin/world/players'); return { items: r.items, total: r.items.length, page: 1, pageSize: 200 }; },
    toolbarExtra: writable ? h('button', { class: 'btn primary', type: 'button', style: { marginLeft: 'auto' }, onclick: () => edit(null) }, 'New player') : null,
    columns: [
      { label: 'Player', render: (p) => h('div', null, h('strong', null, p.name), h('div', { class: 'sub' }, [p.country, p.fide_id ? `FIDE ${p.fide_id}` : null].filter(Boolean).join(' · '))) },
      { label: 'Profile', render: (p) => [p.featured ? badge('Featured', 'info') : null, p.world_rank ? badge(`#${p.world_rank}`, 'good') : null, p.bio_en ? badge('Biography', '') : null] },
      { label: '', class: 'actions', render: (p) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn sm', type: 'button', onclick: () => edit(p) }, writable ? 'Edit' : 'View'),
        writable ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete player?', message: 'The player will be removed from the Players page.', ok: 'Delete', danger: true })) { try { await del(`/api/admin/world/players/${p.slug}?confirm=${p.slug}`); toast('Deleted'); table.reload(); } catch (e) { toast(e.message, 'bad'); } } } }, 'Delete') : null) },
    ],
    empty: { title: 'No players yet', body: 'Add a grandmaster with the numeric FIDE id: ratings, title and photo are then read from FIDE data.' },
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Grandmaster profiles'), h('p', null, 'Ratings, titles and photos come from official FIDE data and biographies from Wikipedia. Add a biography or achievements here only with a source; a world ranking is shown only when you enter it together with the official list it comes from.'))), table);

  function edit(p) {
    formModal({
      title: p ? 'Edit player' : 'New player', values: p ? { ...p, achievements: JSON.parse(p.achievements || '[]') } : {}, history: p ? { entity: 'world_player', id: p.slug } : null,
      fields: [
        { key: 'name', label: 'Name', readonly: !!p }, { key: 'fide_id', label: 'FIDE id', type: 'number' }, { key: 'country', label: 'Federation (3 letters, e.g. UZB)', maxlength: 3 },
        { key: 'wiki_title', label: 'Wikipedia article title', hint: 'For example Magnus_Carlsen' }, { key: 'chesscom', label: 'Chess.com username (optional)' },
        { key: 'bio_en', label: 'Biography (English, optional)', type: 'textarea', rows: 3 }, { key: 'bio_uz', label: 'Biography (Uzbek, optional)', type: 'textarea', rows: 3 }, { key: 'bio_ru', label: 'Biography (Russian, optional)', type: 'textarea', rows: 3 },
        { key: 'achievements', label: 'Career achievements', type: 'lines', rows: 4, ...ach, hint: 'One per line: year | achievement | source link' },
        { key: 'world_rank', label: 'World ranking (official figure)', type: 'number' }, { key: 'rank_source', label: 'Ranking source (for example FIDE list, month and year)' },
        { key: 'featured', label: 'Featured grandmaster', type: 'toggle' }, { key: 'sort', label: 'Order', type: 'number' },
      ].map((f) => (writable ? f : { ...f, readonly: true })),
      save: async (v) => { p ? await put(`/api/admin/world/players/${p.slug}`, v) : await post('/api/admin/world/players', v); toast('Saved'); table.reload(); },
    });
  }
}
