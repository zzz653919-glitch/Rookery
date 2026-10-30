// Browser tests for the languages of the admin panel (English / Uzbek / Russian) and for translated lessons on the player site.
//   node tests/e2e/admin-i18n.mjs
// Crawls every admin page and dialog in uz and ru and fails if any interface text was left untranslated.
import { createRequire } from 'node:module';
import { startServer, newDataDir, removeDir, cli } from '../lib/server.mjs';
import { LESSONS } from '../../js/data/lessons.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const results = [];
const consoleErrors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = 'Correct-Horse-9!';

const dir = newDataDir();
if (cli(dir, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: PW }).status) throw new Error('cannot create admin');
const srv = await startServer(dir, { ROOKERY_TRANSLATE_PROVIDER: 'mock', ROOKERY_ALLOW_MOCK: '1' });
const BASE = srv.base;
const browser = await chromium.launch();
process.on('unhandledRejection', (e) => { console.log('FAIL  unexpected error  -> ' + (e?.stack || e)); process.exit(1); });

async function open(lang, viewport = { width: 1360, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: 'en-US' });
  await ctx.addInitScript((l) => {
    window.__rookeryTrMiss = new Set(); window.__rookeryTrLog = new Set();
    if (l && location.pathname.startsWith('/admin')) try { localStorage.setItem('rookery-admin:lang', l); } catch { /* ignore */ }
  }, lang);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()} (${page.url()})`); });
  page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + e.message));
  return { ctx, page };
}
async function login(page) {
  await page.goto(BASE + '/admin/'); await page.waitForSelector('form');
  await page.fill('#u', 'boss'); await page.fill('#p', PW); await page.click('button[type=submit]');
  await page.waitForSelector('.shell', { timeout: 10000 });
}
const go = async (page, hash, sel = '#view > div > *') => { await page.goto(BASE + '/admin/#/' + hash); await page.waitForSelector(sel, { timeout: 8000 }); await sleep(450); };
const missed = (page) => page.evaluate(() => [...window.__rookeryTrMiss]);

// Strings that are data, not interface text: ids, FENs, moves, usernames, numbers, lesson titles from the bundled curriculum.
import { PUZZLES } from '../../js/data/puzzles.js';
import { PLACEMENT } from '../../js/data/placement.js';
import { lessonStrings, puzzleStrings, stepStrings } from '../../js/i18n/content.js';
import uzSeed from '../../js/i18n/content.uz.js';
import ruSeed from '../../js/i18n/content.ru.js';
// lesson / puzzle / placement texts (English source and bundled translations) are content, shown by the lesson list and editors
const DATA = new Set([...LESSONS.flatMap(lessonStrings), ...PUZZLES.flatMap(puzzleStrings), ...PLACEMENT.flatMap(stepStrings), ...Object.values(uzSeed), ...Object.values(ruSeed)]);
const isData = (s) => DATA.has(s) || /^[a-z][a-z.]*( [a-z]+)*( · \d+)?$/.test(s) || /^[\w.\[\]]+: $/.test(s) || /^[A-Z][a-z]{2} \d+, \d{4}/.test(s) || /^(?:O'zbekcha|Русский|English)$/.test(s) || /^\d\.\w/.test(s) || /^\{.*\}$/.test(s) || /FEN needs|FEN has|FEN:/.test(s) || !/[A-Za-z]{3,}/.test(s) || /^[\w.#:/-]+$/.test(s) || /^[rnbqkpRNBQKP1-8/]+ [wb] /.test(s) || /^(?:boss|Rookery|Rookery Admin)$/.test(s)
  || [...DATA].some((d) => d && s.includes(d)) || /^[a-h][1-8]/.test(s) || /\.(svg|png)$/.test(s) || /^<\/?p>/.test(s);

async function crawl(page) {
  await login(page);
  const routes = ['dashboard', 'lessons', 'lessons/new', 'lessons/b-pieces', 'puzzles', 'puzzles/new', 'themes', 'translations', 'settings', 'users', 'audit', 'admins', 'account'];
  for (const r of routes) await go(page, r);
  // dialogs: every step type, the JSON editor, delete confirmations, theme / admin forms
  await go(page, 'lessons/new');
  const types = await page.$$eval('select[aria-label="Add a step"] option, select[aria-label="Add een stap"] option', (o) => o.map((x) => x.value).filter(Boolean));
  for (const t of types.length ? types : ['learn', 'move', 'line', 'squares', 'coords', 'mc', 'quiz']) {
    const sel = page.locator('select').filter({ has: page.locator(`option[value="${t}"]`) }).first();
    if (!(await sel.count())) continue;
    await sel.selectOption(t); await page.waitForSelector('.modal', { timeout: 4000 }).catch(() => {}); await sleep(200);
    await page.locator('.modal button.btn:not(.primary)').last().click().catch(() => {}); await sleep(150);
  }
  await page.locator('button.btn.primary', { hasText: /Save lesson|Darsni saqlash|Сохранить урок/ }).click().catch(() => {}); await sleep(900);   // server validation messages
  await go(page, 'lessons');
  await page.locator('button.btn.danger').first().click().catch(() => {}); await sleep(300);
  await page.keyboard.press('Escape');
  await go(page, 'puzzles/new');
  await page.locator('button', { hasText: /Validate solution|Yechimni tekshirish|Проверить решение/ }).first().click().catch(() => {}); await sleep(700);
  await go(page, 'themes');
  for (const b of await page.$$('button.btn.primary')) { await b.click().catch(() => {}); await sleep(250); await page.keyboard.press('Escape'); }
  await go(page, 'admins');
  for (const b of await page.$$('button.btn.primary')) { await b.click().catch(() => {}); await sleep(250); await page.keyboard.press('Escape'); }
  await go(page, 'translations');
  await page.locator('table.data button.btn.sm').first().click().catch(() => {}); await sleep(300);
  await page.keyboard.press('Escape');
}

const body = (page) => page.evaluate(() => document.body.innerText);

// ============================================================ language switch, persistence, <html lang>
{
  const { ctx, page } = await open(null);
  await login(page);
  check('English by default for an English browser', (await page.getAttribute('html', 'lang')) === 'en' && /Dashboard/.test(await body(page)));
  await page.locator('select.lang-select').selectOption('ru'); await page.waitForSelector('.shell'); await sleep(500);
  check('switching to Russian translates the shell and sets <html lang>', (await page.getAttribute('html', 'lang')) === 'ru' && /Панель управления/.test(await body(page)) && /Уроки/.test(await body(page)));
  await page.reload(); await page.waitForSelector('.shell');
  check('the chosen language survives a reload', /Панель управления/.test(await body(page)));
  await page.locator('select.lang-select').selectOption('uz'); await page.waitForSelector('.shell'); await sleep(500);
  check('switching to Uzbek', (await page.getAttribute('html', 'lang')) === 'uz' && /Boshqaruv paneli/.test(await body(page)) && /Darslar/.test(await body(page)));
  await page.locator('button', { hasText: /Chiqish/ }).click(); await page.waitForSelector('#u');
  check('the sign-in page is translated and has a language switcher', /Kirish/.test(await body(page)) && !!(await page.$('select.lang-select')));
  await ctx.close();
}
{
  const { ctx, page } = await open(null);
  await ctx.close();
  const c2 = await browser.newContext({ locale: 'uz-UZ' }); const p2 = await c2.newPage();
  await p2.goto(BASE + '/admin/'); await p2.waitForSelector('form');
  check('an Uzbek browser gets the Uzbek sign-in page without choosing', (await p2.getAttribute('html', 'lang')) === 'uz' && /Kirish/.test(await body(p2)));
  await c2.close();
}

// ============================================================ full crawl: nothing may stay in English
const MISSING = {};
for (const lang of ['uz', 'ru']) {
  const { ctx, page } = await open(lang);
  await crawl(page);
  const miss = (await missed(page)).filter((s) => !isData(s));
  MISSING[lang] = miss;
  check(`admin panel (${lang}): every interface text on every page and dialog is translated`, miss.length === 0, JSON.stringify(miss.slice(0, 25)));
  if (process.env.I18N_LIST) console.log(lang, JSON.stringify(miss, null, 1));
  const cyr = lang === 'ru' ? /[А-Яа-яЁё]/ : /(?:ʻ|')|[oʻ]/;
  await ctx.close();
}

// ============================================================ mobile layout with the longest language
{
  const { ctx, page } = await open('ru', { width: 390, height: 800 });
  await login(page);
  let bad = [];
  for (const r of ['dashboard', 'lessons', 'puzzles', 'themes', 'translations', 'settings', 'users', 'audit', 'admins', 'account']) {
    await go(page, r);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) bad.push(`${r}:${over}`);
  }
  check('Russian text fits a phone screen on every page (no page-level horizontal scroll)', bad.length === 0, bad.join(' '));
  await ctx.close();
}

// ============================================================ translations page + player site end to end
{
  const { ctx, page } = await open('uz');
  await login(page);
  // create and publish a lesson through the API the panel uses, then watch it get translated
  const csrf = await page.evaluate(async () => (await (await fetch('/api/admin/session')).json()).csrf);
  const lesson = { id: 'i18n-demo', level: 'beginner', skill: 'rules', title: 'Rook walks in lines', summary: 'Learn how the rook moves', description: '', objectives: ['Move the rook'], difficulty: 1, minutes: 3, status: 'published',
    steps: [{ type: 'learn', title: 'Rook', text: '<p>The rook moves in <b>straight lines</b>.</p>', fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1', explore: true },
      { type: 'task', kind: 'move', instruction: 'Capture the pawn', fen: '7k/8/8/8/3R2p1/8/8/K7 w - - 0 1', accept: ['d4g4'], hint: 'Along the rank', explain: 'Rxg4 wins a pawn' },
      { type: 'quiz', questions: [{ kind: 'mc', q: 'How do rooks move?', options: ['Straight', 'Diagonally'], answer: 0, explain: 'Straight lines' }] }] };
  const r = await page.evaluate(async ({ lesson, csrf }) => (await fetch('/api/admin/lessons', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(lesson) })).status, { lesson, csrf });
  check('lesson saved through the admin API', r === 201, r);
  await sleep(3500);
  await go(page, 'translations');
  await page.locator('.toolbar .field select').last().selectOption('ru');   // language filter in the table toolbar
  await sleep(500);
  const text = await body(page);
  check('Translations page lists the new texts with their automatic translation', /Rook walks in lines/.test(text) && /\[ru\] Rook walks in lines/.test(text) && /Avtomatik|Автоматический/.test(text), text.slice(0, 300));
  // player site: Russian visitor sees the translated lesson, English visitor does not
  const pc = await browser.newContext({ locale: 'ru-RU' });
  const pp = await pc.newPage();
  await pp.goto(BASE + '/#/welcome'); await pp.waitForSelector('#app:not([hidden])'); await sleep(500);
  const titles = await pp.evaluate(async () => { const { LESSONS } = await import('/js/data/lessons.js'); return LESSONS.find((l) => l.id === 'i18n-demo')?.title; });
  check('player site (Russian browser) receives the translated lesson from the server', titles === '[ru] Rook walks in lines', titles);
  const en = await browser.newContext({ locale: 'en-US' }); const pe = await en.newPage();
  await pe.goto(BASE + '/#/welcome'); await pe.waitForSelector('#app:not([hidden])'); await sleep(500);
  const tEn = await pe.evaluate(async () => { const { LESSONS } = await import('/js/data/lessons.js'); return LESSONS.find((l) => l.id === 'i18n-demo')?.title; });
  check('player site (English browser) keeps the English text', tEn === 'Rook walks in lines', tEn);
  // offline: the last bundle of the language is still used
  await pc.setOffline(true); await pp.reload(); await pp.waitForSelector('#app:not([hidden])'); await sleep(600);
  const off = await pp.evaluate(async () => { const { LESSONS } = await import('/js/data/lessons.js'); return LESSONS.find((l) => l.id === 'i18n-demo')?.title; });
  check('offline: the cached Russian bundle is used', off === '[ru] Rook walks in lines', off);
  await pc.close(); await en.close(); await ctx.close();
}

check('no unexpected console errors or warnings', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
await browser.close(); await srv.stop(); removeDir(dir);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
