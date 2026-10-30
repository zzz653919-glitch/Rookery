// Lists the text-like string literals of the admin panel source (candidates for scripts/i18n/admin.rows.txt) and,
// with --check, reports those that have no translation. Run:  node scripts/i18n/admin-scan.mjs [--check]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './extract.mjs';

const files = [];
const walk = (d) => { for (const f of readdirSync(join(ROOT, d), { withFileTypes: true })) { const p = d + '/' + f.name; if (f.isDirectory()) { if (f.name !== 'i18n') walk(p); } else if (p.endsWith('.js') && !p.endsWith('/i18n.js') && !p.endsWith('preview-frame.js')) files.push(p); } };
walk('admin/js');

const SKIP = /^(?:[a-z][\w-]*(?: [a-z][\w-]*)*|[#.\[][^ ]*|https?:.*|\/.*|[\w.-]+\.(?:js|css|svg|png)|[a-z]+:[a-z]+|M[\d .-]+.*|[\d.%a-z ]+)$/; // css classes, selectors, ids, paths, numbers
export function candidates() {
  const out = new Map();
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = re.exec(src))) {
      let s = m[1] ?? m[2] ?? m[3];
      if (s == null) continue;
      s = s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
      const tpl = m[3] != null;
      if (tpl) s = s.replace(/\$\{[^}]*\}/g, '{x}');
      if (s.length < 2 || !/[A-Za-z]{2,}/.test(s)) continue;
      if (!/[A-Z]|\s|…|\{x\}/.test(s) && !/^[A-Z]/.test(s)) continue;         // lower-case single words are css/ids
      if (/^[a-z][\w-]*( [a-z][\w-]*)*$/.test(s) && !/\s[a-z]+ [a-z]+ [a-z]+/.test(s)) continue;
      if (/^(?:#|\.|<|\/|https?:|[a-z]+:)/.test(s) && !/\s/.test(s)) continue;
      if (/[{};]/.test(s.replace(/\{x\}/g, '')) && /:\s*[\w#-]+;?/.test(s)) continue; // inline css
      if (/^[\w:.#-]+$/.test(s) && !/^[A-Z][a-z]+$/.test(s)) continue;
      if (/^<[a-z]+ [^>]*=/.test(s) || /^M[\d. -]/.test(s)) continue; // svg
      if (!out.has(s)) out.set(s, f);
    }
  }
  return out;
}
if (process.argv[1].endsWith('admin-scan.mjs')) {
  const c = candidates();
  if (process.argv.includes('--check')) {
    const rows = new Map(readFileSync(join(ROOT, 'scripts/i18n/admin.rows.txt'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ||| ')));
    const miss = [...c].filter(([s]) => !rows.has(s) && ![...rows.keys()].some((k) => k.includes('{') && new RegExp('^' + k.split('|')[0].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}|\{\w+\}/g, '.+?') + '$').test(s)));
    for (const [s, f] of miss) console.log(`${f}\t${JSON.stringify(s)}`);
    console.log(`${miss.length} candidate strings without a translation`);
  } else for (const [s, f] of c) console.log(`${f}\t${JSON.stringify(s)}`);
}
