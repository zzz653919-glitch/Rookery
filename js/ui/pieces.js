// Original vector chess pieces for Rookery (drawn for this project).
// A consistent Staunton-inspired set with a lit, 3D look: every part is filled with a
// cylindrical gradient, a soft specular sheen and a thin edge. Colours come from CSS
// variables so piece themes are pure CSS and need no extra files:
//   --p1 highlight  --p2 mid-tone  --p3 shadow  --pe edge  --pd incised detail  --pg specular
// Gradients are defined per <svg> (unique ids) so each piece resolves its own theme variables.

let uid = 0;

const PARTS = {
  // body parts use a horizontal "cylinder" gradient (b) plus a sheen overlay (s)
  p: (P) => `
    ${P.foot()}
    ${P.body('M43.5 46 C44.5 57 41.5 67 33.5 80.5 H66.5 C58.5 67 55.5 57 56.5 46 z')}
    ${P.body('M36.5 41 Q50 47 63.5 41 L64 45.6 Q50 51.4 36 45.6 z')}
    ${P.ball('cx="50" cy="27.5" r="11"')}`,
  r: (P) => `
    ${P.foot()}
    ${P.body('M36.5 38 C37.5 52 36.5 67 31.5 80.5 H68.5 C63.5 67 62.5 52 63.5 38 z')}
    ${P.body('M32 31 H68 L65 39 H35 z')}
    ${P.body('M28.5 16 h9 v7.5 h6 v-7.5 h13 v7.5 h6 v-7.5 h9 v14 q0 1.8-1.8 1.8 H30.3 q-1.8 0-1.8-1.8 z')}
    <path d="M30 29.6 H70" stroke="var(--pd)" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>`,
  b: (P) => `
    ${P.foot()}
    ${P.body('M43 61 C44 69 41 75 33.5 80.5 H66.5 C59 75 56 69 57 61 z')}
    ${P.body('M35.5 55.5 Q50 61.5 64.5 55.5 L65 60.6 Q50 66.8 35 60.6 z')}
    ${P.body('M50 18.5 C62 26.5 68 37 63 47 C61 51 58 53 57.5 56 Q50 59 42.5 56 C42 53 39 51 37 47 C32 37 38 26.5 50 18.5 z')}
    <path d="M45.5 30.5 L55.5 41.5" stroke="var(--pd)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M47 29.6 L56.8 40.2" stroke="var(--pg)" stroke-width="1" stroke-linecap="round" opacity=".7"/>
    ${P.ball('cx="50" cy="13" r="4.6"')}`,
  q: (P) => `
    ${P.foot()}
    ${P.body('M42 53 C43 65 40 73 32 80.5 H68 C60 73 57 65 58 53 z')}
    ${P.body('M32.5 44.5 Q50 51 67.5 44.5 L68.5 49.6 Q50 56.4 31.5 49.6 z')}
    ${P.body('M31.5 43 L23.5 22 L31 32.5 L36.5 17 L43.5 30.5 L50 14 L56.5 30.5 L63.5 17 L69 32.5 L76.5 22 L68.5 43 Q50 48.6 31.5 43 z')}
    ${P.ball('cx="23.5" cy="20.5" r="3.6"')}${P.ball('cx="36.5" cy="14.8" r="3.6"')}${P.ball('cx="50" cy="11.6" r="3.9"')}
    ${P.ball('cx="63.5" cy="14.8" r="3.6"')}${P.ball('cx="76.5" cy="20.5" r="3.6"')}`,
  k: (P) => `
    ${P.foot()}
    ${P.body('M41.5 53 C42.5 65 39.5 73 31.5 80.5 H68.5 C60.5 73 57.5 65 58.5 53 z')}
    ${P.body('M31.5 45.5 Q50 52.5 68.5 45.5 L69.5 50.8 Q50 58 30.5 50.8 z')}
    ${P.body('M32 45 C29.5 34 38 27.5 50 27.5 C62 27.5 70.5 34 68 45 Q50 50.6 32 45 z')}
    <path d="M36 37.4 Q50 41.5 64 37.4" stroke="var(--pd)" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".55"/>
    ${P.body('M47 5.6 h6 q1.4 0 1.4 1.4 V11.8 H59 q1.4 0 1.4 1.4 v3.4 q0 1.4-1.4 1.4 H54.4 V27.8 H45.6 V17.999 H41 q-1.4 0-1.4-1.4 v-3.4 q0-1.4 1.4-1.4 H45.6 V7 q0-1.4 1.4-1.4 z')}`,
  n: (P) => `
    ${P.foot()}
    ${P.body('M28.5 80.5 C27 69 30 59.5 37.2 53.6 C40 51.4 42 50.2 41.4 48.6 C37.8 51.4 32.2 56.6 27.4 55.6 C23 54.8 19.8 51.8 20.8 48 C21.8 44.4 27.2 40.4 33.2 33.2 C37.6 28 41.6 24.2 43.6 21 L42.8 10.6 L50.4 16.4 C55.2 14 61.6 14.6 66.4 19.2 C75.6 28 78.4 52 74.6 80.5 z')}
    <path d="M22.6 47.6 C24.8 44.8 27.4 42.8 30 40.4" stroke="var(--pg)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".6"/>
    <path d="M39 45.6 C44 43.4 47 38.4 46 33" stroke="var(--pd)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M27.6 55.2 C30 54.4 32.4 53.4 34.6 52.2" stroke="var(--pd)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M63.6 21 C69.6 30 71.4 46 69 63 M57.8 19.8 C63 29 64.6 42 62.4 55" stroke="var(--pd)" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".6"/>
    <ellipse cx="24.6" cy="48.6" rx="1.8" ry="1.1" transform="rotate(-35 24.6 48.6)" fill="var(--pd)"/>
    <ellipse cx="39" cy="34.4" rx="2.7" ry="2.2" fill="var(--pd)"/>
    <circle cx="38.2" cy="33.6" r=".8" fill="var(--pg)"/>
    <path d="M46.2 17.8 L45.6 13.6 L49.2 16.6 z" fill="var(--pd)" opacity=".55"/>`,
};

function build(id) {
  const body = (d) => `<path d="${d}" fill="url(#${id}b)" stroke="var(--pe)" stroke-width="1.5" stroke-linejoin="round"/><path d="${d}" fill="url(#${id}s)"/>`;
  const ball = (a) => `<circle ${a} fill="url(#${id}r)" stroke="var(--pe)" stroke-width="1.5"/>`;
  const foot = () => `
    <ellipse cx="50" cy="90.4" rx="31" ry="3.6" fill="url(#${id}g)"/>
    ${body('M25 89.6 Q23.5 88.6 24 86.2 Q24.6 83.4 28 82.6 H72 Q75.4 83.4 76 86.2 Q76.5 88.6 75 89.6 z')}
    ${body('M29.5 82.8 Q29.5 79.8 33 79.2 H67 Q70.5 79.8 70.5 82.8 z')}`;
  return { body, ball, foot };
}

export const PIECE_SVG = {};
for (const t of Object.keys(PARTS)) PIECE_SVG[t] = PARTS[t];

function defs(id) {
  const st = (o, v, op) => `<stop offset="${o}" style="stop-color:${v}"${op != null ? ` stop-opacity="${op}"` : ''}/>`;
  return `<defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="0">${st(0, 'var(--p3)')}${st(0.28, 'var(--p1)')}${st(0.55, 'var(--p2)')}${st(1, 'var(--p3)')}</linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0">${st(0.06, 'var(--pg)', 0)}${st(0.2, 'var(--pg)', 0.5)}${st(0.34, 'var(--pg)', 0)}</linearGradient>
    <radialGradient id="${id}r" cx=".36" cy=".3" r=".8">${st(0, 'var(--pg)')}${st(0.22, 'var(--p1)')}${st(0.62, 'var(--p2)')}${st(1, 'var(--p3)')}</radialGradient>
    <radialGradient id="${id}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>`;
}

export function pieceSvg(type, color) {
  const id = 'pg' + (++uid) + '-';
  return `<svg class="piece-svg ${color}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${defs(id)}${PARTS[type](build(id))}</svg>`;
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
