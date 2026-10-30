// Progress dashboard: level, lessons, puzzle accuracy, recent results, strengths/weaknesses, streaks, achievements.
import { store, currentStreak, longestStreak, todayISO } from '../store.js';
import { LEVELS, SKILLS, levelById } from '../data/levels.js';
import { LESSONS } from '../data/lessons.js';
import { ACHIEVEMENTS, pathProgress, recommendedLesson, skillStats, puzzleAccuracy, lessonDone } from '../progress.js';
import { esc, icon, ring, progressBar, emptyState } from '../ui/dom.js';
import { PUZZLES } from '../data/puzzles.js';
import { t, th, tn } from '../i18n/core.js';
import { levelName, skillName } from '../i18n/names.js';

export function mount(root) {
  const profile = store.get('profile'), lv = levelById(profile.level);
  const lessons = store.get('lessons'), ps = store.get('puzzles'), games = store.get('games');
  const doneCount = Object.keys(lessons.done).length;
  const acc = puzzleAccuracy();
  const rec = recommendedLesson();
  const stats = skillStats();
  const have = store.get('achievements');
  const days = new Set(store.get('activity').days);

  const skillRows = Object.entries(SKILLS).map(([id]) => ({ id, name: skillName(id), ...(stats[id] || { right: 0, total: 0 }) })).filter((s) => s.total > 0)
    .map((s) => ({ ...s, pct: s.right / s.total })).sort((a, b) => b.pct - a.pct);
  const strong = skillRows.filter((s) => s.total >= 2 && s.pct >= 0.75);
  const weak = skillRows.filter((s) => s.pct < 0.6);

  // recent results (lessons, puzzles, games) newest first
  const recent = [
    ...Object.entries(lessons.done).map(([id, d]) => ({ d, t: t('Completed lesson “{title}”', { title: LESSONS.find((l) => l.id === id)?.title || id }), i: 'book' })),
    ...ps.history.slice(-8).map((h) => ({ d: h.date, t: h.ok ? (h.firstTry ? t('Puzzle solved first try') : t('Puzzle solved with help')) : t('Puzzle missed'), i: 'puzzle' })),
    ...games.slice(-8).map((g) => ({ d: g.date, t: t(g.result === 'win' ? 'Won vs computer level {level}' : g.result === 'loss' ? 'Lost vs computer level {level}' : 'Drew vs computer level {level}', { level: g.level }) + (g.practice ? ' ' + t('(practice)') : ''), i: 'cpu' })),
  ].sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 8);

  const heat = [];
  for (let i = 27; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = todayISO(d); heat.push(`<i class="${days.has(k) ? 'on' : ''} ${i === 0 ? 'today' : ''}" title="${k}"></i>`); }

  root.innerHTML = `
    <header class="page-head"><div><div class="eyebrow">${t('Progress')}</div><h1>${t('Your journey')}</h1><p>${t('Everything below is calculated from what you actually did on this device.')}</p></div></header>
    <div class="grid cols-4" style="margin-bottom:18px">
      <div class="card stat"><b>${lv ? esc(levelName(lv)) : '—'}</b><span>${t('Your level')}${profile.levelSource === 'placement' ? ' ' + t('(estimate)') : ''}</span></div>
      <div class="card stat"><b>${doneCount}/${LESSONS.length}</b><span>${t('Lessons completed')}</span></div>
      <div class="card stat"><b>${acc === null ? '—' : Math.round(acc * 100) + '%'}</b><span>${t('Puzzle accuracy')}${ps.attempts ? ` (${ps.correct}/${ps.attempts})` : ''}</span></div>
      <div class="card stat"><b>${currentStreak()}</b><span>${t('Day streak · best {n}', { n: longestStreak() })}</span></div>
    </div>
    <div class="grid cols-2" style="align-items:start">
      <div class="stack">
        <section class="card"><h3>${t('Recommended next')}</h3>${rec ? `<div class="row spread wrap"><div><b>${esc(rec.title)}</b><p class="muted" style="margin:2px 0 0">${esc(rec.summary)}</p></div><a class="btn primary" href="#/learn/${rec.id}">${t('Start')} ${icon('arrow', 16)}</a></div>` : lv ? `<p class="muted">${t('You have completed every lesson on your path. Try puzzles or play the computer!')}</p>` : `<p class="muted">${t('Choose your level to get recommendations.')}</p><a class="btn primary" href="#/welcome">${t('Choose my level')}</a>`}</section>
        <section class="card"><h3>${t('Lessons by level')}</h3><div class="stack" style="margin-top:10px">${LEVELS.map((l) => { const p = pathProgress(l.id); return `<div class="skill-row"><span>${esc(levelName(l))}</span>${progressBar(p.pct)}<b>${p.done}/${p.total}</b></div>`; }).join('')}</div></section>
        <section class="card"><h3>${t('Strengths & weaknesses')}</h3>
          ${skillRows.length ? `<div class="stack" style="margin-top:10px">${skillRows.map((s) => `<div class="skill-row"><span>${esc(s.name)}</span>${progressBar(s.pct)}<b>${Math.round(s.pct * 100)}%</b></div>`).join('')}</div>
            <div class="row wrap" style="margin-top:12px">${strong.map((s) => `<span class="chip good">${icon('check', 12)} ${esc(s.name)}</span>`).join('')}${weak.map((s) => `<span class="chip warn">${t('Work on: {skill}', { skill: esc(s.name) })}</span>`).join('')}</div>`
            : `<p class="muted">${t('Take the placement test or solve a few exercises and your strengths will show up here.')}</p>`}</section>
        <section class="card"><h3>${t('Recent results')}</h3>${recent.length ? `<div class="stack" style="gap:8px;margin-top:10px">${recent.map((r) => `<div class="row">${icon(r.i, 16)}<span style="flex:1">${esc(r.t)}</span><small class="muted">${esc(String(r.d).slice(0, 10))}</small></div>`).join('')}</div>` : emptyState({ emoji: '🌱', title: t('Nothing here yet'), body: t('Finish a lesson, a puzzle or a game and it will show up here.') })}</section>
      </div>
      <div class="stack">
        <section class="card"><h3>${t('Activity · last 4 weeks')}</h3><div class="heat" style="margin:10px 0">${heat.join('')}</div>
          <div class="row spread"><span class="muted">${icon('flame', 14)} ${t('Current streak')} <b>${currentStreak()}</b></span><span class="muted">${t('Longest')} <b>${longestStreak()}</b></span></div></section>
        <section class="card"><h3>${t('Puzzle records')}</h3><div class="grid cols-2" style="margin-top:10px"><div class="stat"><b>${Object.keys(ps.solved).length}<small class="muted" style="font-size:.8rem">/${PUZZLES.length}</small></b><span>${t('Solved')}</span></div><div class="stat"><b>${ps.bestStreak}</b><span>${t('Best first-try streak')}</span></div></div></section>
        <section class="card"><h3>${t('Achievements')} <span class="muted" style="font-weight:400">${Object.keys(have).length}/${ACHIEVEMENTS.length}</span></h3><div class="ach-grid" style="margin-top:10px">
          ${ACHIEVEMENTS.map((a) => `<div class="ach ${have[a.id] ? 'on' : ''}"><div class="ico">${icon(have[a.id] ? a.icon : 'lock', 20)}</div><div><b>${esc(t(a.name))}</b><small>${esc(t(a.desc))}</small></div></div>`).join('')}</div></section>
        <div class="notice info">${icon('info', 16)} ${t('Your progress is stored only on this device. It will not appear on other devices or browsers, and clearing browser data removes it. You can export a backup in Settings.')}</div>
      </div>
    </div>`;
  return () => {};
}
