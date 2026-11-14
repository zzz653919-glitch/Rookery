// A mock of the upstream services Chess World talks to (Lichess broadcasts, FIDE ratings via Lichess, Wikipedia, an Atom feed).
import { createServer } from 'node:http';
import { freePort } from './server.mjs';

export const T0 = Date.now();
export const iso = (ms) => new Date(ms).toISOString();
const pgn = (o) => `[Event "${o.event}"]\n[Site "https://lichess.org/broadcast/x/round-1/${o.round}/${o.id}"]\n[Date "2026.10.0${o.day}"]\n[Round "${o.rnd}"]\n[White "${o.w}"]\n[Black "${o.b}"]\n[Result "${o.res}"]\n[WhiteElo "${o.we}"]\n[BlackElo "${o.be}"]\n[WhiteFideId "${o.wf}"]\n[BlackFideId "${o.bf}"]\n[WhiteTitle "GM"]\n[ECO "C60"]\n[Opening "Ruy Lopez"]\n[GameURL "https://lichess.org/broadcast/x/round-1/${o.round}/${o.id}"]\n\n${o.moves} ${o.res}\n`;
const M1 = '1. e4 { [%eval 0.2] [%clk 1:30:00] } 1... e5 { [%eval 0.1] [%clk 1:29:50] } 2. Nf3 { [%eval 0.3] [%clk 1:29:40] } 2... Nc6 { [%eval 0.2] [%clk 1:29:30] } 3. Bb5 { [%eval 0.3] [%clk 1:29:20] } 3... a6 { [%eval #-3] [%clk 1:29:10] }';
export const R1 = [
  pgn({ event: 'Mock Open', round: 'RND00001', id: 'game0001', day: 1, rnd: '1.1', w: 'Alpha, Anna', b: 'Beta, Boris', res: '1-0', we: 2700, be: 2650, wf: 1001, bf: 1002, moves: M1 }),
  pgn({ event: 'Mock Open', round: 'RND00001', id: 'game0002', day: 1, rnd: '1.2', w: 'Gamma, Gus', b: 'Delta, Dina', res: '1/2-1/2', we: 2600, be: 2610, wf: 1003, bf: 1004, moves: '1. d4 d5 2. c4 e6 3. Nc3 Nf6' }),
].join('\n');
const R2 = [
  pgn({ event: 'Mock Open', round: 'RND00002', id: 'game0003', day: 2, rnd: '2.1', w: 'Beta, Boris', b: 'Gamma, Gus', res: '0-1', we: 2650, be: 2600, wf: 1002, bf: 1003, moves: '1. e4 c5 2. Nf3 d6' }),
  pgn({ event: 'Mock Open', round: 'RND00002', id: 'game0004', day: 2, rnd: '2.2', w: 'Delta, Dina', b: 'Alpha, Anna', res: '0-1', we: 2610, be: 2700, wf: 1004, bf: 1001, moves: '1. c4 e5 2. Nc3 Nf6' }),
].join('\n');
const LIVE = pgn({ event: 'Live Open', round: 'LIVE0001', id: 'livegm01', day: 3, rnd: '5.1', w: 'Live, Lena', b: 'Wire, Wim', res: '*', we: 2500, be: 2480, wf: 2001, bf: 2002, moves: '1. e4 { [%clk 0:59:00] } 1... c5 { [%clk 0:58:30] } 2. Nf3 { [%clk 0:58:40] }' }).replace('\n\n1. e4', '\n\n1. e4');

const tour = (id, name, extra = {}) => ({ id, name, slug: name.toLowerCase().replace(/\W+/g, '-'), info: { format: '9-round Swiss', tc: '90 min + 30 sec', fideTC: 'standard', location: 'Tashkent, Uzbekistan', players: 'Alpha, Beta', website: 'https://example.org/', standings: 'https://example.org/standings' }, createdAt: T0, url: `https://lichess.org/broadcast/x/${id}`, tier: 4, dates: [T0 - 86400000 * 2, T0 + 86400000], ...extra });
export const mock = { down: false, hits: {} };
let mockSrv;
export const stopMock = () => mockSrv?.close();
export async function startMock() {
  const port = await freePort();
  mockSrv = createServer((req, res) => {
    const url = new URL(req.url, 'http://x'); const p = url.pathname; mock.hits[p] = (mock.hits[p] || 0) + 1;
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    if (mock.down) return send(503, 'down', 'text/plain');
    if (p === '/api/broadcast/top') return send(200, {
      active: [{ tour: tour('LIVE0001', 'Live Open 2026', { image: 'https://img.example/live.webp' }), round: { id: 'LIVE0001R5', name: 'Round 5', ongoing: true, startsAt: T0 - 3600000, url: 'https://lichess.org/x' } }],
      upcoming: [{ tour: tour('UPC00001', 'Uzbekistan Championship 2027', { dates: [T0 + 86400000 * 5, T0 + 86400000 * 12], info: { format: 'Round robin', location: 'Samarkand, Uzbekistan', fideTC: 'rapid' } }), round: { id: 'UPCR1', name: 'Round 1', startsAt: T0 + 86400000 * 5 } }],
      past: { currentPage: 1, maxPerPage: 24, currentPageResults: [{ tour: tour('PAST0001', 'Mock Open 2026', { dates: [T0 - 86400000 * 9, T0 - 86400000 * 8] }), round: { id: 'RND00002', name: 'Round 2', finished: true } }], nextPage: null },
    });
    if (p === '/api/broadcast/PAST0001') return send(200, { tour: tour('PAST0001', 'Mock Open 2026'), rounds: [{ id: 'RND00001', name: 'Round 1', finished: true, startsAt: T0 - 86400000 * 9, url: 'u1' }, { id: 'RND00002', name: 'Round 2', finished: true, startsAt: T0 - 86400000 * 8, url: 'u2' }] });
    if (p === '/api/broadcast/LIVE0001') return send(200, { tour: tour('LIVE0001', 'Live Open 2026'), rounds: [{ id: 'LIVE0001R5', name: 'Round 5', ongoing: true, startsAt: T0 - 3600000, url: 'https://lichess.org/x' }] });
    if (p === '/api/broadcast/round/RND00001.pgn') return send(200, R1, 'application/x-chess-pgn');
    if (p === '/api/broadcast/round/RND00002.pgn') return send(200, R2, 'application/x-chess-pgn');
    if (p === '/api/broadcast/round/LIVE0001R5.pgn') return send(200, LIVE, 'application/x-chess-pgn');
    if (p === '/api/broadcast/search') return send(200, { currentPage: 1, currentPageResults: [] });
    if (p === '/api/fide/player/1503014') return send(200, { id: 1503014, name: 'Carlsen, Magnus', federation: 'NOR', year: 1990, title: 'GM', standard: 2800, rapid: 2790, blitz: 2850, photo: { medium: 'https://img.example/mc.webp', credit: 'Photographer' } });
    if (p === '/api/fide/player/14204118') return send(200, { id: 14204118, name: 'Someone, Else', federation: 'XXX', title: 'GM', standard: 2000 }); // wrong person for the id: must not be shown
    if (p === '/api/rest_v1/page/summary/Magnus_Carlsen') return send(200, { type: 'standard', extract: 'Magnus Carlsen is a Norwegian chess grandmaster.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Magnus_Carlsen' } }, thumbnail: { source: 'https://img.example/wiki.jpg' } });
    if (p === '/feed.atom') return send(200, `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Mock Chess</title>
      <entry><id>urn:mock:1</id><published>2026-11-10T10:00:00Z</published><link rel="alternate" href="https://example.org/a1"/><title>FIDE announces new rules</title><summary type="html">&lt;p&gt;The council &lt;b&gt;approved&lt;/b&gt; changes.&lt;/p&gt;</summary><media:thumbnail url="https://img.example/a1.jpg"/></entry>
      <entry><id>urn:mock:2</id><published>2026-11-11T10:00:00Z</published><link rel="alternate" href="https://example.org/a2"/><title>Uzbek grandmaster wins</title><content type="html">&lt;img src=&quot;https://img.example/a2.jpg&quot;/&gt;&lt;p&gt;A great result.&lt;/p&gt;</content></entry></feed>`, 'application/atom+xml');
    send(404, { error: 'not found' });
  });
  await new Promise((r) => mockSrv.listen(port, '127.0.0.1', r));
  return `http://127.0.0.1:${port}`;
}

