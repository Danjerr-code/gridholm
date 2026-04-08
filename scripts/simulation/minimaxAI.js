/**
 * minimaxAI.js
 *
 * Strategic AI using minimax search with alpha-beta pruning.
 *
 * Usage:
 *   import { chooseActionMinimax } from './minimaxAI.js';
 *   const action = chooseActionMinimax(gameState, commandsUsed, { depth: 2, weights: null });
 */

import { getLegalActions, applyAction, isGameOver } from './headlessEngine.js';
import { evaluateBoard } from './boardEval.js';
import { chooseAction } from './simAI.js';
import { manhattan } from '../../src/engine/gameEngine.js';

// Throne tile: center of the 5×5 board.
const THRONE_ROW = 2;
const THRONE_COL = 2;

// ── Action filtering ──────────────────────────────────────────────────────────

/**
 * Filter legal actions to reduce branching factor.
 * Target: reduce 30–50 actions to 10–20 per position.
 *
 * Rules:
 *   - Remove unit moves that increase Manhattan distance from BOTH the enemy
 *     champion AND the Throne tile.
 *   - Remove summon actions for units costing more than 2× the cheapest
 *     playable unit in hand, unless no cheaper options exist.
 *   - Keep all spell casts, champion abilities, champion moves unfiltered.
 *   - Keep all unit moves that attack an enemy unit or champion unfiltered.
 */
function filterActions(actions, state, commandsUsed) {
  const ap = state.activePlayer;
  const enemyIdx = 1 - ap;
  const enemyChamp = state.champions[enemyIdx];

  // Enforce 3-command limit for unit moves
  if (commandsUsed >= 3) {
    actions = actions.filter(a => a.type !== 'move');
  }

  // Find cheapest playable unit cost for summon filtering
  const hand = state.players[ap].hand;
  const unitCards = hand.filter(c => c.type === 'unit' && c.cost <= state.players[ap].resources);
  const minUnitCost = unitCards.length > 0
    ? Math.min(...unitCards.map(c => c.cost ?? 0))
    : Infinity;

  return actions.filter(action => {
    switch (action.type) {
      case 'move': {
        const unit = state.units.find(u => u.uid === action.unitId);
        if (!unit) return false;
        const [tr, tc] = action.targetTile;

        // Always keep attacks on enemy units or champion
        if (
          state.units.some(u => u.owner === enemyIdx && u.row === tr && u.col === tc) ||
          (enemyChamp.row === tr && enemyChamp.col === tc)
        ) {
          return true;
        }

        // Remove moves that increase distance from BOTH objectives
        const curDistEnemy = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
        const newDistEnemy = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
        const curDistThrone = manhattan([unit.row, unit.col], [THRONE_ROW, THRONE_COL]);
        const newDistThrone = manhattan([tr, tc], [THRONE_ROW, THRONE_COL]);

        if (newDistEnemy > curDistEnemy && newDistThrone > curDistThrone) {
          return false; // moving away from all objectives — prune
        }
        return true;
      }

      case 'summon': {
        const card = hand.find(c => c.uid === action.cardUid);
        if (!card) return false;
        // Remove expensive summons when cheaper options exist
        if (card.cost > 2 * minUnitCost) return false;
        return true;
      }

      // Keep spells, champion abilities, champion moves, unit actions, endTurn unfiltered
      default:
        return true;
    }
  });
}

// ── Minimax ───────────────────────────────────────────────────────────────────

/**
 * Minimax search with alpha-beta pruning.
 *
 * Depth semantics: depth decrements by 1 at each endTurn (turn boundary).
 * Actions within a player's turn (non-endTurn) do not decrement depth.
 * At depth 0, the position is evaluated and returned immediately.
 *
 * @param {object}  gameState        - current game state
 * @param {number}  depth            - remaining turn-depth to search
 * @param {number}  alpha            - best score maximizer can guarantee
 * @param {number}  beta             - best score minimizer can guarantee
 * @param {boolean} maximizingPlayer - true if current ply favors playerId
 * @param {string}  playerId         - 'p1' or 'p2' (the root caller's perspective)
 * @param {number}  commandsUsed     - move actions taken in this branch's current turn
 * @param {object}  weights          - weight overrides for evaluateBoard
 * @param {object}  deadline         - { time: number } abort threshold (performance.now() ms)
 * @returns {{ score: number, action: object|null }}
 */
function minimax(gameState, depth, alpha, beta, maximizingPlayer, playerId, commandsUsed, weights, deadline) {
  // Timeout check: abort and signal with a sentinel value
  if (performance.now() > deadline.time) {
    return { score: evaluateBoard(gameState, playerId, weights), action: null, timedOut: true };
  }

  const { over } = isGameOver(gameState);
  if (over) {
    return { score: evaluateBoard(gameState, playerId, weights), action: null };
  }

  if (depth === 0) {
    return { score: evaluateBoard(gameState, playerId, weights), action: null };
  }

  const rawActions = getLegalActions(gameState);
  const actions = filterActions(rawActions, gameState, commandsUsed);

  if (actions.length === 0) {
    return { score: evaluateBoard(gameState, playerId, weights), action: null };
  }

  if (maximizingPlayer) {
    let best = { score: -Infinity, action: null };

    for (const action of actions) {
      const newState = applyAction(gameState, action);
      const isEndTurn = action.type === 'endTurn';

      // endTurn switches player perspective and decrements depth
      const nextDepth         = isEndTurn ? depth - 1 : depth;
      const nextMaximizing    = isEndTurn ? false : true;
      const nextCommandsUsed  = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

      const result = minimax(
        newState, nextDepth, alpha, beta,
        nextMaximizing, playerId, nextCommandsUsed, weights, deadline
      );

      if (result.timedOut) {
        // Propagate timeout signal without replacing a valid best
        if (best.action === null) {
          best = { score: result.score, action: action, timedOut: true };
        }
        return best;
      }

      if (result.score > best.score) {
        best = { score: result.score, action: action };
      }
      alpha = Math.max(alpha, result.score);
      if (beta <= alpha) break; // beta cut-off
    }

    return best;

  } else {
    let best = { score: Infinity, action: null };

    for (const action of actions) {
      const newState = applyAction(gameState, action);
      const isEndTurn = action.type === 'endTurn';

      const nextDepth         = isEndTurn ? depth - 1 : depth;
      const nextMaximizing    = isEndTurn ? true : false;
      const nextCommandsUsed  = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

      const result = minimax(
        newState, nextDepth, alpha, beta,
        nextMaximizing, playerId, nextCommandsUsed, weights, deadline
      );

      if (result.timedOut) {
        if (best.action === null) {
          best = { score: result.score, action: action, timedOut: true };
        }
        return best;
      }

      if (result.score < best.score) {
        best = { score: result.score, action: action };
      }
      beta = Math.min(beta, result.score);
      if (beta <= alpha) break; // alpha cut-off
    }

    return best;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Choose the best action using minimax search with alpha-beta pruning.
 * Falls back to the heuristic AI from simAI.js if search exceeds 5 seconds.
 *
 * @param {object}  gameState    - current game state
 * @param {number}  commandsUsed - move actions already taken this turn (0–3)
 * @param {object}  [options]    - { depth: 2, weights: null }
 * @returns {object}              action object to apply
 */
export function chooseActionMinimax(gameState, commandsUsed = 0, options = {}) {
  const depth   = options.depth   ?? 2;
  const weights = options.weights ?? undefined; // undefined → boardEval uses its own default

  const ap       = gameState.activePlayer;
  const playerId = ap === 0 ? 'p1' : 'p2';

  const deadline = { time: performance.now() + 5000 };

  const result = minimax(
    gameState, depth, -Infinity, Infinity,
    true, playerId, commandsUsed, weights, deadline
  );

  if (result.timedOut || result.action === null) {
    if (result.timedOut) {
      console.warn('[minimaxAI] Search timed out — falling back to heuristic AI');
    }
    // Fallback to rules-based AI
    return chooseAction(gameState, commandsUsed);
  }

  return result.action;
}
