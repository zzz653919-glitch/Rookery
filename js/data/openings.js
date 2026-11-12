// Opening database: ECO code, name, main line (SAN). Lines are verified legal by tests/openings.test.mjs.
// `idea` (optional) is a short plan, translated like any other interface text.
export const OPENINGS = [
  // ---- first moves
  ['B00', "King's Pawn Opening", 'e4', 'The most popular first move: it claims the centre and opens lines for the queen and the bishop.'],
  ['A40', "Queen's Pawn Opening", 'd4', 'Claims the centre with support from the queen and bishop. Leads to more strategic games.'],
  // ---- 1.e4 e5
  ['C20', "King's Pawn Game", 'e4 e5', 'Both sides claim the centre. Open lines, quick development and early tactics.'],
  ['C23', "Bishop's Opening", 'e4 e5 Bc4'],
  ['C30', "King's Gambit", 'e4 e5 f4', 'White sacrifices a pawn for a strong centre and an open f-file. Sharp and romantic.'],
  ['C33', "King's Gambit Accepted", 'e4 e5 f4 exf4'],
  ['C30', "King's Gambit Declined", 'e4 e5 f4 Bc5'],
  ['C40', "King's Knight Opening", 'e4 e5 Nf3'],
  ['C42', 'Petrov Defence', 'e4 e5 Nf3 Nf6', 'Black mirrors White and counter-attacks e4. Very solid, often drawish.'],
  ['C44', 'Scotch Game', 'e4 e5 Nf3 Nc6 d4', 'White opens the centre at once. Direct, clear plans.'],
  ['C45', 'Scotch Game: Classical', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5'],
  ['C46', 'Three Knights Game', 'e4 e5 Nf3 Nc6 Nc3'],
  ['C47', 'Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['C50', 'Italian Game', 'e4 e5 Nf3 Nc6 Bc4', 'Develop quickly and aim at f7. A great opening for learning chess principles.'],
  ['C51', 'Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', 'A pawn for rapid development and a big centre.'],
  ['C53', 'Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3', 'The "quiet game": White prepares d4.'],
  ['C55', 'Two Knights Defence', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['C57', 'Fried Liver Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
  ['C60', 'Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5', 'Pressure on the knight that guards e5. One of the oldest and richest openings.'],
  ['C65', 'Ruy Lopez: Berlin Defence', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['C68', 'Ruy Lopez: Exchange Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'],
  ['C78', 'Ruy Lopez: Morphy Defence', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O'],
  ['C88', 'Ruy Lopez: Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'],
  ['C41', 'Philidor Defence', 'e4 e5 Nf3 d6'],
  ['C42', "Russian Game: Cochrane Gambit", 'e4 e5 Nf3 Nf6 Nxe5 d6 Nxf7'],
  ['C21', 'Danish Gambit', 'e4 e5 d4 exd4 c3'],
  ['C25', 'Vienna Game', 'e4 e5 Nc3'],
  ['C44', "Ponziani Opening", 'e4 e5 Nf3 Nc6 c3'],
  ['C44', 'Latvian Gambit', 'e4 e5 Nf3 f5'],
  // ---- 1.e4 others
  ['B20', 'Sicilian Defence', 'e4 c5', 'Black fights for the centre from the side and plays for a win. The most popular reply to 1.e4.'],
  ['B30', 'Sicilian: Old Sicilian', 'e4 c5 Nf3 Nc6'],
  ['B40', 'Sicilian: French Variation', 'e4 c5 Nf3 e6'],
  ['B50', 'Sicilian: Modern', 'e4 c5 Nf3 d6'],
  ['B90', 'Sicilian: Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'The favourite of Fischer and Kasparov: flexible and combative.'],
  ['B80', 'Sicilian: Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
  ['B70', 'Sicilian: Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['B60', 'Sicilian: Richter-Rauzer', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5'],
  ['B33', 'Sicilian: Sveshnikov', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5'],
  ['B22', 'Sicilian: Alapin', 'e4 c5 c3'],
  ['B23', 'Sicilian: Closed', 'e4 c5 Nc3'],
  ['B21', 'Sicilian: Smith-Morra Gambit', 'e4 c5 d4 cxd4 c3'],
  ['C00', 'French Defence', 'e4 e6', 'Black builds a solid pawn chain and strikes with ...d5. Strategic play.'],
  ['C02', 'French: Advance', 'e4 e6 d4 d5 e5'],
  ['C03', 'French: Tarrasch', 'e4 e6 d4 d5 Nd2'],
  ['C10', 'French: Rubinstein', 'e4 e6 d4 d5 Nc3 dxe4'],
  ['C11', 'French: Classical', 'e4 e6 d4 d5 Nc3 Nf6'],
  ['C15', 'French: Winawer', 'e4 e6 d4 d5 Nc3 Bb4'],
  ['C01', 'French: Exchange', 'e4 e6 d4 d5 exd5 exd5'],
  ['B10', 'Caro-Kann Defence', 'e4 c6', 'Solid and reliable: Black prepares ...d5 without blocking the bishop.'],
  ['B12', 'Caro-Kann: Advance', 'e4 c6 d4 d5 e5'],
  ['B13', 'Caro-Kann: Exchange', 'e4 c6 d4 d5 exd5 cxd5'],
  ['B18', 'Caro-Kann: Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
  ['B17', 'Caro-Kann: Karpov', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7'],
  ['B07', 'Pirc Defence', 'e4 d6 d4 Nf6 Nc3 g6'],
  ['B06', 'Modern Defence', 'e4 g6'],
  ['B01', 'Scandinavian Defence', 'e4 d5', 'Black challenges e4 immediately. Easy to learn.'],
  ['B01', 'Scandinavian: Main Line', 'e4 d5 exd5 Qxd5 Nc3 Qa5'],
  ['B02', "Alekhine's Defence", 'e4 Nf6'],
  ['B00', "Nimzowitsch Defence", 'e4 Nc6'],
  ['B00', "St. George Defence", 'e4 a6'],
  // ---- 1.d4 d5
  ['D00', "Queen's Pawn Game", 'd4 d5'],
  ['D06', "Queen's Gambit", 'd4 d5 c4', 'White offers a pawn to deflect Black\'s central pawn. Not a true gambit: White regains it.'],
  ['D20', "Queen's Gambit Accepted", 'd4 d5 c4 dxc4'],
  ['D30', "Queen's Gambit Declined", 'd4 d5 c4 e6'],
  ['D35', 'QGD: Exchange', 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5'],
  ['D37', 'QGD: Classical', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Be7'],
  ['D50', 'QGD: Orthodox', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3'],
  ['D43', 'Semi-Slav Defence', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'],
  ['D10', 'Slav Defence', 'd4 d5 c4 c6', 'Black supports d5 with a pawn and keeps the bishop free.'],
  ['D15', 'Slav: Main Line', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4'],
  ['D08', 'Albin Counter-Gambit', 'd4 d5 c4 e5'],
  ['D02', 'London System', 'd4 d5 Nf3 Nf6 Bf4', 'A solid, easy-to-learn system: develop the same pieces to the same squares against almost anything.'],
  ['D01', 'Veresov Attack', 'd4 d5 Nc3 Nf6 Bg5'],
  ['D00', 'Colle System', 'd4 d5 Nf3 Nf6 e3'],
  ['A45', 'Trompowsky Attack', 'd4 Nf6 Bg5'],
  // ---- 1.d4 Nf6
  ['A45', 'Indian Defence', 'd4 Nf6'],
  ['E60', "King's Indian Defence", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', 'Black lets White build a big centre, then attacks it. Rich in kingside attacks.'],
  ['E70', "King's Indian: Classical", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5'],
  ['D70', 'Grünfeld Defence', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['D85', 'Grünfeld: Exchange', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3'],
  ['E20', 'Nimzo-Indian Defence', 'd4 Nf6 c4 e6 Nc3 Bb4', 'Black pins the knight and fights for e4. A favourite of top players.'],
  ['E32', 'Nimzo-Indian: Classical', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2'],
  ['E40', 'Nimzo-Indian: Rubinstein', 'd4 Nf6 c4 e6 Nc3 Bb4 e3'],
  ['E00', "Catalan Opening", 'd4 Nf6 c4 e6 g3', 'White\'s bishop on g2 pressures the long diagonal.'],
  ['E12', "Queen's Indian Defence", 'd4 Nf6 c4 e6 Nf3 b6'],
  ['E11', 'Bogo-Indian Defence', 'd4 Nf6 c4 e6 Nf3 Bb4+'],
  ['A57', 'Benko Gambit', 'd4 Nf6 c4 c5 d5 b5'],
  ['A60', 'Benoni Defence', 'd4 Nf6 c4 c5 d5 e6'],
  ['A80', 'Dutch Defence', 'd4 f5'],
  ['A40', "Englund Gambit", 'd4 e5'],
  ['A40', "Queen's Pawn: Modern", 'd4 g6'],
  // ---- flank openings
  ['A10', 'English Opening', 'c4', 'A flexible flank opening: White controls d5 and keeps options open.'],
  ['A20', 'English: Reversed Sicilian', 'c4 e5'],
  ['A30', 'English: Symmetrical', 'c4 c5'],
  ['A15', 'English: Anglo-Indian', 'c4 Nf6'],
  ['A04', 'Réti Opening', 'Nf3', 'White develops first and decides on the pawn structure later.'],
  ['A07', "King's Indian Attack", 'Nf3 d5 g3'],
  ['A09', 'Réti: Advance', 'Nf3 d5 c4'],
  ['A00', 'Polish Opening', 'b4'],
  ['A00', "Bird's Opening", 'f4'],
  ['A02', "Bird's: From's Gambit", 'f4 e5 fxe5 d6'],
  ['A01', "Larsen's Opening", 'b3'],
  ['A00', 'Grob Opening', 'g4'],
  ['A00', 'Hungarian Opening', 'g3'],
  ['A00', 'Van Geet Opening', 'Nc3'],
  ['A00', 'Zukertort Opening', 'Nf3 d5'],
];

// ---- helpers ------------------------------------------------------------------------------------------
export const ECO_GROUPS = { A: 'Flank & unusual openings', B: 'Semi-open games (1.e4, not 1…e5)', C: 'Open games & French', D: "Closed games & Queen's Gambit", E: 'Indian defences' };
export const lineOf = (o) => o[2].split(' ');
const KEY = (sans) => sans.join(' ');
let index = null;
function build() {
  index = new Map();
  for (const o of OPENINGS) index.set(KEY(lineOf(o)), o);
}
// The most specific opening whose line is a prefix of the played moves (SAN).
export function identify(sans) {
  if (!index) build();
  for (let n = sans.length; n > 0; n--) { const o = index.get(KEY(sans.slice(0, n))); if (o) return { opening: o, plies: n }; }
  return null;
}
// Openings that continue the given moves, grouped by their next move.
export function continuations(sans) {
  const out = new Map();
  for (const o of OPENINGS) {
    const line = lineOf(o);
    if (line.length <= sans.length || !sans.every((m, i) => line[i] === m)) continue;
    const next = line[sans.length];
    if (!out.has(next)) out.set(next, []);
    out.get(next).push(o);
  }
  return [...out.entries()].map(([move, list]) => ({ move, openings: list, count: list.length })).sort((a, b) => b.count - a.count);
}
