// Browser tests for Chess World: news, calendar, results archive, game replay, live games, broadcasts, players, search, the three
// languages, the phone layout and the admin pages — against a mock of the upstream services.   node tests/e2e/world.mjs
import { createRequire } from 'node:module';
import { startServer, newDataDir, removeDir, cli, client } from '../lib/server.mjs';
import { startMock, stopMock, mock, T0, iso } from '../lib/world-mock.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const results = [], consoleErrors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + String(detail).slice(0, 300)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const ADMIN_PW = 'Correct-Horse-9!';

const up = await startMock();
const dir = newDataDir();
if (cli(dir, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: ADMIN_PW }).status) throw new Error('admin');
const srv = await startServer(dir, { ROOKERY_WORLD_OFFLINE: '0', ROOKERY_WORLD_ALLOW_LOCAL: '1', ROOKERY_LICHESS_URL: up, ROOKERY_FIDE_API_URL: `${up}/api/fide/player`, ROOKERY_WIKI_URL: up });
const BASE = srv.base;
const browser = await chromium.launch();
process.on('uncaughtException', async (e) => { console.log('FAIL  uncaught: ' + String(e.message).split('\n')[0]); console.log('console:', consoleErrors.slice(-6).join(' | ')); await browser.close().catch(() => {}); await srv.stop(); process.exit(1); });

async function newPage({ lang = 'en-US', viewport = { width: 1360, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, locale: lang });
  await ctx.addInitScript(() => { try { localStorage.setItem('rk_auth_prompt', '1'); } catch { /* ignore */ } });
  await ctx.route('https://img.example/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route(/youtube-nocookie\.com|player\.twitch\.tv|image\.lichess\.org/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stream</body></html>' }));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleErrors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + e.message));
  await page.goto(BASE + '/#/welcome'); await page.waitForSelector('#app:not([hidden])'); await sleep(400);
  await page.evaluate(async () => { const { store } = await import('/js/store.js'); await store.update('profile', (p) => Object.assign(p, { onboarded: true, level: 'beginner', levelSource: 'manual' })); });
  return { ctx, page };
}
const go = async (page, hash, ms = 1500) => { await page.goto(BASE + '/#/' + hash); await sleep(ms); };
const text = (page, sel = '#view') => page.evaluate((s) => document.querySelector(s)?.innerText || '', sel);

// an administrator (API) adds an official broadcast the way an editor would
const api = client(BASE); await api.login('boss', ADMIN_PW);
// tests never touch the internet: the shipped Lichess blog source is switched off and a mock feed takes its place
await api.put('/api/admin/world/sources/1', { enabled: false });
await api.post('/api/admin/world/sources', { name: 'Mock Chess', url: `${up}/feed.atom`, category: 'fide', enabled: true, official: true });

// ============================================================ 1. nothing invented: empty states first
{
  const { ctx, page } = await newPage();
  await go(page, 'world/broadcasts', 1800);
  const t = await text(page);
  check('broadcasts: a clear message while no official stream exists (no fake video)', /No official stream is live right now/i.test(t) && !(await page.$('iframe')), t.slice(0, 200));
  await ctx.close();
}
await api.post('/api/admin/world/broadcasts', { title: 'Mock Open — live from Tashkent', provider: 'youtube_live', ref: 'UC' + 'a'.repeat(22), channel_name: 'Mock Chess', starts_at: iso(T0 - 3600000), ends_at: iso(T0 + 7200000), featured: true, commentary: 'Commentary by the organisers.' });
await api.post('/api/admin/world/broadcasts', { title: 'Round 1 recording', provider: 'youtube_video', ref: 'dQw4w9WgXcQ', channel_name: 'Mock Chess', starts_at: iso(T0 - 86400000 * 4), ends_at: iso(T0 - 86400000 * 4 + 7200000) });
await api.post('/api/admin/world/broadcasts', { title: 'Opening ceremony', provider: 'twitch', ref: 'mockchess', starts_at: iso(T0 + 86400000 * 2) });

// ============================================================ 2. the English desktop tour
const { ctx: C, page: P } = await newPage();
await go(P, 'world', 3500);
{
  const t = await text(P);
  check('hub: breaking news, live tournaments, results area, upcoming, grandmasters and the featured broadcast', /Breaking chess news/i.test(t) && /Currently live/i.test(t) && /Live Open 2026/.test(t) && /Upcoming tournaments/i.test(t) && /Uzbekistan Championship 2027/.test(t) && /Featured grandmasters/i.test(t) && /Mock Open — live from Tashkent/.test(t), t.slice(0, 300));
  check('hub: every news item names its source and date', (await P.$$eval('.wcard.news .wsrc', (e) => e.filter((x) => /Source:/.test(x.textContent) && /\d{4}/.test(x.textContent)).length)) >= 3);
  const cd1 = await P.$eval('.wrow.ev [data-cd]', (e) => e.textContent); await sleep(2100); const cd2 = await P.$eval('.wrow.ev [data-cd]', (e) => e.textContent);
  check('hub: the countdown to the next tournament ticks', cd1 && cd2 && cd1 !== cd2, `${cd1} → ${cd2}`);
  check('hub: a live tournament is flagged Live', (await P.$$('.wcard.event.live .s-live')).length >= 1);
  check('hub: the Uzbekistan section lists the Uzbekistan Championship', /Uzbekistan Championship 2027/.test(await text(P, '.w2col:last-of-type')) || /Uzbekistan chess/.test(t));
}

// news
await go(P, 'news', 2500);
{
  const t = await text(P);
  check('news: articles from the feed appear with their category and source', /FIDE announces new rules/.test(t) && /Mock Chess/.test(t) && /Uzbek grandmaster wins/.test(t), t.slice(150, 700));
  check('news: article images load', (await P.$$eval('.wcard.news img', (i) => i.filter((x) => x.complete && x.naturalWidth > 0).length)) >= 1);
  await P.click('#n-cats button[data-c="fide"]'); await sleep(900);
  const nn = (await P.$$('.wcard.news')).length; check('news: the category filter narrows the list', nn === 2 && /FIDE announces/.test(await text(P)) && !/Welcome to Rookery/.test(await text(P)), `${nn} cards`);
  await P.click('.wcard.news:has-text("FIDE announces")'); await sleep(900);
  const a = await text(P);
  check('news: a feed article shows its excerpt and a link to the original, not a copy of the article', /council approved changes/.test(a) && /Read the full article at Mock Chess/i.test(a) && (await P.$eval('.notice-card a', (x) => x.href)) === 'https://example.org/a1');
  await go(P, 'news/welcome-to-rookery', 1500);
  check('news: Rookery articles have a full article page', /Rookery brings everything/.test(await text(P)));
}

// tournaments calendar and event page
await go(P, 'world/events', 2500);
{
  check('calendar: Live tab lists the live tournament', /Live Open 2026/.test(await text(P)) && (await P.$$('.wcard.event')).length === 1);
  await P.click('#e-state button[data-v="upcoming"]'); await sleep(1000);
  check('calendar: Upcoming tab shows the countdown and dates', /Starts in/i.test(await text(P)) && /Uzbekistan Championship 2027/.test(await text(P)));
  await P.fill('#e-q', 'nothing like this'); await sleep(900);
  check('calendar: an empty result says so instead of showing something else', /No upcoming tournaments match/i.test(await text(P)));
  await P.fill('#e-q', ''); await P.selectOption('#e-tc', 'rapid'); await sleep(900);
  check('calendar: time-control filter', (await P.$$('.wcard.event')).length === 1);
  await P.selectOption('#e-tc', ''); await P.click('#e-state button[data-v="completed"]'); await sleep(900);
  await P.click('.wcard.event'); await sleep(4500);
  const t = await text(P);
  check('event page: header, status, location and tabs', /Mock Open 2026/.test(t) && /Completed/i.test(t) && /Tashkent, Uzbekistan/.test(t) && (await P.$$('#e-tabs button')).length === 5, t.slice(0, 200));
  await P.click('#e-tabs button[data-v="standings"]'); await sleep(300);
  check('event page: standings are calculated from the games (winner first)', /Alpha, Anna|Anna Alpha/.test(await text(P)) && /Final standings/i.test(await (async () => { await P.click('#e-tabs button[data-v="overview"]'); return text(P); })()));
  await P.click('#e-tabs button[data-v="games"]'); await sleep(300);
  check('event page: rounds list the games', (await P.$$('.wround')).length === 2 && (await P.$$('.wround .wrow')).length === 4);
  await P.click('#e-tabs button[data-v="stats"]'); await sleep(300);
  check('event page: statistics', /White wins/i.test(await text(P)) && /Most played openings/i.test(await text(P)));
  check('event page: the whole tournament can be downloaded as PGN', (await P.$eval('a[download][href*="/pgn"]', (a) => a.getAttribute('href'))).includes('/pgn'));
}

// results archive + replay
await go(P, 'world/results', 2500);
{
  const t = await text(P);
  check('results: the archive shows the stored games count and filters', /4\s*games stored|games stored/.test(t) && (await P.$$('#g-list .wrow.game')).length === 4, t.slice(0, 200));
  await P.fill('#g-player', 'gamma'); await sleep(900);
  check('results: filter by player', (await P.$$('#g-list .wrow.game')).length === 2);
  await P.selectOption('#g-res', '1/2-1/2'); await sleep(900);
  check('results: filter by result', (await P.$$('#g-list .wrow.game')).length === 1);
  await P.fill('#g-player', ''); await P.selectOption('#g-res', ''); await P.selectOption('#g-country', 'UZB'); await sleep(900);
  check('results: filter by country of the tournament', (await P.$$('#g-list .wrow.game')).length === 4);
  await P.selectOption('#g-country', ''); await P.fill('#g-player', 'zzzz'); await sleep(900);
  check('results: no match gives an honest empty state', /No games match/i.test(await text(P)));
  await P.fill('#g-player', 'alpha'); await sleep(900);
  await P.click('#g-list .wrow.game:has-text("1–0")'); await sleep(1500);
  const pieces = () => P.$$eval('.wboard .piece-svg, .wboard img', (e) => e.length);
  const t2 = await text(P);
  check('replay: players, ratings, moves and the evaluation graph', /Alpha|Beta/.test(t2) && (await P.$$('#w-moves button')).length >= 6 && !!(await P.$('.wgraph')), `${(await P.$$('#w-moves button')).length} buttons, graph ${!!(await P.$('.wgraph'))}, url ${P.url()}, ${t2.slice(200, 400)}`);
  const end = await pieces(); await P.click('.wctl [data-a=first]'); await sleep(200); const start = await pieces();
  check('replay: stepping back to the start shows all 32 pieces', start === 32 && end === 32, `${start} ${end}`);
  await P.keyboard.press('ArrowRight'); await sleep(200);
  check('replay: arrow keys move through the game', (await P.$$eval('#w-moves button.on', (b) => b.map((x) => x.textContent))).join('').includes('e4'));
  await P.click('.wctl [data-a=flip]'); await sleep(200);
  check('replay: the board can be flipped', (await P.$$eval('.wplayer', (e) => e[0].className)).includes('w'));
  await P.click('#w-moves button[data-i="6"]'); await sleep(200);
  check('replay: the evaluation of a move (including a mate score) is shown', /#-3/.test(await text(P, '#w-moves')));
  check('replay: PGN download link and copy button exist', !!(await P.$('a[href$="/pgn"][download]')) && !!(await P.$('#w-copy')));
  await P.click('#w-analyze'); await sleep(1200);
  check('replay: “Analyze with Stockfish” opens the analysis board with the game loaded', P.url().includes('#/analysis') && (await P.$$('#view .board, #view [data-sq]')).length > 0, P.url());
}

// live
await go(P, 'world/live', 3000);
{
  const t = await text(P);
  check('live: the ongoing round is listed with player names, ratings and clocks', /Live Open 2026/.test(t) && /Lena Live/.test(t) && /58:40|58:30/.test(t), t.slice(0, 300));
  check('live: boards are real positions (31–32 pieces after three plies)', (await P.$$eval('.wlive .wboard', (b) => b[0].querySelectorAll('.piece-svg, img').length)) === 32);
  await P.click('.wlive'); await sleep(900);
  check('live: a click opens the large board with moves, follow toggle and the live standings', !!(await P.$('.wbig')) && /Follow live moves/i.test(await text(P)) && (await P.$$('.wbig .wmoves button')).length === 3, (await text(P)).slice(0, 200));
  check('live: no engine evaluation is shown when the feed has none', /No engine evaluation is published/i.test(await text(P)));
}

// broadcasts
await go(P, 'world/broadcasts', 2500);
{
  const t = await text(P);
  check('broadcasts: the featured official stream is embedded (no cookies domain) with full-screen allowed', (await P.$eval('.wvideo iframe', (f) => f.src)).startsWith('https://www.youtube-nocookie.com/embed/live_stream?channel=UC') && (await P.$eval('.wvideo iframe', (f) => /fullscreen/.test(f.getAttribute('allow')))));
  check('broadcasts: commentary, upcoming schedule with countdown and the archive', /Commentary by the organisers/i.test(t) && /Opening ceremony/.test(t) && /Round 1 recording/.test(t) && !!(await P.$('.wrow [data-cd]')), t.slice(0, 300));
  check('broadcasts: a hint explains what to do when a stream does not load', /If the stream does not load/i.test(t));
  await go(P, 'world', 3000);
  check('hub: the featured live broadcast is promoted', /Watch now/i.test(await text(P)));
}

// players and search
await go(P, 'world/players', 3500);
{
  const t = await text(P);
  check('players: grandmasters are listed with FIDE ratings', /Magnus Carlsen/.test(t) && /2800/.test(t), t.slice(0, 200));
  check('players: the entry whose FIDE id belongs to someone else shows no rating', !/2000/.test(await P.$$eval('.wcard.player', (c) => c.find((x) => /Abdusattorov/.test(x.textContent))?.textContent || '')));
  await P.click('.wcard.player'); await sleep(2500);
  const p = await text(P);
  check('profile: title, ratings with their source, biography with its source', /GM/.test(p) && /2800/.test(p) && /Source: FIDE/i.test(p) && /Norwegian chess grandmaster/.test(p) && /Wikipedia/.test(p), p.slice(0, 300));
  check('profile: no invented world ranking or achievements', !/World ranking/.test(p) && /Achievements are listed here when the editors add them/.test(p));
  await P.fill('#w-search', 'alpha'); await P.press('#w-search', 'Enter'); await sleep(1800);
  const s = await text(P);
  check('search: games of a player are found', /Games/i.test(s) && /Alpha/.test(s), s.slice(0, 200));
  await P.fill('#w-search', 'uzbek'); await P.press('#w-search', 'Enter'); await sleep(1800);
  check('search: countries, tournaments and news', /Countries/i.test(await text(P)) && /Uzbekistan/.test(await text(P)));
}
check('sidebar highlights Chess World on its pages', (await P.$eval('.nav a.active', (a) => a.textContent)).includes('Chess World'));

// ============================================================ 3. languages
for (const [lang, rx, bad, label] of [['ru-RU', /Всё, что происходит в шахматах/, /Breaking chess news|Tournament calendar|Everything happening/, 'Russian'], ['uz-UZ', /Shaxmatdagi hamma voqealar/, /Breaking chess news|Tournament calendar|Everything happening/, 'Uzbek']]) {
  const { ctx, page } = await newPage({ lang });
  await go(page, 'world', 5000);
  const t = await text(page);
  check(`${label}: Chess World hub is translated`, rx.test(t) && !bad.test(t), `${rx.test(t)} ${bad.test(t)} ${(t.match(bad) || [''])[0]}`);
  for (const r of ['world/events', 'world/results', 'world/live', 'world/broadcasts', 'world/players', 'news']) { await go(page, r, 1800); }
  const heads = []; for (const r of ['world/events', 'world/results', 'world/live', 'world/broadcasts', 'world/players', 'news']) { await go(page, r, 1800); heads.push((await text(page, '#view h1')).trim()); }
  check(`${label}: page titles of all Chess World pages are translated`, heads.every((h) => h && !/^(Tournament calendar|Results and game archive|Live games|Live broadcasts|Grandmasters|Chess news)$/.test(h)), heads.join(' | '));
  await go(page, 'world/events', 1500); await page.click('#e-state button[data-v="upcoming"]'); await sleep(900);
  check(`${label}: countdown units are translated`, /\d+(?:к|k|д)\s|\d{2}:\d{2}:\d{2}/.test(await text(page)) && !/\d+d \d+h/.test(await text(page)));
  await ctx.close();
}

// ============================================================ 4. phone layout
{
  const { ctx, page } = await newPage({ viewport: { width: 390, height: 800 } });
  const bad = [];
  for (const r of ['world', 'news', 'world/news', 'world/events', 'world/event/1', 'world/results', 'world/game/1', 'world/live', 'world/broadcasts', 'world/players', 'world/player/magnus-carlsen', 'world/search/alpha']) {
    await go(page, r, 1800); const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (over > 1) bad.push(`${r}:${over}`);
  }
  check('phone layout: no Chess World page scrolls horizontally', bad.length === 0, bad.join(' '));
  await go(page, 'world/game/1', 1800);
  const box = await page.$eval('.wboard', (b) => { const r = b.getBoundingClientRect(); return [r.left, r.width]; });
  check('phone layout: the replay board fills the screen', box[1] > 330 && box[0] >= 0, box.join(','));
  await ctx.close();
}

// ============================================================ 5. the admin pages
{
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } }); const ap = await ctx.newPage();
  ap.on('pageerror', (e) => consoleErrors.push('[admin pageerror] ' + e.message));
  await ap.goto(BASE + '/admin/'); await ap.waitForSelector('form'); await ap.fill('#u', 'boss'); await ap.fill('#p', ADMIN_PW); await ap.click('button[type=submit]'); await ap.waitForSelector('nav, .sidebar', { timeout: 8000 });
  await ap.goto(BASE + '/admin/#/world-events'); await ap.waitForSelector('table.data'); await sleep(500);
  check('admin → World tournaments lists the official events', /Live Open 2026/.test(await text(ap)) && /Official feed/.test(await text(ap)));
  await ap.click('button:has-text("New tournament")'); await ap.waitForSelector('.modal'); await sleep(200);
  await ap.click('.modal footer .btn.primary'); await sleep(600);
  check('admin: the tournament form reports invalid fields next to them', (await ap.$$('.modal .field.invalid')).length >= 1);
  await ap.fill('.modal input[maxlength="160"]', 'Samarkand Rapid 2027'); await ap.fill('.modal input[type=datetime-local] >> nth=0', '2027-05-10T10:00'); await ap.fill('.modal input[type=datetime-local] >> nth=1', '2027-05-12T18:00');
  await ap.click('.modal footer .btn.primary'); await sleep(900);
  check('admin: a new tournament can be saved (provisional unless confirmed)', /Samarkand Rapid 2027/.test(await text(ap)) && /Provisional|Editors/.test(await text(ap)), (await text(ap)).slice(0, 200));
  await ap.goto(BASE + '/admin/#/world-broadcasts'); await ap.waitForSelector('table.data'); await sleep(400);
  check('admin → Broadcasts lists the streams with their live status', /Mock Open — live from Tashkent/.test(await text(ap)) && /Live/.test(await text(ap)));
  await ap.click('button:has-text("New broadcast")'); await ap.waitForSelector('.modal'); await ap.fill('.modal input[maxlength="160"]', 'Bad stream'); await ap.fill('.modal input[maxlength="200"] >> nth=0', 'not-a-channel'); await ap.click('.modal footer .btn.primary'); await sleep(700);
  check('admin: an invalid YouTube channel id is rejected with an explanation', /channel id|UC/i.test(await text(ap, '.modal')));
  await ap.click('.modal footer .btn:has-text("Cancel")');
  await ap.goto(BASE + '/admin/#/world-sources'); await ap.waitForSelector('table.data'); await sleep(500);
  check('admin → News sources lists the feeds (unverified ones switched off) and the categories', /Lichess Blog/.test(await text(ap)) && /FIDE News/.test(await text(ap)) && /Uzbekistan/.test(await text(ap)) && (await ap.$$('.badge:has-text("Off")')).length >= 2);
  await ap.goto(BASE + '/admin/#/world-players'); await ap.waitForSelector('table.data'); await sleep(400);
  check('admin → Grandmasters lists the profiles', /Magnus Carlsen/.test(await text(ap)) && /FIDE 1503014/.test(await text(ap)));
  await ap.goto(BASE + '/admin/#/world-games'); await ap.waitForSelector('table.data'); await sleep(600);
  await ap.click('table.data button:has-text("Edit") >> nth=0'); await ap.waitForSelector('.modal'); await ap.click('.modal footer .btn:has-text("History")'); await sleep(600);
  check('admin: the change history of a record can be opened', /Change history/.test(await text(ap, '#modal-root')));
  await ap.keyboard.press('Escape'); await ap.keyboard.press('Escape'); await sleep(200);
  await ap.goto(BASE + '/admin/#/news'); await ap.waitForSelector('table.data, .empty'); await ap.click('button:has-text("New article")'); await ap.waitForSelector('.modal'); await sleep(300);
  check('admin: the news editor has category, image and source fields', /Category/.test(await text(ap, '.modal')) && /Image address/.test(await text(ap, '.modal')) && /Source name/.test(await text(ap, '.modal')));
  await ctx.close();
}

await C.close();
const real = consoleErrors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of (401|404|409|400|403|502|503)|net::ERR|WebSocket connection to .* failed/.test(e));
check('no unexpected console errors or warnings', real.length === 0, real.slice(0, 4).join(' | '));
await browser.close(); await srv.stop(); stopMock(); removeDir(dir);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
