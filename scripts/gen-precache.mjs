// Generates precache.json: every file the app needs to run offline + a content hash version.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
// server/, data/ and admin/ are never part of the player app: they must not be cached for offline use.
const SKIP_DIRS = new Set(['node_modules', 'tests', 'scripts', '.git', 'docs']);
const SKIP_TOP = new Set(['server', 'data', 'admin']); // top-level only (js/data/ is part of the app)
const SKIP_FILES = new Set(['precache.json', 'package.json', 'package-lock.json', 'README.md', 'sw.js']);
const files = [];

(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name) && !(dir === root && SKIP_TOP.has(name))) walk(p); }
    else if (!SKIP_FILES.has(name) && !name.startsWith('.')) files.push(relative(root, p).split(sep).join('/'));
  }
})(root);

files.sort();
const hash = createHash('sha1');
for (const f of files) { hash.update(f); hash.update(readFileSync(join(root, f))); }
hash.update(readFileSync(join(root, 'sw.js')));
const version = hash.digest('hex').slice(0, 10);
writeFileSync(join(root, 'precache.json'), JSON.stringify({ version, files: ['./', ...files] }, null, 1));
console.log(`precache.json: ${files.length} files, version ${version}`);
