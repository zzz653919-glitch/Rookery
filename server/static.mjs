// Static file serving for the player site and the admin UI shell (same rules as scripts/serve.mjs, plus server-side exclusions).
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, relative, isAbsolute } from 'node:path';
import { config } from './config.mjs';
import { SECURITY_HEADERS, ADMIN_CSP } from './http.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
};
// Never served: source of the backend, the database / uploads / backups, tests, scripts, dependencies, VCS data, dotfiles.
const BLOCKED = /^(tests|scripts|server|data|node_modules|\.git)(\/|$)|(^|\/)\.|\.(db|sqlite|sql|log)$|^package(-lock)?\.json$/;

export async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400).end('Bad request'); return; }
  if (rel.includes('\0')) { res.writeHead(400).end('Bad request'); return; }
  // Typing /admin in any common form opens the admin panel (its sign-in page appears first when not signed in).
  if (rel !== '/admin/' && /^\/(?:admin|login|signin|sign-in|admin\/(?:login|signin|sign-in|register|signup))\/?$/i.test(rel)) { res.writeHead(302, { location: '/admin/', ...SECURITY_HEADERS }).end(); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(config.root, rel));
  const rootless = relative(config.root, file).split('\\').join('/');
  if (rootless.startsWith('..') || isAbsolute(rootless)) { res.writeHead(403, SECURITY_HEADERS).end('Forbidden'); return; }
  if (BLOCKED.test(rootless)) { res.writeHead(404, SECURITY_HEADERS).end('Not found'); return; }
  let target = file;
  try {
    const st = await stat(target);
    if (st.isDirectory()) target = join(target, 'index.html');
    const data = await readFile(target);
    const ext = extname(target).toLowerCase();
    const isSw = target.endsWith('sw.js') || target.endsWith('precache.json');
    const isAdmin = rootless === 'admin' || rootless.startsWith('admin/');
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'x-rookery-server': '1', // lets the player site detect the optional admin server without a failing request
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': isAdmin || isSw || ext === '.html' ? 'no-cache' : 'public, max-age=0, must-revalidate',
      ...(isAdmin ? { 'content-security-policy': ADMIN_CSP } : {}),
      ...(isSw ? { 'service-worker-allowed': '/' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain', ...SECURITY_HEADERS }).end('Not found');
  }
}
