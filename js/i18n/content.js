// Translatable text inside lessons, placement questions and puzzles — shared by the browser and the server.
// A translation is looked up by the hash of the exact English source string (see hashStr), so it works for the
// bundled curriculum and for lessons an administrator writes alike.
import { hashStr } from './core.js';

export const mapStr = (s, dict) => (typeof s === 'string' && s ? (dict[hashStr(s)] ?? s) : s);

const mapList = (arr, fn) => (Array.isArray(arr) ? arr.map(fn) : arr);

// Applies fn to every translatable string of one lesson step / placement item and returns a copy.
export function mapStepStrings(step, fn) {
  if (!step || typeof step !== 'object') return step;
  const out = { ...step };
  for (const k of ['title', 'text', 'instruction', 'hint', 'explain', 'q']) if (typeof out[k] === 'string') out[k] = fn(out[k]);
  if (Array.isArray(out.options)) out.options = out.options.map((o) => (typeof o === 'string' ? fn(o) : o));
  if (out.wrong && typeof out.wrong === 'object') out.wrong = Object.fromEntries(Object.entries(out.wrong).map(([k, v]) => [k, typeof v === 'string' ? fn(v) : v]));
  if (Array.isArray(out.questions)) out.questions = out.questions.map((q) => mapStepStrings(q, fn));
  return out;
}

export function mapLessonStrings(lesson, fn) {
  const out = { ...lesson };
  for (const k of ['title', 'summary', 'description']) if (typeof out[k] === 'string' && out[k]) out[k] = fn(out[k]);
  if (Array.isArray(out.objectives)) out.objectives = mapList(out.objectives, (o) => fn(o));
  if (Array.isArray(out.steps)) out.steps = out.steps.map((s) => mapStepStrings(s, fn));
  return out;
}

export function mapPuzzleStrings(p, fn) {
  const out = { ...p };
  for (const k of ['hint', 'explain']) if (typeof out[k] === 'string' && out[k]) out[k] = fn(out[k]);
  return out;
}

// Every translatable string of a value, in a stable order (used to build translation lists and to find what is missing).
export function collectStrings(value, mapper) {
  const seen = []; mapper(value, (s) => { seen.push(s); return s; });
  return seen;
}
export const lessonStrings = (l) => collectStrings(l, mapLessonStrings);
export const stepStrings = (s) => collectStrings(s, mapStepStrings);
export const puzzleStrings = (p) => collectStrings(p, mapPuzzleStrings);
