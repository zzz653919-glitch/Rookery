// The Vercel entry point (api/index.mjs) answers API calls like the normal server, on the libSQL back end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { newDataDir, removeDir, cli } from './lib/server.mjs';
import { join } from 'node:path';

let dir, srv, base, handler;
before(async () => {
  dir = newDataDir();
  process.env.TURSO_DATABASE_URL = `file:${join(dir, 'turso.db')}`;
  process.env.ROOKERY_DATA_DIR = dir;
  const { config } = await import('../server/config.mjs');
  config.tursoUrl = process.env.TURSO_DATABASE_URL; config.dataDir = dir;
  assert.equal(cli(dir, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: 'Correct-Horse-9!' }).status, 0); // migrates + seeds, as `npm run db:migrate` would
  handler = (await import('../api/index.mjs')).default;
  srv = createServer((req, res) => handler(req, res)); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(async () => { await new Promise((r) => srv.close(r)); const { closeDb } = await import('../server/db.mjs'); await closeDb(); removeDir(dir); });

test('health, public content (all languages) and admin login work through the serverless handler', async () => {
  assert.equal((await fetch(base + '/api/health')).status, 200);
  const en = await (await fetch(base + '/api/public/content')).json();
  assert.ok(en.lessons.length >= 29);
  const ru = await (await fetch(base + '/api/public/content?lang=ru')).json();
  assert.notEqual(ru.lessons[0].title, en.lessons[0].title);
  const s = await (await fetch(base + '/api/admin/session')).json(); assert.equal(s.authenticated, false);
  const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'Correct-Horse-9!' }) });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const me = await (await fetch(base + '/api/admin/session', { headers: { cookie } })).json(); assert.equal(me.authenticated, true);
  assert.equal((await fetch(base + '/api/admin/lessons', { headers: { cookie } })).status, 200);
  assert.equal((await fetch(base + '/api/admin/lessons')).status, 401);
});

test('an empty database gives a clear 503 instead of a crash', async () => {
  const d2 = newDataDir();
  try {
    const { config } = await import('../server/config.mjs');
    const { closeDb } = await import('../server/db.mjs');
    await closeDb(); config.tursoUrl = `file:${join(d2, 'empty.db')}`;
    const fresh = (await import('../api/index.mjs?empty=1')).default;
    let status = 0, body = '';
    await fresh({ method: 'GET', url: '/api/health', headers: {} }, { setHeader() {}, end(b) { body = b; }, set statusCode(v) { status = v; }, get statusCode() { return status; } });
    assert.equal(status, 503); assert.match(body, /db:migrate/);
  } finally { removeDir(d2); }
});
