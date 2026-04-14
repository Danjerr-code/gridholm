import { CARD_DB } from '../engine/cards.js';
import { getCardRating } from '../engine/cardThreatRatings.js';
import { buildDraftPool, generatePack, generateLegendaryPack, assignRareSlots } from './draftPool.js';

/**
 * Generate an AI draft deck of 30 card IDs.
 *
 * @param {string}   primaryFaction       - e.g. 'light'
 * @param {string}   secondaryFaction     - e.g. 'primal'
 * @param {number}   legendaryCount       - how many legendary cards to include
 * @param {number}   difficulty           - 0-8 skill level
 * @param {string[]} excludedLegendaryIds - legendaries to exclude (player already owns)
 * @returns {string[]} 30 card IDs
 */
export function generateAIDeck(
  primaryFaction,
  secondaryFaction,
  legendaryCount,
  difficulty,
  excludedLegendaryIds = []
) {
  const deck = []; // array of card IDs

  // ── Draft legendaries first ────────────────────────────────────────────────
  const legendaryPack = generateLegendaryPack(primaryFaction, secondaryFaction, excludedLegendaryIds);
  const chosenLegendaries = pickLegendaries(legendaryPack, legendaryCount, difficulty);
  deck.push(...chosenLegendaries);

  // ── Draft remaining cards from packs ──────────────────────────────────────
  const pool = buildDraftPool(primaryFaction, secondaryFaction);
  const totalPicks = 30 - deck.length;
  const rareSlotPositions = assignRareSlots();
  const offerCounts = {};

  for (let pick = 1; pick <= totalPicks; pick++) {
    const pack = generatePack(pool, deck, pick, primaryFaction, secondaryFaction, rareSlotPositions, offerCounts);
    if (pack.length === 0) break;

    // Track offer counts for all cards shown in this pack
    for (const card of pack) {
      offerCounts[card.id] = (offerCounts[card.id] ?? 0) + 1;
    }

    const chosen = pickBest(pack, deck, primaryFaction, secondaryFaction, difficulty);
    deck.push(chosen.id);
  }

  // Pad to 30 if pool ran dry (edge case with tiny card pools)
  while (deck.length < 30 && pool.length > 0) {
    const card = pool[Math.floor(Math.random() * pool.length)];
    deck.push(card.id);
  }

  return deck.slice(0, 30);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function pickLegendaries(legendaryCards, count, difficulty) {
  if (legendaryCards.length === 0) return [];

  const available = [...legendaryCards];
  const chosen = [];
  const toGet = Math.min(count, available.length);

  for (let i = 0; i < toGet; i++) {
    if (difficulty <= 2) {
      // Random selection with noise
      const idx = Math.floor(Math.random() * available.length);
      chosen.push(available[idx].id);
      available.splice(idx, 1);
    } else {
      // Pick highest allyValue
      let bestIdx = 0;
      let bestScore = -Infinity;
      for (let j = 0; j < available.length; j++) {
        const card = available[j];
        const score = getCardRating(card.id, 'ally', card.cost);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = j;
        }
      }
      chosen.push(available[bestIdx].id);
      available.splice(bestIdx, 1);
    }
  }

  return chosen;
}

function pickBest(pack, currentDeckIds, primaryFaction, secondaryFaction, difficulty) {
  // Count current deck composition
  const costCounts = {};
  const idCounts = {};
  for (const id of currentDeckIds) {
    const card = CARD_DB[id];
    if (!card) continue;
    const cost = card.cost ?? 0;
    costCounts[cost] = (costCounts[cost] ?? 0) + 1;
    idCounts[id] = (idCounts[id] ?? 0) + 1;
  }

  let bestCard = pack[0];
  let bestScore = -Infinity;

  for (const card of pack) {
    const baseRating = getCardRating(card.id, 'ally', card.cost);

    // curveFitBonus
    const cost = card.cost ?? 0;
    const slotsAtCost = costCounts[cost] ?? 0;
    const curveFitBonus = slotsAtCost === 0 ? 5 : slotsAtCost === 1 ? 3 : slotsAtCost === 2 ? 1 : 0;

    // factionMatchBonus
    let factionMatchBonus = 0;
    if (card.attribute === primaryFaction) factionMatchBonus = 2;
    else if (card.attribute === secondaryFaction) factionMatchBonus = 1;

    // redundancyPenalty
    const copiesOwned = idCounts[card.id] ?? 0;
    const redundancyPenalty = Math.max(0, copiesOwned - 1) * 3;

    // noise for low difficulty
    const noise = difficulty <= 2 ? Math.random() * 4 : 0;

    const score = baseRating + curveFitBonus + factionMatchBonus - redundancyPenalty + noise;

    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  }

  return bestCard;
}
