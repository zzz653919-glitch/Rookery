// Online play: matchmaking, private rooms, moves, spectating, profiles and leaderboards.
import { getDb } from '../db.mjs';
import { HttpError, bad } from '../http.mjs';
import { rateLimit } from '../security.mjs';
import { publicUser, ratingsOf } from '../accounts.mjs';
import { CATEGORIES } from '../rating.mjs';
import * as G from '../games.mjs';

const withYou = (view, user) => ({ ...view, you: user ? (view.players.w?.id === user.id ? 'w' : view.players.b?.id === user.id ? 'b' : null) : null });
const idOk = (id) => /^[a-z0-9]{8}$/.test(id);
const moveLimit = (ctx) => { if (!rateLimit('mv:' + ctx.user.id, 20, 5000)) throw new HttpError(429, 'Slow down.'); };

export function register(router) {
  router.add('GET', '/api/games/live', async () => ({ games: await G.liveGames(20) }));
  router.add('GET', '/api/time-controls', async () => ({ controls: G.TIME_CONTROLS }));

  // --- matchmaking queue
  router.add('POST', '/api/games/queue', async (ctx) => { const b = await ctx.json(); return G.joinQueue(ctx.user, { base: b.base, inc: b.inc, rated: b.rated !== false }); }, { user: true });
  router.add('GET', '/api/games/queue', async (ctx) => G.pollQueue(ctx.user), { user: true });
  router.add('DELETE', '/api/games/queue', async (ctx) => { await G.leaveQueue(ctx.user); return { ok: true }; }, { user: true });

  // --- private rooms (friends join through the link)
  router.add('POST', '/api/games/room', async (ctx) => { const b = await ctx.json(); return { status: 201, body: { id: await G.createRoom(ctx.user, { base: b.base, inc: b.inc, color: b.color }) } }; }, { user: true });

  router.add('GET', '/api/games/:id', async (ctx) => {
    if (!idOk(ctx.params.id)) throw new HttpError(404, 'Game not found.');
    const v = await G.getViewWithNames(ctx.params.id);
    if (!v) throw new HttpError(404, 'Game not found.');
    return withYou(v, ctx.user);
  }, { userOptional: true });
  router.add('POST', '/api/games/:id/join', async (ctx) => { if (!idOk(ctx.params.id)) throw new HttpError(404, 'Game not found.'); return withYou(await G.joinRoom(ctx.user, ctx.params.id), ctx.user); }, { user: true });
  router.add('POST', '/api/games/:id/move', async (ctx) => { moveLimit(ctx); const { move } = await ctx.json(); return withYou(await G.playMove(ctx.user, ctx.params.id, move), ctx.user); }, { user: true });
  router.add('POST', '/api/games/:id/resign', async (ctx) => withYou(await G.resign(ctx.user, ctx.params.id), ctx.user), { user: true });
  router.add('POST', '/api/games/:id/abort', async (ctx) => withYou(await G.abort(ctx.user, ctx.params.id), ctx.user), { user: true });
  router.add('POST', '/api/games/:id/draw', async (ctx) => { const { action } = await ctx.json(); return withYou(await G.drawAction(ctx.user, ctx.params.id, action), ctx.user); }, { user: true });
  router.add('POST', '/api/games/:id/rematch', async (ctx) => ({ id: await G.rematch(ctx.user, ctx.params.id) }), { user: true });

  // --- profiles, history, leaderboards
  router.add('GET', '/api/users/:name', async (ctx) => {
    const u = await getDb().prepare('SELECT * FROM users WHERE username = ?').get(ctx.params.name);
    if (!u) throw new HttpError(404, 'Player not found.');
    const ratings = await ratingsOf(u.id);
    const totals = Object.values(ratings).reduce((a, r) => ({ games: a.games + r.games, wins: a.wins + r.wins, losses: a.losses + r.losses, draws: a.draws + r.draws }), { games: 0, wins: 0, losses: 0, draws: 0 });
    const online = u.last_seen_at && Date.now() - Date.parse(u.last_seen_at) < 5 * 60000;
    return { user: { ...publicUser(u), online: !!online }, ratings, totals, games: await G.gamesOfUser(u.id, { limit: 10 }) };
  });
  router.add('GET', '/api/users/:name/games', async (ctx) => {
    const u = await getDb().prepare('SELECT id FROM users WHERE username = ?').get(ctx.params.name);
    if (!u) throw new HttpError(404, 'Player not found.');
    const limit = Math.min(50, Math.max(1, parseInt(ctx.query.limit, 10) || 20)), offset = Math.max(0, parseInt(ctx.query.offset, 10) || 0);
    return { games: await G.gamesOfUser(u.id, { limit, offset }) };
  });
  router.add('GET', '/api/leaderboard', async (ctx) => {
    const category = CATEGORIES.concat(['puzzle']).includes(ctx.query.category) ? ctx.query.category : 'blitz';
    const rows = await getDb().prepare(`SELECT u.username, u.avatar, u.country, r.rating, r.games, r.wins, r.losses, r.draws FROM ratings r JOIN users u ON u.id = r.user_id
      WHERE r.category = ? AND r.games >= ? AND u.banned = 0 ORDER BY r.rating DESC, r.games DESC LIMIT 50`).all(category, category === 'puzzle' ? 1 : 3);
    return { category, players: rows.map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar === 'upload' ? 'upload' : r.avatar, country: r.country, rating: Math.round(r.rating), games: r.games, wins: r.wins, losses: r.losses, draws: r.draws })) };
  });
}
