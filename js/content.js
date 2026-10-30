// Optional remote content. When Rookery is served by the Node server (server/index.mjs) the admin panel can edit lessons,
// puzzles, themes and settings; this module loads that bundle at start-up and applies it IN PLACE to the bundled data.
// Without the server (static hosting, offline, file served elsewhere) nothing changes: the bundled content is used, and the
// last successfully loaded bundle is kept in localStorage so an offline visit still sees the latest published content.
import { LESSONS } from './data/lessons.js';
import { PUZZLES } from './data/puzzles.js';
import { LEVELS, THEMES } from './data/levels.js';
import { DEFAULTS } from './store.js';
import { BOARD_THEMES, PIECE_THEMES, registerPieceSets } from './ui/pieces.js';
import { getLang } from './i18n/core.js';

// One offline copy per language, so an offline visit shows the same language as the last online one.
const cacheKey = () => `rookery:content-v1:${getLang()}`;
const FALLBACK_TIME_CONTROLS = [
  { id: 'none', label: 'Untimed', base: 0, inc: 0 }, { id: '1+0', label: '1 min', base: 60, inc: 0 }, { id: '3+2', label: '3 | 2', base: 180, inc: 2 },
  { id: '5+0', label: '5 min', base: 300, inc: 0 }, { id: '10+0', label: '10 min', base: 600, inc: 0 }, { id: '15+10', label: '15 | 10', base: 900, inc: 10 },
];

// Everything the rest of the app reads lives here. Defaults equal the previously hard-coded values.
export const remote = {
  available: false,   // true when the admin server answered (used to enable anonymous usage statistics)
  version: 0,
  settings: null,
};
export const quizPassRatio = () => remote.settings?.lessons?.quizPassRatio ?? 0.6;
export const assessmentThresholds = () => ({ master: 0.6, bridgeLo: 0.4, bridgeNext: 0.8, ...(remote.settings?.assessment || {}) });
export const timeControls = () => (remote.settings?.timeControls || FALLBACK_TIME_CONTROLS).filter((t) => t.enabled !== false);
// Computer levels to show (engine strength itself is fixed in js/chess/engine.js); `levels` are the engine's own descriptors.
export const computerLevels = (levels) => levels.map((l) => {
  const o = remote.settings?.computerLevels?.find((x) => x.id === l.id);
  return { ...l, name: o?.name || l.name, blurb: o?.blurb ?? l.blurb, enabled: o ? o.enabled !== false : true };
}).filter((l) => l.enabled);
// Nearest enabled computer level to the requested one.
export function nearestEnabledLevel(levels, wanted) {
  const on = computerLevels(levels);
  if (!on.length || on.some((l) => l.id === wanted)) return wanted;
  return on.reduce((best, l) => (Math.abs(l.id - wanted) < Math.abs(best.id - wanted) ? l : best)).id;
}

export function themeCss(content) {
  const q = (v) => String(v).replace(/[^#a-zA-Z0-9-]/g, '');
  let css = '';
  for (const b of content.boardThemes) css += `.board[data-board='${q(b.id)}'] { --light: ${q(b.light)}; --dark: ${q(b.dark)}; }\n`;
  for (const p of content.pieceSets) {
    if (p.kind !== 'css' || p.builtin) continue;
    for (const side of ['w', 'b']) {
      const c = p.colors[side];
      css += `.board[data-pieces='${q(p.id)}'] .piece-svg.${side} { ${Object.entries(c).map(([k, v]) => `--${q(k)}: ${q(v)}`).join('; ')}; }\n`;
    }
  }
  return css;
}

function apply(content) {
  if (!content || !Array.isArray(content.lessons) || !Array.isArray(content.puzzles)) return false;
  // lessons & puzzles: replace the contents of the shared arrays so every module keeps its reference
  LESSONS.splice(0, LESSONS.length, ...content.lessons);
  PUZZLES.splice(0, PUZZLES.length, ...content.puzzles);
  const s = content.settings;
  remote.settings = s;
  remote.version = content.version;
  if (content.boardThemes?.length) BOARD_THEMES.splice(0, BOARD_THEMES.length, ...content.boardThemes);
  if (content.pieceSets?.length) { registerPieceSets(content.pieceSets); PIECE_THEMES.splice(0, PIECE_THEMES.length, ...content.pieceSets.map((p) => ({ id: p.id, name: p.name }))); }
  let style = document.getElementById('remote-theme-css');
  if (!style) { style = document.createElement('style'); style.id = 'remote-theme-css'; document.head.appendChild(style); }
  style.textContent = themeCss(content);
  if (s) {
    for (const k of Object.keys(THEMES)) delete THEMES[k];
    for (const c of s.puzzleCategories) if (c.enabled) THEMES[c.id] = { name: c.name, desc: c.desc, skill: c.skill };
    for (const lv of LEVELS) if (s.lessons?.levelEngine?.[lv.id]) lv.engine = s.lessons.levelEngine[lv.id];
    // defaults for visitors who have not customised anything yet (saved settings always win)
    const d = DEFAULTS.settings, a = s.appearance || {};
    if (a.defaultTheme) d.theme = a.defaultTheme;
    if ('coords' in a) d.coords = a.coords; if ('animations' in a) d.animations = a.animations; if ('highlightMoves' in a) d.highlightMoves = a.highlightMoves;
    if (s.defaultBoardTheme) d.boardTheme = s.defaultBoardTheme;
    if (s.defaultPieceSet) d.pieceTheme = s.defaultPieceSet;
  }
  return true;
}

const readCache = () => { try { return JSON.parse(localStorage.getItem(cacheKey())); } catch { return null; } };
const writeCache = (text) => { try { localStorage.setItem(cacheKey(), text); } catch { /* quota or privacy mode: fine */ } };
const clearCache = () => { try { localStorage.removeItem(cacheKey()); } catch { /* ignore */ } };

// Resolves to the bundle text, 'static' (plain static hosting: no admin server) or null (server unreachable / error).
async function fetchBundle(timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // Probe a file every host serves: only the admin-enabled Node server adds this header. This avoids a 404 (and a
    // console error) on plain static hosting, where there is no API to ask.
    const probe = await fetch('manifest.webmanifest', { method: 'HEAD', signal: ctl.signal, cache: 'no-cache' });
    if (probe.headers.get('x-rookery-server') !== '1') return 'static';
    const res = await fetch(`api/public/content?lang=${encodeURIComponent(getLang())}`, { signal: ctl.signal, cache: 'no-cache', headers: { accept: 'application/json' } });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return res.status < 500 ? 'static' : null;
    return await res.text();
  } catch { return null; } finally { clearTimeout(timer); }
}

export async function loadRemoteContent({ timeoutMs = 2500 } = {}) {
  if (typeof fetch === 'undefined' || !/^https?:$/.test(location.protocol)) return false;
  // When offline no request is made at all, so the browser logs nothing and the cached bundle is used.
  if (navigator.onLine !== false) {
    const got = await fetchBundle(timeoutMs);
    if (got === 'static') { clearCache(); return false; }
    if (got) {
      try { if (apply(JSON.parse(got))) { remote.available = true; writeCache(got); return true; } } catch { /* corrupt bundle: fall back */ }
    }
  }
  const cached = readCache();
  return !!(cached && apply(cached));
}
