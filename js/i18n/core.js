// Tiny internationalisation core shared by the player site and (via import) the admin panel.
//   t('English text {name}', { name })   text with {placeholders}; the English text is the key
//   th(...)                              same, but placeholder VALUES are HTML-escaped (for innerHTML templates)
//   tn(n, 'one form|other forms')        plural forms: en 2, uz 1 (nouns stay singular after numbers), ru 3
// English is the source language; uz / ru dictionaries map English text to translations and are loaded on demand.
// Missing entries fall back to the English text, so nothing ever renders empty.

export const LANGS = [
  { id: 'en', name: 'English', short: 'EN' },
  { id: 'uz', name: "O'zbekcha", short: 'UZ' },
  { id: 'ru', name: 'Русский', short: 'RU' },
];
export const LANG_IDS = LANGS.map((l) => l.id);

let lang = 'en';
let dict = {};

export const getLang = () => lang;
export const isLang = (id) => LANG_IDS.includes(id);

// Best supported language for a browser language list (['uz-UZ', 'ru', 'en-US']).
export function pickLanguage(prefs = []) {
  for (const p of prefs) {
    const base = String(p || '').toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}
export const browserLanguage = () => pickLanguage(typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);

export function setLanguage(id, dictionary = {}) {
  lang = isLang(id) ? id : 'en';
  dict = lang === 'en' ? {} : dictionary;
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', lang);
}

const fmt = (s, params) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s);
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function t(key, params) { return fmt(dict[key] ?? key, params); }
export function th(key, params) {
  if (!params) return dict[key] ?? key;
  return fmt(dict[key] ?? key, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, escHtml(v)])));
}

// CLDR plural category index for each language: en one/other, ru one/few/many, uz single form.
export function pluralIndex(l, n) {
  n = Math.abs(Math.trunc(n));
  if (l === 'ru') { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 1 : 2; }
  if (l === 'uz') return 0;
  return n === 1 ? 0 : 1;
}
export function tn(n, key, params = {}) {
  const translated = dict[key];
  const forms = (translated ?? key).split('|');
  const idx = translated === undefined ? pluralIndex('en', n) : pluralIndex(lang, n);
  return fmt(forms[Math.min(idx, forms.length - 1)], { n, ...params });
}

// ---- content hashing (translation memory keys) -----------------------------------------------------
// 53-bit cyrb53 hash: identical on the server and in the browser, so a translated lesson string can be found
// from the English source text alone, whoever wrote it.
export function hashStr(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export async function loadDictionary(id, base = './') {
  if (!isLang(id) || id === 'en') return {};
  try { return (await import(`${base}ui.${id}.js`)).default || {}; } catch (e) { console.warn('language file missing', id, e); return {}; }
}
