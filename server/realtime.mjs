// Minimal WebSocket server (RFC 6455) on top of node:http — no dependencies.
// Used for live pushes (game state, "you were matched") and for sending moves with the lowest latency.
// Everything a WebSocket can do is also available over plain HTTP, so hosts without WebSocket support still work (the client polls).
import { createHash } from 'node:crypto';
import { parseCookies, clientIp } from './http.mjs';
import { loadUserSession, USER_COOKIE } from './accounts.mjs';
import { rateLimit } from './security.mjs';
import { getDb } from './db.mjs';
import * as G from './games.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 64 * 1024;
const subs = new Map();        // game id -> Set<conn>
const userConns = new Map();   // user id -> Set<conn>

function encode(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const n = body.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([head, body]);
}

class Conn {
  constructor(socket, user, ip) {
    this.socket = socket; this.user = user; this.ip = ip; this.buf = Buffer.alloc(0); this.frag = null; this.games = new Set(); this.alive = true; this.closed = false;
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.cleanup());
    socket.on('error', () => this.cleanup());
  }
  send(obj) { if (!this.closed) try { this.socket.write(encode(0x1, JSON.stringify(obj))); } catch { this.cleanup(); } }
  close(code = 1000) { if (this.closed) return; try { this.socket.write(encode(0x8, Buffer.from([code >> 8, code & 255]))); this.socket.end(); } catch { /* ignore */ } this.cleanup(); }
  cleanup() {
    if (this.closed) return; this.closed = true;
    for (const id of this.games) subs.get(id)?.delete(this);
    if (this.user) { userConns.get(this.user.id)?.delete(this); }
    try { this.socket.destroy(); } catch { /* ignore */ }
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = !!(b0 & 0x80), opcode = b0 & 0x0f, masked = !!(b1 & 0x80);
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const big = this.buf.readBigUInt64BE(2); if (big > BigInt(MAX_PAYLOAD)) return this.close(1009); len = Number(big); off = 10; }
      if (!masked) return this.close(1002);                       // clients must mask
      if (len > MAX_PAYLOAD) return this.close(1009);
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (opcode === 0x8) return this.close(1000);
      if (opcode === 0x9) { this.socket.write(encode(0xA, payload)); continue; }
      if (opcode === 0xA) { this.alive = true; continue; }
      if (opcode === 0x1 || opcode === 0x2) { this.frag = { op: opcode, parts: [payload] }; } else if (opcode === 0x0 && this.frag) { this.frag.parts.push(payload); } else return this.close(1002);
      if (this.frag.parts.reduce((a, p) => a + p.length, 0) > MAX_PAYLOAD) return this.close(1009);
      if (fin) { const msg = Buffer.concat(this.frag.parts); const op = this.frag.op; this.frag = null; if (op === 0x1) this.onMessage(msg.toString('utf8')); }
    }
  }
  async onMessage(text) {
    if (!rateLimit('ws:' + this.ip + ':' + (this.user?.id || ''), 60, 10000)) return this.send({ t: 'error', error: 'Slow down.' });
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const ref = m.ref;
    const fail = (e) => this.send({ t: 'error', ref, error: e?.status ? e.message : 'Something went wrong.' });
    try {
      if (m.t === 'ping') return this.send({ t: 'pong' });
      if (m.t === 'sub' && typeof m.game === 'string' && /^[a-z0-9]{8}$/.test(m.game)) {
        if (this.games.size >= 10) return;
        this.games.add(m.game); if (!subs.has(m.game)) subs.set(m.game, new Set()); subs.get(m.game).add(this);
        const v = await G.getViewWithNames(m.game); if (v) this.send({ t: 'game', game: v });
        return;
      }
      if (m.t === 'unsub') { this.games.delete(m.game); subs.get(m.game)?.delete(this); return; }
      if (!this.user) return this.send({ t: 'error', ref, error: 'Sign in to continue.' });
      if (m.t === 'move') { await G.playMove(this.user, m.game, m.move); return this.send({ t: 'ok', ref }); }
      if (m.t === 'resign') { await G.resign(this.user, m.game); return this.send({ t: 'ok', ref }); }
      if (m.t === 'draw') { await G.drawAction(this.user, m.game, m.action); return this.send({ t: 'ok', ref }); }
    } catch (e) { fail(e); }
  }
}

async function pushGame(id) {
  const set = subs.get(id);
  if (!set || !set.size) return;
  try {
    const v = await G.getViewWithNames(id);
    if (!v) return;
    for (const c of set) c.send({ t: 'game', game: v });
  } catch { /* the game vanished */ }
}

export function attachRealtime(server) {
  G.events.on('game', (id) => { pushGame(id); });
  G.events.on('queue', async (gameId) => {
    try {
      const row = await G.loadGame(gameId); if (!row) return;
      for (const uid of [row.white_id, row.black_id]) for (const c of userConns.get(uid) || []) c.send({ t: 'matched', gameId });
    } catch { /* ignore */ }
  });
  server.on('upgrade', async (req, socket) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    const origin = req.headers.origin;
    const key = req.headers['sec-websocket-key'];
    if (String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); return socket.destroy(); }
    // browsers always send Origin; it must be this site (blocks cross-site WebSocket hijacking)
    if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch { /* bad origin */ } if (!ok) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); } }
    let user = null;
    try { const us = await loadUserSession(parseCookies(req)[USER_COOKIE]); if (us && !us.user.banned) user = us.user; } catch { /* anonymous spectator */ }
    const ip = clientIp(req);
    if (!rateLimit('wsconn:' + ip, 40, 60000)) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return socket.destroy(); }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    const c = new Conn(socket, user, ip);
    if (user) { if (!userConns.has(user.id)) userConns.set(user.id, new Set()); userConns.get(user.id).add(c); }
    c.send({ t: 'hello', user: user ? { id: user.id, username: user.username } : null });
  });
  // keep-alive and flag-fall sweeper
  const beat = setInterval(() => {
    for (const set of subs.values()) for (const c of set) { if (!c.alive) { c.close(1001); continue; } c.alive = false; try { c.socket.write(encode(0x9, '')); } catch { /* closed */ } }
  }, 25000); beat.unref();
  const sweep = setInterval(() => { G.sweepClocks().catch(() => {}); }, 2000); sweep.unref();
}
