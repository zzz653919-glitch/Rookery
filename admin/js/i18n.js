// Admin panel internationalisation (English / Uzbek / Russian). Shares the core with the player site.
// Almost all text is built through h() in dom.js, which runs it through tr(): exact English text → translation, and
// "pattern" entries ("{n} items", "Page {page} of {pages}") cover messages that contain values. English is the key and the
// fallback, so a missing entry never renders empty.
import { LANGS, getLang, setLanguage, pickLanguage, isLang, pluralIndex, t, tn } from '../../js/i18n/core.js';

export { LANGS, getLang, t, tn };
const KEY = 'rookery-admin:lang';
let patterns = [];
let dict = {};
const miss = typeof window !== 'undefined' && window.__rookeryTrMiss instanceof Set ? window.__rookeryTrMiss : null; // test hook: texts left untranslated
const seen = typeof window !== 'undefined' && window.__rookeryTrLog instanceof Set ? window.__rookeryTrLog : null; // test hook: records every text shown

const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
function compile(d) {
  const out = [];
  for (const [key, val] of Object.entries(d)) {
    if (!key.includes('{')) continue;
    key.split('|').forEach((form) => {
      const names = [];
      const re = new RegExp('^' + esc(form).replace(/\{(\w+)\}/g, (m, n) => { names.push(n); return n === 'n' ? '(\\d+)' : '(.+?)'; }) + '$', 's');
      out.push({ re, names, val });
    });
  }
  // the most specific pattern (longest literal text) wins
  return out.sort((a, b) => b.re.source.length - a.re.source.length);
}

export function tr(s) {
  if (typeof s !== 'string' || !s) return s;
  if (seen) seen.add(s);
  if (getLang() === 'en') return s;
  const hit = dict[s];
  if (hit !== undefined) return hit;
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (!m) continue;
    const params = Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]]));
    const forms = p.val.split('|');
    const n = Number(params.n);
    return forms[Math.min(Number.isFinite(n) ? pluralIndex(getLang(), n) : 0, forms.length - 1)].replace(/\{(\w+)\}/g, (x, k) => (k in params ? tr(params[k]) : x));
  }
  if (miss) miss.add(s);
  return s;
}

export async function initAdminLanguage() {
  let id = null;
  try { id = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (!isLang(id)) id = pickLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
  let d = {};
  if (id !== 'en') { try { d = (await import(`./i18n/ui.${id}.js`)).default; } catch { id = 'en'; } }
  setLanguage(id, d);
  dict = d; patterns = compile(d);
  document.title = tr(document.title);
}
export function setAdminLanguage(id) {
  if (!isLang(id)) return;
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  location.reload();
}
export const locale = () => ({ en: 'en', uz: 'uz', ru: 'ru' }[getLang()]);

// <select> that switches the language; used on the sign-in page and in the top bar.
export function languageSwitcher(h) {
  const sel = h('select', { class: 'lang-select', 'aria-label': tr('Language'), onchange: () => setAdminLanguage(sel.value) },
    LANGS.map((l) => h('option', { value: l.id, selected: l.id === getLang() }, l.name)));
  sel.value = getLang();
  return sel;
}
