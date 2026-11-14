// Live games (official broadcast rounds, polled every few seconds) and Live broadcasts (official embedded streams).
import { esc, emptyState, loader, icon } from '../ui/dom.js';
import { t } from '../i18n/core.js';
import { subnav, bindSubnav, wget, fmtTime, fmtRange, statusChip, flagOf, nameOf, startCountdowns, errorBox, resultLabel, boardHtml, evalGraph, evalText, clockText, pairs, hrefOf } from '../ui/world.js';

export async function mount(root, ctx) { return ctx.params.page === 'broadcasts' ? broadcasts(root, ctx) : live(root, ctx); }

// ---------------------------------------------------------------------------------------------------------- live games
async function live(root, { navigate }) {
  let disposed = false, timer = null, sel = null, expanded = new Set(), data = null, standings = {}, follow = true, viewPly = null, fails = 0;
  const POLL = 6000;
  const keyOf = (r, g) => `${r.round.id}:${g.id}`;
  const find = () => { for (const r of data?.rounds || []) for (const g of r.games) if (keyOf(r, g) === sel) return [r, g]; return [null, null]; };
  async function poll() {
    if (disposed || document.hidden) return schedule();
    try { data = await wget('live'); fails = 0; } catch (e) { fails++; if (!data) { root.innerHTML = `${subnav('live')}${errorBox(e)}`; root.querySelector('[data-retry]').onclick = () => { root.innerHTML = loader(); poll(); }; bindSubnav(root, navigate); return; } }
    if (disposed) return; paint(); schedule();
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(poll, POLL); };
  const mini = (r, g) => `<button class="wlive ${keyOf(r, g) === sel ? 'on' : ''}" data-k="${esc(keyOf(r, g))}" type="button">
      <div class="wl-p ${g.turn === 'b' && g.result === '*' ? 'turn' : ''}"><span>${flagOf(g.blackFed)} ${esc(nameOf(g.black))} <small class="muted">${g.blackElo || ''}</small></span><b>${g.result === '*' ? clockText(g.clocks.b) : resultLabel(g.result).split('–')[1] || ''}</b></div>
      ${boardHtml(g.fen, { orientation: 'w', last: g.lastMove })}
      <div class="wl-p ${g.turn === 'w' && g.result === '*' ? 'turn' : ''}"><span>${flagOf(g.whiteFed)} ${esc(nameOf(g.white))} <small class="muted">${g.whiteElo || ''}</small></span><b>${g.result === '*' ? clockText(g.clocks.w) : resultLabel(g.result).split('–')[0] || ''}</b></div></button>`;
  function big(r, g) {
    const ply = follow || viewPly == null ? g.plies : Math.min(viewPly, g.plies);
    return `<section class="wbig card"><div class="row spread"><div><div class="eyebrow">${esc(r.event.name)} · ${esc(r.round.name)}</div><h2>${esc(nameOf(g.white))} – ${esc(nameOf(g.black))}</h2></div><div class="btn-row"><button class="btn sm" data-close type="button">${icon('x', 14)} ${t('Close')}</button></div></div>
      <div class="wreplay live"><div class="wleft"><div class="wplayer b"><span class="wname">${flagOf(g.blackFed)} <b>${esc(nameOf(g.black))}</b> <small class="muted">${g.blackElo || ''}</small></span><span class="wclk">${g.result === '*' ? clockText(g.clocks.b) : ''}</span></div>
        <div id="w-bigboard"></div>
        <div class="wplayer w"><span class="wname">${flagOf(g.whiteFed)} <b>${esc(nameOf(g.white))}</b> <small class="muted">${g.whiteElo || ''}</small></span><span class="wclk">${g.result === '*' ? clockText(g.clocks.w) : ''}</span></div>
        <p class="muted small">${t('Clocks show the time left after each side’s last move.')}</p></div>
        <div class="wright"><div class="row spread"><span>${g.result === '*' ? statusChip('live') : `<b>${resultLabel(g.result)}</b>`}</span><label class="small"><input type="checkbox" id="w-follow" ${follow ? 'checked' : ''}> ${t('Follow live moves')}</label></div>
          ${g.eval ? `<div class="card"><div class="row spread"><b>${t('Engine evaluation')}</b><span class="wev-now">${evalText(g.eval)}</span></div>${evalGraph(g.evals, ply - 1)}</div>` : `<p class="muted small">${t('No engine evaluation is published for this game.')}</p>`}
          <div class="card wmoves">${pairs(g.sans).map(([no, a, b, i]) => `<div class="wmv"><span class="no">${no}.</span><button type="button" data-p="${i + 1}" class="${ply === i + 1 ? 'on' : ''}">${esc(a)}</button>${b ? `<button type="button" data-p="${i + 2}" class="${ply === i + 2 ? 'on' : ''}">${esc(b)}</button>` : '<span></span>'}</div>`).join('') || `<p class="muted">${t('No moves yet.')}</p>`}</div>
          <div class="btn-row">${g.url ? `<a class="btn" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${t('Open on Lichess')} ${icon('arrow', 14)}</a>` : ''}<a class="btn" href="#/world/event/${r.event.id}">${t('Tournament page')}</a></div>
          <div id="w-stand"></div></div></div></section>`;
  }
  async function paint() {
    const rounds = data.rounds;
    const [sr, sg] = find();
    root.innerHTML = `${subnav('live')}<div class="page-head"><div><div class="eyebrow">${t('Chess World')}</div><h1>${t('Live games')}</h1><p>${t('Games of official tournaments that are being played right now. Moves come from the organisers’ broadcast feed and are refreshed every few seconds.')}</p></div>
      <div class="wcount"><b class="pulse"></b><small>${data.stale ? t('Showing the last known moves') : t('Updated {time}', { time: new Date(data.rounds[0]?.updatedAt || data.serverTime).toLocaleTimeString() })}</small></div></div>
      ${sg ? big(sr, sg) : ''}
      ${rounds.length ? rounds.map((r) => `<section class="wsec"><div class="row spread"><h2><a href="#/world/event/${r.event.id}">${esc(r.event.name)}</a> <small class="muted">${esc(r.round.name)}</small></h2>${r.error ? `<span class="muted small">${esc(t(r.error))}</span>` : `<span class="muted small">${t('{n} games', { n: r.games.length })}</span>`}</div>${r.games.length ? `<div class="wlivegrid">${r.games.slice(0, expanded.has(r.round.id) ? 200 : 12).map((g) => mini(r, g)).join('')}</div>${r.games.length > 12 && !expanded.has(r.round.id) ? `<div class="center"><button class="btn" data-all="${esc(r.round.id)}" type="button">${t('Show all {n} boards', { n: r.games.length })}</button></div>` : ''}` : (r.error ? '' : `<p class="muted">${t('The first moves have not been played yet.')}</p>`)}</section>`).join('')
        : emptyState({ emoji: '♟', title: t('No official games are being played right now'), body: t('Only real broadcasts from official sources are shown here — nothing is simulated. Check the calendar for the next tournament.'), actionHtml: `<a class="btn primary" href="${hrefOf('events')}">${t('Tournament calendar')}</a>` })}`;
    bindSubnav(root, navigate);
    root.querySelectorAll('[data-all]').forEach((b) => { b.onclick = () => { expanded.add(b.dataset.all); paint(); }; });
    root.querySelectorAll('.wlive').forEach((b) => { b.onclick = () => { sel = b.dataset.k; viewPly = null; follow = true; paint(); root.querySelector('.wbig')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }; });
    if (sg) {
      const box = root.querySelector('#w-bigboard'); const ply = follow || viewPly == null ? sg.plies : Math.min(viewPly, sg.plies);
      // positions are rebuilt from the move list so the viewer can step back without another request
      const { Chess } = await import('../chess/rules.js'); const ch = new Chess(); let last = null; for (let i = 0; i < ply; i++) { const mv = ch.move(sg.sans[i]); if (!mv) break; last = { from: mv.from, to: mv.to }; }
      box.innerHTML = boardHtml(ch.fen(), { last });
      root.querySelector('[data-close]').onclick = () => { sel = null; paint(); };
      root.querySelector('#w-follow').onchange = (e) => { follow = e.target.checked; if (follow) viewPly = null; paint(); };
      root.querySelectorAll('.wbig .wmoves button').forEach((b) => { b.onclick = () => { viewPly = +b.dataset.p; follow = false; paint(); }; });
      if (!standings[sr.event.id]) wget('events/' + sr.event.id).then((d) => { standings[sr.event.id] = d.standings; const el = root.querySelector('#w-stand'); if (el) el.innerHTML = stand(d.standings); }).catch(() => {}); else root.querySelector('#w-stand').innerHTML = stand(standings[sr.event.id]);
    }
  }
  const stand = (rows) => rows.length ? `<div class="card flush"><div class="card-h"><b>${t('Live standings')}</b></div><table class="table"><tbody>${rows.slice(0, 10).map((p) => `<tr><td>${p.rank}</td><td>${flagOf(p.fed)} ${esc(nameOf(p.name))}</td><td class="num"><b>${p.points}</b></td></tr>`).join('')}</tbody></table></div>` : '';
  root.innerHTML = loader(); await poll();
  return () => { disposed = true; clearTimeout(timer); };
}

// ---------------------------------------------------------------------------------------------------------- broadcasts
async function broadcasts(root, { navigate }) {
  let stop = () => {}, disposed = false;
  async function draw() {
    let d, ev = { events: [] };
    try { d = await wget('broadcasts', { host: location.hostname }); } catch (e) { root.innerHTML = `${subnav('broadcasts')}${errorBox(e)}`; root.querySelector('[data-retry]').onclick = () => { root.innerHTML = loader(); draw(); }; bindSubnav(root, navigate); return; }
    try { ev = await wget('events', { status: 'live', size: 8 }); } catch { /* optional */ }
    if (disposed) return; stop();
    const f = d.featured;
    const player = (b) => b.embed?.url ? `<div class="wvideo"><iframe src="${esc(b.embed.url)}" title="${esc(b.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p class="muted small">${t('If the stream does not load, it may not be live yet or the organiser blocks embedding.')} ${b.embed.watch ? `<a href="${esc(b.embed.watch)}" target="_blank" rel="noopener noreferrer">${t('Open it on the platform')} ${icon('arrow', 12)}</a>` : ''}</p>` : `<div class="empty small"><p>${t('This broadcast cannot be embedded.')}</p>${b.embed?.watch ? `<a class="btn primary" href="${esc(b.embed.watch)}" target="_blank" rel="noopener noreferrer">${t('Watch on the official page')} ${icon('arrow', 14)}</a>` : ''}</div>`;
    const row = (b) => `<div class="wrow ev"><span><b>${esc(b.title)}</b><small class="muted"> ${esc(b.channel || '')}${b.official ? ` · ${t('Official')}` : ''}</small></span><span class="small muted">${b.startsAt ? fmtTime(b.startsAt) : ''}</span>${b.status === 'upcoming' && b.startsAt ? `<span class="wcd small"><b data-cd="${esc(b.startsAt)}"></b></span>` : statusChip(b.status)}</div>`;
    root.innerHTML = `${subnav('broadcasts')}<div class="page-head"><div><div class="eyebrow">${t('Chess World')}</div><h1>${t('Live broadcasts')}</h1><p>${t('Official streams of tournaments, embedded from the organisers’ own channels. Only broadcasts added by Rookery editors from official sources appear here.')}</p></div></div>
      ${f ? `<section class="wsec wstage"><div class="row spread"><h2>${esc(f.title)}</h2>${statusChip(f.status)}</div><p class="muted small">${esc(f.channel || '')}${f.language ? ` · ${esc(f.language)}` : ''}</p>${player(f)}${f.commentary ? `<div class="card"><b>${t('Commentary')}</b><p>${esc(f.commentary)}</p></div>` : f.description ? `<p>${esc(f.description)}</p>` : ''}</section>`
        : `<section class="wsec"><div class="empty"><div class="big">📺</div><h3>${t('No official stream is live right now')}</h3><p>${t('When an official broadcast starts it appears here automatically. Nothing is shown unless the organisers stream it.')}</p></div></section>`}
      ${d.live.length > 1 ? `<section class="wsec"><h2>${t('Also live')}</h2><div class="wgrid">${d.live.filter((b) => b.id !== f?.id).map((b) => `<div class="card"><h3>${esc(b.title)}</h3>${player(b)}</div>`).join('')}</div></section>` : ''}
      ${ev.events.length ? `<section class="wsec"><h2>${t('Tournament broadcasts')}</h2><p class="muted small">${t('Moves of these official tournaments are broadcast live; follow the boards here.')}</p><div class="wlist">${ev.events.map((e) => `<div class="wrow ev"><span><b>${esc(e.name)}</b><small class="muted"> ${esc(e.location || '')}</small></span><span class="btn-row"><a class="btn sm primary" href="${hrefOf('live')}">${icon('eye', 14)} ${t('Live games')}</a>${e.source_url ? `<a class="btn sm" href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">Lichess ${icon('arrow', 12)}</a>` : ''}</span></div>`).join('')}</div></section>` : ''}
      <section class="wsec"><h2>${t('Upcoming broadcasts')}</h2>${d.upcoming.length ? `<div class="wlist">${d.upcoming.map(row).join('')}</div>` : `<p class="muted wempty">${t('No broadcasts are scheduled yet.')}</p>`}</section>
      <section class="wsec"><h2>${t('Broadcast archive')}</h2>${d.archive.length ? `<div class="wgrid">${d.archive.map((b) => `<div class="card"><div class="row spread"><h3>${esc(b.title)}</h3>${statusChip('completed')}</div><p class="muted small">${esc(b.channel || '')} · ${b.startsAt ? fmtRange(b.startsAt, b.endsAt) : ''}</p>${b.embed?.url ? `<details><summary class="btn sm">${icon('play', 14)} ${t('Watch the recording')}</summary>${player(b)}</details>` : b.embed?.watch ? `<a class="btn sm" href="${esc(b.embed.watch)}" target="_blank" rel="noopener noreferrer">${t('Watch on the official page')} ${icon('arrow', 12)}</a>` : ''}</div>`).join('')}</div>` : `<p class="muted wempty">${t('Completed broadcasts will be archived here.')}</p>`}</section>`;
    bindSubnav(root, navigate); stop = startCountdowns(root);
  }
  root.innerHTML = loader(); await draw();
  const timer = setInterval(() => { if (!document.hidden) draw(); }, 90000);
  return () => { disposed = true; clearInterval(timer); stop(); };
}
