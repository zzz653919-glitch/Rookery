// Online play: quick pairing (matchmaking) and private rooms for friends.
import { icon, esc, toast, emptyState } from '../ui/dom.js';
import { t } from '../i18n/core.js';
import { net, get, post, del, onAuth } from '../net.js';
import { onMatched } from '../realtime.js';
import { ensureSignedIn } from '../auth-ui.js';
import { store } from '../store.js';

const CATS = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical' };
const catOf = (b, i) => { const e = b + 40 * i; return e < 180 ? 'bullet' : e < 480 ? 'blitz' : e < 1500 ? 'rapid' : 'classical'; };
const label = ([b, i]) => `${b >= 60 ? b / 60 : b + 's'}+${i}`;

export async function mount(root, { params, navigate }) {
  if (!net.available) { navigate('/play'); return; }
  const friend = params.mode === 'friend';
  let controls = [[60, 0], [60, 1], [120, 1], [180, 0], [180, 2], [300, 0], [300, 3], [600, 0], [600, 5], [900, 10], [1800, 0]];
  try { controls = (await get('/api/time-controls')).controls; } catch { /* defaults */ }
  const saved = store.get('settings').onlineTc || [300, 0];
  let tc = controls.find((c) => c[0] === saved[0] && c[1] === saved[1]) || controls[5];
  let rated = true, color = 'random', searching = false, secs = 0, timer = null, poll = null, offMatched = null;

  const rating = (c) => (net.ratings ? Math.round(net.ratings[c]?.rating ?? 1200) : 1200);
  function draw() {
    const groups = {}; for (const c of controls) (groups[catOf(...c)] ||= []).push(c);
    const cat = catOf(...tc);
    root.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">${friend ? t('Play a friend') : t('Play online')}</div><h1>${friend ? t('Create a private game') : t('Find an opponent')}</h1>
        <p>${friend ? t('Pick the time control, then send the link to your friend.') : t('We pair you with a player of similar strength. Your rating changes only in rated games.')}</p></div>
        <div class="seg-links"><a class="chip ${friend ? '' : 'good'}" href="#/play/online">${t('Quick pairing')}</a><a class="chip ${friend ? 'good' : ''}" href="#/play/friend">${t('With a friend')}</a></div></div>
      <div class="online-layout">
        <section class="card">
          ${Object.entries(groups).map(([c, list]) => `<div class="tc-group"><div class="tc-head"><b>${t(CATS[c])}</b>${net.user ? `<span class="muted">${t('Your rating')} ${rating(c)}</span>` : ''}</div>
            <div class="tc-grid">${list.map((x) => `<button type="button" class="tc-btn" data-b="${x[0]}" data-i="${x[1]}" aria-pressed="${x === tc}"><b>${label(x)}</b><small>${t(CATS[c])}</small></button>`).join('')}</div></div>`).join('')}
          ${friend ? `<div class="tc-head" style="margin-top:14px"><b>${t('Your colour')}</b></div>
            <div class="segmented" id="colors">${[['w', t('White')], ['random', t('Random')], ['b', t('Black')]].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${color === v}">${l}</button>`).join('')}</div>`
            : `<div class="setting-row"><div><b>${t('Rated game')}</b><small>${t('Casual games never change your rating.')}</small></div><label class="switch"><input type="checkbox" id="rated" ${rated ? 'checked' : ''}><span></span></label></div>`}
          <div style="margin-top:18px" id="go-box"><button class="btn primary lg block" id="go" type="button">${friend ? icon('link', 20) + ' ' + t('Create game link') : icon('bolt', 20) + ' ' + t('Play {tc}', { tc: label(tc) })}</button></div>
          ${net.user ? '' : `<p class="muted small" style="margin-top:10px">${t('You will be asked to sign in or create a free account.')}</p>`}
        </section>
        <aside class="stack">
          <div class="card"><h3>${t('How it works')}</h3>
            <ul class="plain-list">
              <li>${icon('check', 16)} ${t('The server keeps the clock and checks every move.')}</li>
              <li>${icon('check', 16)} ${t('Connection lost? Reopen the game page — the clock kept running fairly.')}</li>
              <li>${icon('check', 16)} ${t('Rated games use an Elo rating per time control ({cat}: {r}).', { cat: t(CATS[cat]), r: rating(cat) })}</li>
            </ul></div>
          <div class="card"><h3>${t('Prefer a computer?')}</h3><p class="muted">${t('Nobody online right now? Play Stockfish while you wait.')}</p><a class="btn" href="#/play/computer">${icon('cpu', 18)} ${t('Play the computer')}</a></div>
        </aside>
      </div>`;
    root.querySelectorAll('.tc-btn').forEach((b) => { b.onclick = () => { tc = controls.find((c) => c[0] === +b.dataset.b && c[1] === +b.dataset.i); store.update('settings', (s) => { s.onlineTc = tc; }); draw(); }; });
    root.querySelectorAll('#colors button').forEach((b) => { b.onclick = () => { color = b.dataset.v; draw(); }; });
    const r = root.querySelector('#rated'); if (r) r.onchange = () => { rated = r.checked; };
    root.querySelector('#go').onclick = friend ? createRoom : startSearch;
  }

  async function createRoom() {
    if (!(await ensureSignedIn('register'))) return;
    try { const r = await post('/api/games/room', { base: tc[0], inc: tc[1], color }); navigate('/game/' + r.id); } catch (e) { toast(t(e.message), 'bad'); }
  }

  async function startSearch() {
    if (!(await ensureSignedIn('register'))) return;
    try {
      const r = await post('/api/games/queue', { base: tc[0], inc: tc[1], rated });
      if (r.status === 'matched') { navigate('/game/' + r.gameId); return; }
      searching = true; secs = 0; renderSearch();
      timer = setInterval(() => { secs++; renderSearch(); }, 1000);
      poll = setInterval(async () => { try { const p = await get('/api/games/queue'); if (p.status === 'matched') { stop(false); navigate('/game/' + p.gameId); } else if (p.status === 'idle') { stop(false); draw(); } } catch { /* retry */ } }, 2000);
      offMatched = onMatched((m) => { stop(false); navigate('/game/' + m.gameId); });
    } catch (e) { toast(t(e.message), 'bad'); }
  }
  function renderSearch() {
    const box = root.querySelector('#go-box'); if (!box) return;
    const m = Math.floor(secs / 60), s = String(secs % 60).padStart(2, '0');
    box.innerHTML = `<div class="searching"><span class="spinner"></span><div><b>${t('Searching for an opponent…')}</b><small class="muted">${label(tc)} · ${rated ? t('Rated') : t('Casual')} · ${m}:${s}</small>${secs > 20 ? `<small class="muted">${t('Quiet right now — the search range keeps widening. You can also')} <a href="#/play/computer">${t('play the computer')}</a>.</small>` : ''}</div><button class="btn" id="cancel" type="button">${t('Cancel')}</button></div>`;
    box.querySelector('#cancel').onclick = async () => { await stop(true); draw(); };
  }
  async function stop(leave) { clearInterval(timer); clearInterval(poll); offMatched?.(); offMatched = null; if (searching && leave) { try { await del('/api/games/queue'); } catch { /* ignore */ } } searching = false; }

  draw();
  const offAuth = onAuth(() => { if (!searching) draw(); });
  return () => { stop(true); offAuth(); };
}
