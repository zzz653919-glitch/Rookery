// Administration of Chess World: events, broadcasts, news sources, categories, players, featured games, manual refresh and history.
import { getDb, now } from '../db.mjs';
import { HttpError, bad } from '../http.mjs';
import { audit } from '../security.mjs';
import { paging, like, mustConfirm } from './util.mjs';
import * as W from '../world.mjs';
import { config } from '../config.mjs';

// every successful write is audited and may change what the Chess World pages show
const auditW = async (...a) => { W.touch(); return audit(...a); };
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const url = (v, { https = false } = {}) => { const s = String(v ?? '').trim(); return (https ? /^https:\/\//i : /^https?:\/\//i).test(s) && s.length < 500 && !/[\s"'<>]/.test(s) ? s : null; };
const isoOrNull = (v) => { if (v == null || v === '') return null; const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : undefined; };
const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
const diff = (a, b, keys) => { const out = {}; for (const k of keys) if (String(a?.[k] ?? '') !== String(b?.[k] ?? '')) out[k] = { from: a?.[k] ?? null, to: b?.[k] ?? null }; return out; };
const probs = (list) => { if (list.length) throw bad('Please fix the highlighted fields.', list); };

const EVENT_KEYS = ['name', 'level', 'country', 'location', 'starts_on', 'ends_on', 'format', 'tc', 'fide_tc', 'prize', 'registration_url', 'website', 'standings_url', 'image', 'players_text', 'schedule', 'confirmed', 'status_override', 'featured', 'source_name', 'source_url'];
function eventInput(b, cur = {}) {
  const P = []; const v = { ...cur };
  const set = (k, val) => { v[k] = val; };
  if ('name' in b || !cur.id) { const n = clean(b.name, 160); if (n.length < 3) P.push({ path: 'name', message: 'Use at least 3 characters.' }); set('name', n); }
  if ('level' in b) { if (b.level && !['international', 'continental', 'national', 'online'].includes(b.level)) P.push({ path: 'level', message: 'Choose a level from the list.' }); set('level', b.level || null); }
  for (const k of ['country', 'location', 'format', 'tc', 'prize', 'players_text', 'source_name']) if (k in b) set(k, clean(b[k], k === 'players_text' ? 400 : 200) || null);
  if ('fide_tc' in b) { if (b.fide_tc && !['standard', 'rapid', 'blitz'].includes(b.fide_tc)) P.push({ path: 'fide_tc', message: 'Choose a time control from the list.' }); set('fide_tc', b.fide_tc || null); }
  for (const k of ['starts_on', 'ends_on']) if (k in b) { const t = isoOrNull(b[k]); if (t === undefined) P.push({ path: k, message: 'Use a valid date.' }); else set(k, t); }
  for (const k of ['registration_url', 'website', 'standings_url', 'source_url']) if (k in b) { if (b[k] && !url(b[k])) P.push({ path: k, message: 'Use a full web address.' }); set(k, b[k] ? url(b[k]) : null); }
  if ('image' in b) { if (b.image && !url(b.image, { https: true })) P.push({ path: 'image', message: 'Use an https address.' }); set('image', b.image ? url(b.image, { https: true }) : null); }
  if ('confirmed' in b) set('confirmed', b.confirmed ? 1 : 0);
  if ('featured' in b) set('featured', b.featured ? 1 : 0);
  if ('status_override' in b) { if (b.status_override && !['upcoming', 'live', 'completed'].includes(b.status_override)) P.push({ path: 'status_override', message: 'Choose a status from the list.' }); set('status_override', b.status_override || null); }
  if ('schedule' in b) {
    const arr = Array.isArray(b.schedule) ? b.schedule : []; const out = [];
    for (const [i, r] of arr.slice(0, 40).entries()) { const t = isoOrNull(r?.startsAt); if (t === undefined || !clean(r?.name, 80)) { P.push({ path: 'schedule', message: `Day ${i + 1}: give a name and a valid time.` }); break; } out.push({ name: clean(r.name, 80), startsAt: t, ...(r.finishedAt ? { finishedAt: isoOrNull(r.finishedAt) } : {}) }); }
    set('schedule', JSON.stringify(out));
  }
  if (v.starts_on && v.ends_on && Date.parse(v.ends_on) < Date.parse(v.starts_on)) P.push({ path: 'ends_on', message: 'The end must come after the start.' });
  probs(P); return v;
}

const BROADCAST_PROVIDERS = ['youtube_live', 'youtube_video', 'twitch', 'lichess', 'link'];
function refFrom(provider, raw) {
  const s = String(raw || '').trim();
  if (provider === 'youtube_live') { const m = /(UC[\w-]{22})/.exec(s); return m ? m[1] : null; }
  if (provider === 'youtube_video') { const m = /(?:v=|youtu\.be\/|embed\/|live\/)([\w-]{11})/.exec(s) || /^([\w-]{11})$/.exec(s); return m ? m[1] : null; }
  if (provider === 'twitch') { const m = /(?:twitch\.tv\/)?(\w{3,25})\/?$/.exec(s); return m ? m[1] : null; }
  if (provider === 'lichess') { const m = /([A-Za-z0-9]{8})\/?(?:embed)?$/.exec(s); return m ? m[1] : null; }
  if (provider === 'link') return url(s, { https: true });
  return null;
}
function broadcastInput(b, cur = {}) {
  const P = []; const v = { ...cur };
  if ('title' in b || !cur.id) { const t = clean(b.title, 160); if (t.length < 3) P.push({ path: 'title', message: 'Use at least 3 characters.' }); v.title = t; }
  if ('provider' in b || !cur.id) { if (!BROADCAST_PROVIDERS.includes(b.provider)) P.push({ path: 'provider', message: 'Choose a provider from the list.' }); else v.provider = b.provider; }
  if ('ref' in b || !cur.id) { const r = refFrom(v.provider, b.ref); if (!r) P.push({ path: 'ref', message: v.provider === 'youtube_live' ? 'Paste the channel id (starts with UC) or a channel link.' : v.provider === 'youtube_video' ? 'Paste the video link or its 11-character id.' : v.provider === 'twitch' ? 'Paste the channel name or link.' : v.provider === 'lichess' ? 'Paste the Lichess round link.' : 'Use a full https address.' }); else v.ref = r; }
  for (const k of ['description', 'commentary']) if (k in b) v[k] = clean(b[k], 1000);
  for (const k of ['channel_name', 'language']) if (k in b) v[k] = clean(b[k], 80) || null;
  if ('official_url' in b) { if (b.official_url && !url(b.official_url, { https: true })) P.push({ path: 'official_url', message: 'Use an https address.' }); v.official_url = b.official_url ? url(b.official_url, { https: true }) : null; }
  for (const k of ['starts_at', 'ends_at']) if (k in b) { const t = isoOrNull(b[k]); if (t === undefined) P.push({ path: k, message: 'Use a valid date.' }); else v[k] = t; }
  if ('event_id' in b) v.event_id = +b.event_id > 0 ? +b.event_id : null;
  if ('status_override' in b) { if (b.status_override && !['upcoming', 'live', 'completed'].includes(b.status_override)) P.push({ path: 'status_override', message: 'Choose a status from the list.' }); v.status_override = b.status_override || null; }
  if ('featured' in b) v.featured = b.featured ? 1 : 0;
  if ('official' in b) v.official = b.official ? 1 : 0;
  if (v.starts_at && v.ends_at && Date.parse(v.ends_at) < Date.parse(v.starts_at)) P.push({ path: 'ends_at', message: 'The end must come after the start.' });
  probs(P); return v;
}

export function register(router) {
  const R = { auth: true, perm: 'content:read' }, Wr = { auth: true, perm: 'content:write' };
  const d = () => getDb();

  // ------------------------------------------------------------------ events
  router.add('GET', '/api/admin/world/events', async (ctx) => {
    const { page, pageSize, offset } = paging(ctx.query, { def: 25 }); const where = [], args = [];
    if (ctx.query.q) { where.push("name LIKE ? ESCAPE '\\'"); args.push(like(ctx.query.q)); }
    if (ctx.query.origin === 'admin' || ctx.query.origin === 'lichess') { where.push('origin = ?'); args.push(ctx.query.origin); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = (await d().prepare(`SELECT count(*) n FROM world_events ${w}`).get(...args)).n;
    const rows = await d().prepare(`SELECT * FROM world_events ${w} ORDER BY starts_on DESC LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
    return { items: rows.map((e) => { const x = W.parseEvent(e); delete x.schedule; x.games = 0; return x; }), total, page, pageSize };
  }, R);
  router.add('GET', '/api/admin/world/events/:id', async (ctx) => { const e = await d().prepare('SELECT * FROM world_events WHERE id = ?').get(+ctx.params.id || 0); if (!e) throw new HttpError(404, 'Event not found.'); return W.parseEvent(e); }, R);
  router.add('POST', '/api/admin/world/events', async (ctx) => {
    const v = eventInput(await ctx.json()); const slug = `${slugify(v.name)}-${Date.now().toString(36)}`;
    const r = await d().prepare(`INSERT INTO world_events(slug, name, level, country, location, starts_on, ends_on, format, tc, fide_tc, prize, registration_url, website, standings_url, image, players_text, schedule, confirmed, status_override, featured, source_name, source_url, origin, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(slug, v.name, v.level ?? null, v.country ?? null, v.location ?? null, v.starts_on ?? null, v.ends_on ?? null, v.format ?? null, v.tc ?? null, v.fide_tc ?? null, v.prize ?? null, v.registration_url ?? null, v.website ?? null, v.standings_url ?? null, v.image ?? null, v.players_text ?? null, v.schedule ?? '[]', v.confirmed ?? 1, v.status_override ?? null, v.featured ?? 0, v.source_name ?? null, v.source_url ?? null, 'admin', now(), now());
    await auditW(ctx, 'world.event.create', 'world_event', r.lastInsertRowid, { name: v.name });
    return { status: 201, body: W.parseEvent(await d().prepare('SELECT * FROM world_events WHERE id = ?').get(r.lastInsertRowid)) };
  }, Wr);
  router.add('PUT', '/api/admin/world/events/:id', async (ctx) => {
    const cur = await d().prepare('SELECT * FROM world_events WHERE id = ?').get(+ctx.params.id || 0); if (!cur) throw new HttpError(404, 'Event not found.');
    const b = await ctx.json(); const v = eventInput(b, cur); const lock = cur.origin === 'lichess' ? 1 : cur.locked;
    await d().prepare(`UPDATE world_events SET name=?, level=?, country=?, location=?, starts_on=?, ends_on=?, format=?, tc=?, fide_tc=?, prize=?, registration_url=?, website=?, standings_url=?, image=?, players_text=?, schedule=?, confirmed=?, status_override=?, featured=?, source_name=?, source_url=?, locked=?, updated_at=? WHERE id = ?`)
      .run(v.name, v.level ?? null, v.country ?? null, v.location ?? null, v.starts_on ?? null, v.ends_on ?? null, v.format ?? null, v.tc ?? null, v.fide_tc ?? null, v.prize ?? null, v.registration_url ?? null, v.website ?? null, v.standings_url ?? null, v.image ?? null, v.players_text ?? null, v.schedule ?? '[]', v.confirmed ?? 1, v.status_override ?? null, v.featured ?? 0, v.source_name ?? null, v.source_url ?? null, lock, now(), cur.id);
    await auditW(ctx, 'world.event.update', 'world_event', cur.id, { name: v.name, changes: diff(cur, v, EVENT_KEYS) });
    return W.parseEvent(await d().prepare('SELECT * FROM world_events WHERE id = ?').get(cur.id));
  }, Wr);
  router.add('DELETE', '/api/admin/world/events/:id', async (ctx) => {
    mustConfirm(ctx.query, ctx.params.id); const id = +ctx.params.id || 0;
    const cur = await d().prepare('SELECT * FROM world_events WHERE id = ?').get(id); if (!cur) throw new HttpError(404, 'Event not found.');
    if (cur.origin !== 'admin') throw new HttpError(409, 'Events imported from a feed cannot be deleted; correct them instead.');
    await d().prepare('DELETE FROM world_games WHERE event_id = ?').run(id); await d().prepare('DELETE FROM world_events WHERE id = ?').run(id);
    await auditW(ctx, 'world.event.delete', 'world_event', id, { name: cur.name }); return { ok: true };
  }, Wr);
  router.add('POST', '/api/admin/world/events/:id/sync', async (ctx) => {
    const id = +ctx.params.id || 0; if (!(await d().prepare('SELECT 1 FROM world_events WHERE id = ?').get(id))) throw new HttpError(404, 'Event not found.');
    try { const r = await W.syncEvent(id, { maxRounds: 4 }); await auditW(ctx, 'world.event.sync', 'world_event', id, r); return r; } catch (e) { throw new HttpError(e.status || 502, e.message); }
  }, Wr);

  // ------------------------------------------------------------------ games: featured matches and corrections
  router.add('GET', '/api/admin/world/games', async (ctx) => {
    const { page, pageSize, offset } = paging(ctx.query, { def: 25 }); const where = [], args = [];
    if (ctx.query.q) { where.push("(g.white LIKE ? ESCAPE '\\' OR g.black LIKE ? ESCAPE '\\')"); args.push(like(ctx.query.q), like(ctx.query.q)); }
    if (ctx.query.featured === '1') where.push('g.featured = 1');
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = (await d().prepare(`SELECT count(*) n FROM world_games g ${w}`).get(...args)).n;
    const items = await d().prepare(`SELECT g.id, g.event_id, g.round_name, g.white, g.black, g.result, g.played_on, g.featured, g.locked, e.name AS event_name FROM world_games g JOIN world_events e ON e.id = g.event_id ${w} ORDER BY g.id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
    return { items, total, page, pageSize };
  }, R);
  router.add('PUT', '/api/admin/world/games/:id', async (ctx) => {
    const cur = await d().prepare('SELECT id, white, black, result, opening, featured FROM world_games WHERE id = ?').get(+ctx.params.id || 0); if (!cur) throw new HttpError(404, 'Game not found.');
    const b = await ctx.json(); const P = []; const v = { ...cur };
    if ('result' in b) { if (!['1-0', '0-1', '1/2-1/2', '*'].includes(b.result)) P.push({ path: 'result', message: 'Choose a result from the list.' }); else v.result = b.result; }
    for (const k of ['white', 'black']) if (k in b) { const n = clean(b[k], 80); if (n.length < 2) P.push({ path: k, message: 'Use at least 2 characters.' }); else v[k] = n; }
    if ('opening' in b) v.opening = clean(b.opening, 120) || null;
    if ('featured' in b) v.featured = b.featured ? 1 : 0;
    probs(P);
    const corrected = ['result', 'white', 'black', 'opening'].some((k) => String(cur[k] ?? '') !== String(v[k] ?? ''));
    await d().prepare('UPDATE world_games SET white=?, black=?, result=?, opening=?, featured=?, locked = CASE WHEN ? THEN 1 ELSE locked END WHERE id = ?').run(v.white, v.black, v.result, v.opening, v.featured, corrected ? 1 : 0, cur.id);
    await auditW(ctx, corrected ? 'world.game.correct' : 'world.game.feature', 'world_game', cur.id, { changes: diff(cur, v, ['white', 'black', 'result', 'opening', 'featured']) });
    return d().prepare('SELECT id, white, black, result, opening, featured, locked FROM world_games WHERE id = ?').get(cur.id);
  }, Wr);

  // ------------------------------------------------------------------ broadcasts
  router.add('GET', '/api/admin/world/broadcasts', async () => ({ items: (await d().prepare('SELECT * FROM world_broadcasts ORDER BY coalesce(starts_at, created_at) DESC LIMIT 200').all()).map((b) => ({ ...b, status: W.broadcastStatus(b) })) }), R);
  router.add('POST', '/api/admin/world/broadcasts', async (ctx) => {
    const v = broadcastInput(await ctx.json());
    const r = await d().prepare('INSERT INTO world_broadcasts(title, description, provider, ref, channel_name, official_url, language, event_id, starts_at, ends_at, status_override, featured, official, commentary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(v.title, v.description ?? '', v.provider, v.ref, v.channel_name ?? null, v.official_url ?? null, v.language ?? null, v.event_id ?? null, v.starts_at ?? null, v.ends_at ?? null, v.status_override ?? null, v.featured ?? 0, v.official ?? 1, v.commentary ?? '', now(), now());
    await auditW(ctx, 'world.broadcast.create', 'world_broadcast', r.lastInsertRowid, { title: v.title, provider: v.provider });
    return { status: 201, body: await d().prepare('SELECT * FROM world_broadcasts WHERE id = ?').get(r.lastInsertRowid) };
  }, Wr);
  router.add('PUT', '/api/admin/world/broadcasts/:id', async (ctx) => {
    const cur = await d().prepare('SELECT * FROM world_broadcasts WHERE id = ?').get(+ctx.params.id || 0); if (!cur) throw new HttpError(404, 'Broadcast not found.');
    const b = await ctx.json(); const v = broadcastInput({ provider: cur.provider, ...b }, cur);
    await d().prepare('UPDATE world_broadcasts SET title=?, description=?, provider=?, ref=?, channel_name=?, official_url=?, language=?, event_id=?, starts_at=?, ends_at=?, status_override=?, featured=?, official=?, commentary=?, updated_at=? WHERE id = ?')
      .run(v.title, v.description ?? '', v.provider, v.ref, v.channel_name ?? null, v.official_url ?? null, v.language ?? null, v.event_id ?? null, v.starts_at ?? null, v.ends_at ?? null, v.status_override ?? null, v.featured ?? 0, v.official ?? 1, v.commentary ?? '', now(), cur.id);
    await auditW(ctx, 'world.broadcast.update', 'world_broadcast', cur.id, { title: v.title, changes: diff(cur, v, ['title', 'provider', 'ref', 'starts_at', 'ends_at', 'status_override', 'featured', 'official', 'channel_name']) });
    return d().prepare('SELECT * FROM world_broadcasts WHERE id = ?').get(cur.id);
  }, Wr);
  router.add('DELETE', '/api/admin/world/broadcasts/:id', async (ctx) => {
    mustConfirm(ctx.query, ctx.params.id); const r = await d().prepare('DELETE FROM world_broadcasts WHERE id = ?').run(+ctx.params.id || 0);
    if (!r.changes) throw new HttpError(404, 'Broadcast not found.'); await auditW(ctx, 'world.broadcast.delete', 'world_broadcast', ctx.params.id); return { ok: true };
  }, Wr);

  // ------------------------------------------------------------------ sources and categories
  const sourceInput = (b, cur = {}) => {
    const P = []; const v = { ...cur };
    if ('name' in b || !cur.id) { const n = clean(b.name, 80); if (n.length < 2) P.push({ path: 'name', message: 'Use at least 2 characters.' }); v.name = n; }
    if ('url' in b || !cur.id) { const u = url(b.url, { https: !config.worldAllowLocal }); if (!u) P.push({ path: 'url', message: 'Use a full https feed address.' }); else { try { W.checkUrl(u); } catch (e) { P.push({ path: 'url', message: e.message }); } v.url = u; } }
    if ('category' in b) v.category = /^[a-z][a-z0-9-]{1,30}$/.test(b.category || '') ? b.category : 'international';
    if ('lang' in b) v.lang = ['en', 'uz', 'ru'].includes(b.lang) ? b.lang : 'en';
    if ('official' in b) v.official = b.official ? 1 : 0;
    if ('enabled' in b) v.enabled = b.enabled ? 1 : 0;
    if ('note' in b) v.note = clean(b.note, 300);
    probs(P); return v;
  };
  router.add('GET', '/api/admin/world/sources', async () => ({ items: await d().prepare('SELECT * FROM world_sources ORDER BY id').all() }), R);
  router.add('POST', '/api/admin/world/sources', async (ctx) => {
    const v = sourceInput(await ctx.json());
    const r = await d().prepare('INSERT INTO world_sources(name, url, category, lang, official, enabled, note, created_at) VALUES (?,?,?,?,?,?,?,?)').run(v.name, v.url, v.category ?? 'international', v.lang ?? 'en', v.official ?? 0, v.enabled ?? 0, v.note ?? '', now());
    await auditW(ctx, 'world.source.create', 'world_source', r.lastInsertRowid, { name: v.name, url: v.url });
    return { status: 201, body: await d().prepare('SELECT * FROM world_sources WHERE id = ?').get(r.lastInsertRowid) };
  }, Wr);
  router.add('PUT', '/api/admin/world/sources/:id', async (ctx) => {
    const cur = await d().prepare('SELECT * FROM world_sources WHERE id = ?').get(+ctx.params.id || 0); if (!cur) throw new HttpError(404, 'Source not found.');
    const v = sourceInput(await ctx.json(), cur);
    await d().prepare('UPDATE world_sources SET name=?, url=?, category=?, lang=?, official=?, enabled=?, note=? WHERE id = ?').run(v.name, v.url, v.category, v.lang, v.official, v.enabled, v.note ?? '', cur.id);
    await auditW(ctx, 'world.source.update', 'world_source', cur.id, { name: v.name, changes: diff(cur, v, ['name', 'url', 'category', 'lang', 'official', 'enabled']) });
    return d().prepare('SELECT * FROM world_sources WHERE id = ?').get(cur.id);
  }, Wr);
  router.add('DELETE', '/api/admin/world/sources/:id', async (ctx) => {
    mustConfirm(ctx.query, ctx.params.id); const r = await d().prepare('DELETE FROM world_sources WHERE id = ?').run(+ctx.params.id || 0);
    if (!r.changes) throw new HttpError(404, 'Source not found.'); await auditW(ctx, 'world.source.delete', 'world_source', ctx.params.id); return { ok: true };
  }, Wr);
  router.add('POST', '/api/admin/world/sources/:id/sync', async (ctx) => {
    const id = +ctx.params.id || 0; if (!(await d().prepare('SELECT 1 FROM world_sources WHERE id = ?').get(id))) throw new HttpError(404, 'Source not found.');
    const r = await W.syncSources({ force: true, only: id }); await auditW(ctx, 'world.source.sync', 'world_source', id, r.report?.[0] || {}); return r;
  }, Wr);

  router.add('GET', '/api/admin/world/categories', async () => ({ items: await d().prepare('SELECT * FROM world_categories ORDER BY sort, slug').all() }), R);
  router.add('PUT', '/api/admin/world/categories/:slug', async (ctx) => {
    const slug = String(ctx.params.slug); if (!/^[a-z][a-z0-9-]{1,30}$/.test(slug)) throw bad('Use lower-case letters, digits and dashes.');
    const b = await ctx.json(); const P = []; const names = {};
    for (const l of ['en', 'uz', 'ru']) { names[l] = clean(b[`name_${l}`], 60); if (names[l].length < 2) P.push({ path: `name_${l}`, message: 'Use at least 2 characters.' }); }
    probs(P); const sort = Math.max(0, Math.min(99, parseInt(b.sort, 10) || 50));
    await d().prepare('INSERT INTO world_categories(slug, name_en, name_uz, name_ru, sort) VALUES (?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name_en = excluded.name_en, name_uz = excluded.name_uz, name_ru = excluded.name_ru, sort = excluded.sort').run(slug, names.en, names.uz, names.ru, sort);
    await auditW(ctx, 'world.category.save', 'world_category', slug, names); return d().prepare('SELECT * FROM world_categories WHERE slug = ?').get(slug);
  }, Wr);
  router.add('DELETE', '/api/admin/world/categories/:slug', async (ctx) => {
    mustConfirm(ctx.query, ctx.params.slug); const slug = ctx.params.slug;
    if (['international', 'rookery'].includes(slug)) throw new HttpError(409, 'This category is built in.');
    await d().prepare("UPDATE news SET category = 'international' WHERE category = ?").run(slug); await d().prepare("UPDATE world_sources SET category = 'international' WHERE category = ?").run(slug);
    const r = await d().prepare('DELETE FROM world_categories WHERE slug = ?').run(slug); if (!r.changes) throw new HttpError(404, 'Category not found.');
    await auditW(ctx, 'world.category.delete', 'world_category', slug); return { ok: true };
  }, Wr);

  // ------------------------------------------------------------------ players
  router.add('GET', '/api/admin/world/players', async () => ({ items: await d().prepare('SELECT * FROM world_players ORDER BY sort, name').all() }), R);
  const playerInput = (b, cur = {}) => {
    const P = []; const v = { ...cur };
    if ('name' in b || !cur.slug) { const n = clean(b.name, 80); if (n.length < 3) P.push({ path: 'name', message: 'Use at least 3 characters.' }); v.name = n; }
    if ('fide_id' in b) { const n = parseInt(b.fide_id, 10); if (b.fide_id && !(n > 0)) P.push({ path: 'fide_id', message: 'Use the numeric FIDE id.' }); v.fide_id = b.fide_id ? n : null; }
    if ('country' in b) { const c = String(b.country || '').toUpperCase(); if (c && !/^[A-Z]{3}$/.test(c)) P.push({ path: 'country', message: 'Use the 3-letter federation code.' }); v.country = c || null; }
    if ('wiki_title' in b) v.wiki_title = clean(b.wiki_title, 120).replace(/\s+/g, '_') || null;
    if ('chesscom' in b) v.chesscom = /^[\w-]{3,40}$/.test(b.chesscom || '') ? b.chesscom : null;
    for (const l of ['en', 'uz', 'ru']) if (`bio_${l}` in b) v[`bio_${l}`] = clean(b[`bio_${l}`], 3000);
    if ('achievements' in b) {
      const arr = Array.isArray(b.achievements) ? b.achievements : []; const out = [];
      for (const a of arr.slice(0, 30)) { const text = clean(a?.text, 240); if (!text) continue; out.push({ text, ...(parseInt(a.year, 10) ? { year: parseInt(a.year, 10) } : {}), ...(url(a.sourceUrl) ? { sourceUrl: url(a.sourceUrl) } : {}) }); }
      v.achievements = JSON.stringify(out);
    }
    if ('world_rank' in b) { const n = parseInt(b.world_rank, 10); v.world_rank = n > 0 ? n : null; if (v.world_rank && !clean(b.rank_source, 160)) P.push({ path: 'rank_source', message: 'Name the official list the ranking comes from.' }); }
    if ('rank_source' in b) v.rank_source = clean(b.rank_source, 160) || null;
    if ('featured' in b) v.featured = b.featured ? 1 : 0;
    if ('sort' in b) v.sort = Math.max(0, Math.min(999, parseInt(b.sort, 10) || 0));
    probs(P); return v;
  };
  router.add('POST', '/api/admin/world/players', async (ctx) => {
    const v = playerInput(await ctx.json()); const slug = slugify(v.name);
    if (await d().prepare('SELECT 1 FROM world_players WHERE slug = ?').get(slug)) throw new HttpError(409, 'A player with this name already exists.');
    await d().prepare('INSERT INTO world_players(slug, name, fide_id, country, wiki_title, chesscom, bio_en, bio_uz, bio_ru, achievements, world_rank, rank_source, featured, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(slug, v.name, v.fide_id ?? null, v.country ?? null, v.wiki_title ?? null, v.chesscom ?? null, v.bio_en ?? '', v.bio_uz ?? '', v.bio_ru ?? '', v.achievements ?? '[]', v.world_rank ?? null, v.rank_source ?? null, v.featured ?? 0, v.sort ?? 100, now(), now());
    await auditW(ctx, 'world.player.create', 'world_player', slug, { name: v.name }); return { status: 201, body: await d().prepare('SELECT * FROM world_players WHERE slug = ?').get(slug) };
  }, Wr);
  router.add('PUT', '/api/admin/world/players/:slug', async (ctx) => {
    const cur = await d().prepare('SELECT * FROM world_players WHERE slug = ?').get(ctx.params.slug); if (!cur) throw new HttpError(404, 'Player not found.');
    const v = playerInput(await ctx.json(), cur);
    await d().prepare('UPDATE world_players SET name=?, fide_id=?, country=?, wiki_title=?, chesscom=?, bio_en=?, bio_uz=?, bio_ru=?, achievements=?, world_rank=?, rank_source=?, featured=?, sort=?, updated_at=? WHERE slug = ?')
      .run(v.name, v.fide_id, v.country, v.wiki_title, v.chesscom, v.bio_en, v.bio_uz, v.bio_ru, v.achievements, v.world_rank, v.rank_source, v.featured, v.sort, now(), cur.slug);
    await auditW(ctx, 'world.player.update', 'world_player', cur.slug, { changes: diff(cur, v, ['name', 'fide_id', 'country', 'wiki_title', 'bio_en', 'bio_uz', 'bio_ru', 'achievements', 'world_rank', 'rank_source', 'featured']) });
    return d().prepare('SELECT * FROM world_players WHERE slug = ?').get(cur.slug);
  }, Wr);
  router.add('DELETE', '/api/admin/world/players/:slug', async (ctx) => {
    mustConfirm(ctx.query, ctx.params.slug); const r = await d().prepare('DELETE FROM world_players WHERE slug = ?').run(ctx.params.slug);
    if (!r.changes) throw new HttpError(404, 'Player not found.'); await auditW(ctx, 'world.player.delete', 'world_player', ctx.params.slug); return { ok: true };
  }, Wr);

  // ------------------------------------------------------------------ refresh and history
  router.add('POST', '/api/admin/world/refresh', async (ctx) => {
    const b = await ctx.json().catch(() => ({})); const pages = Math.max(1, Math.min(5, parseInt(b.pages, 10) || 1)); const out = {};
    try { out.events = await W.refreshTop({ pages, force: true }); } catch (e) { out.events = { error: e.message }; }
    try { out.sources = await W.syncSources({ force: true }); } catch (e) { out.sources = { error: e.message }; }
    await auditW(ctx, 'world.refresh', 'world', null, { pages }); return out;
  }, Wr);
  router.add('GET', '/api/admin/world/history', async (ctx) => {
    const entity = String(ctx.query.entity || ''); if (!/^world_?[a-z]*$/.test(entity)) throw bad('Unknown entity.');
    const rows = await d().prepare('SELECT ts, username, action, entity_id, detail FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 50').all(entity, String(ctx.query.id || ''));
    return { items: rows.map((r) => ({ ts: r.ts, username: r.username, action: r.action, detail: (() => { try { return JSON.parse(r.detail); } catch { return r.detail; } })() })) };
  }, { auth: true, perm: 'audit:read' });
  router.add('GET', '/api/admin/world/overview', async () => {
    const n = async (sql, ...a) => (await d().prepare(sql).get(...a)).n;
    return { events: await n('SELECT count(*) n FROM world_events'), games: await n('SELECT count(*) n FROM world_games'), live: await n('SELECT count(*) n FROM world_events WHERE live = 1'), articles: await n("SELECT count(*) n FROM news WHERE origin = 'feed'"), broadcasts: await n('SELECT count(*) n FROM world_broadcasts'), enabled: (await import('../config.mjs')).config.worldEnabled };
  }, R);
}
