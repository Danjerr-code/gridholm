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
import { getCardRating } from '../../src/engine/cardThreatRatings.js';

// Throne tile: center of the 5×5 board.
const THRONE_ROW = 2;
const THRONE_COL = 2;

// ── Spell Value Ratings ───────────────────────────────────────────────────────

/**
 * Intrinsic spell value for move ordering and eval bonuses.
 * Represents value not captured by post-cast board state changes:
 *   - Card selection/draw (future decision quality)
 *   - Permanent stat buffs (compounding over turns)
 *   - Shields/protection (prevents loss not visible in HP)
 *   - Board-wide buffs (multiple units affected)
 *
 * Damage spells (smite, crushingblow, gore, etc.) get low values (2–3)
 * because their effect IS visible in post-cast HP diff (Fix 3 handles AOE).
 */
const SPELL_VALUES = {
  // Card draw / knowledge
  glimpse:           3,
  // Permanent stat buffs
  forgeweapon:       6,
  forge_weapon:      6,  // alternate id
  savagegrowth:      5,  // +2/+2 permanent
  angelicblessing:   7,  // +4/+4 permanent + spell immunity
  // Temporary unit buffs (turn-limited)
  standfirm:         4,
  animus:            3,
  fortify:           4,
  // Board-wide buffs
  rally:             6,
  crusade:           8,
  packhowl:          7,
  // Champion / unit shields
  ironshield:        5,
  ironthorns:        5,
  // Crowd control / debuff
  martiallaw:        7,
  martial_law:       7,  // alternate id
  predatorsmark:     5,
  entangle:          4,
  petrify:           5,
  dominate:          6,
  mindseize:         5,
  shadowveil:        4,
  // Healing (already partially scored by championHP/healingValue eval terms)
  bloom:             2,
  overgrowth:        2,
  moonleaf:          2,
  ancientspring:     2,
  verdantsurge:      3,
  glitteringgift:    2,
  recall:            2,
  shadow_mend:       2,
  // Summon-generating spells
  callofthesnakes:   5,
  grave_harvest:     4,
  // Resurrection / revival
  seconddawn:        6,
  rebirth:           5,
  // Direct damage spells — damage IS captured by Fix 3 HP-diff tracking
  smite:             2,
  crushingblow:      2,
  gore:              2,
  spiritbolt:        2,
  pounce:            2,
  ambush:            3,
  pestilence:        3,
  toxic_spray:       3,
  moonfire:          3,
  arcane_barrage:    3,
  plague_swarm:      4,
  agonizingsymphony: 4,
  // Utility / other
  gildedcage:        5,
  devour:            4,
  souldrain:         4,
  drain_life:        3,
  void_siphon:       3,
  infernalpact:      4,
  pactofruin:        4,
  darksentence:      4,
  finalexchange:     5,
  repel:             3,
  fatesledger:       3,
  tollofshadows:     3,
  bloodoffering:     4,
  echo_spell:        4,
  amethystcache:     3,
  // On-hold high-value spells
  apexrampage:       7,
  // New set spells
  consecrated_ground:  5,
  consecrating_strike: 4,
  divine_judgment:     5,
  fortify_the_crown:   5,
  oath_of_valor:       5,
  royal_decree:        4,
  thrones_judgment:    5,
};

/**
 * Returns the spellValue for a card that is about to be cast.
 * Looks up the card in the active player's hand by cardUid, then maps
 * the card's id through SPELL_VALUES.
 *
 * @param {string} cardUid  - the uid of the card being cast
 * @param {object} state    - current game state (before applying the cast)
 * @param {number} ap       - active player index (0 or 1)
 * @returns {number}          spell value (0 if not found)
 */
function getSpellValue(cardUid, state, ap) {
  const card = state.players[ap].hand.find(c => c.uid === cardUid);
  if (!card) return 0;
  return SPELL_VALUES[card.id] ?? 0;
}

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

  // Spell insurance: if no cast action made the top candidates, inject the highest-value
  // spell so the minimax tree always explores at least one casting option.
  // Dedup by card id: pick one representative cast action per unique spell (highest spellValue).
  const alreadyHasSpell = primarySlice.some(a => a.type === 'cast') || heldSlice.some(a => a.type === 'cast');
  let extraSpells = [];
  if (!alreadyHasSpell) {
    const allCasts = [...primary, ...held].filter(a => a.type === 'cast');
    // Group by card id (one representative per spell)
    const bestBySpell = new Map(); // cardId → { action, spellValue }
    for (const a of allCasts) {
      const sv   = getSpellValue(a.cardUid, state, ap);
      const card = state.players[ap].hand.find(c => c.uid === a.cardUid);
      const cid  = card?.id ?? a.cardUid;
      const prev = bestBySpell.get(cid);
      if (!prev || sv > prev.spellValue) bestBySpell.set(cid, { action: a, spellValue: sv });
    }
    // Add up to 2 highest-value spell candidates
    const ranked = [...bestBySpell.values()].sort((x, y) => y.spellValue - x.spellValue);
    extraSpells = ranked.slice(0, 2).map(e => e.action);
  }

  return [...primarySlice, ...heldSlice, ...extraSpells, { type: 'endTurn' }];
}

// ── Capture Detection ─────────────────────────────────────────────────────────

/**
 * Returns true if the action is a capture (attacks an enemy unit or champion).
 * Used to separate captures from quiet moves for history heuristic and quiescence.
 */
function isCapture(action, state) {
  const ap        = state.activePlayer;
  const enemyIdx  = 1 - ap;
  const enemyChamp = state.champions[enemyIdx];

  if (action.type === 'move') {
    const [tr, tc] = action.targetTile;
    if (enemyChamp.row === tr && enemyChamp.col === tc) return true;
    return state.units.some(u => u.owner === enemyIdx && u.row === tr && u.col === tc);
  }
  if (action.type === 'championMove') {
    if (enemyChamp.row === action.row && enemyChamp.col === action.col) return true;
    return state.units.some(u => u.owner === enemyIdx && u.row === action.row && u.col === action.col);
  }
  return false;
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

  // Term 5: cardsInHand (weight 10, matching boardEval WEIGHTS)
  const cardsInHand = (state.players[ap].hand?.length ?? 0) * 10;

  return championHP + unitCountDiff + projectedChampionDamage + championSurroundPressure + cardsInHand;
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

  const ap = state.activePlayer;
  const scores = new Map();
  for (const action of candidates) {
    const ns = applyAction(state, action);
    let score = quickEvalOrder(ns, playerId);
    // Fix 2: bias move ordering toward spell casts by adding intrinsic spell value
    if (action.type === 'cast') {
      score += getSpellValue(action.cardUid, state, ap) * 2;
    }
    scores.set(action, score);
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

// ── History Heuristic ─────────────────────────────────────────────────────────

/**
 * History table: 25×25 for tile-to-tile moves (row*5+col, 0-24),
 * plus a per-action-type table for non-tile actions.
 * Reset at the start of each root decision.
 */
const HISTORY_ACTION_KEYS = ['cast', 'summon', 'championMove', 'championAbility', 'unitAction', 'endTurn'];
const HISTORY_ACTION_IDX  = Object.fromEntries(HISTORY_ACTION_KEYS.map((k, i) => [k, i]));

function makeHistoryTables() {
  return {
    tileMoves: Array.from({ length: 25 }, () => new Float64Array(25)),
    types:     new Float64Array(HISTORY_ACTION_KEYS.length),
  };
}

/**
 * Stockfish gravity update: h += bonus - h * |bonus| / 16384.
 * Keeps values bounded; prevents saturation.
 */
function _historyApply(arr, idx, bonus) {
  arr[idx] = arr[idx] + bonus - arr[idx] * Math.abs(bonus) / 16384;
}

function historyScore(history, action, state) {
  if (action.type === 'move') {
    const unit = state.units.find(u => u.uid === action.unitId);
    if (unit) {
      const from = unit.row * 5 + unit.col;
      const to   = action.targetTile[0] * 5 + action.targetTile[1];
      return history.tileMoves[from][to];
    }
  }
  if (action.type === 'championMove') {
    const ap    = state.activePlayer;
    const champ = state.champions[ap];
    const from  = champ.row * 5 + champ.col;
    const to    = action.row  * 5 + action.col;
    return history.tileMoves[from][to];
  }
  const idx = HISTORY_ACTION_IDX[action.type] ?? 0;
  return history.types[idx];
}

function historyRecord(history, action, state, bonus) {
  if (action.type === 'move') {
    const unit = state.units.find(u => u.uid === action.unitId);
    if (unit) {
      const from = unit.row * 5 + unit.col;
      const to   = action.targetTile[0] * 5 + action.targetTile[1];
      _historyApply(history.tileMoves[from], to, bonus);
      return;
    }
  }
  if (action.type === 'championMove') {
    const ap    = state.activePlayer;
    const champ = state.champions[ap];
    const from  = champ.row * 5 + champ.col;
    const to    = action.row  * 5 + action.col;
    _historyApply(history.tileMoves[from], to, bonus);
    return;
  }
  const idx = HISTORY_ACTION_IDX[action.type] ?? 0;
  _historyApply(history.types, idx, bonus);
}

// ── Quiescence Search ─────────────────────────────────────────────────────────

const Q_MAX_DEPTH    = 12;  // cap at 12 plies to prevent explosion
const Q_DELTA_MARGIN = 200; // safety margin for delta pruning

/**
 * Generate capture-only move candidates for quiescence search (Option B: champion-focused).
 * Includes only champion-critical moves:
 *   1. Any unit attack on the enemy champion directly
 *   2. Kill-eligible unit attack on an attacking enemy unit adjacent to the friendly champion (defensive)
 *   3. Any champion attack on the enemy champion
 *
 * Champion escape moves are excluded: they create mutual-escape cycles where both AIs
 * perpetually retreat from danger, resulting in 100% draw rates. Static eval handles
 * champion safety via championHP and lethalThreat weights.
 *
 * General unit-vs-unit trades are excluded — static eval handles those.
 * Sorted by MVV-LVA: highest (victimThreat - attackerAlly*0.1) first.
 */
function generateCaptures(state, ap) {
  const enemyIdx   = 1 - ap;
  const myChamp    = state.champions[ap];
  const enemyChamp = state.champions[enemyIdx];
  const captures   = [];
  const dirs       = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const unit of state.units) {
    if (unit.owner !== ap) continue;
    if (unit.isRelic || unit.isOmen) continue;
    const atk = unit.atk ?? 0;

    for (const [dr, dc] of dirs) {
      const tr = unit.row + dr;
      const tc = unit.col + dc;
      if (tr < 0 || tr >= 5 || tc < 0 || tc >= 5) continue;

      // 1. Any unit attack on the enemy champion
      if (enemyChamp.row === tr && enemyChamp.col === tc) {
        captures.push({
          type: 'move', unitId: unit.uid, targetTile: [tr, tc],
          _victimThreat: 300,
          _attackerAlly: getCardRating(unit.id, 'ally', unit.cost ?? 4),
        });
        continue;
      }

      // 2. Defensive: kill an attacking enemy unit adjacent to the friendly champion
      const enemy = state.units.find(u => u.owner === enemyIdx && !u.isRelic && !u.isOmen && u.row === tr && u.col === tc);
      if (enemy && atk >= (enemy.hp ?? 0)) {
        const threatsMyChamp = dirs.some(([ddr, ddc]) =>
          myChamp.row + ddr === enemy.row && myChamp.col + ddc === enemy.col
        );
        if (threatsMyChamp) {
          captures.push({
            type: 'move', unitId: unit.uid, targetTile: [tr, tc],
            _victimThreat: getCardRating(enemy.id, 'threat', enemy.cost ?? 4),
            _attackerAlly: getCardRating(unit.id,  'ally',   unit.cost  ?? 4),
          });
        }
      }
    }
  }

  // 3. Champion attacks on enemy champion
  for (const [dr, dc] of dirs) {
    const tr = myChamp.row + dr;
    const tc = myChamp.col + dc;
    if (tr < 0 || tr >= 5 || tc < 0 || tc >= 5) continue;
    if (enemyChamp.row === tr && enemyChamp.col === tc) {
      captures.push({ type: 'championMove', row: tr, col: tc, _victimThreat: 300, _attackerAlly: 0 });
    }
  }

  // Sort MVV-LVA: highest (victim - attacker*0.1) first
  captures.sort((a, b) =>
    (b._victimThreat - b._attackerAlly * 0.1) - (a._victimThreat - a._attackerAlly * 0.1)
  );
  return captures;
}

/**
 * Quiescence search: resolves tactical positions at leaf nodes by exploring
 * capture-only moves until a quiet position is reached.
 *
 * Stand-pat is used as a lower bound (for the active player). Delta pruning
 * skips captures that cannot possibly raise alpha. Depth cap prevents explosion.
 *
 * Stored in the TT at depth=0; main-search entries (depth>0) always replace them.
 *
 * @param {object}  state      - game state
 * @param {number}  alpha      - alpha bound
 * @param {number}  beta       - beta bound
 * @param {number}  qdepth     - remaining quiescence depth
 * @param {boolean} maximizing - same perspective as the leaf node that called us
 * @param {string}  playerId   - root player ('p1'|'p2')
 * @param {object}  weights    - eval weight overrides
 * @param {Map}     tt         - transposition table
 * @param {object}  stats      - mutable stats; increments stats.qNodes
 * @param {object}  deadline   - { time: number } from the parent minimax search; abort if exceeded
 * @returns {{ score: number }}
 */
function quiescenceSearch(state, alpha, beta, qdepth, maximizing, playerId, weights, tt, stats, deadline) {
  stats.qNodes = (stats.qNodes ?? 0) + 1;
  // Instrumentation: track max quiescence depth reached and stand-pat exits
  const depthReached = Q_MAX_DEPTH - qdepth;
  if (depthReached > (stats.qDepthMax ?? 0)) stats.qDepthMax = depthReached;

  // Time-budget guard: if the main search deadline has passed, return static eval immediately
  if (deadline && performance.now() > deadline.time) {
    return { score: scoreState(state, playerId, weights) };
  }

  const { over } = isGameOver(state);
  if (over) return { score: scoreState(state, playerId, weights) };

  // TT lookup — quiescence entries stored at depth=0
  const hash     = getStateHash(state, 0);
  const ttResult = ttLookup(tt, hash, 0, alpha, beta);
  if (ttResult !== null && ttResult.score !== null) {
    return { score: ttResult.score };
  }

  const staticEval = scoreState(state, playerId, weights);

  if (maximizing) {
    // Stand-pat: if static position is already good enough, cut immediately
    if (staticEval >= beta) {
      stats.qStandPat = (stats.qStandPat ?? 0) + 1;
      ttStore(tt, hash, 0, staticEval, TT_LOWER, null);
      return { score: staticEval };
    }
    if (staticEval > alpha) alpha = staticEval;

    if (qdepth <= 0) {
      ttStore(tt, hash, 0, staticEval, TT_EXACT, null);
      return { score: staticEval };
    }

    const ap       = state.activePlayer;
    const captures = generateCaptures(state, ap);
    if (captures.length === 0) {
      stats.qStandPat = (stats.qStandPat ?? 0) + 1; // no captures = stand-pat exit
      ttStore(tt, hash, 0, staticEval, TT_EXACT, null);
      return { score: staticEval };
    }

    let best = staticEval;
    for (const cap of captures) {
      // Delta pruning: skip captures that cannot possibly raise alpha
      if (cap._victimThreat < 300) { // always search champion attacks
        if (staticEval + cap._victimThreat + Q_DELTA_MARGIN < alpha) continue;
      }

      const ns     = applyAction(state, cap);
      const result = quiescenceSearch(ns, alpha, beta, qdepth - 1, maximizing, playerId, weights, tt, stats, deadline);

      if (result.score > best) best = result.score;
      if (result.score > alpha) alpha = result.score;
      if (alpha >= beta) {
        ttStore(tt, hash, 0, best, TT_LOWER, null);
        return { score: best };
      }
    }

    const flag = best > staticEval ? TT_EXACT : TT_UPPER;
    ttStore(tt, hash, 0, best, flag, null);
    return { score: best };

  } else {
    // Minimizer stand-pat
    if (staticEval <= alpha) {
      stats.qStandPat = (stats.qStandPat ?? 0) + 1;
      ttStore(tt, hash, 0, staticEval, TT_UPPER, null);
      return { score: staticEval };
    }
    if (staticEval < beta) beta = staticEval;

    if (qdepth <= 0) {
      ttStore(tt, hash, 0, staticEval, TT_EXACT, null);
      return { score: staticEval };
    }

    const ap       = state.activePlayer;
    const captures = generateCaptures(state, ap);
    if (captures.length === 0) {
      stats.qStandPat = (stats.qStandPat ?? 0) + 1; // no captures = stand-pat exit
      ttStore(tt, hash, 0, staticEval, TT_EXACT, null);
      return { score: staticEval };
    }

    let best = staticEval;
    for (const cap of captures) {
      if (cap._victimThreat < 300) {
        if (staticEval - cap._victimThreat - Q_DELTA_MARGIN > beta) continue;
      }

      const ns     = applyAction(state, cap);
      const result = quiescenceSearch(ns, alpha, beta, qdepth - 1, maximizing, playerId, weights, tt, stats, deadline);

      if (result.score < best) best = result.score;
      if (result.score < beta) beta = result.score;
      if (alpha >= beta) {
        ttStore(tt, hash, 0, best, TT_UPPER, null);
        return { score: best };
      }
    }

    const flag = best < staticEval ? TT_EXACT : TT_LOWER;
    ttStore(tt, hash, 0, best, flag, null);
    return { score: best };
  }
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
 * transposition table, history heuristic, quiescence search at leaf nodes,
 * and Principal Variation Search (PVS).
 *
 * Depth semantics: depth decrements by 1 on EVERY action (not just endTurn).
 * Perspective (maximizing/minimizing) flips only on endTurn, matching the
 * two-player game structure. At depth 0, quiescenceSearch is called to resolve
 * tactical positions before returning the leaf score.
 *
 * Move ordering (highest-priority to lowest):
 *   1. TT best action — move found best at a previous search of this position
 *   2. Killer moves   — moves that caused cutoffs at this depth in sibling nodes
 *   3. Captures       — sorted by quickEvalOrder (proxy for MVV-LVA)
 *   4. Quiet moves    — sorted by history score (descending)
 *   5. endTurn        — always last
 *
 * PVS: the first child at each node is searched with the full (alpha, beta)
 * window. All subsequent children use a null window (alpha, alpha+1 for max;
 * beta-1, beta for min). If the null-window search indicates the child may
 * improve the bound, a full-window re-search is performed.
 *
 * History heuristic: quiet moves that cause beta cutoffs are recorded in the
 * history table (bonus = depth²). All quiet moves tried before the cutoff
 * receive a malus (−depth²). The gravity formula prevents saturation.
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
 * @param {object}  history          - history heuristic tables (shared across ID iterations)
 * @param {object}  stats            - mutable stats: { ttLookups, ttHits, qNodes }
 * @returns {{ score: number, action: object|null, timedOut?: true }}
 */
function minimax(gameState, depth, alpha, beta, maximizingPlayer, playerId, commandsUsed, weights, deadline, killers, tt, history, stats) {
  // Timeout check: abort and signal with a sentinel value
  if (performance.now() > deadline.time) {
    return { score: scoreState(gameState, playerId, weights), action: null, timedOut: true };
  }

  const { over } = isGameOver(gameState);

  // At depth 0 (or game over): call quiescence instead of bare static eval
  if (over) {
    return { score: scoreState(gameState, playerId, weights), action: null };
  }
  if (depth === 0) {
    const qResult = quiescenceSearch(
      gameState, alpha, beta, Q_MAX_DEPTH,
      maximizingPlayer, playerId, weights, tt, stats, deadline
    );
    return { score: qResult.score, action: null };
  }

  // ── Transposition table lookup ────────────────────────────────────────────
  const hash     = getStateHash(gameState, commandsUsed);
  const ttResult = ttLookup(tt, hash, depth, alpha, beta);
  stats.ttLookups++;

  if (ttResult !== null && ttResult.score !== null) {
    stats.ttHits++;
    return { score: ttResult.score, action: ttResult.action };
  }

  const ttBestAction = ttResult?.action ?? null;

  const rawActions = getLegalActions(gameState);
  const filtered   = filterActions(rawActions, gameState, commandsUsed);

  if (filtered.length === 0) {
    return { score: scoreState(gameState, playerId, weights), action: null };
  }

  // ── Move ordering (TT best → killers → captures → quiet-by-history) ───────
  const orderingPlayer = gameState.activePlayer === 0 ? 'p1' : 'p2';

  // Separate endTurns, captures, quiet moves
  const endTurnActions = filtered.filter(a => a.type === 'endTurn');
  const nonEndTurn     = filtered.filter(a => a.type !== 'endTurn');
  const captureActions = nonEndTurn.filter(a =>  isCapture(a, gameState));
  const quietActions   = nonEndTurn.filter(a => !isCapture(a, gameState));

  // Sort captures by quickEvalOrder (descending)
  const capScores = new Map();
  for (const a of captureActions) {
    capScores.set(a, quickEvalOrder(applyAction(gameState, a), orderingPlayer));
  }
  captureActions.sort((a, b) => (capScores.get(b) ?? 0) - (capScores.get(a) ?? 0));

  // Sort quiet moves by history score (descending); spell value + quickEvalOrder break ties.
  // Spell value bonus ensures high-value quiet spells (crusade, martiallaw, petrify, etc.)
  // are searched early enough that alpha-beta does not prune them before their scores register.
  const quietScores = new Map();
  for (const a of quietActions) {
    const h = historyScore(history, a, gameState);
    const q = quickEvalOrder(applyAction(gameState, a), orderingPlayer);
    const sv = a.type === 'cast'
      ? getSpellValue(a.cardUid, gameState, gameState.activePlayer) * 100
      : 0;
    quietScores.set(a, h * 10 + sv + q); // spell value forces casts to top; history refines within non-cast moves
  }
  quietActions.sort((a, b) => (quietScores.get(b) ?? 0) - (quietScores.get(a) ?? 0));

  // Merge: captures first, then quiet, then endTurn
  let actions = [...captureActions, ...quietActions, ...endTurnActions];

  // Apply killers (promotes to front of the merged list, before captures)
  actions = applyKillers(actions, killers, depth);

  // Promote TT best action to absolute front
  if (ttBestAction) {
    const idx = actions.findIndex(a => matchesKiller(a, ttBestAction));
    if (idx > 0) {
      actions = [actions[idx], ...actions.slice(0, idx), ...actions.slice(idx + 1)];
    }
  }

  const originalAlpha = alpha;
  const histBonus     = depth * depth; // history update magnitude

  if (maximizingPlayer) {
    let best        = { score: -Infinity, action: null };
    let firstChild  = true;
    const triedQuiet = []; // quiet moves tried before a cutoff (for history malus)

    // Fix 3: pre-compute enemy HP total for recentDamageDealt bonus on cast actions
    const enemyIdxForBonus = 1 - gameState.activePlayer;
    const enemyChampHPBefore = gameState.champions[enemyIdxForBonus]?.hp ?? 0;
    const enemyUnitHPBefore  = gameState.units
      .filter(u => u.owner === enemyIdxForBonus && !u.isRelic && !u.isOmen)
      .reduce((s, u) => s + (u.hp ?? 0), 0);

    for (const action of actions) {
      const newState  = applyAction(gameState, action);
      const isEndTurn = action.type === 'endTurn';

      const nextDepth        = depth - 1;
      const nextMaximizing   = isEndTurn ? false : true;
      const nextCommandsUsed = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

      let result;
      if (firstChild) {
        // First child: full window search
        result = minimax(
          newState, nextDepth, alpha, beta,
          nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats
        );
        firstChild = false;
      } else {
        // PVS: null-window search first
        result = minimax(
          newState, nextDepth, alpha, alpha + 1,
          nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats
        );
        // Re-search with full window if null window indicates this might be best
        if (!result.timedOut && result.score > alpha && result.score < beta) {
          result = minimax(
            newState, nextDepth, alpha, beta,
            nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats
          );
        }
      }

      if (result.timedOut) {
        if (best.action === null) {
          best = { score: result.score, action: action, timedOut: true };
        }
        return best;
      }

      // Fix 3: reward cast actions by total enemy HP removed (AOE/damage spells).
      // actionBonus sv multiplier removed — it does not propagate through alpha-beta.
      let actionBonus = 0;
      if (action.type === 'cast') {
        // Fix 3: measure total enemy HP removed by this cast (captures AOE that spread damage)
        const afterEnemyChampHP = newState.champions[enemyIdxForBonus]?.hp ?? 0;
        const afterEnemyUnitHP  = newState.units
          .filter(u => u.owner === enemyIdxForBonus && !u.isRelic && !u.isOmen)
          .reduce((s, u) => s + (u.hp ?? 0), 0);
        const damageDealt = Math.max(0,
          (enemyChampHPBefore + enemyUnitHPBefore) - (afterEnemyChampHP + afterEnemyUnitHP)
        );
        actionBonus += damageDealt * 3;
      }
      const adjustedScore = result.score + actionBonus;

      if (adjustedScore > best.score) {
        best = { score: adjustedScore, action: action };
      }
      alpha = Math.max(alpha, adjustedScore);

      if (beta <= alpha) {
        recordKiller(killers, depth, action);
        // History: bonus for the cutoff move (if quiet), malus for earlier tried quiets
        if (!isCapture(action, gameState) && action.type !== 'endTurn') {
          historyRecord(history, action, gameState, histBonus);
          for (const q of triedQuiet) historyRecord(history, q, gameState, -histBonus);
        }
        ttStore(tt, hash, depth, best.score, TT_LOWER, best.action);
        return best;
      }

      // Track quiet moves tried before any potential cutoff
      if (!isCapture(action, gameState) && action.type !== 'endTurn') {
        triedQuiet.push(action);
      }
    }

    const flag = best.score > originalAlpha ? TT_EXACT : TT_UPPER;
    ttStore(tt, hash, depth, best.score, flag, best.action);
    return best;

  } else {
    let best         = { score: Infinity, action: null };
    const originalBeta = beta;
    let firstChild   = true;
    const triedQuiet = [];

    for (const action of actions) {
      const newState  = applyAction(gameState, action);
      const isEndTurn = action.type === 'endTurn';

      const nextDepth        = depth - 1;
      const nextMaximizing   = isEndTurn ? true : false;
      const nextCommandsUsed = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

      let result;
      if (firstChild) {
        result = minimax(
          newState, nextDepth, alpha, beta,
          nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats
        );
        firstChild = false;
      } else {
        // PVS null window for minimizer: (beta-1, beta)
        result = minimax(
          newState, nextDepth, beta - 1, beta,
          nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats
        );
        if (!result.timedOut && result.score < beta && result.score > alpha) {
          result = minimax(
            newState, nextDepth, alpha, beta,
            nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats
          );
        }
      }

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
        recordKiller(killers, depth, action);
        if (!isCapture(action, gameState) && action.type !== 'endTurn') {
          historyRecord(history, action, gameState, histBonus);
          for (const q of triedQuiet) historyRecord(history, q, gameState, -histBonus);
        }
        ttStore(tt, hash, depth, best.score, TT_UPPER, best.action);
        return best;
      }

      if (!isCapture(action, gameState) && action.type !== 'endTurn') {
        triedQuiet.push(action);
      }
    }

    const flag = best.score < originalBeta ? TT_EXACT : TT_LOWER;
    ttStore(tt, hash, depth, best.score, flag, best.action);
    return best;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Choose the best action using minimax with iterative deepening and full Tier-1
 * search improvements: TT, killer heuristic, history heuristic, quiescence
 * search at leaf nodes, and Principal Variation Search.
 *
 * Search improvements stacked:
 *   1. Move ordering  — captures first (quickEval), then quiet by history score.
 *   2. Killer heuristic — moves that caused cutoffs tried first at sibling nodes.
 *   3. Transposition table — Zobrist-hashed, fresh per decision, shared across ID.
 *   4. History heuristic — quiet-move beta-cutoff bonus/malus; Stockfish gravity.
 *   5. Quiescence search — resolves tactical captures at leaf nodes (cap 12 plies).
 *   6. PVS — first child full window; rest null-window with conditional re-search.
 *   7. Iterative deepening — time-budgeted; incomplete final iteration discarded.
 *
 * @param {object}  gameState    - current game state
 * @param {number}  commandsUsed - move actions already taken this turn (0–3)
 * @param {object}  [options]
 *   timeBudget - per-decision time limit in ms (default 800)
 *   depth      - max depth cap for iterative deepening (default 20)
 *   weights    - explicit weight overrides for evaluateBoard (null = auto-detect faction)
 *   stats      - optional mutable accumulator: { ttLookups, ttHits, depthSum, ttSizeSum, qNodesSum, decisions }
 * @returns {object} action object to apply
 */
export function chooseActionMinimax(gameState, commandsUsed = 0, options = {}) {
  const timeBudget = options.timeBudget ?? 800;
  const maxDepth   = options.depth      ?? 20;
  const weights    = options.weights    ?? undefined;

  const ap       = gameState.activePlayer;
  const playerId = ap === 0 ? 'p1' : 'p2';

  // ── Pre-check: lethal detection ─────────────────────────────────────────────
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

  // Fresh TT, killers, and history per AI decision.
  // TT and history are shared across ID iterations so depth-N results seed depth-(N+1).
  const tt         = new Map();
  const killers    = {};
  const history    = makeHistoryTables();
  const localStats = { ttLookups: 0, ttHits: 0, qNodes: 0, qStandPat: 0, qDepthMax: 0 };

  // ── Iterative deepening search ─────────────────────────────────────────────
  const deadline = { time: performance.now() + timeBudget };

  let bestAction   = null;
  let depthReached = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() >= deadline.time) break;

    const result = minimax(
      gameState, depth, -Infinity, Infinity,
      true, playerId, commandsUsed, weights, deadline, killers, tt, history, localStats
    );

    if (result.timedOut) {
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
    options.stats.ttLookups    = (options.stats.ttLookups    ?? 0) + localStats.ttLookups;
    options.stats.ttHits       = (options.stats.ttHits       ?? 0) + localStats.ttHits;
    options.stats.qNodesSum    = (options.stats.qNodesSum    ?? 0) + localStats.qNodes;
    options.stats.qStandPatSum = (options.stats.qStandPatSum ?? 0) + localStats.qStandPat;
    options.stats.qDepthMaxSum = (options.stats.qDepthMaxSum ?? 0) + localStats.qDepthMax;
    options.stats.depthSum     = (options.stats.depthSum     ?? 0) + depthReached;
    options.stats.ttSizeSum    = (options.stats.ttSizeSum    ?? 0) + tt.size;
    options.stats.decisions    = (options.stats.decisions    ?? 0) + 1;
  }

  return bestAction ?? chooseAction(gameState, commandsUsed);
}
