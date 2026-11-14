// Watch: live games of other players.
import { icon, esc, emptyState, loader } from '../ui/dom.js';
import { avatarHtml, flag } from '../ui/user.js';
import { miniBoard } from '../ui/mini.js';
import { t } from '../i18n/core.js';
import { net, get } from '../net.js';
import { tcLabel } from './game.js';

export async function mount(root) {
  if (!net.available) { root.innerHTML = emptyState({ emoji: '📡', title: t('Watching needs the Rookery server'), body: t('Live games are only available when Rookery runs with its server.') }); return; }
  root.innerHTML = loader();
  let timer = null, disposed = false;
  async function load() {
    let list = [], recent = [];
    try { list = (await get('/api/games/live')).games; } catch { /* keep the old list */ }
    try { recent = (await get('/api/games/recent')).games; } catch { /* optional */ }
    if (disposed) return;
    const recentCard = (g) => { const res = g.result === '1-0' ? '1–0' : g.result === '0-1' ? '0–1' : '½–½'; return `<a class="card hover live-card done" href="#/game/${g.id}">${miniBoard(g.fen, 'w', 200)}
      <div class="live-meta"><div class="row spread"><b>${flag(g.players.w.country)} ${esc(g.players.w.username)}</b><span class="muted">${g.players.w.rating}</span></div>
      <div class="row spread"><b>${flag(g.players.b.country)} ${esc(g.players.b.username)}</b><span class="muted">${g.players.b.rating}</span></div>
      <div class="row spread"><span class="chip">${tcLabel(g)}</span><span class="chip good">${res}</span></div></div></a>`; };
    const [top, ...rest] = list;
    const card = (g) => `<a class="card hover live-card" href="#/game/${g.id}">${miniBoard(g.fen, 'w', 200)}
      <div class="live-meta"><div class="row spread"><b>${flag(g.players.w.country)} ${esc(g.players.w.username)}</b><span class="muted">${g.players.w.rating}</span></div>
      <div class="row spread"><b>${flag(g.players.b.country)} ${esc(g.players.b.username)}</b><span class="muted">${g.players.b.rating}</span></div>
      <div class="row spread"><span class="chip">${tcLabel(g)} · ${g.kind === 'rated' ? t('Rated') : t('Casual')}</span><span class="muted small">${g.moves.length} ${t('moves')}</span></div></div></a>`;
    root.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">${t('Watch')}</div><h1>${t('Live games')}</h1><p>${t('Follow the strongest games happening right now. Moves and clocks update live.')}</p></div></div>
      ${top ? `<section class="card featured-game"><div class="eyebrow">${icon('crown', 14)} ${t('Top game')}</div><div class="fg-grid"><div>${miniBoard(top.fen, 'w', 320)}</div><div class="stack">
        <h2>${esc(top.players.w.username)} <span class="muted">${top.players.w.rating}</span> ${t('vs')} ${esc(top.players.b.username)} <span class="muted">${top.players.b.rating}</span></h2>
        <p class="muted">${tcLabel(top)} · ${top.kind === 'rated' ? t('Rated') : t('Casual')} · ${top.moves.length} ${t('moves')}</p>
        <a class="btn primary" href="#/game/${top.id}">${icon('eye', 18)} ${t('Watch this game')}</a></div></div></section>` : ''}
      ${rest.length ? `<h2 style="margin-top:22px">${t('More games')}</h2><div class="grid auto live-grid">${rest.map(card).join('')}</div>` : ''}
      ${!list.length && recent.length ? `<div class="card quiet row spread"><div><h3 style="margin:0">${t('No games right now')}</h3><p class="muted" style="margin:4px 0 0">${t('When players start games you can watch them here. Start one yourself!')}</p></div><a class="btn primary" href="#/play/online">${t('Play online')}</a></div>` : ''}
      ${recent.length ? `<h2 style="margin-top:26px">${t('Recent games')}</h2><div class="grid auto live-grid">${recent.map(recentCard).join('')}</div>` : ''}
      ${!list.length && !recent.length ? emptyState({ emoji: '♟', title: t('No games right now'), body: t('When players start games you can watch them here. Start one yourself!'), actionHtml: `<a class="btn primary" href="#/play/online">${t('Play online')}</a>` }) : ''}`;
  }
  await load();
  timer = setInterval(load, 8000);
  return () => { disposed = true; clearInterval(timer); };
}
