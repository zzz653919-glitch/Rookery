// Chess World: news from feeds, tournaments, games, live rounds, broadcasts, players and the admin tools — against a mock upstream
// that speaks the Lichess broadcast, FIDE rating, Wikipedia and Atom formats. Nothing here touches the real internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, newDataDir, removeDir, client, cli, freePort } from './lib/server.mjs';
import { splitGames, movesOf, headersOf } from '../server/pgn.mjs';
import { parseFeed } from '../server/feeds.mjs';
import { checkUrl } from '../server/world.mjs';

import { startMock, stopMock, mock, T0, iso, R1 } from './lib/world-mock.mjs';

let dir, srv, admin, anon;
const PW = 'Correct-Horse-9!';
before(async () => {
  const up = await startMock();
  dir = newDataDir();
  assert.equal(cli(dir, ['create-admin', '--username', 'boss', '--role', 'superadmin'], { password: PW }).status, 0);
  assert.equal(cli(dir, ['create-admin', '--username', 'vera', '--role', 'viewer'], { password: 'Viewer-Passw0rd#1' }).status, 0);
  srv = await startServer(dir, { ROOKERY_WORLD_OFFLINE: '0', ROOKERY_WORLD_ALLOW_LOCAL: '1', ROOKERY_LICHESS_URL: up, ROOKERY_FIDE_API_URL: `${up}/api/fide/player`, ROOKERY_WIKI_URL: up });
  admin = client(srv.base); assert.equal((await admin.login('boss', PW)).status, 200);
  anon = client(srv.base);
  // the news source of the mock feed (the shipped sources stay switched off)
  assert.equal((await admin.put('/api/admin/world/sources/1', { enabled: false })).status, 200); // the shipped Lichess blog source: tests never touch the internet
  const r = await admin.post('/api/admin/world/sources', { name: 'Mock Chess', url: `${up}/feed.atom`, category: 'fide', enabled: true, official: true });
  assert.equal(r.status, 201, r.text); mock.sourceId = r.json.id; mock.up = up;
});
after(async () => { await srv?.stop(); stopMock(); removeDir(dir); });

test('PGN reader: games, headers, clocks, evaluations (also mate scores), variations skipped', () => {
  const g = splitGames(R1); assert.equal(g.length, 2);
  assert.equal(headersOf(g[0]).White, 'Alpha, Anna');
  const { moves, result } = movesOf(g[0]); assert.equal(moves.length, 6); assert.equal(result, '1-0');
  assert.deepEqual(moves[0], { san: 'e4', clk: 5400, eval: { cp: 20 } }); assert.deepEqual(moves[5].eval, { mate: -3 });
  assert.equal(movesOf('[Event "x"]\n\n1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *').moves.length, 3);
});

test('feed reader: Atom and RSS entries with image, summary text and source link; no scripts survive', () => {
  const xml = `<rss><channel><item><title>Hello &amp; welcome</title><link>https://example.org/x</link><guid>g1</guid><pubDate>Mon, 10 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Hi &lt;script&gt;alert(1)&lt;/script&gt;there&lt;/p&gt;&lt;img src="https://i.example/p.png"&gt;</description></item><item><title>No link</title></item></channel></rss>`;
  const e = parseFeed(xml); assert.equal(e.length, 1); assert.equal(e[0].title, 'Hello & welcome'); assert.ok(!/script|alert/.test(e[0].summary)); assert.equal(e[0].image, 'https://i.example/p.png'); assert.equal(e[0].published, '2026-11-10T10:00:00.000Z');
  assert.equal(parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>a</id><title>T</title><link rel="alternate" href="javascript:alert(1)"/></entry></feed>`).length, 0, 'unsafe links are dropped');
});

test('upstream addresses: only public https; private and local addresses are refused', () => {
  for (const u of ['http://example.org/', 'https://localhost/x', 'https://127.0.0.1/', 'https://10.1.2.3/', 'https://192.168.0.5/', 'https://169.254.169.254/latest', 'ftp://example.org/', 'not a url']) assert.throws(() => checkUrl(u), undefined, u);
  assert.ok(checkUrl('https://lichess.org/api/broadcast/top'));
});

test('events: live, upcoming and completed come from the feed with real dates and statuses', async () => {
  const live = (await anon.get('/api/world/events?status=live')).json, up = (await anon.get('/api/world/events?status=upcoming')).json, done = (await anon.get('/api/world/events?status=completed')).json;
  assert.equal(live.total, 1); assert.equal(live.events[0].name, 'Live Open 2026'); assert.equal(live.events[0].status, 'live');
  assert.equal(up.total, 1); assert.equal(up.events[0].name, 'Uzbekistan Championship 2027'); assert.equal(up.events[0].status, 'upcoming'); assert.equal(up.events[0].fide_tc, 'rapid'); assert.equal(up.events[0].confirmed, 1);
  assert.equal(done.total, 1); assert.equal(done.events[0].status, 'completed');
  assert.equal((await anon.get('/api/world/events?status=upcoming&country=UZB')).json.total, 1, 'country filter by FIDE code matches the location');
  assert.equal((await anon.get('/api/world/events?q=championship')).json.total, 1); assert.equal((await anon.get('/api/world/events?year=1999')).json.total, 0);
});

test('event page imports the games of finished rounds, with standings, podium and statistics', async () => {
  const done = (await anon.get('/api/world/events?status=completed')).json.events[0];
  const d = (await anon.get(`/api/world/events/${done.id}`)).json;
  assert.equal(d.rounds.length, 2); assert.equal(d.rounds[0].games.length, 2);
  const names = d.standings.map((p) => p.name); assert.equal(d.standings[0].name, 'Alpha, Anna'); assert.equal(d.standings[0].points, 2); assert.equal(names.length, 4);
  assert.equal(d.stats.games, 4); assert.equal(d.stats.whiteWins, 1); assert.equal(d.stats.draws, 1); assert.equal(d.stats.blackWins, 2);
  assert.equal(d.event.schedule.length, 2);
  const again = (await anon.get(`/api/world/events/${done.id}`)).json; assert.equal(again.rounds[0].games.length, 2, 'importing twice does not duplicate games');
  const pgnAll = await anon.get(`/api/world/events/${done.id}/pgn`); assert.equal(pgnAll.status, 200); assert.equal(splitGames(pgnAll.text).length, 4);
});

test('game database: filters, replay data with clocks and evaluations, PGN download', async () => {
  const all = (await anon.get('/api/world/games')).json; assert.equal(all.total, 4);
  assert.equal((await anon.get('/api/world/games?player=gamma')).json.total, 2);
  assert.equal((await anon.get('/api/world/games?fide=1001')).json.total, 2);
  assert.equal((await anon.get('/api/world/games?result=1/2-1/2')).json.total, 1);
  assert.equal((await anon.get('/api/world/games?event=Mock')).json.total, 4); assert.equal((await anon.get('/api/world/games?event=Nope')).json.total, 0);
  assert.equal((await anon.get('/api/world/games?year=2026')).json.total, 4); assert.equal((await anon.get('/api/world/games?tc=standard')).json.total, 4); assert.equal((await anon.get('/api/world/games?tc=blitz')).json.total, 0);
  assert.equal((await anon.get('/api/world/games?country=UZB')).json.total, 4, 'country = where the tournament was played');
  const first = all.games.find((g) => g.white === 'Alpha, Anna' && g.result === '1-0');
  const g = (await anon.get(`/api/world/games/${first.id}`)).json; assert.equal(g.moves.length, 6); assert.equal(g.moves[0].clk, 5400); assert.deepEqual(g.moves[5].eval, { mate: -3 }); assert.match(g.pgn, /\[White "Alpha, Anna"\]/);
  const dl = await anon.get(`/api/world/games/${first.id}/pgn`); assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition'), /attachment; filename=".*\.pgn"/); assert.match(dl.text, /1\. e4/);
  assert.equal((await anon.get('/api/world/games/999999')).status, 404);
});

test('live games: the ongoing round is read from the feed — real moves, clocks and position, nothing invented', async () => {
  const d = (await anon.get('/api/world/live')).json;
  assert.equal(d.rounds.length, 1); const r = d.rounds[0]; assert.equal(r.event.name, 'Live Open 2026'); assert.equal(r.round.name, 'Round 5'); assert.equal(r.games.length, 1);
  const g = r.games[0]; assert.equal(g.white, 'Live, Lena'); assert.equal(g.result, '*'); assert.equal(g.plies, 3); assert.equal(g.turn, 'b'); assert.deepEqual(g.sans, ['e4', 'c5', 'Nf3']);
  assert.equal(g.fen, 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'); assert.equal(g.clocks.w, 3520); assert.equal(g.clocks.b, 3510);
  const before = mock.hits['/api/broadcast/round/LIVE0001R5.pgn']; await anon.get('/api/world/live'); assert.equal(mock.hits['/api/broadcast/round/LIVE0001R5.pgn'], before, 'polls inside the cache window do not hit the upstream');
  // the live games are also stored, so the live standings and the archive follow by themselves
  const ev = (await anon.get('/api/world/events?status=live')).json.events[0]; const detail = (await anon.get(`/api/world/events/${ev.id}`)).json; assert.ok(detail.rounds.some((x) => x.games.some((y) => y.result === '*')));
});

test('players: FIDE ratings only when the name matches the id, Wikipedia biography with its source, record from stored games', async () => {
  const list = (await anon.get('/api/world/players')).json.players; assert.ok(list.length >= 5);
  const mc = (await anon.get('/api/world/players/magnus-carlsen')).json;
  assert.equal(mc.title, 'GM'); assert.deepEqual(mc.ratings, { standard: 2800, rapid: 2790, blitz: 2850 }); assert.equal(mc.photo.credit, 'Photographer'); assert.equal(mc.bioSource.name, 'Wikipedia (en)'); assert.match(mc.bio, /Norwegian/); assert.equal(mc.worldRank, null, 'no ranking is shown unless an editor supplies one');
  const wrong = (await anon.get('/api/world/players/nodirbek-abdusattorov')).json; assert.equal(wrong.ratings, null, 'data of a different person is never shown'); assert.equal(wrong.title, null);
  assert.equal((await anon.get('/api/world/players/nobody')).status, 404);
});

test('news: feed articles keep their source, link, image and date; a broken feed does not break the page', async () => {
  const list = (await anon.get('/api/world/news')).json;
  const fide = list.items.find((a) => a.title === 'FIDE announces new rules'); assert.ok(fide, 'the feed was read'); assert.equal(fide.source, 'Mock Chess'); assert.equal(fide.sourceUrl, 'https://example.org/a1'); assert.equal(fide.publishedAt, '2026-11-10T10:00:00.000Z'); assert.equal(fide.category, 'fide'); assert.equal(fide.image, 'https://img.example/a1.jpg'); assert.equal(fide.origin, 'feed');
  assert.equal(list.items.find((a) => a.title === 'Uzbek grandmaster wins').image, 'https://img.example/a2.jpg', 'the first image of the article body is used');
  assert.ok(list.items.some((a) => a.category === 'rookery'), 'built-in articles are always there');
  const art = (await anon.get(`/api/world/news/${fide.id}`)).json; assert.equal(art.origin, 'feed'); assert.match(art.summary, /council approved changes/); assert.ok(!/<p>|<b>/.test(art.summary), 'only text of the source is kept'); assert.equal(art.body, '');
  assert.equal((await anon.get('/api/world/news?category=fide')).json.items.every((a) => a.category === 'fide'), true);
  assert.equal((await anon.get('/api/world/news?q=uzbek')).json.items.length, 1);
  // a second read adds nothing new (articles are de-duplicated by the feed entry id)
  const sync = (await admin.post(`/api/admin/world/sources/${mock.sourceId}/sync`, {})).json; assert.equal(sync.report[0].ok, true); assert.equal(sync.report[0].added, 0);
  mock.down = true; try { const bad = (await admin.post(`/api/admin/world/sources/${mock.sourceId}/sync`, {})).json; assert.equal(bad.report[0].ok, true, 'the stored copy of the feed is used'); assert.equal(bad.report[0].stale, true); assert.equal((await anon.get('/api/world/news')).status, 200); } finally { mock.down = false; }
  const cats = (await anon.get('/api/world/categories?lang=uz')).json.categories; assert.ok(cats.some((c) => c.slug === 'uzbekistan' && c.name === "O'zbekiston"));
  assert.equal((await admin.post('/api/admin/world/sources', { name: 'Bad', url: 'ftp://x.example/feed' })).status, 400);
});

test('upstream failure: stored data keeps being served, and the home page still answers', async () => {
  mock.down = true;
  try {
    const live = await anon.get('/api/world/events?status=completed'); assert.equal(live.status, 200); assert.equal(live.json.total, 1);
    assert.equal((await anon.get('/api/world/home')).status, 200);
    const pl = await anon.get('/api/world/players/magnus-carlsen'); assert.equal(pl.status, 200);
  } finally { mock.down = false; }
});

test('broadcasts: official embeds only, derived from the stored reference; clear states; admin validation', async () => {
  assert.equal((await anon.get('/api/world/broadcasts')).json.featured, null, 'nothing is shown while no broadcast has been added');
  assert.equal((await admin.post('/api/admin/world/broadcasts', { title: 'Bad', provider: 'youtube_live', ref: 'not-a-channel' })).status, 400);
  assert.equal((await admin.post('/api/admin/world/broadcasts', { title: 'Bad', provider: 'link', ref: 'http://insecure.example' })).status, 400);
  const ch = 'UC' + 'a'.repeat(22);
  const created = await admin.post('/api/admin/world/broadcasts', { title: 'Mock Open live', provider: 'youtube_live', ref: `https://www.youtube.com/channel/${ch}`, channel_name: 'Mock Chess', starts_at: iso(T0 - 3600000), ends_at: iso(T0 + 3600000), featured: true });
  assert.equal(created.status, 201); assert.equal(created.json.ref, ch);
  const rec = await admin.post('/api/admin/world/broadcasts', { title: 'Old round', provider: 'youtube_video', ref: 'https://youtu.be/dQw4w9WgXcQ', starts_at: iso(T0 - 86400000 * 3), ends_at: iso(T0 - 86400000 * 3 + 7200000) });
  assert.equal(rec.status, 201); assert.equal(rec.json.ref, 'dQw4w9WgXcQ');
  const up = await admin.post('/api/admin/world/broadcasts', { title: 'Next one', provider: 'twitch', ref: 'chesschannel', starts_at: iso(T0 + 86400000) }); assert.equal(up.status, 201);
  const d = (await anon.get('/api/world/broadcasts?host=example.org')).json;
  assert.equal(d.featured.title, 'Mock Open live'); assert.equal(d.featured.status, 'live'); assert.equal(d.featured.embed.url, `https://www.youtube-nocookie.com/embed/live_stream?channel=${ch}`);
  assert.equal(d.upcoming.length, 1); assert.match(d.upcoming[0].embed.url, /^https:\/\/player\.twitch\.tv\/\?channel=chesschannel&parent=example\.org/);
  assert.equal(d.archive.length, 1); assert.equal(d.archive[0].embed.url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  const home = (await anon.get('/api/world/home')).json; assert.equal(home.featuredBroadcast.title, 'Mock Open live');
});

test('admin: tournaments with validation, provisional flag, correction of a feed event kept after a refresh, audit history, permissions', async () => {
  const bad = await admin.post('/api/admin/world/events', { name: 'x', starts_on: 'nonsense' }); assert.equal(bad.status, 400); assert.ok(bad.json.details.some((d) => d.path === 'name'));
  assert.equal((await admin.post('/api/admin/world/events', { name: 'Reversed', starts_on: iso(T0 + 2e9), ends_on: iso(T0) })).status, 400);
  const mk = await admin.post('/api/admin/world/events', { name: 'Tashkent Open 2027', level: 'national', location: 'Tashkent, Uzbekistan', starts_on: iso(T0 + 86400000 * 40), ends_on: iso(T0 + 86400000 * 46), format: '9-round Swiss', prize: '10,000 USD', confirmed: false, schedule: [{ name: 'Round 1', startsAt: iso(T0 + 86400000 * 40) }] });
  assert.equal(mk.status, 201); assert.equal(mk.json.confirmed, 0); assert.equal(mk.json.origin, 'admin');
  const list = (await anon.get('/api/world/events?status=upcoming&level=national')).json; assert.equal(list.total, 1); assert.equal(list.events[0].confirmed, 0, 'provisional schedules are marked');
  const detail = (await anon.get(`/api/world/events/${mk.json.id}`)).json; assert.equal(detail.event.schedule.length, 1); assert.equal(detail.event.prize, '10,000 USD');
  // correct an event that came from the feed: the correction survives the next refresh
  const feedEv = (await anon.get('/api/world/events?status=completed')).json.events[0];
  assert.equal((await admin.put(`/api/admin/world/events/${feedEv.id}`, { location: 'Samarkand, Uzbekistan' })).status, 200);
  assert.equal((await admin.post('/api/admin/world/refresh', { pages: 1 })).status, 200);
  assert.equal((await admin.get(`/api/admin/world/events/${feedEv.id}`)).json.location, 'Samarkand, Uzbekistan', 'a corrected entry is not overwritten by the feed');
  assert.equal((await admin.del(`/api/admin/world/events/${feedEv.id}?confirm=${feedEv.id}`)).status, 409, 'feed events are corrected, not deleted');
  const hist = (await admin.get(`/api/admin/world/history?entity=world_event&id=${feedEv.id}`)).json.items; assert.equal(hist[0].action, 'world.event.update'); assert.equal(hist[0].detail.changes.location.to, 'Samarkand, Uzbekistan');
  const viewer = client(srv.base); assert.equal((await viewer.login('vera', 'Viewer-Passw0rd#1')).status, 200);
  assert.equal((await viewer.get('/api/admin/world/events')).status, 200); assert.equal((await viewer.post('/api/admin/world/events', { name: 'Nope nope' })).status, 403, 'viewers cannot write');
  assert.equal((await anon.post('/api/admin/world/events', { name: 'Nope nope' })).status, 401);
  assert.equal((await admin.del(`/api/admin/world/events/${mk.json.id}`)).status, 400, 'deleting needs confirmation'); assert.equal((await admin.del(`/api/admin/world/events/${mk.json.id}?confirm=${mk.json.id}`)).status, 200);
});

test('admin: correct and feature a game; sources and categories; players with source-bound ranking', async () => {
  const g = (await anon.get('/api/world/games?player=Beta')).json.games[0];
  assert.equal((await admin.put(`/api/admin/world/games/${g.id}`, { result: 'x' })).status, 400);
  assert.equal((await admin.put(`/api/admin/world/games/${g.id}`, { featured: true })).status, 200);
  assert.ok((await anon.get('/api/world/home')).json.featuredGames.some((x) => x.id === g.id));
  const fix = await admin.put(`/api/admin/world/games/${g.id}`, { result: '1/2-1/2' }); assert.equal(fix.json.locked, 1);
  await admin.post('/api/admin/world/refresh', {}); await anon.get(`/api/world/events/${g.event_id}`);
  assert.equal((await anon.get(`/api/world/games/${g.id}`)).json.game.result, '1/2-1/2', 'a corrected game is kept');
  assert.equal((await admin.get(`/api/admin/world/history?entity=world_game&id=${g.id}`)).json.items[0].action, 'world.game.correct');
  // categories
  assert.equal((await admin.put('/api/admin/world/categories/rapid-news', { name_en: 'Rapid', name_uz: 'Rapid', name_ru: 'Рапид', sort: 20 })).status, 200);
  assert.equal((await admin.put('/api/admin/world/categories/Bad Key', { name_en: 'x' })).status, 400); assert.equal((await admin.del('/api/admin/world/categories/international?confirm=international')).status, 409);
  // players: a ranking needs its official source
  assert.equal((await admin.post('/api/admin/world/players', { name: 'Test Player', fide_id: 1, world_rank: 5 })).status, 400);
  const np = await admin.post('/api/admin/world/players', { name: 'Test Player', fide_id: 1, country: 'UZB', world_rank: 5, rank_source: 'FIDE list, November 2026', achievements: [{ text: 'National champion', year: 2025, sourceUrl: 'https://example.org/champ' }], bio_uz: 'Qisqa tarjimai hol.' });
  assert.equal(np.status, 201);
  const prof = (await anon.get('/api/world/players/test-player?lang=uz')).json; assert.equal(prof.worldRank, 5); assert.equal(prof.rankSource, 'FIDE list, November 2026'); assert.equal(prof.bio, 'Qisqa tarjimai hol.'); assert.equal(prof.achievements[0].year, 2025);
  // news editor accepts source, image and category
  const art = await admin.post('/api/admin/news', { title: 'Uzbek success', summary: 's', body: '<p>Great</p>', status: 'published', category: 'uzbekistan', source_name: 'Federation', source_url: 'https://example.org/a', image: 'https://img.example/a.jpg' });
  assert.equal(art.status, 201); assert.equal((await admin.post('/api/admin/news', { title: 'Bad image', body: '<p>x</p>', image: 'http://insecure/x.jpg' })).status, 400);
  const news = (await anon.get('/api/world/news?category=uzbekistan')).json.items; assert.equal(news[0].source, 'Federation'); assert.equal(news[0].image, 'https://img.example/a.jpg');
  const art2 = (await anon.get(`/api/world/news/${art.json.id}`)).json; assert.match(art2.body, /Great/); assert.equal(art2.sourceUrl, 'https://example.org/a');
  const home = (await anon.get('/api/world/home')).json; assert.equal(home.uzbekistan.news.length, 1); assert.ok(home.uzbekistan.events.length >= 1);
});

test('search finds players, tournaments, games, news, countries and broadcasts', async () => {
  const s = (await anon.get('/api/world/search?q=alpha')).json; assert.ok(s.games.length >= 2);
  assert.ok((await anon.get('/api/world/search?q=carlsen')).json.players.length === 1);
  assert.ok((await anon.get('/api/world/search?q=mock')).json.events.length >= 1);
  assert.ok((await anon.get('/api/world/search?q=uzbek')).json.countries.some((c) => c.fed === 'UZB'));
  assert.ok((await anon.get('/api/world/search?q=Mock%20Open%20live')).json.broadcasts.length === 1);
  assert.equal((await anon.get('/api/world/search?q=a')).status, 400);
});
