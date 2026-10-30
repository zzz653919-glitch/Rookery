// All requests go through here: JSON in/out, CSRF header on every write, uniform error type.
export const session = { admin: null, perms: [], csrf: null };
export const can = (perm) => session.perms.includes('*') || session.perms.includes(perm);

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details || null; }
}
const listeners = new Set();
export const onUnauthorized = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function api(method, path, body, { query } = {}) {
  const headers = { accept: 'application/json' };
  let payload;
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) { payload = body; headers['content-type'] = 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  if (method !== 'GET' && session.csrf) headers['x-csrf-token'] = session.csrf;
  let url = path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString();
    if (qs) url += '?' + qs;
  }
  let res;
  try { res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' }); }
  catch { throw new ApiError(0, 'Cannot reach the server. Check that it is running.'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.endsWith('/login') && !path.endsWith('/session')) listeners.forEach((fn) => fn());
    throw new ApiError(res.status, data?.error || res.statusText || 'Request failed', data?.details);
  }
  return data;
}
export const get = (p, query) => api('GET', p, undefined, { query });
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b);
export const del = (p, query) => api('DELETE', p, undefined, { query });
