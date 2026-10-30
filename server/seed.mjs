// First-run seeding: imports the bundled curriculum, puzzles, themes and default settings into the database so
// administrators can edit them. Runs once (guarded by the 'seeded' setting); later edits are never overwritten.
import { LESSONS } from '../js/data/lessons.js';
import { PUZZLES } from '../js/data/puzzles.js';
import { LEVELS } from '../js/data/levels.js';
import { getDb, getSetting, setSetting, tx, now, bumpContentVersion } from './db.mjs';
import { BUILTIN_BOARD_THEMES, BUILTIN_PIECE_SETS, DEFAULT_SETTINGS } from './defaults.mjs';

export async function seedIfNeeded() {
  if (await getSetting('seeded')) return false;
  await tx(async (d) => {
    const t = now();
    const insLesson = d.prepare('INSERT INTO lessons(id, level, skill, title, summary, description, objectives, difficulty, minutes, steps, position, status, source, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const [i, l] of LESSONS.entries()) {
      const lvl = LEVELS.findIndex((x) => x.id === l.level) + 1;
      await insLesson.run(l.id, l.level, l.skill, l.title, l.summary || '', '', '[]', lvl || 1, l.minutes || 6, JSON.stringify(l.steps), i, 'published', 'builtin', t, t, 'seed');
    }
    const insPuzzle = d.prepare('INSERT INTO puzzles(id, fen, moves, theme, themes, level, solver_moves, solution, hint, explanation, status, source, validated_at, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const p of PUZZLES) await insPuzzle.run(p.id, p.fen, JSON.stringify(p.moves), p.theme, JSON.stringify(p.themes || []), p.level, p.solverMoves, p.solution || '', p.hint || '', p.explain || '', 'published', 'builtin', t, t, t, 'seed');
    const insSet = d.prepare('INSERT INTO piece_sets(id, name, kind, colors, assets, builtin, enabled, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const s of BUILTIN_PIECE_SETS) await insSet.run(s.id, s.name, 'css', JSON.stringify({ w: s.w, b: s.b }), '{}', 1, 1, 1, t, t);
    const insBoard = d.prepare('INSERT INTO board_themes(id, name, light, dark, builtin, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)');
    for (const b of BUILTIN_BOARD_THEMES) await insBoard.run(b.id, b.name, b.light, b.dark, 1, 1, t, t);
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await setSetting(k, v, 'seed');
    await setSetting('seeded', true, 'seed');
  });
  await bumpContentVersion();
  return true;
}

export const counts = async () => {
  const d = getDb();
  return { lessons: (await d.prepare('SELECT count(*) n FROM lessons').get()).n, puzzles: (await d.prepare('SELECT count(*) n FROM puzzles').get()).n };
};
