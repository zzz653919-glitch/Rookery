// Progress logic: learning path, recommendations, achievements, skill stats.
import { store, currentStreak, longestStreak } from './store.js';
import { LEVELS, levelIndex, SKILLS } from './data/levels.js';
import { LESSONS } from './data/lessons.js';

export const lessonDone = (id) => !!store.get('lessons').done[id];

export function lessonsForLevel(levelId) {
  return LESSONS.filter((l) => l.level === levelId);
}

// Skills where the learner scored poorly in the placement test (or later practice).
export function weakSkills() {
  const out = new Set();
  const placement = store.get('profile').placement;
  if (placement?.skills) {
    for (const [k, v] of Object.entries(placement.skills)) if (v.total && v.right / v.total < 0.6) out.add(k);
  }
  const live = store.get('skills');
  for (const [k, v] of Object.entries(live)) if (v.total >= 5 && v.right / v.total < 0.55) out.add(k);
  return out;
}

export function strongSkills() {
  const out = [];
  const merged = skillStats();
  for (const [k, v] of Object.entries(merged)) if (v.total >= 2 && v.right / v.total >= 0.8) out.push(k);
  return out;
}

// Combine placement-test results with later exercise results per skill.
export function skillStats() {
  const merged = {};
  const placement = store.get('profile').placement;
  if (placement?.skills) for (const [k, v] of Object.entries(placement.skills)) merged[k] = { right: v.right, total: v.total };
  for (const [k, v] of Object.entries(store.get('skills'))) {
    const m = merged[k] || (merged[k] = { right: 0, total: 0 });
    m.right += v.right; m.total += v.total;
  }
  return merged;
}

/**
 * Personalised learning path for the learner's level.
 * - lessons of the current level, weak skills first (flagged "focus")
 * - weak skills that also have a lesson in the level below are offered as "review"
 */
export function buildPath(levelId) {
  const idx = Math.max(0, levelIndex(levelId));
  const weak = weakSkills();
  const main = lessonsForLevel(LEVELS[idx].id).map((l, i) => ({ lesson: l, order: i, focus: weak.has(l.skill) }));
  main.sort((a, b) => (b.focus - a.focus) || (a.order - b.order));
  const review = [];
  if (idx > 0) {
    for (const l of lessonsForLevel(LEVELS[idx - 1].id)) {
      if (weak.has(l.skill) && !lessonDone(l.id)) review.push({ lesson: l, review: true, focus: true });
    }
  }
  return { level: LEVELS[idx], main, review };
}

export function recommendedLesson() {
  const levelId = store.get('profile').level;
  if (!levelId) return null;
  const path = buildPath(levelId);
  const next = [...path.review, ...path.main].find((x) => !lessonDone(x.lesson.id));
  return next ? next.lesson : null;
}

export function pathProgress(levelId) {
  const ls = lessonsForLevel(levelId);
  const done = ls.filter((l) => lessonDone(l.id)).length;
  return { done, total: ls.length, pct: ls.length ? done / ls.length : 0 };
}

// If every lesson of the learner's level is done, suggest moving up.
export function readyForNextLevel() {
  const id = store.get('profile').level;
  const idx = levelIndex(id);
  if (idx < 0 || idx >= LEVELS.length - 1) return null;
  return pathProgress(id).pct >= 1 ? LEVELS[idx + 1] : null;
}

export async function completeLesson(id, score) {
  await store.update('lessons', (l) => {
    l.done[id] = new Date().toISOString();
    l.scores[id] = Math.max(l.scores[id] || 0, score);
  });
}

// ------------------------------------------------------------ puzzles stats
export function puzzleAccuracy() {
  const p = store.get('puzzles');
  return p.attempts ? p.correct / p.attempts : null;
}

// ------------------------------------------------------------ achievements
export const ACHIEVEMENTS = [
  { id: 'placement', name: 'Know thyself', desc: 'Complete the placement test', icon: 'target', test: () => !!store.get('profile').placement },
  { id: 'first_game', name: 'First game', desc: 'Finish a game against the computer', icon: 'cpu', test: () => store.get('games').some((g) => !g.practice) },
  { id: 'first_win', name: 'First victory', desc: 'Beat the computer', icon: 'trophy', test: () => store.get('games').some((g) => g.result === 'win' && !g.practice) },
  { id: 'mate_win', name: 'Checkmate!', desc: 'Win a game by checkmate', icon: 'crown', test: () => store.get('games').some((g) => g.result === 'win' && g.reason === 'checkmate' && !g.practice) },
  { id: 'beat_lvl5', name: 'Strong opponent', desc: 'Beat computer level 5 or higher', icon: 'bolt', test: () => store.get('games').some((g) => g.result === 'win' && g.level >= 5 && !g.practice) },
  { id: 'first_lesson', name: 'Student', desc: 'Complete your first lesson', icon: 'book', test: () => Object.keys(store.get('lessons').done).length >= 1 },
  { id: 'five_lessons', name: 'Dedicated', desc: 'Complete 5 lessons', icon: 'book', test: () => Object.keys(store.get('lessons').done).length >= 5 },
  { id: 'ten_lessons', name: 'Scholar', desc: 'Complete 10 lessons', icon: 'star', test: () => Object.keys(store.get('lessons').done).length >= 10 },
  { id: 'path_done', name: 'Path complete', desc: 'Finish every lesson in your level', icon: 'check', test: () => { const l = store.get('profile').level; return !!l && pathProgress(l).pct >= 1 && pathProgress(l).total > 0; } },
  { id: 'perfect_quiz', name: 'Perfect quiz', desc: 'Score 100% on a lesson quiz', icon: 'star', test: () => Object.values(store.get('lessons').scores).some((s) => s >= 1) },
  { id: 'first_puzzle', name: 'Puzzle starter', desc: 'Solve your first puzzle', icon: 'puzzle', test: () => Object.keys(store.get('puzzles').solved).length >= 1 },
  { id: 'puzzles_10', name: 'Puzzle fan', desc: 'Solve 10 puzzles', icon: 'puzzle', test: () => Object.keys(store.get('puzzles').solved).length >= 10 },
  { id: 'puzzles_25', name: 'Puzzle master', desc: 'Solve 25 puzzles', icon: 'puzzle', test: () => Object.keys(store.get('puzzles').solved).length >= 25 },
  { id: 'streak_5', name: 'On a roll', desc: 'Solve 5 puzzles in a row', icon: 'flame', test: () => store.get('puzzles').bestStreak >= 5 },
  { id: 'streak_10', name: 'Unstoppable', desc: 'Solve 10 puzzles in a row', icon: 'flame', test: () => store.get('puzzles').bestStreak >= 10 },
  { id: 'daily', name: 'Daily habit', desc: 'Solve a daily puzzle', icon: 'clock', test: () => Object.values(store.get('puzzles').daily).some((d) => d.solved) },
  { id: 'days_3', name: 'Three days', desc: 'Learn on 3 days in a row', icon: 'flame', test: () => longestStreak() >= 3 },
  { id: 'days_7', name: 'One week', desc: 'Learn on 7 days in a row', icon: 'flame', test: () => longestStreak() >= 7 },
];

// Unlock any newly earned achievements. Returns the newly unlocked list.
export async function checkAchievements() {
  const have = store.get('achievements');
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!have[a.id] && a.test()) fresh.push(a);
  }
  if (fresh.length) {
    await store.update('achievements', (h) => { for (const a of fresh) h[a.id] = new Date().toISOString(); });
  }
  return fresh;
}

export { currentStreak, SKILLS };
