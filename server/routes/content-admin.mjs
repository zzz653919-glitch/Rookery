// Lesson and puzzle management.
import { getDb, tx, now, bumpContentVersion, getSetting } from '../db.mjs';
import { HttpError, bad } from '../http.mjs';
import { audit } from '../security.mjs';
import { validateLesson, validatePuzzle, chessOf, uciOf, Problems } from '../validate.mjs';
import { DEFAULT_SETTINGS, LEARN_LEVEL_IDS } from '../defaults.mjs';
import { paging, like, mustConfirm, problemsError } from './util.mjs';
import { Engine } from '../../js/chess/engine.js';

const lessonRow = (r, full = false) => ({
  id: r.id, level: r.level, skill: r.skill, title: r.title, summary: r.summary, description: r.description,
  objectives: JSON.parse(r.objectives), difficulty: r.difficulty, minutes: r.minutes, position: r.position,
  status: r.status, source: r.source, updatedAt: r.updated_at, updatedBy: r.updated_by,
  ...(full ? { steps: JSON.parse(r.steps) } : { stepCount: JSON.parse(r.steps).length }),
});
const puzzleRow = (r) => ({
  id: r.id, fen: r.fen, moves: JSON.parse(r.moves), theme: r.theme, themes: JSON.parse(r.themes), level: r.level, solverMoves: r.solver_moves,
  solution: r.solution, hint: r.hint, explain: r.explanation, status: r.status, source: r.source, validatedAt: r.validated_at, updatedAt: r.updated_at, updatedBy: r.updated_by,
});
// Only the editable fields are re-validated when publishing; server-managed columns (timestamps, authorship) are not input.
const editableLesson = (r) => { const l = lessonRow(r, true); return { id: l.id, level: l.level, skill: l.skill, title: l.title, summary: l.summary, description: l.description, objectives: l.objectives, difficulty: l.difficulty, minutes: l.minutes, status: l.status, steps: l.steps }; };
const editablePuzzle = (r) => { const p = puzzleRow(r); return { id: p.id, fen: p.fen, moves: p.moves, theme: p.theme, themes: p.themes, level: p.level, hint: p.hint, explain: p.explain, status: p.status }; };
const categoryIds = () => (getSetting('puzzleCategories', DEFAULT_SETTINGS.puzzleCategories)).map((c) => c.id);

function engineCheck(fen, firstMove) {
  try {
    const eng = new Engine(16);
    const r = eng.search(fen, null, { depth: 5, timeMs: 2000 });
    if (!r.move) return { checked: true, best: null, agrees: false };
    const best = uciOf(r.move);
    return { checked: true, best, agrees: best === firstMove };
  } catch { return { checked: false }; }
}

export function register(router) {
  // ------------------------------------------------------------------ lessons
  router.add('GET', '/api/admin/lessons', (ctx) => {
    const { page, pageSize, offset } = paging(ctx.query);
    const where = [], args = [];
    if (ctx.query.level) { where.push('level = ?'); args.push(ctx.query.level); }
    if (ctx.query.status) { where.push('status = ?'); args.push(ctx.query.status); }
    if (ctx.query.q) { where.push("(title LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')"); args.push(like(ctx.query.q), like(ctx.query.q)); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const d = getDb();
    const total = d.prepare(`SELECT count(*) n FROM lessons ${w}`).get(...args).n;
    const items = d.prepare(`SELECT * FROM lessons ${w} ORDER BY position, rowid LIMIT ? OFFSET ?`).all(...args, pageSize, offset).map((r) => lessonRow(r));
    const byLevel = Object.fromEntries(LEARN_LEVEL_IDS.map((l) => [l, d.prepare("SELECT count(*) n FROM lessons WHERE level = ? AND status = 'published'").get(l).n]));
    return { items, total, page, pageSize, publishedByLevel: byLevel };
  }, { auth: true, perm: 'content:read' });

  router.add('GET', '/api/admin/lessons/:id', (ctx) => {
    const r = getDb().prepare('SELECT * FROM lessons WHERE id = ?').get(ctx.params.id);
    if (!r) throw new HttpError(404, 'Lesson not found.');
    return lessonRow(r, true);
  }, { auth: true, perm: 'content:read' });

  // dry-run: validate without saving (used by the editor and preview)
  router.add('POST', '/api/admin/lessons/validate', async (ctx) => {
    const { P, value } = validateLesson(await ctx.json());
    return { ok: P.ok, problems: P.list, lesson: P.ok ? value : null };
  }, { auth: true, perm: 'content:read' });

  router.add('POST', '/api/admin/lessons', async (ctx) => {
    const { P, value: v } = validateLesson(await ctx.json(), { creating: true });
    if (!P.ok) throw problemsError(P);
    const d = getDb();
    if (d.prepare('SELECT 1 FROM lessons WHERE id = ?').get(v.id)) throw new HttpError(409, 'A lesson with this id already exists.', [{ path: 'id', message: 'This id is already taken.' }]);
    const pos = (d.prepare('SELECT coalesce(max(position), -1) + 1 AS p FROM lessons').get().p);
    const t = now();
    d.prepare('INSERT INTO lessons(id, level, skill, title, summary, description, objectives, difficulty, minutes, steps, position, status, source, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(v.id, v.level, v.skill, v.title, v.summary, v.description, JSON.stringify(v.objectives), v.difficulty, v.minutes, JSON.stringify(v.steps), pos, v.status, 'custom', t, t, ctx.admin.username);
    bumpContentVersion();
    audit(ctx, 'lesson.create', 'lesson', v.id, { title: v.title, level: v.level, status: v.status });
    return { status: 201, body: lessonRow(d.prepare('SELECT * FROM lessons WHERE id = ?').get(v.id), true) };
  }, { auth: true, perm: 'content:write' });

  router.add('PUT', '/api/admin/lessons/:id', async (ctx) => {
    const d = getDb();
    const cur = d.prepare('SELECT * FROM lessons WHERE id = ?').get(ctx.params.id);
    if (!cur) throw new HttpError(404, 'Lesson not found.');
    const input = await ctx.json();
    if (input.id !== undefined && input.id !== cur.id) throw bad('A lesson id cannot be changed.', [{ path: 'id', message: 'The id is fixed once created.' }]);
    const { P, value: v } = validateLesson({ ...input, id: cur.id });
    if (!P.ok) throw problemsError(P);
    const pos = v.level === cur.level ? cur.position : d.prepare('SELECT coalesce(max(position), -1) + 1 AS p FROM lessons').get().p;
    d.prepare('UPDATE lessons SET level=?, skill=?, title=?, summary=?, description=?, objectives=?, difficulty=?, minutes=?, steps=?, position=?, status=?, updated_at=?, updated_by=? WHERE id=?')
      .run(v.level, v.skill, v.title, v.summary, v.description, JSON.stringify(v.objectives), v.difficulty, v.minutes, JSON.stringify(v.steps), pos, v.status, now(), ctx.admin.username, cur.id);
    bumpContentVersion();
    audit(ctx, 'lesson.update', 'lesson', cur.id, { title: v.title, level: v.level, status: v.status });
    return lessonRow(d.prepare('SELECT * FROM lessons WHERE id = ?').get(cur.id), true);
  }, { auth: true, perm: 'content:write' });

  router.add('POST', '/api/admin/lessons/:id/publish', async (ctx) => {
    const d = getDb();
    const cur = d.prepare('SELECT * FROM lessons WHERE id = ?').get(ctx.params.id);
    if (!cur) throw new HttpError(404, 'Lesson not found.');
    const { published } = await ctx.json();
    const lesson = { ...editableLesson(cur), status: published ? 'published' : 'draft' };
    const { P } = validateLesson(lesson);
    if (!P.ok) throw problemsError(P);
    d.prepare('UPDATE lessons SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(lesson.status, now(), ctx.admin.username, cur.id);
    bumpContentVersion();
    audit(ctx, published ? 'lesson.publish' : 'lesson.unpublish', 'lesson', cur.id, { title: cur.title });
    return { ok: true, status: lesson.status };
  }, { auth: true, perm: 'content:write' });

  router.add('POST', '/api/admin/lessons/reorder', async (ctx) => {
    const { level, ids } = await ctx.json();
    if (!LEARN_LEVEL_IDS.includes(level) || !Array.isArray(ids)) throw bad('Provide a level and the lesson ids in the new order.');
    const d = getDb();
    const rows = d.prepare('SELECT id, position FROM lessons WHERE level = ? ORDER BY position, rowid').all(level);
    const have = new Set(rows.map((r) => r.id));
    if (ids.length !== rows.length || ids.some((id) => !have.has(id)) || new Set(ids).size !== ids.length) throw bad('The ids must be exactly the lessons of that level.');
    const slots = rows.map((r) => r.position).sort((a, b) => a - b);
    tx((db) => { const up = db.prepare('UPDATE lessons SET position = ?, updated_at = ?, updated_by = ? WHERE id = ?'); ids.forEach((id, i) => up.run(slots[i], now(), ctx.admin.username, id)); });
    bumpContentVersion();
    audit(ctx, 'lesson.reorder', 'lesson', level, { ids });
    return { ok: true };
  }, { auth: true, perm: 'content:write' });

  router.add('DELETE', '/api/admin/lessons/:id', (ctx) => {
    mustConfirm(ctx.query, ctx.params.id);
    const d = getDb();
    const cur = d.prepare('SELECT title FROM lessons WHERE id = ?').get(ctx.params.id);
    if (!cur) throw new HttpError(404, 'Lesson not found.');
    d.prepare('DELETE FROM lessons WHERE id = ?').run(ctx.params.id);
    bumpContentVersion();
    audit(ctx, 'lesson.delete', 'lesson', ctx.params.id, { title: cur.title });
    return { ok: true };
  }, { auth: true, perm: 'content:write' });

  // ------------------------------------------------------------------ puzzles
  router.add('GET', '/api/admin/puzzles', (ctx) => {
    const { page, pageSize, offset } = paging(ctx.query);
    const where = [], args = [];
    for (const [k, col] of [['theme', 'theme'], ['level', 'level'], ['status', 'status']]) if (ctx.query[k]) { where.push(`${col} = ?`); args.push(ctx.query[k]); }
    if (ctx.query.q) { where.push("(id LIKE ? ESCAPE '\\' OR fen LIKE ? ESCAPE '\\' OR hint LIKE ? ESCAPE '\\')"); args.push(like(ctx.query.q), like(ctx.query.q), like(ctx.query.q)); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const d = getDb();
    const total = d.prepare(`SELECT count(*) n FROM puzzles ${w}`).get(...args).n;
    const items = d.prepare(`SELECT * FROM puzzles ${w} ORDER BY theme, level, rowid LIMIT ? OFFSET ?`).all(...args, pageSize, offset).map(puzzleRow);
    const facets = d.prepare("SELECT theme, level, count(*) AS n, sum(status = 'published') AS published FROM puzzles GROUP BY theme, level").all();
    return { items, total, page, pageSize, facets };
  }, { auth: true, perm: 'content:read' });

  router.add('GET', '/api/admin/puzzles/:id', (ctx) => {
    const r = getDb().prepare('SELECT * FROM puzzles WHERE id = ?').get(ctx.params.id);
    if (!r) throw new HttpError(404, 'Puzzle not found.');
    return puzzleRow(r);
  }, { auth: true, perm: 'content:read' });

  router.add('POST', '/api/admin/puzzles/validate', async (ctx) => {
    const body = await ctx.json();
    const { P, value } = validatePuzzle(body.puzzle || {}, categoryIds());
    const out = { ok: P.ok, problems: P.list, puzzle: P.ok ? value : null };
    if (P.ok && body.engine) out.engine = engineCheck(value.fen, value.moves[0]);
    return out;
  }, { auth: true, perm: 'content:read' });

  const savePuzzle = (ctx, v, creating) => {
    const d = getDb();
    const t = now();
    if (creating) {
      d.prepare('INSERT INTO puzzles(id, fen, moves, theme, themes, level, solver_moves, solution, hint, explanation, status, source, validated_at, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(v.id, v.fen, JSON.stringify(v.moves), v.theme, JSON.stringify(v.themes), v.level, v.solverMoves, v.solution, v.hint, v.explain, v.status, 'custom', t, t, t, ctx.admin.username);
    } else {
      d.prepare('UPDATE puzzles SET fen=?, moves=?, theme=?, themes=?, level=?, solver_moves=?, solution=?, hint=?, explanation=?, status=?, validated_at=?, updated_at=?, updated_by=? WHERE id=?')
        .run(v.fen, JSON.stringify(v.moves), v.theme, JSON.stringify(v.themes), v.level, v.solverMoves, v.solution, v.hint, v.explain, v.status, t, t, ctx.admin.username, v.id);
    }
    bumpContentVersion();
    return puzzleRow(d.prepare('SELECT * FROM puzzles WHERE id = ?').get(v.id));
  };

  router.add('POST', '/api/admin/puzzles', async (ctx) => {
    const { P, value: v } = validatePuzzle(await ctx.json(), categoryIds());
    if (!P.ok) throw problemsError(P);
    if (getDb().prepare('SELECT 1 FROM puzzles WHERE id = ?').get(v.id)) throw new HttpError(409, 'A puzzle with this id already exists.', [{ path: 'id', message: 'This id is already taken.' }]);
    const row = savePuzzle(ctx, v, true);
    audit(ctx, 'puzzle.create', 'puzzle', v.id, { theme: v.theme, level: v.level, status: v.status });
    return { status: 201, body: row };
  }, { auth: true, perm: 'content:write' });

  router.add('PUT', '/api/admin/puzzles/:id', async (ctx) => {
    const cur = getDb().prepare('SELECT id FROM puzzles WHERE id = ?').get(ctx.params.id);
    if (!cur) throw new HttpError(404, 'Puzzle not found.');
    const input = await ctx.json();
    if (input.id !== undefined && input.id !== cur.id) throw bad('A puzzle id cannot be changed.', [{ path: 'id', message: 'The id is fixed once created.' }]);
    const { P, value: v } = validatePuzzle({ ...input, id: cur.id }, categoryIds());
    if (!P.ok) throw problemsError(P);
    const row = savePuzzle(ctx, v, false);
    audit(ctx, 'puzzle.update', 'puzzle', cur.id, { theme: v.theme, level: v.level, status: v.status });
    return row;
  }, { auth: true, perm: 'content:write' });

  router.add('POST', '/api/admin/puzzles/:id/publish', async (ctx) => {
    const d = getDb();
    const cur = d.prepare('SELECT * FROM puzzles WHERE id = ?').get(ctx.params.id);
    if (!cur) throw new HttpError(404, 'Puzzle not found.');
    const { published } = await ctx.json();
    const p = { ...editablePuzzle(cur), status: published ? 'published' : 'draft' };
    const { P } = validatePuzzle(p, categoryIds()); // re-validated on the server every time
    if (!P.ok) throw problemsError(P);
    d.prepare('UPDATE puzzles SET status = ?, validated_at = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(p.status, now(), now(), ctx.admin.username, cur.id);
    bumpContentVersion();
    audit(ctx, published ? 'puzzle.publish' : 'puzzle.unpublish', 'puzzle', cur.id);
    return { ok: true, status: p.status };
  }, { auth: true, perm: 'content:write' });

  router.add('DELETE', '/api/admin/puzzles/:id', (ctx) => {
    mustConfirm(ctx.query, ctx.params.id);
    const d = getDb();
    if (!d.prepare('SELECT 1 FROM puzzles WHERE id = ?').get(ctx.params.id)) throw new HttpError(404, 'Puzzle not found.');
    d.prepare('DELETE FROM puzzles WHERE id = ?').run(ctx.params.id);
    bumpContentVersion();
    audit(ctx, 'puzzle.delete', 'puzzle', ctx.params.id);
    return { ok: true };
  }, { auth: true, perm: 'content:write' });
}
