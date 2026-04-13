/**
 * evolvedWeights.js
 *
 * Faction-specific weight sets produced by evolutionary tuning (evolve.js).
 * Keyed by faction: 'light' | 'primal' | 'mystic' | 'dark' |
 *                   'light_primal' | 'light_mystic' | 'primal_dark' | 'mystic_dark'
 *
 * Import in the simulation runner or live AI to override FACTION_WEIGHTS:
 *   import { EVOLVED_WEIGHTS } from './evolvedWeights.js';
 *   const weights = EVOLVED_WEIGHTS[faction] ?? FACTION_WEIGHTS[faction] ?? WEIGHTS;
 *
 * THIS FILE IS AUTO-UPDATED by the analyst after each approved evolution run.
 * Do not hand-edit values here — run evolve.js and get board approval first.
 *
 * Last updated: 2026-04-13 (full 8-faction run, --pop 20 --games 20 --gen 5 --survivors 5)
 * Status: ALL FACTIONS COMPLETE — awaiting board approval before production deploy
 *
 * Summary of results:
 *   primal:       WR 50.0%  drawRate ~15%  (outstanding — weight tuning effective)
 *   light:        WR 38.7%  drawRate 36%   (healthy)
 *   light_primal: WR 33.9%  drawRate 49%   (moderate)
 *   light_mystic: WR 32.1%  drawRate 49%   (moderate)
 *   mystic_dark:  WR 30.8%  drawRate 50%   (moderate)
 *   primal_dark:  WR 29.5%  drawRate 48%   (moderate)
 *   dark:         WR 18.9%  drawRate 69%   (⚠ structural draw problem)
 *   mystic:       WR 12.6%  drawRate 80%   (🚨 severe structural draw problem)
 *
 * NOTE: Dark and Mystic draw rates are NOT a weight tuning problem — evolution
 * ran 5 generations with no meaningful improvement on draw rate. These factions
 * have structural mechanics that prevent decisive outcomes. Requires game design
 * intervention (see balance-flags.md).
 */

/**
 * Primal — full run --pop 20 --games 20 --gen 5
 * Best WR: 50.0% | drawRate: ~15%
 * Key shifts: +opponentChampionLowHP(+50%), +relicsOnBoard(+50%), +terrainBenefit(+67%),
 *             -lethalThreat(-29%), -hiddenUnits(-33%), -totalHPOnBoard(-50%),
 *             turnAggressionScale zeroed out
 */
const EVOLVED_PRIMAL = {
  championHP:                3,
  championHPDiff:           17,
  unitCountDiff:             5,
  totalATKOnBoard:           5,
  totalHPOnBoard:            1,
  throneControl:            20,
  unitsThreateningChampion: 25,
  unitsAdjacentToAlly:       5,
  cardsInHand:               2,
  hiddenUnits:               4,
  manaEfficiency:            2,
  lethalThreat:             25,
  championProximity:        11,
  opponentChampionLowHP:    45,
  relicsOnBoard:             6,
  omensOnBoard:              3,
  terrainBenefit:            5,
  terrainHarm:               3,
  healingValue:              0,
  turnAggressionScale:       0,
  projectedChampionDamage:  19,
};

/**
 * Light — full run --pop 20 --games 20 --gen 5
 * Best WR: 38.7% | drawRate: 35%
 * Key shifts: +championHP(+133%), +unitCountDiff(+80%), +unitsAdjacentToAlly(+125%),
 *             +totalHPOnBoard(+150%), -unitsThreateningChampion(-52%)
 */
const EVOLVED_LIGHT = {
  championHP:                7,
  championHPDiff:           10,
  unitCountDiff:             9,
  totalATKOnBoard:           4,
  totalHPOnBoard:            5,
  throneControl:            23,
  unitsThreateningChampion: 12,
  unitsAdjacentToAlly:       9,
  cardsInHand:               3,
  hiddenUnits:               4,
  manaEfficiency:            2,
  lethalThreat:             36,
  championProximity:        15,
  opponentChampionLowHP:    36,
  relicsOnBoard:             4,
  omensOnBoard:              3,
  terrainBenefit:            4,
  terrainHarm:               2,
  healingValue:              0,
};

/**
 * Dark — full run --pop 20 --games 20 --gen 5
 * Best WR: 18.9% | drawRate: 69% (⚠ structural issue — weight tuning ineffective)
 * Key shifts: +cardsInHand(+200%), +lethalThreat(+29%), -throneControl(-25%),
 *             -unitsThreateningChampion(-40%)
 * NOTE: evolution showed <1% improvement per generation — draw rate is not
 * responsive to weight changes. Structural mechanics investigation needed.
 */
const EVOLVED_DARK = {
  championHP:                4,
  championHPDiff:            5,
  unitCountDiff:             6,
  totalATKOnBoard:           3,
  totalHPOnBoard:            2,
  throneControl:            15,
  unitsThreateningChampion: 15,
  unitsAdjacentToAlly:       3,
  cardsInHand:               6,
  hiddenUnits:               7,
  manaEfficiency:            2,
  lethalThreat:             45,
  championProximity:        11,
  opponentChampionLowHP:    24,
  relicsOnBoard:             3,
  omensOnBoard:              3,
  terrainBenefit:            4,
  terrainHarm:               2,
  healingValue:              0,
};

/**
 * Mystic — full run --pop 20 --games 20 --gen 5
 * Best WR: 12.6% | drawRate: 80% (🚨 severe structural issue)
 * Key shifts: +championHP(+233%), +cardsInHand(+300%), +healingValue(+∞),
 *             -unitsThreateningChampion(-68%)
 * NOTE: evolution made no meaningful progress — draw rate stayed 80-82% all 5 gens.
 * Mystic faction likely has mechanics (healing loops, stall patterns) that prevent
 * decisive outcomes regardless of AI evaluation. Game design review required.
 */
const EVOLVED_MYSTIC = {
  championHP:               10,
  championHPDiff:            3,
  unitCountDiff:            10,
  totalATKOnBoard:           3,
  totalHPOnBoard:            2,
  throneControl:            20,
  unitsThreateningChampion:  8,
  unitsAdjacentToAlly:       4,
  cardsInHand:               8,
  hiddenUnits:               6,
  manaEfficiency:            2,
  lethalThreat:             35,
  championProximity:        10,
  opponentChampionLowHP:    30,
  relicsOnBoard:             4,
  omensOnBoard:              3,
  terrainBenefit:            3,
  terrainHarm:               3,
  healingValue:              8,
  turnAggressionScale:    0.08,
  projectedChampionDamage:  20,
};

/**
 * Light vs Primal — full run --pop 20 --games 20 --gen 5
 * Best WR: 33.9% | drawRate: 49%
 */
const EVOLVED_LIGHT_PRIMAL = {
  championHP:                6,
  championHPDiff:            6,
  unitCountDiff:            10,
  totalATKOnBoard:           3,
  totalHPOnBoard:            1,
  throneControl:            15,
  unitsThreateningChampion: 19,
  unitsAdjacentToAlly:       3,
  cardsInHand:               5,
  hiddenUnits:               5,
  manaEfficiency:            2,
  lethalThreat:             40,
  championProximity:        11,
  opponentChampionLowHP:    27,
  relicsOnBoard:             3,
  omensOnBoard:              3,
  terrainBenefit:            3,
  terrainHarm:               3,
  healingValue:              0,
};

/**
 * Light vs Mystic — full run --pop 20 --games 20 --gen 5
 * Best WR: 32.1% | drawRate: 49%
 */
const EVOLVED_LIGHT_MYSTIC = {
  championHP:                5,
  championHPDiff:           10,
  unitCountDiff:             9,
  totalATKOnBoard:           4,
  totalHPOnBoard:            1,
  throneControl:            17,
  unitsThreateningChampion: 21,
  unitsAdjacentToAlly:       3,
  cardsInHand:               6,
  hiddenUnits:               6,
  manaEfficiency:            2,
  lethalThreat:             37,
  championProximity:        11,
  opponentChampionLowHP:    28,
  relicsOnBoard:             4,
  omensOnBoard:              3,
  terrainBenefit:            2,
  terrainHarm:               4,
  healingValue:              0,
};

/**
 * Primal vs Dark — full run --pop 20 --games 20 --gen 5
 * Best WR: 29.5% | drawRate: 48%
 */
const EVOLVED_PRIMAL_DARK = {
  championHP:                7,
  championHPDiff:           11,
  unitCountDiff:             9,
  totalATKOnBoard:           4,
  totalHPOnBoard:            2,
  throneControl:            18,
  unitsThreateningChampion: 16,
  unitsAdjacentToAlly:       3,
  cardsInHand:               5,
  hiddenUnits:               5,
  manaEfficiency:            2,
  lethalThreat:             29,
  championProximity:        16,
  opponentChampionLowHP:    44,
  relicsOnBoard:             3,
  omensOnBoard:              3,
  terrainBenefit:            5,
  terrainHarm:               3,
  healingValue:              0,
};

/**
 * Mystic vs Dark — full run --pop 20 --games 20 --gen 5
 * Best WR: 30.8% | drawRate: 50%
 */
const EVOLVED_MYSTIC_DARK = {
  championHP:                3,
  championHPDiff:            8,
  unitCountDiff:             7,
  totalATKOnBoard:           3,
  totalHPOnBoard:            2,
  throneControl:            15,
  unitsThreateningChampion: 18,
  unitsAdjacentToAlly:       2,
  cardsInHand:               4,
  hiddenUnits:               6,
  manaEfficiency:            2,
  lethalThreat:             23,
  championProximity:        10,
  opponentChampionLowHP:    37,
  relicsOnBoard:             4,
  omensOnBoard:              3,
  terrainBenefit:            3,
  terrainHarm:               4,
  healingValue:              0,
};

/**
 * All evolved weight sets keyed by faction.
 * All 8 factions complete. Awaiting board approval before production deploy.
 */
export const EVOLVED_WEIGHTS = {
  primal:       EVOLVED_PRIMAL,
  light:        EVOLVED_LIGHT,
  dark:         EVOLVED_DARK,
  mystic:       EVOLVED_MYSTIC,
  light_primal: EVOLVED_LIGHT_PRIMAL,
  light_mystic: EVOLVED_LIGHT_MYSTIC,
  primal_dark:  EVOLVED_PRIMAL_DARK,
  mystic_dark:  EVOLVED_MYSTIC_DARK,
};
