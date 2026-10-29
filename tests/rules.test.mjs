import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, loadPgn, START_FEN } from '../js/chess/rules.js';

const play = (g, ...sans) => sans.forEach((s) => assert.ok(g.move(s), `move ${s} should be legal`));

test('fool\'s mate is checkmate with SAN #', () => {
  const g = new Chess();
  play(g, 'f3', 'e5', 'g4', 'Qh4#');
  assert.ok(g.isCheckmate());
  assert.equal(g.status().result, '0-1');
  assert.equal(g.status().reason, 'checkmate');
  assert.equal(g.moves().length, 0);
});

test('scholar\'s mate', () => {
  const g = new Chess();
  play(g, 'e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#');
  assert.equal(g.status().result, '1-0');
});

test('stalemate detection', () => {
  const g = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.ok(g.isStalemate());
  assert.equal(g.status().result, '1/2-1/2');
  assert.equal(g.status().reason, 'stalemate');
});

test('castling both sides, rights lost after king move', () => {
  const g = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const sans = g.moves();
  assert.ok(sans.includes('O-O') && sans.includes('O-O-O'));
  play(g, 'O-O');
  assert.equal(g.get('g1').type, 'k');
  assert.equal(g.get('f1').type, 'r');
  // Black to move: the white rook now on f1 attacks f8, so only queenside is legal.
  assert.ok(!g.moves().includes('O-O'), 'f8 is attacked by the rook on f1');
  assert.ok(g.moves().includes('O-O-O'));
  play(g, 'O-O-O');
  assert.equal(g.get('c8').type, 'k');
  assert.equal(g.get('d8').type, 'r');
  assert.ok(!g.fen().split(' ')[2].match(/[KQkq]/), 'all rights gone');
});

test('cannot castle through check or out of check', () => {
  // black rook on f8 attacks f1: no kingside castling
  const g = new Chess('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  const sans = g.moves();
  assert.ok(!sans.includes('O-O'));
  assert.ok(sans.includes('O-O-O'));
  const h = new Chess('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1'); // in check
  assert.ok(!h.moves().includes('O-O') && !h.moves().includes('O-O-O'));
});

test('en passant is available for one move only', () => {
  const g = new Chess();
  play(g, 'e4', 'a6', 'e5', 'd5');
  assert.ok(g.moves().includes('exd6'));
  const mv = g.move('exd6');
  assert.equal(mv.flags.includes('e'), true);
  assert.equal(mv.captured, 'p');
  assert.equal(g.get('d5'), null, 'captured pawn removed');
  const h = new Chess();
  play(h, 'e4', 'a6', 'e5', 'd5', 'Nf3', 'a5');
  assert.ok(!h.moves().includes('exd6'));
});

test('en passant that would expose own king is illegal', () => {
  // Classic: pawn pinned horizontally along the rank
  const g = new Chess('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
  assert.ok(!g.moves().includes('exd6'));
});

test('promotion generates four choices and applies the chosen piece', () => {
  const g = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const promos = g.moves({ verbose: true }).filter((m) => m.from === 'a7');
  assert.deepEqual(promos.map((m) => m.promotion).sort(), ['b', 'n', 'q', 'r']);
  const mv = g.move({ from: 'a7', to: 'a8', promotion: 'n' });
  assert.equal(mv.san, 'a8=N');
  assert.equal(g.get('a8').type, 'n');
  g.undo();
  assert.equal(g.get('a7').type, 'p');
});

test('promotion with capture and check/mate suffixes', () => {
  const g = new Chess('1n5k/P7/8/8/8/8/8/K7 w - - 0 1');
  const mv = g.move({ from: 'a7', to: 'b8', promotion: 'q' });
  assert.equal(mv.san, 'bxa8'.replace('bxa8', 'axb8=Q+'));
});

test('SAN disambiguation', () => {
  const g = new Chess('4k3/8/8/8/8/4K3/8/R6R w - - 0 1');
  const sans = g.moves();
  assert.ok(sans.includes('Rad1') && sans.includes('Rhd1'));
  assert.ok(!sans.includes('Rd1'));
  const h = new Chess('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1');
  assert.ok(h.moves().includes('R1a3') || h.moves().includes('R5a3'));
});

test('threefold repetition', () => {
  const g = new Chess();
  play(g, 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8');
  assert.ok(g.isThreefoldRepetition());
  assert.equal(g.status().reason, 'threefold repetition');
});

test('fifty-move rule', () => {
  const g = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 100 80');
  assert.equal(g.status().reason, 'fifty-move rule');
  const h = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
  assert.equal(h.status().over, false);
});

test('insufficient material', () => {
  for (const fen of [
    '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    '4k3/8/8/8/8/8/8/3BK3 w - - 0 1',
    '4k3/8/8/8/8/8/8/3NK3 w - - 0 1',
    '4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1', // bishops on same colour
  ]) assert.ok(new Chess(fen).isInsufficientMaterial(), fen);
  for (const fen of [
    '4k3/8/8/8/8/8/P7/4K3 w - - 0 1',
    '4kb2/8/8/8/8/8/8/3BK3 w - - 0 1', // opposite colours: mate possible
    '4k3/8/8/8/8/8/8/2NNK3 w - - 0 1',
    '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
  ]) assert.ok(!new Chess(fen).isInsufficientMaterial(), fen);
});

test('undo restores every kind of move', () => {
  const g = new Chess('r3k2r/pPp2ppp/8/3pP3/8/8/PPPP1PPP/R3K2R w KQkq d6 0 1');
  const before = g.fen();
  for (const mv of g.moves({ verbose: true })) {
    g.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    g.undo();
    assert.equal(g.fen(), before, `after undoing ${mv.san}`);
  }
});

test('FEN round trip and illegal FEN rejection', () => {
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  assert.equal(new Chess(fen).fen(), fen);
  assert.throws(() => new Chess('not a fen'));
  assert.throws(() => new Chess('8/8/8/8/8/8/8/8 w - - 0 1'), /kings/);
  assert.throws(() => new Chess('4k3/8/8/8/8/8/4r3/4K3 b - - 0 1'), /check/); // side not to move in check
});

test('illegal moves are rejected', () => {
  const g = new Chess();
  assert.equal(g.move('e5'), null);
  assert.equal(g.move({ from: 'e2', to: 'e5' }), null);
  assert.equal(g.move('Nf6'), null);
  assert.equal(g.history().length, 0);
});

test('pinned piece cannot move off the pin line', () => {
  const g = new Chess('4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1');
  assert.equal(g.moves({ square: 'e2' }).length, 0);
});

test('PGN export then import reproduces the game', () => {
  const g = new Chess();
  play(g, 'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O');
  const pgn = g.pgn({ White: 'A', Black: 'B' });
  assert.match(pgn, /1\. e4 e5 2\. Nf3 Nc6/);
  const { game, headers } = loadPgn(pgn);
  assert.equal(headers.White, 'A');
  assert.equal(game.fen(), g.fen());
});

test('captured pieces list', () => {
  const g = new Chess();
  play(g, 'e4', 'd5', 'exd5', 'Qxd5');
  assert.deepEqual(g.captured(), { w: ['p'], b: ['p'] });
});

test('check square and status API', () => {
  const g = new Chess();
  play(g, 'e4', 'f6', 'Qh5+');
  assert.equal(g.checkSquare(), 'e8');
  assert.equal(g.inCheck(), true);
  assert.equal(new Chess().status().over, false);
  assert.equal(new Chess().fen(), START_FEN);
});
