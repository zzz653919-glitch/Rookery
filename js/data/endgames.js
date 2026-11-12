// Endgame trainer positions. Each was checked with Stockfish: "win" positions are won for the side to train, "hold" positions are
// theoretical draws that the trained side can hold with correct play. See tests/endgames.test.mjs for the structural checks.
export const ENDGAMES = [
  { id: 'kqk', name: 'King and queen vs king', fen: '8/8/8/3k4/8/8/8/KQ6 w - - 0 1', goal: 'win', user: 'w', level: 1, tip: 'Use the queen to shrink the box around the king, then bring your own king closer. Watch out for stalemate!' },
  { id: 'krk', name: 'King and rook vs king', fen: '8/8/8/4k3/8/8/8/K6R w - - 0 1', goal: 'win', user: 'w', level: 1, tip: 'Cut the king off with the rook, push it to the edge, and use the opposition to give mate.' },
  { id: 'rook-corner', name: 'Rook mate with the king cornered', fen: '8/8/8/8/8/k7/8/K6R w - - 0 1', goal: 'win', user: 'w', level: 1, tip: 'The enemy king is already near the edge. Find the quickest way to mate.' },
  { id: 'backrank', name: 'Back-rank mate', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', goal: 'win', user: 'w', level: 1, tip: 'The black king has no escape squares. Is there a check that cannot be blocked?' },
  { id: 'kbbk', name: 'Two bishops vs king', fen: '8/8/8/4k3/8/8/8/KBB5 w - - 0 1', goal: 'win', user: 'w', level: 2, tip: 'Two bishops on neighbouring diagonals form a wall. Drive the king to a corner.' },
  { id: 'kpk', name: 'King and pawn vs king: win', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', goal: 'win', user: 'w', level: 2, tip: 'Your king is in front of the pawn on the sixth rank: that wins. Keep the opposition and promote.' },
  { id: 'rook-pawn', name: 'Rook and pawn vs king', fen: '8/8/8/8/3k4/8/3P4/3K1R2 w - - 0 1', goal: 'win', user: 'w', level: 2, tip: 'Cut the king off along a file with the rook, then march the pawn forward with your king.' },
  { id: 'opposition', name: 'Opposition: hold the draw', fen: '8/4k3/8/4P3/4K3/8/8/8 w - - 0 1', goal: 'hold', user: 'b', level: 2, tip: 'You are Black. Keep your king in front of the pawn and take the opposition whenever you can.' },
  { id: 'lucena', name: 'Lucena position', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', goal: 'win', user: 'w', level: 3, tip: 'Build a bridge: bring the rook to the fourth rank, step out with the king and shelter behind the rook.' },
  { id: 'philidor', name: 'Philidor position: hold the draw', fen: '4k3/8/r7/3PK3/8/8/8/6R1 b - - 0 1', goal: 'hold', user: 'b', level: 3, tip: 'You are Black. Keep the rook on the sixth rank until the pawn advances, then check from behind.' },
  { id: 'kbnk', name: 'Bishop and knight vs king', fen: '8/8/8/4k3/8/8/8/KBN5 w - - 0 1', goal: 'win', user: 'w', level: 3, tip: 'The hardest basic mate: drive the king to a corner of the bishop\'s colour, using the "W" knight manoeuvre.' },
];
export const MAX_MOVES = { win: 80, hold: 40 };   // moves by the trained side
