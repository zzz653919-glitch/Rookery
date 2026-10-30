import { h } from '../dom.js';
import { get } from '../api.js';
import { loadingState, errorState, emptyState } from '../ui.js';

export async function mount(host) {
  host.replaceChildren(loadingState(5));
  let d;
  try { d = await get('/api/admin/users-overview'); } catch (e) { host.replaceChildren(errorState(e, () => mount(host))); return; }
  const a = d.anonymous;
  host.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Users & progress'), h('p', null, 'What this platform can — and cannot — tell you about players.'))),
    h('div', { class: 'notice warn', style: { marginBottom: '14px' } }, h('strong', null, 'No central user accounts. '), d.explanation),
    h('div', { class: 'grid g2' },
      h('section', { class: 'card' }, h('h3', null, 'Anonymous aggregates'),
        h('p', { class: 'muted small' }, 'Counted from anonymous events sent by browsers that loaded the site from this server (players can switch this off in Settings). They are not linked to any person.'),
        h('dl', { class: 'kv' }, h('dt', null, 'Active browsers (30 days)'), h('dd', null, a.activeLearners30d), h('dt', null, 'Lessons completed'), h('dd', null, a.lessonCompletions),
          h('dt', null, 'Puzzle attempts'), h('dd', null, `${a.puzzleAttempts.n || 0} (${a.puzzleAttempts.correct || 0} solved first time)`))),
      h('section', { class: 'card' }, h('h3', null, 'Assessed levels (placement test)'),
        a.levels.length ? h('ul', { class: 'list' }, a.levels.map((l) => h('li', { class: 'item' }, h('span', { class: 'grow' }, l.level), h('strong', null, l.n)))) : emptyState('No placement results yet')),
      h('section', { class: 'card' }, h('h3', null, 'Games by computer level'),
        a.gamesByLevel.length ? h('ul', { class: 'list' }, a.gamesByLevel.map((l) => h('li', { class: 'item' }, h('span', { class: 'grow' }, `Level ${l.level}`), h('strong', null, l.n)))) : emptyState('No completed games yet')),
      h('section', { class: 'card' }, h('h3', null, 'What needs extra infrastructure'),
        h('ul', { class: 'muted', style: { margin: 0, paddingLeft: '18px' } },
          h('li', null, 'Listing, searching, suspending or restoring individual users'), h('li', null, 'Per-user statistics, lesson progress, rating history and game archives'),
          h('li', null, `Reported content / abuse review — ${d.reports}`), h('li', null, 'Player sign-in, password reset, e-mail verification and a privacy policy'))))
  );
}
