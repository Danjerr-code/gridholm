/**
 * actionHandler.js — Shared action handler for single-player and multiplayer.
 *
 * Each export takes the current game state plus action parameters, delegates to
 * the appropriate game-engine functions, and returns the new game state.
 *
 * Rules:
 *  - Zero UI logic (no selectMode, no React state, no sound effects)
 *  - Zero Supabase logic
 *  - Pure game logic routing only
 *
 * Adding a new mechanic: add it here once. Both single-player (useGameState.js)
 * and multiplayer (MultiplayerGame.jsx) automatically support it.
 */

import {
  moveChampion,
  moveUnit,
  getApproachTiles,
  manhattan,
} from './gameEngine.js';

// ── Champion movement ──────────────────────────────────────────────────────

/**
 * Move the active player's champion to (row, col).
 * @param {object} state - current game state
 * @param {number} row
 * @param {number} col
 * @returns {object} new game state
 */
export function handleChampionMove(state, row, col) {
  return moveChampion(state, row, col);
}

// ── Unit movement ──────────────────────────────────────────────────────────

/**
 * Move a unit to (row, col), handling approach-attack disambiguation.
 *
 * When a unit is 2 tiles away from an enemy and multiple approach paths exist,
 * the player must choose which intermediate tile to step through. In that case
 * we cannot commit to moveUnit yet — the caller must show approach-tile selection.
 *
 * @param {object} state - current game state
 * @param {string} unitUid
 * @param {number} row
 * @param {number} col
 * @returns {{ needsApproach: false, state: object }|{ needsApproach: true, state: object }}
 *   needsApproach=true means the caller should enter 'approach_select' mode;
 *   the state is unchanged in that case (no commit yet).
 *   needsApproach=false means the move (and any attack) has been applied.
 */
export function handleUnitMove(state, unitUid, row, col) {
  const unit = state.units.find(u => u.uid === unitUid);
  const targetHasEnemy =
    state.units.some(u => u.owner !== state.activePlayer && u.row === row && u.col === col) ||
    state.champions.some(ch => ch.owner !== state.activePlayer && ch.row === row && ch.col === col);

  if (unit && targetHasEnemy && manhattan([unit.row, unit.col], [row, col]) === 2) {
    const tiles = getApproachTiles(state, unit, row, col);
    if (tiles.length > 1) {
      return { needsApproach: true, state };
    }
  }

  return { needsApproach: false, state: moveUnit(state, unitUid, row, col) };
}
