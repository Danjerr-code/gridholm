import { CARD_DB } from '../engine/cards.js';
import { shuffle } from '../engine/cards.js';

const ALL_FACTIONS = ['light', 'primal', 'mystic', 'dark'];

/**
 * Build a draft pool of card objects for a given primary + secondary faction pair.
 * Excludes legendaries, excludes champions, includes units/spells/relics/omens/terrain.
 *
 * @param {string} primaryFaction   - e.g. 'light'
 * @param {string} secondaryFaction - e.g. 'primal'
 * @returns {Object[]} array of card objects from CARD_DB
 */
export function buildDraftPool(primaryFaction, secondaryFaction) {
  const eligible = Object.values(CARD_DB).filter(card => {
    if (card.legendary) return false;
    // Exclude champion tokens and non-playable cards
    if (card.isToken) return false;
    if (card.isChampion) return false;
    // Include all faction cards and neutral cards
    const attr = card.attribute;
    if (!attr) return false;
    return (
      attr === primaryFaction ||
      attr === secondaryFaction ||
      attr === 'neutral'
    );
  });
  return eligible;
}

/**
 * Generate a pack of 3 card objects from the pool with curve balancing.
 *
 * @param {Object[]} pool           - full pool from buildDraftPool
 * @param {string[]} draftedCardIds - IDs already drafted (duplicates allowed)
 * @param {number}   pickNumber     - 1-indexed pick number (1..29)
 * @returns {Object[]} 3 card objects
 */
export function generatePack(pool, draftedCardIds, pickNumber) {
  if (pool.length === 0) return [];

  // For the last bracket (picks 25-29), compute underrepresented cost buckets
  let weightedPool = null;
  if (pickNumber >= 25) {
    const costCounts = {};
    for (const id of draftedCardIds) {
      const card = CARD_DB[id];
      if (!card) continue;
      const cost = card.cost ?? 0;
      costCounts[cost] = (costCounts[cost] ?? 0) + 1;
    }
    // Weight cards in underrepresented cost slots higher
    weightedPool = [];
    for (const card of pool) {
      const c = card.cost ?? 0;
      const count = costCounts[c] ?? 0;
      const weight = count === 0 ? 4 : count === 1 ? 2 : 1;
      for (let w = 0; w < weight; w++) weightedPool.push(card);
    }
  }

  const sourcePool = weightedPool ?? pool;
  const picked = [];

  function pickOneFrom(candidates) {
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function costInRange(card, lo, hi) {
    return card.cost >= lo && card.cost <= hi;
  }

  // Apply bracket constraints for picks 1-24
  if (pickNumber >= 1 && pickNumber <= 8) {
    // At least 1 card must cost 1-2 mana
    const lowCostCards = sourcePool.filter(c => costInRange(c, 1, 2));
    const guaranteed = pickOneFrom(lowCostCards);
    if (guaranteed) picked.push(guaranteed);
  } else if (pickNumber >= 9 && pickNumber <= 18) {
    // At least 1 card must cost 3-4 mana
    const midCostCards = sourcePool.filter(c => costInRange(c, 3, 4));
    const guaranteed = pickOneFrom(midCostCards);
    if (guaranteed) picked.push(guaranteed);
  }

  // Fill remaining slots randomly
  const remaining = 3 - picked.length;
  const available = [...sourcePool];
  for (let i = 0; i < remaining; i++) {
    if (available.length === 0) break;
    const idx = Math.floor(Math.random() * available.length);
    picked.push(available[idx]);
    available.splice(idx, 1);
  }

  // Deduplicate card IDs within a single pack (keep first occurrence)
  const seen = new Set();
  return picked.filter(card => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  }).slice(0, 3);
}

/**
 * Generate a pack of 3 legendary cards for the initial legendary pick.
 *
 * @param {string}   primaryFaction       - e.g. 'light'
 * @param {string}   secondaryFaction     - e.g. 'primal'
 * @param {string[]} excludedLegendaryIds - IDs already owned, to exclude
 * @returns {Object[]} up to 3 legendary card objects
 */
export function generateLegendaryPack(primaryFaction, secondaryFaction, excludedLegendaryIds = []) {
  const excluded = new Set(excludedLegendaryIds);
  const legendaries = Object.values(CARD_DB).filter(card => {
    if (!card.legendary) return false;
    if (excluded.has(card.id)) return false;
    const attr = card.attribute;
    return (
      attr === primaryFaction ||
      attr === secondaryFaction ||
      attr === 'neutral'
    );
  });

  const shuffled = shuffle([...legendaries]);
  return shuffled.slice(0, 3);
}

/**
 * Returns `count` randomly selected faction strings with no duplicates.
 *
 * @param {number} count
 * @returns {string[]}
 */
export function getRandomFactions(count) {
  const shuffled = shuffle([...ALL_FACTIONS]);
  return shuffled.slice(0, Math.min(count, ALL_FACTIONS.length));
}
