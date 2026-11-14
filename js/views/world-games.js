// Results archive (completed tournaments and a searchable game database) and the replay page of one game.
import { esc, emptyState, loader, icon, toast } from '../ui/dom.js';
import { t, getLang } from '../i18n/core.js';
import { Chess } from '../chess/rules.js';
import { allFederations, countryName } from '../data/countries.js';
import { subnav, bindSubnav, wget, fmtDate, flagOf, nameOf, errorBox, resultLabel, tcLabel, boardHtml, evalGraph, evalText, clockText, pairs, hrefOf, statusChip, fmtRange, imgTag } from '../ui/world.js';

export async function mount(root, ctx) { return ctx.params.page === 'game' ? replay(root, ctx) : results(root, ctx); }

const TCS = [['', 'Any time control'], ['standard', 'Classical'], ['rapid', 'Rapid'], ['blitz', 'Blitz']];
const RESULTS = [['', 'Any result'], ['1-0', 'White wins'], ['1/2-1/2', 'Draw'], ['0-1', 'Black wins']];

async function results(root, { navigate }) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  let tab = qs.get('tab') === 'tournaments' ? 'tournaments' : 'games';
  let f = { player: qs.get('player') || '', event: qs.get('event') || '', country: qs.get('country') || '', year: qs.get('year') || '', tc: qs.get('tc') || '', result: '' }, page = 1, rows = [], total = 0, disposed = false, facets = { years: [], federations: [], counts: { events: 0, games: 0 } };
  try { facets = await wget('facets'); } catch { /* the filters still work with free text */ }
  root.innerHTML = `${subnav('results')}<div class="page-head"><div><div class="eyebrow">${t('Chess World')}</div><h1>${t('Results and game archive')}</h1><p>${t('Completed tournaments and every game stored in Rookery: search by player, country, tournament, year and time control, then replay the game move by move.')}</p></div>
      <div class="wcount"><b>${facets.counts.games}</b><small>${t('games stored')}</small></div></div>
    <div class="segmented" id="r-tab"><button type="button" data-v="games" aria-pressed="${tab === 'games'}">${t('Games')}</button><button type="button" data-v="tournaments" aria-pressed="${tab === 'tournaments'}">${t('Completed tournaments')}</button></div>
    <div id="r-body"></div>`;
  bindSubnav(root, navigate);
  root.querySelectorAll('#r-tab button').forEach((b) => { b.onclick = () => { tab = b.dataset.v; root.querySelectorAll('#r-tab button').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }; });

  function draw() { tab === 'games' ? gamesTab() : tournamentsTab(); }
  async function gamesTab() {
    const body = root.querySelector('#r-body');
    body.innerHTML = `<div class="wfilters wide"><input type="search" id="g-player" placeholder="${esc(t('Player'))}" value="${esc(f.player)}" maxlength="60" aria-label="${esc(t('Player'))}">
      <input type="search" id="g-event" placeholder="${esc(t('Tournament'))}" value="${esc(f.event)}" maxlength="60" aria-label="${esc(t('Tournament'))}">
      <select id="g-country" aria-label="${esc(t('Country'))}"><option value="">${t('Any country')}</option>${(facets.federations.length ? facets.federations.map((x) => x.fed) : allFederations()).map((c) => `<option value="${c}" ${f.country === c ? 'selected' : ''}>${esc(countryName(c, getLang()))} (${c})</option>`).join('')}</select>
      <select id="g-year" aria-label="${esc(t('Year'))}"><option value="">${t('Any year')}</option>${facets.years.map((y) => `<option ${f.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <select id="g-tc" aria-label="${esc(t('Time control'))}">${TCS.map(([v, l]) => `<option value="${v}" ${f.tc === v ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
      <select id="g-res" aria-label="${esc(t('Result'))}">${RESULTS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join('')}</select></div><div id="g-list"></div>`;
    let timer; const change = () => { f = { player: body.querySelector('#g-player').value.trim(), event: body.querySelector('#g-event').value.trim(), country: body.querySelector('#g-country').value, year: body.querySelector('#g-year').value, tc: body.querySelector('#g-tc').value, result: body.querySelector('#g-res').value }; page = 1; load(false); };
    for (const id of ['#g-player', '#g-event']) body.querySelector(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(change, 350); });
    for (const id of ['#g-country', '#g-year', '#g-tc', '#g-res']) body.querySelector(id).addEventListener('change', change);
    load(false);
  }
  async function load(more) {
    const box = root.querySelector('#g-list'); if (!box) return; if (!more) box.innerHTML = loader();
    let d; try { d = await wget('games', { ...f, size: 30, page }); } catch (e) { box.innerHTML = errorBox(e); box.querySelector('[data-retry]').onclick = () => load(false); return; }
    if (disposed) return; total = d.total; rows = more ? rows.concat(d.games) : d.games;
    box.innerHTML = rows.length ? `<p class="muted small">${t('{n} games', { n: total })}</p><div class="card flush"><div class="wlist tight">${rows.map((g) => `<a class="wrow game" href="#/world/game/${g.id}"><span class="wp">${flagOf(g.white_fed)} ${g.white_title ? `<small>${esc(g.white_title)}</small> ` : ''}${esc(nameOf(g.white))} <small class="muted">${g.white_elo || ''}</small></span><b class="wres">${resultLabel(g.result)}</b><span class="wp r">${g.black_title ? `<small>${esc(g.black_title)}</small> ` : ''}${esc(nameOf(g.black))} <small class="muted">${g.black_elo || ''}</small> ${flagOf(g.black_fed)}</span><span class="wev muted small">${esc(g.event_name)} · ${esc(g.round_name || '')} · ${fmtDate(g.played_on)}</span></a>`).join('')}</div></div>${rows.length < total ? `<div class="center"><button class="btn" id="g-more" type="button">${t('Show more')}</button></div>` : ''}`
      : emptyState({ emoji: '♟', title: t('No games match'), body: facets.counts.games ? t('Change the filters. Games are stored when a tournament page is opened, so open a completed tournament to add its games.') : t('No games are stored yet. Open a completed tournament and its games are imported automatically.'), actionHtml: `<button class="btn primary" id="g-go" type="button">${t('Completed tournaments')}</button>` });
    box.querySelector('#g-more')?.addEventListener('click', () => { page++; load(true); });
    box.querySelector('#g-go')?.addEventListener('click', () => { tab = 'tournaments'; root.querySelectorAll('#r-tab button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === tab)); draw(); });
  }
  async function tournamentsTab() {
    const body = root.querySelector('#r-body'); body.innerHTML = loader();
    let d; try { d = await wget('events', { status: 'completed', size: 30 }); } catch (e) { body.innerHTML = errorBox(e); body.querySelector('[data-retry]').onclick = () => tournamentsTab(); return; }
    body.innerHTML = d.events.length ? `<div class="wgrid">${d.events.map((e) => `<a class="wcard event completed" href="#/world/event/${e.id}" data-img><div class="wimg">${imgTag(e.image, '')}<div class="wtags">${statusChip('completed')}</div></div><div class="wbody"><h3>${esc(e.name)}</h3><p class="muted small">${esc(e.location || '')} · ${fmtRange(e.starts_on, e.ends_on)}</p>${e.fide_tc ? `<div class="wfacts"><span>${tcLabel(e.fide_tc)}</span></div>` : ''}</div></a>`).join('')}</div>` : emptyState({ emoji: '🏆', title: t('No completed tournaments yet'), body: t('They appear here once the official feed lists them.') });
  }
  draw();
  return () => { disposed = true; };
}

// ---------------------------------------------------------------------------------------------------------- replay
async function replay(root, { params, navigate }) {
  root.innerHTML = loader();
  let data; try { data = await wget('games/' + encodeURIComponent(params.id)); } catch (e) { root.innerHTML = `${subnav('results')}${emptyState({ emoji: '🔎', title: t('Game not found'), body: esc(t(e.message)), actionHtml: `<a class="btn" href="${hrefOf('results')}">${t('Results')}</a>` })}`; return; }
  const g = data.game, moves = data.moves;
  // positions after every move (the standard rules engine, shared with the server)
  const chess = new Chess(); const fens = [chess.fen()], lasts = [null], ok = [];
  for (const m of moves) { const mv = chess.move(m.san); if (!mv) break; fens.push(chess.fen()); lasts.push({ from: mv.from, to: mv.to }); ok.push(m); }
  const n = ok.length; let cur = Math.min(n, +new URLSearchParams(location.hash.split('?')[1] || '').get('move') || n), orient = 'w', timer = null;
  const evals = ok.map((m) => (m.eval ? (m.eval.mate != null ? (m.eval.mate > 0 ? 1000 : -1000) : m.eval.cp) : null));
  const hasEval = evals.some((e) => e != null);
  const sideClock = (side) => { for (let i = cur - 1; i >= 0; i--) if (i % 2 === (side === 'w' ? 0 : 1) && ok[i].clk != null) return ok[i].clk; return null; };
  const plr = (side) => { const wh = side === 'w'; return `<div class="wplayer ${side}"><span class="wname">${flagOf(wh ? g.white_fed : g.black_fed)} ${(wh ? g.white_title : g.black_title) ? `<small>${esc(wh ? g.white_title : g.black_title)}</small> ` : ''}<b>${esc(nameOf(wh ? g.white : g.black))}</b> <small class="muted">${(wh ? g.white_elo : g.black_elo) || ''}</small></span><span class="wclk">${clockText(sideClock(side))}</span></div>`; };
  function paint() {
    const top = orient === 'w' ? 'b' : 'w', bot = orient === 'w' ? 'w' : 'b'; const e = ok[cur - 1];
    root.innerHTML = `${subnav('results')}<a class="btn ghost sm" href="#/world/event/${g.event_id}">${icon('back', 16)} ${esc(g.event_name)}</a>
      <div class="page-head"><div><div class="eyebrow">${esc(g.round_name || '')}${g.board ? ' · ' + t('Board') + ' ' + esc(g.board) : ''} · ${fmtDate(g.played_on)}</div><h1>${esc(nameOf(g.white))} – ${esc(nameOf(g.black))}</h1><p class="muted">${g.result === '*' ? t('In progress') : resultLabel(g.result)}${g.opening ? ` · ${esc(g.eco || '')} ${esc(g.opening)}` : ''}${g.fide_tc ? ` · ${tcLabel(g.fide_tc)}` : ''}</p></div></div>
      <div class="wreplay"><div class="wleft">${plr(top)}${boardHtml(fens[cur], { orientation: orient, last: lasts[cur] })}${plr(bot)}
        <div class="wctl" role="group" aria-label="${esc(t('Replay controls'))}"><button class="btn icon-btn" data-a="first" aria-label="${esc(t('First move'))}">⏮</button><button class="btn icon-btn" data-a="prev" aria-label="${esc(t('Previous move'))}">◀</button><button class="btn primary icon-btn" data-a="play" aria-label="${esc(timer ? t('Pause') : t('Play'))}">${timer ? '⏸' : '▶'}</button><button class="btn icon-btn" data-a="next" aria-label="${esc(t('Next move'))}">▶</button><button class="btn icon-btn" data-a="last" aria-label="${esc(t('Last move'))}">⏭</button><button class="btn icon-btn" data-a="flip" aria-label="${esc(t('Flip board'))}">⇅</button></div></div>
        <div class="wright">${hasEval ? `<div class="card"><div class="row spread"><b>${t('Engine evaluation')}</b><span class="wev-now">${e ? evalText(e.eval) : ''}</span></div><div class="wgraphbox" id="w-graph">${evalGraph(evals, cur - 1)}</div><p class="muted small">${t('Evaluations are embedded in the broadcast PGN by the organisers.')}</p></div>` : ''}
          <div class="card wmoves" id="w-moves" role="list">${pairs(ok.map((m) => m.san)).map(([no, a, b, i]) => `<div class="wmv" role="listitem"><span class="no">${no}.</span><button type="button" data-i="${i + 1}" class="${cur === i + 1 ? 'on' : ''}">${esc(a)}${ok[i].eval ? `<small>${evalText(ok[i].eval)}</small>` : ''}</button>${b ? `<button type="button" data-i="${i + 2}" class="${cur === i + 2 ? 'on' : ''}">${esc(b)}${ok[i + 1].eval ? `<small>${evalText(ok[i + 1].eval)}</small>` : ''}</button>` : '<span></span>'}</div>`).join('') || `<p class="muted">${t('No moves.')}</p>`}${g.result !== '*' ? `<div class="wmv res"><b>${resultLabel(g.result)}</b></div>` : ''}</div>
          <div class="btn-row"><a class="btn" href="/api/world/games/${g.id}/pgn" download>${icon('download', 16)} ${t('Download PGN')}</a><button class="btn" id="w-copy" type="button">${icon('copy', 16)} ${t('Copy PGN')}</button><button class="btn primary" id="w-analyze" type="button">${icon('target', 16)} ${t('Analyze with Stockfish')}</button></div>
          ${g.source_url ? `<p class="muted small">${t('Source')}: <a href="${esc(g.source_url)}" target="_blank" rel="noopener noreferrer">Lichess Broadcasts</a></p>` : ''}</div></div>`;
    bindSubnav(root, navigate);
    root.querySelectorAll('.wctl button').forEach((b) => { b.onclick = () => act(b.dataset.a); });
    root.querySelectorAll('#w-moves button').forEach((b) => { b.onclick = () => { cur = +b.dataset.i; stopPlay(); paint(); }; });
    root.querySelector('#w-graph')?.addEventListener('click', (ev) => { const r = ev.currentTarget.getBoundingClientRect(); cur = Math.max(1, Math.min(n, Math.round(((ev.clientX - r.left) / r.width) * (n - 1)) + 1)); stopPlay(); paint(); });
    root.querySelector('#w-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(data.pgn); toast(t('PGN copied to clipboard'), 'good'); } catch { toast(t('Copy failed'), 'bad'); } });
    root.querySelector('#w-analyze')?.addEventListener('click', () => { try { sessionStorage.setItem('rookery:analysis-pgn', data.pgn); } catch { /* ignore */ } navigate('/analysis'); });
    root.querySelector('#w-moves .on')?.scrollIntoView({ block: 'nearest' });
    document.title = `${nameOf(g.white)} – ${nameOf(g.black)} · Rookery`;
  }
  function stopPlay() { clearInterval(timer); timer = null; }
  function act(a) {
    if (a === 'first') { cur = 0; stopPlay(); } else if (a === 'last') { cur = n; stopPlay(); } else if (a === 'prev') { cur = Math.max(0, cur - 1); stopPlay(); } else if (a === 'next') { cur = Math.min(n, cur + 1); stopPlay(); }
    else if (a === 'flip') orient = orient === 'w' ? 'b' : 'w';
    else if (a === 'play') { if (timer) stopPlay(); else { if (cur >= n) cur = 0; timer = setInterval(() => { if (cur >= n) { stopPlay(); } else cur++; paint(); }, 900); } }
    paint();
  }
  const onKey = (e) => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return; if (e.key === 'ArrowLeft') { act('prev'); e.preventDefault(); } else if (e.key === 'ArrowRight') { act('next'); e.preventDefault(); } else if (e.key === 'Home') act('first'); else if (e.key === 'End') act('last'); };
  document.addEventListener('keydown', onKey); paint();
  return () => { stopPlay(); document.removeEventListener('keydown', onKey); };
}
