// Player avatars, flags, rating badges.
import { pieceSvg } from './pieces.js';
import { esc } from './dom.js';

const PRESETS = [
  ['k', 'w', 152], ['q', 'w', 330], ['r', 'b', 28], ['b', 'w', 200], ['n', 'b', 262], ['p', 'w', 96],
  ['k', 'b', 18], ['q', 'b', 290], ['r', 'w', 172], ['b', 'b', 48], ['n', 'w', 220], ['p', 'b', 340],
];
export const PRESET_COUNT = PRESETS.length;

export function avatarHtml(user, size = 40) {
  const u = user || {};
  if (u.avatar === 'upload' && u.username) return `<span class="avatar-img" style="--s:${size}px"><img src="api/users/${encodeURIComponent(u.username)}/avatar" alt="" width="${size}" height="${size}" loading="lazy"></span>`;
  const n = Math.min(PRESETS.length, Math.max(1, parseInt(String(u.avatar || 'preset:1').split(':')[1], 10) || 1));
  const [type, color, hue] = PRESETS[n - 1];
  return `<span class="avatar-img preset" style="--s:${size}px;--h:${hue}">${pieceSvg(type, color)}</span>`;
}
export function presetAvatar(n, size = 44) { return avatarHtml({ avatar: 'preset:' + n }, size); }

// Country code → flag emoji (regional indicator letters); empty when unknown.
export const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
export const ratingText = (r, provisional) => `${Math.round(r)}${provisional ? '?' : ''}`;
export const userLink = (name) => `<a class="ulink" href="#/profile/${encodeURIComponent(name)}">${esc(name)}</a>`;
export const COUNTRIES = [['UZ', "O'zbekiston"], ['RU', 'Россия'], ['KZ', 'Қазақстан'], ['KG', 'Кыргызстан'], ['TJ', 'Тоҷикистон'], ['TM', 'Türkmenistan'], ['AZ', 'Azərbaycan'], ['TR', 'Türkiye'], ['UA', 'Україна'], ['BY', 'Беларусь'], ['GB', 'United Kingdom'], ['US', 'United States'], ['DE', 'Deutschland'], ['FR', 'France'], ['IN', 'India'], ['CN', '中国'], ['AM', 'Հայաստան'], ['GE', 'საქართველო']];
