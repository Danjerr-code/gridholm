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
  championHP:               5,
  championHPDiff:           8,
  unitCountDiff:             8,
  totalATKOnBoard:           3,
  totalHPOnBoard:            2,
  throneControl:            20,
  unitsThreateningChampion: 18,
  unitsAdjacentToAlly:       4,
  cardsInHand:               5,
  hiddenUnits:               6,
  manaEfficiency:            2,
  lethalThreat:             25,
  gameLength:               -0.5,
  championProximity:         6,
  relicsOnBoard:             4,
  omensOnBoard:              3,
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

  // championHPDiff: my champion HP minus opponent's champion HP.
  // Amplify when the opponent is close to death — creates urgency to close the game.
  const rawChampionHPDiff = myChamp.hp - oppChamp.hp;
  const hpDiffMultiplier = oppChamp.hp <= 5 ? 3 : 1;
  const championHPDiff = rawChampionHPDiff * hpDiffMultiplier;

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

  // lethalThreat: sum of ATK of friendly units that can reach the enemy champion next turn.
  // A unit with SPD >= Manhattan distance to enemy champion can attack it next turn.
  const lethalThreat = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return dist <= (u.spd ?? 1) ? sum + (u.atk ?? 0) : sum;
  }, 0);

  // gameLength: penalty per turn elapsed — creates urgency, favors shorter games.
  const gameLength = gameState.turn ?? 0;

  // championProximity: sum of (5 - Manhattan distance to enemy champion) for each friendly unit.
  // Rewards advancing toward the enemy champion.
  const championProximity = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return sum + Math.max(0, 5 - dist);
  }, 0);

  // relicsOnBoard: count of friendly relics alive on the board.
  // Relics provide persistent value so keeping them alive is a bonus.
  const relicsOnBoard = myUnits.filter(u => u.isRelic).length;

  // omensOnBoard: count of friendly omens alive on the board.
  // Omens provide temporary passive value; their presence is worth tracking.
  const omensOnBoard = myUnits.filter(u => u.isOmen).length;

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
    manaEfficiency           * weights.manaEfficiency           +
    lethalThreat             * weights.lethalThreat             +
    gameLength               * weights.gameLength               +
    championProximity        * weights.championProximity        +
    relicsOnBoard            * weights.relicsOnBoard            +
    omensOnBoard             * weights.omensOnBoard;

  return score;
}
