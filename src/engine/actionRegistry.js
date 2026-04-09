import { destroyUnit, restoreHP, addLog, applyDamageToUnit, manhattan } from './gameEngine.js';
import { fireTrigger } from './triggerRegistry.js';
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

  siegemound: (unit, state) => {
    const enemyChamp = state.champions[1 - unit.owner];
    enemyChamp.hp -= 2;
    addLog(state, `Siege Mound: enemy champion takes 2 damage (${enemyChamp.hp} HP).`);
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
    const drawn = p.deck.shift();
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
      ch.hp -= 2;
      const side = ch.owner === unit.owner ? 'friendly' : 'enemy';
      addLog(state, `Vorn, Thundercaller: ${side} champion struck for 2 damage (${ch.hp} HP).`);
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
        champHit.hp -= 1;
        const side = champHit.owner === unit.owner ? 'friendly' : 'enemy';
        addLog(state, `Mana Cannon: ${side} champion struck for 1 damage (${champHit.hp} HP).`);
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

};

// ==========================================
// ACTION DISPATCH WITH onEnemyAction TRIGGER
// Single entry point called by _dispatchAction in gameEngine.js.
// Fires onEnemyAction for the opposing player's triggers (e.g. Negation Crystal)
// before resolving the action. If state.pendingNegationCancel is set after the
// trigger fires, the action is paused and stored for later resolution.
// ==========================================
export function dispatchAction(unit, state, targets) {
  fireTrigger('onEnemyAction', { actingUnit: unit, actingPlayerIndex: unit.owner }, state);
  if (state.pendingNegationCancel) {
    // Action paused — store context so it can be replayed or cancelled.
    state.pendingNegationCancel.pendingUnitUid = unit.uid;
    state.pendingNegationCancel.pendingTargets = targets;
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
