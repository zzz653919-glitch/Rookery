// Lists the translatable strings of the bundled lessons / placement test / puzzles, in the order the translation
// files (scripts/i18n/content.<lang>.txt) must follow.   node scripts/i18n/content-todo.mjs [blockId]
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { ROOT } from './extract.mjs';
import { lessonStrings, stepStrings, puzzleStrings } from '../../js/i18n/content.js';

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const norm = (s) => s.replace(/\s+/g, ' ').trim();

export async function blocks() {
  const { LESSONS } = await imp('js/data/lessons.js');
  const { PLACEMENT } = await imp('js/data/placement.js');
  const { PUZZLES } = await imp('js/data/puzzles.js');
  const out = [];
  for (const l of LESSONS) out.push({ id: l.id, strings: lessonStrings(l) });
  out.push({ id: 'placement', strings: PLACEMENT.flatMap((p) => stepStrings(p)) });
  const seen = new Set(); const ps = [];
  for (const p of PUZZLES) for (const s of puzzleStrings(p)) if (!seen.has(s)) { seen.add(s); ps.push(s); }
  out.push({ id: 'puzzles', strings: ps });
  return out;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const want = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
  let total = 0, chars = 0;
  for (const b of await blocks()) {
    total += b.strings.length; chars += b.strings.reduce((n, s) => n + norm(s).length, 0);
    if (want && b.id !== want) continue;
    if (want || process.argv.includes('--all')) { console.log(`@@ ${b.id}`); b.strings.forEach((s, i) => console.log(`${i + 1}. ${norm(s)}`)); }
  }
  console.log(`\n${total} strings, ${chars} characters`);
}
