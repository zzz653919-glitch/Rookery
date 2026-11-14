// Performance measurements of the real site in a real browser: page loads, route changes, the computer opponent, the live page
// (CPU and memory while it polls), and the API response times of the real server. A mock stands in for the upstream chess services,
// the browser is throttled like a modest phone (CPU 4x slower, ~1.6 Mbit/s, 120 ms latency).
//   node tests/perf/perf.mjs [out.json] [--fast]        (--fast: no throttling)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { startServer, newDataDir, removeDir, cli, client } from '../lib/server.mjs';
import { startMock, stopMock, setLive, T0 } from '../lib/world-mock.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = process.argv.find((a) => a.endsWith('.json')) || null;
const FAST = process.argv.includes('--fast');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = 'Rook-7788-x';

// ------------------------------------------------------------------ data: a 40-board live round, finished games, users
const up = await startMock();
const names = ['Ana', 'Boris', 'Carl', 'Dina', 'Egor', 'Farid', 'Gala', 'Hugo', 'Ivan', 'Jana'];
const MOVES = '1. e4 { [%clk 1:30:00] } 1... e5 { [%clk 1:29:50] } 2. Nf3 { [%clk 1:29:40] } 2... Nc6 { [%clk 1:29:30] } 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7';
setLive(Array.from({ length: 40 }, (_, i) => `[Event "Live Open"]\n[Site "https://lichess.org/broadcast/x/round-5/LIVE0001R5/lv${String(i).padStart(6, '0')}"]\n[Date "2026.11.14"]\n[Round "5.${i + 1}"]\n[White "${names[i % 10]}${i}, Wally"]\n[Black "${names[(i + 3) % 10]}${i}, Billy"]\n[Result "*"]\n[WhiteElo "${2400 + i}"]\n[BlackElo "${2380 + i}"]\n[WhiteFideId "${3000 + i}"]\n[BlackFideId "${4000 + i}"]\n[ECO "C84"]\n[GameURL "https://lichess.org/broadcast/x/round-5/LIVE0001R5/lv${String(i).padStart(6, '0')}"]\n\n${MOVES} *\n`).join('\n'));

const dir = newDataDir();
if (cli(dir, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: 'Correct-Horse-9!' }).status) throw new Error('admin');
const srv = await startServer(dir, { ROOKERY_DB_STATS: '1', ROOKERY_WORLD_OFFLINE: '0', ROOKERY_WORLD_ALLOW_LOCAL: '1', ROOKERY_LICHESS_URL: up, ROOKERY_FIDE_API_URL: `${up}/api/fide/player`, ROOKERY_WIKI_URL: up });
const BASE = srv.base;
const admin = client(BASE); await admin.login('boss', 'Correct-Horse-9!'); await admin.put('/api/admin/world/sources/1', { enabled: false });
const reg = async (u) => { const c = client(BASE); const r = await c.post('/api/register', { username: u, password: PW }); c.cookie = r.setCookie.split(';')[0]; c.csrf = r.json.csrf; return c; };
const A = await reg('PerfA'), B = await reg('PerfB');
for (let i = 0; i < 12; i++) { // finished rated games so that profiles, leaderboards and histories have content
  const room = (await A.post('/api/games/room', { base: 180, inc: 2, rated: true, color: i % 2 ? 'w' : 'b' })).json; await B.post(`/api/games/${room.id}/join`);
  const white = i % 2 ? A : B, black = i % 2 ? B : A; await white.post(`/api/games/${room.id}/move`, { move: 'e2e4' }); await black.post(`/api/games/${room.id}/move`, { move: 'e7e5' }); await (i % 3 ? white : black).post(`/api/games/${room.id}/resign`);
}
// warm the world data (events, one finished event's games)
await fetch(BASE + '/api/world/events?status=completed'); const done = (await (await fetch(BASE + '/api/world/events?status=completed')).json()).events[0]; await fetch(BASE + `/api/world/events/${done.id}`); await fetch(BASE + '/api/world/live');
const gameId = (await (await fetch(BASE + '/api/world/games?size=1')).json()).games[0].id;

// ------------------------------------------------------------------ browser helpers
const browser = await chromium.launch();
const INIT = () => {
  window.__p = { long: 0, longN: 0, cls: 0, fcp: 0, lcp: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__p.long += e.duration; window.__p.longN++; } }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__p.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* unsupported */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__p.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch { /* unsupported */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__p.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* unsupported */ }
  try { localStorage.setItem('rk_auth_prompt', '1'); } catch { /* ignore */ }
};
async function newPage({ signedIn = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  await ctx.addInitScript(INIT);
  await ctx.route(/img\.example|image\.lichess\.org/, (r) => r.abort());
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  const net = { reqs: 0, bytes: 0, api: [] }; const started = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { net.reqs++; started.set(e.requestId, { t: e.timestamp, url: e.request.url }); });
  cdp.on('Network.loadingFinished', (e) => { net.bytes += e.encodedDataLength || 0; const s = started.get(e.requestId); if (s && /\/api\//.test(s.url)) net.api.push({ url: s.url.replace(BASE, '').split('?')[0], ms: Math.round((e.timestamp - s.t) * 1000) }); });
  if (signedIn) { await page.goto(BASE + '/#/welcome'); await page.waitForSelector('#app:not([hidden])'); await page.evaluate(async (pw) => { await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'PerfA', password: pw }) }); const { store } = await import('/js/store.js'); await store.update('profile', (x) => Object.assign(x, { onboarded: true, level: 'beginner', levelSource: 'manual' })); }, PW); }
  else { await page.goto(BASE + '/#/welcome'); await page.waitForSelector('#app:not([hidden])'); await page.evaluate(async () => { const { store } = await import('/js/store.js'); await store.update('profile', (x) => Object.assign(x, { onboarded: true, level: 'beginner', levelSource: 'manual' })); }); }
  await sleep(1500);
  return { ctx, page, cdp, net };
}
const throttle = async (cdp) => { if (FAST) return; await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: 200000, uploadThroughput: 100000 }); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); };
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const mb = (n) => Math.round(n / 1048576 * 10) / 10;

// measure: navigate (hash change in the running app, or a full load) until `ready` is true
async function measure(label, { page, cdp, net }, go, ready) { // ready: a CSS selector inside #view (the splash must be gone), or { sel } for any selector
  await throttle(cdp);
  const m0 = await metrics(cdp); const r0 = net.reqs, b0 = net.bytes, a0 = net.api.length;
  await page.evaluate(() => { window.__p.long = 0; window.__p.longN = 0; window.__t0 = performance.now(); });
  const t0 = Date.now();
  await go();
  const plain = typeof ready === 'object';
  await page.waitForFunction(([sel, any]) => (any || !document.getElementById('splash')) && !!document.querySelector((any ? '' : '#view ') + sel), [plain ? ready.sel : ready, plain], { polling: 'raf', timeout: 60000 });
  const ms = Date.now() - t0;
  await sleep(600);
  const m1 = await metrics(cdp); const p = await page.evaluate(() => window.__p);
  const apis = net.api.slice(a0);
  return { label, ms, longMs: Math.round(p.long), longN: p.longN, cls: Math.round(p.cls * 1000) / 1000, fcp: Math.round(p.fcp), lcp: Math.round(p.lcp), reqs: net.reqs - r0, kb: Math.round((net.bytes - b0) / 1024), apiN: apis.length, apiMax: Math.max(0, ...apis.map((a) => a.ms)), cpuMs: Math.round(((m1.TaskDuration || 0) - (m0.TaskDuration || 0)) * 1000), heapMB: mb(m1.JSHeapUsedSize), nodes: m1.Nodes, apis: apis.map((a) => `${a.url} ${a.ms}`).slice(0, 14) };
}
const results = [];
const add = (r) => { results.push(r); console.log(`${r.label.padEnd(34)} ${String(r.ms).padStart(6)} ms | fcp ${String(r.fcp).padStart(5)} | long ${String(r.longMs).padStart(5)} ms/${String(r.longN).padStart(2)} | cpu ${String(r.cpuMs).padStart(5)} | req ${String(r.reqs).padStart(3)} ${String(r.kb).padStart(5)} KB | api ${r.apiN}/${r.apiMax} ms | heap ${r.heapMB} MB | nodes ${r.nodes} | cls ${r.cls}`); };
const viewReady = (sel) => sel;

// ------------------------------------------------------------------ 1. first visit (empty cache) and repeat visit
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' }); await ctx.addInitScript(INIT);
  await ctx.route(/img\.example|image\.lichess\.org/, (r) => r.abort());
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  const net = { reqs: 0, bytes: 0, api: [] }; const started = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { net.reqs++; started.set(e.requestId, { t: e.timestamp, url: e.request.url }); });
  cdp.on('Network.loadingFinished', (e) => { net.bytes += e.encodedDataLength || 0; const s = started.get(e.requestId); if (s && /\/api\//.test(s.url)) net.api.push({ url: s.url.replace(BASE, '').split('?')[0], ms: Math.round((e.timestamp - s.t) * 1000) }); });
  const T = { page, cdp, net };
  add(await measure('first visit (cold) → welcome', T, () => page.goto(BASE + '/#/welcome'), viewReady('.welcome, h1, .hero')));
  await page.evaluate(async () => { const { store } = await import('/js/store.js'); await store.update('profile', (x) => Object.assign(x, { onboarded: true, level: 'beginner', levelSource: 'manual' })); });
  await sleep(2500); // service worker installs
  add(await measure('repeat visit → home (warm)', T, () => page.goto(BASE + '/#/home').then(() => page.reload()), viewReady('.fx-modes')));
  await ctx.close();
}

// ------------------------------------------------------------------ 2. route changes inside the running app (signed in)
{
  const T = await newPage({ signedIn: true });
  const { page } = T;
  add(await measure('signed-in → home', T, () => page.goto(BASE + '/#/home').then(() => page.reload()), viewReady('.fx-modes')));
  const routes = [
    ['learn', 'learn', '.page-head, h1'], ['lesson (b-pieces)', 'learn/b-pieces', '#next-btn, .step, h2'], ['puzzles', 'puzzles', 'h1, .page-head'], ['play hub', 'play', 'h1, .page-head'], ['openings', 'openings', 'h1'],
    ['leaderboard', 'leaderboard', 'table, .empty'], ['profile', 'profile', 'h1, .profile'], ['news (Chess World)', 'news', '.wgrid, .empty'], ['world hub', 'world', '.whero'], ['world results (30 games)', 'world/results', '#g-list .wgm'],
    ['world event page', `world/event/${done.id}`, '#e-tabs'], ['world game replay', `world/game/${gameId}`, '.wboard'], ['world players', 'world/players', '.wcard.player'], ['world broadcasts', 'world/broadcasts', '.wsec'],
    ['world LIVE (40 boards)', 'world/live', '.wlive'],
  ];
  for (const [label, hash, sel] of routes) add(await measure(label, T, () => page.evaluate((h) => { location.hash = '/' + h; }, hash), viewReady(sel)));
  // heap and CPU while the live page keeps polling (a leak or a heavy repaint shows here)
  await page.evaluate(() => { location.hash = '/world/live'; }); await sleep(2500);
  const m0 = await metrics(T.cdp); const n0 = (await page.evaluate(() => document.getElementsByTagName('*').length));
  await sleep(30000);
  const m1 = await metrics(T.cdp); const n1 = (await page.evaluate(() => document.getElementsByTagName('*').length));
  const live = { label: 'live page: 30 s of polling', ms: 30000, cpuMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), heapMB: mb(m1.JSHeapUsedSize), heapGrowthMB: mb(m1.JSHeapUsedSize - m0.JSHeapUsedSize), nodes: n1, nodesBefore: n0, layouts: m1.LayoutCount - m0.LayoutCount, recalc: m1.RecalcStyleCount - m0.RecalcStyleCount, fcp: 0, longMs: 0, longN: 0, reqs: 0, kb: 0, apiN: 0, apiMax: 0, cls: 0 };
  results.push(live); console.log(`${live.label.padEnd(34)} cpu ${live.cpuMs} ms in 30 s | heap ${live.heapMB} MB (+${live.heapGrowthMB}) | nodes ${n0}→${n1} | layouts ${live.layouts} recalc ${live.recalc}`);
  // computer opponent: time from the move to the reply (the page must stay responsive)
  await page.evaluate(() => { location.hash = '/play/computer'; }); await page.waitForSelector('#start-btn');
  await page.click('#levels [data-v="3"]'); await page.click('#start-btn'); await page.waitForSelector('.board [data-sq="e2"]'); await sleep(800);
  await throttle(T.cdp);
  await page.evaluate(() => { window.__p.long = 0; window.__p.longN = 0; });
  const sqc = async (sq) => { const b = await page.locator(`.board [data-sq="${sq}"]`).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const t0 = Date.now(); let [x, y] = await sqc('e2'); await page.mouse.click(x, y); [x, y] = await sqc('e4'); await page.mouse.click(x, y);
  await page.waitForFunction(() => document.querySelectorAll('#moves button').length >= 2, null, { polling: 'raf', timeout: 60000 });
  const reply = Date.now() - t0; const p = await page.evaluate(() => window.__p);
  const eng = { label: 'computer reply (level 3, first move)', ms: reply, longMs: Math.round(p.long), longN: p.longN, cpuMs: 0, heapMB: mb((await metrics(T.cdp)).JSHeapUsedSize), fcp: 0, reqs: 0, kb: 0, apiN: 0, apiMax: 0, nodes: 0, cls: 0 };
  results.push(eng); console.log(`${eng.label.padEnd(34)} ${reply} ms | long tasks ${eng.longMs} ms/${eng.longN} (main thread blocked)`);
  await T.ctx.close();
}

// ------------------------------------------------------------------ 3. admin
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addInitScript(INIT); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  const net = { reqs: 0, bytes: 0, api: [] }; const started = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { net.reqs++; started.set(e.requestId, { t: e.timestamp, url: e.request.url }); });
  cdp.on('Network.loadingFinished', (e) => { net.bytes += e.encodedDataLength || 0; const s = started.get(e.requestId); if (s && /\/api\//.test(s.url)) net.api.push({ url: s.url.replace(BASE, '').split('?')[0], ms: Math.round((e.timestamp - s.t) * 1000) }); });
  await page.goto(BASE + '/admin/'); await page.waitForSelector('form'); await page.fill('#u', 'boss'); await page.fill('#p', 'Correct-Horse-9!'); await page.click('button[type=submit]'); await page.waitForSelector('.sidebar, nav'); await sleep(1500);
  const T = { page, cdp, net };
  add(await measure('admin dashboard', T, () => page.evaluate(() => { location.hash = '#/players'; }).then(() => page.evaluate(() => { location.hash = '#/dashboard'; })), { sel: '#view .grid' }));
  add(await measure('admin world tournaments', T, () => page.evaluate(() => { location.hash = '#/world-events'; }), { sel: '#view table.data' }));
  await ctx.close();
}

// ------------------------------------------------------------------ 4. API response times (the real server, warm)
const api = [];
const timeApi = async (label, path, { n = 25, c = A } = {}) => {
  const ts = []; let size = 0;
  const q0 = (await (await fetch(BASE + '/api/health')).json()).queries; await fetch(BASE + path, { headers: { cookie: c?.cookie || '' } }); const q1 = (await (await fetch(BASE + '/api/health')).json()).queries; const queries = q1 - q0; // statements of one warm request
  for (let i = 0; i < n; i++) { const t = performance.now(); const r = await fetch(BASE + path, { headers: { cookie: c?.cookie || '', 'accept-encoding': 'gzip' } }); const b = await r.arrayBuffer(); ts.push(performance.now() - t); size = b.byteLength; }
  ts.sort((a, b) => a - b); const row = { label, path, queries, p50: Math.round(ts[Math.floor(n / 2)] * 10) / 10, p95: Math.round(ts[Math.floor(n * .95)] * 10) / 10, kb: Math.round(size / 102.4) / 10 }; api.push(row);
  console.log(`API ${label.padEnd(26)} db ${String(queries).padStart(3)} q  p50 ${String(row.p50).padStart(7)} ms  p95 ${String(row.p95).padStart(7)} ms  ${row.kb} KB`);
};
for (const [l, p] of [['public content', '/api/public/content?lang=en'], ['session', '/api/me'], ['world home', '/api/world/home?lang=en'], ['world events live', '/api/world/events?status=live'], ['world events completed', '/api/world/events?status=completed&size=18'], ['world news', '/api/world/news?size=18'], ['world games search', '/api/world/games?size=30'], ['world facets', '/api/world/facets'], ['world live (40 boards)', '/api/world/live'], ['world players', '/api/world/players'], ['leaderboard', '/api/leaderboard?category=blitz'], ['live games (own)', '/api/games/live'], ['tournaments', '/api/tournaments'], ['own profile', '/api/users/PerfA'], ['health', '/api/health']]) await timeApi(l, p);
await timeApi('world event detail', `/api/world/events/${done.id}`, { n: 15 }); await timeApi('world game', `/api/world/games/${gameId}`, { n: 25 });
const ps = (await import('node:child_process')).execSync(`ps -o rss=,pcpu= -p ${srv.proc.pid}`).toString().trim().split(/\s+/); console.log(`server process: RSS ${Math.round(+ps[0] / 1024)} MB`);

if (OUT) writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), fast: FAST, results, api, serverRssMB: Math.round(+ps[0] / 1024) }, null, 1));
await browser.close(); await srv.stop(); stopMock(); removeDir(dir);
process.exit(0);
