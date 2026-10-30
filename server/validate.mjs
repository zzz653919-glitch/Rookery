// Server-side validation for everything an administrator can submit. Nothing from the browser is trusted.
// Chess positions and moves are validated with the same rules library the player site uses.
import { Chess } from '../js/chess/rules.js';
import { DEFAULT_SETTINGS, LEARN_LEVEL_IDS, SKILLS, LESSON_SKILLS } from './defaults.mjs';

export class Problems {
  constructor() { this.list = []; }
  add(path, message) { this.list.push({ path, message }); }
  get ok() { return this.list.length === 0; }
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const SQ_RE = /^[a-h][1-8]$/;
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const isId = (s) => typeof s === 'string' && ID_RE.test(s);
export const isHex = (s) => typeof s === 'string' && HEX_RE.test(s);
export const uciOf = (m) => m.from + m.to + (m.promotion || '');

// ---- HTML allow-list (lesson text is rendered as HTML by the player) ----------------------------
const TAGS = new Set(['p', 'b', 'i', 'em', 'strong', 'ul', 'ol', 'li', 'br', 'code', 'span', 'sup', 'sub', 'h4']);
export function sanitizeHtml(s) {
  const re = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let out = '', last = 0, m;
  const text = (t) => t.replace(/</g, '&lt;');
  while ((m = re.exec(s))) {
    out += text(s.slice(last, m.index));
    const tag = m[2].toLowerCase();
    if (TAGS.has(tag)) out += tag === 'br' ? '<br>' : `<${m[1] ? '/' : ''}${tag}>`;
    last = m.index + m[0].length;
  }
  return out + text(s.slice(last));
}

// ---- field helpers -------------------------------------------------------------------------------
function str(P, path, v, { max = 200, min = 0, html = false, required = false } = {}) {
  if (v == null || v === '') { if (required || min) P.add(path, 'This field is required.'); return ''; }
  if (typeof v !== 'string') { P.add(path, 'Must be text.'); return ''; }
  const t = v.trim();
  if (t.length < min) P.add(path, `Use at least ${min} characters.`);
  if (t.length > max) { P.add(path, `Use at most ${max} characters.`); return t.slice(0, max); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t)) P.add(path, 'Contains control characters.');
  return html ? sanitizeHtml(t) : t.replace(/[<>]/g, '');
}
function int(P, path, v, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) { P.add(path, `Must be a whole number from ${min} to ${max}.`); return min; }
  return n;
}
function num(P, path, v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) { P.add(path, `Must be a number from ${min} to ${max}.`); return min; }
  return n;
}
const only = (P, path, obj, allowed) => { for (const k of Object.keys(obj)) if (!allowed.includes(k)) P.add(path ? `${path}.${k}` : k, 'Unknown field.'); };

export function chessOf(fen) {
  if (typeof fen !== 'string' || fen.length > 100) return null;
  try { return new Chess(fen.trim()); } catch { return null; }
}
function fenField(P, path, v, { required = true } = {}) {
  if (v == null || v === '') { if (required) P.add(path, 'A FEN position is required.'); return undefined; }
  const g = chessOf(v);
  if (!g) { P.add(path, 'Not a valid FEN position.'); return undefined; }
  return v.trim();
}
const legalList = (g) => g.moves({ verbose: true }).map(uciOf);
function uciList(P, path, g, arr, { min = 1, max = 12 } = {}) {
  if (!Array.isArray(arr) || arr.length < min || arr.length > max) { P.add(path, `Provide ${min}–${max} moves.`); return []; }
  const legal = g ? legalList(g) : [];
  return arr.map((u, i) => {
    if (typeof u !== 'string' || !UCI_RE.test(u)) { P.add(`${path}[${i}]`, 'Use coordinate notation such as e2e4 (promotion: e7e8q).'); return u; }
    if (g && !legal.includes(u)) P.add(`${path}[${i}]`, `${u} is not a legal move in this position.`);
    return u;
  });
}
const sqList = (P, path, arr, max = 64) => {
  if (!Array.isArray(arr) || arr.length > max) { P.add(path, 'Must be a list of squares.'); return []; }
  return arr.map((s, i) => { if (typeof s !== 'string' || !SQ_RE.test(s)) P.add(`${path}[${i}]`, 'Not a square (a1–h8).'); return s; });
};

// ---- lesson steps -------------------------------------------------------------------------------
const ARROW_COLORS = new Set(['#f5b942', '#ff6b6b', '#46d39a', '#4cc3ff']);
const MARK_KINDS = new Set(['hint', 'good', 'bad', 'info']);

function diagramFields(P, p, s, out) {
  if (s.fen != null) { const f = fenField(P, `${p}.fen`, s.fen, { required: false }); if (f) out.fen = f; }
  if (s.orientation != null) { if (s.orientation === 'w' || s.orientation === 'b') out.orientation = s.orientation; else P.add(`${p}.orientation`, "Use 'w' or 'b'."); }
  if (s.marks != null) {
    if (!Array.isArray(s.marks) || s.marks.length > 32) P.add(`${p}.marks`, 'Must be a list of up to 32 marks.');
    else out.marks = s.marks.map((m, i) => {
      if (!m || !SQ_RE.test(m.sq) || !MARK_KINDS.has(m.kind)) P.add(`${p}.marks[${i}]`, 'A mark needs a square and a kind (hint, good, bad, info).');
      return { sq: m?.sq, kind: m?.kind };
    });
  }
  if (s.arrows != null) {
    if (!Array.isArray(s.arrows) || s.arrows.length > 16) P.add(`${p}.arrows`, 'Must be a list of up to 16 arrows.');
    else out.arrows = s.arrows.map((a, i) => {
      const ok = Array.isArray(a) && SQ_RE.test(a[0]) && SQ_RE.test(a[1]) && (a[2] == null || ARROW_COLORS.has(a[2]));
      if (!ok) P.add(`${p}.arrows[${i}]`, 'An arrow is [from, to, colour] with squares and an allowed colour.');
      return a;
    });
  }
}

function mcQuestion(P, p, s, { quiz }) {
  const out = {};
  out.q = str(P, `${p}.q`, s.q, { required: true, max: 400, html: true });
  if (!Array.isArray(s.options) || s.options.length < 2 || s.options.length > 6) { P.add(`${p}.options`, 'Provide 2–6 answer options.'); out.options = []; }
  else out.options = s.options.map((o, i) => str(P, `${p}.options[${i}]`, o, { required: true, max: 200, html: true }));
  out.answer = int(P, `${p}.answer`, s.answer, 0, Math.max(0, (out.options.length || 2) - 1));
  out.explain = str(P, `${p}.explain`, s.explain, { required: quiz, max: 1000, html: true });
  return out;
}

function validateStep(P, p, s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) { P.add(p, 'A step must be an object.'); return null; }
  if (s.type === 'learn') {
    only(P, p, s, ['type', 'title', 'text', 'fen', 'orientation', 'marks', 'arrows', 'explore']);
    const out = { type: 'learn', title: str(P, `${p}.title`, s.title, { required: true, max: 120 }), text: str(P, `${p}.text`, s.text, { required: true, max: 8000, html: true }) };
    diagramFields(P, p, s, out);
    if (s.explore != null) out.explore = !!s.explore;
    return out;
  }
  if (s.type === 'quiz') {
    only(P, p, s, ['type', 'questions']);
    if (!Array.isArray(s.questions) || s.questions.length < 1 || s.questions.length > 12) { P.add(`${p}.questions`, 'A quiz needs 1–12 questions.'); return { type: 'quiz', questions: [] }; }
    return { type: 'quiz', questions: s.questions.map((qq, i) => {
      const qp = `${p}.questions[${i}]`;
      if (!qq || typeof qq !== 'object') { P.add(qp, 'Invalid question.'); return qq; }
      only(P, qp, qq, ['kind', 'q', 'options', 'answer', 'explain']);
      return { kind: 'mc', ...mcQuestion(P, qp, qq, { quiz: true }) };
    }) };
  }
  if (s.type !== 'task') { P.add(`${p}.type`, "Step type must be 'learn', 'task' or 'quiz'."); return null; }
  const base = ['type', 'kind', 'instruction', 'hint', 'explain'];
  const out = { type: 'task', kind: s.kind, instruction: str(P, `${p}.instruction`, s.instruction, { required: true, max: 600, html: true }) };
  const hintExplain = () => {
    const h = str(P, `${p}.hint`, s.hint, { max: 400, html: true }); if (h) out.hint = h;
    const e = str(P, `${p}.explain`, s.explain, { max: 1000, html: true }); if (e) out.explain = e;
  };
  switch (s.kind) {
    case 'move': {
      only(P, p, s, [...base, 'fen', 'accept', 'wrong', 'verify', 'orientation']);
      out.fen = fenField(P, `${p}.fen`, s.fen);
      const g = chessOf(out.fen);
      out.accept = uciList(P, `${p}.accept`, g, s.accept, { min: 1, max: 8 });
      if (s.wrong != null) {
        if (typeof s.wrong !== 'object' || Array.isArray(s.wrong)) P.add(`${p}.wrong`, 'Must map a move to a message.');
        else {
          out.wrong = {};
          const legal = g ? legalList(g) : [];
          for (const [u, msg] of Object.entries(s.wrong)) {
            if (!UCI_RE.test(u) || (g && !legal.includes(u))) P.add(`${p}.wrong.${u}`, 'Not a legal move in this position.');
            out.wrong[u] = str(P, `${p}.wrong.${u}`, msg, { max: 300, html: true });
          }
        }
      }
      if (s.verify != null) { if (['best', 'parry', 'mate'].includes(s.verify)) out.verify = s.verify; else P.add(`${p}.verify`, 'Unknown verification mode.'); }
      if (s.orientation != null) { if (s.orientation === 'w' || s.orientation === 'b') out.orientation = s.orientation; else P.add(`${p}.orientation`, "Use 'w' or 'b'."); }
      hintExplain(); return out;
    }
    case 'line': {
      only(P, p, s, [...base, 'fen', 'steps', 'verify', 'plain']);
      out.fen = fenField(P, `${p}.fen`, s.fen);
      const g = chessOf(out.fen);
      if (!Array.isArray(s.steps) || s.steps.length < 1 || s.steps.length > 30) { P.add(`${p}.steps`, 'Provide 1–30 steps.'); out.steps = []; }
      else {
        out.steps = [];
        // Alternative first moves may lead to different positions, so later steps are checked against every branch.
        let branches = g ? [g] : [];
        const play = (pos, u) => { const h = new Chess(pos.fen()); return h.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) ? h : null; };
        s.steps.forEach((st, i) => {
          const sp = `${p}.steps[${i}]`;
          if (!st || typeof st !== 'object') { P.add(sp, 'Invalid step.'); return; }
          only(P, sp, st, ['accept', 'reply']);
          const step = { accept: [] };
          if (!Array.isArray(st.accept) || st.accept.length < 1 || st.accept.length > 8) P.add(`${sp}.accept`, 'Provide 1–8 accepted moves.');
          else st.accept.forEach((u, j) => {
            if (typeof u !== 'string' || !UCI_RE.test(u)) { P.add(`${sp}.accept[${j}]`, 'Use coordinate notation such as e2e4.'); return; }
            if (branches.length && !branches.some((b) => legalList(b).includes(u))) P.add(`${sp}.accept[${j}]`, `${u} is not a legal move in this position.`);
            step.accept.push(u);
          });
          let next = branches.flatMap((b) => step.accept.map((u) => play(b, u)).filter(Boolean));
          if (st.reply != null) {
            if (typeof st.reply !== 'string' || !UCI_RE.test(st.reply)) P.add(`${sp}.reply`, 'Use coordinate notation such as e7e5.');
            else {
              step.reply = st.reply;
              const after = next.map((b) => play(b, st.reply)).filter(Boolean);
              if (next.length && !after.length) P.add(`${sp}.reply`, `${st.reply} is not a legal reply after the accepted move.`);
              next = after.length ? after : next;
            }
          }
          branches = next;
          out.steps.push(step);
        });
      }
      if (s.verify != null) { if (s.verify === 'mate2') out.verify = 'mate2'; else P.add(`${p}.verify`, 'Unknown verification mode.'); }
      if (s.plain != null) out.plain = !!s.plain;
      hintExplain(); return out;
    }
    case 'squares': {
      only(P, p, s, [...base, 'fen', 'target']);
      out.fen = fenField(P, `${p}.fen`, s.fen);
      out.target = sqList(P, `${p}.target`, s.target);
      if (!out.target.length) P.add(`${p}.target`, 'Select at least one target square.');
      hintExplain(); return out;
    }
    case 'coords': {
      only(P, p, s, ['type', 'kind', 'instruction', 'rounds', 'pass']);
      out.rounds = int(P, `${p}.rounds`, s.rounds ?? 8, 2, 30);
      out.pass = int(P, `${p}.pass`, s.pass ?? 6, 1, out.rounds);
      return out;
    }
    case 'mc': {
      only(P, p, s, [...base, 'q', 'options', 'answer', 'fen', 'orientation', 'threat']);
      Object.assign(out, mcQuestion(P, p, s, { quiz: false }));
      if (s.fen != null && s.fen !== '') out.fen = fenField(P, `${p}.fen`, s.fen, { required: false });
      if (s.orientation != null) { if (s.orientation === 'w' || s.orientation === 'b') out.orientation = s.orientation; else P.add(`${p}.orientation`, "Use 'w' or 'b'."); }
      if (s.threat != null) out.threat = s.threat === true || s.threat === false ? s.threat : str(P, `${p}.threat`, s.threat, { max: 200 });
      return out;
    }
    default: P.add(`${p}.kind`, "Task kind must be 'move', 'line', 'squares', 'coords' or 'mc'."); return null;
  }
}

export function validateLesson(input, { creating = false } = {}) {
  const P = new Problems();
  if (!input || typeof input !== 'object' || Array.isArray(input)) { P.add('', 'Lesson must be an object.'); return { P }; }
  only(P, '', input, ['id', 'level', 'skill', 'title', 'summary', 'description', 'objectives', 'difficulty', 'minutes', 'steps', 'status', 'position', 'source']);
  const v = {};
  if (!isId(input.id)) P.add('id', 'Use 2–41 lower-case letters, digits or hyphens (for example "b-castling").'); else v.id = input.id;
  if (!LEARN_LEVEL_IDS.includes(input.level)) P.add('level', 'Choose Beginner, Elementary, Intermediate, Advanced or Expert.'); else v.level = input.level;
  if (!Object.hasOwn(LESSON_SKILLS, input.skill)) P.add('skill', 'Choose a skill from the list.'); else v.skill = input.skill;
  v.title = str(P, 'title', input.title, { required: true, min: 3, max: 120 });
  v.summary = str(P, 'summary', input.summary, { max: 240 });
  v.description = str(P, 'description', input.description, { max: 2000, html: true });
  v.objectives = [];
  if (input.objectives != null) {
    if (!Array.isArray(input.objectives) || input.objectives.length > 8) P.add('objectives', 'Provide up to 8 learning objectives.');
    else v.objectives = input.objectives.map((o, i) => str(P, `objectives[${i}]`, o, { required: true, max: 160 }));
  }
  v.difficulty = int(P, 'difficulty', input.difficulty ?? 1, 1, 5);
  v.minutes = int(P, 'minutes', input.minutes ?? 6, 1, 90);
  v.status = input.status === 'published' ? 'published' : 'draft';
  if (input.status != null && !['draft', 'published'].includes(input.status)) P.add('status', "Status must be 'draft' or 'published'.");
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 60) { P.add('steps', 'A lesson needs 1–60 steps.'); v.steps = []; }
  else v.steps = input.steps.map((s, i) => validateStep(P, `steps[${i}]`, s)).filter(Boolean);
  // A published lesson must be complete enough to teach and check understanding.
  if (v.status === 'published' && P.ok) {
    if (!v.steps.some((s) => s.type === 'quiz')) P.add('steps', 'Published lessons need a quiz step so progress can be checked.');
    if (!v.steps.some((s) => s.type === 'task')) P.add('steps', 'Published lessons need at least one interactive exercise.');
  }
  return { P, value: v };
}

// ---- puzzles ------------------------------------------------------------------------------------
export function solutionText(fen, moves) {
  const g = new Chess(fen);
  let num = parseInt(fen.split(' ')[5] || '1', 10) || 1;
  const parts = [];
  for (const u of moves) {
    const white = g.turn() === 'w';
    const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!m) break;
    if (white) parts.push(`${num}.${m.san}`);
    else { parts.push(parts.length === 0 ? `${num}...${m.san}` : m.san); num++; }
  }
  return parts.join(' ');
}

export function validatePuzzle(input, categoryIds) {
  const P = new Problems();
  if (!input || typeof input !== 'object' || Array.isArray(input)) { P.add('', 'Puzzle must be an object.'); return { P }; }
  only(P, '', input, ['id', 'fen', 'moves', 'theme', 'themes', 'level', 'hint', 'explain', 'solution', 'solverMoves', 'status', 'source']);
  const v = {};
  if (!isId(input.id)) P.add('id', 'Use 2–41 lower-case letters, digits or hyphens.'); else v.id = input.id;
  v.fen = fenField(P, 'fen', input.fen);
  const g = chessOf(v.fen);
  if (g) {
    if (g.isGameOver()) P.add('fen', 'The position is already finished (checkmate or draw) — there is nothing to solve.');
    // The side to move is the solver.
  }
  v.moves = uciList(P, 'moves', g, [], { min: 0, max: 0 }); // placeholder to keep types
  const rawMoves = input.moves;
  if (!Array.isArray(rawMoves) || rawMoves.length < 1 || rawMoves.length > 11) P.add('moves', 'Provide 1–11 moves (solver, reply, solver, …).');
  else {
    if (rawMoves.length % 2 === 0) P.add('moves', 'The solution must end with a solver move (an odd number of moves).');
    v.moves = [];
    const h = g ? new Chess(g.fen()) : null;
    rawMoves.forEach((u, i) => {
      if (typeof u !== 'string' || !UCI_RE.test(u)) { P.add(`moves[${i}]`, 'Use coordinate notation such as e2e4 (promotion: e7e8q).'); return; }
      v.moves.push(u);
      if (!h) return;
      const legal = legalList(h);
      if (!legal.includes(u)) { P.add(`moves[${i}]`, `${u} is not a legal move here${i === 0 ? '' : ' after the previous moves'}.`); return; }
      h.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    });
    if (h && P.ok) {
      if (input.theme === 'mate1' && !(rawMoves.length === 1 && h.isCheckmate())) P.add('moves', "A 'Mate in 1' puzzle must be a single move that checkmates.");
      if (input.theme === 'mate2' && !(rawMoves.length === 3 && h.isCheckmate())) P.add('moves', "A 'Mate in 2' puzzle must have three moves ending in checkmate.");
    }
  }
  if (!categoryIds.includes(input.theme)) P.add('theme', 'Choose a tactical category from the list.'); else v.theme = input.theme;
  v.themes = [];
  if (input.themes != null) {
    if (!Array.isArray(input.themes) || input.themes.length > 6) P.add('themes', 'Provide up to 6 motif tags.');
    else v.themes = input.themes.map((t, i) => { if (typeof t !== 'string' || !/^[A-Za-z0-9]{2,24}$/.test(t)) P.add(`themes[${i}]`, 'Tags use letters and digits only.'); return t; });
  }
  v.level = int(P, 'level', input.level ?? 1, 1, 5);
  v.hint = str(P, 'hint', input.hint, { max: 300 });
  v.explain = str(P, 'explain', input.explain, { max: 800 });
  v.status = input.status === 'published' ? 'published' : 'draft';
  if (input.status != null && !['draft', 'published'].includes(input.status)) P.add('status', "Status must be 'draft' or 'published'.");
  if (P.ok) {
    v.solverMoves = Math.ceil(v.moves.length / 2);
    v.solution = solutionText(v.fen, v.moves);
    if (v.status === 'published' && !v.hint) P.add('hint', 'Add a hint before publishing.');
    if (v.status === 'published' && !v.explain) P.add('explain', 'Add an explanation before publishing.');
  }
  return { P, value: v };
}

// ---- themes -------------------------------------------------------------------------------------
export function validateBoardTheme(input) {
  const P = new Problems(); const v = {};
  if (!input || typeof input !== 'object') { P.add('', 'Theme must be an object.'); return { P }; }
  only(P, '', input, ['id', 'name', 'light', 'dark', 'enabled']);
  if (!isId(input.id)) P.add('id', 'Use 2–41 lower-case letters, digits or hyphens.'); else v.id = input.id;
  v.name = str(P, 'name', input.name, { required: true, min: 2, max: 32 });
  if (!isHex(input.light)) P.add('light', 'Use a hex colour such as #e6e2cf.'); else v.light = input.light.toLowerCase();
  if (!isHex(input.dark)) P.add('dark', 'Use a hex colour such as #5a8f6b.'); else v.dark = input.dark.toLowerCase();
  if (v.light && v.dark && v.light === v.dark) P.add('dark', 'Light and dark squares need different colours.');
  v.enabled = input.enabled === undefined ? true : !!input.enabled;
  return { P, value: v };
}

const COLOR_KEYS = ['p1', 'p2', 'p3', 'pe', 'pd', 'pg'];
export function validatePieceSet(input) {
  const P = new Problems(); const v = {};
  if (!input || typeof input !== 'object') { P.add('', 'Piece set must be an object.'); return { P }; }
  only(P, '', input, ['id', 'name', 'kind', 'colors', 'enabled']);
  if (!isId(input.id)) P.add('id', 'Use 2–41 lower-case letters, digits or hyphens.'); else v.id = input.id;
  v.name = str(P, 'name', input.name, { required: true, min: 2, max: 32 });
  if (!['css', 'assets'].includes(input.kind)) P.add('kind', "Kind must be 'css' (recoloured built-in pieces) or 'assets' (uploaded images).");
  else v.kind = input.kind;
  v.colors = {};
  if (input.kind === 'css') {
    for (const side of ['w', 'b']) {
      const c = input.colors?.[side];
      v.colors[side] = {};
      for (const k of COLOR_KEYS) {
        if (!isHex(c?.[k])) P.add(`colors.${side}.${k}`, 'Use a hex colour such as #ffffff.');
        else v.colors[side][k] = c[k].toLowerCase();
      }
    }
  }
  v.enabled = input.enabled === undefined ? true : !!input.enabled;
  return { P, value: v };
}

// ---- settings -----------------------------------------------------------------------------------
export function validateSettings(input, { boardThemeIds, pieceSetIds, categoryUsage = {} }) {
  const P = new Problems();
  const d = DEFAULT_SETTINGS;
  const v = {};
  only(P, '', input, Object.keys(d));
  const pick = (k) => (input[k] !== undefined ? input[k] : d[k]);

  v.defaultBoardTheme = boardThemeIds.includes(pick('defaultBoardTheme')) ? pick('defaultBoardTheme') : (P.add('defaultBoardTheme', 'Choose an enabled board theme.'), d.defaultBoardTheme);
  v.defaultPieceSet = pieceSetIds.includes(pick('defaultPieceSet')) ? pick('defaultPieceSet') : (P.add('defaultPieceSet', 'Choose an enabled piece set.'), d.defaultPieceSet);

  // computer levels: fixed ids 1..N, only name / blurb / enabled can change
  const cl = pick('computerLevels');
  if (!Array.isArray(cl) || cl.length !== d.computerLevels.length) { P.add('computerLevels', 'Provide every computer level.'); v.computerLevels = d.computerLevels; }
  else {
    v.computerLevels = d.computerLevels.map((base, i) => {
      const it = cl[i] || {};
      if (it.id !== base.id) P.add(`computerLevels[${i}].id`, 'Level ids are fixed.');
      only(P, `computerLevels[${i}]`, it, ['id', 'name', 'blurb', 'enabled']);
      return { id: base.id, name: str(P, `computerLevels[${i}].name`, it.name, { required: true, min: 2, max: 24 }), blurb: str(P, `computerLevels[${i}].blurb`, it.blurb, { max: 160 }), enabled: it.enabled !== false };
    });
    if (!v.computerLevels.some((l) => l.enabled)) P.add('computerLevels', 'At least one computer level must stay enabled.');
  }

  const tc = pick('timeControls');
  if (!Array.isArray(tc) || tc.length < 1 || tc.length > 12) { P.add('timeControls', 'Provide 1–12 time controls.'); v.timeControls = d.timeControls; }
  else {
    const seen = new Set();
    v.timeControls = tc.map((t, i) => {
      const p = `timeControls[${i}]`;
      only(P, p, t || {}, ['id', 'label', 'base', 'inc', 'enabled']);
      const base = int(P, `${p}.base`, t?.base, 0, 10800), inc = int(P, `${p}.inc`, t?.inc, 0, 60);
      const id = base === 0 ? 'none' : `${base / 60 === Math.floor(base / 60) ? base / 60 : base + 's'}+${inc}`;
      if (t?.id !== id) P.add(`${p}.id`, `The id must be "${id}" for this time and increment.`);
      if (seen.has(id)) P.add(`${p}.id`, 'Duplicate time control.'); seen.add(id);
      return { id, label: str(P, `${p}.label`, t?.label, { required: true, max: 16 }), base, inc, enabled: t?.enabled !== false };
    });
    if (!seen.has('none')) P.add('timeControls', 'Keep the "Untimed" option.');
    else if (v.timeControls.find((t) => t.id === 'none')?.enabled === false) P.add('timeControls', 'The "Untimed" option cannot be disabled.');
  }

  const pc = pick('puzzleCategories');
  if (!Array.isArray(pc) || pc.length < 1 || pc.length > 30) { P.add('puzzleCategories', 'Provide 1–30 puzzle categories.'); v.puzzleCategories = d.puzzleCategories; }
  else {
    const seen = new Set();
    v.puzzleCategories = pc.map((c, i) => {
      const p = `puzzleCategories[${i}]`;
      only(P, p, c || {}, ['id', 'name', 'desc', 'skill', 'enabled']);
      if (!/^[a-z0-9]{2,20}$/.test(c?.id || '')) P.add(`${p}.id`, 'Use 2–20 lower-case letters or digits.');
      if (seen.has(c?.id)) P.add(`${p}.id`, 'Duplicate category id.'); seen.add(c?.id);
      if (!Object.hasOwn(SKILLS, c?.skill)) P.add(`${p}.skill`, 'Choose a skill.');
      return { id: c?.id, name: str(P, `${p}.name`, c?.name, { required: true, min: 2, max: 40 }), desc: str(P, `${p}.desc`, c?.desc, { max: 120 }), skill: c?.skill, enabled: c?.enabled !== false };
    });
    for (const [cat, n] of Object.entries(categoryUsage)) if (n > 0 && !seen.has(cat)) P.add('puzzleCategories', `Category "${cat}" is still used by ${n} puzzle(s); move or delete them first.`);
  }

  const a = pick('assessment') || {};
  only(P, 'assessment', a, ['master', 'bridgeLo', 'bridgeNext']);
  v.assessment = { master: num(P, 'assessment.master', a.master, 0.5, 0.9), bridgeLo: num(P, 'assessment.bridgeLo', a.bridgeLo, 0.2, 0.6), bridgeNext: num(P, 'assessment.bridgeNext', a.bridgeNext, 0.6, 0.95) };
  if (P.ok && !(v.assessment.bridgeLo < v.assessment.master && v.assessment.master < v.assessment.bridgeNext)) P.add('assessment', 'Thresholds must satisfy: bridge minimum < mastery < bridge next-tier.');

  const l = pick('lessons') || {};
  only(P, 'lessons', l, ['quizPassRatio', 'levelEngine']);
  v.lessons = { quizPassRatio: num(P, 'lessons.quizPassRatio', l.quizPassRatio, 0.4, 1), levelEngine: {} };
  for (const id of LEARN_LEVEL_IDS) v.lessons.levelEngine[id] = int(P, `lessons.levelEngine.${id}`, l.levelEngine?.[id], 1, d.computerLevels.length);

  const ap = pick('appearance') || {};
  only(P, 'appearance', ap, ['defaultTheme', 'coords', 'animations', 'highlightMoves']);
  if (!['dark', 'light'].includes(ap.defaultTheme)) P.add('appearance.defaultTheme', "Use 'dark' or 'light'.");
  v.appearance = { defaultTheme: ap.defaultTheme === 'light' ? 'light' : 'dark', coords: ap.coords !== false, animations: ap.animations !== false, highlightMoves: ap.highlightMoves !== false };
  return { P, value: v };
}

// ---- uploads ------------------------------------------------------------------------------------
export const PIECE_CODES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

// Detects the real type from the bytes (never from the filename or Content-Type) and rejects everything else.
export function checkImageUpload(buf) {
  if (!buf || !buf.length) return { error: 'The file is empty.' };
  if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (w < 16 || h < 16 || w > 1024 || h > 1024) return { error: 'PNG size must be between 16 and 1024 pixels.' };
    return { ext: 'png', type: 'image/png' };
  }
  if (buf.length >= 16 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  const head = buf.subarray(0, 512).toString('utf8').replace(/^﻿/, '');
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) {
    const text = buf.toString('utf8');
    const banned = [
      [/<\s*script/i, 'scripts'], [/<\s*foreignObject/i, 'foreignObject'], [/<\s*(iframe|object|embed|audio|video|canvas|animate|set)\b/i, 'embedded or animated content'],
      [/<!DOCTYPE|<!ENTITY/i, 'DOCTYPE/ENTITY declarations'], [/\son[a-z]+\s*=/i, 'event handler attributes'], [/javascript:|data:text\/html|vbscript:/i, 'script URLs'],
      [/@import/i, '@import'], [/(?:xlink:)?href\s*=\s*["'](?!#)/i, 'external links (only #fragment references are allowed)'],
      [/url\(\s*["']?(?!#)/i, 'external url() references'], [/<\s*image\b/i, 'embedded <image> elements'],
    ];
    for (const [re, label] of banned) if (re.test(text)) return { error: `SVG contains ${label}, which is not allowed.` };
    if (!/<\/svg\s*>\s*$/i.test(text.trim())) return { error: 'SVG is not well-formed (missing </svg>).' };
    if (!/viewBox\s*=/.test(text)) return { error: 'SVG needs a viewBox attribute so it scales to the square.' };
    return { ext: 'svg', type: 'image/svg+xml' };
  }
  return { error: 'Only SVG, PNG and WebP images are accepted.' };
}
