// Small HTTP helpers: JSON bodies, cookies, security headers, error type, route table.
import { config } from './config.mjs';

export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export const bad = (msg, details) => new HttpError(400, msg, details);

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'SAMEORIGIN',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
export const ADMIN_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'";

export function send(res, status, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  const data = isObj ? JSON.stringify(body) : body ?? '';
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(isObj ? { 'content-type': 'application/json; charset=utf-8' } : {}),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(data);
}

export function readBody(req, limit = config.maxJsonBytes) {
  return new Promise((resolve, reject) => {
    const declared = +req.headers['content-length'] || 0;
    if (declared > limit) { req.resume(); return reject(new HttpError(413, 'Request body too large')); }
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Request body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req, limit) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json');
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try { const v = JSON.parse(buf.toString('utf8')); if (v === null || typeof v !== 'object') throw 0; return v; }
  catch { throw bad('Invalid JSON body'); }
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function cookie(name, value, { maxAge, secure }) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}${maxAge != null ? `; Max-Age=${maxAge}` : ''}`;
}

export function clientIp(req) {
  if (config.trustProxy) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf.slice(0, 64);
  }
  return String(req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

export const isHttps = (req) => config.secureCookies || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');

// Tiny router: add(method, pattern, handler, opts) where pattern may contain :params.
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    this.routes.push({ method, re, keys, handler, opts });
    return this;
  }
  match(method, path) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
      return { route: r, params };
    }
    return { route: null, pathMatched };
  }
}
