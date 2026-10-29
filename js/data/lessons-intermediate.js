// Intermediate path: discovered attacks, deflection, an opening line, middlegame plans, endgame technique, calculation.
import { lesson, learn, move, line, squares, coords, choice, quiz, q, START, RED, GREEN, BLUE, GOLD } from './lesson-kit.js';

export const INTERMEDIATE = [
  lesson({
    id: 'i-discover', level: 'intermediate', skill: 'tactics', title: 'Discovered attacks and double check',
    summary: 'Move one piece and unleash another.', minutes: 8,
    steps: [
      learn('Discovered attacks',
        `<p>A <b>discovered attack</b> happens when you move a piece out of the way and reveal an attack by another piece behind it. The moved piece can do <b>its own</b> damage at the same time, which means you make <b>two threats with one move</b>.</p>
         <p>When the revealed attack is a <b>check</b>, it is a discovered check — your opponent has to answer the check, so the piece you moved is free to capture something. Here the knight on e5 hides the rook's attack on the king.</p>`,
        { fen: '3qk3/p4ppp/8/4N3/8/8/P4PPP/4R1K1 w - - 0 1', arrows: [['e1', 'e8', RED], ['e5', 'c6', GOLD], ['c6', 'd8', GOLD]] }),
      move('Move the knight with <b>discovered check</b> and attack the queen.', '3qk3/p4ppp/8/4N3/8/8/P4PPP/4R1K1 w - - 0 1', 'e5c6',
        { hint: 'The knight must land on a square that attacks d8.', explain: 'Nc6+ unveils the rook\'s check and attacks the queen. Black must answer the check, then Nxd8 wins the queen.', verify: 'best' }),
      move('Use a discovered check to win the rook on b8.', '1r2k3/p7/8/4B3/8/8/P7/4R1K1 w - - 0 1', 'e5b8',
        { hint: 'The bishop is in front of your rook on the e-file. Capture something with it.', explain: 'Bxb8+ is a discovered check from the rook — Black cannot take the bishop and must deal with the check first.', verify: 'best' }),
      learn('Double check',
        `<p>If your move gives check with <b>two pieces at once</b> (the moved piece and the revealed piece), that is a <b>double check</b>. In the diagram, Nd6 would check with the knight <i>and</i> with the rook on the e-file. You cannot block or capture two attackers with one move, so the king <b>must move</b>. Double checks often lead straight to mate.</p>`,
        { fen: '4k3/p4ppp/8/4N3/8/8/P4PPP/4R1K1 w - - 0 1', arrows: [['e1', 'e8', RED], ['e5', 'd6', GOLD], ['d6', 'e8', RED]], marks: [{ sq: 'e8', kind: 'bad' }] }),
      quiz([
        q('A discovered attack…', ['reveals an attack by moving a piece out of the way', 'attacks the discoverer', 'captures a pawn', 'only works with the queen'], 0, 'The piece that moves can create a second threat at the same time.'),
        q('In a double check the only way out is…', ['to move the king', 'to block', 'to capture one attacker', 'to resign'], 0, 'You cannot answer two checks with a block or a capture.'),
        q('Why is a discovered <b>check</b> so strong?', ['The moving piece is free to capture anything, because the check must be answered', 'It gives two extra moves', 'It cannot be answered', 'It always mates'], 0, 'Your opponent is busy with the check.'),
      ]),
    ],
  }),

  lesson({
    id: 'i-deflect', level: 'intermediate', skill: 'tactics', title: 'Deflection and removing the defender',
    summary: 'Pull a key defender away, then strike.', minutes: 9,
    steps: [
      learn('Remove the guard',
        `<p>Many tactics work by <b>removing a defender</b> or <b>deflecting</b> it away from the square or line it protects. Often this costs you material — a sacrifice — but a forced mate or a larger win follows.</p>
         <p>Ask: <b>"What is the key defender here, and can I force it to leave or disappear?"</b> In this position Black's rook on b8 is the only piece protecting the back rank.</p>`,
        { fen: '1r4k1/5ppp/8/4Rq2/8/1Q6/5PPP/6K1 w - - 0 1', arrows: [['b3', 'b8', GOLD]], marks: [{ sq: 'b8', kind: 'bad' }] }),
      line('Mate in two: capture the defender with check.', '1r4k1/5ppp/8/4Rq2/8/1Q6/5PPP/6K1 w - - 0 1',
        [{ accept: ['b3b8'], reply: 'f5c8' }, { accept: ['b8c8'] }],
        { hint: 'The rook on b8 guards the back rank. What if your queen takes it — with check?', explain: 'Qxb8+ forces Qc8 (the only block) and Qxc8# is mate.', verify: 'mate2' }),
      line('Mate in two: a rook sacrifice drags the queen away.', '6k1/5ppp/8/1r6/4q3/8/5PPP/Q1R3K1 w - - 0 1',
        [{ accept: ['c1c8'], reply: 'e4e8' }, { accept: ['c8e8'] }],
        { hint: 'Give check on the back rank. Black\'s queen is forced to block on e8.', explain: 'Rc8+! Qe8 (forced) and Rxe8#. The sacrifice deflected the queen from guarding the rest of the back rank.', verify: 'mate2' }),
      quiz([
        q('Deflection means…', ['forcing a defender away from the square or line it guards', 'attacking the enemy king', 'trading queens', 'castling'], 0, 'Once the defender leaves, your threat works.'),
        q('Before you sacrifice material for a tactic, you must be sure…', ['the follow-up is forced', 'it looks pretty', 'the opponent is weaker', 'it is the opening'], 0, 'A sacrifice only works if the opponent has no good alternative.'),
        q('Which piece was the key defender in the first puzzle?', ['The rook on b8', 'The queen on f5', 'The pawn on g7', 'None'], 0, 'It guarded the back rank; removing it left the king without cover.'),
      ]),
    ],
  }),

  lesson({
    id: 'i-opening', level: 'intermediate', skill: 'opening', title: 'An opening repertoire: the Italian Game',
    summary: 'Play a real opening line and understand the ideas behind it.', minutes: 10,
    steps: [
      learn('Why the Italian Game?',
        `<p>The <b>Italian Game</b> (1.e4 e5 2.Nf3 Nc6 3.Bc4) follows every opening principle: it fights for the centre, develops knights and bishops quickly, and prepares castling. The bishop on c4 eyes the weak f7 square.</p>
         <p>You will now play the main line of the <b>Giuoco Piano</b> (3...Bc5). Black's replies are played for you. Understand <b>why</b> each move is made, not just the order.</p>`,
        { fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', arrows: [['c4', 'f7', GOLD]] }),
      line('Play the line: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d4 exd4 6.cxd4 Bb4+ 7.Bd2 Bxd2+ 8.Nbxd2 d5 9.exd5 Nxd5 10.Qb3 Nce7 11.O-O O-O.', START,
        [
          { accept: ['e2e4'], reply: 'e7e5' }, { accept: ['g1f3'], reply: 'b8c6' }, { accept: ['f1c4'], reply: 'f8c5' },
          { accept: ['c2c3'], reply: 'g8f6' }, { accept: ['d2d4'], reply: 'e5d4' }, { accept: ['c3d4'], reply: 'c5b4' },
          { accept: ['c1d2'], reply: 'b4d2' }, { accept: ['b1d2'], reply: 'd7d5' }, { accept: ['e4d5'], reply: 'f6d5' },
          { accept: ['d1b3'], reply: 'c6e7' }, { accept: ['e1g1'] },
        ],
        { plain: true, hint: 'Follow the move list in the instruction: 1.e4, then Nf3, Bc4, c3, d4, cxd4, Bd2, Nbxd2, exd5, Qb3, and finally castle.', explain: 'White has a healthy centre, all minor pieces developed and a safe king. This is a typical Italian middlegame.' }),
      quiz([
        q('What is the idea behind 4.c3 in the Italian Game?', ['Prepare d4 to build a big pawn centre', 'Protect the king', 'Attack the queen', 'Open the a-file'], 0, 'c3 supports d4 and gives the bishop a retreat square on c2.'),
        q('Why does White play 3.Bc4?', ['It eyes f7 and develops a piece', 'It attacks the queen', 'It blocks the e-pawn', 'It prepares a queen trade'], 0, 'Development plus pressure on the weakest square near the king.'),
        q('What is one good habit when you learn an opening?', ['Learn the ideas behind the moves', 'Memorise 20 moves without thinking', 'Only play it online', 'Never deviate'], 0, 'Understanding lets you play well when your opponent leaves the book.'),
      ]),
    ],
  }),

  lesson({
    id: 'i-plans', level: 'intermediate', skill: 'strategy', title: 'Middlegame plans: outposts, open files and weak squares',
    summary: 'Know where your pieces want to be.', minutes: 8,
    steps: [
      learn('Outposts',
        `<p>An <b>outpost</b> is an advanced square (usually in the enemy half) that is <b>protected by your own pawn</b> and <b>cannot be attacked by an enemy pawn</b>. A knight on an outpost is often stronger than a rook!</p>
         <p>Here White's knight is ready to jump to d5, protected by the pawns on c4 and e4. Black has no c- or e-pawn that could ever challenge it.</p>`,
        { fen: '4k3/pp3ppp/8/8/2P1P3/2N5/PP3PPP/4K3 w - - 0 1', arrows: [['c3', 'd5', GOLD]], marks: [{ sq: 'd5', kind: 'good' }] }),
      choice('Find the outpost', 'Which square is the best outpost for the white knight?', ['d5', 'b5', 'a4', 'g4'], 0,
        'd5 is protected by two pawns (c4 and e4) and no black pawn can attack it.', { fen: '4k3/pp3ppp/8/8/2P1P3/2N5/PP3PPP/4K3 w - - 0 1' }),
      learn('Open files and the seventh rank',
        `<p>Rooks need <b>open files</b> (files without pawns) to be effective. Put a rook on an open file, then try to invade the 7th rank, where it attacks pawns from the side and can trap the enemy king on the back rank.</p>
         <p>Another strategic key is <b>weak squares and weak pawns</b>: isolated, doubled or backward pawns are long-term targets you can attack again and again.</p>`,
        { fen: 'r4rk1/pp3ppp/8/8/8/8/PP3PPP/3R1RK1 w - - 0 1', arrows: [['d1', 'd7', GOLD]] }),
      quiz([
        q('Which of these is a good <b>outpost</b> for a knight?', ['A protected square an enemy pawn can never attack', 'A square on the edge', 'Any square on the 7th rank', 'A square in your own camp'], 0, 'Protected by your pawn, immune to enemy pawns.'),
        q('Where do rooks prefer to be?', ['On open files', 'Behind their own pawns', 'In the corner forever', 'Next to the king'], 0, 'Open lines give the rooks scope.'),
        q('A good middlegame plan is usually based on…', ['the weaknesses and strengths of the position', 'making random moves', 'copying the opponent', 'avoiding all trades'], 0, 'Identify weaknesses (yours and theirs) and aim at them.'),
      ]),
    ],
  }),

  lesson({
    id: 'i-endgame', level: 'intermediate', skill: 'endgame', title: 'Endgame technique: rook mates and the 7th rank',
    summary: 'Convert an extra rook into a win.', minutes: 9,
    steps: [
      learn('Mating with king and rook',
        `<p>King and rook against a lone king is always a win. The idea is to <b>cut the enemy king off</b> with the rook, bring your king close, and then drive the enemy king to the edge. The rook delivers mate on the edge when the kings stand opposite each other.</p>
         <p>Your king should stand on the 6th rank, in front of the enemy king on the 8th rank.</p>`,
        { fen: '7k/8/5K2/8/8/8/8/1R6 w - - 0 1', arrows: [['b1', 'b8', GOLD]] }),
      line('Mate in two: use your king to take away flight squares, then deliver the rook mate.', '7k/8/5K2/8/8/8/8/1R6 w - - 0 1',
        [{ accept: ['f6g6', 'f6f7'], reply: 'h8g8' }, { accept: ['b1b8'] }],
        { hint: 'Take the opposition with your king, then Rb8.', explain: 'Kg6 forces Kg8 (h7 and g7 are covered), then Rb8# is mate.', verify: 'mate2', plain: false }),
      choice('Rook ending rule', 'In a rook ending where does your rook belong, if you have a passed pawn?', ['Behind the passed pawn', 'In front of the passed pawn', 'On the other wing', 'In the corner'], 0,
        'Behind the passed pawn the rook supports it from far away and keeps its power while the pawn advances (Tarrasch rule).'),
      quiz([
        q('K+R vs K is…', ['always a win with correct technique', 'a draw', 'a win only with a pawn', 'impossible to win'], 0, 'Cut off the king, bring your own king, then mate.'),
        q('A rook is most active…', ['on the 7th rank', 'in the corner', 'on the first rank', 'next to the king'], 0, 'On the 7th it attacks pawns and cuts off the enemy king.'),
        q('In rook endings, where should the rook generally be placed relative to a passed pawn?', ['Behind it', 'In front of it', 'Beside it', 'It doesn\'t matter'], 0, 'This is the Tarrasch rule.'),
      ]),
    ],
  }),

  lesson({
    id: 'i-calc', level: 'intermediate', skill: 'calculation', title: 'Calculation and avoiding blunders',
    summary: 'A simple thinking routine for every move.', minutes: 7,
    steps: [
      learn('A routine for every move',
        `<p>Most games below master level are decided by <b>blunders</b>, not brilliant ideas. Use this routine on every move:</p>
         <ol><li><b>What changed?</b> Look at your opponent's last move. What does it threaten?</li>
         <li><b>List candidate moves</b> — checks, captures and threats first.</li>
         <li><b>Calculate</b> each forcing line to the end. Ask "and then?"</li>
         <li><b>Blunder check</b>: after your intended move, can the opponent capture something or give check?</li></ol>`,
        { fen: START }),
      choice('Blunder check', 'It is White\'s turn. Black\'s last move was Qh4. What does Black threaten?', ['Qxf2 checkmate', 'Nothing', 'Qxe4', 'Qxh2'], 0,
        'The queen and the bishop on c5 both attack f2 — Qxf2# is a threat (Scholar\'s mate in reverse). Always ask what your opponent\'s last move threatens.', { fen: 'rnb1k1nr/pppp1ppp/8/2b1p3/4P2q/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', threat: 'h4f2' }),
      quiz([
        q('What is the very first question to ask on every move?', ['What does my opponent\'s last move threaten?', 'Which piece should I move?', 'Can I castle?', 'How many moves are left?'], 0, 'Understanding the threat avoids most blunders.'),
        q('Which moves do you look at first when you calculate?', ['Checks, captures and threats', 'Quiet pawn moves', 'King moves', 'Retreats'], 0, 'Forcing moves limit the opponent\'s options and are easiest to calculate.'),
        q('A "blunder check" means…', ['after choosing a move, test whether it hangs something', 'asking a friend', 'repeating the position', 'resigning'], 0, 'Look one more time before you release the piece.'),
      ]),
    ],
  }),
];
