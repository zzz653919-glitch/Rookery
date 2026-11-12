// Player accounts: password policy, sessions (cookie rk_user) and public profile shapes.
import { config } from './config.mjs';
import { getDb, now } from './db.mjs';
import { sha256, newToken, hashPassword, verifyPassword } from './security.mjs';

export const USER_COOKIE = 'rk_user';
export const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const COMMON = new Set(['password', '12345678', '123456789', '1234567890', 'qwertyuiop', 'chessmaster', 'iloveyou1', 'password1', 'letmein123', 'rookery123', 'qwerty123']);
const RESERVED = new Set(['admin', 'administrator', 'root', 'rookery', 'system', 'moderator', 'support', 'computer', 'stockfish', 'guest', 'anonymous']);
export const PRESET_AVATARS = 12;

export function usernameProblem(u) {
  if (typeof u !== 'string' || !USERNAME_RE.test(u)) return 'Username: 3–20 letters, digits, dash or underscore.';
  if (RESERVED.has(u.toLowerCase())) return 'That username is reserved.';
  return null;
}
export function playerPasswordProblems(pw, username = '') {
  const out = [];
  if (typeof pw !== 'string') return ['Password is required.'];
  if (pw.length < 8) out.push('Use at least 8 characters.');
  if (pw.length > 128) out.push('Use at most 128 characters.');
  if (COMMON.has(pw.toLowerCase())) out.push('That password is too common.');
  if (username && pw.toLowerCase().includes(String(username).toLowerCase())) out.push('The password must not contain the username.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) out.push('Mix letters and digits.');
  return out;
}

const plus = (min) => new Date(Date.now() + min * 60000).toISOString();
export async function createUserSession(userId) {
  const token = newToken(), csrf = newToken();
  await getDb().prepare('INSERT INTO user_sessions(token_hash, user_id, csrf, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?,?)')
    .run(sha256(token), userId, csrf, now(), now(), plus(30 * 24 * 60));
  return { token, csrf };
}
export const destroyUserSession = (token) => getDb().prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(sha256(token));
export const destroyUserSessions = (userId, except = null) => getDb().prepare('DELETE FROM user_sessions WHERE user_id = ? AND token_hash IS NOT ?').run(userId, except);

// { user, csrf, hash } for a valid cookie token, otherwise null. 30-day absolute / 14-day idle expiry.
export async function loadUserSession(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const d = getDb();
  const row = await d.prepare('SELECT s.token_hash, s.csrf, s.last_seen_at, s.expires_at, u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha256(token));
  if (!row) return null;
  const idle = Date.parse(row.last_seen_at) + 14 * 86400000;
  if (Date.now() > Date.parse(row.expires_at) || Date.now() > idle) { await d.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(row.token_hash); return null; }
  if (Date.now() - Date.parse(row.last_seen_at) > 5 * 60000) {
    await d.prepare('UPDATE user_sessions SET last_seen_at = ? WHERE token_hash = ?').run(now(), row.token_hash);
    await d.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now(), row.id);
  }
  return { user: row, csrf: row.csrf, hash: row.token_hash };
}

export const avatarUrl = (u) => (u.avatar === 'upload' ? `/api/users/${encodeURIComponent(u.username)}/avatar` : null);
export const presetOf = (u) => { const m = /^preset:(\d+)$/.exec(u.avatar); return m ? Math.min(PRESET_AVATARS, Math.max(1, +m[1])) : 1; };
// What other players may see.
export const publicUser = (u) => ({ id: u.id, username: u.username, avatar: u.avatar === 'upload' ? 'upload' : 'preset:' + presetOf(u), avatarUrl: avatarUrl(u), country: u.country || '', bio: u.bio || '', createdAt: u.created_at, lastSeenAt: u.last_seen_at, banned: !!u.banned });

export async function ratingsOf(userId) {
  const rows = await getDb().prepare('SELECT category, rating, games, wins, losses, draws, peak FROM ratings WHERE user_id = ?').all(userId);
  const out = {};
  for (const c of ['bullet', 'blitz', 'rapid', 'classical', 'puzzle']) out[c] = { rating: 1200, games: 0, wins: 0, losses: 0, draws: 0, peak: 1200 };
  for (const r of rows) out[r.category] = { rating: Math.round(r.rating), games: r.games, wins: r.wins, losses: r.losses, draws: r.draws, peak: Math.round(r.peak) };
  return out;
}
export { hashPassword, verifyPassword, config };
