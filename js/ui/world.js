// Shared helpers for the Chess World pages: sub-navigation, dates, status chips, countdowns, names, a replay board and an evaluation graph.
import { t, getLang } from '../i18n/core.js';
import { esc, icon } from './dom.js';
import { get } from '../net.js';
import { flagEmoji, countryName } from '../data/countries.js';
import { pieceSvg, BOARD_THEMES, resolveBoardTheme } from './pieces.js';
import { store } from '../store.js';

export const PAGES = [['hub', 'Overview', 'globe'], ['news', 'News', 'news'], ['results', 'Results', 'chart'], ['events', 'Tournaments', 'trophy'], ['live', 'Live games', 'eye'], ['broadcasts', 'Broadcasts', 'play'], ['players', 'Players', 'crown']];
export const hrefOf = (page, id) => (page === 'news' ? `#/news${id ? '/' + encodeURIComponent(id) : ''}` : `#/world/${page === 'hub' ? '' : page}${id ? '/' + encodeURIComponent(id) : ''}`);

export function subnav(cur) {
  return `<nav class="wsub" aria-label="${esc(t('Chess World'))}">${PAGES.map(([id, label, ic]) => `<a href="${hrefOf(id)}" class="${cur === id ? 'on' : ''}" ${cur === id ? 'aria-current="page"' : ''}>${icon(ic, 16)}<span>${t(label)}</span></a>`).join('')}
    <form class="wsearch" role="search" id="w-search-form"><input type="search" id="w-search" name="q" placeholder="${esc(t('Search players, tournaments, games, news'))}" aria-label="${esc(t('Search'))}" maxlength="60" autocomplete="off"><button class="btn icon-btn ghost" type="submit" aria-label="${esc(t('Search'))}">${icon('target', 16)}</button></form></nav>`;
}
export function bindSubnav(root, navigate) {
  const f = root.querySelector('#w-search-form'); if (!f) return;
  f.addEventListener('submit', (e) => { e.preventDefault(); const q = root.querySelector('#w-search').value.trim(); if (q.length >= 2) navigate(`/world/search/${encodeURIComponent(q)}`); });
}

// api: every request carries the interface language so the server can localise categories and biographies
export function wget(path, params = {}) {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)), lang: getLang() });
  return get(`/api/world/${path}${path.includes('?') ? '&' : '?'}${q}`);
}

export const fmtDate = (iso, opts = { year: 'numeric', month: 'short', day: 'numeric' }) => { try { return iso ? new Date(iso).toLocaleDateString(getLang() === 'uz' ? 'uz-UZ' : getLang(), opts) : ''; } catch { return ''; } };
export const fmtTime = (iso) => { try { return iso ? new Date(iso).toLocaleString(getLang() === 'uz' ? 'uz-UZ' : getLang(), { dateStyle: 'medium', timeStyle: 'short' }) : ''; } catch { return ''; } };
export function fmtRange(a, b) {
  if (!a) return t('Date to be announced');
  const x = new Date(a), y = b ? new Date(b) : null; const o = { month: 'short', day: 'numeric' };
  if (!y || x.toDateString() === y.toDateString()) return fmtDate(a);
  return x.getFullYear() === y.getFullYear() ? `${fmtDate(a, o)} – ${fmtDate(b, { ...o, year: 'numeric' })}` : `${fmtDate(a)} – ${fmtDate(b)}`;
}
export const STATUS = { live: ['Live', 's-live'], upcoming: ['Upcoming', 's-up'], completed: ['Completed', 's-done'] };
export const statusChip = (s) => { const [l, c] = STATUS[s] || STATUS.upcoming; return `<span class="wchip ${c}">${s === 'live' ? '<i class="dot"></i>' : ''}${t(l)}</span>`; };
export const confirmChip = (e) => (e.confirmed === 0 ? `<span class="wchip s-prov" title="${esc(t('The schedule is not officially confirmed yet'))}">${t('Provisional')}</span>` : '');

// "Carlsen, Magnus" -> "Magnus Carlsen"
export const nameOf = (n) => { const s = String(n || ''); const i = s.indexOf(','); return i > 0 ? `${s.slice(i + 1).trim()} ${s.slice(0, i).trim()}` : s; };
export const flagOf = (fed) => (fed ? `<span class="wflag" title="${esc(countryName(fed, getLang()))}">${flagEmoji(fed) || esc(fed)}</span>` : '');
export const resultLabel = (r) => (r === '1-0' ? '1–0' : r === '0-1' ? '0–1' : r === '1/2-1/2' ? '½–½' : '*');
export const tcLabel = (tc) => (tc === 'standard' ? t('Classical') : tc === 'rapid' ? t('Rapid') : tc === 'blitz' ? t('Blitz') : '');
export const clockText = (s) => { if (s == null) return '–'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
export const evalText = (e) => (e == null ? '' : e.mate != null ? `#${e.mate}` : (e.cp / 100 > 0 ? '+' : '') + (e.cp / 100).toFixed(1));
export const imgTag = (src, alt = '', cls = '') => (src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('[data-img]')?.classList.add('noimg');this.remove()">` : '');
export const sourceLine = (a) => `<span class="wsrc">${a.source ? `${t('Source')}: <b>${esc(a.source)}</b>` : ''}${a.publishedAt ? `${a.source ? ' · ' : ''}${fmtDate(a.publishedAt)}` : ''}</span>`;
export const errorBox = (e) => `<div class="empty"><div class="big">📡</div><h3>${t('This data is not available right now')}</h3><p>${esc(t(e?.message || 'Try again in a moment.'))}</p><button class="btn" data-retry type="button">${t('Try again')}</button></div>`;

// ---- countdown: elements with data-cd="<iso>" tick every second until the date is reached
export function cdText(iso) {
  const s = Math.floor((Date.parse(iso) - Date.now()) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s <= 0) return t('Starting now');
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return d > 0 ? `${d}${t('d')} ${h}${t('h')} ${m}${t('m')} ${String(x).padStart(2, '0')}s` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}
export function startCountdowns(root) {
  const tick = () => root.querySelectorAll('[data-cd]').forEach((el) => { el.textContent = cdText(el.dataset.cd); });
  tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
}

// ---- replay board
export function boardHtml(fen, { orientation = 'w', last = null, check = null } = {}) {
  const theme = BOARD_THEMES.find((b) => b.id === resolveBoardTheme(store.get('settings').boardTheme)) || BOARD_THEMES[0];
  const rows = String(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR').split(' ')[0].split('/');
  const grid = rows.map((r) => { const o = []; for (const ch of r) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) o.push(null); else o.push({ color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() }); } return o; });
  const idx = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  let html = `<div class="wboard" role="img" aria-label="${esc(t('Chess position'))}">`;
  for (const r of idx) for (const f of idx) {
    const name = 'abcdefgh'[f] + (8 - r), dark = (r + f) % 2 === 1, p = grid[r][f];
    const hl = last && (last.from === name || last.to === name) ? ' hl' : '';
    html += `<span class="${hl}" style="background:${dark ? theme.dark : theme.light}">${p ? pieceSvg(p.type, p.color) : ''}${f === idx[0] ? `<i class="rk">${8 - r}</i>` : ''}${r === idx[7] ? `<i class="fl">${'abcdefgh'[f]}</i>` : ''}</span>`;
  }
  return html + '</div>';
}

// ---- evaluation graph (centipawns, clamped), click to jump to a move
export function evalGraph(evals, cur = -1, { w = 320, h = 70 } = {}) {
  const has = evals.some((e) => e != null); if (!has) return '';
  const n = evals.length, clamp = (v) => Math.max(-600, Math.min(600, v));
  const X = (i) => (n <= 1 ? 0 : (i / (n - 1)) * w), Y = (v) => h / 2 - (clamp(v) / 600) * (h / 2 - 3);
  let last = 0; const pts = evals.map((e, i) => { if (e != null) last = e; return [X(i), Y(last)]; });
  const line = pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ');
  const area = `0,${h / 2} ${line} ${w},${h / 2}`;
  return `<svg class="wgraph" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(t('Evaluation graph'))}"><rect width="${w}" height="${h}" class="bg"/><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" class="mid"/><polygon points="${area}" class="area"/><polyline points="${line}" class="ln"/>${cur >= 0 && pts[cur] ? `<line x1="${pts[cur][0]}" y1="0" x2="${pts[cur][0]}" y2="${h}" class="cur"/>` : ''}</svg>`;
}
export const pairs = (sans) => { const out = []; for (let i = 0; i < sans.length; i += 2) out.push([Math.floor(i / 2) + 1, sans[i], sans[i + 1] ?? null, i]); return out; };

// a round avatar: initials until the photo of the player (from the FIDE id) has been fetched by hydrateFide
export const avatarHtml = (name, fide, size = 36) => `<span class="wavw" ${fide ? `data-fide="${fide}"` : ''}><span class="wav" style="--h:${hue(name)};--s:${size}px"><b>${esc(initials(name))}</b></span></span>`;
// ---- players in lists: photo (from FIDE data when there is one), title, name, federation, rating
const fideCache = new Map(); // fide id -> data | null
export const initials = (n) => nameOf(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export function playerCell(g, side) {
  const w = side === 'w'; const name = w ? g.white : g.black, fide = w ? g.white_fide : g.black_fide, title = w ? g.white_title : g.black_title, elo = w ? g.white_elo : g.black_elo, fed = w ? g.white_fed : g.black_fed, team = w ? g.white_team : g.black_team;
  return `<span class="wpc ${side}" data-elo="${elo || ''}" ${fide ? `data-fide="${fide}"` : ''}><span class="wav" style="--h:${hue(name)}"><b>${esc(initials(name))}</b></span>
    <span class="wpi"><span class="wpn">${title ? `<i class="wtl">${esc(title)}</i>` : ''}<span>${esc(nameOf(name))}</span></span>
      <span class="wpm"><span class="wfl">${flagOf(fed)}</span>${elo ? `<span title="${esc(t('Rating in this game'))}">${elo}</span>` : ''}${team ? `<span class="wtm">${esc(team)}</span>` : ''}</span></span></span>`;
}
export function gameRowHtml(g, { event = true } = {}) {
  const moves = g.plies ? Math.ceil(g.plies / 2) : 0;
  return `<a class="wgm" href="#/world/game/${g.id}">${playerCell(g, 'w')}
    <span class="wgc"><b class="wres ${g.result === '1-0' ? 'w' : g.result === '0-1' ? 'b' : g.result === '1/2-1/2' ? 'd' : ''}">${g.result === '*' ? t('In progress') : resultLabel(g.result)}</b>${moves ? `<small class="muted">${t('{n} moves', { n: moves })}</small>` : ''}</span>
    ${playerCell(g, 'b')}
    <span class="wgi muted small">${[event && g.event_name, g.round_name, g.played_on && fmtDate(g.played_on), g.eco && `${g.eco}${g.opening ? ' ' + g.opening : ''}`].filter(Boolean).map(esc).join(' · ')}</span></a>`;
}
// fills photos, federations and FIDE ratings into the player cells of a list; asks the server in small batches
export async function hydrateFide(root) {
  const cells = [...root.querySelectorAll('[data-fide]')]; const need = [...new Set(cells.map((c) => c.dataset.fide))].filter((id) => !fideCache.has(id));
  const apply = () => {
    for (const c of root.querySelectorAll('[data-fide]')) {
      const d = fideCache.get(c.dataset.fide); if (!d || c.dataset.done) continue; c.dataset.done = '1';
      if (d.photo) { const av = c.querySelector('.wav'); av.classList.add('ph'); if (d.credit) av.title = `${t('Photo')}: ${d.credit}`; av.insertAdjacentHTML('beforeend', `<img src="${esc(d.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`); }
      const fl = c.querySelector('.wfl'); if (fl && !fl.textContent.trim() && d.federation) fl.innerHTML = flagOf(d.federation);
      const ti = c.querySelector('.wtl'); if (!ti && d.title) c.querySelector('.wpn')?.insertAdjacentHTML('afterbegin', `<i class="wtl">${esc(d.title)}</i>`);
      if (d.standard && String(d.standard) !== c.dataset.elo) c.querySelector('.wpm')?.insertAdjacentHTML('beforeend', `<span class="wfr" title="${esc(t('FIDE rating'))}">FIDE ${d.standard}</span>`);
    }
  };
  apply();
  for (let i = 0; i < need.length; i += 12) {
    const chunk = need.slice(i, i + 12);
    try { const r = await wget('fide', { ids: chunk.join(',') }); for (const id of chunk) fideCache.set(id, r.players[id] || null); } catch { for (const id of chunk) fideCache.set(id, null); }
    if (!root.isConnected) return; apply();
  }
}

// ---- a filter list with search, flags and counts (the native <select> cannot be styled and cannot be searched)
export function pickerHtml(id, label, options, value = '') {
  const cur = options.find((o) => o.value === value) || options[0];
  return `<div class="wpick" data-pick="${id}"><button type="button" class="wpk-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label)}"><span class="wpk-cur">${cur.icon ? `<span class="wpk-ic">${cur.icon}</span>` : ''}${esc(cur.label)}</span><span class="wpk-car">▾</span></button>
    <div class="wpk-panel" hidden><input type="search" class="wpk-q" placeholder="${esc(t('Search'))}" aria-label="${esc(t('Search'))}" autocomplete="off"><ul role="listbox" aria-label="${esc(label)}">${options.map((o) => `<li role="option" tabindex="-1" data-v="${esc(o.value)}" data-t="${esc(o.label.toLowerCase())}" aria-selected="${o.value === (cur.value)}">${o.icon ? `<span class="wpk-ic">${o.icon}</span>` : ''}<span class="wpk-l">${esc(o.label)}</span>${o.count != null ? `<small>${o.count}</small>` : ''}</li>`).join('')}</ul></div></div>`;
}
export function bindPicker(root, id, onChange) {
  const el = root.querySelector(`[data-pick="${id}"]`); if (!el) return () => {};
  const btn = el.querySelector('.wpk-btn'), panel = el.querySelector('.wpk-panel'), q = el.querySelector('.wpk-q'), items = () => [...el.querySelectorAll('li:not([hidden])')];
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const open = () => { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); q.value = ''; el.querySelectorAll('li').forEach((l) => { l.hidden = false; }); q.focus(); el.querySelector('li[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); };
  const choose = (li) => { el.querySelectorAll('li').forEach((l) => l.setAttribute('aria-selected', l === li)); el.querySelector('.wpk-cur').innerHTML = li.querySelector('.wpk-ic') ? `<span class="wpk-ic">${li.querySelector('.wpk-ic').innerHTML}</span>${li.querySelector('.wpk-l').innerHTML}` : li.querySelector('.wpk-l').innerHTML; close(); btn.focus(); onChange(li.dataset.v); };
  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
  q.addEventListener('input', () => { const s = q.value.trim().toLowerCase(); el.querySelectorAll('li').forEach((l) => { l.hidden = !!s && !l.dataset.t.includes(s); }); });
  el.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) choose(li); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); btn.focus(); return; }
    if (e.key === 'Enter' && e.target.closest('li')) { choose(e.target.closest('li')); e.preventDefault(); return; }
    if (e.key === 'Enter' && e.target === q) { const f = items()[0]; if (f) choose(f); e.preventDefault(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const l = items(); const i = l.indexOf(document.activeElement); const n = e.key === 'ArrowDown' ? Math.min(l.length - 1, i + 1) : Math.max(0, i - 1); l[n]?.focus(); e.preventDefault(); }
  });
  const away = (e) => { if (!el.contains(e.target)) close(); };
  document.addEventListener('pointerdown', away);
  return () => document.removeEventListener('pointerdown', away);
}
