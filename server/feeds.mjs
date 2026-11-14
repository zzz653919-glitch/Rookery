// Minimal RSS 2.0 / Atom reader (no dependencies). Returns plain entries; HTML is reduced to a short text excerpt.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => String(s ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const cdata = (s) => String(s ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
const tag = (xml, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? cdata(m[1]).trim() : ''; };
const attr = (xml, name, a) => { const m = new RegExp(`<${name}\\b[^>]*\\s${a}=["']([^"']+)["']`, 'i').exec(xml); return m ? decode(m[1]) : ''; };
export const textOf = (html, max = 420) => {
  let t = decode(cdata(html)); t = decode(t); // some feeds escape their HTML twice
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t;
};
const firstImg = (html) => { const h = decode(cdata(html)); const m = /<img[^>]+src=["']([^"']+)["']/i.exec(h) || /<img[^>]+src=["']([^"']+)["']/i.exec(decode(h)); return m ? decode(m[1]) : ''; };
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.toString() : ''; } catch { return ''; } };
const iso = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

export function parseFeed(xml) {
  const text = String(xml || '');
  const out = [];
  const atom = /<feed[\s>]/i.test(text);
  const re = atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  for (const m of text.matchAll(re)) {
    const e = m[0];
    const title = textOf(tag(e, 'title'), 200);
    let link = '';
    if (atom) {
      const alt = /<link\b[^>]*rel=["']alternate["'][^>]*>/i.exec(e) || /<link\b[^>]*>/i.exec(e);
      link = alt ? decode((/href=["']([^"']+)["']/i.exec(alt[0]) || [])[1] || '') : '';
    } else link = decode(tag(e, 'link')) || decode(tag(e, 'guid'));
    const id = decode(tag(e, atom ? 'id' : 'guid')) || link;
    const body = tag(e, atom ? 'content' : 'content:encoded') || tag(e, atom ? 'summary' : 'description');
    const summary = textOf(tag(e, atom ? 'summary' : 'description') || body);
    let image = attr(e, 'media:thumbnail', 'url') || attr(e, 'media:content', 'url');
    if (!image) { const enc = /<enclosure\b[^>]*>/i.exec(e); if (enc && /type=["']image\//i.test(enc[0])) image = decode((/url=["']([^"']+)["']/i.exec(enc[0]) || [])[1] || ''); }
    if (!image) image = firstImg(body) || firstImg(tag(e, 'description'));
    const published = iso(tag(e, atom ? 'published' : 'pubDate') || tag(e, 'dc:date') || tag(e, 'updated'));
    const cat = atom ? attr(e, 'category', 'label') || attr(e, 'category', 'term') : textOf(tag(e, 'category'), 60);
    if (!title || !safeUrl(link)) continue;
    out.push({ id: id.slice(0, 300), title, link: safeUrl(link), summary, image: safeUrl(image), published, category: cat || null });
  }
  return out;
}
