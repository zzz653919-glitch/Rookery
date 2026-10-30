// Runs inside the preview iframe. It reuses the real player modules (board, lesson player, task runner) so what an
// administrator previews is exactly what players get. Nothing here is persisted: the player store is kept in memory.
import { Chess } from '../../js/chess/rules.js';
import { BoardView, piecesFromGame, legalTargetsFor } from '../../js/ui/board.js';
import { runTask } from '../../js/ui/task.js';
import { store, DEFAULTS } from '../../js/store.js';
import { registerPieceSets, BOARD_THEMES, PIECE_THEMES, pieceSvg } from '../../js/ui/pieces.js';
import { themeCss } from '../../js/content.js';
import { LESSONS } from '../../js/data/lessons.js';

// in-memory player store: no IndexedDB reads or writes from the preview
for (const [k, v] of Object.entries(DEFAULTS)) store.data[k] = structuredClone(v);
store.persist = async () => true; store.ready = true; store.mode = 'memory';
store.data.profile.onboarded = true; store.data.profile.level = 'beginner';

const stage = document.getElementById('stage');
let current = null;
const post = (msg) => parent.postMessage(msg, location.origin);
const say = (text) => { stage.replaceChildren(Object.assign(document.createElement('p'), { textContent: text, style: 'color:#f88;font-family:system-ui;padding:8px' })); };

function destroy() { try { current?.(); } catch { /* ignore */ } current = null; stage.replaceChildren(); }
function applyTheme(msg) {
  document.documentElement.setAttribute('data-theme', msg.theme || 'dark');
  const boardThemes = msg.boardThemes || [], pieceSets = msg.pieceSets || [];
  if (boardThemes.length) BOARD_THEMES.splice(0, BOARD_THEMES.length, ...boardThemes);
  if (pieceSets.length) { registerPieceSets(pieceSets); PIECE_THEMES.splice(0, PIECE_THEMES.length, ...pieceSets.map((p) => ({ id: p.id, name: p.name }))); }
  let style = document.getElementById('theme-css');
  if (!style) { style = document.createElement('style'); style.id = 'theme-css'; document.head.appendChild(style); }
  style.textContent = themeCss({ boardThemes, pieceSets });
  if (msg.boardTheme) store.data.settings.boardTheme = msg.boardTheme;
  if (msg.pieceSet) store.data.settings.pieceTheme = msg.pieceSet;
  store.data.settings.sound = false;
}

const board = (msg) => {
  let g;
  try { g = new Chess(msg.fen); } catch { return say('Not a valid FEN position.'); }
  let last = null;
  for (const u of msg.replay || []) { const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (!m) break; last = m; }
  const wrap = document.createElement('div'); wrap.className = 'board-wrap'; wrap.style.maxWidth = (msg.maxWidth || 420) + 'px'; wrap.style.margin = '0 auto';
  const host = document.createElement('div'); wrap.appendChild(host); stage.appendChild(wrap);
  const bv = new BoardView(host, {
    orientation: msg.orientation || (g.turn() === 'b' && msg.autoOrient ? 'b' : 'w'), interactive: !!msg.record,
    canSelect: (sq) => g.get(sq)?.color === g.turn(), legalTargets: (sq) => legalTargetsFor(g, sq),
    onMove: ({ from, to, promotion }) => {
      const m = g.move({ from, to, promotion });
      if (!m) return false;
      bv.setPosition(piecesFromGame(g), { from, to });
      post({ type: 'move', uci: from + to + (promotion || ''), san: m.san, fen: g.fen() });
      return true;
    },
  });
  bv.setPosition(piecesFromGame(g), last ? { from: last.from, to: last.to } : null);
  if (msg.marks) bv.setMarks(msg.marks);
  if (msg.arrows) bv.setArrows(msg.arrows.map(([from, to, color]) => ({ from, to, color })));
  current = () => bv.destroy();
};

function lesson(msg) {
  LESSONS.splice(0, LESSONS.length, msg.lesson);
  const view = document.createElement('div'); view.className = 'view'; stage.appendChild(view);
  import('../../js/views/lesson.js').then(async (mod) => { const cleanup = await mod.mount(view, { params: { id: msg.lesson.id }, navigate: () => {} }); current = cleanup; })
    .catch((e) => say('Preview failed: ' + e.message));
}

function puzzle(msg) {
  const p = msg.puzzle;
  const view = document.createElement('div'); view.className = 'view';
  view.innerHTML = '<div class="board-wrap" style="max-width:420px;margin:0 auto"><div id="pb"></div></div><div class="card" style="margin-top:12px"><div id="pu"></div><div id="pn" class="btn-row" style="margin-top:12px"></div></div>';
  stage.appendChild(view);
  const bv = new BoardView(view.querySelector('#pb'), { orientation: p.fen.split(' ')[1] === 'b' ? 'b' : 'w', interactive: false });
  const ui = view.querySelector('#pu'), nav = view.querySelector('#pn');
  const steps = []; for (let i = 0; i < p.moves.length; i += 2) steps.push(p.moves[i + 1] ? { accept: [p.moves[i]], reply: p.moves[i + 1] } : { accept: [p.moves[i]] });
  const run = () => {
    ui.replaceChildren();
    const t = runTask({ kind: 'line', fen: p.fen, steps, instruction: p.moves.length === 1 ? 'Find the best move.' : `Find the best move — ${Math.ceil(p.moves.length / 2)} moves to find.`, hint: p.hint, explain: '' }, {
      board: bv, ui, mode: 'lesson',
      onDone: (res) => { ui.insertAdjacentHTML('beforeend', ''); const note = document.createElement('div'); note.className = 'feedback good'; note.textContent = `Solved${res.firstTry ? ' on the first try' : ''}. ${p.explain || ''}`; ui.appendChild(note); post({ type: 'puzzle-solved', firstTry: !!res.firstTry }); },
    });
    current = () => { t?.destroy?.(); bv.destroy(); };
  };
  run();
  const again = document.createElement('button'); again.className = 'btn'; again.type = 'button'; again.textContent = 'Restart'; again.onclick = () => { current?.(); view.remove(); puzzle(msg); };
  nav.appendChild(again);
}

// Free piece placement: pick a piece, click squares. Emits the piece-placement field of the FEN.
const PLACE_TYPES = ['k', 'q', 'r', 'b', 'n', 'p'];
function parsePlacement(fen) {
  const map = {}; const rows = String(fen).split(' ')[0].split('/');
  if (rows.length !== 8) return map;
  rows.forEach((row, i) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { if (f < 8) map['abcdefgh'[f] + (8 - i)] = { type: ch.toLowerCase(), color: ch === ch.toLowerCase() ? 'b' : 'w' }; f++; } } });
  return map;
}
function toPlacement(map) {
  const rows = [];
  for (let r = 8; r >= 1; r--) { let row = '', empty = 0; for (const f of 'abcdefgh') { const p = map[f + r]; if (!p) { empty++; continue; } if (empty) { row += empty; empty = 0; } row += p.color === 'w' ? p.type.toUpperCase() : p.type; } rows.push(row + (empty || '')); }
  return rows.join('/');
}
function setup(msg) {
  const map = parsePlacement(msg.fen);
  let tool = { type: 'p', color: 'w' };
  const wrap = document.createElement('div'); wrap.className = 'board-wrap'; wrap.style.cssText = `max-width:${msg.maxWidth || 420}px;margin:0 auto`;
  const host = document.createElement('div'); wrap.appendChild(host);
  const pal = document.createElement('div'); pal.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px;max-width:' + (msg.maxWidth || 420) + 'px;margin:10px auto 0';
  const btns = [];
  const choose = (t, b) => { tool = t; btns.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); };
  for (const color of ['w', 'b']) for (const type of PLACE_TYPES) {
    const b = document.createElement('button'); b.type = 'button'; b.title = `${color === 'w' ? 'White' : 'Black'} ${type}`; b.style.cssText = 'aspect-ratio:1;border:2px solid transparent;border-radius:8px;background:rgba(127,127,127,.18);padding:2px;cursor:pointer';
    b.innerHTML = pieceSvg(type, color, 'classic'); b.onclick = () => choose({ type, color }, b); btns.push(b); pal.appendChild(b);
  }
  const eraser = document.createElement('button'); eraser.type = 'button'; eraser.textContent = '⌫'; eraser.title = 'Remove a piece'; eraser.style.cssText = 'border:2px solid transparent;border-radius:8px;background:rgba(127,127,127,.18);font-size:1.3rem;cursor:pointer;color:inherit';
  eraser.onclick = () => choose(null, eraser); btns.push(eraser); pal.appendChild(eraser);
  const st = document.createElement('style'); st.textContent = 'button[aria-pressed=true]{border-color:#4f8cff!important;background:rgba(79,140,255,.25)!important}'; document.head.appendChild(st);
  choose(tool, btns[5]);
  stage.append(wrap, pal);
  const bv = new BoardView(host, { orientation: msg.orientation || 'w', interactive: false, onSquareClick: (sq) => {
    if (!tool) delete map[sq]; else if (map[sq] && map[sq].type === tool.type && map[sq].color === tool.color) delete map[sq]; else map[sq] = { ...tool };
    bv.setPosition({ ...map }); post({ type: 'placement', placement: toPlacement(map) });
  } });
  bv.setPosition({ ...map });
  current = () => { bv.destroy(); st.remove(); };
}

function theme(msg) {
  const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 5';
  board({ fen, maxWidth: msg.maxWidth || 400, marks: [] });
}

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== parent) return;
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;
  destroy();
  try {
    applyTheme(msg);
    if (msg.type === 'board') board(msg);
    else if (msg.type === 'lesson') lesson(msg);
    else if (msg.type === 'puzzle') puzzle(msg);
    else if (msg.type === 'theme') theme(msg);
    else if (msg.type === 'setup') setup(msg);
  } catch (err) { say('Preview error: ' + err.message); }
  requestAnimationFrame(() => post({ type: 'height', height: document.documentElement.scrollHeight }));
});
post({ type: 'ready' });
