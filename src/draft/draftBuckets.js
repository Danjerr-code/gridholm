/**
 * draftBuckets.js
 * ---------------
 * Defines the 6 general buckets + 4 keyword buckets for the map draft system.
 *
 * At each standard node the player sees 4 buckets drawn from the available pool.
 * Each bucket draw yields 3 cards to pick from.
 *
 * General buckets (always available):
 *   units_low   — units cost 1-2
 *   units_mid   — units cost 3-4
 *   units_high  — units cost 5+
 *   spells      — all spell cards
 *   relics      — relic cards
 *   omens       — omen cards
 *
 * Keyword buckets (unlock at 4 faction cards drafted):
 *   aura        — cards with aura property   (Light faction unlock)
 *   rush        — cards with rush property   (Primal faction unlock)
 *   restore     — cards mentioning restore   (Mystic faction unlock)
 *   hidden      — cards with hidden property (Dark faction unlock)
 *
 * Mystery bucket (random chance at ~11% per node, targeting ~3 per 29 nodes):
 *   mystery     — draws from full eligible pool, boosted legendary rate
 */

import { CARD_DB, shuffle } from '../engine/cards.js';

export const BUCKET_IDS = {
  UNITS_LOW:  'units_low',
  UNITS_MID:  'units_mid',
  UNITS_HIGH: 'units_high',
  SPELLS:     'spells',
  RELICS:     'relics',
  OMENS:      'omens',
  AURA:       'aura',
  RUSH:       'rush',
  RESTORE:    'restore',
  HIDDEN:     'hidden',
  MYSTERY:    'mystery',
};

export const GENERAL_BUCKETS = [
  BUCKET_IDS.UNITS_LOW,
  BUCKET_IDS.UNITS_MID,
  BUCKET_IDS.UNITS_HIGH,
  BUCKET_IDS.SPELLS,
  BUCKET_IDS.RELICS,
  BUCKET_IDS.OMENS,
];

export const KEYWORD_BUCKETS = [
  BUCKET_IDS.AURA,
  BUCKET_IDS.RUSH,
  BUCKET_IDS.RESTORE,
  BUCKET_IDS.HIDDEN,
];

/** Faction that unlocks each keyword bucket */
export const KEYWORD_BUCKET_FACTION = {
  [BUCKET_IDS.AURA]:    'light',
  [BUCKET_IDS.RUSH]:    'primal',
  [BUCKET_IDS.RESTORE]: 'mystic',
  [BUCKET_IDS.HIDDEN]:  'dark',
};

export const BUCKET_LABELS = {
  [BUCKET_IDS.UNITS_LOW]:  'Units I',
  [BUCKET_IDS.UNITS_MID]:  'Units II',
  [BUCKET_IDS.UNITS_HIGH]: 'Units III',
  [BUCKET_IDS.SPELLS]:     'Spells',
  [BUCKET_IDS.RELICS]:     'Relics',
  [BUCKET_IDS.OMENS]:      'Omens',
  [BUCKET_IDS.AURA]:       'Aura',
  [BUCKET_IDS.RUSH]:       'Rush',
  [BUCKET_IDS.RESTORE]:    'Restore',
  [BUCKET_IDS.HIDDEN]:     'Hidden',
  [BUCKET_IDS.MYSTERY]:    '???',
};

export const BUCKET_DESCRIPTIONS = {
  [BUCKET_IDS.UNITS_LOW]:  'Cost 1-2 units',
  [BUCKET_IDS.UNITS_MID]:  'Cost 3-4 units',
  [BUCKET_IDS.UNITS_HIGH]: 'Cost 5+ units',
  [BUCKET_IDS.SPELLS]:     'Spell cards',
  [BUCKET_IDS.RELICS]:     'Relic cards',
  [BUCKET_IDS.OMENS]:      'Omen cards',
  [BUCKET_IDS.AURA]:       'Aura units (Light)',
  [BUCKET_IDS.RUSH]:       'Rush units (Primal)',
  [BUCKET_IDS.RESTORE]:    'Restore effects (Mystic)',
  [BUCKET_IDS.HIDDEN]:     'Hidden units (Dark)',
  [BUCKET_IDS.MYSTERY]:    'Unknown — anything possible',
};

// Mystery bucket probability per standard node (~11% → ~3.2 per 29 nodes)
const MYSTERY_CHANCE = 0.11;

/**
 * Check which keyword buckets are currently unlocked based on drafted cards.
 *
 * @param {string[]} draftedIds  — array of card IDs already drafted
 * @returns {string[]}            — array of unlocked keyword bucket IDs
 */
export function getUnlockedKeywordBuckets(draftedIds) {
  const factionCounts = {};
  for (const id of draftedIds) {
    const card = CARD_DB[id];
    if (!card || !card.attribute) continue;
    factionCounts[card.attribute] = (factionCounts[card.attribute] ?? 0) + 1;
  }
  const unlocked = [];
  for (const [bucketId, faction] of Object.entries(KEYWORD_BUCKET_FACTION)) {
    if ((factionCounts[faction] ?? 0) >= 4) {
      unlocked.push(bucketId);
    }
  }
  return unlocked;
}

/**
 * Generate 4 bucket options for a standard node.
 * One of the 4 may be replaced by mystery with MYSTERY_CHANCE.
 *
 * @param {string[]} unlockedKeywordBuckets  — from getUnlockedKeywordBuckets()
 * @param {boolean}  forFork                — true when generating fork node buckets
 * @returns {string[]} array of 4 bucket IDs
 */
export function generateBucketOptions(unlockedKeywordBuckets, forFork = false) {
  const available = [...GENERAL_BUCKETS, ...unlockedKeywordBuckets];
  const shuffled = shuffleArr(available);

  // Pick 4 unique buckets
  const chosen = shuffled.slice(0, 4);

  // Maybe replace one with mystery (but not for fork node — fork needs deterministic branch mapping)
  if (!forFork && Math.random() < MYSTERY_CHANCE) {
    const replaceIdx = Math.floor(Math.random() * 4);
    chosen[replaceIdx] = BUCKET_IDS.MYSTERY;
  }

  return chosen;
}

/**
 * Draw 3 cards from a bucket for the player to choose from.
 *
 * @param {string}   bucketId
 * @param {string}   primaryFaction
 * @param {string}   secondaryFaction
 * @param {string[]} draftedIds        — already-drafted card IDs (for dedup)
 * @param {boolean}  forceRare         — true for Rare special node (all picks rare+)
 * @returns {Object[]}  up to 3 card objects
 */
export function drawBucketCards(bucketId, primaryFaction, secondaryFaction, draftedIds, forceRare = false) {
  const eligible = buildEligiblePool(primaryFaction, secondaryFaction);
  const filtered = filterByBucket(eligible, bucketId);

  if (forceRare) {
    const rarePool = filtered.filter(c => c.rarity === 'rare' || c.rarity === 'legendary');
    return pickCards(rarePool, 3, isMystery(bucketId), forceRare);
  }

  return pickCards(filtered, 3, isMystery(bucketId), false);
}

/**
 * Draw 3 strong draft cards from a faction's pool for special faction nodes.
 *
 * @param {string} faction
 * @returns {Object[]}
 */
export function drawDraftStrongCards(faction) {
  const strong = Object.values(CARD_DB).filter(card => {
    if (card.legendary || card.isToken || card.token) return false;
    if (card.bossOnly || card.adventureOnly) return false;
    if (card.attribute !== faction) return false;
    return card.draftStrong === true;
  });

  const shuffled = shuffleArr(strong);
  return shuffled.slice(0, 3);
}

// ── Internals ─────────────────────────────────────────────────────────────────

function isMystery(bucketId) {
  return bucketId === BUCKET_IDS.MYSTERY;
}

/**
 * Build the pool of cards eligible for this draft (primary + secondary + neutral).
 * Excludes legendaries (except in mystery bucket), tokens, boss/adventure-only.
 */
function buildEligiblePool(primaryFaction, secondaryFaction) {
  return Object.values(CARD_DB).filter(card => {
    if (card.isToken || card.token) return false;
    if (card.isChampion) return false;
    if (card.bossOnly) return false;
    if (card.adventureOnly) return false;
    const attr = card.attribute;
    if (!attr) return false;
    return (
      attr === primaryFaction ||
      attr === secondaryFaction ||
      attr === 'neutral'
    );
  });
}

/**
 * Filter pool by bucket type.
 */
function filterByBucket(pool, bucketId) {
  switch (bucketId) {
    case BUCKET_IDS.UNITS_LOW:
      return pool.filter(c => c.type === 'unit' && !c.legendary && (c.cost ?? 99) <= 2);
    case BUCKET_IDS.UNITS_MID:
      return pool.filter(c => c.type === 'unit' && !c.legendary && (c.cost ?? 99) >= 3 && (c.cost ?? 99) <= 4);
    case BUCKET_IDS.UNITS_HIGH:
      return pool.filter(c => c.type === 'unit' && !c.legendary && (c.cost ?? 99) >= 5);
    case BUCKET_IDS.SPELLS:
      return pool.filter(c => c.type === 'spell' && !c.legendary);
    case BUCKET_IDS.RELICS:
      return pool.filter(c => (c.type === 'relic' || c.isRelic) && !c.legendary);
    case BUCKET_IDS.OMENS:
      return pool.filter(c => (c.type === 'omen' || c.isOmen) && !c.legendary);
    case BUCKET_IDS.AURA:
      return pool.filter(c => c.aura && !c.legendary);
    case BUCKET_IDS.RUSH:
      return pool.filter(c => c.rush && !c.legendary);
    case BUCKET_IDS.RESTORE:
      return pool.filter(c => !c.legendary && (
        (c.rules && /restore/i.test(c.rules)) ||
        (c.aura && c.aura.stat === 'hp' && c.aura.trigger === 'endturn')
      ));
    case BUCKET_IDS.HIDDEN:
      return pool.filter(c => c.hidden && !c.legendary);
    case BUCKET_IDS.MYSTERY:
      // Mystery: full pool including legendaries, excluding adventure/boss/tokens
      return pool; // base pool already excludes tokens/boss/adventure; allow legendaries here
    default:
      return pool.filter(c => !c.legendary);
  }
}

/**
 * Pick `count` cards from a pool using rarity distribution.
 *
 * Standard distribution:  70% common, 25% rare, 5% legendary
 * Mystery distribution:   50% common, 35% rare, 15% legendary
 * (mystery legendaries exclude adventure-only/boss/token — base pool handles that)
 */
function pickCards(pool, count, mystery, forceRare) {
  if (pool.length === 0) return [];

  const commons    = pool.filter(c => c.rarity === 'common');
  const rares      = pool.filter(c => c.rarity === 'rare');
  const legendaries = pool.filter(c => c.rarity === 'legendary');

  const picked = [];
  const usedIds = new Set();

  for (let i = 0; i < count; i++) {
    const card = rollRarityCard({ commons, rares, legendaries, mystery, forceRare, usedIds });
    if (card) {
      picked.push(card);
      usedIds.add(card.id);
    }
  }

  return picked;
}

function rollRarityCard({ commons, rares, legendaries, mystery, forceRare, usedIds }) {
  const roll = Math.random();

  let rarityOrder;
  if (forceRare) {
    rarityOrder = ['rare', 'legendary'];
  } else if (mystery) {
    rarityOrder = roll < 0.50 ? ['common', 'rare', 'legendary']
                : roll < 0.85 ? ['rare', 'common', 'legendary']
                              : ['legendary', 'rare', 'common'];
  } else {
    rarityOrder = roll < 0.70 ? ['common', 'rare', 'legendary']
                : roll < 0.95 ? ['rare', 'common', 'legendary']
                              : ['legendary', 'rare', 'common'];
  }

  const pools = { common: commons, rare: rares, legendary: legendaries };

  for (const rarity of rarityOrder) {
    const candidates = (pools[rarity] ?? []).filter(c => !usedIds.has(c.id));
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  // Final fallback: any unused card from entire pool
  const all = [...commons, ...rares, ...legendaries].filter(c => !usedIds.has(c.id));
  return all.length > 0 ? all[Math.floor(Math.random() * all.length)] : null;
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
