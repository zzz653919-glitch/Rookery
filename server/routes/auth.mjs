// Administrator authentication: login, logout, session info and password change.
import { getDb, now } from '../db.mjs';
import { config } from '../config.mjs';
import { HttpError, bad, cookie, isHttps } from '../http.mjs';
import { verifyPassword, burnPassword, hashPassword, passwordProblems, createSession, destroySession, destroyAdminSessions, loginBlocked, recordLogin, audit } from '../security.mjs';

export const COOKIE = 'rk_admin';

export function register(router) {
  // Public: tells the login page whether an administrator exists yet and whether a session is active.
  router.add('GET', '/api/admin/session', (ctx) => {
    const adminCount = getDb().prepare('SELECT count(*) n FROM admins').get().n;
    if (!ctx.session) return { authenticated: false, setupNeeded: adminCount === 0 };
    return { authenticated: true, admin: ctx.session.admin, perms: ctx.session.perms, csrf: ctx.session.csrf, expiresAt: ctx.session.expiresAt };
  });

  router.add('POST', '/api/admin/login', async (ctx) => {
    const body = await ctx.json();
    const username = typeof body.username === 'string' ? body.username.trim().slice(0, 64) : '';
    const password = typeof body.password === 'string' ? body.password.slice(0, 256) : '';
    if (!username || !password) throw bad('Enter your username and password.');
    if (loginBlocked(ctx.ip, username)) {
      audit({ username, ip: ctx.ip }, 'login.blocked');
      throw new HttpError(429, `Too many failed attempts. Try again in ${config.loginWindowMinutes} minutes.`);
    }
    const d = getDb();
    const row = d.prepare('SELECT a.id, a.username, a.password_hash, a.disabled, r.name AS role FROM admins a JOIN roles r ON r.id = a.role_id WHERE a.username = ?').get(username);
    const ok = row ? verifyPassword(password, row.password_hash) : (burnPassword(password), false);
    if (!ok || row.disabled) {
      recordLogin(ctx.ip, username, false);
      audit({ username, ip: ctx.ip }, 'login.failed');
      // identical message for unknown user, wrong password and disabled account
      throw new HttpError(401, 'Incorrect username or password.');
    }
    recordLogin(ctx.ip, username, true);
    d.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').run(now(), row.id);
    const { token, csrf } = createSession(row.id, ctx.req.headers['user-agent']);
    audit({ admin: { id: row.id, username: row.username }, ip: ctx.ip }, 'login.success');
    return {
      headers: { 'set-cookie': cookie(COOKIE, token, { maxAge: config.sessionMaxMinutes * 60, secure: isHttps(ctx.req) }) },
      body: { authenticated: true, admin: { id: row.id, username: row.username, role: row.role }, csrf },
    };
  });

  router.add('POST', '/api/admin/logout', (ctx) => {
    destroySession(ctx.token);
    audit(ctx, 'logout');
    return { headers: { 'set-cookie': cookie(COOKIE, '', { maxAge: 0, secure: isHttps(ctx.req) }) }, body: { ok: true } };
  }, { auth: true });

  router.add('POST', '/api/admin/password', async (ctx) => {
    const { current, next } = await ctx.json();
    const d = getDb();
    const row = d.prepare('SELECT password_hash FROM admins WHERE id = ?').get(ctx.admin.id);
    if (typeof current !== 'string' || !verifyPassword(current, row.password_hash)) throw new HttpError(403, 'Your current password is incorrect.');
    const problems = passwordProblems(next, ctx.admin.username);
    if (problems.length) throw bad('The new password is not strong enough.', problems);
    d.prepare('UPDATE admins SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashPassword(next), now(), ctx.admin.id);
    destroyAdminSessions(ctx.admin.id, ctx.session.hash); // sign out every other device
    audit(ctx, 'password.change', 'admin', ctx.admin.id);
    return { ok: true };
  }, { auth: true });
}
