import { h, clear } from '../dom.js';
import { get, post, put, del, can } from '../api.js';
import { modal, confirmDialog, field, input, select, toast, badge, problemsBox, loadingState, errorState, emptyState, toggle } from '../ui.js';
import { previewFrame } from '../preview-frame.js';

const COLOR_LABELS = { p1: 'Highlight', p2: 'Body', p3: 'Shadow', pe: 'Outline', pd: 'Detail lines', pg: 'Sheen' };
const HEX = /^#[0-9a-fA-F]{6}$/;
const PIECE_NAMES = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };

function colorInput(value, onchange, label) {
  const txt = h('input', { type: 'text', value, maxlength: 7, 'aria-label': label + ' hex', style: { width: '92px', fontFamily: 'var(--mono)' } });
  const pick = h('input', { type: 'color', value: HEX.test(value) ? value : '#000000', 'aria-label': label });
  pick.oninput = () => { txt.value = pick.value; onchange(pick.value); };
  txt.oninput = () => { if (HEX.test(txt.value)) { pick.value = txt.value; onchange(txt.value); } };
  return h('div', { class: 'row', style: { gap: '6px' } }, pick, txt);
}

export async function mount(host, ctx) {
  const writable = can('themes:write');
  let data;
  const load = async () => { data = await get('/api/admin/themes'); };
  try { await load(); } catch (e) { host.replaceChildren(errorState(e, () => mount(host, ctx))); return; }
  let tab = 'board';
  const sel = { board: data.defaults.boardTheme, pieces: data.defaults.pieceSet };
  const frame = previewFrame({ height: 470 });
  const sendPreview = (over = {}) => frame.send({ type: 'theme', boardTheme: over.board || sel.board, pieceSet: over.pieces || sel.pieces, boardThemes: over.boardThemes || data.boardThemes, pieceSets: over.pieceSets || data.pieceSets, maxWidth: 400 });
  const body = h('div');
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const refresh = async () => { await load(); draw(); };

  function drawTabs() {
    clear(tabs);
    for (const [id, label] of [['board', 'Board themes'], ['pieces', 'Piece sets']]) tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; draw(); } }, label));
  }
  async function makeDefault(kind, id) {
    try { await post('/api/admin/themes/default', kind === 'board' ? { boardTheme: id } : { pieceSet: id }); toast('Default updated. New visitors see it first.'); await refresh(); } catch (e) { toast(e.message, 'bad'); }
  }

  // --------------------------------------------------------------------- board themes
  function boardCard(t) {
    const isDef = data.defaults.boardTheme === t.id;
    return h('div', { class: 'theme-card' + (isDef ? ' default' : '') },
      h('div', { class: 'row spread' }, h('strong', null, t.name), h('div', { class: 'row', style: { gap: '6px' } }, isDef ? badge('Default', 'info') : null, t.builtin ? badge('Built-in') : null, !t.enabled ? badge('Disabled', 'warn') : null)),
      h('div', { class: 'swatch-pair', style: { alignSelf: 'flex-start' } }, h('i', { style: { background: t.light } }), h('i', { style: { background: t.dark } })),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { sel.board = t.id; sendPreview(); } }, 'Preview'),
        writable ? h('button', { class: 'btn sm', type: 'button', onclick: () => boardDialog(t) }, 'Edit') : null,
        writable && t.enabled && !isDef ? h('button', { class: 'btn sm', type: 'button', onclick: () => makeDefault('board', t.id) }, 'Make default') : null,
        writable ? h('label', { class: 'row small', style: { marginLeft: 'auto' } }, toggle(t.enabled, async (v) => { try { await put(`/api/admin/board-themes/${t.id}`, { ...t, enabled: v }); toast(v ? 'Enabled.' : 'Disabled.'); await refresh(); } catch (e) { toast(e.message, 'bad'); await refresh(); } }, `Enable ${t.name}`), 'On') : null,
        writable && !t.builtin && !isDef ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (!(await confirmDialog({ title: 'Delete board theme?', message: `Delete “${t.name}”? Players using it fall back to the default.`, ok: 'Delete', danger: true, typeToConfirm: t.id }))) return; try { await del(`/api/admin/board-themes/${t.id}`, { confirm: t.id }); toast('Deleted.'); await refresh(); } catch (e) { toast(e.message, 'bad'); } } }, 'Delete') : null));
  }
  function boardDialog(t) {
    const isNew = !t;
    const d = t ? { ...t } : { id: '', name: '', light: '#e6e2cf', dark: '#5a8f6b', enabled: true };
    const idIn = input({ value: d.id, disabled: !isNew, placeholder: 'ocean', oninput: (e) => { d.id = e.target.value.trim(); } });
    const nameIn = input({ value: d.name, oninput: (e) => { d.name = e.target.value; if (isNew && !idIn.dataset.t) { d.id = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24); idIn.value = d.id; } } });
    idIn.addEventListener('input', () => { idIn.dataset.t = '1'; });
    const fr = previewFrame({ height: 380 });
    const live = () => {
      const tmp = { id: d.id || 'draft', name: d.name || 'Draft', light: HEX.test(d.light) ? d.light : '#ffffff', dark: HEX.test(d.dark) ? d.dark : '#000000' };
      const others = data.boardThemes.filter((x) => x.id !== tmp.id);
      fr.send({ type: 'theme', boardTheme: tmp.id, pieceSet: sel.pieces, boardThemes: [...others, tmp], pieceSets: data.pieceSets, maxWidth: 340 });
    };
    const err = h('div'); const save = h('button', { class: 'btn primary', type: 'button' }, isNew ? 'Create theme' : 'Save changes');
    const m = modal({ title: isNew ? 'New board theme' : `Edit ${t.name}`, wide: true, onClose: () => fr.dispose(),
      body: h('div', { class: 'grid g2' }, h('div', { class: 'stack' }, field('Name', nameIn), field('Id', idIn, { hint: isNew ? 'Lower-case letters, digits, hyphens. Cannot change later.' : 'Fixed.' }),
        field('Light squares', colorInput(d.light, (v) => { d.light = v; live(); }, 'Light squares')), field('Dark squares', colorInput(d.dark, (v) => { d.dark = v; live(); }, 'Dark squares')),
        h('p', { class: 'muted small' }, 'Pick colours with enough contrast between the two squares, and between the squares and both piece colours — check the preview with a white and a black piece set.'), err), fr),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });
    setTimeout(live, 400);
    save.onclick = async () => {
      save.disabled = true; err.replaceChildren();
      try { isNew ? await post('/api/admin/board-themes', d) : await put(`/api/admin/board-themes/${t.id}`, d); m.close(); toast('Saved.'); await refresh(); }
      catch (e) { err.replaceChildren(problemsBox(Array.isArray(e.details) ? e.details : [{ message: e.message }])); save.disabled = false; }
    };
  }

  // --------------------------------------------------------------------- piece sets
  function setCard(s) {
    const isDef = data.defaults.pieceSet === s.id;
    const thumb = s.kind === 'assets'
      ? h('div', { class: 'row', style: { gap: '4px' } }, ...['wN', 'bN'].map((c) => (s.assets?.[c] ? h('img', { src: s.assets[c], alt: '', width: 40, height: 40, style: { objectFit: 'contain' } }) : h('span', { class: 'faint small' }, 'no image'))))
      : h('div', { class: 'row', style: { gap: '4px' } }, ...['w', 'b'].map((side) => h('span', { class: 'swatch-pair' }, ...['p1', 'p2', 'p3'].map((k) => h('i', { style: { background: s.colors[side][k] } })))));
    return h('div', { class: 'theme-card' + (isDef ? ' default' : '') },
      h('div', { class: 'row spread' }, h('strong', null, s.name), h('div', { class: 'row', style: { gap: '6px' } }, isDef ? badge('Default', 'info') : null, s.builtin ? badge('Built-in') : badge(s.kind === 'assets' ? 'Images' : 'Colours'), !s.enabled ? badge('Disabled', 'warn') : null)),
      thumb,
      s.kind === 'assets' ? h('div', { class: 'small ' + (s.assetCount === 12 ? 'muted' : ''), style: s.assetCount === 12 ? null : { color: 'var(--warn)' } }, `${s.assetCount}/12 piece images uploaded`) : null,
      h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { sel.pieces = s.id; sendPreview(); } }, 'Preview'),
        writable && !s.builtin ? h('button', { class: 'btn sm', type: 'button', onclick: () => (s.kind === 'assets' ? assetDialog(s) : colorDialog(s)) }, s.kind === 'assets' ? 'Manage images' : 'Edit colours') : null,
        writable && s.builtin ? h('button', { class: 'btn sm', type: 'button', onclick: () => renameDialog(s) }, 'Rename') : null,
        writable && s.enabled && !isDef ? h('button', { class: 'btn sm', type: 'button', onclick: () => makeDefault('pieces', s.id) }, 'Make default') : null,
        writable ? h('label', { class: 'row small', style: { marginLeft: 'auto' } }, toggle(s.enabled, async (v) => { try { await put(`/api/admin/piece-sets/${s.id}`, { name: s.name, colors: s.colors, enabled: v }); toast(v ? 'Enabled.' : 'Disabled.'); await refresh(); } catch (e) { toast(e.message, 'bad'); await refresh(); } }, `Enable ${s.name}`), 'On') : null,
        writable && !s.builtin && !isDef ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (!(await confirmDialog({ title: 'Delete piece set?', message: `Delete “${s.name}” and its uploaded images?`, ok: 'Delete', danger: true, typeToConfirm: s.id }))) return; try { await del(`/api/admin/piece-sets/${s.id}`, { confirm: s.id }); toast('Deleted.'); await refresh(); } catch (e) { toast(e.message, 'bad'); } } }, 'Delete') : null));
  }
  function renameDialog(s) {
    const n = input({ value: s.name }); const err = h('div'); const save = h('button', { class: 'btn primary', type: 'button' }, 'Save');
    const m = modal({ title: 'Rename piece set', body: h('div', { class: 'stack' }, field('Name', n), h('p', { class: 'muted small' }, 'Built-in piece designs are part of the site and cannot be recoloured; you can rename, disable or make them the default.'), err), footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });
    save.onclick = async () => { try { await put(`/api/admin/piece-sets/${s.id}`, { name: n.value, colors: s.colors, enabled: s.enabled }); m.close(); await refresh(); toast('Saved.'); } catch (e) { err.replaceChildren(problemsBox(Array.isArray(e.details) ? e.details : [{ message: e.message }])); } };
  }
  function createSetDialog() {
    const d = { id: '', name: '', kind: 'css' };
    const nameIn = input({ oninput: (e) => { d.name = e.target.value; if (!idIn.dataset.t) { d.id = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24); idIn.value = d.id; } } });
    const idIn = input({ oninput: (e) => { d.id = e.target.value.trim(); idIn.dataset.t = '1'; } });
    const kind = select([['css', 'Recoloured built-in pieces (light & dark colours)'], ['assets', 'Uploaded images (SVG, PNG or WebP for all 12 pieces)']], 'css', { onchange: (e) => { d.kind = e.target.value; } });
    const err = h('div'); const save = h('button', { class: 'btn primary', type: 'button' }, 'Create');
    const m = modal({ title: 'New piece set', body: h('div', { class: 'stack' }, field('Name', nameIn), field('Id', idIn, { hint: 'Lower-case letters, digits, hyphens.' }), field('Type', kind), err), footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });
    save.onclick = async () => {
      save.disabled = true; err.replaceChildren();
      try {
        const base = data.pieceSets.find((p) => p.id === 'classic');
        const r = await post('/api/admin/piece-sets', { id: d.id, name: d.name, kind: d.kind, colors: d.kind === 'css' ? structuredClone(base.colors) : {} });
        m.close(); await refresh(); toast('Piece set created.');
        r.kind === 'assets' ? assetDialog(data.pieceSets.find((p) => p.id === r.id)) : colorDialog(data.pieceSets.find((p) => p.id === r.id));
      } catch (e) { err.replaceChildren(problemsBox(Array.isArray(e.details) ? e.details : [{ message: e.message }])); save.disabled = false; }
    };
  }
  function colorDialog(s) {
    const d = { name: s.name, colors: structuredClone(s.colors), enabled: s.enabled };
    const fr = previewFrame({ height: 380 });
    const live = () => { const tmp = { ...s, name: d.name, colors: d.colors }; fr.send({ type: 'theme', boardTheme: sel.board, pieceSet: s.id, boardThemes: data.boardThemes, pieceSets: [...data.pieceSets.filter((x) => x.id !== s.id), tmp], maxWidth: 340 }); };
    const grid = (side) => h('div', { class: 'stack tight' }, h('h4', null, side === 'w' ? 'Light pieces' : 'Dark pieces'), ...Object.entries(COLOR_LABELS).map(([k, label]) => h('div', { class: 'row spread' }, h('span', { class: 'small' }, label), colorInput(d.colors[side][k], (v) => { d.colors[side][k] = v; live(); }, `${side === 'w' ? 'Light' : 'Dark'} ${label}`))));
    const err = h('div'); const save = h('button', { class: 'btn primary', type: 'button' }, 'Save');
    const nameIn = input({ value: d.name, oninput: (e) => { d.name = e.target.value; } });
    const m = modal({ title: `Edit ${s.name}`, wide: true, onClose: () => fr.dispose(),
      body: h('div', { class: 'grid g2' }, h('div', { class: 'stack' }, field('Name', nameIn), h('div', { class: 'grid g2' }, grid('w'), grid('b')), err), fr),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save] });
    setTimeout(live, 400);
    save.onclick = async () => { save.disabled = true; err.replaceChildren(); try { await put(`/api/admin/piece-sets/${s.id}`, d); m.close(); toast('Saved.'); await refresh(); } catch (e) { err.replaceChildren(problemsBox(Array.isArray(e.details) ? e.details : [{ message: e.message }])); save.disabled = false; } };
  }
  function assetDialog(s0) {
    let s = s0;
    const slots = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' } });
    const fr = previewFrame({ height: 360 });
    const sync = () => fr.send({ type: 'theme', boardTheme: sel.board, pieceSet: s.id, boardThemes: data.boardThemes, pieceSets: [...data.pieceSets.filter((x) => x.id !== s.id), s], maxWidth: 320 });
    function draw() {
      clear(slots);
      for (const side of ['w', 'b']) for (const t of 'KQRBNP') {
        const code = side + t; const url = s.assets?.[code]; const msg = h('div', { class: 'small', style: { color: 'var(--danger)', textAlign: 'center' } });
        const file = h('input', { type: 'file', accept: '.svg,image/svg+xml,image/png,image/webp', class: 'sr-only', 'aria-label': `Upload ${side === 'w' ? 'white' : 'black'} ${PIECE_NAMES[t]}`, onchange: async () => {
          const f = file.files[0]; file.value = ''; if (!f) return; msg.textContent = '';
          if (f.size > 200 * 1024) { msg.textContent = 'Larger than 200 KB.'; return; }
          try { const r = await put(`/api/admin/piece-sets/${s.id}/assets/${code}`, new Uint8Array(await f.arrayBuffer())); s = r; data.pieceSets = data.pieceSets.map((x) => (x.id === s.id ? s : x)); draw(); sync(); }
          catch (e) { msg.textContent = e.message; }
        } });
        slots.append(h('div', { class: 'slot' }, url ? h('img', { src: url, alt: `${side === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[t]}` }) : h('div', { class: 'ph' }, 'empty'), h('strong', { class: 'small' }, `${side === 'w' ? 'Light' : 'Dark'} ${PIECE_NAMES[t]}`),
          h('label', { class: 'btn sm', style: { cursor: 'pointer' } }, url ? 'Replace' : 'Upload', file), msg));
      }
    }
    draw();
    const m = modal({ title: `Images for ${s.name}`, wide: true, onClose: async () => { fr.dispose(); await refresh(); },
      body: h('div', { class: 'grid g2' }, h('div', { class: 'stack' }, h('div', { class: 'notice' }, 'Upload one image per piece: SVG (recommended), PNG or WebP, up to 200 KB. Images should be square with a transparent background. Only real image files are accepted; scripts and executable files are rejected. The set can be enabled once all 12 are uploaded.'), slots), fr),
      footer: h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, 'Done') });
    setTimeout(sync, 400);
  }

  function draw() {
    drawTabs();
    const board = h('div', { class: 'stack' },
      h('div', { class: 'row spread' }, h('p', { class: 'muted', style: { margin: 0 } }, 'Colours of the light and dark squares. Disabled themes disappear from the player settings.'), writable ? h('button', { class: 'btn primary', type: 'button', onclick: () => boardDialog(null) }, 'New board theme') : null),
      h('div', { class: 'grid g2' }, data.boardThemes.map(boardCard)));
    const pieces = h('div', { class: 'stack' },
      h('div', { class: 'row spread' }, h('p', { class: 'muted', style: { margin: 0 } }, 'Light and dark piece variants. Built-in designs stay as they are; add recoloured sets or upload your own images.'), writable ? h('button', { class: 'btn primary', type: 'button', onclick: createSetDialog }, 'New piece set') : null),
      data.pieceSets.length ? h('div', { class: 'grid g2' }, data.pieceSets.map(setCard)) : emptyState('No piece sets'));
    body.replaceChildren(tab === 'board' ? board : pieces);
    sendPreview();
  }
  host.append(h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Themes'), h('p', null, 'Board colours and piece sets for the chessboard. Everything is stored locally and works offline for players.'))),
    h('div', { class: 'split' }, h('div', null, tabs, body), h('div', { class: 'side-col stack' }, h('section', { class: 'card stack' }, h('h3', null, 'Live preview'), frame, h('p', { class: 'faint small', style: { margin: 0 } }, 'Shows the selected board theme with the selected piece set on a real board.')))));
  draw();
  return () => frame.dispose();
}
