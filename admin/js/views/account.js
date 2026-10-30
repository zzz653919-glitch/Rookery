import { h } from '../dom.js';
import { post, session } from '../api.js';
import { field, input, toast, problemsBox } from '../ui.js';

export function mount(host) {
  const cur = input({ type: 'password', autocomplete: 'current-password' }), nw = input({ type: 'password', autocomplete: 'new-password' }), again = input({ type: 'password', autocomplete: 'new-password' });
  const box = h('div'); const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Change password');
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'My account'), h('p', null, `Signed in as ${session.admin.username} (${session.admin.role}).`))),
    h('form', { class: 'card stack', style: { maxWidth: '480px' }, onsubmit: async (e) => {
      e.preventDefault(); box.replaceChildren();
      if (nw.value !== again.value) { box.replaceChildren(problemsBox([{ message: 'The new passwords do not match.' }])); return; }
      btn.disabled = true;
      try { await post('/api/admin/password', { current: cur.value, next: nw.value }); cur.value = nw.value = again.value = ''; toast('Password changed. Other devices were signed out.'); }
      catch (err) { box.replaceChildren(problemsBox(err.details ? err.details.map((m) => ({ message: m })) : [{ message: err.message }])); }
      btn.disabled = false;
    } }, h('h3', null, 'Change password'), field('Current password', cur), field('New password', nw, { hint: 'At least 12 characters, mixing three of: lower-case, upper-case, digits, symbols.' }), field('Repeat new password', again), box, btn));
}
