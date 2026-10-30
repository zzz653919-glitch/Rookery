// Zero-dependency static server for Rookery.
//   node scripts/serve.mjs [--port 5173] [--host 127.0.0.1]
// Needed because browsers refuse ES modules, web workers and service workers on file:// URLs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const port = +opt('port', process.env.PORT || 5173);
const host = opt('host', process.env.HOST || '127.0.0.1');

// keep the offline file list current
spawnSync(process.execPath, [join(root, 'scripts', 'gen-precache.mjs')], { stdio: 'inherit' });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    const rootless = relative(root, file).split('\\').join('/'); // works with Windows and POSIX separators
    if (rootless.startsWith('..') || isAbsolute(rootless)) { res.writeHead(403).end('Forbidden'); return; }
    if (/^(tests|scripts|server|data|node_modules|\.git)(\/|$)|\.(db|sqlite)$/.test(rootless)) { res.writeHead(404).end('Not found'); return; }
    let target = file;
    try {
      const st = await stat(target);
      if (st.isDirectory()) target = join(target, 'index.html');
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const data = await readFile(target);
    const ext = extname(target).toLowerCase();
    const isSw = target.endsWith('sw.js') || target.endsWith('precache.json');
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': isSw || ext === '.html' ? 'no-cache' : 'public, max-age=0, must-revalidate',
      'x-content-type-options': 'nosniff',
      ...(isSw ? { 'service-worker-allowed': '/' } : {}),
    });
    res.end(data);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('Server error');
    console.error(e);
  }
});

server.listen(port, host, () => {
  console.log(`\n  Rookery is running at  http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/\n  (press Ctrl+C to stop)\n`);
});
