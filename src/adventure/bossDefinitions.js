/**
 * Boss definitions for Adventure Mode.
 *
 * Each boss has a static base definition scaled by loopCount.
 * Exports:
 *   getBossDefinition(bossId, loopCount) → BossDefinition
 */

// ── The Enthroned ─────────────────────────────────────────────────────────────

// 30-card deck: mix of all factions plus boss-only cards.
// Boss-only cards are excluded from player draft pools and are marked bossOnly: true.
const ENTHRONED_DECK = [
  // Light (6)
  'militia',
  'squire',
  'knight',
  'warlord',
  'smite',
  'ironshield',
  // Primal (6)
  'boar',
  'wolf',
  'razorclaw',
  'rockhorn',
  'ambush',
  'savagegrowth',
  // Mystic (5)
  'elfscout',
  'woodlandguard',
  'verdantarcher',
  'glimpse',
  'moonleaf',
  // Dark (5)
  'imp',
  'spiteling',
  'dreadknight',
  'shadowstalker',
  'souldrain',
  // Boss-only cards (8)
  'royal_guard',
  'royal_guard',
  'herald_of_the_crown',
  'royal_banner',
  'royal_decree',
  'fortify_the_crown',
  'thrones_judgment',
  'consecrated_ground',
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
      deckSize:     30,
      aiDepth:      2,
      deck:         [...ENTHRONED_DECK],
      // Pre-placed units at fight start (owner = 1 = AI).
      startingUnits: [
        // Guards flanking the boss champion at (2,2)
        { base: throneGuardBase(ls),  row: 1, col: 2 },
        { base: throneGuardBase(ls),  row: 3, col: 2 },
        // Archers to the sides of the throne
        { base: throneArcherBase(ls), row: 2, col: 1 },
        { base: throneArcherBase(ls), row: 2, col: 3 },
      ],
      // Switch tiles: stepping on any of these displaces the occupant of Throne (2,2).
      // Placed at the three corners opposite from the player's start at (0,0).
      switchTiles: [
        { row: 4, col: 0, active: true },
        { row: 0, col: 4, active: true },
        { row: 4, col: 4, active: true },
      ],
      // Boss passives — applied at fight start; each entry describes a passive effect.
      bossPassives: [
        {
          id:          'royal_stasis',
          name:        'Royal Stasis',
          description: 'All boss pieces are locked for the first 3 turns. They cannot move, attack, or use abilities during this time.',
          effect:      'stasis',
          value:       3,
        },
      ],
    };
  }

  // Unknown boss — fallback
  return null;
}
