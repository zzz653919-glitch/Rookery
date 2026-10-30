// Builds the public content bundle (published lessons/puzzles, enabled themes, settings) that the player site loads.
// The bundle is cached per content version and served with an ETag + gzip.
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { getDb, getSetting } from './db.mjs';
import { DEFAULT_SETTINGS } from './defaults.mjs';

let cache = null;

export const settingsNow = () => {
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = getSetting(k, DEFAULT_SETTINGS[k]);
  return out;
};

export function pieceSetPublic(r) {
  const base = { id: r.id, name: r.name, kind: r.kind, builtin: !!r.builtin, version: r.version };
  if (r.kind === 'css') return { ...base, colors: JSON.parse(r.colors) };
  const a = JSON.parse(r.assets);
  return { ...base, assets: Object.fromEntries(Object.entries(a).map(([code, file]) => [code, `/uploads/piece-sets/${r.id}/${file}?v=${r.version}`])) };
}

export function buildContent() {
  const version = getSetting('contentVersion', 0);
  if (cache && cache.version === version) return cache;
  const d = getDb();
  const settings = settingsNow();
  const enabledCats = new Set(settings.puzzleCategories.filter((c) => c.enabled).map((c) => c.id));
  const lessons = d.prepare("SELECT * FROM lessons WHERE status = 'published' ORDER BY position, rowid").all().map((r) => {
    const out = { id: r.id, level: r.level, skill: r.skill, title: r.title, summary: r.summary, minutes: r.minutes, difficulty: r.difficulty, steps: JSON.parse(r.steps) };
    const objectives = JSON.parse(r.objectives);
    if (r.description) out.description = r.description;
    if (objectives.length) out.objectives = objectives;
    return out;
  });
  const puzzles = d.prepare("SELECT * FROM puzzles WHERE status = 'published' ORDER BY rowid").all()
    .filter((r) => enabledCats.has(r.theme))
    .map((r) => ({ id: r.id, fen: r.fen, moves: JSON.parse(r.moves), theme: r.theme, themes: JSON.parse(r.themes), level: r.level, solverMoves: r.solver_moves, solution: r.solution, hint: r.hint, explain: r.explanation }));
  const boardThemes = d.prepare('SELECT id, name, light, dark FROM board_themes WHERE enabled = 1 ORDER BY builtin DESC, rowid').all();
  const pieceSets = d.prepare('SELECT * FROM piece_sets WHERE enabled = 1 ORDER BY builtin DESC, rowid').all().map(pieceSetPublic);
  const body = JSON.stringify({ version, lessons, puzzles, boardThemes, pieceSets, settings });
  const etag = '"' + createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
  cache = { version, body, gz: gzipSync(body), etag };
  return cache;
}
