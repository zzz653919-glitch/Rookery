// Rookery server: serves the player site, the /admin panel and the JSON API.
//   node server/index.mjs [--port 5173] [--host 127.0.0.1]
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { config } from './config.mjs';
import { openDb, migrate, getDb, dbKind } from './db.mjs';
import { seedIfNeeded } from './seed.mjs';
import { createApp } from './app.mjs';
import { purgeExpiredSessions } from './security.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const port = +opt('port', config.port), host = opt('host', config.host);

// keep the offline file list current (same as scripts/serve.mjs)
spawnSync(process.execPath, [join(config.root, 'scripts', 'gen-precache.mjs')], { stdio: 'inherit' });

await openDb();
const { applied, backup } = await migrate({ log: (m) => console.log('  [db] ' + m) });
if (applied.length) console.log(`  [db] ${applied.length} migration(s) applied${backup ? ` (backup: ${backup})` : ''}`);
if (await seedIfNeeded()) console.log('  [db] bundled lessons, puzzles and themes imported');

const d = getDb();
await d.prepare('DELETE FROM events WHERE ts < ?').run(new Date(Date.now() - config.eventRetentionDays * 86400000).toISOString());
const maintenance = setInterval(async () => { try { await purgeExpiredSessions(); } catch { /* ignore */ } }, 3600000);
maintenance.unref();

const server = createApp();
server.listen(port, host, async () => {
  const shown = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`\n  Database: ${dbKind() === 'turso' ? 'Turso / libSQL' : 'local file'}`);
  console.log(`\n  Rookery is running at  http://${shown}:${port}/\n  Admin panel:           http://${shown}:${port}/admin/`);
  if ((await d.prepare('SELECT count(*) n FROM admins').get()).n === 0) console.log('\n  No administrator exists yet. Create one (the password is prompted, never stored in files):\n    npm run admin:create -- --username <name>\n');
  console.log('  (press Ctrl+C to stop)\n');
});
const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
