// Interactive exercise runner shared by lessons and the placement test.
//
// Task kinds
//   move    { fen, accept:[uci], hint, explain, wrong:{uci:text}, orientation? }
//   line    { fen, steps:[{accept:[uci], reply?:uci}], hint, explain }      (solver move, scripted reply, ...)
//   squares { fen, target:[sq], hint, explain }                              (click the right squares, then Check)
//   coords  { rounds, pass }                                                 (find named squares)
//   mc      { q, options:[...], answer:index, fen?, explain }                (multiple choice, optional diagram)
//
// Every runner calls ctx.onDone({ ok, attempts, hints, firstTry }) exactly once.

import { Chess } from '../chess/rules.js';
import { piecesFromGame, legalTargetsFor } from './board.js';
import { esc, icon } from './dom.js';
import { play as sfx, moveSound } from '../sound.js';
import { pieceSvg, PIECE_NAMES } from './pieces.js';

export const uciOf = (mv) => mv.from + mv.to + (mv.promotion || '');
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

let engineModule = null;
async function quickEngine() {
  if (!engineModule) engineModule = await import('../chess/engine.js');
  return new engineModule.Engine(14);
}

// Explain, in plain words, why a legal-but-wrong move does not work.
async function explainWrong(g, mv) {
  try {
    const t = new Chess(g.fen());
    const played = t.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    if (!played) return null;
    if (t.isCheckmate()) return null;
    const eng = await quickEngine();
    const r = eng.search(t.fen(), t.keys, { depth: 3, timeMs: 400 });
    if (!r.move) return null;
    const mover = played.color;
    const reply = new Chess(t.fen());
    const rv = reply.move(r.move);
    if (!rv) return null;
    const name = (x) => PIECE_NAMES[x].toLowerCase();
    if (reply.isCheckmate()) return `${played.san} walks into checkmate: the reply ${rv.san} ends the game.`;
    if (rv.captured && rv.color !== mover) {
      const lost = VALUES[rv.captured] >= 3 || VALUES[rv.captured] > VALUES[played.captured || 'x'] || 0;
      if (lost) return `After ${played.san}, the ${rv.color === 'w' ? 'White' : 'Black'} ${name(rv.piece)} can capture your ${name(rv.captured)} with ${rv.san}.`;
    }
    return null;
  } catch { return null; }
}

function feedbackHtml(kind, text, small = '') {
  return `<div class="feedback ${kind}">${text}${small ? `<small>${small}</small>` : ''}</div>`;
}

function resetBoardState(board) {
  board.setMarks([]); board.setArrows([]); board.setLastMove(null); board.clearSelection();
  board.opts.onSquareClick = null; board.opts.onMove = null; board.opts.canSelect = null; board.opts.legalTargets = null;
}

function uiShell(ui, { instruction, hint = true, reset = true, mode }) {
  ui.innerHTML = `
    <div class="stack">
      <div class="task-instr" style="font-weight:600;font-size:1.05rem">${instruction}</div>
      <div id="t-fb" aria-live="polite"></div>
      ${mode === 'lesson' ? `<div class="btn-row">${hint ? `<button class="btn sm" id="t-hint" type="button">${icon('bulb', 16)} Hint</button>` : ''}${reset ? `<button class="btn sm ghost" id="t-reset" type="button">${icon('refresh', 16)} Reset</button>` : ''}</div>` : ''}
    </div>`;
  return { fb: ui.querySelector('#t-fb'), hintBtn: ui.querySelector('#t-hint'), resetBtn: ui.querySelector('#t-reset') };
}

// ----------------------------------------------------------------- move/line
function runMoveOrLine(task, ctx) {
  const { board, ui, mode } = ctx;
  const steps = task.kind === 'line' ? task.steps : [{ accept: task.accept }];
  const g = new Chess(task.fen);
  let stepIdx = 0, attempts = 0, hints = 0, wrongs = 0, done = false, busy = false;
  const startFen = task.fen;
  const { fb, hintBtn, resetBtn } = uiShell(ui, { instruction: task.instruction, mode });

  const show = () => {
    resetBoardState(board);
    board.setOrientation(task.orientation || g.turn());
    board.setPosition(piecesFromGame(g));
    board.setCheck(g.checkSquare());
    board.opts.interactive = true;
    board.opts.canSelect = (sq) => { const p = g.get(sq); return !done && !busy && !!p && p.color === g.turn(); };
    board.opts.legalTargets = (sq) => legalTargetsFor(g, sq);
    board.opts.onMove = onMove;
  };

  async function onMove({ from, to, promotion }) {
    if (done || busy) return false;
    const legal = g.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (m.promotion || '') === (promotion || ''));
    if (!legal) return false;
    const uci = uciOf(legal);
    const step = steps[stepIdx];
    attempts++;
    if (step.accept.includes(uci)) {
      const before = new Chess(g.fen());
      const mv = g.move({ from, to, promotion });
      board.setPosition(piecesFromGame(g), { from: mv.from, to: mv.to });
      board.setCheck(g.checkSquare());
      board.setMarks([]); board.setArrows([]);
      moveSound(mv, g);
      stepIdx++;
      if (stepIdx >= steps.length) return finish(true);
      // scripted reply
      busy = true;
      fb.innerHTML = feedbackHtml('good', 'Good move — now watch the reply…');
      await new Promise((r) => setTimeout(r, 650));
      const rp = steps[stepIdx - 1].reply;
      if (rp) {
        const rm = g.move({ from: rp.slice(0, 2), to: rp.slice(2, 4), promotion: rp[4] });
        if (rm) { board.setPosition(piecesFromGame(g), { from: rm.from, to: rm.to }); board.setCheck(g.checkSquare()); moveSound(rm, g); }
      }
      busy = false;
      fb.innerHTML = feedbackHtml('good', 'Your turn again — keep going.');
      return true;
    }
    // wrong
    wrongs++;
    sfx('wrong');
    if (mode === 'test') { finish(false); return false; }
    const custom = task.wrong && task.wrong[uci];
    let msg = custom || null;
    if (!msg) msg = await explainWrong(g, legal);
    fb.innerHTML = feedbackHtml('bad', 'Not quite.', msg || `${esc(legal.san)} is legal, but it doesn't solve this exercise.${task.hint ? ' Press Hint if you need a nudge.' : ''}`);
    return false;
  }

  function finish(ok) {
    if (done) return true;
    done = true;
    if (ok) {
      sfx('correct');
      fb.innerHTML = mode === 'test' ? '' : feedbackHtml('good', 'Correct! ' + (wrongs === 0 ? '' : '(after a few tries)'), task.explain || '');
    }
    ctx.onDone({ ok, attempts, hints, firstTry: wrongs === 0 && hints === 0 });
    return true;
  }

  if (hintBtn) hintBtn.onclick = () => {
    if (done || busy) return;
    hints++;
    const step = steps[stepIdx];
    const best = step.accept[0];
    if (hints === 1) {
      fb.innerHTML = feedbackHtml('hint', 'Hint', esc(task.hint || 'Look for the piece that can make a real difference here.'));
    } else if (hints === 2) {
      board.setMarks([{ sq: best.slice(0, 2), kind: 'hint' }]);
      fb.innerHTML = feedbackHtml('hint', 'Hint', 'Look at the highlighted piece.');
    } else {
      board.setMarks([{ sq: best.slice(0, 2), kind: 'hint' }, { sq: best.slice(2, 4), kind: 'good' }]);
      board.setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), color: '#4cc3ff' }]);
      fb.innerHTML = feedbackHtml('hint', 'Here is the move', 'Play the highlighted move to continue.');
    }
  };
  if (resetBtn) resetBtn.onclick = () => {
    if (done) return;
    g.load(startFen); stepIdx = 0; fb.innerHTML = '';
    show();
  };

  show();
  return { destroy() { done = true; resetBoardState(board); } };
}

// ------------------------------------------------------------------- squares
function runSquares(task, ctx) {
  const { board, ui, mode } = ctx;
  const g = new Chess(task.fen);
  const { fb, hintBtn } = uiShell(ui, { instruction: task.instruction, reset: false, mode });
  ui.querySelector('.stack').insertAdjacentHTML('beforeend', `<div class="btn-row"><button class="btn primary" id="t-check" type="button">${icon('check', 16)} Check answer</button><button class="btn ghost" id="t-clear" type="button">Clear</button></div>`);
  const chosen = new Set();
  let done = false, attempts = 0, hints = 0, wrongs = 0;
  resetBoardState(board);
  board.setOrientation(task.orientation || 'w');
  board.setPosition(piecesFromGame(g));
  board.setCheck(null);
  board.opts.interactive = false;
  const paint = () => board.setMarks([...chosen].map((sq) => ({ sq, kind: 'info' })));
  board.opts.onSquareClick = (sq) => {
    if (done) return;
    if (chosen.has(sq)) chosen.delete(sq); else chosen.add(sq);
    paint();
  };
  ui.querySelector('#t-clear').onclick = () => { chosen.clear(); paint(); };
  ui.querySelector('#t-check').onclick = () => {
    if (done) return;
    attempts++;
    const target = new Set(task.target);
    const missing = [...target].filter((s) => !chosen.has(s));
    const extra = [...chosen].filter((s) => !target.has(s));
    if (!missing.length && !extra.length) {
      done = true;
      sfx('correct');
      board.setMarks([...target].map((sq) => ({ sq, kind: 'good' })));
      fb.innerHTML = mode === 'test' ? '' : feedbackHtml('good', 'Correct!', task.explain || '');
      ctx.onDone({ ok: true, attempts, hints, firstTry: wrongs === 0 && hints === 0 });
    } else {
      wrongs++;
      sfx('wrong');
      if (mode === 'test') { done = true; ctx.onDone({ ok: false, attempts, hints, firstTry: false }); return; }
      board.setMarks([...chosen].map((sq) => ({ sq, kind: target.has(sq) ? 'good' : 'bad' })));
      fb.innerHTML = feedbackHtml('bad', 'Not quite.', `${extra.length ? `${extra.length} square${extra.length > 1 ? 's are' : ' is'} wrong (red). ` : ''}${missing.length ? `You're missing ${missing.length}.` : ''}`);
    }
  };
  if (hintBtn) hintBtn.onclick = () => {
    if (done) return;
    hints++;
    const miss = task.target.find((s) => !chosen.has(s));
    fb.innerHTML = feedbackHtml('hint', 'Hint', esc(task.hint || 'Try again — look at how this piece moves.'));
    if (miss && hints >= 2) board.setMarks([...chosen].map((sq) => ({ sq, kind: 'info' })).concat([{ sq: miss, kind: 'hint' }]));
  };
  return { destroy() { done = true; resetBoardState(board); } };
}

// -------------------------------------------------------------------- coords
function runCoords(task, ctx) {
  const { board, ui, mode } = ctx;
  const rounds = task.rounds || 8, pass = task.pass || Math.ceil(rounds * 0.75);
  let n = 0, right = 0, attempts = 0, target = null, done = false, locked = false;
  const FILES = 'abcdefgh';
  const g = new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  ui.innerHTML = `<div class="stack"><div class="task-instr" style="font-weight:600;font-size:1.05rem">${task.instruction}</div>
    <div style="text-align:center;padding:12px 0"><div class="muted" id="t-round"></div><div id="t-target" style="font-size:3rem;font-weight:700;letter-spacing:-.03em"></div></div><div id="t-fb" aria-live="polite"></div></div>`;
  const fb = ui.querySelector('#t-fb');
  resetBoardState(board);
  board.setOrientation('w');
  board.setPosition({});
  board.opts.interactive = false;
  const next = () => {
    if (n >= rounds) {
      done = true;
      const ok = right >= pass;
      sfx(ok ? 'correct' : 'wrong');
      fb.innerHTML = feedbackHtml(ok ? 'good' : 'bad', ok ? `Well done — ${right} of ${rounds} correct.` : `${right} of ${rounds} correct. Let's try again!`);
      if (ok) ctx.onDone({ ok: true, attempts, hints: 0, firstTry: right === rounds });
      else setTimeout(() => { n = 0; right = 0; fb.innerHTML = ''; next(); }, 1400);
      return;
    }
    n++;
    let sq;
    do { sq = FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8)); } while (sq === target);
    target = sq;
    if (n === Math.ceil(rounds / 2) + 1 && board.orientation === 'w') board.setOrientation('b'); // look from the other side too
    ui.querySelector('#t-round').textContent = `Square ${n} of ${rounds}`;
    ui.querySelector('#t-target').textContent = target;
    board.setMarks([]);
    locked = false;
  };
  board.opts.onSquareClick = (sq) => {
    if (done || locked) return;
    attempts++;
    locked = true;
    if (sq === target) { right++; sfx('move'); board.setMarks([{ sq, kind: 'good' }]); }
    else { sfx('wrong'); board.setMarks([{ sq, kind: 'bad' }, { sq: target, kind: 'good' }]); }
    setTimeout(next, 650);
  };
  next();
  return { destroy() { done = true; resetBoardState(board); } };
}

// ------------------------------------------------------------ multiple choice
export function runChoice(q, ctx) {
  const { board, ui, mode } = ctx;
  if (q.fen && board) {
    resetBoardState(board);
    const g = new Chess(q.fen);
    board.setOrientation(q.orientation || 'w');
    board.setPosition(piecesFromGame(g));
    board.setCheck(g.checkSquare());
    board.opts.interactive = false;
    if (q.marks) board.setMarks(q.marks);
    if (q.arrows) board.setArrows(q.arrows.map(([from, to, color]) => ({ from, to, color })));
  }
  let answered = false, attempts = 0, wrongs = 0;
  ui.innerHTML = `<div class="stack"><div class="task-instr" style="font-weight:600;font-size:1.05rem">${q.q}</div>
    <div class="quiz-opts" role="group" aria-label="Answers">${q.options.map((o, i) => `<button class="quiz-opt" type="button" data-i="${i}"><span class="k">${'ABCD'[i]}</span><span>${o}</span></button>`).join('')}</div>
    <div id="t-fb" aria-live="polite"></div></div>`;
  const fb = ui.querySelector('#t-fb');
  ui.querySelectorAll('.quiz-opt').forEach((btn) => {
    btn.onclick = () => {
      if (answered) return;
      attempts++;
      const i = +btn.dataset.i;
      const ok = i === q.answer;
      if (mode === 'test') {
        answered = true;
        ui.querySelectorAll('.quiz-opt').forEach((b) => { b.disabled = true; });
        btn.classList.add('right'); // neutral confirmation in test mode (no correctness reveal)
        ctx.onDone({ ok, attempts, hints: 0, firstTry: ok });
        return;
      }
      if (ok) {
        answered = true;
        sfx('correct');
        btn.classList.add('right');
        ui.querySelectorAll('.quiz-opt').forEach((b) => { b.disabled = true; });
        fb.innerHTML = feedbackHtml('good', 'Correct!', q.explain || '');
        ctx.onDone({ ok: true, attempts, hints: 0, firstTry: wrongs === 0 });
      } else {
        wrongs++;
        sfx('wrong');
        btn.classList.add('wrong'); btn.disabled = true;
        if (ctx.singleAttempt) {
          answered = true;
          ui.querySelectorAll('.quiz-opt').forEach((b, idx) => { b.disabled = true; if (idx === q.answer) b.classList.add('right'); });
          fb.innerHTML = feedbackHtml('bad', 'Not quite.', q.explain || '');
          ctx.onDone({ ok: false, attempts, hints: 0, firstTry: false });
        } else {
          fb.innerHTML = feedbackHtml('bad', 'Not quite — try another answer.');
        }
      }
    };
  });
  return { destroy() { answered = true; resetBoardState(board); } };
}

export function runTask(task, ctx) {
  switch (task.kind) {
    case 'move': case 'line': return runMoveOrLine(task, ctx);
    case 'squares': return runSquares(task, ctx);
    case 'coords': return runCoords(task, ctx);
    case 'mc': return runChoice(task, ctx);
    default: throw new Error('Unknown task kind ' + task.kind);
  }
}

export { pieceSvg };
