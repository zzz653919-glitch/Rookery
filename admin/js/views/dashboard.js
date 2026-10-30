import { h, icon } from '../dom.js';
import { get } from '../api.js';
import { loadingState, errorState, emptyState, badge, fmtDate, ago, fmtBytes, fmtDuration } from '../ui.js';

const LABEL = {
  lesson_started: 'Lesson started', lesson_completed: 'Lesson completed', puzzle_attempt: 'Puzzle attempted', game_completed: 'Game finished', placement_completed: 'Placement test finished',
  'login.success': 'Administrator signed in', 'login.failed': 'Failed sign-in', 'login.blocked': 'Sign-in blocked (rate limit)', logout: 'Administrator signed out',
};
const describe = (a) => {
  if (a.kind === 'player') return `${LABEL[a.type] || a.type}${a.ref ? ` · ${a.ref}` : ''}${a.type === 'game_completed' && a.value ? ` (level ${a.value})` : ''}`;
  return `${LABEL[a.type] || a.type.replace('.', ' ')}${a.ref ? ` · ${a.ref}` : ''}${a.by ? ` — ${a.by}` : ''}`;
};

function stat(iconName, value, label, sub) {
  return h('div', { class: 'card stat' }, h('div', { class: 'ic' }, icon(iconName)), h('div', { class: 'v' }, String(value)), h('div', { class: 'l' }, label), sub ? h('div', { class: 's' }, sub) : null);
}

export async function mount(host) {
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Overview'), h('p', null, 'Live numbers from the database. Player statistics are anonymous and only exist for visits that reached this server.'))), loadingState(6));
  let d;
  try { d = await get('/api/admin/dashboard'); } catch (e) { host.replaceChildren(errorState(e, () => mount(host))); return; }
  const sys = d.system;
  const wins = Object.fromEntries(d.games.byResult.map((r) => [r.result, r.n]));
  host.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Overview'), h('p', null, 'Live numbers from the database. Player statistics are anonymous and only count visits served by this server.')),
      h('button', { class: 'btn', type: 'button', onclick: () => mount(host) }, 'Refresh')),
    h('div', { class: 'grid g4' },
      stat('book', d.lessons.published, 'Published lessons', `${d.lessons.total} total · ${d.lessons.draft} draft`),
      stat('puzzle', d.puzzles.published, 'Published puzzles', `${d.puzzles.total} total · ${d.puzzles.draft} draft`),
      stat('chess', d.games.total, 'Games completed', `${d.games.last7} in the last 7 days${d.games.total ? ` · ${wins.win || 0} won · ${wins.draw || 0} drawn · ${wins.loss || 0} lost` : ''}`),
      stat('users', d.learners.last30, 'Active learners (30 days)', `${d.learners.last7} in 7 days · ${d.learners.all} ever (anonymous browsers)`)),
    h('div', { class: 'grid g2', style: { marginTop: '14px' } },
      h('section', { class: 'card' }, h('h3', null, 'Most popular lessons'),
        d.popular.length ? h('table', { class: 'data', style: { margin: '0 -14px' } }, h('thead', null, h('tr', null, ['Lesson', 'Completions', 'Starts', 'Learners'].map((t) => h('th', null, t)))),
          h('tbody', null, d.popular.map((p) => h('tr', null, h('td', null, p.title, h('div', { class: 'sub' }, p.level || p.id)), h('td', null, p.completions), h('td', null, p.starts), h('td', null, p.learners)))))
          : emptyState('No lesson activity yet', 'Completions appear here once visitors use lessons on this server.')),
      h('section', { class: 'card' }, h('h3', null, 'Recent activity'),
        d.activity.length ? h('ul', { class: 'list' }, d.activity.map((a) => h('li', { class: 'item' }, h('span', { class: 'dot ' + (a.kind === 'admin' ? 'info' : 'good') }), h('div', { class: 'grow' }, describe(a), h('div', { class: 'sub faint small' }, `${a.kind === 'admin' ? 'Admin' : 'Player'} · ${ago(a.ts)}`)))))
          : emptyState('No activity yet'))),
    h('div', { class: 'grid g2', style: { marginTop: '14px' } },
      h('section', { class: 'card' }, h('div', { class: 'row spread', style: { marginBottom: '10px' } }, h('h3', { style: { margin: 0 } }, 'Application errors'), badge(`${d.errors.client7 + d.errors.server7} in 7 days`, d.errors.client7 + d.errors.server7 ? 'warn' : 'good')),
        d.errors.recent.length ? h('ul', { class: 'list' }, d.errors.recent.map((e) => h('li', { class: 'item' }, h('span', { class: 'dot bad' }), h('div', { class: 'grow' }, h('span', { class: 'mono' }, e.message || '(no message)'), h('div', { class: 'faint small' }, `${e.source} · ${e.route || ''} · ${ago(e.ts)}`)))))
          : h('p', { class: 'muted' }, 'No errors recorded. Server errors and unhandled browser errors from the player site appear here.')),
      h('section', { class: 'card' }, h('div', { class: 'row spread', style: { marginBottom: '10px' } }, h('h3', { style: { margin: 0 } }, 'System status'), badge(sys.status === 'ok' ? 'Healthy' : sys.status, 'good')),
        h('dl', { class: 'kv' },
          h('dt', null, 'Uptime'), h('dd', null, fmtDuration(sys.uptimeSeconds)),
          h('dt', null, 'Node.js'), h('dd', null, sys.node),
          h('dt', null, 'Database'), h('dd', null, fmtBytes(sys.dbBytes)),
          h('dt', null, 'Migrations'), h('dd', null, `${sys.migrations.length} applied (${sys.migrations.at(-1) || '—'})`),
          h('dt', null, 'Last backup'), h('dd', null, sys.lastBackup ? `${fmtDate(sys.lastBackup.at)} (${sys.lastBackup.count} stored)` : 'None yet — run npm run db:backup'),
          h('dt', null, 'Content version'), h('dd', null, `#${sys.contentVersion}`),
          h('dt', null, 'Administrators'), h('dd', null, `${sys.administrators} active · ${sys.activeSessions} signed-in session(s)`),
          h('dt', null, 'Themes enabled'), h('dd', null, `${sys.themes.board} board · ${sys.themes.pieceSets} piece sets`),
          h('dt', null, 'Usage events stored'), h('dd', null, sys.events)))));
}
