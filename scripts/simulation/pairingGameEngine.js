/**
 * pairingGameEngine.js
 *
 * Custom game initializer for the pairing matrix simulation.
 * Creates games with arbitrary 30-card arrays instead of fixed faction decks.
 *
 * Exports:
 *   createPairingGame(p1DeckId, p1CardIds, p2DeckId, p2CardIds) → game state
 *   applyAction, isGameOver, getLegalActions, getGameStats (re-exported from headlessEngine)
 */

import {
  createInitialState,
  autoAdvancePhase,
  cloneState,
} from '../../src/engine/gameEngine.js';

import {
  applyAction,
  isGameOver,
  getLegalActions,
  getGameStats,
} from './headlessEngine.js';

import { CARD_DB, shuffle } from '../../src/engine/cards.js';
import { calculateResonance, RESONANCE_THRESHOLDS } from '../../src/engine/attributes.js';

// Re-export game action functions unchanged
export { applyAction, isGameOver, getLegalActions, getGameStats };

const ATTR_FROM_DECKID = {
  human: 'light',
  beast: 'primal',
  elf:   'mystic',
  demon: 'dark',
};

function computeResonanceTier(score) {
  const tier = score >= RESONANCE_THRESHOLDS.ascended ? 'ascended'
    : score >= RESONANCE_THRESHOLDS.attuned ? 'attuned'
    : 'none';
  return { score, tier };
}

function makeCardObjects(cardIds) {
  return shuffle(
    cardIds
      .map(id => {
        const def = CARD_DB[id];
        if (!def) {
          console.warn(`[pairingGameEngine] Unknown card id: ${id}`);
          return null;
        }
        return { ...def, uid: `${id}_${Math.random().toString(36).slice(2)}` };
      })
      .filter(Boolean)
  );
}

/**
 * Create a game with custom 30-card decks.
 *
 * @param {string}   p1DeckId  - 'human'|'beast'|'elf'|'demon' (determines champion + FACTION_ATTRIBUTE)
 * @param {string[]} p1CardIds - Array of 30 card IDs for player 1
 * @param {string}   p2DeckId  - 'human'|'beast'|'elf'|'demon'
 * @param {string[]} p2CardIds - Array of 30 card IDs for player 2
 * @returns {object} Initial game state ready for play
 */
export function createPairingGame(p1DeckId, p1CardIds, p2DeckId, p2CardIds) {
  // Create a canonical initial state. This sets up the champion positions, trigger
  // listeners, all pending state fields, and the correct FACTION_ATTRIBUTE for each
  // player (which drives ascended abilities and resonance attribute checks).
  // The standard faction decks are dealt here — we overwrite them below.
  let state = createInitialState(p1DeckId, p2DeckId);

  // Build and shuffle custom card objects
  const p1Cards = makeCardObjects(p1CardIds);
  const p2Cards = makeCardObjects(p2CardIds);

  if (p1Cards.length !== 30 || p2Cards.length !== 30) {
    throw new Error(
      `createPairingGame: expected 30 cards each, got p1=${p1Cards.length} p2=${p2Cards.length}`
    );
  }

  // Deal 4 cards to hand; rest goes to deck
  state.players[0].hand = p1Cards.slice(0, 4);
  state.players[0].deck = p1Cards.slice(4);
  state.players[1].hand = p2Cards.slice(0, 4);
  state.players[1].deck = p2Cards.slice(4);

  // Recompute resonance based on actual cards (not the replaced faction cards)
  const p1Attr = ATTR_FROM_DECKID[p1DeckId] ?? 'light';
  const p2Attr = ATTR_FROM_DECKID[p2DeckId] ?? 'light';
  state.players[0].resonance = computeResonanceTier(calculateResonance(p1Cards, p1Attr));
  state.players[1].resonance = computeResonanceTier(calculateResonance(p2Cards, p2Attr));

  // Run begin-turn phase (draws 0 cards on turn 1 for first player, gains resources)
  return autoAdvancePhase(state);
}
