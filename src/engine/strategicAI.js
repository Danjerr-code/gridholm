/**
 * strategicAI.js
 *
 * Minimax strategic AI for the live game opponent.
 * Self-contained: imports only from src/engine/ to stay independent of
 * the simulation scripts in scripts/simulation/.
 *
 * Exports:
 *   chooseActionStrategic(gameState, commandsUsed) → action object
 */

import {
  cloneState,
  manhattan,
  getChampionMoveTiles,
  moveChampion,
  getSummonTiles,
  playCard,
  summonUnit,
  resolveSpell,
  resolveHandSelect,
  resolveLineBlast,
  resolveDeckPeek,
  applyChampionAbility,
  triggerUnitAction,
  getUnitMoveTiles,
  moveUnit,
  endTurn,
  getSpellTargets,
  getChampionAbilityTargets,
  getChampionDef,
  hasValidTargets,
} from './gameEngine.js';
import { ACTION_REGISTRY } from './actionRegistry.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const THRONE_ROW = 2;
const THRONE_COL = 2;

const NO_TARGET_SPELLS = new Set([
  'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
  'ironthorns', 'infernalpact', 'martiallaw', 'fortify', 'shadowveil',
  'ancientspring', 'verdantsurge', 'predatorsmark', 'seconddawn',
]);

const TWO_STEP_SPELLS = new Set(['bloom', 'ambush']);

const TARGETED_ACTION_UNITS = new Set(['woodlandguard', 'packrunner', 'elfarcher', 'clockworkmanimus']);

// ── isGameOver ────────────────────────────────────────────────────────────────

function isGameOver(state) {
  if (!state.winner) return { over: false, winner: null };
  const winnerPlayer = state.players.find(p => p.name === state.winner);
  const winner = winnerPlayer ? (winnerPlayer.id === 0 ? 'p1' : 'p2') : null;
  return { over: true, winner };
}

// ── getLegalActions ───────────────────────────────────────────────────────────

function getLegalActions(state) {
  const actions = [];
  if (state.winner) return actions;
  if (state.phase !== 'action') return actions;
  if (state.pendingSpell || state.pendingSummon || state.pendingHandSelect || state.pendingFleshtitheSacrifice) return actions;
  if (state.pendingDiscard) return actions;

  const ap = state.activePlayer;
  const p = state.players[ap];
  const champ = state.champions[ap];

  // 1. Champion moves
  for (const [row, col] of getChampionMoveTiles(state)) {
    actions.push({ type: 'championMove', row, col });
  }

  // 2. Unit moves
  for (const unit of state.units.filter(u => u.owner === ap)) {
    for (const [row, col] of getUnitMoveTiles(state, unit.uid)) {
      actions.push({ type: 'move', unitId: unit.uid, targetTile: [row, col] });
    }
  }

  // 3. Summon unit and relic cards
  const summonTiles = getSummonTiles(state);
  if (summonTiles.length > 0) {
    for (const card of p.hand) {
      if (card.type !== 'unit' && card.type !== 'relic') continue;
      if (p.resources < card.cost) continue;
      if ((state.recalledThisTurn || []).includes(card.id)) continue;
      for (const [row, col] of summonTiles) {
        actions.push({ type: 'summon', cardUid: card.uid, targetTile: [row, col] });
      }
    }
  }

  // 4. Spell cards
  for (const card of p.hand) {
    if (card.type !== 'spell') continue;
    if (p.resources < card.cost) continue;
    if (!hasValidTargets(card, state, ap)) continue;

    if (NO_TARGET_SPELLS.has(card.effect)) {
      actions.push({ type: 'cast', cardUid: card.uid, targets: [] });
    } else if (TWO_STEP_SPELLS.has(card.effect)) {
      const step0Targets = getSpellTargets(state, card.effect, 0, {});
      for (const t0 of step0Targets) {
        let tempState = cloneState(state);
        tempState.pendingSpell = { cardUid: card.uid, effect: card.effect, playerIdx: ap, step: 0, data: {} };
        tempState = resolveSpell(tempState, card.uid, t0);
        if (tempState.pendingSpell) {
          const step1Targets = getSpellTargets(tempState, card.effect, 1, tempState.pendingSpell.data || {});
          for (const t1 of step1Targets) {
            actions.push({ type: 'cast', cardUid: card.uid, targets: [t0, t1] });
          }
        }
      }
    } else {
      const targets = getSpellTargets(state, card.effect, 0, {});
      for (const targetUid of targets) {
        actions.push({ type: 'cast', cardUid: card.uid, targets: [targetUid] });
      }
    }
  }

  // 5. Champion ability
  if (!champ.moved && !state.championAbilityUsed?.[ap]) {
    const champDef = getChampionDef(p);
    if (champDef?.ability) {
      const abilityCost = champDef.ability.cost ?? 2;
      if (p.resources >= abilityCost) {
        const tf = champDef.ability.targetFilter;
        if (!tf || tf === 'none') {
          actions.push({ type: 'championAbility', abilityId: champDef.ability.id, targetUid: null });
        } else {
          for (const targetUid of getChampionAbilityTargets(state, ap, tf)) {
            actions.push({ type: 'championAbility', abilityId: champDef.ability.id, targetUid });
          }
        }
      }
    }
  }

  // 6. Unit action abilities
  const commandsUsed = p.commandsUsed ?? 0;
  if (commandsUsed < 3) {
    for (const unit of state.units.filter(u => u.owner === ap && !u.moved && !u.summoned)) {
      if (!ACTION_REGISTRY[unit.id]) continue;
      if (TARGETED_ACTION_UNITS.has(unit.id)) {
        const effectKey = `${unit.id}_action`;
        const targets = getSpellTargets(state, effectKey, 0, { sourceUid: unit.uid });
        for (const targetUid of targets) {
          actions.push({ type: 'unitAction', unitId: unit.uid, targetUid });
        }
      } else {
        actions.push({ type: 'unitAction', unitId: unit.uid, targetUid: null });
      }
    }
  }

  // 7. End turn
  actions.push({ type: 'endTurn' });

  return actions;
}

// ── applyAction ───────────────────────────────────────────────────────────────

// Picks the cardinal direction that maximises units hit in a line (for Vorn, Mana Cannon)
// or — when the unit has an action that moves itself (Iron Queen) — the direction that
// puts the unit closest to the enemy champion. Falls back to 'up' if all counts tie.
function _pickBestDirection(state, unit) {
  const DIRS = ['up', 'down', 'left', 'right'];
  const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const enemyChamp = state.champions.find(ch => ch.owner !== unit.owner);

  // For Iron Queen, pick direction that moves her closest to the enemy champion
  if (unit.id === 'ironqueen' && enemyChamp) {
    const distances = DIRS.map(dir => {
      const [dr, dc] = deltas[dir];
      let r = unit.row + dr;
      let c = unit.col + dc;
      if (r < 0 || r > 4 || c < 0 || c > 4) return { dir, dist: Infinity };
      // Blocked immediately — she won't move
      const blocked = state.units.some(u => u.uid !== unit.uid && u.row === r && u.col === c) ||
        state.champions.some(ch => ch.row === r && ch.col === c);
      if (blocked) return { dir, dist: Infinity };
      let destR = r;
      let destC = c;
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr <= 4 && nc >= 0 && nc <= 4) {
        const b = state.units.some(u => u.uid !== unit.uid && u.row === nr && u.col === nc) ||
          state.champions.some(ch => ch.row === nr && ch.col === nc);
        if (b) break;
        destR = nr;
        destC = nc;
        nr += dr;
        nc += dc;
      }
      return { dir, dist: Math.abs(destR - enemyChamp.row) + Math.abs(destC - enemyChamp.col) };
    });
    distances.sort((a, b) => a.dist - b.dist);
    return distances[0].dir;
  }

  // Default: pick direction that hits the most units in a line
  let best = 'up';
  let bestCount = -1;
  for (const dir of DIRS) {
    const [dr, dc] = deltas[dir];
    let r = unit.row + dr;
    let c = unit.col + dc;
    let count = 0;
    while (r >= 0 && r <= 4 && c >= 0 && c <= 4) {
      if (state.units.some(u => u.row === r && u.col === c && !u.isOmen) ||
          state.champions.some(ch => ch.row === r && ch.col === c)) {
        count++;
        break;
      }
      r += dr;
      c += dc;
    }
    if (count > bestCount) { bestCount = count; best = dir; }
  }
  return best;
}

export function applyAction(state, action) {
  const ap = state.activePlayer;

  switch (action.type) {
    case 'championMove':
      return moveChampion(state, action.row, action.col);

    case 'move':
      return moveUnit(state, action.unitId, action.targetTile[0], action.targetTile[1]);

    case 'summon': {
      let s = playCard(state, action.cardUid);
      if (!s.pendingSummon) return s;
      return summonUnit(s, action.cardUid, action.targetTile[0], action.targetTile[1]);
    }

    case 'cast': {
      const { cardUid, targets } = action;
      const card = state.players[ap].hand.find(c => c.uid === cardUid);
      if (!card) return cloneState(state);

      if (NO_TARGET_SPELLS.has(card.effect)) {
        return playCard(state, cardUid);
      }

      if (TWO_STEP_SPELLS.has(card.effect)) {
        let s = cloneState(state);
        s.pendingSpell = { cardUid, effect: card.effect, playerIdx: ap, step: 0, data: {} };
        s = resolveSpell(s, cardUid, targets[0]);
        if (s.pendingSpell && targets[1] != null) {
          s = resolveSpell(s, cardUid, targets[1]);
        }
        return s;
      }

      let s = playCard(state, cardUid);
      if (!s.pendingSpell) return s;
      return resolveSpell(s, cardUid, targets[0] ?? null);
    }

    case 'championAbility':
      return applyChampionAbility(state, ap, action.abilityId, action.targetUid);

    case 'unitAction': {
      let s = triggerUnitAction(state, action.unitId);
      if (s.pendingLineBlast) {
        const pendingUnit = s.units.find(u => u.uid === s.pendingLineBlast.unitUid);
        const bestDir = pendingUnit ? _pickBestDirection(s, pendingUnit) : 'up';
        s = resolveLineBlast(s, s.pendingLineBlast.unitUid, bestDir);
      } else if (s.pendingDeckPeek) {
        // Arcane Lens: AI keeps the highest-cost card from the peeked cards
        const peeked = s.pendingDeckPeek.cards;
        const best = peeked.reduce((a, b) => b.cost > a.cost ? b : a, peeked[0]);
        s = resolveDeckPeek(s, best.uid);
      } else if (s.pendingSpell && action.targetUid != null) {
        s = resolveSpell(s, action.unitId, action.targetUid);
      }
      return s;
    }

    case 'endTurn': {
      let s = endTurn(state);
      // Handle Clockwork Manimus discardOrDie prompt: discard the lowest-cost card in hand
      if (s.pendingHandSelect?.reason === 'discardOrDie') {
        const p = s.players[s.activePlayer];
        if (p.hand.length > 0) {
          const lowestCost = p.hand.reduce((min, c) => c.cost < min.cost ? c : min, p.hand[0]);
          s = resolveHandSelect(s, lowestCost.uid);
        }
      }
      return s;
    }

    default:
      throw new Error(`[strategicAI] Unknown action type: ${action.type}`);
  }
}

// ── Board evaluation ──────────────────────────────────────────────────────────

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
  lethalThreat:             35,
  championProximity:        10,
  opponentChampionLowHP:    30,
};

function evaluateBoard(gameState, playerId, weights = WEIGHTS) {
  const ap = playerId === 'p1' ? 0 : 1;
  const op = 1 - ap;

  const myChamp  = gameState.champions[ap];
  const oppChamp = gameState.champions[op];
  const myUnits  = gameState.units.filter(u => u.owner === ap);
  const oppUnits = gameState.units.filter(u => u.owner === op);
  const myPlayer = gameState.players[ap];

  const championHP    = myChamp.hp;
  const rawChampionHPDiff = myChamp.hp - oppChamp.hp;
  // Amplify the HP advantage when the opponent is close to death — creates urgency to close.
  const hpDiffMultiplier = oppChamp.hp <= 5 ? 3 : 1;
  const championHPDiff = rawChampionHPDiff * hpDiffMultiplier;
  const unitCountDiff  = myUnits.length - oppUnits.length;
  const totalATKOnBoard = myUnits.reduce((s, u) => s + (u.atk ?? 0), 0);
  const totalHPOnBoard  = myUnits.reduce((s, u) => s + (u.hp ?? 0), 0);

  const myOnThrone = (
    (myChamp.row === THRONE_ROW && myChamp.col === THRONE_COL) ||
    myUnits.some(u => u.row === THRONE_ROW && u.col === THRONE_COL)
  );
  const oppOnThrone = (
    (oppChamp.row === THRONE_ROW && oppChamp.col === THRONE_COL) ||
    oppUnits.some(u => u.row === THRONE_ROW && u.col === THRONE_COL)
  );
  const throneControl = myOnThrone ? 1 : (oppOnThrone ? -1 : 0);

  const unitsThreateningChampion = myUnits.filter(u =>
    manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]) <= 2
  ).length;

  const unitsAdjacentToAlly = myUnits.filter(u =>
    myUnits.some(ally => ally !== u && manhattan([u.row, u.col], [ally.row, ally.col]) === 1)
  ).length;

  const cardsInHand = myPlayer.hand ? myPlayer.hand.length : 0;
  const hiddenUnits = myUnits.filter(u => u.hidden).length;

  const totalMana     = myPlayer.maxMana ?? myPlayer.mana ?? 0;
  const remainingMana = myPlayer.mana ?? 0;
  const manaEfficiency = (totalMana - remainingMana) / Math.max(totalMana, 1);

  const lethalThreat = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return dist <= (u.spd ?? 1) ? sum + (u.atk ?? 0) : sum;
  }, 0);

  // Escalating gameLength penalty: no urgency 1-10, moderate 11-20, extreme >20.
  const turnNumber = gameState.turn ?? 0;
  const gameLength = turnNumber <= 10 ? 0
    : turnNumber <= 20 ? (turnNumber - 10) * -2
    : -20 + (turnNumber - 20) * -5;

  const championProximity = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return sum + Math.max(0, 5 - dist);
  }, 0);

  // Massive bonus to close out games when opponent champion is nearly dead.
  const opponentChampionLowHP = oppChamp.hp <= 3 ? 2 : (oppChamp.hp <= 5 ? 1 : 0);

  return (
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
    gameLength                                                  +
    championProximity        * weights.championProximity        +
    opponentChampionLowHP    * weights.opponentChampionLowHP
  );
}

// ── Action filtering (reduces branching factor) ────────────────────────────────

function filterActions(actions, state, commandsUsed) {
  const ap = state.activePlayer;
  const enemyIdx = 1 - ap;
  const enemyChamp = state.champions[enemyIdx];

  if (commandsUsed >= 3) {
    actions = actions.filter(a => a.type !== 'move');
  }

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

        if (
          state.units.some(u => u.owner === enemyIdx && u.row === tr && u.col === tc) ||
          (enemyChamp.row === tr && enemyChamp.col === tc)
        ) {
          return true;
        }

        const curDistEnemy  = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
        const newDistEnemy  = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
        const curDistThrone = manhattan([unit.row, unit.col], [THRONE_ROW, THRONE_COL]);
        const newDistThrone = manhattan([tr, tc], [THRONE_ROW, THRONE_COL]);

        if (newDistEnemy > curDistEnemy && newDistThrone > curDistThrone) return false;
        return true;
      }

      case 'summon': {
        const card = hand.find(c => c.uid === action.cardUid);
        if (!card) return false;
        if (card.cost > 2 * minUnitCost) return false;
        return true;
      }

      default:
        return true;
    }
  });
}

// ── Minimax ───────────────────────────────────────────────────────────────────

const WIN_BONUS = 500;

function scoreState(gameState, playerId) {
  const { over, winner } = isGameOver(gameState);
  if (over) {
    return winner === playerId ? WIN_BONUS + evaluateBoard(gameState, playerId)
                               : -(WIN_BONUS + evaluateBoard(gameState, playerId));
  }
  return evaluateBoard(gameState, playerId);
}

function minimax(gameState, depth, alpha, beta, maximizingPlayer, playerId, commandsUsed, deadline) {
  if (performance.now() > deadline.time) {
    return { score: scoreState(gameState, playerId), action: null, timedOut: true };
  }

  const { over } = isGameOver(gameState);
  if (over || depth === 0) {
    return { score: scoreState(gameState, playerId), action: null };
  }

  const rawActions = getLegalActions(gameState);
  const actions = filterActions(rawActions, gameState, commandsUsed);

  if (actions.length === 0) {
    return { score: scoreState(gameState, playerId), action: null };
  }

  if (maximizingPlayer) {
    let best = { score: -Infinity, action: null };

    for (const action of actions) {
      const newState = applyAction(gameState, action);
      const isEndTurn = action.type === 'endTurn';
      const nextDepth        = isEndTurn ? depth - 1 : depth;
      const nextMaximizing   = isEndTurn ? false : true;
      const nextCommandsUsed = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

      const result = minimax(newState, nextDepth, alpha, beta, nextMaximizing, playerId, nextCommandsUsed, deadline);

      if (result.timedOut) {
        if (best.action === null) best = { score: result.score, action, timedOut: true };
        return best;
      }

      if (result.score > best.score) best = { score: result.score, action };
      alpha = Math.max(alpha, result.score);
      if (beta <= alpha) break;
    }

    return best;
  } else {
    let best = { score: Infinity, action: null };

    for (const action of actions) {
      const newState = applyAction(gameState, action);
      const isEndTurn = action.type === 'endTurn';
      const nextDepth        = isEndTurn ? depth - 1 : depth;
      const nextMaximizing   = isEndTurn ? true : false;
      const nextCommandsUsed = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

      const result = minimax(newState, nextDepth, alpha, beta, nextMaximizing, playerId, nextCommandsUsed, deadline);

      if (result.timedOut) {
        if (best.action === null) best = { score: result.score, action, timedOut: true };
        return best;
      }

      if (result.score < best.score) best = { score: result.score, action };
      beta = Math.min(beta, result.score);
      if (beta <= alpha) break;
    }

    return best;
  }
}

// ── Diagnostic logging ────────────────────────────────────────────────────────

let _aiDebugEnabled = false;

/**
 * Enable/disable verbose AI decision logging.
 * When enabled, chooseActionStrategic logs every turn's context and chosen action.
 */
export function setAIDebug(enabled) { _aiDebugEnabled = enabled; }
export function getAIDebug() { return _aiDebugEnabled; }

function aiLog(...args) {
  if (_aiDebugEnabled) console.log('[AI]', ...args);
}

function describeAction(action, state) {
  const ap = state.activePlayer;
  switch (action.type) {
    case 'move': {
      const unit = state.units.find(u => u.uid === action.unitId);
      return `move ${unit?.name ?? action.unitId} → [${action.targetTile}]`;
    }
    case 'championMove':
      return `championMove → [${action.row},${action.col}]`;
    case 'summon': {
      const card = state.players[ap].hand.find(c => c.uid === action.cardUid);
      return `summon ${card?.name ?? action.cardUid} @ [${action.targetTile}]`;
    }
    case 'cast': {
      const card = state.players[ap].hand.find(c => c.uid === action.cardUid);
      const tgtStr = action.targets?.length ? ` → ${action.targets.join(',')}` : '';
      return `cast ${card?.name ?? action.cardUid}${tgtStr}`;
    }
    case 'terrain': {
      const card = state.players[ap].hand.find(c => c.uid === action.cardUid);
      return `terrain ${card?.name ?? action.cardUid} @ [${action.targetTile}]`;
    }
    case 'championAbility':
      return `championAbility ${action.abilityId}${action.targetUid ? ' → ' + action.targetUid : ''}`;
    case 'unitAction': {
      const unit = state.units.find(u => u.uid === action.unitId);
      return `unitAction ${unit?.name ?? action.unitId}${action.targetUid ? ' → ' + action.targetUid : ''}`;
    }
    case 'endTurn':
      return 'endTurn';
    default:
      return JSON.stringify(action);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Choose the best action for the live game AI using minimax with alpha-beta pruning.
 * Falls back to the first legal action if search exceeds 2 seconds.
 *
 * @param {object} gameState    - current game state
 * @param {number} commandsUsed - move actions taken this turn (default: read from state)
 * @param {number} [depth=2]    - minimax search depth (turn-depth)
 * @returns {object}             action object to apply
 */
export function chooseActionStrategic(gameState, commandsUsed, depth = 2) {
  const cmds = commandsUsed ?? (gameState.players[gameState.activePlayer].commandsUsed ?? 0);
  const ap = gameState.activePlayer;
  const playerId = ap === 0 ? 'p1' : 'p2';

  // ── Diagnostic context ────────────────────────────────────────────────────
  if (_aiDebugEnabled) {
    const p = gameState.players[ap];
    const myChamp = gameState.champions[ap];
    const oppChamp = gameState.champions[1 - ap];
    aiLog(`── Turn ${gameState.turn ?? '?'} | ${playerId} | mana ${p.resources} | cmds used ${cmds}`);
    aiLog(`   Hand (${p.hand.length}): ${p.hand.map(c => `${c.name}(${c.cost})`).join(', ')}`);
    aiLog(`   My units: ${gameState.units.filter(u => u.owner === ap).map(u => `${u.name}(${u.atk}/${u.hp})`).join(', ') || 'none'}`);
    aiLog(`   My champion HP: ${myChamp.hp} | Opp champion HP: ${oppChamp.hp}`);
    aiLog(`   Legal actions: ${getLegalActions(gameState).length}`);
  }

  // ── Pre-check: lethal detection ─────────────────────────────────────────────
  // If any legal action wins the game immediately, take it without running minimax.
  const enemyIdx = 1 - ap;
  const enemyChamp = gameState.champions[enemyIdx];
  const preActions = getLegalActions(gameState);

  for (const action of preActions) {
    // Unit move onto the enemy champion's tile: lethal if unit ATK >= champion HP.
    if (action.type === 'move') {
      const unit = gameState.units.find(u => u.uid === action.unitId);
      if (
        unit &&
        action.targetTile[0] === enemyChamp.row &&
        action.targetTile[1] === enemyChamp.col &&
        unit.atk >= enemyChamp.hp
      ) {
        aiLog(`   → LETHAL: ${describeAction(action, gameState)}`);
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
    // Champion move onto the enemy champion's tile: lethal if champion ATK >= enemy HP.
    if (action.type === 'championMove') {
      const myChamp = gameState.champions[ap];
      if (
        action.row === enemyChamp.row &&
        action.col === enemyChamp.col &&
        (myChamp.atk ?? 0) >= enemyChamp.hp
      ) {
        aiLog(`   → LETHAL: ${describeAction(action, gameState)}`);
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
    // Spell lethal: apply the cast and check if it results in a win.
    if (action.type === 'cast') {
      const newState = applyAction(gameState, action);
      if (newState.winner) {
        aiLog(`   → LETHAL: ${describeAction(action, gameState)}`);
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
    // Champion ability lethal: ability deals direct damage and enemy champion HP equals that damage.
    if (action.type === 'championAbility') {
      const newState = applyAction(gameState, action);
      if (newState.winner) {
        aiLog(`   → LETHAL: ${describeAction(action, gameState)}`);
        console.log('LETHAL FOUND: ' + action.type + ' ' + (action.unitId || action.cardId));
        return action;
      }
    }
  }

  const deadline = { time: performance.now() + 2000 };

  const result = minimax(gameState, depth, -Infinity, Infinity, true, playerId, cmds, deadline);

  if (result.timedOut || result.action === null) {
    if (result.timedOut) {
      if (typeof window !== 'undefined') console.warn('[strategicAI] Search timed out — falling back to first legal action');
    }
    const actions = getLegalActions(gameState);
    const fallback = actions[0] ?? { type: 'endTurn' };
    aiLog(`   → FALLBACK (timeout/no result): ${describeAction(fallback, gameState)}`);
    return fallback;
  }

  aiLog(`   → CHOSEN (score ${result.score?.toFixed(1)}): ${describeAction(result.action, gameState)}`);
  return result.action;
}
