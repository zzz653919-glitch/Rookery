// Safe defaults for every admin-managed setting, derived from the bundled app so a fresh install behaves exactly like before.
import { LEVELS as ENGINE_LEVELS } from '../js/chess/engine.js';
import { LEVELS as LEARN_LEVELS, SKILLS } from '../js/data/levels.js';

export { SKILLS };
// Skill tags a lesson may carry (the bundled curriculum also uses 'forks' and 'pins').
export const LESSON_SKILLS = { ...SKILLS, forks: 'Forks', pins: 'Pins' };
export const LEARN_LEVEL_IDS = LEARN_LEVELS.map((l) => l.id);

export const BUILTIN_TIME_CONTROLS = [
  { id: 'none', label: 'Untimed', base: 0, inc: 0 },
  { id: '1+0', label: '1 min', base: 60, inc: 0 },
  { id: '3+2', label: '3 | 2', base: 180, inc: 2 },
  { id: '5+0', label: '5 min', base: 300, inc: 0 },
  { id: '10+0', label: '10 min', base: 600, inc: 0 },
  { id: '15+10', label: '15 | 10', base: 900, inc: 10 },
];

export const BUILTIN_CATEGORIES = [
  { id: 'mate1', name: 'Mate in 1', desc: 'Deliver checkmate in a single move.', skill: 'mates' },
  { id: 'mate2', name: 'Mate in 2', desc: 'Force checkmate on your second move.', skill: 'mates' },
  { id: 'fork', name: 'Forks', desc: 'Attack two pieces at once.', skill: 'tactics' },
  { id: 'pin', name: 'Pins', desc: 'Win material with a piece that cannot move.', skill: 'tactics' },
  { id: 'skewer', name: 'Skewers', desc: 'Attack the big piece, win the one behind it.', skill: 'tactics' },
  { id: 'discovered', name: 'Discovered attacks', desc: 'Move one piece, unleash another.', skill: 'tactics' },
];

const col = (p1, p2, p3, pe, pd, pg) => ({ p1, p2, p3, pe, pd, pg });
// Colour variables copied from css/styles.css so the built-in sets can be listed, enabled/disabled and previewed.
export const BUILTIN_PIECE_SETS = [
  { id: 'classic', name: 'Classic', w: col('#fffdf5', '#ebe1ca', '#a89874', '#4a3f29', '#6b5d41', '#ffffff'), b: col('#8a8f9a', '#3a3d44', '#0b0c0f', '#000000', '#05060a', '#c9ced8') },
  { id: 'emerald', name: 'Emerald', w: col('#f4fff8', '#cfeedd', '#7fb89b', '#0b5a3c', '#0e6b48', '#ffffff'), b: col('#3f9a78', '#17614a', '#031d14', '#021710', '#021710', '#bff5dc') },
  { id: 'ink', name: 'Ink & Ivory', w: col('#ffffff', '#eceff3', '#9ea6b3', '#14161a', '#2a2e36', '#ffffff'), b: col('#5a606b', '#23262c', '#050607', '#000000', '#000000', '#e9edf5') },
  { id: 'gold', name: 'Gold & Onyx', w: col('#fff3c4', '#e8c76a', '#9a7420', '#4f3a0b', '#6a4d0e', '#fffbe6'), b: col('#5b5b66', '#25252b', '#07070a', '#d2a82b', '#d2a82b', '#f3d98a') },
];

export const BUILTIN_BOARD_THEMES = [
  { id: 'forest', name: 'Forest', light: '#e6e2cf', dark: '#5a8f6b' },
  { id: 'walnut', name: 'Walnut', light: '#ecd9b8', dark: '#a8764d' },
  { id: 'slate', name: 'Slate', light: '#d8dee6', dark: '#6b7f99' },
  { id: 'sand', name: 'Sand', light: '#f1e6cf', dark: '#c9a56b' },
  { id: 'midnight', name: 'Midnight', light: '#8d9bb0', dark: '#3f4b63' },
];

export const DEFAULT_SETTINGS = {
  defaultBoardTheme: 'forest',
  defaultPieceSet: 'classic',
  // Only the display name, description and availability of a computer level are configurable;
  // search depth / time / strength stay fixed in the engine.
  computerLevels: ENGINE_LEVELS.map((l) => ({ id: l.id, name: l.name, blurb: l.blurb, enabled: true })),
  timeControls: BUILTIN_TIME_CONTROLS.map((t) => ({ ...t, enabled: true })),
  puzzleCategories: BUILTIN_CATEGORIES.map((c) => ({ ...c, enabled: true })),
  assessment: { master: 0.6, bridgeLo: 0.4, bridgeNext: 0.8 },
  lessons: { quizPassRatio: 0.6, levelEngine: Object.fromEntries(LEARN_LEVELS.map((l) => [l.id, l.engine])) },
  appearance: { defaultTheme: 'dark', coords: true, animations: true, highlightMoves: true },
};
