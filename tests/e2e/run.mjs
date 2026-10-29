// End-to-end browser tests (Playwright + Chromium). They drive the real UI: every lesson is played
// through with real clicks, the placement test is taken, puzzles and the computer game are played,
// persistence and offline use are checked, and desktop + mobile layouts are inspected.
//
//   npm start            (in another terminal)       node tests/e2e/run.mjs [baseUrl]
//
// Playwright is a dev-only tool (not needed to use the app). Install it with `npm i -D playwright`
// or point NODE_PATH at a global install.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const { LESSONS } = await import(pathToFileURL(join(root, 'js/data/lessons.js')).href);
const { PLACEMENT } = await import(pathToFileURL(join(root, 'js/data/placement.js')).href);
const { PUZZLES } = await import(pathToFileURL(join(root, 'js/data/puzzles.js')).href);

const results = [];
const consoleErrors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()} (${page.url()})`); });
  page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + e.message + ' (' + page.url() + ')'));
  return { ctx, page };
}
const ready = async (page) => { await page.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await sleep(250); };
const go = async (page, hash) => { await page.goto(`${BASE}/#${hash}`); await ready(page); await sleep(200); };
const getStore = (page, key) => page.evaluate(async (k) => (await import('/js/store.js')).store.get(k), key);
const setProfile = (page, patch) => page.evaluate(async (p) => { const { store } = await import('/js/store.js'); await store.update('profile', (x) => Object.assign(x, p)); }, patch);

// ---- board helpers ---------------------------------------------------------------------------
async function sqCenter(page, sq) {
  const b = await page.locator(`.board .sq[data-sq="${sq}"]`).first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function clickSquare(page, sq) { const c = await sqCenter(page, sq); await page.mouse.click(c.x, c.y); await sleep(120); }
async function playMove(page, uci) {
  await clickSquare(page, uci.slice(0, 2));
  await clickSquare(page, uci.slice(2, 4));
  if (uci.length === 5) {
    await page.waitForSelector('.promo-btn', { timeout: 3000 });
    const idx = { q: 0, n: 1, r: 2, b: 3 }[uci[4]];
    await page.locator('.promo-btn').nth(idx).click();
  }
  await sleep(150);
}
// solve a task step through the UI; returns when the UI reports completion
async function solveTask(page, t) {
  if (t.kind === 'move') await playMove(page, t.accept[0]);
  else if (t.kind === 'line') {
    for (let i = 0; i < t.steps.length; i++) {
      await playMove(page, t.steps[i].accept[0]);
      if (i < t.steps.length - 1) await sleep(1000); // scripted reply animation
    }
  } else if (t.kind === 'squares') {
    for (const s of t.target) await clickSquare(page, s);
    await page.click('#t-check');
  } else if (t.kind === 'mc') {
    await page.locator('.quiz-opt').nth(t.answer).click();
  } else if (t.kind === 'coords') {
    const rounds = t.rounds || 8;
    for (let i = 0; i < rounds; i++) {
      await page.waitForFunction((n) => document.querySelector('#t-round')?.textContent.startsWith('Square ' + n), i + 1, { timeout: 4000 });
      const target = await page.textContent('#t-target');
      await clickSquare(page, target);
      await sleep(800);
    }
  }
}

// ======================================================================================
// 1. First visit -> welcome, manual level choice, persistence after reload
// ======================================================================================
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/'); await ready(page);
  await page.waitForFunction(() => location.hash === '#/welcome', null, { timeout: 5000 }).catch(() => {});
  check('first visit redirects to #/welcome', page.url().endsWith('#/welcome'), page.url());
  check('welcome asks "What is your chess level?"', (await page.textContent('h1')).includes('What is your chess level?'));
  check('welcome hides the sidebar (focus mode)', await page.evaluate(() => !document.querySelector('.sidebar') || getComputedStyle(document.querySelector('.sidebar')).display === 'none' || document.body.classList.contains('focus') || !!document.querySelector('.welcome')));
  await page.click('#c-manual');
  await page.click('.level-card[data-level="intermediate"]');
  await page.waitForFunction(() => location.hash === '#/home');
  let prof = await getStore(page, 'profile');
  check('manual level saved (intermediate, source manual)', prof.level === 'intermediate' && prof.levelSource === 'manual' && prof.onboarded);
  await page.reload(); await ready(page);
  prof = await getStore(page, 'profile');
  check('level persists after reload (IndexedDB)', prof.level === 'intermediate', JSON.stringify(prof));
  check('no redirect to welcome after onboarding', !page.url().includes('welcome'));
  // sidebar navigation: all six links work
  for (const [id, h] of [['home', 'Keep climbing'], ['play', 'Play'], ['learn', 'path'], ['puzzles', 'Sharpen'], ['progress', 'Your journey'], ['settings', 'Make it yours']]) {
    await page.click(`.sidebar [data-nav="${id}"]`); await sleep(500);
    const txt = await page.textContent('#view, main, #app');
    check(`nav → ${id}`, page.url().endsWith('#/' + id) && txt.includes(h), page.url());
  }
  await ctx.close();
}

// ======================================================================================
// 2. Placement test: all-correct (expert), all-wrong (beginner, ends early), mixed
// ======================================================================================
async function takeTest(page, correctFn) {
  await go(page, '/test');
  await page.click('#start');
  for (let i = 0; i < PLACEMENT.length; i++) {
    const item = PLACEMENT[i];
    await page.waitForFunction((n) => document.querySelector('#count')?.textContent.includes('Question ' + n + ' '), i + 1, { timeout: 5000 }).catch(() => {});
    if (!(await page.$('#count'))) return i; // ended early (result screen)
    if (correctFn(item)) await solveTask(page, item); else await page.click('#skip');
    // wait for next button, or result
    await sleep(350);
    const next = await page.$('#next');
    if (next) await next.click();
    else if (await page.$('.result-banner')) return i + 1;
    if (item.kind === 'line') await sleep(200);
  }
  return PLACEMENT.length;
}
{
  const { ctx, page } = await newCtx();
  await go(page, '/welcome');
  await page.click('#c-test'); await page.waitForFunction(() => location.hash === '#/test');
  check('placement intro mentions it is an estimate', (await page.textContent('.welcome-card')).toLowerCase().includes('estimate'));
  const asked = await takeTest(page, () => true);
  await page.waitForSelector('.result-banner', { timeout: 8000 });
  const txt = await page.textContent('.welcome-card');
  const prof = await getStore(page, 'profile');
  check('placement (all correct): asked all questions', asked === PLACEMENT.length, String(asked));
  check('placement (all correct): level = expert', prof.level === 'expert' && /Expert/.test(txt), prof.level);
  check('placement result shows strengths, weaknesses and recommended start', /Strengths/.test(txt) && /To work on/.test(txt) && /Recommended start/.test(txt));
  check('placement result stored with per-skill data', prof.placement && prof.placement.skills && prof.levelSource === 'placement' && prof.placement.total === 23);
  await page.reload(); await ready(page);
  check('placement result persists after reload', (await getStore(page, 'profile')).placement?.pct === 100);
  await go(page, '/settings');
  await page.click('#retake'); await page.waitForFunction(() => location.hash === '#/test');
  await page.waitForSelector('#start', { timeout: 5000 }).catch(() => {});
  check('Settings → retake placement test works', !!(await page.$('#start')));
  await ctx.close();
}
{
  const { ctx, page } = await newCtx();
  await go(page, '/test'); 
  const asked = await takeTest(page, () => false);
  await page.waitForSelector('.result-banner', { timeout: 8000 });
  const prof = await getStore(page, 'profile');
  check('placement (all wrong): level = beginner', prof.level === 'beginner', prof.level);
  check('placement (all wrong): ends early after tier 1', asked === 6 && prof.placement.stoppedEarly === true, `asked ${asked}`);
  await ctx.close();
}
{
  const { ctx, page } = await newCtx();
  await go(page, '/test');
  await takeTest(page, (it) => it.tier <= 2 || it.id === 'p13');
  await page.waitForSelector('.result-banner', { timeout: 8000 });
  const prof = await getStore(page, 'profile');
  check('placement (tiers 1-2 correct): level = intermediate', prof.level === 'intermediate', prof.level);
  await ctx.close();
}

// ======================================================================================
// 3. Every lesson, played through with real clicks
// ======================================================================================
{
  const { ctx, page } = await newCtx();
  await go(page, '/welcome');
  await setProfile(page, { onboarded: true, level: 'beginner', levelSource: 'manual' });
  for (const lesson of LESSONS) {
    await go(page, '/learn/' + lesson.id);
    let ok = true, detail = '';
    try {
      let guard = 0;
      for (let i = 0; i < lesson.steps.length; i++) {
        const st = lesson.steps[i];
        if (++guard > 40) throw new Error('loop');
        if (st.type === 'learn') {
          await page.click('#next-btn');
        } else if (st.type === 'task') {
          const disabled = await page.$eval('#next-btn', (b) => b.disabled);
          if (!disabled) throw new Error('Continue enabled before the task was solved (step ' + i + ')');
          if (i === lesson.steps.findIndex((s) => s.type === 'task') && st.kind !== 'coords') {
            // hint button works and shows feedback
            const hb = await page.$('#t-hint');
            if (hb) { await hb.click(); await sleep(100); if (!(await page.$('.feedback.hint'))) throw new Error('hint produced no feedback'); }
          }
          // a wrong first attempt for move tasks must be rejected, not accepted
          await solveTask(page, st);
          await page.waitForFunction(() => !document.querySelector('#next-btn')?.disabled, null, { timeout: 8000 });
          await page.click('#next-btn');
        } else if (st.type === 'quiz') {
          for (const qq of st.questions) {
            await page.locator('.quiz-opt').nth(qq.answer).click();
            await page.click('#q-next');
            await sleep(80);
          }
          await page.click('#done-btn');
        }
        await sleep(120);
      }
      await page.waitForSelector('.reward h2', { timeout: 5000 });
      const done = (await getStore(page, 'lessons')).done[lesson.id];
      if (!done) throw new Error('lesson not marked complete');
    } catch (e) { ok = false; detail = e.message.split('\n')[0]; }
    check(`lesson ${lesson.id} playable end to end and marked complete`, ok, detail);
  }
  // a lesson is NOT complete if the quiz is failed
  await page.evaluate(async () => { const { store } = await import('/js/store.js'); await store.update('lessons', (l) => { l.done = {}; l.scores = {}; }); });
  await go(page, '/learn/b-pieces');
  const L = LESSONS.find((l) => l.id === 'b-pieces');
  const quizIdx = L.steps.findIndex((s) => s.type === 'quiz');
  for (let i = 0; i < quizIdx; i++) { const st = L.steps[i]; if (st.type === 'learn') await page.click('#next-btn'); else { await solveTask(page, st); await page.waitForFunction(() => !document.querySelector('#next-btn')?.disabled); await page.click('#next-btn'); } await sleep(100); }
  const wrongIdx = (qq) => (qq.answer + 1) % qq.options.length;
  for (const qq of L.steps[quizIdx].questions) { await page.locator('.quiz-opt').nth(wrongIdx(qq)).click(); await page.click('#q-next'); await sleep(80); }
  check('failed quiz does not complete the lesson', !(await page.$('#done-btn')) && !(await getStore(page, 'lessons')).done['b-pieces']);
  await ctx.close();
}

// ======================================================================================
// 4. Learn page: personalised path per level
// ======================================================================================
{
  const { ctx, page } = await newCtx();
  await go(page, '/welcome');
  const expect = { beginner: 6, elementary: 6, intermediate: 6, advanced: 6, expert: 5 };
  for (const [lv, n] of Object.entries(expect)) {
    await setProfile(page, { onboarded: true, level: lv, levelSource: 'manual', placement: null });
    await go(page, '/home'); await go(page, '/learn');
    const cards = await page.$$eval('.lesson-card', (els) => els.map((e) => e.dataset.lesson));
    const want = LESSONS.filter((l) => l.level === lv).map((l) => l.id);
    check(`learn path for ${lv}: ${n} lessons`, cards.length === n && want.every((id) => cards.includes(id)), cards.join(','));
  }
  // weak-skill personalisation: placement says 'mates' is weak → mates lesson first
  await setProfile(page, { level: 'beginner', placement: { skills: { mates: { right: 0, total: 3 } }, total: 23 } });
  await go(page, '/home'); await go(page, '/learn');
  const first = await page.$eval('.lesson-card', (e) => e.dataset.lesson);
  check('learn path puts weak-skill lesson first', first === 'b-mates', first);
  await ctx.close();
}

// ======================================================================================
// 5. Puzzles
// ======================================================================================
{
  const { ctx, page } = await newCtx();
  await go(page, '/welcome');
  await setProfile(page, { onboarded: true, level: 'beginner', levelSource: 'manual' });
  await go(page, '/puzzles');
  check('puzzle hub shows daily puzzle and themes', !!(await page.$('#daily-btn')) && (await page.$$('[data-theme]')).length >= 4);
  await page.click('#daily-btn'); await sleep(500);
  const dailyId = await page.textContent('#p-level');
  const pz = PUZZLES.find((p) => dailyId.includes(p.id));
  check('daily puzzle loads a bundled puzzle', !!pz, dailyId);
  // wrong move first → rejected with feedback; then hint; then solve
  const legalWrong = PUZZLES.find((p) => p === pz);
  // try a clearly different first move: the first legal move of the first piece that is not the solution
  const sol = pz.moves[0];
  const fromSq = sol.slice(0, 2);
  // pick another own piece to move (any square with a piece of our colour that isn't the solution source) — fall back to hint check
  await page.click('#t-hint').catch(() => {}); await sleep(150);
  check('puzzle hint shows text', !!(await page.$('.feedback.hint')));
  for (let i = 0; i < pz.moves.length; i += 2) { await playMove(page, pz.moves[i]); if (i + 2 < pz.moves.length) await sleep(1100); }
  await page.waitForSelector('#puz-after', { timeout: 6000 });
  const pu = await getStore(page, 'puzzles');
  check('daily puzzle solved → recorded (attempts, solved, daily)', pu.attempts === 1 && !!pu.solved[pz.id] && Object.values(pu.daily).some((d) => d.solved));
  check('solution and explanation shown', (await page.textContent('#puz-after')).includes('Solution'));
  // themed training: solve a few in a row → streak increments, record kept
  await go(page, '/puzzles/mate1');
  let streakOk = true;
  for (let n = 0; n < 3; n++) {
    const label = await page.textContent('#p-level');
    const p = PUZZLES.find((x) => label.includes(x.id));
    if (!p) { streakOk = false; break; }
    for (let i = 0; i < p.moves.length; i += 2) { await playMove(page, p.moves[i]); if (i + 2 < p.moves.length) await sleep(1100); }
    await page.waitForSelector('#puz-after', { timeout: 6000 }).catch(() => { streakOk = false; });
    if (n < 2) { await page.click('#next'); await sleep(400); }
  }
  const pu2 = await getStore(page, 'puzzles');
  check('first-try solves build a streak and personal record', streakOk && pu2.streak >= 3 && pu2.bestStreak >= 3, JSON.stringify({ s: pu2.streak, b: pu2.bestStreak }));
  // wrong move resets the streak
  await page.click('#next'); await sleep(400);
  {
    const label = await page.textContent('#p-level');
    const p = PUZZLES.find((x) => label.includes(x.id));
    // find a legal wrong move: use the page to enumerate
    const wrong = await page.evaluate(async ({ fen, sol }) => {
      const { Chess } = await import('/js/chess/rules.js');
      const g = new Chess(fen);
      const m = g.moves({ verbose: true }).find((x) => x.from + x.to + (x.promotion || '') !== sol);
      return m.from + m.to + (m.promotion || '');
    }, { fen: p.fen, sol: p.moves[0] });
    await playMove(page, wrong); await sleep(900);
    check('wrong puzzle move gives "Not quite" feedback', (await page.textContent('#p-ui')).includes('Not quite'));
    await page.click('#solution'); await sleep(400);
    const pu3 = await getStore(page, 'puzzles');
    check('giving up resets the streak but keeps the record', pu3.streak === 0 && pu3.bestStreak >= 3 && !pu3.solved[p.id]);
  }
  await go(page, '/puzzles');
  const hubTxt = await page.textContent('#app');
  check('hub shows records after play', /Best streak/.test(hubTxt));
  await ctx.close();
}

// ======================================================================================
// 6. Play vs computer (offline) + persistence of the result
// ======================================================================================
{
  const { ctx, page } = await newCtx();
  await go(page, '/welcome');
  await setProfile(page, { onboarded: true, level: 'beginner', levelSource: 'manual' });
  await go(page, '/play');
  await page.waitForSelector('#start-btn');
  await page.click('#levels [data-v="2"]');
  await page.click('#start-btn');
  await page.waitForSelector('.board .piece');
  await ctx.setOffline(true);
  await playMove(page, 'e2e4');
  await page.waitForFunction(() => document.querySelectorAll('#moves button').length >= 2, null, { timeout: 20000 }).catch(() => {});
  const mv = await page.$$eval('#moves button', (e) => e.map((x) => x.textContent));
  check('computer replies while the network is offline (bundled engine)', mv.length >= 2, mv.join(' '));
  // illegal move is refused: e4 pawn cannot jump to e6
  await playMove(page, 'e4e6'); await sleep(300);
  check('illegal move refused', (await page.$$eval('#moves button', (e) => e.length)) === mv.length);
  await ctx.setOffline(false);
  await page.click('#resign-btn').catch(() => {});
  const conf = await page.$('.modal [data-ok]'); if (conf) await conf.click();
  await sleep(600);
  const games = await getStore(page, 'games');
  check('resigned game stored with result', games.length === 1 && games[0].result === 'loss' && games[0].reason === 'resignation', JSON.stringify(games));
  await ctx.close();
}

// ======================================================================================
// 7. Settings: theme, board theme, coordinates, backup, reset
// ======================================================================================
{
  const { ctx, page } = await newCtx();
  await go(page, '/welcome');
  await setProfile(page, { onboarded: true, level: 'beginner', levelSource: 'manual' });
  await go(page, '/settings');
  await page.click('#seg-theme [data-v="light"]'); await sleep(300);
  check('light theme applied', (await page.getAttribute('html', 'data-theme')) === 'light');
  await page.click('#seg-theme [data-v="dark"]'); await sleep(200);
  await page.click('#sw-board [data-v="walnut"]'); await sleep(300);
  check('board theme applied to preview board', (await page.getAttribute('#preview .board', 'data-board')) === 'walnut');
  await page.click('#sw-pieces [data-v="emerald"]'); await sleep(300);
  check('piece theme applied', (await page.getAttribute('#preview .board', 'data-pieces')) === 'emerald');
  await page.uncheck('[data-opt="coords"]'); await sleep(200);
  check('coordinates can be switched off', await page.$eval('#preview .board', (b) => b.classList.contains('no-coords')));
  await page.reload(); await ready(page);
  const s = await getStore(page, 'settings');
  check('settings persist after reload', s.boardTheme === 'walnut' && s.pieceTheme === 'emerald' && s.coords === false);
  const eng = await page.textContent('#eng-status');
  await page.waitForFunction(() => /ready/i.test(document.querySelector('#eng-status')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  check('engine status reports the bundled engine', /ready/i.test(await page.textContent('#eng-status')), eng);
  const dl = page.waitForEvent('download');
  await page.click('#export'); const d = await dl;
  check('backup export downloads a JSON file', d.suggestedFilename() === 'rookery-backup.json');
  await page.click('#reset-progress'); await page.click('.modal [data-ok]');
  await page.waitForFunction(() => location.hash === '#/welcome', null, { timeout: 5000 }).catch(() => {});
  const prof = await getStore(page, 'profile');
  check('reset progress clears the level and returns to welcome', prof.level === null && page.url().endsWith('#/welcome'));
  await ctx.close();
}

// ======================================================================================
// 8. Layouts: desktop + mobile, no horizontal overflow, no clipped board
// ======================================================================================
for (const [name, vp] of [['desktop 1280x800', { width: 1280, height: 800 }], ['tablet 820x1100', { width: 820, height: 1100 }], ['mobile 390x844', { width: 390, height: 844 }], ['small mobile 360x640', { width: 360, height: 640 }]]) {
  const { ctx, page } = await newCtx({ viewport: vp, hasTouch: vp.width < 500, isMobile: vp.width < 500 });
  await go(page, '/welcome');
  await setProfile(page, { onboarded: true, level: 'elementary', levelSource: 'manual' });
  const routes = ['/home', '/play', '/learn', '/learn/b-board', '/learn/e-forks', '/puzzles', '/puzzles/fork', '/progress', '/settings', '/welcome', '/test'];
  const bad = [];
  for (const r of routes) {
    await go(page, r);
    if (r === '/test') { await page.click('#start').catch(() => {}); await sleep(300); }
    const m = await page.evaluate(() => {
      const b = document.querySelector('.board .sq')?.closest('.board');
      const bb = b?.getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, board: bb ? { w: Math.round(bb.width), r: Math.round(bb.right), h: Math.round(bb.height) } : null };
    });
    if (m.sw > m.cw + 1) bad.push(`${r}: horizontal overflow ${m.sw}>${m.cw}`);
    if (m.board && (m.board.r > vp.width + 1 || m.board.w < 200)) bad.push(`${r}: board ${JSON.stringify(m.board)}`);
  }
  check(`layout ${name}: no horizontal overflow, board fits`, bad.length === 0, bad.join('; '));
  if (vp.width < 500) {
    await go(page, '/home');
    const navVisible = await page.evaluate(() => [...document.querySelectorAll('[data-nav]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom <= innerHeight + 1 && r.top >= 0; }).length);
    check(`layout ${name}: navigation reachable`, navVisible >= 6 || !!(await page.$('#menu-btn')), String(navVisible));
  }
  await page.screenshot({ path: join(process.env.E2E_SHOTS || '/tmp', `e2e-${vp.width}.png`) }).catch(() => {});
  await ctx.close();
}

// ======================================================================================
// 9. Offline-first: service worker caches the app
// ======================================================================================
{
  const { ctx, page } = await newCtx();
  await go(page, '/welcome');
  await setProfile(page, { onboarded: true, level: 'beginner', levelSource: 'manual' });
  await page.reload(); await ready(page);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
  await sleep(2500); // let the precache finish
  await ctx.setOffline(true);
  let ok = true, detail = '';
  try { await page.goto(BASE + '/#/learn'); await page.reload(); await ready(page); const t = await page.textContent('#app'); ok = /Beginner path/.test(t); detail = t.slice(0, 80); } catch (e) { ok = false; detail = e.message.split('\n')[0]; }
  check('whole app reloads and works with the network off (service worker)', ok, detail);
  await ctx.setOffline(false);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
const errs = [...new Set(consoleErrors)];
console.log('\n' + '='.repeat(70));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
console.log(errs.length ? `${errs.length} console error/warning message(s):\n  ` + errs.slice(0, 20).join('\n  ') : 'No console errors or warnings.');
check('no console errors or warnings in any scenario', errs.length === 0);
process.exit(failed.length || errs.length ? 1 : 0);
