// Talks to the engine Web Worker. Falls back to running the (same) engine on the
// main thread if module workers are unavailable (very old browsers).

import { store } from './store.js';
import { stockfish } from './stockfish-client.js';

export class EngineClient {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.mode = 'none';   // 'worker' | 'main'
    this.fallback = null;
  }

  start() {
    if (this.worker || this.fallback) return;
    try {
      this.worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const { id, result, error } = e.data;
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        error ? p.reject(new Error(error)) : p.resolve(result);
      };
      this.worker.onerror = (e) => {
        console.warn('Engine worker failed, switching to main-thread engine', e.message);
        this.worker?.terminate();
        this.worker = null;
        this.failPending(new Error('worker crashed'));
        this.useFallback();
      };
      this.mode = 'worker';
    } catch (e) {
      console.warn('Module workers unavailable, using main-thread engine', e);
      this.useFallback();
    }
  }

  useFallback() {
    this.mode = 'main';
    this.fallback = import('./chess/engine.js').then((m) => new m.Engine(18));
  }

  failPending(err) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  call(msg) {
    this.start();
    if (this.worker) {
      const id = this.nextId++;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage({ ...msg, id });
      });
    }
    return this.fallback.then((eng) => new Promise((resolve) => setTimeout(() => {
      if (msg.type === 'search') resolve(eng.search(msg.fen, msg.keys, msg.opts || {}));
      else if (msg.type === 'newgame') { eng.clear(); resolve(true); }
      else resolve('pong');
    }, 20)));
  }

  // Stockfish first; the built-in engine is the fallback (Stockfish could not start, or the player chose it in Settings).
  wantsStockfish() { return stockfish.usable && store.get('settings').engine !== 'builtin'; }

  async search(game, opts) {
    if (this.wantsStockfish()) {
      try { const r = await stockfish.search(game, opts); this.mode = 'stockfish'; return r; }
      catch (e) { if (String(e.message) === 'cancelled') throw e; console.warn('Stockfish failed, using the built-in engine:', e.message); }
    }
    return this.call({ type: 'search', fen: game.fen(), keys: game.keys.slice(), opts });
  }

  newGame() { stockfish.usable && this.wantsStockfish() && stockfish.newGame().catch(() => {}); return this.call({ type: 'newgame' }); }
  async ping() {
    if (this.wantsStockfish()) { try { await stockfish.start(); this.mode = 'stockfish'; return 'pong'; } catch { /* fall back below */ } }
    return this.call({ type: 'ping' });
  }

  // Abort any search in progress (a worker cannot be interrupted, so replace it).
  cancel() {
    stockfish.cancel();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.failPending(new Error('cancelled'));
      this.mode = 'none';
    }
  }
}

export const engineClient = new EngineClient();
