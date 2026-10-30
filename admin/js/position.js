// Position picker: FEN text + live board preview with three modes — view, edit pieces, play moves.
import { Chess } from '../../js/chess/rules.js';
import { h, tr } from './dom.js';
import { field, input, select } from './ui.js';
import { previewFrame } from './preview-frame.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

export function fenStatus(fen) {
  if (!fen || !fen.trim()) return { ok: false, message: 'Enter a FEN position.' };
  try { const g = new Chess(fen.trim()); return { ok: true, message: [g.turn() === 'w' ? 'White to move' : 'Black to move', g.isCheckmate() ? 'checkmate' : g.isStalemate() ? 'stalemate' : g.inCheck?.() ? 'in check' : null].filter(Boolean).join(' · '), game: g }; }
  catch (e) { return { ok: false, message: 'Not a valid position: ' + (e.message || 'check the FEN').replace(/^Error: /, '') }; }
}

// opts: { fen, orientation, allowRecord, onChange(fen), onMove({uci,san,fen}), height, marks, arrows }
export function positionPicker(opts = {}) {
  const st = { fen: opts.fen || START_FEN, orientation: opts.orientation || 'w', mode: 'view' };
  const fenIn = input({ value: st.fen, spellcheck: false, 'aria-label': 'FEN position', style: { fontFamily: 'var(--mono)', fontSize: '.85rem' } });
  const status = h('div', { class: 'small' });
  const frame = previewFrame({ height: opts.height || 400, onMessage: (m) => {
    if (m.type === 'move') opts.onMove?.(m);
    else if (m.type === 'placement') { const parts = st.fen.split(' '); parts[0] = m.placement; setFen(parts.join(' '), true); }
  } });
  const meta = h('div', { class: 'row wrap small', hidden: true });
  const turn = select([['w', 'White to move'], ['b', 'Black to move']], 'w', { 'aria-label': 'Side to move', style: { width: 'auto' }, onchange: syncMeta });
  const castle = ['K', 'Q', 'k', 'q'].map((c) => h('label', { class: 'row', style: { gap: '4px' } }, h('input', { type: 'checkbox', dataset: { c }, onchange: syncMeta }), { K: 'White O-O', Q: 'White O-O-O', k: 'Black O-O', q: 'Black O-O-O' }[c]));
  meta.append(turn, ...castle);

  function loadMeta() { const p = st.fen.split(' '); turn.value = p[1] === 'b' ? 'b' : 'w'; castle.forEach((l) => { l.firstChild.checked = (p[2] || '').includes(l.firstChild.dataset.c); }); }
  function syncMeta() {
    const p = st.fen.split(' ');
    const c = castle.filter((l) => l.firstChild.checked).map((l) => l.firstChild.dataset.c).join('') || '-';
    setFen([p[0], turn.value, c, '-', '0', p[5] || '1'].join(' '), true);
  }
  function check() { const r = fenStatus(st.fen); status.textContent = tr(r.message); status.style.color = r.ok ? 'var(--good)' : 'var(--danger)'; return r; }
  function render() {
    const r = check();
    if (st.mode === 'setup') { frame.send({ type: 'setup', fen: st.fen, orientation: st.orientation, maxWidth: 330 }); return; }
    if (!r.ok) { frame.send({ type: 'board', fen: EMPTY_FEN, orientation: st.orientation, maxWidth: 330 }); return; }
    frame.send({ type: 'board', fen: st.fen.trim(), orientation: st.orientation, maxWidth: 330, record: st.mode === 'record', replay: st.mode === 'record' ? (opts.getReplay?.() || []) : [], marks: opts.marks, arrows: opts.arrows });
  }
  function setFen(fen, fromEditor = false) {
    st.fen = fen; fenIn.value = fen; loadMeta(); check(); opts.onChange?.(fen);
    if (!fromEditor || st.mode !== 'setup') render(); // while placing pieces the iframe already shows the change
  }
  fenIn.addEventListener('input', () => { st.fen = fenIn.value; loadMeta(); check(); opts.onChange?.(st.fen); clearTimeout(fenIn._t); fenIn._t = setTimeout(render, 250); });

  const modeBtns = {};
  const setMode = (m) => { st.mode = m; meta.hidden = m !== 'setup'; Object.entries(modeBtns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === m))); render(); opts.onMode?.(m); };
  const modes = [['view', 'View'], ['setup', 'Edit pieces']].concat(opts.allowRecord ? [['record', 'Play moves']] : []);
  const seg = h('div', { class: 'row wrap' }, modes.map(([m, t]) => (modeBtns[m] = h('button', { class: 'btn sm', type: 'button', 'aria-pressed': m === 'view', onclick: () => setMode(m) }, t))),
    h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { st.orientation = st.orientation === 'w' ? 'b' : 'w'; render(); } }, 'Flip board'),
    h('button', { class: 'btn sm ghost', type: 'button', onclick: () => setFen(START_FEN) }, 'Start position'),
    h('button', { class: 'btn sm ghost', type: 'button', onclick: () => setFen(EMPTY_FEN) }, 'Clear'));
  const node = h('div', { class: 'stack tight' }, field('FEN position', fenIn, { hint: 'Paste a FEN from any chess tool, or use “Edit pieces” to place them.' }), status, seg, meta, frame);
  loadMeta(); check();
  setTimeout(render, 0);
  return {
    node, frame, getFen: () => st.fen.trim(), setFen: (f) => setFen(f), getOrientation: () => st.orientation, setMode, refresh: render, dispose: () => frame.dispose(),
    // replay a position at the start so the recorder starts from the base FEN again
    reset: () => render(),
  };
}
