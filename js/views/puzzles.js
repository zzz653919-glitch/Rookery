// Puzzles: themed training matched to your level, a daily puzzle, streaks and personal records.
import { Chess } from '../chess/rules.js';
import { BoardView, piecesFromGame } from '../ui/board.js';
import { runTask } from '../ui/task.js';
import { esc, icon, emptyState, progressBar, toast } from '../ui/dom.js';
import { store, todayISO, markActivity, recordSkill } from '../store.js';
import { PUZZLES } from '../data/puzzles.js';
import { LEVELS, levelIndex, THEMES } from '../data/levels.js';
import { checkAchievements, puzzleAccuracy } from '../progress.js';
import { play as sfx } from '../sound.js';
import { track } from '../telemetry.js';

export { THEMES }; // puzzle categories live in data/levels.js so remote content can update them
const LEVEL_NAMES = LEVELS.map((l) => l.name);

export const puzzleLevelFor = (levelId) => Math.max(1, levelIndex(levelId) + 1);
export const puzzlesFor = (theme, level) => PUZZLES.filter((p) => (!theme || theme === 'all' || p.theme === theme) && (!level || p.level === level));

// Deterministic daily puzzle: same puzzle for everybody with the same level on the same date.
export function dailyPuzzle(date = todayISO(), level = 1) {
  let pool = PUZZLES.filter((p) => p.level === level);
  if (!pool.length) pool = PUZZLES.filter((p) => Math.abs(p.level - level) <= 1);
  if (!pool.length) pool = PUZZLES;
  if (!pool.length) return null;
  let h = 7; for (const c of date + ':' + level) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

const stepsOf = (p) => {
  const steps = [];
  for (let i = 0; i < p.moves.length; i += 2) steps.push(p.moves[i + 1] ? { accept: [p.moves[i]], reply: p.moves[i + 1] } : { accept: [p.moves[i]] });
  return steps;
};

export function mount(root, { params, navigate }) {
  const mode = params.mode || null;
  let disposed = false, board = null, current = null;
  const profile = store.get('profile');
  const prefLevel = () => store.get('puzzles').level || puzzleLevelFor(profile.level || 'beginner');

  if (!PUZZLES.length) { root.innerHTML = emptyState({ emoji: '🧩', title: 'No puzzles bundled', body: 'Run <code>node scripts/build-puzzles.mjs</code> to generate the puzzle set.' }); return () => {}; }

  // ------------------------------------------------------------------ hub
  function hub() {
    const ps = store.get('puzzles');
    const lvl = prefLevel();
    const today = todayISO();
    const daily = dailyPuzzle(today, lvl);
    const dstate = ps.daily[today];
    const acc = puzzleAccuracy();
    root.innerHTML = `
      <header class="page-head"><div><div class="eyebrow">Puzzles</div><h1>Sharpen your tactics</h1><p>Every puzzle has one best move, checked by an engine. Hints and explanations are always available.</p></div></header>
      <div class="grid cols-4" style="margin-bottom:18px">
        <div class="card stat"><b>${Object.keys(ps.solved).length}</b><span>Puzzles solved</span></div>
        <div class="card stat"><b>${acc === null ? '—' : Math.round(acc * 100) + '%'}</b><span>First-try accuracy</span></div>
        <div class="card stat"><b>${ps.streak}</b><span>Current streak</span></div>
        <div class="card stat"><b>${ps.bestStreak}</b><span>Best streak (record)</span></div>
      </div>
      <div class="card" style="margin-bottom:18px;border-color:var(--accent)">
        <div class="row spread wrap"><div><div class="eyebrow">${icon('clock', 14)} Daily puzzle · ${esc(today)}</div>
          <h3 style="margin:0">${dstate?.solved ? 'Solved today ✓' : 'Today\'s puzzle is waiting'}</h3>
          <p class="muted" style="margin:4px 0 0">${esc(LEVEL_NAMES[lvl - 1])} level${dstate?.solved ? dstate.firstTry ? ' — solved on the first try!' : ' — solved with help.' : ''}</p></div>
          <a class="btn primary" href="#/puzzles/daily" id="daily-btn">${dstate?.solved ? 'Play again' : 'Solve it'} ${icon('arrow', 16)}</a></div></div>
      <div class="row spread wrap" style="margin-bottom:10px"><h3 style="margin:0">Train a theme</h3>
        <div class="row wrap" role="group" aria-label="Puzzle level">${LEVEL_NAMES.map((n, i) => `<button class="chip lvl-chip ${i + 1 === lvl ? 'good' : ''}" type="button" data-lvl="${i + 1}" aria-pressed="${i + 1 === lvl}">${esc(n)}</button>`).join('')}</div></div>
      <div class="grid auto">
        ${Object.entries(THEMES).map(([id, t]) => {
          const all = puzzlesFor(id, lvl), solved = all.filter((p) => ps.solved[p.id]).length;
          return `<div class="card"><h3 style="margin:0 0 4px">${esc(t.name)}</h3><p class="muted" style="margin:0 0 10px">${esc(t.desc)}</p>
            ${all.length ? `${progressBar(solved / all.length)}<div class="row spread" style="margin:8px 0 12px"><span class="muted">${solved}/${all.length} solved</span></div>
            <a class="btn sm" href="#/puzzles/${id}" data-theme="${id}">Start ${icon('arrow', 14)}</a>` : `<p class="muted">No puzzles at this level yet. Try another level.</p>`}</div>`;
        }).join('')}
        <div class="card"><h3 style="margin:0 0 4px">Mixed</h3><p class="muted" style="margin:0 0 10px">A bit of everything at your level.</p><a class="btn sm primary" href="#/puzzles/all" data-theme="all">Start ${icon('arrow', 14)}</a></div>
      </div>`;
    root.querySelectorAll('.lvl-chip').forEach((b) => { b.onclick = async () => { await store.update('puzzles', (p) => { p.level = +b.dataset.lvl; }); hub(); }; });
  }

  // --------------------------------------------------------------- player
  function player() {
    const lvl = prefLevel();
    const isDaily = mode === 'daily';
    const theme = isDaily ? 'all' : mode;
    if (!isDaily && mode !== 'all' && !THEMES[mode]) return navigate('/puzzles');
    let queue = [];
    const nextFromPool = () => {
      const ps = store.get('puzzles');
      let pool = puzzlesFor(theme, lvl);
      if (!pool.length) pool = puzzlesFor(theme, 0);
      const fresh = pool.filter((p) => !ps.solved[p.id] && !queue.includes(p.id));
      const pick = (fresh.length ? fresh : pool.filter((p) => p.id !== (queue[queue.length - 1]))) ;
      const p = pick[Math.floor(Math.random() * pick.length)] || pool[0];
      queue.push(p.id);
      return p;
    };
    root.innerHTML = `
      <div class="row spread wrap" style="margin-bottom:14px"><a class="btn ghost sm" href="#/puzzles">${icon('back', 16)} All puzzles</a>
        <div class="row wrap"><span class="chip">${isDaily ? 'Daily puzzle' : esc(theme === 'all' ? 'Mixed' : THEMES[theme].name)}</span><span class="chip" id="p-level"></span><span class="chip good" id="p-streak"></span></div></div>
      <div class="lesson-layout">
        <section aria-label="Board"><div class="board-wrap"><div id="board"></div></div></section>
        <aside class="lesson-body"><div class="card"><div class="eyebrow" id="p-turn"></div><div id="p-ui"></div><div class="btn-row" id="p-nav" style="margin-top:14px"></div></div></aside>
      </div>`;
    board = new BoardView(root.querySelector('#board'), { orientation: 'w', interactive: false });
    const ui = root.querySelector('#p-ui'), nav = root.querySelector('#p-nav');

    function load(p) {
      if (disposed) return;
      current?.destroy?.();
      let finished = false;
      const turn = p.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
      root.querySelector('#p-turn').textContent = `${turn} to move`;
      root.querySelector('#p-level').textContent = `${LEVEL_NAMES[p.level - 1]} · ${p.id}`;
      root.querySelector('#p-streak').innerHTML = `${icon('flame', 12)} Streak ${store.get('puzzles').streak}`;
      nav.innerHTML = `<button class="btn ghost" id="solution" type="button">Show solution</button>`;
      const instr = p.moves.length === 1 ? 'Find the best move.' : `Find the best move — then keep going: there are ${Math.ceil(p.moves.length / 2)} moves to find.`;
      const finish = async (ok, firstTry) => {
        if (finished) return;
        finished = true;
        await record(p, ok, firstTry, isDaily);
        if (disposed) return;
        root.querySelector('#p-streak').innerHTML = `${icon('flame', 12)} Streak ${store.get('puzzles').streak}`;
        const fb = ui.querySelector('#puz-after') || document.createElement('div');
        fb.id = 'puz-after';
        fb.innerHTML = `<div class="feedback ${ok ? 'good' : 'bad'}" style="margin-top:12px">${ok ? (firstTry ? 'Solved on the first try! 🎉' : 'Solved — with a little help.') : 'Not this time.'}<small>${esc(p.explain)} Solution: <b>${esc(p.solution)}</b></small></div>`;
        ui.appendChild(fb);
        nav.innerHTML = isDaily
          ? `<a class="btn primary" href="#/puzzles">Back to puzzles</a><a class="btn" href="#/puzzles/all">More puzzles</a>`
          : `<button class="btn primary" id="next" type="button">Next puzzle ${icon('arrow', 16)}</button>`;
        nav.querySelector('#next')?.addEventListener('click', () => load(nextFromPool()));
        board.opts.interactive = false;
        (await checkAchievements()).forEach((a) => toast(`🏆 Achievement unlocked: ${a.name}`, 'good'));
      };
      current = runTask({ kind: 'line', fen: p.fen, steps: stepsOf(p), instruction: instr, hint: p.hint, explain: '' }, {
        board, ui, mode: 'lesson',
        onDone: (res) => finish(true, res.firstTry),
      });
      nav.querySelector('#solution').onclick = () => {
        if (finished) return;
        current?.destroy?.();
        const g = new Chess(p.fen);
        board.setOrientation(g.turn());
        board.setPosition(piecesFromGame(g));
        board.opts.interactive = false;
        const m0 = p.moves[0];
        board.setMarks([{ sq: m0.slice(0, 2), kind: 'hint' }, { sq: m0.slice(2, 4), kind: 'good' }]);
        board.setArrows([{ from: m0.slice(0, 2), to: m0.slice(2, 4), color: '#4cc3ff' }]);
        finish(false, false);
      };
    }
    load(isDaily ? dailyPuzzle(todayISO(), lvl) : nextFromPool());
  }

  async function record(p, ok, firstTry, isDaily) {
    sfx(ok ? 'win' : 'wrong');
    await store.update('puzzles', (s) => {
      s.attempts++;
      if (firstTry) s.correct++;
      if (ok) s.solved[p.id] = todayISO();
      if (firstTry) { s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); } else s.streak = 0;
      s.history.push({ id: p.id, ok, firstTry, theme: p.theme, date: todayISO() });
      s.history = s.history.slice(-60);
      if (isDaily) {
        const d = s.daily[todayISO()] || {};
        s.daily[todayISO()] = { id: p.id, solved: d.solved || ok, firstTry: d.solved ? d.firstTry : firstTry };
      }
    });
    await recordSkill(THEMES[p.theme]?.skill, firstTry);
    track('puzzle_attempt', p.id, null, ok ? 1 : 0);
    await markActivity();
  }

  if (mode) player(); else hub();
  return () => { disposed = true; current?.destroy?.(); board?.destroy(); };
}
