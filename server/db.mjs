// Database access. Two interchangeable back ends behind one small async API:
//   • local SQLite file (node:sqlite, built into Node 22.5+)           — default, no setup
//   • Turso / libSQL (hosted SQLite)  — when TURSO_DATABASE_URL is set (needs: npm install @libsql/client)
// Statement helpers:  db.prepare(sql).get(...args) / .all(...args) / .run(...args)  and  db.exec(script)  — all return promises.
// tx(async (db) => { ... }) runs a transaction; everything awaited inside (also through getDb()) belongs to it.
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readdirSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';

const MIGRATIONS_DIR = join(fileURLToPath(import.meta.url), '..', 'migrations');
export const now = () => new Date().toISOString();

let backend = null;          // { kind, run(sql,args)->{rows,changes,lastInsertRowid}, script(sql), begin()->txBackend, close() }
let facade = null;
const als = new AsyncLocalStorage();
let txLock = null;           // promise while a transaction is open: other statements wait, so they never join someone else's transaction

const READ = /^\s*(select|with|pragma|explain)\b/i;
const plain = (row) => (row && typeof row === 'object' ? Object.fromEntries(Object.keys(row).filter((k) => Number.isNaN(Number(k))).map((k) => [k, typeof row[k] === 'bigint' ? Number(row[k]) : row[k]])) : row);

// ---- local file back end -------------------------------------------------------------------------
function localBackend(file) {
  if (file !== ':memory:') mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');
  const run = async (sql, args = []) => {
    const st = d.prepare(sql);
    if (READ.test(sql) || /\breturning\b/i.test(sql)) return { rows: st.all(...args).map(plain), changes: 0, lastInsertRowid: null };
    const r = st.run(...args);
    return { rows: [], changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  };
  return {
    kind: 'file', raw: d, run,
    script: async (sql) => { d.exec(sql); },
    begin: async () => { d.exec('BEGIN IMMEDIATE'); return { run, script: async (sql) => { d.exec(sql); }, commit: async () => { d.exec('COMMIT'); }, rollback: async () => { try { d.exec('ROLLBACK'); } catch { /* already closed */ } } }; },
    close: async () => d.close(),
  };
}

// ---- Turso / libSQL back end -------------------------------------------------------------------------
// Splits a migration script into statements (the files only contain plain DDL: no triggers, no semicolons inside strings).
export function splitSql(sql) {
  const out = []; let cur = '', q = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (q) { cur += c; if (c === q) { if (sql[i + 1] === q) cur += sql[++i]; else q = null; } continue; }   // inside '...' / "..." ('' escapes a quote)
    if (c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; cur += '\n'; continue; }
    if (c === '\'' || c === '"') { q = c; cur += c; continue; }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
async function libsqlBackend() {
  let createClient;
  try { ({ createClient } = await import('@libsql/client')); }
  catch { throw new Error('TURSO_DATABASE_URL is set, but the libSQL client is missing. Run:  npm install @libsql/client'); }
  const client = createClient({ url: config.tursoUrl, authToken: config.tursoToken || undefined });
  const toResult = (r) => ({ rows: r.rows.map(plain), changes: Number(r.rowsAffected || 0), lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) });
  const mk = (c) => ({
    run: async (sql, args = []) => toResult(await c.execute({ sql, args })),
    script: async (sql) => { for (const s of splitSql(sql)) await c.execute(s); },
  });
  const top = mk(client);
  if (config.tursoUrl.startsWith('file:')) { try { await client.execute('PRAGMA foreign_keys = ON'); } catch { /* ignore */ } }
  return {
    kind: 'turso', ...top,
    begin: async () => { const t = await client.transaction('write'); return { ...mk(t), commit: () => t.commit(), rollback: async () => { try { await t.rollback(); } catch { /* ignore */ } t.close(); } }; },
    close: async () => client.close(),
  };
}

// ---- facade ---------------------------------------------------------------------------------------------
function makeDb(target, { inTx = false } = {}) {
  const wait = async () => { if (!inTx) while (txLock) await txLock; };
  const exec = async (sql, args) => { await wait(); return target().run(sql, args); };
  return {
    prepare: (sql) => ({
      get: async (...a) => (await exec(sql, a)).rows[0],
      all: async (...a) => (await exec(sql, a)).rows,
      run: async (...a) => { const r = await exec(sql, a); return { changes: r.changes, lastInsertRowid: r.lastInsertRowid }; },
    }),
    exec: async (script) => { await wait(); return target().script(script); },
  };
}

export async function openDb(file = config.dbFile) {
  if (facade) return facade;
  backend = config.tursoUrl ? await libsqlBackend() : localBackend(file);
  facade = makeDb(() => backend);
  return facade;
}
export const dbKind = () => backend?.kind || null;
export function getDb() {
  const inTx = als.getStore();
  if (inTx) return inTx;
  if (!facade) throw new Error('The database is not open yet (call openDb() first).');
  return facade;
}
export async function closeDb() { await backend?.close(); backend = null; facade = null; }

export async function tx(fn) {
  if (als.getStore()) return fn(als.getStore()); // already inside a transaction: join it
  while (txLock) await txLock;
  let release; txLock = new Promise((r) => { release = r; });
  let t;
  try {
    t = await backend.begin();
    const db = makeDb(() => t, { inTx: true });
    const result = await als.run(db, () => fn(db));
    await t.commit();
    return result;
  } catch (e) {
    if (t) await t.rollback();
    throw e;
  } finally { txLock = null; release(); }
}

export const migrationFiles = () => readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

export async function appliedVersions(d = getDb()) {
  await d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  return new Set((await d.prepare('SELECT version FROM schema_migrations').all()).map((r) => r.version));
}

// Local files get a consistent copy via VACUUM INTO. Turso keeps its own point-in-time backups (see Turso docs), so nothing is written here.
export async function backupDatabase(label = 'manual') {
  if (backend.kind !== 'file') return null;
  mkdirSync(config.backupDir, { recursive: true, mode: 0o700 });
  const stamp = now().replace(/[:.]/g, '-');
  const target = join(config.backupDir, `rookery-${stamp}-${label}.db`);
  await getDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return target;
}

// Destructive admin actions (deletes, settings reset) first snapshot the database. At most one snapshot per 10 minutes
// is taken, and only the newest 30 snapshots are kept.
let lastSnapshot = 0;
export async function backupBeforeDestructive(label = 'pre-change') {
  if (!backend || backend.kind !== 'file') return null;
  if (Date.now() - lastSnapshot < 10 * 60 * 1000) return null;
  lastSnapshot = Date.now();
  const file = await backupDatabase(label);
  try {
    const all = readdirSync(config.backupDir).filter((f) => f.endsWith('.db')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 30))) rmSync(join(config.backupDir, old), { force: true });
  } catch { /* pruning is best-effort */ }
  return file;
}

// Applies pending migrations in order, each inside a transaction. Returns { applied, backup }.
export async function migrate({ log = () => {} } = {}) {
  const d = getDb();
  const done = await appliedVersions(d);
  const pending = migrationFiles().filter((f) => !done.has(f));
  if (!pending.length) return { applied: [], backup: null };
  let backup = null;
  const hasData = (await d.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_migrations') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'").get()).n > 0;
  if (hasData && backend.kind === 'file' && config.dbFile !== ':memory:') {
    backup = await backupDatabase('pre-migration');
    log(`backup written: ${backup}`);
  } else if (hasData && backend.kind === 'turso') log('Turso database: make sure you have a recent backup/branch before migrating');
  for (const f of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    try {
      await tx(async (db) => {
        await db.exec(sql);
        await db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(f, now());
      });
      log(`applied ${f}`);
    } catch (e) { throw new Error(`migration ${f} failed and was rolled back: ${e.message}`); }
  }
  return { applied: pending, backup };
}

export const dbSize = () => { try { return backend?.kind === 'file' && existsSync(config.dbFile) ? statSync(config.dbFile).size : null; } catch { return null; } };

// ---- settings helpers ---------------------------------------------------------------------------
export async function getSetting(key, fallback = null) {
  const r = await getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? JSON.parse(r.value) : fallback;
}
export async function setSetting(key, value, by = null) {
  await getDb().prepare('INSERT INTO settings(key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by')
    .run(key, JSON.stringify(value), now(), by);
}
// Bumped on every content/theme/settings write so the public content cache and ETag refresh.
const contentListeners = [];
export const onContentChange = (fn) => { contentListeners.push(fn); };
export async function bumpContentVersion() {
  const v = ((await getSetting('contentVersion', 0)) || 0) + 1;
  await setSetting('contentVersion', v);
  for (const fn of contentListeners) { try { fn(v); } catch { /* listeners must never break a save */ } }
  return v;
}
