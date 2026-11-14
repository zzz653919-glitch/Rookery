// Friends, challenges, chat, tournaments, news, reports and the moderation tools of the admin panel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, newDataDir, removeDir, client, cli } from './lib/server.mjs';

let dir, srv, admin;
const ADMIN_PW = 'Correct-Horse-9!';
before(async () => {
  dir = newDataDir();
  assert.equal(cli(dir, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: ADMIN_PW }).status, 0);
  assert.equal(cli(dir, ['create-admin', '--username', 'vera', '--role', 'viewer'], { password: 'Viewer-Passw0rd#1' }).status, 0);
  srv = await startServer(dir);
  admin = client(srv.base); assert.equal((await admin.login('boss', ADMIN_PW)).status, 200);
});
after(async () => { if (process.env.DEBUG_SRV) console.log(srv.log()); await srv?.stop(); removeDir(dir); });

async function player(name) {
  const c = client(srv.base);
  const r = await c.post('/api/register', { username: name, password: 'Rook-7788-x' }); assert.equal(r.status, 201, r.text);
  c.cookie = r.setCookie.split(';')[0]; c.csrf = r.json.csrf; c.me = r.json.user; return c;
}
const mv = (c, id, m) => c.post(`/api/games/${id}/move`, { move: m });

test('friends: request, accept, list with presence, remove; challenges only between friends; challenge → game', async () => {
  const [a, b, c] = [await player('Alma'), await player('Bek'), await player('Cora')];
  assert.equal((await a.post('/api/friends/request', { username: 'nobody' })).status, 404);
  assert.equal((await a.post('/api/friends/request', { username: 'Alma' })).status, 400, 'not yourself');
  assert.equal((await a.post('/api/challenges', { username: 'Bek', base: 300, inc: 0 })).status, 403, 'not friends yet');
  assert.equal((await a.post('/api/friends/request', { username: 'Bek' })).json.status, 'pending');
  assert.equal((await a.post('/api/friends/request', { username: 'Bek' })).status, 409);
  assert.equal((await b.get('/api/me/notifications')).json.friendRequests, 1);
  const inc = (await b.get('/api/friends')).json; assert.equal(inc.incoming[0].username, 'Alma');
  assert.equal((await c.post('/api/friends/accept', { username: 'Alma' })).status, 404, 'only the addressee can accept');
  assert.equal((await b.post('/api/friends/accept', { username: 'Alma' })).status, 200);
  const list = (await a.get('/api/friends')).json; assert.equal(list.friends[0].username, 'Bek'); assert.equal(list.friends[0].online, true);
  const ch = await a.post('/api/challenges', { username: 'Bek', base: 300, inc: 3 }); assert.equal(ch.status, 201);
  assert.equal((await b.get('/api/challenges')).json.challenges[0].from, 'Alma');
  assert.equal((await c.post(`/api/challenges/${ch.json.id}/accept`, {})).status, 404, 'a challenge is only for its addressee');
  const acc = await b.post(`/api/challenges/${ch.json.id}/accept`, {}); assert.equal(acc.status, 200);
  const g = (await a.get('/api/games/' + acc.json.id)).json; assert.equal(g.status, 'active'); assert.equal(g.kind, 'casual');
  // in-game chat: players only
  assert.equal((await c.get(`/api/games/${g.id}/chat`)).status, 403);
  assert.equal((await a.post(`/api/games/${g.id}/chat`, { text: 'good luck <b>!</b>' })).status, 200);
  const msgs = (await b.get(`/api/games/${g.id}/chat`)).json.messages; assert.equal(msgs.length, 1); assert.ok(!msgs[0].text.includes('<'));
  assert.equal((await a.del('/api/friends/Bek')).status, 200); assert.equal((await a.get('/api/friends')).json.friends.length, 0);
});

test('tournaments: admin schedules, players join and play inside the pool, standings follow the results', async () => {
  const [a, b, c] = [await player('Dino'), await player('Elif'), await player('Fara')];
  const start = new Date(Date.now() - 60000).toISOString();
  const bad1 = await admin.post('/api/admin/tournaments', { name: 'x', base: 123, inc: 0, startsAt: 'nope', durationMin: 1 }); assert.equal(bad1.status, 400);
  const made = await admin.post('/api/admin/tournaments', { name: 'Friday Arena', description: 'Fast fun', base: 180, inc: 0, startsAt: start, durationMin: 60 });
  assert.equal(made.status, 201, made.text); const tid = made.json.id;
  const list = (await a.get('/api/tournaments')).json.tournaments; assert.equal(list[0].state, 'running');
  assert.equal((await a.post(`/api/tournaments/${tid}/play`, {})).status, 403, 'join first');
  for (const p of [a, b, c]) assert.equal((await p.post(`/api/tournaments/${tid}/join`, {})).status, 200);
  assert.equal((await a.get(`/api/tournaments/${tid}`)).json.joined, true);
  const r1 = await a.post(`/api/tournaments/${tid}/play`, {}); assert.equal(r1.json.status, 'waiting');
  const r2 = await b.post(`/api/tournaments/${tid}/play`, {}); assert.equal(r2.json.status, 'matched');
  const g = (await a.get('/api/games/' + r2.json.gameId)).json; assert.equal(g.tournamentId, tid); assert.equal(g.kind, 'rated');
  const white = g.you === 'w' ? a : b, black = g.you === 'w' ? b : a;
  for (const [who, m] of [[white, 'f2f3'], [black, 'e7e5'], [white, 'g2g4'], [black, 'd8h4']]) assert.equal((await mv(who, g.id, m)).status, 200);
  await new Promise((r) => setTimeout(r, 400));
  const st = (await a.get(`/api/tournaments/${tid}`)).json.standings;
  assert.equal(st[0].username, black.me.username); assert.equal(st[0].score, 2); assert.equal(st[0].wins, 1);
  assert.equal(st.find((x) => x.username === white.me.username).losses, 1);
  assert.equal((await admin.put(`/api/admin/tournaments/${tid}`, { status: 'cancelled' })).status, 200);
  assert.ok((await a.get('/api/tournaments')).json.tournaments.every((x) => x.id !== tid), 'cancelled tournaments disappear');
  const future = await admin.post('/api/admin/tournaments', { name: 'Next week', base: 600, inc: 5, startsAt: new Date(Date.now() + 86400000).toISOString(), durationMin: 90 });
  assert.equal((await c.post(`/api/tournaments/${future.json.id}/join`, {})).status, 200);
  assert.equal((await c.post(`/api/tournaments/${future.json.id}/play`, {})).status, 409, 'not started');
});

test('news: administrators write and publish (HTML sanitised), everyone reads only published articles', async () => {
  const anon = client(srv.base);
  assert.equal((await admin.post('/api/admin/news', { title: 'Hi' })).status, 400);
  const draft = await admin.post('/api/admin/news', { title: 'Opening week', summary: 'Welcome', body: '<p>Hello <b>world</b></p><script>alert(1)</script>', status: 'draft' });
  assert.equal(draft.status, 201); assert.ok(!draft.json.body.includes('<script'));
  assert.ok((await anon.get('/api/news')).json.items.every((x) => x.id !== draft.json.id), 'drafts stay hidden'); assert.equal((await anon.get(`/api/news/${draft.json.id}`)).status, 404);
  assert.equal((await admin.put(`/api/admin/news/${draft.json.id}`, { status: 'published' })).status, 200);
  assert.ok((await anon.get('/api/news')).json.items.some((x) => x.title === 'Opening week'), 'published articles appear next to the built-in ones');
  assert.match((await anon.get(`/api/news/${draft.json.id}`)).json.body, /<b>world<\/b>/);
  assert.equal((await admin.del(`/api/admin/news/${draft.json.id}`)).status, 400, 'delete needs confirmation');
  assert.equal((await admin.del(`/api/admin/news/${draft.json.id}?confirm=${draft.json.id}`)).status, 200);
});

test('reports and moderation: report → admin bans → login, sessions and running games are affected; viewers cannot moderate', async () => {
  const [a, b] = [await player('Gala'), await player('Hasan')];
  assert.equal((await a.post('/api/reports', { username: 'Hasan', reason: 'nonsense' })).status, 400);
  assert.equal((await a.post('/api/reports', { username: 'Hasan', reason: 'abuse', detail: 'insults <in chat>' })).status, 201);
  assert.equal((await a.post('/api/reports', { username: 'Hasan', reason: 'spam' })).status, 409, 'one open report per target');
  const reports = (await admin.get('/api/admin/reports?status=open')).json; const rep = reports.items.find((r) => r.target === 'Hasan'); assert.ok(rep); assert.ok(!rep.detail.includes('<'));
  const viewer = client(srv.base); assert.equal((await viewer.login('vera', 'Viewer-Passw0rd#1')).status, 200);
  assert.equal((await viewer.get('/api/admin/reports')).status, 200); assert.equal((await viewer.put(`/api/admin/reports/${rep.id}`, { status: 'resolved' })).status, 403);
  assert.equal((await b.post('/api/friends/request', { username: 'Gala' })).status, 200);
  // mute first
  assert.equal((await admin.put(`/api/admin/players/${rep.targetId}`, { muted: true })).status, 200);
  assert.equal((await b.post('/api/friends/request', { username: 'Gala' })).status, 403, 'muted players cannot send requests');
  const res = await admin.put(`/api/admin/reports/${rep.id}`, { status: 'resolved', action: 'ban', note: 'Abusive language' }); assert.equal(res.status, 200);
  assert.equal((await b.get('/api/me')).json.authenticated, false, 'banned players are signed out immediately');
  const again = await client(srv.base).post('/api/login', { username: 'Hasan', password: 'Rook-7788-x' }); assert.equal(again.status, 403); assert.match(again.json.error, /Abusive language/);
  assert.equal((await admin.put(`/api/admin/players/${rep.targetId}`, { banned: false })).status, 200);
  assert.equal((await client(srv.base).post('/api/login', { username: 'Hasan', password: 'Rook-7788-x' })).status, 200, 'unbanned');
  const list = (await admin.get('/api/admin/players?q=Hasan')).json; assert.equal(list.items[0].username, 'Hasan');
  const detail = (await admin.get(`/api/admin/players/${rep.targetId}`)).json; assert.equal(detail.reports.length, 1);
  assert.equal((await admin.post(`/api/admin/players/${rep.targetId}/password`, { password: 'weak' })).status, 400);
  assert.equal((await admin.post(`/api/admin/players/${rep.targetId}/password`, { password: 'Fresh-4455-pw' })).status, 200);
  assert.equal((await client(srv.base).post('/api/events', { anon: 'visitor12345', events: [{ type: 'visit', level: 'uz' }] })).status, 202);
  const stats = (await admin.get('/api/admin/platform-stats')).json; assert.ok(stats.players.total >= 2); assert.equal(stats.reports.open, 0);
  assert.ok(stats.visits.today >= 1 && stats.visits.visitors7 >= 1, 'site visits reach the admin overview');
});

test('built-in news in three languages, recurring arena schedule, recent finished games', async () => {
  const anon = client(srv.base);
  const en = (await anon.get('/api/news?lang=en')).json.items, uz = (await anon.get('/api/news?lang=uz')).json.items, ru = (await anon.get('/api/news?lang=ru')).json.items;
  assert.ok(en.length >= 5 && uz.length === en.length && ru.length === en.length, 'articles exist out of the box');
  assert.notEqual(uz[0].title, en[0].title); assert.notEqual(ru[0].title, en[0].title);
  const art = (await anon.get('/api/news/how-ratings-work?lang=ru')).json; assert.match(art.body, /<p>/); assert.match(art.title, /рейтинг/i);
  assert.equal((await anon.get('/api/news/nope')).status, 404);
  const first = (await anon.get('/api/tournaments')).json.tournaments;
  assert.ok(first.length >= 5 && first.every((x) => x.state !== 'finished'), 'the next days already have arenas');
  assert.ok(first.some((x) => x.name === 'Evergreen Blitz Arena' && x.base === 180 && x.inc === 2));
  const again = (await anon.get('/api/tournaments')).json.tournaments; assert.equal(again.length, first.length, 'the schedule is idempotent');
  const [a, b] = [await player('Kael'), await player('Solberg')];
  const room = (await a.post('/api/games/room', { base: 180, inc: 2, rated: true, color: 'w' })).json; assert.ok(room.id);
  assert.equal((await b.post(`/api/games/${room.id}/join`)).status, 200);
  for (const [c, m] of [[a, 'e2e4'], [b, 'e7e5']]) assert.equal((await mv(c, room.id, m)).status, 200);
  assert.equal((await b.post(`/api/games/${room.id}/resign`)).status, 200);
  const recent = (await anon.get('/api/games/recent')).json.games; assert.ok(recent.some((g) => g.id === room.id && g.result === '1-0'));
});
