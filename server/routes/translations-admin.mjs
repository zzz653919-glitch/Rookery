// Translation memory management: coverage, manual edits and "translate missing now".
import { HttpError, bad } from '../http.mjs';
import { audit } from '../security.mjs';
import { bumpContentVersion } from '../db.mjs';
import { providerName } from '../translate.mjs';
import { TARGET_LANGS, isTarget, stats, listEntries, saveTranslation, deleteTranslation, translateMissing, isRunning, lastRun } from '../i18n.mjs';
import { acceptTranslation } from '../translate.mjs';
import { hashStr } from '../../js/i18n/core.js';
import { paging } from './util.mjs';

export function register(router) {
  router.add('GET', '/api/admin/translations', async () => ({
    languages: TARGET_LANGS, provider: providerName(), running: isRunning(), lastRun: { ...lastRun }, stats: await stats(),
  }), { auth: true, perm: 'content:read' });

  router.add('GET', '/api/admin/translations/entries', async (ctx) => {
    const lang = ctx.query.lang;
    if (!isTarget(lang)) throw bad('Choose a language: uz or ru.');
    const { page, pageSize, offset } = paging(ctx.query, { def: 20 });
    const all = (await listEntries(lang, { q: ctx.query.q || '', onlyMissing: ctx.query.status === 'missing' }))
      .filter((e) => !ctx.query.status || ctx.query.status === 'missing' || e.origin === ctx.query.status);
    return { items: all.slice(offset, offset + pageSize), total: all.length, page, pageSize };
  }, { auth: true, perm: 'content:read' });

  router.add('PUT', '/api/admin/translations', async (ctx) => {
    const { lang, source, text } = await ctx.json();
    if (!isTarget(lang)) throw bad('Choose a language: uz or ru.');
    if (typeof source !== 'string' || !source) throw bad('Missing source text.');
    if (typeof text !== 'string' || !text.trim()) throw bad('The translation cannot be empty.');
    const clean = acceptTranslation(source, text);
    if (!clean) throw bad('The translation must keep the same HTML tags and chess notation (moves, squares) as the English text.');
    await await saveTranslation(lang, source, clean, 'manual', ctx.admin.username);
    await bumpContentVersion();
    await audit(ctx, 'translation.edit', 'translation', lang + ':' + hashStr(source), { lang });
    return { ok: true, text: clean };
  }, { auth: true, perm: 'content:write' });

  // Removing a stored translation hands the text back to the automatic translator.
  router.add('DELETE', '/api/admin/translations', async (ctx) => {
    const { lang, hash } = ctx.query;
    if (!isTarget(lang) || !/^[a-z0-9]{1,16}$/.test(hash || '')) throw bad('Invalid request.');
    if (!await deleteTranslation(lang, hash)) throw new HttpError(404, 'No stored translation.');
    await bumpContentVersion();
    await audit(ctx, 'translation.reset', 'translation', lang + ':' + hash, { lang });
    return { ok: true };
  }, { auth: true, perm: 'content:write' });

  router.add('POST', '/api/admin/translations/run', async (ctx) => {
    if (!providerName()) throw bad('No translation provider is configured on the server (see ADMIN.md, "Translations").');
    const body = await ctx.json().catch(() => ({}));
    const langs = body.lang ? [body.lang] : TARGET_LANGS;
    if (!langs.every(isTarget)) throw bad('Choose a language: uz or ru.');
    const job = translateMissing(langs);
    if (body.wait) { const r = await job; await bumpContentVersion(); await audit(ctx, 'translation.run', 'translation', null, { translated: r.translated, rejected: r.rejected }); return r; }
    job.then(() => bumpContentVersion()).catch(() => {});
    await audit(ctx, 'translation.run', 'translation', null, { started: true });
    return { status: 202, body: { started: true } };
  }, { auth: true, perm: 'content:write' });
}
