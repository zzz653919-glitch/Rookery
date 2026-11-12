// Live connection to the server: WebSocket when the host supports it, plain HTTP polling otherwise.
// Both give the same events: game states, "you were matched", notifications and chat messages.
import { get } from './net.js';

const listeners = new Map();   // event -> Set<fn>
let ws = null, wsOk = false, wsFailures = 0, retry = null, closedByUs = false, ref = 1;
const pending = new Map();
const watching = new Map();    // game id -> { count, version }
let pollTimer = null;

const on = (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev)?.delete(fn); };
const fire = (ev, data) => { for (const fn of listeners.get(ev) || []) { try { fn(data); } catch (e) { console.error(e); } } };
export const onGame = (fn) => on('game', fn);
export const onMatched = (fn) => on('matched', fn);
export const onNotify = (fn) => on('notify', fn);
export const onChat = (fn) => on('chat', fn);
export const isSocket = () => wsOk;

function wsUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws'; }

export function connect() {
  if (ws || typeof WebSocket === 'undefined' || !/^https?:$/.test(location.protocol)) { startPolling(); return; }
  closedByUs = false;
  try { ws = new WebSocket(wsUrl()); } catch { ws = null; wsFailures++; startPolling(); return; }
  ws.onopen = () => { wsOk = true; wsFailures = 0; stopPolling(); for (const id of watching.keys()) ws.send(JSON.stringify({ t: 'sub', game: id })); };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'game') { const w = watching.get(m.game.id); if (w) w.version = m.game.version; fire('game', m.game); }
    else if (m.t === 'matched') fire('matched', m);
    else if (m.t === 'notify') fire('notify', m);
    else if (m.t === 'chat') fire('chat', m);
    else if ((m.t === 'ok' || m.t === 'error') && pending.has(m.ref)) { const p = pending.get(m.ref); pending.delete(m.ref); m.t === 'ok' ? p.resolve() : p.reject(new Error(m.error)); }
  };
  ws.onclose = () => {
    const was = wsOk; wsOk = false; ws = null;
    for (const p of pending.values()) p.reject(new Error('Connection lost.')); pending.clear();
    if (closedByUs) return;
    if (!was) wsFailures++;
    if (wsFailures >= 2) { startPolling(); return; }           // this host has no WebSocket support: poll instead
    startPolling();                                              // bridge the gap while reconnecting
    clearTimeout(retry); retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(wsFailures, 4)));
  };
  ws.onerror = () => { /* onclose follows */ };
}

// Send a command over the socket; resolves when the server confirms. Rejects if no socket (the caller then uses HTTP).
export function sendSocket(msg) {
  return new Promise((resolve, reject) => {
    if (!ws || !wsOk) return reject(new Error('no socket'));
    const r = ref++; pending.set(r, { resolve, reject }); ws.send(JSON.stringify({ ...msg, ref: r }));
    setTimeout(() => { if (pending.has(r)) { pending.delete(r); reject(new Error('timeout')); } }, 6000);
  });
}

// Follow a game. Returns a function that stops following.
export function watchGame(id) {
  const w = watching.get(id) || { count: 0, version: -1 };
  w.count++; watching.set(id, w);
  if (w.count === 1 && ws && wsOk) ws.send(JSON.stringify({ t: 'sub', game: id }));
  if (!wsOk) startPolling();
  return () => { const x = watching.get(id); if (!x) return; if (--x.count <= 0) { watching.delete(id); if (ws && wsOk) ws.send(JSON.stringify({ t: 'unsub', game: id })); } };
}

// ---- polling fallback (also keeps working when the socket drops for a while)
function startPolling() {
  if (pollTimer) return;
  const tick = async () => {
    pollTimer = null;
    if (wsOk) return;
    if (!document.hidden || watching.size) {
      for (const [id, w] of [...watching]) {
        try { const g = await get('/api/games/' + id); if (g.version !== w.version) { w.version = g.version; fire('game', g); } } catch { /* retried next tick */ }
      }
    }
    if (watching.size || listeners.get('matched')?.size) pollTimer = setTimeout(tick, document.hidden ? 5000 : 1200);
  };
  pollTimer = setTimeout(tick, 400);
}
function stopPolling() { clearTimeout(pollTimer); pollTimer = null; }

// After signing in or out the socket must be re-opened so the server knows who is on the other end.
export function reconnect() {
  if (!ws) { connect(); return; }
  const old = ws; ws = null; wsOk = false; wsFailures = 0; old.onclose = null; try { old.close(); } catch { /* ignore */ }
  for (const p of pending.values()) p.reject(new Error('Connection lost.')); pending.clear();
  connect();
}

export function disconnect() { closedByUs = true; clearTimeout(retry); ws?.close(); ws = null; wsOk = false; stopPolling(); }
