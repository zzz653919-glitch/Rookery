import { h } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { dataTable, modal, confirmDialog, field, input, select, toast, badge, fmtDate, problemsBox, loadingState, errorState } from '../ui.js';
import { LEVELS } from '../../../js/data/levels.js';
import { positionPicker, START_FEN } from '../position.js';
import { previewFrame } from '../preview-frame.js';

const LEVEL_OPTS = LEVELS.map((l, i) => [i + 1, `${i + 1} · ${l.name}`]);

export function mount(host, ctx) {
  const [id] = ctx.params;
  return id ? editor(host, ctx, id === 'new' ? null : id) : list(host, ctx);
}

async function list(host, ctx) {
  const writable = can('content:write');
  let cats = [];
  try { cats = (await get('/api/admin/settings')).settings.puzzleCategories; } catch { /* filters degrade gracefully */ }
  const catName = (id) => cats.find((c) => c.id === id)?.name || id;
  let table;
  const matrixHost = h('section', { class: 'card', style: { marginBottom: '14px', overflowX: 'auto' } });
  function drawMatrix(facets) {
    const by = {}; for (const f of facets) by[`${f.theme}|${f.level}`] = f;
    const themes = [...new Set([...cats.map((c) => c.id), ...facets.map((f) => f.theme)])];
    matrixHost.replaceChildren(h('h3', null, 'Organisation: tactical theme × skill level'), h('p', { class: 'muted small' }, 'Published / total puzzles. Click a cell to filter the table.'),
      h('table', { class: 'matrix' }, h('thead', null, h('tr', null, h('th'), ...LEVELS.map((l, i) => h('th', null, `${i + 1} ${l.name}`)))),
        h('tbody', null, themes.map((t) => h('tr', null, h('th', { scope: 'row', style: { textAlign: 'left' } }, catName(t)), ...LEVELS.map((_, i) => {
          const f = by[`${t}|${i + 1}`];
          return h('td', null, h('button', { type: 'button', class: f ? '' : 'zero', onclick: () => { const sels = table.querySelectorAll('select'); sels[0].value = t; sels[1].value = String(i + 1); sels[0].dispatchEvent(new Event('change')); sels[1].dispatchEvent(new Event('change')); } }, f ? `${f.published}/${f.n}` : '0'));
        }))))));
  }
  table = dataTable({
    searchPlaceholder: 'Search by id, FEN or hint…',
    filters: [{ key: 'theme', label: 'All themes', options: cats.map((c) => [c.id, c.name]) }, { key: 'level', label: 'All levels', options: LEVEL_OPTS }, { key: 'status', label: 'Any status', options: [['published', 'Published'], ['draft', 'Draft']] }],
    fetch: async (p) => { const r = await get('/api/admin/puzzles', p); drawMatrix(r.facets); return r; },
    toolbarExtra: writable ? h('a', { class: 'btn primary', href: '#/puzzles/new', style: { marginLeft: 'auto' } }, 'New puzzle') : null,
    empty: { title: 'No puzzles yet' },
    columns: [
      { label: 'Puzzle', render: (p) => h('div', null, h('a', { href: `#/puzzles/${encodeURIComponent(p.id)}` }, h('strong', null, p.id)), h('div', { class: 'sub mono' }, p.fen.split(' ')[0].slice(0, 28) + '…')) },
      { label: 'Theme', render: (p) => catName(p.theme) },
      { label: 'Level', render: (p) => badge(`${p.level} · ${LEVELS[p.level - 1]?.name}`, 'info') },
      { label: 'Moves', render: (p) => `${p.solverMoves} to find` },
      { label: 'Solution', render: (p) => h('span', { class: 'mono small' }, p.solution) },
      { label: 'Status', render: (p) => badge(p.status === 'published' ? 'Published' : 'Draft', p.status === 'published' ? 'good' : 'warn') },
      { label: '', class: 'actions', render: (p) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('a', { class: 'btn sm', href: `#/puzzles/${encodeURIComponent(p.id)}` }, writable ? 'Edit' : 'View'),
        writable ? h('button', { class: 'btn sm', type: 'button', onclick: async () => {
          try { await post(`/api/admin/puzzles/${encodeURIComponent(p.id)}/publish`, { published: p.status !== 'published' }); toast(p.status === 'published' ? 'Puzzle unpublished.' : 'Puzzle published.'); table.reload(); }
          catch (e) { modal({ title: 'Cannot publish', body: problemsBox(e.details, e.message) || h('p', null, e.message), footer: h('button', { class: 'btn', type: 'button', onclick: () => document.querySelector('.modal-back')?.remove() }, 'Close') }); }
        } }, p.status === 'published' ? 'Unpublish' : 'Publish') : null,
        writable ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
          if (!(await confirmDialog({ title: 'Delete puzzle?', message: `Puzzle ${p.id} will be permanently deleted.`, ok: 'Delete puzzle', danger: true, typeToConfirm: p.id }))) return;
          try { await del(`/api/admin/puzzles/${encodeURIComponent(p.id)}`, { confirm: p.id }); toast('Puzzle deleted.'); table.reload(); } catch (e) { toast(e.message, 'bad'); }
        } }, 'Delete') : null) },
    ],
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Puzzles'), h('p', null, 'Every puzzle is checked against the chess rules before it can be published.'))), matrixHost, table);
}

async function editor(host, ctx, existingId) {
  host.replaceChildren(loadingState(6));
  let P, cats;
  try {
    cats = (await get('/api/admin/settings')).settings.puzzleCategories.filter((c) => c.enabled);
    P = existingId ? await get(`/api/admin/puzzles/${encodeURIComponent(existingId)}`) : { id: '', fen: START_FEN, moves: [], theme: cats[0]?.id || 'fork', themes: [], level: 1, hint: '', explain: '', status: 'draft' };
  } catch (e) { host.replaceChildren(errorState(e, () => editor(host, ctx, existingId))); return; }
  const writable = can('content:write'), isNew = !existingId;
  const snap = () => JSON.stringify([P.id, P.fen, P.moves, P.theme, P.themes, P.level, P.hint, P.explain, P.status]);
  let saved = snap();
  ctx.setGuard(() => snap() !== saved);
  ctx.setTitle(isNew ? 'New puzzle' : 'Edit puzzle');

  const problems = h('div'), result = h('div');
  const showProblems = (list, title) => problems.replaceChildren(problemsBox(list, title) || '');

  const movesHost = h('div', { class: 'chips' });
  const drawMoves = () => movesHost.replaceChildren(...(P.moves.length ? P.moves.map((m, i) => h('span', { class: 'chip' }, `${i % 2 === 0 ? 'Solver' : 'Reply'}: ${m}`)) : [h('span', { class: 'faint small' }, 'No moves recorded yet.')]),
    ...(writable && P.moves.length ? [h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { P.moves.pop(); drawMoves(); replay(); } }, 'Undo last'), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { P.moves = []; drawMoves(); replay(); } }, 'Clear')] : []));
  const picker = positionPicker({ fen: P.fen, allowRecord: writable, height: 400, getReplay: () => P.moves, onChange: (fen) => { if (fen !== P.fen) { P.fen = fen; if (P.moves.length) { P.moves = []; drawMoves(); } } }, onMove: (m) => { P.moves.push(m.uci); drawMoves(); } });
  const replay = () => { picker.refresh(); }; // re-render the base position; the recorder restarts from it
  drawMoves();

  const f = {};
  f.id = input({ value: P.id, disabled: !isNew || !writable, placeholder: 'fork-2-014', oninput: (e) => { P.id = e.target.value.trim(); } });
  f.theme = select(cats.map((c) => [c.id, c.name]), P.theme, { disabled: !writable, onchange: (e) => { P.theme = e.target.value; } });
  f.level = select(LEVEL_OPTS, P.level, { disabled: !writable, onchange: (e) => { P.level = +e.target.value; } });
  f.themes = input({ value: P.themes.join(', '), disabled: !writable, placeholder: 'promotion, fork', oninput: (e) => { P.themes = e.target.value.split(/[\s,]+/).filter(Boolean); } });
  f.hint = input({ value: P.hint, maxlength: 300, disabled: !writable, oninput: (e) => { P.hint = e.target.value; } });
  f.explain = h('textarea', { value: P.explain, maxlength: 800, disabled: !writable, oninput: (e) => { P.explain = e.target.value; } });
  f.status = select([['draft', 'Draft — hidden from learners'], ['published', 'Published — visible to learners']], P.status, { disabled: !writable, onchange: (e) => { P.status = e.target.value; } });
  const engineCb = h('input', { type: 'checkbox' });

  const frame = previewFrame({ height: 560 });
  const body = () => ({ id: P.id, fen: P.fen, moves: P.moves, theme: P.theme, themes: P.themes, level: P.level, hint: P.hint, explain: P.explain, status: P.status });
  async function validate(withEngine) {
    showProblems([]); result.replaceChildren(h('span', { class: 'muted' }, 'Validating…'));
    try {
      const r = await post('/api/admin/puzzles/validate', { puzzle: body(), engine: withEngine });
      if (!r.ok) { result.replaceChildren(); showProblems(r.problems, 'This puzzle has problems'); return null; }
      result.replaceChildren(h('div', { class: 'notice good stack tight' }, h('strong', null, 'All moves are legal and the position is valid.'), h('span', { class: 'mono' }, r.puzzle.solution),
        r.engine ? h('span', { class: r.engine.agrees ? '' : 'faint' }, !r.engine.checked ? 'Engine check unavailable.' : r.engine.agrees ? 'The built-in engine also picks this first move.' : `Note: the built-in engine prefers ${r.engine.best} for the first move. Make sure your solution is the only strong one.`) : null));
      return r.puzzle;
    } catch (e) { result.replaceChildren(); showProblems([{ message: e.message }]); return null; }
  }
  async function test() { const v = await validate(false); if (v) frame.send({ type: 'puzzle', puzzle: { ...v, hint: v.hint, explain: v.explain } }); }
  async function save(status) {
    showProblems([]); if (status) { P.status = status; f.status.value = status; }
    saveBtn.disabled = pubBtn.disabled = true;
    try {
      const r = isNew ? await post('/api/admin/puzzles', body()) : await put(`/api/admin/puzzles/${encodeURIComponent(P.id)}`, body());
      P = r; saved = snap(); toast(P.status === 'published' ? 'Saved and published.' : 'Saved as draft.');
      if (isNew) { ctx.setGuard(null); ctx.navigate(`/puzzles/${encodeURIComponent(r.id)}`); return; }
    } catch (e) { showProblems(Array.isArray(e.details) ? e.details : [{ message: e.message }], e.message); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    saveBtn.disabled = pubBtn.disabled = false;
  }
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => save() }, 'Save');
  const pubBtn = h('button', { class: 'btn', type: 'button', onclick: () => save('published') }, 'Validate & publish');

  host.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, isNew ? 'New puzzle' : P.id), h('p', null, 'The side to move in the FEN is the solver. Record the solution by playing it on the board.')),
      h('div', { class: 'row wrap' }, ...(writable ? [saveBtn, pubBtn] : []), h('a', { class: 'btn ghost', href: '#/puzzles' }, 'Back to puzzles'))),
    problems,
    h('div', { class: 'split' }, h('div', { class: 'stack' },
      h('section', { class: 'card stack' }, h('h3', null, 'Position & solution'), picker.node,
        h('div', { class: 'notice' }, writable ? 'Switch to “Play moves”, then play the solver’s first move, the opponent’s reply, and so on. The last recorded move must be the solver’s.' : 'Read-only.'),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Solution moves'), movesHost)),
      h('section', { class: 'card stack' }, h('h3', null, 'Details'),
        h('div', { class: 'grid g2' }, field('Puzzle id', f.id, { hint: isNew ? 'Lower-case letters, digits, hyphens.' : 'Fixed.' }), field('Tactical category', f.theme)),
        h('div', { class: 'grid g2' }, field('Skill level', f.level), field('Motif tags (optional)', f.themes, { hint: 'Letters and digits, comma separated.' })),
        field('Hint', f.hint), field('Explanation shown after solving', f.explain), field('Status', f.status, { hint: 'Publishing needs a hint, an explanation and a valid solution. Mate-in-1 / Mate-in-2 categories must end in checkmate.' }))),
    h('div', { class: 'stack side-col' }, h('section', { class: 'card stack' }, h('h3', null, 'Validate & test'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn', type: 'button', onclick: () => validate(engineCb.checked) }, 'Validate solution'), h('button', { class: 'btn', type: 'button', onclick: test }, 'Test on the board')),
      h('label', { class: 'row small' }, engineCb, 'Also ask the built-in engine (a few seconds)'), result,
      frame))));
  return () => { picker.dispose(); frame.dispose(); };
}
