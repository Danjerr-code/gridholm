/**
 * buildTutorialState.js
 *
 * Creates a valid game state for a tutorial scenario, bypassing the normal
 * createInitialState flow (random decks, mulligan, etc.).
 *
 * For freePlay scenarios, builds a state with the scenario's reduced deck,
 * draws an opening hand, and sets mana to the scenario's starting value.
 *
 * For guided scenarios (scenario 4), sets up a minimal board state with the
 * configured units and starting resources.
 *
 * Supports:
 *   p2Hand: [cardId, ...]  — cards pre-dealt to enemy hand (for AI-turn scenarios)
 *   p2Mana: number         — starting mana for the enemy
 *   p1CommandsPerTurn: number — max commands per player turn override (scenario 4: 1)
 */

import { createInitialState } from '../engine/gameEngine.js';
import { CARD_DB, buildDeck } from '../engine/cards.js';
import { createTriggerListeners, registerUnit, registerModifiers } from '../engine/triggerRegistry.js';

function makeUid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeCard(cardId) {
  const template = CARD_DB[cardId];
  if (!template) throw new Error(`Unknown tutorial card id: ${cardId}`);
  return { ...template, uid: makeUid(cardId) };
}

function makeUnit(cardId, owner, row, col) {
  const card = CARD_DB[cardId];
  if (!card) throw new Error(`Unknown tutorial unit card id: ${cardId}`);
  return {
    ...card,
    owner,
    row,
    col,
    maxHp: card.hp,
    uid: makeUid(`${cardId}_${owner}_${row}_${col}`),
    summoned: false,
    moved: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
    turnAtkBonus: 0,
    hidden: card.hidden || false,
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Builds a game state from the given tutorial scenario config.
 * Returns a state ready for the action phase (no mulligan).
 *
 * @param {object} scenario - one of TUTORIAL_SCENARIOS
 * @returns {object} game state
 */
export function buildTutorialState(scenario) {
  // Start with a properly structured state to inherit all required fields.
  // Use 'human' vs 'beast' so P1=Valorian(light), P2=Kragor(primal).
  const base = createInitialState('human', 'beast');

  const bc = scenario.boardConfig;

  // Skip mulligan — go straight to action phase on turn 1, player 0 first.
  base.phase = 'action';
  base.activePlayer = 0;
  base.firstPlayer = 0;
  base.turn = 1;
  base.mulliganSelections = { 0: [], 1: [] };

  // Champion positions and HP
  base.champions[0] = {
    ...base.champions[0],
    row: bc.p1Champion.row,
    col: bc.p1Champion.col,
    hp: bc.p1Champion.hp,
    maxHp: 20,
    moved: false,
    championStunned: false,
  };
  base.champions[1] = {
    ...base.champions[1],
    row: bc.p2Champion.row,
    col: bc.p2Champion.col,
    hp: bc.p2Champion.hp,
    maxHp: 20,
    moved: false,
    championStunned: false,
  };

  // Reset units, triggers, and modifiers
  base.units = [];
  base.triggerListeners = createTriggerListeners();
  base.activeModifiers = [];

  // Place scenario units on the board
  for (const unitCfg of (bc.units || [])) {
    let unit = makeUnit(unitCfg.cardId, unitCfg.owner, unitCfg.row, unitCfg.col);
    if (unitCfg.overrides) unit = { ...unit, ...unitCfg.overrides };
    base.units.push(unit);
    registerUnit(unit, base);
    registerModifiers(unit, base);
  }

  // Player 1 (human)
  base.players[0] = {
    ...base.players[0],
    resources: bc.p1Mana ?? 0,
    maxResourcesThisTurn: bc.p1Mana ?? 0,
    commandsUsed: 0,
    turnCount: 1,
    hpRestoredThisTurn: 0,
    hand: [],
    deck: [],
    discard: [],
    grave: [],
  };

  // Player 2 (AI / enemy)
  base.players[1] = {
    ...base.players[1],
    resources: bc.p2Mana ?? 0,
    maxResourcesThisTurn: bc.p2Mana ?? 0,
    commandsUsed: 0,
    turnCount: 0,
    hpRestoredThisTurn: 0,
    hand: [],
    deck: [],
    discard: [],
    grave: [],
  };

  if (scenario.freePlay) {
    // Build the player's reduced deck, shuffle, deal 4 cards
    const deckCardIds = bc.p1Deck || [];
    const deckCards = shuffle(deckCardIds.map(id => makeCard(id)));
    const openingHand = deckCards.splice(0, 4);
    base.players[0].hand = openingHand;
    base.players[0].deck = deckCards;
    base.players[0].resources = bc.p1Mana ?? 2;
    base.players[0].maxResourcesThisTurn = bc.p1Mana ?? 2;
    base.players[0].turnCount = 2; // so mana ramps correctly from turn 2 onward

    // Give AI the custom weak deck if specified, otherwise full beast deck
    const aiDeckIds = bc.p2Deck;
    let aiDeckCards;
    if (aiDeckIds && aiDeckIds.length > 0) {
      aiDeckCards = shuffle(aiDeckIds.map(id => makeCard(id)));
    } else {
      aiDeckCards = buildDeck('beast');
    }
    const aiHand = aiDeckCards.splice(0, 4);
    base.players[1].hand = aiHand;
    base.players[1].deck = aiDeckCards;
    base.players[1].resources = 1;
    base.players[1].maxResourcesThisTurn = 1;
    base.players[1].turnCount = 1;
  } else if (scenario.guided) {
    // Guided scenario (scenario 4): preset state, no deck
    base.players[0].hand = (bc.p1Hand || []).map(id => makeCard(id));
    base.players[0].resources = bc.p1Mana ?? 0;
    base.players[0].maxResourcesThisTurn = bc.p1Mana ?? 0;
    // p2 has no hand or deck for guided scenarios
  } else {
    // Non-freeplay: preset hand, empty deck
    base.players[0].hand = (bc.p1Hand || []).map(id => makeCard(id));

    // Give enemy pre-set hand if configured (for AI-turn scenarios like scenario 1)
    if (bc.p2Hand && bc.p2Hand.length > 0) {
      base.players[1].hand = bc.p2Hand.map(id => makeCard(id));
      base.players[1].resources = bc.p2Mana ?? 0;
      base.players[1].maxResourcesThisTurn = bc.p2Mana ?? 0;
      base.players[1].turnCount = 1; // AI will gain mana on begin-turn like turn 2
    }
  }

  // Reset global state flags
  base.winner = null;
  base.pendingSpell = null;
  base.pendingHandSelect = null;
  base.pendingGraveSelect = null;
  base.pendingFleshtitheSacrifice = null;
  base.pendingTerrainCast = null;
  base.pendingDirectionSelect = null;
  base.pendingRelicPlace = null;
  base.pendingNegationCancel = null;
  base.pendingDeckPeek = null;
  base.pendingContractSelect = null;
  base.pendingBloodPact = null;
  base.pendingChampionSaplingPlace = null;
  base.pendingDiscard = false;
  base.pendingSummon = null;
  base.log = ['Tutorial started.'];
  base.championAbilityUsed = [false, false];
  base.championStunned = [false, false];
  base.finalGambitActive = [false, false];
  base.terrainGrid = Array.from({ length: 5 }, () => Array(5).fill(null));
  base.archerShot = [];
  base.recalledThisTurn = [];
  base.graveAccessActive = [false, false];
  base.waddlesActive = [false, false];
  base.bloodlustTriggered = [0, 0];
  base.championStartTile = [null, null];
  base.lucernPendingResummon = [null, null];
  base.deckEmpty = [false, false];

  return base;
}
