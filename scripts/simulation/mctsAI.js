/**
 * mctsAI.js
 *
 * Monte Carlo Tree Search AI for simulation.
 *
 * Step 1: randomRollout(state, playerIdx, maxTurns) → 'win' | 'loss'
 *   Plays random legal actions from the given state until the game ends or
 *   maxTurns additional turns have elapsed. Draws count as losses.
 *
 * Step 2: chooseActionMCTS(state, options) → action
 *   Flat MCTS with UCB1 selection over the immediate legal actions.
 *
 * Step 3: biasedRollout(state, playerIdx, maxTurns, policy) + DEFAULT_POLICY
 *   Weighted-random rollout that biases action selection toward aggressive play.
 *
 * Export summary:
 *   randomRollout(state, playerIdx, maxTurns)
 *   biasedRollout(state, playerIdx, maxTurns, policy)
 *   chooseActionMCTS(state, options)
 *   DEFAULT_POLICY
 */

import { getLegalActions, applyAction, isGameOver } from './headlessEngine.js';
import { manhattan } from '../../src/engine/gameEngine.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// Safety valve: max actions per rollout regardless of turn count.
const MAX_ROLLOUT_ACTIONS = 400;

// Exploration constant for UCB1 (√2 ≈ 1.414).
const UCB1_C = 1.414;

// MCTS timeout: stop iterating after this many ms and return best found so far.
const MCTS_TIMEOUT_MS = 10_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert playerIdx (0 or 1) to the 'p1'/'p2' winner string used by isGameOver.
 */
function playerIdxToStr(playerIdx) {
  return playerIdx === 0 ? 'p1' : 'p2';
}

/**
 * Return the Manhattan distance from a unit/champion at [r, c] to the enemy
 * champion, or Infinity if the champion is not on the board.
 */
function distToEnemyChamp(state, row, col, ownerIdx) {
  const enemyChamp = state.champions[1 - ownerIdx];
  if (enemyChamp == null) return Infinity;
  return manhattan([row, col], [enemyChamp.row, enemyChamp.col]);
}

// ── Step 1: Random Rollout ────────────────────────────────────────────────────

/**
 * Play random legal actions from `state` until the game ends or `maxTurns`
 * additional turns have elapsed. Returns 'win' or 'loss' from `playerIdx`'s
 * perspective. Draws (turn limit reached) are counted as losses.
 *
 * @param {object} state      - current game state (not mutated)
 * @param {number} playerIdx  - 0 (P1) or 1 (P2): whose perspective to report
 * @param {number} [maxTurns=30] - max additional turns before declaring a draw/loss
 * @returns {'win' | 'loss'}
 */
export function randomRollout(state, playerIdx, maxTurns = 30) {
  const winnerStr  = playerIdxToStr(playerIdx);
  const turnLimit  = (state.turn ?? 0) + maxTurns;
  let actionCount  = 0;

  while (actionCount < MAX_ROLLOUT_ACTIONS) {
    // Check win/loss condition.
    const { over, winner } = isGameOver(state);
    if (over) {
      return winner === winnerStr ? 'win' : 'loss';
    }

    // Check turn limit (draw = loss).
    if ((state.turn ?? 0) >= turnLimit) {
      return 'loss';
    }

    const actions = getLegalActions(state);
    if (actions.length === 0) {
      // No legal actions and game not over — treat as loss.
      return 'loss';
    }

    // Uniform random action selection.
    const action = actions[Math.floor(Math.random() * actions.length)];
    state = applyAction(state, action);
    actionCount++;
  }

  // Action-count safety limit hit — treat as loss.
  return 'loss';
}

// ── Step 3: Biased Rollout Policy ────────────────────────────────────────────

/**
 * Default policy weights for biased rollouts.
 * Each multiplier scales the probability of selecting that action type.
 * Values >1 increase selection probability; <1 decrease it.
 */
export const DEFAULT_POLICY = {
  attackChampionBias:       3.0,  // attack the enemy champion
  attackUnitBias:           1.5,  // attack an enemy unit
  playCardBias:             1.2,  // play a card from hand (summon or cast)
  moveTowardChampionBias:   1.3,  // move a unit closer to the enemy champion
  moveAwayBias:             0.3,  // move a unit further from the enemy champion
  endTurnBias:              0.5,  // end turn early (discourage passivity)
  useAbilityBias:           1.5,  // use a unit or champion ability
};

/**
 * Classify an action and return the policy bias multiplier for it.
 * Uses the most specific applicable category.
 */
function actionBias(action, state, policy) {
  const ap = state.activePlayer;
  const enemyChamp = state.champions[1 - ap];

  switch (action.type) {
    case 'move': {
      const unit = state.units.find(u => u.uid === action.unitId);
      if (!unit) return 1.0;
      const [tr, tc] = action.targetTile;

      // Attacking the enemy champion?
      if (enemyChamp && enemyChamp.row === tr && enemyChamp.col === tc) {
        return policy.attackChampionBias;
      }
      // Attacking an enemy unit?
      const targetUnit = state.units.find(u => u.owner === (1 - ap) && u.row === tr && u.col === tc);
      if (targetUnit) {
        return policy.attackUnitBias;
      }
      // Moving toward or away from enemy champion?
      if (enemyChamp) {
        const curDist = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
        const newDist = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
        if (newDist < curDist) return policy.moveTowardChampionBias;
        if (newDist > curDist) return policy.moveAwayBias;
      }
      return 1.0; // lateral move — neutral
    }

    case 'championMove': {
      // Champion advancing toward enemy champion is modestly positive.
      if (!enemyChamp) return 1.0;
      const myChamp = state.champions[ap];
      if (!myChamp) return 1.0;
      const curDist = manhattan([myChamp.row, myChamp.col], [enemyChamp.row, enemyChamp.col]);
      const newDist = manhattan([action.row, action.col], [enemyChamp.row, enemyChamp.col]);
      if (newDist < curDist) return policy.moveTowardChampionBias;
      if (newDist > curDist) return policy.moveAwayBias;
      return 1.0;
    }

    case 'summon':
    case 'cast':
    case 'terrain':
      return policy.playCardBias;

    case 'championAbility':
    case 'unitAction':
      return policy.useAbilityBias;

    case 'endTurn':
      return policy.endTurnBias;

    case 'fleshtitheSacrifice':
    case 'handSelect':
    case 'pendingSpellTarget':
      return 1.0; // forced choices — uniform

    default:
      return 1.0;
  }
}

/**
 * Like randomRollout but uses weighted-random action selection guided by
 * `policy`. The policy biases the rollout toward aggressive, game-closing play
 * without being deterministic.
 *
 * @param {object} state
 * @param {number} playerIdx
 * @param {number} [maxTurns=30]
 * @param {object} [policy=DEFAULT_POLICY]
 * @returns {'win' | 'loss'}
 */
export function biasedRollout(state, playerIdx, maxTurns = 30, policy = DEFAULT_POLICY) {
  const winnerStr  = playerIdxToStr(playerIdx);
  const turnLimit  = (state.turn ?? 0) + maxTurns;
  let actionCount  = 0;

  while (actionCount < MAX_ROLLOUT_ACTIONS) {
    const { over, winner } = isGameOver(state);
    if (over) {
      return winner === winnerStr ? 'win' : 'loss';
    }
    if ((state.turn ?? 0) >= turnLimit) {
      return 'loss';
    }

    const actions = getLegalActions(state);
    if (actions.length === 0) return 'loss';

    // Compute weights.
    const weights = actions.map(a => actionBias(a, state, policy));
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    // Weighted random selection.
    let r = Math.random() * totalWeight;
    let chosen = actions[actions.length - 1]; // fallback
    for (let i = 0; i < actions.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = actions[i]; break; }
    }

    state = applyAction(state, chosen);
    actionCount++;
  }

  return 'loss';
}

// ── Step 2: Flat MCTS with UCB1 ───────────────────────────────────────────────

/**
 * Choose an action using flat MCTS with UCB1 selection and biased rollouts.
 *
 * Options:
 *   simulations  {number}  - rollouts per decision (default 200)
 *   maxRolloutTurns {number} - max turns per rollout (default 30)
 *   policy       {object}  - rollout policy (default DEFAULT_POLICY)
 *                            Pass null to use uniform random rollouts.
 *
 * @param {object} state
 * @param {object} [options]
 * @returns {object} action
 */
export function chooseActionMCTS(state, options = {}) {
  const {
    simulations    = 200,
    maxRolloutTurns = 30,
    policy          = DEFAULT_POLICY,
  } = options;

  const playerIdx = state.activePlayer; // 0 or 1
  const winnerStr = playerIdxToStr(playerIdx);
  const rolloutFn = policy
    ? (s) => biasedRollout(s, playerIdx, maxRolloutTurns, policy)
    : (s) => randomRollout(s, playerIdx, maxRolloutTurns);

  const actions = getLegalActions(state);

  // Trivial cases.
  if (actions.length === 0) return { type: 'endTurn' };
  if (actions.length === 1) return actions[0];

  // Immediate lethal check: if any action ends the game as a win, take it.
  for (const action of actions) {
    const next = applyAction(state, action);
    const { over, winner } = isGameOver(next);
    if (over && winner === winnerStr) return action;
  }

  // Initialize nodes — one per legal action.
  const nodes = actions.map(action => ({
    action,
    wins:   0,
    visits: 0,
  }));

  let totalVisits = 0;
  const deadline  = Date.now() + MCTS_TIMEOUT_MS;

  for (let sim = 0; sim < simulations; sim++) {
    if (Date.now() >= deadline) break;

    // UCB1 selection: prefer unvisited nodes first, then maximize UCB1 score.
    let best     = null;
    let bestScore = -Infinity;
    for (const node of nodes) {
      let score;
      if (node.visits === 0) {
        score = Infinity; // always visit unvisited nodes first
      } else {
        const exploitation = node.wins / node.visits;
        const exploration  = UCB1_C * Math.sqrt(Math.log(totalVisits) / node.visits);
        score = exploitation + exploration;
      }
      if (score > bestScore) { bestScore = score; best = node; }
    }

    // Apply selected action and rollout.
    const nextState = applyAction(state, best.action);
    const outcome   = rolloutFn(nextState);

    best.visits++;
    if (outcome === 'win') best.wins++;
    totalVisits++;
  }

  // Return the action with the highest win rate (exploitation only, no exploration).
  let bestNode = nodes[0];
  for (const node of nodes) {
    const wr = node.visits > 0 ? node.wins / node.visits : 0;
    const br = bestNode.visits > 0 ? bestNode.wins / bestNode.visits : 0;
    if (wr > br) bestNode = node;
  }

  return bestNode.action;
}
