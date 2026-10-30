// Request dispatcher: routing, session + permission + CSRF enforcement, error handling.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { getDb, now } from './db.mjs';
import { config } from './config.mjs';
import { Router, HttpError, send, readJson, parseCookies, clientIp } from './http.mjs';
import { loadSession, can } from './security.mjs';
import { serveStatic } from './static.mjs';
import { register as authRoutes, COOKIE } from './routes/auth.mjs';
import { register as contentRoutes } from './routes/content-admin.mjs';
import { register as themeRoutes } from './routes/themes-admin.mjs';
import { register as settingsRoutes } from './routes/settings-admin.mjs';
import { register as systemRoutes } from './routes/system-admin.mjs';
import { register as translationRoutes } from './routes/translations-admin.mjs';
import { register as publicRoutes } from './routes/public.mjs';

export const router = new Router();
for (const r of [publicRoutes, authRoutes, contentRoutes, themeRoutes, settingsRoutes, systemRoutes, translationRoutes]) r(router);

const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Browsers always send Origin on cross-site POST/PUT/DELETE. When present it must be this host.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function recordServerError(route, err) {
  try { getDb().prepare('INSERT INTO server_errors(ts, route, message) VALUES (?,?,?)').run(now(), route, String(err?.message || err).slice(0, 300)); } catch { /* ignore */ }
}

export async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const isApi = path.startsWith('/api/') || path.startsWith('/uploads/');
  if (!isApi) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' }, { allow: 'GET, HEAD' });
    return serveStatic(req, res, path);
  }
  const ip = clientIp(req);
  const ctx = { req, res, url, query: Object.fromEntries(url.searchParams), ip, params: {}, json: (limit) => readJson(req, limit) };
  try {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const { route, params, pathMatched } = router.match(method, path);
    if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Not found');
    ctx.params = params;
    if (method !== 'GET' && !sameOrigin(req)) throw new HttpError(403, 'Cross-origin request refused.');

    if (path.startsWith('/api/admin/')) {
      const token = parseCookies(req)[COOKIE];
      const session = loadSession(token);
      if (session) { ctx.session = session; ctx.admin = session.admin; ctx.perms = session.perms; ctx.token = token; ctx.username = session.admin.username; }
    }
    if (route.opts.auth) {
      if (!ctx.session) throw new HttpError(401, 'Authentication required.');
      if (route.opts.perm && !can(ctx.perms, route.opts.perm)) throw new HttpError(403, 'You do not have permission to do this.');
      if (method !== 'GET' && !safeEqual(req.headers['x-csrf-token'], ctx.session.csrf)) throw new HttpError(403, 'Missing or invalid CSRF token.');
    }
    const out = await route.handler(ctx);
    if (out && out.raw) { res.writeHead(out.status || 200, { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...out.headers }); return res.end(out.body); }
    if (out && (out.body !== undefined || out.status || out.headers) && !Array.isArray(out) && Object.keys(out).every((k) => ['body', 'status', 'headers'].includes(k))) {
      return send(res, out.status || 200, out.body ?? {}, out.headers);
    }
    return send(res, 200, out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.details ? { details: e.details } : {}) });
    recordServerError(path, e);
    console.error(`[error] ${req.method} ${path}: ${e?.message}`); // message only: never request bodies, cookies or passwords
    return send(res, 500, { error: 'Internal server error.' });
  }
}

export function createApp() {
  const server = createServer((req, res) => {
    handle(req, res).catch((e) => { try { res.writeHead(500).end('Server error'); } catch { /* ignore */ } console.error(e?.message); });
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}

export { config };
