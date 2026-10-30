// Application settings. Only whitelisted, validated keys exist: nothing here can disable chess rules or result validation.
import { getDb, tx, setSetting, bumpContentVersion, backupBeforeDestructive } from '../db.mjs';
import { audit } from '../security.mjs';
import { validateSettings } from '../validate.mjs';
import { settingsNow } from '../content.mjs';
import { DEFAULT_SETTINGS } from '../defaults.mjs';
import { problemsError } from './util.mjs';

export function register(router) {
  router.add('GET', '/api/admin/settings', async () => ({ settings: await settingsNow(), defaults: DEFAULT_SETTINGS }), { auth: true, perm: 'settings:read' });

  router.add('PUT', '/api/admin/settings', async (ctx) => {
    const input = await ctx.json();
    const d = getDb();
    const usage = Object.fromEntries((await d.prepare('SELECT theme, count(*) n FROM puzzles GROUP BY theme').all()).map((r) => [r.theme, r.n]));
    const { P, value } = validateSettings({ ...(await settingsNow()), ...input }, {
      boardThemeIds: (await d.prepare('SELECT id FROM board_themes WHERE enabled = 1').all()).map((r) => r.id),
      pieceSetIds: (await d.prepare('SELECT id FROM piece_sets WHERE enabled = 1').all()).map((r) => r.id),
      categoryUsage: usage,
    });
    if (!P.ok) throw problemsError(P);
    const before = await settingsNow();
    const changed = Object.keys(value).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(value[k]));
    await tx(async () => { for (const k of changed) await setSetting(k, value[k], ctx.admin.username); });
    if (changed.length) await bumpContentVersion();
    await audit(ctx, 'settings.update', 'settings', null, { changed });
    return { settings: await settingsNow(), changed };
  }, { auth: true, perm: 'settings:write' });

  router.add('POST', '/api/admin/settings/reset', async (ctx) => {
    await backupBeforeDestructive('pre-reset');
    await tx(async () => { for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await setSetting(k, v, ctx.admin.username); });
    await bumpContentVersion();
    await audit(ctx, 'settings.reset', 'settings');
    return { settings: await settingsNow() };
  }, { auth: true, perm: 'settings:write' });
}
