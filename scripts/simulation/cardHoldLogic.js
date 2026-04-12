/**
 * cardHoldLogic.js
 *
 * Card hold conditions for the AI. When a card is on the hold list and its
 * conditions are not met, the AI should not play it (or assigns a play score
 * of 2 — only play if literally nothing else is available).
 *
 * Hold list (from LOG-1203 Step 3):
 *   apexrampage     — hold unless a friendly unit is adjacent (dist=1) to enemy champion
 *   angelicblessing — hold unless any friendly unit adjacent to own champion has ATK >= 5
 *   tollofshadows   — hold unless opponent has more relics+omens than you
 *   crushingblow    — hold unless an enemy combat unit is adjacent (dist=1) to your champion
 *   azulon ability  — hold unless you have a spell costing 4+ in hand  (champion ability, not card)
 *   verdantsurge    — hold unless you control 3+ combat units
 *   seconddawn      — hold unless 3+ friendly combat units are in graveyard
 *   bloodmoon       — hold unless you control 3+ combat units
 *
 * Usage:
 *   import { shouldHoldCard, shouldHoldChampionAbility } from './cardHoldLogic.js';
 */

import { manhattan } from '../../src/engine/gameEngine.js';

/**
 * Returns true when a card should be held (conditions not yet met).
 * Call this for 'summon' and 'cast' action types before scoring.
 *
 * @param {object} card    - card object from player's hand (has .id, .effect, .type fields)
 * @param {object} state   - current game state
 * @param {number} [apIdx] - active player index (defaults to state.activePlayer)
 * @returns {boolean}        true = hold the card (reduce score to 2)
 */
export function shouldHoldCard(card, state, apIdx) {
  const ap = apIdx ?? state.activePlayer;
  const enemyIdx = 1 - ap;
  const myChamp  = state.champions[ap];
  const oppChamp = state.champions[enemyIdx];

  // Identify card by effect (spells) or id (omens/units)
  const key = card.effect ?? card.id;

  const myUnits = state.units.filter(u => u.owner === ap);
  const myCombatUnits = myUnits.filter(u => !u.isRelic && !u.isOmen);

  switch (key) {

    case 'apexrampage':
      // Play only when a friendly combat unit is adjacent to enemy champion (dist=1).
      // Apex Rampage gives a unit +2 ATK and 2 extra actions — useless if the unit can't
      // immediately reach and hit the champion.
      return !myCombatUnits.some(u =>
        manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]) === 1
      );

    case 'angelicblessing': {
      // Play only when a friendly combat unit adjacent to own champion has ATK >= 3.
      // ATK >= 3 is a reliable proxy for "+1 permanent buff" (most base units have ATK 1–2).
      // Relaxed from the original ATK >= 5 bar, which was rarely reached by curve builds.
      const adjacentToCaster = myCombatUnits.filter(u =>
        manhattan([u.row, u.col], [myChamp.row, myChamp.col]) === 1
      );
      return !adjacentToCaster.some(u => (u.atk ?? 0) >= 3);
    }

    case 'tollofshadows': {
      // Toll of Shadows forces both players to sacrifice a unit, omen, relic, and discard.
      // Play only when opponent has more relics+omens than you (favorable sacrifice asymmetry).
      const myRelicsOmens  = myUnits.filter(u => u.isRelic || u.isOmen).length;
      const oppRelicsOmens = state.units.filter(u => u.owner === enemyIdx && (u.isRelic || u.isOmen)).length;
      return oppRelicsOmens <= myRelicsOmens;
    }

    case 'crushingblow':
      // Crushing Blow pushes an adjacent enemy unit back and deals 4 damage.
      // Play only when an enemy combat unit is adjacent (dist=1) to your champion —
      // otherwise there's no valid target and/or the push has no value.
      return !state.units.some(u =>
        u.owner === enemyIdx && !u.isRelic && !u.isOmen &&
        manhattan([u.row, u.col], [myChamp.row, myChamp.col]) === 1
      );

    case 'verdantsurge':
      // Verdant Surge buffs champion + units within 2. Only effective with board presence.
      return myCombatUnits.length < 3;

    case 'seconddawn': {
      // Second Dawn returns all friendly units from graveyard to tiles adjacent to champion.
      // Hold until at least 2 units are in the graveyard — two dead units is enough to justify
      // the 8-mana cost. Relaxed from 3, which was almost never reached in 30-turn games.
      const grave = state.players[ap].grave ?? [];
      const combatInGrave = grave.filter(c => c.type === 'unit' && !c.token).length;
      return combatInGrave < 2;
    }

    case 'bloodmoon':
      // Bloodmoon omen buffs units every turn. Only effective with board presence.
      return myCombatUnits.length < 3;

    default:
      return false; // not on hold list — play normally
  }
}

/**
 * Returns true when the Mystic (Azulon) champion ability should be held.
 * Azulon's attuned ability triggers a spell from hand — only worth activating
 * when you have a spell costing 4+ to pair with it.
 *
 * For non-Mystic champions, always returns false (no hold).
 *
 * @param {object} state   - current game state
 * @param {number} [apIdx] - active player index (defaults to state.activePlayer)
 * @returns {boolean}        true = hold the champion ability (reduce score to 2)
 */
export function shouldHoldChampionAbility(state, apIdx) {
  const ap = apIdx ?? state.activePlayer;
  const champ = state.champions[ap];

  // Only applies to Azulon (Mystic champion)
  if (champ.attribute !== 'mystic') return false;

  // Hold unless there's a spell costing 4+ in hand to pair with the ability
  const hand = state.players[ap].hand ?? [];
  const hasTargetSpell = hand.some(c => c.type === 'spell' && (c.cost ?? 0) >= 4);
  return !hasTargetSpell;
}
