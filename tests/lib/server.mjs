// Test helper: boots the real Rookery server on a free port with a throw-away data directory.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const NODE = ['--disable-warning=ExperimentalWarning'];

export const freePort = () => new Promise((resolve) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
export const newDataDir = () => mkdtempSync(join(tmpdir(), 'rookery-test-'));
export const removeDir = (d) => rmSync(d, { recursive: true, force: true });

export function cli(dataDir, args, { password } = {}) {
  return spawnSync(process.execPath, [...NODE, join(ROOT, 'server/cli.mjs'), ...args], { env: { ...process.env, ROOKERY_DATA_DIR: dataDir, ...(password ? { ROOKERY_ADMIN_PASSWORD: password } : {}) }, encoding: 'utf8' });
}

export async function startServer(dataDir, env = {}) {
  const port = await freePort();
  const proc = spawn(process.execPath, [...NODE, join(ROOT, 'server/index.mjs'), '--port', String(port)], { env: { ...process.env, ROOKERY_DATA_DIR: dataDir, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error('server did not start:\n' + log);
  }
  return { base, port, proc, log: () => log, stop: () => new Promise((res) => { proc.once('exit', res); proc.kill('SIGTERM'); setTimeout(() => proc.kill('SIGKILL'), 3000).unref(); }) };
}

// A tiny cookie-aware API client.
export function client(base) {
  const c = { cookie: '', csrf: '' };
  async function call(method, path, { body, raw, headers = {}, csrf = true, noCookie = false } = {}) {
    const h = { ...headers };
    if (c.cookie && !noCookie) h.cookie = c.cookie;
    if (csrf && c.csrf && method !== 'GET') h['x-csrf-token'] = c.csrf;
    let payload;
    if (raw !== undefined) payload = raw; else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    const res = await fetch(base + path, { method, headers: h, body: payload, redirect: 'manual' });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    const set = res.headers.get('set-cookie');
    return { status: res.status, json, text, headers: res.headers, setCookie: set };
  }
  c.get = (p, o) => call('GET', p, o); c.post = (p, body, o) => call('POST', p, { body, ...o }); c.put = (p, body, o) => call('PUT', p, { body, ...o }); c.del = (p, o) => call('DELETE', p, o); c.call = call;
  c.login = async (username, password) => {
    const r = await call('POST', '/api/admin/login', { body: { username, password } });
    if (r.status === 200) { c.cookie = r.setCookie.split(';')[0]; c.csrf = r.json.csrf; }
    return r;
  };
  return c;
}
