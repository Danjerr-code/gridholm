// Challenge Manager: seeded selection, progress tracking, and rotation reset.

import { DAILY_CHALLENGE_POOL, WEEKLY_CHALLENGE_POOL } from './challengeData.js';

const STORAGE_KEY = 'gridholm_challenges';

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

function mulberry32(seed) {
  let s = seed;
  return function () {
    s |= 0;
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

// Deterministically pick `count` items from `pool` using `seed`.
function seededPick(pool, count, seed) {
  const rng = mulberry32(hashString(seed));
  const arr = [...pool];
  const result = [];
  for (let i = 0; i < Math.min(count, arr.length); i++) {
    const idx = Math.floor(rng() * (arr.length - i)) + i;
    [arr[i], arr[idx]] = [arr[idx], arr[i]];
    result.push(arr[i]);
  }
  return result;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function getDailySeed() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getWeeklySeed() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = (day === 0 ? -6 : 1 - day); // days back to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

// ── Active challenge selection ────────────────────────────────────────────────

export function getActiveChallenges() {
  const dailySeed = getDailySeed();
  const weeklySeed = getWeeklySeed();
  const dailyChallenges = seededPick(DAILY_CHALLENGE_POOL, 3, dailySeed);
  const [weeklyChallenge] = seededPick(WEEKLY_CHALLENGE_POOL, 1, weeklySeed);
  return { daily: dailyChallenges, weekly: weeklyChallenge };
}

// ── Progress storage ──────────────────────────────────────────────────────────

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function resetExpiredChallenges() {
  const store = loadStore();
  const dailySeed = getDailySeed();
  const weeklySeed = getWeeklySeed();
  let changed = false;

  if (store.lastDaily && store.lastDaily !== dailySeed) {
    // Preserve old completed challenges for display until replaced
    const active = getActiveChallenges();
    const activeIds = new Set([...active.daily.map(c => c.id), active.weekly?.id]);
    const progress = store.progress || {};
    for (const id of Object.keys(progress)) {
      if (!activeIds.has(id) || (store.dailyIds || []).includes(id)) {
        // Reset progress for expired daily challenges
        if ((store.dailyIds || []).includes(id)) {
          progress[id] = { current: 0, target: progress[id].target, completed: false };
        }
      }
    }
    store.lastDaily = dailySeed;
    store.dailyIds = active.daily.map(c => c.id);
    changed = true;
  }

  if (store.lastWeekly && store.lastWeekly !== weeklySeed) {
    const weeklyId = store.weeklyId;
    if (weeklyId && store.progress?.[weeklyId]) {
      store.progress[weeklyId] = {
        current: 0,
        target: store.progress[weeklyId].target,
        completed: false,
      };
    }
    store.lastWeekly = weeklySeed;
    changed = true;
  }

  if (changed) saveStore(store);
  return store;
}

export function getChallengeProgress() {
  const store = loadStore();
  return store.progress || {};
}

// Initialize progress entries for currently active challenges that don't exist yet.
export function ensureChallengeProgress() {
  const store = loadStore();
  const { daily, weekly } = getActiveChallenges();
  const dailySeed = getDailySeed();
  const weeklySeed = getWeeklySeed();

  if (!store.progress) store.progress = {};
  if (!store.lastDaily) store.lastDaily = dailySeed;
  if (!store.lastWeekly) store.lastWeekly = weeklySeed;
  if (!store.dailyIds) store.dailyIds = daily.map(c => c.id);
  if (!store.weeklyId) store.weeklyId = weekly?.id;

  for (const ch of daily) {
    if (!store.progress[ch.id]) {
      store.progress[ch.id] = { current: 0, target: ch.requirement.target, completed: false };
    }
  }
  if (weekly && !store.progress[weekly.id]) {
    store.progress[weekly.id] = { current: 0, target: weekly.requirement.target, completed: false };
  }

  saveStore(store);
  return store.progress;
}

// Save updated progress for a set of challenge ids.
export function saveChallengeProgress(updates) {
  const store = loadStore();
  if (!store.progress) store.progress = {};
  for (const [id, entry] of Object.entries(updates)) {
    store.progress[id] = entry;
  }
  saveStore(store);
}

// Mark that the player has viewed challenges (clears new-completion notification).
export function markChallengesViewed() {
  const store = loadStore();
  store.lastViewed = Date.now();
  store.newCompletions = [];
  saveStore(store);
}

// Returns true if any challenge was completed since last viewed.
export function hasUnviewedCompletions() {
  const store = loadStore();
  return Array.isArray(store.newCompletions) && store.newCompletions.length > 0;
}

// Record new completions (called by tracker after a game).
export function recordNewCompletions(ids) {
  if (!ids || ids.length === 0) return;
  const store = loadStore();
  store.newCompletions = [...new Set([...(store.newCompletions || []), ...ids])];
  saveStore(store);
}
