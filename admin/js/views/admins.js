import { h } from '../dom.js';
import { get, post, put, session } from '../api.js';
import { dataTable, modal, field, input, select, toast, badge, fmtDate, problemsBox } from '../ui.js';

export async function mount(host) {
  let roles = [];
  try { roles = (await get('/api/admin/admins')).roles; } catch { /* table shows the error */ }
  const table = dataTable({
    search: false,
    fetch: async () => { const r = await get('/api/admin/admins'); roles = r.roles; return { items: r.items, total: r.items.length, page: 1, pageSize: 100 }; },
    toolbarExtra: h('button', { class: 'btn primary', type: 'button', style: { marginLeft: 'auto' }, onclick: () => createDialog() }, 'Add administrator'),
    columns: [
      { label: 'Username', render: (a) => h('strong', null, a.username, a.id === session.admin.id ? badge('you', 'info') : null) },
      { label: 'Role', render: (a) => badge(a.role) },
      { label: 'Status', render: (a) => badge(a.disabled ? 'Disabled' : 'Active', a.disabled ? 'bad' : 'good') },
      { label: 'Last sign-in', render: (a) => (a.lastLoginAt ? fmtDate(a.lastLoginAt) : 'Never') },
      { label: '', class: 'actions', render: (a) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn sm', type: 'button', onclick: () => editDialog(a) }, 'Edit')) },
    ],
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Administrators'), h('p', null, 'Roles decide what each administrator may do. Permissions are enforced on the server.'))), table,
    h('section', { class: 'card', style: { marginTop: '14px' } }, h('h3', null, 'Roles'),
      h('dl', { class: 'kv' }, ...['superadmin', 'editor', 'viewer'].flatMap((r) => [h('dt', null, r), h('dd', null, ({ superadmin: 'Everything, including administrator accounts.', editor: 'Create, edit, publish and delete lessons, puzzles and themes; read settings and the audit log.', viewer: 'Read-only access to the dashboard, content, themes and settings.' })[r])]))));

  function createDialog() {
    const u = input({ autocomplete: 'off' }), p = input({ type: 'password', autocomplete: 'new-password' });
    const r = select(['editor', 'viewer', 'superadmin'], 'editor');
    const box = h('div');
    const fu = field('Username', u, { hint: '3–32 letters, digits, dot, dash or underscore.' }), fp = field('Initial password', p, { hint: 'At least 12 characters, mixing three character types. Share it securely; the administrator should change it after signing in.' });
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Create');
    const m = modal({ title: 'Add administrator', body: h('div', { class: 'stack' }, fu, fp, field('Role', r), box), footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });
    save.onclick = async () => {
      save.disabled = true; box.replaceChildren();
      try { await post('/api/admin/admins', { username: u.value.trim(), password: p.value, role: r.value }); m.close(); toast('Administrator created.'); table.reload(); }
      catch (e) { box.replaceChildren(problemsBox(e.details ? e.details.map((d) => (typeof d === 'string' ? { message: d } : d)) : [{ message: e.message }])); save.disabled = false; }
    };
  }
  function editDialog(a) {
    const r = select(roles.map((x) => x.name), a.role);
    const dis = h('input', { type: 'checkbox', checked: a.disabled });
    const p = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Leave empty to keep the current password' });
    const box = h('div');
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Save');
    const self = a.id === session.admin.id;
    const m = modal({ title: `Edit ${a.username}`, body: h('div', { class: 'stack' }, field('Role', r, { hint: self ? 'You cannot change your own role.' : '' }), h('label', { class: 'row' }, dis, 'Disabled (cannot sign in)'), field('Reset password', p, { hint: 'Signs the administrator out everywhere.' }), box),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });
    if (self) { r.disabled = true; dis.disabled = true; }
    save.onclick = async () => {
      save.disabled = true; box.replaceChildren();
      const body = {}; if (!self && r.value !== a.role) body.role = r.value; if (!self && dis.checked !== a.disabled) body.disabled = dis.checked; if (p.value) body.password = p.value;
      if (!Object.keys(body).length) { m.close(); return; }
      try { await put(`/api/admin/admins/${a.id}`, body); m.close(); toast('Saved.'); table.reload(); }
      catch (e) { box.replaceChildren(problemsBox(e.details ? e.details.map((d) => (typeof d === 'string' ? { message: d } : d)) : [{ message: e.message }])); save.disabled = false; }
    };
  }
}
