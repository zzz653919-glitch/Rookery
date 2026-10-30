// Password hashing, session tokens, CSRF, login throttling and audit logging.
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { config } from './config.mjs';
import { getDb, now } from './db.mjs';

// ---- passwords ----------------------------------------------------------------------------------
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const COMMON = new Set(['password', 'password1', 'password123', '123456789012', 'qwertyuiop12', 'administrator', 'letmein12345', 'chessmaster1', 'iloveyou1234', 'welcome12345']);

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB, hashB] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB, 'base64'), expected = Buffer.from(hashB, 'base64');
    const got = scryptSync(password, salt, expected.length, { N: +N, r: +r, p: +p, maxmem: 128 * 1024 * 1024 });
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch { return false; }
}
// Burn the same CPU time for unknown usernames so response time does not reveal which accounts exist.
const DUMMY = hashPassword('dummy-password-for-timing');
export const burnPassword = (pw) => verifyPassword(String(pw), DUMMY);

export function passwordProblems(password, username = '') {
  const out = [];
  if (typeof password !== 'string') return ['Password is required.'];
  if (password.length < 12) out.push('Use at least 12 characters.');
  if (password.length > 128) out.push('Use at most 128 characters.');
  if (COMMON.has(password.toLowerCase())) out.push('That password is too common.');
  if (username && password.toLowerCase().includes(String(username).toLowerCase())) out.push('The password must not contain the username.');
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) out.push('Mix at least three of: lower-case, upper-case, digits, symbols.');
  return out;
}

// ---- tokens & sessions --------------------------------------------------------------------------
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
const plus = (min) => new Date(Date.now() + min * 60000).toISOString();

export async function createSession(adminId, userAgent = '') {
  const token = newToken(), csrf = newToken();
  await getDb().prepare('INSERT INTO sessions(token_hash, admin_id, csrf, created_at, last_seen_at, expires_at, user_agent) VALUES (?,?,?,?,?,?,?)')
    .run(sha256(token), adminId, csrf, now(), now(), plus(config.sessionMaxMinutes), String(userAgent).slice(0, 200));
  return { token, csrf };
}

// Returns { admin, session, perms } for a valid cookie token, otherwise null. Enforces absolute + idle expiry.
export async function loadSession(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const d = getDb();
  const row = (await d.prepare(`SELECT s.token_hash, s.csrf, s.created_at, s.last_seen_at, s.expires_at, a.id AS admin_id, a.username, a.disabled, r.name AS role, r.permissions
    FROM sessions s JOIN admins a ON a.id = s.admin_id JOIN roles r ON r.id = a.role_id WHERE s.token_hash = ?`).get(sha256(token)));
  if (!row) return null;
  const idleLimit = Date.parse(row.last_seen_at) + config.sessionIdleMinutes * 60000;
  if (row.disabled || Date.now() > Date.parse(row.expires_at) || Date.now() > idleLimit) {
    await d.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
    return null;
  }
  // refresh the idle timer at most once a minute to limit writes
  if (Date.now() - Date.parse(row.last_seen_at) > 60000) (await d.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now(), row.token_hash));
  const perms = JSON.parse(row.permissions);
  return { admin: { id: row.admin_id, username: row.username, role: row.role }, csrf: row.csrf, perms, expiresAt: row.expires_at, hash: row.token_hash };
}
export const destroySession = async (token) => (await getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token)));
export const destroyAdminSessions = async (adminId, exceptHash = null) => (await getDb().prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash IS NOT ?').run(adminId, exceptHash));
export const purgeExpiredSessions = async () => (await getDb().prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?').run(now(), new Date(Date.now() - config.sessionIdleMinutes * 60000).toISOString()));

export const can = (perms, needed) => perms.includes('*') || perms.includes(needed);

// ---- login throttling (persistent, so a restart does not reset it) -------------------------------
export async function loginBlocked(ip, username) {
  const since = new Date(Date.now() - config.loginWindowMinutes * 60000).toISOString();
  const d = getDb();
  const byIp = (await d.prepare('SELECT count(*) AS n FROM login_attempts WHERE ts > ? AND ip = ? AND ok = 0').get(since, ip)).n;
  const byUser = (await d.prepare('SELECT count(*) AS n FROM login_attempts WHERE ts > ? AND username = ? AND ok = 0').get(since, username)).n;
  return byIp >= config.loginMaxPerIp || byUser >= config.loginMaxPerUser;
}
export async function recordLogin(ip, username, ok) {
  const d = getDb();
  await d.prepare('INSERT INTO login_attempts(ts, ip, username, ok) VALUES (?,?,?,?)').run(now(), ip, String(username).slice(0, 64), ok ? 1 : 0);
  if (ok) (await d.prepare('DELETE FROM login_attempts WHERE username = ? AND ok = 0').run(String(username).slice(0, 64))); // a good login clears the user's failures
  (await d.prepare('DELETE FROM login_attempts WHERE ts < ?').run(new Date(Date.now() - 24 * 3600 * 1000).toISOString()));
}

// ---- in-memory rate limiter for public endpoints --------------------------------------------------
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || t - b.start > windowMs) { b = { start: t, n: 0 }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (t - v.start > windowMs) buckets.delete(k);
  return b.n <= max;
}

// ---- audit log ------------------------------------------------------------------------------------
const SECRET_KEY = /pass|secret|token|hash|csrf|cookie/i;
export function redact(v, depth = 0) {
  if (depth > 4) return '[deep]';
  if (Array.isArray(v)) return v.slice(0, 30).map((x) => redact(x, depth + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redact(x, depth + 1)]));
  if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) + '…' : v;
  return v;
}
export async function audit(ctx, action, entity = null, entityId = null, detail = null) {
  await getDb().prepare('INSERT INTO audit_log(ts, admin_id, username, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?,?,?)')
    .run(now(), ctx?.admin?.id ?? null, ctx?.admin?.username ?? ctx?.username ?? null, action, entity, entityId == null ? null : String(entityId), detail ? JSON.stringify(redact(detail)) : null, ctx?.ip ?? null);
}
