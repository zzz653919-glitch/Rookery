// Application settings. Only whitelisted, validated keys exist: nothing here can disable chess rules or result validation.
import { getDb, tx, setSetting, bumpContentVersion } from '../db.mjs';
import { audit } from '../security.mjs';
import { validateSettings } from '../validate.mjs';
import { settingsNow } from '../content.mjs';
import { DEFAULT_SETTINGS } from '../defaults.mjs';
import { problemsError } from './util.mjs';

export function register(router) {
  router.add('GET', '/api/admin/settings', () => ({ settings: settingsNow(), defaults: DEFAULT_SETTINGS }), { auth: true, perm: 'settings:read' });

  router.add('PUT', '/api/admin/settings', async (ctx) => {
    const input = await ctx.json();
    const d = getDb();
    const usage = Object.fromEntries(d.prepare('SELECT theme, count(*) n FROM puzzles GROUP BY theme').all().map((r) => [r.theme, r.n]));
    const { P, value } = validateSettings({ ...settingsNow(), ...input }, {
      boardThemeIds: d.prepare('SELECT id FROM board_themes WHERE enabled = 1').all().map((r) => r.id),
      pieceSetIds: d.prepare('SELECT id FROM piece_sets WHERE enabled = 1').all().map((r) => r.id),
      categoryUsage: usage,
    });
    if (!P.ok) throw problemsError(P);
    const before = settingsNow();
    const changed = Object.keys(value).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(value[k]));
    tx(() => { for (const k of changed) setSetting(k, value[k], ctx.admin.username); });
    if (changed.length) bumpContentVersion();
    audit(ctx, 'settings.update', 'settings', null, { changed });
    return { settings: settingsNow(), changed };
  }, { auth: true, perm: 'settings:write' });

  router.add('POST', '/api/admin/settings/reset', async (ctx) => {
    tx(() => { for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setSetting(k, v, ctx.admin.username); });
    bumpContentVersion();
    audit(ctx, 'settings.reset', 'settings');
    return { settings: settingsNow() };
  }, { auth: true, perm: 'settings:write' });
}
