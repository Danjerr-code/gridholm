// ============================================
// TRIGGER REGISTRY
// Declarative event listener system for card triggers.
// Cards define a `triggers` array in their card definition.
// Each entry: { event, effect, condition?, selfTrigger?, oncePerTurn?, preventRetrigger? }
//
// Supported event types:
//   onEnemyUnitDeath       — an enemy combat unit dies
//   onFriendlyUnitDeath    — a friendly combat unit dies
//   onChampionDamageDealt  — the owner deals damage to the enemy champion
//   onCardPlayed           — the owner plays a card from hand
//   onFriendlyAction       — a friendly combat unit completes an action
//   onFriendlyCommand      — a friendly combat unit spends a command (movement or action use)
//   onHPRestored           — the owner restores HP to any target
//   onEndTurn              — end of the owner's turn
//   onNonCombatChampionDamage — the owner deals non-combat damage to the enemy champion
//   onFriendlySacrifice    — the owner destroys a friendly unit via sacrifice mechanic
//   onDamageTaken          — a unit owned by the listener's player takes damage
//   onCardDiscarded        — the owner discards a card from hand (does NOT fire for opponent forced discards)
//
// Static modifiers (not event-driven):
//   conditionalStatBuff    — stat buff when a condition is met (e.g. minHandSize)
//   zoneSpdBuff            — speed buff within range of an anchor (e.g. enemy champion)
//   auraRangeBuff          — increases all friendly aura ranges (player-wide)
// ============================================

import { addLog, restoreHP, applyDamageToUnit, destroyUnit, cardinalNeighbors, checkWinner, drawCard, manhattan, applyPoison } from './gameEngine.js';
import { CARD_DB, TOKENS } from './cards.js';

export const TRIGGER_EVENTS = [
  'onEnemyUnitDeath',
  'onFriendlyUnitDeath',
  'onChampionDamageDealt',
  'onCardPlayed',
  'onFriendlyAction',
  'onFriendlyCommand',
  'onHPRestored',
  'onEndTurn',
  'onBeginTurn',
  'onNonCombatChampionDamage',
  'onFriendlySacrifice',
  'onEnemyAction',
  'onDamageTaken',
  'onCardDiscarded',
];

// Returns the initial triggerListeners object for state.
export function createTriggerListeners() {
  return Object.fromEntries(TRIGGER_EVENTS.map(e => [e, []]));
}

// Dynamically register a single trigger on an already-placed unit.
// Use this when a spell or effect grants a new trigger to an existing unit.
// The trigger is stored both in state.triggerListeners (for normal events) AND on
// unit.triggers (so destroyUnit can fire self-death triggers before unregistering).
export function registerDynamicTrigger(unitUid, trigger, state) {
  const unit = state.units.find(u => u.uid === unitUid);
  if (!unit) return;
  if (!TRIGGER_EVENTS.includes(trigger.event)) return;
  state.triggerListeners[trigger.event].push({
    unitUid,
    playerIndex: unit.owner,
    effect: trigger.effect,
    condition: trigger.condition || null,
    selfTrigger: trigger.selfTrigger || false,
    oncePerTurn: trigger.oncePerTurn || false,
    preventRetrigger: trigger.preventRetrigger || false,
    firedThisTurn: false,
  });
  // Mirror onto unit.triggers so destroyUnit can detect and fire self-death triggers
  // before unregisterUnit clears state.triggerListeners.
  if (!Array.isArray(unit.triggers)) unit.triggers = [];
  unit.triggers.push({ ...trigger, dynamic: true });
}

// Called when any unit enters the board (summon, respawn, etc.).
// Reads the unit's `triggers` array and adds listener entries to state.
export function registerUnit(unit, state) {
  if (!unit.triggers || !Array.isArray(unit.triggers)) return;
  for (const trigger of unit.triggers) {
    if (!TRIGGER_EVENTS.includes(trigger.event)) continue;
    state.triggerListeners[trigger.event].push({
      unitUid: unit.uid,
      playerIndex: unit.owner,
      effect: trigger.effect,
      condition: trigger.condition || null,
      selfTrigger: trigger.selfTrigger || false,
      oncePerTurn: trigger.oncePerTurn || false,
      preventRetrigger: trigger.preventRetrigger || false,
      firedThisTurn: false,
    });
  }
}

// Called when any unit is removed from the board (death, sacrifice, bounce, transform).
// Removes all listener entries for this unit from all event arrays.
export function unregisterUnit(unitUid, state) {
  if (!state.triggerListeners) return;
  for (const event of TRIGGER_EVENTS) {
    if (state.triggerListeners[event]) {
      state.triggerListeners[event] = state.triggerListeners[event].filter(
        l => l.unitUid !== unitUid
      );
    }
  }
}

// Called when any unit enters the board.
// Reads the unit's `modifier` field (single object or array) and pushes to state.activeModifiers.
export function registerModifiers(unit, state) {
  if (!unit.modifier) return;
  const mods = Array.isArray(unit.modifier) ? unit.modifier : [unit.modifier];
  for (const mod of mods) {
    state.activeModifiers.push({ ...mod, unitUid: unit.uid, playerIndex: unit.owner });
  }
}

// Called when a unit is removed from the board.
// Removes all modifier entries belonging to this unit.
export function unregisterModifiers(unitUid, state) {
  if (!state.activeModifiers) return;
  state.activeModifiers = state.activeModifiers.filter(m => m.unitUid !== unitUid);
}

// Returns the total aura range bonus for a unit from activeModifiers.
export function getAuraRangeBonus(state, unitUid) {
  if (!state.activeModifiers) return 0;
  const src = state.units.find(u => u.uid === unitUid);
  if (src?.hidden) return 0;
  return state.activeModifiers
    .filter(m => m.type === 'auraRangeBuff' && m.unitUid === unitUid)
    .reduce((sum, m) => sum + (m.amount || 0), 0);
}

// Returns the total aura range bonus granted to all friendly aura sources owned by playerIndex.
// Used by statUtils to expand friendly aura ranges when Exiled Guardian (or similar) is in play.
export function getFriendlyAuraRangeBonus(state, playerIndex) {
  let bonus = 0;
  if (state.activeModifiers) {
    bonus = state.activeModifiers
      .filter(m => {
        if (m.type !== 'auraRangeBuff' || m.playerIndex !== playerIndex) return false;
        const src = state.units.find(u => u.uid === m.unitUid);
        return !src?.hidden;
      })
      .reduce((sum, m) => sum + (m.amount || 0), 0);
  }
  // broken_formation curse: player 0's aura ranges reduced by 1 (minimum 0 net)
  if (state.adventureCurses?.includes('broken_formation') && playerIndex === 0) {
    bonus -= 1;
  }
  return bonus;
}

// Returns the SPD bonus from zoneSpdBuff modifiers for a unit.
// Anchor 'enemyChampion': bonus applies when the unit is within `range` tiles of the enemy champion.
// The modifier belongs to a friendly source unit (same player); all friendly combat units in range benefit.
// Multiple sources (e.g. two Siegeclaw Warchiefs) stack additively.
export function getZoneSpdBonus(state, unit) {
  if (!state.activeModifiers) return 0;
  let bonus = 0;
  for (const mod of state.activeModifiers) {
    if (mod.type !== 'zoneSpdBuff') continue;
    if (mod.playerIndex !== unit.owner) continue;
    const zoneSrc = state.units.find(u => u.uid === mod.unitUid);
    if (zoneSrc?.hidden) continue;
    if (mod.anchor === 'enemyChampion') {
      const enemyChamp = state.champions[1 - unit.owner];
      if (!enemyChamp) continue;
      const dist = Math.abs(unit.row - enemyChamp.row) + Math.abs(unit.col - enemyChamp.col);
      if (dist <= (mod.range || 1)) bonus += (mod.amount || 0);
    }
  }
  return bonus;
}

// Returns the conditional stat bonus for a unit from conditionalStatBuff modifiers.
// Condition type 'minHandSize' / 'minCardsInHand': applies when hand size >= condition.count.
// Scaling type 'friendlyUnitCount': bonus equals the count of other friendly combat units.
export function getConditionalStatBonus(state, unit) {
  if (!state.activeModifiers) return { atk: 0, hp: 0 };
  if (unit.hidden) return { atk: 0, hp: 0 };
  let atk = 0, hp = 0;
  const hand = state.players[unit.owner]?.hand || [];
  for (const mod of state.activeModifiers) {
    if (mod.type !== 'conditionalStatBuff') continue;
    if (mod.unitUid !== unit.uid) continue;
    if (mod.scaling === 'friendlyUnitCount') {
      const count = state.units.filter(
        u => u.owner === unit.owner && u.uid !== unit.uid && !u.isRelic && !u.isOmen && !u.hidden
      ).length;
      if (mod.stat === 'atk') atk += count;
      if (mod.stat === 'hp') hp += count;
      if (mod.stat === 'both' || mod.stat === 'atkAndHp') { atk += count; hp += count; }
      continue;
    }
    if (mod.scaling === 'championDamageTaken') {
      const champ = state.champions?.[unit.owner];
      const damageTaken = champ ? Math.max(0, (champ.maxHp || 0) - (champ.hp || 0)) : 0;
      if (mod.stat === 'atk') atk += damageTaken;
      if (mod.stat === 'hp') hp += damageTaken;
      if (mod.stat === 'both' || mod.stat === 'atkAndHp') { atk += damageTaken; hp += damageTaken; }
      continue;
    }
    let condMet = false;
    if (mod.condition?.type === 'minHandSize' || mod.condition?.type === 'minCardsInHand') {
      condMet = hand.length >= (mod.condition.count || 0);
    }
    if (!condMet) continue;
    if (mod.stat === 'atk') atk += (mod.amount || 0);
    if (mod.stat === 'hp') hp += (mod.amount || 0);
    if (mod.stat === 'both' || mod.stat === 'atkAndHp') { atk += (mod.amount || 0); hp += (mod.amount || 0); }
  }
  return { atk, hp };
}

// Returns true if the unit is shielded from spell targeting by an auraSpellImmunity modifier.
// Source unit (Wardlight Colossus) is NOT protected by its own aura.
export function isAuraSpellImmune(state, unit) {
  if (!state.activeModifiers) return false;
  if (unit.hidden || unit.isRelic || unit.isOmen) return false;
  const rangeBonus = getFriendlyAuraRangeBonus(state, unit.owner);
  for (const mod of state.activeModifiers) {
    if (mod.type !== 'auraSpellImmunity') continue;
    if (mod.playerIndex !== unit.owner) continue;
    if (mod.unitUid === unit.uid) continue; // source doesn't protect itself
    const src = state.units.find(u => u.uid === mod.unitUid);
    if (!src || src.hidden) continue;
    if (manhattan([src.row, src.col], [unit.row, unit.col]) <= (mod.range || 0) + rangeBonus) return true;
  }
  return false;
}

// ── Condition checker ──────────────────────────────────────────────────────

function checkCondition(condition, state, playerIndex) {
  if (!condition) return true;
  if (condition.type === 'minFriendlyUnits') {
    const count = state.units.filter(
      u => u.owner === playerIndex && !u.isRelic && !u.isOmen && !u.hidden
    ).length;
    return count >= (condition.count || 0);
  }
  return true;
}

// ── Effect resolver ────────────────────────────────────────────────────────

function resolveEffect(effectId, listener, context, state) {
  const { unitUid, playerIndex } = listener;
  const listenerUnit = state.units.find(u => u.uid === unitUid);

  switch (effectId) {

    case 'gainPlusOnePlusOne': {
      if (!listenerUnit) return;
      listenerUnit.atk += 1;
      listenerUnit.hp += 1;
      listenerUnit.maxHp += 1;
      addLog(state, `${listenerUnit.name} grows! Now ${listenerUnit.atk}/${listenerUnit.hp}.`);
      break;
    }

    case 'gainPlusOneHP': {
      if (!listenerUnit) return;
      listenerUnit.hp += 1;
      listenerUnit.maxHp += 1;
      addLog(state, `${listenerUnit.name} gains +1 HP. Now ${listenerUnit.atk}/${listenerUnit.hp}.`);
      break;
    }

    case 'dealOneToEnemyChampion': {
      const enemyIdx = 1 - playerIndex;
      const enemyChamp = state.champions[enemyIdx];
      const dmgCtx = { attackerPlayerIndex: playerIndex, damage: 1 };
      fireTrigger('onNonCombatChampionDamage', dmgCtx, state);
      const total = 1 + (dmgCtx.extraDamage || 0);
      enemyChamp.hp -= total;
      addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: deals ${total} damage to enemy champion (${enemyChamp.hp} HP remaining).`);
      checkWinner(state);
      break;
    }

    case 'dealTwoToRandomEnemyUnit': {
      const enemies = state.units.filter(
        u => u.owner !== playerIndex && !u.isRelic && !u.isOmen && !u.hidden
      );
      if (enemies.length === 0) break;
      const target = enemies[Math.floor(Math.random() * enemies.length)];
      addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: deals 2 damage to ${target.name}.`);
      applyDamageToUnit(state, target, 2, listenerUnit ? listenerUnit.name : 'Trigger');
      break;
    }

    case 'restoreOneHPToAllFriendly': {
      const allies = state.units.filter(
        u => u.owner === playerIndex && !u.isRelic && !u.isOmen
      );
      let anyHealed = false;
      for (const ally of allies) {
        const healed = restoreHP(ally, 1, state);
        if (healed > 0) anyHealed = true;
      }
      if (anyHealed) {
        addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: restores 1 HP to all friendly units.`);
      }
      break;
    }

    case 'gainPlusOneHPOnAction': {
      // Increases the HP of the acting unit (passed in context.actingUnit)
      const acting = context?.actingUnit
        ? state.units.find(u => u.uid === context.actingUnit.uid)
        : null;
      if (acting && acting.owner === playerIndex) {
        acting.hp += 1;
        acting.maxHp += 1;
        addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: ${acting.name} gains +1 HP.`);
      }
      break;
    }

    case 'gainPlusOneHPOnCommand': {
      // Increases HP of the unit that spent a command (moved or used action).
      // Triggers on onFriendlyCommand; champion excluded naturally (not in state.units).
      // Relics are excluded — only combat units benefit.
      const acting = context?.actingUnit
        ? state.units.find(u => u.uid === context.actingUnit.uid)
        : null;
      if (acting && acting.owner === playerIndex && !acting.isRelic) {
        acting.hp += 1;
        acting.maxHp += 1;
        addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: ${acting.name} gains +1 HP.`);
      }
      break;
    }

    case 'doubleHPRestore': {
      // Doubles the HP restore amount by setting context.restoreMultiplier.
      // The caller at onHPRestored must apply context.restoreMultiplier before restoring.
      // This effect signals the multiplier to the firing context — handled at call site.
      if (context) context.restoreMultiplier = (context.restoreMultiplier || 1) * 2;
      break;
    }

    case 'plusOneNonCombatChampionDamage': {
      // Adds 1 to context.extraDamage, applied at the call site before dealing damage.
      if (context) context.extraDamage = (context.extraDamage || 0) + 1;
      break;
    }

    case 'returnSacrificedUnit': {
      // Re-summons the sacrificed unit at or near its former tile.
      const sacrificed = context?.sacrificedUnit;
      if (!sacrificed) break;
      const candidates = [
        [sacrificed.row, sacrificed.col],
        [sacrificed.row - 1, sacrificed.col],
        [sacrificed.row + 1, sacrificed.col],
        [sacrificed.row, sacrificed.col - 1],
        [sacrificed.row, sacrificed.col + 1],
      ].filter(([r, c]) => r >= 0 && r <= 4 && c >= 0 && c <= 4);
      let placed = false;
      for (const [tr, tc] of candidates) {
        const occupied =
          state.units.some(u => u.row === tr && u.col === tc) ||
          state.champions.some(ch => ch.row === tr && ch.col === tc);
        if (!occupied) {
          const respawned = {
            ...sacrificed,
            atk: (sacrificed.atk || 0) - (sacrificed.atkBonus || 0),
            atkBonus: 0,
            hp: sacrificed.maxHp,
            shield: 0,
            speedBonus: 0,
            turnAtkBonus: 0,
            row: tr,
            col: tc,
            summoned: true,
            moved: false,
            uid: `${sacrificed.id}_${Math.random().toString(36).slice(2)}`,
          };
          state.units.push(respawned);
          addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: ${sacrificed.name} returns to the board at (${tr},${tc})!`);
          placed = true;
          break;
        }
      }
      if (!placed) {
        addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: ${sacrificed.name} could not return — no open tiles.`);
      }
      break;
    }

    case 'drawOneCard': {
      const p = state.players[playerIndex];
      const drawn = drawCard(state, playerIndex);
      if (drawn) {
        p.hand.push(drawn);
        addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: drew ${drawn.name}.`);
      } else {
        addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: deck is empty, no card drawn.`);
      }
      break;
    }

    case 'drawThreeCards': {
      const p = state.players[playerIndex];
      let drawnCount = 0;
      for (let i = 0; i < 3; i++) {
        const card = drawCard(state, playerIndex);
        if (card) {
          p.hand.push(card);
          drawnCount++;
        }
      }
      if (listenerUnit && listenerUnit.id === 'amethystcrystal') {
        addLog(state, `Amethyst Crystal shattered. Draw 3 cards.`);
      } else {
        addLog(state, `${listenerUnit ? listenerUnit.name : 'Trigger'}: drew ${drawnCount} card(s).`);
      }
      break;
    }

    case 'temporalrift_log': {
      addLog(state, 'Temporal Rift grants an extra command.');
      break;
    }

    case 'bloodmoonBuff': {
      const omen = state.units.find(u => u.uid === unitUid);
      if (!omen) break;
      const turns = omen.turnsRemaining || 0;
      if (turns <= 0) break;
      const allies = state.units.filter(u => u.owner === playerIndex && !u.isRelic && !u.isOmen);
      for (const ally of allies) {
        ally.turnAtkBonus = (ally.turnAtkBonus || 0) + turns;
      }
      addLog(state, `Bloodmoon empowers your units. +${turns} ATK this turn.`);
      break;
    }

    // plusOneAuraRange is handled statically via getAuraRangeBonus, not fired as an effect.
    case 'plusOneAuraRange':
      break;

    case 'summonShadowCopy': {
      // Vexis, the Hollow King: summon a 1/1 shadow copy of the dying enemy unit adjacent to Vexis.
      if (!listenerUnit) break;
      const dead = context?.dyingUnit;
      if (!dead) break;
      const adj = cardinalNeighbors(listenerUnit.row, listenerUnit.col).filter(([r, c]) =>
        !state.units.some(u => u.row === r && u.col === c) &&
        !state.champions.some(ch => ch.row === r && ch.col === c)
      );
      if (adj.length === 0) {
        addLog(state, `Vexis: no open tiles adjacent — Shadow ${dead.name} cannot be summoned.`);
        break;
      }
      const [tr, tc] = adj[Math.floor(Math.random() * adj.length)];
      const origTypes = Array.isArray(dead.unitType) ? dead.unitType : (dead.unitType ? [dead.unitType] : []);
      const shadowUnit = {
        id: `shadow_${dead.id}`,
        sourceId: dead.id,
        name: `Shadow ${dead.name}`,
        type: 'unit',
        cost: dead.cost || 0,
        atk: 1,
        hp: 1,
        maxHp: 1,
        spd: 1,
        unitType: [...origTypes, 'Shadow'],
        attribute: 'demon',
        rules: dead.rules || '',
        action: dead.action || false,
        triggers: dead.triggers ? [...dead.triggers] : [],
        modifier: dead.modifier || null,
        aura: dead.aura || null,
        flying: dead.flying || false,
        image: dead.image || '',
        owner: playerIndex,
        row: tr,
        col: tc,
        summoned: true,
        moved: false,
        atkBonus: 0,
        shield: 0,
        speedBonus: 0,
        turnAtkBonus: 0,
        hidden: false,
        uid: `shadow_${dead.id}_${Math.random().toString(36).slice(2)}`,
      };
      state.units.push(shadowUnit);
      registerUnit(shadowUnit, state);
      registerModifiers(shadowUnit, state);
      addLog(state, `Vexis summons Shadow ${dead.name} at (${tr},${tc}).`);
      break;
    }

    case 'discardOrDie': {
      // Clockwork Manimus: at end of turn, discard a card or the unit is destroyed.
      if (!listenerUnit) break;
      const p = state.players[playerIndex];
      if (!p.hand || p.hand.length === 0) {
        addLog(state, `Clockwork Manimus: no cards in hand — destroyed!`);
        destroyUnit(listenerUnit, state, 'discardOrDie');
      } else {
        addLog(state, `Clockwork Manimus: discard a card to keep it alive.`);
        state.pendingHandSelect = { reason: 'discardOrDie', cardUid: listenerUnit.uid, data: { unitUid: listenerUnit.uid } };
      }
      break;
    }

    case 'negationcrystal_cancel': {
      // Negation Crystal: automatically destroy it and cancel the enemy action.
      if (!listenerUnit) break;
      destroyUnit(listenerUnit, state, 'negationcrystal_cancel');
      addLog(state, `Negation Crystal destroyed — enemy action cancelled!`);
      state.pendingNegationCancel = true;
      break;
    }

    case 'restoreOneHPToChampion': {
      // Dread Mirror passive: restore 1 HP to owning champion when an enemy unit dies.
      const champ = state.champions[playerIndex];
      if (!champ) break;
      const healed = restoreHP(champ, 1, state);
      if (healed > 0) addLog(state, `Dread Mirror restores 1 HP to champion.`);
      break;
    }

    case 'returnToHand': {
      // Shimmer Guardian: when this unit takes damage, remove it from the board and return to hand at base stats.
      if (!listenerUnit) break;
      const ownerIdx = listenerUnit.owner;
      const baseCard = CARD_DB[listenerUnit.id];
      if (!baseCard) break;
      unregisterUnit(listenerUnit.uid, state);
      unregisterModifiers(listenerUnit.uid, state);
      state.units = state.units.filter(u => u.uid !== listenerUnit.uid);
      const handCard = {
        ...baseCard,
        uid: `${listenerUnit.id}_${Math.random().toString(36).slice(2)}`,
      };
      state.players[ownerIdx].hand.push(handCard);
      addLog(state, 'Shimmer Guardian fades back to hand.');
      break;
    }

    case 'stunEnemyChampion': {
      // Kragor's Behemoth: when this unit deals damage to the enemy champion, stun that champion next turn.
      const opponentIdx = 1 - playerIndex;
      if (!state.championStunned) state.championStunned = [false, false];
      state.championStunned[opponentIdx] = true;
      addLog(state, 'Enemy champion stunned by Kragor\'s Behemoth.');
      break;
    }

    case 'deathPing': {
      // Spiteling: when this unit dies, deal 1 damage to a random enemy combat unit.
      // Note: fired via fireDeathTriggers (listener is unregistered before declarative triggers fire).
      // This entry documents the effect and supports shadow copies or future uses.
      const pingEnemies = state.units.filter(
        u => u.owner !== playerIndex && !u.isRelic && !u.isOmen && !u.hidden
      );
      if (pingEnemies.length === 0) break;
      const pingTarget = pingEnemies[Math.floor(Math.random() * pingEnemies.length)];
      addLog(state, `Spiteling lashes out. 1 damage to ${pingTarget.name}.`);
      applyDamageToUnit(state, pingTarget, 1, 'Spiteling');
      break;
    }

    case 'drawOnFirstSpell': {
      // Cascade Sage: draw 1 card the first time a spell is cast each turn.
      // If the played card is not a spell, return false to skip consuming the oncePerTurn flag.
      const card = context?.card;
      if (!card || card.type !== 'spell') return false;
      const p = state.players[playerIndex];
      const drawn = drawCard(state, playerIndex);
      if (drawn) {
        p.hand.push(drawn);
        addLog(state, `Cascade Sage channels the spell. Draw 1 card.`);
      } else {
        addLog(state, `Cascade Sage channels the spell — deck empty.`);
      }
      break;
    }

    case 'royalGuardBuff': {
      // Royal Guard: at the start of each turn, all adjacent friendly combat units gain +1 ATK until end of turn.
      if (!listenerUnit) break;
      const adj = cardinalNeighbors(listenerUnit.row, listenerUnit.col);
      const buffed = state.units.filter(u =>
        u.owner === playerIndex &&
        !u.isRelic && !u.isOmen && !u.hidden &&
        u.uid !== listenerUnit.uid &&
        adj.some(([r, c]) => u.row === r && u.col === c)
      );
      if (buffed.length === 0) break;
      for (const ally of buffed) {
        ally.turnAtkBonus = (ally.turnAtkBonus || 0) + 1;
      }
      addLog(state, `Royal Guard bolsters nearby allies. ${buffed.map(u => u.name).join(', ')} gain +1 ATK this turn.`);
      break;
    }

    case 'scavengerGrow': {
      // Scavenger: gain +1/+1 when an enemy unit dies.
      if (!listenerUnit) break;
      listenerUnit.atk += 1;
      listenerUnit.hp += 1;
      listenerUnit.maxHp += 1;
      addLog(state, `${listenerUnit.name} scavenges the kill! Now ${listenerUnit.atk}/${listenerUnit.hp}.`);
      break;
    }

    case 'denMotherSummonCub': {
      // Den Mother: when a friendly unit with cost 2 or less is destroyed, summon a 1/1 Cub adjacent.
      if (!listenerUnit) break;
      const dead = context?.dyingUnit;
      if (!dead || (dead.cost ?? 0) > 2) break;
      const adj = cardinalNeighbors(listenerUnit.row, listenerUnit.col).filter(([r, c]) =>
        !state.units.some(u => u.row === r && u.col === c) &&
        !state.champions.some(ch => ch.row === r && ch.col === c)
      );
      if (adj.length === 0) {
        addLog(state, `Den Mother: no open adjacent tiles — Cub cannot be summoned.`);
        break;
      }
      const [tr, tc] = adj[Math.floor(Math.random() * adj.length)];
      const cub = {
        ...TOKENS.cub,
        owner: playerIndex,
        row: tr,
        col: tc,
        summoned: true,
        moved: false,
        maxHp: TOKENS.cub.hp,
        atkBonus: 0,
        shield: 0,
        speedBonus: 0,
        turnAtkBonus: 0,
        poison: 0,
        hidden: false,
        uid: `token_cub_${Math.random().toString(36).slice(2)}`,
      };
      state.units.push(cub);
      addLog(state, `Den Mother summons a Cub at (${tr},${tc}).`);
      break;
    }

    case 'carrionFeederDraw': {
      // Carrion Feeder: draw a card when a poisoned enemy unit dies.
      if (!listenerUnit) break;
      const dead = context?.dyingUnit;
      if (!dead || (dead.poison ?? 0) <= 0) break;
      const p = state.players[playerIndex];
      const drawn = drawCard(state, playerIndex);
      if (drawn) {
        p.hand.push(drawn);
        addLog(state, `${listenerUnit.name}: ${dead.name} was poisoned — draw a card.`);
      } else {
        addLog(state, `${listenerUnit.name}: ${dead.name} was poisoned — deck empty.`);
      }
      break;
    }

    case 'survivorsHideRestore': {
      // Survivor's Hide: at start of turn, restore 1 HP to champion per friendly Primal unit.
      const primalCount = state.units.filter(
        u => u.owner === playerIndex && u.attribute === 'primal' && !u.isRelic && !u.isOmen && !u.hidden
      ).length;
      if (primalCount <= 0) break;
      const champ = state.champions[playerIndex];
      const healed = restoreHP(champ, primalCount, state);
      if (healed > 0) addLog(state, `Survivor's Hide: ${primalCount} Primal unit(s) on board — restore ${healed} HP to champion.`);
      break;
    }

    case 'festeringWoundsPoison': {
      // Festering Wounds: at end of turn, all poisoned enemy units gain +1 Poison.
      const enemies = state.units.filter(u => u.owner !== playerIndex && (u.poison ?? 0) > 0);
      for (const enemy of enemies) {
        applyPoison(state, enemy, 1);
      }
      if (enemies.length > 0) addLog(state, `Festering Wounds festers — ${enemies.length} poisoned unit(s) gain +1 Poison.`);
      break;
    }

    case 'shieldMaidenATKGain': {
      // Shield Maiden: when this unit takes damage and survives, gain +1 ATK permanently.
      if (!listenerUnit) break;
      // Only fire when THIS unit took the damage (context.damagedUnit is the actual damaged unit).
      if (context?.damagedUnit?.uid !== listener.unitUid) break;
      if (listenerUnit.hp <= 0) break; // must survive
      listenerUnit.atk += 1;
      addLog(state, `Shield Maiden: survived damage — gains +1 ATK! Now ${listenerUnit.atk}/${listenerUnit.hp}.`);
      break;
    }

    case 'squiresOathInherit': {
      // Squire's Oath: when a friendly unit with 4+ ATK dies, inherit its ATK.
      if (!listenerUnit) break;
      const dead = context?.dyingUnit;
      if (!dead) break;
      const deadAtk = dead.atk || 0;
      if (deadAtk < 4) break;
      listenerUnit.atk = deadAtk;
      addLog(state, `Squire's Oath: ${listenerUnit.name} inherits ${deadAtk} ATK from ${dead.name}!`);
      break;
    }

    case 'eternalVigilSummon': {
      // Eternal Vigil: at the start of your turn, summon a random unit from your grave adjacent to champion.
      if (!listenerUnit) break;
      const p = state.players[playerIndex];
      const graveUnits = (p.grave || []).filter(c => c.type === 'unit' && !c.isRelic && !c.isOmen && !c.token && !c.isToken);
      if (graveUnits.length === 0) break;
      const champ = state.champions[playerIndex];
      const adjTiles = cardinalNeighbors(champ.row, champ.col).filter(([r, c]) =>
        !state.units.some(u => u.row === r && u.col === c) &&
        !state.champions.some(ch => ch.row === r && ch.col === c)
      );
      if (adjTiles.length === 0) {
        addLog(state, `Eternal Vigil: no adjacent tile available for summon.`);
        break;
      }
      const graveEntry = graveUnits[Math.floor(Math.random() * graveUnits.length)];
      const graveIdx = p.grave.findIndex(c => c.uid === graveEntry.uid);
      if (graveIdx !== -1) p.grave.splice(graveIdx, 1);
      const [tr, tc] = adjTiles[Math.floor(Math.random() * adjTiles.length)];
      const baseCard = CARD_DB[graveEntry.id];
      if (!baseCard) break;
      const summoned = {
        ...baseCard,
        owner: playerIndex,
        row: tr,
        col: tc,
        maxHp: baseCard.hp,
        summoned: true,
        moved: false,
        atkBonus: 0,
        shield: 0,
        speedBonus: 0,
        turnAtkBonus: 0,
        hidden: false,
        uid: `${baseCard.id}_${Math.random().toString(36).slice(2)}`,
      };
      state.units.push(summoned);
      registerUnit(summoned, state);
      registerModifiers(summoned, state);
      addLog(state, `Eternal Vigil: ${summoned.name} rises from the grave at (${tr},${tc}).`);
      break;
    }

    case 'abyssalFiendDiscard': {
      // Abyssal Fiend: at end of your turn, discard a random card from hand.
      if (!listenerUnit) break;
      const p = state.players[playerIndex];
      if (!p.hand || p.hand.length === 0) break;
      const randIdx = Math.floor(Math.random() * p.hand.length);
      const [discarded] = p.hand.splice(randIdx, 1);
      if (!p.discard) p.discard = [];
      p.discard.push(discarded);
      addLog(state, `Abyssal Fiend: discards ${discarded.name}.`);
      break;
    }

    case 'cursedResilienceRestore': {
      // Cursed Resilience: at end of turn, restore 1 HP per HP-payment event this turn.
      if (!listenerUnit) break;
      const paymentEvents = state.players[playerIndex]?.hpPaidThisTurn || 0;
      if (paymentEvents <= 0) break;
      const champ = state.champions[playerIndex];
      const healed = restoreHP(champ, paymentEvents, state);
      if (healed > 0) addLog(state, `Cursed Resilience: restores ${healed} HP (${paymentEvents} HP payment(s) this turn).`);
      break;
    }

    case 'arcaneCascadePing': {
      // Arcane Cascade: whenever owner casts a spell, deal 1 damage to a random enemy unit.
      if (!listenerUnit) break;
      // Only fires when a spell is played by the same player
      if (context?.card?.type !== 'spell') break;
      const enemies = state.units.filter(u => u.owner !== playerIndex && !u.isOmen && !u.hidden);
      if (enemies.length === 0) break;
      const pingTarget = enemies[Math.floor(Math.random() * enemies.length)];
      applyDamageToUnit(state, pingTarget, 1, 'Arcane Cascade');
      addLog(state, `Arcane Cascade: deals 1 damage to ${pingTarget.name}.`);
      break;
    }

    case 'reflectingPoolCopy': {
      // Reflecting Pool: whenever opponent casts a spell, add a cost-0 copy to owner's hand.
      if (!listenerUnit) break;
      // Fires for the owner of the omen — context.playerIndex is the caster.
      // We want to fire when the OPPONENT casts (i.e. context.playerIndex !== listener.playerIndex)
      if (context?.card?.type !== 'spell') break;
      if (context?.playerIndex === playerIndex) break; // skip own spell casts
      const copiedCard = { ...context.card, cost: 0, uid: `${context.card.id}_echo_${Math.random().toString(36).slice(2)}` };
      state.players[playerIndex].hand.push(copiedCard);
      addLog(state, `Reflecting Pool: copied ${context.card.name} into hand (costs 0).`);
      break;
    }

    case 'hollowofferingRestore': {
      // Hollow Offering: when destroyed, owner's champion gains +2 HP (can exceed starting max, like Sister Siofra).
      const champ = state.champions[playerIndex];
      if (!champ) break;
      champ.maxHp += 2;
      champ.hp = Math.min(champ.maxHp, champ.hp + 2);
      addLog(state, `Hollow Offering restores 2 HP to champion.`);
      break;
    }

    case 'spellkeeperReturn': {
      // Spellkeeper: after owner casts a spell, return that card to hand.
      const card = context?.card;
      if (!card || card.type !== 'spell') break;
      // Only fires for the owner of the spellkeeper, not the opponent
      if (context?.playerIndex !== playerIndex) break;
      if (!listenerUnit) break;
      const p = state.players[playerIndex];
      const returnedCopy = { ...card, uid: `${card.id}_spellkeeper_${Math.random().toString(36).slice(2)}` };
      p.hand.push(returnedCopy);
      addLog(state, `Spellkeeper: ${card.name} returned to hand.`);
      break;
    }

    case 'manaSurgeBonus': {
      // Mana Surge: at the start of your turn, gain +1 mana for each spell in your grave.
      if (!listenerUnit) break;
      const grave = state.players[playerIndex]?.grave || [];
      const spellCount = grave.filter(c => c.type === 'spell').length;
      if (spellCount <= 0) break;
      state.players[playerIndex].resources = Math.min(10, (state.players[playerIndex].resources || 0) + spellCount);
      addLog(state, `Mana Surge: grants ${spellCount} mana (${spellCount} spell(s) in grave).`);
      break;
    }

    default:
      break;
  }
}

// ── Fire trigger ───────────────────────────────────────────────────────────

// Recursion guard: tracks nested fireTrigger call depth across the call stack.
// JavaScript is single-threaded so a module-level counter is safe.
let _triggerDepth = 0;
const _TRIGGER_DEPTH_MAX = 10;

// Main entry point called by existing trigger hooks.
// event: one of TRIGGER_EVENTS
// context: event-specific data object (see below per event)
// state: mutable game state (already cloned by caller)
//
// Context shapes by event:
//   onEnemyUnitDeath:         { dyingUnit, dyingPlayerIndex, triggeringUid? }
//   onFriendlyUnitDeath:      { dyingUnit, dyingPlayerIndex, triggeringUid? }
//   onChampionDamageDealt:    { attackerPlayerIndex, damage }
//   onCardPlayed:             { playerIndex, card }
//   onFriendlyAction:         { playerIndex, actingUnit }
//   onHPRestored:             { playerIndex, amount, target }
//   onEndTurn:                { playerIndex }
//   onNonCombatChampionDamage:{ attackerPlayerIndex, damage, extraDamage? }
//   onFriendlySacrifice:      { sacrificedUnit, sacrificingPlayerIndex }
//   onDamageTaken:            { damagedUnit, damagedPlayerIndex, triggeringUid }
export function fireTrigger(event, context, state) {
  const listeners = state.triggerListeners?.[event];
  if (!listeners || listeners.length === 0) return;

  if (_triggerDepth >= _TRIGGER_DEPTH_MAX) {
    console.warn(`[fireTrigger] Recursion depth ${_triggerDepth} exceeded for event "${event}" — aborting to prevent stack overflow.`);
    return;
  }

  _triggerDepth++;
  try {
    _fireTriggerInner(event, context, state, listeners);
  } finally {
    _triggerDepth--;
  }
}

function _fireTriggerInner(event, context, state, listeners) {

  // Iterate over a snapshot; listeners may be modified by effects (e.g. unit dies)
  for (const listener of [...listeners]) {
    // Skip if listener was removed (unit died during iteration)
    if (!state.triggerListeners[event].includes(listener)) continue;

    // oncePerTurn guard
    if (listener.oncePerTurn && listener.firedThisTurn) continue;

    // selfTrigger=false: the triggering unit does not trigger its own listener
    if (!listener.selfTrigger && context?.triggeringUid === listener.unitUid) continue;

    // preventRetrigger: avoid infinite loops where this effect re-fires the same listener
    if (listener.preventRetrigger && context?.retriggerUid === listener.unitUid) continue;

    // Hidden unit guard: units that have not yet been revealed do not fire any abilities
    const triggerOwner = state.units.find(u => u.uid === listener.unitUid);
    if (triggerOwner?.hidden) continue;

    // Player index filter per event type
    switch (event) {
      case 'onEnemyUnitDeath':
        // Fires for players whose units killed an enemy (i.e., the opponent of the dying unit)
        if (context?.dyingPlayerIndex == null || listener.playerIndex === context.dyingPlayerIndex) continue;
        break;
      case 'onFriendlyUnitDeath':
        // Fires for the owner of the dying unit
        if (context?.dyingPlayerIndex == null || listener.playerIndex !== context.dyingPlayerIndex) continue;
        break;
      case 'onChampionDamageDealt':
        if (context?.attackerPlayerIndex == null || listener.playerIndex !== context.attackerPlayerIndex) continue;
        break;
      case 'onCardPlayed': {
        if (context?.playerIndex == null || listener.playerIndex !== context.playerIndex) continue;
        // Guard: if selfTrigger=false, skip when the played card is the same card type as the unit
        // owning this trigger (e.g. Hexblood Warlock must not trigger on its own summon event).
        if (!listener.selfTrigger && context?.card?.id != null) {
          const ownerUnit = state.units.find(u => u.uid === listener.unitUid);
          if (ownerUnit && ownerUnit.id === context.card.id) continue;
        }
        break;
      }
      case 'onFriendlyAction':
        if (context?.playerIndex == null || listener.playerIndex !== context.playerIndex) continue;
        break;
      case 'onFriendlyCommand':
        if (context?.playerIndex == null || listener.playerIndex !== context.playerIndex) continue;
        break;
      case 'onHPRestored':
        if (context?.playerIndex == null || listener.playerIndex !== context.playerIndex) continue;
        break;
      case 'onEndTurn':
        if (context?.playerIndex == null || listener.playerIndex !== context.playerIndex) continue;
        break;
      case 'onBeginTurn':
        if (context?.playerIndex == null || listener.playerIndex !== context.playerIndex) continue;
        break;
      case 'onNonCombatChampionDamage':
        if (context?.attackerPlayerIndex == null || listener.playerIndex !== context.attackerPlayerIndex) continue;
        break;
      case 'onFriendlySacrifice':
        // Fires for the player who sacrificed the unit (the unit's owner)
        if (context?.sacrificingPlayerIndex == null || listener.playerIndex !== context.sacrificingPlayerIndex) continue;
        break;
      case 'onEnemyAction':
        // Fires for the opposing player — listener owned by the player who is NOT acting
        if (context?.actingPlayerIndex == null || listener.playerIndex === context.actingPlayerIndex) continue;
        break;
      case 'onDamageTaken':
        // Fires for the owner of the damaged unit
        if (context?.damagedPlayerIndex == null || listener.playerIndex !== context.damagedPlayerIndex) continue;
        break;
      case 'onCardDiscarded':
        // Fires for the player who discarded — does not fire for opponent forced discards
        if (context?.playerIndex == null || listener.playerIndex !== context.playerIndex) continue;
        break;
      default:
        break;
    }

    // Condition check
    if (!checkCondition(listener.condition, state, listener.playerIndex)) continue;

    // Build context for preventRetrigger passthrough
    const effectCtx = listener.preventRetrigger
      ? { ...context, retriggerUid: listener.unitUid }
      : context;

    const consumed = resolveEffect(listener.effect, listener, effectCtx, state);

    if (listener.oncePerTurn && consumed !== false) {
      listener.firedThisTurn = true;
    }
  }
}

// Reset oncePerTurn flags at the start of each player's turn.
export function resetTurnTriggers(state) {
  if (!state.triggerListeners) return;
  for (const event of TRIGGER_EVENTS) {
    for (const listener of state.triggerListeners[event] || []) {
      listener.firedThisTurn = false;
    }
  }
}

// Apply non-combat damage to the enemy champion, firing onNonCombatChampionDamage
// so that Spite Channeler (and any future listeners) can add bonus damage.
// Returns the total damage actually dealt.
export function dealNonCombatDamageToEnemyChampion(state, attackerPlayerIndex, baseAmount) {
  const ctx = { attackerPlayerIndex, damage: baseAmount };
  fireTrigger('onNonCombatChampionDamage', ctx, state);
  let total = baseAmount + (ctx.extraDamage || 0);
  const enemyChamp = state.champions[1 - attackerPlayerIndex];
  // shield_of_faith blessing: player 0's champion takes 1 less non-combat damage (min 1)
  if (state.adventureShieldOfFaith && enemyChamp.owner === 0) total = Math.max(1, total - 1);
  // marked_for_death curse: player 0's champion takes 1 extra damage
  if (state.adventureCurses?.includes('marked_for_death') && enemyChamp.owner === 0) total += 1;
  enemyChamp.hp -= total;
  checkWinner(state);
  return total;
}
