/**
 * minimaxAI.js
 *
 * Strategic AI using minimax search with alpha-beta pruning.
 *
 * Usage:
 *   import { chooseActionMinimax } from './minimaxAI.js';
 *   const action = chooseActionMinimax(gameState, commandsUsed, { depth: 2, weights: null });
 *
 * Options:
 *   depth      - uniform search depth (action-level). Default 4.
 *   weights    - explicit weight overrides for evaluateBoard. Null = auto-detect faction.
 *   depthTop   - search depth for top N_TOP candidates (selective deepening). Default 3.
 *   depthRest  - search depth for remaining candidates (selective deepening). Default 1.
 *               If either depthTop or depthRest is set, selective deepening is enabled.
 *               Pass --depth 2 with no depthTop/depthRest to use uniform depth (legacy).
 */

import { getLegalActions, applyAction, isGameOver } from './headlessEngine.js';
import { evaluateBoard } from './boardEval.js';
import { chooseAction } from './simAI.js';
import { manhattan } from '../../src/engine/gameEngine.js';
import { shouldHoldCard, shouldHoldChampionAbility } from './cardHoldLogic.js';

// Throne tile: center of the 5×5 board.
const THRONE_ROW = 2;
const THRONE_COL = 2;

// ── Zobrist Hashing ───────────────────────────────────────────────────────────

/**
 * Lazy Zobrist random-number table.
 * Maps arbitrary string keys to stable 32-bit unsigned integers.
 * Seeded with a fixed value so hashes are reproducible across runs.
 */
const _zobristTable = new Map();
let   _zobristSeed  = 0x9e3779b9; // fixed seed — reproducible

function _zobristRand() {
  // xorshift32 — fast, good avalanche, sufficient for a 32-bit Zobrist table
  _zobristSeed ^= _zobristSeed << 13;
  _zobristSeed ^= _zobristSeed >> 17;
  _zobristSeed ^= _zobristSeed << 5;
  return _zobristSeed >>> 0; // unsigned 32-bit
}

function _zn(key) {
  let v = _zobristTable.get(key);
  if (v === undefined) { v = _zobristRand(); _zobristTable.set(key, v); }
  return v;
}

/**
 * Compute a 32-bit Zobrist hash for a game state + commandsUsed context.
 *
 * Components hashed:
 *   - active player index
 *   - turn number
 *   - commandsUsed (affects which move actions are legal)
 *   - each unit: stable instance uid × tile index × current HP
 *   - each champion: player index × row × col × HP
 *   - each player's resource count
 *
 * The hash is XOR-based: each component XORs in a random table number, so
 * the order of units in the array does not affect the result.
 *
 * @param {object} state        - game state
 * @param {number} commandsUsed - unit-move commands used this turn (0–3)
 * @returns {number} 32-bit unsigned Zobrist hash
 */
function computeZobristHash(state, commandsUsed) {
  let h = 0;

  // Context components
  h ^= _zn(`ap:${state.activePlayer}`);
  h ^= _zn(`t:${state.turn ?? 0}`);
  h ^= _zn(`cmd:${commandsUsed ?? 0}`);

  // Units on board — uid is a stable instance ID for each unit across the game
  for (const unit of state.units) {
    h ^= _zn(`u:${unit.uid}:${unit.row * 5 + unit.col}:${Math.round(unit.hp ?? 0)}`);
  }

  // Champions — indexed by player (0=p1, 1=p2)
  for (let i = 0; i < state.champions.length; i++) {
    const c = state.champions[i];
    h ^= _zn(`c:${i}:${c.row}:${c.col}:${Math.round(c.hp ?? 0)}`);
  }

  // Player resources (mana) — determines which spells/summons are affordable
  for (let i = 0; i < state.players.length; i++) {
    h ^= _zn(`r:${i}:${state.players[i].resources ?? 0}`);
  }

  return h >>> 0; // ensure unsigned 32-bit
}

/**
 * Get the Zobrist hash for a state, caching the result on the state object.
 * Since applyAction always returns a new state object, each unique state
 * object computes its hash at most once.
 *
 * @param {object} state        - game state (may have _zh / _zhCmd cached)
 * @param {number} commandsUsed - unit-move commands used this turn
 * @returns {number} 32-bit unsigned Zobrist hash
 */
function getStateHash(state, commandsUsed) {
  const cmd = commandsUsed ?? 0;
  if (state._zh !== undefined && state._zhCmd === cmd) return state._zh;
  state._zh    = computeZobristHash(state, cmd);
  state._zhCmd = cmd;
  return state._zh;
}

// Board dimensions
const BOARD_SIZE = 5;

// Number of top-ranked candidates to search at full depthTop in selective deepening.
const N_TOP = 3;

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

// ── Move Ordering Heuristic ───────────────────────────────────────────────────

/**
 * Fast partial board evaluation for move ordering.
 * Computes only the 4 highest-weight eval terms to produce a good ordering
 * without the expense of a full evaluateBoard call per candidate.
 *
 * Terms (weights from WEIGHTS defaults):
 *   championHP              × 5
 *   unitCountDiff           × 8
 *   projectedChampionDamage × 20
 *   championSurroundPressure (internal weighting: kill-threat × 15/8, pin × 4)
 *
 * @param {object} state    - game state AFTER applying the candidate action
 * @param {string} playerId - 'p1' or 'p2' (the ordering player's perspective)
 * @returns {number}          heuristic ordering score (higher = better)
 */
function quickEvalOrder(state, playerId) {
  const ap = playerId === 'p1' ? 0 : 1;
  const op = 1 - ap;
  const myChamp  = state.champions[ap];
  const oppChamp = state.champions[op];
  const myUnits  = state.units.filter(u => u.owner === ap);
  const oppUnits = state.units.filter(u => u.owner === op);

  // Term 1: championHP (weight 5)
  const championHP = myChamp.hp * 5;

  // Term 2: unitCountDiff (weight 8)
  const unitCountDiff = (myUnits.length - oppUnits.length) * 8;

  // Term 3: projectedChampionDamage (weight 20)
  // Sum of ATK of friendly combat units with a clear cardinal line to the enemy champion.
  const myCombatUnits = myUnits.filter(u => !u.isRelic && !u.isOmen);
  let projectedDmg = 0;
  for (const u of myCombatUnits) {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    if (dist > (u.spd ?? 1)) continue;
    if (u.row === oppChamp.row) {
      const minC = Math.min(u.col, oppChamp.col);
      const maxC = Math.max(u.col, oppChamp.col);
      const blocked = state.units.some(
        other => other !== u && other.row === u.row && other.col > minC && other.col < maxC
      );
      if (!blocked) projectedDmg += (u.atk ?? 0);
    } else if (u.col === oppChamp.col) {
      const minR = Math.min(u.row, oppChamp.row);
      const maxR = Math.max(u.row, oppChamp.row);
      const blocked = state.units.some(
        other => other !== u && other.col === u.col && other.row > minR && other.row < maxR
      );
      if (!blocked) projectedDmg += (u.atk ?? 0);
    }
  }
  const projectedChampionDamage = projectedDmg * 20;

  // Term 4: championSurroundPressure
  // Kill-threat: (sumATK − oppHP) × 15 if lethal; × 8 if covering >half HP.
  // Pin-bonus: occupied adjacent tiles × 4 when ≥2 friendly units adjacent.
  const adjDirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const adjToOppChamp = adjDirs
    .map(([dr, dc]) => [oppChamp.row + dr, oppChamp.col + dc])
    .filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);
  const adjFriendlyUnits = myUnits.filter(u =>
    adjToOppChamp.some(([r, c]) => u.row === r && u.col === c)
  );
  const adjATKSum = adjFriendlyUnits.reduce((s, u) => s + (u.atk ?? 0), 0);
  const netKillPressure = adjATKSum - oppChamp.hp;
  let killThreatScore = 0;
  if (netKillPressure > 0) {
    killThreatScore = netKillPressure * 15;
  } else if (adjATKSum > oppChamp.hp / 2) {
    killThreatScore = adjATKSum * 8;
  }
  let pinBonus = 0;
  if (adjFriendlyUnits.length >= 2) {
    const emptyAdjTiles = adjToOppChamp.filter(([r, c]) =>
      !state.units.some(u => u.row === r && u.col === c) &&
      !(state.champions[0].row === r && state.champions[0].col === c) &&
      !(state.champions[1].row === r && state.champions[1].col === c)
    ).length;
    pinBonus = (adjToOppChamp.length - emptyAdjTiles) * 4;
  }
  const championSurroundPressure = killThreatScore + pinBonus;

  return championHP + unitCountDiff + projectedChampionDamage + championSurroundPressure;
}

/**
 * Sort filtered candidates by lightweight heuristic score for better alpha-beta pruning.
 * endTurn actions are always sorted last — they gain no positional advantage.
 * The non-endTurn candidates are scored by applying each action and calling quickEvalOrder
 * on the resulting state, so the best-looking moves are searched first.
 *
 * Returns a new sorted array { sorted, scores } where:
 *   sorted: action[] in descending order (endTurn last)
 *   scores: Map<action, number> with the ordering score for each action
 *
 * @param {object[]} actions  - filtered candidates from filterActions
 * @param {object}   state    - current game state (before applying actions)
 * @param {string}   playerId - 'p1' or 'p2'
 * @returns {{ sorted: object[], scores: Map }}
 */
function orderActions(actions, state, playerId) {
  const endTurns   = actions.filter(a => a.type === 'endTurn');
  const candidates = actions.filter(a => a.type !== 'endTurn');

  const scores = new Map();
  for (const action of candidates) {
    const ns = applyAction(state, action);
    scores.set(action, quickEvalOrder(ns, playerId));
  }

  // Sort descending: best first (alpha-beta prunes more when high-scoring moves searched first)
  const sorted = [...candidates].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));

  return { sorted: [...sorted, ...endTurns], scores };
}

// ── Killer Move Heuristic ─────────────────────────────────────────────────────

/**
 * Check if a candidate action matches a stored killer move entry.
 * Matching on action type and primary target identity.
 */
function matchesKiller(action, killer) {
  if (!killer || action.type !== killer.type) return false;
  switch (action.type) {
    case 'move':
      return action.unitId === killer.unitId &&
             action.targetTile?.[0] === killer.targetTile?.[0] &&
             action.targetTile?.[1] === killer.targetTile?.[1];
    case 'cast':
    case 'summon':
      return action.cardUid === killer.cardUid;
    case 'championMove':
      return action.row === killer.row && action.col === killer.col;
    case 'championAbility':
    case 'endTurn':
      return true; // type match sufficient for these singletons
    default:
      return false;
  }
}

/**
 * Encode just the identifying fields of a killer action.
 */
function encodeKiller(action) {
  return {
    type:       action.type,
    unitId:     action.unitId,
    targetTile: action.targetTile,
    cardUid:    action.cardUid,
    row:        action.row,
    col:        action.col,
  };
}

/**
 * Record a killer move at the given search depth.
 * Stores up to 2 killers per depth; replaces the oldest on overflow.
 * endTurn cutoffs are ignored (not meaningful killers).
 *
 * @param {object} killers - mutable killer table: { [depth]: encoded[] }
 * @param {number} depth   - current search depth
 * @param {object} action  - the action that caused the cutoff
 */
function recordKiller(killers, depth, action) {
  if (action.type === 'endTurn') return;
  if (!killers[depth]) killers[depth] = [];
  const slot = killers[depth];
  // Avoid duplicate entries
  if (slot.some(k => matchesKiller(action, k))) return;
  if (slot.length >= 2) slot.shift(); // evict oldest
  slot.push(encodeKiller(action));
}

/**
 * Promote known killer moves to the front of the action list.
 * Candidates that match a killer at this depth are tried before heuristic-sorted moves,
 * improving alpha-beta pruning at sibling nodes.
 *
 * @param {object[]} actions - move-ordered action list
 * @param {object}   killers - killer table
 * @param {number}   depth   - current search depth
 * @returns {object[]}         action list with killers promoted to front
 */
function applyKillers(actions, killers, depth) {
  const killerList = killers[depth] ?? [];
  if (killerList.length === 0) return actions;

  const killerMatches = [];
  const rest = [];
  for (const action of actions) {
    if (killerList.some(k => matchesKiller(action, k))) {
      killerMatches.push(action);
    } else {
      rest.push(action);
    }
  }
  return [...killerMatches, ...rest];
}

// ── Transposition Table ───────────────────────────────────────────────────────

const TT_EXACT = 0; // stored score is exact minimax value
const TT_LOWER = 1; // stored score is a lower bound (beta cutoff — value could be higher)
const TT_UPPER = 2; // stored score is an upper bound (failed all moves — value could be lower)

// Maximum number of entries before new entries are dropped (existing entries still replaced).
const TT_MAX_SIZE = 1_000_000;

/**
 * Look up a position in the transposition table.
 *
 * Returns one of:
 *   { score: number, action: object|null } — a usable score (exact or applicable bound)
 *   { score: null,   action: object|null } — entry exists but score can't be used; action
 *                                            is still returned for move ordering
 *   null                                  — no entry at all
 *
 * @param {Map}    tt    - transposition table
 * @param {number} hash  - Zobrist hash of the position
 * @param {number} depth - remaining depth at this node (must be <= entry depth to use score)
 * @param {number} alpha - current alpha bound
 * @param {number} beta  - current beta bound
 */
function ttLookup(tt, hash, depth, alpha, beta) {
  const e = tt.get(hash);
  if (!e) return null;

  if (e.depth >= depth) {
    if (e.flag === TT_EXACT)                       return { score: e.score, action: e.action };
    if (e.flag === TT_LOWER && e.score >= beta)    return { score: e.score, action: e.action };
    if (e.flag === TT_UPPER && e.score <= alpha)   return { score: e.score, action: e.action };
  }

  // Entry exists but its score can't be used directly — action still helps move ordering.
  return { score: null, action: e.action };
}

/**
 * Store a result in the transposition table.
 * Replace strategy: always replace if the new entry has depth ≥ existing entry.
 * At capacity (TT_MAX_SIZE): only replace existing entries, never add new ones.
 *
 * @param {Map}         tt      - transposition table
 * @param {number}      hash    - Zobrist hash
 * @param {number}      depth   - remaining depth at the time of storage
 * @param {number}      score   - minimax score
 * @param {number}      flag    - TT_EXACT | TT_LOWER | TT_UPPER
 * @param {object|null} action  - best action found at this node (for move ordering)
 */
function ttStore(tt, hash, depth, score, flag, action) {
  const e = tt.get(hash);
  if (e && e.depth > depth) return; // keep deeper entry; shallower one is less valuable
  if (tt.size >= TT_MAX_SIZE && !e) return; // at capacity; only replace existing entries
  tt.set(hash, { depth, score, flag, action });
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
 * Minimax search with alpha-beta pruning, move ordering, killer heuristic,
 * and transposition table.
 *
 * Depth semantics: depth decrements by 1 on EVERY action (not just endTurn).
 * This prevents the tree from exploding when a player takes many sequential
 * actions per turn (summons, moves, spells). Perspective (maximizing/minimizing)
 * still only flips on endTurn, matching the two-player game structure.
 * At depth 0 the position is evaluated and returned immediately.
 *
 * Move ordering (highest-priority to lowest):
 *   1. TT best action — move found best at a previous search of this position
 *   2. Killer moves   — moves that caused cutoffs at this depth in sibling nodes
 *   3. Heuristic sort — quickEvalOrder (lightweight 4-term eval)
 *
 * Transposition table: positions are hashed with Zobrist. Results are stored
 * with exact/lower/upper bound flags and reused across iterations of iterative
 * deepening. Actions from TT entries are used for move ordering even when the
 * stored score cannot be directly applied.
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
 * @param {object}  killers          - killer move table: { [depth]: encoded[] }
 * @param {Map}     tt               - transposition table (shared across ID iterations)
 * @param {object}  stats            - mutable stats: { ttLookups, ttHits }
 * @returns {{ score: number, action: object|null, timedOut?: true }}
 */
function minimax(gameState, depth, alpha, beta, maximizingPlayer, playerId, commandsUsed, weights, deadline, killers, tt, stats) {
  // Timeout check: abort and signal with a sentinel value
  if (performance.now() > deadline.time) {
    return { score: scoreState(gameState, playerId, weights), action: null, timedOut: true };
  }

  const { over } = isGameOver(gameState);
  if (over || depth === 0) {
    return { score: scoreState(gameState, playerId, weights), action: null };
  }

  // ── Transposition table lookup ────────────────────────────────────────────
  const hash      = getStateHash(gameState, commandsUsed);
  const ttResult  = ttLookup(tt, hash, depth, alpha, beta);
  stats.ttLookups++;

  if (ttResult !== null && ttResult.score !== null) {
    // Exact score or applicable bound — can return directly.
    stats.ttHits++;
    return { score: ttResult.score, action: ttResult.action };
  }

  // TT action for move ordering (may be null if no TT entry exists).
  const ttBestAction = ttResult?.action ?? null;

  const rawActions = getLegalActions(gameState);
  const filtered = filterActions(rawActions, gameState, commandsUsed);

  if (filtered.length === 0) {
    return { score: scoreState(gameState, playerId, weights), action: null };
  }

  // ── Move ordering (priority: TT best → killers → heuristic) ──────────────
  const orderingPlayer = gameState.activePlayer === 0 ? 'p1' : 'p2';
  const { sorted: heuristic } = orderActions(filtered, gameState, orderingPlayer);

  // Apply killers first (bumps them above heuristic sort).
  const afterKillers = applyKillers(heuristic, killers, depth);

  // Promote TT best action to absolute front (above killers).
  let actions = afterKillers;
  if (ttBestAction) {
    const idx = actions.findIndex(a => matchesKiller(a, ttBestAction));
    if (idx > 0) {
      actions = [actions[idx], ...actions.slice(0, idx), ...actions.slice(idx + 1)];
    }
  }

  const originalAlpha = alpha;

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
        nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, stats
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
      if (beta <= alpha) {
        recordKiller(killers, depth, action); // beta cutoff — record killer
        ttStore(tt, hash, depth, best.score, TT_LOWER, action);
        break;
      }
    }

    // Store in TT after full search (no cutoff path)
    if (best.score > originalAlpha) {
      ttStore(tt, hash, depth, best.score, TT_EXACT, best.action);
    } else {
      ttStore(tt, hash, depth, best.score, TT_UPPER, best.action);
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
        nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, stats
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
      if (beta <= alpha) {
        recordKiller(killers, depth, action); // alpha cutoff — record killer
        ttStore(tt, hash, depth, best.score, TT_UPPER, action);
        break;
      }
    }

    // Store exact result after full minimizer search (no cutoff)
    ttStore(tt, hash, depth, best.score, TT_EXACT, best.action);
    return best;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Choose the best action using minimax search with alpha-beta pruning.
 * Falls back to the heuristic AI from simAI.js if no action is found.
 *
 * Search improvements:
 *   1. Move ordering — TT best action first, then killer moves, then heuristic sort.
 *   2. Killer heuristic — moves that caused cutoffs are tried first at sibling nodes.
 *   3. Transposition table — positions hashed with Zobrist; results cached and reused.
 *      Table is fresh per AI decision, shared across iterative deepening iterations.
 *
 * @param {object}  gameState    - current game state
 * @param {number}  commandsUsed - move actions already taken this turn (0–3)
 * @param {object}  [options]    - { depth, weights, stats }
 *   depth   - max depth cap for iterative deepening (default 20; time budget governs in practice)
 *   weights - explicit weight overrides for evaluateBoard (null = auto-detect faction)
 *   stats   - optional mutable accumulator: { ttLookups, ttHits, depthReached, ttSize, decisions }
 * @returns {object} action object to apply
 */
export function chooseActionMinimax(gameState, commandsUsed = 0, options = {}) {
  const maxDepth = options.depth   ?? 20; // cap for safety; time budget governs in practice
  const weights  = options.weights ?? undefined;

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
      const ns = applyAction(gameState, action);
      if (ns.winner) {
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
  }

  // Fresh TT and killers per AI decision.
  // TT is shared across iterative deepening iterations so depth-N results seed
  // move ordering for depth-(N+1).
  const tt      = new Map();
  const killers = {};
  const localStats = { ttLookups: 0, ttHits: 0 };

  // ── Iterative deepening search ────────────────────────────────────────────────
  // Delegate to the caller-owned deadline via options.deadline if provided
  // (used internally for consistency with time budget).
  const deadline = options._deadline ?? { time: performance.now() + 5000 };

  let bestAction    = null;
  let depthReached  = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() >= deadline.time) break;

    const result = minimax(
      gameState, depth, -Infinity, Infinity,
      true, playerId, commandsUsed, weights, deadline, killers, tt, localStats
    );

    if (result.timedOut) {
      // Incomplete iteration — keep the best from the last complete iteration.
      // If we have no best yet (depth=1 timed out), use this partial result.
      if (bestAction === null && result.action !== null) {
        bestAction   = result.action;
        depthReached = depth;
      }
      break;
    }

    if (result.action !== null) {
      bestAction   = result.action;
      depthReached = depth;
    }
  }

  // Accumulate into caller-owned stats object if provided.
  if (options.stats) {
    options.stats.ttLookups   = (options.stats.ttLookups   ?? 0) + localStats.ttLookups;
    options.stats.ttHits      = (options.stats.ttHits      ?? 0) + localStats.ttHits;
    options.stats.depthSum    = (options.stats.depthSum    ?? 0) + depthReached;
    options.stats.ttSizeSum   = (options.stats.ttSizeSum   ?? 0) + tt.size;
    options.stats.decisions   = (options.stats.decisions   ?? 0) + 1;
  }

  return bestAction ?? chooseAction(gameState, commandsUsed);
}
