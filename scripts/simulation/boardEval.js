/**
 * boardEval.js
 *
 * Board evaluation function for strategic AI.
 *
 * Weights are tunable — adjusting them changes AI behavior:
 *   - championHP:              higher → more defensive (values own survivability)
 *   - championHPDiff:          higher → more aggressive about maintaining life lead
 *   - unitCountDiff:           higher → prioritizes raw board presence
 *   - totalATKOnBoard:         higher → favors fielding high-attack units
 *   - totalHPOnBoard:          higher → prefers durable boards over burst damage
 *   - throneControl:           higher → strongly contests the center tile
 *   - unitsThreateningChampion: higher → more aggressive, pushes lethal threat
 *   - unitsAdjacentToAlly:     higher → values formation / Aura synergy
 *   - cardsInHand:             higher → values card advantage / options
 *   - hiddenUnits:             higher → values information asymmetry
 *   - manaEfficiency:          higher → penalizes wasting mana each turn
 *
 * Usage:
 *   import { evaluateBoard, WEIGHTS } from './boardEval.js';
 *   const score = evaluateBoard(gameState, 'p1');
 */

import { manhattan } from '../../src/engine/gameEngine.js';

// Throne tile: center of the 5×5 board.
const THRONE_ROW = 2;
const THRONE_COL = 2;

/**
 * Weight constants for each evaluation factor.
 * Override per-faction in the simulation runner by spreading a partial object
 * over a copy: { ...WEIGHTS, throneControl: 30 }
 */
export const WEIGHTS = {
  championHP:               10,
  championHPDiff:           15,
  unitCountDiff:             8,
  totalATKOnBoard:           3,
  totalHPOnBoard:            2,
  throneControl:            20,
  unitsThreateningChampion: 12,
  unitsAdjacentToAlly:       4,
  cardsInHand:               5,
  hiddenUnits:               6,
  manaEfficiency:            2,
};

/**
 * Evaluates the board position for a given player.
 *
 * @param {object} gameState  - current game state
 * @param {string} playerId   - 'p1' or 'p2'
 * @param {object} [weights]  - optional weight overrides (merged with WEIGHTS)
 * @returns {number}           score (higher is better for playerId)
 */
export function evaluateBoard(gameState, playerId, weights = WEIGHTS) {
  const ap = playerId === 'p1' ? 0 : 1;
  const op = 1 - ap;

  const myChamp  = gameState.champions[ap];
  const oppChamp = gameState.champions[op];
  const myUnits  = gameState.units.filter(u => u.owner === ap);
  const oppUnits = gameState.units.filter(u => u.owner === op);
  const myPlayer = gameState.players[ap];

  // ── Individual factors ──────────────────────────────────────────────────────

  // championHP: evaluating player's champion HP
  const championHP = myChamp.hp;

  // championHPDiff: my champion HP minus opponent's champion HP
  const championHPDiff = myChamp.hp - oppChamp.hp;

  // unitCountDiff: my unit count minus opponent's unit count
  const unitCountDiff = myUnits.length - oppUnits.length;

  // totalATKOnBoard: sum of effective ATK of all my units
  // Use the raw atk field (same as headlessEngine context; getEffectiveAtk needs
  // position context we skip here to keep evaluation stateless and fast).
  const totalATKOnBoard = myUnits.reduce((sum, u) => sum + (u.atk ?? 0), 0);

  // totalHPOnBoard: sum of HP of all my units
  const totalHPOnBoard = myUnits.reduce((sum, u) => sum + (u.hp ?? 0), 0);

  // throneControl: +1 if I hold Throne, -1 if opponent holds it, 0 otherwise
  const myOnThrone = (
    (myChamp.row === THRONE_ROW && myChamp.col === THRONE_COL) ||
    myUnits.some(u => u.row === THRONE_ROW && u.col === THRONE_COL)
  );
  const oppOnThrone = (
    (oppChamp.row === THRONE_ROW && oppChamp.col === THRONE_COL) ||
    oppUnits.some(u => u.row === THRONE_ROW && u.col === THRONE_COL)
  );
  const throneControl = myOnThrone ? 1 : (oppOnThrone ? -1 : 0);

  // unitsThreateningChampion: my units within 2 Manhattan distance of opponent's champion
  const unitsThreateningChampion = myUnits.filter(u =>
    manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]) <= 2
  ).length;

  // unitsAdjacentToAlly: my units adjacent (cardinal, distance=1) to at least one other friendly unit
  const unitsAdjacentToAlly = myUnits.filter(u =>
    myUnits.some(ally =>
      ally !== u && manhattan([u.row, u.col], [ally.row, ally.col]) === 1
    )
  ).length;

  // cardsInHand: number of cards in my hand
  const cardsInHand = myPlayer.hand ? myPlayer.hand.length : 0;

  // hiddenUnits: count of my Hidden (unrevealed) units on board
  const hiddenUnits = myUnits.filter(u => u.hidden).length;

  // manaEfficiency: (totalMana - remainingMana) / max(totalMana, 1)
  // Ranges 0–1; 1 means all mana spent (most efficient).
  const totalMana     = myPlayer.maxMana ?? myPlayer.mana ?? 0;
  const remainingMana = myPlayer.mana ?? 0;
  const manaEfficiency = (totalMana - remainingMana) / Math.max(totalMana, 1);

  // ── Weighted sum ────────────────────────────────────────────────────────────

  const score =
    championHP               * weights.championHP               +
    championHPDiff           * weights.championHPDiff           +
    unitCountDiff            * weights.unitCountDiff            +
    totalATKOnBoard          * weights.totalATKOnBoard          +
    totalHPOnBoard           * weights.totalHPOnBoard           +
    throneControl            * weights.throneControl            +
    unitsThreateningChampion * weights.unitsThreateningChampion +
    unitsAdjacentToAlly      * weights.unitsAdjacentToAlly      +
    cardsInHand              * weights.cardsInHand              +
    hiddenUnits              * weights.hiddenUnits              +
    manaEfficiency           * weights.manaEfficiency;

  return score;
}
