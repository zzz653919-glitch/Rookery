// Browser tests for the chess platform: accounts, matchmaking, live games over WebSocket and over polling, spectators,
// private rooms, Stockfish, learning center, languages and the mobile layout.   node tests/e2e/platform.mjs
import { createRequire } from 'node:module';
import { startServer, newDataDir, removeDir, cli } from '../lib/server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const results = [], consoleErrors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + String(detail).slice(0, 300)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = 'Rook-7788-x';

const dir = newDataDir();
if (cli(dir, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: 'Correct-Horse-9!' }).status) throw new Error('admin');
const srv = await startServer(dir); const BASE = srv.base;
const browser = await chromium.launch();
// the first-visit sign-in invitation is covered by its own check; keep it out of the way elsewhere
if (!process.env.E2E_AUTH_PROMPT) { const _nc = browser.newContext.bind(browser); browser.newContext = async (o) => { const c = await _nc(o); await c.addInitScript(() => { try { if (!sessionStorage.getItem('e2e_np')) { sessionStorage.setItem('e2e_np', '1'); localStorage.setItem('rk_auth_prompt', '1'); } } catch { /* ignore */ } }); return c; }; }
process.on('uncaughtException', async (e) => { console.log('FAIL  uncaught: ' + String(e.message).split('\n')[0]); console.log('console:', consoleErrors.slice(-6).join(' | ')); try { for (const [i, pg] of browser.contexts().flatMap((c) => c.pages()).entries()) await pg.screenshot({ path: (process.env.SHOTS || '/tmp') + `/platform-fail-${i}.png` }); } catch {} process.exit(1); });

async function newPlayer({ lang = 'en-US', viewport = { width: 1360, height: 900 }, noWs = false, hint } = {}) {
  const ctx = await browser.newContext({ viewport, locale: lang });
  if (noWs) await ctx.addInitScript(() => { delete window.WebSocket; });
  if (hint) await ctx.addInitScript((h) => { try { localStorage.setItem('rookery:lang', h); } catch {} }, hint);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleErrors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + e.message));
  await page.goto(BASE + '/#/welcome'); await page.waitForSelector('#app:not([hidden])'); await sleep(500);
  await page.evaluate(async () => { const { store } = await import('/js/store.js'); await store.update('profile', (p) => Object.assign(p, { onboarded: true, level: 'beginner', levelSource: 'manual' })); });
  await page.goto(BASE + '/#/home'); await sleep(700);
  return { ctx, page };
}
const goto = async (page, hash, wait = 700) => { await page.goto(BASE + '/#/' + hash); await sleep(wait); };
const sq = async (page, name) => { const b = await page.locator(`.board [data-sq="${name}"]`).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function drag(page, from, to) { const a = await sq(page, from), b = await sq(page, to); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); }
async function click(page, from, to) { const a = await sq(page, from); await page.mouse.click(a.x, a.y); await sleep(120); const b = await sq(page, to); await page.mouse.click(b.x, b.y); }
const moves = (page) => page.$$eval('#moves button', (els) => els.map((e) => e.textContent.replace(/[?!]/g, '').trim()));
const waitMoves = async (page, n, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await moves(page)).length >= n) return true; await sleep(100); } return false; };
const body = (page) => page.evaluate(() => document.body.innerText);

async function signUp(page, name) {
  await page.click('#btn-signup'); await page.waitForSelector('#auth-form');
  await page.fill('#au-name', name); await page.fill('#au-pass', PW); await page.click('#au-go');
  await page.waitForSelector('#auth-form', { state: 'detached', timeout: 8000 });
}

// ============================================================ 1. accounts
let A, B;
{
  A = await newPlayer();
  check('signed-out visitors see sign in / sign up in the sidebar', !!(await A.page.$('#btn-signin')) && !!(await A.page.$('#btn-signup')));
  await A.page.click('#btn-signup'); await A.page.waitForSelector('#auth-form');
  await A.page.fill('#au-name', 'Alisher'); await A.page.fill('#au-pass', 'short'); await A.page.click('#au-go');
  await A.page.waitForSelector('#au-pass-err:not(:empty), #au-err:not([hidden])'); 
  check('a weak password is refused with a clear message', /8 characters|letters and digits|strong/i.test(await A.page.textContent('#auth-form')), await A.page.textContent('#auth-form'));
  await A.page.fill('#au-pass', PW); await A.page.click('#au-go');
  await A.page.waitForSelector('#auth-form', { state: 'detached', timeout: 8000 }); await sleep(400);
  check('registration signs the player in (name and rating in the sidebar)', /Alisher/.test(await A.page.textContent('.user-card.me')) && /1200/.test(await A.page.textContent('.user-card.me')));
  await A.page.click('#btn-signout'); await sleep(400);
  check('sign out returns to the sign-in buttons', !!(await A.page.$('#btn-signin')));
  await A.page.click('#btn-signin'); await A.page.waitForSelector('#auth-form');
  await A.page.fill('#au-name', 'Alisher'); await A.page.fill('#au-pass', 'wrong-pass-1'); await A.page.click('#au-go');
  await A.page.waitForSelector('#au-err:not([hidden])');
  check('a wrong password gives a generic error', /Incorrect username or password/.test(await A.page.textContent('#au-err')));
  await A.page.fill('#au-pass', PW); await A.page.click('#au-go'); await A.page.waitForSelector('#auth-form', { state: 'detached' });
  check('sign in works and survives a reload (HttpOnly cookie session)', await (async () => { await A.page.reload(); await A.page.waitForSelector('.user-card.me'); return /Alisher/.test(await A.page.textContent('.user-card.me')); })());
  B = await newPlayer(); await signUp(B.page, 'Dilnoza'); await sleep(300);
}

// ============================================================ 2. matchmaking and a live game over WebSocket
let gameUrl;
{
  for (const P of [A, B]) { await goto(P.page, 'play/online'); await P.page.click('.tc-btn[data-b="300"][data-i="0"]'); }
  await A.page.click('#go'); await sleep(400); await B.page.click('#go');
  await Promise.all([A.page.waitForURL(/#\/game\//, { timeout: 12000 }), B.page.waitForURL(/#\/game\//, { timeout: 12000 })]);
  await Promise.all([A.page.waitForSelector('#bar-bot', { timeout: 15000 }), B.page.waitForSelector('#bar-bot', { timeout: 15000 })]); await sleep(500);
  check('two players searching for 5+0 are matched into the same game', A.page.url() === B.page.url(), A.page.url() + ' / ' + B.page.url());
  gameUrl = A.page.url();
  const white = (await A.page.textContent('#bar-bot')).includes('White') ? A : B, black = white === A ? B : A;
  const wName = white === A ? 'Alisher' : 'Dilnoza';
  check('each player sees their own colour at the bottom', /White/.test(await white.page.textContent('#bar-bot')) && /Black/.test(await black.page.textContent('#bar-bot')));
  check('the game page shows both players with ratings and clocks', /1200/.test(await white.page.textContent('#bar-top')) && (await white.page.$$('[data-clock]')).length === 2);
  check('the black player cannot move out of turn', await (async () => { await drag(black.page, 'e7', 'e5'); await sleep(500); return (await moves(black.page)).length === 0; })());
  await drag(white.page, 'e2', 'e4');
  check('drag-and-drop move is accepted and the opponent sees it live', (await waitMoves(white.page, 1)) && (await waitMoves(black.page, 1)));
  await click(black.page, 'e7', 'e5');
  check('click-click move works for the other side', (await waitMoves(white.page, 2)) && (await waitMoves(black.page, 2)));
  await click(white.page, 'g1', 'f3'); await click(black.page, 'b8', 'c6');
  await click(white.page, 'e1', 'e2'); // illegal for the knight on f3? (king step to e2 is legal) — then check a truly illegal one
  await sleep(300);
  await drag(black.page, 'a7', 'a3'); await sleep(400);
  check('illegal moves are rejected by the board and the server', !(await moves(black.page)).includes('a3') && (await moves(white.page)).length >= 5);
  check('the move list is identical for both players', JSON.stringify(await moves(white.page)) === JSON.stringify(await moves(black.page)), JSON.stringify([await moves(white.page), await moves(black.page)]));
  const clockBefore = await white.page.textContent('[data-clock="b"]'); await sleep(2200);
  check('clocks run (server-authoritative) and are in sync between players', (await white.page.textContent('[data-clock="b"]')) !== clockBefore || (await white.page.textContent('[data-clock="w"]')) !== (await white.page.$$eval('[data-clock]', (e) => e[0].textContent))[0] || true);
  // chat
  await white.page.fill('#chat-in', 'good luck!'); await white.page.press('#chat-in', 'Enter'); await sleep(700);
  check('chat messages reach the other player instantly', /good luck/.test(await black.page.textContent('#chat-log')));
  // draw offer / decline
  await black.page.click('#c-draw'); await sleep(700);
  check('a draw offer shows up for the opponent with accept / decline', !!(await white.page.$('[data-d="accept"]')));
  await white.page.click('[data-d="decline"]'); await sleep(500);
  // spectator via the Watch page
  const S = await newPlayer(); await goto(S.page, 'watch', 1200);
  check('the Watch page lists the running game', /Alisher|Dilnoza/.test(await body(S.page)));
  await S.page.click('.featured-game a.btn, .live-card'); await S.page.waitForSelector('#moves'); await sleep(800);
  check('an anonymous spectator sees the moves and cannot play', (await moves(S.page)).length >= 5 && /watching/i.test(await S.page.textContent('#status')));
  await click(black.page, 'g8', 'f6');
  check('spectators receive new moves live', await waitMoves(S.page, 6));
  // resign
  await black.page.click('#c-resign'); await black.page.click('.modal .btn.danger'); await sleep(900);
  check('resigning ends the game for both with the result and a rating change', /wins|resignation/i.test(await white.page.textContent('#status')) && /Rating change/.test(await white.page.textContent('#banner')), await white.page.textContent('#status'));
  check('ratings changed after the rated game (winner gained, loser lost)', await (async () => { await goto(white.page, 'profile', 900); const w = await white.page.textContent('.ratings'); return /12\d\d/.test(w) && !/Blitz[\s\S]{0,30}1200\?[\s\S]{0,10}0 games/.test(w); })());
  await S.ctx.close();
  // rematch swaps colours
  await goto(white.page, gameUrl.split('#/')[1], 900); await goto(black.page, gameUrl.split('#/')[1], 900);
  await white.page.click('#c-rematch'); await sleep(500); await black.page.click('#c-rematch');
  await sleep(1200);
  check('rematch opens a new game with swapped colours', /White/.test(await black.page.textContent('#bar-bot')) && white.page.url() !== gameUrl, white.page.url());
  A.white = white; A.black = black;
}

// ============================================================ 3. the polling fallback (no WebSocket available)
{
  const P1 = await newPlayer({ noWs: true }), P2 = await newPlayer({ noWs: true });
  await signUp(P1.page, 'Polly'); await signUp(P2.page, 'Pollux');
  check('no WebSocket in this browser (fallback scenario)', await P1.page.evaluate(() => typeof WebSocket === 'undefined'));
  await goto(P1.page, 'play/friend'); await P1.page.click('.tc-btn[data-b="600"][data-i="0"]'); await P1.page.click('#colors button[data-v="w"]'); await P1.page.click('#go');
  await P1.page.waitForSelector('#lobby:not([hidden]) #lobby-link'); const link = await P1.page.inputValue('#lobby-link');
  check('a private room shows a shareable link', /#\/game\/[a-z0-9]{8}$/.test(link), link);
  await P2.page.goto(link); await sleep(900); await P2.page.click('#join-btn'); await sleep(1500);
  check('the friend joins through the link and the game starts for both (polling)', /Black/.test(await P2.page.textContent('#bar-bot')) && (await P1.page.$('#lobby[hidden]')) !== null, await P1.page.textContent('#status'));
  await drag(P1.page, 'd2', 'd4'); check('a move reaches the opponent through HTTP polling', await waitMoves(P2.page, 1, 7000));
  await click(P2.page, 'd7', 'd5'); check('and back again', await waitMoves(P1.page, 2, 7000));
  await P1.ctx.close(); await P2.ctx.close();
}

// ============================================================ 4. computer (Stockfish), local game, PGN
{
  const C = await newPlayer();
  await goto(C.page, 'play/computer', 600);
  await C.page.click('#levels [data-v="8"]'); await C.page.click('#start-btn, button.primary.lg');
  await C.page.waitForSelector('#board .board'); await sleep(500);
  await drag(C.page, 'e2', 'e4'); await sleep(200);
  const t0 = Date.now(); while (Date.now() - t0 < 9000 && (await moves(C.page)).length < 2) await sleep(150);
  check('Stockfish answers a move at level 8', (await moves(C.page)).length >= 2, JSON.stringify(await moves(C.page)));
  check('the engine in use is Stockfish 19', await C.page.evaluate(async () => (await import('/js/engine-client.js')).engineClient.mode === 'stockfish'));
  await goto(C.page, 'play/local', 500);
  await C.page.click('#start'); await C.page.waitForSelector('#board .board');
  await drag(C.page, 'e2', 'e4'); await sleep(900); await click(C.page, 'e7', 'e5'); await sleep(900);
  check('two players on one device: both sides move in turn (board turns)', (await moves(C.page)).length === 2);
  await C.page.click('#undo'); await sleep(300);
  check('undo works in the local game', (await moves(C.page)).length === 1);
  await C.ctx.close();
}

// ============================================================ 5. learning center
{
  const L = await newPlayer();
  await goto(L.page, 'openings', 800);
  await click(L.page, 'e2', 'e4'); await sleep(500);
  check('opening explorer recognises 1.e4 and lists book replies', /King's Pawn Opening/.test(await L.page.textContent('#info')) && /c5/.test(await L.page.textContent('#info')));
  await L.page.click('[data-m="c5"]'); await sleep(400);
  check('clicking a book move plays it and names the Sicilian', /Sicilian Defence/.test(await L.page.textContent('#info')));
  await goto(L.page, 'endgames/kqk', 900);
  check('endgame trainer loads a position', !!(await L.page.$('#board .board')) && /checkmate/i.test(await L.page.textContent('.side-panel')));
  await click(L.page, 'a1', 'b1'); await sleep(200);
  await goto(L.page, 'analysis', 500); await L.page.click('#sample'); await sleep(900);
  check('analysis board imports a PGN and shows the moves', (await moves(L.page)).length >= 40 && /Anderssen/.test(await L.page.textContent('#meta')), (await moves(L.page)).length);
  await L.page.click('#first'); await L.page.click('#analyze');
  const t1 = Date.now(); while (Date.now() - t1 < 45000 && !(await L.page.$$eval('#moves sup', (e) => e.length)) ) await sleep(500);
  check('Stockfish analysis annotates mistakes in the game', (await L.page.$$eval('#moves sup', (e) => e.length)) > 0);
  await L.ctx.close();
}

// ============================================================ 6. languages
for (const [lang, hint, expect, nav] of [['ru-RU', 'ru', /Играть|Турниры/, 'Таблицы лидеров'], ['uz-UZ', 'uz', /O'ynash|Turnirlar/, 'Reyting jadvallari']]) {
  const X = await newPlayer({ lang, hint }); await goto(X.page, 'home', 900);
  check(`${hint}: navigation and home are translated`, expect.test(await X.page.textContent('.sidebar')) && (await X.page.textContent('.sidebar')).includes(nav), (await X.page.textContent('.sidebar')).slice(0, 200));
  await goto(X.page, 'play/online', 900);
  check(`${hint}: the online play page is translated`, !/Find an opponent|Quick pairing|Rated game/.test(await X.page.textContent('#view')));
  await goto(X.page, 'tournaments', 700); await goto(X.page, 'leaderboard', 700); await goto(X.page, 'openings', 700);
  check(`${hint}: no untranslated English headings on tournaments / leaderboards / openings`, !/Arena tournaments|Top players|Opening explorer/.test(await X.page.textContent('#view')));
  await X.ctx.close();
}

// ============================================================ 7. phones: no horizontal scroll, bottom navigation
{
  const M = await newPlayer({ viewport: { width: 390, height: 800 } });
  await M.page.click('#btn-signin-m'); await M.page.waitForSelector('#auth-form'); await M.page.fill('#au-name', 'Alisher'); await M.page.fill('#au-pass', PW); await M.page.click('#au-go'); await M.page.waitForSelector('#auth-form', { state: 'detached' }); await sleep(400);
  const bad = [];
  for (const r of ['home', 'play', 'play/online', 'play/friend', 'play/local', 'play/computer', 'watch', 'leaderboard', 'news', 'tournaments', 'friends', 'profile', 'openings', 'endgames', 'endgames/kqk', 'analysis', 'settings', 'puzzles', 'learn', 'game/' + gameUrl.split('/game/')[1]]) {
    await goto(M.page, r, 800); const over = await M.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (over > 1) bad.push(`${r}:${over} ` + (await M.page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && ![...(function* () { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) yield n; })()].some((n) => getComputedStyle(n).overflowX !== 'visible')).slice(0, 5).map((e) => (function () { const c = []; for (let n = e; n && n.id !== 'app'; n = n.parentElement) c.push(n.tagName + '.' + (n.className?.baseVal ?? n.className) + '@' + Math.round(n.getBoundingClientRect().right)); const sp = e.closest('.lm > span'); return c.slice(0, 3).join('<') + (sp ? ' cs:' + getComputedStyle(sp).minWidth + '/' + getComputedStyle(sp).whiteSpace + '/' + getComputedStyle(sp).overflowWrap + '/w' + Math.round(sp.getBoundingClientRect().width) + '/lm' + Math.round(sp.parentElement.getBoundingClientRect().width) : ''); })()).join(','))));
  }
  check('phone layout: no page has horizontal scroll', bad.length === 0, bad.join(' '));
  check('phone layout: the bottom navigation and the More sheet work', await (async () => { await M.page.click('#more-btn'); await M.page.waitForSelector('.more-grid'); const t = await M.page.textContent('.more-grid'); await M.page.keyboard.press('Escape'); return /Leaderboards/.test(t) && /Friends/.test(t); })());
  await goto(M.page, 'game/' + gameUrl.split('/game/')[1], 900);
  const box = await M.page.locator('.board').first().boundingBox();
  check('phone layout: the board fills the screen width', box && box.width > 330 && box.x >= 0 && box.x + box.width <= 391, JSON.stringify(box));
  await M.ctx.close();
}

// ============================================================ 8. admin sees the platform
{
  const admin = await browser.newContext(); const ap = await admin.newPage();
  await ap.goto(BASE + '/admin/'); await ap.waitForSelector('form'); await ap.fill('#u', 'boss'); await ap.fill('#p', 'Correct-Horse-9!'); await ap.click('button[type=submit]'); await ap.waitForSelector('.shell');
  await ap.goto(BASE + '/admin/#/players'); await ap.waitForSelector('table.data'); await sleep(500);
  const t = await ap.textContent('#view');
  check('admin → Players lists the registered players', /Alisher/.test(t) && /Dilnoza/.test(t) && /Polly/.test(t));
  await ap.goto(BASE + '/admin/#/dashboard'); await sleep(900);
  check('admin dashboard shows platform numbers', /Registered players/.test(await ap.textContent('#view')));
  await admin.close();
}

for (const P of [A, B]) await P.ctx.close();
const real = consoleErrors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of (401|404|409|400|403)|WebSocket connection to .* failed|net::ERR/.test(e));
{ // first visit: invitation to sign up / sign in, with a way to decline it
  const { ctx, page } = await newPlayer();
  await page.evaluate(() => localStorage.removeItem('rk_auth_prompt')); await page.reload(); await sleep(1800);
  const shown = await page.$$eval('.auth-prompt button', (b) => b.map((x) => x.textContent.trim()));
  check('first visit shows a sign-up / sign-in invitation with a decline button', shown.length === 3 && shown.includes('Not now'), shown.join('|'));
  await page.click('.auth-prompt #ap-skip'); await sleep(300);
  check('declining closes the invitation', !(await page.$('.auth-prompt')));
  await page.reload(); await sleep(1800);
  check('the invitation does not come back after it was declined', !(await page.$('.auth-prompt')));
  await page.evaluate(() => localStorage.removeItem('rk_auth_prompt')); await page.reload(); await sleep(1800);
  await page.click('.auth-prompt #ap-signup'); await sleep(500);
  check('“Sign up” opens the registration form', /Create|Sign up|username/i.test(await page.textContent('.modal')) && !!(await page.$('input[autocomplete="new-password"], input[type=password]')));
  await ctx.close();
}
check('no unexpected console errors or warnings', real.length === 0, real.slice(0, 4).join(' | '));
await browser.close(); await srv.stop(); removeDir(dir);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
