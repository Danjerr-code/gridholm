/**
 * simAI.js
 *
 * Rules-based AI player for simulation. Evaluates all legal actions and
 * returns the highest-scoring one using deterministic heuristics.
 *
 * Usage:
 *   import { chooseAction } from './simAI.js';
 *   const action = chooseAction(gameState, commandsUsedThisTurn);
 */

import { getLegalActions } from './headlessEngine.js';
import { getEffectiveAtk, manhattan } from '../../src/engine/gameEngine.js';
import { shouldHoldCard, shouldHoldChampionAbility } from './cardHoldLogic.js';

// Throne tile: the center square of the 5×5 board.
const THRONE = [2, 2];

// Spell effects that deal damage to enemy units.
// Maps effect → estimated damage output (or 'instant-kill' for guaranteed destroys).
const DAMAGE_SPELL_DAMAGE = {
  smite:        4,
  souldrain:    2,
  spiritbolt:   null, // variable; estimated separately
  darksentence: Infinity, // always destroys
  devour:       Infinity, // always destroys (engine only allows on hp <= 2)
  pactofruin:   3,      // actually pactofruin_damage, but card effect is 'pactofruin'
};

// Spell effects that are classified as buffs (not damage).
// Note: overgrowth and bloom are excluded here — handled with HP-aware scoring below.
const BUFF_SPELL_EFFECTS = new Set([
  'ironshield', 'forgeweapon', 'fortify', 'rally', 'crusade', 'martiallaw',
  'ambush', 'packhowl', 'pounce', 'savagegrowth', 'callofthesnakes', 'moonleaf',
  'entangle', 'ancientspring', 'verdantsurge', 'ironthorns',
  'infernalpact', 'shadowveil', 'bloodoffering', 'recall',
]);

/**
 * Estimate damage a spell will deal to a given target unit.
 * Returns a numeric estimate (or Infinity for instant-kill effects).
 */
function estimateSpellDamage(effect, targetUnit, state) {
  if (!(effect in DAMAGE_SPELL_DAMAGE)) return 0;
  const base = DAMAGE_SPELL_DAMAGE[effect];
  if (base === null) {
    // spiritbolt: friendly units within 2 of active player's champion + 1
    const ap = state.activePlayer;
    const champ = state.champions[ap];
    const nearby = state.units.filter(u =>
      u.owner === ap && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2
    ).length;
    return nearby + 1;
  }
  return base;
}

/**
 * Get the card cost of a unit on the board (falls back to 0 if not set).
 */
function unitCost(unit) {
  return unit.cost ?? 0;
}

/**
 * Score a single action given the current game state.
 * Returns a numeric score.
 */
function scoreAction(action, state) {
  const ap = state.activePlayer;
  const enemyIdx = 1 - ap;
  const enemyChamp = state.champions[enemyIdx];

  switch (action.type) {

    case 'move': {
      const unit = state.units.find(u => u.uid === action.unitId);
      if (!unit) return -1;
      const [tr, tc] = action.targetTile;
      const attackerAtk = getEffectiveAtk(state, unit, [tr, tc]);

      // Check if moving to enemy champion's tile
      const hitsChamp = enemyChamp.row === tr && enemyChamp.col === tc;
      if (hitsChamp) {
        const dmgToChamp = attackerAtk;
        if (dmgToChamp >= enemyChamp.hp) return 1000; // lethal
        // Scale attack urgency: much higher priority when champion is low HP
        const atkUrgency = enemyChamp.hp <= 8 ? 20 : (enemyChamp.hp <= 15 ? 15 : 10);
        return dmgToChamp * atkUrgency;
      }

      // Check if moving to an enemy unit's tile (combat)
      const enemyUnit = state.units.find(u => u.owner === enemyIdx && u.row === tr && u.col === tc);
      if (enemyUnit) {
        const defenderAtk = getEffectiveAtk(state, enemyUnit, [tr, tc]);
        const attackerDies = unit.hp <= defenderAtk;
        const defenderDies = enemyUnit.hp <= attackerAtk;

        if (defenderDies && !attackerDies) {
          return 50 + unitCost(enemyUnit);
        }
        if (defenderDies && attackerDies) {
          // Even trade
          return unitCost(enemyUnit) >= unitCost(unit) ? 20 : 5;
        }
        // Attacker dies without killing defender — bad
        if (attackerDies && !defenderDies) {
          return -10;
        }
        // Neither dies: scoring as "approach"
      }

      // Regular move: score by proximity improvements.
      // Urgency scales with enemy champion's HP — converge harder on a wounded champion.
      const curDistToEnemyChamp = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
      const newDistToEnemyChamp = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
      const chaseUrgency = enemyChamp.hp <= 8 ? 35 : (enemyChamp.hp <= 15 ? 22 : 15);
      if (newDistToEnemyChamp < curDistToEnemyChamp) return chaseUrgency;

      // Champion protection: contextual score based on proximity of nearest threat.
      // Beats advance (15) only when an enemy is immediately adjacent to own champion.
      const myChamp = state.champions[ap];
      const isAdjacentToMyChamp = manhattan([tr, tc], [myChamp.row, myChamp.col]) === 1;
      if (isAdjacentToMyChamp) {
        const enemyAdjacentToChamp = state.units.some(u =>
          u.owner === enemyIdx && manhattan([u.row, u.col], [myChamp.row, myChamp.col]) === 1
        );
        if (enemyAdjacentToChamp) return 16; // immediate threat — beats advance
        const enemyNearChamp = state.units.some(u =>
          u.owner === enemyIdx && manhattan([u.row, u.col], [myChamp.row, myChamp.col]) === 2
        );
        if (enemyNearChamp) return 12; // nearby threat — tiebreaker with throne approach
      }

      const curDistToThrone = manhattan([unit.row, unit.col], THRONE);
      const newDistToThrone = manhattan([tr, tc], THRONE);
      if (newDistToThrone < curDistToThrone) return 12;

      return 1; // minor score for any movement
    }

    case 'summon': {
      const p = state.players[ap];
      const card = p.hand.find(c => c.uid === action.cardUid);
      if (!card) return -1;

      // Hold logic: if card is on hold list and conditions not met, score 2
      if (shouldHoldCard(card, state, ap)) return 2;

      let score = (card.cost ?? 0) * 3;

      // Bonus if summoning adjacent to a friendly Aura unit
      const [sr, sc] = action.targetTile;
      const adjacentToAura = state.units.some(u =>
        u.owner === ap && u.aura && manhattan([u.row, u.col], [sr, sc]) <= 1
      );
      if (adjacentToAura) score += 10;

      return score;
    }

    case 'cast': {
      const p = state.players[ap];
      const card = p.hand.find(c => c.uid === action.cardUid);
      if (!card) return -1;

      // Hold logic: if card is on hold list and conditions not met, score 2
      if (shouldHoldCard(card, state, ap)) return 2;

      const effect = card.effect;

      // Healing spells: urgency scales with champion HP deficit.
      // Only beats advancing (score 15) when champion is at 50% HP or below.
      if (effect === 'overgrowth' || effect === 'bloom') {
        const myChamp = state.champions[ap];
        if (myChamp.hp <= 5)  return 60; // emergency (<=25% health)
        if (myChamp.hp <= 10) return 30; // urgent (<=50% health)
        return 8; // not urgent — below advance (15), avoid defensive stalling
      }

      if (BUFF_SPELL_EFFECTS.has(effect)) return 15;

      // Damage spell
      if (effect in DAMAGE_SPELL_DAMAGE) {
        const targetUid = action.targets?.[0];
        if (!targetUid) return 10;
        // Check if the spell targets the enemy champion directly
        if (targetUid === `champion${enemyIdx}`) {
          const champ = state.champions[enemyIdx];
          const dmg = estimateSpellDamage(effect, null, state);
          if (dmg >= champ.hp) return 1000; // lethal
          const spellUrgency = champ.hp <= 8 ? 20 : (champ.hp <= 15 ? 15 : 10);
          return dmg * spellUrgency;
        }
        const target = state.units.find(u => u.uid === targetUid);
        if (!target) return 10;
        const dmg = estimateSpellDamage(effect, target, state);
        if (dmg >= target.hp) {
          return 40 + unitCost(target); // kills
        }
        return 10; // damages but doesn't kill
      }

      return 10; // fallback for any unlisted spell
    }

    case 'championAbility': {
      // Azulon (Mystic) hold: only use ability when a spell costing 4+ is in hand.
      if (shouldHoldChampionAbility(state, ap)) return 2;

      // Context-dependent priority — suppress ability spam in mid/late game.
      // Early (turns 1–8): normal scoring below advance but useful.
      // Mid (turns 9–15): below summon scoring — board development comes first.
      // Late (turns 16+): minimum — AI should be attacking/advancing to close.
      // Closing condition (opp HP ≤ 15 AND 2+ combat units): minimum regardless of phase.
      const turn = state.turn ?? 0;
      const oppHP = enemyChamp.hp;
      const myCombatUnits = state.units.filter(u => u.owner === ap && !u.isRelic && !u.isOmen).length;

      if (oppHP <= 15 && myCombatUnits >= 2) return 2; // closing — don't cycle abilities
      if (turn >= 16) return 2;                         // late game — minimum
      if (turn >= 9)  return 8;                         // mid game — below summon (~9–24)

      // Early game: use ability with leftover mana AFTER board development.
      const p = state.players[ap];
      const abilityCost = 2; // all attuned abilities cost 2 mana
      const manaAfterAbility = p.resources - abilityCost;
      const hasFriendlyTarget = state.units.some(u => u.owner === ap);
      const alreadyActed = state.units.some(u => u.owner === ap && u.moved);
      if (alreadyActed && manaAfterAbility <= 2) return 18; // spend leftover mana
      if (manaAfterAbility >= 3 && hasFriendlyTarget) return 14;
      return 10;
    }

    case 'championMove': {
      const champ = state.champions[ap];
      const { row: tr, col: tc } = action;

      // Moving away from adjacent enemy units takes priority
      const adjEnemies = state.units.filter(u =>
        u.owner === enemyIdx &&
        manhattan([champ.row, champ.col], [u.row, u.col]) === 1
      );
      if (adjEnemies.length > 0) {
        const newAdjEnemies = adjEnemies.filter(u =>
          manhattan([tr, tc], [u.row, u.col]) === 1
        );
        if (newAdjEnemies.length < adjEnemies.length) return 25;
      }

      // Moving toward Throne
      const curDistToThrone = manhattan([champ.row, champ.col], THRONE);
      const newDistToThrone = manhattan([tr, tc], THRONE);
      if (newDistToThrone < curDistToThrone) return 8;

      return 1;
    }

    case 'unitAction': {
      // If the action targets the enemy champion, apply urgency scaling
      if (action.targetUid === `champion${enemyIdx}`) {
        const champ = state.champions[enemyIdx];
        const urgency = champ.hp <= 8 ? 30 : (champ.hp <= 15 ? 22 : 15);
        return urgency;
      }
      return 15; // unit actions are generally useful
    }

    case 'fleshtitheSacrifice': {
      if (action.choice === 'no') return 5; // baseline: decline
      if (action.choice === 'yes' && action.sacrificeUid) {
        // Sacrifice weakest unit for +2/+2 on Flesh Tithe — usually worth it
        const sacrifice = state.units.find(u => u.uid === action.sacrificeUid);
        if (!sacrifice) return 5;
        // Prefer sacrificing low-cost, low-HP units
        const sacrificeCost = sacrifice.cost ?? 0;
        if (sacrificeCost <= 2) return 30; // great trade
        if (sacrificeCost <= 3) return 15; // acceptable
        return 3; // too expensive to sacrifice
      }
      return 5;
    }

    case 'handSelect': {
      // Select cheapest card to discard (minimize resource loss)
      const p = state.players[state.activePlayer];
      const card = p.hand.find(c => c.uid === action.cardUid);
      if (!card) return 5;
      // Lower cost = better discard candidate (keep expensive cards)
      return Math.max(1, 10 - (card.cost ?? 0));
    }

    case 'endTurn': {
      return 0;
    }

    default:
      return 0;
  }
}

/**
 * Selects the best action for the current player using rules-based scoring.
 *
 * @param {object} gameState    - current game state
 * @param {number} commandsUsed - number of unit moves already taken this turn (0–3)
 * @returns {object}             action object to apply
 */
export function chooseAction(gameState, commandsUsed = 0) {
  let actions = getLegalActions(gameState);

  // Enforce 3-command limit for unit moves (self-tracked by caller)
  if (commandsUsed >= 3) {
    actions = actions.filter(a => a.type !== 'move');
  }

  if (actions.length === 0) {
    return { type: 'endTurn' };
  }

  // Score every action
  const scored = actions.map(action => ({
    action,
    score: scoreAction(action, gameState),
  }));

  // Find the maximum score
  const maxScore = Math.max(...scored.map(s => s.score));

  // Collect all tied top-scoring actions and pick one at random
  const best = scored.filter(s => s.score === maxScore);
  return best[Math.floor(Math.random() * best.length)].action;
}
