import { h } from '../dom.js';
import { get, put, can } from '../api.js';
import { dataTable, modal, field, select, input, toast, badge, fmtDate } from '../ui.js';

export async function mount(host) {
  const writable = can('players:write');
  const table = dataTable({
    search: false,
    filters: [{ key: 'status', label: 'All reports', options: [['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed']] }],
    fetch: ({ page, status }) => get('/api/admin/reports', { page, status }),
    columns: [
      { label: 'Reported player', render: (r) => h('strong', null, r.target) },
      { label: 'Reason', render: (r) => h('div', null, badge(r.reason, r.reason === 'cheating' ? 'bad' : 'warn'), r.detail ? h('div', { class: 'sub' }, r.detail) : null) },
      { label: 'Reported by', render: (r) => r.reporter },
      { label: 'Status', render: (r) => badge(r.status, r.status === 'open' ? 'warn' : r.status === 'resolved' ? 'good' : '') },
      { label: 'Date', render: (r) => fmtDate(r.createdAt) },
      { label: '', class: 'actions', render: (r) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, r.gameId ? h('a', { class: 'btn sm', href: `../#/game/${r.gameId}`, target: '_blank', rel: 'noopener' }, 'Game') : null, writable && r.status === 'open' ? h('button', { class: 'btn sm primary', type: 'button', onclick: () => handle(r) }, 'Review') : null) },
    ],
    empty: { title: 'No reports', body: 'Reports from players about cheating, abuse or spam appear here.' },
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Reports'), h('p', null, 'Moderation queue: review what players report and decide what happens.'))), table);

  function handle(r) {
    const status = select([['resolved', 'Resolved'], ['dismissed', 'Dismissed (no action)']], 'resolved');
    const action = select([['none', 'No further action'], ['mute', 'Mute the player'], ['ban', 'Ban the player']], 'none');
    const note = input({ placeholder: 'Note (for a ban: the reason shown to the player)', maxlength: 300 });
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Save decision');
    const m = modal({ title: `Report about ${r.target}`, body: h('div', { class: 'stack' }, h('p', null, `${r.reason}${r.detail ? ': ' + r.detail : ''}`), field('Decision', status), field('Action', action), field('Note', note)), footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });
    save.onclick = async () => { try { await put(`/api/admin/reports/${r.id}`, { status: status.value, action: action.value, note: note.value }); toast('Report handled.'); m.close(); table.reload(); } catch (e) { toast(e.message, 'bad'); } };
  }
}
