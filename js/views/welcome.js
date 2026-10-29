// First-visit welcome: choose a level by placement test or manually.
import { store } from '../store.js';
import { LEVELS } from '../data/levels.js';
import { LOGO, icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { checkAchievements } from '../progress.js';

export async function chooseLevel(levelId, source = 'manual') {
  await store.update('profile', (p) => { p.level = levelId; p.levelSource = source; p.levelDate = new Date().toISOString(); p.onboarded = true; });
  await checkAchievements();
}

export function mount(root, { navigate }) {
  const profile = store.get('profile');
  const returning = profile.onboarded;
  root.innerHTML = `
    <div class="welcome"><div class="welcome-card fade-in">
      <div style="width:64px;margin:0 auto 14px">${LOGO}</div>
      <div class="eyebrow">${returning ? 'Change your level' : 'Welcome to Rookery'}</div>
      <h1 style="margin:6px 0 8px">What is your chess level?</h1>
      <p class="muted" style="max-width:56ch;margin:0 auto 26px">Rookery builds a lesson path around you. Take a short placement test, or pick the level that fits. You can change it any time in Settings.</p>
      <div class="grid cols-2" id="main-choices">
        <button class="choice" id="c-test" type="button"><div class="ci">${icon('target', 24)}</div><h3>Take the placement test</h3><p>${23} short questions about rules, tactics, openings and endgames. About 8 minutes. Recommended.</p></button>
        <button class="choice" id="c-manual" type="button"><div class="ci">${icon('user', 24)}</div><h3>Choose my level</h3><p>You already know roughly how well you play.</p></button>
      </div>
      <div id="manual" hidden style="margin-top:22px">
        <h3 style="margin-bottom:12px">Pick your level</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
          ${LEVELS.map((l) => `<button class="level-card" type="button" data-level="${l.id}"><b>${esc(l.name)}</b><small>${esc(l.blurb)}</small></button>`).join('')}
        </div>
        <p class="muted" style="margin-top:12px;font-size:.88rem">Unsure? The placement test will tell you — your result is an estimate, and you can always change level later.</p>
      </div>
      ${returning ? `<p style="margin-top:20px"><a href="#/settings">Cancel</a></p>` : ''}
    </div></div>`;
  root.querySelector('#c-test').onclick = () => navigate('/test');
  root.querySelector('#c-manual').onclick = () => { root.querySelector('#manual').hidden = false; root.querySelector('#manual').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  root.querySelectorAll('.level-card').forEach((b) => {
    b.onclick = async () => { await chooseLevel(b.dataset.level, 'manual'); navigate(returning ? '/learn' : '/home'); };
  });
  return () => {};
}
