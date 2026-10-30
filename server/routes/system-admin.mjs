// Dashboard statistics, audit log, administrator accounts and the (honest) user-management overview.
import { readdirSync, statSync } from 'node:fs';
import { getDb, now, dbSize, appliedVersions, getSetting } from '../db.mjs';
import { config } from '../config.mjs';
import { HttpError, bad } from '../http.mjs';
import { hashPassword, passwordProblems, audit, destroyAdminSessions } from '../security.mjs';
import { LEARN_LEVEL_IDS } from '../defaults.mjs';
import { paging, like } from './util.mjs';

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const startedAt = Date.now();

function lastBackup() {
  try {
    const files = readdirSync(config.backupDir).filter((f) => f.endsWith('.db')).map((f) => ({ f, t: statSync(`${config.backupDir}/${f}`).mtimeMs })).sort((a, b) => b.t - a.t);
    return files[0] ? { file: files[0].f, at: new Date(files[0].t).toISOString(), count: files.length } : null;
  } catch { return null; }
}

export function register(router) {
  router.add('GET', '/api/admin/dashboard', () => {
    const d = getDb();
    const n = (sql, ...a) => d.prepare(sql).get(...a).n;
    const lessons = { total: n('SELECT count(*) n FROM lessons'), published: n("SELECT count(*) n FROM lessons WHERE status='published'"), draft: n("SELECT count(*) n FROM lessons WHERE status='draft'") };
    const puzzles = { total: n('SELECT count(*) n FROM puzzles'), published: n("SELECT count(*) n FROM puzzles WHERE status='published'"), draft: n("SELECT count(*) n FROM puzzles WHERE status='draft'") };
    const games = {
      total: n("SELECT count(*) n FROM events WHERE type='game_completed'"),
      last7: n("SELECT count(*) n FROM events WHERE type='game_completed' AND ts > ?", ago(7)),
      byResult: d.prepare("SELECT ref AS result, count(*) n FROM events WHERE type='game_completed' GROUP BY ref").all(),
    };
    const learners = { last7: n('SELECT count(DISTINCT anon) n FROM events WHERE ts > ?', ago(7)), last30: n('SELECT count(DISTINCT anon) n FROM events WHERE ts > ?', ago(30)), all: n('SELECT count(DISTINCT anon) n FROM events') };
    const popular = d.prepare(`SELECT e.ref AS id, coalesce(l.title, e.ref) AS title, l.level AS level,
        sum(e.type = 'lesson_completed') AS completions, sum(e.type = 'lesson_started') AS starts, count(DISTINCT e.anon) AS learners
      FROM events e LEFT JOIN lessons l ON l.id = e.ref WHERE e.type IN ('lesson_started','lesson_completed') GROUP BY e.ref ORDER BY completions DESC, starts DESC LIMIT 8`).all();
    const activity = [
      ...d.prepare("SELECT ts, type, ref, level, value FROM events WHERE type != 'client_error' ORDER BY id DESC LIMIT 12").all().map((e) => ({ ts: e.ts, kind: 'player', type: e.type, ref: e.ref, level: e.level, value: e.value })),
      ...d.prepare('SELECT ts, username, action, entity, entity_id FROM audit_log ORDER BY id DESC LIMIT 12').all().map((a) => ({ ts: a.ts, kind: 'admin', type: a.action, ref: a.entity_id, by: a.username })),
    ].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 15);
    const errors = {
      client7: n("SELECT count(*) n FROM events WHERE type='client_error' AND ts > ?", ago(7)),
      server7: n('SELECT count(*) n FROM server_errors WHERE ts > ?', ago(7)),
      recent: [
        ...d.prepare("SELECT ts, ref AS route, detail AS message FROM events WHERE type='client_error' ORDER BY id DESC LIMIT 8").all().map((e) => ({ ts: e.ts, source: 'browser', route: e.route, message: e.message })),
        ...d.prepare('SELECT ts, route, message FROM server_errors ORDER BY id DESC LIMIT 8').all().map((e) => ({ ts: e.ts, source: 'server', route: e.route, message: e.message })),
      ].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 8),
    };
    const system = {
      status: 'ok', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), node: process.version, dbBytes: dbSize(),
      migrations: [...appliedVersions(d)].sort(), contentVersion: getSetting('contentVersion', 0), activeSessions: n('SELECT count(*) n FROM sessions WHERE expires_at > ?', now()),
      administrators: n('SELECT count(*) n FROM admins WHERE disabled = 0'), events: n('SELECT count(*) n FROM events'), lastBackup: lastBackup(),
      themes: { board: n('SELECT count(*) n FROM board_themes WHERE enabled = 1'), pieceSets: n('SELECT count(*) n FROM piece_sets WHERE enabled = 1') },
    };
    return { lessons, puzzles, games, learners, popular, activity, errors, system };
  }, { auth: true, perm: 'dashboard:read' });

  router.add('GET', '/api/admin/audit', (ctx) => {
    const { page, pageSize, offset } = paging(ctx.query, { def: 25 });
    const where = [], args = [];
    if (ctx.query.q) { where.push("(action LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\' OR entity_id LIKE ? ESCAPE '\\')"); args.push(like(ctx.query.q), like(ctx.query.q), like(ctx.query.q)); }
    if (ctx.query.entity) { where.push('entity = ?'); args.push(ctx.query.entity); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const d = getDb();
    const total = d.prepare(`SELECT count(*) n FROM audit_log ${w}`).get(...args).n;
    const items = d.prepare(`SELECT id, ts, username, action, entity, entity_id, detail FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, offset)
      .map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
    return { items, total, page, pageSize };
  }, { auth: true, perm: 'audit:read' });

  // ---- What the platform can and cannot tell about players (no accounts exist: progress lives in each browser).
  router.add('GET', '/api/admin/users-overview', () => {
    const d = getDb();
    return {
      accountsSupported: false,
      explanation: 'Rookery has no player accounts. Each visitor’s progress, ratings and game history are stored only in their own browser (IndexedDB) and never reach the server, so individual users cannot be listed, searched, suspended or inspected here. Central user administration needs a backend database with sign-in (accounts, password reset, privacy policy, moderation tools) — a separate project.',
      anonymous: {
        levels: d.prepare("SELECT ref AS level, count(*) n FROM events WHERE type='placement_completed' GROUP BY ref").all(),
        activeLearners30d: d.prepare('SELECT count(DISTINCT anon) n FROM events WHERE ts > ?').get(ago(30)).n,
        gamesByLevel: d.prepare("SELECT value AS level, count(*) n FROM events WHERE type='game_completed' GROUP BY value ORDER BY value").all(),
        lessonCompletions: d.prepare("SELECT count(*) n FROM events WHERE type='lesson_completed'").get().n,
        puzzleAttempts: d.prepare("SELECT count(*) n, sum(value = 1) AS correct FROM events WHERE type='puzzle_attempt'").get(),
      },
      reports: 'Reported content and abuse review do not apply: players cannot publish or share any content.',
    };
  }, { auth: true, perm: 'dashboard:read' });

  // ---- administrator accounts (superadmin only)
  const adminRow = (r) => ({ id: r.id, username: r.username, role: r.role, disabled: !!r.disabled, createdAt: r.created_at, lastLoginAt: r.last_login_at });
  const ADMIN_SQL = 'SELECT a.*, r.name AS role FROM admins a JOIN roles r ON r.id = a.role_id';
  router.add('GET', '/api/admin/admins', () => {
    const d = getDb();
    return { items: d.prepare(`${ADMIN_SQL} ORDER BY a.id`).all().map(adminRow), roles: d.prepare('SELECT name, description, permissions FROM roles ORDER BY id').all().map((r) => ({ ...r, permissions: JSON.parse(r.permissions) })) };
  }, { auth: true, perm: 'admins:manage' });

  router.add('POST', '/api/admin/admins', async (ctx) => {
    const { username, password, role } = await ctx.json();
    if (typeof username !== 'string' || !/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw bad('Username: 3–32 letters, digits, dot, dash or underscore.', [{ path: 'username', message: 'Invalid username.' }]);
    const problems = passwordProblems(password, username);
    if (problems.length) throw bad('The password is not strong enough.', problems.map((m) => ({ path: 'password', message: m })));
    const d = getDb();
    const r = d.prepare('SELECT id FROM roles WHERE name = ?').get(role);
    if (!r) throw bad('Unknown role.', [{ path: 'role', message: 'Choose a role.' }]);
    if (d.prepare('SELECT 1 FROM admins WHERE username = ?').get(username)) throw new HttpError(409, 'That username is already taken.', [{ path: 'username', message: 'Already taken.' }]);
    const info = d.prepare('INSERT INTO admins(username, password_hash, role_id, created_at, password_changed_at) VALUES (?,?,?,?,?)').run(username, hashPassword(password), r.id, now(), now());
    audit(ctx, 'admin.create', 'admin', info.lastInsertRowid, { username, role });
    return { status: 201, body: adminRow(d.prepare(`${ADMIN_SQL} WHERE a.id = ?`).get(info.lastInsertRowid)) };
  }, { auth: true, perm: 'admins:manage' });

  router.add('PUT', '/api/admin/admins/:id', async (ctx) => {
    const d = getDb();
    const cur = d.prepare(`${ADMIN_SQL} WHERE a.id = ?`).get(ctx.params.id);
    if (!cur) throw new HttpError(404, 'Administrator not found.');
    const body = await ctx.json();
    const superCount = d.prepare("SELECT count(*) n FROM admins a JOIN roles r ON r.id = a.role_id WHERE r.name = 'superadmin' AND a.disabled = 0").get().n;
    const losingSuper = cur.role === 'superadmin' && !cur.disabled && ((body.role && body.role !== 'superadmin') || body.disabled === true);
    if (losingSuper && superCount <= 1) throw bad('At least one active superadmin must remain.');
    if (cur.id === ctx.admin.id && (body.disabled === true || (body.role && body.role !== cur.role))) throw bad('You cannot disable or demote your own account.');
    if (body.role) {
      const r = d.prepare('SELECT id FROM roles WHERE name = ?').get(body.role);
      if (!r) throw bad('Unknown role.');
      d.prepare('UPDATE admins SET role_id = ? WHERE id = ?').run(r.id, cur.id);
    }
    if (body.disabled !== undefined) {
      d.prepare('UPDATE admins SET disabled = ? WHERE id = ?').run(body.disabled ? 1 : 0, cur.id);
      if (body.disabled) destroyAdminSessions(cur.id);
    }
    if (body.password !== undefined) {
      const problems = passwordProblems(body.password, cur.username);
      if (problems.length) throw bad('The password is not strong enough.', problems.map((m) => ({ path: 'password', message: m })));
      d.prepare('UPDATE admins SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashPassword(body.password), now(), cur.id);
      destroyAdminSessions(cur.id);
    }
    audit(ctx, 'admin.update', 'admin', cur.id, { username: cur.username, role: body.role, disabled: body.disabled, passwordReset: body.password !== undefined });
    return adminRow(d.prepare(`${ADMIN_SQL} WHERE a.id = ?`).get(cur.id));
  }, { auth: true, perm: 'admins:manage' });
}

export { LEARN_LEVEL_IDS };
