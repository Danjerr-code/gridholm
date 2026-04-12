/**
 * deckBuilder.js
 *
 * Generates legal 30-card decks for simulation testing.
 * Enables testing all pairing archetypes and cards not in the starter decks.
 *
 * Paired deck rules (when secondaryAttr is set):
 *   - Primary attribute:   55–65% of deck (16–20 cards)
 *   - Secondary attribute: 25–35% of deck  (8–10 cards)
 *   - Neutral:              0–15% of deck  (0–4 cards)
 *   - Bridge cards for the pairing are mandatory includes (not random)
 *   - Resonance is calculated and returned but never used to reject a deck
 *
 * Usage:
 *   import { buildDeck, CHAMPION_TO_DECKID, ALL_PAIRINGS } from './deckBuilder.js';
 *   const { cardIds, resonance } = buildDeck('light', 'primal', 'curve');
 *   // cardIds is an array of 30 card ID strings
 *   // resonance is { score, tier } — 'none' | 'attuned' | 'ascended'
 */

import { CARD_DB } from '../../src/engine/cards.js';
import { calculateResonance, RESONANCE_THRESHOLDS } from '../../src/engine/attributes.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const CHAMPION_TO_DECKID = {
  light:  'human',
  primal: 'beast',
  mystic: 'elf',
  dark:   'demon',
};

// Cards excluded from deck building (tokens, generated cards)
const EXCLUDED_IDS = new Set(['sapling', 'amethystcrystal', 'token_sapling']);

// Cards that count as "spells" for constraint checking
const SPELL_TYPES = new Set(['spell', 'omen', 'terrain', 'relic']);

// Curve distribution targets per cost bracket
const CURVE_TARGETS = [
  { minCost: 1, maxCost: 1, target: 4, min: 3 },
  { minCost: 2, maxCost: 2, target: 6, min: 5 },
  { minCost: 3, maxCost: 3, target: 7, min: 6 },
  { minCost: 4, maxCost: 4, target: 5, min: 4 },
  { minCost: 5, maxCost: 5, target: 3, min: 3 },
  { minCost: 6, maxCost: 99, target: 3, min: 2 }, // 6+
];

// ── Bridge cards ──────────────────────────────────────────────────────────────
//
// Bridge cards are mandatory includes for each friendly pairing.
// They are designed to synergize across both attributes in the pair.
// Listed as [primaryAttrCard, secondaryAttrCard].
//
// light/primal:  vanguardtaskmaster (light) — buffs units that use commands (Primal rush units)
//                lifedrinkerstag (primal)   — doubles healing from Light's restore effects
//
// light/mystic:  runebladesentinel (light)  — +3/+3 when 5+ cards in hand (Mystic draws heavily)
//                moonveilmystic (mystic)    — grows from Light's Sentinel/BattlePriest heals
//
// primal/dark:   nighthoofreaver (primal)   — grows when enemy units die (Dark kills/sacrifices)
//                gorethirstfiend (dark)     — triggers extra damage when champion is hit (Primal rush)
//
// mystic/dark:   duskbloomtender (mystic)   — grows when friendly units die (Dark sacrifices)
//                hexbloodwarlock (dark)     — pings enemy champion per card played (Mystic draws/plays many)
//
const BRIDGE_CARDS = {
  light_primal: ['vanguardtaskmaster', 'lifedrinkerstag'],
  light_mystic: ['runebladesentinel',  'moonveilmystic'],
  primal_dark:  ['nighthoofreaver',    'gorethirstfiend'],
  mystic_dark:  ['duskbloomtender',    'hexbloodwarlock'],
};

// Paired deck slot targets
const PAIRED_PRIMARY_TARGET   = 18; // midpoint of 16–20
const PAIRED_SECONDARY_TARGET = 9;  // midpoint of 8–10
const PAIRED_NEUTRAL_TARGET   = 3;  // midpoint of 0–4
// (18 + 9 + 3 = 30)

// 8 pairings used for the main balance matrix (mono × 4 + friendly × 4)
export const ALL_PAIRINGS = [
  // 4 mono pairings
  { id: 'light',        champion: 'light',  secondary: null,     label: 'Light (mono)' },
  { id: 'primal',       champion: 'primal', secondary: null,     label: 'Primal (mono)' },
  { id: 'mystic',       champion: 'mystic', secondary: null,     label: 'Mystic (mono)' },
  { id: 'dark',         champion: 'dark',   secondary: null,     label: 'Dark (mono)' },
  // 4 friendly pairings
  { id: 'light_primal', champion: 'light',  secondary: 'primal', label: 'Light/Primal (friendly)' },
  { id: 'light_mystic', champion: 'light',  secondary: 'mystic', label: 'Light/Mystic (friendly)' },
  { id: 'primal_dark',  champion: 'primal', secondary: 'dark',   label: 'Primal/Dark (friendly)' },
  { id: 'mystic_dark',  champion: 'mystic', secondary: 'dark',   label: 'Mystic/Dark (friendly)' },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getLegalPool(primaryAttr, secondaryAttr) {
  return Object.values(CARD_DB).filter(card => {
    if (card.token) return false;
    if (EXCLUDED_IDS.has(card.id)) return false;
    const a = card.attribute;
    if (a === primaryAttr) return true;
    if (a === 'neutral') return true;
    if (secondaryAttr && a === secondaryAttr) return true;
    return false;
  });
}

/**
 * Attempt to fill `count` cards into `result` from `bucket`.
 * Respects the 2-copy max for non-legendary cards and 1-copy for legendaries.
 * Mutates `usedCount` (Map<cardId, number>) and `usedLegendaries` (Set<cardId>) in place.
 * Returns number of cards actually added.
 */
function fillFrom(result, bucket, count, usedCount, usedLegendaries) {
  let added = 0;
  for (const card of bucket) {
    if (added >= count) break;
    if (result.length >= 30) break;
    if (card.legendary) {
      if (usedLegendaries.has(card.id)) continue;
      result.push(card.id);
      usedLegendaries.add(card.id);
      added++;
    } else {
      const n = usedCount.get(card.id) ?? 0;
      if (n >= 2) continue;
      result.push(card.id);
      usedCount.set(card.id, n + 1);
      added++;
    }
  }
  return added;
}

/** Add one copy of a specific card by ID (mandatory include). */
function forceInclude(deck, cardId, usedCount, usedLeg) {
  const card = CARD_DB[cardId];
  if (!card) return false;
  if (card.legendary) {
    if (usedLeg.has(card.id)) return false;
    deck.push(card.id);
    usedLeg.add(card.id);
    return true;
  } else {
    const n = usedCount.get(card.id) ?? 0;
    if (n >= 2) return false;
    deck.push(card.id);
    usedCount.set(card.id, n + 1);
    return true;
  }
}

// ── Resonance calculation ─────────────────────────────────────────────────────

function computeResonance(cardIds, primaryAttr) {
  const cardObjs = cardIds.map(id => CARD_DB[id]).filter(Boolean);
  const score = calculateResonance(cardObjs, primaryAttr);
  const tier = score >= RESONANCE_THRESHOLDS.ascended ? 'ascended'
    : score >= RESONANCE_THRESHOLDS.attuned ? 'attuned'
    : 'none';
  return { score, tier };
}

// ── Mode: curve (mono) ────────────────────────────────────────────────────────

function buildCurveDeckMono(pool) {
  const deck = [];
  const usedCount = new Map();
  const usedLeg = new Set();

  const nonLeg = shuffle(pool.filter(c => !c.legendary));
  const legendaries = shuffle(pool.filter(c => c.legendary));

  const byCostSlot = CURVE_TARGETS.map(slot =>
    nonLeg.filter(c => c.cost >= slot.minCost && c.cost <= slot.maxCost)
  );

  // Fill each bracket to target
  for (let i = 0; i < CURVE_TARGETS.length; i++) {
    fillFrom(deck, byCostSlot[i], CURVE_TARGETS[i].target, usedCount, usedLeg);
  }

  // Add up to 3 legendaries
  fillFrom(deck, legendaries, Math.min(legendaries.length, 3), usedCount, usedLeg);

  // Pad to 30
  if (deck.length < 30) {
    const padOrder = [2, 3, 1, 4, 5, 0];
    for (const si of padOrder) {
      if (deck.length >= 30) break;
      fillFrom(deck, byCostSlot[si], 30 - deck.length, usedCount, usedLeg);
    }
  }
  if (deck.length < 30) {
    fillFrom(deck, shuffle(pool.filter(c => !c.legendary)), 30 - deck.length, usedCount, usedLeg);
  }

  return deck.slice(0, 30);
}

// ── Mode: curve (paired) ──────────────────────────────────────────────────────
//
// Paired deck split (budgets are hard limits, all counts include bridges + legs):
//   18 primary   (55–65%)
//    9 secondary (25–35%)
//    3 neutral    (0–15%)
//   ──
//   30 total
//
// Bridge cards are mandatory and count toward their attribute's budget.
// Legendaries are pulled from within each attribute's remaining budget, not added on top.

function buildCurveDeckPaired(primaryPool, secondaryPool, neutralPool, pairingId) {
  const usedCount = new Map();
  const usedLeg   = new Set();

  // Helper that fills into a sub-deck up to `budget` cards, then returns the ids.
  // Uses the same fillFrom logic but operates on a local array.
  function fillAttrSlots(nonLegByCost, legPool, budget) {
    const sub = [];
    const localCount = new Map(usedCount);
    const localLeg   = new Set(usedLeg);

    const legBudget = Math.min(legPool.length, 2);
    const nonLegBudget = budget - legBudget;

    // Curve-distributed fill for non-legendaries
    let filled = 0;
    const totalCurveTarget = CURVE_TARGETS.reduce((s, t) => s + t.target, 0);
    for (let i = 0; i < CURVE_TARGETS.length; i++) {
      const slotTarget = Math.round((CURVE_TARGETS[i].target / totalCurveTarget) * nonLegBudget);
      for (const card of nonLegByCost[i]) {
        if (filled >= nonLegBudget || sub.length >= budget) break;
        if (!card.legendary) {
          const n = localCount.get(card.id) ?? 0;
          if (n < 2) {
            sub.push(card.id);
            localCount.set(card.id, n + 1);
            if (sub.length - legBudget <= slotTarget) filled++;
          }
        }
      }
    }

    // Pad non-leg if under budget
    if (filled < nonLegBudget) {
      const padOrder = [2, 3, 1, 4, 5, 0];
      for (const si of padOrder) {
        for (const card of nonLegByCost[si]) {
          if (filled >= nonLegBudget || sub.length >= budget) break;
          if (!card.legendary) {
            const n = localCount.get(card.id) ?? 0;
            if (n < 2) { sub.push(card.id); localCount.set(card.id, n + 1); filled++; }
          }
        }
        if (filled >= nonLegBudget) break;
      }
    }

    // Add legendaries within budget
    let legAdded = 0;
    for (const card of legPool) {
      if (legAdded >= legBudget || sub.length >= budget) break;
      if (!localLeg.has(card.id)) { sub.push(card.id); localLeg.add(card.id); legAdded++; }
    }

    // Sync back to outer tracking
    for (const id of sub) {
      const card = CARD_DB[id];
      if (!card) continue;
      if (card.legendary) usedLeg.add(id);
      else usedCount.set(id, (usedCount.get(id) ?? 0) + 1);
    }

    return sub;
  }

  // ── Step 1: mandatory bridge cards ────────────────────────────────────────
  const bridges = BRIDGE_CARDS[pairingId] ?? [];
  const bridgePrimary   = [];
  const bridgeSecondary = [];
  for (const id of bridges) {
    const card = CARD_DB[id];
    if (!card) continue;
    const isPrimary = primaryPool.some(c => c.id === id);
    if (card.legendary) {
      if (!usedLeg.has(id)) {
        usedLeg.add(id);
        isPrimary ? bridgePrimary.push(id) : bridgeSecondary.push(id);
      }
    } else {
      const n = usedCount.get(id) ?? 0;
      if (n < 2) {
        usedCount.set(id, n + 1);
        isPrimary ? bridgePrimary.push(id) : bridgeSecondary.push(id);
      }
    }
  }

  const primaryBridgeCount   = bridgePrimary.length;
  const secondaryBridgeCount = bridgeSecondary.length;

  // ── Step 2: fill primary (budget minus bridges) ────────────────────────────
  const primaryRemaining = PAIRED_PRIMARY_TARGET - primaryBridgeCount;
  const primaryNonLeg    = shuffle(primaryPool.filter(c => !c.legendary && !bridges.includes(c.id)));
  const primaryLeg       = shuffle(primaryPool.filter(c =>  c.legendary && !bridges.includes(c.id)));
  const primaryByCost    = CURVE_TARGETS.map(slot =>
    primaryNonLeg.filter(c => c.cost >= slot.minCost && c.cost <= slot.maxCost));

  const primarySlots = fillAttrSlots(primaryByCost, primaryLeg, primaryRemaining);

  // ── Step 3: fill secondary (budget minus bridges) ──────────────────────────
  const secondaryRemaining = PAIRED_SECONDARY_TARGET - secondaryBridgeCount;
  const secondaryNonLeg    = shuffle(secondaryPool.filter(c => !c.legendary && !bridges.includes(c.id)));
  const secondaryLeg       = shuffle(secondaryPool.filter(c =>  c.legendary && !bridges.includes(c.id)));
  const secByCost          = CURVE_TARGETS.map(slot =>
    secondaryNonLeg.filter(c => c.cost >= slot.minCost && c.cost <= slot.maxCost));

  const secondarySlots = fillAttrSlots(secByCost, secondaryLeg, secondaryRemaining);

  // ── Step 4: neutral cards ──────────────────────────────────────────────────
  const neutralShuffled = shuffle(neutralPool.filter(c => !c.legendary));
  const neutralSlots    = [];
  for (const card of neutralShuffled) {
    if (neutralSlots.length >= PAIRED_NEUTRAL_TARGET) break;
    const n = usedCount.get(card.id) ?? 0;
    if (n < 2) { neutralSlots.push(card.id); usedCount.set(card.id, n + 1); }
  }

  // ── Assemble deck ──────────────────────────────────────────────────────────
  const deck = [
    ...bridgePrimary,
    ...bridgeSecondary,
    ...primarySlots,
    ...secondarySlots,
    ...neutralSlots,
  ];

  // ── Pad to 30 if needed ────────────────────────────────────────────────────
  const padUsedCount = new Map(usedCount);
  const padUsedLeg   = new Set(usedLeg);
  for (const id of deck) {
    const card = CARD_DB[id];
    if (!card) continue;
    if (card.legendary) padUsedLeg.add(id);
    else padUsedCount.set(id, (padUsedCount.get(id) ?? 0) + 1);
  }

  if (deck.length < 30) fillFrom(deck, primaryNonLeg,   30 - deck.length, padUsedCount, padUsedLeg);
  if (deck.length < 30) fillFrom(deck, secondaryNonLeg, 30 - deck.length, padUsedCount, padUsedLeg);
  if (deck.length < 30) fillFrom(deck, neutralShuffled, 30 - deck.length, padUsedCount, padUsedLeg);

  return deck.slice(0, 30);
}

// ── Mode: random ──────────────────────────────────────────────────────────────

function buildRandomDeck(pool) {
  const shuffled = shuffle(pool);
  const deck = [];
  const usedCount = new Map();
  const usedLeg = new Set();

  for (const card of shuffled) {
    if (deck.length >= 30) break;
    if (card.legendary) {
      if (usedLeg.has(card.id)) continue;
      deck.push(card.id);
      usedLeg.add(card.id);
    } else {
      const n = usedCount.get(card.id) ?? 0;
      if (n >= 2) continue;
      deck.push(card.id);
      usedCount.set(card.id, n + 1);
    }
  }

  if (deck.length < 30) {
    for (const card of shuffled) {
      if (deck.length >= 30) break;
      if (card.legendary) continue;
      const n = usedCount.get(card.id) ?? 0;
      if (n < 2) {
        deck.push(card.id);
        usedCount.set(card.id, n + 1);
      }
    }
  }

  return deck.slice(0, 30);
}

// ── Mode: archetype ───────────────────────────────────────────────────────────

function scoreCard(card, archetype, primaryAttr) {
  let score = Math.random() * 0.5;
  if (card.attribute === primaryAttr) score += 1;

  switch (archetype) {
    case 'aggro':
      if (card.cost <= 3) score += (4 - card.cost) * 3;
      if (card.rush) score += 5;
      if (card.type === 'unit' && (card.atk ?? 0) >= 3) score += 2;
      if (card.type === 'unit' && (card.atk ?? 0) >= 4) score += 2;
      if (card.type === 'spell' && card.cost >= 5) score -= 4;
      break;
    case 'midrange':
      if (card.cost === 3 || card.cost === 4) score += 4;
      if (card.cost === 2 || card.cost === 5) score += 2;
      if (card.aura) score += 3;
      if (card.type === 'unit' && (card.atk ?? 0) >= 3 && (card.hp ?? 0) >= 3) score += 3;
      break;
    case 'control':
      if (card.cost >= 4 && card.cost <= 7) score += 4;
      if (card.cost >= 8) score += 2;
      if (card.rules && /restore/i.test(card.rules)) score += 3;
      if (card.rules && /destroy/i.test(card.rules)) score += 3;
      if (card.rules && /draw/i.test(card.rules)) score += 2;
      if (SPELL_TYPES.has(card.type)) score += 2;
      if (card.type === 'unit' && card.cost <= 2) score -= 2;
      break;
    case 'tempo':
      if (card.cost >= 2 && card.cost <= 4) score += 4;
      if (card.type === 'unit') {
        const statRatio = ((card.atk ?? 0) + (card.hp ?? 0)) / Math.max(card.cost, 1);
        if (statRatio > 2.5) score += 4;
        if (statRatio > 3.0) score += 2;
      }
      if (SPELL_TYPES.has(card.type) && card.cost <= 3) score += 2;
      break;
  }
  return score;
}

function buildArchetypeDeck(pool, primaryAttr, archetype) {
  const scored = pool
    .map(card => ({ card, score: scoreCard(card, archetype, primaryAttr) }))
    .sort((a, b) => b.score - a.score);

  const deck = [];
  const usedCount = new Map();
  const usedLeg = new Set();

  const primaryLeg = shuffle(pool.filter(c => c.legendary && c.attribute === primaryAttr));
  fillFrom(deck, primaryLeg, primaryLeg.length, usedCount, usedLeg);

  for (const { card } of scored) {
    if (deck.length >= 30) break;
    if (card.legendary) {
      if (!usedLeg.has(card.id)) { deck.push(card.id); usedLeg.add(card.id); }
    } else {
      const n = usedCount.get(card.id) ?? 0;
      if (n < 2) { deck.push(card.id); usedCount.set(card.id, n + 1); }
    }
  }

  return deck.slice(0, 30);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a legal 30-card deck.
 *
 * @param {string}      champion       - Primary attribute: 'light'|'primal'|'mystic'|'dark'
 * @param {string|null} secondaryAttr  - Secondary attribute, or null for mono
 * @param {string}      mode           - 'random'|'curve'|'archetype'
 * @param {object}      options        - { archetype: 'aggro'|'midrange'|'control'|'tempo', pairingId: string }
 * @returns {{ cardIds: string[], resonance: { score: number, tier: string } }}
 */
export function buildDeck(champion, secondaryAttr = null, mode = 'curve', options = {}) {
  const primaryAttr = champion;
  const fullPool = getLegalPool(primaryAttr, secondaryAttr);

  if (fullPool.length < 15) {
    throw new Error(`buildDeck: pool too small (${fullPool.length} cards) for ${champion}/${secondaryAttr}`);
  }

  let cardIds;

  if (mode === 'random') {
    cardIds = buildRandomDeck(fullPool);

  } else if (mode === 'archetype') {
    cardIds = buildArchetypeDeck(fullPool, primaryAttr, options.archetype ?? 'midrange');

  } else {
    // curve mode
    if (!secondaryAttr) {
      // Mono deck — no split constraints
      cardIds = buildCurveDeckMono(fullPool);
    } else {
      // Paired deck — enforce primary/secondary/neutral split + bridge cards
      const pairingId = options.pairingId ?? `${champion}_${secondaryAttr}`;
      const primaryPool   = fullPool.filter(c => c.attribute === primaryAttr);
      const secondaryPool = fullPool.filter(c => c.attribute === secondaryAttr);
      const neutralPool   = fullPool.filter(c => c.attribute === 'neutral');
      cardIds = buildCurveDeckPaired(primaryPool, secondaryPool, neutralPool, pairingId);
    }
  }

  if (cardIds.length !== 30) {
    console.warn(`[deckBuilder] WARNING: got ${cardIds.length} cards for ${champion}/${secondaryAttr}/${mode}, padding/trimming`);
    while (cardIds.length < 30 && fullPool.length > 0) {
      cardIds.push(fullPool[Math.floor(Math.random() * fullPool.length)].id);
    }
    cardIds = cardIds.slice(0, 30);
  }

  const resonance = computeResonance(cardIds, primaryAttr);
  return { cardIds, resonance };
}

/**
 * Get stats about a pairing's card pool (for debugging / analysis).
 */
export function getPairingPoolInfo(champion, secondaryAttr) {
  const pool = getLegalPool(champion, secondaryAttr);
  const byAttr = {};
  for (const card of pool) {
    byAttr[card.attribute] = (byAttr[card.attribute] ?? 0) + 1;
  }
  const byCost = {};
  for (const card of pool) {
    const slot = Math.min(card.cost, 6);
    byCost[slot] = (byCost[slot] ?? 0) + 1;
  }
  return {
    total: pool.length,
    byAttribute: byAttr,
    byCost,
    legendaries: pool.filter(c => c.legendary).map(c => c.id),
    bridges: BRIDGE_CARDS[`${champion}_${secondaryAttr}`] ?? [],
  };
}

/** Expose bridge card registry for use in matrix reports. */
export { BRIDGE_CARDS };
