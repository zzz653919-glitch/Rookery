// Learn: the personalised path for the learner's level, plus the full curriculum.
import { store } from '../store.js';
import { LEVELS, SKILLS, levelById, levelIndex } from '../data/levels.js';
import { LESSONS } from '../data/lessons.js';
import { buildPath, lessonDone, pathProgress, recommendedLesson, readyForNextLevel, weakSkills } from '../progress.js';
import { esc, icon, ring, emptyState, progressBar } from '../ui/dom.js';
import { chooseLevel } from './welcome.js';
import { t, th, tn } from '../i18n/core.js';
import { levelName, levelFocus, skillName } from '../i18n/names.js';

export function mount(root, { navigate }) {
  const profile = store.get('profile');
  if (!profile.level) {
    root.innerHTML = emptyState({ emoji: '🧭', title: t('Choose your level first'), body: t('Lessons are matched to your level. Take the placement test or pick a level yourself.'), actionHtml: `<a class="btn primary" href="#/welcome">${t('Choose my level')}</a>` });
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
        <div class="row wrap" style="gap:6px;justify-content:flex-end">${isRec ? `<span class="chip good">${t('Up next')}</span>` : ''}${item.review ? `<span class="chip warn">${t('Review')}</span>` : item.focus ? `<span class="chip warn">${t('Focus')}</span>` : ''}${done ? `<span class="chip good">${t('Completed')}</span>` : ''}</div></div>
      <h3 style="margin:2px 0 0">${esc(l.title)}</h3>
      <p class="muted" style="margin:0">${esc(l.summary)}</p>
      <div class="row wrap" style="gap:6px"><span class="chip">${esc(skillName(l.skill))}</span><span class="chip">${icon('clock', 12)} ${t('{n} min', { n: l.minutes })}</span></div></a>`;
  };

  root.innerHTML = `
    <header class="page-head"><div><div class="eyebrow">${t('Learn')}</div><h1>${th('{level} path', { level: levelName(level) })}</h1><p class="muted">${esc(levelFocus(level))}</p></div>
      <div class="row">${ring(prog.pct, `${prog.done}/${prog.total}`)}</div></header>
    ${up ? `<div class="notice info" style="margin-bottom:16px"><div><b>${th('You finished every {level} lesson!', { level: levelName(level) })}</b> ${th('Ready for {level}?', { level: levelName(up) })}</div><button class="btn primary sm" id="levelup" type="button">${th('Move up to {level}', { level: levelName(up) })}</button></div>` : ''}
    ${weak.size ? `<div class="notice info" style="margin-bottom:16px">${icon('target', 16)} <span>${t('Based on your answers, lessons on <b>{skills}</b> are marked <i>Focus</i> and come first.', { skills: [...weak].map((s) => esc(skillName(s))).join(', ') })}</span></div>` : ''}
    ${path.review.length ? `<h3 style="margin:22px 0 12px">${t('Review before you continue')}</h3><div class="grid auto">${path.review.map((x, i) => card(x, i)).join('')}</div>` : ''}
    <h3 style="margin:22px 0 12px">${t('Your lessons')}</h3>
    <div class="grid auto">${path.main.map((x, i) => card(x, i)).join('')}</div>
    <h3 style="margin:30px 0 12px">${t('All levels')}</h3>
    <div class="stack">
      ${LEVELS.map((lv) => {
        const ls = LESSONS.filter((l) => l.level === lv.id), p = pathProgress(lv.id);
        const mine = lv.id === level.id;
        return `<details class="card" ${mine ? 'open' : ''}><summary class="row spread" style="cursor:pointer"><span><b>${esc(levelName(lv))}</b>${mine ? ` <span class="chip good">${t('Your level')}</span>` : levelIndex(lv.id) > levelIndex(level.id) ? ` <span class="chip">${t('Ahead')}</span>` : ''}</span><span class="muted">${t('{done}/{total} lessons', { done: p.done, total: p.total })}</span></summary>
          <div style="margin:10px 0 4px">${progressBar(p.pct)}</div>
          <div class="stack" style="margin-top:10px">${ls.map((l) => `<a class="row spread" href="#/learn/${l.id}" style="padding:6px 0"><span>${lessonDone(l.id) ? icon('check', 14) : '○'} ${esc(l.title)}</span><span class="muted">${t('{n} min', { n: l.minutes })}</span></a>`).join('')}</div></details>`;
      }).join('')}
    </div>
    <p class="muted" style="margin-top:20px">${t('Not the right level?')} <a href="#/welcome">${t('Change it')}</a> ${t('or')} <a href="#/test">${t('retake the placement test')}</a>.</p>`;
  root.querySelector('#levelup')?.addEventListener('click', async () => { await chooseLevel(up.id, 'manual'); navigate('/learn'); });
  return () => {};
}
