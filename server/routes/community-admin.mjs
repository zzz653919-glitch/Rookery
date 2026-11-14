// Administration of players, moderation reports, news and tournaments.
import { getDb, now } from '../db.mjs';
import { HttpError, bad } from '../http.mjs';
import { audit, hashPassword } from '../security.mjs';
import { playerPasswordProblems, destroyUserSessions, ratingsOf } from '../accounts.mjs';
import { sanitizeHtml } from '../validate.mjs';
import { categoryOf } from '../rating.mjs';
import { TIME_CONTROLS } from '../games.mjs';
import { paging, like, mustConfirm } from './util.mjs';

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const playerRow = (u) => ({ id: u.id, username: u.username, country: u.country, createdAt: u.created_at, lastSeenAt: u.last_seen_at, banned: !!u.banned, banReason: u.ban_reason, muted: !!u.muted });

export function register(router) {
  // ------------------------------------------------------------------ players
  router.add('GET', '/api/admin/players', async (ctx) => {
    const { page, pageSize, offset } = paging(ctx.query, { def: 20 });
    const where = [], args = [];
    if (ctx.query.q) { where.push("username LIKE ? ESCAPE '\\'"); args.push(like(ctx.query.q)); }
    if (ctx.query.status === 'banned') where.push('banned = 1'); else if (ctx.query.status === 'muted') where.push('muted = 1');
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const d = getDb();
    const total = (await d.prepare(`SELECT count(*) n FROM users ${w}`).get(...args)).n;
    const rows = await d.prepare(`SELECT * FROM users ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
    const items = [];
    for (const u of rows) { const r = await ratingsOf(u.id); items.push({ ...playerRow(u), games: Object.values(r).reduce((a, x) => a + x.games, 0), rating: Math.max(...['bullet', 'blitz', 'rapid', 'classical'].map((c) => r[c].rating)) }); }
    return { items, total, page, pageSize };
  }, { auth: true, perm: 'players:read' });

  router.add('GET', '/api/admin/players/:id', async (ctx) => {
    const d = getDb();
    const u = await d.prepare('SELECT * FROM users WHERE id = ?').get(+ctx.params.id || 0);
    if (!u) throw new HttpError(404, 'Player not found.');
    const games = await d.prepare("SELECT id, kind, category, status, result, reason, created_at FROM games WHERE white_id = ? OR black_id = ? ORDER BY created_at DESC LIMIT 15").all(u.id, u.id);
    const reports = await d.prepare("SELECT r.id, r.reason, r.status, r.created_at, ur.username AS reporter FROM reports r JOIN users ur ON ur.id = r.reporter_id WHERE r.target_id = ? ORDER BY r.id DESC LIMIT 15").all(u.id);
    return { player: playerRow(u), ratings: await ratingsOf(u.id), games, reports };
  }, { auth: true, perm: 'players:read' });

  router.add('PUT', '/api/admin/players/:id', async (ctx) => {
    const d = getDb();
    const u = await d.prepare('SELECT * FROM users WHERE id = ?').get(+ctx.params.id || 0);
    if (!u) throw new HttpError(404, 'Player not found.');
    const b = await ctx.json();
    const up = {};
    if (b.banned !== undefined) { up.banned = b.banned ? 1 : 0; up.ban_reason = b.banned ? clean(b.banReason, 200) : ''; }
    if (b.muted !== undefined) up.muted = b.muted ? 1 : 0;
    const keys = Object.keys(up);
    if (!keys.length) throw bad('Nothing to change.');
    await d.prepare(`UPDATE users SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map((k) => up[k]), u.id);
    if (up.banned) { await destroyUserSessions(u.id); await d.prepare("UPDATE games SET status = 'finished', result = CASE WHEN white_id = ? THEN '0-1' ELSE '1-0' END, reason = 'banned', ended_at = ? WHERE status = 'active' AND (white_id = ? OR black_id = ?) AND json_array_length(moves) >= 2").run(u.id, now(), u.id, u.id); }
    await audit(ctx, 'player.update', 'player', u.id, { username: u.username, ...up });
    return playerRow(await d.prepare('SELECT * FROM users WHERE id = ?').get(u.id));
  }, { auth: true, perm: 'players:write' });

  router.add('POST', '/api/admin/players/:id/password', async (ctx) => {
    const d = getDb();
    const u = await d.prepare('SELECT * FROM users WHERE id = ?').get(+ctx.params.id || 0);
    if (!u) throw new HttpError(404, 'Player not found.');
    const { password } = await ctx.json();
    const problems = playerPasswordProblems(password, u.username);
    if (problems.length) throw bad('The password is not strong enough.', problems.map((m) => ({ path: 'password', message: m })));
    await d.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), u.id);
    await destroyUserSessions(u.id);
    await audit(ctx, 'player.passwordReset', 'player', u.id, { username: u.username });
    return { ok: true };
  }, { auth: true, perm: 'players:write' });

  router.add('GET', '/api/admin/platform-stats', async () => {
    const d = getDb();
    const n = async (sql, ...a) => (await d.prepare(sql).get(...a)).n;
    const day = new Date(Date.now() - 86400000).toISOString(), week = new Date(Date.now() - 7 * 86400000).toISOString();
    return {
      players: { total: await n('SELECT count(*) n FROM users'), new7: await n('SELECT count(*) n FROM users WHERE created_at > ?', week), online: await n('SELECT count(*) n FROM users WHERE last_seen_at > ?', new Date(Date.now() - 5 * 60000).toISOString()), banned: await n('SELECT count(*) n FROM users WHERE banned = 1') },
      games: { total: await n("SELECT count(*) n FROM games WHERE status = 'finished'"), today: await n("SELECT count(*) n FROM games WHERE created_at > ? AND status != 'waiting'", day), live: await n("SELECT count(*) n FROM games WHERE status = 'active'"), rated: await n("SELECT count(*) n FROM games WHERE status = 'finished' AND kind = 'rated'") },
      reports: { open: await n("SELECT count(*) n FROM reports WHERE status = 'open'") },
      tournaments: { running: await n("SELECT count(*) n FROM tournaments WHERE status != 'cancelled' AND starts_at <= ? AND ends_at > ?", now(), now()), upcoming: await n("SELECT count(*) n FROM tournaments WHERE status != 'cancelled' AND starts_at > ?", now()) },
      visits: { today: await n("SELECT count(*) n FROM events WHERE type = 'visit' AND ts > ?", day), week: await n("SELECT count(*) n FROM events WHERE type = 'visit' AND ts > ?", week), visitors7: await n("SELECT count(DISTINCT anon) n FROM events WHERE type = 'visit' AND ts > ?", week) },
      news: await n("SELECT count(*) n FROM news WHERE status = 'published'"),
    };
  }, { auth: true, perm: 'dashboard:read' });

  // ------------------------------------------------------------------ reports
  router.add('GET', '/api/admin/reports', async (ctx) => {
    const { page, pageSize, offset } = paging(ctx.query, { def: 20 });
    const status = ['open', 'resolved', 'dismissed'].includes(ctx.query.status) ? ctx.query.status : null;
    const d = getDb();
    const total = (await d.prepare(`SELECT count(*) n FROM reports ${status ? 'WHERE status = ?' : ''}`).get(...(status ? [status] : []))).n;
    const items = await d.prepare(`SELECT r.*, ur.username AS reporter, ut.username AS target FROM reports r JOIN users ur ON ur.id = r.reporter_id JOIN users ut ON ut.id = r.target_id ${status ? 'WHERE r.status = ?' : ''} ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT ? OFFSET ?`).all(...(status ? [status] : []), pageSize, offset);
    return { items: items.map((r) => ({ id: r.id, reporter: r.reporter, target: r.target, targetId: r.target_id, gameId: r.game_id, reason: r.reason, detail: r.detail, status: r.status, createdAt: r.created_at, handledBy: r.handled_by, handledAt: r.handled_at, note: r.note })), total, page, pageSize };
  }, { auth: true, perm: 'players:read' });

  router.add('PUT', '/api/admin/reports/:id', async (ctx) => {
    const d = getDb();
    const r = await d.prepare('SELECT * FROM reports WHERE id = ?').get(+ctx.params.id || 0);
    if (!r) throw new HttpError(404, 'Report not found.');
    const b = await ctx.json();
    if (!['resolved', 'dismissed'].includes(b.status)) throw bad('Choose resolved or dismissed.');
    if (b.action === 'ban') { await d.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?').run(clean(b.note, 200) || 'Violation of the rules', r.target_id); await destroyUserSessions(r.target_id); }
    else if (b.action === 'mute') await d.prepare('UPDATE users SET muted = 1 WHERE id = ?').run(r.target_id);
    else if (b.action && b.action !== 'none') throw bad('Unknown action.');
    await d.prepare('UPDATE reports SET status = ?, handled_by = ?, handled_at = ?, note = ? WHERE id = ?').run(b.status, ctx.admin.username, now(), clean(b.note, 300), r.id);
    await audit(ctx, 'report.' + b.status, 'report', r.id, { action: b.action || 'none', target: r.target_id });
    return { ok: true };
  }, { auth: true, perm: 'players:write' });

  // ------------------------------------------------------------------ news
  const newsInput = (b) => {
    const title = clean(b.title, 140), summary = clean(b.summary, 300), body = sanitizeHtml(typeof b.body === 'string' ? b.body.trim().slice(0, 20000) : '');
    const problems = [];
    if (title.length < 3) problems.push({ path: 'title', message: 'Use at least 3 characters.' });
    if (!body && b.origin !== 'feed') problems.push({ path: 'body', message: 'This field is required.' });
    if (b.image && !/^https:\/\//.test(String(b.image))) problems.push({ path: 'image', message: 'Use an https address.' });
    if (problems.length) throw bad('Please fix the highlighted fields.', problems);
    const image = /^https:\/\/[^\s"'<>]{4,400}$/.test(String(b.image || '').trim()) ? String(b.image).trim() : null;
    const source_url = /^https?:\/\/[^\s"'<>]{4,400}$/.test(String(b.source_url || '').trim()) ? String(b.source_url).trim() : null;
    const source_name = clean(b.source_name, 80) || null, lang = ['en', 'uz', 'ru'].includes(b.lang) ? b.lang : 'en';
    const category = /^[a-z][a-z0-9-]{1,30}$/.test(b.category || '') ? b.category : 'international';
    return { title, summary, body, image, source_url, source_name, lang, category };
  };
  router.add('GET', '/api/admin/news', async () => ({ items: await getDb().prepare('SELECT id, title, summary, status, author, created_at, published_at, updated_at FROM news ORDER BY id DESC LIMIT 100').all() }), { auth: true, perm: 'content:read' });
  router.add('GET', '/api/admin/news/:id', async (ctx) => { const n = await getDb().prepare('SELECT * FROM news WHERE id = ?').get(+ctx.params.id || 0); if (!n) throw new HttpError(404, 'Article not found.'); return n; }, { auth: true, perm: 'content:read' });
  router.add('POST', '/api/admin/news', async (ctx) => {
    const b = await ctx.json(); const v = newsInput(b);
    const status = b.status === 'published' ? 'published' : 'draft';
    const r = await getDb().prepare('INSERT INTO news(title, summary, body, status, author, created_at, published_at, updated_at, image, source_name, source_url, category, lang) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(v.title, v.summary, v.body, status, ctx.admin.username, now(), status === 'published' ? now() : null, now(), v.image, v.source_name, v.source_url, v.category, v.lang);
    await audit(ctx, 'news.create', 'news', r.lastInsertRowid, { title: v.title, status });
    return { status: 201, body: await getDb().prepare('SELECT * FROM news WHERE id = ?').get(r.lastInsertRowid) };
  }, { auth: true, perm: 'content:write' });
  router.add('PUT', '/api/admin/news/:id', async (ctx) => {
    const d = getDb(); const cur = await d.prepare('SELECT * FROM news WHERE id = ?').get(+ctx.params.id || 0);
    if (!cur) throw new HttpError(404, 'Article not found.');
    const b = await ctx.json(); const v = newsInput({ ...cur, ...b });
    const status = b.status === 'published' || b.status === 'draft' ? b.status : cur.status;
    await d.prepare('UPDATE news SET title = ?, summary = ?, body = ?, status = ?, published_at = ?, updated_at = ?, image = ?, source_name = ?, source_url = ?, category = ?, lang = ? WHERE id = ?').run(v.title, v.summary, v.body, status, status === 'published' ? (cur.published_at || now()) : cur.published_at, now(), v.image, v.source_name, v.source_url, v.category, v.lang, cur.id);
    await audit(ctx, 'news.update', 'news', cur.id, { title: v.title, status });
    return await d.prepare('SELECT * FROM news WHERE id = ?').get(cur.id);
  }, { auth: true, perm: 'content:write' });
  router.add('DELETE', '/api/admin/news/:id', async (ctx) => {
    mustConfirm(ctx.query, ctx.params.id);
    const r = await getDb().prepare('DELETE FROM news WHERE id = ?').run(+ctx.params.id || 0);
    if (!r.changes) throw new HttpError(404, 'Article not found.');
    await audit(ctx, 'news.delete', 'news', ctx.params.id);
    return { ok: true };
  }, { auth: true, perm: 'content:write' });

  // ------------------------------------------------------------------ tournaments
  const tInput = (b) => {
    const problems = [];
    const name = clean(b.name, 80), description = clean(b.description, 400);
    if (name.length < 3) problems.push({ path: 'name', message: 'Use at least 3 characters.' });
    const base = Math.round(+b.base), inc = Math.round(+b.inc);
    if (!TIME_CONTROLS.some(([x, y]) => x === base && y === inc)) problems.push({ path: 'base', message: 'Choose one of the offered time controls.' });
    const start = Date.parse(b.startsAt), minutes = Math.round(+b.durationMin);
    if (!Number.isFinite(start)) problems.push({ path: 'startsAt', message: 'Enter a valid start time.' });
    if (!(minutes >= 10 && minutes <= 720)) problems.push({ path: 'durationMin', message: 'Duration: 10 to 720 minutes.' });
    if (problems.length) throw bad('Please fix the highlighted fields.', problems);
    return { name, description, base_ms: base * 1000, inc_ms: inc * 1000, category: categoryOf(base * 1000, inc * 1000), starts_at: new Date(start).toISOString(), ends_at: new Date(start + minutes * 60000).toISOString() };
  };
  const tRow = (t) => ({ id: t.id, name: t.name, description: t.description, base: t.base_ms / 1000, inc: t.inc_ms / 1000, category: t.category, startsAt: t.starts_at, endsAt: t.ends_at, durationMin: Math.round((Date.parse(t.ends_at) - Date.parse(t.starts_at)) / 60000), status: t.status });
  router.add('GET', '/api/admin/tournaments', async () => ({ items: (await getDb().prepare('SELECT t.*, (SELECT count(*) FROM tournament_players p WHERE p.tournament_id = t.id) AS players FROM tournaments t ORDER BY starts_at DESC LIMIT 100').all()).map((t) => ({ ...tRow(t), players: t.players })), controls: TIME_CONTROLS }), { auth: true, perm: 'content:read' });
  router.add('POST', '/api/admin/tournaments', async (ctx) => {
    const v = tInput(await ctx.json());
    const r = await getDb().prepare('INSERT INTO tournaments(name, description, base_ms, inc_ms, category, starts_at, ends_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(v.name, v.description, v.base_ms, v.inc_ms, v.category, v.starts_at, v.ends_at, ctx.admin.username, now());
    await audit(ctx, 'tournament.create', 'tournament', r.lastInsertRowid, { name: v.name });
    return { status: 201, body: tRow(await getDb().prepare('SELECT * FROM tournaments WHERE id = ?').get(r.lastInsertRowid)) };
  }, { auth: true, perm: 'content:write' });
  router.add('PUT', '/api/admin/tournaments/:id', async (ctx) => {
    const d = getDb(); const cur = await d.prepare('SELECT * FROM tournaments WHERE id = ?').get(+ctx.params.id || 0);
    if (!cur) throw new HttpError(404, 'Tournament not found.');
    const b = await ctx.json();
    if (b.status === 'cancelled' || b.status === 'scheduled') { await d.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run(b.status, cur.id); await audit(ctx, 'tournament.' + b.status, 'tournament', cur.id); return tRow(await d.prepare('SELECT * FROM tournaments WHERE id = ?').get(cur.id)); }
    if (Date.parse(cur.starts_at) <= Date.now()) throw new HttpError(409, 'A tournament that has started can only be cancelled.');
    const v = tInput({ ...tRow(cur), ...b });
    await d.prepare('UPDATE tournaments SET name = ?, description = ?, base_ms = ?, inc_ms = ?, category = ?, starts_at = ?, ends_at = ? WHERE id = ?').run(v.name, v.description, v.base_ms, v.inc_ms, v.category, v.starts_at, v.ends_at, cur.id);
    await audit(ctx, 'tournament.update', 'tournament', cur.id, { name: v.name });
    return tRow(await d.prepare('SELECT * FROM tournaments WHERE id = ?').get(cur.id));
  }, { auth: true, perm: 'content:write' });
}
