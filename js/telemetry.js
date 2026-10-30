// Anonymous usage statistics for the optional admin dashboard. Sent ONLY when Rookery is served by the admin server
// (see content.js) and the player has not switched it off in Settings. No account, name or progress data is sent:
// just an event type, a lesson/puzzle id, a result and a random per-browser id that is not linked to a person.
import { store } from './store.js';
import { remote } from './content.js';

const ANON_KEY = 'rookery:anon';
let queue = [], timer = null;

function anonId() {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24); localStorage.setItem(ANON_KEY, id); }
    return id;
  } catch { return null; }
}
const enabled = () => remote.available && store.ready && store.get('settings').telemetry !== false;

export function track(type, ref = null, level = null, value = null, detail = null) {
  try {
    if (!enabled()) return;
    queue.push({ type, ref: ref == null ? null : String(ref), level: level == null ? null : String(level), value: Number.isFinite(value) ? value : null, detail });
    if (queue.length >= 10) flush(); else if (!timer) timer = setTimeout(flush, 4000);
  } catch { /* statistics must never break the app */ }
}

export function flush() {
  clearTimeout(timer); timer = null;
  if (!queue.length) return;
  const anon = anonId();
  const events = queue.splice(0, 20);
  if (!anon || !navigator.onLine) return;
  try { fetch('api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anon, events }), keepalive: true }).catch(() => {}); } catch { /* ignore */ }
}

export function installErrorReporting() {
  addEventListener('error', (e) => track('client_error', location.hash.slice(0, 40), null, null, String(e.message || 'error')));
  addEventListener('unhandledrejection', (e) => track('client_error', location.hash.slice(0, 40), null, null, String(e.reason?.message || e.reason || 'rejection')));
  addEventListener('pagehide', flush);
}
