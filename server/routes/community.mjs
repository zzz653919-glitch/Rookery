// Friends, challenges, game chat, news, tournaments and reports (player side).
import { getDb, tx, now } from '../db.mjs';
import { HttpError, bad } from '../http.mjs';
import { rateLimit } from '../security.mjs';
import { publicUser } from '../accounts.mjs';
import { categoryOf } from '../rating.mjs';
import * as G from '../games.mjs';

const userByName = async (name) => { const u = await getDb().prepare('SELECT * FROM users WHERE username = ?').get(String(name || '')); if (!u || u.banned) throw new HttpError(404, 'Player not found.'); return u; };
const online = (u) => !!(u.last_seen_at && Date.now() - Date.parse(u.last_seen_at) < 5 * 60000);
const card = (u) => ({ ...publicUser(u), online: online(u) });
const notMuted = (ctx) => { if (ctx.user.muted) throw new HttpError(403, 'Your account is muted by a moderator.'); };

export async function areFriends(a, b) {
  return !!(await getDb().prepare("SELECT 1 FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))").get(a, b, b, a));
}
const notify = (userId, payload) => G.events.emit('notify', userId, payload);

// ---- tournament scoring: win 2, draw 1, loss 0; points double while the player is on a winning streak of 2+
export async function tournamentState(t) {
  const n = Date.now(), s = Date.parse(t.starts_at), e = Date.parse(t.ends_at);
  return t.status === 'cancelled' ? 'cancelled' : n < s ? 'upcoming' : n < e ? 'running' : 'finished';
}
G.events.on('finished', async (row) => {
  try {
    if (!row.tournament_id || row.status !== 'finished') return;
    const res = row.result;
    for (const [uid, color] of [[row.white_id, 'w'], [row.black_id, 'b']]) {
      if (!uid) continue;
      const win = res === (color === 'w' ? '1-0' : '0-1'), draw = res === '1/2-1/2';
      await tx(async (db) => {
        const p = await db.prepare('SELECT * FROM tournament_players WHERE tournament_id = ? AND user_id = ?').get(row.tournament_id, uid);
        if (!p) return;
        const base = win ? 2 : draw ? 1 : 0;
        const pts = (p.streak >= 2 && base > 0) ? base * 2 : base;
        await db.prepare('UPDATE tournament_players SET score = score + ?, games = games + 1, wins = wins + ?, draws = draws + ?, losses = losses + ?, streak = ? WHERE tournament_id = ? AND user_id = ?')
          .run(pts, win ? 1 : 0, draw ? 1 : 0, !win && !draw ? 1 : 0, win ? p.streak + 1 : 0, row.tournament_id, uid);
      });
    }
  } catch (e) { console.error('[tournament] ' + e.message); }
});

export function register(router) {
  // ---------------------------------------------------------------- friends
  router.add('GET', '/api/friends', async (ctx) => {
    const d = getDb(), me = ctx.user.id;
    const rows = await d.prepare(`SELECT f.*, ur.username AS rname, ua.username AS aname FROM friendships f JOIN users ur ON ur.id = f.requester_id JOIN users ua ON ua.id = f.addressee_id WHERE f.requester_id = ? OR f.addressee_id = ?`).all(me, me);
    const out = { friends: [], incoming: [], outgoing: [] };
    for (const r of rows) {
      const otherId = r.requester_id === me ? r.addressee_id : r.requester_id;
      const u = await d.prepare('SELECT * FROM users WHERE id = ? AND banned = 0').get(otherId);
      if (!u) continue;
      const entry = card(u);
      if (r.status === 'accepted') out.friends.push(entry); else if (r.requester_id === me) out.outgoing.push(entry); else out.incoming.push(entry);
    }
    out.friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
    return out;
  }, { user: true });

  router.add('POST', '/api/friends/request', async (ctx) => {
    notMuted(ctx);
    if (!rateLimit('fr:' + ctx.user.id, 20, 3600000)) throw new HttpError(429, 'Too many friend requests. Try again later.');
    const { username } = await ctx.json();
    const other = await userByName(username);
    if (other.id === ctx.user.id) throw bad('You cannot add yourself.');
    const d = getDb();
    const existing = await d.prepare('SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)').get(ctx.user.id, other.id, other.id, ctx.user.id);
    if (existing) {
      if (existing.status === 'accepted') throw new HttpError(409, 'You are already friends.');
      if (existing.requester_id === other.id) { await d.prepare("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?").run(other.id, ctx.user.id); notify(other.id, { kind: 'friend' }); return { status: 'accepted' }; }
      throw new HttpError(409, 'Friend request already sent.');
    }
    await d.prepare("INSERT INTO friendships(requester_id, addressee_id, status, created_at) VALUES (?,?,'pending',?)").run(ctx.user.id, other.id, now());
    notify(other.id, { kind: 'friend' });
    return { status: 'pending' };
  }, { user: true });

  router.add('POST', '/api/friends/accept', async (ctx) => {
    const other = await userByName((await ctx.json()).username);
    const r = await getDb().prepare("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'").run(other.id, ctx.user.id);
    if (!r.changes) throw new HttpError(404, 'No such friend request.');
    notify(other.id, { kind: 'friend' });
    return { ok: true };
  }, { user: true });
  router.add('POST', '/api/friends/decline', async (ctx) => {
    const other = await userByName((await ctx.json()).username);
    await getDb().prepare("DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'").run(other.id, ctx.user.id);
    return { ok: true };
  }, { user: true });
  router.add('DELETE', '/api/friends/:name', async (ctx) => {
    const other = await userByName(ctx.params.name);
    await getDb().prepare('DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)').run(ctx.user.id, other.id, other.id, ctx.user.id);
    return { ok: true };
  }, { user: true });

  // ---------------------------------------------------------------- challenges (friends only)
  router.add('POST', '/api/challenges', async (ctx) => {
    notMuted(ctx);
    if (!rateLimit('ch:' + ctx.user.id, 20, 600000)) throw new HttpError(429, 'Too many challenges. Try again later.');
    const b = await ctx.json();
    const other = await userByName(b.username);
    if (!(await areFriends(ctx.user.id, other.id))) throw new HttpError(403, 'You can only challenge your friends.');
    const id = await G.createRoom(ctx.user, { base: b.base, inc: b.inc, color: b.color });
    await getDb().prepare("INSERT INTO challenges(game_id, from_id, to_id, status, created_at) VALUES (?,?,?,'pending',?)").run(id, ctx.user.id, other.id, now());
    notify(other.id, { kind: 'challenge', gameId: id, from: ctx.user.username });
    return { status: 201, body: { id } };
  }, { user: true });
  router.add('GET', '/api/challenges', async (ctx) => {
    const rows = await getDb().prepare(`SELECT c.game_id, c.created_at, u.username, g.base_ms, g.inc_ms FROM challenges c JOIN users u ON u.id = c.from_id JOIN games g ON g.id = c.game_id
      WHERE c.to_id = ? AND c.status = 'pending' AND g.status = 'waiting' AND c.created_at > ? ORDER BY c.created_at DESC LIMIT 10`).all(ctx.user.id, new Date(Date.now() - 15 * 60000).toISOString());
    return { challenges: rows.map((r) => ({ gameId: r.game_id, from: r.username, base: r.base_ms / 1000, inc: r.inc_ms / 1000, category: categoryOf(r.base_ms, r.inc_ms), createdAt: r.created_at })) };
  }, { user: true });
  router.add('POST', '/api/challenges/:id/accept', async (ctx) => {
    const c = await getDb().prepare("SELECT * FROM challenges WHERE game_id = ? AND to_id = ? AND status = 'pending'").get(ctx.params.id, ctx.user.id);
    if (!c) throw new HttpError(404, 'This challenge is no longer open.');
    const v = await G.joinRoom(ctx.user, c.game_id);
    await getDb().prepare("UPDATE challenges SET status = 'accepted' WHERE game_id = ?").run(c.game_id);
    return { id: v.id };
  }, { user: true });
  router.add('POST', '/api/challenges/:id/decline', async (ctx) => {
    await getDb().prepare("UPDATE challenges SET status = 'declined' WHERE game_id = ? AND to_id = ? AND status = 'pending'").run(ctx.params.id, ctx.user.id);
    return { ok: true };
  }, { user: true });

  router.add('GET', '/api/me/notifications', async (ctx) => {
    const d = getDb();
    const fr = (await d.prepare("SELECT count(*) n FROM friendships WHERE addressee_id = ? AND status = 'pending'").get(ctx.user.id)).n;
    const ch = (await d.prepare("SELECT count(*) n FROM challenges c JOIN games g ON g.id = c.game_id WHERE c.to_id = ? AND c.status = 'pending' AND g.status = 'waiting'").get(ctx.user.id)).n;
    const act = await d.prepare("SELECT id FROM games WHERE status = 'active' AND (white_id = ? OR black_id = ?) ORDER BY created_at DESC LIMIT 5").all(ctx.user.id, ctx.user.id);
    return { friendRequests: fr, challenges: ch, activeGames: act.map((g) => g.id) };
  }, { user: true });

  // ---------------------------------------------------------------- in-game chat (players)
  const chatGame = async (ctx) => {
    const row = await G.loadGame(ctx.params.id);
    if (!row) throw new HttpError(404, 'Game not found.');
    if (!G.colorOf(row, ctx.user.id)) throw new HttpError(403, 'Only the players can use the chat.');
    return row;
  };
  router.add('GET', '/api/games/:id/chat', async (ctx) => {
    await chatGame(ctx);
    const rows = await getDb().prepare('SELECT c.id, c.text, c.ts, u.username FROM game_chat c JOIN users u ON u.id = c.user_id WHERE c.game_id = ? ORDER BY c.id DESC LIMIT 100').all(ctx.params.id);
    return { messages: rows.reverse() };
  }, { user: true });
  router.add('POST', '/api/games/:id/chat', async (ctx) => {
    notMuted(ctx);
    await chatGame(ctx);
    if (!rateLimit('chat:' + ctx.user.id, 12, 30000)) throw new HttpError(429, 'Slow down.');
    const { text } = await ctx.json();
    const t = typeof text === 'string' ? text.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 200) : '';
    if (!t) throw bad('Write a message.');
    const r = await getDb().prepare('INSERT INTO game_chat(game_id, user_id, text, ts) VALUES (?,?,?,?)').run(ctx.params.id, ctx.user.id, t, now());
    const msg = { id: r.lastInsertRowid, text: t, ts: now(), username: ctx.user.username };
    G.events.emit('chat', ctx.params.id, msg);
    return msg;
  }, { user: true });

  // ---------------------------------------------------------------- news (read)
  router.add('GET', '/api/news', async () => ({ items: (await getDb().prepare("SELECT id, title, summary, author, published_at FROM news WHERE status = 'published' ORDER BY published_at DESC LIMIT 30").all()) }));
  router.add('GET', '/api/news/:id', async (ctx) => {
    const n = await getDb().prepare("SELECT id, title, summary, body, author, published_at FROM news WHERE id = ? AND status = 'published'").get(+ctx.params.id || 0);
    if (!n) throw new HttpError(404, 'Article not found.');
    return n;
  });

  // ---------------------------------------------------------------- tournaments (arena)
  const tview = async (t, userId) => {
    const d = getDb();
    const players = await d.prepare(`SELECT p.*, u.username, u.avatar, u.country FROM tournament_players p JOIN users u ON u.id = p.user_id WHERE p.tournament_id = ? ORDER BY p.score DESC, p.wins DESC, p.joined_at LIMIT 100`).all(t.id);
    const count = (await d.prepare('SELECT count(*) n FROM tournament_players WHERE tournament_id = ?').get(t.id)).n;
    return {
      id: t.id, name: t.name, description: t.description, base: t.base_ms / 1000, inc: t.inc_ms / 1000, category: t.category, startsAt: t.starts_at, endsAt: t.ends_at, state: await tournamentState(t), players: count,
      joined: userId ? players.some((p) => p.user_id === userId) || !!(await d.prepare('SELECT 1 FROM tournament_players WHERE tournament_id = ? AND user_id = ?').get(t.id, userId)) : false,
      standings: players.map((p, i) => ({ rank: i + 1, username: p.username, avatar: p.avatar, country: p.country, score: p.score, games: p.games, wins: p.wins, draws: p.draws, losses: p.losses, streak: p.streak })),
    };
  };
  router.add('GET', '/api/tournaments', async (ctx) => {
    const rows = await getDb().prepare("SELECT * FROM tournaments WHERE status != 'cancelled' AND ends_at > ? ORDER BY starts_at LIMIT 30").all(new Date(Date.now() - 3 * 86400000).toISOString());
    const out = []; for (const t of rows) { const v = await tview(t, ctx.user?.id); delete v.standings; out.push(v); }
    return { tournaments: out };
  }, { userOptional: true });
  router.add('GET', '/api/tournaments/:id', async (ctx) => {
    const t = await getDb().prepare('SELECT * FROM tournaments WHERE id = ?').get(+ctx.params.id || 0);
    if (!t) throw new HttpError(404, 'Tournament not found.');
    return tview(t, ctx.user?.id);
  }, { userOptional: true });
  const openTournament = async (ctx) => {
    const t = await getDb().prepare('SELECT * FROM tournaments WHERE id = ?').get(+ctx.params.id || 0);
    if (!t || t.status === 'cancelled') throw new HttpError(404, 'Tournament not found.');
    if ((await tournamentState(t)) === 'finished') throw new HttpError(409, 'This tournament has finished.');
    return t;
  };
  router.add('POST', '/api/tournaments/:id/join', async (ctx) => {
    const t = await openTournament(ctx);
    await getDb().prepare('INSERT OR IGNORE INTO tournament_players(tournament_id, user_id, joined_at) VALUES (?,?,?)').run(t.id, ctx.user.id, now());
    return tview(t, ctx.user.id);
  }, { user: true });
  router.add('POST', '/api/tournaments/:id/leave', async (ctx) => {
    const t = await openTournament(ctx);
    await getDb().prepare('DELETE FROM tournament_players WHERE tournament_id = ? AND user_id = ? AND games = 0').run(t.id, ctx.user.id);
    return tview(t, ctx.user.id);
  }, { user: true });
  // "Play": enter the tournament's pairing pool (only joined players, only while it is running)
  router.add('POST', '/api/tournaments/:id/play', async (ctx) => {
    const t = await openTournament(ctx);
    if ((await tournamentState(t)) !== 'running') throw new HttpError(409, 'The tournament has not started yet.');
    const joined = await getDb().prepare('SELECT 1 FROM tournament_players WHERE tournament_id = ? AND user_id = ?').get(t.id, ctx.user.id);
    if (!joined) throw new HttpError(403, 'Join the tournament first.');
    return G.joinQueue(ctx.user, { base: t.base_ms / 1000, inc: t.inc_ms / 1000, rated: true, tournamentId: t.id });
  }, { user: true });

  // ---------------------------------------------------------------- reports
  router.add('POST', '/api/reports', async (ctx) => {
    if (!rateLimit('rep:' + ctx.user.id, 10, 3600000)) throw new HttpError(429, 'Too many reports. Try again later.');
    const b = await ctx.json();
    const target = await userByName(b.username);
    if (target.id === ctx.user.id) throw bad('You cannot report yourself.');
    if (!['cheating', 'abuse', 'spam', 'other'].includes(b.reason)) throw bad('Choose a reason.');
    const detail = typeof b.detail === 'string' ? b.detail.replace(/[<>]/g, '').trim().slice(0, 500) : '';
    const gameId = typeof b.gameId === 'string' && /^[a-z0-9]{8}$/.test(b.gameId) ? b.gameId : null;
    const dup = await getDb().prepare("SELECT 1 FROM reports WHERE reporter_id = ? AND target_id = ? AND status = 'open'").get(ctx.user.id, target.id);
    if (dup) throw new HttpError(409, 'You already have an open report about this player.');
    await getDb().prepare('INSERT INTO reports(reporter_id, target_id, game_id, reason, detail, created_at) VALUES (?,?,?,?,?,?)').run(ctx.user.id, target.id, gameId, b.reason, detail, now());
    return { status: 201, body: { ok: true } };
  }, { user: true });
}
