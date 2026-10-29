// Learn: the personalised path for the learner's level, plus the full curriculum.
import { store } from '../store.js';
import { LEVELS, SKILLS, levelById, levelIndex } from '../data/levels.js';
import { LESSONS } from '../data/lessons.js';
import { buildPath, lessonDone, pathProgress, recommendedLesson, readyForNextLevel, weakSkills } from '../progress.js';
import { esc, icon, ring, emptyState, progressBar } from '../ui/dom.js';
import { chooseLevel } from './welcome.js';

export function mount(root, { navigate }) {
  const profile = store.get('profile');
  if (!profile.level) {
    root.innerHTML = emptyState({ emoji: '🧭', title: 'Choose your level first', body: 'Lessons are matched to your level. Take the placement test or pick a level yourself.', actionHtml: '<a class="btn primary" href="#/welcome">Choose my level</a>' });
    return () => {};
  }
  const level = levelById(profile.level);
  const path = buildPath(level.id);
  const prog = pathProgress(level.id);
  const rec = recommendedLesson();
  const weak = weakSkills();
  const up = readyForNextLevel();

  const card = (item, i) => {
    const l = item.lesson, done = lessonDone(l.id), isRec = rec && rec.id === l.id;
    return `<a class="card hover lesson-card ${done ? 'done' : ''} ${isRec ? 'rec' : ''}" href="#/learn/${l.id}" data-lesson="${l.id}">
      <div class="row spread"><div class="num">${done ? icon('check', 18) : i + 1}</div>
        <div class="row wrap" style="gap:6px;justify-content:flex-end">${isRec ? '<span class="chip good">Up next</span>' : ''}${item.review ? '<span class="chip warn">Review</span>' : item.focus ? '<span class="chip warn">Focus</span>' : ''}${done ? '<span class="chip good">Completed</span>' : ''}</div></div>
      <h3 style="margin:2px 0 0">${esc(l.title)}</h3>
      <p class="muted" style="margin:0">${esc(l.summary)}</p>
      <div class="row wrap" style="gap:6px"><span class="chip">${esc(SKILLS[l.skill] || l.skill)}</span><span class="chip">${icon('clock', 12)} ${l.minutes} min</span></div></a>`;
  };

  root.innerHTML = `
    <header class="page-head"><div><div class="eyebrow">Learn</div><h1>${esc(level.name)} path</h1><p class="muted">${esc(level.focus)}</p></div>
      <div class="row">${ring(prog.pct, `${prog.done}/${prog.total}`)}</div></header>
    ${up ? `<div class="notice info" style="margin-bottom:16px"><div><b>You finished every ${esc(level.name)} lesson!</b> Ready for ${esc(up.name)}?</div><button class="btn primary sm" id="levelup" type="button">Move up to ${esc(up.name)}</button></div>` : ''}
    ${weak.size ? `<div class="notice info" style="margin-bottom:16px">${icon('target', 16)} <span>Based on your answers, lessons on <b>${[...weak].map((s) => esc(SKILLS[s] || s)).join(', ')}</b> are marked <i>Focus</i> and come first.</span></div>` : ''}
    ${path.review.length ? `<h3 style="margin:22px 0 12px">Review before you continue</h3><div class="grid auto">${path.review.map((x, i) => card(x, i)).join('')}</div>` : ''}
    <h3 style="margin:22px 0 12px">Your lessons</h3>
    <div class="grid auto">${path.main.map((x, i) => card(x, i)).join('')}</div>
    <h3 style="margin:30px 0 12px">All levels</h3>
    <div class="stack">
      ${LEVELS.map((lv) => {
        const ls = LESSONS.filter((l) => l.level === lv.id), p = pathProgress(lv.id);
        const mine = lv.id === level.id;
        return `<details class="card" ${mine ? 'open' : ''}><summary class="row spread" style="cursor:pointer"><span><b>${esc(lv.name)}</b>${mine ? ' <span class="chip good">Your level</span>' : levelIndex(lv.id) > levelIndex(level.id) ? ' <span class="chip">Ahead</span>' : ''}</span><span class="muted">${p.done}/${p.total} lessons</span></summary>
          <div style="margin:10px 0 4px">${progressBar(p.pct)}</div>
          <div class="stack" style="margin-top:10px">${ls.map((l) => `<a class="row spread" href="#/learn/${l.id}" style="padding:6px 0"><span>${lessonDone(l.id) ? icon('check', 14) : '○'} ${esc(l.title)}</span><span class="muted">${l.minutes} min</span></a>`).join('')}</div></details>`;
      }).join('')}
    </div>
    <p class="muted" style="margin-top:20px">Not the right level? <a href="#/welcome">Change it</a> or <a href="#/test">retake the placement test</a>.</p>`;
  root.querySelector('#levelup')?.addEventListener('click', async () => { await chooseLevel(up.id, 'manual'); navigate('/learn'); });
  return () => {};
}
