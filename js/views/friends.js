// Friends: requests, presence, challenges.
import { esc, icon, toast, modal, emptyState, loader } from '../ui/dom.js';
import { avatarHtml, flag } from '../ui/user.js';
import { t } from '../i18n/core.js';
import { net, get, post, del, onAuth } from '../net.js';
import { onNotify } from '../realtime.js';
import { ensureSignedIn } from '../auth-ui.js';

export async function mount(root, { navigate }) {
  if (!net.available) { root.innerHTML = emptyState({ emoji: '📡', title: t('Friends need the Rookery server'), body: t('Accounts and friends live on the server.') }); return; }
  let disposed = false;
  async function draw() {
    if (!net.user) {
      root.innerHTML = `<div class="page-head"><div><div class="eyebrow">${t('Friends')}</div><h1>${t('Play with people you know')}</h1></div></div>${emptyState({ emoji: '👋', title: t('Sign in to see your friends'), body: t('Add friends, see who is online and challenge them to a game.'), actionHtml: `<button class="btn primary" id="si" type="button">${t('Sign in')}</button>` })}`;
      root.querySelector('#si').onclick = () => ensureSignedIn(); return;
    }
    root.insertAdjacentHTML('afterbegin', '');
    let f, ch; try { [f, ch] = await Promise.all([get('/api/friends'), get('/api/challenges')]); } catch (e) { root.innerHTML = emptyState({ title: t('Something went wrong'), body: esc(t(e.message)) }); return; }
    if (disposed) return;
    const row = (u, actions) => `<div class="friend-row"><a href="#/profile/${encodeURIComponent(u.username)}" class="row">${avatarHtml(u, 40)}<div><b>${esc(u.username)}</b> ${flag(u.country)}<small class="muted">${u.online ? `<i class="dot on"></i> ${t('Online')}` : `<i class="dot"></i> ${t('Offline')}`}</small></div></a><div class="btn-row">${actions}</div></div>`;
    root.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">${t('Friends')}</div><h1>${t('Your friends')}</h1><p>${t('Friends can challenge each other to private games.')}</p></div>
        <form class="row" id="add-form"><input type="text" id="add-name" placeholder="${t('Add a friend by username')}" maxlength="20" aria-label="${t('Username')}" autocomplete="off"><button class="btn primary" type="submit">${icon('users', 18)} ${t('Add')}</button></form></div>
      ${ch.challenges.length ? `<section class="card" style="margin-bottom:16px"><h3>${t('Challenges')}</h3>${ch.challenges.map((c) => `<div class="friend-row"><div><b>${esc(c.from)}</b> ${t('challenges you to a {tc} game', { tc: `${c.base >= 60 ? c.base / 60 : c.base + 's'}+${c.inc}` })}</div><div class="btn-row"><button class="btn primary sm" data-acc="${c.gameId}" type="button">${t('Accept')}</button><button class="btn sm" data-dec="${c.gameId}" type="button">${t('Decline')}</button></div></div>`).join('')}</section>` : ''}
      ${f.incoming.length ? `<section class="card" style="margin-bottom:16px"><h3>${t('Friend requests')}</h3>${f.incoming.map((u) => row(u, `<button class="btn primary sm" data-ok="${esc(u.username)}" type="button">${t('Accept')}</button><button class="btn sm" data-no="${esc(u.username)}" type="button">${t('Decline')}</button>`)).join('')}</section>` : ''}
      <section class="card"><h3>${t('Friends')} (${f.friends.length})</h3>
        ${f.friends.length ? f.friends.map((u) => row(u, `<button class="btn primary sm" data-ch="${esc(u.username)}" type="button">${icon('swords', 16)} ${t('Challenge')}</button><button class="btn ghost sm" data-rm="${esc(u.username)}" type="button" aria-label="${t('Remove')}">${icon('x', 16)}</button>`)).join('') : `<p class="muted">${t('No friends yet. Add someone by username, or open a player profile and press "Add friend".')}</p>`}
        ${f.outgoing.length ? `<h4 style="margin-top:16px">${t('Sent requests')}</h4>${f.outgoing.map((u) => row(u, `<span class="chip">${t('Pending')}</span>`)).join('')}` : ''}
      </section>`;
    const $$ = (s, fn) => root.querySelectorAll(s).forEach(fn);
    root.querySelector('#add-form').onsubmit = async (e) => { e.preventDefault(); const n = root.querySelector('#add-name').value.trim(); if (!n) return; try { const r = await post('/api/friends/request', { username: n }); toast(r.status === 'accepted' ? t('You are now friends!') : t('Friend request sent'), 'good'); draw(); } catch (ex) { toast(t(ex.message), 'bad'); } };
    const act = (sel, attr, fn) => $$(sel, (b) => { b.onclick = async () => { try { await fn(b.dataset[attr]); draw(); } catch (ex) { toast(t(ex.message), 'bad'); } }; });
    act('[data-ok]', 'ok', (u) => post('/api/friends/accept', { username: u })); act('[data-no]', 'no', (u) => post('/api/friends/decline', { username: u }));
    act('[data-rm]', 'rm', (u) => del('/api/friends/' + encodeURIComponent(u)));
    $$('[data-acc]', (b) => { b.onclick = async () => { try { const r = await post('/api/challenges/' + b.dataset.acc + '/accept', {}); navigate('/game/' + r.id); } catch (ex) { toast(t(ex.message), 'bad'); draw(); } }; });
    act('[data-dec]', 'dec', (id) => post('/api/challenges/' + id + '/decline', {}));
    $$('[data-ch]', (b) => { b.onclick = () => challenge(b.dataset.ch); });
  }
  function challenge(name) {
    const tcs = [[180, 0], [180, 2], [300, 0], [300, 3], [600, 0], [900, 10]]; let sel = tcs[2];
    const m = modal(`<h2>${t('Challenge {name}', { name: esc(name) })}</h2><div class="tc-grid" id="ctc">${tcs.map((x) => `<button type="button" class="tc-btn" data-b="${x[0]}" data-i="${x[1]}" aria-pressed="${x === sel}"><b>${x[0] / 60}+${x[1]}</b></button>`).join('')}</div><div class="actions"><button class="btn primary" id="go" type="button">${t('Send challenge')}</button><button class="btn ghost" data-x type="button">${t('Cancel')}</button></div>`);
    m.el.querySelectorAll('.tc-btn').forEach((b) => { b.onclick = () => { sel = tcs.find((x) => x[0] === +b.dataset.b && x[1] === +b.dataset.i); m.el.querySelectorAll('.tc-btn').forEach((o) => o.setAttribute('aria-pressed', o === b)); }; });
    m.el.querySelector('[data-x]').onclick = () => m.close();
    m.el.querySelector('#go').onclick = async () => { try { const r = await post('/api/challenges', { username: name, base: sel[0], inc: sel[1] }); m.close(); toast(t('Challenge sent — waiting for {name}', { name }), 'good'); navigate('/game/' + r.id); } catch (ex) { toast(t(ex.message), 'bad'); } };
  }
  root.innerHTML = loader(); await draw();
  const off1 = onAuth(() => draw()), off2 = onNotify(() => draw());
  const poll = setInterval(() => { if (!document.hidden && net.user) draw(); }, 30000);
  return () => { disposed = true; off1(); off2(); clearInterval(poll); };
}
