// Elo ratings with a faster-moving provisional phase. Time classes follow the usual estimate base + 40 × increment.
export const CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical'];
export function categoryOf(baseMs, incMs) {
  const est = baseMs / 1000 + 40 * (incMs / 1000);
  return est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : 'classical';
}
const kFactor = (games, rating) => (games < 30 ? 40 : rating < 2300 ? 20 : 10);
// score: 1 win, 0.5 draw, 0 loss (for player A). Returns the new ratings (not rounded).
export function eloUpdate(a, b, score) {
  const ea = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
  const eb = 1 - ea;
  return {
    a: a.rating + kFactor(a.games, a.rating) * (score - ea),
    b: b.rating + kFactor(b.games, b.rating) * ((1 - score) - eb),
  };
}
