// Applies the bundled uz/ru translations of the built-in curriculum, placement test and puzzle texts in place.
// (When the optional admin server is present it already sends localised content; applying this again changes nothing.)
import { LESSONS } from '../data/lessons.js';
import { PUZZLES } from '../data/puzzles.js';
import { PLACEMENT } from '../data/placement.js';
import { mapStr, mapLessonStrings, mapStepStrings, mapPuzzleStrings } from './content.js';

export async function applyBundledTranslations(lang) {
  if (!lang || lang === 'en') return;
  let dict;
  try { dict = (await import(/* @vite-ignore */ new URL(`./content.${lang}.js`, import.meta.url).href)).default; } catch { return; }
  const fn = (s) => mapStr(s, dict);
  for (let i = 0; i < LESSONS.length; i++) LESSONS[i] = mapLessonStrings(LESSONS[i], fn);
  for (let i = 0; i < PUZZLES.length; i++) PUZZLES[i] = mapPuzzleStrings(PUZZLES[i], fn);
  for (let i = 0; i < PLACEMENT.length; i++) PLACEMENT[i] = mapStepStrings(PLACEMENT[i], fn);
}
