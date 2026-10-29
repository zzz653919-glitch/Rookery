// Settings: appearance, board options, level / placement test, engine and offline status, local data.
import { Chess } from '../chess/rules.js';
import { BoardView, piecesFromGame } from '../ui/board.js';
import { BOARD_THEMES, PIECE_THEMES, pieceSvg } from '../ui/pieces.js';
import { esc, icon, toast, confirmDialog } from '../ui/dom.js';
import { store, DEFAULTS } from '../store.js';
import { levelById, LEVELS } from '../data/levels.js';
import { engineClient } from '../engine-client.js';
import { applyTheme } from '../app.js';
import { play as sfx } from '../sound.js';

const PREVIEW_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 5';

export function mount(root, { navigate }) {
  let board = null, disposed = false;

  function render() {
    const s = store.get('settings'), p = store.get('profile');
    const lv = levelById(p.level);
    root.innerHTML = `
      <header class="page-head"><div><div class="eyebrow">Settings</div><h1>Make it yours</h1><p>Everything here is saved on this device.</p></div></header>
      <div class="grid cols-2" style="align-items:start">
        <div class="stack">
          <section class="card stack" aria-labelledby="h-look"><h3 id="h-look">Appearance</h3>
            <div class="opt-group"><label class="lbl">Theme</label>
              <div class="segmented" id="seg-theme" role="group" aria-label="Theme"><button type="button" data-v="dark" aria-pressed="${s.theme === 'dark'}">${icon('moon', 16)} Dark</button><button type="button" data-v="light" aria-pressed="${s.theme === 'light'}">${icon('sun', 16)} Light</button></div></div>
            <div class="opt-group"><label class="lbl">Board</label>
              <div class="theme-swatches" id="sw-board">${BOARD_THEMES.map((t) => `<button class="swatch" type="button" data-v="${t.id}" aria-pressed="${s.boardTheme === t.id}" title="${esc(t.name)}"><div class="sw"><i style="background:${t.light}"></i><i style="background:${t.dark}"></i></div>${esc(t.name)}</button>`).join('')}</div></div>
            <div class="opt-group"><label class="lbl">Pieces</label>
              <div class="theme-swatches" id="sw-pieces">${PIECE_THEMES.map((t) => `<button class="swatch" type="button" data-v="${t.id}" aria-pressed="${s.pieceTheme === t.id}" title="${esc(t.name)}"><div class="sw-piece board" data-pieces="${t.id}" style="position:relative"><span class="piece-prev" style="width:32px;height:32px;display:block">${pieceSvg('n', 'w')}</span></div>${esc(t.name)}</button>`).join('')}</div></div>
          </section>
          <section class="card stack" aria-labelledby="h-opt"><h3 id="h-opt">Board &amp; sound</h3>
            ${[['coords', 'Show coordinates', 'Letters and numbers around the board.'], ['highlightMoves', 'Highlight legal moves', 'Dots on the squares a selected piece can reach.'], ['autoQueen', 'Always promote to a queen', 'Skip the promotion picker.'], ['animations', 'Animations', 'Smooth piece movement.'], ['sound', 'Sound effects', 'Synthesised sounds — no files to download.']]
              .map(([k, t, d]) => `<label class="row spread" style="gap:16px"><span><b>${t}</b><br><small class="muted">${d}</small></span><span class="switch"><input type="checkbox" data-opt="${k}" ${s[k] ? 'checked' : ''}><span></span></span></label>`).join('')}
          </section>
        </div>
        <div class="stack">
          <section class="card" aria-label="Preview"><div class="board-wrap" style="--board-max:360px"><div id="preview"></div></div></section>
          <section class="card stack" aria-labelledby="h-level"><h3 id="h-level">Your level</h3>
            <p style="margin:0">${lv ? `<span class="level-pill"><i>${lv.n}</i>${esc(lv.name)}</span>` : 'Not chosen yet.'}
              <span class="muted"> ${p.levelSource === 'placement' ? 'from the placement test (an estimate)' : p.levelSource === 'manual' ? 'chosen by you' : ''}${p.levelDate ? ' · ' + esc(new Date(p.levelDate).toLocaleDateString()) : ''}</span></p>
            <div class="btn-row"><a class="btn primary" href="#/test" id="retake">${icon('target', 16)} Retake the placement test</a><a class="btn" href="#/welcome" id="change-level">Choose level manually</a></div>
          </section>
          <section class="card stack" aria-labelledby="h-eng"><h3 id="h-eng">Computer opponent &amp; offline use</h3>
            <div id="eng-status" class="muted">Checking the engine…</div><div id="net-status" class="muted"></div>
          </section>
          <section class="card stack" aria-labelledby="h-data"><h3 id="h-data">Your data</h3>
            <div class="notice info">${icon('info', 16)} Rookery has no accounts and no server. Your level, progress and settings are stored <b>only on this device and in this browser</b> (IndexedDB). Clearing your browser data erases them, and they do not sync to other devices.</div>
            <div class="btn-row"><button class="btn" id="export" type="button">${icon('download', 16)} Export backup</button><label class="btn" style="cursor:pointer">${icon('upload', 16)} Import backup<input id="import" type="file" accept="application/json" hidden></label>
              <button class="btn" id="reset-progress" type="button">${icon('refresh', 16)} Reset progress</button><button class="btn danger" id="reset-all" type="button">${icon('trash', 16)} Erase everything</button></div>
            <small class="muted" id="store-mode"></small>
          </section>
        </div>
      </div>`;
    bind();
    mountPreview();
    engineStatus();
  }

  function mountPreview() {
    board?.destroy();
    board = new BoardView(root.querySelector('#preview'), { orientation: 'w', interactive: false });
    const g = new Chess(PREVIEW_FEN);
    board.setPosition(piecesFromGame(g));
    board.setLastMove({ from: 'c4', to: 'f7' });
  }

  async function set(key, val) { await store.update('settings', (s) => { s[key] = val; }); }

  function bind() {
    root.querySelectorAll('#seg-theme button').forEach((b) => b.onclick = async () => { await set('theme', b.dataset.v); applyTheme(); render(); });
    root.querySelectorAll('#sw-board .swatch').forEach((b) => b.onclick = async () => { await set('boardTheme', b.dataset.v); render(); });
    root.querySelectorAll('#sw-pieces .swatch').forEach((b) => b.onclick = async () => { await set('pieceTheme', b.dataset.v); render(); });
    root.querySelectorAll('[data-opt]').forEach((c) => c.onchange = async () => { await set(c.dataset.opt, c.checked); if (c.dataset.opt === 'sound' && c.checked) sfx('correct'); });
    root.querySelector('#export').onclick = () => {
      const data = {};
      for (const k of Object.keys(DEFAULTS)) data[k] = store.get(k);
      const blob = new Blob([JSON.stringify({ app: 'rookery', version: 1, exported: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rookery-backup.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Backup downloaded', 'good');
    };
    root.querySelector('#import').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.app !== 'rookery' || !j.data) throw new Error('not a Rookery backup');
        for (const k of Object.keys(DEFAULTS)) if (j.data[k] !== undefined) await store.set(k, j.data[k]);
        applyTheme(); toast('Backup restored', 'good'); render();
      } catch (err) { toast('Could not import: ' + err.message, 'bad'); }
    };
    root.querySelector('#reset-progress').onclick = async () => {
      if (await confirmDialog({ title: 'Reset progress?', body: 'Lessons, puzzles, games, streaks, achievements and your level will be cleared. Settings are kept.', ok: 'Reset progress', danger: true })) {
        await store.resetAll(); toast('Progress reset'); navigate('/welcome');
      }
    };
    root.querySelector('#reset-all').onclick = async () => {
      if (await confirmDialog({ title: 'Erase everything?', body: 'All progress and settings on this device will be deleted.', ok: 'Erase everything', danger: true })) {
        await store.resetEverything(); applyTheme(); toast('All data erased'); navigate('/welcome');
      }
    };
    root.querySelector('#store-mode').textContent = `Storage: ${store.mode === 'indexeddb' ? 'IndexedDB' : store.mode === 'localstorage' ? 'localStorage (fallback)' : 'memory only — progress will not survive a reload in this browser'}.`;
    const net = () => { const el = root.querySelector('#net-status'); if (el) el.innerHTML = `${icon(navigator.onLine ? 'wifi' : 'off', 14)} ${navigator.onLine ? 'Online' : 'Offline'} · ` + ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) ? (navigator.serviceWorker.controller ? 'the app is cached and works offline.' : 'offline caching activates after the first full load.') : 'offline caching needs the app to be served over http (see README); file:// is not supported.'); };
    net();
  }

  async function engineStatus() {
    const el = root.querySelector('#eng-status');
    try {
      const t0 = performance.now();
      await engineClient.ping();
      if (disposed) return;
      el.innerHTML = `${icon('check', 14)} <b>Built-in engine ready</b> — runs on this device (${engineClient.mode === 'worker' ? 'Web Worker' : 'main thread'}), no internet needed. Response ${Math.round(performance.now() - t0)} ms. It is a custom alpha-beta search engine (8 levels), not Stockfish.`;
    } catch (e) { if (!disposed) el.innerHTML = `<span style="color:var(--danger)">Engine failed to start: ${esc(e.message)}</span>`; }
  }

  render();
  return () => { disposed = true; board?.destroy(); };
}
