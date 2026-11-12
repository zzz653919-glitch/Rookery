import { h } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { dataTable, modal, field, input, select, toast, badge, fmtDate, problemsBox, confirmDialog } from '../ui.js';

export async function mount(host) {
  const writable = can('content:write');
  const table = dataTable({
    searchPlaceholder: 'Search articles…', search: false,
    fetch: async () => { const r = await get('/api/admin/news'); return { items: r.items, total: r.items.length, page: 1, pageSize: 100 }; },
    toolbarExtra: writable ? h('button', { class: 'btn primary', type: 'button', style: { marginLeft: 'auto' }, onclick: () => edit(null) }, 'New article') : null,
    columns: [
      { label: 'Title', render: (n) => h('div', null, h('strong', null, n.title), n.summary ? h('div', { class: 'sub' }, n.summary) : null) },
      { label: 'Status', render: (n) => badge(n.status === 'published' ? 'Published' : 'Draft', n.status === 'published' ? 'good' : '') },
      { label: 'Author', render: (n) => n.author || '—' },
      { label: 'Updated', render: (n) => fmtDate(n.updated_at) },
      { label: '', class: 'actions', render: (n) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn sm', type: 'button', onclick: () => edit(n.id) }, writable ? 'Edit' : 'View'),
        writable ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete article?', message: `“${n.title}” will be deleted.`, ok: 'Delete', danger: true })) { try { await del(`/api/admin/news/${n.id}`, { confirm: String(n.id) }); toast('Article deleted.'); table.reload(); } catch (e) { toast(e.message, 'bad'); } } } }, 'Delete') : null) },
    ],
    empty: { title: 'No articles yet', body: 'Write announcements, event reports or chess stories for the News page.' },
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'News'), h('p', null, 'Articles shown on the News page and the home page. Drafts stay hidden until published.'))), table);

  async function edit(id) {
    let n = { title: '', summary: '', body: '<p></p>', status: 'draft' };
    if (id) { try { n = await get(`/api/admin/news/${id}`); } catch (e) { toast(e.message, 'bad'); return; } }
    const title = input({ value: n.title, maxlength: 140, disabled: !writable }), summary = input({ value: n.summary, maxlength: 300, disabled: !writable });
    const body = h('textarea', { rows: 12, style: { width: '100%' }, disabled: !writable }); body.value = n.body;
    const status = select([['draft', 'Draft — hidden'], ['published', 'Published — visible']], n.status, { disabled: !writable });
    const box = h('div'), save = h('button', { class: 'btn primary', type: 'button' }, 'Save');
    const m = modal({ title: id ? 'Edit article' : 'New article', wide: true, body: h('div', { class: 'stack' }, field('Title', title), field('Summary (shown in lists)', summary), field('Text', body, { hint: 'Allowed formatting: <b>, <i>, <p>, <ul>/<li>, <br>. Anything else is removed.' }), field('Status', status), box), footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Close'), writable ? save : null] });
    save.onclick = async () => {
      save.disabled = true; box.replaceChildren();
      try { const payload = { title: title.value, summary: summary.value, body: body.value, status: status.value }; id ? await put(`/api/admin/news/${id}`, payload) : await post('/api/admin/news', payload); toast('Saved.'); m.close(); table.reload(); }
      catch (e) { box.replaceChildren(problemsBox(e.details ? e.details.map((d) => (typeof d === 'string' ? { message: d } : d)) : [{ message: e.message }])); save.disabled = false; }
    };
  }
}
