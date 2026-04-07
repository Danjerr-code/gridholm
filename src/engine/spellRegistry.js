import {
  destroyUnit,
  restoreHP,
  addLog,
  applyDamageToUnit,
  manhattan,
  cardinalNeighbors,
} from './gameEngine.js';
import { getEffectiveAtk } from './statUtils.js';
import { DECKS, CARD_DB } from './cards.js';

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
    target.atkBonus = (target.atkBonus || 0) + 3;
    addLog(state, `${state.players[caster].name} forges weapon on ${target.name}. +3 ATK.`);
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
      u.martialLaw = true;
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
    // Step 1: beast (targets[0]) attacks enemy (targets[1])
    const beast = targets[0];
    const enemy = targets[1];
    if (!beast || !enemy) return state;
    const attackerAtk = getEffectiveAtk(state, beast);
    addLog(state, `Ambush: ${beast.name} battles ${enemy.name}!`);
    applyDamageToUnit(state, enemy, attackerAtk, beast.name);
    // Beast does NOT take counterattack in Ambush
    return state;
  },

  packhowl: (state, caster) => {
    state.units.forEach(u => {
      if (u.owner === caster && u.unitType === 'Beast') {
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

  predatorsmark: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    target.martialLaw = true;
    addLog(state, `Predator's Mark: ${target.name} cannot act next turn.`);
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
        unitType: 'Beast', rules: '', image: 'snake-token.webp', owner: caster, row: r, col: c,
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
    for (const u of affected) u.martialLaw = true;
    addLog(state, `Entangle: ${affected.length} enemy unit(s) around ${target.name} cannot move next turn.`);
    return state;
  },

  ancientspring: (state, caster) => {
    const p = state.players[caster];
    for (let i = 0; i < 2; i++) {
      const drawn = p.deck.shift();
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
    addLog(state, `Spirit Bolt: deals ${dmg} damage to ${target.name}.`);
    applyDamageToUnit(state, target, dmg, 'Spirit Bolt');
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
      addLog(state, `Blood Offering: ${sacrifice.name} (${sacrifice.atk} ATK) sacrificed.`);
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
    console.log('[PactOfRuin] pactofruin resolver entered (no-op stub)');
    return state;
  },

  pactofruin_damage: (state, caster, targets) => {
    console.log('[PactOfRuin] pactofruin_damage resolver entered. targets:', targets?.map(t => t?.name));
    const target = targets[0];
    if (!target) {
      console.log('[PactOfRuin] pactofruin_damage: no target — early return');
      return state;
    }
    addLog(state, `Pact of Ruin: 3 damage to ${target.name}.`);
    console.log('[PactOfRuin] Applying 3 damage to', target.name, '(hp before:', target.hp, ')');
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
      if (u.owner === caster && u.unitType === 'Demon') {
        u.turnAtkBonus = (u.turnAtkBonus || 0) + 2;
      }
    });
    addLog(state, `All friendly Demons gain +2 ATK this turn.`);
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
  // SPELL EFFECTS THAT NEED gameEngine helpers
  // ==========================================

  // Recall: return a unit to hand (triggered via spell card or ability)
  recall: (state, caster, targets) => {
    const target = targets[0];
    if (!target) return state;
    const { owner: _o, row: _r, col: _c, maxHp: _mh, summoned: _s, moved: _mv,
            atkBonus: _ab, shield: _sh, speedBonus: _sb, turnAtkBonus: _ta, ...baseFields } = target;
    const recalledCard = { ...baseFields, hp: target.maxHp, uid: `${target.id}_${Math.random().toString(36).slice(2)}` };
    state.units = state.units.filter(u => u.uid !== target.uid);
    state.players[caster].hand.push(recalledCard);
    state.recalledThisTurn = [...(state.recalledThisTurn || []), recalledCard.id];
    addLog(state, `${target.name} recalled to hand. Cannot be played this turn.`);
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
