// Online play end to end over HTTP and WebSocket: matchmaking, private rooms, legality, clocks, ratings, spectating.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { startServer, newDataDir, removeDir, client } from './lib/server.mjs';

const LIBSQL = process.env.ROOKERY_TEST_DB === 'libsql';
let dir, srv;
before(async () => { dir = newDataDir(); srv = await startServer(dir); });
after(async () => { await srv?.stop(); removeDir(dir); });
const dbWrite = (sql, ...a) => { const d = new DatabaseSync(join(dir, LIBSQL ? 'turso.db' : 'rookery.db')); d.exec('PRAGMA busy_timeout = 4000'); try { return d.prepare(sql).run(...a); } finally { d.close(); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function player(name) {
  const c = client(srv.base);
  const r = await c.post('/api/register', { username: name, password: 'Rook-7788-x' });
  assert.equal(r.status, 201, r.text);
  c.cookie = r.setCookie.split(';')[0]; c.csrf = r.json.csrf; c.me = r.json.user;
  return c;
}
const mv = (c, id, m) => c.post(`/api/games/${id}/move`, { move: m });
async function matched(a, b, base = 300, inc = 0, rated = true) {
  const r1 = await a.post('/api/games/queue', { base, inc, rated }); assert.equal(r1.json.status, 'waiting');
  const r2 = await b.post('/api/games/queue', { base, inc, rated }); assert.equal(r2.json.status, 'matched', r2.text);
  const p1 = await a.get('/api/games/queue'); assert.equal(p1.json.status, 'matched'); assert.equal(p1.json.gameId, r2.json.gameId);
  const g = (await a.get('/api/games/' + r2.json.gameId)).json;
  const white = g.you === 'w' ? a : b, black = g.you === 'w' ? b : a;
  return { id: g.id, white, black, g };
}

test('matchmaking pairs two players with the same time control; a third one keeps waiting; only offered controls are accepted', async () => {
  const [a, b, c] = [await player('Alice'), await player('Bob'), await player('Carl')];
  assert.equal((await a.post('/api/games/queue', { base: 123, inc: 4 })).status, 400);
  assert.equal((await a.post('/api/games/queue', { base: 300, inc: 0 })).json.status, 'waiting');
  assert.equal((await c.post('/api/games/queue', { base: 60, inc: 0 })).json.status, 'waiting', 'different control: no match');
  const r = await b.post('/api/games/queue', { base: 300, inc: 0 }); assert.equal(r.json.status, 'matched');
  assert.equal((await a.get('/api/games/queue')).json.status, 'matched');
  assert.equal((await c.get('/api/games/queue')).json.status, 'waiting');
  await c.del('/api/games/queue'); assert.equal((await c.get('/api/games/queue')).json.status, 'idle');
  const g = (await a.get('/api/games/' + r.json.gameId)).json;
  assert.equal(g.status, 'active'); assert.equal(g.kind, 'rated'); assert.equal(g.category, 'blitz');
  assert.ok(g.players.w && g.players.b && g.players.w.id !== g.players.b.id);
  assert.equal(g.fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('the server enforces turns, legality and ownership; checkmate ends the game and updates both ratings', async () => {
  const [a, b, spectator] = [await player('Dana'), await player('Egor'), client(srv.base)];
  const { id, white, black } = await matched(a, b);
  assert.equal((await mv(black, id, 'e7e5')).status, 409, 'not black\'s turn');
  assert.equal((await mv(white, id, 'e2e5')).status, 400, 'illegal move');
  assert.equal((await mv(white, id, 'zzzz')).status, 400);
  const outsider = await player('Frank'); assert.equal((await mv(outsider, id, 'e2e4')).status, 403);
  assert.equal((await spectator.post(`/api/games/${id}/move`, { move: 'e2e4' }, { noCookie: true })).status, 401);
  // fool's mate
  assert.equal((await mv(white, id, 'f2f3')).status, 200); assert.equal((await mv(black, id, 'e7e5')).status, 200);
  assert.equal((await mv(white, id, 'g2g4')).status, 200);
  const last = await mv(black, id, 'd8h4'); assert.equal(last.status, 200, last.text);
  assert.equal(last.json.status, 'finished'); assert.equal(last.json.result, '0-1'); assert.equal(last.json.reason, 'checkmate');
  assert.deepEqual(last.json.sans, ['f3', 'e5', 'g4', 'Qh4#']);
  assert.ok(last.json.ratingChange.b > 0 && last.json.ratingChange.w < 0, JSON.stringify(last.json.ratingChange));
  assert.match(last.json.pgn, /\[White "(Dana|Egor)"\]/); assert.match(last.json.pgn, /Qh4#/);
  assert.equal((await mv(white, id, 'e2e4')).status, 409, 'game over');
  const wp = (await spectator.get(`/api/users/${black.me.username}`)).json;
  assert.equal(wp.ratings.blitz.wins, 1); assert.ok(wp.ratings.blitz.rating > 1200);
  const lp = (await spectator.get(`/api/users/${white.me.username}`)).json; assert.ok(lp.ratings.blitz.rating < 1200);
  assert.equal(wp.games[0].id, id);
  const lb = (await spectator.get('/api/leaderboard?category=blitz')).json;
  assert.equal(lb.players.length, 0, 'players need 3 rated games to be listed'); // minimum games rule
});

test('castling, en passant and promotion work through the server', async () => {
  const [a, b] = [await player('Gina'), await player('Hugo')];
  const { id, white, black } = await matched(a, b, 600, 5);
  const seq = ['e2e4', 'a7a6', 'g1f3', 'b7b5', 'f1e2', 'b5b4', 'e1g1', 'a6a5', 'a2a4', 'b4a3', 'd2d3', 'a3b2', 'b1c3', 'b2a1q'];
  let who = white;
  for (const m of seq) { const r = await mv(who, id, m); assert.equal(r.status, 200, m + ' ' + r.text); who = who === white ? black : white; }
  const g = (await a.get('/api/games/' + id)).json;
  assert.ok(g.sans.includes('O-O') && g.sans.some((s) => /xa3/.test(s)) && g.sans.at(-1).includes('=Q'), g.sans.join(' '));
});

test('private room: share the link, the friend joins, spectators watch, resign, rematch with swapped colours', async () => {
  const [a, b, c] = [await player('Ivan'), await player('Jana'), client(srv.base)];
  const room = await a.post('/api/games/room', { base: 180, inc: 2, color: 'w' }); assert.equal(room.status, 201);
  const id = room.json.id;
  const waiting = (await c.get('/api/games/' + id)).json; assert.equal(waiting.status, 'waiting'); assert.equal(waiting.players.w.username, 'Ivan'); assert.equal(waiting.players.b, null);
  assert.equal((await c.post(`/api/games/${id}/join`, {}, { noCookie: true })).status, 401);
  const joined = await b.post(`/api/games/${id}/join`, {}); assert.equal(joined.json.status, 'active'); assert.equal(joined.json.you, 'b'); assert.equal(joined.json.kind, 'casual');
  assert.equal((await (await player('Kira')).post(`/api/games/${id}/join`, {})).status, 409, 'room is full');
  assert.equal((await a.post('/api/games/queue', { base: 180, inc: 2 })).status, 200);
  await a.del('/api/games/queue');
  assert.equal((await mv(a, id, 'e2e4')).status, 200);
  const live = (await c.get('/api/games/live')).json.games; assert.ok(live.some((x) => x.id === id), 'spectators can find running games');
  assert.equal((await mv(b, id, 'e7e5')).status, 200);
  assert.equal((await b.post(`/api/games/${id}/abort`, {})).status, 409, 'too late to abort');
  const res = await b.post(`/api/games/${id}/resign`, {}); assert.equal(res.json.result, '1-0'); assert.equal(res.json.reason, 'resignation');
  const r1 = await b.post(`/api/games/${id}/rematch`, {}); assert.equal(r1.status, 200);
  const r2 = await a.post(`/api/games/${id}/rematch`, {}); assert.equal(r2.json.id, r1.json.id, 'both end up in the same new game');
  const g2 = (await a.get('/api/games/' + r1.json.id)).json; assert.equal(g2.status, 'active'); assert.equal(g2.players.w.username, 'Jana', 'colours swapped');
});

test('draw offers, declines and agreement; abort before the first moves', async () => {
  const [a, b] = [await player('Lena'), await player('Mark')];
  const { id, white, black } = await matched(a, b, 300, 0, false);
  assert.equal((await white.post(`/api/games/${id}/draw`, { action: 'offer' })).status, 409, 'not before two moves');
  await mv(white, id, 'e2e4'); await mv(black, id, 'e7e5');
  assert.equal((await white.post(`/api/games/${id}/draw`, { action: 'offer' })).json.drawOffer, 'w');
  assert.equal((await black.post(`/api/games/${id}/draw`, { action: 'decline' })).json.drawOffer, null);
  await white.post(`/api/games/${id}/draw`, { action: 'offer' });
  const done = await black.post(`/api/games/${id}/draw`, { action: 'accept' });
  assert.equal(done.json.result, '1/2-1/2'); assert.equal(done.json.reason, 'agreement'); assert.equal(done.json.ratingChange, null, 'casual games do not change ratings');
  const x = await matched(await player('Nina'), await player('Oleg'));
  const ab = await x.white.post(`/api/games/${x.id}/abort`, {}); assert.equal(ab.json.status, 'aborted');
});

test('clocks are authoritative: a flag fall ends the game for the player who ran out of time', async () => {
  const [a, b] = [await player('Pavel'), await player('Rita')];
  const { id, white, black } = await matched(a, b, 60, 0);
  await mv(white, id, 'e2e4'); await mv(black, id, 'e7e5');
  const g = (await a.get('/api/games/' + id)).json; assert.equal(g.clock.running, true); assert.ok(g.clock.w <= 60000 && g.clock.w > 55000);
  dbWrite('UPDATE games SET turn_since = turn_since - 120000 WHERE id = ?', id);   // white has been thinking for two minutes
  const late = await mv(white, id, 'd2d4');
  assert.equal(late.json.status, 'finished', late.text); assert.equal(late.json.result, '0-1'); assert.equal(late.json.reason, 'time');
});

test('WebSocket: live pushes to subscribers, moves over the socket, origin check, spectators', async () => {
  const [a, b] = [await player('Sara'), await player('Timur')];
  const { id, white, black } = await matched(a, b);
  const url = srv.base.replace('http', 'ws') + '/ws';
  const open = (who, headers = {}) => new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { ...(who ? { cookie: who.cookie } : {}), ...headers } });
    ws.inbox = []; ws.onmessage = (e) => ws.inbox.push(JSON.parse(e.data));
    ws.onopen = () => resolve(ws); ws.onerror = (e) => reject(new Error('ws error'));
  });
  const next = async (ws, pred, ms = 3000) => { const t = Date.now(); for (;;) { const i = ws.inbox.findIndex(pred); if (i >= 0) return ws.inbox.splice(i, 1)[0]; if (Date.now() - t > ms) throw new Error('timeout waiting for message'); await sleep(20); } };
  const wsB = await open(black), wsSpec = await open(null);
  assert.equal((await next(wsB, (m) => m.t === 'hello')).user.username, black.me.username);
  assert.equal((await next(wsSpec, (m) => m.t === 'hello')).user, null);
  for (const ws of [wsB, wsSpec]) ws.send(JSON.stringify({ t: 'sub', game: id }));
  await next(wsB, (m) => m.t === 'game'); await next(wsSpec, (m) => m.t === 'game');
  assert.equal((await mv(white, id, 'e2e4')).status, 200);
  const pushed = await next(wsB, (m) => m.t === 'game' && m.game.moves.length === 1); assert.equal(pushed.game.fen.split(' ')[1], 'b');
  await next(wsSpec, (m) => m.t === 'game' && m.game.moves.length === 1);
  wsB.send(JSON.stringify({ t: 'move', game: id, move: 'e7e5', ref: 7 }));
  assert.equal((await next(wsB, (m) => m.t === 'ok')).ref, 7);
  const after = await next(wsSpec, (m) => m.t === 'game' && m.game.moves.length === 2); assert.deepEqual(after.game.sans, ['e4', 'e5']);
  wsSpec.send(JSON.stringify({ t: 'move', game: id, move: 'g1f3', ref: 8 }));
  assert.match((await next(wsSpec, (m) => m.t === 'error')).error, /Sign in/);
  wsB.send(JSON.stringify({ t: 'move', game: id, move: 'a7a5', ref: 9 }));
  assert.match((await next(wsB, (m) => m.t === 'error' && m.ref === 9)).error, /not your turn/i);
  // matchmaking notification over the socket
  const [c, d] = [await player('Ugo'), await player('Vera')];
  const wsC = await open(c); await next(wsC, (m) => m.t === 'hello');
  await c.post('/api/games/queue', { base: 600, inc: 0 }); const m2 = await d.post('/api/games/queue', { base: 600, inc: 0 });
  assert.equal((await next(wsC, (m) => m.t === 'matched')).gameId, m2.json.gameId);
  // cross-site WebSocket hijacking is refused
  await assert.rejects(open(black, { origin: 'https://evil.example' }));
  for (const ws of [wsB, wsSpec, wsC]) ws.close();
});
