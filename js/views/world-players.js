// Famous players: a list and detailed profiles. Ratings and photos come from FIDE data, biographies from Wikipedia or the editors;
// the record, tournaments and recent games are calculated from the games stored in Rookery.
import { esc, emptyState, loader, icon } from '../ui/dom.js';
import { t } from '../i18n/core.js';
import { subnav, bindSubnav, wget, fmtDate, flagOf, nameOf, imgTag, errorBox, resultLabel, tcLabel, sourceLine, hrefOf } from '../ui/world.js';
import { countryName } from '../data/countries.js';
import { getLang } from '../i18n/core.js';

export async function mount(root, ctx) { return ctx.params.page === 'player' ? profile(root, ctx) : list(root, ctx); }

const card = (p) => `<a class="wcard player" href="#/world/player/${esc(p.slug)}" data-img><div class="wimg round">${imgTag(p.photo, p.name)}</div><div class="wbody"><h3>${esc(p.name)}</h3><p class="muted small">${flagOf(p.country)} ${p.title ? `<b>${esc(p.title)}</b>` : ''}</p>
  ${p.ratings ? `<div class="wrates"><span><small>${t('Classical')}</small>${p.ratings.standard ?? '–'}</span><span><small>${t('Rapid')}</small>${p.ratings.rapid ?? '–'}</span><span><small>${t('Blitz')}</small>${p.ratings.blitz ?? '–'}</span></div>` : ''}</div></a>`;

async function list(root, { navigate }) {
  let q = '', timer;
  root.innerHTML = `${subnav('players')}<div class="page-head"><div><div class="eyebrow">${t('Chess World')}</div><h1>${t('Grandmasters')}</h1><p>${t('Profiles of famous players with official FIDE ratings. Ratings are refreshed from FIDE data and show their source.')}</p></div></div>
    <div class="wfilters"><input type="search" id="p-q" placeholder="${esc(t('Search players'))}" maxlength="60" aria-label="${esc(t('Search players'))}"></div><div id="p-list">${loader()}</div>`;
  bindSubnav(root, navigate);
  async function load() { const box = root.querySelector('#p-list'); try { const d = await wget('players', { q }); box.innerHTML = d.players.length ? `<div class="wgrid players">${d.players.map(card).join('')}</div>` : emptyState({ emoji: '👤', title: t('No players found'), body: t('Players are added by the Rookery editors.') }); } catch (e) { box.innerHTML = errorBox(e); box.querySelector('[data-retry]').onclick = load; } }
  root.querySelector('#p-q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); load(); }, 300); });
  await load(); return () => clearTimeout(timer);
}

async function profile(root, { params, navigate }) {
  root.innerHTML = loader();
  let p; try { p = await wget('players/' + encodeURIComponent(params.id)); } catch (e) { root.innerHTML = `${subnav('players')}${emptyState({ emoji: '🔎', title: t('Player not found'), body: esc(t(e.message)), actionHtml: `<a class="btn" href="${hrefOf('players')}">${t('All players')}</a>` })}`; return; }
  const r = p.record, tot = r.games || 0, pc = (n) => (tot ? Math.round(n / tot * 100) : 0);
  root.innerHTML = `${subnav('players')}<a class="btn ghost sm" href="${hrefOf('players')}">${icon('back', 16)} ${t('All players')}</a>
    <header class="wpro"><div class="wimg round big" data-img>${imgTag(p.photo?.url, p.name)}${p.photo ? `<small class="credit">${esc(p.photo.credit || '')}${p.photo.credit ? ' · ' : ''}${esc(p.photo.source?.startsWith('http') ? 'Wikipedia' : p.photo.source || '')}</small>` : ''}</div>
      <div><div class="eyebrow">${flagOf(p.country)} ${esc(countryName(p.country, getLang()))}${p.birthYear ? ` · ${t('Born')} ${p.birthYear}` : ''}</div><h1>${p.title ? `<span class="wtitle">${esc(p.title)}</span> ` : ''}${esc(p.name)}</h1>
        ${p.ratings ? `<div class="wrates big"><span><small>${t('Classical')}</small>${p.ratings.standard ?? '–'}</span><span><small>${t('Rapid')}</small>${p.ratings.rapid ?? '–'}</span><span><small>${t('Blitz')}</small>${p.ratings.blitz ?? '–'}</span>${p.worldRank ? `<span><small>${t('World ranking')}</small>#${p.worldRank}</span>` : ''}</div><p class="muted small">${t('Source')}: <a href="${esc(p.ratingSource.url)}" target="_blank" rel="noopener noreferrer">${esc(p.ratingSource.name)}</a>${p.worldRank && p.rankSource ? ` · ${t('Ranking')}: ${esc(p.rankSource)}` : ''}</p>` : `<p class="muted">${p.dataNote ? t('Official ratings are not available right now.') : ''}</p>`}</div></header>
    <div class="w2col"><section class="wsec"><h2>${t('Biography')}</h2>${p.bio ? `<p class="wbio">${esc(p.bio)}</p>${p.bioSource ? `<p class="muted small">${t('Source')}: <a href="${esc(p.bioSource.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(p.bioSource.name)}</a></p>` : ''}` : `<p class="muted">${t('No biography is available yet.')}</p>`}
        <h2>${t('Career achievements')}</h2>${p.achievements.length ? `<ul class="wach">${p.achievements.map((a) => `<li>${a.year ? `<b>${a.year}</b> ` : ''}${esc(a.text)}${a.sourceUrl ? ` <a href="${esc(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">${icon('arrow', 12)}</a>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${t('Achievements are listed here when the editors add them with a source.')}</p>`}</section>
      <section class="wsec"><h2>${t('Record in stored games')}</h2>${tot ? `<div class="wbar" role="img" aria-label="${esc(t('Wins, draws and losses'))}"><i class="w" style="width:${pc(r.wins)}%"></i><i class="d" style="width:${pc(r.draws)}%"></i><i class="l" style="width:${pc(r.losses)}%"></i></div><div class="wstats"><div><b>${r.wins}</b><small>${t('Wins')}</small></div><div><b>${r.draws}</b><small>${t('Draws')}</small></div><div><b>${r.losses}</b><small>${t('Losses')}</small></div><div><b>${tot}</b><small>${t('Games')}</small></div></div><p class="muted small">${t('Calculated from the games stored in Rookery, not from the whole career.')}</p>` : `<p class="muted">${t('No stored games for this player yet. Games are stored when a tournament page is opened.')}</p>`}</section></div>
    ${p.tournaments.length ? `<section class="wsec"><h2>${t('Tournament history')}</h2><div class="wlist">${p.tournaments.map((e) => `<a class="wrow ev" href="#/world/event/${e.id}"><b>${esc(e.name)}</b><span class="muted small">${e.points}/${e.games}</span><span class="muted small">${fmtDate(e.date)}</span></a>`).join('')}</div></section>` : ''}
    ${p.recentGames.length ? `<section class="wsec"><h2>${t('Recent games')}</h2><div class="card flush"><div class="wlist tight">${p.recentGames.map((g) => `<a class="wrow game" href="#/world/game/${g.id}"><span class="wp">${esc(nameOf(g.white))} <small class="muted">${g.white_elo || ''}</small></span><b class="wres">${resultLabel(g.result)}</b><span class="wp r">${esc(nameOf(g.black))} <small class="muted">${g.black_elo || ''}</small></span><span class="wev muted small">${esc(g.event_name)} · ${fmtDate(g.played_on)}</span></a>`).join('')}</div></div></section>` : ''}
    ${p.news.length ? `<section class="wsec"><h2>${t('Latest news')}</h2><div class="wlist">${p.news.map((a) => `<a class="wrow" href="#/news/${encodeURIComponent(a.id)}"><b>${esc(a.title)}</b>${sourceLine(a)}</a>`).join('')}</div></section>` : ''}`;
  bindSubnav(root, navigate); document.title = `${p.name} · Rookery`;
}
