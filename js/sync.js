// Keeps the learning progress of the browser (lessons, puzzles, achievements, activity) with the player's account,
// so it follows them to other devices. Merge rule: nothing is ever lost — what either side has done is kept.
import { store } from './store.js';
import { net, onAuth, get, put } from './net.js';

const KEYS = ['lessons', 'puzzles', 'skills', 'achievements', 'activity', 'endgames', 'openingsDone'];
let timer = null, running = false, lastUserId = null;

const num = (a, b) => Math.max(a || 0, b || 0);
const union = (a = {}, b = {}) => ({ ...a, ...b });

export function mergeProgress(local, remote) {
  if (!remote) return local;
  const out = structuredClone(local);
  const L = out.lessons || (out.lessons = { done: {}, scores: {}, attempts: {} }), R = remote.lessons || {};
  L.done = union(L.done, R.done);
  for (const [k, v] of Object.entries(R.scores || {})) L.scores[k] = num(L.scores[k], v);
  for (const [k, v] of Object.entries(R.attempts || {})) L.attempts[k] = num(L.attempts[k], v);
  const P = out.puzzles || (out.puzzles = {}), RP = remote.puzzles || {};
  P.solved = union(P.solved, RP.solved); P.daily = union(P.daily, RP.daily);
  P.attempts = num(P.attempts, RP.attempts); P.correct = num(P.correct, RP.correct); P.streak = num(P.streak, RP.streak); P.bestStreak = num(P.bestStreak, RP.bestStreak);
  P.history = [...new Map([...(RP.history || []), ...(P.history || [])].map((h) => [JSON.stringify(h), h])).values()].slice(-200);
  out.achievements = union(out.achievements, remote.achievements);
  out.endgames = { done: union(out.endgames?.done, remote.endgames?.done) };
  out.openingsDone = union(out.openingsDone, remote.openingsDone);
  const sk = out.skills || (out.skills = {});
  for (const [k, v] of Object.entries(remote.skills || {})) sk[k] = { right: num(sk[k]?.right, v.right), total: num(sk[k]?.total, v.total) };
  out.activity = { days: [...new Set([...(out.activity?.days || []), ...(remote.activity?.days || [])])].sort() };
  return out;
}
const snapshot = () => Object.fromEntries(KEYS.map((k) => [k, store.get(k)]));

async function pullAndMerge() {
  if (running || !net.user) return;
  running = true;
  try {
    const { data } = await get('/api/me/progress');
    const merged = mergeProgress(snapshot(), data);
    for (const k of KEYS) if (JSON.stringify(merged[k]) !== JSON.stringify(store.get(k))) await store.set(k, merged[k]);
    await put('/api/me/progress', { data: snapshot() });
  } catch { /* offline or signed out: retried on the next change */ }
  running = false;
}
function schedulePush() {
  if (!net.user) return;
  clearTimeout(timer);
  timer = setTimeout(() => { if (net.user && !running) put('/api/me/progress', { data: snapshot() }).catch(() => {}); }, 4000);
}

export function startSync() {
  onAuth(() => { if (net.user && net.user.id !== lastUserId) { lastUserId = net.user.id; pullAndMerge(); } if (!net.user) lastUserId = null; });
  store.onChange((k) => { if (KEYS.includes(k)) schedulePush(); });
}
