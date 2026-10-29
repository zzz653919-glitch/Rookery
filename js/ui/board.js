// Interactive chessboard component.
// - click-to-move and drag-and-drop (pointer events: mouse, pen and touch)
// - legal-move dots, last-move / check / selected highlights
// - promotion picker, arrows, flip, coordinates, animated piece diffing
// The board only *displays* and *collects* moves. Legality is decided by the
// rules engine through the callbacks (legalTargets / onMove).

import { pieceSvg } from './pieces.js';
import { store } from '../store.js';

const FILES = 'abcdefgh';
const sigOf = (p) => p.color + p.type;

export class BoardView {
  /**
   * @param {HTMLElement} root container; board fills its width
   * @param {object} opts
   *   orientation: 'w'|'b'
   *   interactive: bool
   *   canSelect(sq): bool       can the piece on sq be picked up right now
   *   legalTargets(sq): [{to, promotion?:true}]
   *   onMove({from,to,promotion}): bool | Promise<bool>
   *   onSquareClick(sq)         (optional, for non-move tasks like "click the square")
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.opts = { orientation: 'w', interactive: true, ...opts };
    this.orientation = this.opts.orientation;
    this.pieces = {};
    this.els = new Map();           // square -> piece element
    this.selected = null;
    this.targets = [];
    this.last = null;
    this.check = null;
    this.marks = [];
    this.drag = null;
    this.locked = false;
    this.build();
    this.applySettings();
    this._unsub = store.onChange((k) => { if (k === 'settings') this.applySettings(); });
  }

  destroy() {
    this._unsub?.();
    this.root.innerHTML = '';
  }

  // ---------------------------------------------------------------- DOM
  build() {
    this.root.innerHTML = '';
    this.el = document.createElement('div');
    this.el.className = 'board';
    this.el.setAttribute('role', 'application');
    this.el.setAttribute('aria-label', 'Chessboard');
    this.el.innerHTML = `
      <div class="board-squares"></div>
      <div class="board-pieces"></div>
      <svg class="board-arrows" viewBox="0 0 8 8" preserveAspectRatio="none"></svg>
      <div class="board-overlay" hidden></div>`;
    this.root.appendChild(this.el);
    this.sqLayer = this.el.querySelector('.board-squares');
    this.pcLayer = this.el.querySelector('.board-pieces');
    this.arrowLayer = this.el.querySelector('.board-arrows');
    this.overlay = this.el.querySelector('.board-overlay');
    this.sqEls = {};
    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const name = FILES[f] + (r + 1);
        const d = document.createElement('div');
        d.className = 'sq ' + ((f + r) % 2 === 0 ? 'dark' : 'light');
        d.dataset.sq = name;
        this.sqLayer.appendChild(d);
        this.sqEls[name] = d;
      }
    }
    this.layoutSquares();
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    this.el.addEventListener('pointerup', (e) => this.onUp(e));
    this.el.addEventListener('pointercancel', (e) => this.onCancel(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('dragstart', (e) => e.preventDefault());
  }

  // grid position (x,y in 0..7) of a square for the current orientation
  xy(sq) {
    const f = FILES.indexOf(sq[0]), r = parseInt(sq[1], 10) - 1;
    return this.orientation === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  }

  sqAt(x, y) {
    x = Math.max(0, Math.min(7, x)); y = Math.max(0, Math.min(7, y));
    const f = this.orientation === 'w' ? x : 7 - x;
    const r = this.orientation === 'w' ? 7 - y : y;
    return FILES[f] + (r + 1);
  }

  layoutSquares() {
    // order squares in the DOM so grid layout matches the orientation
    const order = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) order.push(this.sqAt(x, y));
    order.forEach((name, i) => {
      const d = this.sqEls[name];
      this.sqLayer.appendChild(d);
      d.querySelector('.coord')?.remove();
      const x = i % 8, y = Math.floor(i / 8);
      if (x === 0) { const c = document.createElement('span'); c.className = 'coord rank'; c.textContent = name[1]; d.appendChild(c); }
      if (y === 7) { const c = document.createElement('span'); c.className = 'coord file'; c.textContent = name[0]; d.appendChild(c); }
    });
  }

  place(el, sq) {
    const { x, y } = this.xy(sq);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    el.dataset.sq = sq;
  }

  applySettings() {
    const s = store.get('settings');
    this.el.dataset.board = s.boardTheme;
    this.el.dataset.pieces = s.pieceTheme;
    this.el.classList.toggle('no-coords', !s.coords);
    this.el.classList.toggle('no-anim', !s.animations);
    this.showMoves = s.highlightMoves;
    this.paint();
  }

  // -------------------------------------------------------- public state
  setInteractive(v) { this.opts.interactive = v; if (!v) this.clearSelection(); }
  setLocked(v) { this.locked = v; }

  setOrientation(o) {
    this.orientation = o;
    this.layoutSquares();
    for (const [sq, el] of this.els) this.place(el, sq);
    this.drawArrows();
    this.paint();
  }
  flip() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }

  // map: { e4: {type:'p', color:'w'}, ... }
  setPosition(map, move = null) {
    this.pieces = map;
    this.closePromotion();
    const kept = new Set();
    for (const [sq, p] of Object.entries(map)) {
      const el = this.els.get(sq);
      if (el && el.dataset.sig === sigOf(p)) kept.add(sq);
    }
    const free = [];
    for (const [sq, el] of this.els) if (!kept.has(sq)) free.push({ sq, el });
    const needed = Object.keys(map).filter((sq) => !kept.has(sq));
    // the moved piece first (so it claims the element on `move.from`)
    needed.sort((a, b) => (move && a === move.to ? -1 : 0) - (move && b === move.to ? -1 : 0));
    const next = new Map();
    for (const sq of kept) next.set(sq, this.els.get(sq));
    for (const sq of needed) {
      const p = map[sq];
      const sig = sigOf(p);
      let idx = -1;
      if (move && sq === move.to) idx = free.findIndex((f) => f.el.dataset.sig === sig && f.sq === move.from);
      if (idx < 0) {
        const { x, y } = this.xy(sq);
        let bestD = 99;
        free.forEach((f, i) => {
          if (f.el.dataset.sig !== sig) return;
          const q = this.xy(f.sq);
          const d = Math.abs(q.x - x) + Math.abs(q.y - y);
          if (d < bestD) { bestD = d; idx = i; }
        });
      }
      let el;
      if (idx >= 0) {
        el = free[idx].el;
        free.splice(idx, 1);
        el.classList.remove('dragging');
        el.style.zIndex = '';
        this.place(el, sq);
      } else {
        el = this.makePiece(p, sq);
        el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 300);
      }
      next.set(sq, el);
    }
    for (const f of free) {
      f.el.classList.add('gone');
      setTimeout(() => f.el.remove(), 160);
    }
    this.els = next;
    if (move) {
      this.last = [move.from, move.to];
      const m = next.get(move.to);
      if (m) { m.classList.remove('landed'); void m.offsetWidth; m.classList.add('landed'); setTimeout(() => m.classList.remove('landed'), 300); }
    }
    this.paint();
  }

  makePiece(p, sq) {
    const el = document.createElement('div');
    el.className = `piece ${p.color}`;
    el.dataset.sig = sigOf(p);
    el.dataset.type = p.type;
    el.innerHTML = pieceSvg(p.type, p.color);
    this.pcLayer.appendChild(el);
    this.place(el, sq);
    return el;
  }

  setLastMove(from, to) { this.last = from ? [from, to] : null; this.paint(); }
  setCheck(sq) { this.check = sq; this.paint(); }
  // marks: [{sq, kind: 'hint'|'good'|'bad'|'info'}]
  setMarks(marks) { this.marks = marks || []; this.paint(); }
  setArrows(arrows) { this.arrows = arrows || []; this.drawArrows(); }

  clearSelection() {
    this.selected = null; this.targets = [];
    this.paint();
  }

  select(sq) {
    this.selected = sq;
    this.targets = this.opts.legalTargets ? (this.opts.legalTargets(sq) || []) : [];
    this.paint();
  }

  paint() {
    for (const el of Object.values(this.sqEls)) {
      el.className = el.className.replace(/\s(last|check|selected|target|capture|mk-\w+)/g, '');
    }
    const add = (sq, c) => this.sqEls[sq]?.classList.add(c);
    if (this.last) this.last.forEach((s) => add(s, 'last'));
    if (this.check) add(this.check, 'check');
    if (this.selected) add(this.selected, 'selected');
    if (this.showMoves) {
      for (const t of this.targets) add(t.to, this.pieces[t.to] || t.capture ? 'capture' : 'target');
    }
    for (const m of this.marks) add(m.sq, 'mk-' + m.kind);
  }

  drawArrows() {
    const NS = 'http://www.w3.org/2000/svg';
    this.arrowLayer.innerHTML = '';
    if (!this.arrows?.length) return;
    const defs = document.createElementNS(NS, 'defs');
    const colors = [...new Set(this.arrows.map((a) => a.color || '#f5b942'))];
    colors.forEach((c, i) => {
      defs.innerHTML += `<marker id="ah${i}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>`;
    });
    this.arrowLayer.appendChild(defs);
    for (const a of this.arrows) {
      const f = this.xy(a.from), t = this.xy(a.to);
      const color = a.color || '#f5b942';
      const i = colors.indexOf(color);
      const dx = t.x - f.x, dy = t.y - f.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', f.x + 0.5 + ux * 0.18); line.setAttribute('y1', f.y + 0.5 + uy * 0.18);
      line.setAttribute('x2', t.x + 0.5 - ux * 0.3); line.setAttribute('y2', t.y + 0.5 - uy * 0.3);
      line.setAttribute('stroke', color); line.setAttribute('stroke-width', '0.17');
      line.setAttribute('stroke-linecap', 'round'); line.setAttribute('opacity', '0.9');
      line.setAttribute('marker-end', `url(#ah${i})`);
      this.arrowLayer.appendChild(line);
    }
  }

  // ------------------------------------------------------------- input
  squareFromEvent(e) {
    const rect = this.el.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return this.sqAt(x, y);
  }

  onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    if (this.overlay && !this.overlay.hidden) return;
    const sq = this.squareFromEvent(e);
    if (!sq) return;
    if (this.opts.onSquareClick) this.opts.onSquareClick(sq);
    if (!this.opts.interactive || this.locked) return;
    const piece = this.pieces[sq];
    // 1) clicking a highlighted target of the currently selected piece = move
    if (this.selected && this.selected !== sq && this.targets.some((t) => t.to === sq)) {
      this.tryMove(this.selected, sq, null);
      e.preventDefault();
      return;
    }
    // 2) picking up one of our own pieces
    if (piece && this.opts.canSelect && this.opts.canSelect(sq)) {
      const wasSelected = this.selected === sq;
      this.select(sq);
      const el = this.els.get(sq);
      this.drag = { from: sq, el, startX: e.clientX, startY: e.clientY, active: false, id: e.pointerId, wasSelected };
      try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
      return;
    }
    // 3) anything else clears the selection
    this.clearSelection();
  }

  onMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.active && dist > 5) {
      d.active = true;
      d.el.classList.add('dragging');
    }
    if (d.active) {
      const rect = this.el.getBoundingClientRect();
      const size = rect.width / 8;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      d.el.style.transform = `translate(${x}px, ${y}px)`;
      const over = this.squareFromEvent(e);
      if (over !== d.over) {
        d.over = over;
        for (const s of Object.values(this.sqEls)) s.classList.remove('drop');
        if (over && this.targets.some((t) => t.to === over)) this.sqEls[over].classList.add('drop');
      }
      e.preventDefault();
    }
  }

  onUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    try { this.el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    for (const s of Object.values(this.sqEls)) s.classList.remove('drop');
    if (!d.active) {
      // a click on our own piece: toggle selection
      if (d.wasSelected) this.clearSelection();
      return;
    }
    d.el.classList.remove('dragging');
    const to = this.squareFromEvent(e);
    if (to && to !== d.from && this.targets.some((t) => t.to === to)) {
      this.tryMove(d.from, to, d.el);
    } else {
      this.place(d.el, d.from); // snap back
      if (to === d.from) { /* stay selected */ } else this.clearSelection();
    }
  }

  onCancel(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    d.el.classList.remove('dragging');
    this.place(d.el, d.from);
  }

  async tryMove(from, to, dragEl) {
    const t = this.targets.find((x) => x.to === to);
    let promotion = null;
    if (t && t.promotion) {
      if (store.get('settings').autoQueen) promotion = 'q';
      else {
        if (dragEl) this.place(dragEl, from);
        promotion = await this.askPromotion(to, this.pieces[from].color);
        if (!promotion) { this.place(this.els.get(from), from); this.clearSelection(); return false; }
      }
    }
    this.clearSelection();
    this.locked = true;
    let ok = false;
    try {
      ok = await this.opts.onMove?.({ from, to, promotion });
    } catch (err) {
      console.error(err);
    }
    this.locked = false;
    if (!ok) {
      const el = this.els.get(from);
      if (el) this.place(el, from);
      this.shake(from);
    }
    return ok;
  }

  shake(sq) {
    const el = this.els.get(sq);
    if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  }

  // ---------------------------------------------------------- promotion
  askPromotion(to, color) {
    return new Promise((resolve) => {
      const { x, y } = this.xy(to);
      const goingDown = y === 0; // promoting on the top edge -> list grows downward
      const order = ['q', 'n', 'r', 'b'];
      // the tap that triggered the picker fires a click on whatever is now under the finger; ignore it
      let ghost = true; // cleared by a real pointerdown on the picker
      const openedAt = performance.now() + 400;
      this.overlay.hidden = false;
      this.overlay.innerHTML = '';
      this.overlay.classList.add('open');
      const wrap = document.createElement('div');
      wrap.className = 'promo';
      wrap.style.left = `${x * 12.5}%`;
      wrap.style.top = goingDown ? '0%' : '50%';
      order.forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'promo-btn';
        b.setAttribute('aria-label', 'Promote to ' + ({ q: 'queen', n: 'knight', r: 'rook', b: 'bishop' }[t]));
        b.innerHTML = pieceSvg(t, color);
        b.onclick = (ev) => { ev.stopPropagation(); if (ghost && performance.now() < openedAt) return; this.closePromotion(); resolve(t); };
        wrap.appendChild(b);
      });
      this.overlay.appendChild(wrap);
      this.overlay.onclick = () => { if (ghost && performance.now() < openedAt) return; this.closePromotion(); resolve(null); };
      this.overlay.onpointerdown = (ev) => { ghost = false; ev.stopPropagation(); };
      this._promoResolve = resolve;
    });
  }

  closePromotion() {
    if (!this.overlay) return;
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
    this.overlay.classList.remove('open');
    this.overlay.onclick = null;
  }
}

// Convert a Chess instance (rules.js) to the board's piece map.
export function piecesFromGame(game) {
  const out = {};
  for (const row of game.board()) for (const c of row) if (c) out[c.square] = { type: c.type, color: c.color };
  return out;
}

// Standard helper to wire legal moves of a Chess instance into a board.
export function legalTargetsFor(game, sq) {
  const moves = game.moves({ verbose: true, square: sq });
  const seen = new Set();
  const out = [];
  for (const m of moves) {
    if (seen.has(m.to)) continue;
    seen.add(m.to);
    out.push({ to: m.to, promotion: !!m.promotion, capture: m.flags.includes('c') || m.flags.includes('e') });
  }
  return out;
}
