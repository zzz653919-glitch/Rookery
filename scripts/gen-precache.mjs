// Generates precache.json: every file the app needs to run offline + a content hash version.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
// server/, data/ and admin/ are never part of the player app: they must not be cached for offline use.
const SKIP_DIRS = new Set(['node_modules', 'tests', 'scripts', '.git', 'docs']);
const SKIP_TOP = new Set(['server', 'data', 'admin', 'api']); // top-level only (js/data/ is part of the app)
const SKIP_FILES = new Set(['precache.json', 'package.json', 'package-lock.json', 'README.md', 'sw.js']);
const RUNTIME = /^engine\/stockfish\/stockfish-.*\.(js|wasm)$/; // large: cached on first use instead of at install (see sw.js)
const ADMIN_ONLY = /^fonts\/Inter-.*\.otf$/; // 1.8 MB of fonts used only by the admin panel: never downloaded by the player app

// Module preload hints: the browser otherwise discovers the ES-module import tree one level at a time (a waterfall of round
// trips). Listing the whole tree of the entry point (and of the home view, which almost every visit renders first) in index.html
// lets it fetch everything in parallel. Rewritten between two markers in index.html.
function importTree(entries) {
  const seen = new Set();
  (function walkJs(f) {
    if (seen.has(f)) return; seen.add(f);
    const src = readFileSync(join(root, f), 'utf8');
    for (const m of src.matchAll(/^(?:import|export)[^'"\n]*?from\s+['"](\.[^'"]+)['"]|^import\s+['"](\.[^'"]+)['"]/gm)) walkJs(relative(root, resolve(dirname(join(root, f)), m[1] || m[2])).split(sep).join('/'));
  })(entries);
  return seen;
}
{
  const mods = new Set([...importTree('js/app.js'), ...importTree('js/views/home.js')]);
  const block = [...mods].sort().map((f) => `  <link rel="modulepreload" href="${f}">`).join('\n');
  const idx = join(root, 'index.html'); const html = readFileSync(idx, 'utf8');
  const next = html.replace(/<!-- modulepreload:start -->[\s\S]*?<!-- modulepreload:end -->/, `<!-- modulepreload:start -->\n${block}\n  <!-- modulepreload:end -->`);
  if (next !== html) writeFileSync(idx, next);
}
const files = [];
const hashed = [];

(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name) && !(dir === root && SKIP_TOP.has(name))) walk(p); }
    else if (!SKIP_FILES.has(name) && !name.startsWith('.')) { const rel = relative(root, p).split(sep).join('/'); hashed.push(rel); if (!RUNTIME.test(rel) && !ADMIN_ONLY.test(rel)) files.push(rel); }
  }
})(root);

files.sort(); hashed.sort();
const hash = createHash('sha1');
for (const f of hashed) { hash.update(f); hash.update(readFileSync(join(root, f))); }
hash.update(readFileSync(join(root, 'sw.js')));
const version = hash.digest('hex').slice(0, 10);
writeFileSync(join(root, 'precache.json'), JSON.stringify({ version, files: ['./', ...files] }, null, 1));
console.log(`precache.json: ${files.length} files, version ${version}`);
