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
  getApproachTiles,
  executeApproachAndAttack,
  endTurn,
  getSpellTargets,
  getChampionAbilityTargets,
  getChampionDef,
  hasValidTargets,
  getCommandLimit,
  resolveVeilSeerChoiceHand,
  resolveVeilSeerHiddenTarget,
} from './gameEngine.js';
import { ACTION_REGISTRY } from './actionRegistry.js';
import { getCardRating, THREAT_RATINGS } from './cardThreatRatings.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const THRONE_ROW = 2;
const THRONE_COL = 2;
const BOARD_SIZE = 5;
const adjDirs = [[-1,0],[1,0],[0,-1],[0,1]];

const NO_TARGET_SPELLS = new Set([
  'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
  'ironthorns', 'infernalpact', 'martiallaw', 'fortify', 'shadowveil',
  'ancientspring', 'verdantsurge', 'predatorsmark', 'seconddawn', 'glimpse',
]);

const TWO_STEP_SPELLS = new Set(['bloom', 'ambush']);

const TARGETED_ACTION_UNITS = new Set(['woodlandguard', 'packrunner', 'elfarcher', 'clockworkmanimus', 'rootsongcommander']);

// ── isGameOver ────────────────────────────────────────────────────────────────

function isGameOver(state) {
  if (!state.winner) return { over: false, winner: null };
  const winnerPlayer = state.players.find(p => p.name === state.winner);
  const winner = winnerPlayer ? (winnerPlayer.id === 0 ? 'p1' : 'p2') : null;
  return { over: true, winner };
}

// ── getLegalActions ───────────────────────────────────────────────────────────

function getLegalActions(state) {
  if (!state) return [];
  const actions = [];
  if (state.winner) return actions;
  if (state.phase !== 'action') return actions;
  // Generic pending-state guard — explicit list documents all known states
  if (
    state.pendingRelicPlace ||
    state.pendingTerrainCast ||
    state.pendingSpell ||
    state.pendingContractSelect ||
    state.pendingDiscardSelect ||
    state.pendingSacrifice ||
    state.pendingGildedCage ||
    state.pendingMindSeize ||
    state.pendingRecall ||
    state.pendingCrushingBlow ||
    state.pendingTollOfShadows ||
    state.pendingPactOfRuin ||
    state.pendingSummon ||
    state.pendingHandSelect ||
    state.pendingFleshtitheSacrifice ||
    state.pendingDiscard
  ) {
    return actions;
  }
  // Catch-all: future pending states not yet in the list above
  const hasPendingState = Object.keys(state).some(key => key.startsWith('pending') && state[key]);
  if (hasPendingState) return actions;

  const ap = state.activePlayer;
  const p = state.players[ap];
  const champ = state.champions[ap];

  // 1. Champion moves
  for (const [row, col] of getChampionMoveTiles(state)) {
    actions.push({ type: 'championMove', row, col });
  }

  // 2. Unit moves
  // For SPD 2+ attacks at distance 2 against an enemy, generate one action per approach tile
  // so the AI can evaluate the best landing position (terrain/aura modifiers vary by tile).
  for (const unit of state.units.filter(u => u.owner === ap)) {
    for (const [row, col] of getUnitMoveTiles(state, unit.uid)) {
      const dist = manhattan([unit.row, unit.col], [row, col]);
      const isEnemyTarget =
        state.units.some(u => u.owner !== ap && u.row === row && u.col === col) ||
        state.champions.some(ch => ch.owner !== ap && ch.row === row && ch.col === col) ||
        state.units.some(u => u.id === 'amethystcrystal' && u.owner === ap && u.row === row && u.col === col);
      if (dist === 2 && isEnemyTarget) {
        const approachTiles = getApproachTiles(state, unit, row, col);
        if (approachTiles.length === 0) {
          // Flying unit with no adjacent landing tile — moveUnit handles it (attacker stays put)
          actions.push({ type: 'move', unitId: unit.uid, targetTile: [row, col] });
        } else {
          for (const [ar, ac] of approachTiles) {
            actions.push({ type: 'move', unitId: unit.uid, targetTile: [row, col], approachTile: [ar, ac] });
          }
        }
      } else {
        actions.push({ type: 'move', unitId: unit.uid, targetTile: [row, col] });
      }
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
  if (commandsUsed < getCommandLimit(state, ap)) {
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

  // Boss fight: AI (player 1) never voluntarily moves onto an active switch tile.
  // After a switch has been used (active: false), that restriction is lifted.
  if (state.adventureBossFight && ap === 1) {
    const activeSwitches = (state.switchTiles || []).filter(s => s.active);
    if (activeSwitches.length > 0) {
      return actions.filter(action => {
        if (action.type === 'move') {
          const [tr, tc] = action.targetTile;
          if (activeSwitches.some(sw => sw.row === tr && sw.col === tc)) return false;
          if (action.approachTile) {
            const [ar, ac] = action.approachTile;
            if (activeSwitches.some(sw => sw.row === ar && sw.col === ac)) return false;
          }
        }
        if (action.type === 'championMove') {
          if (activeSwitches.some(sw => sw.row === action.row && sw.col === action.col)) return false;
        }
        return true;
      });
    }
  }

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
      if (action.approachTile) {
        return executeApproachAndAttack(state, action.unitId, action.approachTile[0], action.approachTile[1], action.targetTile[0], action.targetTile[1]);
      }
      return moveUnit(state, action.unitId, action.targetTile[0], action.targetTile[1]);

    case 'summon': {
      let s = playCard(state, action.cardUid);
      if (!s.pendingSummon) return s;
      s = summonUnit(s, action.cardUid, action.targetTile[0], action.targetTile[1]);
      // Auto-resolve Veil Seer choice for the active (AI) player
      if (s.pendingVeilSeerChoice && s.pendingVeilSeerChoice.playerIndex === ap) {
        const hiddenEnemies = s.units.filter(u => u.owner !== ap && u.hidden);
        if (hiddenEnemies.length > 0) {
          hiddenEnemies.sort((a, b) => {
            const aVal = (THREAT_RATINGS[a.id]?.threatValue) ?? Math.ceil((a.cost ?? 1) * 0.7);
            const bVal = (THREAT_RATINGS[b.id]?.threatValue) ?? Math.ceil((b.cost ?? 1) * 0.7);
            return bVal - aVal;
          });
          s = resolveVeilSeerHiddenTarget(s, hiddenEnemies[0].uid);
        } else {
          s = resolveVeilSeerChoiceHand(s);
        }
        s.pendingVeilSeerReveal = null;
      }
      return s;
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
      if (s.pendingDirectionSelect) {
        const pendingUnit = s.units.find(u => u.uid === s.pendingDirectionSelect.unitUid);
        const bestDir = pendingUnit ? _pickBestDirection(s, pendingUnit) : 'up';
        s = resolveLineBlast(s, s.pendingDirectionSelect.unitUid, bestDir);
        s.pendingDirectionSelect = null;
      } else if (s.pendingLineBlast) {
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

// ── Spell Value Ratings ───────────────────────────────────────────────────────

const SPELL_VALUES = {
  glimpse:           3,
  forgeweapon:       6,
  forge_weapon:      6,
  savagegrowth:      5,
  angelicblessing:   7,
  standfirm:         4,
  animus:            3,
  fortify:           4,
  rally:             6,
  crusade:           8,
  packhowl:          7,
  ironshield:        5,
  ironthorns:        5,
  martiallaw:        7,
  martial_law:       7,
  predatorsmark:     5,
  entangle:          4,
  petrify:           5,
  dominate:          6,
  mindseize:         5,
  shadowveil:        4,
  bloom:             2,
  overgrowth:        2,
  moonleaf:          2,
  ancientspring:     2,
  verdantsurge:      3,
  glitteringgift:    2,
  recall:            2,
  shadow_mend:       2,
  callofthesnakes:   5,
  grave_harvest:     4,
  seconddawn:        6,
  rebirth:           5,
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
  apexrampage:       7,
  consecrated_ground:  5,
  consecrating_strike: 4,
  divine_judgment:     5,
  fortify_the_crown:   5,
  oath_of_valor:       5,
  royal_decree:        4,
  thrones_judgment:    5,
};

function getSpellValue(cardUid, state, ap) {
  const card = state.players[ap].hand.find(c => c.uid === cardUid);
  if (!card) return 0;
  return SPELL_VALUES[card.id] ?? 0;
}

// ── Card Hold Logic ───────────────────────────────────────────────────────────

function shouldHoldCard(card, state, apIdx) {
  const ap = apIdx ?? state.activePlayer;
  const enemyIdx = 1 - ap;
  const myChamp  = state.champions[ap];
  const oppChamp = state.champions[enemyIdx];
  const key = card.effect ?? card.id;
  const myUnits = state.units.filter(u => u.owner === ap);
  const myCombatUnits = myUnits.filter(u => !u.isRelic && !u.isOmen);

  switch (key) {
    case 'apexrampage':
      return !myCombatUnits.some(u =>
        manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]) === 1
      );
    case 'angelicblessing': {
      const adjacentToCaster = myCombatUnits.filter(u =>
        manhattan([u.row, u.col], [myChamp.row, myChamp.col]) === 1
      );
      return !adjacentToCaster.some(u => (u.atk ?? 0) >= 3);
    }
    case 'tollofshadows': {
      const myRelicsOmens  = myUnits.filter(u => u.isRelic || u.isOmen).length;
      const oppRelicsOmens = state.units.filter(u => u.owner === enemyIdx && (u.isRelic || u.isOmen)).length;
      return oppRelicsOmens <= myRelicsOmens;
    }
    case 'crushingblow':
      return !state.units.some(u =>
        u.owner === enemyIdx && !u.isRelic && !u.isOmen &&
        manhattan([u.row, u.col], [myChamp.row, myChamp.col]) === 1
      );
    case 'verdantsurge':
      return myCombatUnits.length < 3;
    case 'seconddawn': {
      const grave = state.players[ap].grave ?? [];
      const combatInGrave = grave.filter(c => c.type === 'unit' && !c.token).length;
      return combatInGrave < 2;
    }
    case 'bloodmoon':
      return myCombatUnits.length < 3;
    default:
      return false;
  }
}

function shouldHoldChampionAbility(state, apIdx) {
  const ap = apIdx ?? state.activePlayer;
  const champ = state.champions[ap];
  if (champ.attribute !== 'mystic') return false;
  const hand = state.players[ap].hand ?? [];
  return !hand.some(c => c.type === 'spell' && (c.cost ?? 0) >= 4);
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
  cardsInHand:              10,
  hiddenUnits:               6,
  manaEfficiency:            2,
  lethalThreat:             35,
  championProximity:        10,
  opponentChampionLowHP:    30,
  relicsOnBoard:             4,
  omensOnBoard:              3,
  terrainBenefit:            3,
  terrainHarm:               3,
  healingValue:              0,
  projectedEnemyDamage:      4,
  allyCardValue:             3,
  enemyThreatValue:          4,
  trappedAllyPenalty:        5,
  highValueUnitActivity:     3,
  throneControlValue:       25,
  tradeEfficiency:           5,
  tileDenial:                6,
  projectedChampionDamage:  20,
  boardCentrality:           4,
  turnAggressionScale:    0.08,
};

export const FACTION_WEIGHTS = {
  primal: { ...WEIGHTS },
  mystic: { ...WEIGHTS, throneControlValue: 30 },
  light:  { ...WEIGHTS },
  dark:   { ...WEIGHTS },
};

function getPhase(turn) {
  if (turn <= 5)  return 'early';
  if (turn <= 12) return 'mid';
  return 'late';
}

function applyPhaseModifiers(w, faction, phase) {
  const pw = { ...w };
  if (phase === 'early') {
    if (faction !== 'primal') {
      pw.unitsThreateningChampion = Math.round(w.unitsThreateningChampion * 0.5);
      pw.championProximity        = Math.round(w.championProximity        * 0.5);
      pw.totalATKOnBoard          = Math.round(w.totalATKOnBoard          * 0.8);
    }
    pw.unitCountDiff = Math.round(w.unitCountDiff * 1.4);
    pw.cardsInHand   = Math.round(w.cardsInHand   * 1.3);
  }
  if (phase === 'mid') {
    switch (faction) {
      case 'primal':
        pw.unitsThreateningChampion = Math.round(w.unitsThreateningChampion * 1.4);
        pw.championProximity        = Math.round(w.championProximity        * 1.3);
        break;
      case 'mystic':
        pw.healingValue = Math.round(w.healingValue * 1.5);
        pw.cardsInHand  = Math.round(w.cardsInHand  * 1.3);
        break;
      case 'light':
        pw.unitsAdjacentToAlly = Math.round(w.unitsAdjacentToAlly * 1.5);
        pw.unitCountDiff       = Math.round(w.unitCountDiff       * 1.2);
        break;
      case 'dark':
        pw.cardsInHand = Math.round(w.cardsInHand * 1.4);
        pw.hiddenUnits = Math.round(w.hiddenUnits * 1.5);
        break;
    }
  }
  if (phase === 'late') {
    pw.championHPDiff           = Math.round(w.championHPDiff           * 2.0);
    pw.unitsThreateningChampion = Math.round(w.unitsThreateningChampion * 1.5);
    pw.championProximity        = Math.round(w.championProximity        * 1.5);
    pw.lethalThreat             = Math.round(w.lethalThreat             * 1.5);
    if (faction === 'mystic') {
      pw.healingValue             = Math.round(w.healingValue             * 0.3);
      pw.unitsThreateningChampion = 18;
    }
  }
  return pw;
}

function computeGameLengthPenalty(faction, turnNumber) {
  switch (faction) {
    case 'primal':
      if (turnNumber <= 8)  return 0;
      if (turnNumber <= 18) return (turnNumber - 8)  * -2;
      return -20 + (turnNumber - 18) * -5;
    case 'mystic':
      if (turnNumber <= 14) return 0;
      if (turnNumber <= 24) return (turnNumber - 14) * -2;
      return -20 + (turnNumber - 24) * -5;
    default:
      if (turnNumber <= 10) return 0;
      if (turnNumber <= 20) return (turnNumber - 10) * -2;
      return -20 + (turnNumber - 20) * -5;
  }
}

function resolveFactionWeights(faction, turnNumber) {
  const base  = FACTION_WEIGHTS[faction] ?? WEIGHTS;
  const phase = getPhase(turnNumber);
  return applyPhaseModifiers(base, faction, phase);
}

function evaluateBoard(gameState, playerId, weights = null) {
  if (!gameState) return 0;
  const ap = playerId === 'p1' ? 0 : 1;
  const op = 1 - ap;

  const myChamp  = gameState.champions[ap];
  const oppChamp = gameState.champions[op];
  const myUnits  = gameState.units.filter(u => u.owner === ap);
  const oppUnits = gameState.units.filter(u => u.owner === op);
  const myPlayer = gameState.players[ap];

  const turnNumber = gameState.turn ?? 0;
  const faction    = myChamp?.attribute ?? 'light';

  // Resolve weights: auto-detect faction if not explicitly provided
  let w;
  if (weights != null) {
    w = weights;
  } else {
    w = resolveFactionWeights(faction, turnNumber);
  }

  const championHP    = myChamp.hp;
  const healingValue  = myChamp.hp;
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

  const gameLength = computeGameLengthPenalty(faction, turnNumber);

  const championProximity = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return sum + Math.max(0, 5 - dist);
  }, 0);

  // Massive bonus to close out games when opponent champion is nearly dead.
  const opponentChampionLowHP = oppChamp.hp <= 3 ? 2 : (oppChamp.hp <= 5 ? 1 : 0);

  // allyCardValue: sum of allyValue ratings for my combat units on board.
  const myCombatUnits = myUnits.filter(u => !u.isRelic && !u.isOmen);
  const allyCardValue = myCombatUnits.reduce((sum, u) => {
    return sum + getCardRating(u.id, 'ally', u.cost ?? 4);
  }, 0);

  // enemyThreatValue: sum of threatValue ratings for enemy combat units on board (negative).
  const oppCombatUnits = oppUnits.filter(u => !u.isRelic && !u.isOmen);
  const enemyThreatValue = -oppCombatUnits.reduce((sum, u) => {
    return sum + getCardRating(u.id, 'threat', u.cost ?? 4);
  }, 0);

  // trappedAllyPenalty: penalise when a high-value friendly unit is trapped in a Gilded Cage.
  // A cage relic is owned by the caster (opponent); the trapped unit belongs to us.
  let trappedAllyPenaltyValue = 0;
  for (const u of oppUnits) {
    if (u.id === 'gildedcage_relic' && u.trappedUnit && u.trappedUnit.owner === ap) {
      const rating = getCardRating(u.trappedUnit.id, 'ally', u.trappedUnit.cost ?? 4);
      trappedAllyPenaltyValue -= rating * (w.trappedAllyPenalty ?? 5) / 10;
    }
  }

  // highValueUnitActivity: penalise idle high-value friendly units that are far from any target.
  // A unit is "idle" if it has not moved and was not just summoned this turn.
  let highValueIdlePenalty = 0;
  for (const u of myCombatUnits) {
    const allyVal = getCardRating(u.id, 'ally', u.cost ?? 4);
    if (allyVal < 7) continue;
    if (u.moved || u.summoned) continue;
    const distToEnemy = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    const nearEnemyUnit = oppUnits.some(eu =>
      manhattan([u.row, u.col], [eu.row, eu.col]) <= 2
    );
    if (distToEnemy > 2 && !nearEnemyUnit) {
      highValueIdlePenalty -= (allyVal - 6) * (w.highValueUnitActivity ?? 3) / 10;
    }
  }

  // tradeEfficiency: reward favorable trades available this turn.
  let tradeEfficiencyValue = 0;
  for (const attacker of myCombatUnits) {
    for (const defender of oppCombatUnits) {
      const dist = manhattan([attacker.row, attacker.col], [defender.row, defender.col]);
      if (dist > (attacker.spd ?? 1)) continue;
      if ((attacker.atk ?? 0) >= (defender.hp ?? 1)) {
        const defenderThreat = getCardRating(defender.id, 'threat', defender.cost ?? 4);
        if ((defender.atk ?? 0) < (attacker.hp ?? 1)) {
          tradeEfficiencyValue += defenderThreat;
        } else {
          const attackerAlly = getCardRating(attacker.id, 'ally', attacker.cost ?? 4);
          tradeEfficiencyValue += defenderThreat - attackerAlly;
        }
      }
    }
  }

  // tileDenial: count friendly units adjacent to enemy champion (each blocks a summon tile).
  const adjToOppChamp = adjDirs
    .map(([dr, dc]) => [oppChamp.row + dr, oppChamp.col + dc])
    .filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);

  const tileDenialCount = adjToOppChamp.filter(([r, c]) =>
    myUnits.some(u => u.row === r && u.col === c)
  ).length;

  // championSurroundPressure: reward positions where friendly units adjacent to enemy champion
  // threaten a kill. Kill-threat × 15 (lethal) or × 8 (>half HP); pin-bonus when ≥2 adjacent.
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
      !gameState.units.some(u => u.row === r && u.col === c) &&
      !(gameState.champions[0].row === r && gameState.champions[0].col === c) &&
      !(gameState.champions[1].row === r && gameState.champions[1].col === c)
    ).length;
    pinBonus = (adjToOppChamp.length - emptyAdjTiles) * 4;
  }

  const championSurroundPressure = killThreatScore + pinBonus;

  // throneControlValue: throne positioning bonus (matches simulation boardEval).
  const myChampOnThrone = myChamp.row === THRONE_ROW && myChamp.col === THRONE_COL;
  const myUnitOnThrone  = myUnits.some(u => u.row === THRONE_ROW && u.col === THRONE_COL);
  const myPieceOnThrone = myChampOnThrone || myUnitOnThrone;

  let throneControlValue = 0;
  if (myChampOnThrone) {
    throneControlValue += 1.0;
  }
  if (myUnitOnThrone) {
    throneControlValue += 0.75;
    // Denial bonus: enemy champion within 2 tiles of throne
    const oppChampDistToThrone = manhattan([oppChamp.row, oppChamp.col], [THRONE_ROW, THRONE_COL]);
    if (oppChampDistToThrone <= 2) throneControlValue += 1.0;
    // Preparation bonus: own champion adjacent to throne
    const myChampAdjacentToThrone = adjDirs.some(
      ([dr, dc]) => myChamp.row + dr === THRONE_ROW && myChamp.col + dc === THRONE_COL
    );
    if (myChampAdjacentToThrone) throneControlValue += 0.5;
  }
  if (!myChampOnThrone) {
    const throneOccupied =
      gameState.units.some(u => u.row === THRONE_ROW && u.col === THRONE_COL) ||
      (gameState.champions[0].row === THRONE_ROW && gameState.champions[0].col === THRONE_COL) ||
      (gameState.champions[1].row === THRONE_ROW && gameState.champions[1].col === THRONE_COL);
    const champAdjacentToThrone = adjDirs.some(
      ([dr, dc]) => myChamp.row + dr === THRONE_ROW && myChamp.col + dc === THRONE_COL
    );
    if (champAdjacentToThrone && !throneOccupied) throneControlValue += 0.4;
    if (!myPieceOnThrone) {
      const champDistToCenter = manhattan([myChamp.row, myChamp.col], [THRONE_ROW, THRONE_COL]);
      throneControlValue += (4 - champDistToCenter) * 0.3;
    }
  }

  // projectedChampionDamage: ATK of friendly combat units with a clear cardinal path to enemy champion.
  const projectedChampionDamage = myCombatUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    if (dist > (u.spd ?? 1)) return sum;
    if (u.row === oppChamp.row) {
      const minC = Math.min(u.col, oppChamp.col);
      const maxC = Math.max(u.col, oppChamp.col);
      const blocked = gameState.units.some(
        other => other !== u && other.row === u.row && other.col > minC && other.col < maxC
      );
      return blocked ? sum : sum + (u.atk ?? 0);
    }
    if (u.col === oppChamp.col) {
      const minR = Math.min(u.row, oppChamp.row);
      const maxR = Math.max(u.row, oppChamp.row);
      const blocked = gameState.units.some(
        other => other !== u && other.col === u.col && other.row > minR && other.row < maxR
      );
      return blocked ? sum : sum + (u.atk ?? 0);
    }
    return sum;
  }, 0);

  // relicsOnBoard: count of friendly relics alive on the board.
  const relicsOnBoard = myUnits.filter(u => u.isRelic).length;

  // omensOnBoard: count of friendly omens alive on the board.
  const omensOnBoard = myUnits.filter(u => u.isOmen).length;

  // terrainBenefit / terrainHarm
  let terrainBenefit = 0;
  let terrainHarm = 0;
  if (gameState.terrainGrid) {
    for (const u of myUnits) {
      const t = gameState.terrainGrid[u.row]?.[u.col];
      if (t?.whileOccupied?.hpBuff && t.whileOccupied.friendlyOnly) terrainBenefit += 1;
    }
    for (const u of oppUnits) {
      const t = gameState.terrainGrid[u.row]?.[u.col];
      if (t?.whileOccupied?.atkDebuff) terrainHarm += 1;
      if (t?.onOccupy?.damage) terrainHarm += 0.5;
    }
  }

  // projectedEnemyDamage: total damage enemy units can deal to us over the next 2 turns.
  let projectedEnemyDamageTotal = 0;
  for (const eu of oppCombatUnits) {
    const atkVal = eu.atk ?? 0;
    if (atkVal <= 0) continue;
    const distToMyChamp = manhattan([eu.row, eu.col], [myChamp.row, myChamp.col]);
    if (distToMyChamp <= 1) {
      projectedEnemyDamageTotal += atkVal * 2;
    } else if (distToMyChamp <= (eu.spd ?? 1)) {
      projectedEnemyDamageTotal += atkVal * 1;
    } else if (myUnits.some(ally => manhattan([eu.row, eu.col], [ally.row, ally.col]) <= 1)) {
      projectedEnemyDamageTotal += atkVal * 1;
    } else {
      projectedEnemyDamageTotal += atkVal * 0.5;
    }
  }

  // boardCentrality: net (4 - distToCenter) sum across all friendly pieces minus all enemy pieces.
  const boardCentrality =
    (myUnits.reduce((sum, u) =>
      sum + Math.max(0, 4 - manhattan([u.row, u.col], [THRONE_ROW, THRONE_COL])), 0) +
     Math.max(0, 4 - manhattan([myChamp.row, myChamp.col], [THRONE_ROW, THRONE_COL]))) -
    (oppUnits.reduce((sum, u) =>
      sum + Math.max(0, 4 - manhattan([u.row, u.col], [THRONE_ROW, THRONE_COL])), 0) +
     Math.max(0, 4 - manhattan([oppChamp.row, oppChamp.col], [THRONE_ROW, THRONE_COL])));

  // Boss fight override for throne weight (live-specific feature).
  const effectiveThroneWeight = gameState.adventureBossFight ? 50 : (w.throneControlValue ?? 25);

  // Turn-scaling aggression multiplier: ramps up after turn 12 to push closing behaviour.
  const aggressionScale = w.turnAggressionScale ?? 0.08;
  const aggressionMult  = 1 + Math.max(0, turnNumber - 12) * aggressionScale;

  return (
    championHP               * w.championHP               +
    healingValue             * w.healingValue              +
    championHPDiff           * w.championHPDiff           +
    unitCountDiff            * w.unitCountDiff            +
    totalATKOnBoard          * w.totalATKOnBoard          +
    totalHPOnBoard           * w.totalHPOnBoard           +
    throneControl            * w.throneControl            +
    unitsThreateningChampion * w.unitsThreateningChampion * aggressionMult +
    unitsAdjacentToAlly      * w.unitsAdjacentToAlly      +
    cardsInHand              * w.cardsInHand              +
    hiddenUnits              * w.hiddenUnits              +
    manaEfficiency           * w.manaEfficiency           +
    lethalThreat             * w.lethalThreat             * aggressionMult +
    gameLength                                            +
    championProximity        * w.championProximity        * aggressionMult +
    opponentChampionLowHP    * w.opponentChampionLowHP    * aggressionMult +
    projectedChampionDamage  * (w.projectedChampionDamage ?? 20) +
    relicsOnBoard            * w.relicsOnBoard            +
    omensOnBoard             * w.omensOnBoard             +
    terrainBenefit           * w.terrainBenefit           +
    terrainHarm              * w.terrainHarm              +
    allyCardValue            * w.allyCardValue            +
    enemyThreatValue         * w.enemyThreatValue         +
    trappedAllyPenaltyValue                               +
    highValueIdlePenalty                                  +
    championSurroundPressure                              +
    throneControlValue       * effectiveThroneWeight      +
    tradeEfficiencyValue     * (w.tradeEfficiency ?? 5)   +
    tileDenialCount          * (w.tileDenial ?? 6)        +
    boardCentrality          * (w.boardCentrality ?? 4)   +
    -projectedEnemyDamageTotal * (w.projectedEnemyDamage ?? 4)
  );
}

// ── Action filtering (reduces branching factor) ────────────────────────────────

// Max non-endTurn candidates retained after priority sort.
const MAX_CANDIDATES = 6;

function actionPriority(action, state, enemyIdx, enemyChamp) {
  if (action.type === 'move') {
    const unit = state.units.find(u => u.uid === action.unitId);
    if (!unit) return 0;
    const [tr, tc] = action.targetTile;
    const hitsChamp = enemyChamp.row === tr && enemyChamp.col === tc;
    if (hitsChamp && unit.atk >= enemyChamp.hp) return 100;
    if (hitsChamp) return 80;
    const eu = state.units.find(u => u.owner === enemyIdx && u.row === tr && u.col === tc);
    if (eu && unit.atk >= eu.hp) return 70;
    if (eu) return 50;
    const curDist = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
    const newDist  = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
    if (newDist < curDist) return 30;
    return 10;
  }
  if (action.type === 'cast')           return 40;
  if (action.type === 'unitAction')     return 25;
  if (action.type === 'summon')         return 20;
  if (action.type === 'championMove')   return 15;

  if (action.type === 'championAbility') {
    const turn = state.turn ?? 0;
    const oppChampHP = enemyChamp.hp;
    const myIdx = 1 - enemyIdx;
    const myFaction = state.champions[myIdx]?.attribute ?? null;
    const myCombatUnits = state.units.filter(u => u.owner === myIdx && !u.isRelic && !u.isOmen).length;
    if (myFaction === 'mystic' && turn >= 15) return 0;
    if (oppChampHP <= 15 && myCombatUnits >= 2) return 1;
    if (turn >= 16) return 1;
    if (turn >= 9)  return 15;
    return 35;
  }

  // Unreachable second move block (Mystic closing boost) — preserved from sim for parity
  if (action.type === 'move') {
    const myIdx = 1 - enemyIdx;
    const myFaction = state.champions[myIdx]?.attribute ?? null;
    const turn = state.turn ?? 0;
    if (myFaction === 'mystic' && turn >= 13) {
      const unit = state.units.find(u => u.uid === action.unitId);
      if (unit) {
        const [tr, tc] = action.targetTile;
        const hitsChamp = enemyChamp.row === tr && enemyChamp.col === tc;
        if (hitsChamp && unit.atk >= enemyChamp.hp) return 100;
        if (hitsChamp) return 85;
        const curDist = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
        const newDist  = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
        if (newDist < curDist) return 45 + (unit.atk ?? 0);
      }
    }
  }

  return 5;
}

function filterActions(actions, state, commandsUsed) {
  const ap = state.activePlayer;
  const enemyIdx = 1 - ap;
  const enemyChamp = state.champions[enemyIdx];

  if (commandsUsed >= getCommandLimit(state, ap)) {
    actions = actions.filter(a => a.type !== 'move');
  }

  const hand = state.players[ap].hand;
  const unitCards = hand.filter(c => c.type === 'unit' && c.cost <= state.players[ap].resources);
  const minUnitCost = unitCards.length > 0
    ? Math.min(...unitCards.map(c => c.cost ?? 0))
    : Infinity;

  // Remove clearly bad moves first
  const candidate = actions.filter(action => {
    if (action.type === 'endTurn') return false;
    switch (action.type) {
      case 'move': {
        const unit = state.units.find(u => u.uid === action.unitId);
        if (!unit) return false;
        const [tr, tc] = action.targetTile;
        if (
          state.units.some(u => u.owner === enemyIdx && u.row === tr && u.col === tc) ||
          (enemyChamp.row === tr && enemyChamp.col === tc)
        ) return true;
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

  // Deduplicate summons: one tile per card — closest to enemy champion
  const seenCardUids = new Set();
  let deduped = candidate.filter(action => {
    if (action.type !== 'summon') return true;
    if (seenCardUids.has(action.cardUid)) return false;
    seenCardUids.add(action.cardUid);
    return true;
  });

  // Mystic closing: exclude champion ability after turn 15
  const myFaction = state.champions[ap]?.attribute ?? null;
  const curTurn   = state.turn ?? 0;
  if (myFaction === 'mystic' && curTurn >= 15) {
    deduped = deduped.filter(a => a.type !== 'championAbility');
  }

  // Partition: hold-list cards only fill slots if nothing better exists
  const isHeldAction = a => {
    if (a.type === 'championAbility') return shouldHoldChampionAbility(state, ap);
    if (a.type === 'cast' || a.type === 'summon') {
      const card = state.players[ap].hand.find(c => c.uid === a.cardUid);
      return card ? shouldHoldCard(card, state, ap) : false;
    }
    return false;
  };

  const primary = deduped.filter(a => !isHeldAction(a));
  const held    = deduped.filter(a =>  isHeldAction(a));

  const byPriority = (a, b) =>
    actionPriority(b, state, enemyIdx, enemyChamp) -
    actionPriority(a, state, enemyIdx, enemyChamp);

  primary.sort(byPriority);
  held.sort(byPriority);

  const primarySlice = primary.slice(0, MAX_CANDIDATES);
  const heldSlice    = held.slice(0, Math.max(0, MAX_CANDIDATES - primarySlice.length));

  // Spell insurance: inject highest-value spell if no cast in top candidates
  const alreadyHasSpell = primarySlice.some(a => a.type === 'cast') || heldSlice.some(a => a.type === 'cast');
  let extraSpells = [];
  if (!alreadyHasSpell) {
    const allCasts = [...primary, ...held].filter(a => a.type === 'cast');
    const bestBySpell = new Map();
    for (const a of allCasts) {
      const sv   = getSpellValue(a.cardUid, state, ap);
      const card = state.players[ap].hand.find(c => c.uid === a.cardUid);
      const cid  = card?.id ?? a.cardUid;
      const prev = bestBySpell.get(cid);
      if (!prev || sv > prev.spellValue) bestBySpell.set(cid, { action: a, spellValue: sv });
    }
    const ranked = [...bestBySpell.values()].sort((x, y) => y.spellValue - x.spellValue);
    extraSpells = ranked.slice(0, 2).map(e => e.action);
  }

  return [...primarySlice, ...heldSlice, ...extraSpells, { type: 'endTurn' }];
}

// ── Zobrist Hashing ───────────────────────────────────────────────────────────

const _zobristTable = new Map();
let   _zobristSeed  = 0x9e3779b9;

function _zobristRand() {
  _zobristSeed ^= _zobristSeed << 13;
  _zobristSeed ^= _zobristSeed >> 17;
  _zobristSeed ^= _zobristSeed << 5;
  return _zobristSeed >>> 0;
}

function _zn(key) {
  let v = _zobristTable.get(key);
  if (v === undefined) { v = _zobristRand(); _zobristTable.set(key, v); }
  return v;
}

function computeZobristHash(state, commandsUsed) {
  let h = 0;
  h ^= _zn(`ap:${state.activePlayer}`);
  h ^= _zn(`t:${state.turn ?? 0}`);
  h ^= _zn(`cmd:${commandsUsed ?? 0}`);
  for (const unit of state.units) {
    h ^= _zn(`u:${unit.uid}:${unit.row * 5 + unit.col}:${Math.round(unit.hp ?? 0)}`);
  }
  for (let i = 0; i < state.champions.length; i++) {
    const c = state.champions[i];
    h ^= _zn(`c:${i}:${c.row}:${c.col}:${Math.round(c.hp ?? 0)}`);
  }
  for (let i = 0; i < state.players.length; i++) {
    h ^= _zn(`r:${i}:${state.players[i].resources ?? 0}`);
  }
  return h >>> 0;
}

function getStateHash(state, commandsUsed) {
  const cmd = commandsUsed ?? 0;
  if (state._zh !== undefined && state._zhCmd === cmd) return state._zh;
  state._zh    = computeZobristHash(state, cmd);
  state._zhCmd = cmd;
  return state._zh;
}

// ── Transposition Table ───────────────────────────────────────────────────────

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;
const TT_MAX_SIZE = 1_000_000;

function ttLookup(tt, hash, depth, alpha, beta) {
  const e = tt.get(hash);
  if (!e) return null;
  if (e.depth >= depth) {
    if (e.flag === TT_EXACT)                     return { score: e.score, action: e.action };
    if (e.flag === TT_LOWER && e.score >= beta)  return { score: e.score, action: e.action };
    if (e.flag === TT_UPPER && e.score <= alpha) return { score: e.score, action: e.action };
  }
  return { score: null, action: e.action };
}

function ttStore(tt, hash, depth, score, flag, action) {
  const e = tt.get(hash);
  if (e && e.depth > depth) return;
  if (tt.size >= TT_MAX_SIZE && !e) return;
  tt.set(hash, { depth, score, flag, action });
}

// ── Capture Detection ─────────────────────────────────────────────────────────

function isCapture(action, state) {
  const ap         = state.activePlayer;
  const enemyIdx   = 1 - ap;
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

// ── Move Ordering ─────────────────────────────────────────────────────────────

function quickEvalOrder(state, playerId) {
  const ap = playerId === 'p1' ? 0 : 1;
  const op = 1 - ap;
  const myChamp   = state.champions[ap];
  const oppChamp  = state.champions[op];
  const myUnits   = state.units.filter(u => u.owner === ap);
  const oppUnits  = state.units.filter(u => u.owner === op);

  const championHP    = myChamp.hp * 5;
  const unitCountDiff = (myUnits.length - oppUnits.length) * 8;

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

  const adjDirsLocal = [[-1,0],[1,0],[0,-1],[0,1]];
  const adjToOppChamp = adjDirsLocal
    .map(([dr, dc]) => [oppChamp.row + dr, oppChamp.col + dc])
    .filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);
  const adjFriendlyUnits = myUnits.filter(u =>
    adjToOppChamp.some(([r, c]) => u.row === r && u.col === c)
  );
  const adjATKSum = adjFriendlyUnits.reduce((s, u) => s + (u.atk ?? 0), 0);
  const netKillPressure = adjATKSum - oppChamp.hp;
  let killThreatScore = 0;
  if (netKillPressure > 0)             killThreatScore = netKillPressure * 15;
  else if (adjATKSum > oppChamp.hp / 2) killThreatScore = adjATKSum * 8;
  let pinBonus = 0;
  if (adjFriendlyUnits.length >= 2) {
    const emptyAdjTiles = adjToOppChamp.filter(([r, c]) =>
      !state.units.some(u => u.row === r && u.col === c) &&
      !(state.champions[0].row === r && state.champions[0].col === c) &&
      !(state.champions[1].row === r && state.champions[1].col === c)
    ).length;
    pinBonus = (adjToOppChamp.length - emptyAdjTiles) * 4;
  }

  const cardsInHand = (state.players[ap].hand?.length ?? 0) * 10;

  return championHP + unitCountDiff + projectedChampionDamage + killThreatScore + pinBonus + cardsInHand;
}

// ── Killer Move Heuristic ─────────────────────────────────────────────────────

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
      return true;
    default:
      return false;
  }
}

function encodeKiller(action) {
  return { type: action.type, unitId: action.unitId, targetTile: action.targetTile,
           cardUid: action.cardUid, row: action.row, col: action.col };
}

function recordKiller(killers, depth, action) {
  if (action.type === 'endTurn') return;
  if (!killers[depth]) killers[depth] = [];
  const slot = killers[depth];
  if (slot.some(k => matchesKiller(action, k))) return;
  if (slot.length >= 2) slot.shift();
  slot.push(encodeKiller(action));
}

function applyKillers(actions, killers, depth) {
  const killerList = killers[depth] ?? [];
  if (killerList.length === 0) return actions;
  const killerMatches = [];
  const rest = [];
  for (const action of actions) {
    if (killerList.some(k => matchesKiller(action, k))) killerMatches.push(action);
    else rest.push(action);
  }
  return [...killerMatches, ...rest];
}

// ── History Heuristic ─────────────────────────────────────────────────────────

const HISTORY_ACTION_KEYS = ['cast', 'summon', 'championMove', 'championAbility', 'unitAction', 'endTurn'];
const HISTORY_ACTION_IDX  = Object.fromEntries(HISTORY_ACTION_KEYS.map((k, i) => [k, i]));

function makeHistoryTables() {
  return {
    tileMoves: Array.from({ length: 25 }, () => new Float64Array(25)),
    types:     new Float64Array(HISTORY_ACTION_KEYS.length),
  };
}

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
    const champ = state.champions[state.activePlayer];
    const from  = champ.row * 5 + champ.col;
    const to    = action.row * 5 + action.col;
    return history.tileMoves[from][to];
  }
  return history.types[HISTORY_ACTION_IDX[action.type] ?? 0];
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
    const champ = state.champions[state.activePlayer];
    const from  = champ.row * 5 + champ.col;
    const to    = action.row * 5 + action.col;
    _historyApply(history.tileMoves[from], to, bonus);
    return;
  }
  _historyApply(history.types, HISTORY_ACTION_IDX[action.type] ?? 0, bonus);
}

// ── Quiescence Search ─────────────────────────────────────────────────────────

const Q_MAX_DEPTH    = 12;
const Q_DELTA_MARGIN = 200;

function generateCaptures(state, ap) {
  const enemyIdx   = 1 - ap;
  const myChamp    = state.champions[ap];
  const enemyChamp = state.champions[enemyIdx];
  const captures   = [];
  const dirs       = [[-1,0],[1,0],[0,-1],[0,1]];

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

      // 2. Defensive: kill-eligible enemy unit adjacent to the friendly champion
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

  // 3. Champion attacks on enemy champion only
  for (const [dr, dc] of dirs) {
    const tr = myChamp.row + dr;
    const tc = myChamp.col + dc;
    if (tr < 0 || tr >= 5 || tc < 0 || tc >= 5) continue;
    if (enemyChamp.row === tr && enemyChamp.col === tc) {
      captures.push({ type: 'championMove', row: tr, col: tc, _victimThreat: 300, _attackerAlly: 0 });
    }
  }

  captures.sort((a, b) =>
    (b._victimThreat - b._attackerAlly * 0.1) - (a._victimThreat - a._attackerAlly * 0.1)
  );
  return captures;
}

function quiescenceSearch(state, alpha, beta, qdepth, maximizing, playerId, weights, tt, stats, deadline) {
  stats.qNodes = (stats.qNodes ?? 0) + 1;
  if (deadline && performance.now() > deadline.time) {
    return { score: scoreState(state, playerId, weights) };
  }
  const { over } = isGameOver(state);
  if (over) return { score: scoreState(state, playerId, weights) };

  const hash     = getStateHash(state, 0);
  const ttResult = ttLookup(tt, hash, 0, alpha, beta);
  if (ttResult !== null && ttResult.score !== null) return { score: ttResult.score };

  const staticEval = scoreState(state, playerId, weights);

  if (maximizing) {
    if (staticEval >= beta) { ttStore(tt, hash, 0, staticEval, TT_LOWER, null); return { score: staticEval }; }
    if (staticEval > alpha) alpha = staticEval;
    if (qdepth <= 0) { ttStore(tt, hash, 0, staticEval, TT_EXACT, null); return { score: staticEval }; }

    const captures = generateCaptures(state, state.activePlayer);
    if (captures.length === 0) { ttStore(tt, hash, 0, staticEval, TT_EXACT, null); return { score: staticEval }; }

    let best = staticEval;
    for (const cap of captures) {
      if (cap._victimThreat < 300 && staticEval + cap._victimThreat + Q_DELTA_MARGIN < alpha) continue;
      const ns = applyAction(state, cap);
      const result = quiescenceSearch(ns, alpha, beta, qdepth - 1, maximizing, playerId, weights, tt, stats, deadline);
      if (result.score > best) best = result.score;
      if (result.score > alpha) alpha = result.score;
      if (alpha >= beta) { ttStore(tt, hash, 0, best, TT_LOWER, null); return { score: best }; }
    }
    ttStore(tt, hash, 0, best, best > staticEval ? TT_EXACT : TT_UPPER, null);
    return { score: best };

  } else {
    if (staticEval <= alpha) { ttStore(tt, hash, 0, staticEval, TT_UPPER, null); return { score: staticEval }; }
    if (staticEval < beta) beta = staticEval;
    if (qdepth <= 0) { ttStore(tt, hash, 0, staticEval, TT_EXACT, null); return { score: staticEval }; }

    const captures = generateCaptures(state, state.activePlayer);
    if (captures.length === 0) { ttStore(tt, hash, 0, staticEval, TT_EXACT, null); return { score: staticEval }; }

    let best = staticEval;
    for (const cap of captures) {
      if (cap._victimThreat < 300 && staticEval - cap._victimThreat - Q_DELTA_MARGIN > beta) continue;
      const ns = applyAction(state, cap);
      const result = quiescenceSearch(ns, alpha, beta, qdepth - 1, maximizing, playerId, weights, tt, stats, deadline);
      if (result.score < best) best = result.score;
      if (result.score < beta) beta = result.score;
      if (alpha >= beta) { ttStore(tt, hash, 0, best, TT_UPPER, null); return { score: best }; }
    }
    ttStore(tt, hash, 0, best, best < staticEval ? TT_EXACT : TT_LOWER, null);
    return { score: best };
  }
}

// ── Minimax ───────────────────────────────────────────────────────────────────

const WIN_BONUS = 500;

function scoreState(gameState, playerId, weights) {
  const { over, winner } = isGameOver(gameState);
  const base = evaluateBoard(gameState, playerId, weights ?? null);
  if (over) return winner === playerId ? base + WIN_BONUS : base - WIN_BONUS;
  return base;
}

/**
 * Minimax with alpha-beta, TT, PVS, killer heuristic, history heuristic, and quiescence.
 *
 * Depth semantics: decrements by 1 on every action. Perspective flips only on endTurn.
 * At depth 0, quiescence search resolves tactical captures before returning.
 */
function minimax(gameState, depth, alpha, beta, maximizingPlayer, playerId, commandsUsed, weights, deadline, killers, tt, history, stats) {
  if (performance.now() > deadline.time) {
    return { score: scoreState(gameState, playerId, weights), action: null, timedOut: true };
  }

  const { over } = isGameOver(gameState);
  if (over) return { score: scoreState(gameState, playerId, weights), action: null };

  if (depth === 0) {
    const qResult = quiescenceSearch(
      gameState, alpha, beta, Q_MAX_DEPTH,
      maximizingPlayer, playerId, weights, tt, stats, deadline
    );
    return { score: qResult.score, action: null };
  }

  // TT lookup
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

  if (filtered.length === 0) return { score: scoreState(gameState, playerId, weights), action: null };

  // Move ordering: TT best → killers → captures (by quickEvalOrder) → quiet (by history + spell value) → endTurn
  const orderingPlayer = gameState.activePlayer === 0 ? 'p1' : 'p2';
  const endTurnActions = filtered.filter(a => a.type === 'endTurn');
  const nonEndTurn     = filtered.filter(a => a.type !== 'endTurn');
  const captureActions = nonEndTurn.filter(a =>  isCapture(a, gameState));
  const quietActions   = nonEndTurn.filter(a => !isCapture(a, gameState));

  const capScores = new Map();
  for (const a of captureActions) {
    capScores.set(a, quickEvalOrder(applyAction(gameState, a), orderingPlayer));
  }
  captureActions.sort((a, b) => (capScores.get(b) ?? 0) - (capScores.get(a) ?? 0));

  const quietScores = new Map();
  for (const a of quietActions) {
    const h  = historyScore(history, a, gameState);
    const q  = quickEvalOrder(applyAction(gameState, a), orderingPlayer);
    const sv = a.type === 'cast'
      ? getSpellValue(a.cardUid, gameState, gameState.activePlayer) * 100
      : 0;
    quietScores.set(a, h * 10 + sv + q);
  }
  quietActions.sort((a, b) => (quietScores.get(b) ?? 0) - (quietScores.get(a) ?? 0));

  let actions = [...captureActions, ...quietActions, ...endTurnActions];
  actions = applyKillers(actions, killers, depth);
  if (ttBestAction) {
    const idx = actions.findIndex(a => matchesKiller(a, ttBestAction));
    if (idx > 0) actions = [actions[idx], ...actions.slice(0, idx), ...actions.slice(idx + 1)];
  }

  const originalAlpha = alpha;
  const histBonus     = depth * depth;

  if (maximizingPlayer) {
    let best       = { score: -Infinity, action: null };
    let firstChild = true;
    const triedQuiet = [];

    // Fix 3: pre-compute enemy HP for cast action bonus (AOE/damage spells)
    const enemyIdxForBonus    = 1 - gameState.activePlayer;
    const enemyChampHPBefore  = gameState.champions[enemyIdxForBonus]?.hp ?? 0;
    const enemyUnitHPBefore   = gameState.units
      .filter(u => u.owner === enemyIdxForBonus && !u.isRelic && !u.isOmen)
      .reduce((s, u) => s + (u.hp ?? 0), 0);

    for (const action of actions) {
      const newState  = applyAction(gameState, action);
      if (!newState) { console.warn('[strategicAI] applyAction returned null:', action.type); continue; }
      const isEndTurn        = action.type === 'endTurn';
      const nextDepth        = depth - 1;
      const nextMaximizing   = isEndTurn ? false : true;
      const nextCommandsUsed = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

      let result;
      if (firstChild) {
        result = minimax(newState, nextDepth, alpha, beta, nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats);
        firstChild = false;
      } else {
        result = minimax(newState, nextDepth, alpha, alpha + 1, nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats);
        if (!result.timedOut && result.score > alpha && result.score < beta) {
          result = minimax(newState, nextDepth, alpha, beta, nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats);
        }
      }

      if (result.timedOut) {
        if (best.action === null) best = { score: result.score, action, timedOut: true };
        return best;
      }

      // Fix 3: reward cast actions by total enemy HP removed (AOE/damage spells).
      let actionBonus = 0;
      if (action.type === 'cast') {
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

      if (adjustedScore > best.score) best = { score: adjustedScore, action };
      alpha = Math.max(alpha, adjustedScore);

      if (beta <= alpha) {
        recordKiller(killers, depth, action);
        if (!isCapture(action, gameState) && action.type !== 'endTurn') {
          historyRecord(history, action, gameState, histBonus);
          for (const q of triedQuiet) historyRecord(history, q, gameState, -histBonus);
        }
        ttStore(tt, hash, depth, best.score, TT_LOWER, best.action);
        return best;
      }
      if (!isCapture(action, gameState) && action.type !== 'endTurn') triedQuiet.push(action);
    }

    const flag = best.score > originalAlpha ? TT_EXACT : TT_UPPER;
    ttStore(tt, hash, depth, best.score, flag, best.action);
    return best;

  } else {
    let best          = { score: Infinity, action: null };
    const originalBeta = beta;
    let firstChild    = true;
    const triedQuiet  = [];

    for (const action of actions) {
      const newState  = applyAction(gameState, action);
      if (!newState) { console.warn('[strategicAI] applyAction returned null:', action.type); continue; }
      const isEndTurn        = action.type === 'endTurn';
      const nextDepth        = depth - 1;
      const nextMaximizing   = isEndTurn ? true : false;
      const nextCommandsUsed = isEndTurn ? 0 : (action.type === 'move' ? commandsUsed + 1 : commandsUsed);

      let result;
      if (firstChild) {
        result = minimax(newState, nextDepth, alpha, beta, nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats);
        firstChild = false;
      } else {
        result = minimax(newState, nextDepth, beta - 1, beta, nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats);
        if (!result.timedOut && result.score < beta && result.score > alpha) {
          result = minimax(newState, nextDepth, alpha, beta, nextMaximizing, playerId, nextCommandsUsed, weights, deadline, killers, tt, history, stats);
        }
      }

      if (result.timedOut) {
        if (best.action === null) best = { score: result.score, action, timedOut: true };
        return best;
      }
      if (result.score < best.score) best = { score: result.score, action };
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
      if (!isCapture(action, gameState) && action.type !== 'endTurn') triedQuiet.push(action);
    }

    const flag = best.score < originalBeta ? TT_EXACT : TT_LOWER;
    ttStore(tt, hash, depth, best.score, flag, best.action);
    return best;
  }
}

// ── Diagnostic logging ────────────────────────────────────────────────────────

let _aiDebugEnabled = false;
let _spellAuditEnabled = false;
let _tradeDecisionLogEnabled = false;

/**
 * Enable/disable verbose AI decision logging.
 * When enabled, chooseActionStrategic logs every turn's context and chosen action.
 */
export function setAIDebug(enabled) { _aiDebugEnabled = enabled; }
export function getAIDebug() { return _aiDebugEnabled; }

/**
 * Enable/disable spell audit logging.
 * When enabled, chooseActionStrategic emits a [SPELL_AUDIT] JSON line per decision
 * recording which spells were in hand and whether a spell was cast.
 */
export function setSpellAudit(enabled) { _spellAuditEnabled = enabled; }
export function setTradeDecisionLog(enabled) { _tradeDecisionLogEnabled = enabled; }

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
 * Choose the best action for the live game AI using iterative deepening minimax with
 * alpha-beta pruning, transposition table, PVS, killer heuristic, history heuristic,
 * and quiescence search at leaf nodes.
 *
 * Time budget: 500ms per decision. TT, killers, and history are fresh per call and
 * shared across ID iterations so depth-N results seed depth-(N+1).
 *
 * @param {object} gameState    - current game state
 * @param {number} commandsUsed - move actions taken this turn (default: read from state)
 * @returns {object}             action object to apply
 */
export function chooseActionStrategic(gameState, commandsUsed) {
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

  // Fresh TT, killers, and history per decision. Shared across ID iterations.
  const tt      = new Map();
  const killers = {};
  const history = makeHistoryTables();
  const stats   = { ttLookups: 0, ttHits: 0, qNodes: 0 };
  const deadline = { time: performance.now() + 500 };

  // Resolve faction weights once per decision; pass through the entire search tree.
  const myChampForWeights = gameState.champions[ap];
  const faction    = myChampForWeights?.attribute ?? 'light';
  const turnNumber = gameState.turn ?? 0;
  const weights    = resolveFactionWeights(faction, turnNumber);

  let bestAction   = null;
  let depthReached = 0;

  for (let d = 1; d <= 20; d++) {
    if (performance.now() >= deadline.time) break;

    const result = minimax(
      gameState, d, -Infinity, Infinity,
      true, playerId, cmds, weights, deadline, killers, tt, history, stats
    );

    if (result.timedOut) {
      if (bestAction === null && result.action !== null) {
        bestAction   = result.action;
        depthReached = d;
      }
      break;
    }

    if (result.action !== null) {
      bestAction   = result.action;
      depthReached = d;
    }
  }

  if (bestAction === null) {
    const actions = getLegalActions(gameState);
    const fallback = actions[0] ?? { type: 'endTurn' };
    aiLog(`   → FALLBACK (no result): ${describeAction(fallback, gameState)}`);
    if (_spellAuditEnabled) _emitSpellAudit(gameState, ap, fallback);
    _emitTradeDecision(gameState, ap, playerId, fallback, preActions, 0);
    return fallback;
  }

  aiLog(`   → CHOSEN (depth ${depthReached}): ${describeAction(bestAction, gameState)}`);
  if (_spellAuditEnabled) _emitSpellAudit(gameState, ap, bestAction);
  _emitTradeDecision(gameState, ap, playerId, bestAction, preActions, depthReached);
  return bestAction;
}

function _evalBoardTerms(gameState, playerId) {
  if (!gameState) return { _total: 0 };
  const ap = playerId === 'p1' ? 0 : 1;
  const op = 1 - ap;
  const myChamp  = gameState.champions[ap];
  const oppChamp = gameState.champions[op];
  const myUnits  = gameState.units.filter(u => u.owner === ap);
  const oppUnits = gameState.units.filter(u => u.owner === op);
  const myPlayer = gameState.players[ap];

  const myCombatUnits  = myUnits.filter(u => !u.isRelic && !u.isOmen);
  const oppCombatUnits = oppUnits.filter(u => !u.isRelic && !u.isOmen);

  const championHP     = myChamp.hp;
  const championHPDiff = myChamp.hp - oppChamp.hp;
  const unitCountDiff  = myUnits.length - oppUnits.length;

  const lethalThreat = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return dist <= (u.spd ?? 1) ? sum + (u.atk ?? 0) : sum;
  }, 0);

  const allyCardValue = myCombatUnits.reduce((sum, u) =>
    sum + getCardRating(u.id, 'ally', u.cost ?? 4), 0);
  const enemyThreatValue = -oppCombatUnits.reduce((sum, u) =>
    sum + getCardRating(u.id, 'threat', u.cost ?? 4), 0);

  let tradeEfficiencyValue = 0;
  for (const attacker of myCombatUnits) {
    for (const defender of oppCombatUnits) {
      const dist = manhattan([attacker.row, attacker.col], [defender.row, defender.col]);
      if (dist > (attacker.spd ?? 1)) continue;
      if ((attacker.atk ?? 0) >= (defender.hp ?? 1)) {
        const defenderThreat = getCardRating(defender.id, 'threat', defender.cost ?? 4);
        if ((defender.atk ?? 0) < (attacker.hp ?? 1)) {
          tradeEfficiencyValue += defenderThreat;
        } else {
          const attackerAlly = getCardRating(attacker.id, 'ally', attacker.cost ?? 4);
          tradeEfficiencyValue += defenderThreat - attackerAlly;
        }
      }
    }
  }

  const unitsThreateningChampion = myUnits.filter(u =>
    manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]) <= 2
  ).length;

  const championProximity = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return sum + Math.max(0, 5 - dist);
  }, 0);

  const total = scoreState(gameState, playerId);

  return {
    championHP,
    championHPDiff,
    unitCountDiff,
    lethalThreat,
    allyCardValue,
    enemyThreatValue,
    tradeEfficiencyValue,
    unitsThreateningChampion,
    championProximity,
    _total: total,
  };
}

function _emitTradeDecision(gameState, ap, playerId, bestAction, legalActions, depthReached) {
  if (!_tradeDecisionLogEnabled) return;

  const moveActions = legalActions.filter(a => a.type === 'move');
  if (moveActions.length === 0) return;

  const enemyIdx = 1 - ap;

  const candidates = moveActions.map(a => {
    const ns = applyAction(gameState, a);
    const terms = _evalBoardTerms(ns, playerId);
    const unit = gameState.units.find(u => u.uid === a.unitId);
    return {
      action: describeAction(a, gameState),
      score: terms._total,
      evalTerms: terms,
      unitId: a.unitId,
      unitName: unit?.name ?? a.unitId,
    };
  });
  candidates.sort((a, b) => b.score - a.score);

  let selectedUnit = null;
  let enemiesInRange = [];
  if (bestAction.type === 'move') {
    const unit = gameState.units.find(u => u.uid === bestAction.unitId);
    if (unit) {
      selectedUnit = { id: unit.id, name: unit.name, atk: unit.atk, hp: unit.hp, row: unit.row, col: unit.col };
      const spd = unit.spd ?? 1;
      const enemyPieces = [
        ...gameState.units.filter(u => u.owner === enemyIdx).map(u => ({
          id: u.id, name: u.name ?? u.id, atk: u.atk, hp: u.hp, row: u.row, col: u.col,
        })),
        { id: 'champion', name: gameState.champions[enemyIdx].id ?? 'champion',
          atk: gameState.champions[enemyIdx].atk ?? 0, hp: gameState.champions[enemyIdx].hp,
          row: gameState.champions[enemyIdx].row, col: gameState.champions[enemyIdx].col },
      ];
      enemiesInRange = enemyPieces
        .filter(e => manhattan([unit.row, unit.col], [e.row, e.col]) <= spd)
        .map(e => ({ ...e, wouldDieFromAttack: (unit.atk ?? 0) >= (e.hp ?? 1) }));
    }
  }

  const entry = {
    type: 'TRADE_DECISION',
    turn: gameState.turn ?? 0,
    activePlayer: playerId,
    selectedUnit,
    enemiesInRange,
    top3Candidates: candidates.slice(0, 3).map(c => ({
      action: c.action,
      score: c.score,
      evalTerms: c.evalTerms,
    })),
    actionSelected: describeAction(bestAction, gameState),
    actionSelectedType: bestAction.type,
    depthReached,
  };

  console.log('[TRADE_DECISION] ' + JSON.stringify(entry));
}

function _emitSpellAudit(gameState, ap, chosenAction) {
  const p = gameState.players[ap];
  const spellsInHand = p.hand.filter(c => c.type === 'spell').map(c => c.id);
  const candidateActions = getLegalActions(gameState);
  const hasSpellCandidate = candidateActions.some(a => a.type === 'cast');
  const isCast = chosenAction.type === 'cast';
  let spellCast = null;
  if (isCast) {
    const card = p.hand.find(c => c.uid === chosenAction.cardUid);
    if (card) spellCast = { id: card.id, name: card.name, cost: card.cost };
  }
  console.log('[SPELL_AUDIT] ' + JSON.stringify({
    chosen: isCast ? 'cast' : chosenAction.type,
    spellCast,
    spellsInHand,
    hasSpellCandidate,
  }));
}

// ── Mulligan heuristic ────────────────────────────────────────────────────────
// Curve-aware mulligan. Returns the hand indices the AI wants to replace.
// Goals: ensure a playable card on turns 1–3, keep at most 1 spell.
export function chooseMulligan(hand) {
  const toMulligan = new Set();
  const isUnit = card => card.type === 'unit';

  // Rule 4: Always mulligan cards costing 5 or more.
  hand.forEach((card, idx) => { if (card.cost >= 5) toMulligan.add(idx); });

  // Rule 5: Mulligan cost-4 cards unless the hand already has cost 1, 2, AND 3.
  const hasCost1 = hand.some(c => c.cost === 1);
  const hasCost2 = hand.some(c => c.cost === 2);
  const hasCost3 = hand.some(c => c.cost === 3);
  if (!(hasCost1 && hasCost2 && hasCost3)) {
    hand.forEach((card, idx) => { if (card.cost === 4) toMulligan.add(idx); });
  }

  // Classify original hand (used for rules 2 and 3).
  const handUnits = hand.filter(c => isUnit(c));
  const hasLowCostUnit = handUnits.some(c => c.cost <= 2);

  if (handUnits.length === 0) {
    // Rule 2: Zero units — mulligan all spells costing 3 or more.
    hand.forEach((card, idx) => { if (!isUnit(card) && card.cost >= 3) toMulligan.add(idx); });
  } else if (!hasLowCostUnit) {
    // Rule 3: Has units but none at cost 1–2 — mulligan highest-cost kept cards
    // in descending order until a cost 1–2 card is encountered.
    const sortedKept = hand
      .map((card, idx) => ({ card, idx }))
      .filter(({ idx }) => !toMulligan.has(idx))
      .sort((a, b) => b.card.cost - a.card.cost);
    for (const { card, idx } of sortedKept) {
      if (card.cost <= 2) break; // reached a low-cost card — stop
      toMulligan.add(idx);
    }
  }

  // Rule 7: Keep at most 1 spell; mulligan highest-cost extras.
  const keptSpells = hand
    .map((card, idx) => ({ card, idx }))
    .filter(({ card, idx }) => !isUnit(card) && !toMulligan.has(idx))
    .sort((a, b) => b.card.cost - a.card.cost);
  for (let i = 0; i < keptSpells.length - 1; i++) toMulligan.add(keptSpells[i].idx);

  // Rule 6: Never mulligan a cost-1 unit (override all other rules).
  hand.forEach((card, idx) => { if (isUnit(card) && card.cost === 1) toMulligan.delete(idx); });

  return [...toMulligan];
}
