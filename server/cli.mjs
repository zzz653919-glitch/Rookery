// Administration CLI. The only way to create the first administrator: there is no web-based setup, so nobody can
// race you to it, and no default password exists anywhere in the source.
//   node server/cli.mjs migrate | backup | status | seed
//   node server/cli.mjs create-admin --username <name> [--role superadmin|editor|viewer]
//   node server/cli.mjs reset-password --username <name>
//   node server/cli.mjs list-admins | disable-admin --username <name>
// Passwords are read from a hidden prompt, or from stdin with --password-stdin, or from ROOKERY_ADMIN_PASSWORD.
import { createInterface } from 'node:readline';
import { openDb, migrate, backupDatabase, getDb, now, appliedVersions, migrationFiles } from './db.mjs';
import { seedIfNeeded, counts } from './seed.mjs';
import { hashPassword, passwordProblems, destroyAdminSessions } from './security.mjs';
import { config } from './config.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n, d = null) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : d; };
const has = (n) => rest.includes('--' + n);
const fail = (m) => { console.error('Error: ' + m); process.exit(1); };

function readHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return resolve(buf); }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1); else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}
async function readLine() {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) { rl.close(); return line; }
  return '';
}
async function getPassword(username) {
  let pw;
  if (has('password-stdin')) pw = (await readLine()).replace(/\r?\n$/, '');
  else if (process.env.ROOKERY_ADMIN_PASSWORD) { pw = process.env.ROOKERY_ADMIN_PASSWORD; delete process.env.ROOKERY_ADMIN_PASSWORD; }
  else if (process.stdin.isTTY) {
    pw = await readHidden('New password: ');
    if (pw !== await readHidden('Repeat password: ')) fail('The passwords do not match.');
  } else fail('No terminal available: use --password-stdin or ROOKERY_ADMIN_PASSWORD.');
  const problems = passwordProblems(pw, username);
  if (problems.length) fail('Password rejected:\n  - ' + problems.join('\n  - '));
  return pw;
}

openDb();
const boot = () => { const r = migrate({ log: (m) => console.log(m) }); seedIfNeeded(); return r; };

switch (cmd) {
  case 'migrate': { const r = boot(); console.log(r.applied.length ? `Applied ${r.applied.length} migration(s).` : 'Database is up to date.'); break; }
  case 'backup': { boot(); console.log('Backup written: ' + backupDatabase('manual')); break; }
  case 'seed': { boot(); console.log('Content: ' + JSON.stringify(counts())); break; }
  case 'status': {
    boot();
    const d = getDb();
    console.log(JSON.stringify({ database: config.dbFile, migrationsApplied: [...appliedVersions(d)], migrationsAvailable: migrationFiles(), content: counts(), administrators: d.prepare('SELECT count(*) n FROM admins').get().n }, null, 2));
    break;
  }
  case 'list-admins': {
    boot();
    for (const a of getDb().prepare('SELECT a.id, a.username, r.name AS role, a.disabled, a.last_login_at FROM admins a JOIN roles r ON r.id = a.role_id ORDER BY a.id').all()) console.log(`${a.id}\t${a.username}\t${a.role}\t${a.disabled ? 'disabled' : 'active'}\t${a.last_login_at || 'never logged in'}`);
    break;
  }
  case 'create-admin': {
    boot();
    const username = flag('username');
    const role = flag('role', 'superadmin');
    if (!username || !/^[A-Za-z0-9_.-]{3,32}$/.test(username)) fail('--username is required (3–32 letters, digits, dot, dash, underscore).');
    const d = getDb();
    const r = d.prepare('SELECT id FROM roles WHERE name = ?').get(role);
    if (!r) fail('Unknown role. Use superadmin, editor or viewer.');
    if (d.prepare('SELECT 1 FROM admins WHERE username = ?').get(username)) fail('That username already exists.');
    const hash = hashPassword(await getPassword(username));
    const info = d.prepare('INSERT INTO admins(username, password_hash, role_id, created_at, password_changed_at) VALUES (?,?,?,?,?)').run(username, hash, r.id, now(), now());
    d.prepare('INSERT INTO audit_log(ts, username, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)').run(now(), 'cli', 'admin.create', 'admin', String(info.lastInsertRowid), JSON.stringify({ username, role }));
    console.log(`Administrator "${username}" created with role ${role}. Sign in at /admin/.`);
    break;
  }
  case 'reset-password': {
    boot();
    const username = flag('username');
    const d = getDb();
    const a = username && d.prepare('SELECT id FROM admins WHERE username = ?').get(username);
    if (!a) fail('Unknown administrator.');
    d.prepare('UPDATE admins SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashPassword(await getPassword(username)), now(), a.id);
    destroyAdminSessions(a.id);
    d.prepare('INSERT INTO audit_log(ts, username, action, entity, entity_id) VALUES (?,?,?,?,?)').run(now(), 'cli', 'admin.passwordReset', 'admin', String(a.id));
    console.log('Password changed; all sessions of that administrator were signed out.');
    break;
  }
  case 'disable-admin': {
    boot();
    const username = flag('username');
    const d = getDb();
    const a = username && d.prepare('SELECT id FROM admins WHERE username = ?').get(username);
    if (!a) fail('Unknown administrator.');
    d.prepare('UPDATE admins SET disabled = 1 WHERE id = ?').run(a.id);
    destroyAdminSessions(a.id);
    console.log('Administrator disabled.');
    break;
  }
  default:
    console.log('Usage: node server/cli.mjs <migrate|backup|seed|status|create-admin|reset-password|disable-admin|list-admins> [--username u] [--role r]');
    process.exit(cmd ? 1 : 0);
}
