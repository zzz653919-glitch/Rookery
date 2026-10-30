// Server configuration. Everything is overridable with environment variables; no secrets live in the source.
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

export const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const env = process.env;

export const config = {
  root: ROOT,
  port: +(env.PORT || 5173),
  host: env.HOST || '127.0.0.1',
  dataDir: resolve(env.ROOKERY_DATA_DIR || join(ROOT, 'data')),
  // Session lifetime: absolute maximum and idle timeout (minutes).
  sessionMaxMinutes: +(env.ROOKERY_SESSION_MAX_MINUTES || 8 * 60),
  sessionIdleMinutes: +(env.ROOKERY_SESSION_IDLE_MINUTES || 30),
  // Login throttling: failures allowed inside the window before the next attempt is refused.
  loginWindowMinutes: 15,
  loginMaxPerIp: +(env.ROOKERY_LOGIN_MAX_PER_IP || 10),
  loginMaxPerUser: +(env.ROOKERY_LOGIN_MAX_PER_USER || 5),
  // Only trust X-Forwarded-* when the server runs behind a reverse proxy you control.
  trustProxy: env.ROOKERY_TRUST_PROXY === '1',
  // Force the Secure cookie flag (automatic behind HTTPS proxies; set to 1 in production).
  secureCookies: env.ROOKERY_SECURE_COOKIES === '1',
  maxJsonBytes: 2 * 1024 * 1024,
  maxUploadBytes: 200 * 1024,
  eventRetentionDays: 180,
};
config.dbFile = join(config.dataDir, 'rookery.db');
config.uploadDir = join(config.dataDir, 'uploads');
config.backupDir = join(config.dataDir, 'backups');
