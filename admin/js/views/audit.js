import { h } from '../dom.js';
import { get } from '../api.js';
import { dataTable, fmtDate, badge, select } from '../ui.js';

export function mount(host) {
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Audit log'), h('p', null, 'Every administrative change, sign-in and failed sign-in. Secrets are never recorded.'))));
  host.append(dataTable({
    searchPlaceholder: 'Search by action, administrator or id…',
    filters: [{ key: 'entity', label: 'All areas', options: [['lesson', 'Lessons'], ['puzzle', 'Puzzles'], ['boardTheme', 'Board themes'], ['pieceSet', 'Piece sets'], ['settings', 'Settings'], ['admin', 'Administrators']] }],
    fetch: ({ page, q, entity }) => get('/api/admin/audit', { page, q, entity }),
    columns: [
      { label: 'When', render: (r) => fmtDate(r.ts) },
      { label: 'Administrator', render: (r) => r.username || '—' },
      { label: 'Action', render: (r) => badge(r.action, r.action.includes('delete') || r.action.includes('failed') || r.action.includes('blocked') ? 'bad' : r.action.includes('publish') ? 'good' : '') },
      { label: 'Target', render: (r) => (r.entity ? `${r.entity}${r.entity_id ? ' · ' + r.entity_id : ''}` : '—') },
      { label: 'Details', render: (r) => (r.detail ? h('code', { style: { whiteSpace: 'normal', wordBreak: 'break-word' } }, JSON.stringify(r.detail)) : '') },
    ],
    empty: { title: 'No audit entries yet' },
  }));
}
