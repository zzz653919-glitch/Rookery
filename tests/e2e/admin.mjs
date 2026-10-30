// Browser tests for the admin panel and its effect on the player site (Playwright + Chromium).
//   node tests/e2e/admin.mjs
// Boots its own server with a throw-away database, so nothing here touches real data.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, newDataDir, removeDir, cli } from '../lib/server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const results = [];
const consoleErrors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = 'Correct-Horse-9!', PW_V = 'Viewer-Passw0rd#1';

const dir = newDataDir();
for (const [u, role, pw] of [['boss', 'superadmin', PW], ['vera', 'viewer', PW_V]]) { const r = cli(dir, ['create-admin', '--username', u, '--role', role], { password: pw }); if (r.status) throw new Error(r.stderr); }
const srv = await startServer(dir);
const BASE = srv.base;
const assetDir = join(dir, 'assets'); mkdirSync(assetDir);
const svgFiles = [];
for (const code of ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']) {
  const f = join(assetDir, `${code}.svg`);
  writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="${code[0] === 'w' ? '#fffbe6' : '#223'}" stroke="#c90" stroke-width="6"/><text x="50" y="64" font-size="40" text-anchor="middle" fill="${code[0] === 'w' ? '#223' : '#fffbe6'}">${code[1]}</text></svg>`);
  svgFiles.push(f);
}

const browser = await chromium.launch();
async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()} (${page.url()})`); });
  page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + e.message + ' (' + page.url() + ')'));
  return { ctx, page };
}
async function login(page, user = 'boss', pw = PW) {
  await page.goto(BASE + '/admin/'); await page.waitForSelector('form');
  await page.fill('#u', user); await page.fill('#p', pw); await page.click('button[type=submit]');
  await page.waitForSelector('.shell', { timeout: 10000 });
}
const toastText = async (page, re, timeout = 6000) => { try { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout }); return true; } catch { return false; } };
const learnerPage = async (ctx, level = 'beginner', extra = {}) => {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()} (player ${p.url()})`); });
  await p.goto(BASE + '/#/welcome'); await p.waitForSelector('#app:not([hidden])'); await sleep(300);
  await p.evaluate(async ({ level, extra }) => { const { store } = await import('/js/store.js'); await store.update('profile', (x) => Object.assign(x, { onboarded: true, level, levelSource: 'manual' })); for (const [k, v] of Object.entries(extra)) await store.set(k, v); }, { level, extra });
  return p;
};

// ============================================================ 1. sign-in, sign-out, unauthorised UI access
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/admin/#/lessons'); await page.waitForSelector('form');
  check('visitor opening /admin/#/lessons sees the login page, not content', !!(await page.$('#u')) && !(await page.$('.shell')));
  await page.fill('#u', 'boss'); await page.fill('#p', 'wrong-password-1!'); await page.click('button[type=submit]');
  await page.waitForSelector('.notice.bad:not([hidden])');
  check('wrong password shows a generic error', /Incorrect username or password/.test(await page.textContent('.notice.bad')));
  await page.fill('#u', 'boss'); await page.fill('#p', PW); await page.click('button[type=submit]');
  await page.waitForSelector('.shell table.data');
  check('after login the originally requested page (lessons) opens', /Lessons/.test(await page.textContent('#page-title')));
  await page.goto(BASE + '/admin/#/dashboard'); await page.waitForSelector('.shell .stat');
  check('the dashboard shows live numbers from the database', (await page.textContent('.stat .v')).trim() === '29');
  const cookies = await ctx.cookies();
  const ck = cookies.find((c) => c.name === 'rk_admin');
  check('session cookie is HttpOnly + SameSite=Strict', ck && ck.httpOnly && ck.sameSite === 'Strict');
  check('session token is not readable from page scripts', !(await page.evaluate(() => document.cookie.includes('rk_admin'))));
  await page.reload(); await page.waitForSelector('.shell');
  check('session survives a reload', !!(await page.$('.shell')));
  await page.click('text=Sign out'); await page.waitForSelector('form');
  check('sign out returns to the login page', !!(await page.$('#u')));
  const after = await page.evaluate(async () => (await fetch('/api/admin/lessons')).status);
  check('API refuses the old session after sign out (401)', after === 401, String(after));
  await page.goto(BASE + '/admin/#/settings'); await page.waitForSelector('form');
  check('deep link while signed out shows login', !!(await page.$('#u')));
  await ctx.close();
}

// ============================================================ 2. viewer role: read-only UI and API
{
  const { ctx, page } = await newCtx();
  await login(page, 'vera', PW_V);
  const nav = await page.$$eval('.nav a', (as) => as.map((a) => a.textContent.trim()));
  check('viewer does not see Administrators / Audit log in the menu', !nav.includes('Administrators') && !nav.includes('Audit log'), nav.join(','));
  await page.goto(BASE + '/admin/#/lessons'); await page.waitForSelector('table.data');
  check('viewer sees no “New lesson” / delete actions', !(await page.$('text=New lesson')) && !(await page.$('button:has-text("Delete")')));
  await page.goto(BASE + '/admin/#/admins'); await page.waitForSelector('.empty');
  check('typing the Administrators URL as viewer shows “no access”', /do not have access/.test(await page.textContent('.empty')));
  const status = await page.evaluate(async () => (await fetch('/api/admin/admins')).status);
  check('…and the API itself answers 403', status === 403, String(status));
  await ctx.close();
}

// ============================================================ 3. lesson management through the UI
const { ctx: adminCtx, page: ap } = await newCtx();
await login(ap);
let newLessonId = null;
{
  await ap.goto(BASE + '/admin/#/lessons/new'); await ap.waitForSelector('text=Details');
  await ap.getByLabel('Title', { exact: true }).fill('E2E endgame lesson');
  await ap.getByLabel('Level', { exact: true }).selectOption('expert');
  await ap.getByLabel('Skill', { exact: true }).selectOption('endgame');
  await ap.getByLabel('Summary (shown on lesson cards)').fill('Created by the e2e test');
  newLessonId = await ap.getByLabel('Lesson id').inputValue();
  check('lesson id is suggested from the title', /^x-e2e-endgame/.test(newLessonId), newLessonId);
  // premature publish is blocked
  await ap.getByLabel('Status', { exact: true }).selectOption('published');
  await ap.click('text=Save lesson');
  await ap.waitForSelector('.problems');
  check('publishing without exercise + quiz is refused with a clear message', /quiz|exercise/i.test(await ap.textContent('.problems')));
  // add a move exercise
  await ap.getByLabel('Add a step').selectOption('move');
  await ap.waitForSelector('.modal');
  await ap.locator('.modal').getByLabel('Instruction shown to the learner').fill('Capture the pawn with the rook.');
  await ap.locator('.modal').getByLabel('FEN position').fill('7k/8/8/8/3R2p1/8/8/K7 w - - 0 1');
  await ap.locator('.modal .chip button').first().click(); // drop the sample move e2e4 that does not belong to this position
  await ap.locator('.modal').getByLabel('Accepted move').fill('d4g4'); await ap.locator('.modal').getByLabel('Accepted move').press('Enter');
  await ap.locator('.modal').getByLabel('Hint (optional)').fill('Same rank');
  await ap.click('.modal >> text=Apply to lesson');
  // illegal accepted move is caught
  await ap.getByLabel('Add a step').selectOption('move'); await ap.waitForSelector('.modal');
  await ap.locator('.modal').getByLabel('Instruction shown to the learner').fill('Broken step');
  await ap.locator('.modal').getByLabel('FEN position').fill('7k/8/8/8/3R2p1/8/8/K7 w - - 0 1');
  await ap.locator('.modal').getByLabel('Accepted move').fill('d4e5'); await ap.locator('.modal').getByLabel('Accepted move').press('Enter');
  await ap.click('.modal >> text=Apply to lesson');
  await ap.click('text=Validate');
  await ap.waitForSelector('.problems');
  check('an illegal exercise move is flagged by the server-side chess rules', /not a legal move/.test(await ap.textContent('.problems')));
  // remove the broken step (second added step = step 3)
  await ap.locator('.step').nth(2).locator('text=Delete').click(); await ap.click('.modal button:has-text("Delete step")');
  // add a quiz
  await ap.getByLabel('Add a step').selectOption('quiz'); await ap.waitForSelector('.modal');
  await ap.locator('.modal').getByLabel('Question', { exact: true }).fill('How does a rook move?');
  await ap.locator('.modal').getByLabel('Option 1', { exact: true }).fill('In straight lines');
  await ap.locator('.modal').getByLabel('Option 2', { exact: true }).fill('Diagonally');
  await ap.locator('.modal').getByLabel('Explanation shown after answering').fill('Rooks slide along ranks and files.');
  await ap.click('.modal >> text=Apply to lesson');
  await ap.click('text=Validate');
  const valid = await toastText(ap, /Lesson is valid/); check('a complete lesson validates', valid, valid ? '' : await ap.locator('.problems').textContent({ timeout: 1000 }).catch(() => 'no problems box'));
  await ap.click('text=Preview lesson');
  const fl = ap.frameLocator('iframe.preview-frame');
  let previewOk = true; try { await fl.locator('#step-card').waitFor({ timeout: 8000 }); } catch { previewOk = false; }
  check('lesson preview runs the real lesson player in the iframe', previewOk);
  await ap.click('text=Save lesson');
  check('saving a published lesson works', await toastText(ap, /Saved and published/));
  await ap.goto(BASE + '/admin/#/lessons'); await ap.waitForSelector('table.data');
  await ap.fill('input[type=search]', 'E2E endgame'); await sleep(700);
  check('the lesson appears in the searchable list as Published', /Published/.test(await ap.textContent('tbody tr')) && /Expert/.test(await ap.textContent('tbody tr')));
}

// ============================================================ 4. the player site shows it; recommendations follow
{
  const { ctx, page } = await newCtx();
  const done = Object.fromEntries((await (await fetch(BASE + '/api/public/content')).json()).lessons.filter((l) => l.level === 'expert' && l.id !== newLessonId).map((l) => [l.id, new Date().toISOString()]));
  const p = await learnerPage(ctx, 'expert', { lessons: { done, scores: {}, attempts: {} } });
  await p.goto(BASE + '/#/learn'); await sleep(1500);
  const rec = await p.evaluate(async () => (await import('/js/progress.js')).recommendedLesson()?.id);
  check('learner assessed as Expert is recommended the newly published lesson', rec === newLessonId, String(rec));
  const listed = await p.evaluate(() => document.body.innerText.includes('E2E endgame lesson'));
  check('the new lesson is listed on the player Learn page', listed);
  await p.goto(BASE + '/#/learn/' + newLessonId); await sleep(800);
  const title = await p.textContent('h2');
  check('the new lesson opens and plays in the player', /E2E endgame lesson/.test(title), title);
  await p.waitForSelector('#next-btn'); await sleep(4600); // usage events are batched for a few seconds before they are sent
  // unpublish via the admin list and confirm the learner no longer sees it (after the content reloads)
  await ap.goto(BASE + '/admin/#/lessons'); await ap.waitForSelector('table.data'); await ap.fill('input[type=search]', 'E2E endgame'); await sleep(700);
  await ap.click('tbody tr >> text=Unpublish'); check('unpublish toast', await toastText(ap, /unpublished/));
  await p.goto(BASE + '/#/learn'); await p.reload(); await sleep(1500);
  const gone = await p.evaluate(() => !document.body.innerText.includes('E2E endgame lesson'));
  check('unpublished lessons disappear from the player site', gone);
  const rec2 = await p.evaluate(async () => (await import('/js/progress.js')).recommendedLesson()?.id ?? null);
  check('…and the recommendation updates accordingly', rec2 !== newLessonId, String(rec2));
  await ctx.close();
}

// ============================================================ 5. delete with confirmation
{
  await ap.goto(BASE + '/admin/#/lessons'); await ap.waitForSelector('table.data'); await ap.fill('input[type=search]', 'E2E endgame'); await sleep(700);
  await ap.click('tbody tr >> text=Delete');
  await ap.waitForSelector('.modal');
  const okBtn = ap.locator('.modal button.danger');
  check('delete is disabled until the id is typed', await okBtn.isDisabled());
  await ap.fill('.modal input', newLessonId);
  check('typing the id enables the delete button', await okBtn.isEnabled());
  await okBtn.click();
  check('lesson deleted', await toastText(ap, /Lesson deleted/));
  await sleep(500);
  check('…and it is gone from the list', /No matches|Nothing/.test(await ap.textContent('.table-wrap')));
}

// ============================================================ 6. puzzles: record the solution on the board, validate, publish
{
  await ap.goto(BASE + '/admin/#/puzzles/new'); await ap.waitForSelector('text=Position & solution');
  await ap.getByLabel('FEN position').fill('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  await ap.click('button:has-text("Play moves")');
  const fl = ap.frameLocator('iframe.preview-frame').first();
  await fl.locator('.sq[data-sq="d1"]').waitFor({ timeout: 8000 });
  await sleep(500);
  await fl.locator('.sq[data-sq="d1"]').click(); await fl.locator('.sq[data-sq="d8"]').click();
  await ap.waitForSelector('.chip:has-text("Solver: d1d8")');
  check('a solution move played on the preview board is recorded', true);
  await ap.getByLabel('Puzzle id').fill('e2e-back-rank');
  await ap.getByLabel('Tactical category').selectOption('mate1');
  await ap.getByLabel('Hint', { exact: true }).fill('The king has no escape squares.');
  await ap.getByLabel('Explanation shown after solving').fill('Rd8# — back-rank mate.');
  await ap.click('text=Validate solution');
  await ap.waitForSelector('.notice.good');
  check('validation reports the solution (SAN) from the chess rules', /1\.Rd8#/.test(await ap.textContent('.notice.good')));
  await ap.click('text=Test on the board');
  let tested = true; try { await ap.frameLocator('iframe.preview-frame').last().locator('.board').waitFor({ timeout: 8000 }); } catch { tested = false; }
  check('“Test on the board” loads the interactive puzzle', tested);
  await ap.click('text=Validate & publish');
  check('puzzle published', await toastText(ap, /Saved and published/));
  const pub = await (await fetch(BASE + '/api/public/content')).json();
  check('published puzzle is in the public bundle', pub.puzzles.some((p) => p.id === 'e2e-back-rank'));
  // wrong first move fails validation
  await ap.goto(BASE + '/admin/#/puzzles/new'); await ap.waitForSelector('text=Position & solution');
  await ap.getByLabel('FEN position').fill('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  await ap.getByLabel('Puzzle id').fill('e2e-bad'); await ap.getByLabel('Tactical category').selectOption('mate1');
  await ap.click('text=Validate solution'); await ap.waitForSelector('.problems');
  check('a puzzle without a solution is rejected', /moves/.test(await ap.textContent('.problems')));
  await ap.evaluate(() => { location.hash = '#/puzzles'; });
  await ap.waitForSelector('.modal', { timeout: 3000 }).catch(() => {});
  if (await ap.$('.modal')) { check('leaving with unsaved changes asks for confirmation', true); await ap.click('.modal >> text=Discard and leave'); }
  else check('leaving with unsaved changes asks for confirmation', false, 'no dialog');
}

// ============================================================ 7. themes: board theme + uploaded piece set, default, player + offline
{
  await ap.goto(BASE + '/admin/#/themes'); await ap.waitForSelector('.theme-card');
  await ap.click('text=New board theme');
  await ap.locator('.modal').getByLabel('Name').fill('Ocean');
  await ap.locator('.modal').getByLabel('Light squares hex').fill('#dbe9f4'); await ap.locator('.modal').getByLabel('Dark squares hex').fill('#4f7ba6');
  await ap.click('.modal >> text=Create theme');
  check('board theme created', await toastText(ap, /Saved/));
  await ap.click('button[role=tab]:has-text("Piece sets")');
  await ap.click('text=New piece set');
  await ap.locator('.modal').getByLabel('Name').fill('Coins');
  await ap.locator('.modal').getByLabel('Type').selectOption('assets');
  await ap.click('.modal >> text=Create');
  await ap.waitForSelector('.slot');
  const inputs = ap.locator('.slot input[type=file]');
  check('12 upload slots are offered', (await inputs.count()) === 12);
  // a script-bearing SVG is refused with the server message
  const evil = join(assetDir, 'evil.svg'); writeFileSync(evil, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>');
  await inputs.nth(0).setInputFiles(evil);
  await ap.waitForSelector('.slot div[style*="danger"]');
  check('a malicious SVG upload is rejected in the UI', /script/i.test(await ap.textContent('.slot div[style*="danger"]')));
  const exe = join(assetDir, 'tool.svg'); writeFileSync(exe, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300)]));
  await inputs.nth(1).setInputFiles(exe);
  await ap.waitForFunction(() => document.querySelectorAll('.slot div[style*="danger"]').length >= 2 || [...document.querySelectorAll('.slot div[style*="danger"]')].some((d) => /image/i.test(d.textContent)));
  check('an executable disguised as .svg is rejected', true);
  const order = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
  for (let i = 0; i < 12; i++) { await inputs.nth(i).setInputFiles(svgFiles[order.indexOf(['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'][i])]); await sleep(120); }
  await ap.waitForFunction(() => document.querySelectorAll('.slot img').length === 12, null, { timeout: 8000 });
  check('all 12 piece images upload and show thumbnails', true);
  await ap.click('.modal >> text=Done'); await sleep(500);
  const card = ap.locator('.theme-card', { hasText: 'Coins' });
  await card.locator('input[type=checkbox]').check(); check('complete image set can be enabled', await toastText(ap, /Enabled/));
  await sleep(500);
  await ap.locator('.theme-card', { hasText: 'Coins' }).locator('text=Make default').click(); check('piece set made default', await toastText(ap, /Default updated/));
  await ap.click('button[role=tab]:has-text("Board themes")');
  await ap.locator('.theme-card', { hasText: 'Ocean' }).locator('text=Make default').click(); check('board theme made default', await toastText(ap, /Default updated/));
}
let visitor;
{
  const { ctx, page } = await newCtx();
  visitor = { ctx, page };
  await page.goto(BASE + '/#/welcome'); await page.waitForSelector('#app:not([hidden])'); await sleep(500);
  await page.evaluate(async () => { const { store } = await import('/js/store.js'); await store.update('profile', (x) => Object.assign(x, { onboarded: true, level: 'beginner', levelSource: 'manual' })); });
  await page.goto(BASE + '/#/settings'); await sleep(1200);
  const st = await page.evaluate(() => ({ board: document.querySelector('#preview .board')?.dataset.board, pieces: document.querySelector('#preview .board')?.dataset.pieces, img: !!document.querySelector('#preview img.piece-img'), swatches: [...document.querySelectorAll('#sw-board .swatch')].map((s) => s.textContent.trim()) }));
  check('new visitors get the admin-chosen default board theme + piece set', st.board === 'ocean' && st.pieces !== 'classic', JSON.stringify(st));
  check('player settings list the new theme and render uploaded piece images', st.swatches.includes('Ocean') && st.img, JSON.stringify(st));
  // play: image pieces in a real game, touch-style click move
  await page.goto(BASE + '/#/play'); await sleep(800);
  await page.click('#start, button:has-text("Start game")').catch(() => {});
  await sleep(1200);
  const imgs = await page.$$eval('.board-pieces img.piece-img', (els) => els.length);
  check('the game board renders the uploaded piece images (32 pieces)', imgs === 32, String(imgs));
  const sqC = async (sq) => { const b = await page.locator(`.board .sq[data-sq="${sq}"]`).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  let [x, y] = await sqC('e2'); await page.mouse.click(x, y); [x, y] = await sqC('e4'); await page.mouse.click(x, y); await sleep(600);
  const moved = await page.$$eval('.board-pieces .piece', (els) => els.some((e) => e.dataset.sq === 'e4'));
  check('moves still work with custom pieces (legal move, computer replies)', moved);
  // offline: the service worker + cached bundle keep custom content available
  await page.goto(BASE + '/#/settings'); await page.waitForFunction(() => navigator.serviceWorker?.controller || true); await sleep(2500);
  await page.reload(); await sleep(1500);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await sleep(1200);
  const off = await page.evaluate(() => ({ board: document.querySelector('#preview .board')?.dataset.board, img: !!document.querySelector('#preview img.piece-img'), loaded: [...document.querySelectorAll('#preview img.piece-img')].every((i) => i.complete && i.naturalWidth > 0) }));
  check('offline: custom theme and uploaded piece images still work', off.board === 'ocean' && off.img && off.loaded, JSON.stringify(off));
  await ctx.setOffline(false);
}

// ============================================================ 8. settings persist and change the player site
{
  await ap.goto(BASE + '/admin/#/settings'); await ap.waitForSelector('text=Computer difficulty levels');
  await ap.getByLabel('Enable level 8').uncheck();
  await ap.getByLabel('Level 1 name').fill('Starter');
  await ap.getByLabel('Quiz pass ratio').fill('0.8');
  await ap.click('text=Save settings');
  check('settings saved', await toastText(ap, /Saved/));
  await ap.reload(); await ap.waitForSelector('text=Computer difficulty levels');
  check('settings persist after reload', (await ap.getByLabel('Quiz pass ratio').inputValue()) === '0.8' && (await ap.getByLabel('Level 1 name').inputValue()) === 'Starter' && !(await ap.getByLabel('Enable level 8').isChecked()));
  // server-side validation shows in the UI
  await ap.getByLabel('Mastery threshold').fill('0.99'); await ap.click('text=Save settings');
  await ap.waitForSelector('.problems'); check('invalid thresholds are rejected with a message', /assessment/.test(await ap.textContent('.problems')));
  await ap.reload();
  const { ctx, page } = await newCtx();
  const p = await learnerPage(ctx, 'beginner');
  await p.goto(BASE + '/#/play'); await sleep(1500);
  const levels = await p.$$eval('#levels .level-card', (els) => els.map((e) => e.textContent));
  check('player “Play” shows renamed level and hides the disabled one', levels.length === 7 && /Starter/.test(levels[0]), levels.join('|'));
  await ctx.close();
}

// ============================================================ 9. dashboard reflects real player activity
{
  await ap.goto(BASE + '/admin/#/dashboard'); await ap.waitForSelector('.stat .v');
  const text = await ap.textContent('#view');
  check('dashboard shows lessons/puzzles/learners from the database', /Published lessons/.test(text) && /Active learners/.test(text));
  const activity = await ap.locator('text=Lesson started').count();
  check('player lesson activity is visible in “Recent activity”', activity > 0);
  await ap.goto(BASE + '/admin/#/users'); await ap.waitForSelector('.notice.warn');
  check('Users page explains there are no central accounts', /No central user accounts/.test(await ap.textContent('.notice.warn')));
  await ap.goto(BASE + '/admin/#/audit'); await ap.waitForSelector('table.data');
  const audit = await ap.textContent('table.data');
  check('audit log lists the administrative actions performed above', /lesson\.create/.test(audit) && /pieceSet\.upload/.test(audit) && /settings\.update/.test(audit));
}

// ============================================================ 10. responsive admin (mobile) + touch
{
  const { ctx, page } = await newCtx({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  await login(page);
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile: sidebar is hidden behind a menu button', await page.locator('.burger').isVisible() && !(await page.locator('.side').evaluate((el) => el.getBoundingClientRect().right > 10)));
  await page.locator('.burger').tap(); await sleep(350);
  check('mobile: menu button opens the navigation drawer', await page.locator('.side').evaluate((el) => el.getBoundingClientRect().left >= -1));
  await page.locator('.nav a[data-nav=lessons]').tap(); await page.waitForSelector('table.data'); await sleep(500);
  check('mobile: navigating closes the drawer', await page.locator('.side').evaluate((el) => el.getBoundingClientRect().right <= 10));
  for (const route of ['dashboard', 'lessons', 'lessons/b-pieces', 'puzzles', 'puzzles/new', 'themes', 'settings', 'users', 'audit', 'admins']) {
    await page.goto(BASE + '/admin/#/' + route); await sleep(1400);
    const o = await overflow();
    const tableScroll = await page.evaluate(() => [...document.querySelectorAll('.table-wrap')].every((w) => w.scrollWidth >= w.clientWidth));
    check(`mobile layout: ${route} fits the screen (no page-level horizontal scroll)`, o <= 1 && tableScroll, `overflow ${o}px`);
  }
  await ctx.close();
  // player site: touch move on a phone-sized board
  const m = await newCtx({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const p = await learnerPage(m.ctx, 'beginner');
  await p.goto(BASE + '/#/play'); await sleep(1000);
  await p.click('button:has-text("Start game")').catch(() => {}); await sleep(1200);
  const center = async (sq) => { const b = await p.locator(`.board .sq[data-sq="${sq}"]`).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  let [x, y] = await center('g1'); await p.touchscreen.tap(x, y); [x, y] = await center('f3'); await p.touchscreen.tap(x, y); await sleep(700);
  const ok = await p.$$eval('.board-pieces .piece', (els) => els.some((e) => e.dataset.sq === 'f3' && e.dataset.type === 'n'));
  const fit = await p.evaluate(() => { const b = document.querySelector('.board').getBoundingClientRect(); return b.width <= window.innerWidth && Math.abs(b.width - b.height) < 2; });
  check('mobile player: tap-to-move works with the custom piece set and the board fits', ok && fit, `moved ${ok} fit ${fit}`);
  await m.ctx.close();
}

// ============================================================ 11. regression: players without the admin server unaffected
check('no unexpected console errors or warnings in any scenario', consoleErrors.filter((e) => !/Failed to load resource: the server responded with a status of (401|403|422|400|409)/.test(e) && !/ERR_INTERNET_DISCONNECTED/.test(e)).length === 0, consoleErrors.filter((e) => !/status of (401|403|422|400|409)|ERR_INTERNET/.test(e)).slice(0, 5).join('\n'));

await browser.close(); await srv.stop(); removeDir(dir);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
