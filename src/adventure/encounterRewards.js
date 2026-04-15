/**
 * Encounter reward generation for Adventure Mode.
 *
 * Exports:
 *   BLESSINGS_POOL               — all 7 blessings available in the run
 *   generateFightReward(state, tileType) → { type, gold, cardOffers, blessingOffers }
 *   generateTreasure(state)              → { treasureType, gold?, cardOffers?, blessingOffers? }
 *   generateShopOfferings(state)         → [{ itemType, ... }]
 */

import { CARD_DB } from '../engine/cards.js';

// ── Blessing pool ─────────────────────────────────────────────────────────────

export const BLESSINGS_POOL = [
  {
    id: 'fortified_start',
    name: 'Fortified Start',
    desc: 'Your champion starts each fight with +3 max HP.',
  },
  {
    id: 'arcane_efficiency',
    name: 'Arcane Efficiency',
    desc: 'Your spells cost 1 less mana (minimum 1).',
  },
  {
    id: 'prepared',
    name: 'Prepared',
    desc: 'Draw 2 extra cards at the start of each fight.',
  },
  {
    id: 'aggressive_posture',
    name: 'Aggressive Posture',
    desc: 'Your units have +1 ATK in every adventure fight.',
  },
  {
    id: 'throne_sense',
    name: 'Throne Sense',
    desc: 'Reveal all tiles within 2 spaces of your position. Continues on each move.',
  },
  {
    id: 'swift_advance',
    name: 'Swift Advance',
    desc: 'Your champion can move 2 tiles for the first 3 turns of each fight.',
  },
  {
    id: 'resilience',
    name: 'Resilience',
    desc: 'Restore 2 champion HP after each fight victory.',
  },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _pickN(arr, n) {
  return _shuffle(arr).slice(0, n);
}

function _randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Build a pool of non-legendary playable cards for the given faction (+ neutral).
 * @param {string}  faction  - 'light' | 'primal' | 'mystic' | 'dark'
 * @param {string|null} rarity - 'common' | 'rare' | null (any)
 */
function _buildCardPool(faction, rarity) {
  return Object.values(CARD_DB).filter(card => {
    if (card.isToken || card.token || card.isChampion) return false;
    if (card.legendary) return false;
    if (card.bossOnly) return false;
    if (rarity && card.rarity !== rarity) return false;
    return card.attribute === faction || card.attribute === 'neutral';
  });
}

/**
 * Pick `count` blessings not already held by the player.
 */
function _pickBlessings(existingBlessingIds, count) {
  const available = BLESSINGS_POOL.filter(b => !existingBlessingIds.includes(b.id));
  return _pickN(available, count);
}

/** Deduplicate card array by id, preserving order. */
function _dedup(cards) {
  const seen = new Set();
  return cards.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

// ── Fight rewards ─────────────────────────────────────────────────────────────

/**
 * Generate the reward for winning a fight tile.
 *
 * Returns:
 *   {
 *     type:           'normal' | 'elite',
 *     gold:           number,           // always awarded
 *     cardOffers:     CardObject[],     // pick 0 or 1
 *     blessingOffers: BlessingObject[], // pick 0 or 1 (elite/boss only, may be empty if all owned)
 *   }
 *
 * @param {Object} state    - adventure run state
 * @param {string} tileType - 'fight' | 'elite_fight' | 'boss'
 */
export function generateFightReward(state, tileType) {
  const isElite = tileType === 'elite_fight';
  const isBoss  = tileType === 'boss';
  const faction = state.championFaction;

  let gold;
  let cardOffers;
  let blessingOffers = [];

  if (isBoss) {
    gold = _randInt(20, 25);
    const rarePool = _buildCardPool(faction, 'rare');
    cardOffers = _dedup(_pickN(rarePool, 3));
    // Boss: guaranteed 3 blessing choices
    blessingOffers = _pickBlessings(state.blessings, 3);
  } else if (isElite) {
    gold = _randInt(20, 25);
    const rarePool = _buildCardPool(faction, 'rare');
    cardOffers = _dedup(_pickN(rarePool, 3));
    // Elite: 2 blessing choices
    blessingOffers = _pickBlessings(state.blessings, 2);
  } else {
    gold = _randInt(10, 15);
    // Rarity-aware: ~30% chance of rare slot
    if (Math.random() < 0.30) {
      const rarePool   = _buildCardPool(faction, 'rare');
      const commonPool = _buildCardPool(faction, 'common');
      cardOffers = _dedup([..._pickN(rarePool, 2), ..._pickN(commonPool, 1)]);
    } else {
      cardOffers = _dedup(_pickN(_buildCardPool(faction, 'common'), 3));
    }
  }

  return {
    type: isBoss ? 'boss' : isElite ? 'elite' : 'normal',
    gold,
    cardOffers,
    blessingOffers,
  };
}

// ── Treasure ──────────────────────────────────────────────────────────────────

/**
 * Generate the outcome for a treasure tile.
 *
 * Returns one of:
 *   { treasureType: 'gold',              gold: number }
 *   { treasureType: 'potion' }
 *   { treasureType: 'potion_converted',  gold: 10 }   (was potion but at max 3)
 *   { treasureType: 'card',              cardOffers: CardObject[] }
 *   { treasureType: 'blessing',          blessingOffers: BlessingObject[] }
 *
 * @param {Object} state - adventure run state
 */
export function generateTreasure(state) {
  const roll    = Math.random();
  const faction = state.championFaction;

  if (roll < 0.50) {
    return { treasureType: 'gold', gold: _randInt(10, 20) };
  }

  if (roll < 0.75) {
    if (state.potions >= 3) {
      return { treasureType: 'potion_converted', gold: 10 };
    }
    return { treasureType: 'potion' };
  }

  if (roll < 0.90) {
    const pool      = [..._buildCardPool(faction, 'common'), ..._buildCardPool(faction, 'rare')];
    const cardOffers = _dedup(_pickN(pool, 3));
    return { treasureType: 'card', cardOffers };
  }

  // blessing
  const blessingOffers = _pickBlessings(state.blessings, 2);
  return { treasureType: 'blessing', blessingOffers };
}

// ── Shop ──────────────────────────────────────────────────────────────────────

/**
 * Generate shop offerings for a shop tile.
 *
 * Returns an array (3-4 items) of:
 *   { itemType: 'card',         card, price }
 *   { itemType: 'card_removal', price: 10 }
 *   { itemType: 'blessing',     blessing, price }
 *
 * @param {Object} state - adventure run state
 */
export function generateShopOfferings(state) {
  const faction = state.championFaction;
  const items   = [];
  const picked  = new Set();

  const rarePool   = _buildCardPool(faction, 'rare');
  const commonPool = _buildCardPool(faction, 'common');

  function pickCard(pool) {
    const shuffled = _shuffle(pool.filter(c => !picked.has(c.id)));
    if (shuffled.length === 0) return null;
    picked.add(shuffled[0].id);
    return shuffled[0];
  }

  // 2 card offerings
  const card1Rare = Math.random() < 0.50;
  const card1 = pickCard(card1Rare ? rarePool : commonPool)
             ?? pickCard(card1Rare ? commonPool : rarePool);
  if (card1) {
    items.push({ itemType: 'card', card: card1, price: card1.rarity === 'rare' ? 25 : 15 });
  }

  const card2Rare = Math.random() < 0.30;
  const card2 = pickCard(card2Rare ? rarePool : commonPool)
             ?? pickCard(card2Rare ? commonPool : rarePool);
  if (card2) {
    items.push({ itemType: 'card', card: card2, price: card2.rarity === 'rare' ? 25 : 15 });
  }

  // Card removal option
  if (state.deck.length > 0) {
    items.push({ itemType: 'card_removal', price: 10 });
  }

  // Blessing for sale
  const availBlessings = BLESSINGS_POOL.filter(b => !state.blessings.includes(b.id));
  if (availBlessings.length > 0) {
    const blessing = availBlessings[Math.floor(Math.random() * availBlessings.length)];
    items.push({ itemType: 'blessing', blessing, price: _randInt(30, 40) });
  }

  return items;
}
