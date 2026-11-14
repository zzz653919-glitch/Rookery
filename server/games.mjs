// Online chess: the server is the single authority for legality, clocks, results and ratings.
// Clocks are timestamps, not timers: a flag fall is detected the next time anyone looks at the game (and by the sweeper
// on long-running servers), so the same logic works behind WebSockets and behind plain HTTP polling on serverless hosts.
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { Chess, START_FEN } from '../js/chess/rules.js';
import { getDb, tx, now as isoNow } from './db.mjs';
import { HttpError, bad } from './http.mjs';
import { categoryOf, eloUpdate } from './rating.mjs';
import { publicUser } from './accounts.mjs';

export const events = new EventEmitter();   // 'game' (id) after every change, 'finished' (row) when a game ends
events.setMaxListeners(0);

// Offered time controls [seconds, increment seconds]
export const TIME_CONTROLS = [[60, 0], [60, 1], [120, 1], [180, 0], [180, 2], [300, 0], [300, 3], [600, 0], [600, 5], [900, 10], [1800, 0]];
const WAIT_ROOM_MS = 30 * 60000, FIRST_MOVE_MS = 90000, QUEUE_STALE_MS = 25000;
const ms = () => Date.now();
const newId = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toLowerCase();

export function checkTimeControl(base, inc) {
  const b = Math.round(+base), i = Math.round(+inc);
  if (!TIME_CONTROLS.some(([x, y]) => x === b && y === i)) throw bad('Choose one of the offered time controls.');
  return { base_ms: b * 1000, inc_ms: i * 1000 };
}

// ------------------------------------------------------------------------------------------------ helpers
const parse = (r) => (r ? { ...r, moves: JSON.parse(r.moves) } : null);
async function load(id, db = getDb()) { return parse(await db.prepare('SELECT * FROM games WHERE id = ?').get(id)); }
function replay(moves, fen = START_FEN) {
  const g = new Chess(fen);
  for (const m of moves) if (!g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })) throw new Error('corrupt game ' + m);
  return g;
}
const colorOf = (row, userId) => (row.white_id === userId ? 'w' : row.black_id === userId ? 'b' : null);

// Can this side still deliver checkmate? (used when the other side runs out of time)
function canMate(g, color) {
  let minors = 0;
  for (const row of g.board()) for (const p of row) {
    if (!p || p.color !== color) continue;
    if ('pqr'.includes(p.type)) return true;
    if ('nb'.includes(p.type)) minors++;
  }
  return minors >= 2;
}

// Remaining clock time of a side at this moment.
function clocks(row) {
  let w = row.wtime, b = row.btime;
  if (row.status === 'active' && row.moves.length >= 2 && row.turn_since) {
    const used = Math.max(0, ms() - row.turn_since);
    if (row.moves.length % 2 === 0) w = Math.max(0, w - used); else b = Math.max(0, b - used);
  }
  return { w, b };
}

// ------------------------------------------------------------------------------------------------ results
async function applyRatings(db, row, result) {
  if (row.kind !== 'rated' || !row.white_id || !row.black_id || result === '*') return {};
  const get = async (uid) => (await db.prepare('SELECT * FROM ratings WHERE user_id = ? AND category = ?').get(uid, row.category)) || { rating: 1200, games: 0, wins: 0, losses: 0, draws: 0, peak: 1200 };
  const w = await get(row.white_id), b = await get(row.black_id);
  const score = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
  const next = eloUpdate(w, b, score);
  const save = async (uid, cur, rating, s) => {
    await db.prepare(`INSERT INTO ratings(user_id, category, rating, games, wins, losses, draws, peak, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id, category) DO UPDATE SET rating = excluded.rating, games = excluded.games, wins = excluded.wins, losses = excluded.losses, draws = excluded.draws, peak = excluded.peak, updated_at = excluded.updated_at`)
      .run(uid, row.category, rating, cur.games + 1, cur.wins + (s === 1 ? 1 : 0), cur.losses + (s === 0 ? 1 : 0), cur.draws + (s === 0.5 ? 1 : 0), Math.max(cur.peak, rating), isoNow());
  };
  await save(row.white_id, w, next.a, score); await save(row.black_id, b, next.b, 1 - score);
  return { w_delta: Math.round(next.a) - Math.round(w.rating), b_delta: Math.round(next.b) - Math.round(b.rating) };
}

async function finish(db, row, result, reason, status = 'finished') {
  const deltas = status === 'finished' ? await applyRatings(db, row, result) : {};
  await db.prepare('UPDATE games SET status = ?, result = ?, reason = ?, ended_at = ?, draw_offer = NULL, version = version + 1, w_delta = ?, b_delta = ?, wtime = ?, btime = ?, turn_since = NULL WHERE id = ?')
    .run(status, result, reason, isoNow(), deltas.w_delta ?? null, deltas.b_delta ?? null, clocks(row).w, clocks(row).b, row.id);
  row.status = status; row.result = result; row.reason = reason;
  return row;
}

// Lazy clock / abandonment handling. Returns the (possibly updated) game.
async function settle(id) {
  let row = await load(id);
  if (!row) return null;
  const t = ms();
  let action = null;
  if (row.status === 'waiting' && t - Date.parse(row.created_at) > WAIT_ROOM_MS) action = 'expire';
  else if (row.status === 'active' && row.moves.length < 2 && t - (row.turn_since || Date.parse(row.started_at)) > FIRST_MOVE_MS) action = 'abandon';
  else if (row.status === 'active' && row.moves.length >= 2 && clocks(row)[row.moves.length % 2 === 0 ? 'w' : 'b'] <= 0) action = 'flag';
  if (!action) return row;
  return tx(async (db) => {
    row = await load(id, db);
    if (!row || !['waiting', 'active'].includes(row.status)) return row;
    if (action === 'expire') await finish(db, row, '*', 'expired', 'aborted');
    else if (action === 'abandon') await finish(db, row, '*', 'aborted: no first move', 'aborted');
    else if (row.moves.length >= 2 && clocks(row)[row.moves.length % 2 === 0 ? 'w' : 'b'] <= 0) {
      const loser = row.moves.length % 2 === 0 ? 'w' : 'b';
      const g = replay(row.moves);
      const winner = loser === 'w' ? 'b' : 'w';
      const draw = !canMate(g, winner);
      await finish(db, row, draw ? '1/2-1/2' : winner === 'w' ? '1-0' : '0-1', draw ? 'timeout vs insufficient material' : 'time');
    } else return row;
    queueEvent(id, row.status === 'finished' ? row : null);
    return load(id, db);
  });
}
// events are emitted after the transaction (listeners read the committed state)
function queueEvent(id, finishedRow) { setImmediate(() => { events.emit('game', id); if (finishedRow) events.emit('finished', finishedRow); }); }

// ------------------------------------------------------------------------------------------------ views
async function playerInfo(db, userId, category) {
  if (!userId) return null;
  const u = await db.prepare('SELECT id, username, avatar, country, created_at, last_seen_at, banned, bio FROM users WHERE id = ?').get(userId);
  if (!u) return { id: userId, username: 'deleted' };
  const r = await db.prepare('SELECT rating, games FROM ratings WHERE user_id = ? AND category = ?').get(userId, category);
  return { ...publicUser(u), rating: Math.round(r?.rating ?? 1200), provisional: (r?.games ?? 0) < 30 };
}

export async function viewOf(row) {
  const db = getDb();
  const g = replay(row.moves);
  const c = clocks(row);
  const sans = g.history();
  const players = { w: await playerInfo(db, row.white_id, row.category), b: await playerInfo(db, row.black_id, row.category) };
  return {
    id: row.id, kind: row.kind, category: row.category, base: row.base_ms / 1000, inc: row.inc_ms / 1000,
    status: row.status, result: row.result, reason: row.reason, version: row.version,
    fen: g.fen(), turn: g.turn(), moves: row.moves, sans, startFen: START_FEN,
    check: g.checkSquare(), clock: { w: c.w, b: c.b, running: row.status === 'active' && row.moves.length >= 2 }, serverTime: ms(),
    players,
    drawOffer: row.draw_offer, rematchId: row.rematch_id,
    ratingChange: row.w_delta == null ? null : { w: row.w_delta, b: row.b_delta },
    createdAt: row.created_at, endedAt: row.ended_at, tournamentId: row.tournament_id,
    pgn: row.status === 'finished' || row.status === 'aborted' ? pgnOf(row, g, { w: players.w?.username, b: players.b?.username }) : null,
  };
}
function pgnOf(row, g, names = {}) {
  return g.pgn({ Event: row.kind === 'rated' ? 'Rated game' : 'Casual game', Site: 'Rookery', Date: (row.created_at || '').slice(0, 10).replace(/-/g, '.'), White: names.w || 'White', Black: names.b || 'Black', Result: row.result && row.result !== '*' ? row.result : '*', TimeControl: `${row.base_ms / 1000}+${row.inc_ms / 1000}` });
}
export async function getView(id) {
  const row = await settle(id);
  return row ? viewOf(row) : null;
}
export const getViewWithNames = getView;

// ------------------------------------------------------------------------------------------------ creating games
async function createGame(db, { white, black, creator, kind, tc, tournamentId = null, status = 'active' }) {
  const id = newId();
  const category = categoryOf(tc.base_ms, tc.inc_ms);
  const wr = white ? (await db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND category = ?').get(white, category))?.rating ?? 1200 : null;
  const br = black ? (await db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND category = ?').get(black, category))?.rating ?? 1200 : null;
  await db.prepare(`INSERT INTO games(id, white_id, black_id, creator_id, kind, category, base_ms, inc_ms, status, fen, wtime, btime, turn_since, version, w_rating, b_rating, tournament_id, created_at, started_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, white, black, creator, kind, category, tc.base_ms, tc.inc_ms, status, START_FEN, tc.base_ms, tc.base_ms, status === 'active' ? ms() : null, 0,
    wr == null ? null : Math.round(wr), br == null ? null : Math.round(br), tournamentId, isoNow(), status === 'active' ? isoNow() : null);
  return id;
}

export async function createRoom(user, { base, inc, color = 'random' }) {
  const tc = checkTimeControl(base, inc);
  const mine = color === 'w' || color === 'b' ? color : Math.random() < 0.5 ? 'w' : 'b';
  const open = await getDb().prepare("SELECT count(*) n FROM games WHERE creator_id = ? AND status = 'waiting'").get(user.id);
  if (open.n >= 5) throw new HttpError(429, 'You already have several open rooms. Wait for a friend to join or let them expire.');
  const id = await tx((db) => createGame(db, { white: mine === 'w' ? user.id : null, black: mine === 'b' ? user.id : null, creator: user.id, kind: 'casual', tc, status: 'waiting' }));
  return id;
}

export async function joinRoom(user, id) {
  const row = await settle(id);
  if (!row) throw new HttpError(404, 'Game not found.');
  if (colorOf(row, user.id)) return viewOf(row);   // already in it
  if (row.status !== 'waiting' || (row.white_id && row.black_id)) throw new HttpError(409, 'This game has already started or is no longer open.');
  await tx(async (db) => {
    const cur = await load(id, db);
    if (cur.status !== 'waiting') throw new HttpError(409, 'This game has already started.');
    const slot = cur.white_id ? 'black_id' : 'white_id';
    const cat = cur.category;
    const rate = async (uid) => Math.round((await db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND category = ?').get(uid, cat))?.rating ?? 1200);
    await db.prepare(`UPDATE games SET ${slot} = ?, ${slot === 'white_id' ? 'w_rating' : 'b_rating'} = ?, status = 'active', started_at = ?, turn_since = ?, version = version + 1 WHERE id = ?`).run(user.id, await rate(user.id), isoNow(), ms(), id);
  });
  queueEvent(id);
  return getView(id);
}

// ------------------------------------------------------------------------------------------------ playing
async function mutate(user, id, fn) {
  const before = await load(id);
  const settled = await settle(id);
  if (before?.status === 'active' && settled && settled.status !== 'active') return undefined;   // the flag fell just now: the caller gets the finished game
  const out = await tx(async (db) => {
    const row = await load(id, db);
    if (!row) throw new HttpError(404, 'Game not found.');
    const color = colorOf(row, user.id);
    if (!color) throw new HttpError(403, 'You are not playing in this game.');
    if (row.status !== 'active') throw new HttpError(409, 'This game is over.');
    const res = await fn(db, row, color);
    return { finished: row.status === 'finished' ? { ...row } : null, res };
  });
  queueEvent(id, out.finished);
  return out.res;
}

export async function playMove(user, id, uci) {
  if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw bad('Send the move like e2e4 (promotion: e7e8q).');
  await mutate(user, id, async (db, row, color) => {
    const turn = row.moves.length % 2 === 0 ? 'w' : 'b';
    if (turn !== color) throw new HttpError(409, 'It is not your turn.');
    const g = replay(row.moves);
    let left = turn === 'w' ? row.wtime : row.btime;
    if (row.moves.length >= 2) {
      left -= Math.max(0, ms() - row.turn_since);
      if (left <= 0) { // the flag fell before this move arrived
        const winner = turn === 'w' ? 'b' : 'w';
        const draw = !canMate(g, winner);
        await finish(db, row, draw ? '1/2-1/2' : winner === 'w' ? '1-0' : '0-1', draw ? 'timeout vs insufficient material' : 'time');
        return;
      }
      left += row.inc_ms;
    }
    const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!mv) throw bad('That move is not legal in this position.');
    row.moves.push(uci);
    const st = g.status();
    const w = turn === 'w' ? left : row.wtime, b = turn === 'b' ? left : row.btime;
    await db.prepare('UPDATE games SET moves = ?, fen = ?, wtime = ?, btime = ?, turn_since = ?, version = version + 1, draw_offer = NULL WHERE id = ?').run(JSON.stringify(row.moves), g.fen(), w, b, ms(), id);
    row.wtime = w; row.btime = b; row.turn_since = ms();
    if (st.over) await finish(db, row, st.result, st.reason);
  });
  return getView(id);
}

export async function resign(user, id) {
  await mutate(user, id, async (db, row, color) => {
    if (row.moves.length < 2) await finish(db, row, '*', 'aborted', 'aborted');
    else await finish(db, row, color === 'w' ? '0-1' : '1-0', 'resignation');
  });
  return getView(id);
}
export async function abort(user, id) {
  await mutate(user, id, async (db, row) => {
    if (row.moves.length >= 2) throw new HttpError(409, 'Too late to abort: resign instead.');
    await finish(db, row, '*', 'aborted', 'aborted');
  });
  return getView(id);
}
export async function drawAction(user, id, action) {
  await mutate(user, id, async (db, row, color) => {
    if (row.moves.length < 2) throw new HttpError(409, 'Play a few moves before offering a draw.');
    const opp = color === 'w' ? 'b' : 'w';
    if (action === 'offer') {
      if (row.draw_offer === color) return;
      if (row.draw_offer === opp) { await finish(db, row, '1/2-1/2', 'agreement'); return; }
      await db.prepare('UPDATE games SET draw_offer = ?, version = version + 1 WHERE id = ?').run(color, row.id);
    } else if (action === 'accept') {
      if (row.draw_offer !== opp) throw new HttpError(409, 'There is no draw offer to accept.');
      await finish(db, row, '1/2-1/2', 'agreement');
    } else if (action === 'decline') {
      if (row.draw_offer !== opp) return;
      await db.prepare('UPDATE games SET draw_offer = NULL, version = version + 1 WHERE id = ?').run(row.id);
    } else throw bad('Unknown draw action.');
  });
  return getView(id);
}

export async function rematch(user, id) {
  const row = await load(id);
  if (!row) throw new HttpError(404, 'Game not found.');
  const color = colorOf(row, user.id);
  if (!color) throw new HttpError(403, 'You did not play this game.');
  if (row.status !== 'finished') throw new HttpError(409, 'The game is not over yet.');
  const newGame = await tx(async (db) => {
    const cur = await load(id, db);
    if (cur.rematch_id) {
      const g2 = await load(cur.rematch_id, db);
      if (g2 && g2.status === 'waiting' && g2.creator_id !== user.id) { return { join: g2.id }; }
      return { id: cur.rematch_id };
    }
    const tc = { base_ms: cur.base_ms, inc_ms: cur.inc_ms };
    const mine = color === 'w' ? 'b' : 'w';          // colours swap; the first to ask opens the room, the other one joins it
    const gid = await createGame(db, { white: mine === 'w' ? user.id : null, black: mine === 'b' ? user.id : null, creator: user.id, kind: cur.kind, tc, status: 'waiting' });
    await db.prepare('UPDATE games SET rematch_id = ?, version = version + 1 WHERE id = ?').run(gid, id);
    return { id: gid };
  });
  if (newGame.join) { await joinRoom(user, newGame.join); queueEvent(id); return newGame.join; }
  queueEvent(id);
  return newGame.id;
}

// ------------------------------------------------------------------------------------------------ matchmaking
const waitWindow = (waitMs) => 150 + Math.floor(waitMs / 1000) * 15;

async function tryPair(db, me) {
  const t = ms();
  await db.prepare('DELETE FROM matchmaking WHERE seen_at < ? AND game_id IS NULL').run(t - QUEUE_STALE_MS);
  const cands = await db.prepare('SELECT * FROM matchmaking WHERE game_id IS NULL AND user_id != ? AND category = ? AND base_ms = ? AND inc_ms = ? AND rated = ? AND tournament_id IS ? ORDER BY created_at LIMIT 25')
    .all(me.user_id, me.category, me.base_ms, me.inc_ms, me.rated, me.tournament_id ?? null);
  for (const c of cands) {
    const window = Math.max(waitWindow(t - me.created_at), waitWindow(t - c.created_at));
    if (Math.abs(c.rating - me.rating) > window) continue;
    const meWhite = Math.random() < 0.5;
    const id = await createGame(db, { white: meWhite ? me.user_id : c.user_id, black: meWhite ? c.user_id : me.user_id, creator: me.user_id, kind: me.rated ? 'rated' : 'casual', tc: { base_ms: me.base_ms, inc_ms: me.inc_ms }, tournamentId: me.tournament_id ?? null });
    await db.prepare('UPDATE matchmaking SET game_id = ? WHERE user_id IN (?, ?)').run(id, me.user_id, c.user_id);
    return id;
  }
  return null;
}

export async function joinQueue(user, { base, inc, rated = true, tournamentId = null }) {
  const tc = checkTimeControl(base, inc);
  const category = categoryOf(tc.base_ms, tc.inc_ms);
  const gameId = await tx(async (db) => {
    const active = await db.prepare("SELECT count(*) n FROM games WHERE status = 'active' AND (white_id = ? OR black_id = ?)").get(user.id, user.id);
    if (active.n >= 4) throw new HttpError(429, 'Finish your running games before starting new ones.');
    await db.prepare('DELETE FROM matchmaking WHERE user_id = ?').run(user.id);
    const rating = (await db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND category = ?').get(user.id, category))?.rating ?? 1200;
    const me = { user_id: user.id, category, ...tc, rated: rated ? 1 : 0, rating, tournament_id: tournamentId, created_at: ms(), seen_at: ms(), game_id: null };
    await db.prepare('INSERT INTO matchmaking(user_id, category, base_ms, inc_ms, rated, rating, tournament_id, created_at, seen_at) VALUES (?,?,?,?,?,?,?,?,?)').run(me.user_id, me.category, me.base_ms, me.inc_ms, me.rated, me.rating, me.tournament_id, me.created_at, me.seen_at);
    return tryPair(db, me);
  });
  if (gameId) { await tx((db) => db.prepare('DELETE FROM matchmaking WHERE user_id = ?').run(user.id)); events.emit('queue', gameId); return { status: 'matched', gameId }; }
  return { status: 'waiting', since: ms() };
}
export async function pollQueue(user) {
  return tx(async (db) => {
    const me = await db.prepare('SELECT * FROM matchmaking WHERE user_id = ?').get(user.id);
    if (!me) return { status: 'idle', searching: 0 };
    if (me.game_id) { await db.prepare('DELETE FROM matchmaking WHERE user_id = ?').run(user.id); return { status: 'matched', gameId: me.game_id }; }
    await db.prepare('UPDATE matchmaking SET seen_at = ? WHERE user_id = ?').run(ms(), user.id);
    const gid = await tryPair(db, { ...me, seen_at: ms() });
    if (gid) { await db.prepare('DELETE FROM matchmaking WHERE user_id = ?').run(user.id); setImmediate(() => events.emit('queue', gid)); return { status: 'matched', gameId: gid }; }
    const waiting = await db.prepare('SELECT count(*) n FROM matchmaking WHERE game_id IS NULL AND seen_at > ?').get(ms() - QUEUE_STALE_MS);
    return { status: 'waiting', seconds: Math.round((ms() - me.created_at) / 1000), searching: waiting.n };
  });
}
export const leaveQueue = (user) => getDb().prepare('DELETE FROM matchmaking WHERE user_id = ?').run(user.id);

// ------------------------------------------------------------------------------------------------ lists
export async function liveGames(limit = 20) {
  const rows = await getDb().prepare("SELECT * FROM games WHERE status = 'active' AND white_id IS NOT NULL AND black_id IS NOT NULL ORDER BY (coalesce(w_rating,1200) + coalesce(b_rating,1200)) DESC LIMIT ?").all(limit);
  const out = [];
  for (const r of rows) { const row = await settle(r.id); if (row?.status === 'active') out.push(await viewOf(row)); }
  return out;
}
export async function recentGames(limit = 12) {
  const rows = await getDb().prepare("SELECT * FROM games WHERE status = 'finished' AND white_id IS NOT NULL AND black_id IS NOT NULL AND result IS NOT NULL ORDER BY ended_at DESC LIMIT ?").all(limit);
  const out = []; for (const r of rows) out.push(await viewOf(parse(r) ?? r)); return out;
}
export async function gamesOfUser(userId, { limit = 20, offset = 0 } = {}) {
  const rows = await getDb().prepare("SELECT * FROM games WHERE (white_id = ? OR black_id = ?) AND status IN ('finished','active') ORDER BY created_at DESC LIMIT ? OFFSET ?").all(userId, userId, limit, offset);
  const out = [];
  for (const r of rows) { const v = await viewOf(parse(r)); delete v.pgn; v.sans = v.sans.length; out.push(v); }
  return out;
}

// Sweeper: finishes games whose flag fell (or that nobody joined / started) although nobody is looking.
// Only candidates are loaded: a cheap query first, the full check (settle) only for those.
export async function sweepClocks() {
  const t = ms();
  const rows = await getDb().prepare(`SELECT id FROM games WHERE
      (status = 'active' AND json_array_length(moves) >= 2 AND turn_since + CASE WHEN json_array_length(moves) % 2 = 0 THEN wtime ELSE btime END < ?)
   OR (status = 'active' AND json_array_length(moves) < 2 AND turn_since < ?)
   OR (status = 'waiting' AND created_at < ?)`).all(t, t - FIRST_MOVE_MS, new Date(t - WAIT_ROOM_MS).toISOString());
  for (const r of rows) await settle(r.id);
}
export { colorOf, load as loadGame, settle };
