// Chess World: news, events, historical games, live rounds, broadcasts, players, search. All public and read-only.
import { getDb } from '../db.mjs';
import { HttpError, bad } from '../http.mjs';
import { rateLimit } from '../security.mjs';
import { config } from '../config.mjs';
import * as W from '../world.mjs';
import { builtinList, builtinGet } from '../editorial.mjs';
import { movesOf } from '../pgn.mjs';
import { FIDE_TO_ISO2, countryName } from '../../js/data/countries.js';

const lang = (ctx) => (['uz', 'ru'].includes(ctx.query.lang) ? ctx.query.lang : 'en');
const str = (v, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const int = (v, def, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
// a request must not wait long for a slow upstream: refresh in the foreground for at most a few seconds, then answer with what is stored
const within = (p, ms = 6000) => Promise.race([p.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
const articleOut = (n) => ({ id: n.id, title: n.title, summary: n.summary, image: n.image || null, source: n.source_name || n.author || null, sourceUrl: n.source_url || null, category: n.category || 'international', publishedAt: n.published_at, origin: n.origin || 'admin', lang: n.lang || 'en' });

async function allArticles(l, { category, q } = {}) {
  const rows = await getDb().prepare("SELECT id, title, summary, image, source_name, source_url, author, category, published_at, origin, lang FROM news WHERE status = 'published' ORDER BY published_at DESC LIMIT 200").all();
  const own = rows.map(articleOut);
  const built = builtinList(l).map((b) => articleOut({ ...b, category: 'rookery', source_name: 'Rookery', origin: 'builtin' }));
  let list = [...own, ...built].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  if (category) list = list.filter((a) => a.category === category);
  if (q) { const s = q.toLowerCase(); list = list.filter((a) => `${a.title} ${a.summary}`.toLowerCase().includes(s)); }
  return list;
}

// ratings and photos of listed players come from the FIDE data (cached for hours); a slow upstream only means no ratings are shown
async function withFide(players) {
  const got = await within(Promise.all(players.map((p) => (p.fide_id ? W.fideInfo(p.fide_id) : null))), 5000);
  return players.map((p, i) => { const f = got?.[i]; const ok = f && W.nameMatches(p.name, f.name); return { slug: p.slug, name: p.name, country: ok ? f.federation : p.country, title: ok ? f.title : null, ratings: ok ? { standard: f.standard, rapid: f.rapid, blitz: f.blitz } : null, photo: ok ? f.photo : null, rank: p.world_rank || null }; });
}

export function register(router) {
  // read-only and cached, but some endpoints can trigger upstream requests: keep one visitor from hammering them
  const G = (path, fn, opts) => router.add('GET', path, async (ctx) => { if (!rateLimit('world:' + ctx.ip, 600, 60000)) throw new HttpError(429, 'Slow down.'); return fn(ctx); }, opts);
  // ---------------------------------------------------------------- news
  G('/api/world/categories', async (ctx) => {
    const l = lang(ctx);
    return { categories: (await getDb().prepare('SELECT * FROM world_categories ORDER BY sort, slug').all()).map((c) => ({ slug: c.slug, name: c[`name_${l}`] || c.name_en })) };
  });
  G('/api/world/news', async (ctx) => {
    const l = lang(ctx); await within(W.syncSources(), 6000);
    const list = await allArticles(l, { category: str(ctx.query.category, 40), q: str(ctx.query.q, 80) });
    const page = int(ctx.query.page, 1, 1, 50), size = int(ctx.query.size, 24, 1, 60);
    return { total: list.length, page, items: list.slice((page - 1) * size, page * size) };
  });
  G('/api/world/news/:id', async (ctx) => {
    const l = lang(ctx); const id = ctx.params.id;
    const built = builtinGet(id, l);
    if (built) return { ...articleOut({ ...built, category: 'rookery', source_name: 'Rookery', origin: 'builtin' }), body: built.body };
    const n = await getDb().prepare("SELECT * FROM news WHERE id = ? AND status = 'published'").get(+id || 0);
    if (!n) throw new HttpError(404, 'Article not found.');
    return { ...articleOut(n), body: n.body || '' };
  });

  // ---------------------------------------------------------------- events
  G('/api/world/events', async (ctx) => {
    await within(W.refreshTop(), 6000);
    const q = ctx.query; const status = ['upcoming', 'live', 'completed'].includes(q.status) ? q.status : null;
    const size = int(q.size, 24, 1, 60), page = int(q.page, 1, 1, 200);
    const res = await W.listEvents({ q: str(q.q), status, level: ['international', 'continental', 'national', 'online'].includes(q.level) ? q.level : null, country: str(q.country, 40), year: /^\d{4}$/.test(q.year || '') ? q.year : null, tc: ['standard', 'rapid', 'blitz'].includes(q.tc) ? q.tc : null, limit: size, offset: (page - 1) * size, order: status === 'upcoming' ? 'asc' : status === 'live' ? 'live' : null });
    // archive search: nothing stored yet for this text -> look it up in the archive of official broadcasts once
    if (!res.total && q.q && String(q.q).length >= 3) { const n = await within(W.searchArchive(str(q.q, 60)), 7000); if (n) return { ...(await W.listEvents({ q: str(q.q), status, limit: size, offset: 0 })), page: 1 }; }
    return { ...res, page };
  });
  G('/api/world/events/:id', async (ctx) => {
    const d = await W.eventDetail(+ctx.params.id || 0, { sync: true });
    if (!d) throw new HttpError(404, 'Event not found.');
    return d;
  });
  G('/api/world/facets', async () => W.facets());

  // ---------------------------------------------------------------- games
  G('/api/world/games', async (ctx) => {
    const q = ctx.query; const size = int(q.size, 30, 1, 60), page = int(q.page, 1, 1, 500);
    return { ...(await W.searchGames({ player: str(q.player), event: str(q.event), eventId: q.eventId, country: /^[A-Za-z]{3}$/.test(q.country || '') ? q.country.toUpperCase() : null, year: /^\d{4}$/.test(q.year || '') ? q.year : null, tc: ['standard', 'rapid', 'blitz'].includes(q.tc) ? q.tc : null, result: q.result, eco: str(q.eco, 3), fide: /^\d{1,9}$/.test(q.fide || '') ? q.fide : null, limit: size, offset: (page - 1) * size })), page };
  });
  G('/api/world/games/:id', async (ctx) => {
    const g = await W.gameById(+ctx.params.id || 0); if (!g) throw new HttpError(404, 'Game not found.');
    const { moves } = movesOf(g.pgn);
    const { pgn, ...meta } = g;
    return { game: meta, moves, pgn };
  });
  G('/api/world/games/:id/pgn', async (ctx) => {
    const g = await W.gameById(+ctx.params.id || 0); if (!g) throw new HttpError(404, 'Game not found.');
    const name = `${g.white}-${g.black}-${g.played_on || g.id}`.replace(/[^\w.-]+/g, '_').slice(0, 80);
    return { raw: true, status: 200, body: g.pgn + '\n', headers: { 'content-type': 'application/x-chess-pgn; charset=utf-8', 'content-disposition': `attachment; filename="${name}.pgn"`, 'cache-control': 'public, max-age=3600' } };
  });
  G('/api/world/events/:id/pgn', async (ctx) => {
    const id = +ctx.params.id || 0; const ev = await getDb().prepare('SELECT name FROM world_events WHERE id = ?').get(id); if (!ev) throw new HttpError(404, 'Event not found.');
    const rows = await getDb().prepare('SELECT pgn FROM world_games WHERE event_id = ? ORDER BY id').all(id);
    return { raw: true, status: 200, body: rows.map((r) => r.pgn).join('\n\n') + '\n', headers: { 'content-type': 'application/x-chess-pgn; charset=utf-8', 'content-disposition': `attachment; filename="${ev.name.replace(/[^\w.-]+/g, '_').slice(0, 60)}.pgn"`, 'cache-control': 'public, max-age=600' } };
  });

  // ---------------------------------------------------------------- live
  G('/api/world/live', async () => {
    await within(W.refreshTop(), 5000);
    const r = await W.liveRounds({ limit: 4 });
    return { ...r, serverTime: Date.now(), enabled: config.worldEnabled };
  });

  // ---------------------------------------------------------------- broadcasts
  const bout = (b, host) => ({ id: b.id, title: b.title, description: b.description, provider: b.provider, channel: b.channel_name, officialUrl: b.official_url, language: b.language, eventId: b.event_id, startsAt: b.starts_at, endsAt: b.ends_at, featured: !!b.featured, official: !!b.official, commentary: b.commentary, status: W.broadcastStatus(b), embed: W.embedOf(b, host) });
  G('/api/world/broadcasts', async (ctx) => {
    const host = str(ctx.query.host, 120).replace(/[^\w.-]/g, '');
    const rows = (await getDb().prepare('SELECT * FROM world_broadcasts ORDER BY coalesce(starts_at, created_at) DESC LIMIT 200').all()).map((b) => bout(b, host));
    return { live: rows.filter((b) => b.status === 'live'), upcoming: rows.filter((b) => b.status === 'upcoming').reverse(), archive: rows.filter((b) => b.status === 'completed'), featured: rows.find((b) => b.featured && b.status === 'live') || rows.find((b) => b.status === 'live') || null };
  });

  // ---------------------------------------------------------------- players
  G('/api/world/players', async (ctx) => ({ players: await withFide(await W.listPlayers({ q: str(ctx.query.q), featured: ctx.query.featured === '1' })) }));
  G('/api/world/players/:slug', async (ctx) => {
    const p = await W.playerProfile(String(ctx.params.slug).slice(0, 80), lang(ctx)); if (!p) throw new HttpError(404, 'Player not found.');
    const news = await allArticles(lang(ctx), { q: p.name.split(' ').pop() });
    return { ...p, news: news.slice(0, 5) };
  });

  // ---------------------------------------------------------------- search and home
  G('/api/world/search', async (ctx) => {
    const q = str(ctx.query.q, 60); if (q.length < 2) throw bad('Type at least 2 characters.');
    const d = getDb(); const like = `%${q}%`; const l = lang(ctx);
    const [players, events, games, broadcasts] = await Promise.all([
      d.prepare('SELECT slug, name, country FROM world_players WHERE name LIKE ? ORDER BY sort LIMIT 8').all(like),
      d.prepare('SELECT id, name, location, starts_on, ends_on, live, remote_state, status_override FROM world_events WHERE name LIKE ? OR location LIKE ? ORDER BY starts_on DESC LIMIT 8').all(like, like),
      d.prepare('SELECT id, white, black, result, played_on, event_id FROM world_games WHERE white LIKE ? OR black LIKE ? ORDER BY played_on DESC LIMIT 8').all(like, like),
      d.prepare('SELECT id, title, starts_at, ends_at, status_override, channel_name FROM world_broadcasts WHERE title LIKE ? OR channel_name LIKE ? LIMIT 6').all(like, like),
    ]);
    const countries = Object.keys(FIDE_TO_ISO2).filter((f) => f !== 'FID' && (f.toLowerCase() === q.toLowerCase() || countryName(f, 'en').toLowerCase().includes(q.toLowerCase()) || countryName(f, l).toLowerCase().includes(q.toLowerCase()))).slice(0, 6).map((f) => ({ fed: f, name: countryName(f, l) }));
    return { q, players, events: events.map((e) => ({ id: e.id, name: e.name, location: e.location, startsOn: e.starts_on, status: W.eventStatus(e) })), games, broadcasts: broadcasts.map((b) => ({ id: b.id, title: b.title, channel: b.channel_name, status: W.broadcastStatus(b) })), countries, news: (await allArticles(l, { q })).slice(0, 8) };
  });

  let homeCache = null;
  G('/api/world/home', async (ctx) => {
    const l = lang(ctx);
    if (homeCache && homeCache.l === l && homeCache.v === W.stamp.n && Date.now() - homeCache.at < 45000) return homeCache.body;
    await within(Promise.all([W.refreshTop(), W.syncSources()]), 6000);
    await within(W.bootstrapResults(), 8000);
    const d = getDb();
    const news = await allArticles(l);
    const live = await W.listEvents({ status: 'live', limit: 6, order: 'live' });
    const upcoming = await W.listEvents({ status: 'upcoming', limit: 6, order: 'asc' });
    const completed = await W.listEvents({ status: 'completed', limit: 6 });
    const results = []; for (const e of completed.events.slice(0, 4)) { const podium = await W.podiumOf(e.id); if (podium.length) results.push({ event: e, podium }); }
    const rows = (await d.prepare('SELECT * FROM world_broadcasts ORDER BY coalesce(starts_at, created_at) DESC LIMIT 50').all()).map((b) => bout(b, ''));
    const featured = await W.listPlayers({ featured: true });
    const featuredGames = await d.prepare('SELECT g.id, g.white, g.black, g.white_elo, g.black_elo, g.white_fed, g.black_fed, g.result, g.plies, g.round_name, g.played_on, e.name AS event_name FROM world_games g JOIN world_events e ON e.id = g.event_id WHERE g.featured = 1 ORDER BY g.id DESC LIMIT 4').all();
    const latestGames = await d.prepare("SELECT g.id, g.white, g.black, g.white_elo, g.black_elo, g.white_fed, g.black_fed, g.result, g.plies, g.round_name, g.played_on, e.name AS event_name FROM world_games g JOIN world_events e ON e.id = g.event_id WHERE g.result != '*' ORDER BY g.played_on DESC, g.id DESC LIMIT 6").all();
    const body = {
      breaking: news.filter((n) => n.category !== 'rookery').slice(0, 5), rookery: news.filter((n) => n.category === 'rookery').slice(0, 3),
      live: live.events, upcoming: upcoming.events, results, recent: completed.events,
      videos: rows.filter((b) => b.status !== 'upcoming').slice(0, 4), featuredBroadcast: rows.find((b) => b.featured && b.status === 'live') || rows.find((b) => b.status === 'live') || null,
      featuredGames, latestGames, players: await withFide(featured.slice(0, 8)), uzbekistan: { news: news.filter((n) => n.category === 'uzbekistan').slice(0, 4), events: (await W.listEvents({ country: 'UZB', limit: 4 })).events, players: await withFide((await W.listPlayers({})).filter((p) => p.country === 'UZB').slice(0, 4)) }, generatedAt: Date.now(),
    };
    homeCache = { l, v: W.stamp.n, at: Date.now(), body }; return body;
  });
  G('/api/world/status', async () => ({ enabled: config.worldEnabled, ...(await W.facets()) }));
}
