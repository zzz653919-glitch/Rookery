// Placement test: mixed multiple-choice and interactive board tasks. The result is an ESTIMATE.
import { track } from '../telemetry.js';
import { Chess, START_FEN } from '../chess/rules.js';
import { BoardView, piecesFromGame } from '../ui/board.js';
import { runTask } from '../ui/task.js';
import { esc, icon, progressBar } from '../ui/dom.js';
import { store, markActivity } from '../store.js';
import { PLACEMENT, PLACEMENT_TIERS } from '../data/placement.js';
import { LEVELS, levelById } from '../data/levels.js';
import { scorePlacement } from '../placement-score.js';
import { t, th, tn } from '../i18n/core.js';
import { levelName, levelBlurb, skillName } from '../i18n/names.js';
import { lessonsForLevel, checkAchievements } from '../progress.js';
import { toast } from '../ui/dom.js';

export function mount(root, { navigate }) {
  let idx = 0, current = null, board = null, disposed = false, answered = false;
  const answers = [];
  let stoppedEarly = false;

  const items = PLACEMENT;

  function intro() {
    root.innerHTML = `
      <div class="welcome"><div class="welcome-card fade-in">
        <div class="eyebrow">${t('Placement test')}</div>
        <h1 style="margin:6px 0 10px">${t("Let's find your starting point")}</h1>
        <p class="muted" style="max-width:58ch;margin:0 auto 14px">${t('You will answer {n} questions: piece movement, check and checkmate, hanging pieces, forks, pins and skewers, opening principles, mates in one and two moves, and simple endgames. Some are multiple choice, some you solve on the board.', { n: items.length })}</p>
        <div class="notice info" style="max-width:58ch;margin:0 auto 22px;text-align:left">${icon('info', 16)} <span>${t('No feedback is shown while you answer. The questions get harder; if they become too hard the test ends early. The result is an <b>estimate</b> of your level — not an official rating — and you can retake it or choose a level yourself at any time.')}</span></div>
        <div class="btn-row" style="justify-content:center"><button class="btn primary lg" id="start" type="button">${t('Start the test')} ${icon('arrow', 16)}</button><a class="btn ghost" href="#/welcome">${t('Back')}</a></div>
      </div></div>`;
    root.querySelector('#start').onclick = begin;
  }

  function begin() {
    root.innerHTML = `
      <div class="test-head"><a class="btn ghost sm" href="#/welcome" id="exit">${icon('back', 16)} ${t('Exit')}</a><div class="progress" id="prog"></div><span class="chip" id="count"></span></div>
      <div class="lesson-layout">
        <section aria-label="${t('Board')}"><div class="board-wrap"><div id="board"></div></div></section>
        <aside class="lesson-body"><div class="card"><div id="q-ui"></div><div class="btn-row" id="q-nav" style="margin-top:16px"></div></div></aside>
      </div>`;
    board = new BoardView(root.querySelector('#board'), { orientation: 'w', interactive: false });
    ask();
  }

  function setBoard(item) {
    const fen = item.fen || START_FEN;
    const g = new Chess(fen);
    board.setOrientation(item.orientation || (item.fen ? g.turn() : 'w'));
    board.setPosition(piecesFromGame(g));
    board.setCheck(g.checkSquare());
    board.setMarks([]); board.setArrows([]); board.setLastMove(null);
    if (!item.fen) board.opts.interactive = false;
  }

  function ask() {
    if (disposed) return;
    current?.destroy?.();
    answered = false;
    const item = items[idx];
    root.querySelector('#prog').innerHTML = progressBar(idx / items.length);
    root.querySelector('#count').textContent = t('Question {n} of {total}', { n: idx + 1, total: items.length });
    const ui = root.querySelector('#q-ui');
    const nav = root.querySelector('#q-nav');
    nav.innerHTML = `<button class="btn ghost" id="skip" type="button">${t("I don't know")}</button>`;
    nav.querySelector('#skip').onclick = () => record(false, true);
    if (item.kind !== 'mc' || item.fen) setBoard(item); else setBoard({});
    // `mc` with no diagram: show the start position as a neutral backdrop
    current = runTask({ ...item }, { board, ui, mode: 'test', onDone: (res) => record(res.ok, false) });
  }

  function record(ok, skipped) {
    if (answered || disposed) return;
    answered = true;
    const item = items[idx];
    answers.push({ id: item.id, ok: !!ok, skipped: !!skipped });
    current?.destroy?.();
    board.opts.interactive = false;
    // finish of a tier: stop early when the tier was clearly failed (higher tiers cannot change the level)
    const tierItems = items.filter((i) => i.tier === item.tier);
    const lastOfTier = tierItems[tierItems.length - 1].id === item.id;
    if (lastOfTier) {
      const right = answers.filter((a) => tierItems.some((ti) => ti.id === a.id) && a.ok).length;
      if (right / tierItems.length < 0.4 && idx + 1 < items.length) { stoppedEarly = true; return finish(); }
    }
    idx++;
    if (idx >= items.length) return finish();
    const nav = root.querySelector('#q-nav');
    nav.innerHTML = `<button class="btn primary" id="next" type="button">${t('Next question')} ${icon('arrow', 16)}</button>`;
    nav.querySelector('#next').onclick = ask;
  }

  async function finish() {
    if (disposed) return;
    const result = scorePlacement(answers);
    result.stoppedEarly = stoppedEarly;
    result.answered = answers.length;
    await store.update('profile', (p) => {
      p.level = result.level; p.levelSource = 'placement'; p.levelDate = result.date; p.onboarded = true;
      p.placement = { level: result.level, pct: result.pct, right: result.right, total: result.total, tiers: result.tiers, skills: result.skills, strengths: result.strengths, weaknesses: result.weaknesses, date: result.date, stoppedEarly };
    });
    track('placement_completed', result.level, result.level, result.pct);
    await markActivity();
    (await checkAchievements()).forEach((a) => toast(t('🏆 Achievement unlocked: {name}', { name: t(a.name) }), 'good'));
    if (!disposed) renderResult(result);
  }

  function renderResult(r) {
    const lv = levelById(r.level);
    const path = lessonsForLevel(lv.id);
    const weakLesson = path.find((l) => r.weaknesses.includes(l.skill));
    const start = weakLesson || path[0];
    const bar = (v, tot) => `<div class="skill-row"><span>${esc(skillName(v.id))}</span>${progressBar(tot ? v.right / tot : 0)}<b>${v.right}/${tot}</b></div>`;
    root.innerHTML = `
      <div class="welcome"><div class="welcome-card fade-in" style="text-align:left">
        <div class="result-banner"><div class="emoji">🎯</div><div class="eyebrow">${t('Your estimated level')}</div>
          <h1 style="margin:4px 0">${esc(levelName(lv))}</h1><p class="muted">${esc(levelBlurb(lv))}</p>
          <p class="muted" style="font-size:.85rem">${t('You answered {right} of {total} questions correctly ({pct}%)', { right: r.right, total: r.total, pct: r.pct })}${r.stoppedEarly ? '. ' + t('The test ended early because the later questions were too hard') : ''}. ${t('This is an estimate, not an official rating.')}</p></div>
        <div class="grid cols-2" style="margin-top:20px">
          <div class="card"><h3>${t('Strengths')}</h3>${r.strengths.length ? `<div class="row wrap" style="margin-top:8px">${r.strengths.map((s) => `<span class="chip good">${icon('check', 14)} ${esc(skillName(s))}</span>`).join('')}</div>` : `<p class="muted">${t('No clear strengths yet — that is fine, this is where we start.')}</p>`}</div>
          <div class="card"><h3>${t('To work on')}</h3>${r.weaknesses.length ? `<div class="row wrap" style="margin-top:8px">${r.weaknesses.map((s) => `<span class="chip warn">${esc(skillName(s))}</span>`).join('')}</div>` : `<p class="muted">${t('Nothing stands out — great!')}</p>`}</div>
        </div>
        <div class="card" style="margin-top:14px"><h3>${t('By skill')}</h3><div class="stack" style="margin-top:10px">${Object.entries(r.skills).map(([id, v]) => bar({ id, right: v.right }, v.total)).join('')}</div></div>
        <div class="card" style="margin-top:14px"><div class="eyebrow">${t('Recommended start')}</div><h3 style="margin:2px 0 4px">${start ? esc(start.title) : t('Choose a lesson')}</h3>
          <p class="muted">${start ? esc(start.summary) : ''}${weakLesson ? ' ' + t('This lesson covers one of your weaker skills.') : ''}</p></div>
        <div class="btn-row" style="margin-top:18px;justify-content:center">
          ${start ? `<a class="btn primary lg" href="#/learn/${start.id}">${th('Start {title}', { title: start.title })} ${icon('arrow', 16)}</a>` : ''}
          <a class="btn" href="#/learn">${t('See my learning path')}</a>
          <a class="btn ghost" href="#/welcome">${t('Choose a different level')}</a>
          <button class="btn ghost" id="retake" type="button">${icon('refresh', 16)} ${t('Retake the test')}</button>
        </div>
      </div></div>`;
    root.querySelector('#retake').onclick = () => { answers.length = 0; idx = 0; stoppedEarly = false; board?.destroy(); begin(); };
  }

  intro();
  return () => { disposed = true; current?.destroy?.(); board?.destroy(); };
}
