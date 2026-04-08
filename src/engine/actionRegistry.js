import { destroyUnit, restoreHP, addLog, applyDamageToUnit, manhattan } from './gameEngine.js';
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
    const drawn = p.deck.shift();
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

  // targets[0]: adjacent friendly combat unit to sacrifice
  bloodaltar: (unit, state, targets) => {
    const target = targets[0];
    if (!target) {
      addLog(state, `Blood Altar: no valid target selected.`);
      return state;
    }
    const p = state.players[unit.owner];
    addLog(state, `Blood Altar: ${target.name} sacrificed.`);
    destroyUnit(target, state, 'sacrifice');
    const drawn = p.deck.shift();
    if (drawn && p.hand.length < 6) {
      p.hand.push(drawn);
      addLog(state, `Blood Altar: drew ${drawn.name}.`);
    }
    return state;
  },

};

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
