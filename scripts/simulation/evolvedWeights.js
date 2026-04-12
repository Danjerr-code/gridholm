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
 * Last updated: 2026-04-12 (primal smoke test, --pop 10 --games 10 --gen 5)
 * Status: primal only — awaiting full faction runs and board approval
 */

import { WEIGHTS } from './boardEval.js';

/**
 * Primal smoke test result.
 * Run: --pop 10 --games 10 --gen 5 --faction primal
 * Best member WR: 53.3% (48W/30L/12D in final-gen tournament)
 * Status: PENDING BOARD APPROVAL — do not deploy to production AI
 */
const EVOLVED_PRIMAL = {
  ...WEIGHTS,
  // Faction seed overrides (from FACTION_WEIGHTS.primal) preserved
  championHPDiff:           12,
  cardsInHand:               2,
  unitCountDiff:             5,
  healingValue:              0,
  // Evolved changes vs primal seed
  championHP:                5,   // was 3  (+67%) — more defensive than baseline primal
  totalATKOnBoard:           4,   // was 6  (-33%) — lower attack board emphasis
  throneControl:            24,   // was 20 (+20%) — higher throne value
  unitsThreateningChampion: 18,   // was 25 (-28%) — less pure champion convergence
  unitsAdjacentToAlly:       3,   // was 4  (-25%)
  hiddenUnits:               7,   // was 6  (+17%)
  lethalThreat:             35,   // unchanged
  championProximity:         9,   // was 10 (-10%)
  opponentChampionLowHP:    34,   // was 30 (+13%) — more urgency on low-HP finishes
  relicsOnBoard:             2,   // was 4  (-50%)
  terrainBenefit:            1,   // was 3  (-67%)
  terrainHarm:               2,   // was 3  (-33%)
};

/**
 * All evolved weight sets keyed by faction.
 * Factions not yet run retain null — callers should fall back to FACTION_WEIGHTS.
 */
export const EVOLVED_WEIGHTS = {
  primal:      EVOLVED_PRIMAL,
  light:       null,  // not yet evolved
  mystic:      null,  // not yet evolved
  dark:        null,  // not yet evolved
  light_primal: null, // not yet evolved
  light_mystic: null, // not yet evolved
  primal_dark:  null, // not yet evolved
  mystic_dark:  null, // not yet evolved
};
