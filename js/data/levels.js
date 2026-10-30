// Learning levels and skill taxonomy used across the app.

export const LEVELS = [
  { id: 'beginner', name: 'Beginner', n: 1, blurb: 'Knows little or nothing about chess.', engine: 2,
    focus: 'Learn how the pieces move, what check and checkmate mean, and a few opening ideas.' },
  { id: 'elementary', name: 'Elementary', n: 2, blurb: 'Understands the rules and basic tactics.', engine: 3,
    focus: 'Spot forks, pins and skewers, defend your pieces and find short checkmates.' },
  { id: 'intermediate', name: 'Intermediate', n: 3, blurb: 'Understands tactics and basic positional ideas.', engine: 4,
    focus: 'Combine tactics, plan around weaknesses and convert rook endgames.' },
  { id: 'advanced', name: 'Advanced', n: 4, blurb: 'Handles complex tactics and strategic positions.', engine: 5,
    focus: 'Calculate candidate moves, prevent your opponent\'s plans and prepare your openings.' },
  { id: 'expert', name: 'Expert', n: 5, blurb: 'Strong tactical and positional understanding.', engine: 6,
    focus: 'Deep calculation, imbalances, endgame technique and master-game analysis.' },
];

export const levelIndex = (id) => LEVELS.findIndex((l) => l.id === id);
export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;

// Which computer difficulty (1..8) suits a learning level
export const levelToEngine = (id) => levelById(id)?.engine ?? 2;

export const SKILLS = {
  movement: 'Piece movement',
  rules: 'Check, mate & rules',
  captures: 'Captures & loose pieces',
  tactics: 'Forks, pins & skewers',
  opening: 'Opening principles',
  mates: 'Checkmate patterns',
  endgame: 'Endgames',
  strategy: 'Positional play',
  calculation: 'Calculation',
};

// Puzzle categories (mutable: the optional admin server can add, rename or hide categories).
export const THEMES = {
  mate1: { name: 'Mate in 1', desc: 'Deliver checkmate in a single move.', skill: 'mates' },
  mate2: { name: 'Mate in 2', desc: 'Force checkmate on your second move.', skill: 'mates' },
  fork: { name: 'Forks', desc: 'Attack two pieces at once.', skill: 'tactics' },
  pin: { name: 'Pins', desc: 'Win material with a piece that cannot move.', skill: 'tactics' },
  skewer: { name: 'Skewers', desc: 'Attack the big piece, win the one behind it.', skill: 'tactics' },
  discovered: { name: 'Discovered attacks', desc: 'Move one piece, unleash another.', skill: 'tactics' },
};
