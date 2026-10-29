// Expert path: master-level repertoires, famous attacking games, endgame theory, strategic planning.
import { lesson, learn, move, line, choice, quiz, q, START, RED, GOLD, sanSteps, fenAfter } from './lesson-kit.js';

const RUY = '1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3 O-O 9.h3';
const SLAV = '1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 dxc4 5.a4 Bf5 6.e3 e6 7.Bxc4 Bb4 8.O-O';
const OPERA = '1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8#';
const OPERA_KEY = '1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7';
const LEGALL = '1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6 5.Nxe5 Bxd1 6.Bxf7+ Ke7 7.Nd5#';

export const EXPERT = [
  lesson({
    id: 'x-rep', level: 'expert', skill: 'opening', title: 'Master repertoires: the Closed Ruy Lopez and the Slav',
    summary: 'Two systems used at every level of the game.', minutes: 10,
    steps: [
      learn('Depth over breadth',
        `<p>At expert level you should know your repertoire <b>deeply</b>: typical pawn structures, piece placements, plans, and the key tactical motifs. We look at two systems that are theoretically rich and reliable:</p>
         <ul><li><b>The Closed Ruy Lopez</b> (1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3 O-O): White builds a strong centre and plays for d4; Black keeps a solid position and prepares ...Na5, ...c5 and ...Qc7.</li>
         <li><b>The Slav Defence</b> (1.d4 d5 2.c4 c6): solid but flexible. Black supports d5 and keeps the light-squared bishop active outside the pawn chain.</li></ul>`,
        { fen: fenAfter('1.e4 e5 2.Nf3 Nc6 3.Bb5') }),
      line(`Play the Closed Ruy Lopez: ${RUY}`, START, sanSteps(RUY),
        { plain: true, hint: 'The moves are: e4, Nf3, Bb5, Ba4, O-O, Re1, Bb3, c3, h3.', explain: 'This is a main line of the Closed Ruy Lopez. Both sides prepare for a long manoeuvring fight.' }),
      line(`Play the Slav Defence: ${SLAV}`, START, sanSteps(SLAV),
        { plain: true, hint: 'The moves are: d4, c4, Nf3, Nc3, a4, e3, Bxc4, O-O.', explain: 'White regained the pawn; Black has developed the "problem bishop" and is solid.' }),
      quiz([
        q('What is the main idea of White\'s c3 and h3 in the Closed Ruy Lopez?', ['Prepare d4 and prevent ...Bg4', 'Attack the queen', 'Open the h-file', 'Trade the bishops'], 0, 'c3 supports d4, h3 stops the pin on f3.'),
        q('What does Black aim for with ...Bf5 in the Slav?', ['Develop the light-squared bishop outside the pawn chain', 'Attack e4', 'Castle queenside', 'Win a pawn'], 0, 'This is the typical plan of the Slav.'),
        q('At expert level, what should you do with an opening line you cannot explain?', ['Study the plans behind it', 'Memorise more moves', 'Ignore it', 'Play it faster'], 0, 'Understanding beats memorisation.'),
      ]),
    ],
  }),

  lesson({
    id: 'x-opera', level: 'expert', skill: 'mates', title: 'The Opera Game: a model of development and attack',
    summary: 'Paul Morphy\'s famous 1858 miniature, step by step.', minutes: 12,
    steps: [
      learn('Morphy vs. the Duke of Brunswick and Count Isouard (Paris, 1858)',
        `<p>This famous game is the best illustration of the opening principles: <b>develop quickly, open lines, and attack with all your pieces</b>. White (Morphy) develops every piece with tempo and Black (the allies) wastes time with the bishop and queen. Each of White's last moves is a <b>forcing move</b>: a check or a capture.</p>
         <p>Play through the game and notice how Morphy sacrifices material to finish with all his pieces involved.</p>`,
        { fen: fenAfter('1.e4 e5 2.Nf3 d6 3.d4 Bg4') }),
      line(`Play Morphy's moves: ${OPERA}`, START, sanSteps(OPERA),
        { hint: 'Follow the move list: it ends with 17.Rd8#.', explain: 'A masterpiece: 10.Nxb5! opens the c- and d-files, 11.Bxb5+ and 12.O-O-O! attack with tempo, 16.Qb8+!! deflects the knight, and 17.Rd8# is mate.' }),
      line('Now find the finish yourself! White to move: mate in two (a queen sacrifice).', fenAfter(OPERA_KEY),
        [{ accept: ['b3b8'], reply: 'd7b8' }, { accept: ['d1d8'] }],
        { hint: 'Check on b8 — the knight on d7 must capture, and that overloads the d8 square.', explain: 'Qb8+! Nxb8 (forced) and Rd8#. The queen sacrifice removes the only defender of d8.', verify: 'mate2' }),
      quiz([
        q('What was the key idea behind 10.Nxb5!?', ['Open lines against the king while ahead in development', 'Win a pawn', 'Trade queens', 'Defend the bishop'], 0, 'White sacrifices a knight for tempo and open lines.'),
        q('Why did Morphy castle queenside at move 12?', ['To bring the rook to the open d-file with tempo', 'To protect his king', 'To avoid a trade', 'To attack the queen'], 0, 'O-O-O develops the rook and creates the Rxd7 threat.'),
        q('The theme of the final combination is…', ['deflection', 'zugzwang', 'stalemate', 'castling'], 0, 'The knight is deflected from guarding d8.'),
      ]),
    ],
  }),

  lesson({
    id: 'x-legall', level: 'expert', skill: 'mates', title: 'Legall\'s mate: the queen sacrifice trap',
    summary: 'A classic opening trap with a queen sacrifice.', minutes: 8,
    steps: [
      learn('A trap worth knowing',
        `<p><b>Legall's mate</b> is a classic opening trap. After 1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6, White plays <b>5.Nxe5!</b> The bishop on g4 can take the queen, but then the combination <b>6.Bxf7+ Ke7 7.Nd5#</b> is checkmate. Two minor pieces deliver the mate.</p>
         <p>The lesson: <b>don't take a queen without checking what comes next</b>.</p>`,
        { fen: fenAfter('1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6'), arrows: [['f3', 'e5', GOLD]] }),
      line(`Play Legall's mate: ${LEGALL}`, START, sanSteps(LEGALL),
        { hint: 'Moves: e4, Nf3, Bc4, Nc3, Nxe5!, Bxf7+, Nd5#.', explain: 'Nd5#: the knight checks the king on e7; e8, e6, f6 and d7 are covered by the bishop and knights, while d8, d6 and f8 are blocked by Black\'s own pieces.' }),
      quiz([
        q('Why shouldn\'t Black take the queen on d1 in Legall\'s trap?', ['It allows a forced mate', 'The queen is protected', 'It loses a pawn', 'It is illegal'], 0, 'After Bxd1 comes Bxf7+ and Nd5#.'),
        q('Which pieces deliver the checkmate?', ['Bishop and knight', 'Queen and rook', 'Two rooks', 'Pawns'], 0, 'The bishop checks on f7 and the knight mates on d5.'),
        q('The general lesson of the trap is…', ['look at what your opponent\'s move allows before capturing', 'never take pieces', 'always castle early', 'trade queens'], 0, 'Always ask "what does the sacrifice threaten?".'),
      ]),
    ],
  }),

  lesson({
    id: 'x-endgame', level: 'expert', skill: 'endgame', title: 'Endgame mastery: activity, zugzwang and the opposition',
    summary: 'Principles that decide the technical phase of the game.', minutes: 9,
    steps: [
      learn('Zugzwang and the opposition',
        `<p>In many endgames the side that has to move is at a <b>disadvantage</b>; this is called <b>zugzwang</b> ("compulsion to move"). The <b>opposition</b> — kings facing each other with one square between them — is the king-and-pawn way of winning that tempo battle: the side that does <b>not</b> have to move holds the opposition.</p>
         <p>In rook endings the same logic appears as an <b>active rook</b>: passive defence loses, so look for counterplay and cut-off ideas instead of waiting.</p>`,
        { fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1' }),
      move('Use your king, not the pawn. Which move wins?', '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', ['e6d6', 'e6f6'],
        { hint: 'Step sideways on the 6th rank.', explain: 'Kd6 (or Kf6): the king keeps the opposition on the 6th rank and escorts the pawn.', wrong: { e6f5: 'Kf5 gives up the 6th rank — Black draws.' } }),
      choice('Rook endings', 'Which is generally the best way to defend a worse rook ending?', ['Activity: counterattack and check from behind', 'Passively wait', 'Trade pawns', 'Move the king away'], 0,
        'Passive defence usually loses. Active rooks and counter-threats make drawing possible.'),
      quiz([
        q('Zugzwang means…', ['a side would like to pass but must make a damaging move', 'a stalemate', 'a perpetual check', 'a trade of queens'], 0, 'Having to move can itself be a disadvantage.'),
        q('Having the opposition means…', ['your king faces the enemy king with the opponent to move', 'you have more pawns', 'you moved last', 'you control the centre'], 0, 'The opponent must give way.'),
        q('The most important principle in rook endings is…', ['activity', 'material', 'pawn structure only', 'king safety only'], 0, 'An active rook is worth more than a pawn.'),
      ]),
    ],
  }),

  lesson({
    id: 'x-plan', level: 'expert', skill: 'strategy', title: 'Planning and evaluation',
    summary: 'A framework for deciding what to do when there is no tactic.', minutes: 8,
    steps: [
      learn('The evaluation checklist',
        `<p>When there is no immediate tactic, evaluate the position using Steinitz's elements:</p>
         <ol><li><b>Material</b> — who is ahead?</li><li><b>King safety</b> — are there weaknesses near either king?</li><li><b>Activity</b> — whose pieces are better placed, who controls open lines?</li><li><b>Pawn structure</b> — weaknesses, passed pawns, majorities.</li><li><b>Space and control of key squares</b>.</li></ol>
         <p>Then plan: <b>improve your worst piece</b>, attack the weakest enemy point, or change the structure in your favour. Always calculate concrete variations to confirm.</p>`),
      choice('A planning decision', 'Your position is quiet and equal. Which approach is best?', ['Improve your worst-placed piece', 'Move the same piece back and forth', 'Start a random pawn storm', 'Offer a draw immediately'], 0,
        'A simple, useful plan: bring your worst piece into play before starting any operation.'),
      quiz([
        q('What is a good first step in a quiet position?', ['Evaluate material, king safety, activity and structure', 'Start a pawn storm', 'Trade queens', 'Make a waiting move'], 0, 'Evaluation tells you which plan fits.'),
        q('"Improve your worst piece" means…', ['bring your least active piece to a better square', 'sacrifice it', 'trade it for a pawn', 'move your king'], 0, 'A chain is only as strong as its weakest link.'),
        q('Why must you still calculate concrete lines when you have a plan?', ['A plan is wrong if it allows a tactic', 'It is required by the rules', 'It saves time', 'It is not necessary'], 0, 'Strategy and tactics work together.'),
      ]),
    ],
  }),
];
