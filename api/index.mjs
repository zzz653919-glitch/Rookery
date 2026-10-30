// Vercel serverless entry: the same request handler as `npm start`, running on Vercel's Node runtime.
// Requires the Turso database (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN): a serverless function has no persistent disk.
// The tables and the bundled content must already exist: run `npm run db:migrate` once against the Turso database.
import { handle } from '../server/app.mjs';
import { openDb, migrate, getSetting, dbKind } from '../server/db.mjs';
import { config } from '../server/config.mjs';

let ready = null;
const boot = () => (ready ??= (async () => {
  if (!config.tursoUrl) throw new Error('TURSO_DATABASE_URL is not set');
  await openDb();
  await migrate();                                   // cheap when already up to date; applies new migrations after a deploy
  if (!(await getSetting('seeded'))) throw new Error('The database is empty: run "npm run db:migrate" once with the Turso variables set');
  return dbKind();
})().catch((e) => { ready = null; throw e; }));

export default async function handler(req, res) {
  try { await boot(); } catch (e) {
    console.error('[boot] ' + e.message);
    res.statusCode = 503; res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'The service is not ready: ' + e.message }));
    return;
  }
  return handle(req, res);
}
