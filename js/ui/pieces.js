// Original vector chess pieces for Rookery (drawn for this project).
// A consistent Staunton-inspired set with a lit, 3D look: every part is filled with a
// cylindrical gradient, a soft specular sheen and a thin edge. Colours come from CSS
// variables so piece themes are pure CSS and need no extra files:
//   --p1 highlight  --p2 mid-tone  --p3 shadow  --pe edge  --pd incised detail  --pg specular
// Gradients are defined per <svg> (unique ids) so each piece resolves its own theme variables.

let uid = 0;

const PARTS = {
  // body parts use a horizontal "cylinder" gradient (b) plus a sheen overlay (s); the stepped foot is drawn last
  p: (P) => `
    ${P.body('M44 47 C45 58 43 68 36 79 H64 C57 68 55 58 56 47 z')}
    ${P.body('M35.5 41 Q50 46.4 64.5 41 V45.4 Q50 51 35.5 45.4 z')}
    ${P.ball('cx="50" cy="28" r="11.5"')}
    ${P.foot()}`,
  r: (P) => `
    ${P.body('M37 40 C38 54 37 68 31 79 H69 C63 68 62 54 63 40 z')}
    ${P.body('M32.5 36 H67.5 L66.5 41 H33.5 z')}
    ${P.body('M27.5 14 h10 v8 h6 v-8 h13 v8 h6 v-8 h10 v17.4 q0 1.6-1.6 1.6 H29.1 q-1.6 0-1.6-1.6 z')}
    <path d="M29 30.6 H71" stroke="var(--pd)" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>
    ${P.foot()}`,
  b: (P) => `
    ${P.body('M43.5 62 C44.5 69 42 74.5 34 79 H66 C58 74.5 55.5 69 56.5 62 z')}
    ${P.body('M38.5 58.6 Q50 62.4 61.5 58.6 V62.4 Q50 66.4 38.5 62.4 z')}
    ${P.body('M35.5 52.4 Q50 57.8 64.5 52.4 V56.6 Q50 62 35.5 56.6 z')}
    ${P.body('M50 17 C63 24 68.5 36 63.5 45 C61.5 48.6 59.5 50 58.8 52.8 Q50 55.6 41.2 52.8 C40.5 50 38.5 48.6 36.5 45 C31.5 36 37 24 50 17 z')}
    <path d="M47.2 29.4 L57.2 40" stroke="var(--pd)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M48.6 28.4 L58.4 38.8" stroke="var(--pg)" stroke-width="1" stroke-linecap="round" opacity=".7"/>
    ${P.ball('cx="50" cy="13" r="4.6"')}
    ${P.foot()}`,
  q: (P) => `
    ${P.body('M42 55 C43 66 40 73 32 79 H68 C60 73 57 66 58 55 z')}
    ${P.body('M38 52.4 Q50 56.2 62 52.4 V56.2 Q50 60 38 56.2 z')}
    ${P.body('M33 44 Q50 50.2 67 44 V48.4 Q50 54.8 33 48.4 z')}
    ${P.body('M30.5 44 L25 24.5 L33 31.5 L38.5 19.5 L44.5 30 L50 18 L55.5 30 L61.5 19.5 L67 31.5 L75 24.5 L69.5 44 Q50 49.2 30.5 44 z')}
    ${P.ball('cx="25" cy="22.6" r="3.4"')}${P.ball('cx="38.5" cy="17" r="3.4"')}${P.ball('cx="61.5" cy="17" r="3.4"')}${P.ball('cx="75" cy="22.6" r="3.4"')}
    ${P.ball('cx="50" cy="12.4" r="5.4"')}
    ${P.foot()}`,
  k: (P) => `
    ${P.body('M41.5 55 C42.5 66 39.5 73 31.5 79 H68.5 C60.5 73 57.5 66 58.5 55 z')}
    ${P.body('M37.5 52.6 Q50 56.4 62.5 52.6 V56.4 Q50 60.2 37.5 56.4 z')}
    ${P.body('M33.5 45 Q50 51 66.5 45 V49.4 Q50 55.6 33.5 49.4 z')}
    ${P.body('M38 45.4 C36 38.5 32.5 31.5 31 24.5 Q50 29.5 69 24.5 C67.5 31.5 64 38.5 62 45.4 Q50 49.4 38 45.4 z')}
    ${P.body('M29.5 21.4 Q50 27 70.5 21.4 V25.2 Q50 31 29.5 25.2 z')}
    ${P.body('M47.4 3.6 h5.2 q1.2 0 1.2 1.2 V9 H58.4 q1.2 0 1.2 1.2 v2.8 q0 1.2-1.2 1.2 H53.8 V22.6 H46.2 V14.2 H41.6 q-1.2 0-1.2-1.2 v-2.8 q0-1.2 1.2-1.2 H46.2 V4.8 q0-1.2 1.2-1.2 z')}
    ${P.foot()}`,
  n: (P) => `
    ${P.body('M28.5 79 C27 69 30 59.5 37.2 53.6 C40 51.4 42 50.2 41.4 48.6 C37.8 51.4 32.2 56.6 27.4 55.6 C23 54.8 19.8 51.8 20.8 48 C21.8 44.4 27.2 40.4 33.2 33.2 C37.6 28 41.6 24.2 43.6 21 L42.8 10.6 L50.4 16.4 L55 13.2 L56.6 18.6 L61.6 16 L62.2 22 L67.2 20.4 L67 26.6 L71.8 26 L70.6 33 L75.2 34 L72.6 41 L76.6 44 L73.6 51 L77 55 L74.2 62.5 L76.2 70 L74.6 79 z')}
    <path d="M22.6 47.6 C24.8 44.8 27.4 42.8 30 40.4" stroke="var(--pg)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".6"/>
    <path d="M39 45.6 C44 43.4 47 38.4 46 33" stroke="var(--pd)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M27.6 55.2 C30 54.4 32.4 53.4 34.6 52.2" stroke="var(--pd)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M60 23 C66.6 32 68.6 47 66.4 64 M54.4 21 C59.6 30 61 43 59 56" stroke="var(--pd)" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".55"/>
    <ellipse cx="24.6" cy="48.6" rx="1.8" ry="1.1" transform="rotate(-35 24.6 48.6)" fill="var(--pd)"/>
    <ellipse cx="39" cy="34.4" rx="2.7" ry="2.2" fill="var(--pd)"/>
    <circle cx="38.2" cy="33.6" r=".8" fill="var(--pg)"/>
    <path d="M46.2 17.8 L45.6 13.6 L49.2 16.6 z" fill="var(--pd)" opacity=".55"/>
    ${P.foot()}`,
};

function build(id) {
  const body = (d) => `<path d="${d}" fill="url(#${id}b)" stroke="var(--pe)" stroke-width="1.5" stroke-linejoin="round"/><path d="${d}" fill="url(#${id}s)"/>`;
  const ball = (a) => `<circle ${a} fill="url(#${id}r)" stroke="var(--pe)" stroke-width="1.5"/>`;
  const foot = () => `
    <ellipse cx="50" cy="90.6" rx="32" ry="3.4" fill="url(#${id}g)"/>
    ${body('M22.5 90 Q21 88.6 21.6 86.2 Q22.4 83.6 26.5 83 H73.5 Q77.6 83.6 78.4 86.2 Q79 88.6 77.5 90 z')}
    ${body('M26.5 83.2 Q26.5 80.4 30.5 79.8 H69.5 Q73.5 80.4 73.5 83.2 z')}
    ${body('M31 80 Q31 77.2 34.5 76.6 H65.5 Q69 77.2 69 80 z')}`;
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
