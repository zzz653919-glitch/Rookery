// Chess World: the hub page (breaking news, live tournaments, latest results, upcoming events, grandmasters, videos) and global search.
// Other pages live in their own modules and are loaded on demand.
import { esc, emptyState, loader, icon } from '../ui/dom.js';
import { t } from '../i18n/core.js';
import { net } from '../net.js';
import { subnav, bindSubnav, wget, fmtRange, fmtDate, statusChip, confirmChip, flagOf, nameOf, startCountdowns, imgTag, sourceLine, errorBox, resultLabel, hrefOf } from '../ui/world.js';

export async function mount(root, ctx) {
  const { params } = ctx; const page = params.page || 'hub';
  if (!net.available) { root.innerHTML = emptyState({ emoji: '🌍', title: t('Chess World needs the Rookery server'), body: t('News, tournaments, results and broadcasts are served by the Rookery server.') }); return; }
  if (['events', 'event'].includes(page)) return (await import('./world-events.js')).mount(root, ctx);
  if (['results', 'game'].includes(page)) return (await import('./world-games.js')).mount(root, ctx);
  if (['live', 'broadcasts'].includes(page)) return (await import('./world-live.js')).mount(root, ctx);
  if (['players', 'player'].includes(page)) return (await import('./world-players.js')).mount(root, ctx);
  if (page === 'search') return search(root, ctx);
  return hub(root, ctx);
}

const evCard = (e) => `<a class="wcard event ${e.status}" href="#/world/event/${e.id}" data-img>
  <div class="wimg">${imgTag(e.image, '')}<div class="wtags">${statusChip(e.status)}${confirmChip(e)}</div></div>
  <div class="wbody"><h3>${esc(e.name)}</h3><p class="muted small">${esc(e.location || '')}${e.location ? ' · ' : ''}${fmtRange(e.starts_on, e.ends_on)}</p>
  ${e.status === 'upcoming' && e.starts_on ? `<div class="wcd">${t('Starts in')} <b data-cd="${esc(e.starts_on)}"></b></div>` : ''}</div></a>`;
const artCard = (a, big) => `<a class="wcard news ${big ? 'lead' : ''}" href="#/news/${encodeURIComponent(a.id)}" data-img><div class="wimg">${imgTag(a.image, '')}<span class="wcat">${esc(a.category)}</span></div><div class="wbody"><h3>${esc(a.title)}</h3>${big ? `<p class="muted">${esc(a.summary || '')}</p>` : ''}${sourceLine(a)}</div></a>`;
const gameRow = (g) => `<a class="wrow" href="#/world/game/${g.id}"><span class="wp">${flagOf(g.white_fed)} ${esc(nameOf(g.white))} <small class="muted">${g.white_elo || ''}</small></span><b class="wres">${resultLabel(g.result)}</b><span class="wp r">${esc(nameOf(g.black))} <small class="muted">${g.black_elo || ''}</small> ${flagOf(g.black_fed)}</span><span class="muted small wev">${esc(g.event_name || '')}</span></a>`;
const section = (title, more, body, cls = '') => `<section class="wsec ${cls}"><div class="row spread"><h2>${title}</h2>${more ? `<a class="small more" href="${more[0]}">${more[1]} ${icon('arrow', 14)}</a>` : ''}</div>${body}</section>`;
const empty = (msg) => `<p class="muted wempty">${msg}</p>`;
const playerCard = (p) => `<a class="wcard player" href="#/world/player/${esc(p.slug)}" data-img><div class="wimg round">${imgTag(p.photo, p.name)}</div><div class="wbody"><h3>${esc(p.name)}</h3><p class="muted small">${flagOf(p.country)} ${p.title ? `<b>${esc(p.title)}</b> · ` : ''}${p.ratings?.standard ? `${p.ratings.standard} <span class="wsrc">FIDE</span>` : ''}</p></div></a>`;

async function hub(root, { navigate }) {
  let stopCd = () => {}, disposed = false, timer = null;
  async function draw() {
    let d; try { d = await wget('home'); } catch (e) { root.innerHTML = `${subnav('hub')}${errorBox(e)}`; root.querySelector('[data-retry]').onclick = () => { root.innerHTML = loader(); draw(); }; bindSubnav(root, navigate); return; }
    if (disposed) return; stopCd();
    const lead = d.breaking[0]; const fb = d.featuredBroadcast;
    root.innerHTML = `${subnav('hub')}
      <header class="whero"><div><div class="eyebrow">${t('Chess World')}</div><h1>${t('Everything happening in chess, in one place.')}</h1>
        <p>${t('News, live tournaments, results, broadcasts and grandmasters — from official sources, with the source shown on every item.')}</p>
        <div class="btn-row"><a class="btn primary lg" href="${hrefOf('live')}">${icon('eye', 18)} ${t('Live games')}</a><a class="btn lg" href="${hrefOf('events')}">${icon('trophy', 18)} ${t('Tournament calendar')}</a></div></div>
        ${fb ? `<a class="wfeat" href="${hrefOf('broadcasts')}">${statusChip('live')}<h3>${esc(fb.title)}</h3><p class="muted small">${esc(fb.channel || '')}</p><span class="btn sm">${icon('play', 14)} ${t('Watch now')}</span></a>`
          : d.live[0] ? `<a class="wfeat" href="#/world/event/${d.live[0].id}">${statusChip('live')}<h3>${esc(d.live[0].name)}</h3><p class="muted small">${esc(d.live[0].location || '')}</p><span class="btn sm">${icon('eye', 14)} ${t('Follow the games')}</span></a>` : ''}</header>
      ${section(t('Breaking chess news'), [hrefOf('news'), t('All news')], d.breaking.length ? `<div class="wgrid lead-grid">${artCard(lead, true)}${d.breaking.slice(1, 5).map((a) => artCard(a)).join('')}</div>` : empty(t('No news yet. Add a news source in the admin panel or publish an article.')))}
      ${section(t('Currently live'), [hrefOf('events'), t('Calendar')], d.live.length ? `<div class="wgrid">${d.live.slice(0, 4).map(evCard).join('')}</div>` : empty(t('No official tournament is being played right now.')), 'live')}
      <div class="w2col">
        ${section(t('Latest game results'), [hrefOf('results'), t('All results')], (d.featuredGames.length || d.latestGames.length) ? `<div class="wlist">${[...d.featuredGames, ...d.latestGames.filter((g) => !d.featuredGames.some((f) => f.id === g.id))].slice(0, 7).map(gameRow).join('')}</div>` : empty(t('Games appear here after a tournament has been opened.')))}
        ${section(t('Upcoming tournaments'), [hrefOf('events'), t('Calendar')], d.upcoming.length ? `<div class="wlist">${d.upcoming.slice(0, 5).map((e) => `<a class="wrow ev" href="#/world/event/${e.id}"><span><b>${esc(e.name)}</b><small class="muted"> ${esc(e.location || '')}</small></span><span class="small muted">${fmtRange(e.starts_on, e.ends_on)}</span><span class="wcd small"><b data-cd="${esc(e.starts_on || '')}"></b></span></a>`).join('')}</div>` : empty(t('No upcoming tournaments are listed yet.')))}
      </div>
      ${d.results.length ? section(t('Recent tournament results'), [hrefOf('results'), t('Results archive')], `<div class="wgrid">${d.results.map((r) => `<a class="wcard podium" href="#/world/event/${r.event.id}"><div class="wbody"><h3>${esc(r.event.name)}</h3><p class="muted small">${fmtRange(r.event.starts_on, r.event.ends_on)}</p><ol class="wpod">${r.podium.map((p, i) => `<li><span class="medal m${i + 1}">${i + 1}</span>${flagOf(p.fed)} ${esc(nameOf(p.name))} <b>${p.points}</b></li>`).join('')}</ol></div></a>`).join('')}</div>`) : ''}
      ${section(t('Featured grandmasters'), [hrefOf('players'), t('All players')], d.players.length ? `<div class="wgrid players">${d.players.slice(0, 6).map(playerCard).join('')}</div>` : empty(t('No players are featured yet.')))}
      <div class="w2col">
        ${section(t('Latest chess videos'), [hrefOf('broadcasts'), t('All broadcasts')], d.videos.length ? `<div class="wlist">${d.videos.map((v) => `<a class="wrow" href="${hrefOf('broadcasts')}"><span><b>${esc(v.title)}</b><small class="muted"> ${esc(v.channel || '')}</small></span>${statusChip(v.status)}</a>`).join('')}</div>` : empty(t('No videos yet. Official broadcasts are added in the admin panel.')))}
        ${section(t('Uzbekistan chess'), [hrefOf('players'), t('Players')], (d.uzbekistan.news.length || d.uzbekistan.events.length || d.uzbekistan.players.length) ? `<div class="wlist">${d.uzbekistan.news.map((a) => `<a class="wrow" href="#/news/${encodeURIComponent(a.id)}"><b>${esc(a.title)}</b><span class="small muted">${fmtDate(a.publishedAt)}</span></a>`).join('')}${d.uzbekistan.events.map((e) => `<a class="wrow ev" href="#/world/event/${e.id}"><b>${esc(e.name)}</b>${statusChip(e.status)}</a>`).join('')}${d.uzbekistan.players.map((p) => `<a class="wrow" href="#/world/player/${esc(p.slug)}"><span>${flagOf(p.country)} <b>${esc(p.name)}</b></span><span class="small muted">${p.ratings?.standard ? p.ratings.standard + ' FIDE' : ''}</span></a>`).join('')}</div>` : empty(t('No Uzbekistan news yet.')))}
      </div>
      ${d.recent.length ? section(t('Recent world events'), [hrefOf('events'), t('Calendar')], `<div class="wgrid">${d.recent.slice(0, 4).map(evCard).join('')}</div>`) : ''}
      ${d.rookery.length ? section('Rookery', [hrefOf('news'), t('All news')], `<div class="wgrid">${d.rookery.map((a) => artCard(a)).join('')}</div>`) : ''}`;
    bindSubnav(root, navigate); stopCd = startCountdowns(root);
  }
  root.innerHTML = loader(); await draw();
  timer = setInterval(() => { if (!document.hidden) draw(); }, 120000);
  return () => { disposed = true; clearInterval(timer); stopCd(); };
}

async function search(root, { params, navigate }) {
  const q = params.id || '';
  root.innerHTML = `${subnav('hub')}<div class="page-head"><div><div class="eyebrow">${t('Search')}</div><h1>“${esc(q)}”</h1></div></div><div id="s-body">${loader()}</div>`; bindSubnav(root, navigate);
  root.querySelector('#w-search').value = q;
  let d; try { d = await wget('search', { q }); } catch (e) { root.querySelector('#s-body').innerHTML = errorBox(e); return; }
  const total = d.players.length + d.events.length + d.games.length + d.broadcasts.length + d.countries.length + d.news.length;
  const grp = (title, rows) => rows ? `<section class="wsec"><h2>${title}</h2><div class="wlist">${rows}</div></section>` : '';
  root.querySelector('#s-body').innerHTML = total ? [
    grp(t('Players'), d.players.map((p) => `<a class="wrow" href="#/world/player/${esc(p.slug)}"><span>${flagOf(p.country)} <b>${esc(p.name)}</b></span></a>`).join('')),
    grp(t('Tournaments'), d.events.map((e) => `<a class="wrow ev" href="#/world/event/${e.id}"><span><b>${esc(e.name)}</b><small class="muted"> ${esc(e.location || '')}</small></span>${statusChip(e.status)}</a>`).join('')),
    grp(t('Games'), d.games.map((g) => `<a class="wrow" href="#/world/game/${g.id}"><span>${esc(nameOf(g.white))} – ${esc(nameOf(g.black))}</span><b class="wres">${resultLabel(g.result)}</b><span class="muted small">${fmtDate(g.played_on)}</span></a>`).join('')),
    grp(t('News'), d.news.map((a) => `<a class="wrow" href="#/news/${encodeURIComponent(a.id)}"><b>${esc(a.title)}</b><span class="small muted">${fmtDate(a.publishedAt)}</span></a>`).join('')),
    grp(t('Countries'), d.countries.map((c) => `<a class="wrow" href="#/world/results?country=${c.fed}"><span>${flagOf(c.fed)} <b>${esc(c.name)}</b></span><span class="small muted">${t('Games')}</span></a>`).join('')),
    grp(t('Broadcasts'), d.broadcasts.map((b) => `<a class="wrow" href="${hrefOf('broadcasts')}"><b>${esc(b.title)}</b>${statusChip(b.status)}</a>`).join('')),
  ].join('') : emptyState({ emoji: '🔎', title: t('Nothing found'), body: t('Try a different spelling, a surname or a tournament name.') });
}
