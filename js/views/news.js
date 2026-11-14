// Chess news: articles from official sources (with the original source and date), Rookery's own articles and anything written in the admin panel.
import { esc, emptyState, loader, icon } from '../ui/dom.js';
import { t } from '../i18n/core.js';
import { net } from '../net.js';
import { subnav, bindSubnav, wget, fmtDate, imgTag, sourceLine, errorBox } from '../ui/world.js';

export async function mount(root, { params, navigate }) {
  if (!net.available) { root.innerHTML = emptyState({ emoji: '📰', title: t('News needs the Rookery server'), body: t('Articles are published from the admin panel of the server.') }); return; }
  let disposed = false;
  if (params.id) return article(root, params.id, navigate);
  let cats = [], cat = '', q = '', page = 1, items = [], total = 0;
  try { cats = (await wget('categories')).categories; } catch { /* the filter simply stays empty */ }

  async function load(more) {
    const box = root.querySelector('#n-list'); if (!more) box.innerHTML = loader();
    let d; try { d = await wget('news', { category: cat, q, page, size: 18 }); } catch (e) { box.innerHTML = errorBox(e); box.querySelector('[data-retry]').onclick = () => load(false); return; }
    if (disposed) return; total = d.total; items = more ? items.concat(d.items) : d.items; paint();
  }
  const card = (a, i) => `<a class="wcard news ${i === 0 && !q && !cat && page === 1 ? 'lead' : ''}" href="#/news/${encodeURIComponent(a.id)}" data-img>
      <div class="wimg">${imgTag(a.image, '')}<span class="wcat">${esc(cats.find((c) => c.slug === a.category)?.name || a.category)}</span></div>
      <div class="wbody"><h3>${esc(a.title)}</h3><p class="muted">${esc(a.summary || '')}</p>${sourceLine(a)}</div></a>`;
  function paint() {
    const box = root.querySelector('#n-list');
    box.innerHTML = items.length ? `<div class="wgrid news-grid2">${items.map(card).join('')}</div>${items.length < total ? `<div class="center"><button class="btn" id="n-more" type="button">${t('Show more')}</button></div>` : ''}` : emptyState({ emoji: '📰', title: t('No articles found'), body: t('Try another category or search.') });
    box.querySelector('#n-more')?.addEventListener('click', () => { page++; load(true); });
  }
  root.innerHTML = `${subnav('news')}<div class="page-head"><div><div class="eyebrow">${t('Chess World')}</div><h1>${t('Chess news')}</h1><p>${t('Announcements, interviews, results and rule changes from official chess sources. Every article shows where it comes from.')}</p></div></div>
    <div class="wfilters"><div class="chips" id="n-cats"><button class="chipb on" data-c="" type="button">${t('All')}</button>${cats.map((c) => `<button class="chipb" data-c="${esc(c.slug)}" type="button">${esc(c.name)}</button>`).join('')}</div>
      <input type="search" id="n-q" placeholder="${esc(t('Search news'))}" maxlength="60" aria-label="${esc(t('Search news'))}"></div><div id="n-list"></div>`;
  bindSubnav(root, navigate);
  root.querySelectorAll('#n-cats button').forEach((b) => { b.onclick = () => { cat = b.dataset.c; page = 1; root.querySelectorAll('#n-cats button').forEach((x) => x.classList.toggle('on', x === b)); load(false); }; });
  let timer; root.querySelector('#n-q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); page = 1; load(false); }, 300); });
  await load(false);
  return () => { disposed = true; };
}

async function article(root, id, navigate) {
  root.innerHTML = loader();
  let a; try { a = await wget('news/' + encodeURIComponent(id)); } catch (e) { root.innerHTML = emptyState({ emoji: '🔎', title: t('Article not found'), body: esc(t(e.message)), actionHtml: `<a class="btn" href="#/news">${t('All news')}</a>` }); return; }
  const feed = a.origin === 'feed';
  root.innerHTML = `${subnav('news')}<article class="article wart"><a class="btn ghost sm" href="#/news">${icon('back', 16)} ${t('All news')}</a>
    <div class="eyebrow" style="margin-top:14px">${esc(a.category)} · ${fmtDate(a.publishedAt, { year: 'numeric', month: 'long', day: 'numeric' })}</div><h1>${esc(a.title)}</h1>
    <div class="wmeta">${sourceLine(a)}</div>
    ${a.image ? `<figure class="wfig" data-img>${imgTag(a.image, a.title)}<figcaption class="muted small">${t('Image')}: ${esc(a.source || '')}</figcaption></figure>` : ''}
    ${feed ? `<div class="prose"><p>${esc(a.summary || '')}</p></div><div class="card notice-card"><p>${t('This is a summary. The full article is published by the original source.')}</p><a class="btn primary" href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener noreferrer">${t('Read the full article at {source}', { source: esc(a.source || '') })} ${icon('arrow', 16)}</a></div>`
      : `<div class="prose">${a.body}</div>${a.sourceUrl ? `<p class="muted"><a href="${esc(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('Original source')}: ${esc(a.source || a.sourceUrl)}</a></p>` : ''}`}</article>`;
  bindSubnav(root, navigate); document.title = `${a.title} · Rookery`;
}
