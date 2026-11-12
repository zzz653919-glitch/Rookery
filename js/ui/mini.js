// Small static board for game lists (watch page, home, profile).
import { pieceSvg, BOARD_THEMES, resolveBoardTheme } from './pieces.js';
import { store } from '../store.js';

export function miniBoard(fen, orientation = 'w', size = 168) {
  const theme = BOARD_THEMES.find((b) => b.id === resolveBoardTheme(store.get('settings').boardTheme)) || BOARD_THEMES[0];
  const rows = fen.split(' ')[0].split('/');
  const grid = rows.map((r) => { const out = []; for (const ch of r) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) out.push(null); else out.push({ color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() }); } return out; });
  const ranks = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  let html = `<div class="mini-board" style="--sz:${size}px">`;
  for (const r of ranks) for (const f of files) {
    const dark = (r + f) % 2 === 1, p = grid[r][f];
    html += `<span style="background:${dark ? theme.dark : theme.light}">${p ? pieceSvg(p.type, p.color) : ''}</span>`;
  }
  return html + '</div>';
}
