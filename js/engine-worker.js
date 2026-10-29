// Web Worker that runs the Rookery search engine off the main thread.
import { Engine } from './chess/engine.js';

const engine = new Engine(18);

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'search') {
      const result = engine.search(m.fen, m.keys, m.opts || {});
      self.postMessage({ id: m.id, result });
    } else if (m.type === 'newgame') {
      engine.clear();
      self.postMessage({ id: m.id, result: true });
    } else if (m.type === 'ping') {
      self.postMessage({ id: m.id, result: 'pong' });
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String(err && err.message || err) });
  }
};
