// Language selection for the player site: remembered in the settings store and in a localStorage hint so the
// language is known before the store has loaded (first paint, content request).
import { store } from '../store.js';
import { setLanguage, loadDictionary, browserLanguage, isLang, getLang } from './core.js';

const HINT = 'rookery:lang';

export function earlyLanguage() {
  try { const h = localStorage.getItem(HINT); if (isLang(h)) return h; } catch { /* storage blocked */ }
  return browserLanguage();
}

export async function initLanguage(id = earlyLanguage()) {
  const dict = await loadDictionary(id, new URL('./', import.meta.url).href);
  setLanguage(id, dict);
  return id;
}

// The saved choice wins over the hint (e.g. after importing a backup). Returns true when a reload is needed.
export function reconcileLanguage() {
  const saved = store.get('settings').language;
  if (isLang(saved) && saved !== getLang()) { try { localStorage.setItem(HINT, saved); } catch { /* ignore */ } return true; }
  return false;
}

export async function changeLanguage(id) {
  if (!isLang(id) || id === getLang()) return;
  await store.update('settings', (s) => { s.language = id; });
  try { localStorage.setItem(HINT, id); } catch { /* ignore */ }
  location.reload(); // content, dictionaries and every rendered string switch together
}
