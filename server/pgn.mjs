// PGN reading for the Chess World features: split multi-game files, read headers and, for every move, the clock and the engine
// evaluation that broadcasts embed as comments ([%clk 1:30:59] [%eval 0.18]). Variations are skipped.
export function splitGames(text) {
  const t = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!t) return [];
  return t.split(/\n\s*\n(?=\[Event\s)/).map((g) => g.trim()).filter((g) => g.startsWith('['));
}

export function headersOf(game) {
  const h = {};
  for (const m of game.matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) h[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
  return h;
}

const clkSeconds = (s) => { const m = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.\d+)?$/.exec(s); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };

// -> { moves: [{ san, clk (seconds|null), eval ({cp}|{mate}|null) }], result }
export function movesOf(game) {
  const body = game.replace(/^\[.*\]\s*$/gm, '');
  const out = []; let depth = 0, result = '*';
  const re = /\{([^}]*)\}|;[^\n]*|(\()|(\))|\$\d+|(\d+\.(?:\.\.)?)|([^\s{}()]+)/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) {
      if (depth || !out.length) continue;
      const last = out[out.length - 1];
      const clk = /\[%clk\s+([\d:.]+)\]/.exec(m[1]); if (clk) last.clk = clkSeconds(clk[1]);
      const ev = /\[%eval\s+(#?-?[\d.]+)\]/.exec(m[1]);
      if (ev) last.eval = ev[1][0] === '#' ? { mate: parseInt(ev[1].slice(1), 10) } : { cp: Math.round(parseFloat(ev[1]) * 100) };
    } else if (m[2]) depth++;
    else if (m[3]) depth = Math.max(0, depth - 1);
    else if (m[5] && !depth) {
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(m[5])) result = m[5];
      else if (!/^[0-9]+\.+$/.test(m[5]) && !/^\$\d+$/.test(m[5])) out.push({ san: m[5].replace(/[!?]+$/, ''), clk: null, eval: null });
    }
  }
  return { moves: out, result };
}

export const normResult = (r) => (r === '1/2-1/2' || r === '½-½' ? '1/2-1/2' : r === '1-0' || r === '0-1' ? r : '*');
export const asInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
// "2026.10.06" -> "2026-10-06"; unknown parts ("??") are dropped
export function dateOf(h) {
  const d = String(h.UTCDate || h.Date || '').replace(/\./g, '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : /^\d{4}-\d{2}$/.test(d.replace(/-\?+$/, '')) ? d.replace(/-\?+$/, '') : /^\d{4}/.test(d) ? d.slice(0, 4) : null;
}
