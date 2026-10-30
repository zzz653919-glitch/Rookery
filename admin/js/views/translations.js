// Translations: coverage of administrator-written texts in Uzbek and Russian, manual corrections, and "translate now".
import { h, tr } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { dataTable, loadingState, errorState, toast, modal, badge, select, field, confirmDialog, fmtDate } from '../ui.js';
import { LANGS } from '../i18n.js';

const NAMES = Object.fromEntries(LANGS.map((l) => [l.id, l.name]));
const ORIGIN = { bundled: ['Built in', ''], auto: ['Automatic', 'info'], manual: ['Edited by hand', 'good'], missing: ['Not translated', 'warn'] };

export async function mount(host) {
  const writable = can('content:write');
  let timer = null;
  const top = h('div'), tableHost = h('div');
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Translations'),
    h('p', null, 'Lessons, puzzles and names you write are shown to players in their own language. Texts that come with Rookery are already translated; new ones are translated automatically when you save, and you can correct any of them by hand.'))), top, tableHost);

  async function refresh() {
    let d;
    try { d = await get('/api/admin/translations'); } catch (e) { top.replaceChildren(errorState(e, refresh)); return null; }
    top.replaceChildren(
      d.provider ? null : h('div', { class: 'notice warn', style: { marginBottom: '14px' } }, h('strong', null, 'Automatic translation is off. '), 'New texts stay in English until you translate them here by hand. The server owner can switch it on (see ADMIN.md, “Translations”).'),
      h('div', { class: 'grid g2', style: { marginBottom: '14px' } }, d.stats.map((s) => h('section', { class: 'card' },
        h('h3', null, NAMES[s.lang]),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': s.total, 'aria-valuenow': s.translated }, h('span', { style: { width: (s.total ? Math.round(100 * s.translated / s.total) : 100) + '%' } })),
        h('p', { class: 'muted small' }, `${s.translated} of ${s.total} texts translated`),
        h('p', { class: 'muted small' }, `${s.auto} automatic · ${s.manual} edited by hand`)))),
      writable ? h('div', { class: 'row', style: { marginBottom: '14px' } },
        h('button', { class: 'btn primary', type: 'button', disabled: !d.provider || d.running, onclick: runNow }, d.running ? 'Translating…' : 'Translate missing texts now'),
        d.lastRun?.error ? h('span', { class: 'badge bad' }, d.lastRun.error) : d.lastRun?.at ? h('span', { class: 'muted small' }, `Last run: ${fmtDate(d.lastRun.at)} · ${d.lastRun.translated} translated, ${d.lastRun.rejected} rejected`) : null) : null);
    clearTimeout(timer);
    if (d.running) timer = setTimeout(async () => { await refresh(); table?.reload(); }, 1500);
    return d;
  }
  async function runNow() {
    try { await post('/api/admin/translations/run', {}); toast('Translation started.'); } catch (e) { toast(e.message, 'bad'); }
    await refresh();
  }

  let lang = 'uz', table = null;
  const langSel = select(LANGS.filter((l) => l.id !== 'en').map((l) => [l.id, l.name]), lang, { 'aria-label': 'Language', onchange: () => { lang = langSel.value; table.state.page = 1; table.reload(); } });
  table = dataTable({
    searchPlaceholder: 'Search texts…',
    toolbarExtra: h('div', { class: 'field' }, langSel),
    filters: [{ key: 'status', label: 'All statuses', options: [['missing', 'Not translated'], ['auto', 'Automatic'], ['manual', 'Edited by hand'], ['bundled', 'Built in']] }],
    fetch: ({ page, q, status }) => get('/api/admin/translations/entries', { lang, page, q, status }),
    columns: [
      { label: 'English text', render: (r) => h('div', { style: { maxWidth: '420px', whiteSpace: 'normal', wordBreak: 'break-word' } }, r.source) },
      { label: 'Translation', render: (r) => h('div', { style: { maxWidth: '420px', whiteSpace: 'normal', wordBreak: 'break-word' } }, r.text || '—') },
      { label: 'Status', render: (r) => badge(ORIGIN[r.origin][0], ORIGIN[r.origin][1]) },
      { label: '', class: 'actions', render: (r) => (writable ? h('button', { class: 'btn sm', type: 'button', onclick: () => edit(r) }, 'Edit') : null) },
    ],
    empty: { title: 'Nothing to translate', body: 'Texts you add to lessons and puzzles appear here.' },
  });
  tableHost.append(table);

  function edit(r) {
    const area = h('textarea', { rows: 6, lang, style: { width: '100%' } }); area.value = r.text;
    const err = h('div', { class: 'notice bad', role: 'alert', hidden: true });
    const m = modal({
      title: `${NAMES[lang]}`, wide: true,
      body: h('div', { class: 'stack' }, field('English text', h('div', { class: 'muted', style: { whiteSpace: 'pre-wrap' } }, r.source)), field('Translation', area, { hint: 'Keep the HTML tags (<b>, <p> …) and chess moves (Nf3, e4, O-O) exactly as in the English text.' }), err),
      footer: [
        r.origin === 'manual' || r.origin === 'auto' ? h('button', { class: 'btn', type: 'button', onclick: async () => {
          if (!(await confirmDialog({ title: 'Reset translation?', message: 'The stored translation is removed and the text is translated again automatically.', ok: 'Reset' }))) return;
          try { await del('/api/admin/translations', { lang, hash: r.hash }); m.close(true); toast('Translation reset.'); table.reload(); refresh(); } catch (e) { toast(e.message, 'bad'); }
        } }, 'Reset') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => m.close(false) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          try { await put('/api/admin/translations', { lang, source: r.source, text: area.value }); m.close(true); toast('Translation saved.'); table.reload(); refresh(); }
          catch (e) { err.hidden = false; err.textContent = tr(e.message); }
        } }, 'Save'),
      ],
    });
  }

  await refresh();
  return () => clearTimeout(timer);
}
