// Localised display names for data that is defined once, in English, in code (levels, skills, themes, achievements …).
// The English text itself is the dictionary key, so renamed or admin-created entries simply fall back to what was entered
// (or to the server-side translation memory, which already localises them before they reach the browser).
import { t } from './core.js';
import { SKILLS } from '../data/levels.js';

export const levelName = (lv) => t(lv.name);
export const levelBlurb = (lv) => t(lv.blurb);
export const levelFocus = (lv) => t(lv.focus);
export const skillName = (id) => t(SKILLS[id] || (id === 'forks' ? 'Forks' : id === 'pins' ? 'Pins' : id));
export const themeName = (th) => t(th.name);
export const themeDesc = (th) => t(th.desc);
