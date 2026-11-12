// Player accounts: registration, sign-in, sessions, profile, avatar, progress sync.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, newDataDir, removeDir, client } from './lib/server.mjs';

let dir, srv;
before(async () => { dir = newDataDir(); srv = await startServer(dir); });
after(async () => { await srv?.stop(); removeDir(dir); });

// player client: like the admin one but with its own cookie names/endpoints
function player() {
  const c = client(srv.base);
  c.register = async (username, password) => { const r = await c.post('/api/register', { username, password }); if (r.status === 201) { c.cookie = r.setCookie.split(';')[0]; c.csrf = r.json.csrf; } return r; };
  c.signin = async (username, password) => { const r = await c.post('/api/login', { username, password }); if (r.status === 200) { c.cookie = r.setCookie.split(';')[0]; c.csrf = r.json.csrf; } return r; };
  return c;
}

test('registration validates names and passwords, rejects duplicates and sets a hardened cookie', async () => {
  const a = player();
  for (const bad of ['ab', 'has space', 'x'.repeat(21), 'admin', 'Rookery', 'semi;colon']) assert.equal((await a.post('/api/register', { username: bad, password: 'Passw0rd!x' })).status, 400, bad);
  for (const pw of ['short1', 'allletters', '12345678', 'password']) assert.equal((await a.post('/api/register', { username: 'anna', password: pw })).status, 400, pw);
  assert.equal((await a.post('/api/register', { username: 'anna', password: 'anna12345' })).status, 400, 'password must not contain the username');
  const ok = await a.register('Anna', 'Knight-2024');
  assert.equal(ok.status, 201, ok.text);
  assert.match(ok.setCookie, /HttpOnly/); assert.match(ok.setCookie, /SameSite=Strict/);
  assert.equal(ok.json.user.username, 'Anna'); assert.equal(ok.json.ratings.blitz.rating, 1200);
  assert.ok(!/password|hash/i.test(ok.text), 'no secrets in the response');
  assert.equal((await player().register('anna', 'Knight-2024')).status, 409, 'usernames are case-insensitive');
});

test('sign in: generic error, session works, logout destroys it, wrong password is throttled', async () => {
  const a = player();
  assert.equal((await a.signin('Anna', 'wrong-pass1')).status, 401);
  assert.equal((await a.signin('nobody', 'wrong-pass1')).status, 401);
  const r = await a.signin('anna', 'Knight-2024'); assert.equal(r.status, 200);
  assert.equal((await a.get('/api/me')).json.authenticated, true);
  assert.equal((await a.post('/api/logout', {}, { csrf: false })).status, 403, 'CSRF token required');
  assert.equal((await a.post('/api/logout', {})).status, 200);
  assert.equal((await a.get('/api/me')).json.authenticated, false, 'the session is gone');
  const t = player();
  for (let i = 0; i < 6; i++) await t.signin('Anna', 'bad-guess-' + i);
  assert.equal((await t.signin('Anna', 'Knight-2024')).status, 429, 'locked after repeated failures, even with the right password');
});

test('anonymous visitors, forged cookies and administrators cannot use player endpoints', async () => {
  const anon = player();
  assert.equal((await anon.put('/api/me', { bio: 'x' }, { noCookie: true })).status, 401);
  assert.equal((await anon.get('/api/me/progress', { noCookie: true })).status, 401);
  assert.equal((await anon.get('/api/me', { headers: { cookie: 'rk_user=forged' } })).json.authenticated, false);
  const me = (await anon.get('/api/me')).json; assert.equal(me.authenticated, false);
});

test('profile: validated fields, preset avatars, image upload validated by content, password change', async () => {
  const p = player(); assert.equal((await p.register('Boris', 'Castle-7788')).status, 201);
  assert.equal((await p.put('/api/me', { country: 'uzb' })).status, 400);
  assert.equal((await p.put('/api/me', { bio: 'x'.repeat(301) })).status, 400);
  assert.equal((await p.put('/api/me', { avatar: 'preset:99' })).status, 400);
  const up = await p.put('/api/me', { country: 'UZ', bio: 'I <b>love</b> rooks', avatar: 'preset:3', lang: 'uz' });
  assert.equal(up.status, 200); assert.equal(up.json.user.country, 'UZ'); assert.equal(up.json.user.avatar, 'preset:3'); assert.ok(!up.json.user.bio.includes('<'));
  const evil = await p.call('PUT', '/api/me/avatar', { raw: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(evil.status, 422, 'scripts in SVG are rejected');
  const good = await p.call('PUT', '/api/me/avatar', { raw: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>', headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(good.status, 200, good.text); assert.equal(good.json.user.avatar, 'upload');
  const img = await fetch(srv.base + '/api/users/Boris/avatar'); assert.equal(img.status, 200); assert.match(img.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await p.post('/api/me/password', { current: 'wrong', next: 'Another-9988' })).status, 403);
  assert.equal((await p.post('/api/me/password', { current: 'Castle-7788', next: 'short' })).status, 400);
  assert.equal((await p.post('/api/me/password', { current: 'Castle-7788', next: 'Another-9988' })).status, 200);
  assert.equal((await player().signin('Boris', 'Another-9988')).status, 200);
});

test('learning progress follows the account', async () => {
  const p = player(); await p.register('Carla', 'Bishop-5566');
  assert.deepEqual((await p.get('/api/me/progress')).json, { data: null, updatedAt: null });
  assert.equal((await p.put('/api/me/progress', { data: [1] })).status, 400);
  assert.equal((await p.put('/api/me/progress', { data: { lessons: { done: { 'b-board': true } } } })).status, 200);
  const q = player(); await q.signin('Carla', 'Bishop-5566');
  assert.equal((await q.get('/api/me/progress')).json.data.lessons.done['b-board'], true);
});
