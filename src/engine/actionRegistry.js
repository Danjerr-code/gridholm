import { destroyUnit, restoreHP, addLog, applyDamageToUnit, manhattan, drawCard } from './gameEngine.js';
import { fireTrigger, dealNonCombatDamageToEnemyChampion } from './triggerRegistry.js';
import { DECKS, CARD_DB } from './cards.js';

function unitTypes(u) {
  if (!u) return [];
  const ut = u.unitType;
  if (!Array.isArray(ut)) {
    return ut ? [ut] : [];
  }
  return ut;
}

// ============================================
// ACTION REGISTRY
// Maps unit IDs to their action resolver functions.
// Each resolver takes (unit, state, targets) and returns new state.
// unit: the unit using the action
// state: full game state (already cloned by caller)
// targets: array of selected targets, varies per action
//
// Note: circular imports (actionRegistry ↔ gameEngine) are fine in this
// Vite/ES module setup — live bindings resolve before any spell/action is
// called at runtime.
//
// ADD NEW ACTION RESOLVERS HERE
// ============================================

export const ACTION_REGISTRY = {

  sergeant: (unit, state) => {
    // Set buff flag — next unit summoned this turn by this player gains +1/+1
    state.players[unit.owner].sergeantBuff = true;
    addLog(state, `Sergeant: next unit played this turn gains +1/+1.`);
    return state;
  },

  darkdealer: (unit, state) => {
    // Deal 2 damage to own champion then draw 1 card
    const champ = state.champions[unit.owner];
    const p = state.players[unit.owner];
    champ.hp -= 2;
    addLog(state, `Dark Dealer: champion takes 2 damage.`);
    const drawn = drawCard(state, unit.owner);
    if (drawn && p.hand.length < 6) {
      p.hand.push(drawn);
      addLog(state, `Dark Dealer: drew ${drawn.name}.`);
    }
    return state;
  },

  // targets[0]: a different friendly combat unit to reset
  packrunner: (unit, state, targets) => {
    const target = targets[0];
    if (!target || target.uid === unit.uid) {
      addLog(state, `Pack Runner: no valid target selected.`);
      return state;
    }
    target.moved = false;
    addLog(state, `Pack Runner: ${target.name} action reset.`);
    return state;
  },

  grovewarden: (unit, state) => {
    // Restore HP equal to number of friendly Elf units (excluding Grove Warden)
    const elfCount = state.units.filter(u =>
      u.owner === unit.owner &&
      u.uid !== unit.uid &&
      unitTypes(u).includes('Elf') &&
      !u.hidden
    ).length;
    const champ = state.champions[unit.owner];
    const healed = restoreHP(champ, elfCount, state, 'grovewarden');
    addLog(state, `Grove Warden: champion restores ${healed} HP (${elfCount} friendly Elves).`);
    return state;
  },

  // targets[0]: enemy combat unit within 2 tiles of Woodland Guard
  woodlandguard: (unit, state, targets) => {
    const target = targets[0];
    if (!target) {
      addLog(state, `Woodland Guard: no valid target in range.`);
      return state;
    }
    addLog(state, `Woodland Guard: deals 1 damage to ${target.name}.`);
    applyDamageToUnit(state, target, 1, 'Woodland Guard');
    return state;
  },

  // targets[0]: any unit within 2 tiles of Elf Archer
  elfarcher: (unit, state, targets) => {
    const target = targets[0];
    if (!target) {
      addLog(state, `Elf Archer: no valid target in range.`);
      return state;
    }
    applyDamageToUnit(state, target, 2, 'Elf Archer');
    addLog(state, `Elf Archer fires at ${target.name}!`);
    return state;
  },

  siegemound: (unit, state) => {
    const total = dealNonCombatDamageToEnemyChampion(state, unit.owner, 2);
    addLog(state, `Siege Mound: enemy champion takes ${total} damage (${state.champions[1 - unit.owner].hp} HP).`);
    return state;
  },

  // targets[0]: adjacent friendly combat unit to sacrifice
  bloodaltar: (unit, state, targets) => {
    const target = targets[0];
    if (!target) {
      addLog(state, `Blood Altar: no valid target selected.`);
      return state;
    }
    const p = state.players[unit.owner];
    addLog(state, `Blood Altar: ${target.name} sacrificed.`);
    fireTrigger('onFriendlySacrifice', { sacrificedUnit: { ...target }, sacrificingPlayerIndex: target.owner }, state);
    destroyUnit(target, state, 'sacrifice');
    const drawn = drawCard(state, unit.owner);
    if (drawn && p.hand.length < 6) {
      p.hand.push(drawn);
      addLog(state, `Blood Altar: drew ${drawn.name}.`);
    }
    return state;
  },

  // targets[0]: direction string 'up' | 'down' | 'left' | 'right'
  vornthundercaller: (unit, state, targets) => {
    const dir = targets[0];
    if (!dir) {
      addLog(state, `Vorn, Thundercaller: no direction selected.`);
      return state;
    }
    const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    const [dr, dc] = deltas[dir] || [0, 0];
    let r = unit.row + dr;
    let c = unit.col + dc;
    // Collect all units in the line first (state may mutate as units die)
    const lineUnits = [];
    const lineChamps = [];
    while (r >= 0 && r <= 4 && c >= 0 && c <= 4) {
      const u = state.units.find(u => u.row === r && u.col === c && !u.isOmen);
      if (u) lineUnits.push(u);
      const ch = state.champions.find(ch => ch.row === r && ch.col === c);
      if (ch) lineChamps.push(ch);
      r += dr;
      c += dc;
    }
    for (const ch of lineChamps) {
      const isEnemy = ch.owner !== unit.owner;
      if (isEnemy) {
        const total = dealNonCombatDamageToEnemyChampion(state, unit.owner, 2);
        addLog(state, `Vorn, Thundercaller: enemy champion struck for ${total} damage (${ch.hp} HP).`);
      } else {
        ch.hp -= 2;
        addLog(state, `Vorn, Thundercaller: friendly champion struck for 2 damage (${ch.hp} HP).`);
      }
    }
    for (const t of lineUnits) {
      addLog(state, `Vorn, Thundercaller: ${t.name} struck for 2 damage.`);
      applyDamageToUnit(state, t, 2, 'Vorn, Thundercaller');
    }
    return state;
  },

  // targets[0]: direction string 'up' | 'down' | 'left' | 'right'
  manacannon: (unit, state, targets) => {
    const activePlayer = unit.owner;
    if ((state.players[activePlayer].resources || 0) < 1) {
      addLog(state, `Mana Cannon: insufficient mana.`);
      return state;
    }
    state.players[activePlayer].resources -= 1;
    const dir = targets[0];
    if (!dir) {
      addLog(state, `Mana Cannon: no direction selected.`);
      return state;
    }
    const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    const [dr, dc] = deltas[dir] || [0, 0];
    let r = unit.row + dr;
    let c = unit.col + dc;
    while (r >= 0 && r <= 4 && c >= 0 && c <= 4) {
      const hit = state.units.find(u => u.row === r && u.col === c && !u.isOmen);
      if (hit) {
        addLog(state, `Mana Cannon: ${hit.name} struck for 1 damage.`);
        applyDamageToUnit(state, hit, 1, 'Mana Cannon');
        break;
      }
      const champHit = state.champions.find(ch => ch.row === r && ch.col === c);
      if (champHit) {
        const isEnemy = champHit.owner !== unit.owner;
        if (isEnemy) {
          const total = dealNonCombatDamageToEnemyChampion(state, unit.owner, 1);
          addLog(state, `Mana Cannon: enemy champion struck for ${total} damage (${champHit.hp} HP).`);
        } else {
          champHit.hp -= 1;
          addLog(state, `Mana Cannon: friendly champion struck for 1 damage (${champHit.hp} HP).`);
        }
        break;
      }
      r += dr;
      c += dc;
    }
    return state;
  },

  // Azulon: set spellEchoActive flag — the next spell cast this turn resolves twice
  azulonsilvertide: (unit, state) => {
    state.players[unit.owner].spellEchoActive = true;
    addLog(state, `Azulon, Silver Tide: the next spell cast this turn will echo.`);
    return state;
  },

  arcanelens: (unit, state) => {
    const p = state.players[unit.owner];
    const peekCount = Math.min(3, p.deck.length);
    if (peekCount === 0) {
      addLog(state, `Arcane Lens: deck is empty.`);
      return state;
    }
    const peekedCards = p.deck.slice(0, peekCount).map(c => ({ ...c }));
    state.pendingDeckPeek = { unitUid: unit.uid, cards: peekedCards };
    addLog(state, `Arcane Lens: looking at the top ${peekCount} card${peekCount > 1 ? 's' : ''} of your deck.`);
    return state;
  },

  tanglerootypew: (unit, state) => {
    const enemy = 1 - unit.owner;
    const affected = state.units.filter(u =>
      u.owner === enemy &&
      !u.isRelic &&
      !u.isOmen &&
      manhattan([unit.row, unit.col], [u.row, u.col]) === 1
    );
    for (const u of affected) u.rooted = true;
    addLog(state, `Tangleroot Yew: adjacent enemies are Rooted.`);
    return state;
  },

  // targets[0]: any enemy combat unit (no range restriction)
  clockworkmanimus: (unit, state, targets) => {
    const target = targets[0];
    if (!target) {
      addLog(state, `Clockwork Manimus: no valid target selected.`);
      return state;
    }
    addLog(state, `Clockwork Manimus: deals 2 damage to ${target.name}.`);
    applyDamageToUnit(state, target, 2, 'Clockwork Manimus');
    return state;
  },

  // Fennwick scry: reveal the top card of the owner's deck (card stays on top).
  fennwickthequiet: (unit, state) => {
    const p = state.players[unit.owner];
    if (p.deck.length === 0) {
      addLog(state, `Fennwick peers into the future — the deck is empty.`);
      return state;
    }
    const topCard = p.deck[0];
    state.pendingDeckPeek = { unitUid: unit.uid, cards: [{ ...topCard }], reason: 'scry' };
    addLog(state, `Fennwick peers into the future.`);
    return state;
  },

  // targets[0]: friendly combat unit to receive the elf tribal buff
  rootsongcommander: (unit, state, targets) => {
    const target = targets[0];
    if (!target) {
      addLog(state, `Rootsong Commander: no valid target selected.`);
      return state;
    }
    const elfCount = state.units.filter(u =>
      u.owner === unit.owner &&
      unitTypes(u).includes('Elf') &&
      !u.hidden
    ).length;
    target.turnAtkBonus = (target.turnAtkBonus || 0) + elfCount;
    target.hp += elfCount;
    target.elfTribalHpBonus = (target.elfTribalHpBonus || 0) + elfCount;
    addLog(state, `Rootsong Commander empowers ${target.name}. +${elfCount}/+${elfCount} this turn.`);
    return state;
  },

  ironqueen: (unit, state, targets) => {
    const dir = targets[0];
    if (!dir) {
      addLog(state, `The Iron Queen: no direction selected.`);
      return state;
    }
    const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    const delta = deltas[dir];
    if (!delta) {
      addLog(state, `The Iron Queen: invalid direction — stays in place.`);
      return state;
    }
    const [dr, dc] = delta;
    const adjR = unit.row + dr;
    const adjC = unit.col + dc;
    // If the adjacent tile in the chosen direction is occupied, she does not move
    const adjOccupied =
      adjR < 0 || adjR > 4 || adjC < 0 || adjC > 4 ||
      state.units.some(u => u.uid !== unit.uid && u.row === adjR && u.col === adjC) ||
      state.champions.some(ch => ch.row === adjR && ch.col === adjC);
    if (adjOccupied) {
      addLog(state, `The Iron Queen: path blocked — stays in place.`);
      return state;
    }
    // Traverse to the furthest empty tile in the chosen direction
    let destR = unit.row;
    let destC = unit.col;
    let r = adjR;
    let c = adjC;
    while (r >= 0 && r <= 4 && c >= 0 && c <= 4) {
      const blocked =
        state.units.some(u => u.uid !== unit.uid && u.row === r && u.col === c) ||
        state.champions.some(ch => ch.row === r && ch.col === c);
      if (blocked) break;
      destR = r;
      destC = c;
      r += dr;
      c += dc;
    }
    unit.row = destR;
    unit.col = destC;
    addLog(state, `The Iron Queen: charges ${dir} to (${destR}, ${destC}).`);
    return state;
  },

};

// ==========================================
// ACTION DISPATCH WITH onEnemyAction TRIGGER
// Single entry point called by _dispatchAction in gameEngine.js.
// Fires onEnemyAction for the opposing player's triggers (e.g. Negation Crystal).
// If state.pendingNegationCancel is set after the trigger fires, the action is
// cancelled automatically — the unit's action is consumed but the effect does not fire.
// ==========================================
export function dispatchAction(unit, state, targets) {
  fireTrigger('onEnemyAction', { actingUnit: unit, actingPlayerIndex: unit.owner }, state);
  if (state.pendingNegationCancel) {
    // Action cancelled by Negation Crystal — clear flag and return without resolving.
    state.pendingNegationCancel = null;
    return state;
  }
  const resolver = ACTION_REGISTRY[unit.id];
  if (!resolver) {
    console.error(`No action resolver found for unit: ${unit.id}`);
    return state;
  }
  return resolver(unit, state, targets);
}

// ==========================================
// VALIDATION
// Logs errors for any action unit that lacks a registry resolver.
// ==========================================
const actionUnitIds = Object.values(DECKS)
  .flatMap(deck => deck.cards)
  .map(id => CARD_DB[id])
  .filter(c => c && c.action === true)
  .map(c => c.id);
const uniqueActionIds = [...new Set(actionUnitIds)];
uniqueActionIds.forEach(id => {
  if (!ACTION_REGISTRY[id]) {
    console.error(`Missing action resolver for unit: ${id}`);
  }
});
