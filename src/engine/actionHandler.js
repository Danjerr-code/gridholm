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
