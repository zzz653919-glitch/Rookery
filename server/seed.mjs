// First-run seeding: imports the bundled curriculum, puzzles, themes and default settings into the database so
// administrators can edit them. Runs once (guarded by the 'seeded' setting); later edits are never overwritten.
import { LESSONS } from '../js/data/lessons.js';
import { PUZZLES } from '../js/data/puzzles.js';
import { LEVELS } from '../js/data/levels.js';
import { getDb, getSetting, setSetting, tx, now, bumpContentVersion } from './db.mjs';
import { BUILTIN_BOARD_THEMES, BUILTIN_PIECE_SETS, DEFAULT_SETTINGS } from './defaults.mjs';

export function seedIfNeeded() {
  if (getSetting('seeded')) return false;
  tx((d) => {
    const t = now();
    const insLesson = d.prepare('INSERT INTO lessons(id, level, skill, title, summary, description, objectives, difficulty, minutes, steps, position, status, source, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    LESSONS.forEach((l, i) => {
      const lvl = LEVELS.findIndex((x) => x.id === l.level) + 1;
      insLesson.run(l.id, l.level, l.skill, l.title, l.summary || '', '', '[]', lvl || 1, l.minutes || 6, JSON.stringify(l.steps), i, 'published', 'builtin', t, t, 'seed');
    });
    const insPuzzle = d.prepare('INSERT INTO puzzles(id, fen, moves, theme, themes, level, solver_moves, solution, hint, explanation, status, source, validated_at, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const p of PUZZLES) insPuzzle.run(p.id, p.fen, JSON.stringify(p.moves), p.theme, JSON.stringify(p.themes || []), p.level, p.solverMoves, p.solution || '', p.hint || '', p.explain || '', 'published', 'builtin', t, t, t, 'seed');
    const insSet = d.prepare('INSERT INTO piece_sets(id, name, kind, colors, assets, builtin, enabled, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const s of BUILTIN_PIECE_SETS) insSet.run(s.id, s.name, 'css', JSON.stringify({ w: s.w, b: s.b }), '{}', 1, 1, 1, t, t);
    const insBoard = d.prepare('INSERT INTO board_themes(id, name, light, dark, builtin, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)');
    for (const b of BUILTIN_BOARD_THEMES) insBoard.run(b.id, b.name, b.light, b.dark, 1, 1, t, t);
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setSetting(k, v, 'seed');
    setSetting('seeded', true, 'seed');
  });
  bumpContentVersion();
  return true;
}

export const counts = () => {
  const d = getDb();
  return { lessons: d.prepare('SELECT count(*) n FROM lessons').get().n, puzzles: d.prepare('SELECT count(*) n FROM puzzles').get().n };
};
