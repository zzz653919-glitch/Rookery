import { h } from '../dom.js';
import { get, post, put, can } from '../api.js';
import { dataTable, modal, field, input, toast, badge, fmtDate, problemsBox, confirmDialog } from '../ui.js';

export async function mount(host) {
  const writable = can('players:write');
  const table = dataTable({
    searchPlaceholder: 'Search players by username…',
    filters: [{ key: 'status', label: 'All players', options: [['banned', 'Banned'], ['muted', 'Muted']] }],
    fetch: ({ page, q, status }) => get('/api/admin/players', { page, q, status }),
    columns: [
      { label: 'Player', render: (p) => h('strong', null, p.username, p.banned ? badge('Banned', 'bad') : null, p.muted ? badge('Muted', 'warn') : null) },
      { label: 'Rating', render: (p) => String(Math.round(p.rating)) },
      { label: 'Games', render: (p) => String(p.games) },
      { label: 'Joined', render: (p) => fmtDate(p.createdAt) },
      { label: 'Last seen', render: (p) => fmtDate(p.lastSeenAt) },
      { label: '', class: 'actions', render: (p) => h('button', { class: 'btn sm', type: 'button', onclick: () => details(p) }, 'View') },
    ],
    empty: { title: 'No players yet', body: 'Players appear here once they register on the site.' },
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Players'), h('p', null, 'Accounts registered on the site. Ban or mute players, reset passwords and review their games.'))), table);

  async function details(p) {
    const d = await get(`/api/admin/players/${p.id}`).catch((e) => { toast(e.message, 'bad'); return null; });
    if (!d) return;
    const pl = d.player, box = h('div');
    const reason = input({ placeholder: 'Reason shown to the player (optional)', maxlength: 200 });
    const act = async (body, ok) => { box.replaceChildren(); try { await put(`/api/admin/players/${pl.id}`, body); toast(ok); m.close(); table.reload(); } catch (e) { box.replaceChildren(problemsBox([{ message: e.message }])); } };
    const body = h('div', { class: 'stack' },
      h('dl', { class: 'kv' }, h('dt', null, 'Username'), h('dd', null, pl.username), h('dt', null, 'Joined'), h('dd', null, fmtDate(pl.createdAt)), h('dt', null, 'Last seen'), h('dd', null, fmtDate(pl.lastSeenAt)),
        ...['bullet', 'blitz', 'rapid', 'classical'].flatMap((c) => [h('dt', null, c.charAt(0).toUpperCase() + c.slice(1)), h('dd', null, `${d.ratings[c].rating} · ${d.ratings[c].games} games`)])),
      pl.banned ? h('div', { class: 'notice bad' }, 'Banned', pl.banReason ? `: ${pl.banReason}` : '') : null,
      h('h4', null, 'Recent games'),
      d.games.length ? h('ul', { class: 'list' }, d.games.map((g) => h('li', { class: 'item' }, h('a', { href: `../#/game/${g.id}`, target: '_blank', rel: 'noopener' }, g.id), h('span', { class: 'grow' }, `${g.kind} · ${g.category}`), badge(g.status + (g.result ? ' ' + g.result : ''))))) : h('p', { class: 'muted' }, 'No games yet.'),
      h('h4', null, 'Reports about this player'),
      d.reports.length ? h('ul', { class: 'list' }, d.reports.map((r) => h('li', { class: 'item' }, h('span', { class: 'grow' }, `${r.reason} — ${r.reporter}`), badge(r.status, r.status === 'open' ? 'warn' : ''), h('span', { class: 'faint small' }, fmtDate(r.created_at))))) : h('p', { class: 'muted' }, 'No reports.'),
      writable ? h('div', { class: 'stack' }, field('Ban reason', reason), h('div', { class: 'row wrap' },
        pl.banned ? h('button', { class: 'btn', type: 'button', onclick: () => act({ banned: false }, 'Player unbanned.') }, 'Unban') : h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Ban this player?', message: 'The player is signed out and cannot sign in. Running games are lost.', ok: 'Ban', danger: true })) act({ banned: true, banReason: reason.value }, 'Player banned.'); } }, 'Ban'),
        h('button', { class: 'btn', type: 'button', onclick: () => act({ muted: !pl.muted }, pl.muted ? 'Player unmuted.' : 'Player muted.') }, pl.muted ? 'Unmute' : 'Mute'),
        h('button', { class: 'btn', type: 'button', onclick: () => resetPassword(pl) }, 'Reset password'))) : null, box);
    const m = modal({ title: pl.username, wide: true, body, footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Close')] });
  }
  function resetPassword(pl) {
    const pw = input({ type: 'password', autocomplete: 'new-password' }), box = h('div');
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Set password');
    const m2 = modal({ title: 'Reset password', body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'The player is signed out everywhere and must use the new password.'), field('New password', pw, { hint: 'At least 8 characters with letters and digits.' }), box), footer: [h('button', { class: 'btn', type: 'button', onclick: () => m2.close() }, 'Cancel'), save] });
    save.onclick = async () => { try { await post(`/api/admin/players/${pl.id}/password`, { password: pw.value }); toast('Password changed.'); m2.close(); } catch (e) { box.replaceChildren(problemsBox(e.details ? e.details.map((x) => (typeof x === 'string' ? { message: x } : x)) : [{ message: e.message }])); } };
  }
}
