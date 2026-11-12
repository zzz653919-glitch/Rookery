// Talking to the Rookery server: JSON API with CSRF, the signed-in player, and the online/offline state of the platform.
// Without the server (static hosting, offline) `net.available` is false and every online feature explains why it is unavailable.
import { remote } from './content.js';

export const net = { available: false, user: null, ratings: null, csrf: null };
const listeners = new Set();
export const onAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { for (const fn of listeners) { try { fn(net); } catch (e) { console.error(e); } } };

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details || null; }
}

export async function api(method, path, body) {
  const headers = { accept: 'application/json' };
  let payload;
  if (body instanceof Uint8Array || body instanceof ArrayBuffer || body instanceof Blob) { payload = body; headers['content-type'] = 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  if (method !== 'GET' && net.csrf) headers['x-csrf-token'] = net.csrf;
  let res;
  try { res = await fetch(path.replace(/^\//, ''), { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' }); }
  catch { throw new ApiError(0, 'Cannot reach the server.'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && net.user && path !== '/api/login') { setSession(null); }
    throw new ApiError(res.status, data?.error || res.statusText || 'Request failed', data?.details);
  }
  return data;
}
export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);

function setSession(s) {
  net.user = s?.user || null; net.ratings = s?.ratings || null; net.csrf = s?.csrf || null;
  emit();
}

export async function loadSession() {
  net.available = !!remote.available;
  if (!net.available) { emit(); return net; }
  try { const s = await get('/api/me'); setSession(s.authenticated ? s : null); }
  catch { setSession(null); }
  return net;
}
export async function register(username, password) { const s = await post('/api/register', { username, password }); setSession(s); return s; }
export async function login(username, password) { const s = await post('/api/login', { username, password }); setSession(s); return s; }
export async function logout() { try { await post('/api/logout'); } catch { /* already out */ } setSession(null); }
export async function updateProfile(patch) { const s = await put('/api/me', patch); setSession(s); return s; }
export async function refreshRatings() { try { const s = await get('/api/me'); if (s.authenticated) setSession(s); } catch { /* ignore */ } }
export const requireOnline = () => { if (!net.available) throw new ApiError(0, 'Online play needs the Rookery server.'); };
