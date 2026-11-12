// Player profile: avatar, ratings, statistics, game history, favourite openings, achievements and learning progress.
import { esc, icon, modal, toast, emptyState, loader, progressBar } from '../ui/dom.js';
import { avatarHtml, flag, presetAvatar, PRESET_COUNT, COUNTRIES } from '../ui/user.js';
import { t, getLang } from '../i18n/core.js';
import { net, get, post, updateProfile, api, logout, onAuth } from '../net.js';
import { ensureSignedIn } from '../auth-ui.js';
import { store, currentStreak } from '../store.js';
import { LESSONS } from '../data/lessons.js';
import { ACHIEVEMENTS, puzzleAccuracy } from '../progress.js';
import { identify } from '../data/openings.js';
import { Chess } from '../chess/rules.js';
import { resultText, tcLabel } from './game.js';

const CATS = [['bullet', 'Bullet', 'bolt'], ['blitz', 'Blitz', 'flame'], ['rapid', 'Rapid', 'clock'], ['classical', 'Classical', 'crown'], ['puzzle', 'Puzzles', 'puzzle']];
const since = (iso) => { try { return new Date(iso).toLocaleDateString(getLang(), { year: 'numeric', month: 'long' }); } catch { return ''; } };

export async function mount(root, { params, navigate }) {
  const own = !params.name;
  if (!net.available) { root.innerHTML = ownOffline(); return; }
  if (own && !net.user) {
    root.innerHTML = `<div class="page-head"><div><div class="eyebrow">${t('Profile')}</div><h1>${t('Your chess profile')}</h1></div></div>
      ${emptyState({ emoji: '👤', title: t('Sign in to see your profile'), body: t('Your rating, game history, achievements and learning progress live here.'), actionHtml: `<div class="btn-row" style="justify-content:center"><button class="btn primary" id="si" type="button">${t('Sign in')}</button><button class="btn" id="su" type="button">${t('Create account')}</button></div>` })}`;
    root.querySelector('#si').onclick = async () => { if (await ensureSignedIn('login')) mount(root, { params, navigate }); };
    root.querySelector('#su').onclick = async () => { if (await ensureSignedIn('register')) mount(root, { params, navigate }); };
    return;
  }
  const name = own ? net.user.username : params.name;
  root.innerHTML = loader();
  let data; try { data = await get('/api/users/' + encodeURIComponent(name)); } catch (e) { root.innerHTML = emptyState({ emoji: '🔎', title: t('Player not found'), body: esc(t(e.message)) }); return; }
  const u = data.user, isMe = net.user?.username === u.username;
  let friends = null; if (net.user && !isMe) { try { friends = await get('/api/friends'); } catch { /* ignore */ } }
  const isFriend = !!friends?.friends.some((f) => f.username === u.username), pending = !!friends?.outgoing.some((f) => f.username === u.username);

  // favourite openings from the loaded games
  const fav = new Map();
  for (const g of data.games) {
    const color = g.players.w?.username === u.username ? 'w' : 'b';
    try { const c = new Chess(); const sans = []; for (const m of g.moves.slice(0, 14)) sans.push(c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san); const id = identify(sans); if (id) { const k = id.opening[1] + '|' + color; fav.set(k, (fav.get(k) || 0) + 1); } } catch { /* skip */ }
  }
  const favList = [...fav.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const tot = data.totals, rate = tot.games ? Math.round(100 * (tot.wins + tot.draws / 2) / tot.games) : null;
  const ratingCard = ([id, label, ic]) => { const r = data.ratings[id]; return `<div class="card rating-card"><div class="row spread"><span class="chip">${icon(ic, 14)} ${t(label)}</span><span class="muted small">${r.games} ${t('games')}</span></div><b class="big-rating">${r.rating}${id !== 'puzzle' && r.games < 30 ? '<sup>?</sup>' : ''}</b><div class="muted small">${t('Peak')} ${r.peak} · ${r.wins}${t('W')} ${r.draws}${t('D')} ${r.losses}${t('L')}</div></div>`; };
  const gameRow = (g) => { const mine = g.players.w?.username === u.username ? 'w' : 'b'; const opp = g.players[mine === 'w' ? 'b' : 'w']; const res = g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === (mine === 'w') ? 'w' : 'l'; const d = g.ratingChange ? g.ratingChange[mine] : null;
    return `<a class="game-row" href="#/game/${g.id}"><span class="res ${g.status === 'active' ? 'live' : res}">${g.status === 'active' ? icon('eye', 14) : res === 'w' ? t('W') : res === 'l' ? t('L') : t('D')}</span><span class="who">${mine === 'w' ? '⚪' : '⚫'} <b>${esc(opp?.username || '?')}</b> <span class="muted">${opp?.rating ?? ''}</span></span><span class="muted small hide-s">${tcLabel(g)} · ${g.kind === 'rated' ? t('Rated') : t('Casual')}</span><span class="muted small">${g.status === 'active' ? t('In progress') : esc(resultText(g))}</span>${d != null ? `<b class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</b>` : '<span></span>'}</a>`; };

  // learning progress & achievements (this browser's data; synced to the account when signed in)
  const lessons = store.get('lessons'), ps = store.get('puzzles'), have = store.get('achievements');
  const doneCount = Object.keys(lessons.done).length, acc = puzzleAccuracy();
  const learning = isMe ? `<section class="card"><div class="row spread"><h3>${t('Learning progress')}</h3><a class="btn sm" href="#/progress">${t('Details')} ${icon('arrow', 14)}</a></div>
      <div class="grid cols-3" style="margin:10px 0"><div class="stat"><b>${doneCount}/${LESSONS.length}</b><span>${t('Lessons')}</span></div><div class="stat"><b>${Object.keys(ps.solved).length}</b><span>${t('Puzzles solved')}</span></div><div class="stat"><b>${currentStreak()}</b><span>${t('Day streak')}</span></div></div>
      ${progressBar(LESSONS.length ? doneCount / LESSONS.length : 0)}<p class="muted small" style="margin-top:8px">${acc === null ? '' : t('Puzzle accuracy {n}%', { n: Math.round(acc * 100) })} ${net.user ? '· ' + t('synced with your account') : ''}</p></section>
    <section class="card"><h3>${t('Achievements')} <span class="muted" style="font-weight:400">${Object.keys(have).length}/${ACHIEVEMENTS.length}</span></h3><div class="ach-grid" style="margin-top:12px">${ACHIEVEMENTS.map((a) => `<div class="ach ${have[a.id] ? 'on' : ''}"><div class="ico">${icon(have[a.id] ? a.icon : 'lock', 20)}</div><div><b>${esc(t(a.name))}</b><small>${esc(t(a.desc))}</small></div></div>`).join('')}</div></section>` : '';

  root.innerHTML = `
    <section class="card profile-head"><div class="ph-avatar">${avatarHtml(u, 96)}</div>
      <div class="ph-main"><h1>${esc(u.username)} ${flag(u.country)}</h1><div class="muted">${u.online ? `<i class="dot on"></i> ${t('Online')}` : `<i class="dot"></i> ${t('Offline')}`} · ${t('Member since {date}', { date: since(u.createdAt) })}</div>${u.bio ? `<p style="margin-top:8px">${esc(u.bio)}</p>` : ''}</div>
      <div class="btn-row ph-actions">${isMe ? `<button class="btn" id="edit" type="button">${icon('gear', 16)} ${t('Edit profile')}</button><button class="btn ghost" id="out" type="button">${icon('x', 16)} ${t('Sign out')}</button>`
        : `${net.user ? (isFriend ? `<span class="chip good">${t('Friends')}</span>` : pending ? `<span class="chip">${t('Request sent')}</span>` : `<button class="btn primary" id="addf" type="button">${icon('users', 16)} ${t('Add friend')}</button>`) : ''}${net.user ? `<button class="btn ghost" id="rep" type="button">${icon('flag', 16)} ${t('Report')}</button>` : ''}`}</div></section>
    <div class="grid cols-5 ratings">${CATS.map(ratingCard).join('')}</div>
    <div class="grid cols-2" style="align-items:start;margin-top:16px">
      <div class="stack">
        <section class="card"><h3>${t('Statistics')}</h3><div class="grid cols-4" style="margin:10px 0"><div class="stat"><b>${tot.games}</b><span>${t('Games')}</span></div><div class="stat"><b class="up">${tot.wins}</b><span>${t('Wins')}</span></div><div class="stat"><b>${tot.draws}</b><span>${t('Draws')}</span></div><div class="stat"><b class="down">${tot.losses}</b><span>${t('Losses')}</span></div></div>
          ${rate === null ? `<p class="muted">${t('No rated games yet.')}</p>` : `${progressBar(rate / 100)}<p class="muted small" style="margin-top:6px">${t('Score rate {n}%', { n: rate })}</p>`}</section>
        <section class="card"><div class="row spread"><h3>${t('Recent games')}</h3></div>${data.games.length ? `<div class="game-list">${data.games.map(gameRow).join('')}</div>` : `<p class="muted">${t('No games yet.')}</p>`}</section>
      </div>
      <div class="stack">
        <section class="card"><h3>${t('Favourite openings')}</h3>${favList.length ? `<div class="stack" style="gap:8px;margin-top:10px">${favList.map(([k, n]) => { const [op, col] = k.split('|'); return `<div class="row spread"><span>${col === 'w' ? '⚪' : '⚫'} ${esc(op)}</span><span class="chip">${n}×</span></div>`; }).join('')}</div>` : `<p class="muted">${t('Play more games and the openings you like will show up here.')}</p>`}</section>
        ${learning}
      </div>
    </div>`;
  const on = (id, fn) => { const b = root.querySelector('#' + id); if (b) b.onclick = fn; };
  on('out', async () => { await logout(); navigate('/home'); });
  on('edit', () => editProfile(() => mount(root, { params, navigate })));
  on('addf', async () => { try { await post('/api/friends/request', { username: u.username }); toast(t('Friend request sent'), 'good'); mount(root, { params, navigate }); } catch (e) { toast(t(e.message), 'bad'); } });
  on('rep', () => reportUser(u.username));
  return () => {};
}

function ownOffline() {
  const have = store.get('achievements');
  return `<div class="page-head"><div><div class="eyebrow">${t('Profile')}</div><h1>${t('Your chess profile')}</h1><p>${t('Accounts and ratings need the Rookery server. Your learning progress below is stored on this device.')}</p></div><a class="btn" href="#/progress">${t('Learning progress')}</a></div>
    <section class="card"><h3>${t('Achievements')} <span class="muted" style="font-weight:400">${Object.keys(have).length}/${ACHIEVEMENTS.length}</span></h3><div class="ach-grid" style="margin-top:12px">${ACHIEVEMENTS.map((a) => `<div class="ach ${have[a.id] ? 'on' : ''}"><div class="ico">${icon(have[a.id] ? a.icon : 'lock', 20)}</div><div><b>${esc(t(a.name))}</b><small>${esc(t(a.desc))}</small></div></div>`).join('')}</div></section>`;
}

function editProfile(done) {
  const me = net.user; let avatar = me.avatar;
  const m = modal(`<h2>${t('Edit profile')}</h2>
    <div class="field-label">${t('Profile picture')}</div>
    <div class="avatar-grid" id="av">${Array.from({ length: PRESET_COUNT }, (_, i) => `<button type="button" class="av-btn" data-a="preset:${i + 1}" aria-pressed="${avatar === 'preset:' + (i + 1)}" aria-label="${t('Avatar {n}', { n: i + 1 })}">${presetAvatar(i + 1, 48)}</button>`).join('')}</div>
    <div class="row wrap" style="margin:10px 0"><label class="btn sm" for="av-up">${icon('upload', 16)} ${t('Upload your own')}</label><input type="file" id="av-up" accept=".svg,image/svg+xml,image/png,image/webp" class="sr-only"><small class="muted">${t('SVG, PNG or WebP, up to 100 KB')}</small>${me.avatar === 'upload' ? `<span class="chip">${t('Custom picture in use')}</span>` : ''}</div>
    <label class="field"><span>${t('Country')}</span><select id="pf-country"><option value="">—</option>${COUNTRIES.map(([c, n]) => `<option value="${c}" ${me.country === c ? 'selected' : ''}>${flag(c)} ${esc(n)}</option>`).join('')}</select></label>
    <label class="field"><span>${t('About you')}</span><textarea id="pf-bio" maxlength="300" style="min-height:80px;font-family:inherit">${esc(me.bio || '')}</textarea></label>
    <div class="notice bad" id="pf-err" hidden></div>
    <div class="actions"><button class="btn primary" id="pf-save" type="button">${t('Save')}</button><button class="btn ghost" data-x type="button">${t('Cancel')}</button></div>`);
  const err = m.el.querySelector('#pf-err');
  m.el.querySelectorAll('.av-btn').forEach((b) => { b.onclick = () => { avatar = b.dataset.a; m.el.querySelectorAll('.av-btn').forEach((o) => o.setAttribute('aria-pressed', o === b)); }; });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  m.el.querySelector('#av-up').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 100 * 1024) { err.hidden = false; err.textContent = t('Larger than 100 KB.'); return; }
    try { await api('PUT', '/api/me/avatar', new Uint8Array(await f.arrayBuffer())); await net.user && (await import('../net.js')).refreshRatings(); toast(t('Picture updated'), 'good'); m.close(); done(); } catch (ex) { err.hidden = false; err.textContent = t(ex.message); }
  };
  m.el.querySelector('#pf-save').onclick = async () => {
    try { const patch = { country: m.el.querySelector('#pf-country').value, bio: m.el.querySelector('#pf-bio').value }; if (avatar !== me.avatar && avatar.startsWith('preset:')) patch.avatar = avatar; await updateProfile(patch); toast(t('Profile saved'), 'good'); m.close(); done(); }
    catch (ex) { err.hidden = false; err.textContent = t(ex.message); }
  };
}

function reportUser(username) {
  const m = modal(`<h2>${t('Report {name}', { name: esc(username) })}</h2>
    <label class="field"><span>${t('Reason')}</span><select id="rp-reason"><option value="cheating">${t('Cheating')}</option><option value="abuse">${t('Abusive behaviour')}</option><option value="spam">${t('Spam')}</option><option value="other">${t('Other')}</option></select></label>
    <label class="field"><span>${t('Details (optional)')}</span><textarea id="rp-detail" maxlength="500" style="min-height:90px;font-family:inherit"></textarea></label>
    <div class="actions"><button class="btn primary" id="rp-go" type="button">${t('Send report')}</button><button class="btn ghost" data-x type="button">${t('Cancel')}</button></div>`);
  m.el.querySelector('[data-x]').onclick = () => m.close();
  m.el.querySelector('#rp-go').onclick = async () => { try { await post('/api/reports', { username, reason: m.el.querySelector('#rp-reason').value, detail: m.el.querySelector('#rp-detail').value }); toast(t('Thank you — a moderator will look at it.'), 'good'); m.close(); } catch (e) { toast(t(e.message), 'bad'); } };
}
