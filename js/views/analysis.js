// Analysis board: import a PGN, step through it and let Stockfish evaluate every move.
import { Chess, loadPgn } from '../chess/rules.js';
import { BoardView, piecesFromGame } from '../ui/board.js';
import { esc, icon, toast, modal } from '../ui/dom.js';
import { engineClient } from '../engine-client.js';
import { stockfish } from '../stockfish-client.js';
import { identify } from '../data/openings.js';
import { t } from '../i18n/core.js';

const SAMPLE = '[Event "Immortal Game"]\n[White "Anderssen"]\n[Black "Kieseritzky"]\n\n1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0';
const clampCp = (s) => Math.max(-1000, Math.min(1000, s > 29000 ? 1000 : s < -29000 ? -1000 : s));
const evalText = (cp) => (Math.abs(cp) >= 1000 ? (cp > 0 ? '+M' : '-M') : (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1));

export async function mount(root, { navigate }) {
  let game = null, headers = {}, plies = [], ply = 0, evals = [], board = null, token = 0, analyzing = false, auto = null, flipped = false;

  function draw() {
    root.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">${t('Learn')}</div><h1>${t('Analysis board')}</h1><p>${t('Import a game (PGN), step through it, and let Stockfish point out the mistakes.')}</p></div></div>
      <div id="import" class="card stack" ${game ? 'hidden' : ''}>
        <label class="field"><span>${t('Paste a PGN')}</span><textarea id="pgn-in" placeholder="1. e4 e5 2. Nf3 Nc6 …" spellcheck="false"></textarea></label>
        <div class="row wrap"><button class="btn primary" id="do-import" type="button">${icon('upload', 18)} ${t('Load game')}</button><label class="btn" for="pgn-file">${icon('download', 18)} ${t('Open .pgn file')}</label><input type="file" id="pgn-file" accept=".pgn,text/plain" class="sr-only"><button class="btn ghost" id="sample" type="button">${t('Try an example')}</button></div>
        <div class="notice bad" id="imp-err" hidden></div>
      </div>
      <div id="viewer" ${game ? '' : 'hidden'}>
        <div class="analysis-layout">
          <div class="evalbar" id="evalbar" aria-hidden="true"><i id="evalfill"></i><b id="evaltxt">0.0</b></div>
          <section><div class="board-wrap"><div id="board"></div></div>
            <div class="row nav-controls" style="justify-content:center;margin-top:12px"><button class="btn icon-btn" id="first" aria-label="${t('Start')}" type="button">${icon('next', 18, 'flip-x')}</button><button class="btn icon-btn" id="prev" aria-label="${t('Previous move')}" type="button">${icon('back', 18)}</button><button class="btn icon-btn" id="play" aria-label="${t('Autoplay')}" type="button">${icon('play', 18)}</button><button class="btn icon-btn" id="next" aria-label="${t('Next move')}" type="button">${icon('arrow', 18)}</button><button class="btn icon-btn" id="last" aria-label="${t('End')}" type="button">${icon('next', 18)}</button><button class="btn icon-btn" id="flip" aria-label="${t('Flip board')}" type="button">${icon('flip', 18)}</button></div></section>
          <aside class="side-panel">
            <div class="card"><div class="muted small" id="meta"></div><div id="opening" class="chip good" hidden></div><div class="status-line" id="best" aria-live="polite" style="margin-top:8px"></div><svg id="graph" class="eval-graph" viewBox="0 0 300 70" preserveAspectRatio="none" role="img" aria-label="${t('Evaluation graph')}"></svg>
              <div class="moves" id="moves"></div></div>
            <div class="card"><div class="grid cols-2" style="gap:10px"><button class="btn primary" id="analyze" type="button">${icon('target', 18)} ${t('Analyze game')}</button><button class="btn" id="copy" type="button">${icon('copy', 18)} ${t('Copy PGN')}</button><button class="btn" id="dl" type="button">${icon('download', 18)} ${t('Download PGN')}</button><button class="btn ghost" id="other" type="button">${icon('refresh', 18)} ${t('Load another game')}</button></div>
              <div class="progress" id="aprog" hidden style="margin-top:12px"><i style="width:0"></i></div></div>
          </aside>
        </div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    $('#do-import').onclick = () => load($('#pgn-in').value);
    $('#sample').onclick = () => { $('#pgn-in').value = SAMPLE; load(SAMPLE); };
    $('#pgn-file').onchange = async (e) => { const f = e.target.files[0]; if (f) load(await f.text()); };
    if (game) wire();
  }

  function load(text) {
    const err = root.querySelector('#imp-err');
    try {
      const r = loadPgn(text.trim());
      if (!r.game.history().length) throw new Error(t('No moves found in this PGN.'));
      game = r.game; headers = r.headers; plies = r.game.history({ verbose: true }); ply = plies.length; evals = []; token++;
      draw(); setPly(ply);
    } catch (e) { err.hidden = false; err.textContent = t('Could not read the PGN: {error}', { error: e.message }); }
  }
  const at = (n) => { const c = new Chess(game.startFen); for (const m of plies.slice(0, n)) c.move({ from: m.from, to: m.to, promotion: m.promotion }); return c; };

  function wire() {
    const $ = (s) => root.querySelector(s);
    board = new BoardView($('#board'), { orientation: 'w', interactive: false });
    $('#first').onclick = () => setPly(0); $('#prev').onclick = () => setPly(ply - 1); $('#next').onclick = () => setPly(ply + 1); $('#last').onclick = () => setPly(plies.length);
    $('#flip').onclick = () => { flipped = !flipped; board.setOrientation(flipped ? 'b' : 'w'); };
    $('#play').onclick = () => { if (auto) { clearInterval(auto); auto = null; return; } if (ply >= plies.length) setPly(0); auto = setInterval(() => { if (ply >= plies.length) { clearInterval(auto); auto = null; return; } setPly(ply + 1); }, 900); };
    $('#analyze').onclick = analyzeAll;
    $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(game.pgn(headers)); toast(t('PGN copied to clipboard'), 'good'); } catch { toast(t('Copy failed'), 'bad'); } };
    $('#dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([game.pgn(headers)], { type: 'application/x-chess-pgn' })); a.download = 'rookery-game.pgn'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    $('#other').onclick = () => { game = null; token++; analyzing = false; draw(); };
    const keys = (e) => { if (e.target.matches('input,textarea')) return; if (e.key === 'ArrowLeft') { e.preventDefault(); setPly(ply - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); setPly(ply + 1); } };
    document.addEventListener('keydown', keys); wire.keys = keys;
    $('#meta').textContent = [headers.White && headers.Black ? `${headers.White} – ${headers.Black}` : '', headers.Event, headers.Date, headers.Result].filter((x) => x && x !== '?').join(' · ');
  }

  function setPly(n) {
    ply = Math.max(0, Math.min(plies.length, n));
    const c = at(ply); const last = ply ? plies[ply - 1] : null;
    board.setPosition(piecesFromGame(c), last ? { from: last.from, to: last.to } : null); board.setCheck(c.checkSquare()); board.setArrows([]);
    const sans = plies.slice(0, ply).map((p) => p.san); const op = identify(sans); const el = root.querySelector('#opening');
    el.hidden = !op; if (op) el.textContent = `${op.opening[0]} · ${op.opening[1]}`;
    renderMoves(); renderEval(c);
  }
  function renderMoves() {
    let html = '';
    for (let i = 0; i < plies.length; i += 2) {
      const cell = (p) => { if (!plies[p]) return '<span></span>'; const e = evals[p + 1]; const mark = e?.mark || ''; return `<button type="button" data-p="${p + 1}" class="${ply === p + 1 ? 'cur' : ''} ${mark ? 'mk' + mark.length : ''}">${esc(plies[p].san)}${mark ? `<sup>${mark}</sup>` : ''}</button>`; };
      html += `<span class="num">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}`;
    }
    const el = root.querySelector('#moves'); el.innerHTML = html; el.querySelectorAll('button').forEach((b) => { b.onclick = () => setPly(+b.dataset.p); });
    el.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
    drawGraph();
  }
  function renderEval(c) {
    const e = evals[ply]; const fill = root.querySelector('#evalfill'), txt = root.querySelector('#evaltxt');
    const cp = e ? e.cp : 0; fill.style.height = (50 + 50 * (2 / (1 + Math.exp(-cp / 250)) - 1)).toFixed(1) + '%'; txt.textContent = e ? evalText(cp) : '–';
    const best = root.querySelector('#best');
    best.innerHTML = e?.best ? `${icon('bulb', 16)} ${t('Stockfish prefers {move}', { move: `<b>${esc(e.best.san)}</b>` })}${e.mark ? ` · <span class="down">${t('your move lost about {n} pawns', { n: (e.loss / 100).toFixed(1) })}</span>` : ''}` : (analyzing ? '' : `<span class="muted">${t('Press "Analyze game" for Stockfish evaluations.')}</span>`);
    if (e?.best) board.setArrows([{ from: e.best.from, to: e.best.to, color: 'good' }]);
  }
  function drawGraph() {
    const svg = root.querySelector('#graph'); if (!svg) return;
    const pts = evals.map((e, i) => (e ? [i / Math.max(1, plies.length) * 300, 35 - clampCp(e.cp) / 1000 * 33] : null)).filter(Boolean);
    svg.innerHTML = `<line x1="0" y1="35" x2="300" y2="35" class="mid"/>${pts.length > 1 ? `<polyline points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>` : ''}<line class="cur" x1="${(ply / Math.max(1, plies.length) * 300).toFixed(1)}" x2="${(ply / Math.max(1, plies.length) * 300).toFixed(1)}" y1="0" y2="70"/>`;
    svg.onclick = (e) => { const r = svg.getBoundingClientRect(); setPly(Math.round((e.clientX - r.left) / r.width * plies.length)); };
  }

  async function analyzeAll() {
    if (analyzing) { token++; analyzing = false; engineClient.cancel(); root.querySelector('#analyze').innerHTML = `${icon('target', 18)} ${t('Analyze game')}`; return; }
    analyzing = true; const my = ++token; const btn = root.querySelector('#analyze'), prog = root.querySelector('#aprog'); btn.innerHTML = `${icon('x', 18)} ${t('Stop')}`; prog.hidden = false;
    try { await stockfish.start(); } catch { toast(t('Stockfish could not start in this browser — using the built-in engine.'), 'bad'); }
    for (let i = 0; i <= plies.length && my === token; i++) {
      const c = at(i);
      let r; try { r = await engineClient.search(c, { timeMs: 220, depth: 14 }); } catch { break; }
      if (my !== token) break;
      const white = c.turn() === 'w' ? 1 : -1;
      evals[i] = { cp: clampCp(r.score * white), best: r.move || null };
      if (i > 0) { const prev = evals[i - 1]; const mover = plies[i - 1].color; const drop = (mover === 'w' ? 1 : -1) * (prev.cp - evals[i].cp); const loss = Math.max(0, drop); evals[i].loss = loss; evals[i].mark = loss >= 300 ? '??' : loss >= 150 ? '?' : loss >= 70 ? '?!' : ''; if (!evals[i].mark) evals[i].loss = 0; }
      root.querySelector('#aprog i').style.width = Math.round(100 * i / plies.length) + '%';
      if (i === ply) renderEval(at(ply)); if (i % 3 === 0) renderMoves();
    }
    if (my === token) { analyzing = false; btn.innerHTML = `${icon('target', 18)} ${t('Analyze game')}`; prog.hidden = true; renderMoves(); renderEval(at(ply)); const bl = evals.filter((e) => e?.mark === '??').length; toast(bl ? t('Done — {n} blunders found', { n: bl }) : t('Done — no big blunders'), 'good'); }
  }

  draw();
  let pre = null; try { pre = sessionStorage.getItem('rookery:analysis-pgn'); sessionStorage.removeItem('rookery:analysis-pgn'); } catch { /* ignore */ }
  if (pre) load(pre);
  return () => { token++; engineClient.cancel(); clearInterval(auto); if (wire.keys) document.removeEventListener('keydown', wire.keys); board?.destroy(); };
}
