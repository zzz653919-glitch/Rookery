// News: articles written in the admin panel.
import { esc, emptyState, loader, icon } from '../ui/dom.js';
import { t, getLang } from '../i18n/core.js';
import { net, get } from '../net.js';

const date = (iso) => { try { return new Date(iso).toLocaleDateString(getLang(), { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return ''; } };

export async function mount(root, { params }) {
  if (!net.available) { root.innerHTML = emptyState({ emoji: '📰', title: t('News needs the Rookery server'), body: t('Articles are published from the admin panel of the server.') }); return; }
  root.innerHTML = loader();
  if (params.id) {
    let a; try { a = await get('/api/news/' + encodeURIComponent(params.id) + '?lang=' + getLang()); } catch (e) { root.innerHTML = emptyState({ emoji: '🔎', title: t('Article not found'), body: esc(t(e.message)), actionHtml: `<a class="btn" href="#/news">${t('All news')}</a>` }); return; }
    root.innerHTML = `<article class="article"><a class="btn ghost sm" href="#/news">${icon('back', 16)} ${t('All news')}</a><div class="eyebrow" style="margin-top:14px">${date(a.published_at)}${a.author ? ' · ' + esc(a.author) : ''}</div><h1>${esc(a.title)}</h1><div class="prose">${a.body}</div></article>`;
    document.title = a.title + ' · Rookery';
    return;
  }
  let items = []; try { items = (await get('/api/news?lang=' + getLang())).items; } catch { /* empty */ }
  root.innerHTML = `<div class="page-head"><div><div class="eyebrow">${t('News')}</div><h1>${t('What is new at Rookery')}</h1><p>${t('Announcements, events and chess stories.')}</p></div></div>
    ${items.length ? `<div class="grid auto news-grid">${items.map((n, i) => `<a class="card hover news-card ${i === 0 ? 'first' : ''}" href="#/news/${n.id}"><div class="eyebrow">${date(n.published_at)}</div><h3>${esc(n.title)}</h3><p class="muted">${esc(n.summary || '')}</p><span class="more">${t('Read more')} ${icon('arrow', 16)}</span></a>`).join('')}</div>` : emptyState({ emoji: '📰', title: t('No news yet'), body: t('Check back soon.') })}`;
}
