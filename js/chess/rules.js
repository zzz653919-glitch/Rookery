// Rookery chess rules engine (original implementation, no dependencies).
// 0x88 board, make/unmake, full legality, SAN, FEN, draw detection.
// Verified against standard perft node counts (see tests/perft.test.mjs).

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const WHITE = 0, BLACK = 8;

// move flags
export const F_CAP = 1, F_EP = 2, F_DBL = 4, F_KS = 8, F_QS = 16, F_PROMO = 32;

const SYMBOLS = '.pnbrqk';
const KN = [-33, -31, -18, -14, 14, 18, 31, 33];
const KG = [-17, -16, -15, -1, 1, 15, 16, 17];
const BI = [-17, -15, 15, 17];
const RO = [-16, -1, 1, 16];

const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[4] = 15 & ~3; CASTLE_MASK[0] = 15 & ~2; CASTLE_MASK[7] = 15 & ~1;
CASTLE_MASK[116] = 15 & ~12; CASTLE_MASK[112] = 15 & ~8; CASTLE_MASK[119] = 15 & ~4;

// ---- Zobrist -------------------------------------------------------------
let seed = 0x9e3779b9;
function rnd() {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed >>> 0;
}
const ZP1 = [], ZP2 = [];
for (let p = 0; p < 16; p++) {
  ZP1.push(new Int32Array(128)); ZP2.push(new Int32Array(128));
  for (let s = 0; s < 128; s++) { ZP1[p][s] = rnd(); ZP2[p][s] = rnd(); }
}
const ZC1 = new Int32Array(16), ZC2 = new Int32Array(16);
for (let i = 0; i < 16; i++) { ZC1[i] = rnd(); ZC2[i] = rnd(); }
const ZE1 = new Int32Array(8), ZE2 = new Int32Array(8);
for (let i = 0; i < 8; i++) { ZE1[i] = rnd(); ZE2[i] = rnd(); }
const ZS1 = rnd(), ZS2 = rnd();

// ---- helpers --------------------------------------------------------------
export const sqToName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export const nameToSq = (n) => 'abcdefgh'.indexOf(n[0]) + (parseInt(n[1], 10) - 1) * 16;
export const mFrom = (m) => m & 127;
export const mTo = (m) => (m >> 7) & 127;
export const mPromo = (m) => (m >> 14) & 7;
export const mFlags = (m) => m >> 17;
export const mkMove = (from, to, promo, flags) => from | (to << 7) | (promo << 14) | (flags << 17);

const typeOf = (p) => p & 7;
const colorOf = (p) => p & 8;

export class Chess {
  constructor(fen = START_FEN) {
    this.load(fen);
  }

  // ------------------------------------------------------------ loading/FEN
  load(fen) {
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4) throw new Error('Invalid FEN: ' + fen);
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Invalid FEN rows');
    this.b = new Int8Array(128);
    this.ksq = [-1, -1];
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const lower = ch.toLowerCase();
        const t = SYMBOLS.indexOf(lower);
        if (t < 1 || f > 7) throw new Error('Invalid FEN piece: ' + ch);
        const color = ch === lower ? BLACK : WHITE;
        const sq = (7 - r) * 16 + f;
        this.b[sq] = t | color;
        if (t === K) this.ksq[color >> 3] = sq;
        f++;
      }
      if (f !== 8) throw new Error('Invalid FEN row width');
    }
    if (this.ksq[0] < 0 || this.ksq[1] < 0) throw new Error('FEN needs both kings');
    this.side = parts[1] === 'b' ? BLACK : WHITE;
    this.castling = 0;
    for (const c of parts[2]) {
      if (c === 'K') this.castling |= 1;
      else if (c === 'Q') this.castling |= 2;
      else if (c === 'k') this.castling |= 4;
      else if (c === 'q') this.castling |= 8;
    }
    // drop rights that do not match the pieces
    if (this.b[4] !== (K | WHITE)) this.castling &= ~3;
    if (this.b[7] !== (R | WHITE)) this.castling &= ~1;
    if (this.b[0] !== (R | WHITE)) this.castling &= ~2;
    if (this.b[116] !== (K | BLACK)) this.castling &= ~12;
    if (this.b[119] !== (R | BLACK)) this.castling &= ~4;
    if (this.b[112] !== (R | BLACK)) this.castling &= ~8;
    this.ep = parts[3] !== '-' && parts[3] ? nameToSq(parts[3]) : -1;
    this.half = parts[4] ? parseInt(parts[4], 10) || 0 : 0;
    this.fullmove = parts[5] ? parseInt(parts[5], 10) || 1 : 1;
    this.st = [];
    this.hist = [];       // verbose move objects
    this.startFen = fen;
    this.computeHash();
    this.keys = [this.curKey()];
    // the side NOT to move must not be in check
    if (this.attacked(this.ksq[(this.side ^ 8) >> 3], this.side)) {
      throw new Error('Invalid position: side not to move is in check');
    }
  }

  reset() { this.load(START_FEN); }

  fen() {
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.b[r * 16 + f];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        const ch = SYMBOLS[typeOf(p)];
        out += colorOf(p) === WHITE ? ch.toUpperCase() : ch;
      }
      if (empty) out += empty;
      if (r) out += '/';
    }
    let c = '';
    if (this.castling & 1) c += 'K';
    if (this.castling & 2) c += 'Q';
    if (this.castling & 4) c += 'k';
    if (this.castling & 8) c += 'q';
    return `${out} ${this.side === WHITE ? 'w' : 'b'} ${c || '-'} ${this.ep >= 0 ? sqToName(this.ep) : '-'} ${this.half} ${this.fullmove}`;
  }

  computeHash() {
    let h1 = 0, h2 = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = this.b[s];
      if (p) { h1 ^= ZP1[p][s]; h2 ^= ZP2[p][s]; }
    }
    h1 ^= ZC1[this.castling]; h2 ^= ZC2[this.castling];
    if (this.side === BLACK) { h1 ^= ZS1; h2 ^= ZS2; }
    this.h1 = h1; this.h2 = h2;
  }

  // Position key including a capturable en-passant square (for repetition / TT)
  curKey() {
    let h1 = this.h1, h2 = this.h2;
    if (this.ep >= 0) {
      const us = this.side;
      const dir = us === WHITE ? -16 : 16;
      const a = this.ep + dir - 1, c = this.ep + dir + 1;
      if ((!(a & 0x88) && this.b[a] === (P | us)) || (!(c & 0x88) && this.b[c] === (P | us))) {
        h1 ^= ZE1[this.ep & 7]; h2 ^= ZE2[this.ep & 7];
      }
    }
    return (h2 >>> 11) * 4294967296 + (h1 >>> 0);
  }

  // ------------------------------------------------------------- attacks
  attacked(sq, by) {
    const b = this.b;
    let s;
    if (by === WHITE) {
      s = sq - 15; if (!(s & 0x88) && b[s] === P) return true;
      s = sq - 17; if (!(s & 0x88) && b[s] === P) return true;
    } else {
      s = sq + 15; if (!(s & 0x88) && b[s] === (P | 8)) return true;
      s = sq + 17; if (!(s & 0x88) && b[s] === (P | 8)) return true;
    }
    for (let i = 0; i < 8; i++) {
      s = sq + KN[i]; if (!(s & 0x88) && b[s] === (N | by)) return true;
      s = sq + KG[i]; if (!(s & 0x88) && b[s] === (K | by)) return true;
    }
    for (let i = 0; i < 4; i++) {
      let o = BI[i]; s = sq + o;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) { if (p === (B | by) || p === (Q | by)) return true; break; }
        s += o;
      }
      o = RO[i]; s = sq + o;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) { if (p === (R | by) || p === (Q | by)) return true; break; }
        s += o;
      }
    }
    return false;
  }

  inCheck() { return this.attacked(this.ksq[this.side >> 3], this.side ^ 8); }

  // Null move (pass) used by the search engine only.
  makeNull() {
    (this.nst || (this.nst = [])).push(this.ep, this.half, this.h1, this.h2);
    this.ep = -1;
    this.half++;
    this.side ^= 8;
    this.h1 ^= ZS1; this.h2 ^= ZS2;
    this.keys.push(this.curKey());
  }

  unmakeNull() {
    this.keys.pop();
    const n = this.nst;
    this.h2 = n.pop(); this.h1 = n.pop(); this.half = n.pop(); this.ep = n.pop();
    this.side ^= 8;
  }

  // ------------------------------------------------------ move generation
  // Pseudo-legal moves (castling squares are fully validated here).
  gen(capturesOnly = false) {
    const moves = [];
    const b = this.b, us = this.side, them = us ^ 8;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p || colorOf(p) !== us) continue;
      const t = typeOf(p);
      if (t === P) {
        const dir = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const lastRank = us === WHITE ? 7 : 0;
        let to = sq + dir;
        if (!(to & 0x88) && !b[to]) {
          if ((to >> 4) === lastRank) {
            for (const pr of [Q, R, B, N]) moves.push(mkMove(sq, to, pr, F_PROMO));
          } else if (!capturesOnly) {
            moves.push(mkMove(sq, to, 0, 0));
            if ((sq >> 4) === startRank && !b[to + dir]) moves.push(mkMove(sq, to + dir, 0, F_DBL));
          }
        }
        for (const d of [dir - 1, dir + 1]) {
          to = sq + d;
          if (to & 0x88) continue;
          const tp = b[to];
          if (tp && colorOf(tp) === them) {
            if ((to >> 4) === lastRank) {
              for (const pr of [Q, R, B, N]) moves.push(mkMove(sq, to, pr, F_PROMO | F_CAP));
            } else moves.push(mkMove(sq, to, 0, F_CAP));
          } else if (to === this.ep) {
            moves.push(mkMove(sq, to, 0, F_EP | F_CAP));
          }
        }
      } else if (t === N || t === K) {
        const offs = t === N ? KN : KG;
        for (let i = 0; i < 8; i++) {
          const to = sq + offs[i];
          if (to & 0x88) continue;
          const tp = b[to];
          if (!tp) { if (!capturesOnly) moves.push(mkMove(sq, to, 0, 0)); }
          else if (colorOf(tp) === them) moves.push(mkMove(sq, to, 0, F_CAP));
        }
        if (t === K && !capturesOnly) this.genCastles(moves, sq, us, them);
      } else {
        const offs = t === B ? BI : t === R ? RO : KG;
        const n = offs.length;
        for (let i = 0; i < n; i++) {
          const o = offs[i];
          // queen uses all 8 king offsets; bishops/rooks 4
          let to = sq + o;
          while (!(to & 0x88)) {
            const tp = b[to];
            if (!tp) { if (!capturesOnly) moves.push(mkMove(sq, to, 0, 0)); }
            else {
              if (colorOf(tp) === them) moves.push(mkMove(sq, to, 0, F_CAP));
              break;
            }
            to += o;
          }
        }
      }
    }
    return moves;
  }

  genCastles(moves, sq, us, them) {
    const b = this.b;
    const base = us === WHITE ? 0 : 112;
    if (sq !== base + 4) return;
    const ksR = us === WHITE ? 1 : 4, qsR = us === WHITE ? 2 : 8;
    if (!(this.castling & (ksR | qsR))) return;
    if (this.attacked(sq, them)) return;
    if ((this.castling & ksR) && !b[base + 5] && !b[base + 6] &&
        b[base + 7] === (R | us) &&
        !this.attacked(base + 5, them) && !this.attacked(base + 6, them)) {
      moves.push(mkMove(sq, base + 6, 0, F_KS));
    }
    if ((this.castling & qsR) && !b[base + 3] && !b[base + 2] && !b[base + 1] &&
        b[base + 0] === (R | us) &&
        !this.attacked(base + 3, them) && !this.attacked(base + 2, them)) {
      moves.push(mkMove(sq, base + 2, 0, F_QS));
    }
  }

  legalMoves() {
    const out = [];
    const us = this.side;
    for (const m of this.gen()) {
      this.make(m);
      if (!this.attacked(this.ksq[us >> 3], us ^ 8)) out.push(m);
      this.unmake();
    }
    return out;
  }

  // ----------------------------------------------------------- make/unmake
  make(m) {
    const b = this.b;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
    const us = this.side;
    const piece = b[from];
    let cap = b[to];
    let h1 = this.h1, h2 = this.h2;
    this.st.push(m, cap, this.castling, this.ep, this.half, this.h1, this.h2);

    h1 ^= ZP1[piece][from]; h2 ^= ZP2[piece][from];
    if (fl & F_EP) {
      const capSq = to + (us === WHITE ? -16 : 16);
      cap = b[capSq];
      b[capSq] = 0;
      h1 ^= ZP1[cap][capSq]; h2 ^= ZP2[cap][capSq];
      this.st[this.st.length - 6] = cap;
    } else if (cap) {
      h1 ^= ZP1[cap][to]; h2 ^= ZP2[cap][to];
    }
    const placed = promo ? (promo | us) : piece;
    b[to] = placed;
    b[from] = 0;
    h1 ^= ZP1[placed][to]; h2 ^= ZP2[placed][to];

    if (fl & F_KS) {
      const rf = to + 1, rt = to - 1, rook = R | us;
      b[rt] = rook; b[rf] = 0;
      h1 ^= ZP1[rook][rf] ^ ZP1[rook][rt]; h2 ^= ZP2[rook][rf] ^ ZP2[rook][rt];
    } else if (fl & F_QS) {
      const rf = to - 2, rt = to + 1, rook = R | us;
      b[rt] = rook; b[rf] = 0;
      h1 ^= ZP1[rook][rf] ^ ZP1[rook][rt]; h2 ^= ZP2[rook][rf] ^ ZP2[rook][rt];
    }
    if (typeOf(piece) === K) this.ksq[us >> 3] = to;

    const oldC = this.castling;
    this.castling = oldC & CASTLE_MASK[from] & CASTLE_MASK[to];
    h1 ^= ZC1[oldC] ^ ZC1[this.castling]; h2 ^= ZC2[oldC] ^ ZC2[this.castling];

    this.ep = (fl & F_DBL) ? from + (us === WHITE ? 16 : -16) : -1;
    this.half = (typeOf(piece) === P || cap) ? 0 : this.half + 1;
    if (us === BLACK) this.fullmove++;
    this.side = us ^ 8;
    h1 ^= ZS1; h2 ^= ZS2;
    this.h1 = h1; this.h2 = h2;
    this.keys.push(this.curKey());
  }

  unmake() {
    const st = this.st;
    const h2 = st.pop(), h1 = st.pop(), half = st.pop(), ep = st.pop(),
      castling = st.pop(), cap = st.pop(), m = st.pop();
    this.keys.pop();
    const b = this.b;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
    this.side ^= 8;
    const us = this.side;
    if (us === BLACK) this.fullmove--;
    const placed = b[to];
    const piece = promo ? (P | us) : placed;
    b[from] = piece;
    if (fl & F_EP) {
      b[to] = 0;
      b[to + (us === WHITE ? -16 : 16)] = cap;
    } else {
      b[to] = cap;
    }
    if (fl & F_KS) { const rook = R | us; b[to + 1] = rook; b[to - 1] = 0; }
    else if (fl & F_QS) { const rook = R | us; b[to - 2] = rook; b[to + 1] = 0; }
    if (typeOf(piece) === K) this.ksq[us >> 3] = from;
    this.castling = castling; this.ep = ep; this.half = half;
    this.h1 = h1; this.h2 = h2;
  }

  // ------------------------------------------------------------ game state
  isCheckmate() { return this.inCheck() && this.legalMoves().length === 0; }
  isStalemate() { return !this.inCheck() && this.legalMoves().length === 0; }

  isInsufficientMaterial() {
    const minors = [];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = this.b[s];
      if (!p) continue;
      const t = typeOf(p);
      if (t === K) continue;
      if (t === P || t === R || t === Q) return false;
      minors.push({ t, color: (((s >> 4) + (s & 7)) & 1) });
    }
    if (minors.length <= 1) return true; // K vs K, K+minor vs K
    // only bishops, all on the same square colour
    if (minors.every((x) => x.t === B && x.color === minors[0].color)) return true;
    return false;
  }

  isThreefoldRepetition() {
    const cur = this.keys[this.keys.length - 1];
    let n = 0;
    for (const k of this.keys) if (k === cur) n++;
    return n >= 3;
  }

  isFiftyMoveDraw() { return this.half >= 100; }

  isDraw() {
    if (this.isCheckmate()) return false;
    return this.isStalemate() || this.isInsufficientMaterial() ||
      this.isThreefoldRepetition() || this.isFiftyMoveDraw();
  }

  isGameOver() { return this.isCheckmate() || this.isDraw(); }

  // Returns { over, result: '1-0'|'0-1'|'1/2-1/2'|'*', reason }
  status() {
    if (this.isCheckmate()) {
      return { over: true, result: this.side === WHITE ? '0-1' : '1-0', reason: 'checkmate', winner: this.side === WHITE ? 'b' : 'w' };
    }
    if (this.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate', winner: null };
    if (this.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient material', winner: null };
    if (this.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', reason: 'threefold repetition', winner: null };
    if (this.isFiftyMoveDraw()) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', winner: null };
    return { over: false, result: '*', reason: '', winner: null };
  }

  // ------------------------------------------------------------ public API
  turn() { return this.side === WHITE ? 'w' : 'b'; }

  get(name) {
    const p = this.b[nameToSq(name)];
    if (!p) return null;
    return { type: SYMBOLS[typeOf(p)], color: colorOf(p) === WHITE ? 'w' : 'b' };
  }

  board() {
    const out = [];
    for (let r = 7; r >= 0; r--) {
      const row = [];
      for (let f = 0; f < 8; f++) {
        const s = r * 16 + f;
        const p = this.b[s];
        row.push(p ? { square: sqToName(s), type: SYMBOLS[typeOf(p)], color: colorOf(p) === WHITE ? 'w' : 'b' } : null);
      }
      out.push(row);
    }
    return out;
  }

  describe(m, legals) {
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const piece = this.b[from];
    const color = colorOf(piece) === WHITE ? 'w' : 'b';
    let captured = null;
    if (fl & F_EP) captured = 'p';
    else if (this.b[to]) captured = SYMBOLS[typeOf(this.b[to])];
    let f = '';
    if (fl & F_CAP) f += 'c';
    if (fl & F_EP) f += 'e';
    if (fl & F_DBL) f += 'b';
    if (fl & F_KS) f += 'k';
    if (fl & F_QS) f += 'q';
    if (fl & F_PROMO) f += 'p';
    if (!f) f = 'n';
    return {
      m, color, from: sqToName(from), to: sqToName(to),
      piece: SYMBOLS[typeOf(piece)], captured,
      promotion: promo ? SYMBOLS[promo] : undefined,
      flags: f, san: this.san(m, legals),
    };
  }

  san(m, legals) {
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const piece = this.b[from], t = typeOf(piece);
    let s;
    if (fl & F_KS) s = 'O-O';
    else if (fl & F_QS) s = 'O-O-O';
    else {
      s = '';
      if (t !== P) {
        s += SYMBOLS[t].toUpperCase();
        legals = legals || this.legalMoves();
        let needFile = false, needRank = false, ambiguous = false;
        for (const o of legals) {
          if (o === m) continue;
          if (mTo(o) !== to || mFrom(o) === from) continue;
          if (typeOf(this.b[mFrom(o)]) !== t) continue;
          ambiguous = true;
          if ((mFrom(o) & 7) === (from & 7)) needRank = true; else needFile = true;
        }
        if (ambiguous) {
          if (needFile || !needRank) s += 'abcdefgh'[from & 7];
          if (needRank) s += (from >> 4) + 1;
        }
      } else if (fl & F_CAP) {
        s += 'abcdefgh'[from & 7];
      }
      if (fl & F_CAP) s += 'x';
      s += sqToName(to);
      if (promo) s += '=' + SYMBOLS[promo].toUpperCase();
    }
    this.make(m);
    if (this.inCheck()) s += this.legalMoves().length === 0 ? '#' : '+';
    this.unmake();
    return s;
  }

  // moves({verbose, square}) like chess.js
  moves(opts = {}) {
    const legals = this.legalMoves();
    let list = legals;
    if (opts.square) {
      const sq = nameToSq(opts.square);
      list = legals.filter((m) => mFrom(m) === sq);
    }
    if (opts.verbose) return list.map((m) => this.describe(m, legals));
    return list.map((m) => this.san(m, legals));
  }

  // move('e4') | move({from,to,promotion}) -> verbose move or null
  move(input) {
    const legals = this.legalMoves();
    let found = null;
    if (typeof input === 'string') {
      const clean = input.replace(/[+#!?]+$/g, '').replace(/0/g, 'O');
      for (const m of legals) {
        if (this.san(m, legals).replace(/[+#]+$/g, '') === clean) { found = m; break; }
      }
      if (!found) {
        const mm = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(clean.toLowerCase());
        if (mm) input = { from: mm[1], to: mm[2], promotion: mm[3] };
      }
    }
    if (!found && input && typeof input === 'object') {
      const from = nameToSq(input.from), to = nameToSq(input.to);
      const promo = input.promotion ? SYMBOLS.indexOf(input.promotion.toLowerCase()) : 0;
      for (const m of legals) {
        if (mFrom(m) !== from || mTo(m) !== to) continue;
        if (mFlags(m) & F_PROMO) { if (mPromo(m) === (promo || Q)) { found = m; break; } }
        else { found = m; break; }
      }
    }
    if (!found) return null;
    const desc = this.describe(found, legals);
    desc.before = this.fen();
    this.make(found);
    desc.after = this.fen();
    this.hist.push(desc);
    return desc;
  }

  undo() {
    if (!this.hist.length) return null;
    const d = this.hist.pop();
    this.unmake();
    return d;
  }

  history(opts = {}) {
    return opts.verbose ? this.hist.slice() : this.hist.map((h) => h.san);
  }

  captured() {
    const out = { w: [], b: [] }; // pieces captured BY each colour
    for (const h of this.hist) if (h.captured) out[h.color].push(h.captured);
    return out;
  }

  // Squares of the king that is in check, or null
  checkSquare() {
    if (!this.inCheck()) return null;
    return sqToName(this.ksq[this.side >> 3]);
  }

  pgn(headers = {}) {
    const h = Object.assign({
      Event: 'Rookery game', Site: 'Rookery', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      Round: '-', White: 'White', Black: 'Black', Result: this.status().result,
    }, headers);
    if (this.startFen !== START_FEN) { h.SetUp = '1'; h.FEN = this.startFen; }
    let out = Object.entries(h).map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n') + '\n\n';
    const parts = [];
    const startMove = (() => { const p = this.startFen.split(' '); return parseInt(p[5], 10) || 1; })();
    const startBlack = this.startFen.split(' ')[1] === 'b';
    this.hist.forEach((mv, i) => {
      const ply = i + (startBlack ? 1 : 0);
      const num = startMove + Math.floor(ply / 2);
      if (ply % 2 === 0) parts.push(`${num}. ${mv.san}`);
      else parts.push(i === 0 ? `${num}... ${mv.san}` : mv.san);
    });
    out += parts.join(' ') + (parts.length ? ' ' : '') + h.Result;
    return out;
  }
}

export function perft(game, depth) {
  if (depth === 0) return 1;
  const moves = game.legalMoves();
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    game.make(m);
    n += perft(game, depth - 1);
    game.unmake();
  }
  return n;
}

// Parse a PGN movetext (simple: headers, comments, variations stripped)
export function loadPgn(text) {
  const headers = {};
  for (const m of text.matchAll(/^\[(\w+)\s+"(.*)"\]\s*$/gm)) headers[m[1]] = m[2];
  let body = text.replace(/^\[.*\]\s*$/gm, '');
  body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  let prev;
  do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);
  body = body.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ');
  const tokens = body.split(/\s+/).filter(Boolean).filter((t) => !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  const game = new Chess(headers.FEN || START_FEN);
  for (const t of tokens) {
    if (!game.move(t)) throw new Error('Illegal or unreadable move in PGN: ' + t);
  }
  return { game, headers };
}
