# Stockfish (bundled engine)

`stockfish-19-lite-single.js` and `stockfish-19-lite-single.wasm` are **Stockfish.js 19.0.1** ("lite", single-threaded) from the npm package
[`stockfish`](https://www.npmjs.com/package/stockfish), © Chess.com, LLC / Nathan Rugg, based on **Stockfish** © T. Romstad, M. Costalba, J. Kiiski,
G. Linscott and the Stockfish developers, with neural-network files by Chris Bao.

* License: **GNU General Public License v3.0** (see `LICENSE-GPL-3.0.txt`).
* Source code of these exact files: https://github.com/nmrugg/stockfish.js (tag v19.0.1) and https://github.com/official-stockfish/Stockfish
* The engine runs as a separate Web Worker and is driven only through the UCI text protocol; the rest of Rookery is not derived from it.
  If you redistribute Rookery together with these files you must keep this notice and comply with the GPL-3.0 for them.
