// Chess World data layer: cached access to the public Lichess broadcast API, FIDE ratings (served by Lichess), Wikipedia and RSS/Atom
// feeds; import of broadcast games into the database; standings, statistics and live rounds. Nothing here invents data: every value
// comes from an upstream response or from an administrator, and every failure degrades to what is already stored.
import { getDb, now } from './db.mjs';
import { config } from './config.mjs';
import { splitGames, headersOf, movesOf, normResult, asInt, dateOf } from './pgn.mjs';
import { parseFeed } from './feeds.mjs';
import { Chess } from '../js/chess/rules.js';
import { FIDE_TO_ISO2, countryName } from '../js/data/countries.js';

const UA = 'RookeryChess/1.0 (+https://rookery-play.vercel.app; chess news and broadcast reader)';
export class WorldError extends Error { constructor(m, status = 502) { super(m); this.status = status; } }

// ------------------------------------------------------------------------------------------------ safe upstream access
const PRIVATE = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f:]*\]?|\[?fe80[0-9a-f:]*\]?)$/i;
export function checkUrl(u) {
  let x; try { x = new URL(u); } catch { throw new WorldError('Invalid address.', 400); }
  if (x.protocol !== 'https:' && x.protocol !== 'http:') throw new WorldError('Only http(s) addresses are allowed.', 400);
  if (!config.worldAllowLocal && (PRIVATE.test(x.hostname) || x.protocol === 'http:')) throw new WorldError('Use a public https address.', 400);
  return x;
}
const mem = new Map();            // url -> { body, at }   (short-lived, never persisted: PGN files are large)
const inflight = new Map();
const failedUntil = new Map();

// ttl: how long a stored answer is considered fresh. A failed request falls back to the last stored answer (stale: true).
export async function upstream(url, { ttl = 300000, accept = 'application/json', timeout = 12000, persist = true, force = false } = {}) {
  if (!config.worldEnabled) throw new WorldError('Live data is switched off on this server.', 503);
  checkUrl(url);
  const d = getDb();
  const row = persist ? await d.prepare('SELECT body, fetched_at, status FROM world_cache WHERE key = ?').get(url) : (mem.has(url) ? { body: mem.get(url).body, fetched_at: mem.get(url).at, status: 200 } : null);
  const age = row ? Date.now() - row.fetched_at : Infinity;
  if (row && row.status === 200 && age < ttl && !force) return { body: row.body, stale: false, at: row.fetched_at };
  if ((failedUntil.get(url) || 0) > Date.now()) { if (row?.status === 200) return { body: row.body, stale: true, at: row.fetched_at }; throw new WorldError('The data source is not answering right now.'); }
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeout);
      let res; try { res = await fetch(url, { headers: { 'user-agent': UA, accept }, signal: ctl.signal, redirect: 'follow' }); } finally { clearTimeout(timer); }
      if (res.status === 429) { failedUntil.set(url, Date.now() + 90000); throw new WorldError('The data source asked us to slow down.'); }
      if (!res.ok) throw new WorldError(`The data source answered ${res.status}.`);
      const len = +res.headers.get('content-length') || 0; if (len > 8 * 1024 * 1024) throw new WorldError('The answer is too large.');
      const body = await res.text(); if (body.length > 8 * 1024 * 1024) throw new WorldError('The answer is too large.');
      const at = Date.now();
      if (persist) await d.prepare('INSERT INTO world_cache(key, body, fetched_at, status) VALUES (?,?,?,200) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, status = 200').run(url, body, at);
      else { mem.set(url, { body, at }); if (mem.size > 60) mem.delete(mem.keys().next().value); }
      return { body, stale: false, at };
    } catch (e) {
      failedUntil.set(url, Date.now() + 30000);
      if (row?.status === 200) return { body: row.body, stale: true, at: row.fetched_at, error: e.message };
      throw e instanceof WorldError ? e : new WorldError(e.name === 'AbortError' ? 'The data source did not answer in time.' : 'The data source is unreachable.');
    } finally { inflight.delete(url); }
  })();
  inflight.set(url, p);
  return p;
}
const J = (r) => { try { return JSON.parse(r.body); } catch { throw new WorldError('The data source sent something unreadable.'); } };

// ------------------------------------------------------------------------------------------------ status helpers
export function eventStatus(e, t = Date.now()) {
  if (e.status_override) return e.status_override;
  if (e.live) return 'live';
  const s = e.starts_on ? Date.parse(e.starts_on) : NaN, en = e.ends_on ? Date.parse(e.ends_on) : NaN;
  if (e.remote_state === 'past') return 'completed';
  if (e.remote_state === 'active') return Number.isFinite(s) && t < s ? 'upcoming' : 'live';
  if (e.remote_state === 'upcoming') return 'upcoming';
  if (Number.isFinite(en) && t > en + 12 * 3600000) return 'completed';
  if (Number.isFinite(s) && t >= s) return 'live';
  return 'upcoming';
}
export function broadcastStatus(b, t = Date.now()) {
  if (b.status_override) return b.status_override;
  const s = b.starts_at ? Date.parse(b.starts_at) : NaN, en = b.ends_at ? Date.parse(b.ends_at) : NaN;
  if (Number.isFinite(en) && t > en) return 'completed';
  if (Number.isFinite(s) && t >= s) return 'live';
  return Number.isFinite(s) ? 'upcoming' : 'upcoming';
}
const levelOf = (name) => /\b(world|olympiad|candidates|grand prix|grand swiss|fide)\b/i.test(name) ? 'international' : /\b(european|asian|african|pan[- ]?american|continental|zonal|americas|arab)\b/i.test(name) ? 'continental' : null;
// a round the feed still marks as ongoing long after it started is not shown as live
const roundLive = (r) => !!r?.ongoing && (!r.startsAt || Date.now() - r.startsAt < 36 * 3600000);
const iso = (ms) => (Number.isFinite(+ms) && +ms > 0 ? new Date(+ms).toISOString() : null);
const fideTc = (info) => (['standard', 'rapid', 'blitz'].includes(info?.fideTC) ? info.fideTC : null);

// ------------------------------------------------------------------------------------------------ Lichess broadcasts
const LI = () => config.lichessUrl;
const EVENT_COLS = ['slug', 'name', 'level', 'location', 'starts_on', 'ends_on', 'format', 'tc', 'website', 'standings_url', 'image', 'players_text', 'tier', 'fide_tc', 'source_name', 'source_url', 'origin', 'lichess_id', 'live', 'live_round_id', 'remote_state', 'confirmed', 'created_at', 'updated_at'];
function eventFromTour(tour, round, state) {
  const info = tour.info || {}; const d = tour.dates || [];
  const starts = iso(d[0]) || iso(round?.startsAt), ends = iso(d[1]);
  return {
    slug: `${String(tour.slug || 'event').slice(0, 80)}-${tour.id}`, name: String(tour.name || 'Broadcast').slice(0, 200), level: levelOf(tour.name || ''), location: info.location ? String(info.location).slice(0, 120) : null,
    starts_on: starts, ends_on: ends, format: info.format || null, tc: info.tc || null, website: /^https?:\/\//.test(info.website || '') ? info.website : null, standings_url: /^https?:\/\//.test(info.standings || '') ? info.standings : null,
    image: tour.image || null, players_text: info.players || null, tier: Number.isFinite(tour.tier) ? tour.tier : null, fide_tc: fideTc(info),
    source_name: 'Lichess Broadcasts', source_url: tour.url || null, origin: 'lichess', lichess_id: tour.id,
    live: roundLive(round) ? 1 : 0, live_round_id: roundLive(round) ? round.id : null, remote_state: state, confirmed: 1, created_at: now(), updated_at: now(),
  };
}
async function upsertEvents(list) {
  const d = getDb();
  for (let i = 0; i < list.length; i += 15) {
    const chunk = list.slice(i, i + 15);
    const ph = '(' + EVENT_COLS.map(() => '?').join(',') + ')';
    // fields an administrator has corrected (locked = 1) are kept; only the live state follows the feed
    const set = EVENT_COLS.filter((c) => !['slug', 'lichess_id', 'created_at', 'origin'].includes(c)).map((c) => ['live', 'live_round_id', 'remote_state', 'updated_at'].includes(c) ? `${c} = excluded.${c}` : `${c} = CASE WHEN world_events.locked = 1 THEN world_events.${c} ELSE excluded.${c} END`).join(', ');
    await d.prepare(`INSERT INTO world_events(${EVENT_COLS.join(',')}) VALUES ${chunk.map(() => ph).join(',')} ON CONFLICT(lichess_id) DO UPDATE SET ${set}`).run(...chunk.flatMap((e) => EVENT_COLS.map((c) => e[c])));
  }
}

let topAt = 0;
// Refresh the list of current, upcoming and recent official broadcasts (one cheap request, cached for 2 minutes).
export async function refreshTop({ pages = 1, force = false } = {}) {
  const items = [];
  for (let p = 1; p <= pages; p++) {
    const r = await upstream(`${LI()}/api/broadcast/top?page=${p}`, { ttl: p === 1 ? 120000 : 86400000, force: force && p === 1 });
    if (p === 1 && r.at === topAt && !force && pages === 1) return { events: 0, at: r.at, stale: r.stale };
    if (p === 1) topAt = r.at;
    const j = J(r);
    if (p === 1) { for (const it of j.active || []) items.push([it, 'active']); for (const it of j.upcoming || []) items.push([it, 'upcoming']); }
    for (const it of j.past?.currentPageResults || []) items.push([it, 'past']);
    if (!j.past?.nextPage) break;
  }
  const events = items.filter(([it]) => it?.tour?.id).map(([it, st]) => eventFromTour(it.tour, it.round, st));
  await upsertEvents(events);
  return { events: events.length, at: topAt };
}
// Past broadcasts from the archive of official broadcasts that match a search text (used when the local database has nothing yet).
export async function searchArchive(q) {
  const r = await upstream(`${LI()}/api/broadcast/search?q=${encodeURIComponent(q)}`, { ttl: 6 * 3600000 });
  const j = J(r); const events = (j.currentPageResults || []).filter((it) => it?.tour?.id).map((it) => eventFromTour(it.tour, it.round, it.round?.finished === false || it.round?.ongoing ? 'active' : 'past'));
  await upsertEvents(events); return events.length;
}

// ------------------------------------------------------------------------------------------------ importing games
const GAME_COLS = ['event_id', 'ext_id', 'round_name', 'round_id', 'board', 'white', 'black', 'white_elo', 'black_elo', 'white_fide', 'black_fide', 'white_fed', 'black_fed', 'white_title', 'black_title', 'white_team', 'black_team', 'result', 'eco', 'opening', 'plies', 'played_on', 'evals', 'pgn', 'source_url'];
export function gameRow(eventId, round, text, idx) {
  const h = headersOf(text); const { moves, result } = movesOf(text);
  const site = String(h.GameURL || h.Site || ''); const ext = (/\/([A-Za-z0-9]{8})\/?$/.exec(site) || [])[1] || `${round.id}:${h.Round || idx}`;
  const res = normResult(h.Result && h.Result !== '*' ? h.Result : result);
  return {
    event_id: eventId, ext_id: ext, round_name: round.name || (h.Round ? `Round ${String(h.Round).split('.')[0]}` : null), round_id: round.id || null, board: h.Round && String(h.Round).includes('.') ? String(h.Round).split('.')[1] : null,
    white: String(h.White || '?').slice(0, 80), black: String(h.Black || '?').slice(0, 80),
    white_elo: asInt(h.WhiteElo), black_elo: asInt(h.BlackElo), white_fide: asInt(h.WhiteFideId), black_fide: asInt(h.BlackFideId),
    white_fed: h.WhiteFederation || null, black_fed: h.BlackFederation || null, white_title: h.WhiteTitle || null, black_title: h.BlackTitle || null, white_team: h.WhiteTeam || null, black_team: h.BlackTeam || null,
    result: res, eco: h.ECO || null, opening: h.Opening ? String(h.Opening).slice(0, 120) : null, plies: moves.length, played_on: dateOf(h), evals: moves.some((m) => m.eval) ? 1 : 0,
    pgn: text, source_url: /^https?:\/\//.test(site) ? site : null,
  };
}
const seen = new Map(); // ext key -> "plies:result" — skip writes that would change nothing
async function upsertGames(rows) {
  const d = getDb(); const fresh = rows.filter((r) => seen.get(`${r.event_id}:${r.ext_id}`) !== `${r.plies}:${r.result}`);
  for (let i = 0; i < fresh.length; i += 8) {
    const chunk = fresh.slice(i, i + 8); const ph = '(' + GAME_COLS.map(() => '?').join(',') + ')';
    const set = GAME_COLS.filter((c) => !['event_id', 'ext_id'].includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
    await d.prepare(`INSERT INTO world_games(${GAME_COLS.join(',')}) VALUES ${chunk.map(() => ph).join(',')} ON CONFLICT(event_id, ext_id) DO UPDATE SET ${set} WHERE world_games.locked = 0`).run(...chunk.flatMap((r) => GAME_COLS.map((c) => r[c])));
    for (const r of chunk) seen.set(`${r.event_id}:${r.ext_id}`, `${r.plies}:${r.result}`);
  }
  if (seen.size > 20000) seen.clear();
  return fresh.length;
}
export async function importRound(ev, round, { ttl = 600000 } = {}) {
  const r = await upstream(`${LI()}/api/broadcast/round/${encodeURIComponent(round.id)}.pgn`, { ttl, persist: false, accept: 'application/x-chess-pgn', timeout: 20000 });
  const games = splitGames(r.body); const rows = games.map((g, i) => gameRow(ev.id, round, g, i + 1));
  await upsertGames(rows); return rows.length;
}

// Loads the schedule of one event and imports the games of the rounds that have been played (at most maxRounds per call).
export async function syncEvent(id, { maxRounds = 3 } = {}) {
  const d = getDb(); const ev = await d.prepare('SELECT * FROM world_events WHERE id = ?').get(id);
  if (!ev || !ev.lichess_id) return { rounds: 0, done: 0, pending: 0 };
  const done = new Set(JSON.parse(ev.synced_rounds || '[]'));
  const remote = ev.remote_state === 'past';
  const j = J(await upstream(`${LI()}/api/broadcast/${encodeURIComponent(ev.lichess_id)}`, { ttl: remote ? 6 * 3600000 : 60000 }));
  const rounds = (j.rounds || []).map((r) => ({ id: r.id, name: r.name, startsAt: iso(r.startsAt), finishedAt: iso(r.finishedAt), finished: !!r.finished, ongoing: !!r.ongoing, url: r.url }));
  const t = Date.now(); let imported = 0;
  const ongoing = rounds.find((r) => r.ongoing);
  for (const r of rounds) {
    if (imported >= maxRounds) break;
    const started = r.finished || r.ongoing || (r.startsAt && Date.parse(r.startsAt) <= t);
    if (!started) continue;
    if (r.finished && done.has(r.id)) continue;
    try { await importRound(ev, r, { ttl: r.ongoing ? 8000 : 600000 }); imported++; if (r.finished) done.add(r.id); } catch { break; }
  }
  const pending = rounds.filter((r) => (r.finished || r.ongoing) && !done.has(r.id) && !r.ongoing).length;
  const allDone = rounds.length > 0 && rounds.every((r) => r.finished && done.has(r.id));
  const tour = j.tour || {};
  await d.prepare(`UPDATE world_events SET schedule = ?, synced_rounds = ?, synced_at = ?, games_synced = ?, live = ?, live_round_id = ?,
      standings_url = CASE WHEN locked = 1 THEN standings_url ELSE COALESCE(?, standings_url) END, website = CASE WHEN locked = 1 THEN website ELSE COALESCE(?, website) END,
      format = CASE WHEN locked = 1 THEN format ELSE COALESCE(?, format) END, tc = CASE WHEN locked = 1 THEN tc ELSE COALESCE(?, tc) END WHERE id = ?`)
    .run(JSON.stringify(rounds), JSON.stringify([...done]), now(), allDone ? 1 : 0, ongoing ? 1 : 0, ongoing ? ongoing.id : null, tour.info?.standings || null, tour.info?.website || null, tour.info?.format || null, tour.info?.tc || null, id);
  return { rounds: rounds.length, done: done.size, pending };
}

// ------------------------------------------------------------------------------------------------ queries
// "country" filters accept a FIDE code (NOR) or an English name; they match the country of the tournament (its location text)
const NAME_TO_CODE = new Map(Object.keys(FIDE_TO_ISO2).filter((c) => c !== 'FID').map((c) => [countryName(c, 'en').toLowerCase(), c]));
const countryText = (c) => { const x = String(c || '').trim(); return /^[A-Za-z]{3}$/.test(x) && FIDE_TO_ISO2[x.toUpperCase()] ? countryName(x.toUpperCase(), 'en') : x; };
const codeOfLocation = (loc) => { const parts = String(loc || '').split(',').map((x) => x.trim().toLowerCase()); for (let i = parts.length - 1; i >= 0; i--) if (NAME_TO_CODE.has(parts[i])) return NAME_TO_CODE.get(parts[i]); return null; };
export function parseEvent(e) {
  if (!e) return null; const out = { ...e, status: eventStatus(e) };
  try { out.schedule = JSON.parse(e.schedule || '[]'); } catch { out.schedule = []; }
  delete out.synced_rounds; return out;
}
export async function listEvents({ q, status, level, country, year, tc, limit = 60, offset = 0, order } = {}) {
  const d = getDb(); const where = [], args = [];
  if (q) { where.push('(name LIKE ? OR location LIKE ? OR players_text LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (level) { where.push('level = ?'); args.push(level); }
  if (country) { where.push('(location LIKE ? OR country = ?)'); args.push(`%${countryText(country)}%`, String(country).toUpperCase()); }
  if (year) { where.push("substr(starts_on, 1, 4) = ?"); args.push(String(year)); }
  if (tc) { where.push('fide_tc = ?'); args.push(tc); }
  const rows = await d.prepare(`SELECT * FROM world_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY starts_on DESC LIMIT 800`).all(...args);
  let list = rows.map(parseEvent);
  if (status) list = list.filter((e) => e.status === status);
  if (order === 'asc') list.sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));
  else if (order === 'live') list.sort((a, b) => (b.tier || 0) - (a.tier || 0));
  const total = list.length; return { total, events: list.slice(offset, offset + limit).map(({ schedule, ...x }) => x) };
}

export function standingsOf(games) {
  const P = new Map(); const T = new Map();
  const get = (key, name, fed, elo, title) => { let p = P.get(key); if (!p) P.set(key, p = { key, name, fed, elo: elo || null, title: title || null, games: 0, points: 0, wins: 0, draws: 0, losses: 0 }); if (elo && !p.elo) p.elo = elo; return p; };
  for (const g of games) {
    if (g.result === '*') continue;
    const w = get(g.white_fide || g.white, g.white, g.white_fed, g.white_elo, g.white_title), b = get(g.black_fide || g.black, g.black, g.black_fed, g.black_elo, g.black_title);
    w.games++; b.games++;
    const [ws, bs] = g.result === '1-0' ? [1, 0] : g.result === '0-1' ? [0, 1] : [0.5, 0.5];
    w.points += ws; b.points += bs; (ws === 1 ? w.wins++ : ws === 0.5 ? w.draws++ : w.losses++); (bs === 1 ? b.wins++ : bs === 0.5 ? b.draws++ : b.losses++);
    for (const [team, pts] of [[g.white_team, ws], [g.black_team, bs]]) if (team) { const x = T.get(team) || { team, games: 0, points: 0 }; x.games++; x.points += pts; T.set(team, x); }
  }
  const rank = (a) => a.sort((x, y) => y.points - x.points || x.games - y.games || (y.elo || 0) - (x.elo || 0)).map((p, i) => ({ rank: i + 1, ...p }));
  return { players: rank([...P.values()]), teams: rank([...T.values()]) };
}
export function statsOf(games) {
  const done = games.filter((g) => g.result !== '*'); const n = done.length;
  const c = { white: 0, draw: 0, black: 0 }; let plies = 0, longest = null; const op = new Map();
  for (const g of done) {
    if (g.result === '1-0') c.white++; else if (g.result === '0-1') c.black++; else c.draw++;
    plies += g.plies; if (!longest || g.plies > longest.plies) longest = g;
    if (g.eco || g.opening) { const k = `${g.eco || ''}|${g.opening || ''}`; op.set(k, (op.get(k) || 0) + 1); }
  }
  const ratings = done.flatMap((g) => [g.white_elo, g.black_elo]).filter(Boolean);
  return {
    games: n, whiteWins: c.white, draws: c.draw, blackWins: c.black, avgMoves: n ? Math.round(plies / n / 2 * 10) / 10 : null,
    avgRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
    longest: longest ? { id: longest.id, white: longest.white, black: longest.black, moves: Math.ceil(longest.plies / 2) } : null,
    openings: [...op.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, count]) => { const [eco, name] = k.split('|'); return { eco, name, count }; }),
  };
}
const GAME_LIST_COLS = 'g.id, g.event_id, g.round_name, g.board, g.white, g.black, g.white_elo, g.black_elo, g.white_fide, g.black_fide, g.white_fed, g.black_fed, g.white_title, g.black_title, g.white_team, g.black_team, g.result, g.eco, g.opening, g.plies, g.played_on, g.evals';

export async function eventDetail(id, { sync = true } = {}) {
  const d = getDb(); let ev = await d.prepare('SELECT * FROM world_events WHERE id = ?').get(id); if (!ev) return null;
  let syncing = null, notice = null;
  if (sync && ev.lichess_id && config.worldEnabled) {
    const needs = !ev.games_synced || ev.live || (ev.remote_state === 'active' && Date.now() - Date.parse(ev.synced_at || 0) > 60000);
    if (needs && (!ev.synced_at || Date.now() - Date.parse(ev.synced_at) > 5000 || !ev.games_synced)) {
      try { syncing = await syncEvent(id, { maxRounds: ev.live ? 1 : 2 }); } catch (e) { notice = e.message; }
      ev = await d.prepare('SELECT * FROM world_events WHERE id = ?').get(id);
    }
  }
  const games = await d.prepare(`SELECT ${GAME_LIST_COLS} FROM world_games g WHERE g.event_id = ? ORDER BY g.id`).all(id);
  const rounds = new Map(); for (const g of games) { const k = g.round_name || '?'; (rounds.get(k) || rounds.set(k, []).get(k)).push(g); }
  const full = parseEvent(ev); const st = standingsOf(games);
  return { event: full, rounds: [...rounds.entries()].map(([name, list]) => ({ name, games: list })), standings: st.players.slice(0, 200), teams: st.teams.slice(0, 40), stats: statsOf(games), syncing: syncing && syncing.pending > 0 ? syncing : null, notice };
}
export async function podiumOf(eventId) {
  const games = await getDb().prepare('SELECT white, black, white_fide, black_fide, white_fed, black_fed, white_elo, black_elo, white_title, black_title, result FROM world_games WHERE event_id = ?').all(eventId);
  return standingsOf(games).players.slice(0, 3);
}

export async function searchGames({ player, event, eventId, country, year, tc, result, eco, fide, limit = 30, offset = 0 } = {}) {
  const d = getDb(); const where = [], args = [];
  if (player) { where.push('(g.white LIKE ? OR g.black LIKE ?)'); args.push(`%${player}%`, `%${player}%`); }
  if (fide) { where.push('(g.white_fide = ? OR g.black_fide = ?)'); args.push(+fide, +fide); }
  if (event) { where.push('e.name LIKE ?'); args.push(`%${event}%`); }
  if (eventId) { where.push('g.event_id = ?'); args.push(+eventId); }
  if (country) { where.push('(e.location LIKE ? OR e.country = ? OR g.white_fed = ? OR g.black_fed = ?)'); args.push(`%${countryText(country)}%`, String(country).toUpperCase(), String(country).toUpperCase(), String(country).toUpperCase()); }
  if (year) { where.push("(substr(g.played_on, 1, 4) = ? OR (g.played_on IS NULL AND substr(e.starts_on, 1, 4) = ?))"); args.push(String(year), String(year)); }
  if (tc) { where.push('e.fide_tc = ?'); args.push(tc); }
  if (['1-0', '0-1', '1/2-1/2'].includes(result)) { where.push('g.result = ?'); args.push(result); }
  if (eco) { where.push('g.eco LIKE ?'); args.push(`${String(eco).slice(0, 3)}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await d.prepare(`SELECT count(*) n FROM world_games g JOIN world_events e ON e.id = g.event_id ${w}`).get(...args)).n;
  const rows = await d.prepare(`SELECT ${GAME_LIST_COLS}, e.name AS event_name, e.fide_tc FROM world_games g JOIN world_events e ON e.id = g.event_id ${w} ORDER BY g.played_on DESC, g.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  return { total, games: rows };
}
export async function gameById(id) {
  return getDb().prepare('SELECT g.*, e.name AS event_name, e.fide_tc, e.source_url AS event_source FROM world_games g JOIN world_events e ON e.id = g.event_id WHERE g.id = ?').get(id);
}
export function replayInfo(g) {
  const { moves } = movesOf(g.pgn); return moves;
}
export async function facets() {
  const d = getDb();
  const years = (await d.prepare("SELECT DISTINCT substr(played_on, 1, 4) y FROM world_games WHERE played_on IS NOT NULL ORDER BY y DESC").all()).map((r) => r.y);
  const count = new Map(); for (const r of await d.prepare("SELECT location FROM world_events WHERE location IS NOT NULL AND location != ''").all()) { const c = codeOfLocation(r.location); if (c) count.set(c, (count.get(c) || 0) + 1); }
  const feds = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([fed, n]) => ({ fed, n }));
  return { years, federations: feds, counts: { events: (await d.prepare('SELECT count(*) n FROM world_events').get()).n, games: (await d.prepare('SELECT count(*) n FROM world_games').get()).n } };
}

// ------------------------------------------------------------------------------------------------ live rounds
function liveSummary(text, round) {
  const out = [];
  for (const [i, g] of splitGames(text).entries()) {
    const h = headersOf(g); const { moves, result } = movesOf(g); const chess = new Chess(); let last = null, ok = true;
    for (const m of moves) { const mv = chess.move(m.san); if (!mv) { ok = false; break; } last = mv; }
    const res = normResult(h.Result && h.Result !== '*' ? h.Result : result);
    const byColor = { w: null, b: null }; moves.forEach((m, k) => { if (m.clk != null) byColor[k % 2 === 0 ? 'w' : 'b'] = m.clk; });
    if (byColor.w === 0 && byColor.b === 0) { byColor.w = null; byColor.b = null; } // some feeds send 0:00:00 when they have no clocks
    const lastEval = [...moves].reverse().find((m) => m.eval)?.eval || null;
    out.push({
      i, id: (/\/([A-Za-z0-9]{8})\/?$/.exec(String(h.GameURL || h.Site || '')) || [])[1] || `${round.id}:${i + 1}`, board: h.Round && String(h.Round).includes('.') ? String(h.Round).split('.')[1] : String(i + 1),
      white: h.White, black: h.Black, whiteElo: asInt(h.WhiteElo), blackElo: asInt(h.BlackElo), whiteTitle: h.WhiteTitle || null, blackTitle: h.BlackTitle || null, whiteFed: h.WhiteFederation || null, blackFed: h.BlackFederation || null,
      result: res, fen: ok ? chess.fen() : null, turn: ok ? chess.fen().split(' ')[1] : null, plies: moves.length, lastSan: moves.length ? moves[moves.length - 1].san : null,
      lastMove: last ? { from: last.from, to: last.to } : null, clocks: byColor, eval: lastEval, evals: moves.map((m) => m.eval ? (m.eval.mate != null ? (m.eval.mate > 0 ? 1000 : -1000) : m.eval.cp) : null),
      sans: moves.map((m) => m.san), opening: h.Opening || null, eco: h.ECO || null, url: h.GameURL || null,
    });
  }
  return out;
}
// Games of the rounds that are being played right now. Each poll is cached for a few seconds; the games are also stored,
// so standings and results update by themselves.
export async function liveRounds({ limit = 4 } = {}) {
  const d = getDb();
  const evs = (await d.prepare("SELECT * FROM world_events WHERE live = 1 AND live_round_id IS NOT NULL AND (status_override IS NULL OR status_override = 'live') ORDER BY coalesce(tier, 0) DESC, starts_on DESC LIMIT ?").all(limit)).map(parseEvent);
  const out = []; let stale = false;
  for (const e of evs) {
    let round = e.schedule.find((r) => r.id === e.live_round_id);
    if (!round) { try { await syncEvent(e.id, { maxRounds: 0 }); const again = parseEvent(await d.prepare('SELECT * FROM world_events WHERE id = ?').get(e.id)); round = again.schedule.find((r) => r.id === e.live_round_id); } catch { /* the round keeps a generic name */ } }
    round = round || { id: e.live_round_id, name: 'Live round' };
    try {
      const r = await upstream(`${LI()}/api/broadcast/round/${encodeURIComponent(round.id)}.pgn`, { ttl: 6000, persist: false, accept: 'application/x-chess-pgn', timeout: 15000 });
      stale = stale || r.stale;
      const games = liveSummary(r.body, round);
      await upsertGames(splitGames(r.body).map((g, i) => gameRow(e.id, round, g, i + 1))).catch(() => {});
      out.push({ event: { id: e.id, name: e.name, location: e.location, tier: e.tier, image: e.image, source_url: e.source_url }, round: { id: round.id, name: round.name || 'Live round', url: round.url || null }, updatedAt: r.at, stale: r.stale, games });
    } catch (err) { out.push({ event: { id: e.id, name: e.name, location: e.location, tier: e.tier, image: e.image, source_url: e.source_url }, round: { id: round.id, name: round.name || 'Live round' }, error: err.message, games: [] }); }
  }
  return { rounds: out, stale };
}

// ------------------------------------------------------------------------------------------------ players
const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
// the FIDE id is the identity; the name check only guards against a wrong id (one shared word of 4+ letters is enough: "Gukesh D" vs "Gukesh Dommaraju")
export const nameMatches = (a, b) => { const x = normName(a), y = new Set(normName(b)); return x.some((w) => w.length >= 4 && y.has(w)); };
export async function fideInfo(id) {
  try {
    const j = J(await upstream(`${config.fideApiUrl}/${id}`, { ttl: 6 * 3600000 }));
    return j && j.id === +id ? { id: j.id, name: j.name, federation: j.federation, title: j.title || null, standard: j.standard || null, rapid: j.rapid || null, blitz: j.blitz || null, birthYear: j.year || null, photo: j.photo?.medium || null, photoCredit: j.photo?.credit || null } : null;
  } catch { return null; }
}
export async function wikiSummary(title, lang = 'en') {
  if (!title) return null;
  const host = config.wikiUrl || `https://${lang}.wikipedia.org`;
  try {
    const j = J(await upstream(`${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { ttl: 24 * 3600000, timeout: 8000 }));
    if (j.type === 'disambiguation' || !j.extract) return null;
    return { extract: String(j.extract).slice(0, 1600), url: j.content_urls?.desktop?.page || null, thumbnail: j.thumbnail?.source || null, description: j.description || null, lang };
  } catch { return null; }
}
export async function playerProfile(slug, lang = 'en') {
  const d = getDb(); const p = await d.prepare('SELECT * FROM world_players WHERE slug = ?').get(slug); if (!p) return null;
  const [fide, wikiL, wikiEn] = await Promise.all([p.fide_id ? fideInfo(p.fide_id) : null, p.wiki_title && lang !== 'en' ? wikiSummary(p.wiki_title, lang) : null, p.wiki_title ? wikiSummary(p.wiki_title, 'en') : null]);
  const verified = fide && nameMatches(p.name, fide.name) ? fide : null; // never show another person's ratings
  const wiki = wikiL || wikiEn;
  const bioCustom = p[`bio_${lang}`] || p.bio_en || '';
  const where = p.fide_id ? '(g.white_fide = ? OR g.black_fide = ?)' : '(g.white LIKE ? OR g.black LIKE ?)';
  const args = p.fide_id ? [p.fide_id, p.fide_id] : [`%${p.name.split(' ').pop()}%`, `%${p.name.split(' ').pop()}%`];
  const rows = await d.prepare(`SELECT g.id, g.event_id, g.white, g.black, g.white_fide, g.black_fide, g.white_elo, g.black_elo, g.result, g.played_on, g.round_name, g.opening, e.name AS event_name, e.fide_tc FROM world_games g JOIN world_events e ON e.id = g.event_id WHERE ${where} AND g.result != '*' ORDER BY g.played_on DESC, g.id DESC LIMIT 2000`).all(...args);
  const isWhite = (g) => (p.fide_id ? g.white_fide === p.fide_id : g.white.includes(p.name.split(' ').pop()));
  const rec = { games: rows.length, wins: 0, draws: 0, losses: 0 };
  const events = new Map();
  for (const g of rows) {
    const w = isWhite(g); const pts = g.result === '1/2-1/2' ? 0.5 : (g.result === '1-0') === w ? 1 : 0;
    if (pts === 1) rec.wins++; else if (pts === 0.5) rec.draws++; else rec.losses++;
    const ev = events.get(g.event_id) || events.set(g.event_id, { id: g.event_id, name: g.event_name, games: 0, points: 0, date: g.played_on }).get(g.event_id); ev.games++; ev.points += pts;
  }
  let achievements = []; try { achievements = JSON.parse(p.achievements || '[]'); } catch { /* */ }
  return {
    slug: p.slug, name: p.name, country: verified?.federation || p.country, title: verified?.title || null, fideId: p.fide_id,
    ratings: verified ? { standard: verified.standard, rapid: verified.rapid, blitz: verified.blitz } : null, birthYear: verified?.birthYear || null,
    worldRank: p.world_rank || null, rankSource: p.world_rank ? p.rank_source : null,
    photo: verified?.photo ? { url: verified.photo, credit: verified.photoCredit, source: 'FIDE data via Lichess' } : wiki?.thumbnail ? { url: wiki.thumbnail, credit: 'Wikipedia / Wikimedia Commons', source: wiki.url } : null,
    bio: bioCustom || wiki?.extract || '', bioSource: bioCustom ? null : wiki ? { name: `Wikipedia (${wiki.lang})`, url: wiki.url } : null,
    achievements, record: rec, recentGames: rows.slice(0, 12), tournaments: [...events.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30),
    ratingSource: verified ? { name: 'FIDE (via Lichess)', url: `https://ratings.fide.com/profile/${p.fide_id}` } : null,
    dataNote: verified ? null : p.fide_id ? 'FIDE data is not available right now.' : null,
  };
}
export async function listPlayers({ q, featured } = {}) {
  const where = [], args = []; if (q) { where.push('name LIKE ?'); args.push(`%${q}%`); } if (featured) where.push('featured = 1');
  return getDb().prepare(`SELECT slug, name, fide_id, country, featured, world_rank FROM world_players ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort, name LIMIT 200`).all(...args);
}

// ------------------------------------------------------------------------------------------------ news from sources
let feedsAt = 0;
export async function syncSources({ force = false, only = null } = {}) {
  if (!config.worldEnabled) return { fetched: 0 };
  if (!force && !only && Date.now() - feedsAt < 20 * 60000) return { fetched: 0, skipped: true };
  feedsAt = Date.now(); const d = getDb();
  const sources = only ? await d.prepare('SELECT * FROM world_sources WHERE id = ?').all(only) : await d.prepare('SELECT * FROM world_sources WHERE enabled = 1').all();
  let fetched = 0; const report = [];
  for (const s of sources) {
    try {
      const r = await upstream(s.url, { ttl: force ? 0 : 20 * 60000, accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml', timeout: 10000, force });
      const entries = parseFeed(r.body).slice(0, 30); let added = 0;
      for (const e of entries) {
        const ext = `${s.id}:${e.id}`.slice(0, 340);
        const res = await d.prepare(`INSERT INTO news(title, summary, body, status, author, created_at, published_at, updated_at, image, source_name, source_url, category, origin, ext_id, lang)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ext_id) DO NOTHING`).run(e.title, e.summary, '', 'published', s.name, now(), e.published || now(), now(), e.image || null, s.name, e.link, s.category, 'feed', ext, s.lang);
        added += res.changes || 0;
      }
      fetched += added; report.push({ id: s.id, name: s.name, ok: true, added, stale: !!r.stale });
      await d.prepare('UPDATE world_sources SET last_fetch_at = ?, last_status = ?, last_error = ? WHERE id = ?').run(now(), r.stale ? 'stale' : 'ok', r.error || null, s.id);
    } catch (e) {
      report.push({ id: s.id, name: s.name, ok: false, error: e.message });
      await d.prepare('UPDATE world_sources SET last_fetch_at = ?, last_status = ?, last_error = ? WHERE id = ?').run(now(), 'error', String(e.message).slice(0, 200), s.id);
    }
  }
  return { fetched, report };
}

// ------------------------------------------------------------------------------------------------ broadcasts
export function embedOf(b, host = '') {
  const ref = String(b.ref || '');
  if (b.provider === 'youtube_live' && /^UC[\w-]{22}$/.test(ref)) return { url: `https://www.youtube-nocookie.com/embed/live_stream?channel=${ref}`, watch: `https://www.youtube.com/channel/${ref}/live` };
  if (b.provider === 'youtube_video' && /^[\w-]{11}$/.test(ref)) return { url: `https://www.youtube-nocookie.com/embed/${ref}`, watch: `https://www.youtube.com/watch?v=${ref}` };
  if (b.provider === 'twitch' && /^\w{3,25}$/.test(ref)) return { url: host ? `https://player.twitch.tv/?channel=${ref}&parent=${encodeURIComponent(host)}&muted=true` : null, watch: `https://www.twitch.tv/${ref}` };
  if (b.provider === 'lichess' && /^[A-Za-z0-9]{8}$/.test(ref)) return { url: null, watch: `${LI()}/broadcast/-/-/${ref}` };
  if (b.provider === 'link' && /^https:\/\//.test(ref)) return { url: null, watch: ref };
  return { url: null, watch: null };
}

// So that results exist without anyone opening a tournament first: import the games of the latest completed events, a little at a time.
let bootAt = 0;
export async function bootstrapResults() {
  if (!config.worldEnabled || Date.now() - bootAt < 60000) return 0; bootAt = Date.now();
  const d = getDb();
  const rows = await d.prepare("SELECT id FROM world_events WHERE lichess_id IS NOT NULL AND games_synced = 0 AND (remote_state = 'past') AND (synced_at IS NULL OR synced_at < ?) ORDER BY starts_on DESC LIMIT 2").all(new Date(Date.now() - 600000).toISOString());
  let n = 0; for (const r of rows) { try { await syncEvent(r.id, { maxRounds: 3 }); n++; } catch { /* next time */ } }
  return n;
}

// admin edits invalidate the cached home page
export const stamp = { n: 0 };
export const touch = () => { stamp.n++; };
