// Local persistence. IndexedDB when available, localStorage as a fallback.
// Everything is cached in memory after init() so views can read synchronously.
// Data never leaves this device.

const DB_NAME = 'rookery';
const STORE = 'kv';
const LS_PREFIX = 'rookery:';

export const DEFAULTS = {
  settings: {
    theme: 'dark',        // 'dark' | 'light'
    boardTheme: 'forest',
    pieceTheme: 'classic',
    coords: true,
    sound: true,
    animations: true,
    highlightMoves: true,
    autoQueen: false,
  },
  profile: {
    level: null,          // 'beginner' | ... | 'expert'
    levelSource: null,    // 'placement' | 'manual'
    levelDate: null,
    placement: null,      // last placement result
    onboarded: false,
  },
  lessons: { done: {}, scores: {}, attempts: {} },
  puzzles: { solved: {}, attempts: 0, correct: 0, streak: 0, bestStreak: 0, daily: {}, history: [] },
  games: [],              // recent games vs computer
  activity: { days: [] }, // ISO dates with learning activity
  achievements: {},
  skills: {},             // per-skill {right, total}
};

const listeners = new Set();

class Store {
  constructor() {
    this.data = {};
    this.db = null;
    this.mode = 'memory';
    this.ready = false;
  }

  async init() {
    for (const [k, v] of Object.entries(DEFAULTS)) this.data[k] = structuredClone(v);
    let loaded = false;
    try {
      if (typeof indexedDB !== 'undefined') {
        this.db = await new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('IndexedDB blocked'));
        });
        const all = await new Promise((resolve, reject) => {
          const out = {};
          const tx = this.db.transaction(STORE, 'readonly');
          const os = tx.objectStore(STORE);
          const cur = os.openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (c) { out[c.key] = c.value; c.continue(); } else resolve(out);
          };
          cur.onerror = () => reject(cur.error);
        });
        for (const [k, v] of Object.entries(all)) this.data[k] = this.merge(DEFAULTS[k], v);
        this.mode = 'indexeddb';
        loaded = true;
      }
    } catch (e) {
      console.warn('IndexedDB unavailable, using localStorage', e);
      this.db = null;
    }
    if (!loaded) {
      try {
        for (const k of Object.keys(DEFAULTS)) {
          const raw = localStorage.getItem(LS_PREFIX + k);
          if (raw) this.data[k] = this.merge(DEFAULTS[k], JSON.parse(raw));
        }
        this.mode = 'localstorage';
      } catch (e) {
        console.warn('localStorage unavailable; progress will not persist', e);
        this.mode = 'memory';
      }
    }
    this.ready = true;
    return this;
  }

  merge(def, val) {
    if (def && typeof def === 'object' && !Array.isArray(def) && val && typeof val === 'object' && !Array.isArray(val)) {
      const out = { ...structuredClone(def), ...val };
      for (const k of Object.keys(def)) {
        if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) out[k] = this.merge(def[k], val[k]);
      }
      return out;
    }
    return val === undefined ? structuredClone(def) : val;
  }

  get(key) { return this.data[key]; }

  // Replace a whole key and persist it. Returns a promise that resolves once written.
  async set(key, value) {
    this.data[key] = value;
    for (const fn of listeners) { try { fn(key, value); } catch (e) { console.error(e); } }
    return this.persist(key);
  }

  // mutate in place then persist: store.update('lessons', (l) => { l.done.x = true })
  async update(key, fn) {
    const v = this.data[key];
    const res = fn(v);
    return this.set(key, res === undefined ? v : res);
  }

  persist(key) {
    const value = this.data[key];
    if (this.db) {
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(JSON.parse(JSON.stringify(value)), key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch { resolve(false); }
      });
    }
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); return Promise.resolve(true); }
    catch { return Promise.resolve(false); }
  }

  async resetAll() {
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (k === 'settings') continue;
      await this.set(k, structuredClone(v));
    }
  }

  async resetEverything() {
    for (const [k, v] of Object.entries(DEFAULTS)) await this.set(k, structuredClone(v));
  }

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
}

export const store = new Store();

// ---- helpers shared by the views ------------------------------------------
export const todayISO = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export async function markActivity() {
  const t = todayISO();
  await store.update('activity', (a) => { if (!a.days.includes(t)) a.days.push(t); a.days = a.days.slice(-400); });
}

export function currentStreak() {
  const days = new Set(store.get('activity').days);
  let n = 0;
  const d = new Date();
  if (!days.has(todayISO(d))) d.setDate(d.getDate() - 1); // today not yet played: streak still alive
  while (days.has(todayISO(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function longestStreak() {
  const days = [...new Set(store.get('activity').days)].sort();
  let best = 0, run = 0, prev = null;
  for (const s of days) {
    const d = new Date(s + 'T00:00:00');
    if (prev && Math.round((d - prev) / 86400000) === 1) run++; else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export async function recordSkill(skill, correct) {
  if (!skill) return;
  await store.update('skills', (s) => {
    const e = s[skill] || (s[skill] = { right: 0, total: 0 });
    e.total++; if (correct) e.right++;
  });
}
