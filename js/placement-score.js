// Pure scoring logic for the placement test (no DOM) so it can be unit-tested.
import { PLACEMENT, PLACEMENT_TIERS } from './data/placement.js';
import { LEVELS, SKILLS } from './data/levels.js';

import { assessmentThresholds } from './content.js';

// answers: [{ id, ok }]  (unanswered / skipped questions count as wrong)
export function scorePlacement(answers, items = PLACEMENT) {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const tiers = PLACEMENT_TIERS.map((t) => ({ ...t, right: 0, total: 0, acc: 0 }));
  const skills = {};
  for (const it of items) {
    const a = byId.get(it.id);
    const ok = !!(a && a.ok);
    const t = tiers[it.tier - 1];
    t.total++; if (ok) t.right++;
    const s = (skills[it.skill] ||= { right: 0, total: 0 });
    s.total++; if (ok) s.right++;
  }
  for (const t of tiers) t.acc = t.total ? t.right / t.total : 0;
  const { master: MASTER, bridgeLo: BRIDGE_LO, bridgeNext: BRIDGE_NEXT } = assessmentThresholds();
  const mastered = tiers.map((t, i) => t.acc >= MASTER || (t.acc >= BRIDGE_LO && i + 1 < tiers.length && tiers[i + 1].acc >= BRIDGE_NEXT));
  let k = 0;
  while (k < mastered.length && mastered[k]) k++;
  const levelIdx = Math.min(k, LEVELS.length - 1);
  const total = tiers.reduce((n, t) => n + t.total, 0), right = tiers.reduce((n, t) => n + t.right, 0);
  const strengths = [], weaknesses = [];
  for (const [id, v] of Object.entries(skills)) {
    const r = v.total ? v.right / v.total : 0;
    if (v.total >= 2 && r >= 0.75) strengths.push(id);
    else if (r <= 0.5) weaknesses.push(id);
  }
  const order = (arr) => arr.sort((a, b) => (skills[b].right / skills[b].total) - (skills[a].right / skills[a].total) || a.localeCompare(b));
  return {
    level: LEVELS[levelIdx].id, levelIdx, right, total, pct: total ? Math.round((100 * right) / total) : 0,
    tiers: tiers.map(({ tier, name, right, total, acc }) => ({ tier, name, right, total, acc })),
    skills, strengths: order(strengths), weaknesses: order(weaknesses).reverse(),
    date: new Date().toISOString(),
  };
}
export const skillName = (id) => SKILLS[id] || id;
