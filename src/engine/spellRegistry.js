import {
  destroyUnit,
  restoreHP,
  addLog,
  applyDamageToUnit,
  fireAttackTriggers,
  manhattan,
  cardinalNeighbors,
  fireOnSummonTriggers,
  drawCard,
} from './gameEngine.js';
import { getEffectiveAtk, getTerrainHpModifier } from './statUtils.js';
import { fireTrigger, unregisterUnit, unregisterModifiers, registerUnit, registerModifiers, registerDynamicTrigger } from './triggerRegistry.js';
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
// SPELL REGISTRY
// Maps spell effect IDs to pure resolver functions.
// Each resolver takes (state, caster, targets, options) and returns state.
// Multi-step spells use options.step (0, 1, ...) to distinguish phases.
// ADD NEW SPELL RESOLVERS HERE
// ============================================

export const SPELL_REGISTRY = {

  // ==========================================
  // NEUTRAL SPELLS
  // ==========================================

  smite: (state, caster, targets) => {
    const target = targets[0];
    if (!target || !target.uid) return state; // champions have no uid; only combat units are valid targets
    const champ = state.champions[caster];
    if (manhattan([champ.row, champ.col], [target.row, target.col]) <= 2) {
      applyDamageToUnit(state, target, 4, 'Smite');
    }
    return state;
  },

  ironshield: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    target.shield = (target.shield || 0) + 5;
    addLog(state, `${state.players[caster].name} gives Iron Shield to ${target.name}.`);
    return state;
  },

  ironthorns: (state, caster) => {
    const champ = state.champions[caster];
    champ.thornShield = { absorb: 3, thornDamage: 3 };
    addLog(state, `${state.players[caster].name} casts Iron Thorns. Champion gains a thorn shield (absorb 3, thorn 3).`);
    return state;
  },

  forgeweapon: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    target.atkBonus = (target.atkBonus || 0) + 2;
    addLog(state, `${state.players[caster].name} forges weapon on ${target.name}. +2 ATK.`);
    return state;
  },

  // ==========================================
  // HUMAN SPELLS
  // ==========================================

  // options.step === 0: normal cast (no-target)
  fortify: (state, caster) => {
    state.units.forEach(u => {
      if (u.owner === caster) {
        u.hp = Math.min(u.maxHp + 2, u.hp + 2);
        u.fortifyBonus = (u.fortifyBonus || 0) + 2;
      }
    });
    addLog(state, `${state.players[caster].name} casts Fortify. All friendly units gain +2 HP until next turn.`);
    return state;
  },

  rally: (state, caster) => {
    state.units.forEach(u => {
      if (u.owner === caster) {
        u.turnAtkBonus = (u.turnAtkBonus || 0) + 1;
      }
    });
    addLog(state, `${state.players[caster].name} casts Rally. All friendly units gain +1 ATK this turn.`);
    return state;
  },

  crusade: (state, caster) => {
    state.units.forEach(u => {
      if (u.owner === caster) {
        u.turnAtkBonus = (u.turnAtkBonus || 0) + 2;
      }
    });
    addLog(state, `${state.players[caster].name} casts Crusade. All friendly units gain +2 ATK this turn.`);
    return state;
  },

  martiallaw: (state, caster) => {
    const champ = state.champions[caster];
    const affected = state.units.filter(u =>
      u.owner !== caster &&
      manhattan([champ.row, champ.col], [u.row, u.col]) <= 2
    );
    for (const u of affected) {
      u.skipNextAction = true;
    }
    addLog(state, `${state.players[caster].name} casts Martial Law. ${affected.length} enemy unit(s) affected.`);
    return state;
  },

  // ==========================================
  // BEAST SPELLS
  // ==========================================

  // options.step: 0 = select beast (no-op, orchestrator handles), 1 = resolve combat
  ambush: (state, caster, targets, options = {}) => {
    const step = options.step || 0;
    if (step === 0) {
      // Step 0 is just target selection — no state change here
      return state;
    }
    // Step 1: simultaneous combat — beast (targets[0]) vs enemy (targets[1])
    const beast = targets[0];
    const enemy = targets[1];
    if (!beast || !enemy) return state;
    // Capture both ATKs before any damage (simultaneous resolution)
    const beastAtk = getEffectiveAtk(state, beast);
    const enemyAtk = getEffectiveAtk(state, enemy);
    addLog(state, `Ambush: ${beast.name} battles ${enemy.name}!`);
    // Deal damage simultaneously — neither unit moves
    applyDamageToUnit(state, enemy, beastAtk, beast.name);
    applyDamageToUnit(state, beast, enemyAtk, enemy.name);
    // Fire attack triggers (e.g. Crossbowman draw on kill)
    const killedEnemy = !state.units.find(u => u.uid === enemy.uid);
    fireAttackTriggers(beast, enemy, state, killedEnemy);
    return state;
  },

  animus: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    target.turnAtkBonus = (target.turnAtkBonus || 0) + 2;
    addLog(state, `Animus: ${target.name} gains +2 ATK this turn.`);
    return state;
  },

  gore: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    addLog(state, `Gore deals 2 damage to ${target.name}.`);
    applyDamageToUnit(state, target, 2, 'Gore');
    return state;
  },

  demolish: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    addLog(state, `Demolish destroys ${target.name}.`);
    destroyUnit(target, state, 'demolish');
    return state;
  },

  packhowl: (state, caster) => {
    state.units.forEach(u => {
      if (u.owner === caster && unitTypes(u).includes('Beast')) {
        u.turnAtkBonus = (u.turnAtkBonus || 0) + 1;
        u.speedBonus = (u.speedBonus || 0) + 1;
      }
    });
    addLog(state, `${state.players[caster].name} casts Pack Howl. All friendly Beast combat units gain +1 ATK and +1 SPD this turn.`);
    return state;
  },

  pounce: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    target.moved = false;
    target.summoned = false;
    target.actioned = false;
    addLog(state, `Pounce: ${target.name}'s action has been reset.`);
    return state;
  },

  predatorsmark: (state, caster) => {
    const enemyChamp = state.champions[1 - caster];
    if (!enemyChamp) return state;
    enemyChamp.skipNextAction = true;
    addLog(state, `Predator's Mark: The enemy champion will skip their action next turn.`);
    return state;
  },

  savagegrowth: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    target.atk += 2;
    target.hp += 2;
    target.maxHp += 2;
    addLog(state, `Savage Growth: ${target.name} gains +2/+2 permanently.`);
    return state;
  },

  callofthesnakes: (state, caster) => {
    const champ = state.champions[caster];
    const adj = cardinalNeighbors(champ.row, champ.col).filter(([r, c]) =>
      !state.units.some(u => u.row === r && u.col === c) &&
      !state.champions.some(ch => ch.row === r && ch.col === c)
    );
    for (const [r, c] of adj) {
      state.units.push({
        id: 'snake', name: 'Snake', type: 'unit', atk: 1, hp: 1, maxHp: 1, spd: 1,
        unitType: ['Beast'], rules: '', image: 'snake-token.webp', owner: caster, row: r, col: c,
        summoned: true, moved: false, atkBonus: 0, shield: 0, speedBonus: 0, hidden: false,
        uid: `snake_${Math.random().toString(36).slice(2)}`,
      });
    }
    addLog(state, `${state.players[caster].name} casts Call of the Snakes. ${adj.length} Snake(s) summoned.`);
    return state;
  },

  // ==========================================
  // ELF SPELLS
  // ==========================================

  moonleaf: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    // hand size AFTER playing moonleaf (card already removed from hand by payment)
    const handCount = state.players[caster].hand.length;
    target.maxHp += handCount;
    const healed = restoreHP(target, handCount, state);
    addLog(state, `Moonleaf: ${target.name} gains +${handCount} HP.`);
    return state;
  },

  overgrowth: (state, caster) => {
    state.units.forEach(u => {
      if (u.owner === caster && !u.hidden) {
        const healed = restoreHP(u, 2, state);
        if (healed > 0) addLog(state, `${u.name} restored ${healed} HP.`);
      }
    });
    const champ = state.champions[caster];
    const champHealed = restoreHP(champ, 2, state);
    if (champHealed > 0) addLog(state, `${state.players[caster].name}'s champion restored ${champHealed} HP.`);
    addLog(state, `${state.players[caster].name} casts Overgrowth. All friendly units restore 2 HP.`);
    return state;
  },

  // options.step: 0 = restore friendly, 1 = deal damage to enemy
  bloom: (state, caster, targets, options = {}) => {
    const step = options.step || 0;
    const target = targets[0];
    if (!target) return state;
    if (step === 0) {
      const healed = restoreHP(target, 2, state);
      const targetName = target.name || `${state.players[caster].name}'s champion`;
      addLog(state, `Bloom: ${targetName} restored ${healed} HP.`);
    } else {
      const dmg = state.players[caster].hpRestoredThisTurn || 0;
      addLog(state, `Bloom: deals ${dmg} damage to ${target.name}.`);
      applyDamageToUnit(state, target, dmg, 'Bloom');
    }
    return state;
  },

  entangle: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    const adj = cardinalNeighbors(target.row, target.col);
    const affected = state.units.filter(u =>
      u.owner !== caster &&
      adj.some(([r, c]) => u.row === r && u.col === c)
    );
    for (const u of affected) u.rooted = true;
    addLog(state, `Entangle: ${affected.length} enemy unit(s) around ${target.name} cannot move next turn.`);
    return state;
  },

  ancientspring: (state, caster) => {
    const p = state.players[caster];
    for (let i = 0; i < 2; i++) {
      const drawn = drawCard(state, caster);
      if (drawn) {
        p.hand.push(drawn);
        addLog(state, `Ancient Spring: drew ${drawn.name}.`);
      }
    }
    return state;
  },

  verdantsurge: (state, caster) => {
    const champ = state.champions[caster];
    // Apply to champion
    champ.turnAtkBonus = (champ.turnAtkBonus || 0) + 2;
    champ.hp = Math.min(champ.maxHp + 2, champ.hp + 2);
    champ.verdantSurgeBonus = (champ.verdantSurgeBonus || 0) + 2;
    // Apply to friendly units within 2 tiles of champion
    state.units.forEach(u => {
      if (u.owner === caster && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2) {
        u.turnAtkBonus = (u.turnAtkBonus || 0) + 2;
        u.hp = Math.min(u.maxHp + 2, u.hp + 2);
        u.verdantSurgeBonus = (u.verdantSurgeBonus || 0) + 2;
      }
    });
    addLog(state, `${state.players[caster].name} casts Verdant Surge. Nearby friendly units gain +2 ATK and +2 HP this turn.`);
    return state;
  },

  spiritbolt: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    const champ = state.champions[caster];
    const nearbyCount = state.units.filter(u =>
      u.owner === caster &&
      manhattan([champ.row, champ.col], [u.row, u.col]) <= 2
    ).length;
    const dmg = nearbyCount + 1; // +1 for the champion itself
    // Target may be a combat unit or the enemy champion (no uid)
    if (!target.uid) {
      // Enemy champion target
      target.hp -= dmg;
      addLog(state, `Spirit Bolt: deals ${dmg} damage to ${state.players[target.owner].name}'s champion.`);
    } else {
      addLog(state, `Spirit Bolt: deals ${dmg} damage to ${target.name}.`);
      applyDamageToUnit(state, target, dmg, 'Spirit Bolt');
    }
    return state;
  },

  apexrampage: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    // +2 ATK permanently (written to base stat, not turnAtkBonus which resets each turn)
    target.atk = (target.atk || 0) + 2;
    // Grant 2 extra actions this turn via extraActionsRemaining counter.
    // Reset moved so an already-acted unit can use the granted actions.
    target.extraActionsRemaining = (target.extraActionsRemaining || 0) + 2;
    if (target.moved) target.moved = false;
    addLog(state, `Apex Rampage: ${target.name} gains +2 ATK and 2 extra actions.`);
    return state;
  },

  // ==========================================
  // DEMON SPELLS
  // ==========================================

  // options.step: 0 = sacrifice friendly, 1 = deal damage
  // options.sacrificeAtk passed at step 1 by orchestrator
  bloodoffering: (state, caster, targets, options = {}) => {
    const step = options.step || 0;
    if (step === 0) {
      const sacrifice = targets[0];
      if (!sacrifice) return state;
      addLog(state, `Blood Offering: ${sacrifice.name} sacrificed.`);
      fireTrigger('onFriendlySacrifice', { sacrificedUnit: { ...sacrifice }, sacrificingPlayerIndex: sacrifice.owner }, state);
      destroyUnit(sacrifice, state, 'sacrifice');
    } else {
      const enemy = targets[0];
      const dmg = options.sacrificeAtk || 0;
      if (!enemy) return state;
      addLog(state, `Blood Offering: ${dmg} damage to ${enemy.name}.`);
      applyDamageToUnit(state, enemy, dmg, 'Blood Offering');
    }
    return state;
  },

  // pactofruin card handling is special-cased in playCard (hand selection flow).
  // This entry exists so deck validation passes. The damage step is pactofruin_damage.
  pactofruin: (state) => {
    if (typeof window !== 'undefined') console.log('[PactOfRuin] pactofruin resolver entered (no-op stub)');
    return state;
  },

  pactofruin_damage: (state, caster, targets) => {
    if (typeof window !== 'undefined') console.log('[PactOfRuin] pactofruin_damage resolver entered. targets:', targets?.map(t => t?.name));
    const target = targets[0];
    if (!target) {
      if (typeof window !== 'undefined') console.log('[PactOfRuin] pactofruin_damage: no target — early return');
      return state;
    }
    addLog(state, `Pact of Ruin: 3 damage to ${target.name}.`);
    if (typeof window !== 'undefined') console.log('[PactOfRuin] Applying 3 damage to', target.name, '(hp before:', target.hp, ')');
    applyDamageToUnit(state, target, 3, 'Pact of Ruin');
    return state;
  },

  darksentence: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    addLog(state, `Dark Sentence: ${target.name} destroyed.`);
    destroyUnit(target, state, 'darksentence');
    return state;
  },

  devour: (state, caster, targets) => {
    const target = targets[0];
    if (!target || target.hp > 2) return state;
    addLog(state, `Devour: ${target.name} consumed.`);
    destroyUnit(target, state, 'devour');
    return state;
  },

  infernalpact: (state, caster) => {
    const champ = state.champions[caster];
    champ.hp -= 3;
    addLog(state, `${state.players[caster].name} casts Infernal Pact. Champion takes 3 damage.`);
    state.units.forEach(u => {
      if (u.owner === caster) {
        u.turnAtkBonus = (u.turnAtkBonus || 0) + 2;
      }
    });
    addLog(state, `All friendly combat units gain +2 ATK this turn.`);
    return state;
  },

  shadowveil: (state, caster) => {
    if (!state.pendingShadowVeil) state.pendingShadowVeil = {};
    state.pendingShadowVeil[caster] = true;
    addLog(state, `Shadow Veil: next combat unit summoned by ${state.players[caster].name} will be Hidden.`);
    return state;
  },

  souldrain: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    const actualDmg = Math.min(2, target.hp);
    addLog(state, `Soul Drain: 2 damage to ${target.name}.`);
    applyDamageToUnit(state, target, 2, 'Soul Drain');
    const champ = state.champions[caster];
    const healed = restoreHP(champ, actualDmg, state);
    addLog(state, `Soul Drain: champion restores ${healed} HP.`);
    return state;
  },

  // ==========================================
  // CHAMPION ACTION SPELL CYCLE
  // ==========================================

  // rebirth: handled via pendingGraveSelect flow in gameEngine (no resolver body needed)
  rebirth: (state) => state,

  crushingblow: (state, caster, targets) => {
    const champ = state.champions[caster];
    champ.moved = true;
    const target = targets[0];
    if (!target) return state;
    addLog(state, `Crushing Blow deals 4 damage to ${target.name}.`);
    applyDamageToUnit(state, target, 4, 'Crushing Blow');
    // If target survived, push it back 1 tile (away from champion)
    const liveTarget = state.units.find(u => u.uid === target.uid);
    if (liveTarget) {
      const dr = liveTarget.row - champ.row;
      const dc = liveTarget.col - champ.col;
      const pushRow = liveTarget.row + Math.sign(dr) * (dr !== 0 ? 1 : 0);
      const pushCol = liveTarget.col + Math.sign(dc) * (dc !== 0 ? 1 : 0);
      const inBounds = pushRow >= 0 && pushRow < 5 && pushCol >= 0 && pushCol < 5;
      const isEmpty = inBounds &&
        !state.units.some(u => u.row === pushRow && u.col === pushCol) &&
        !state.champions.some(c => c.row === pushRow && c.col === pushCol);
      if (isEmpty) {
        liveTarget.row = pushRow;
        liveTarget.col = pushCol;
        addLog(state, `${liveTarget.name} is pushed back.`);
      }
    }
    return state;
  },

  // glimpse: handled via pendingDeckPeek flow in gameEngine (no resolver body needed)
  glimpse: (state) => state,

  standfirm: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    target.hp = Math.min(target.maxHp + 2, target.hp + 2);
    target.fortifyBonus = (target.fortifyBonus || 0) + 2;
    addLog(state, `Stand Firm: ${target.name} gains +2 HP this turn.`);
    return state;
  },

  gildedcage: (state, caster, targets) => {
    const target = targets[0];
    if (!target || target.isRelic || target.isOmen) return state;
    // Store the full unit state before removal
    const trappedUnit = { ...target };
    // Unregister declarative triggers and static modifiers (no death triggers)
    unregisterUnit(target.uid, state);
    unregisterModifiers(target.uid, state);
    // Remove from board without firing death triggers
    state.units = state.units.filter(u => u.uid !== target.uid);
    // Place a Gilded Cage relic on the same tile
    state.units.push({
      id: 'gildedcage_relic',
      name: 'Gilded Cage',
      type: 'relic',
      isRelic: true,
      atk: 0,
      hp: 5,
      maxHp: 5,
      spd: 0,
      attribute: 'light',
      unitType: [],
      rules: 'When destroyed, release the trapped unit.',
      image: 'gildedcage.webp',
      owner: caster,
      row: target.row,
      col: target.col,
      summoned: false,
      moved: false,
      atkBonus: 0,
      shield: 0,
      speedBonus: 0,
      turnAtkBonus: 0,
      hidden: false,
      trappedUnit,
      uid: `gildedcage_${Math.random().toString(36).slice(2)}`,
    });
    addLog(state, `Enemy unit trapped in Gilded Cage.`);
    return state;
  },

  // Fired after chainsoflight omen is placed and player selects an enemy target
  chainsoflight_summon: (state, caster, targets, options = {}) => {
    const target = targets[0];
    const omenUid = options.omenUid;
    if (!target || !omenUid) return state;
    if (!state.activeModifiers) state.activeModifiers = [];
    state.activeModifiers.push({ type: 'stunTarget', unitUid: omenUid, playerIndex: caster, targetUid: target.uid });
    target.skipNextAction = true;
    addLog(state, `${target.name} is Stunned by Chains of Light.`);
    return state;
  },

  angelicblessing: (state, caster, targets) => {
    const target = targets[0];
    if (!target || target.isRelic || target.isOmen) return state;
    target.atk = (target.atk || 0) + 4;
    target.hp = (target.hp || 0) + 4;
    target.maxHp = (target.maxHp || 0) + 4;
    target.spellImmune = true;
    addLog(state, `Unit receives Angelic Blessing.`);
    return state;
  },

  seconddawn: (state, caster) => {
    const p = state.players[caster];
    const champ = state.champions[caster];

    // Collect revivable combat units from grave (exclude tokens)
    const graveUnits = p.grave.filter(u => u.type === 'unit' && !u.token);
    if (graveUnits.length === 0) return state;

    // Sort by cost descending (most expensive first)
    graveUnits.sort((a, b) => (b.cost || 0) - (a.cost || 0));

    // Find empty tiles adjacent to champion
    const adjTiles = cardinalNeighbors(champ.row, champ.col).filter(([r, c]) =>
      !state.units.some(u => u.row === r && u.col === c) &&
      !state.champions.some(ch => ch.row === r && ch.col === c)
    );

    const summoned = [];
    for (let i = 0; i < Math.min(graveUnits.length, adjTiles.length); i++) {
      const graveUnit = graveUnits[i];
      const base = CARD_DB[graveUnit.id];
      if (!base) continue;
      const [row, col] = adjTiles[i];

      // Remove from grave before pushing to board
      const graveIdx = p.grave.indexOf(graveUnit);
      if (graveIdx !== -1) p.grave.splice(graveIdx, 1);

      const unit = {
        ...base,
        owner: caster,
        row,
        col,
        maxHp: base.hp,
        summoned: true, // summoning sickness
        moved: false,
        atkBonus: 0,
        shield: 0,
        speedBonus: 0,
        turnAtkBonus: 0,
        hidden: false,
        uid: `${base.id}_${Math.random().toString(36).slice(2)}`,
      };

      state.units.push(unit);
      summoned.push(unit);
      addLog(state, `${unit.name} rises again.`);
    }

    // Register triggers and fire on-summon effects for each returned unit
    for (const unit of summoned) {
      registerUnit(unit, state);
      registerModifiers(unit, state);
      fireOnSummonTriggers(unit, state);
    }

    return state;
  },

  petrify: (state, caster, targets) => {
    const target = targets[0];
    if (!target || target.hp > 4 || target.isRelic || target.isOmen) return state;
    addLog(state, `Petrify: ${target.name} is turned to stone!`);
    // Unregister declarative triggers and modifiers before removing from board
    unregisterUnit(target.uid, state);
    unregisterModifiers(target.uid, state);
    // Remove unit from board
    state.units = state.units.filter(u => u.uid !== target.uid);
    // Add a relic owned by the caster in the same tile
    state.units.push({
      id: 'petrified_relic',
      name: `Petrified ${target.name}`,
      type: 'relic',
      isRelic: true,
      atk: 0,
      hp: target.hp,
      maxHp: target.hp,
      spd: 0,
      unitType: [],
      rules: '',
      image: 'petrify-relic.webp',
      owner: caster,
      row: target.row,
      col: target.col,
      summoned: false,
      moved: false,
      atkBonus: 0,
      shield: 0,
      speedBonus: 0,
      turnAtkBonus: 0,
      hidden: false,
      uid: `petrified_${Math.random().toString(36).slice(2)}`,
    });
    return state;
  },

  agonizingsymphony: (state, caster) => {
    const champ = state.champions[caster];
    champ.moved = true;
    const oppHand = state.players[1 - caster].hand;
    const discardCount = Math.min(2, oppHand.length);
    for (let i = 0; i < discardCount; i++) {
      const idx = Math.floor(Math.random() * oppHand.length);
      const [card] = oppHand.splice(idx, 1);
      state.players[1 - caster].discard.push(card);
      addLog(state, `Agonizing Symphony: opponent discards ${card.name}.`);
    }
    if (discardCount === 0) addLog(state, `Agonizing Symphony: opponent has no cards to discard.`);
    return state;
  },

  // ==========================================
  // DARK SPELLS (Batch 17)
  // ==========================================

  // Fate's Ledger: allow playing cards from grave this turn
  fatesledger: (state, caster) => {
    if (!state.graveAccessActive) state.graveAccessActive = [false, false];
    state.graveAccessActive[caster] = true;
    addLog(state, `Fate's Ledger opens the grave.`);
    return state;
  },

  // Toll of Shadows: multi-step resolver — each step destroys one target
  // steps 0-3: casting player; steps 4-7: opponent
  // substep 0=sacrifice unit, 1=sacrifice omen, 2=sacrifice relic, 3=discard (handled in resolveSpell)
  tollofshadows: (state, caster, targets, options = {}) => {
    const target = targets[0];
    if (!target) return state;
    const step = options.step || 0;
    const castIdx = options.casterIdx ?? caster;
    const isOppStep = step >= 4;
    const actorIdx = isOppStep ? (1 - castIdx) : castIdx;
    const substep = step % 4;

    if (substep === 0) {
      // Sacrifice combat unit
      if (!target.isRelic && !target.isOmen && target.owner === actorIdx) {
        addLog(state, `${state.players[actorIdx].name} sacrifices ${target.name}.`);
        fireTrigger('onFriendlySacrifice', { sacrificedUnit: { ...target }, sacrificingPlayerIndex: actorIdx }, state);
        destroyUnit(target, state, 'sacrifice');
      }
    } else if (substep === 1) {
      // Sacrifice omen
      if (target.isOmen && target.owner === actorIdx) {
        addLog(state, `${state.players[actorIdx].name} sacrifices ${target.name}.`);
        destroyUnit(target, state, 'sacrifice');
      }
    } else if (substep === 2) {
      // Sacrifice relic — death triggers fire (Amethyst Crystal, Soulstone, Gilded Cage)
      if (target.isRelic && target.owner === actorIdx) {
        addLog(state, `${state.players[actorIdx].name} sacrifices ${target.name}.`);
        destroyUnit(target, state, 'sacrifice');
      }
    }
    return state;
  },

  pestilence: (state, caster) => {
    const champ = state.champions[caster];
    const affected = state.units.filter(u =>
      u.owner !== caster &&
      !u.isRelic &&
      !u.isOmen &&
      manhattan([champ.row, champ.col], [u.row, u.col]) <= 2
    );
    for (const u of affected) {
      u.turnAtkBonus = (u.turnAtkBonus || 0) - 2;
      u.hp -= 2;
      u.pestilenceBonus = (u.pestilenceBonus || 0) + 2;
      addLog(state, `Pestilence: ${u.name} takes -2/-2 (${u.hp}/${u.maxHp} HP).`);
      // Include terrain HP modifier so units on matching terrain survive if effective HP > 0.
      if (u.hp + getTerrainHpModifier(state, u) <= 0) {
        destroyUnit(u, state, 'pestilence');
      }
    }
    if (affected.length === 0) addLog(state, `Pestilence: no enemy units in range.`);
    return state;
  },

  // ==========================================
  // SPELL EFFECTS THAT NEED gameEngine helpers
  // ==========================================

  // Recall: return a unit to hand without triggering death effects.
  // Returns to the unit's owner (may be the opponent), using base card stats.
  recall: (state, caster, targets) => {
    const target = targets[0];
    if (!target || target.isRelic || target.isOmen) return state;
    const base = CARD_DB[target.id];
    if (!base) return state;
    const ownerIdx = target.owner;
    // Clean up all trigger listeners and modifiers for this unit before removing it
    unregisterUnit(target.uid, state);
    unregisterModifiers(target.uid, state);
    state.units = state.units.filter(u => u.uid !== target.uid);
    // Add fresh card (base stats) to the unit's owner's hand
    const recalledCard = { ...base, uid: `${base.id}_${Math.random().toString(36).slice(2)}` };
    state.players[ownerIdx].hand.push(recalledCard);
    state.recalledThisTurn = [...(state.recalledThisTurn || []), recalledCard.id];
    addLog(state, `${target.name} recalled to hand.`);
    return state;
  },

  // Glittering Gift: give a friendly combat unit +1/+1 and a death-draw trigger
  glitteringgift: (state, caster, targets) => {
    const target = targets[0];
    if (!target || target.isRelic || target.isOmen) return state;
    target.atk += 1;
    target.hp += 1;
    target.maxHp += 1;
    registerDynamicTrigger(target.uid, { event: 'onFriendlyUnitDeath', effect: 'drawOneCard', selfTrigger: true }, state);
    addLog(state, `Glittering Gift enchants ${target.name}.`);
    return state;
  },

  // Mind Seize: skip champion's action, gain control of an adjacent enemy combat unit.
  mindseize: (state, caster, targets) => {
    const champ = state.champions[caster];
    champ.moved = true;
    const target = targets[0];
    if (!target) return state;
    const liveTarget = state.units.find(u => u.uid === target.uid);
    if (!liveTarget) return state;
    unregisterUnit(liveTarget.uid, state);
    unregisterModifiers(liveTarget.uid, state);
    liveTarget.owner = caster;
    // Clear enemy-side status effects and action flags so the unit starts clean
    liveTarget.rooted = false;
    liveTarget.turnAtkBonus = 0;
    liveTarget.moved = true;   // cannot move this turn
    liveTarget.actioned = true; // cannot act this turn
    liveTarget.summoned = true; // summoning sickness lifts on caster's next turn
    registerUnit(liveTarget, state);
    registerModifiers(liveTarget, state);
    addLog(state, `${liveTarget.name} seized by Mind Seize.`);
    return state;
  },

  // Amethyst Cache: create an Amethyst Crystal relic on a player-chosen adjacent tile.
  // The tile selection is handled via pendingRelicPlace in gameEngine; this resolver
  // is called by resolveRelicPlace with (state, caster, [], { row, col }).
  amethystcache: (state, caster, targets, options = {}) => {
    const { row, col } = options;
    if (row == null || col == null) return state;
    const crystalBase = CARD_DB['amethystcrystal'];
    if (!crystalBase) return state;
    const crystal = {
      ...crystalBase,
      owner: caster,
      row,
      col,
      maxHp: crystalBase.hp,
      summoned: false,
      moved: false,
      atkBonus: 0,
      shield: 0,
      speedBonus: 0,
      turnAtkBonus: 0,
      hidden: false,
      uid: `amethystcrystal_${Math.random().toString(36).slice(2)}`,
    };
    state.units.push(crystal);
    registerUnit(crystal, state);
    addLog(state, `Amethyst Crystal created.`);
    return state;
  },

};

// ==========================================
// VALIDATION
// Logs errors for any spell card effect that lacks a registry resolver.
// ==========================================
const allEffects = Object.values(DECKS)
  .flatMap(deck => deck.cards)
  .map(id => CARD_DB[id])
  .filter(c => c && c.type === 'spell')
  .map(c => c.effect);
const uniqueEffects = [...new Set(allEffects)];
uniqueEffects.forEach(effect => {
  if (!SPELL_REGISTRY[effect]) {
    console.error(`Missing spell resolver: ${effect}`);
  }
});
