// Leaderboards per time control and puzzles.
import { esc, emptyState, loader, icon } from '../ui/dom.js';
import { avatarHtml, flag } from '../ui/user.js';
import { t } from '../i18n/core.js';
import { net, get } from '../net.js';

const CATS = [['blitz', 'Blitz'], ['rapid', 'Rapid'], ['bullet', 'Bullet'], ['classical', 'Classical'], ['puzzle', 'Puzzles']];

export async function mount(root) {
  if (!net.available) { root.innerHTML = emptyState({ emoji: '📡', title: t('Leaderboards need the Rookery server'), body: t('Ratings are kept on the server. Run Rookery with its server to see them.') }); return; }
  let cat = 'blitz';
  async function draw() {
    root.innerHTML = `<div class="page-head"><div><div class="eyebrow">${t('Leaderboards')}</div><h1>${t('Top players')}</h1><p>${t('The 50 highest ratings. Play at least 3 rated games to be listed.')}</p></div></div>
      <div class="segmented" id="cats" style="margin-bottom:16px">${CATS.map(([id, l]) => `<button type="button" data-v="${id}" aria-pressed="${cat === id}">${t(l)}</button>`).join('')}</div><div id="board-list">${loader()}</div>`;
    root.querySelectorAll('#cats button').forEach((b) => { b.onclick = () => { cat = b.dataset.v; draw(); }; });
    let data; try { data = await get('/api/leaderboard?category=' + cat); } catch (e) { root.querySelector('#board-list').innerHTML = emptyState({ title: t('Something went wrong'), body: esc(t(e.message)) }); return; }
    const list = root.querySelector('#board-list');
    if (!data.players.length) { list.innerHTML = emptyState({ emoji: '🏆', title: t('No ranked players yet'), body: t('Be the first: play rated games to appear here.'), actionHtml: `<a class="btn primary" href="#/play/online">${t('Play online')}</a>` }); return; }
    list.innerHTML = `<div class="card flush"><table class="table"><thead><tr><th>#</th><th>${t('Player')}</th><th class="num">${t('Rating')}</th><th class="num hide-s">${t('Games')}</th><th class="num hide-s">${t('Win rate')}</th></tr></thead><tbody>
      ${data.players.map((p) => `<tr class="${net.user?.username === p.username ? 'me' : ''}"><td class="rank">${p.rank <= 3 ? icon('crown', 16, 'rk' + p.rank) : p.rank}</td><td><a class="ulink row" href="#/profile/${encodeURIComponent(p.username)}">${avatarHtml(p, 30)}<b>${esc(p.username)}</b> <span>${flag(p.country)}</span></a></td><td class="num"><b>${p.rating}</b></td><td class="num hide-s">${p.games}</td><td class="num hide-s">${p.games ? Math.round(100 * (p.wins + p.draws / 2) / p.games) + '%' : '–'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  await draw();
}
