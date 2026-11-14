import { h } from '../dom.js';
import { get, put, can } from '../api.js';
import { dataTable, toast, badge } from '../ui.js';
import { formModal } from '../world-form.js';

const RESULTS = [['1-0', '1–0 White wins'], ['0-1', '0–1 Black wins'], ['1/2-1/2', '½–½ Draw'], ['*', 'In progress']];

export async function mount(host) {
  const writable = can('content:write');
  const table = dataTable({
    searchPlaceholder: 'Search by player…', filters: [{ key: 'featured', label: 'All games', options: [['1', 'Featured only']] }],
    fetch: ({ page, q, featured }) => get(`/api/admin/world/games?page=${page}&q=${encodeURIComponent(q || '')}&featured=${featured || ''}`),
    columns: [
      { label: 'Game', render: (g) => h('div', null, h('strong', null, `${g.white} – ${g.black}`), h('div', { class: 'sub' }, `${g.event_name} · ${g.round_name || ''}`)) },
      { label: 'Result', render: (g) => g.result }, { label: 'Date', render: (g) => g.played_on || '—' },
      { label: 'Flags', render: (g) => [g.featured ? badge('Featured', 'info') : null, g.locked ? badge('Corrected', 'warn') : null] },
      { label: '', class: 'actions', render: (g) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn sm', type: 'button', onclick: () => edit(g) }, writable ? 'Edit' : 'View')) },
    ],
    empty: { title: 'No games stored yet', body: 'Games are stored when a tournament page is opened or its games are imported.' },
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Games'), h('p', null, 'Feature important games on the Chess World page and correct a result or a name. A corrected game is not overwritten by the feed, and the change is written to the history.'))), table);
  function edit(g) {
    formModal({
      title: 'Edit game', values: g, wide: false, history: { entity: 'world_game', id: g.id },
      fields: [{ key: 'white', label: 'White' }, { key: 'black', label: 'Black' }, { key: 'result', label: 'Result', type: 'select', options: RESULTS }, { key: 'opening', label: 'Opening' }, { key: 'featured', label: 'Feature on the Chess World page', type: 'toggle' }].map((f) => (writable ? f : { ...f, readonly: true })),
      save: async (v) => { await put(`/api/admin/world/games/${g.id}`, v); toast('Saved'); table.reload(); },
    });
  }
}
