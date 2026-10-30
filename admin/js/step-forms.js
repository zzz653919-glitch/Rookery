// Editors for each lesson step type. Every form returns { node, read() } where read() builds the step object that is
// sent to the server (which validates it again). Anything unusual can be edited in the raw JSON tab.
import { h, tr } from './dom.js';
import { field, input, select, toggle } from './ui.js';
import { positionPicker, START_FEN } from './position.js';

const area = (value, props = {}) => h('textarea', { value: value || '', ...props });
const SQ = /^[a-h][1-8]$/;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const csv = (s) => String(s).split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

// editable list of strings with remove buttons (chips) + an add input
function chipsEditor(initial, { pattern, placeholder, label }) {
  const list = [...(initial || [])];
  const chips = h('div', { class: 'chips' });
  const add = input({ placeholder, 'aria-label': label, style: { maxWidth: '200px' } });
  const err = h('span', { class: 'small', style: { color: 'var(--danger)' } });
  const draw = () => chips.replaceChildren(...list.map((v, i) => h('span', { class: 'chip' }, v, h('button', { type: 'button', 'aria-label': `Remove ${v}`, onclick: () => { list.splice(i, 1); draw(); } }, '×'))));
  const addIt = () => {
    const vals = csv(add.value); err.textContent = '';
    for (const v of vals) { if (!pattern.test(v)) { err.textContent = tr(`“${v}” is not valid here.`); return; } if (!list.includes(v)) list.push(v); }
    add.value = ''; draw();
  };
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
  draw();
  return { node: h('div', { class: 'stack tight' }, chips, h('div', { class: 'row' }, add, h('button', { class: 'btn sm', type: 'button', onclick: addIt }, 'Add')), err), get: () => [...list], set: (v) => { list.splice(0, list.length, ...v); draw(); }, add: (v) => { if (!list.includes(v)) { list.push(v); draw(); } } };
}

function optionsEditor(options, answer, { minOptions = 2 } = {}) {
  const rows = (options && options.length ? [...options] : ['', '']).map((t) => ({ t }));
  let correct = Math.min(answer || 0, rows.length - 1);
  const host = h('div', { class: 'stack tight' });
  const draw = () => host.replaceChildren(...rows.map((r, i) => h('div', { class: 'row' },
    h('input', { type: 'radio', name: 'correct-' + host.id, checked: i === correct, 'aria-label': `Option ${i + 1} is correct`, onchange: () => { correct = i; } }),
    h('input', { type: 'text', value: r.t, placeholder: `Option ${i + 1}`, 'aria-label': `Option ${i + 1}`, oninput: (e) => { r.t = e.target.value; } }),
    h('button', { class: 'btn sm ghost', type: 'button', disabled: rows.length <= minOptions, 'aria-label': 'Remove option', onclick: () => { rows.splice(i, 1); if (correct >= rows.length) correct = rows.length - 1; else if (i < correct) correct--; draw(); } }, '×'))),
    h('div', null, h('button', { class: 'btn sm', type: 'button', disabled: rows.length >= 6, onclick: () => { rows.push({ t: '' }); draw(); } }, 'Add option'), h('span', { class: 'faint small', style: { marginLeft: '10px' } }, 'Select the radio button next to the correct answer.')));
  host.id = 'opt' + Math.random().toString(36).slice(2, 7);
  draw();
  return { node: host, get: () => ({ options: rows.map((r) => r.t), answer: correct }) };
}

function kvListEditor(map, { keyPlaceholder, valPlaceholder }) {
  const rows = Object.entries(map || {}).map(([k, v]) => ({ k, v }));
  const host = h('div', { class: 'stack tight' });
  const draw = () => host.replaceChildren(...rows.map((r, i) => h('div', { class: 'row' },
    h('input', { type: 'text', value: r.k, placeholder: keyPlaceholder, style: { maxWidth: '110px' }, 'aria-label': 'Move', oninput: (e) => { r.k = e.target.value.trim(); } }),
    h('input', { type: 'text', value: r.v, placeholder: valPlaceholder, 'aria-label': 'Message', oninput: (e) => { r.v = e.target.value; } }),
    h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { rows.splice(i, 1); draw(); } }, '×'))),
    h('button', { class: 'btn sm', type: 'button', onclick: () => { rows.push({ k: '', v: '' }); draw(); } }, 'Add note'));
  draw();
  return { node: host, get: () => Object.fromEntries(rows.filter((r) => r.k).map((r) => [r.k, r.v])) };
}

function marksEditor(marks, arrows) {
  const m = (marks || []).map((x) => ({ ...x })), a = (arrows || []).map((x) => ({ from: x[0], to: x[1], color: x[2] || '#f5b942' }));
  const host = h('div', { class: 'stack tight' });
  const KINDS = [['info', 'Info (amber)'], ['good', 'Good (green)'], ['bad', 'Bad (red)'], ['hint', 'Hint (blue)']];
  const COLORS = [['#f5b942', 'Gold'], ['#ff6b6b', 'Red'], ['#46d39a', 'Green'], ['#4cc3ff', 'Blue']];
  const draw = () => host.replaceChildren(
    h('div', { class: 'lbl' }, 'Highlighted squares'),
    ...m.map((r, i) => h('div', { class: 'row' }, h('input', { type: 'text', value: r.sq || '', placeholder: 'e4', style: { maxWidth: '80px' }, 'aria-label': 'Square', oninput: (e) => { r.sq = e.target.value.trim().toLowerCase(); } }),
      select(KINDS, r.kind || 'info', { 'aria-label': 'Kind', onchange: (e) => { r.kind = e.target.value; } }), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { m.splice(i, 1); draw(); } }, '×'))),
    h('div', null, h('button', { class: 'btn sm', type: 'button', onclick: () => { m.push({ sq: '', kind: 'info' }); draw(); } }, 'Add square')),
    h('div', { class: 'lbl', style: { marginTop: '6px' } }, 'Arrows'),
    ...a.map((r, i) => h('div', { class: 'row' }, h('input', { type: 'text', value: r.from || '', placeholder: 'from', style: { maxWidth: '70px' }, 'aria-label': 'From', oninput: (e) => { r.from = e.target.value.trim().toLowerCase(); } }),
      h('input', { type: 'text', value: r.to || '', placeholder: 'to', style: { maxWidth: '70px' }, 'aria-label': 'To', oninput: (e) => { r.to = e.target.value.trim().toLowerCase(); } }),
      select(COLORS, r.color, { 'aria-label': 'Colour', onchange: (e) => { r.color = e.target.value; } }), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { a.splice(i, 1); draw(); } }, '×'))),
    h('div', null, h('button', { class: 'btn sm', type: 'button', onclick: () => { a.push({ from: '', to: '', color: '#f5b942' }); draw(); } }, 'Add arrow')));
  draw();
  return { node: host, get: () => ({ marks: m.filter((r) => SQ.test(r.sq)).map((r) => ({ sq: r.sq, kind: r.kind })), arrows: a.filter((r) => SQ.test(r.from) && SQ.test(r.to)).map((r) => [r.from, r.to, r.color]) }) };
}

const HINT_TEXT = 'Allowed formatting: <b>, <i>, <p>, <ul>/<ol>/<li>, <br>, <code>. Anything else is removed.';

// Returns { node, read, dispose }
export function buildStepForm(step) {
  const disposers = [];
  const out = (node, read) => ({ node, read, dispose: () => disposers.forEach((d) => d()) });
  const picker = (fen, extra = {}) => { const p = positionPicker({ fen, ...extra }); disposers.push(p.dispose); return p; };

  if (step.type === 'learn') {
    const title = input({ value: step.title || '' });
    const text = area(step.text, { style: { minHeight: '150px' }, spellcheck: true });
    const useBoard = h('input', { type: 'checkbox', checked: !!step.fen });
    const mk = marksEditor(step.marks, step.arrows);
    const explore = h('input', { type: 'checkbox', checked: !!step.explore });
    const pick = picker(step.fen || START_FEN, { marks: step.marks, arrows: step.arrows?.map(([from, to, color]) => ({ from, to, color })) });
    const boardBox = h('div', { class: 'stack', hidden: !step.fen }, pick.node, h('label', { class: 'row' }, explore, 'Let the learner click pieces to see where they can move'), mk.node);
    useBoard.onchange = () => { boardBox.hidden = !useBoard.checked; if (useBoard.checked) pick.refresh(); };
    return out(h('div', { class: 'stack' }, field('Title', title), field('Text', text, { hint: HINT_TEXT }), h('label', { class: 'row' }, useBoard, 'Show a chess diagram'), boardBox), () => {
      const s = { type: 'learn', title: title.value.trim(), text: text.value.trim() };
      if (useBoard.checked) { s.fen = pick.getFen(); if (pick.getOrientation() === 'b') s.orientation = 'b'; if (explore.checked) s.explore = true; const { marks, arrows } = mk.get(); if (marks.length) s.marks = marks; if (arrows.length) s.arrows = arrows; }
      return s;
    });
  }

  if (step.type === 'quiz') {
    const qs = (step.questions || [{ q: '', options: ['', ''], answer: 0, explain: '' }]).map((q) => ({ q: q.q, explain: q.explain, ed: optionsEditor(q.options, q.answer) }));
    const host = h('div', { class: 'stack' });
    const draw = () => host.replaceChildren(...qs.map((q, i) => h('div', { class: 'step' }, h('div', { class: 'step-head' }, h('span', { class: 'n' }, i + 1), h('strong', { class: 'grow' }, `Question ${i + 1}`),
      h('button', { class: 'btn sm ghost', type: 'button', disabled: qs.length <= 1, onclick: () => { qs.splice(i, 1); draw(); } }, 'Remove')),
      h('div', { class: 'step-body stack' }, field('Question', input({ value: q.q, oninput: (e) => { q.q = e.target.value; } })), q.ed.node, field('Explanation shown after answering', input({ value: q.explain, oninput: (e) => { q.explain = e.target.value; } }))))),
      h('div', null, h('button', { class: 'btn sm', type: 'button', disabled: qs.length >= 12, onclick: () => { qs.push({ q: '', explain: '', ed: optionsEditor(['', ''], 0) }); draw(); } }, 'Add question')));
    draw();
    return out(h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'The quiz ends the lesson: learners must pass it to complete the lesson.'), host), () => ({ type: 'quiz', questions: qs.map((q) => ({ kind: 'mc', q: q.q.trim(), ...q.ed.get(), explain: q.explain.trim() })) }));
  }

  // ---- tasks
  const instruction = input({ value: step.instruction || '' });
  const hint = input({ value: step.hint || '' }), explain = area(step.explain || '', { style: { minHeight: '70px' } });
  const [fInstr, fHint, fExplain] = [field('Instruction shown to the learner', instruction, { hint: HINT_TEXT }), field('Hint (optional)', hint), field('Explanation after solving (optional)', explain)];
  const addCommon = (s) => { s.instruction = instruction.value.trim(); if (hint.value.trim()) s.hint = hint.value.trim(); if (explain.value.trim()) s.explain = explain.value.trim(); return s; };

  if (step.kind === 'move') {
    const accept = chipsEditor(step.accept, { pattern: UCI, placeholder: 'e2e4', label: 'Accepted move' });
    const wrong = kvListEditor(step.wrong, { keyPlaceholder: 'a2a4', valPlaceholder: 'Why this move is not best' });
    const verify = select([['', 'None'], ['best', 'Engine agrees it is the best move (checked in tests)'], ['mate', 'It is checkmate in one'], ['parry', 'It stops a mate threat']], step.verify || '');
    const pick = picker(step.fen || START_FEN, { allowRecord: true, onMove: (m) => accept.add(m.uci) });
    return out(h('div', { class: 'stack' }, fInstr, pick.node,
      h('div', { class: 'notice' }, 'Choose “Play moves”, then play a correct move on the board to add it to the accepted moves. You can accept several.'), field('Accepted moves', accept.node), field('Common wrong moves and what to tell the learner (optional)', wrong.node), fHint, fExplain, field('Verification label (optional)', verify)), () => {
      const s = { type: 'task', kind: 'move', fen: pick.getFen(), accept: accept.get() };
      const w = wrong.get(); if (Object.keys(w).length) s.wrong = w; if (verify.value) s.verify = verify.value;
      return addCommon(s);
    });
  }

  if (step.kind === 'line') {
    const flat = (step.steps || []).flatMap((st) => [st.accept?.[0], st.reply].filter(Boolean));
    const extraAlt = (step.steps || []).some((st) => (st.accept || []).length > 1);
    let moves = [...flat];
    const seq = chipsEditor(moves, { pattern: UCI, placeholder: 'e2e4 e7e5 …', label: 'Move' });
    const pick = picker(step.fen || START_FEN, { allowRecord: true, onMove: (m) => seq.add(m.uci) });
    return out(h('div', { class: 'stack' }, fInstr, pick.node,
      h('div', { class: 'notice' }, 'Play the line on the board (“Play moves”): the learner plays moves 1, 3, 5…; replies 2, 4, 6… are played automatically. The last move must be the learner’s.'),
      extraAlt ? h('div', { class: 'notice warn' }, 'This step accepts alternative moves. Saving here keeps only the main line — use the JSON tab to keep alternatives.') : null,
      field('Moves in order', seq.node), fHint, fExplain), () => {
      const list = seq.get(); const steps = [];
      for (let i = 0; i < list.length; i += 2) steps.push(list[i + 1] ? { accept: [list[i]], reply: list[i + 1] } : { accept: [list[i]] });
      const s = { type: 'task', kind: 'line', fen: pick.getFen(), steps };
      if (step.verify) s.verify = step.verify; if (step.plain != null) s.plain = step.plain;
      return addCommon(s);
    });
  }

  if (step.kind === 'squares') {
    const target = chipsEditor(step.target, { pattern: SQ, placeholder: 'd4 e5 …', label: 'Target square' });
    const pick = picker(step.fen || START_FEN);
    return out(h('div', { class: 'stack' }, fInstr, pick.node, field('Squares the learner must click', target.node), fHint, fExplain), () => addCommon({ type: 'task', kind: 'squares', fen: pick.getFen(), target: target.get() }));
  }

  if (step.kind === 'coords') {
    const rounds = input({ type: 'number', value: step.rounds ?? 8, min: 2, max: 30 }), pass = input({ type: 'number', value: step.pass ?? 6, min: 1, max: 30 });
    return out(h('div', { class: 'stack' }, field('Instruction', instruction), h('div', { class: 'grid g2' }, field('Rounds', rounds), field('Correct answers needed', pass))), () => ({ type: 'task', kind: 'coords', instruction: instruction.value.trim(), rounds: +rounds.value, pass: +pass.value }));
  }

  if (step.kind === 'mc') {
    const q = input({ value: step.q || '' });
    const ed = optionsEditor(step.options, step.answer);
    const useBoard = h('input', { type: 'checkbox', checked: !!step.fen });
    const pick = picker(step.fen || START_FEN);
    const boardBox = h('div', { hidden: !step.fen }, pick.node);
    useBoard.onchange = () => { boardBox.hidden = !useBoard.checked; if (useBoard.checked) pick.refresh(); };
    return out(h('div', { class: 'stack' }, field('Heading (instruction)', instruction), field('Question', q), ed.node, h('label', { class: 'row' }, useBoard, 'Show a chess diagram with the question'), boardBox, field('Explanation after answering', explain)), () => {
      const s = { type: 'task', kind: 'mc', instruction: instruction.value.trim(), q: q.value.trim(), ...ed.get(), explain: explain.value.trim() };
      if (useBoard.checked) s.fen = pick.getFen(); if (step.orientation) s.orientation = step.orientation; if (step.threat != null) s.threat = step.threat;
      return s;
    });
  }
  return out(h('p', { class: 'muted' }, 'This step type can only be edited as JSON.'), () => step);
}

export const NEW_STEPS = {
  learn: () => ({ type: 'learn', title: 'New explanation', text: '<p>Explain the idea here.</p>' }),
  move: () => ({ type: 'task', kind: 'move', instruction: 'Find the best move.', fen: START_FEN, accept: ['e2e4'] }),
  line: () => ({ type: 'task', kind: 'line', instruction: 'Play the moves.', fen: START_FEN, steps: [{ accept: ['e2e4'], reply: 'e7e5' }, { accept: ['g1f3'] }] }),
  squares: () => ({ type: 'task', kind: 'squares', instruction: 'Click every square the piece can move to.', fen: '8/8/8/8/3N4/8/8/8 w - - 0 1', target: [] }),
  mc: () => ({ type: 'task', kind: 'mc', instruction: 'Question', q: 'Which is correct?', options: ['Answer A', 'Answer B'], answer: 0, explain: '' }),
  coords: () => ({ type: 'task', kind: 'coords', instruction: 'Click the square that is named on the right.', rounds: 8, pass: 6 }),
  quiz: () => ({ type: 'quiz', questions: [{ kind: 'mc', q: '', options: ['', ''], answer: 0, explain: '' }] }),
};
export const STEP_LABEL = (s) => (s.type === 'learn' ? 'Explanation' : s.type === 'quiz' ? 'Quiz' : { move: 'Move exercise', line: 'Move sequence', squares: 'Click squares', coords: 'Coordinate practice', mc: 'Multiple choice' }[s.kind] || 'Exercise');
export const STEP_SUMMARY = (s) => (s.type === 'learn' ? s.title : s.type === 'quiz' ? `${s.questions?.length || 0} question(s)` : (s.instruction || s.q || '').replace(/<[^>]+>/g, ''));
