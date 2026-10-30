// Board themes and piece sets (recoloured built-ins or uploaded SVG/PNG/WebP assets).
import { getDb, tx, now, bumpContentVersion, getSetting, setSetting, backupBeforeDestructive } from '../db.mjs';
import { config } from '../config.mjs';
import { HttpError, bad, readBody } from '../http.mjs';
import { audit } from '../security.mjs';
import { validateBoardTheme, validatePieceSet, checkImageUpload, PIECE_CODES } from '../validate.mjs';
import { DEFAULT_SETTINGS } from '../defaults.mjs';
import { pieceSetPublic } from '../content.mjs';
import { mustConfirm, problemsError } from './util.mjs';

const boardRow = (r) => ({ id: r.id, name: r.name, light: r.light, dark: r.dark, builtin: !!r.builtin, enabled: !!r.enabled });
const setRow = (r) => ({ ...pieceSetPublic(r), enabled: !!r.enabled, assetCount: r.kind === 'assets' ? Object.keys(JSON.parse(r.assets)).length : null });
const defaults = async () => ({ boardTheme: await getSetting('defaultBoardTheme', DEFAULT_SETTINGS.defaultBoardTheme), pieceSet: await getSetting('defaultPieceSet', DEFAULT_SETTINGS.defaultPieceSet) });
const MIME = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' };

export function register(router) {
  router.add('GET', '/api/admin/themes', async () => {
    const d = getDb();
    return {
      boardThemes: (await d.prepare('SELECT * FROM board_themes ORDER BY builtin DESC, rowid').all()).map(boardRow),
      pieceSets: (await d.prepare('SELECT * FROM piece_sets ORDER BY builtin DESC, rowid').all()).map(setRow),
      defaults: (await defaults()), pieceCodes: PIECE_CODES,
    };
  }, { auth: true, perm: 'themes:read' });

  // ---- default theme
  router.add('POST', '/api/admin/themes/default', async (ctx) => {
    const body = await ctx.json();
    const d = getDb();
    if (body.boardTheme !== undefined) {
      if (!(await d.prepare('SELECT 1 FROM board_themes WHERE id = ? AND enabled = 1').get(body.boardTheme))) throw bad('Choose an enabled board theme.');
      await setSetting('defaultBoardTheme', body.boardTheme, ctx.admin.username);
    }
    if (body.pieceSet !== undefined) {
      if (!(await d.prepare('SELECT 1 FROM piece_sets WHERE id = ? AND enabled = 1').get(body.pieceSet))) throw bad('Choose an enabled piece set.');
      await setSetting('defaultPieceSet', body.pieceSet, ctx.admin.username);
    }
    await bumpContentVersion();
    await audit(ctx, 'theme.default', 'theme', null, body);
    return (await defaults());
  }, { auth: true, perm: 'themes:write' });

  // ---- board themes
  router.add('POST', '/api/admin/board-themes', async (ctx) => {
    const { P, value: v } = validateBoardTheme(await ctx.json());
    if (!P.ok) throw problemsError(P);
    const d = getDb();
    if ((await d.prepare('SELECT 1 FROM board_themes WHERE id = ?').get(v.id))) throw new HttpError(409, 'This id is already taken.', [{ path: 'id', message: 'This id is already taken.' }]);
    await d.prepare('INSERT INTO board_themes(id, name, light, dark, builtin, enabled, created_at, updated_at) VALUES (?,?,?,?,0,?,?,?)').run(v.id, v.name, v.light, v.dark, v.enabled ? 1 : 0, now(), now());
    await bumpContentVersion();
    await audit(ctx, 'boardTheme.create', 'boardTheme', v.id, { name: v.name });
    return { status: 201, body: boardRow((await d.prepare('SELECT * FROM board_themes WHERE id = ?').get(v.id))) };
  }, { auth: true, perm: 'themes:write' });

  router.add('PUT', '/api/admin/board-themes/:id', async (ctx) => {
    const d = getDb();
    const cur = (await d.prepare('SELECT * FROM board_themes WHERE id = ?').get(ctx.params.id));
    if (!cur) throw new HttpError(404, 'Board theme not found.');
    const { P, value: v } = validateBoardTheme({ ...(await ctx.json()), id: cur.id });
    if (!P.ok) throw problemsError(P);
    if (!v.enabled && (await defaults()).boardTheme === cur.id) throw bad('The default board theme cannot be disabled. Pick another default first.');
    if (!v.enabled && (await d.prepare('SELECT count(*) n FROM board_themes WHERE enabled = 1 AND id != ?').get(cur.id)).n === 0) throw bad('At least one board theme must stay enabled.');
    await d.prepare('UPDATE board_themes SET name=?, light=?, dark=?, enabled=?, updated_at=? WHERE id=?').run(v.name, v.light, v.dark, v.enabled ? 1 : 0, now(), cur.id);
    await bumpContentVersion();
    await audit(ctx, 'boardTheme.update', 'boardTheme', cur.id, { name: v.name, enabled: v.enabled });
    return boardRow((await d.prepare('SELECT * FROM board_themes WHERE id = ?').get(cur.id)));
  }, { auth: true, perm: 'themes:write' });

  router.add('DELETE', '/api/admin/board-themes/:id', async (ctx) => {
    mustConfirm(ctx.query, ctx.params.id);
    const d = getDb();
    const cur = (await d.prepare('SELECT * FROM board_themes WHERE id = ?').get(ctx.params.id));
    if (!cur) throw new HttpError(404, 'Board theme not found.');
    if (cur.builtin) throw bad('Built-in themes cannot be deleted; disable them instead.');
    if ((await defaults()).boardTheme === cur.id) throw bad('The default board theme cannot be deleted.');
    await backupBeforeDestructive('pre-delete');
    await d.prepare('DELETE FROM board_themes WHERE id = ?').run(cur.id);
    await bumpContentVersion();
    await audit(ctx, 'boardTheme.delete', 'boardTheme', cur.id, { name: cur.name });
    return { ok: true };
  }, { auth: true, perm: 'themes:write' });

  // ---- piece sets
  router.add('POST', '/api/admin/piece-sets', async (ctx) => {
    const { P, value: v } = validatePieceSet(await ctx.json());
    if (!P.ok) throw problemsError(P);
    const d = getDb();
    if ((await d.prepare('SELECT 1 FROM piece_sets WHERE id = ?').get(v.id))) throw new HttpError(409, 'This id is already taken.', [{ path: 'id', message: 'This id is already taken.' }]);
    // an asset set cannot be enabled until all 12 images are uploaded
    const enabled = v.kind === 'assets' ? false : v.enabled;
    await d.prepare('INSERT INTO piece_sets(id, name, kind, colors, assets, builtin, enabled, version, created_at, updated_at) VALUES (?,?,?,?,?,0,?,1,?,?)').run(v.id, v.name, v.kind, JSON.stringify(v.colors), '{}', enabled ? 1 : 0, now(), now());
    await bumpContentVersion();
    await audit(ctx, 'pieceSet.create', 'pieceSet', v.id, { name: v.name, kind: v.kind });
    return { status: 201, body: setRow((await d.prepare('SELECT * FROM piece_sets WHERE id = ?').get(v.id))) };
  }, { auth: true, perm: 'themes:write' });

  router.add('PUT', '/api/admin/piece-sets/:id', async (ctx) => {
    const d = getDb();
    const cur = (await d.prepare('SELECT * FROM piece_sets WHERE id = ?').get(ctx.params.id));
    if (!cur) throw new HttpError(404, 'Piece set not found.');
    const input = await ctx.json();
    const merged = { ...input, id: cur.id, kind: cur.kind };
    if (cur.builtin) merged.colors = JSON.parse(cur.colors); // built-in colours are part of the shipped design; only name/enabled can change
    const { P, value: v } = validatePieceSet(merged);
    if (!P.ok) throw problemsError(P);
    if (v.enabled && cur.kind === 'assets' && Object.keys(JSON.parse(cur.assets)).length < PIECE_CODES.length) throw bad('Upload all 12 piece images before enabling this set.');
    if (!v.enabled && (await defaults()).pieceSet === cur.id) throw bad('The default piece set cannot be disabled. Pick another default first.');
    if (!v.enabled && (await d.prepare('SELECT count(*) n FROM piece_sets WHERE enabled = 1 AND id != ?').get(cur.id)).n === 0) throw bad('At least one piece set must stay enabled.');
    await d.prepare('UPDATE piece_sets SET name=?, colors=?, enabled=?, version=version+1, updated_at=? WHERE id=?').run(v.name, JSON.stringify(cur.kind === 'css' ? v.colors : {}), v.enabled ? 1 : 0, now(), cur.id);
    await bumpContentVersion();
    await audit(ctx, 'pieceSet.update', 'pieceSet', cur.id, { name: v.name, enabled: v.enabled });
    return setRow((await d.prepare('SELECT * FROM piece_sets WHERE id = ?').get(cur.id)));
  }, { auth: true, perm: 'themes:write' });

  router.add('DELETE', '/api/admin/piece-sets/:id', async (ctx) => {
    mustConfirm(ctx.query, ctx.params.id);
    const d = getDb();
    const cur = (await d.prepare('SELECT * FROM piece_sets WHERE id = ?').get(ctx.params.id));
    if (!cur) throw new HttpError(404, 'Piece set not found.');
    if (cur.builtin) throw bad('Built-in piece sets cannot be deleted; disable them instead.');
    if ((await defaults()).pieceSet === cur.id) throw bad('The default piece set cannot be deleted.');
    await backupBeforeDestructive('pre-delete');
    await d.prepare('DELETE FROM piece_sets WHERE id = ?').run(cur.id);
    await d.prepare('DELETE FROM piece_assets WHERE set_id = ?').run(cur.id);
    await bumpContentVersion();
    await audit(ctx, 'pieceSet.delete', 'pieceSet', cur.id, { name: cur.name });
    return { ok: true };
  }, { auth: true, perm: 'themes:write' });

  // ---- uploads: PUT raw image bytes. The type is detected from the bytes; filenames are never taken from the client.
  router.add('PUT', '/api/admin/piece-sets/:id/assets/:code', async (ctx) => {
    const d = getDb();
    const cur = (await d.prepare('SELECT * FROM piece_sets WHERE id = ?').get(ctx.params.id));
    if (!cur) throw new HttpError(404, 'Piece set not found.');
    if (cur.kind !== 'assets') throw bad('Only uploaded-image sets accept files.');
    if (!PIECE_CODES.includes(ctx.params.code)) throw bad(`Piece code must be one of ${PIECE_CODES.join(', ')}.`);
    const buf = await readBody(ctx.req, config.maxUploadBytes);
    const chk = checkImageUpload(buf);
    if (chk.error) throw new HttpError(422, chk.error);
    const assets = JSON.parse(cur.assets);
    const file = `${ctx.params.code}.${chk.ext}`;
    await tx(async (db) => {
      await db.prepare('DELETE FROM piece_assets WHERE set_id = ? AND file LIKE ?').run(cur.id, `${ctx.params.code}.%`);
      await db.prepare('INSERT INTO piece_assets(set_id, file, mime, data) VALUES (?,?,?,?)').run(cur.id, file, MIME[chk.ext], buf);
    });
    assets[ctx.params.code] = file;
    await d.prepare('UPDATE piece_sets SET assets = ?, version = version + 1, updated_at = ? WHERE id = ?').run(JSON.stringify(assets), now(), cur.id);
    await bumpContentVersion();
    await audit(ctx, 'pieceSet.upload', 'pieceSet', cur.id, { code: ctx.params.code, type: chk.type, bytes: buf.length });
    return setRow((await d.prepare('SELECT * FROM piece_sets WHERE id = ?').get(cur.id)));
  }, { auth: true, perm: 'themes:write' });

  router.add('DELETE', '/api/admin/piece-sets/:id/assets/:code', async (ctx) => {
    const d = getDb();
    const cur = (await d.prepare('SELECT * FROM piece_sets WHERE id = ?').get(ctx.params.id));
    if (!cur || cur.kind !== 'assets') throw new HttpError(404, 'Piece set not found.');
    const assets = JSON.parse(cur.assets);
    if (!assets[ctx.params.code]) throw new HttpError(404, 'No such image.');
    const removed = assets[ctx.params.code];
    delete assets[ctx.params.code];
    // an incomplete set cannot stay enabled
    const stillComplete = Object.keys(assets).length === PIECE_CODES.length;
    if (!stillComplete && (await defaults()).pieceSet === cur.id) throw bad('The default piece set must stay complete.');
    await d.prepare('DELETE FROM piece_assets WHERE set_id = ? AND file = ?').run(cur.id, removed);
    await d.prepare('UPDATE piece_sets SET assets = ?, enabled = ?, version = version + 1, updated_at = ? WHERE id = ?').run(JSON.stringify(assets), stillComplete ? cur.enabled : 0, now(), cur.id);
    await bumpContentVersion();
    await audit(ctx, 'pieceSet.removeAsset', 'pieceSet', cur.id, { code: ctx.params.code });
    return setRow((await d.prepare('SELECT * FROM piece_sets WHERE id = ?').get(cur.id)));
  }, { auth: true, perm: 'themes:write' });
}

