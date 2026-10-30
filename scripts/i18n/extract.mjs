// Finds every translatable UI string in the player site: t('…'), th('…') and tn(n, '…') calls, plus strings that live in
// data files and are translated where displayed (level names, achievements, theme names, …).
// Usage: node scripts/i18n/extract.mjs            -> prints keys missing from js/i18n/ui.uz.js / ui.ru.js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const SKIP = /(^|\/)(i18n|data)\/|^js\/(engine-worker|chess)\//;

function* walk(dir) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) yield* walk(p); else if (p.endsWith('.js')) yield p; }
}
const unescape = (s, q) => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)).replace(q === '`' ? /\\`/g : /$^/, '`');

// source scan -------------------------------------------------------------------------------------------------
export function scanSource(rootDir = ROOT, subdir = 'js') {
  const keys = new Map(); const dynamic = [];
  const re = /\b(?:(t|th)\(\s*|(tn)\([^'"`]*?,\s*)(['"`])((?:\\.|(?!\3)[^\\])*)\3/g; // tn(n, 'x') has a first argument (which may contain calls)
  for (const file of walk(join(rootDir, subdir))) {
    const rel = relative(rootDir, file).split(sep).join('/');
    if (SKIP.test(rel)) continue;
    const src = readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const fn = m[1] || m[2], key = unescape(m[4], m[3]);
      if (fn !== 'tn' && /^\s*\(/.test(src.slice(m.index - 1, m.index))) continue;
      if (m[3] === '`' && key.includes('${')) { dynamic.push(`${rel}: template literal passed to ${fn}()`); continue; }
      (keys.get(key) || keys.set(key, []).get(key)).push(rel);
    }
    // t(non-literal): reported so it can be handled with an explicit key list
    for (const d of src.matchAll(/\bt\(\s*(?!['"`\s])([^)]{0,60})/g)) {
      const before = src.slice(Math.max(0, d.index - 1), d.index);
      if (/[\w.$]/.test(before)) continue;
      dynamic.push(`${rel}: t(${d[1].trim()}…)`);
    }
  }
  return { keys, dynamic };
}

// strings that are defined in data and translated by name where they are displayed ------------------------------
export async function dataKeys() {
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const out = new Set();
  const { LEVELS, SKILLS, THEMES } = await imp('js/data/levels.js');
  for (const l of LEVELS) { out.add(l.name); out.add(l.blurb); out.add(l.focus); }
  Object.values(SKILLS).forEach((s) => out.add(s)); out.add('Forks'); out.add('Pins');
  Object.values(THEMES).forEach((t) => { out.add(t.name); out.add(t.desc); });
  const { ACHIEVEMENTS } = await imp('js/progress.js').catch(() => ({ ACHIEVEMENTS: [] }));
  for (const a of ACHIEVEMENTS) { out.add(a.name); out.add(a.desc); }
  const { LEVELS: ENGINE } = await imp('js/chess/engine.js');
  for (const l of ENGINE) { out.add(l.name); out.add(l.blurb); }
  const { BOARD_THEMES, PIECE_THEMES } = await imp('js/ui/pieces.js');
  [...BOARD_THEMES, ...PIECE_THEMES].forEach((t) => out.add(t.name));
  for (const l of ['Untimed', '1 min', '3 | 2', '5 min', '10 min', '15 | 10']) out.add(l);
  for (const w of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king', 'piece']) out.add(w);
  for (const r of ['checkmate', 'stalemate', 'insufficient material', 'threefold repetition', 'fifty-move rule', 'resignation', 'time', 'agreement', 'timeout vs insufficient material']) out.add(r);
  for (const r of ['by checkmate', 'by stalemate', 'by insufficient material', 'by threefold repetition', 'by the fifty-move rule', 'by resignation', 'on time', 'by agreement', 'on time (not enough material to mate)']) out.add(r);
  for (const k of ['Home', 'Play', 'Learn', 'Puzzles', 'Progress', 'Settings']) out.add(k);
  for (const k of ['Promote to queen', 'Promote to knight', 'Promote to rook', 'Promote to bishop']) out.add(k);
  for (const k of ['Won vs computer level {level}', 'Lost vs computer level {level}', 'Drew vs computer level {level}',
    'After {move}, the White {piece} can capture your {captured} with {reply}.', 'After {move}, the Black {piece} can capture your {captured} with {reply}.']) out.add(k);
  return out;
}

export async function requiredKeys() {
  const { keys, dynamic } = scanSource();
  const all = new Set(keys.keys());
  for (const k of await dataKeys()) all.add(k);
  return { all, dynamic };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { all, dynamic } = await requiredKeys();
  console.log(`${all.size} translatable UI strings`);
  if (dynamic.length) console.log('non-literal t() calls (make sure their strings are listed in dataKeys):\n  ' + dynamic.join('\n  '));
  for (const lang of ['uz', 'ru']) {
    let dict = {};
    try { dict = (await import(pathToFileURL(join(ROOT, `js/i18n/ui.${lang}.js`)).href)).default; } catch { /* not written yet */ }
    const missing = [...all].filter((k) => !(k in dict));
    console.log(`${lang}: ${missing.length} missing`);
    if (process.argv.includes('--list')) for (const k of missing) console.log('  ' + JSON.stringify(k));
  }
}
