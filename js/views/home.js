// Home: continue learning, daily puzzle, quick actions.
import { store, currentStreak, todayISO } from '../store.js';
import { levelById } from '../data/levels.js';
import { LESSONS } from '../data/lessons.js';
import { recommendedLesson, pathProgress, puzzleAccuracy } from '../progress.js';
import { esc, icon, ring } from '../ui/dom.js';
import { dailyPuzzle, puzzleLevelFor } from './puzzles.js';

export function mount(root) {
  const profile = store.get('profile'), lv = levelById(profile.level);
  const rec = recommendedLesson();
  const prog = lv ? pathProgress(lv.id) : { done: 0, total: 0, pct: 0 };
  const today = todayISO();
  const ds = store.get('puzzles').daily[today];
  const acc = puzzleAccuracy();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  root.innerHTML = `
    <section class="hero fade-in">
      <div><div class="eyebrow">${greet}</div>
        <h1>${lv ? `Keep climbing, ${esc(lv.name)}.` : 'Learn chess, one move at a time.'}</h1>
        <p>${lv ? esc(lv.focus) : 'Rookery is an offline chess academy: lessons that fit your level, puzzles, and a computer opponent — all on this device.'}</p>
        <div class="btn-row" style="margin-top:18px">
          ${lv ? (rec ? `<a class="btn primary lg" href="#/learn/${rec.id}">${icon('book', 18)} Continue: ${esc(rec.title)}</a>` : `<a class="btn primary lg" href="#/learn">${icon('book', 18)} Review your path</a>`)
               : `<a class="btn primary lg" href="#/welcome">${icon('target', 18)} Find my level</a>`}
          <a class="btn lg" href="#/play">${icon('play', 18)} Play the computer</a>
        </div></div>
      <div class="row" style="justify-content:center">${lv ? `<div style="text-align:center">${ring(prog.pct, `${Math.round(prog.pct * 100)}%`)}<p class="muted" style="margin:8px 0 0">${prog.done} of ${prog.total} ${esc(lv.name)} lessons</p></div>` : `<div style="font-size:5rem">♞</div>`}</div>
    </section>
    <div class="grid cols-3" style="margin-top:18px">
      <a class="card hover" href="#/puzzles/daily"><div class="eyebrow">${icon('clock', 14)} Daily puzzle</div><h3 style="margin:0">${ds?.solved ? 'Solved today ✓' : 'Ready when you are'}</h3><p class="muted" style="margin:6px 0 0">A fresh puzzle every day, matched to your level.</p></a>
      <a class="card hover" href="#/progress"><div class="eyebrow">${icon('flame', 14)} Streak</div><h3 style="margin:0">${currentStreak()} day${currentStreak() === 1 ? '' : 's'}</h3><p class="muted" style="margin:6px 0 0">${acc === null ? 'Solve a puzzle to start tracking accuracy.' : `Puzzle accuracy ${Math.round(acc * 100)}%.`}</p></a>
      <a class="card hover" href="#/learn"><div class="eyebrow">${icon('book', 14)} Curriculum</div><h3 style="margin:0">${LESSONS.length} lessons</h3><p class="muted" style="margin:6px 0 0">From the first move to master-level endgames.</p></a>
    </div>`;
  return () => {};
}
