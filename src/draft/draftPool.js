import { CARD_DB } from '../engine/cards.js';
import { shuffle } from '../engine/cards.js';

const ALL_FACTIONS = ['light', 'primal', 'mystic', 'dark'];

const DRAFT_TYPE_WEIGHTS = { unit: 1.0, spell: 0.6, relic: 0.4, omen: 0.4, terrain: 0.4 };

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
    if (card.isToken || card.token) return false;
    if (card.isChampion) return false;
    if (card.bossOnly) return false;
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
 * Assign 10 of the 29 main pick positions as rare slots.
 * Constraints: no two rare slots consecutive, no gap between consecutive
 * rare slots exceeds 4 picks (i.e. consecutive rare positions differ by 2–5).
 *
 * @returns {Set<number>} set of 1-indexed pick positions (within 1..29)
 */
export function assignRareSlots() {
  for (let attempt = 0; attempt < 2000; attempt++) {
    // Generate 9 spacings between consecutive rare slots, each 2–5
    const gaps = [];
    for (let i = 0; i < 9; i++) {
      gaps.push(2 + Math.floor(Math.random() * 4)); // 2, 3, 4, or 5
    }
    const totalSpan = gaps.reduce((a, b) => a + b, 0);
    // First rare slot: 1 to (29 - totalSpan)
    const maxStart = 29 - totalSpan;
    if (maxStart < 1) continue;
    const start = 1 + Math.floor(Math.random() * maxStart);

    const positions = [start];
    for (const gap of gaps) {
      positions.push(positions[positions.length - 1] + gap);
    }

    if (positions[positions.length - 1] > 29) continue;
    return new Set(positions);
  }

  // Fallback: evenly spaced rare slots
  return new Set([2, 5, 8, 11, 14, 17, 20, 23, 26, 29]);
}

/**
 * Generate a pack of cards from the pool with rarity-aware slot composition
 * and offering penalty weighting.
 *
 * @param {Object[]}     pool               - full pool from buildDraftPool
 * @param {string[]}     draftedCardIds     - IDs already drafted
 * @param {number}       pickNumber         - 1-indexed pick number (1..29)
 * @param {string}       primaryFaction     - e.g. 'light'
 * @param {string}       secondaryFaction   - e.g. 'primal'
 * @param {Set<number>}  rareSlotPositions  - which pick numbers are rare slots
 * @param {Object}       offerCounts        - map of cardId → times offered so far
 * @returns {Object[]} 3 card objects (may be fewer near pool exhaustion)
 */
export function generatePack(
  pool,
  draftedCardIds,
  pickNumber,
  primaryFaction,
  secondaryFaction,
  rareSlotPositions,
  offerCounts
) {
  if (pool.length === 0) return [];

  const isRareSlot = rareSlotPositions != null && rareSlotPositions.has(pickNumber);
  const counts = offerCounts ?? {};

  // Separate pool into rares and commons by rarity field
  const rarePool = pool.filter(c => c.rarity === 'rare');
  const commonPool = pool.filter(c => c.rarity === 'common');

  // Determine cost bracket based on pick number
  function inCostBracket(card) {
    const cost = card.cost ?? 0;
    if (pickNumber >= 25) {
      // Weight underrepresented costs — handled separately below
      return true;
    }
    if (pickNumber >= 1 && pickNumber <= 8) return cost >= 1 && cost <= 2;
    if (pickNumber >= 9 && pickNumber <= 18) return cost >= 3 && cost <= 4;
    // picks 19–24: no cost restriction
    return true;
  }

  // For picks 25+, compute underrepresented cost buckets from drafted cards
  let underrepCosts = null;
  if (pickNumber >= 25) {
    const costCounts = {};
    for (const id of draftedCardIds) {
      const card = CARD_DB[id];
      if (!card) continue;
      const c = card.cost ?? 0;
      costCounts[c] = (costCounts[c] ?? 0) + 1;
    }
    underrepCosts = costCounts;
  }

  function costWeight(card) {
    if (underrepCosts == null) return 1;
    const c = card.cost ?? 0;
    const n = underrepCosts[c] ?? 0;
    return n === 0 ? 4 : n === 1 ? 2 : 1;
  }

  function factionWeight(card) {
    if (!primaryFaction) return 1;
    if (card.attribute === primaryFaction) return 3;
    if (card.attribute === secondaryFaction) return 2;
    return 1; // neutral
  }

  function offerWeight(card, isRare) {
    const offered = counts[card.id] ?? 0;
    if (isRare) {
      if (offered === 0) return 10;
      if (offered === 1) return 3;
      if (offered === 2) return 1;
      return 0; // offered 3+ times: exclude
    } else {
      if (offered === 0) return 4;
      if (offered === 1) return 2;
      if (offered === 2) return 1;
      return 0; // offered 3+ times: exclude
    }
  }

  function buildWeighted(cards, isRare) {
    const weighted = [];
    for (const card of cards) {
      const ow = offerWeight(card, isRare);
      if (ow === 0) continue;
      const cw = costWeight(card);
      const fw = factionWeight(card);
      const tw = DRAFT_TYPE_WEIGHTS[card.type] ?? 1.0;
      const total = Math.max(1, Math.round(ow * cw * fw * tw));
      for (let w = 0; w < total; w++) weighted.push(card);
    }
    return weighted;
  }

  function pickFrom(weightedCandidates, exclude) {
    const available = weightedCandidates.filter(c => !exclude.has(c.id));
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  const pickedIds = new Set();
  const picked = [];

  function addCard(card) {
    if (card && !pickedIds.has(card.id)) {
      picked.push(card);
      pickedIds.add(card.id);
    }
  }

  if (isRareSlot) {
    // Rare slot: 2 rares + 1 common from same cost bracket
    const bracketRares = rarePool.filter(inCostBracket);
    let wRares = buildWeighted(bracketRares, true);

    // Pick 2 rares
    for (let i = 0; i < 2; i++) {
      const card = pickFrom(wRares, pickedIds);
      if (card) {
        addCard(card);
        // Rebuild without already-picked to maintain exclusion
        wRares = wRares.filter(c => c.id !== card.id);
      }
    }

    // Fallback if rare pool exhausted for this bracket
    if (picked.length < 2) {
      // Try adjacent cost bracket rares
      const altRares = rarePool.filter(c => !inCostBracket(c));
      const wAltRares = buildWeighted(altRares, true);
      while (picked.length < 2) {
        const card = pickFrom(wAltRares, pickedIds);
        if (!card) break;
        addCard(card);
      }
    }
    if (picked.length < 2) {
      // No rares available at all — fill with commons
      console.warn('[draftPool] No rares available for rare slot at pick', pickNumber, '— falling back to commons');
    }

    // Pick 1 common
    const bracketCommons = commonPool.filter(inCostBracket);
    const wCommons = buildWeighted(bracketCommons, false);
    const common = pickFrom(wCommons, pickedIds);
    if (common) {
      addCard(common);
    } else {
      // Fill remaining slots with any available common
      const wAnyCommons = buildWeighted(commonPool, false);
      const fallback = pickFrom(wAnyCommons, pickedIds);
      if (fallback) addCard(fallback);
    }
  } else {
    // Common slot: 3 commons, no rares
    const bracketCommons = commonPool.filter(inCostBracket);
    let wCommons = buildWeighted(bracketCommons, false);

    // Guarantee at least 1 card from the cost bracket for picks 1-18
    if ((pickNumber >= 1 && pickNumber <= 8) || (pickNumber >= 9 && pickNumber <= 18)) {
      const guaranteed = pickFrom(wCommons, pickedIds);
      if (guaranteed) {
        addCard(guaranteed);
        wCommons = wCommons.filter(c => c.id !== guaranteed.id);
      }
    }

    // Fill remaining slots
    while (picked.length < 3) {
      const available = buildWeighted(commonPool, false);
      const card = pickFrom(available, pickedIds);
      if (!card) break;
      addCard(card);
    }
  }

  return picked.slice(0, 3);
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
    if (card.isToken || card.token) return false;
    if (card.bossOnly) return false;
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
