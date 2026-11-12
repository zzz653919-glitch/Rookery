// Arena tournaments: score as many points as you can in the time window.
import { esc, icon, toast, emptyState, loader } from '../ui/dom.js';
import { avatarHtml, flag } from '../ui/user.js';
import { t, getLang } from '../i18n/core.js';
import { net, get, post, onAuth } from '../net.js';
import { onMatched } from '../realtime.js';
import { ensureSignedIn } from '../auth-ui.js';

const when = (iso) => { try { return new Date(iso).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
const left = (iso) => { const s = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
const tcl = (x) => `${x.base >= 60 ? x.base / 60 : x.base + 's'}+${x.inc}`;
const STATE = { upcoming: 'Starts soon', running: 'Running', finished: 'Finished' };

export async function mount(root, { params, navigate }) {
  if (!net.available) { root.innerHTML = emptyState({ emoji: '🏆', title: t('Tournaments need the Rookery server'), body: t('Events are organised from the admin panel of the server.') }); return; }
  let timer = null, offM = null, offA = null, disposed = false;
  async function list() {
    let ts = []; try { ts = (await get('/api/tournaments')).tournaments; } catch { /* empty */ }
    if (disposed) return;
    root.innerHTML = `<div class="page-head"><div><div class="eyebrow">${t('Tournaments')}</div><h1>${t('Arena tournaments')}</h1><p>${t('Join, then play as many games as you can before the time runs out. Win 2 points, draw 1 — two wins in a row doubles your points.')}</p></div></div>
      ${ts.length ? `<div class="grid auto">${ts.map((x) => `<a class="card hover t-card ${x.state}" href="#/tournaments/${x.id}"><div class="row spread"><span class="chip ${x.state === 'running' ? 'good' : ''}">${t(STATE[x.state])}</span><span class="muted small">${tcl(x)} · ${t(x.category.charAt(0).toUpperCase() + x.category.slice(1))}</span></div>
        <h3 style="margin-top:10px">${icon('trophy', 18)} ${esc(x.name)}</h3><p class="muted">${esc(x.description || '')}</p>
        <div class="row spread small muted"><span>${x.state === 'running' ? t('Ends in {time}', { time: left(x.endsAt) }) : x.state === 'upcoming' ? when(x.startsAt) : t('Finished')}</span><span>${icon('users', 14)} ${x.players}</span></div></a>`).join('')}</div>` : emptyState({ emoji: '🏆', title: t('No tournaments scheduled'), body: t('New events appear here — check back soon.') })}`;
  }
  async function detail(id) {
    let x; try { x = await get('/api/tournaments/' + encodeURIComponent(id)); } catch (e) { root.innerHTML = emptyState({ emoji: '🔎', title: t('Tournament not found'), body: esc(t(e.message)), actionHtml: `<a class="btn" href="#/tournaments">${t('All tournaments')}</a>` }); return; }
    if (disposed) return;
    const running = x.state === 'running', fin = x.state === 'finished';
    root.innerHTML = `<a class="btn ghost sm" href="#/tournaments">${icon('back', 16)} ${t('All tournaments')}</a>
      <div class="page-head" style="margin-top:12px"><div><div class="eyebrow">${icon('trophy', 14)} ${t(STATE[x.state])} · ${tcl(x)}</div><h1>${esc(x.name)}</h1><p>${esc(x.description || '')}</p><p class="muted">${when(x.startsAt)} → ${when(x.endsAt)}${running ? ' · ' + t('Ends in {time}', { time: left(x.endsAt) }) : ''}</p></div>
        <div class="btn-row" id="t-actions">${fin ? '' : x.joined ? (running ? `<button class="btn primary lg" id="t-play" type="button">${icon('bolt', 18)} ${t('Play next game')}</button>` : `<span class="chip good">${t('You are in')}</span><button class="btn" id="t-leave" type="button">${t('Withdraw')}</button>`) : `<button class="btn primary lg" id="t-join" type="button">${t('Join tournament')}</button>`}</div></div>
      <div id="t-search" class="notice info row" hidden><span class="spinner"></span><span>${t('Looking for an opponent in the tournament…')}</span><button class="btn sm" id="t-cancel" type="button">${t('Cancel')}</button></div>
      <div class="card flush"><table class="table"><thead><tr><th>#</th><th>${t('Player')}</th><th class="num">${t('Points')}</th><th class="num hide-s">${t('Games')}</th><th class="num hide-s">${t('W/D/L')}</th></tr></thead><tbody>
      ${x.standings.map((p) => `<tr class="${net.user?.username === p.username ? 'me' : ''}"><td class="rank">${p.rank}</td><td><a class="ulink row" href="#/profile/${encodeURIComponent(p.username)}">${avatarHtml(p, 28)}<b>${esc(p.username)}</b> ${flag(p.country)} ${p.streak >= 2 ? icon('flame', 14) : ''}</a></td><td class="num"><b>${p.score}</b></td><td class="num hide-s">${p.games}</td><td class="num hide-s">${p.wins}/${p.draws}/${p.losses}</td></tr>`).join('') || `<tr><td colspan="5" class="muted" style="padding:18px">${t('Nobody has joined yet.')}</td></tr>`}</tbody></table></div>`;
    const on = (id2, fn) => { const b = root.querySelector('#' + id2); if (b) b.onclick = fn; };
    on('t-join', async () => { if (!(await ensureSignedIn('register'))) return; try { await post('/api/tournaments/' + x.id + '/join', {}); toast(t('You joined the tournament'), 'good'); detail(id); } catch (e) { toast(t(e.message), 'bad'); } });
    on('t-leave', async () => { try { await post('/api/tournaments/' + x.id + '/leave', {}); detail(id); } catch (e) { toast(t(e.message), 'bad'); } });
    on('t-play', async () => {
      try { const r = await post('/api/tournaments/' + x.id + '/play', {}); if (r.status === 'matched') { navigate('/game/' + r.gameId); return; }
        root.querySelector('#t-search').hidden = false; root.querySelector('#t-play').disabled = true;
        const poll = setInterval(async () => { try { const p = await get('/api/games/queue'); if (p.status === 'matched') { clearInterval(poll); navigate('/game/' + p.gameId); } else if (p.status === 'idle') clearInterval(poll); } catch { /* retry */ } }, 2000);
        offM?.(); offM = onMatched((m) => { clearInterval(poll); navigate('/game/' + m.gameId); });
        on('t-cancel', async () => { clearInterval(poll); try { await fetch('api/games/queue', { method: 'DELETE', headers: { 'x-csrf-token': net.csrf } }); } catch { /* ignore */ } detail(id); });
      } catch (e) { toast(t(e.message), 'bad'); }
    });
  }
  root.innerHTML = loader();
  const draw = () => (params.id ? detail(params.id) : list());
  await draw();
  timer = setInterval(() => { if (!document.hidden && !root.querySelector('#t-search:not([hidden])')) draw(); }, 15000);
  offA = onAuth(draw);
  return () => { disposed = true; clearInterval(timer); offM?.(); offA?.(); };
}
