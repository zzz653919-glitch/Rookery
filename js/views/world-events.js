// Tournament calendar (live / upcoming / completed, with filters and countdowns) and the page of a single tournament.
import { esc, emptyState, loader, icon, toast } from '../ui/dom.js';
import { t, getLang } from '../i18n/core.js';
import { countryName } from '../data/countries.js';
import { subnav, bindSubnav, wget, fmtRange, fmtTime, statusChip, confirmChip, flagOf, nameOf, startCountdowns, imgTag, errorBox, resultLabel, tcLabel, hrefOf } from '../ui/world.js';

export async function mount(root, ctx) { return ctx.params.page === 'event' ? detail(root, ctx) : list(root, ctx); }

const LEVELS = [['', 'All levels'], ['international', 'International'], ['continental', 'Continental'], ['national', 'National'], ['online', 'Online']];
const TCS = [['', 'Any time control'], ['standard', 'Classical'], ['rapid', 'Rapid'], ['blitz', 'Blitz']];
const STATES = [['live', 'Live'], ['upcoming', 'Upcoming'], ['completed', 'Completed']];

const card = (e) => `<a class="wcard event ${e.status}" href="#/world/event/${e.id}" data-img>
  <div class="wimg">${imgTag(e.image, '')}<div class="wtags">${statusChip(e.status)}${confirmChip(e)}</div>${e.tier >= 4 ? `<span class="wtier" title="${esc(t('Top-tier event'))}">★</span>` : ''}</div>
  <div class="wbody"><h3>${esc(e.name)}</h3>
  <p class="muted small">${icon('globe', 13)} ${esc(e.location || t('Location to be announced'))}</p><p class="muted small">${icon('clock', 13)} ${fmtRange(e.starts_on, e.ends_on)}</p>
  <div class="wfacts">${e.format ? `<span>${esc(e.format)}</span>` : ''}${e.fide_tc ? `<span>${tcLabel(e.fide_tc)}</span>` : ''}${e.level ? `<span>${esc(t(LEVELS.find((l) => l[0] === e.level)?.[1] || e.level))}</span>` : ''}</div>
  ${e.status === 'upcoming' && e.starts_on ? `<div class="wcd">${t('Starts in')} <b data-cd="${esc(e.starts_on)}"></b></div>` : ''}</div></a>`;

async function list(root, { navigate }) {
  let status = new URLSearchParams(location.hash.split('?')[1] || '').get('status') || 'live', f = { q: '', level: '', year: '', tc: '', country: '' }, page = 1, items = [], total = 0, stop = () => {}, disposed = false, facets = { years: [], federations: [] };
  try { facets = await wget('facets'); } catch { /* optional */ }
  root.innerHTML = `${subnav('events')}<div class="page-head"><div><div class="eyebrow">${t('Chess World')}</div><h1>${t('Tournament calendar')}</h1><p>${t('Live, upcoming and completed tournaments from official broadcasts and the Rookery editors. A schedule marked Provisional is not officially confirmed.')}</p></div></div>
    <div class="segmented" id="e-state">${STATES.map(([id, l]) => `<button type="button" data-v="${id}" aria-pressed="${status === id}">${t(l)}</button>`).join('')}</div>
    <div class="wfilters"><input type="search" id="e-q" placeholder="${esc(t('Search tournaments'))}" maxlength="60" aria-label="${esc(t('Search tournaments'))}">
      <select id="e-level" aria-label="${esc(t('Level'))}">${LEVELS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join('')}</select>
      <select id="e-year" aria-label="${esc(t('Year'))}"><option value="">${t('Any year')}</option>${[...new Set([...(facets.years || []), String(new Date().getFullYear()), String(new Date().getFullYear() - 1)])].sort().reverse().map((y) => `<option>${y}</option>`).join('')}</select>
      <select id="e-country" aria-label="${esc(t('Country'))}"><option value="">${t('Any country')}</option>${facets.federations.map((x) => `<option value="${x.fed}">${esc(countryName(x.fed, getLang()))}</option>`).join('')}</select>
      <select id="e-tc" aria-label="${esc(t('Time control'))}">${TCS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join('')}</select></div><div id="e-list"></div>`;
  bindSubnav(root, navigate);
  async function load(more) {
    const box = root.querySelector('#e-list'); if (!more) box.innerHTML = loader();
    let d; try { d = await wget('events', { status, ...f, page, size: 18 }); } catch (e) { box.innerHTML = errorBox(e); box.querySelector('[data-retry]').onclick = () => load(false); return; }
    if (disposed) return; total = d.total; items = more ? items.concat(d.events) : d.events; stop();
    box.innerHTML = items.length ? `<p class="muted small">${t('{n} tournaments', { n: total })}</p><div class="wgrid">${items.map(card).join('')}</div>${items.length < total ? `<div class="center"><button class="btn" id="e-more" type="button">${t('Show more')}</button></div>` : ''}`
      : emptyState({ emoji: '🏆', title: status === 'live' ? t('No tournament is live right now') : status === 'upcoming' ? t('No upcoming tournaments match') : t('No completed tournaments match'), body: t('Change the filters or look at another tab. Nothing is shown unless an official source or an editor has published it.') });
    box.querySelector('#e-more')?.addEventListener('click', () => { page++; load(true); }); stop = startCountdowns(box);
  }
  root.querySelectorAll('#e-state button').forEach((b) => { b.onclick = () => { status = b.dataset.v; page = 1; root.querySelectorAll('#e-state button').forEach((x) => x.setAttribute('aria-pressed', x === b)); load(false); }; });
  let timer; const change = () => { f = { q: root.querySelector('#e-q').value.trim(), level: root.querySelector('#e-level').value, year: root.querySelector('#e-year').value, tc: root.querySelector('#e-tc').value, country: root.querySelector('#e-country').value }; page = 1; load(false); };
  root.querySelector('#e-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(change, 350); });
  for (const id of ['#e-level', '#e-year', '#e-tc', '#e-country']) root.querySelector(id).addEventListener('change', change);
  await load(false);
  return () => { disposed = true; stop(); clearTimeout(timer); };
}

async function detail(root, { params, navigate }) {
  const id = params.id; let tab = 'overview', d = null, stop = () => {}, disposed = false, poll = null, tries = 0;
  async function load(first) {
    try { d = await wget('events/' + encodeURIComponent(id)); } catch (e) { if (first) root.innerHTML = `${subnav('events')}${e.message === 'Event not found.' ? emptyState({ emoji: '🔎', title: t('Tournament not found'), actionHtml: `<a class="btn" href="${hrefOf('events')}">${t('All tournaments')}</a>` }) : errorBox(e)}`; return; }
    if (disposed) return; paint();
    // games of the first rounds are imported on demand, a few rounds per request: keep asking while more are pending
    if ((d.syncing && tries < 12) || (d.event.status === 'live' && !poll)) { tries++; clearTimeout(poll); poll = setTimeout(() => load(false), d.event.status === 'live' ? 30000 : 2500); }
  }
  function paint() {
    const e = d.event, podium = d.standings.slice(0, 3), done = e.status === 'completed';
    const rows = d.rounds.map((r) => `<details class="wround" ${d.rounds.length <= 3 || r === d.rounds[d.rounds.length - 1] ? 'open' : ''}><summary><b>${esc(r.name)}</b> <span class="muted small">${t('{n} games', { n: r.games.length })}</span></summary><div class="wlist">${r.games.map((g) => `<a class="wrow" href="#/world/game/${g.id}"><span class="wp">${flagOf(g.white_fed)} ${g.white_title ? `<small>${esc(g.white_title)}</small> ` : ''}${esc(nameOf(g.white))} <small class="muted">${g.white_elo || ''}</small></span><b class="wres">${resultLabel(g.result)}</b><span class="wp r">${g.black_title ? `<small>${esc(g.black_title)}</small> ` : ''}${esc(nameOf(g.black))} <small class="muted">${g.black_elo || ''}</small> ${flagOf(g.black_fed)}</span></a>`).join('')}</div></details>`).join('');
    const sched = e.schedule.length ? `<ol class="wsched">${e.schedule.map((r) => `<li class="${r.ongoing ? 'now' : r.finished ? 'done' : ''}"><b>${esc(r.name)}</b><span>${fmtTime(r.startsAt)}</span>${r.ongoing ? statusChip('live') : r.finished ? `<span class="muted small">${t('Finished')}</span>` : r.startsAt && Date.parse(r.startsAt) > Date.now() ? `<span class="small">${t('Starts in')} <b data-cd="${esc(r.startsAt)}"></b></span>` : ''}</li>`).join('')}</ol>` : `<p class="muted">${t('The daily schedule has not been published yet.')}</p>`;
    const st = d.stats;
    const tabs = [['overview', 'Overview'], ['schedule', 'Schedule'], ['games', 'Rounds and games'], ['standings', 'Standings'], ['stats', 'Statistics']];
    const body = {
      overview: `<div class="wfacts big">${[['Location', e.location], ['Dates', fmtRange(e.starts_on, e.ends_on)], ['Format', e.format], ['Time control', [e.tc, e.fide_tc && tcLabel(e.fide_tc)].filter(Boolean).join(' · ')], ['Prize', e.prize], ['Players', e.players_text]].filter(([, v]) => v).map(([k, v]) => `<div><small>${t(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>
        <div class="btn-row">${e.registration_url ? `<a class="btn primary" href="${esc(e.registration_url)}" target="_blank" rel="noopener noreferrer">${t('Registration')} ${icon('arrow', 14)}</a>` : ''}${e.website ? `<a class="btn" href="${esc(e.website)}" target="_blank" rel="noopener noreferrer">${t('Official website')} ${icon('arrow', 14)}</a>` : ''}${e.standings_url ? `<a class="btn" href="${esc(e.standings_url)}" target="_blank" rel="noopener noreferrer">${t('Official standings')} ${icon('arrow', 14)}</a>` : ''}${e.source_url ? `<a class="btn ghost" href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">${t('Source')}: ${esc(e.source_name || '')}</a>` : ''}</div>
        ${!e.registration_url && !e.prize ? `<p class="muted small">${t('Prize and registration details are shown only when the organisers have published them.')}</p>` : ''}
        ${done && podium.length ? `<h3>${t('Final standings: top three')}</h3><ol class="wpod big">${podium.map((p, i) => `<li><span class="medal m${i + 1}">${i + 1}</span>${flagOf(p.fed)} <b>${esc(nameOf(p.name))}</b> <small class="muted">${p.elo || ''}</small><span class="pts">${p.points}</span></li>`).join('')}</ol>` : ''}`,
      schedule: sched,
      games: rows || `<p class="muted">${d.syncing ? t('Loading games…') : t('No games have been imported for this tournament yet.')}</p>`,
      standings: d.standings.length ? `<div class="card flush"><table class="table"><thead><tr><th>#</th><th>${t('Player')}</th><th class="num">${t('Rating')}</th><th class="num">${t('Games')}</th><th class="num">${t('Points')}</th></tr></thead><tbody>${d.standings.map((p) => `<tr><td>${p.rank}</td><td>${flagOf(p.fed)} ${p.title ? `<small>${esc(p.title)}</small> ` : ''}${esc(nameOf(p.name))}</td><td class="num">${p.elo || ''}</td><td class="num">${p.games}</td><td class="num"><b>${p.points}</b></td></tr>`).join('')}</tbody></table></div>${d.teams.length ? `<h3>${t('Team scores')}</h3><div class="card flush"><table class="table"><tbody>${d.teams.map((x) => `<tr><td>${x.rank}</td><td>${esc(x.team)}</td><td class="num">${x.points}</td></tr>`).join('')}</tbody></table></div>` : ''}<p class="muted small">${t('Standings are calculated from the games stored in Rookery. For tie-breaks see the official standings.')}</p>` : `<p class="muted">${t('Standings appear once games have been played.')}</p>`,
      stats: st.games ? `<div class="wstats"><div><b>${st.games}</b><small>${t('Games')}</small></div><div><b>${Math.round(st.whiteWins / st.games * 100)}%</b><small>${t('White wins')}</small></div><div><b>${Math.round(st.draws / st.games * 100)}%</b><small>${t('Draws')}</small></div><div><b>${Math.round(st.blackWins / st.games * 100)}%</b><small>${t('Black wins')}</small></div><div><b>${st.avgMoves ?? '–'}</b><small>${t('Average moves')}</small></div><div><b>${st.avgRating ?? '–'}</b><small>${t('Average rating')}</small></div></div>
        ${st.longest ? `<p><a href="#/world/game/${st.longest.id}">${t('Longest game')}: ${esc(nameOf(st.longest.white))} – ${esc(nameOf(st.longest.black))} (${t('{n} moves', { n: st.longest.moves })})</a></p>` : ''}${st.openings.length ? `<h3>${t('Most played openings')}</h3><div class="wlist">${st.openings.map((o) => `<div class="wrow"><span><b>${esc(o.eco)}</b> ${esc(o.name)}</span><span class="muted">${o.count}</span></div>`).join('')}</div>` : ''}` : `<p class="muted">${t('Statistics appear once games have been played.')}</p>`,
    }[tab];
    root.innerHTML = `${subnav('events')}<a class="btn ghost sm" href="${hrefOf('events')}">${icon('back', 16)} ${t('All tournaments')}</a>
      <header class="wevhead" data-img>${imgTag(e.image, '', 'bg')}<div><div class="wtags">${statusChip(e.status)}${confirmChip(e)}</div><h1>${esc(e.name)}</h1><p class="muted">${icon('globe', 14)} ${esc(e.location || t('Location to be announced'))} · ${fmtRange(e.starts_on, e.ends_on)}</p>
        ${e.status === 'upcoming' && e.starts_on ? `<div class="wcd big">${t('Starts in')} <b data-cd="${esc(e.starts_on)}"></b></div>` : ''}
        ${d.syncing ? `<p class="muted small"><span class="spinner"></span> ${t('Importing games… {done} of {total} rounds', { done: d.syncing.done, total: d.syncing.rounds })}</p>` : ''}${d.notice ? `<p class="muted small">${t('Live data is temporarily unavailable; showing what is stored.')}</p>` : ''}</div>
        <div class="btn-row">${d.rounds.length ? `<a class="btn" href="/api/world/events/${e.id}/pgn" download>${icon('download', 16)} ${t('Download PGN')}</a>` : ''}${e.status === 'live' ? `<a class="btn primary" href="${hrefOf('live')}">${icon('eye', 16)} ${t('Live games')}</a>` : ''}</div></header>
      <div class="segmented wtabs" id="e-tabs">${tabs.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${tab === k}">${t(l)}</button>`).join('')}</div><div class="wpane">${body}</div>`;
    bindSubnav(root, navigate);
    root.querySelectorAll('#e-tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.v; paint(); }; });
    stop(); stop = startCountdowns(root); document.title = `${e.name} · Rookery`;
  }
  root.innerHTML = loader(); await load(true);
  return () => { disposed = true; clearTimeout(poll); stop(); };
}
