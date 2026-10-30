import { h, tr } from '../dom.js';
import { tn } from '../i18n.js';
import { get, put, post, can } from '../api.js';
import { field, input, select, toggle, toast, confirmDialog, problemsBox, loadingState, errorState } from '../ui.js';
import { LEVELS, SKILLS } from '../../../js/data/levels.js';

export async function mount(host, ctx) {
  host.replaceChildren(loadingState(6));
  let S, defaults, themes;
  try { [{ settings: S, defaults }, themes] = await Promise.all([get('/api/admin/settings'), get('/api/admin/themes')]); } catch (e) { host.replaceChildren(errorState(e, () => mount(host, ctx))); return; }
  const writable = can('settings:write');
  let saved = JSON.stringify(S);
  ctx.setGuard(() => JSON.stringify(S) !== saved);
  const problems = h('div');
  const dis = { disabled: !writable };
  const num = (v, min, max, step, onchange, label) => input({ type: 'number', value: v, min, max, step, 'aria-label': label, oninput: (e) => onchange(e.target.value === '' ? NaN : Number(e.target.value)), ...dis });
  const sw = (checked, onchange, label) => { const s = toggle(checked, onchange, label); if (!writable) s.firstChild.disabled = true; return s; };

  // ---- defaults
  const defaultsCard = h('section', { class: 'card stack' }, h('h3', null, 'Default look for new visitors'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Players who already chose their own settings keep them. Add or disable themes on the Themes page.'),
    h('div', { class: 'grid g2' },
      field('Default board theme', select(themes.boardThemes.filter((t) => t.enabled).map((t) => [t.id, t.name]), S.defaultBoardTheme, { ...dis, onchange: (e) => { S.defaultBoardTheme = e.target.value; } })),
      field('Default piece set', select(themes.pieceSets.filter((t) => t.enabled).map((t) => [t.id, t.name]), S.defaultPieceSet, { ...dis, onchange: (e) => { S.defaultPieceSet = e.target.value; } }))),
    h('div', { class: 'grid g2' },
      field('Appearance', select([['dark', 'Dark theme'], ['light', 'Light theme']], S.appearance.defaultTheme, { ...dis, onchange: (e) => { S.appearance.defaultTheme = e.target.value; } })),
      h('div', { class: 'stack tight' },
        ...[['coords', 'Show board coordinates'], ['animations', 'Piece animations'], ['highlightMoves', 'Highlight legal moves']].map(([k, label]) => h('label', { class: 'row' }, sw(S.appearance[k], (v) => { S.appearance[k] = v; }, label), label)))));

  // ---- computer levels
  const lvlRows = S.computerLevels.map((l) => h('tr', null,
    h('td', null, h('strong', null, l.id)),
    h('td', null, input({ value: l.name, maxlength: 24, 'aria-label': `Level ${l.id} name`, oninput: (e) => { l.name = e.target.value; }, ...dis })),
    h('td', null, input({ value: l.blurb, maxlength: 160, 'aria-label': `Level ${l.id} description`, oninput: (e) => { l.blurb = e.target.value; }, ...dis })),
    h('td', null, sw(l.enabled, (v) => { l.enabled = v; }, `Enable level ${l.id}`))));
  const levelsCard = h('section', { class: 'card stack' }, h('h3', null, 'Computer difficulty levels'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'You can rename levels or hide them. Playing strength (search depth and time) is fixed in the engine and cannot be changed here. At least one level must stay enabled.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Level', 'Name', 'Description', 'Enabled'].map((t) => h('th', null, t)))), h('tbody', null, lvlRows))));

  // ---- time controls
  const tcBody = h('tbody');
  const drawTc = () => tcBody.replaceChildren(...S.timeControls.map((t, i) => {
    const untimed = t.base === 0;
    const syncId = () => { t.id = t.base === 0 ? 'none' : `${t.base % 60 === 0 ? t.base / 60 : t.base + 's'}+${t.inc}`; };
    return h('tr', null,
      h('td', null, input({ value: t.label, maxlength: 16, 'aria-label': 'Label', oninput: (e) => { t.label = e.target.value; }, ...dis })),
      h('td', null, untimed ? h('span', { class: 'muted' }, 'No clock') : num(t.base / 60, 0.5, 180, 0.5, (v) => { t.base = Math.round(v * 60); syncId(); }, 'Minutes per side')),
      h('td', null, untimed ? '—' : num(t.inc, 0, 60, 1, (v) => { t.inc = v; syncId(); }, 'Increment seconds')),
      h('td', null, untimed ? h('span', { class: 'badge' }, 'Always on') : sw(t.enabled, (v) => { t.enabled = v; }, `Enable ${t.label}`)),
      h('td', { class: 'actions' }, writable && !untimed ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { S.timeControls.splice(i, 1); drawTc(); } }, 'Remove') : null));
  }));
  drawTc();
  const timeCard = h('section', { class: 'card stack' }, h('div', { class: 'row spread' }, h('h3', { style: { margin: 0 } }, 'Supported time controls'),
    writable ? h('button', { class: 'btn sm', type: 'button', disabled: false, onclick: () => { S.timeControls.push({ id: '2+1', label: '2 | 1', base: 120, inc: 1, enabled: true }); drawTc(); } }, 'Add time control') : null),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Label', 'Minutes per side', 'Increment (s)', 'Enabled', ''].map((t) => h('th', null, t)))), tcBody)));

  // ---- puzzle categories
  const catBody = h('tbody');
  const drawCats = () => catBody.replaceChildren(...S.puzzleCategories.map((c, i) => h('tr', null,
    h('td', null, input({ value: c.id, maxlength: 20, 'aria-label': 'Category id', style: { width: '110px', fontFamily: 'var(--mono)' }, oninput: (e) => { c.id = e.target.value.trim().toLowerCase(); }, disabled: !writable || !c._new })),
    h('td', null, input({ value: c.name, maxlength: 40, 'aria-label': 'Name', oninput: (e) => { c.name = e.target.value; }, ...dis })),
    h('td', null, input({ value: c.desc, maxlength: 120, 'aria-label': 'Description', oninput: (e) => { c.desc = e.target.value; }, ...dis })),
    h('td', null, select(Object.entries(SKILLS), c.skill, { 'aria-label': 'Skill', onchange: (e) => { c.skill = e.target.value; }, ...dis })),
    h('td', null, sw(c.enabled, (v) => { c.enabled = v; }, `Enable ${c.name}`)),
    h('td', { class: 'actions' }, writable ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { S.puzzleCategories.splice(i, 1); drawCats(); } }, 'Remove') : null))));
  drawCats();
  const catCard = h('section', { class: 'card stack' }, h('div', { class: 'row spread' }, h('h3', { style: { margin: 0 } }, 'Puzzle categories'),
    writable ? h('button', { class: 'btn sm', type: 'button', onclick: () => { S.puzzleCategories.push({ id: '', name: '', desc: '', skill: 'tactics', enabled: true, _new: true }); drawCats(); } }, 'Add category') : null),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'A category that still has puzzles cannot be removed — move or delete those puzzles first. Disabling hides the category (and its puzzles) from players.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Id', 'Name', 'Description', 'Skill', 'Enabled', ''].map((t) => h('th', null, t)))), catBody)));

  // ---- learning
  const A = S.assessment, LS = S.lessons;
  const learnCard = h('section', { class: 'card stack' }, h('h3', null, 'Learning-level assessment & lessons'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'The placement test measures accuracy per difficulty tier. A tier counts as mastered at or above the mastery threshold, or — if the next tier is strong — at or above the “bridge” threshold. Learners start at the first tier that is not mastered.'),
    h('div', { class: 'grid g3' },
      field('Mastery threshold', num(A.master, 0.5, 0.9, 0.05, (v) => { A.master = v; }, 'Mastery threshold'), { hint: '0.50–0.90 · default 0.60' }),
      field('Bridge minimum', num(A.bridgeLo, 0.2, 0.6, 0.05, (v) => { A.bridgeLo = v; }, 'Bridge minimum'), { hint: '0.20–0.60 · default 0.40' }),
      field('Bridge: next tier needs', num(A.bridgeNext, 0.6, 0.95, 0.05, (v) => { A.bridgeNext = v; }, 'Bridge next tier'), { hint: '0.60–0.95 · default 0.80' })),
    h('div', { class: 'grid g3' }, field('Quiz pass ratio', num(LS.quizPassRatio, 0.4, 1, 0.05, (v) => { LS.quizPassRatio = v; }, 'Quiz pass ratio'), { hint: 'Share of quiz questions to get right · 0.40–1.00 · default 0.60' })),
    h('div', null, h('div', { class: 'lbl' }, 'Suggested computer level per learning level'),
      h('div', { class: 'grid g4' }, LEVELS.map((lv) => field(lv.name, select(S.computerLevels.map((c) => [c.id, `${c.id} · ${c.name}`]), LS.levelEngine[lv.id], { ...dis, onchange: (e) => { LS.levelEngine[lv.id] = +e.target.value; } }))))));

  const note = h('div', { class: 'notice' }, h('strong', null, 'Chess rules are not configurable. '), 'Legal-move generation, check/checkmate/draw detection and game-result validation are part of the program and cannot be switched off or changed from this page.');
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save settings');
  async function save() {
    problems.replaceChildren(); saveBtn.disabled = true;
    try {
      const body = structuredClone(S); body.puzzleCategories = body.puzzleCategories.map(({ _new, ...c }) => c);
      const r = await put('/api/admin/settings', body);
      S = r.settings; saved = JSON.stringify(S);
      toast(r.changed.length ? tn(r.changed.length, 'Saved ({n} section changed).|Saved ({n} sections changed).') : 'Nothing changed.');
      if (r.changed.length) { ctx.setGuard(null); host.replaceChildren(); await mount(host, ctx); }
    } catch (e) { problems.replaceChildren(problemsBox(Array.isArray(e.details) ? e.details : [{ message: e.message }], e.message)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    saveBtn.disabled = false;
  }
  const resetBtn = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (!(await confirmDialog({ title: 'Reset all settings?', message: 'Every setting on this page returns to its factory default. Lessons, puzzles and themes are not affected.', ok: 'Reset settings', danger: true }))) return;
    try { await post('/api/admin/settings/reset'); toast('Settings reset to defaults.'); ctx.setGuard(null); host.replaceChildren(); await mount(host, ctx); } catch (e) { toast(e.message, 'bad'); }
  } }, 'Reset to defaults');
  host.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Chess settings'), h('p', null, 'Changes apply to the player site the next time it loads.')), h('div', { class: 'row' }, ...(writable ? [resetBtn, saveBtn] : []))),
    !writable ? h('div', { class: 'notice', style: { marginBottom: '14px' } }, 'You have read-only access to settings.') : h('span', { hidden: true }), problems, h('div', { class: 'stack' }, note, defaultsCard, levelsCard, timeCard, catCard, learnCard));
  void defaults;
}
