/**
 * Boss definitions for Adventure Mode.
 *
 * Each boss has a static base definition scaled by loopCount.
 * Exports:
 *   getBossDefinition(bossId, loopCount) → BossDefinition
 */

// ── The Enthroned ─────────────────────────────────────────────────────────────

// Curated 25-card deck mixing cards from all 4 factions (no legendaries)
const ENTHRONED_DECK = [
  // Light (6)
  'militia',       // 1-cost rush
  'squire',        // 2-cost durable
  'knight',        // 3-cost solid
  'warlord',       // 4-cost powerhouse
  'smite',         // 3-cost removal
  'ironshield',    // 2-cost protection
  // Primal (6)
  'boar',          // 1-cost rush
  'wolf',          // 2-cost mobile
  'razorclaw',     // 2-cost threat
  'rockhorn',      // 4-cost rush
  'ambush',        // 3-cost combat trick
  'savagegrowth',  // 3-cost buff
  // Mystic (7)
  'elfscout',      // 1-cost mobile
  'woodlandguard', // 2-cost utility
  'verdantarcher', // 2-cost mobile
  'elfranger',     // 4-cost flanker
  'glimpse',       // 2-cost card advantage
  'moonleaf',      // healing
  'bloom',         // mystic aoe
  // Dark (6)
  'imp',           // 1-cost
  'spiteling',     // 2-cost
  'dreadknight',   // 3-cost
  'shadowstalker', // 3-cost hidden
  'pestilence',    // 4-cost debuff
  'souldrain',     // drain spell
];

/**
 * Throne Guard — custom adventure-only unit guarding the boss.
 * @param {number} loopScaling
 * @returns {Object} base unit data (without uid/owner/position)
 */
function throneGuardBase(loopScaling) {
  return {
    id: 'throne_guard',
    name: 'Throne Guard',
    atk: 2 + loopScaling,
    hp: 4 + loopScaling,
    maxHp: 4 + loopScaling,
    spd: 1,
    type: 'unit',
    attribute: 'neutral',
    unitType: ['Guard'],
    rules: '',
    cost: 2,
    rarity: 'common',
    image: null,
    isToken: false,
    legendary: false,
    rush: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
    turnAtkBonus: 0,
    hidden: false,
    moved: false,
    summoned: false,
  };
}

/**
 * Throne Archer — custom adventure-only ranged unit.
 * @param {number} loopScaling
 * @returns {Object} base unit data
 */
function throneArcherBase(loopScaling) {
  return {
    id: 'throne_archer',
    name: 'Throne Archer',
    atk: 3 + loopScaling,
    hp: 2 + loopScaling,
    maxHp: 2 + loopScaling,
    spd: 1,
    type: 'unit',
    attribute: 'neutral',
    unitType: ['Archer'],
    rules: '',
    cost: 2,
    rarity: 'common',
    image: null,
    isToken: false,
    legendary: false,
    rush: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
    turnAtkBonus: 0,
    hidden: false,
    moved: false,
    summoned: false,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the boss definition for the given bossId, scaled by loopCount.
 *
 * @param {string} bossId    - 'the_enthroned'
 * @param {number} loopCount - current loop (0 = first encounter)
 * @returns {BossDefinition}
 */
export function getBossDefinition(bossId, loopCount = 0) {
  if (bossId === 'the_enthroned') {
    const ls = loopCount; // loop scaling shorthand

    return {
      id:           'the_enthroned',
      name:         'The Enthroned',
      championHP:   20 + ls * 5,
      faction:      'neutral',
      deckSize:     25,
      aiDepth:      2,
      deck:         [...ENTHRONED_DECK],
      // Pre-placed units at fight start (owner = 1 = AI)
      // Positions relative to boss champion at (2,2):
      startingUnits: [
        { base: throneGuardBase(ls),  row: 1, col: 2 },
        { base: throneGuardBase(ls),  row: 3, col: 2 },
        { base: throneArcherBase(ls), row: 2, col: 1 },
        { base: throneArcherBase(ls), row: 2, col: 3 },
      ],
      // Enhanced throne: deals 3 damage instead of 2 at end of turn
      uniqueRules: ['enhanced_throne'],
    };
  }

  // Unknown boss — fallback
  return null;
}
