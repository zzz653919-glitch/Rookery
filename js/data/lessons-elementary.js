// Elementary path: forks, pins & skewers, defending, opening traps, mate in 1-2, king+pawn endings.
import { lesson, learn, move, line, squares, coords, choice, quiz, q, START, RED, GREEN, BLUE, GOLD } from './lesson-kit.js';

export const ELEMENTARY = [
  // ------------------------------------------------------------------ 1
  lesson({
    id: 'e-forks', level: 'elementary', skill: 'forks', title: 'Forks: attack two things at once',
    summary: 'One move, two targets — the most common way to win material.', minutes: 8,
    steps: [
      learn('What is a fork?',
        `<p>A <b>fork</b> is a single move that attacks two (or more) enemy pieces at the same time. Your opponent can usually save only one of them, so you win the other.</p>
         <p>Knights are fork specialists because their L-shaped jumps cannot be blocked and they attack in many directions. Here a knight on f7 would attack the king <b>and</b> the queen.</p>`,
        { fen: '3k4/p7/7q/4N3/8/8/P7/4K3 w - - 0 1', arrows: [['e5', 'f7', GOLD], ['f7', 'd8', RED], ['f7', 'h6', RED]] }),
      move('Fork the king and the queen with your knight — with check!', '3k4/p7/7q/4N3/8/8/P7/4K3 w - - 0 1', 'e5f7',
        { hint: 'Find the square from which a knight attacks both d8 and h6.', explain: 'Nf7+ attacks the king, so Black must move it, and then the knight takes the queen on h6.', verify: 'best' }),
      move('Pawns can fork too! Win a knight.', '4k3/p7/2n1n3/8/3P4/8/P7/R3K1N1 w - - 0 1', 'd4d5',
        { hint: 'Which square attacks both black knights at once? Pawns capture diagonally.', explain: 'After d5 both knights are attacked by a pawn. Neither knight can capture it, so one of them is lost.', verify: 'best' }),
      move('The queen can fork as well. Attack the king <b>and</b> the rook with one move.', 'r5k1/8/8/8/3Q4/8/8/6K1 w - - 0 1', 'd4d5',
        { hint: 'Look at the two long diagonals through d5.', explain: 'Qd5+ gives check along the diagonal to g8 and also attacks the rook on a8. After the king moves, Qxa8 wins the rook.', verify: 'best' }),
      choice('Spot the fork', 'Which move forks the black king and rook with the white knight?', ['Nc7+', 'Nd6+', 'Na7', 'Nc3'], 0,
        'From c7 the knight attacks both e8 (king) and a8 (rook).', { fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1' }),
      quiz([
        q('A fork is a move that…', ['attacks two or more pieces at once', 'captures a pawn', 'blocks a check', 'protects two pieces'], 0, 'The opponent can only save one target.'),
        q('Which piece is often the best forker because its jumps cannot be blocked?', ['Knight', 'Rook', 'Bishop', 'King'], 0, 'Knights jump, so they are hard to stop.'),
        q('Before you play a fork, what should you double-check?', ['That the forking piece cannot simply be captured', 'That it is a knight', 'That you have castled', 'Nothing'], 0, 'A fork only works if the forking piece is safe (or the fork comes with check).'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 2
  lesson({
    id: 'e-pins', level: 'elementary', skill: 'pins', title: 'Pins and skewers',
    summary: 'Attack along a line: the piece in front cannot (or should not) move.', minutes: 9,
    steps: [
      learn('The pin',
        `<p>A <b>pin</b> happens when a piece attacks an enemy piece that has a more valuable piece (or the king) <b>behind</b> it on the same line.</p>
         <p>If the piece behind is the <b>king</b>, the pin is <b>absolute</b>: the pinned piece cannot legally move at all. Here the black bishop on e6 is pinned to its king by the rook on e1.</p>`,
        { fen: '4k3/5ppp/4b3/8/3P4/8/5PPP/4R1K1 w - - 0 1', arrows: [['e1', 'e8', RED]], marks: [{ sq: 'e6', kind: 'bad' }], explore: true }),
      move('Attack the pinned bishop with a pawn — it cannot run away!', '4k3/5ppp/4b3/8/3P4/8/5PPP/4R1K1 w - - 0 1', 'd4d5',
        { hint: 'A pawn on d5 would attack the bishop on e6.', explain: 'The bishop is pinned, so it cannot step aside; capturing on e6 wins a piece for a pawn.', verify: 'best' }),
      learn('The skewer',
        `<p>A <b>skewer</b> is the reverse of a pin: you attack a <b>valuable piece in front</b>, it has to move, and you capture the piece <b>behind</b> it.</p>
         <p>Rooks, bishops and queens are the skewer pieces because they work along lines.</p>`,
        { fen: '8/8/8/4k2q/8/8/8/R3K3 w - - 0 1', arrows: [['a1', 'a5', GOLD], ['a5', 'h5', RED]] }),
      move('Skewer the king and the queen.', '8/8/8/4k2q/8/8/8/R3K3 w - - 0 1', 'a1a5',
        { hint: 'Check the king along the 5th rank — what stands behind it?', explain: 'Ra5+ forces the king to move off the rank, and then the rook captures the queen on h5.', verify: 'best' }),
      choice('Pin or skewer?', 'A bishop attacks a rook, and a <b>more valuable</b> queen stands behind it on the same diagonal. What is this?', ['A pin', 'A skewer', 'A fork', 'A stalemate'], 0,
        'The more valuable piece is behind, so the front piece is "pinned" to it. In a skewer the more valuable piece is in front.'),
      quiz([
        q('In an <b>absolute pin</b> the piece behind is…', ['the king', 'a pawn', 'the queen', 'a knight'], 0, 'A piece pinned to the king cannot legally move.'),
        q('In a skewer, which piece is attacked first?', ['The more valuable piece', 'The less valuable piece', 'A pawn', 'Any piece'], 0, 'It must move, exposing the piece behind it.'),
        q('Which pieces can pin or skewer?', ['Bishops, rooks and queens', 'Knights and pawns', 'Only the queen', 'Only the king'], 0, 'They move along lines; knights and pawns do not.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 3
  lesson({
    id: 'e-defend', level: 'elementary', skill: 'captures', title: 'Counting attackers and defenders',
    summary: 'Before every capture, count — and look out for threats.', minutes: 7,
    steps: [
      learn('Count before you capture',
        `<p>A pawn on e5 is attacked by <b>two</b> white knights but defended by only <b>one</b> black knight. If White captures, Black recaptures, and White recaptures again: White ends up a pawn ahead.</p>
         <p>The rule: <b>if attackers outnumber defenders, and your first capturer is not worth more than what you win, the capture works.</b> Always count attackers and defenders before you take.</p>`,
        { fen: '4k3/p7/2n5/4p3/6N1/5N2/P7/4K3 w - - 0 1', arrows: [['f3', 'e5', GOLD], ['g4', 'e5', GOLD], ['c6', 'e5', RED]] }),
      move('Win the e5 pawn: two attackers against one defender.', '4k3/p7/2n5/4p3/6N1/5N2/P7/4K3 w - - 0 1', ['f3e5', 'g4e5'],
        { hint: 'Capture on e5 with a knight. After the recapture, take back with the other knight.', explain: 'Nxe5 Nxe5 Nxe5 — knight for knight, and a pawn won.', verify: 'best' }),
      move('Your bishop is attacked by the black pawn! Don\'t move it — <b>capture the attacker</b>.', '4k3/p7/8/3p4/2B5/8/P7/4K3 w - - 0 1', 'c4d5',
        { hint: 'The pawn on d5 attacks your bishop on c4 — and your bishop also attacks that pawn.', explain: 'Bxd5 removes the attacker and wins a free pawn: the pawn on d5 was unprotected.', verify: 'best' }),
      choice('Is it a good capture?', 'The rook can take the pawn on a7 — but it is protected by the king. What happens?', ['I win a pawn for free', 'I lose a rook for a pawn'], 1,
        'After Rxa7 Kxa7 you gave up a rook (5) for a pawn (1).', { fen: '1k6/p7/8/8/8/8/8/R3K3 w - - 0 1' }),
      quiz([
        q('When is a capture on a protected piece usually good?', ['When you capture with a less valuable piece, or attackers outnumber defenders', 'Always', 'Never', 'Only with the queen'], 0, 'Count the exchanges and compare piece values.'),
        q('Your piece is attacked by an enemy pawn. What is a good first idea?', ['Capture the pawn if you can, or move the piece', 'Ignore it', 'Attack the pawn with the king', 'Resign'], 0, 'Pawns are cheap attackers — losing a piece to a pawn is a bad trade.'),
        q('Which piece is worth the most (not counting the king)?', ['Queen', 'Rook', 'Bishop', 'Knight'], 0, 'Queen 9, rook 5, bishop 3, knight 3, pawn 1.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 4
  lesson({
    id: 'e-traps', level: 'elementary', skill: 'opening', title: 'Early queen attacks and opening traps',
    summary: 'Defend against Scholar\'s mate — and punish it.', minutes: 7,
    steps: [
      learn('The Scholar\'s mate idea',
        `<p>Beginners often try to win quickly with <b>1.e4 e5 2.Bc4 Nc6 3.Qh5</b>, aiming the queen and bishop at the weak f7 square. If Black ignores the threat, <b>Qxf7#</b> is checkmate.</p>
         <p>The defence is simple: <b>guard f7</b> or chase the queen away — for example <b>...g6</b> (attacking the queen), <b>...Qe7</b> or <b>...Nh6</b>. Beware of the natural-looking <b>...Nf6??</b>: it attacks the queen, but White ignores that and plays <b>Qxf7#</b>!</p>`,
        { fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', arrows: [['h5', 'f7', RED], ['c4', 'f7', RED]], marks: [{ sq: 'f7', kind: 'bad' }], orientation: 'b' }),
      move('Black to move. White threatens Qxf7 checkmate — stop it. (Careful: the obvious 3...Nf6?? does <b>not</b> work!)', 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', ['g7g6', 'd8e7', 'd8f6', 'g8h6'],
        { hint: 'Either guard f7 with a piece, or attack the queen with a pawn move.', explain: '...g6 attacks the queen with a pawn; ...Qe7, ...Qf6 and ...Nh6 all guard f7. Each stops the mate.', verify: 'parry', wrong: { g8f6: 'Nf6?? attacks the queen, but White simply plays Qxf7# — the knight on f6 even takes away the king\'s escape square.', d7d6: 'This does not guard f7: Qxf7# is mate.' } }),
            move('White tries it and Black blundered. <b>Find the checkmate.</b>', 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5f7',
        { hint: 'The f7 pawn is attacked twice and defended only by the king.', explain: 'Qxf7#: protected by the bishop on c4, the queen takes f7 and the king has no escape.', verify: 'best' }),
      quiz([
        q('The target of the Scholar\'s mate is…', ['the f7 pawn (f2 for Black)', 'the a-pawn', 'the black queen', 'the d-file'], 0, 'f7 is defended only by the king at the start.'),
        q('A good way to meet an early queen attack is…', ['develop a piece with a threat to the queen', 'push the h-pawn', 'resign', 'sacrifice a rook'], 0, 'Gain time by attacking the queen while developing.'),
        q('Why is bringing the queen out on move 2 risky for the attacker?', ['The queen can be chased with tempo moves', 'The queen cannot capture', 'It loses the game by rule', 'It blocks the king'], 0, 'Every move spent running away is a lost developing move.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 5
  lesson({
    id: 'e-mates', level: 'elementary', skill: 'mates', title: 'Mate in one and mate in two',
    summary: 'Look for checks that leave no escape — and for quiet sacrifices.', minutes: 9,
    steps: [
      learn('Checks, captures, threats',
        `<p>When you look for a win, ask three questions in this order: <b>Can I give check? Can I capture something? Can I make a threat?</b></p>
         <p>For checkmate, check <b>every</b> check you can give and ask: can the king move, capture the checker or block? If the answer is "no" to all three, it's mate.</p>`,
        { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1' }),
      move('Mate in one: the back rank.', '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8',
        { hint: 'The black king is stuck behind three pawns.', explain: 'Rd8# — nothing can interpose or capture.', verify: 'mate' }),
      move('Mate in one: <b>capture</b> with check.', '4r1k1/5ppp/8/8/8/8/5PPP/3RR1K1 w - - 0 1', 'e1e8',
        { hint: 'Black\'s rook defends the back rank. Can you take it with check?', explain: 'Rxe8#: Black cannot recapture because the second white rook guards e8, and the king is boxed in by its own pawns.', verify: 'mate' }),
      line('Mate in two: <b>check first</b>, then take the blocker.', '6k1/5ppp/4r3/8/3n4/Q7/5PPP/5RK1 w - - 0 1',
        [{ accept: ['a3a8'], reply: 'e6e8' }, { accept: ['a8e8'] }],
        { hint: 'Give check on the back rank. Black has only one way to block.', explain: 'Qa8+ forces Re8 (the only block), then Qxe8# is checkmate.', verify: 'mate2' }),
      line('Mate in two: find the key check.', '6k1/r1n2ppp/8/8/8/8/4RPPP/1Q4K1 w - - 0 1',
        [{ accept: ['b1b8'], reply: 'c7e8' }, { accept: ['e2e8', 'b8e8'] }],
        { hint: 'Check on the back rank — whichever piece blocks will be taken with mate.', explain: 'Qb8+ Ne8 (forced block) and then Rxe8# or Qxe8# finishes.', verify: 'mate2' }),
      quiz([
        q('Before calling a move "checkmate", you should check that the king cannot…', ['move, capture the checker or be blocked', 'castle', 'be protected by a pawn', 'give check back'], 0, 'Those are the only three ways out of check.'),
        q('When searching for tactics, a good order of candidate moves is…', ['checks, captures, threats', 'quiet moves first', 'pawn moves first', 'random'], 0, 'Forcing moves limit the opponent\'s replies.'),
        q('A mate in two means…', ['you mate on your second move whatever Black replies', 'the game lasts two moves', 'Black mates in two', 'the queen moves twice'], 0, 'A forced mate: every defence fails.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 6
  lesson({
    id: 'e-pawnend', level: 'elementary', skill: 'endgame', title: 'King and pawn endings',
    summary: 'Use your king: the king is a fighting piece in the endgame.', minutes: 8,
    steps: [
      learn('The king leads the way',
        `<p>With few pieces left there is no danger of checkmate, so the king becomes <b>strong</b>. In a king-and-pawn ending, bring your king <b>in front of</b> your pawn. The enemy king must then give way and your pawn promotes.</p>
         <p>Key fact: a king on the <b>6th rank</b> in front of his pawn (with a pawn on the 5th) wins <b>whoever is to move</b>.</p>`,
        { fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', arrows: [['e6', 'd6', GOLD]] }),
      move('White to move. Which king move wins? (Hint: do <b>not</b> step in front of the pawn on the wrong square.)', '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', ['e6d6', 'e6f6'],
        { hint: 'Step the king sideways, staying on the 6th rank, so the pawn can advance.', explain: 'Kd6 (or Kf6) and the pawn walks home. Kd5 or Kf5 give up the 6th rank and Black can hold the draw.', wrong: { e6d5: 'Kd5 gives away the 6th rank — it no longer wins by force.', e6f5: 'Kf5 gives away the 6th rank — Black draws.' } }),
      learn('The rule of the square',
        `<p>Can a king catch a runaway pawn? Draw a <b>square</b> from the pawn to the promotion square: if the king can step inside the square on his move, he catches the pawn.</p>`,
        { fen: '8/8/8/8/8/k7/p7/K7 w - - 0 1' }),
      choice('Race!', 'The white pawn is on h5 and Black\'s king is on d5, Black to move. Can the king catch the pawn?', ['Yes — it steps into the square', 'No — the pawn promotes'], 0,
        'From h5 the pawn needs 3 moves to reach h8; the square is h5-h8-e8-e5. Black\'s king on d5 steps to e5 inside the square and catches the pawn.', { fen: '8/8/8/3k3P/8/8/8/K7 b - - 0 1' }),
      quiz([
        q('In the endgame the king is…', ['a strong fighting piece', 'always in danger', 'worthless', 'best kept on the back rank'], 0, 'With little material, the king can safely join the action.'),
        q('To support a pawn you should place your king…', ['in front of it', 'behind it', 'on the other wing', 'on the back rank'], 0, 'The king in front shepherds the pawn forward.'),
        q('The "rule of the square" tells you…', ['whether a king can catch a passed pawn', 'how to castle', 'which bishop to trade', 'how to draw'], 0, 'If the king can step into the square, it catches the pawn.'),
      ]),
    ],
  }),
];
