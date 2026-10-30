// SQLite access (node:sqlite, built into Node 22.5+) and the migration runner.
// Before any pending migration touches an existing database, a consistent backup copy is written to data/backups/.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';

const MIGRATIONS_DIR = join(fileURLToPath(import.meta.url), '..', 'migrations');
export const now = () => new Date().toISOString();

let db = null;

export function openDb(file = config.dbFile) {
  if (db) return db;
  if (file !== ':memory:') mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');
  return db;
}
export const getDb = () => db || openDb();
export function closeDb() { db?.close(); db = null; }

export const migrationFiles = () => readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

export function appliedVersions(d = getDb()) {
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  return new Set(d.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
}

export function backupDatabase(label = 'manual') {
  const d = getDb();
  mkdirSync(config.backupDir, { recursive: true, mode: 0o700 });
  const stamp = now().replace(/[:.]/g, '-');
  const target = join(config.backupDir, `rookery-${stamp}-${label}.db`);
  d.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return target;
}

// Applies pending migrations in order, each inside a transaction. Returns { applied, backup }.
export function migrate({ log = () => {} } = {}) {
  const d = getDb();
  const done = appliedVersions(d);
  const pending = migrationFiles().filter((f) => !done.has(f));
  if (!pending.length) return { applied: [], backup: null };
  let backup = null;
  const hasData = d.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_migrations') AND name NOT LIKE 'sqlite_%'").get().n > 0;
  if (hasData && config.dbFile !== ':memory:') {
    backup = backupDatabase('pre-migration');
    log(`backup written: ${backup}`);
  }
  for (const f of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    d.exec('BEGIN');
    try {
      d.exec(sql);
      d.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(f, now());
      d.exec('COMMIT');
      log(`applied ${f}`);
    } catch (e) {
      d.exec('ROLLBACK');
      throw new Error(`migration ${f} failed and was rolled back: ${e.message}`);
    }
  }
  return { applied: pending, backup };
}

export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try { const r = fn(d); d.exec('COMMIT'); return r; }
  catch (e) { try { d.exec('ROLLBACK'); } catch { /* ignore */ } throw e; }
}

export const dbSize = () => { try { return existsSync(config.dbFile) ? statSync(config.dbFile).size : 0; } catch { return 0; } };

// ---- settings helpers ---------------------------------------------------------------------------
export function getSetting(key, fallback = null) {
  const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? JSON.parse(r.value) : fallback;
}
export function setSetting(key, value, by = null) {
  getDb().prepare('INSERT INTO settings(key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by')
    .run(key, JSON.stringify(value), now(), by);
}
// Bumped on every content/theme/settings write so the public content cache and ETag refresh.
export function bumpContentVersion() {
  const v = (getSetting('contentVersion', 0) || 0) + 1;
  setSetting('contentVersion', v);
  return v;
}
