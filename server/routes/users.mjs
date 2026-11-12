// Player accounts: register, sign in/out, profile, avatar and learning-progress sync.
import { getDb, now } from '../db.mjs';
import { HttpError, bad, cookie, isHttps, readBody } from '../http.mjs';
import { rateLimit, loginBlocked, recordLogin } from '../security.mjs';
import { checkImageUpload } from '../validate.mjs';
import { config } from '../config.mjs';
import { USER_COOKIE, usernameProblem, playerPasswordProblems, createUserSession, destroyUserSession, destroyUserSessions, publicUser, ratingsOf, hashPassword, verifyPassword, PRESET_AVATARS } from '../accounts.mjs';

const AVATAR_MIME = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' };
const COUNTRY_RE = /^[A-Z]{2}$/;
const sessionCookie = (ctx, token) => ({ 'set-cookie': cookie(USER_COOKIE, token, { maxAge: 30 * 86400, secure: isHttps(ctx.req) }) });

// Everything the signed-in player may see about themself.
export async function selfView(user, csrf) {
  return { authenticated: true, csrf, user: { ...publicUser(user), lang: user.lang, muted: !!user.muted }, ratings: await ratingsOf(user.id) };
}

export function register(router) {
  router.add('GET', '/api/me', async (ctx) => (ctx.user ? selfView(ctx.user, ctx.userSession.csrf) : { authenticated: false }), { userOptional: true });

  router.add('POST', '/api/register', async (ctx) => {
    if (!rateLimit('regtry:' + ctx.ip, 120, 3600000)) throw new HttpError(429, 'Too many attempts. Try again later.');
    const { username, password } = await ctx.json();
    const un = usernameProblem(username);
    if (un) throw bad(un, [{ path: 'username', message: un }]);
    const pw = playerPasswordProblems(password, username);
    if (pw.length) throw bad('The password is not strong enough.', pw.map((m) => ({ path: 'password', message: m })));
    if (!rateLimit('reg:' + ctx.ip, config.registerPerHour, 3600000)) throw new HttpError(429, 'Too many sign-ups from this network. Try again later.'); // counts accounts that pass validation
    const d = getDb();
    if (await d.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'That username is already taken.', [{ path: 'username', message: 'Already taken.' }]);
    const avatar = 'preset:' + (1 + Math.floor(Math.random() * PRESET_AVATARS));
    const info = await d.prepare('INSERT INTO users(username, password_hash, avatar, created_at, last_seen_at) VALUES (?,?,?,?,?)').run(username, hashPassword(password), avatar, now(), now());
    const user = await d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const { token, csrf } = await createUserSession(user.id);
    return { status: 201, headers: sessionCookie(ctx, token), body: await selfView(user, csrf) };
  });

  router.add('POST', '/api/login', async (ctx) => {
    const body = await ctx.json();
    const username = typeof body.username === 'string' ? body.username.trim().slice(0, 40) : '';
    const password = typeof body.password === 'string' ? body.password.slice(0, 256) : '';
    if (!username || !password) throw bad('Enter your username and password.');
    const key = 'u:' + username;
    if (await loginBlocked(ctx.ip, key)) throw new HttpError(429, `Too many failed attempts. Try again in ${config.loginWindowMinutes} minutes.`);
    const user = await getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = user ? verifyPassword(password, user.password_hash) : (verifyPassword(password, 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'), false);
    if (!ok) { await recordLogin(ctx.ip, key, false); throw new HttpError(401, 'Incorrect username or password.'); }
    if (user.banned) throw new HttpError(403, user.ban_reason ? 'This account is banned: ' + user.ban_reason : 'This account is banned.');
    await recordLogin(ctx.ip, key, true);
    const { token, csrf } = await createUserSession(user.id);
    return { headers: sessionCookie(ctx, token), body: await selfView(user, csrf) };
  });

  router.add('POST', '/api/logout', async (ctx) => {
    await destroyUserSession(ctx.userToken);
    return { headers: { 'set-cookie': cookie(USER_COOKIE, '', { maxAge: 0, secure: isHttps(ctx.req) }) }, body: { ok: true } };
  }, { user: true });

  router.add('PUT', '/api/me', async (ctx) => {
    const b = await ctx.json();
    const d = getDb();
    const up = {};
    if (b.country !== undefined) { if (b.country !== '' && !COUNTRY_RE.test(b.country)) throw bad('Choose a country.', [{ path: 'country', message: 'Invalid country.' }]); up.country = b.country; }
    if (b.bio !== undefined) { if (typeof b.bio !== 'string' || b.bio.length > 300) throw bad('The bio can have up to 300 characters.', [{ path: 'bio', message: 'Too long.' }]); up.bio = b.bio.replace(/[<>]/g, '').trim(); }
    if (b.lang !== undefined) { if (!['en', 'uz', 'ru'].includes(b.lang)) throw bad('Unknown language.'); up.lang = b.lang; }
    if (b.avatar !== undefined) {
      const m = /^preset:(\d+)$/.exec(String(b.avatar));
      if (!m || +m[1] < 1 || +m[1] > PRESET_AVATARS) throw bad('Choose one of the avatars.');
      up.avatar = b.avatar;
    }
    const keys = Object.keys(up);
    if (keys.length) await d.prepare(`UPDATE users SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map((k) => up[k]), ctx.user.id);
    return selfView(await d.prepare('SELECT * FROM users WHERE id = ?').get(ctx.user.id), ctx.userSession.csrf);
  }, { user: true });

  // Profile picture upload: PUT raw image bytes (SVG, PNG or WebP, validated by content, 100 KB max).
  router.add('PUT', '/api/me/avatar', async (ctx) => {
    const buf = await readBody(ctx.req, 100 * 1024);
    const chk = checkImageUpload(buf);
    if (chk.error) throw new HttpError(422, chk.error);
    const d = getDb();
    await d.prepare('INSERT INTO user_avatars(user_id, mime, data, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at').run(ctx.user.id, AVATAR_MIME[chk.ext], buf, now());
    await d.prepare("UPDATE users SET avatar = 'upload' WHERE id = ?").run(ctx.user.id);
    return selfView(await d.prepare('SELECT * FROM users WHERE id = ?').get(ctx.user.id), ctx.userSession.csrf);
  }, { user: true });

  router.add('GET', '/api/users/:name/avatar', async (ctx) => {
    const u = await getDb().prepare('SELECT id, avatar FROM users WHERE username = ?').get(ctx.params.name);
    const row = u && u.avatar === 'upload' ? await getDb().prepare('SELECT mime, data FROM user_avatars WHERE user_id = ?').get(u.id) : null;
    if (!row) throw new HttpError(404, 'Not found');
    return { raw: true, status: 200, body: Buffer.from(row.data), headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=300', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'content-disposition': 'inline' } };
  });

  router.add('POST', '/api/me/password', async (ctx) => {
    const { current, next } = await ctx.json();
    const row = await getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(ctx.user.id);
    if (typeof current !== 'string' || !verifyPassword(current, row.password_hash)) throw new HttpError(403, 'Your current password is incorrect.');
    const problems = playerPasswordProblems(next, ctx.user.username);
    if (problems.length) throw bad('The new password is not strong enough.', problems);
    await getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), ctx.user.id);
    await destroyUserSessions(ctx.user.id, ctx.userSession.hash);
    return { ok: true };
  }, { user: true });

  // Puzzle rating: Elo against the difficulty of the puzzle (level 1–8). Solved first try = win, solved with help = half, failed = loss.
  router.add('POST', '/api/me/puzzle-result', async (ctx) => {
    if (!rateLimit('pz:' + ctx.user.id, 60, 60000)) throw new HttpError(429, 'Slow down.');
    const { level, ok, firstTry } = await ctx.json();
    const lv = Math.round(+level);
    if (!(lv >= 1 && lv <= 8) || typeof ok !== 'boolean') throw bad('Send the puzzle level (1–8) and whether it was solved.');
    const score = ok ? (firstTry === true ? 1 : 0.5) : 0;
    const d = getDb();
    const cur = (await d.prepare("SELECT * FROM ratings WHERE user_id = ? AND category = 'puzzle'").get(ctx.user.id)) || { rating: 1200, games: 0, wins: 0, losses: 0, draws: 0, peak: 1200 };
    const diff = 600 + lv * 260;
    const k = cur.games < 30 ? 32 : 16;
    const next = cur.rating + k * (score - 1 / (1 + 10 ** ((diff - cur.rating) / 400)));
    await d.prepare(`INSERT INTO ratings(user_id, category, rating, games, wins, losses, draws, peak, updated_at) VALUES (?,'puzzle',?,?,?,?,?,?,?)
      ON CONFLICT(user_id, category) DO UPDATE SET rating = excluded.rating, games = excluded.games, wins = excluded.wins, losses = excluded.losses, draws = excluded.draws, peak = excluded.peak, updated_at = excluded.updated_at`)
      .run(ctx.user.id, next, cur.games + 1, cur.wins + (score === 1 ? 1 : 0), cur.losses + (score === 0 ? 1 : 0), cur.draws + (score === 0.5 ? 1 : 0), Math.max(cur.peak, next), now());
    return { rating: Math.round(next) };
  }, { user: true });

  // Learning progress of the browser (lessons, puzzles, achievements …) is kept with the account so it follows the player to other devices.
  router.add('GET', '/api/me/progress', async (ctx) => {
    const r = await getDb().prepare('SELECT data, updated_at FROM user_progress WHERE user_id = ?').get(ctx.user.id);
    return r ? { data: JSON.parse(r.data), updatedAt: r.updated_at } : { data: null, updatedAt: null };
  }, { user: true });
  router.add('PUT', '/api/me/progress', async (ctx) => {
    const body = await ctx.json(256 * 1024);
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw bad('Send the progress object as "data".');
    const text = JSON.stringify(body.data);
    if (text.length > 200 * 1024) throw new HttpError(413, 'Progress data is too large.');
    await getDb().prepare('INSERT INTO user_progress(user_id, data, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(ctx.user.id, text, now());
    return { ok: true };
  }, { user: true, maxBody: 256 * 1024 });
}
