// Public (unauthenticated) endpoints used by the player site: content bundle, anonymous events, uploaded piece images.
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { getDb, now } from '../db.mjs';
import { config } from '../config.mjs';
import { HttpError, bad } from '../http.mjs';
import { rateLimit } from '../security.mjs';
import { buildContentFor } from '../content.mjs';
import { PIECE_CODES } from '../validate.mjs';

const EVENT_TYPES = new Set(['lesson_started', 'lesson_completed', 'puzzle_attempt', 'game_completed', 'placement_completed', 'client_error']);
const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

export function register(router) {
  router.add('GET', '/api/health', () => ({ ok: true }));

  router.add('GET', '/api/public/content', (ctx) => {
    const c = buildContentFor(ctx.query.lang);
    if (ctx.req.headers['if-none-match'] === c.etag) return { raw: true, status: 304, headers: { etag: c.etag, 'cache-control': 'no-cache' } };
    const gz = /\bgzip\b/.test(ctx.req.headers['accept-encoding'] || '');
    return { raw: true, status: 200, body: gz ? c.gz : c.body, headers: { 'content-type': 'application/json; charset=utf-8', etag: c.etag, 'cache-control': 'no-cache', vary: 'accept-encoding', ...(gz ? { 'content-encoding': 'gzip' } : {}) } };
  });

  // Anonymous usage events. Strictly validated, size-limited and rate-limited; no personal data is accepted.
  router.add('POST', '/api/events', async (ctx) => {
    if (!rateLimit('ev:' + ctx.ip, 120, 60000)) throw new HttpError(429, 'Slow down.');
    const body = await ctx.json(8 * 1024);
    if (typeof body.anon !== 'string' || !/^[a-z0-9]{8,32}$/.test(body.anon)) throw bad('Invalid client id.');
    if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) throw bad('Send 1–20 events.');
    const d = getDb();
    const ins = d.prepare('INSERT INTO events(ts, anon, type, ref, level, value, detail) VALUES (?,?,?,?,?,?,?)');
    let n = 0;
    for (const e of body.events) {
      if (!e || !EVENT_TYPES.has(e.type)) continue;
      const clip = (v, m) => (typeof v === 'string' ? v.slice(0, m).replace(/[\u0000-\u001f]/g, ' ') : null);
      const ref = clip(e.ref, 64), level = clip(e.level, 16);
      const value = Number.isFinite(e.value) ? Math.max(-1e6, Math.min(1e6, Math.trunc(e.value))) : null;
      const detail = e.type === 'client_error' ? clip(e.detail, 300) : null;
      ins.run(now(), body.anon, e.type, ref, level, value, detail);
      n++;
    }
    return { status: 202, body: { accepted: n } };
  }, { maxBody: 8 * 1024 });

  // Uploaded piece-set images. Served with a fixed content type derived from the extension we wrote ourselves.
  router.add('GET', '/uploads/piece-sets/:id/:file', (ctx) => {
    const { id, file } = ctx.params;
    const m = /^([wb][KQRBNP])\.(svg|png|webp)$/.exec(file);
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id) || !m || !PIECE_CODES.includes(m[1])) throw new HttpError(404, 'Not found');
    const path = join(config.uploadDir, 'piece-sets', id, file);
    if (!existsSync(path)) throw new HttpError(404, 'Not found');
    return { raw: true, status: 200, body: readFileSync(path), headers: {
      'content-type': MIME[extname(file)], 'cache-control': 'public, max-age=31536000, immutable',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'content-disposition': 'inline',
    } };
  });
}
