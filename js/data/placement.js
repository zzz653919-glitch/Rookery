// Placement test: 23 questions in 4 difficulty tiers. Each item is an ordinary task (see js/ui/task.js)
// plus { id, tier, skill }. Board tasks are verified by tests/content.test.mjs like lesson tasks.
const FEN_COUNTER = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
void FEN_COUNTER;

const mc = (id, tier, skill, q, options, answer, o = {}) => ({ id, tier, skill, kind: 'mc', q, options, answer, ...o });
const mv = (id, tier, skill, instruction, fen, accept, o = {}) => ({ id, tier, skill, kind: 'move', instruction, fen, accept: [].concat(accept), ...o });
const ln = (id, tier, skill, instruction, fen, steps, o = {}) => ({ id, tier, skill, kind: 'line', instruction, fen, steps, ...o });

export const PLACEMENT_TIERS = [
  { tier: 1, name: 'Fundamentals' },
  { tier: 2, name: 'Basic tactics' },
  { tier: 3, name: 'Intermediate ideas' },
  { tier: 4, name: 'Advanced patterns' },
];

export const PLACEMENT = [
  // ---------------------------------------------------------------- tier 1
  mc('p1', 1, 'movement', 'Which piece moves in an "L" shape and can jump over other pieces?', ['Knight', 'Bishop', 'Rook', 'Pawn'], 0),
  mv('p2', 1, 'movement', 'Capture the black pawn with your bishop.', '7k/8/8/4p3/3B4/8/8/K7 w - - 0 1', 'd4e5'),
  mc('p3', 1, 'rules', 'It is White\'s move and the white king is attacked by the rook on e8. What is true?', ['White must get out of check immediately', 'White may castle', 'White may push any pawn', 'White can ignore it this move'], 0,
    { fen: '4r1k1/8/8/8/8/8/5PPP/4K3 w - - 0 1' }),
  mv('p4', 1, 'rules', 'Checkmate in one move.', '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8', { verify: 'mate' }),
  mv('p5', 1, 'captures', 'Capture the unprotected black queen.', '4k3/8/8/3q4/8/5B2/8/4K3 w - - 0 1', 'f3d5'),
  mc('p6', 1, 'opening', 'Which first move best follows the opening principles?', ['1.e4 — a central pawn', '1.a4', '1.h4', '1.Nh3'], 0),

  // ---------------------------------------------------------------- tier 2
  mv('p7', 2, 'tactics', 'Find the fork.', '3k4/p7/7q/4N3/8/8/P7/4K3 w - - 0 1', 'e5f7', { verify: 'best' }),
  mv('p8', 2, 'tactics', 'Win the queen with a skewer.', '8/8/8/4k2q/8/8/8/R3K3 w - - 0 1', 'a1a5', { verify: 'best' }),
  mv('p9', 2, 'mates', 'Checkmate in one move.', '4r1k1/5ppp/8/8/8/8/5PPP/3RR1K1 w - - 0 1', 'e1e8', { verify: 'mate' }),
  mc('p10', 2, 'captures', 'White\'s rook can capture the pawn on a7. What happens if it does?', ['I lose the rook for a pawn: the king protects a7', 'I win a pawn for free', 'It is checkmate', 'Nothing special'], 0,
    { fen: '1k6/p7/8/8/8/8/8/R3K3 w - - 0 1' }),
  mv('p11', 2, 'opening', 'The pieces are developed — make the sensible king-safety move.', 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'e1g1'),
  mv('p12', 2, 'endgame', 'King and pawn ending: which move wins?', '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', ['e6d6', 'e6f6']),

  // ---------------------------------------------------------------- tier 3
  mv('p13', 3, 'tactics', 'Find the discovered check that wins the queen.', '3qk3/p4ppp/8/4N3/8/8/P4PPP/4R1K1 w - - 0 1', 'e5c6', { verify: 'best' }),
  ln('p14', 3, 'mates', 'Mate in two: remove the defender.', '1r4k1/5ppp/8/4Rq2/8/1Q6/5PPP/6K1 w - - 0 1',
    [{ accept: ['b3b8'], reply: 'f5c8' }, { accept: ['b8c8'] }], { verify: 'mate2' }),
  mv('p15', 3, 'tactics', 'The bishop is pinned to the king. Win it.', '4k3/5ppp/4b3/8/3P4/8/5PPP/4R1K1 w - - 0 1', 'd4d5', { verify: 'best' }),
  mc('p16', 3, 'calculation', 'It is White\'s move. What does Black threaten?', ['Qxf2 checkmate', 'Qxe4', 'Bxf2+ winning a pawn only', 'Nothing'], 0,
    { fen: 'rnb1k1nr/pppp1ppp/8/2b1p3/4P2q/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', threat: 'h4f2' }),
  mc('p17', 3, 'strategy', 'Which square is the best outpost for the white knight?', ['d5', 'b5', 'a4', 'g4'], 0,
    { fen: '4k3/pp3ppp/8/8/2P1P3/2N5/PP3PPP/4K3 w - - 0 1' }),
  mc('p18', 3, 'endgame', 'In a rook ending with a passed pawn, where should the rook be placed?', ['Behind the passed pawn', 'In front of the passed pawn', 'On the opposite wing', 'It does not matter'], 0),

  // ---------------------------------------------------------------- tier 4
  ln('p19', 4, 'mates', 'Mate in two: a queen sacrifice on the back rank.', '6k1/5ppp/8/R1Q1r3/8/8/q4PPP/6K1 w - - 0 1',
    [{ accept: ['c5c8'], reply: 'e5e8' }, { accept: ['c8e8'] }], { verify: 'mate2' }),
  ln('p20', 4, 'mates', 'Mate in two: deflect the queen.', '6k1/5ppp/8/1r6/4q3/8/5PPP/Q1R3K1 w - - 0 1',
    [{ accept: ['c1c8'], reply: 'e4e8' }, { accept: ['c8e8'] }], { verify: 'mate2' }),
  mv('p21', 4, 'mates', 'Find the smothered mate.', '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 'g5f7', { verify: 'mate' }),
  mc('p22', 4, 'strategy', 'Which white pawn is isolated (no friendly pawn on a neighbouring file)?', ['d4', 'b2', 'f2', 'a2'], 0,
    { fen: '4k3/pp2pppp/8/8/3P4/8/PP3PPP/4K3 w - - 0 1' }),
  mc('p23', 4, 'endgame', 'In the Lucena position, what is the "bridge"?', ['Placing the rook on the 4th rank to shield the king from checks', 'Pushing a second pawn', 'Giving perpetual check', 'Trading rooks'], 0),
];
