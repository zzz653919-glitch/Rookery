import { h, clear } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { dataTable, modal, confirmDialog, field, input, select, toast, badge, fmtDate, problemsBox, loadingState, errorState, emptyState } from '../ui.js';
import { LEVELS, SKILLS } from '../../../js/data/levels.js';
import { buildStepForm, NEW_STEPS, STEP_LABEL, STEP_SUMMARY } from '../step-forms.js';
import { previewFrame } from '../preview-frame.js';

const SKILL_LIST = { ...SKILLS, forks: 'Forks', pins: 'Pins' };
const levelName = (id) => LEVELS.find((l) => l.id === id)?.name || id;
const levelOpts = LEVELS.map((l) => [l.id, l.name]);
const skillOpts = Object.entries(SKILL_LIST);

export function mount(host, ctx) {
  const [id] = ctx.params;
  return id ? editor(host, ctx, id === 'new' ? null : id) : list(host, ctx);
}

// ------------------------------------------------------------------------------------------------- list
function list(host, ctx) {
  let table;
  const reorder = async (level, items, i, dir) => {
    const ids = items.map((x) => x.id);
    const j = i + dir; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await post('/api/admin/lessons/reorder', { level, ids }); table.reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const canWrite = can('content:write');
  table = dataTable({
    searchPlaceholder: 'Search lessons by title or id…',
    filters: [{ key: 'level', label: 'All levels', options: levelOpts }, { key: 'status', label: 'Any status', options: [['published', 'Published'], ['draft', 'Draft']] }],
    fetch: (p) => get('/api/admin/lessons', { ...p, pageSize: p.level ? 100 : 20 }),
    toolbarExtra: canWrite ? h('a', { class: 'btn primary', href: '#/lessons/new', style: { marginLeft: 'auto' } }, 'New lesson') : null,
    empty: { title: 'No lessons yet', body: 'Create your first lesson.', action: canWrite ? h('a', { class: 'btn primary', href: '#/lessons/new' }, 'New lesson') : null },
    columns: [
      { label: 'Order', render: (l, i, items) => {
        const can2 = table.state.filters.level && !table.state.q && !table.state.filters.status && canWrite;
        return can2 ? h('div', { class: 'row', style: { gap: '2px' } }, h('button', { class: 'btn sm ghost icon', type: 'button', disabled: i === 0, 'aria-label': 'Move up', onclick: () => reorder(l.level, items, i, -1) }, '▲'), h('button', { class: 'btn sm ghost icon', type: 'button', disabled: i === items.length - 1, 'aria-label': 'Move down', onclick: () => reorder(l.level, items, i, 1) }, '▼')) : h('span', { class: 'faint' }, l.position + 1);
      } },
      { label: 'Lesson', render: (l) => h('div', null, h('a', { href: `#/lessons/${encodeURIComponent(l.id)}` }, h('strong', null, l.title)), h('div', { class: 'sub' }, `${l.id} · ${l.stepCount} steps · ${l.minutes} min`)) },
      { label: 'Level', render: (l) => badge(levelName(l.level), 'info') },
      { label: 'Skill', render: (l) => SKILL_LIST[l.skill] || l.skill },
      { label: 'Difficulty', render: (l) => '●'.repeat(l.difficulty) + '○'.repeat(5 - l.difficulty) },
      { label: 'Status', render: (l) => badge(l.status === 'published' ? 'Published' : 'Draft', l.status === 'published' ? 'good' : 'warn') },
      { label: 'Updated', render: (l) => h('span', { class: 'small' }, fmtDate(l.updatedAt)) },
      { label: '', class: 'actions', render: (l) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('a', { class: 'btn sm', href: `#/lessons/${encodeURIComponent(l.id)}` }, canWrite ? 'Edit' : 'View'),
        canWrite ? h('button', { class: 'btn sm', type: 'button', onclick: async () => {
          try { await post(`/api/admin/lessons/${encodeURIComponent(l.id)}/publish`, { published: l.status !== 'published' }); toast(l.status === 'published' ? 'Lesson unpublished.' : 'Lesson published.'); table.reload(); }
          catch (e) { modal({ title: 'Cannot publish', body: problemsBox(e.details, e.message) || h('p', null, e.message), footer: h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Close') }); }
        } }, l.status === 'published' ? 'Unpublish' : 'Publish') : null,
        canWrite ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
          if (!(await confirmDialog({ title: 'Delete lesson?', message: `“${l.title}” will be permanently deleted. Learners who completed it keep their own progress, but the lesson disappears from the site.`, ok: 'Delete lesson', danger: true, typeToConfirm: l.id }))) return;
          try { await del(`/api/admin/lessons/${encodeURIComponent(l.id)}`, { confirm: l.id }); toast('Lesson deleted.'); table.reload(); } catch (e) { toast(e.message, 'bad'); }
        } }, 'Delete') : null) },
    ],
  });
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Lessons'), h('p', null, 'Learners are guided through the lessons of their assessed level in the order shown here. Select a level to reorder.'))), table);
}

// ------------------------------------------------------------------------------------------------- editor
function blank() {
  return { id: '', level: 'beginner', skill: 'rules', title: '', summary: '', description: '', objectives: [], difficulty: 1, minutes: 6, status: 'draft', steps: [{ type: 'learn', title: 'Introduction', text: '<p>Explain the idea here.</p>' }] };
}

async function editor(host, ctx, existingId) {
  host.replaceChildren(loadingState(6));
  let L;
  try { L = existingId ? await get(`/api/admin/lessons/${encodeURIComponent(existingId)}`) : blank(); } catch (e) { host.replaceChildren(errorState(e, () => editor(host, ctx, existingId))); return; }
  const writable = can('content:write');
  const isNew = !existingId;
  const snap = () => JSON.stringify([L.level, L.skill, L.title, L.summary, L.description, L.objectives, L.difficulty, L.minutes, L.status, L.steps, L.id]);
  let saved = snap();
  ctx.setGuard(() => snap() !== saved);
  ctx.setTitle(isNew ? 'New lesson' : `Edit lesson`);

  // only the editable fields are sent; server-managed fields (updatedAt, position, …) are never posted back
  const payload = () => ({ id: L.id, level: L.level, skill: L.skill, title: L.title, summary: L.summary, description: L.description, objectives: L.objectives, difficulty: L.difficulty, minutes: L.minutes, status: L.status, steps: L.steps });
  const problemsHost = h('div');
  const showProblems = (list, title) => problemsHost.replaceChildren(problemsBox(list, title) || '');

  // ---- details
  const f = {};
  f.id = input({ value: L.id, disabled: !isNew || !writable, placeholder: 'b-castling', oninput: (e) => { L.id = e.target.value.trim(); } });
  f.title = input({ value: L.title, disabled: !writable, oninput: (e) => { L.title = e.target.value; if (isNew && !f.id.dataset.touched) { L.id = slug(e.target.value, L.level); f.id.value = L.id; } } });
  f.id.addEventListener('input', () => { f.id.dataset.touched = '1'; });
  f.level = select(levelOpts, L.level, { disabled: !writable, onchange: (e) => { L.level = e.target.value; if (isNew && !f.id.dataset.touched) { L.id = slug(L.title, L.level); f.id.value = L.id; } refreshPosition(); } });
  f.skill = select(skillOpts, L.skill, { disabled: !writable, onchange: (e) => { L.skill = e.target.value; } });
  f.difficulty = select([[1, '1 — easiest'], [2, '2'], [3, '3'], [4, '4'], [5, '5 — hardest']], L.difficulty, { disabled: !writable, onchange: (e) => { L.difficulty = +e.target.value; } });
  f.minutes = input({ type: 'number', min: 1, max: 90, value: L.minutes, disabled: !writable, oninput: (e) => { L.minutes = +e.target.value; } });
  f.summary = input({ value: L.summary, maxlength: 240, disabled: !writable, oninput: (e) => { L.summary = e.target.value; } });
  f.description = h('textarea', { value: L.description, disabled: !writable, oninput: (e) => { L.description = e.target.value; } });
  f.status = select([['draft', 'Draft — hidden from learners'], ['published', 'Published — visible to learners']], L.status, { disabled: !writable, onchange: (e) => { L.status = e.target.value; } });
  const objHost = h('div', { class: 'stack tight' });
  const drawObj = () => objHost.replaceChildren(...L.objectives.map((o, i) => h('div', { class: 'row' }, h('input', { type: 'text', value: o, maxlength: 160, disabled: !writable, 'aria-label': `Objective ${i + 1}`, oninput: (e) => { L.objectives[i] = e.target.value; } }), writable ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { L.objectives.splice(i, 1); drawObj(); } }, '×') : null)),
    writable ? h('div', null, h('button', { class: 'btn sm', type: 'button', disabled: L.objectives.length >= 8, onclick: () => { L.objectives.push(''); drawObj(); } }, 'Add objective')) : null);
  drawObj();
  const posNote = h('p', { class: 'faint small', style: { margin: 0 } });
  async function refreshPosition() {
    try {
      const r = await get('/api/admin/lessons', { level: L.level, pageSize: 100 });
      const idx = r.items.findIndex((x) => x.id === L.id);
      posNote.textContent = `Learners assessed as ${levelName(L.level)} see this level’s lessons in a fixed order (${r.items.filter((x) => x.status === 'published').length} published now). ${idx >= 0 && L.level === (existingId ? r.items[idx].level : L.level) ? `This lesson is #${idx + 1} of ${r.items.length}; ` : 'It will be added at the end of the level; '}reorder lessons from the lessons list.`;
    } catch { posNote.textContent = ''; }
  }
  refreshPosition();

  const details = h('section', { class: 'card stack' }, h('h3', null, 'Details'),
    h('div', { class: 'grid g2' }, field('Title', f.title), field('Lesson id', f.id, { hint: isNew ? 'Lower-case letters, digits, hyphens. Cannot change later.' : 'Fixed.' })),
    h('div', { class: 'grid g4' }, field('Level', f.level), field('Skill', f.skill), field('Difficulty', f.difficulty), field('Minutes', f.minutes)),
    posNote, field('Summary (shown on lesson cards)', f.summary), field('Description (optional)', f.description, { hint: 'Allowed formatting: <b>, <i>, <p>, <ul>/<li>. ' }),
    h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Learning objectives'), objHost), field('Status', f.status, { hint: 'Publishing requires at least one exercise and a quiz.' }));

  // ---- steps
  const stepsHost = h('div', { class: 'stack tight' });
  function drawSteps() {
    stepsHost.replaceChildren(...(L.steps.length ? L.steps.map((s, i) => h('div', { class: 'step' }, h('div', { class: 'step-head' },
      h('span', { class: 'n' }, i + 1), h('div', { class: 'grow' }, h('strong', null, STEP_LABEL(s)), h('div', { class: 'sub faint small', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '46ch' } }, STEP_SUMMARY(s))),
      writable ? h('div', { class: 'row', style: { gap: '4px' } },
        h('button', { class: 'btn sm', type: 'button', onclick: () => editStep(i) }, 'Edit'),
        h('button', { class: 'btn sm ghost icon', type: 'button', disabled: i === 0, 'aria-label': 'Move step up', onclick: () => { [L.steps[i - 1], L.steps[i]] = [L.steps[i], L.steps[i - 1]]; drawSteps(); } }, '▲'),
        h('button', { class: 'btn sm ghost icon', type: 'button', disabled: i === L.steps.length - 1, 'aria-label': 'Move step down', onclick: () => { [L.steps[i + 1], L.steps[i]] = [L.steps[i], L.steps[i + 1]]; drawSteps(); } }, '▼'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { L.steps.splice(i + 1, 0, structuredClone(s)); drawSteps(); } }, 'Duplicate'),
        h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete step?', message: `Remove step ${i + 1} (${STEP_LABEL(s)}) from this lesson?`, ok: 'Delete step', danger: true })) { L.steps.splice(i, 1); drawSteps(); } } }, 'Delete')) : null))) : [emptyState('No steps yet', 'Add an explanation, exercises and a final quiz.')]));
  }
  const addMenu = select([['', 'Add a step…'], ['learn', 'Explanation (text + diagram)'], ['move', 'Exercise: find the move'], ['line', 'Exercise: play a sequence'], ['squares', 'Exercise: click squares'], ['mc', 'Exercise: multiple choice'], ['coords', 'Exercise: coordinate practice'], ['quiz', 'Final quiz']], '', { 'aria-label': 'Add a step', style: { maxWidth: '280px' }, onchange: () => {
    if (!addMenu.value) return;
    L.steps.push(NEW_STEPS[addMenu.value]()); addMenu.value = ''; drawSteps(); editStep(L.steps.length - 1);
  } });
  drawSteps();
  const stepsCard = h('section', { class: 'card stack' }, h('div', { class: 'row spread wrap' }, h('h3', { style: { margin: 0 } }, 'Steps'), writable ? addMenu : null), stepsHost);

  function editStep(i) {
    let form = buildStepForm(L.steps[i]);
    let mode = 'form';
    const body = h('div', { class: 'stack' });
    const err = h('div');
    const json = h('textarea', { style: { minHeight: '320px', fontFamily: 'var(--mono)', fontSize: '.82rem' }, spellcheck: false });
    const modeBtn = h('button', { class: 'btn sm ghost', type: 'button' }, 'Edit as JSON');
    const draw = () => body.replaceChildren(mode === 'form' ? form.node : h('div', { class: 'stack tight' }, h('p', { class: 'muted small' }, 'Raw step data. The server validates every field (positions, legal moves, allowed formatting) when you save the lesson.'), json));
    modeBtn.onclick = () => {
      err.replaceChildren();
      if (mode === 'form') { json.value = JSON.stringify(form.read(), null, 2); mode = 'json'; modeBtn.textContent = 'Back to form'; }
      else { try { const s = JSON.parse(json.value); form.dispose(); form = buildStepForm(s); mode = 'form'; modeBtn.textContent = 'Edit as JSON'; } catch (e) { err.replaceChildren(problemsBox([{ message: 'Invalid JSON: ' + e.message }])); return; } }
      draw();
    };
    draw();
    const apply = h('button', { class: 'btn primary', type: 'button' }, 'Apply to lesson');
    const m = modal({ title: `${STEP_LABEL(L.steps[i])} — step ${i + 1}`, wide: true, body: h('div', { class: 'stack' }, body, err), footer: [modeBtn, h('div', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onclick: () => { form.dispose(); m.close(); } }, 'Cancel'), apply], onClose: () => form.dispose() });
    apply.onclick = () => {
      try { L.steps[i] = mode === 'form' ? form.read() : JSON.parse(json.value); } catch (e) { err.replaceChildren(problemsBox([{ message: 'Invalid JSON: ' + e.message }])); return; }
      drawSteps(); m.close();
    };
  }

  // ---- preview + actions
  const frame = previewFrame({ height: 640 });
  const actions = h('div', { class: 'row wrap' });
  async function validate(silent = false) {
    showProblems([]);
    try {
      const r = await post('/api/admin/lessons/validate', payload());
      if (!r.ok) { showProblems(r.problems, 'This lesson has problems'); if (!silent) toast('Fix the problems listed below.', 'warn'); return null; }
      if (!silent) toast('Lesson is valid.');
      return r.lesson;
    } catch (e) { showProblems([{ message: e.message }]); return null; }
  }
  async function preview() { const v = await validate(true); if (v) frame.send({ type: 'lesson', lesson: v }); }
  async function save() {
    showProblems([]);
    saveBtn.disabled = true;
    try {
      const body = payload();
      const r = isNew ? await post('/api/admin/lessons', body) : await put(`/api/admin/lessons/${encodeURIComponent(L.id)}`, body);
      L = r; saved = snap();
      toast(L.status === 'published' ? 'Saved and published.' : 'Saved as draft.');
      if (isNew) { ctx.setGuard(null); ctx.navigate(`/lessons/${encodeURIComponent(r.id)}`); return; }
      refreshPosition();
    } catch (e) { showProblems(e.details && Array.isArray(e.details) ? e.details : [{ message: e.message }], e.message); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    saveBtn.disabled = false;
  }
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save lesson');
  actions.append(...(writable ? [saveBtn] : []), h('button', { class: 'btn', type: 'button', onclick: () => validate() }, 'Validate'), h('button', { class: 'btn', type: 'button', onclick: preview }, 'Preview lesson'), h('a', { class: 'btn ghost', href: '#/lessons' }, 'Back to lessons'));
  const side = h('div', { class: 'stack side-col' }, h('section', { class: 'card stack' }, h('h3', null, 'Preview'), h('p', { class: 'muted small', style: { margin: 0 } }, 'Runs the real lesson player with your current, unsaved content. Nothing you do here is recorded as progress.'), frame));

  host.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, isNew ? 'New lesson' : L.title || 'Edit lesson'), h('p', null, `${levelName(L.level)} · ${isNew ? 'unsaved' : (L.status === 'published' ? 'published' : 'draft')}${L.source === 'builtin' ? ' · bundled lesson' : ''}`)), actions),
    problemsHost,
    h('div', { class: 'split' }, h('div', { class: 'stack' }, details, stepsCard), side));
  if (!writable) host.prepend(h('div', { class: 'notice', style: { marginBottom: '14px' } }, 'You have read-only access to content.'));

  return () => frame.dispose();
}

const LEVEL_PREFIX = { beginner: 'b', elementary: 'e', intermediate: 'i', advanced: 'a', expert: 'x' };
function slug(title, level) {
  const s = String(title).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);
  return s ? `${LEVEL_PREFIX[level] || 'x'}-${s}`.slice(0, 41) : '';
}
