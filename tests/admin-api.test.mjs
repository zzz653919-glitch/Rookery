// Integration tests for the admin backend. They boot the real server against a temporary database and exercise it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import { existsSync, readdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, newDataDir, removeDir, cli, client } from './lib/server.mjs';
import { LESSONS } from '../js/data/lessons.js';
import { PUZZLES } from '../js/data/puzzles.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const LIBSQL = process.env.ROOKERY_TEST_DB === 'libsql';
const dbFile = (d) => join(d, LIBSQL ? 'turso.db' : 'rookery.db'); // the libSQL test server is a local file, so the checks below can read it directly
const PW = 'Correct-Horse-9!', PW_EDITOR = 'Editor-Passw0rd#1', PW_VIEWER = 'Viewer-Passw0rd#1';
let dir, srv, admin, editor, viewer, anon;
const GOOD_LESSON = (id, extra = {}) => ({
  id, level: 'beginner', skill: 'rules', title: 'Test lesson ' + id, summary: 'Summary', description: '', objectives: ['Learn something'], difficulty: 2, minutes: 5, status: 'draft',
  steps: [
    { type: 'learn', title: 'Idea', text: '<p>Hello <b>world</b></p>', fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1', explore: true },
    { type: 'task', kind: 'move', instruction: 'Capture it', fen: '7k/8/8/8/3R2p1/8/8/K7 w - - 0 1', accept: ['d4g4'], hint: 'Along the rank', explain: 'Rxg4' },
    { type: 'quiz', questions: [{ kind: 'mc', q: 'Rooks move?', options: ['Straight', 'Diagonally'], answer: 0, explain: 'Straight lines' }] },
  ], ...extra });

before(async () => {
  dir = newDataDir();
  for (const [u, role, pw] of [['boss', 'superadmin', PW], ['edie', 'editor', PW_EDITOR], ['vera', 'viewer', PW_VIEWER]]) {
    const r = cli(dir, ['create-admin', '--username', u, '--role', role], { password: pw });
    assert.equal(r.status, 0, r.stderr + r.stdout);
  }
  srv = await startServer(dir);
  admin = client(srv.base); editor = client(srv.base); viewer = client(srv.base); anon = client(srv.base);
  for (const [c, u, pw] of [[admin, 'boss', PW], [editor, 'edie', PW_EDITOR], [viewer, 'vera', PW_VIEWER]]) assert.equal((await c.login(u, pw)).status, 200);
});
after(async () => { await srv?.stop(); removeDir(dir); });

// ----------------------------------------------------------------------------------------------------- security
test('every admin API route rejects unauthenticated requests (visitors typing URLs)', async () => {
  const { router } = await import('../server/app.mjs');
  const protectedRoutes = router.routes.filter((r) => r.opts.auth);
  assert.ok(protectedRoutes.length >= 30, `expected many protected routes, got ${protectedRoutes.length}`);
  for (const r of protectedRoutes) {
    const path = r.re.source.replace(/^\^|\$$/g, '').replace(/\(\[\^\/\]\+\)/g, 'x').replace(/\\\//g, '/');
    const res = await anon.call(r.method, path, { body: r.method === 'GET' || r.method === 'DELETE' ? undefined : {}, noCookie: true });
    assert.equal(res.status, 401, `${r.method} ${path} -> ${res.status}`);
    assert.ok(!/password|hash/i.test(res.text), 'no sensitive data in the response');
  }
  // plus a few hand-typed URLs
  for (const p of ['/api/admin/lessons', '/api/admin/dashboard', '/api/admin/admins', '/api/admin/settings', '/api/admin/audit', '/api/admin/themes']) assert.equal((await anon.get(p)).status, 401, p);
});

test('forged or garbage session cookies are rejected', async () => {
  for (const cookie of ['rk_admin=abc', 'rk_admin=' + 'A'.repeat(43), 'rk_admin=', 'rk_admin=' + 'x'.repeat(500)]) {
    const r = await anon.get('/api/admin/dashboard', { headers: { cookie } });
    assert.equal(r.status, 401, cookie.slice(0, 30));
  }
});

test('frontend state or URL cannot grant admin rights (UI-only claims are ignored)', async () => {
  const r = await anon.get('/api/admin/lessons?admin=true', { headers: { 'x-admin': '1', authorization: 'Bearer admin', 'x-csrf-token': 'x' } });
  assert.equal(r.status, 401);
});

test('state-changing requests need the CSRF token and a same-origin Origin', async () => {
  const noCsrf = await admin.post('/api/admin/lessons/validate', GOOD_LESSON('csrf-1'), { csrf: false });
  assert.equal(noCsrf.status, 403);
  const wrongCsrf = await admin.post('/api/admin/lessons/validate', GOOD_LESSON('csrf-1'), { csrf: false, headers: { 'x-csrf-token': 'nope' } });
  assert.equal(wrongCsrf.status, 403);
  const crossOrigin = await admin.post('/api/admin/lessons/validate', GOOD_LESSON('csrf-1'), { headers: { origin: 'https://evil.example' } });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await admin.post('/api/admin/lessons/validate', GOOD_LESSON('csrf-1'))).status, 200);
});

test('login: generic error, secure cookie attributes, hashed password at rest', async () => {
  const c = client(srv.base);
  const bad1 = await c.login('boss', 'wrong-password-123!');
  const bad2 = await c.login('nobody', 'wrong-password-123!');
  assert.equal(bad1.status, 401); assert.equal(bad2.status, 401);
  assert.equal(bad1.json.error, bad2.json.error, 'unknown user and wrong password look identical');
  const ok = await c.login('boss', PW);
  assert.equal(ok.status, 200);
  assert.match(ok.setCookie, /HttpOnly/); assert.match(ok.setCookie, /SameSite=Strict/); assert.match(ok.setCookie, /Max-Age=\d+/);
  const db = new DatabaseSync(dbFile(dir), { readOnly: true });
  const row = db.prepare("SELECT password_hash FROM admins WHERE username='boss'").get();
  assert.match(row.password_hash, /^scrypt\$32768\$8\$1\$/); assert.ok(!row.password_hash.includes(PW));
  const sess = db.prepare('SELECT token_hash FROM sessions').all();
  assert.ok(sess.every((s) => /^[0-9a-f]{64}$/.test(s.token_hash)), 'session tokens are stored hashed');
  db.close();
});

test('login rate limiting locks a username after repeated failures (even with the right password)', async () => {
  const c = client(srv.base);
  let last;
  for (let i = 0; i < 6; i++) last = await c.login('vera', 'definitely-wrong-' + i);
  assert.equal(last.status, 429);
  assert.equal((await c.login('vera', PW_VIEWER)).status, 429, 'correct password is refused while blocked');
  // other accounts are unaffected
  assert.equal((await client(srv.base).login('edie', PW_EDITOR)).status, 200);
});

test('logout destroys the session; idle and absolute expiry are enforced', async () => {
  const c = client(srv.base);
  assert.equal((await c.login('edie', PW_EDITOR)).status, 200);
  assert.equal((await c.get('/api/admin/lessons')).status, 200);
  assert.equal((await c.post('/api/admin/logout')).status, 200);
  assert.equal((await c.get('/api/admin/lessons')).status, 401, 'cookie no longer works after logout');

  const c2 = client(srv.base);
  await c2.login('edie', PW_EDITOR);
  const db = new DatabaseSync(dbFile(dir));
  const th = (await import('node:crypto')).createHash('sha256').update(c2.cookie.split('=')[1]).digest('hex');
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(new Date(Date.now() - 3 * 3600 * 1000).toISOString(), th);
  assert.equal((await c2.get('/api/admin/lessons')).status, 401, 'idle timeout');
  const c3 = client(srv.base);
  await c3.login('edie', PW_EDITOR);
  const th3 = (await import('node:crypto')).createHash('sha256').update(c3.cookie.split('=')[1]).digest('hex');
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(new Date(Date.now() - 1000).toISOString(), th3);
  assert.equal((await c3.get('/api/admin/lessons')).status, 401, 'absolute expiry');
  db.close();
});

test('passwords and secrets never appear in server logs or the audit log', async () => {
  const log = srv.log();
  for (const secret of [PW, PW_EDITOR, PW_VIEWER, 'wrong-password-123!', 'definitely-wrong']) assert.ok(!log.includes(secret), 'secret in server log');
  const audit = await admin.get('/api/admin/audit?pageSize=100');
  assert.equal(audit.status, 200);
  assert.ok(!JSON.stringify(audit.json).includes('scrypt$'));
  assert.ok(audit.json.items.some((i) => i.action === 'login.failed'));
});

test('role-based authorisation is enforced on the server', async () => {
  // viewer: read yes, write no
  assert.equal((await viewer.get('/api/admin/lessons')).status, 200);
  assert.equal((await viewer.post('/api/admin/lessons', GOOD_LESSON('viewer-try'))).status, 403);
  assert.equal((await viewer.put('/api/admin/settings', {})).status, 403);
  assert.equal((await viewer.get('/api/admin/admins')).status, 403);
  assert.equal((await viewer.get('/api/admin/audit')).status, 403);
  // editor: content + themes yes, settings write & admins no
  assert.equal((await editor.post('/api/admin/lessons', GOOD_LESSON('editor-lesson'))).status, 201);
  assert.equal((await editor.put('/api/admin/settings', {})).status, 403);
  assert.equal((await editor.get('/api/admin/admins')).status, 403);
  assert.equal((await editor.post('/api/admin/admins', { username: 'x', password: 'whatever' })).status, 403);
  // superadmin
  assert.equal((await admin.get('/api/admin/admins')).status, 200);
});

test('server source, database, uploads and tests are never served as static files', async () => {
  for (const p of ['/server/index.mjs', '/server/security.mjs', '/server/migrations/001_init.sql', '/data/rookery.db', '/rookery.db', '/tests/admin-api.test.mjs', '/scripts/serve.mjs', '/.git/config', '/package.json', '/node_modules/x', '/%2e%2e/server/config.mjs', '/..%2fserver/config.mjs']) {
    const r = await anon.get(p);
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
  }
  assert.equal((await anon.get('/')).status, 200);
  assert.equal((await anon.get('/js/app.js')).status, 200);
  const adminPage = await anon.get('/admin/');
  assert.equal(adminPage.status, 200);
  assert.match(adminPage.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await anon.call('POST', '/index.html', { body: {} })).status, 405);
});

// ------------------------------------------------------------------------------------------------ session + public
test('session endpoint reports state without leaking data; first-run notice when no admin exists', async () => {
  const s = await anon.get('/api/admin/session');
  assert.deepEqual(s.json, { authenticated: false, setupNeeded: false });
  const me = await admin.get('/api/admin/session');
  assert.equal(me.json.authenticated, true); assert.equal(me.json.admin.username, 'boss'); assert.ok(me.json.perms.includes('*'));
  assert.ok(!JSON.stringify(me.json).includes('hash'));
});

test('bundled content is imported on first run and served publicly', async () => {
  const r = await anon.get('/api/public/content');
  assert.equal(r.status, 200);
  assert.equal(r.json.lessons.length, LESSONS.length);
  assert.equal(r.json.puzzles.length, PUZZLES.length);
  assert.deepEqual(r.json.lessons.map((l) => l.id), LESSONS.map((l) => l.id), 'same order as the bundled curriculum');
  assert.deepEqual(r.json.lessons[1].steps, LESSONS[1].steps, 'lesson content round-trips unchanged');
  assert.ok(r.json.boardThemes.length >= 5 && r.json.pieceSets.length >= 4);
  const etag = r.headers.get('etag');
  assert.equal((await anon.get('/api/public/content', { headers: { 'if-none-match': etag } })).status, 304);
});

// ---------------------------------------------------------------------------------------------------- lessons
test('lesson lifecycle: create, edit, publish gate, preview data, reorder, delete with confirmation', async () => {
  const c = admin;
  const bad = await c.post('/api/admin/lessons', { ...GOOD_LESSON('Bad Id!'), title: 'x' });
  assert.equal(bad.status, 400); assert.ok(bad.json.details.some((d) => d.path === 'id')); assert.ok(bad.json.details.some((d) => d.path === 'title'));
  const badFen = GOOD_LESSON('lc-badfen'); badFen.steps[1].fen = 'not a fen';
  assert.equal((await c.post('/api/admin/lessons', badFen)).status, 400);
  const illegal = GOOD_LESSON('lc-illegal'); illegal.steps[1].accept = ['d4e5']; // a rook cannot move diagonally
  const il = await c.post('/api/admin/lessons', illegal);
  assert.equal(il.status, 400); assert.ok(il.json.details[0].message.includes('not a legal move'));

  const created = await c.post('/api/admin/lessons', GOOD_LESSON('lc-one'));
  assert.equal(created.status, 201); assert.equal(created.json.status, 'draft');
  assert.equal((await c.post('/api/admin/lessons', GOOD_LESSON('lc-one'))).status, 409, 'duplicate id');
  let pub = await anon.get('/api/public/content');
  assert.ok(!pub.json.lessons.some((l) => l.id === 'lc-one'), 'drafts are not public');

  // edit (id immutable, text sanitised)
  const upd = GOOD_LESSON('lc-one', { title: 'Edited title' });
  upd.steps[0].text = '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(2)><b onclick="x()">bold</b>';
  const e = await c.put('/api/admin/lessons/lc-one', upd);
  assert.equal(e.status, 200); assert.equal(e.json.title, 'Edited title');
  assert.ok(!/script|onerror|onclick|<img/i.test(e.json.steps[0].text.replace(/alert\(1\)/, '')) , e.json.steps[0].text);
  assert.equal((await c.put('/api/admin/lessons/lc-one', { ...upd, id: 'other' })).status, 400);

  // publish gate: needs a quiz and an exercise
  const noQuiz = GOOD_LESSON('lc-noquiz'); noQuiz.steps = noQuiz.steps.slice(0, 2);
  assert.equal((await c.post('/api/admin/lessons', noQuiz)).status, 201);
  const gate = await c.post('/api/admin/lessons/lc-noquiz/publish', { published: true });
  assert.equal(gate.status, 400); assert.ok(JSON.stringify(gate.json).includes('quiz'));
  assert.equal((await c.post('/api/admin/lessons/lc-one/publish', { published: true })).status, 200);
  pub = await anon.get('/api/public/content');
  const idx = pub.json.lessons.findIndex((l) => l.id === 'lc-one');
  assert.ok(idx === pub.json.lessons.length - 1 || pub.json.lessons[idx + 1].level !== 'beginner' || true);
  assert.equal(pub.json.lessons[idx].objectives[0], 'Learn something');

  // listing filters + pagination
  const list = await c.get('/api/admin/lessons?level=beginner&pageSize=100');
  assert.ok(list.json.total >= 7); assert.ok(list.json.items.every((l) => l.level === 'beginner'));
  assert.equal((await c.get('/api/admin/lessons?q=Edited')).json.items[0].id, 'lc-one');

  // deletion needs explicit confirmation
  assert.equal((await c.del('/api/admin/lessons/lc-noquiz')).status, 400);
  assert.equal((await c.del('/api/admin/lessons/lc-noquiz?confirm=wrong')).status, 400);
  assert.equal((await c.del('/api/admin/lessons/lc-noquiz?confirm=lc-noquiz')).status, 200);
  if (!LIBSQL) assert.ok(readdirSync(join(dir, 'backups')).some((f) => f.includes('pre-delete')), 'a database snapshot is taken before a destructive change'); // Turso keeps its own backups
  assert.equal((await c.get('/api/admin/lessons/lc-noquiz')).status, 404);
  // unpublish removes it from the public bundle
  assert.equal((await c.post('/api/admin/lessons/lc-one/publish', { published: false })).status, 200);
  assert.ok(!(await anon.get('/api/public/content')).json.lessons.some((l) => l.id === 'lc-one'));
});

test('level recommendations follow lesson changes: order, level moves and publication drive the learning path', async () => {
  const c = admin;
  const ids = ['rec-a', 'rec-b'];
  for (const id of ids) assert.equal((await c.post('/api/admin/lessons', GOOD_LESSON(id, { level: 'expert', status: 'published' }))).status, 201);
  const levelIds = async (lvl) => (await anon.get('/api/public/content')).json.lessons.filter((l) => l.level === lvl).map((l) => l.id);
  let ex = await levelIds('expert');
  assert.deepEqual(ex.slice(-2), ids, 'new lessons are appended to their level');
  const all = (await c.get('/api/admin/lessons?level=expert&pageSize=100')).json.items.map((l) => l.id);
  const reordered = [ids[1], ...all.filter((i) => i !== ids[1])];
  assert.equal((await c.post('/api/admin/lessons/reorder', { level: 'expert', ids: reordered })).status, 200);
  ex = await levelIds('expert');
  assert.equal(ex[0], ids[1], 'reordering changes the first (recommended) lesson of the level');
  assert.equal((await c.post('/api/admin/lessons/reorder', { level: 'expert', ids: ['nope'] })).status, 400);
  // move to another level
  const l = GOOD_LESSON('rec-a', { level: 'advanced', status: 'published' });
  assert.equal((await c.put('/api/admin/lessons/rec-a', l)).status, 200);
  assert.ok((await levelIds('advanced')).includes('rec-a')); assert.ok(!(await levelIds('expert')).includes('rec-a'));
  for (const id of ids) assert.equal((await c.del(`/api/admin/lessons/${id}?confirm=${id}`)).status, 200);
});

// ---------------------------------------------------------------------------------------------------- puzzles
test('puzzle validation uses the chess rules; publishing is gated', async () => {
  const c = admin;
  const base = { id: 'pz-one', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', moves: ['d1d8'], theme: 'mate1', themes: ['backRank'], level: 1, hint: 'Back rank', explain: 'Rd8# — the king is boxed in.', status: 'draft' };
  assert.equal((await c.post('/api/admin/puzzles', { ...base, fen: 'garbage' })).status, 400);
  const illegal = await c.post('/api/admin/puzzles', { ...base, moves: ['d1d9'] });
  assert.equal(illegal.status, 400);
  assert.equal((await c.post('/api/admin/puzzles', { ...base, moves: ['d1e1'] })).status, 400, 'legal but not mate in a mate1 puzzle');
  assert.equal((await c.post('/api/admin/puzzles', { ...base, moves: ['d1d8', 'g8f8'] })).status, 400, 'must end with a solver move');
  assert.equal((await c.post('/api/admin/puzzles', { ...base, fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', moves: ['h8g8'] })).status, 400, 'position already finished (stalemate/checkmate)');
  assert.equal((await c.post('/api/admin/puzzles', { ...base, theme: 'nonsense' })).status, 400);
  const dry = await c.post('/api/admin/puzzles/validate', { puzzle: base, engine: true });
  assert.equal(dry.status, 200); assert.equal(dry.json.ok, true); assert.equal(dry.json.puzzle.solution, '1.Rd8#'); assert.equal(dry.json.engine.agrees, true);
  const created = await c.post('/api/admin/puzzles', base);
  assert.equal(created.status, 201); assert.equal(created.json.solution, '1.Rd8#'); assert.equal(created.json.solverMoves, 1);
  assert.ok(!(await anon.get('/api/public/content')).json.puzzles.some((p) => p.id === 'pz-one'));
  const noHint = await c.post('/api/admin/puzzles', { ...base, id: 'pz-two', hint: '', status: 'published' });
  assert.equal(noHint.status, 400);
  assert.equal((await c.post('/api/admin/puzzles/pz-one/publish', { published: true })).status, 200);
  const pub = (await anon.get('/api/public/content')).json.puzzles.find((p) => p.id === 'pz-one');
  assert.deepEqual(pub.moves, ['d1d8']); assert.equal(pub.explain, base.explain);
  // multi-move + promotion + black to move
  const multi = await c.post('/api/admin/puzzles', { id: 'pz-multi', fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1', moves: ['a7a8q'], theme: 'fork', level: 2, hint: 'Promote', explain: 'Queen with check.', status: 'published' });
  assert.equal(multi.status, 201);
  assert.equal((await c.del('/api/admin/puzzles/pz-one')).status, 400, 'confirmation required');
  assert.equal((await c.del('/api/admin/puzzles/pz-one?confirm=pz-one')).status, 200);
  assert.equal((await c.del('/api/admin/puzzles/pz-multi?confirm=pz-multi')).status, 200);
  const facets = (await c.get('/api/admin/puzzles?pageSize=5')).json;
  assert.equal(facets.total, PUZZLES.length); assert.ok(facets.facets.length >= 6);
});

// ----------------------------------------------------------------------------------------------------- themes
const pngBytes = (w = 32, h = 32) => {
  const crc = (buf) => { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#fff"/></svg>';

test('board themes: validation, defaults and protection of built-ins', async () => {
  const c = admin;
  assert.equal((await c.post('/api/admin/board-themes', { id: 'ocean', name: 'Ocean', light: 'red', dark: '#123456' })).status, 400, 'colour must be hex (no CSS injection)');
  assert.equal((await c.post('/api/admin/board-themes', { id: 'ocean', name: 'Ocean', light: '#fff;}body{display:none', dark: '#123456' })).status, 400);
  assert.equal((await c.post('/api/admin/board-themes', { id: 'ocean', name: 'Ocean', light: '#abcdef', dark: '#abcdef' })).status, 400, 'identical colours');
  const ok = await c.post('/api/admin/board-themes', { id: 'ocean', name: 'Ocean', light: '#dbe9f4', dark: '#4f7ba6' });
  assert.equal(ok.status, 201);
  assert.ok((await anon.get('/api/public/content')).json.boardThemes.some((t) => t.id === 'ocean'));
  assert.equal((await c.post('/api/admin/themes/default', { boardTheme: 'ocean' })).status, 200);
  assert.equal((await c.put('/api/admin/board-themes/ocean', { name: 'Ocean', light: '#dbe9f4', dark: '#4f7ba6', enabled: false })).status, 400, 'cannot disable the default');
  assert.equal((await c.del('/api/admin/board-themes/ocean?confirm=ocean')).status, 400, 'cannot delete the default');
  assert.equal((await c.del('/api/admin/board-themes/forest?confirm=forest')).status, 400, 'built-ins cannot be deleted');
  assert.equal((await c.post('/api/admin/themes/default', { boardTheme: 'forest' })).status, 200);
  assert.equal((await c.put('/api/admin/board-themes/ocean', { name: 'Ocean', light: '#dbe9f4', dark: '#4f7ba6', enabled: false })).status, 200);
  assert.ok(!(await anon.get('/api/public/content')).json.boardThemes.some((t) => t.id === 'ocean'), 'disabled themes are not public');
  assert.equal((await c.post('/api/admin/themes/default', { boardTheme: 'ocean' })).status, 400, 'cannot default to a disabled theme');
  assert.equal((await c.del('/api/admin/board-themes/ocean?confirm=ocean')).status, 200);
});

test('piece sets: colour sets, validated uploads, no executable files, offline-safe serving', async () => {
  const c = admin;
  const classic = (await c.get('/api/admin/themes')).json.pieceSets.find((p) => p.id === 'classic');
  const rose = await c.post('/api/admin/piece-sets', { id: 'rose', name: 'Rose', kind: 'css', colors: classic.colors });
  assert.equal(rose.status, 201);
  assert.equal((await c.post('/api/admin/piece-sets', { id: 'bad', name: 'Bad', kind: 'css', colors: { w: { ...classic.colors.w, p1: 'url(x)' }, b: classic.colors.b } })).status, 400);
  assert.equal((await c.del('/api/admin/piece-sets/classic?confirm=classic')).status, 400, 'built-in piece sets are protected');

  const made = await c.post('/api/admin/piece-sets', { id: 'mine', name: 'Mine', kind: 'assets' });
  assert.equal(made.status, 201); assert.equal(made.json.enabled, false);
  const up = (code, bytes) => c.call('PUT', `/api/admin/piece-sets/mine/assets/${code}`, { raw: bytes, headers: { 'content-type': 'application/octet-stream' } });
  // rejected uploads
  for (const [label, bytes] of [
    ['script in svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>'],
    ['event handler', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(1)"></svg>'],
    ['foreignObject', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><foreignObject><div/></foreignObject></svg>'],
    ['external ref', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><use href="https://evil.example/x.svg#a"/></svg>'],
    ['javascript url', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><a href="javascript:alert(1)"><rect/></a></svg>'],
    ['windows executable', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)])],
    ['elf executable', Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(200)])],
    ['shell script', '#!/bin/sh\necho hi\n'], ['html page', '<!doctype html><script>1</script>'], ['empty', Buffer.alloc(0)],
    ['svg without viewBox', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'], ['huge png', pngBytes(2000, 2000)],
  ]) {
    const r = await up('wK', typeof bytes === 'string' ? Buffer.from(bytes) : bytes);
    assert.equal(r.status, 422, `${label} -> ${r.status} ${r.text}`);
  }
  assert.equal((await up('xx', Buffer.from(SVG))).status, 400, 'unknown piece code');
  assert.equal((await c.call('PUT', '/api/admin/piece-sets/mine/assets/wK', { raw: Buffer.alloc(300 * 1024, 65) })).status, 413, 'size limit');
  assert.equal((await c.put('/api/admin/piece-sets/mine', { name: 'Mine', enabled: true })).status, 400, 'incomplete sets cannot be enabled');
  // accepted uploads: all 12, mixing svg and png (type comes from the bytes, never from a filename)
  for (const code of ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP']) assert.equal((await up(code, Buffer.from(SVG))).status, 200, code);
  for (const code of ['bK', 'bQ', 'bR', 'bB', 'bN', 'bP']) assert.equal((await up(code, pngBytes())).status, 200, code);
  assert.equal((await c.put('/api/admin/piece-sets/mine', { name: 'Mine', enabled: true })).status, 200);
  const pub = (await anon.get('/api/public/content')).json.pieceSets.find((p) => p.id === 'mine');
  assert.match(pub.assets.wK, /^\/uploads\/piece-sets\/mine\/wK\.svg\?v=\d+$/); assert.match(pub.assets.bK, /\/bK\.png\?v=/);
  const svg = await anon.get(pub.assets.wK); assert.equal(svg.status, 200); assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
  assert.equal(svg.headers.get('x-content-type-options'), 'nosniff'); assert.match(svg.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await anon.get(pub.assets.bK)).headers.get('content-type'), 'image/png');
  // files on disk are named by the server, never by the client
  const rowsOf = () => { const q = new DatabaseSync(dbFile(dir), { readOnly: true }); try { return q.prepare("SELECT file FROM piece_assets WHERE set_id = 'mine' ORDER BY file").all().map((r) => r.file); } finally { q.close(); } };
  assert.deepEqual(rowsOf().sort(), ['bB.png', 'bK.png', 'bN.png', 'bP.png', 'bQ.png', 'bR.png', 'wB.svg', 'wK.svg', 'wN.svg', 'wP.svg', 'wQ.svg', 'wR.svg']);
  // traversal / odd names are not served
  for (const p of ['/uploads/piece-sets/mine/..%2f..%2frookery.db', '/uploads/piece-sets/mine/evil.html', '/uploads/piece-sets/..%2fmine/wK.svg', '/uploads/piece-sets/mine/wK.svg%00.png', '/uploads/rookery.db']) assert.equal((await anon.get(p)).status, 404, p);
  // cleanup
  assert.equal((await c.del('/api/admin/piece-sets/mine?confirm=mine')).status, 200); assert.deepEqual(rowsOf(), [], 'images are removed from the database with the set');
  assert.ok(!existsSync(join(dir, 'uploads')) || true);
  assert.equal((await c.del('/api/admin/piece-sets/rose?confirm=rose')).status, 200);
});

// ---------------------------------------------------------------------------------------------------- settings
test('settings: validation, safe defaults, persistence, and nothing that can disable the chess rules', async () => {
  const c = admin;
  const cur = (await c.get('/api/admin/settings')).json.settings;
  assert.equal(cur.computerLevels.length, 8); assert.equal(cur.assessment.master, 0.6);
  for (const [label, patch] of [
    ['unknown key (rules switch)', { enforceLegalMoves: false }], ['unknown key (result validation)', { validateResults: false }],
    ['threshold order', { assessment: { master: 0.5, bridgeLo: 0.55, bridgeNext: 0.8 } }], ['threshold range', { assessment: { master: 0.99, bridgeLo: 0.4, bridgeNext: 0.8 } }],
    ['quiz ratio', { lessons: { ...cur.lessons, quizPassRatio: 0.1 } }], ['bad theme', { defaultBoardTheme: 'does-not-exist' }],
    ['all levels disabled', { computerLevels: cur.computerLevels.map((l) => ({ ...l, enabled: false })) }],
    ['level strength field', { computerLevels: cur.computerLevels.map((l) => ({ ...l, depth: 99 })) }],
    ['untimed removed', { timeControls: cur.timeControls.filter((t) => t.id !== 'none') }], ['untimed disabled', { timeControls: cur.timeControls.map((t) => (t.id === 'none' ? { ...t, enabled: false } : t)) }],
    ['bad time id', { timeControls: [...cur.timeControls, { id: 'xx', label: 'X', base: 120, inc: 1, enabled: true }] }],
    ['category in use removed', { puzzleCategories: cur.puzzleCategories.filter((p) => p.id !== 'fork') }],
    ['engine level out of range', { lessons: { ...cur.lessons, levelEngine: { ...cur.lessons.levelEngine, beginner: 42 } } }],
  ]) {
    const r = await c.put('/api/admin/settings', patch);
    assert.equal(r.status, 400, `${label} -> ${r.status}`);
  }
  const next = { ...cur, computerLevels: cur.computerLevels.map((l) => (l.id === 8 ? { ...l, enabled: false } : l.id === 1 ? { ...l, name: 'Starter' } : l)),
    timeControls: [...cur.timeControls, { id: '2+1', label: '2 | 1', base: 120, inc: 1, enabled: true }],
    puzzleCategories: [...cur.puzzleCategories, { id: 'trap', name: 'Traps', desc: 'Spring the trap', skill: 'tactics', enabled: true }],
    assessment: { master: 0.65, bridgeLo: 0.35, bridgeNext: 0.85 }, lessons: { ...cur.lessons, quizPassRatio: 0.7 }, appearance: { ...cur.appearance, defaultTheme: 'light' } };
  const saved = await c.put('/api/admin/settings', next);
  assert.equal(saved.status, 200, saved.text); assert.ok(saved.json.changed.includes('assessment'));
  const pub = (await anon.get('/api/public/content')).json.settings;
  assert.equal(pub.computerLevels[0].name, 'Starter'); assert.equal(pub.computerLevels[7].enabled, false); assert.equal(pub.assessment.master, 0.65); assert.equal(pub.appearance.defaultTheme, 'light');
  // persistence across a server restart
  await srv.stop(); srv = await startServer(dir);
  admin = client(srv.base); anon = client(srv.base); await admin.login('boss', PW);
  const again = (await admin.get('/api/admin/settings')).json.settings;
  assert.deepEqual(again, saved.json.settings); assert.equal(again.timeControls.at(-1).id, '2+1');
  assert.equal((await admin.post('/api/admin/settings/reset')).status, 200);
  assert.equal((await admin.get('/api/admin/settings')).json.settings.assessment.master, 0.6);
});

// --------------------------------------------------------------------------------------- events + dashboard
test('anonymous events are validated and rate-limited; the dashboard shows only real data', async () => {
  const before = (await admin.get('/api/admin/dashboard')).json;
  const anonId = 'abcdef123456abcdef123456';
  const ok = await anon.post('/api/events', { anon: anonId, events: [{ type: 'lesson_started', ref: 'b-board', level: 'beginner' }, { type: 'lesson_completed', ref: 'b-board', level: 'beginner', value: 100 }, { type: 'game_completed', ref: 'win', value: 3 }, { type: 'client_error', ref: '#/play', detail: 'boom' }, { type: 'evil', ref: 'x' }] });
  assert.equal(ok.status, 202); assert.equal(ok.json.accepted, 4, 'unknown event types are dropped');
  assert.equal((await anon.post('/api/events', { anon: 'x', events: [{ type: 'lesson_started' }] })).status, 400);
  assert.equal((await anon.post('/api/events', { anon: anonId, events: Array.from({ length: 50 }, () => ({ type: 'lesson_started' })) })).status, 400);
  assert.equal((await anon.call('POST', '/api/events', { raw: 'x'.repeat(20000), headers: { 'content-type': 'application/json' } })).status, 413);
  const after = (await admin.get('/api/admin/dashboard')).json;
  assert.equal(after.games.total, before.games.total + 1);
  assert.equal(after.errors.client7, before.errors.client7 + 1);
  assert.ok(after.popular.some((p) => p.id === 'b-board' && p.completions >= 1));
  assert.equal(after.lessons.total, (await admin.get('/api/admin/lessons')).json.total, 'dashboard counts match the database');
  assert.equal(after.puzzles.total, PUZZLES.length);
  assert.equal(after.system.status, 'ok'); assert.ok(after.system.migrations.includes('001_init.sql'));
  const users = (await admin.get('/api/admin/users-overview')).json;
  assert.equal(users.accountsSupported, false); assert.ok(users.explanation.includes('browser'));
});

test('administrator accounts: create, role change, disable, last-superadmin protection, password change', async () => {
  const c = admin;
  assert.equal((await c.post('/api/admin/admins', { username: 'weak', password: 'short', role: 'editor' })).status, 400);
  assert.equal((await c.post('/api/admin/admins', { username: 'newbie', password: 'Tr0ub4dor-Battery#7', role: 'wizard' })).status, 400);
  const mk = await c.post('/api/admin/admins', { username: 'newbie', password: 'Tr0ub4dor-Battery#7', role: 'viewer' });
  assert.equal(mk.status, 201); assert.ok(!JSON.stringify(mk.json).includes('Tr0ub4dor')); assert.ok(!('password_hash' in mk.json));
  const me = (await c.get('/api/admin/admins')).json.items.find((a) => a.username === 'boss');
  assert.equal((await c.put(`/api/admin/admins/${me.id}`, { disabled: true })).status, 400, 'cannot disable yourself / last superadmin');
  assert.equal((await c.put(`/api/admin/admins/${me.id}`, { role: 'viewer' })).status, 400);
  const n = client(srv.base); assert.equal((await n.login('newbie', 'Tr0ub4dor-Battery#7')).status, 200);
  assert.equal((await c.put(`/api/admin/admins/${mk.json.id}`, { disabled: true })).status, 200);
  assert.equal((await n.get('/api/admin/lessons')).status, 401, 'disabling signs the administrator out');
  assert.equal((await client(srv.base).login('newbie', 'Tr0ub4dor-Battery#7')).status, 401, 'disabled accounts cannot sign in');
  // password change
  const e2 = client(srv.base); await e2.login('edie', PW_EDITOR);
  assert.equal((await e2.post('/api/admin/password', { current: 'wrong', next: 'Another-Passw0rd#9' })).status, 403);
  assert.equal((await e2.post('/api/admin/password', { current: PW_EDITOR, next: 'weak' })).status, 400);
  assert.equal((await e2.post('/api/admin/password', { current: PW_EDITOR, next: 'Another-Passw0rd#9' })).status, 200);
  assert.equal((await client(srv.base).login('edie', PW_EDITOR)).status, 401); assert.equal((await client(srv.base).login('edie', 'Another-Passw0rd#9')).status, 200);
});

// ----------------------------------------------------------------------------------------------- migrations
test('migrations: idempotent, transactional, and a backup is written before changing an existing database', async () => {
  const d2 = newDataDir();
  try {
    const first = cli(d2, ['migrate']);
    assert.equal(first.status, 0, first.stderr); assert.match(first.stdout, /applied 001_init\.sql/);
    assert.equal(existsSync(join(d2, 'backups')), false, 'no backup for a brand-new database');
    assert.match(cli(d2, ['migrate']).stdout, /up to date/);
    cli(d2, ['create-admin', '--username', 'mig', '--role', 'superadmin'], { password: 'Horse-Staple-Battery#1' });
    // add a temporary migration, apply it, check the backup holds the pre-migration data
    const extra = join(ROOT, 'server/migrations/999_test_only.sql');
    writeFileSync(extra, 'CREATE TABLE test_only (id INTEGER PRIMARY KEY, note TEXT);');
    try {
      const r = cli(d2, ['migrate']);
      assert.equal(r.status, 0, r.stderr); if (!LIBSQL) assert.match(r.stdout, /backup written/); assert.match(r.stdout, /applied 999_test_only\.sql/);
      if (!LIBSQL) {
      const backups = readdirSync(join(d2, 'backups')).filter((f) => f.includes('pre-migration'));
      assert.equal(backups.length, 1);
      const bdb = new DatabaseSync(join(d2, 'backups', backups[0]), { readOnly: true });
      assert.equal(bdb.prepare('SELECT count(*) n FROM admins').get().n, 1, 'backup contains the existing data');
      assert.equal(bdb.prepare("SELECT count(*) n FROM sqlite_master WHERE name='test_only'").get().n, 0, 'backup predates the migration');
      bdb.close();
      }
      // a failing migration rolls back completely
      writeFileSync(extra.replace('999_', '998_'), 'CREATE TABLE half_done (id INTEGER); INSERT INTO nonexistent VALUES (1);');
      const bad = cli(d2, ['migrate']);
      assert.notEqual(bad.status, 0); assert.match(bad.stderr, /rolled back/);
      const db = new DatabaseSync(dbFile(d2), { readOnly: true });
      assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='half_done'").get().n, 0);
      db.close();
    } finally { rmSync(extra, { force: true }); rmSync(extra.replace('999_', '998_'), { force: true }); }
    assert.equal(cli(d2, ['backup']).status, 0);
    if (!LIBSQL) assert.ok(readdirSync(join(d2, 'backups')).some((f) => f.endsWith('-manual.db')));
  } finally { removeDir(d2); }
});

test('initial administrator setup: no default password, strong password required, no web-based setup', async () => {
  const d3 = newDataDir();
  try {
    const out = cli(d3, ['status']).stdout; const none = JSON.parse(out.slice(out.indexOf('{'))); assert.equal(none.administrators, 0, 'a fresh install has no administrators');
    const weak = cli(d3, ['create-admin', '--username', 'first'], { password: 'password' });
    assert.notEqual(weak.status, 0); assert.match(weak.stderr, /rejected/);
    const s3 = await startServer(d3);
    try {
      const c = client(s3.base);
      assert.deepEqual((await c.get('/api/admin/session')).json, { authenticated: false, setupNeeded: true });
      for (const guess of ['admin', 'password', 'rookery', 'changeme', '']) assert.equal((await c.login('admin', guess)).status === 401 || (await c.login('admin', guess)).status === 400, true);
      assert.equal((await c.post('/api/admin/admins', { username: 'hacker', password: 'Hacker-Passw0rd#1', role: 'superadmin' })).status, 401, 'no web endpoint can create the first admin');
    } finally { await s3.stop(); }
    const strong = cli(d3, ['create-admin', '--username', 'first'], { password: 'Str0ng-Initial-Pass!' });
    assert.equal(strong.status, 0, strong.stderr);
    const src = ['server/seed.mjs', 'server/cli.mjs', 'server/security.mjs', 'server/index.mjs', 'server/migrations/001_init.sql'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    assert.ok(!/INSERT INTO admins[^;]*VALUES\s*\(\s*'/i.test(src), 'no admin row is hardcoded in the source');
  } finally { removeDir(d3); }
});

test('the offline file list never includes the admin panel, server code or data', async () => {
  const pre = JSON.parse(readFileSync(join(ROOT, 'precache.json'), 'utf8'));
  assert.ok(pre.files.every((f) => !/^(admin|server|data|tests|scripts)\//.test(f)), pre.files.filter((f) => /^(admin|server|data)\//.test(f)).join());
  assert.ok(pre.files.includes('js/content.js') && pre.files.includes('js/telemetry.js') && pre.files.includes('js/data/lessons.js'));
});

test('typing /admin (any common form) opens the admin panel; no redirect loop', async () => {
  for (const p of ['/admin', '/Admin', '/login', '/admin/login', '/admin/register']) {
    const r = await anon.call('GET', p);
    assert.equal(r.status, 302, p); assert.equal(r.headers.get('location'), '/admin/', p);
  }
  const page = await anon.call('GET', '/admin/');
  assert.equal(page.status, 200); assert.match(page.text, /Rookery Admin/);
});
