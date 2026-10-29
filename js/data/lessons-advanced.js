// Advanced path: attacking the king, pawn structure, opening preparation, endgame theory, prophylaxis, converting an advantage.
import { lesson, learn, move, line, squares, choice, quiz, q, START, RED, GREEN, BLUE, GOLD, sanSteps, fenAfter } from './lesson-kit.js';

const QGD = '1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3 O-O 6.Nf3 h6 7.Bh4 b6';
const NAJDORF = '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3 e5 7.Nb3 Be6';

export const ADVANCED = [
  lesson({
    id: 'a-attack', level: 'advanced', skill: 'mates', title: 'Attacking the king',
    summary: 'Open lines, bring pieces, and know the classic mating patterns.', minutes: 10,
    steps: [
      learn('When to attack',
        `<p>An attack on the king succeeds when <b>more of your pieces</b> take part than the defender has near the king, and when <b>lines are open</b> towards the king. Typical ingredients: a lead in development, an open file or diagonal, a weakened pawn shield, and <b>tempo</b> (forcing moves).</p>
         <p>Learn the classic mating patterns — they are the targets you aim for. The <b>smothered mate</b> is one: a knight checks a king that is surrounded by its own pieces.</p>`,
        { fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', arrows: [['g5', 'f7', GOLD]] }),
      move('Find the smothered mate.', '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 'g5f7',
        { hint: 'The king is boxed in by its own rook and pawns. Which piece can check without being captured?', explain: 'Nf7# — the king has no escape square: g8 is occupied by its own rook and g7/h7 by pawns.', verify: 'mate' }),
      line('Mate in two: a rook sacrifice on the back rank.', '6k1/5ppp/8/R1Q1r3/8/8/q4PPP/6K1 w - - 0 1',
        [{ accept: ['c5c8'], reply: 'e5e8' }, { accept: ['c8e8'] }],
        { hint: 'Black\'s queen on a2 and rook on e5 look dangerous, but you have a forcing check.', explain: 'Qc8+! Re8 (the only block) and Qxe8#.', verify: 'mate2' }),
      line('Mate in two: swing your rook to the back rank.', '6kr/5ppp/8/1q6/8/3RQ3/5PPP/6K1 w - - 0 1',
        [{ accept: ['d3d8'], reply: 'b5e8' }, { accept: ['e3e8', 'd8e8'] }],
        { hint: 'Rd8+ is check. Black must block with the queen.', explain: 'Rd8+ Qe8 and then either Qxe8# or Rxe8# mates.', verify: 'mate2' }),
      quiz([
        q('Which of these makes a king attack more likely to succeed?', ['More attackers than defenders near the king and open lines', 'Trading all the queens', 'Keeping all pieces at home', 'Pushing the a-pawn'], 0, 'Material near the king and open lines decide attacks.'),
        q('A smothered mate is delivered by a…', ['knight', 'bishop', 'pawn', 'queen from a distance'], 0, 'Only the knight can jump to check a boxed-in king.'),
        q('When attacking, forcing moves (checks, captures, threats) are valuable because…', ['they leave the opponent no time to defend', 'they win material by rule', 'they cost nothing', 'they open the a-file'], 0, 'Tempo is the currency of attacks.'),
      ]),
    ],
  }),

  lesson({
    id: 'a-structure', level: 'advanced', skill: 'strategy', title: 'Pawn structure',
    summary: 'Isolated, backward, doubled and passed pawns.', minutes: 8,
    steps: [
      learn('Pawns are the soul of chess',
        `<p>Pawns cannot move backwards, so every pawn move changes the position <b>permanently</b>. Know these structures:</p>
         <ul><li><b>Isolated pawn</b>: no friendly pawn on a neighbouring file. It cannot be defended by pawns, so it is a target — but it also gives active piece play.</li>
         <li><b>Doubled pawns</b>: two pawns on the same file; less mobile and harder to defend.</li>
         <li><b>Backward pawn</b>: behind its neighbours and unable to advance safely, often on a half-open file.</li>
         <li><b>Passed pawn</b>: no enemy pawn in front or on neighbouring files; it can march to promotion. <i>"A passed pawn is a criminal who should be kept under lock and key."</i></li></ul>`,
        { fen: '4k3/pp2pppp/8/8/3P4/8/PP3PPP/4K3 w - - 0 1', marks: [{ sq: 'd4', kind: 'bad' }] }),
      choice('Find the weakness', 'Which white pawn is <b>isolated</b>?', ['d4', 'b2', 'f2', 'a2'], 0,
        'There are no white pawns on the c- or e-files, so the d4 pawn has no pawn neighbours and cannot be protected by a pawn.', { fen: '4k3/pp2pppp/8/8/3P4/8/PP3PPP/4K3 w - - 0 1' }),
      choice('Find the strength', 'Which white pawn is a <b>passed pawn</b>?', ['d5', 'a2', 'f2', 'h2'], 0,
        'Black has no pawns on the c-, d- or e-files, so nothing can stop or capture the d5 pawn by pawn moves.', { fen: '4k3/p4ppp/8/3P4/8/8/P4PPP/4K3 w - - 0 1' }),
      quiz([
        q('An isolated pawn is one that…', ['has no friendly pawns on neighbouring files', 'is on the edge', 'is doubled', 'has moved twice'], 0, 'It must be defended by pieces.'),
        q('A passed pawn is dangerous because…', ['no enemy pawn can stop it directly', 'it is protected by the king', 'it is on the 7th rank', 'it is doubled'], 0, 'Only pieces can stop it.'),
        q('Why must you be careful when pushing pawns?', ['They cannot move back', 'They get tired', 'They lose value', 'They block the king'], 0, 'Pawn moves are irreversible — they create permanent weaknesses.'),
      ]),
    ],
  }),

  lesson({
    id: 'a-opening', level: 'advanced', skill: 'opening', title: 'Opening preparation: Queen\'s Gambit and Sicilian',
    summary: 'Two sound repertoires — one classical, one dynamic.', minutes: 10,
    steps: [
      learn('Choosing a repertoire',
        `<p>At this level you should know the <b>main plans</b> of the openings you play, not just the moves. We study two reliable systems:</p>
         <ul><li><b>Queen's Gambit Declined</b> (1.d4 d5 2.c4 e6): solid. Black accepts a slightly passive position in exchange for a healthy pawn structure. The key idea is the ...b6 Tartakower setup and a timely ...c5.</li>
         <li><b>Sicilian Defence, Najdorf</b> (1.e4 c5 … 5...a6): sharp. Black fights for the d4 square and plays for a win with counterattacks on the queenside.</li></ul>`,
        { fen: START }),
      line(`Play through the Queen's Gambit Declined main line: ${QGD}`, START, sanSteps(QGD),
        { plain: true, hint: 'The moves are: d4, c4, Nc3, Bg5, e3, Nf3, Bh4.', explain: 'A classic position. White has more space; Black\'s position is solid and he will aim for ...Bb7 and ...c5.' }),
      line(`Play through the Najdorf Sicilian: ${NAJDORF}`, START, sanSteps(NAJDORF),
        { plain: true, hint: 'The moves are: e4, Nf3, d4, Nxd4, Nc3, Be3, Nb3.', explain: 'This is the main line with 6.Be3. Black has equality and counter-chances on both wings.' }),
      quiz([
        q('Why is the Queen\'s Gambit not really a "gambit"?', ['Black can always regain the pawn', 'White loses a piece', 'It is illegal', 'It only works in blitz'], 0, 'After 2...dxc4 White regains the pawn easily.'),
        q('The Najdorf move 5...a6 prepares…', ['...e5 or ...b5 and stops Nb5', 'castling', 'a queen trade', '...h5'], 0, 'It controls b5 and prepares queenside expansion.'),
        q('When you study an opening, you should focus most on…', ['typical plans and structures', 'memorising 30 moves', 'only the first move', 'avoiding theory'], 0, 'Plans transfer when the opponent leaves theory.'),
      ]),
    ],
  }),

  lesson({
    id: 'a-endgame', level: 'advanced', skill: 'endgame', title: 'Endgame theory: Lucena, Philidor and stalemate defences',
    summary: 'The cornerstone rook endings every strong player knows.', minutes: 10,
    steps: [
      learn('The Lucena position',
        `<p>The <b>Lucena position</b> is a rook ending in which the attacker, with a pawn on the 7th rank and his king in front of it, wins against a rook defender if the enemy king is cut off. The winning method is the <b>"bridge"</b>: the attacker's rook goes to the 4th rank (for example <b>Rf4</b>) so that after the defending rook checks, the king can step out of the checks and shelter behind the rook.</p>
         <p>The defender cannot stop it once the king is cut off by at least one file.</p>`),
      learn('The Philidor position',
        `<p>The <b>Philidor position</b> is the defender's main drawing method. When the defending king is in front of the pawn, the defending <b>rook stays on the 6th rank</b> to keep the enemy king from advancing. When the pawn steps to the 6th rank, the defender's rook <b>goes behind the pawn</b> and gives checks from the rear, so the attacker cannot hide his king.</p>`),
      choice('Rook endings', 'You are defending a rook ending a pawn down. What is the most important defensive resource?', ['Keep your king in front of the pawn and use active checks', 'Trade rooks at once', 'Push your own pawns forward', 'Keep the rook passive in the corner'], 0,
        'An active rook and the king in front of the pawn give you the best drawing chances.'),
      choice('Pawn on the 7th', 'King and queen against a king and a pawn on the 7th rank (not a rook or bishop pawn): who is usually winning?', ['The side with the queen', 'The side with the pawn', 'It is always a draw', 'It depends on the colour of the squares'], 0,
        'The queen usually wins by forcing the enemy king in front of its pawn. Only with a bishop or rook pawn (and the king far away) can the stalemate trick save the defender.'),
      quiz([
        q('The Lucena "bridge" means…', ['placing the rook on the 4th rank to shield the king from checks', 'building a pawn chain', 'sacrificing a rook', 'giving perpetual check'], 0, 'The rook on the 4th rank blocks the checking rook\'s line.'),
        q('In the Philidor position the defender\'s rook stays on…', ['the 6th rank until the pawn advances', 'the 1st rank forever', 'the file of the pawn', 'the 7th rank'], 0, 'This keeps the attacking king from stepping forward.'),
        q('A common rook-ending principle is…', ['Rooks belong behind passed pawns', 'Rooks belong in front of passed pawns', 'Always trade rooks', 'Never move the king'], 0, 'The Tarrasch rule: rooks belong behind passed pawns.'),
      ]),
    ],
  }),

  lesson({
    id: 'a-prophylaxis', level: 'advanced', skill: 'calculation', title: 'Prophylaxis: stopping the opponent\'s plan',
    summary: 'Ask "what does my opponent want?" before every move.', minutes: 7,
    steps: [
      learn('What does my opponent want?',
        `<p><b>Prophylaxis</b> means preventing your opponent's plan before it starts. Strong players ask: <i>"What would I play if it were the opponent's turn?"</i> and then decide whether to stop it.</p>
         <p>It is also the most reliable cure for blunders: if you always find the opponent's best threat first, you will rarely get surprised. Here White threatens the Scholar's-mate-style attack Qxf7#.</p>`,
        { fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', arrows: [['h5', 'f7', RED]], orientation: 'b' }),
      choice('Find the threat', 'It is Black\'s move. What is the <b>immediate</b> threat from White?', ['Qxf7 checkmate', 'Qxe5+', 'Bxf7+', 'Nothing'], 0,
        'White\'s queen and bishop both attack f7, which is defended only by the king: Qxf7# is mate.', { fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', threat: 'h5f7', orientation: 'b' }),
      move('Now you are White. Black threatens Qxf2#. Find a move that stops it — but check each candidate: some natural moves do <b>not</b> work.', 'rnb1k1nr/pppp1ppp/8/2b1p3/4P2q/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', ['d1e2', 'd1f3', 'd1g4', 'd1h5', 'g1h3', 'd2d4', 'g2g3'],
        { hint: 'f2 is attacked twice (queen and bishop) and defended once. Add a defender, block the queen\'s line, or attack one of the attackers.', explain: 'Any of these covers f2 or cuts the queen\'s path. Note that Nf3 — which attacks the queen — fails: Black plays Qxf2# at once.', verify: 'parry', wrong: { g1f3: 'Nf3 attacks the queen, but it is Black\'s move: Qxf2# is checkmate.', b1c3: 'Nc3 ignores the threat: Qxf2#.' } }),
      quiz([
        q('Prophylaxis means…', ['preventing the opponent\'s plan or threat', 'attacking at once', 'always trading', 'castling queenside'], 0, 'Stop it before it begins.'),
        q('A good way to find the best prophylactic move is to…', ['imagine the opponent\'s best move in the current position', 'play the first move you see', 'repeat the position', 'trade the queens'], 0, 'Ask "what would they do if they could move?"'),
        q('Which habit best reduces blunders?', ['Checking the opponent\'s threats before every move', 'Moving fast', 'Playing only pawn moves', 'Avoiding captures'], 0, 'Most blunders are missed threats.'),
      ]),
    ],
  }),

  lesson({
    id: 'a-convert', level: 'advanced', skill: 'strategy', title: 'Converting an advantage',
    summary: 'How to turn a better position into a win.', minutes: 7,
    steps: [
      learn('Technique',
        `<p>Getting a winning position is only half the work — you must <b>convert</b> it. A reliable recipe:</p>
         <ol><li><b>Eliminate counterplay</b> first: take away your opponent's active ideas and keep your king safe.</li>
         <li><b>Trade pieces, not pawns</b> when you are ahead in material — every trade increases the value of your advantage.</li>
         <li>Create a <b>second weakness</b> on the other side of the board; one weakness can be defended, two cannot.</li>
         <li>Stay calm: do not rush for a flashy finish when a simple plan works.</li></ol>`),
      choice('Material ahead', 'You are a full rook ahead in the middlegame. Which approach is best?', ['Trade pieces and avoid counterplay', 'Launch an unsound attack', 'Trade all your pawns', 'Move the king into the centre'], 0,
        'When ahead, trade pieces, keep it simple and neutralise counterplay.'),
      quiz([
        q('When ahead in material you should usually…', ['trade pieces', 'avoid trades', 'sacrifice your queen', 'move the rooks off the board'], 0, 'Trades make your advantage bigger relative to what remains.'),
        q('The "principle of two weaknesses" says…', ['one weakness can be defended, two cannot', 'two weaknesses make a draw', 'never create weaknesses', 'you need three weaknesses to win'], 0, 'Overload the defender with a second front.'),
        q('The first step in converting an advantage is…', ['eliminate counterplay', 'sacrifice material', 'castle long', 'trade queens at any cost'], 0, 'Remove the opponent\'s chances before pressing on.'),
      ]),
    ],
  }),
];
