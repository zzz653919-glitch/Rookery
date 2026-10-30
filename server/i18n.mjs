// Translation memory and localized content bundles.
// Look-up order for a text: administrator edit / auto translation (DB) → bundled curriculum translation → English source.
import { getDb, now, onContentChange } from './db.mjs';
import { hashStr } from '../js/i18n/core.js';
import { mapStr, mapLessonStrings, mapPuzzleStrings, lessonStrings, puzzleStrings } from '../js/i18n/content.js';
import uzSeed from '../js/i18n/content.uz.js';
import ruSeed from '../js/i18n/content.ru.js';
import uzUi from '../js/i18n/ui.uz.js';
import ruUi from '../js/i18n/ui.ru.js';
import { translateBatch, acceptTranslation, providerName, BATCH } from './translate.mjs';

export const TARGET_LANGS = ['uz', 'ru'];
export const isTarget = (l) => TARGET_LANGS.includes(l);
const SEED = { uz: uzSeed, ru: ruSeed };
const UI = { uz: uzUi, ru: ruUi }; // interface strings (the player translates built-in names itself)

let memoryVersion = 0; // bumped whenever a stored translation changes (part of the localized-bundle cache key)
export const translationsVersion = () => memoryVersion;

export function dictionary(lang) {
  if (!isTarget(lang)) return {};
  const out = { ...SEED[lang] };
  for (const r of getDb().prepare('SELECT hash, text FROM translations WHERE lang = ?').all(lang)) out[r.hash] = r.text;
  return out;
}

// Texts that are only chess notation / numbers do not need translating.
export function needsTranslation(s) {
  if (typeof s !== 'string') return false;
  const plain = s.replace(/<[^>]*>/g, ' ').replace(/\b(?:O-O(?:-O)?|[KQRBN]?[a-h]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g, ' ');
  return /[A-Za-z]{3,}/.test(plain);
}

// Strings of the settings object that visitors see (administrator-editable names and descriptions).
const SETTING_FIELDS = [['puzzleCategories', ['name', 'desc']], ['computerLevels', ['name', 'blurb']], ['timeControls', ['label']]];
export function mapSettingsStrings(settings, fn) {
  const out = { ...settings };
  for (const [key, fields] of SETTING_FIELDS) {
    if (!Array.isArray(out[key])) continue;
    out[key] = out[key].map((item) => { const c = { ...item }; for (const f of fields) if (typeof c[f] === 'string' && c[f]) c[f] = fn(c[f]); return c; });
  }
  return out;
}
const settingsStrings = (s) => { const seen = []; mapSettingsStrings(s, (x) => { seen.push(x); return x; }); return seen; };

// Returns a copy of the content bundle (as built by buildContent) with every text translated where a translation exists.
export function localizeBundle(bundle, lang) {
  if (!isTarget(lang)) return bundle;
  const dict = dictionary(lang);
  const fn = (s) => mapStr(s, dict);
  return {
    ...bundle,
    lang,
    lessons: bundle.lessons.map((l) => mapLessonStrings(l, fn)),
    puzzles: bundle.puzzles.map((p) => mapPuzzleStrings(p, fn)),
    settings: bundle.settings ? mapSettingsStrings(bundle.settings, fn) : bundle.settings,
  };
}

// Every distinct source string of the PUBLISHED and DRAFT content that has no translation yet.
export function sourceStrings() {
  const d = getDb();
  const all = new Set();
  for (const r of d.prepare('SELECT title, summary, description, objectives, steps FROM lessons').all()) {
    for (const s of lessonStrings({ title: r.title, summary: r.summary, description: r.description, objectives: JSON.parse(r.objectives), steps: JSON.parse(r.steps) })) all.add(s);
  }
  for (const r of d.prepare('SELECT hint, explanation FROM puzzles').all()) for (const s of puzzleStrings({ hint: r.hint, explain: r.explanation })) all.add(s);
  for (const s of settingsFromDb()) all.add(s);
  return [...all].filter(needsTranslation);
}
function settingsFromDb() {
  const out = {};
  for (const r of getDb().prepare("SELECT key, value FROM settings WHERE key IN ('puzzleCategories','computerLevels','timeControls')").all()) out[r.key] = JSON.parse(r.value);
  return settingsStrings(out);
}

export function missing(lang) {
  const dict = dictionary(lang);
  return sourceStrings().filter((s) => dict[hashStr(s)] === undefined && UI[lang][s] === undefined);
}

export function stats() {
  const src = sourceStrings();
  const d = getDb();
  return TARGET_LANGS.map((lang) => {
    const dict = dictionary(lang);
    const rows = d.prepare('SELECT origin, count(*) n FROM translations WHERE lang = ? GROUP BY origin').all(lang);
    const n = (o) => rows.find((r) => r.origin === o)?.n || 0;
    return { lang, total: src.length, translated: src.filter((s) => dict[hashStr(s)] !== undefined || UI[lang][s] !== undefined).length, auto: n('auto'), manual: n('manual') };
  });
}

export function listEntries(lang, { q = '', onlyMissing = false } = {}) {
  const dict = dictionary(lang);
  const rows = new Map(getDb().prepare('SELECT hash, origin, text, updated_by, updated_at FROM translations WHERE lang = ?').all(lang).map((r) => [r.hash, r]));
  const needle = q.toLowerCase();
  return sourceStrings().map((source) => {
    const hash = hashStr(source);
    const row = rows.get(hash);
    return { hash, source, text: dict[hash] ?? '', origin: row ? row.origin : dict[hash] !== undefined ? 'bundled' : 'missing', updated_by: row?.updated_by || null, updated_at: row?.updated_at || null };
  }).filter((e) => (!onlyMissing || e.origin === 'missing') && (!needle || e.source.toLowerCase().includes(needle) || e.text.toLowerCase().includes(needle)));
}

export function saveTranslation(lang, source, text, origin, by = null) {
  const d = getDb();
  const hash = hashStr(source);
  const cur = d.prepare('SELECT origin FROM translations WHERE lang = ? AND hash = ?').get(lang, hash);
  if (cur?.origin === 'manual' && origin !== 'manual') return false; // a person's wording is never overwritten by the machine
  d.prepare('INSERT INTO translations(lang, hash, source, text, origin, updated_at, updated_by) VALUES (?,?,?,?,?,?,?) ON CONFLICT(lang, hash) DO UPDATE SET text = excluded.text, origin = excluded.origin, updated_at = excluded.updated_at, updated_by = excluded.updated_by')
    .run(lang, hash, source, text, origin, now(), by);
  memoryVersion++;
  return true;
}
export function deleteTranslation(lang, hash) {
  const r = getDb().prepare('DELETE FROM translations WHERE lang = ? AND hash = ?').run(lang, hash);
  if (r.changes) memoryVersion++;
  return r.changes > 0;
}

// Translates everything that is missing. Safe to call repeatedly; runs one job at a time.
let running = null;
export const lastRun = { at: null, lang: null, translated: 0, rejected: 0, error: null };
export function translateMissing(langs = TARGET_LANGS) {
  if (running) return running;
  running = (async () => {
    lastRun.at = now(); lastRun.translated = 0; lastRun.rejected = 0; lastRun.error = null;
    try {
      if (!providerName()) throw new Error('No translation provider is configured.');
      for (const lang of langs.filter(isTarget)) {
        lastRun.lang = lang;
        const todo = missing(lang);
        for (let i = 0; i < todo.length; i += BATCH) {
          const chunk = todo.slice(i, i + BATCH);
          const out = await translateBatch(chunk, lang);
          chunk.forEach((src, j) => {
            const ok = acceptTranslation(src, out[j]);
            if (ok) { if (saveTranslation(lang, src, ok, 'auto')) lastRun.translated++; } else lastRun.rejected++;
          });
        }
      }
    } catch (e) { lastRun.error = String(e.message || e).slice(0, 300); }
    finally { running = null; }
    return { ...lastRun };
  })();
  return running;
}
export const isRunning = () => !!running;

// After every content save, translate new texts in the background (debounced). Never delays or fails the save.
let timer = null;
onContentChange(() => {
  if (!providerName()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { if (missing('uz').length || missing('ru').length) translateMissing(); }, 1500);
  timer.unref?.();
});
