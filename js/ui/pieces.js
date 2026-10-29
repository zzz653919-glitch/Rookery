// Original vector chess pieces for Rookery (drawn for this project).
// Colours come from CSS variables (--pf fill, --ps stroke, --pd detail) so
// piece themes are pure CSS and need no extra files.

const S = 'fill="var(--pf)" stroke="var(--ps)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"';
const D = 'fill="none" stroke="var(--pd)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';

const BASE = `<path ${S} d="M26 88 h48 a3 3 0 0 0 3-3 v-3 a3 3 0 0 0-3-3 H26 a3 3 0 0 0-3 3 v3 a3 3 0 0 0 3 3 z"/>`;

export const PIECE_SVG = {
  p: `<g>
    <circle ${S} cx="50" cy="30" r="12"/>
    <path ${S} d="M39 48 h22 c-1 6-3 9-7 12 c6 4 10 10 12 19 H34 c2-9 6-15 12-19 c-4-3-6-6-7-12 z"/>
    ${BASE}
  </g>`,
  r: `<g>
    <path ${S} d="M30 22 h10 v7 h6 v-7 h8 v7 h6 v-7 h10 v22 H30 z"/>
    <path ${S} d="M34 44 h32 l3 34 H31 z"/>
    <path ${D} d="M38 56 h24"/>
    ${BASE}
  </g>`,
  n: `<g>
    <path ${S} d="M28 79 C28 64 31 52 40 44 C45 40 46 36 43 33 L33 37 C31 38 29 36 30 34 L41 20 L42 12 L50 18 C53 16 56 15 59 16 C72 19 79 33 78 50 C77 61 76 70 76 79 z"/>
    <circle cx="55" cy="30" r="3" fill="var(--pd)"/>
    <path ${D} d="M36 36 l-3 1"/>
    <path ${D} d="M62 44 C66 52 64 62 58 68"/>
    ${BASE}
  </g>`,
  b: `<g>
    <circle ${S} cx="50" cy="14" r="5.5"/>
    <path ${S} d="M50 20 C62 30 68 42 62 54 C60 58 57 61 57 66 L62 79 H38 L43 66 C43 61 40 58 38 54 C32 42 38 30 50 20 z"/>
    <path ${D} d="M45 38 l10 10"/>
    ${BASE}
  </g>`,
  q: `<g>
    <circle ${S} cx="22" cy="30" r="5"/><circle ${S} cx="36" cy="22" r="5"/><circle ${S} cx="50" cy="18" r="5"/>
    <circle ${S} cx="64" cy="22" r="5"/><circle ${S} cx="78" cy="30" r="5"/>
    <path ${S} d="M27 80 L19 38 L35 57 L36 30 L50 54 L64 30 L65 57 L81 38 L73 80 z"/>
    <path ${D} d="M33 70 h34"/>
    ${BASE}
  </g>`,
  k: `<g>
    <path ${S} d="M46 8 h8 v8 h8 v8 h-8 v8 h-8 v-8 h-8 v-8 h8 z"/>
    <path ${S} d="M30 80 C24 62 32 50 46 46 h8 C68 50 76 62 70 80 z"/>
    <path ${D} d="M36 66 h28"/>
    ${BASE}
  </g>`,
};

export function pieceSvg(type, color) {
  return `<svg class="piece-svg ${color}" viewBox="0 0 100 100" aria-hidden="true">${PIECE_SVG[type]}</svg>`;
}

export const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const BOARD_THEMES = [
  { id: 'forest', name: 'Forest', light: '#e6e2cf', dark: '#5a8f6b' },
  { id: 'walnut', name: 'Walnut', light: '#ecd9b8', dark: '#a8764d' },
  { id: 'slate', name: 'Slate', light: '#d8dee6', dark: '#6b7f99' },
  { id: 'sand', name: 'Sand', light: '#f1e6cf', dark: '#c9a56b' },
  { id: 'midnight', name: 'Midnight', light: '#8d9bb0', dark: '#3f4b63' },
];

export const PIECE_THEMES = [
  { id: 'classic', name: 'Classic' },
  { id: 'emerald', name: 'Emerald' },
  { id: 'ink', name: 'Ink & Ivory' },
  { id: 'gold', name: 'Gold & Onyx' },
];
