// Interactive lesson player.
import { Chess } from '../chess/rules.js';
import { BoardView, piecesFromGame, legalTargetsFor } from '../ui/board.js';
import { runTask, runChoice } from '../ui/task.js';
import { esc, icon, emptyState, toast } from '../ui/dom.js';
import { store, markActivity, recordSkill } from '../store.js';
import { LESSONS } from '../data/lessons.js';
import { LEVELS, SKILLS, levelById } from '../data/levels.js';
import { completeLesson, lessonDone, recommendedLesson, checkAchievements, lessonsForLevel } from '../progress.js';
import { play as sfx } from '../sound.js';
import { quizPassRatio } from '../content.js';
import { track } from '../telemetry.js';


export async function mount(root, { params, navigate }) {
  const lesson = LESSONS.find((l) => l.id === params.id);
  if (!lesson) {
    root.innerHTML = emptyState({ emoji: '🔎', title: 'Lesson not found', body: 'That lesson does not exist.', actionHtml: '<a class="btn primary" href="#/learn">Back to lessons</a>' });
    return;
  }
  const lv = levelById(lesson.level);
  const steps = lesson.steps;
  track('lesson_started', lesson.id, lesson.level);
  let idx = 0;
  let board = null;
  let current = null;       // active task runner
  let disposed = false;
  const solved = new Set(); // task step indices solved in this session
  const firstTry = new Map();
  let quizScore = null;
  let quizResult = null;

  root.innerHTML = `
    <div class="row spread wrap" style="margin-bottom:14px">
      <a class="btn ghost sm" href="#/learn">${icon('back', 16)} All lessons</a>
      <div class="row"><span class="chip">${esc(lv.name)}</span><span class="chip">${esc(SKILLS[lesson.skill] || lesson.skill)}</span>${lessonDone(lesson.id) ? '<span class="chip good">Completed</span>' : ''}</div>
    </div>
    <div class="lesson-layout">
      <section aria-label="Board"><div class="board-wrap"><div id="board"></div></div></section>
      <aside class="lesson-body">
        <div class="card">
          <div class="eyebrow">${esc(lv.name)} lesson</div>
          <h2 style="margin-bottom:10px">${esc(lesson.title)}</h2>
          ${lesson.objectives?.length ? `<ul class="muted" style="margin:0 0 10px;padding-left:18px;font-size:.9rem">${lesson.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
          <div class="step-dots" id="dots" aria-label="Lesson progress"></div>
        </div>
        <div class="card" id="step-card"><div id="step-title"></div><div id="step-text"></div><div id="step-ui"></div><div class="btn-row" id="step-nav" style="margin-top:16px"></div></div>
      </aside>
    </div>`;
  board = new BoardView(root.querySelector('#board'), { orientation: 'w', interactive: false });

  const dots = root.querySelector('#dots');
  const stepTitle = root.querySelector('#step-title');
  const stepText = root.querySelector('#step-text');
  const stepUi = root.querySelector('#step-ui');
  const stepNav = root.querySelector('#step-nav');

  function renderDots() {
    dots.innerHTML = steps.map((_, i) => `<i class="${i < idx || (i === idx && false) ? 'done' : i === idx ? 'cur' : ''}"></i>`).join('') + `<i class="${idx >= steps.length ? 'cur' : ''}"></i>`;
  }

  function clearStep() {
    current?.destroy?.();
    current = null;
    stepTitle.innerHTML = ''; stepText.innerHTML = ''; stepUi.innerHTML = ''; stepNav.innerHTML = '';
    board.setMarks([]); board.setArrows([]); board.setLastMove(null);
    board.opts.onSquareClick = null; board.opts.onMove = null; board.opts.canSelect = null; board.opts.legalTargets = null;
  }

  function navButtons({ canNext = true, nextLabel = 'Continue', showBack = true }) {
    stepNav.innerHTML = `
      ${showBack && idx > 0 ? `<button class="btn ghost" id="back-btn" type="button">${icon('back', 16)} Back</button>` : ''}
      <button class="btn primary" id="next-btn" type="button" ${canNext ? '' : 'disabled'}>${esc(nextLabel)} ${icon('arrow', 16)}</button>`;
    stepNav.querySelector('#back-btn')?.addEventListener('click', () => go(idx - 1));
    stepNav.querySelector('#next-btn').onclick = () => go(idx + 1);
  }

  function go(i) {
    if (disposed) return;
    idx = Math.max(0, i);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    clearStep();
    renderDots();
    if (idx >= steps.length) return renderComplete();
    const step = steps[idx];
    if (step.type === 'learn') return renderLearn(step);
    if (step.type === 'task') return renderTask(step);
    if (step.type === 'quiz') return renderQuiz(step);
  }

  // ---------------------------------------------------------------- learn
  function renderLearn(step) {
    stepTitle.innerHTML = `<h3>${esc(step.title)}</h3>`;
    stepText.innerHTML = `<div class="lesson-text">${step.text}</div>`;
    if (step.fen) {
      const g = new Chess(step.fen);
      board.setOrientation(step.orientation || 'w');
      board.setPosition(piecesFromGame(g));
      board.setCheck(g.checkSquare());
      if (step.marks) board.setMarks(step.marks);
      if (step.arrows) board.setArrows(step.arrows.map(([from, to, color]) => ({ from, to, color })));
      if (step.explore) setupExplore(step);
      else board.opts.interactive = false;
    }
    navButtons({});
  }

  // Free exploration: move the pieces around to see how they behave. Not graded.
  function setupExplore(step) {
    const startFen = step.fen;
    const color = startFen.split(' ')[1];
    let g = new Chess(startFen);
    stepUi.innerHTML = `<div class="notice info" style="margin-top:12px">${icon('info', 16)} Try it: click the piece to see where it can go, then move it. The board only allows legal moves.</div>
      <div class="btn-row" style="margin-top:10px"><button class="btn sm ghost" id="ex-reset" type="button">${icon('refresh', 16)} Reset position</button></div><div id="ex-fb"></div>`;
    const fb = stepUi.querySelector('#ex-fb');
    const reset = () => {
      g = new Chess(startFen);
      board.setPosition(piecesFromGame(g));
      board.setCheck(null); board.setLastMove(null);
      fb.innerHTML = '';
    };
    stepUi.querySelector('#ex-reset').onclick = reset;
    board.opts.interactive = true;
    board.opts.canSelect = (sq) => { const p = g.get(sq); return !!p && p.color === color; };
    board.opts.legalTargets = (sq) => legalTargetsFor(g, sq);
    board.opts.onMove = ({ from, to, promotion }) => {
      const mv = g.move({ from, to, promotion });
      if (!mv) return false;
      board.setPosition(piecesFromGame(g), { from: mv.from, to: mv.to });
      sfx(mv.captured ? 'capture' : 'move');
      // let the learner keep moving: hand the turn back to them
      const parts = g.fen().split(' ');
      parts[1] = color; parts[3] = '-';
      try {
        g = new Chess(parts.join(' '));
        board.setCheck(null);
        fb.innerHTML = mv.captured ? `<div class="feedback good">Captured a ${esc({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }[mv.captured] || 'piece')}!</div>` : '';
      } catch {
        fb.innerHTML = `<div class="feedback good">That gives check! The position will reset.</div>`;
        setTimeout(() => { if (!disposed) reset(); }, 1400);
      }
      return true;
    };
  }

  // ----------------------------------------------------------------- task
  function renderTask(step) {
    stepTitle.innerHTML = `<h3>${step.title ? esc(step.title) : 'Your turn'}</h3>`;
    if (step.text) stepText.innerHTML = `<div class="lesson-text">${step.text}</div>`;
    const key = idx;
    if (solved.has(key)) {
      // revisiting a solved exercise
      if (step.fen) { const g = new Chess(step.fen); board.setOrientation(step.orientation || g.turn()); board.setPosition(piecesFromGame(g)); board.setCheck(g.checkSquare()); }
      board.opts.interactive = false;
      stepUi.innerHTML = `<div class="feedback good">You already solved this exercise ✓<small>${step.explain || ''}</small></div>`;
      navButtons({});
      const redo = document.createElement('button');
      redo.className = 'btn'; redo.type = 'button'; redo.textContent = 'Try it again';
      redo.onclick = () => { solved.delete(key); render(); };
      stepNav.appendChild(redo);
      return;
    }
    navButtons({ canNext: false, nextLabel: 'Solve it to continue' });
    const taskObj = { ...step };
    current = runTask(taskObj, {
      board, ui: stepUi, mode: 'lesson',
      onDone: async (res) => {
        if (disposed) return;
        solved.add(key);
        firstTry.set(key, res.firstTry);
        await recordSkill(lesson.skill, res.firstTry);
        await markActivity();
        navButtons({});
      },
    });
  }

  // ----------------------------------------------------------------- quiz
  function renderQuiz(step) {
    stepTitle.innerHTML = `<h3>Final quiz</h3>`;
    const questions = step.questions;
    let q = 0, right = 0;
    const results = [];
    const ask = () => {
      if (disposed) return;
      stepUi.innerHTML = '';
      stepNav.innerHTML = '';
      stepText.innerHTML = `<div class="row spread" style="margin-bottom:8px"><span class="muted">Question ${q + 1} of ${questions.length}</span><span class="chip good">${right} correct</span></div>`;
      const holder = document.createElement('div');
      stepUi.appendChild(holder);
      current = runChoice(questions[q], {
        board, ui: holder, mode: 'lesson', singleAttempt: true,
        onDone: (res) => {
          results.push(res.ok);
          if (res.ok) right++;
          stepNav.innerHTML = `<button class="btn primary" id="q-next" type="button">${q + 1 < questions.length ? 'Next question' : 'See result'} ${icon('arrow', 16)}</button>`;
          stepNav.querySelector('#q-next').onclick = () => { q++; q < questions.length ? ask() : finishQuiz(); };
        },
      });
    };
    const finishQuiz = async () => {
      const score = right / questions.length;
      quizScore = Math.max(quizScore ?? 0, score);
      quizResult = { right, total: questions.length };
      for (const ok of results) await recordSkill(lesson.skill, ok);
      const pass = score >= quizPassRatio();
      sfx(pass ? 'win' : 'wrong');
      board.opts.interactive = false;
      stepText.innerHTML = '';
      stepUi.innerHTML = `<div class="reward"><div class="burst">${pass ? '🎉' : '💪'}</div><h3>${right} of ${questions.length} correct</h3>
        <p class="muted">${pass ? 'You passed the quiz.' : `You need at least ${Math.ceil(quizPassRatio() * questions.length)} correct to complete the lesson. Review and try again!`}</p></div>`;
      stepNav.innerHTML = pass
        ? `<button class="btn primary" id="done-btn" type="button">Finish lesson ${icon('arrow', 16)}</button>`
        : `<button class="btn primary" id="retry-btn" type="button">${icon('refresh', 16)} Try the quiz again</button><button class="btn ghost" id="review-btn" type="button">Review the lesson</button>`;
      stepNav.querySelector('#done-btn')?.addEventListener('click', () => go(steps.length));
      stepNav.querySelector('#retry-btn')?.addEventListener('click', () => render());
      stepNav.querySelector('#review-btn')?.addEventListener('click', () => go(0));
    };
    ask();
  }

  // ------------------------------------------------------------- complete
  async function renderComplete() {
    // all exercises must be solved (they gate the Continue button, but double check)
    const unsolved = steps.map((s, i) => ({ s, i })).filter(({ s, i }) => s.type === 'task' && !solved.has(i));
    const quizStep = steps.some((s) => s.type === 'quiz');
    if (unsolved.length || (quizStep && quizScore === null)) {
      stepUi.innerHTML = `<div class="feedback bad">Almost there — finish all the exercises and the quiz to complete this lesson.</div>`;
      stepNav.innerHTML = `<button class="btn primary" id="resume-btn" type="button">Go to the first unfinished step</button>`;
      const first = unsolved.length ? unsolved[0].i : steps.findIndex((s) => s.type === 'quiz');
      stepNav.querySelector('#resume-btn').onclick = () => go(first);
      return;
    }
    const was = lessonDone(lesson.id);
    await completeLesson(lesson.id, quizScore ?? 1);
    track('lesson_completed', lesson.id, lesson.level, Math.round((quizScore ?? 1) * 100));
    await store.update('lessons', (l) => { l.attempts[lesson.id] = (l.attempts[lesson.id] || 0) + 1; });
    await markActivity();
    const unlocked = await checkAchievements();
    unlocked.forEach((a) => toast(`🏆 Achievement unlocked: ${a.name}`, 'good'));
    if (disposed) return;
    const next = nextLesson();
    board.opts.interactive = false;
    stepTitle.innerHTML = '';
    stepUi.innerHTML = `<div class="reward"><div class="burst">🏅</div><h2>Lesson complete!</h2>
      <p class="muted">${was ? 'You revisited this lesson.' : 'Added to your progress.'}${quizResult ? ` Quiz: ${quizResult.right}/${quizResult.total}.` : ''}</p>
      <div class="row" style="justify-content:center"><span class="chip good">${icon('check', 14)} ${esc(lesson.title)}</span></div></div>`;
    stepNav.innerHTML = `${next ? `<a class="btn primary" href="#/learn/${next.id}">Next: ${esc(next.title)} ${icon('arrow', 16)}</a>` : ''}<a class="btn" href="#/learn">Back to lessons</a><a class="btn ghost" href="#/play">${icon('play', 16)} Play a game</a>`;
    sfx('win');
  }

  function nextLesson() {
    const rec = recommendedLesson();
    if (rec && rec.id !== lesson.id) return rec;
    const same = lessonsForLevel(lesson.level);
    const i = same.findIndex((l) => l.id === lesson.id);
    return same.slice(i + 1).find((l) => !lessonDone(l.id)) || null;
  }

  render();
  return () => { disposed = true; current?.destroy?.(); board?.destroy(); };
}
