// Play hub: every way to start a game.
import { icon, esc } from '../ui/dom.js';
import { t } from '../i18n/core.js';
import { net, get } from '../net.js';
import { avatarHtml } from '../ui/user.js';
import { tcLabel } from './game.js';

export async function mount(root) {
  const card = (href, ic, title, body, cls = '') => `<a class="card hover mode-card ${cls}" href="${href}"><span class="mode-ic">${icon(ic, 30)}</span><h3>${title}</h3><p class="muted">${body}</p></a>`;
  let active = [];
  if (net.user) { try { const n = await get('/api/me/notifications'); active = n.activeGames || []; } catch { /* offline */ } }
  const online = net.available;
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('Play')}</div><h1>${t('Choose how you want to play')}</h1><p>${t('Rated games against real people, friends by link, or a Stockfish opponent at your level.')}</p></div></div>
    ${active.length ? `<div class="notice info row spread" style="margin-bottom:16px"><span>${icon('play', 16)} ${t('You have a game in progress.')}</span><a class="btn sm primary" href="#/game/${active[0]}">${t('Resume')}</a></div>` : ''}
    <div class="grid auto modes">
      ${card(online ? '#/play/online' : '#/play/computer', 'bolt', t('Play online'), online ? t('Quick pairing with a player of your strength. Rated or casual.') : t('Needs the Rookery server — not available in this copy.'), online ? 'featured' : 'disabled')}
      ${card(online ? '#/play/friend' : '#/play/computer', 'link', t('Play a friend'), t('Create a private room and share the link — your friend joins in one click.'), online ? '' : 'disabled')}
      ${card('#/play/computer', 'cpu', t('Play the computer'), t('Stockfish 19 with eight levels from beginner to full strength. Works offline.'))}
      ${card('#/play/local', 'users', t('Two players, one device'), t('Pass the board between you. Clocks, undo and PGN included.'))}
      ${card('#/tournaments', 'trophy', t('Tournaments'), t('Arena events with prizes of glory: score points in a time window.'))}
      ${card('#/analysis', 'target', t('Analysis board'), t('Import a PGN, step through the moves and ask Stockfish what it thinks.'))}
    </div>
    ${!online ? `<div class="notice" style="margin-top:16px">${t('This copy of Rookery is running without the server: online games, accounts, friends, tournaments and leaderboards are unavailable. Everything else works offline.')}</div>` : ''}`;
}
