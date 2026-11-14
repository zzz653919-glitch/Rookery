// One request for everything the Rookery home page shows to everybody (it used to be six): live games, tournaments, the top of the
// leaderboard and a few chess-world headlines. Short shared cache; personal data (recent games) stays on /api/users/:name.
import { getDb } from '../db.mjs';
import { rateLimit } from '../security.mjs';
import { HttpError } from '../http.mjs';
import * as G from '../games.mjs';
import { tournamentList } from './community.mjs';
import { worldHome } from './world.mjs';

const cache = new Map(); // lang -> { at, body }
async function build(lang) {
  const d = getDb();
  const [live, tournaments, lb, world] = await Promise.all([
    G.liveGames(3),
    tournamentList(null, { limit: 3, onlyOpen: true }),
    d.prepare(`SELECT u.username, u.avatar, u.country, r.rating, r.games FROM ratings r JOIN users u ON u.id = r.user_id WHERE r.category = 'blitz' AND r.games >= 3 AND u.banned = 0 ORDER BY r.rating DESC, r.games DESC LIMIT 5`).all(),
    worldHome(lang).catch(() => null),
  ]);
  return {
    live: live.map(({ moves, sans, pgn, ...g }) => ({ ...g, moves: { length: moves.length } })),
    tournaments,
    leaderboard: lb.map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar === 'upload' ? 'upload' : r.avatar, country: r.country, rating: Math.round(r.rating) })),
    world: world && { live: world.live.slice(0, 3), breaking: world.breaking.slice(0, 3), featuredBroadcast: world.featuredBroadcast },
    generatedAt: Date.now(),
  };
}
export function register(router) {
  router.add('GET', '/api/home', async (ctx) => {
    if (!rateLimit('home:' + ctx.ip, 300, 60000)) throw new HttpError(429, 'Slow down.');
    const lang = ['uz', 'ru'].includes(ctx.query.lang) ? ctx.query.lang : 'en';
    const hit = cache.get(lang);
    const body = hit && Date.now() - hit.at < 15000 ? hit.body : await build(lang);
    if (body !== hit?.body) cache.set(lang, { at: Date.now(), body });
    return { status: 200, body, headers: { 'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=120' } };
  });
}
