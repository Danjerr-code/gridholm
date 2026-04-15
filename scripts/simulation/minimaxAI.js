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
import { shouldHoldCard, shouldHoldChampionAbility } from './cardHoldLogic.js';

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
// Max non-endTurn candidates retained after priority sort — keeps the tree tractable.
// Depth counts endTurns, not individual actions, so branching explodes within a turn;
// 6 candidates raises the search pool to include spells, unit actions, and summons
// alongside combat moves, at the cost of modestly higher compute (~2.25× tree vs 4).
const MAX_CANDIDATES = 6;

function actionPriority(action, state, enemyIdx, enemyChamp) {
  if (action.type === 'move') {
    const unit = state.units.find(u => u.uid === action.unitId);
    if (!unit) return 0;
    const [tr, tc] = action.targetTile;
    const hitsChamp = enemyChamp.row === tr && enemyChamp.col === tc;
    if (hitsChamp && unit.atk >= enemyChamp.hp) return 100; // lethal
    if (hitsChamp) return 80;                               // champion damage
    const eu = state.units.find(u => u.owner === enemyIdx && u.row === tr && u.col === tc);
    if (eu && unit.atk >= eu.hp) return 70;                 // kills enemy unit
    if (eu) return 50;                                       // damages enemy unit
    const curDist = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
    const newDist  = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
    if (newDist < curDist) return 30;                        // advances toward champion
    return 10;
  }
  if (action.type === 'cast')      return 40;
  if (action.type === 'unitAction') return 25;
  if (action.type === 'summon')     return 20;
  if (action.type === 'championMove') return 15;

  if (action.type === 'championAbility') {
    // Context-dependent priority — prevent champion ability spam in mid/late game.
    // Early (turns 1–8): normal, developing with the ability is fine.
    // Mid (turns 9–15): below summon priority — board development takes precedence.
    // Late (turns 16+): minimum — AI should be attacking and closing, not cycling abilities.
    // Closing condition (opp HP ≤ 15 AND 2+ combat units): minimum regardless of phase.
    const turn = state.turn ?? 0;
    const oppChampHP = enemyChamp.hp;
    const myIdx = 1 - enemyIdx; // ap is not in scope here; derive from enemyIdx
    const myFaction = state.champions[myIdx]?.attribute ?? null;
    const myCombatUnits = state.units.filter(u => u.owner === myIdx && !u.isRelic && !u.isOmen).length;
    // Mystic closing: no champion ability at all after turn 15 — must close the game
    if (myFaction === 'mystic' && turn >= 15) return 0;
    if (oppChampHP <= 15 && myCombatUnits >= 2) return 1; // closing — don't cycle abilities
    if (turn >= 16) return 1;                              // late game — minimum
    if (turn >= 9)  return 15;                             // mid game — below summon (20)
    return 35;                                             // early game — normal
  }

  // Mystic closing: boost advancing move priority after turn 13
  if (action.type === 'move') {
    const myIdx = 1 - enemyIdx;
    const myFaction = state.champions[myIdx]?.attribute ?? null;
    const turn = state.turn ?? 0;
    if (myFaction === 'mystic' && turn >= 13) {
      const unit = state.units.find(u => u.uid === action.unitId);
      if (unit) {
        const [tr, tc] = action.targetTile;
        const hitsChamp = enemyChamp.row === tr && enemyChamp.col === tc;
        if (hitsChamp && unit.atk >= enemyChamp.hp) return 100; // lethal
        if (hitsChamp) return 85;                               // champion attack — highest priority
        const curDist = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
        const newDist  = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
        if (newDist < curDist) return 45 + (unit.atk ?? 0);    // advance: high-ATK unit first
      }
    }
  }

  return 5;
}

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

  // Remove clearly bad moves first
  const candidate = actions.filter(action => {
    if (action.type === 'endTurn') return false; // handled separately below
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
        // Deduplicate: keep only one summon tile per card (closest to enemy champion)
        return true;
      }

      default:
        return true;
    }
  });

  // Deduplicate summons: one tile per card — the tile closest to the enemy champion
  const seenCardUids = new Set();
  let deduped = candidate.filter(action => {
    if (action.type !== 'summon') return true;
    if (seenCardUids.has(action.cardUid)) return false;
    seenCardUids.add(action.cardUid);
    return true;
  });

  // Mystic closing: completely exclude champion ability after turn 15
  // (actionPriority returns 0, but this ensures it never even enters candidate pools)
  const myFaction = state.champions[ap]?.attribute ?? null;
  const curTurn   = state.turn ?? 0;
  if (myFaction === 'mystic' && curTurn >= 15) {
    deduped = deduped.filter(a => a.type !== 'championAbility');
  }

  // Partition hold-list cards: they can only fill slots if nothing better exists.
  // This prevents the AI from playing Apex Rampage / Second Dawn / etc. before
  // their optimal conditions are met — but still allows it as a last resort.
  const isHeldAction = a => {
    if (a.type === 'championAbility') {
      return shouldHoldChampionAbility(state, ap);
    }
    if (a.type === 'cast' || a.type === 'summon') {
      const card = state.players[ap].hand.find(c => c.uid === a.cardUid);
      return card ? shouldHoldCard(card, state, ap) : false;
    }
    return false;
  };

  const primary = deduped.filter(a => !isHeldAction(a));
  const held    = deduped.filter(a => isHeldAction(a));

  // Sort both pools by descending priority
  const byPriority = (a, b) =>
    actionPriority(b, state, enemyIdx, enemyChamp) -
    actionPriority(a, state, enemyIdx, enemyChamp);

  primary.sort(byPriority);
  held.sort(byPriority);

  // Fill up to MAX_CANDIDATES: prefer primary, then held only if slots remain
  const primarySlice = primary.slice(0, MAX_CANDIDATES);
  const heldSlice    = held.slice(0, Math.max(0, MAX_CANDIDATES - primarySlice.length));

  return [...primarySlice, ...heldSlice, { type: 'endTurn' }];
}

// ── Minimax ───────────────────────────────────────────────────────────────────

// Bonus applied to positions where the searching player wins — ensures the AI
// always prefers a winning move over any other evaluation outcome.
const WIN_BONUS = 500;

function scoreState(gameState, playerId, weights) {
  const { over, winner } = isGameOver(gameState);
  const base = evaluateBoard(gameState, playerId, weights);
  if (over) {
    return winner === playerId ? base + WIN_BONUS : base - WIN_BONUS;
  }
  return base;
}

/**
 * Minimax search with alpha-beta pruning.
 *
 * Depth semantics: depth decrements by 1 on EVERY action (not just endTurn).
 * This prevents the tree from exploding when a player takes many sequential
 * actions per turn (summons, moves, spells). Perspective (maximizing/minimizing)
 * still only flips on endTurn, matching the two-player game structure.
 * At depth 0 the position is evaluated and returned immediately.
 *
 * @param {object}  gameState        - current game state
 * @param {number}  depth            - remaining action-depth to search
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
    return { score: scoreState(gameState, playerId, weights), action: null, timedOut: true };
  }

  const { over } = isGameOver(gameState);
  if (over || depth === 0) {
    return { score: scoreState(gameState, playerId, weights), action: null };
  }

  const rawActions = getLegalActions(gameState);
  const actions = filterActions(rawActions, gameState, commandsUsed);

  if (actions.length === 0) {
    return { score: scoreState(gameState, playerId, weights), action: null };
  }

  if (maximizingPlayer) {
    let best = { score: -Infinity, action: null };

    for (const action of actions) {
      const newState = applyAction(gameState, action);
      const isEndTurn = action.type === 'endTurn';

      // Depth decrements on every action; perspective flips only on endTurn.
      const nextDepth        = depth - 1;
      const nextMaximizing   = isEndTurn ? false : true;
      const nextCommandsUsed = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

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

      const nextDepth        = depth - 1;
      const nextMaximizing   = isEndTurn ? true : false;
      const nextCommandsUsed = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

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
 * @param {object}  [options]    - { depth: 8, weights: null }
 * @returns {object}              action object to apply
 */
export function chooseActionMinimax(gameState, commandsUsed = 0, options = {}) {
  const depth   = options.depth   ?? 4; // action-level depth (4 individual actions of lookahead)
  const weights = options.weights ?? undefined; // undefined → boardEval uses its own default

  const ap       = gameState.activePlayer;
  const playerId = ap === 0 ? 'p1' : 'p2';

  // ── Pre-check: lethal detection ─────────────────────────────────────────────
  // If any legal action wins the game immediately, take it without running minimax.
  const enemyIdx   = 1 - ap;
  const enemyChamp = gameState.champions[enemyIdx];
  const preActions = getLegalActions(gameState);

  for (const action of preActions) {
    if (action.type === 'move') {
      const unit = gameState.units.find(u => u.uid === action.unitId);
      if (
        unit &&
        action.targetTile[0] === enemyChamp.row &&
        action.targetTile[1] === enemyChamp.col &&
        unit.atk >= enemyChamp.hp
      ) {
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
    if (action.type === 'championMove') {
      const myChamp = gameState.champions[ap];
      if (
        action.row === enemyChamp.row &&
        action.col === enemyChamp.col &&
        (myChamp.atk ?? 0) >= enemyChamp.hp
      ) {
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
    if (action.type === 'cast') {
      const ns = applyAction(gameState, action);
      if (ns.winner) {
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
    if (action.type === 'championAbility') {
      // Check if applying the ability results in a win (handles future abilities that deal
      // direct champion damage; currently a forward-looking guard).
      const ns = applyAction(gameState, action);
      if (ns.winner) {
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
  }

  const deadline = { time: performance.now() + 5000 };

  const result = minimax(
    gameState, depth, -Infinity, Infinity,
    true, playerId, commandsUsed, weights, deadline
  );

  if (result.timedOut || result.action === null) {
    // Only log timeout warnings in browser environments to keep simulation output clean.
    if (result.timedOut && typeof window !== 'undefined') {
      console.warn('[minimaxAI] Search timed out — falling back to heuristic AI');
    }
    // Fallback to rules-based AI
    return chooseAction(gameState, commandsUsed);
  }

  return result.action;
}
