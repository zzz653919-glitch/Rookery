// Stockfish 19 (lite, single-threaded WebAssembly) in a Web Worker, driven through the UCI protocol.
// Used for every computer opponent, hints and analysis. If it cannot start (old browser, blocked worker) the callers fall back to
// the small built-in engine, so Rookery keeps working everywhere. See engine/stockfish/NOTICE.md for the license.
import { sqToName, mFrom, mTo } from './chess/rules.js';

const SF_URL = new URL('../engine/stockfish/stockfish-19-lite-single.js', import.meta.url);

// Rookery's computer levels 1–8 → Stockfish settings. Levels 1–2 use "Skill Level" (the weakest play), 3–7 use a target Elo, 8 is full strength.
const LEVEL_SETTINGS = {
  1: { skill: 0, depth: 1, maxMs: 120 },
  2: { skill: 4, depth: 3, maxMs: 200 },
  3: { elo: 1400, maxMs: 350 },
  4: { elo: 1700, maxMs: 600 },
  5: { elo: 2000, maxMs: 900 },
  6: { elo: 2400, maxMs: 1200 },
  7: { elo: 2800, maxMs: 1800 },
  8: { full: true, maxMs: 3000 },
};

export class StockfishClient {
  constructor() { this.worker = null; this.booting = null; this.usable = true; this.listeners = new Set(); this.busy = Promise.resolve(); this.token = 0; }

  start() {
    if (!this.usable) return Promise.reject(new Error('stockfish unavailable'));
    if (!this.booting) this.booting = this.boot().catch((e) => { this.usable = false; this.booting = null; this.terminate(); throw e; });
    return this.booting;
  }

  async boot() {
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') throw new Error('no worker / wasm support');
    this.worker = new Worker(SF_URL);
    this.worker.onmessage = (ev) => { const line = String(ev.data); for (const fn of [...this.listeners]) fn(line); };
    this.worker.onerror = (e) => { this.usable = false; throw new Error('stockfish worker error ' + (e.message || '')); };
    await this.command('uci', (l) => l.startsWith('uciok'), 20000);
    await this.command('isready', (l) => l.startsWith('readyok'), 20000);
    this.send('setoption name Hash value 16');
  }

  send(cmd) { this.worker.postMessage(cmd); }

  // Sends a command and waits for a line that satisfies `done`; resolves with all lines seen in between.
  command(cmd, done, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const lines = [];
      const timer = setTimeout(() => { this.listeners.delete(fn); reject(new Error('stockfish timeout')); }, timeoutMs);
      const fn = (line) => { lines.push(line); if (done(line)) { clearTimeout(timer); this.listeners.delete(fn); resolve(lines); } };
      this.listeners.add(fn);
      this.send(cmd);
    });
  }

  async newGame() { await this.start(); this.send('ucinewgame'); }

  // Same result shape as the built-in engine: { move: {from,to,promotion,san}, score (centipawns, side to move), depth, pv }.
  // opts: { level, timeMs, depth }  (no level = full strength, used for hints)
  async search(game, opts = {}) {
    await this.start();
    const my = ++this.token;
    // one search at a time: wait for the previous one (cancel() sends "stop" first)
    const run = this.busy.then(() => this.run(game, opts, my));
    this.busy = run.catch(() => {});
    return run;
  }

  async run(game, opts, my) {
    if (my !== this.token) throw new Error('cancelled');
    const L = opts.level ? LEVEL_SETTINGS[Math.max(1, Math.min(8, opts.level))] : { full: true };
    const hist = game.history({ verbose: true });
    const moves = hist.map((h) => h.from + h.to + (h.promotion || '')).join(' ');
    this.send(`setoption name UCI_LimitStrength value ${L.elo ? 'true' : 'false'}`);
    if (L.elo) this.send(`setoption name UCI_Elo value ${L.elo}`);
    this.send(`setoption name Skill Level value ${L.skill ?? 20}`);
    this.send(`position fen ${game.startFen}${moves ? ' moves ' + moves : ''}`);
    const movetime = Math.max(30, Math.min(opts.timeMs || 1500, L.maxMs || 8000));
    const go = `go movetime ${movetime}${opts.depth ? ' depth ' + opts.depth : L.depth ? ' depth ' + L.depth : ''}`;
    const lines = await this.command(go, (l) => l.startsWith('bestmove'), movetime + 8000);
    if (my !== this.token) throw new Error('cancelled');
    const best = lines.at(-1).split(/\s+/)[1];
    if (!best || best === '(none)') return { move: null, score: 0, depth: 0, pv: [] };
    let score = 0, depth = 0, pv = [];
    for (const l of lines) {
      const m = /depth (\d+).* score (cp|mate) (-?\d+).* pv (.+)$/.exec(l);
      if (m) { depth = +m[1]; score = m[2] === 'cp' ? +m[3] : (m[3] > 0 ? 1 : -1) * (30000 - Math.abs(+m[3]) * 2); pv = m[4].trim().split(/\s+/); }
    }
    const verbose = game.moves({ verbose: true });
    const mv = verbose.find((x) => x.from + x.to + (x.promotion || '') === best || (x.from + x.to === best.slice(0, 4) && !best[4] && !x.promotion));
    if (!mv) throw new Error('stockfish returned an unexpected move: ' + best);
    return { move: { from: mv.from, to: mv.to, promotion: mv.promotion, san: mv.san }, score, depth, pv };
  }

  cancel() { this.token++; if (this.worker) { try { this.send('stop'); } catch { /* ignore */ } } }
  terminate() { try { this.worker?.terminate(); } catch { /* ignore */ } this.worker = null; this.listeners.clear(); }
}

export const stockfish = new StockfishClient();
export { LEVEL_SETTINGS, sqToName, mFrom, mTo };
