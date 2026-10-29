// Beginner path: board, pieces, captures, check/mate/stalemate, opening ideas, first checkmates.
import { lesson, learn, move, line, squares, coords, choice, quiz, q, START, RED, GREEN, BLUE, GOLD } from './lesson-kit.js';

const KINGS = (extra) => extra; // readability helper

export const BEGINNER = [
  // ------------------------------------------------------------------ 1
  lesson({
    id: 'b-board', level: 'beginner', skill: 'movement', title: 'The board and its coordinates',
    summary: 'Files, ranks and the name of every square.', minutes: 5,
    steps: [
      learn('Meet the board',
        `<p>A chessboard has <b>64 squares</b> in 8 rows and 8 columns, coloured light and dark. Always place the board so that there is a <b>light square in your right-hand corner</b>.</p>
         <p>Columns are called <b>files</b> and are named <b>a to h</b> from left to right (from White's side). Rows are called <b>ranks</b> and are numbered <b>1 to 8</b>, starting at White's side.</p>
         <p>Every square has a name made of its file and its rank. The highlighted square is <b>e1</b>: file e, rank 1.</p>`,
        { fen: START, marks: [{ sq: 'e1', kind: 'info' }] }),
      learn('The starting position',
        `<p>Each side begins with 16 pieces. The second row is full of <b>pawns</b>. Behind them stand the rooks in the corners, then knights, bishops, the queen and the king.</p>
         <p>Remember: <b>the queen stands on her own colour</b> — the white queen starts on a light square (d1) and the black queen on a dark square (d8).</p>`,
        { fen: START, marks: [{ sq: 'd1', kind: 'good' }, { sq: 'd8', kind: 'good' }] }),
      coords('Time to practise! Click the square that is named on the right. Halfway through, the board turns around so you also see it from Black\'s side.', { rounds: 8, pass: 6 }),
      squares('Files are the vertical lines of squares. Click <b>every square on the d-file</b>, then press <b>Check answer</b>.', '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
        ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'], { hint: 'The d-file is the fourth column from the left.', explain: 'Right: the d-file runs from d1 up to d8.' }),
      quiz([
        q('Which square is in the bottom-left corner of the board, seen from White\'s side?', ['a1', 'h1', 'a8', 'h8'], 0, 'a1 is the corner of file a and rank 1.'),
        q('Which of these is the name of a <b>file</b>?', ['e', '4', 'e4', 'Rook'], 0, 'Files are lettered a–h; ranks are numbered 1–8; e4 is a square.'),
        q('In the starting position each queen stands on…', ['a square of her own colour', 'a square of the opposite colour', 'any square', 'always a light square'], 0, '"The queen likes her own colour": white queen on light d1, black queen on dark d8.'),
        q('How many squares are on a chessboard?', ['64', '36', '81', '100'], 0, '8 × 8 = 64.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 2
  lesson({
    id: 'b-pieces', level: 'beginner', skill: 'movement', title: 'How the pieces move',
    summary: 'The rook, bishop, queen, knight, king and pawn.', minutes: 9,
    steps: [
      learn('The rook',
        `<p>The <b>rook</b> moves any number of squares in a <b>straight line</b>: forwards, backwards or sideways. It cannot jump over other pieces.</p>
         <p>It captures by moving onto an enemy piece's square. Click the rook to see where it can go.</p>`,
        { fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1', explore: true }),
      learn('The bishop',
        `<p>The <b>bishop</b> moves any number of squares <b>diagonally</b>. It cannot jump over pieces either.</p>
         <p>A bishop always stays on the same colour of square it started on, so each player has one "light-squared" and one "dark-squared" bishop.</p>`,
        { fen: '8/7k/8/8/3B4/8/8/K7 w - - 0 1', explore: true }),
      learn('The queen',
        `<p>The <b>queen</b> is the strongest piece. She moves like a rook <b>and</b> a bishop combined: any distance in a straight line or diagonal.</p>`,
        { fen: '8/7k/8/8/3Q4/8/8/K7 w - - 0 1', explore: true }),
      learn('The knight',
        `<p>The <b>knight</b> moves in an <b>L-shape</b>: two squares in one direction and then one square sideways. It is the only piece that can <b>jump over</b> other pieces.</p>`,
        { fen: '7k/8/8/8/3N4/8/8/K7 w - - 0 1', explore: true }),
      learn('The king',
        `<p>The <b>king</b> moves <b>one square</b> in any direction. He is the most important piece: if he is trapped, the game is lost. A king can never move to a square attacked by the enemy.</p>`,
        { fen: '8/7k/8/8/3K4/8/8/8 w - - 0 1', explore: true }),
      learn('The pawn',
        `<p><b>Pawns</b> move <b>forward one square</b> (or <b>two squares</b> on their first move) but <b>capture diagonally</b> one square forward. They can never move backwards.</p>
         <p>If a pawn reaches the far end of the board it is <b>promoted</b>: it turns into a queen, rook, bishop or knight (almost always a queen!).</p>`,
        { fen: '7k/8/8/8/8/2p1p3/3P4/K7 w - - 0 1', explore: true }),
      move('Capture the black pawn with your rook.', '7k/8/8/8/3R2p1/8/8/K7 w - - 0 1', 'd4g4',
        { hint: 'The rook moves in straight lines. The pawn is on the same rank.', explain: 'The rook slides along the 4th rank and takes the pawn on g4.' }),
      move('Capture the black bishop with your knight.', '7k/8/8/8/5b2/3N4/8/K7 w - - 0 1', 'd3f4',
        { hint: 'Count an L-shape from the knight: two squares up/sideways, then one.', explain: 'From d3 the knight jumps two squares to the right and one up, landing on f4 — an L-shape.' }),
      squares('Click <b>every square</b> the knight on d4 can move to, then press <b>Check answer</b>.', '7k/8/8/8/3N4/8/8/K7 w - - 0 1',
        ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'], { hint: 'Think "L": two squares one way, one square the other. There are 8 squares in total.', explain: 'A knight in the centre has eight possible squares.' }),
      move('Promote your pawn: move it to the last rank and choose a <b>queen</b>.', '7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8q',
        { hint: 'Move the pawn forward one square and choose a queen.', explain: 'Promotion turns the pawn into a brand new queen — here she even gives check!', wrong: { a7a8r: 'A rook works, but a queen is stronger — choose the queen!', a7a8b: 'A bishop works, but a queen is stronger.', a7a8n: 'A knight works, but a queen is stronger.' } }),
      quiz([
        q('Which piece moves in an "L" shape and can jump over other pieces?', ['Knight', 'Bishop', 'Rook', 'Pawn'], 0, 'Only the knight can jump over pieces.'),
        q('How does a pawn capture?', ['Diagonally forward, one square', 'Straight ahead', 'Sideways', 'Like a knight'], 0, 'Pawns move straight but capture diagonally.'),
        q('Which piece can move any distance in a straight line <b>or</b> diagonally?', ['Queen', 'King', 'Knight', 'Pawn'], 0, 'The queen combines the rook and the bishop.'),
        q('A bishop starts on a light square. Which squares can it ever reach?', ['Only light squares', 'Only dark squares', 'Every square', 'Only the edges'], 0, 'Diagonal moves never change square colour.'),
        q('What happens when a pawn reaches the far side of the board?', ['It is promoted', 'It disappears', 'It turns around', 'Nothing'], 0, 'It becomes a queen, rook, bishop or knight.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 3
  lesson({
    id: 'b-captures', level: 'beginner', skill: 'captures', title: 'Capturing and protecting',
    summary: 'Take free pieces, and learn what "protected" means.', minutes: 7,
    steps: [
      learn('How captures work',
        `<p>You capture an enemy piece by moving one of your pieces onto its square. The captured piece is removed from the board. You can never capture your own pieces, and (unlike checkers) capturing is <b>never forced</b> in chess.</p>
         <p>Pieces are worth different amounts. A handy guide: <b>pawn = 1, knight = 3, bishop = 3, rook = 5, queen = 9</b>. The king cannot be captured — he is worth the whole game.</p>`,
        { fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', arrows: [['e4', 'd5', GOLD]] }),
      learn('Protected pieces',
        `<p>A piece is <b>protected</b> (or defended) when a friendly piece could capture back if it were taken. Here Black's d5 pawn is protected by the queen on d8 — if the e4 pawn takes it, the queen takes back.</p>
         <p>Before you capture, always ask: <b>"Is it protected?"</b> and <b>"What do I lose if they take back?"</b></p>`,
        { fen: '3qk3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', arrows: [['e4', 'd5', GOLD], ['d8', 'd5', RED]] }),
      move('Win material safely: capture the pawn that is <b>not</b> protected.', '1k5r/p7/8/8/R3p3/8/8/4K3 w - - 0 1', 'a4e4',
        { verify: 'best', hint: 'One black pawn is guarded by the king. Which one is on its own?', explain: 'The a7 pawn is protected by the king, so Rxa7+ Kxa7 would lose a rook for a pawn. The e4 pawn is free.', wrong: { a4a7: 'The a7 pawn is protected by the black king on b8 — you would lose your rook for a pawn.' } }),
      move('Capture the black queen!', '4k3/8/8/3q4/8/5B2/8/4K3 w - - 0 1', 'f3d5',
        { verify: 'best', hint: 'Bishops move diagonally. Which black piece is on your bishop\'s diagonal?', explain: 'The queen was not protected, so Bxd5 wins her for free.' }),
      choice('Think before you take!', 'White\'s rook can capture the knight on a8. Is it a good idea?', ['Yes — a rook takes a knight for free', 'No — the knight is protected by the king, so I would lose my rook for a knight'], 1,
        'The knight on a8 is guarded by the black king on b7, so after Rxa8 Kxa8 you would have given a rook (5) for a knight (3) — a bad trade.', { fen: 'n7/1k6/8/8/8/8/8/R3K3 w - - 0 1' }),
      quiz([
        q('You capture a piece by…', ['moving one of your pieces onto its square', 'jumping over it', 'touching it twice', 'moving next to it'], 0, 'The captured piece is removed from the board.'),
        q('Can you capture your own pieces?', ['No', 'Yes, if you are in a hurry', 'Only with the king', 'Only pawns'], 0, 'Your own pieces block your moves; they cannot be captured.'),
        q('A piece is "protected" when…', ['a friendly piece could recapture on that square', 'it is on the edge', 'it is a pawn', 'it has not moved yet'], 0, 'If the enemy takes it, you can take back.'),
        q('Which trade is <b>best</b> for you?', ['Winning a rook (5) for a knight (3)', 'Losing a rook (5) for a knight (3)', 'Losing a queen (9) for a pawn (1)', 'Giving up a bishop (3) for a pawn (1)'], 0, 'Add up what you win and lose.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 4
  lesson({
    id: 'b-check', level: 'beginner', skill: 'rules', title: 'Check, checkmate and stalemate',
    summary: 'The aim of the game and how it can end.', minutes: 8,
    steps: [
      learn('What is check?',
        `<p>When a piece attacks the enemy king, the king is in <b>check</b>. Here the white bishop attacks the black king along the diagonal.</p>
         <p>If you are in check you <b>must</b> get out of it immediately. There are exactly three ways:</p>
         <ol><li><b>Move</b> the king to a safe square.</li><li><b>Block</b> the attack with another piece.</li><li><b>Capture</b> the attacking piece.</li></ol>
         <p>You are never allowed to make a move that leaves your own king in check.</p>`,
        { fen: '4k3/8/8/8/B7/8/8/4K3 b - - 0 1', arrows: [['a4', 'e8', RED]], marks: [{ sq: 'e8', kind: 'bad' }], orientation: 'b' }),
      move('Your king is in check from the queen. Escape by <b>capturing</b> her.', '4k3/8/8/8/8/8/4q3/R3K3 w - - 0 1', 'e1e2',
        { hint: 'The queen is right next to your king, and nothing protects her.', explain: 'The king may capture an attacker as long as the capturing square is not protected by the enemy.' }),
      move('Your king is in check from the rook. Escape by <b>blocking</b> with your knight.', '4k3/8/8/8/8/3N4/5PPP/r5K1 w - - 0 1', ['d3c1', 'd3e1'],
        { hint: 'Put your knight between the rook and the king, somewhere on the first rank.', explain: 'Your own pawns box the king in, so a block is the only way out: Nc1 or Ne1 both work.' }),
      learn('Checkmate!',
        `<p>If a king is in check and has <b>no legal way out</b> — it cannot move, block or capture — that is <b>checkmate</b> and the game is over. Here Black's king is trapped by his own pawns and the rook on a8 gives check.</p>`,
        { fen: 'R6k/6pp/8/8/8/8/8/6K1 b - - 0 1', arrows: [['a8', 'h8', RED]], marks: [{ sq: 'h8', kind: 'bad' }], orientation: 'b' }),
      move('Deliver <b>checkmate</b> in one move.', '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8',
        { hint: 'The black king is hemmed in by its own pawns. Use your rook on the back rank.', explain: 'Ra8#: the king cannot move (own pawns), cannot capture the rook and nothing can block.' }),
      learn('Stalemate — a draw',
        `<p>If it is your turn, you are <b>not</b> in check, but you have <b>no legal move at all</b>, that is <b>stalemate</b>. The game is a <b>draw</b>, not a win for the side with more material!</p>
         <p>Here Black to move has no legal moves but is not in check.</p>`,
        { fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', orientation: 'b' }),
      move('Checkmate in one — but <b>beware of stalemate</b>!', '8/1Q6/8/8/8/2K5/8/k7 w - - 0 1', 'b7b2',
        { hint: 'The queen must give check, protected by your king.', explain: 'Qb2# is protected by the king on c3. Qb3 would be stalemate!', wrong: { b7b3: 'Stalemate! Black has no legal move but is not in check — the game is drawn.', b7a7: 'Check, but the king simply steps to b1. Try to give check with protection.' } }),
      quiz([
        q('What must you do when your king is in check?', ['Get out of check immediately', 'Capture any piece', 'Resign', 'Nothing — check is only a warning'], 0, 'Move, block or capture — you cannot ignore check.'),
        q('Checkmate means…', ['The king is in check and cannot escape', 'The king has no pieces left', 'A pawn reached the end', 'The queen was captured'], 0, 'Checkmate ends the game with a win for the attacker.'),
        q('Stalemate means…', ['The player to move has no legal move and is not in check — a draw', 'The player to move is in check', 'Both players agree to stop', 'The king is captured'], 0, 'Stalemate is a draw.'),
        q('Which is <b>not</b> a way to get out of check?', ['Ignore it and attack something', 'Capture the attacker', 'Block the line of attack', 'Move the king'], 0, 'The three legal answers are move, block and capture.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 5
  lesson({
    id: 'b-opening', level: 'beginner', skill: 'opening', title: 'Opening principles',
    summary: 'How to start a game sensibly.', minutes: 7,
    steps: [
      learn('Three simple goals',
        `<p>You don't need to memorise long opening lines to play well. Follow three principles:</p>
         <ol><li><b>Control the centre</b> (the squares d4, e4, d5, e5) with your pawns.</li>
         <li><b>Develop your pieces</b>: bring knights and bishops out early, where they control many squares.</li>
         <li><b>Castle</b> early to tuck your king away safely and bring a rook into play.</li></ol>
         <p>Avoid moving the same piece again and again, and don't rush your queen out too early — she can be chased around.</p>`,
        { fen: START, marks: [{ sq: 'd4', kind: 'info' }, { sq: 'e4', kind: 'info' }, { sq: 'd5', kind: 'info' }, { sq: 'e5', kind: 'info' }] }),
      move('Make a good <b>first move</b>: put a pawn in the centre.', START, ['e2e4', 'd2d4', 'c2c4', 'g1f3'],
        { hint: 'Push one of the two central pawns forward.', explain: 'Central pawns claim space and open lines for your bishops and queen. (e4 and d4 are the most popular first moves.)', wrong: { a2a4: 'Edge pawns do little for the centre.', h2h4: 'Edge pawns do little for the centre.', a2a3: 'This wastes a move on the edge.', h2h3: 'This wastes a move on the edge.' } }),
      move('Black copied you with <b>1.e4 e5</b>. <b>Develop a knight</b> towards the centre.', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', ['g1f3', 'b1c3'],
        { hint: 'Knights belong on f3 or c3, not on the edge.', explain: 'Nf3 develops a piece and attacks the e5 pawn at the same time.' }),
      move('Your pieces are out. <b>Castle kingside</b> to protect your king.', 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'e1g1',
        { hint: 'To castle, move the king two squares towards the rook.', explain: 'Castling moves the king to g1 and the rook to f1 in one move — king safe, rook active.' }),
      quiz([
        q('Which squares are the <b>central</b> squares?', ['d4, e4, d5, e5', 'a1, a8, h1, h8', 'b2, b7, g2, g7', 'e1, e8, d1, d8'], 0, 'Controlling the centre gives your pieces more room.'),
        q('Which of these is usually a <b>bad</b> idea in the opening?', ['Bringing the queen out early and moving her again and again', 'Developing a knight', 'Castling', 'Pushing a central pawn'], 0, 'The queen can be chased by weaker pieces, costing you time.'),
        q('Why is castling useful?', ['It protects the king and activates a rook', 'It captures a piece', 'It wins a pawn', 'It is required every game'], 0, 'Castling does two jobs in one move.'),
        q('Which pieces should you usually bring out first?', ['Knights and bishops', 'The king', 'All the pawns', 'Rooks'], 0, 'Minor pieces first, then castle.'),
      ]),
    ],
  }),

  // ------------------------------------------------------------------ 6
  lesson({
    id: 'b-mates', level: 'beginner', skill: 'mates', title: 'Your first checkmates',
    summary: 'The back-rank mate and the two-rook ladder.', minutes: 8,
    steps: [
      learn('The back-rank mate',
        `<p>A king that stays on the back rank behind its own pawns can get trapped. A rook or queen arriving on that rank delivers <b>back-rank mate</b>. Always look for it — and keep it in mind when you castle!</p>`,
        { fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', arrows: [['e1', 'e8', GOLD]] }),
      move('Find the back-rank mate.', '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', 'e1e8',
        { hint: 'Slide the rook up the open file to the back rank.', explain: 'Re8# — the pawns f7, g7 and h7 take away the king\'s escape squares.' }),
      move('Queen and king work together. Find the <b>checkmate</b>.', '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 'g1g7',
        { hint: 'Give check on a square where your king protects the queen.', explain: 'Qg7# — the queen is guarded by the king, so the black king cannot take her, and there is no escape.', wrong: { g1g8: 'The king simply captures the queen on g8 — she is not protected there.' } }),
      learn('The two-rook ladder',
        `<p>Two rooks can mate a lone king by working like the steps of a <b>ladder</b>: one rook cuts off a rank, the other gives check on the next rank, and they leapfrog towards the edge. Try it: one rook takes the 7th rank and the king is pushed to the edge.</p>`,
        { fen: '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1', arrows: [['b1', 'b7', GOLD]] }),
      line('Mate in two: use both rooks like a ladder.', '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1',
        [{ accept: ['b1b7', 'a2a7'], reply: 'h8g8' }, { accept: ['a2a8', 'b1b8'] }],
        { hint: 'First cut the king off from the 7th rank with a rook. Then check on the 8th rank with the other rook.', explain: 'Rb7 cuts off the 7th rank, the king must step to g8, then Ra8# is mate.' }),
      quiz([
        q('In a back-rank mate the king is trapped by…', ['its own pawns', 'the knight', 'the board edge only', 'stalemate'], 0, 'The pawns in front of the king take away its escape squares.'),
        q('Why must you be careful when you are far ahead in material?', ['A careless move can cause stalemate and a draw', 'You must resign', 'The queen cannot move', 'Pawns become slower'], 0, 'Always leave the enemy king a legal move unless you give mate.'),
        q('Before you play a checkmating move, you should check that the king…', ['cannot move, capture the checker or block', 'is on a light square', 'is near the queen', 'has no pawns'], 0, 'If any of the three escapes exists, it is not mate.'),
      ]),
    ],
  }),
];
