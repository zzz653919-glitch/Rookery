// Integration tests for lesson/puzzle translation: localized public bundle, translation memory, auto-translation (mock provider),
// manual edits that are never overwritten, and the permission model. The real provider (Anthropic API) is NOT exercised here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, newDataDir, removeDir, cli, client } from './lib/server.mjs';
import { hashStr } from '../js/i18n/core.js';
import { LESSONS } from '../js/data/lessons.js';
import uzSeed from '../js/i18n/content.uz.js';

const PW = 'Correct-Horse-9!', PW_V = 'Viewer-Passw0rd#1';
let dir, srv, admin, viewer, plain, dir2, srv2;
const lesson = (id) => ({
  id, level: 'beginner', skill: 'rules', title: 'Custom rook lesson ' + id, summary: 'A short summary about rooks', description: '', objectives: ['Move the rook'], difficulty: 2, minutes: 5, status: 'published',
  steps: [
    { type: 'learn', title: 'The idea', text: '<p>The rook moves in <b>straight lines</b>, for example Rd4 or Rxg4.</p>', fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1', explore: true },
    { type: 'task', kind: 'move', instruction: 'Capture the pawn', fen: '7k/8/8/8/3R2p1/8/8/K7 w - - 0 1', accept: ['d4g4'], hint: 'Along the rank', explain: 'Rxg4 wins a pawn' },
    { type: 'quiz', questions: [{ kind: 'mc', q: 'How do rooks move?', options: ['Straight', 'Diagonally'], answer: 0, explain: 'Straight lines only' }] },
  ] });

before(async () => {
  dir = newDataDir();
  for (const [u, role, pw] of [['boss', 'superadmin', PW], ['vera', 'viewer', PW_V]]) assert.equal(cli(dir, ['create-admin', '--username', u, '--role', role], { password: pw }).status, 0);
  srv = await startServer(dir, { ROOKERY_TRANSLATE_PROVIDER: 'mock', ROOKERY_ALLOW_MOCK: '1' });
  admin = client(srv.base); viewer = client(srv.base); plain = client(srv.base);
  assert.equal((await admin.login('boss', PW)).status, 200);
  assert.equal((await viewer.login('vera', PW_V)).status, 200);
  // second server without any provider
  dir2 = newDataDir();
  assert.equal(cli(dir2, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: PW }).status, 0);
  srv2 = await startServer(dir2);
});
after(async () => { await srv?.stop(); await srv2?.stop(); removeDir(dir); removeDir(dir2); });

const bundle = async (lang, c = plain) => (await c.get('/api/public/content' + (lang ? `?lang=${lang}` : ''))).json;
const waitFor = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 100)); } };

test('bundled curriculum comes back translated, English stays untouched, unknown languages fall back to English', async () => {
  const en = await bundle(), uz = await bundle('uz'), ru = await bundle('ru'), xx = await bundle('xx');
  assert.equal(en.lessons.length, uz.lessons.length);
  const first = LESSONS[0];
  assert.equal(en.lessons[0].title, first.title);
  assert.equal(uz.lessons[0].title, uzSeed[hashStr(first.title)]);
  assert.notEqual(ru.lessons[0].title, first.title);
  assert.deepEqual(xx.lessons.map((l) => l.title), en.lessons.map((l) => l.title));
  // structure (ids, fens, answers) is identical, only texts change
  assert.deepEqual(uz.lessons.map((l) => l.id), en.lessons.map((l) => l.id));
  assert.equal(JSON.stringify(uz.lessons[0].steps[0].fen), JSON.stringify(en.lessons[0].steps[0].fen));
  assert.equal(uz.puzzles[0].fen, en.puzzles[0].fen); assert.deepEqual(uz.puzzles[0].moves, en.puzzles[0].moves);
});

test('ETags differ per language and revalidate with 304', async () => {
  const a = await plain.get('/api/public/content?lang=uz'), b = await plain.get('/api/public/content?lang=ru');
  assert.notEqual(a.headers.get('etag'), b.headers.get('etag'));
  const again = await plain.get('/api/public/content?lang=uz', { headers: { 'if-none-match': a.headers.get('etag') } });
  assert.equal(again.status, 304);
});

test('a new lesson is auto-translated in the background; markup and chess notation are preserved', async () => {
  const r = await admin.post('/api/admin/lessons', lesson('t-rook'));
  assert.equal(r.status, 201, r.text);
  const uz = await waitFor(async () => { const b = await bundle('uz'); const l = b.lessons.find((x) => x.id === 't-rook'); return l && l.title.startsWith('[uz] ') ? b : null; });
  const l = uz.lessons.find((x) => x.id === 't-rook');
  assert.equal(l.title, '[uz] Custom rook lesson t-rook');
  assert.match(l.steps[0].text, /^<p>\[uz\] The rook moves in <b>/, 'tags kept');
  assert.ok(l.steps[0].text.includes('Rd4') && l.steps[0].text.includes('Rxg4'), 'notation kept');
  assert.deepEqual(l.steps[1].accept, ['d4g4'], 'moves are not translated');
  assert.equal(l.steps[2].questions[0].options[0], '[uz] Straight');
  const ru = await waitFor(async () => { const b = await bundle('ru'); return b.lessons.find((x) => x.id === 't-rook').title.startsWith('[ru] ') ? b : null; });
  assert.ok(ru);
  assert.equal((await bundle()).lessons.find((x) => x.id === 't-rook').title, 'Custom rook lesson t-rook', 'English source is unchanged');
});

test('coverage report, listing and manual edits (a person\'s wording is never overwritten)', async () => {
  const st = (await admin.get('/api/admin/translations')).json;
  assert.equal(st.provider, 'mock');
  assert.ok(st.stats.every((s) => s.total > 0 && s.translated === s.total), JSON.stringify(st.stats));
  const src = 'Custom rook lesson t-rook';
  const list = (await admin.get('/api/admin/translations/entries?lang=uz&q=custom rook lesson')).json;
  const e = list.items.find((x) => x.source === src);
  assert.equal(e.origin, 'auto'); assert.equal(e.hash, hashStr(src));
  // manual edit
  const put = await admin.put('/api/admin/translations', { lang: 'uz', source: src, text: 'Maxsus rux darsi' });
  assert.equal(put.status, 200, put.text);
  assert.equal((await bundle('uz')).lessons.find((x) => x.id === 't-rook').title, 'Maxsus rux darsi');
  // editing the lesson triggers auto-translation again, but must not touch the manual text
  await admin.put('/api/admin/lessons/t-rook', { ...lesson('t-rook'), summary: 'Another summary about rooks' });
  await waitFor(async () => (await bundle('uz')).lessons.find((x) => x.id === 't-rook').summary.startsWith('[uz] '));
  assert.equal((await bundle('uz')).lessons.find((x) => x.id === 't-rook').title, 'Maxsus rux darsi');
  const after = (await admin.get('/api/admin/translations/entries?lang=uz&q=custom rook lesson')).json.items.find((x) => x.source === src);
  assert.equal(after.origin, 'manual');
  // resetting hands it back to the machine
  assert.equal((await admin.del(`/api/admin/translations?lang=uz&hash=${hashStr(src)}`)).status, 200);
  assert.equal((await admin.post('/api/admin/translations/run', { lang: 'uz', wait: true })).json.error, null);
  assert.equal((await bundle('uz')).lessons.find((x) => x.id === 't-rook').title, '[uz] ' + src);
});

test('manual translations that break the markup or the notation are refused; unsafe HTML is stripped', async () => {
  const src = 'Rxg4 wins a pawn';
  assert.equal((await admin.put('/api/admin/translations', { lang: 'ru', source: '<p>Play <b>Nf3</b></p>', text: '<p>Играйте Nc3</p>' })).status, 400);
  assert.equal((await admin.put('/api/admin/translations', { lang: 'ru', source: src, text: '   ' })).status, 400);
  assert.equal((await admin.put('/api/admin/translations', { lang: 'de', source: src, text: 'x' })).status, 400);
  const ok = await admin.put('/api/admin/translations', { lang: 'ru', source: '<p>Play <b>Nf3</b></p>', text: '<p>Играйте <b>Nf3</b><script>alert(1)</script></p>' });
  assert.equal(ok.status, 200, ok.text);
  assert.ok(!/<script/i.test(ok.json.text), 'unsafe tags are stripped before saving');
  assert.equal(ok.json.text, '<p>Играйте <b>Nf3</b>alert(1)</p>');
});

test('permissions: viewers can read but not change translations; anonymous users get nothing', async () => {
  assert.equal((await viewer.get('/api/admin/translations')).status, 200);
  assert.equal((await viewer.put('/api/admin/translations', { lang: 'uz', source: 'x y z', text: 'q' })).status, 403);
  assert.equal((await viewer.post('/api/admin/translations/run', {})).status, 403);
  assert.equal((await plain.get('/api/admin/translations')).status, 401);
  assert.equal((await plain.get('/api/admin/translations/entries?lang=uz')).status, 401);
});

test('without a provider the content is served in English and "translate now" explains why', async () => {
  const c = client(srv2.base); assert.equal((await c.login('boss', PW)).status, 200);
  const st = (await c.get('/api/admin/translations')).json;
  assert.equal(st.provider, null);
  const run = await c.post('/api/admin/translations/run', {});
  assert.equal(run.status, 400); assert.match(run.json.error, /provider/i);
  await c.post('/api/admin/lessons', lesson('t-none'));
  await new Promise((r) => setTimeout(r, 2500));
  const res = await fetch(srv2.base + '/api/public/content?lang=uz').then((r) => r.json());
  assert.equal(res.lessons.find((x) => x.id === 't-none').title, 'Custom rook lesson t-none');
  const st2 = (await c.get('/api/admin/translations')).json.stats.find((s) => s.lang === 'uz');
  assert.ok(st2.translated < st2.total, 'missing texts are reported');
});

test('the mock provider is refused unless explicitly allowed (cannot be switched on by accident)', async () => {
  const d = newDataDir();
  try {
    assert.equal(cli(d, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: PW }).status, 0);
    const s = await startServer(d, { ROOKERY_TRANSLATE_PROVIDER: 'mock' });
    try { const c = client(s.base); await c.login('boss', PW); assert.equal((await c.get('/api/admin/translations')).json.provider, null); } finally { await s.stop(); }
    const a = await startServer(d, { ROOKERY_TRANSLATE_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' });
    try { const c = client(a.base); await c.login('boss', PW); assert.equal((await c.get('/api/admin/translations')).json.provider, null, 'no key, no provider'); } finally { await a.stop(); }
  } finally { removeDir(d); }
});
