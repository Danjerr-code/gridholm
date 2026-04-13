/**
 * headlessEngine.js
 *
 * Standalone headless game engine for simulation and AI.
 * No React, DOM, or UI dependencies.
 * Imports pure game logic from src/engine/ only.
 *
 * Exports:
 *   createGame(deck1Id, deck2Id)  → initial game state
 *   getLegalActions(gameState)    → array of action objects
 *   applyAction(gameState, action) → new game state
 *   isGameOver(gameState)         → { over, winner }
 *   getGameStats(gameState)       → summary object
 */

import {
  createInitialState,
  autoAdvancePhase,
  submitMulligan,
  cloneState,
  endTurn,
  moveChampion,
  moveUnit,
  playCard,
  summonUnit,
  resolveSpell,
  resolveFleshtitheSacrifice,
  resolveHandSelect,
  applyChampionAbility,
  triggerUnitAction,
  getChampionMoveTiles,
  getUnitMoveTiles,
  getSummonTiles,
  getSpellTargets,
  getChampionAbilityTargets,
  getChampionDef,
  hasValidTargets,
  manhattan,
  getTerrainCastTiles,
  castTerrainCard,
} from '../../src/engine/gameEngine.js';

import { ACTION_REGISTRY } from '../../src/engine/actionRegistry.js';

// Standard deck IDs supported by the headless engine.
// 'custom' is excluded — it requires localStorage.
const VALID_DECK_IDS = new Set(['human', 'beast', 'elf', 'demon']);

// Spells that require no explicit target (resolved immediately in playCard).
const NO_TARGET_SPELLS = new Set([
  'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
  'ironthorns', 'infernalpact', 'martiallaw', 'fortify', 'shadowveil',
  'ancientspring', 'verdantsurge',
]);

// Spells that require two sequential target selections (multi-step).
const TWO_STEP_SPELLS = new Set(['bloom', 'ambush']);

// Unit action IDs that need a target (use pendingSpell mechanism).
const TARGETED_ACTION_UNITS = new Set(['woodlandguard', 'packrunner', 'elfarcher', 'bloodaltar']);

// ── createGame ────────────────────────────────────────────────────────────────

/**
 * Creates a new game between two standard decks.
 * Returns the full initial game state object with both players' hands dealt,
 * decks shuffled, champions placed, and resonance calculated.
 *
 * @param {string} deck1Id - 'human' | 'beast' | 'elf' | 'demon'
 * @param {string} deck2Id - 'human' | 'beast' | 'elf' | 'demon'
 */
export function createGame(deck1Id = 'human', deck2Id = 'beast') {
  if (!VALID_DECK_IDS.has(deck1Id) || !VALID_DECK_IDS.has(deck2Id)) {
    throw new Error(
      `Unsupported deck ID. Use one of: ${[...VALID_DECK_IDS].join(', ')}`
    );
  }
  // Both simulation players auto-keep their opening hand (no UI mulligan step).
  // submitMulligan with empty arrays for both immediately transitions to begin-turn.
  const s = createInitialState(deck1Id, deck2Id);
  submitMulligan(s, 0, []);
  submitMulligan(s, 1, []);
  return autoAdvancePhase(s);
}

// ── isGameOver ────────────────────────────────────────────────────────────────

/**
 * Returns { over: boolean, winner: 'p1' | 'p2' | null }.
 */
export function isGameOver(state) {
  if (!state.winner) return { over: false, winner: null };
  // state.winner is the winning player's name string
  const winnerPlayer = state.players.find(p => p.name === state.winner);
  const winner = winnerPlayer ? (winnerPlayer.id === 0 ? 'p1' : 'p2') : null;
  return { over: true, winner };
}

// ── getGameStats ──────────────────────────────────────────────────────────────

/**
 * Returns a summary of the current game state.
 */
export function getGameStats(state) {
  return {
    turn: state.turn,
    phase: state.phase,
    activePlayer: state.activePlayer === 0 ? 'p1' : 'p2',
    champions: state.champions.map((c, i) => ({
      player: i === 0 ? 'p1' : 'p2',
      hp: c.hp,
      maxHp: c.maxHp,
      moved: c.moved,
    })),
    units: {
      p1: state.units.filter(u => u.owner === 0).map(u => ({
        uid: u.uid, id: u.id, name: u.name, hp: u.hp, maxHp: u.maxHp, atk: u.atk, spd: u.spd,
        row: u.row, col: u.col, moved: u.moved, summoned: u.summoned,
      })),
      p2: state.units.filter(u => u.owner === 1).map(u => ({
        uid: u.uid, id: u.id, name: u.name, hp: u.hp, maxHp: u.maxHp, atk: u.atk, spd: u.spd,
        row: u.row, col: u.col, moved: u.moved, summoned: u.summoned,
      })),
    },
    hands: state.players.map((p, i) => ({
      player: i === 0 ? 'p1' : 'p2',
      count: p.hand.length,
      cards: p.hand.map(c => ({ uid: c.uid, id: c.id, name: c.name, cost: c.cost, type: c.type })),
    })),
    decks: state.players.map((p, i) => ({
      player: i === 0 ? 'p1' : 'p2',
      remaining: p.deck.length,
    })),
    resources: state.players.map((p, i) => ({
      player: i === 0 ? 'p1' : 'p2',
      resources: p.resources,
    })),
  };
}

// ── getLegalActions ───────────────────────────────────────────────────────────

/**
 * Returns an array of all legal actions the current player can take.
 *
 * Action shapes:
 *   { type: 'championMove', row, col }
 *   { type: 'move', unitId, targetTile: [row, col] }
 *   { type: 'summon', cardUid, targetTile: [row, col] }
 *   { type: 'cast', cardUid, targets: [] | [targetUid] | [step0uid, step1uid] }
 *   { type: 'championAbility', abilityId, targetUid }
 *   { type: 'unitAction', unitId, targetUid }  (targetUid is null for no-target actions)
 *   { type: 'endTurn' }
 */
export function getLegalActions(state) {
  const actions = [];
  if (state.winner) return actions;
  if (state.phase !== 'action') return actions;

  // ── Resolve Flesh Tithe sacrifice prompt ────────────────────────────────────
  if (state.pendingFleshtitheSacrifice) {
    const ap = state.activePlayer;
    const pending = state.pendingFleshtitheSacrifice;
    // Decline sacrifice (always available)
    actions.push({ type: 'fleshtitheSacrifice', choice: 'no', sacrificeUid: null });
    // Accept sacrifice: pick any friendly unit except Flesh Tithe itself
    for (const unit of state.units.filter(u => u.owner === ap && u.uid !== pending.unitUid && !u.isRelic && !u.isOmen)) {
      actions.push({ type: 'fleshtitheSacrifice', choice: 'yes', sacrificeUid: unit.uid });
    }
    return actions;
  }

  // ── Resolve hand selection prompt (Pact of Ruin, etc.) ─────────────────────
  if (state.pendingHandSelect) {
    const ap = state.activePlayer;
    for (const card of state.players[ap].hand) {
      actions.push({ type: 'handSelect', cardUid: card.uid });
    }
    // If hand is empty, still need to advance (return a no-op marker)
    if (actions.length === 0) actions.push({ type: 'handSelect', cardUid: null });
    return actions;
  }

  // ── Resolve orphaned pendingSpell (set by resolveHandSelect, unit summon, etc.) ──
  if (state.pendingSpell) {
    const { effect, step, data } = state.pendingSpell;
    const targets = getSpellTargets(state, effect, step ?? 0, data ?? {});
    if (targets.length > 0) {
      for (const targetUid of targets) {
        actions.push({ type: 'pendingSpellTarget', targetUid });
      }
    } else {
      // No targets available — resolve with null to let the spell fire or fizzle
      actions.push({ type: 'pendingSpellTarget', targetUid: null });
    }
    return actions;
  }

  // Skip if mid-summon (caller should resolve pending state first)
  if (state.pendingSummon) return actions;
  if (state.pendingDiscard) return actions;

  // Explicit guard for unresolvable pending states (returns [] so minimax treats as terminal)
  if (
    state.pendingRelicPlace ||
    state.pendingTerrainCast ||
    state.pendingContractSelect ||
    state.pendingDiscardSelect ||
    state.pendingSacrifice ||
    state.pendingGildedCage ||
    state.pendingMindSeize ||
    state.pendingRecall ||
    state.pendingCrushingBlow ||
    state.pendingTollOfShadows ||
    state.pendingPactOfRuin
  ) {
    return actions;
  }
  // Catch-all: any future pending state not yet in the list above
  const hasPendingState = Object.keys(state).some(key => key.startsWith('pending') && state[key]);
  if (hasPendingState) return actions;

  const ap = state.activePlayer;
  const p = state.players[ap];
  const champ = state.champions[ap];

  // 1. Champion moves
  for (const [row, col] of getChampionMoveTiles(state)) {
    actions.push({ type: 'championMove', row, col });
  }

  // 2. Unit moves (not summoned, not already moved, SPD > 0)
  for (const unit of state.units.filter(u => u.owner === ap)) {
    for (const [row, col] of getUnitMoveTiles(state, unit.uid)) {
      actions.push({ type: 'move', unitId: unit.uid, targetTile: [row, col] });
    }
  }

  // 3. Summon unit, relic, and omen cards
  const summonTiles = getSummonTiles(state);
  if (summonTiles.length > 0) {
    for (const card of p.hand) {
      if (card.type !== 'unit' && card.type !== 'relic' && card.type !== 'omen') continue;
      if (p.resources < card.cost) continue;
      if ((state.recalledThisTurn || []).includes(card.id)) continue;
      for (const [row, col] of summonTiles) {
        actions.push({ type: 'summon', cardUid: card.uid, targetTile: [row, col] });
      }
    }
  }

  // 3b. Terrain cards — pick a target tile from valid terrain cast tiles
  const terrainCastTiles = getTerrainCastTiles(state);
  if (terrainCastTiles.length > 0) {
    for (const card of p.hand) {
      if (card.type !== 'terrain') continue;
      if (p.resources < card.cost) continue;
      for (const [row, col] of terrainCastTiles) {
        actions.push({ type: 'terrain', cardUid: card.uid, targetTile: [row, col] });
      }
    }
  }

  // 4. Spell cards
  for (const card of p.hand) {
    if (card.type !== 'spell') continue;
    if (p.resources < card.cost) continue;
    if (!hasValidTargets(card, state, ap)) continue;

    if (NO_TARGET_SPELLS.has(card.effect)) {
      actions.push({ type: 'cast', cardUid: card.uid, targets: [] });
    } else if (TWO_STEP_SPELLS.has(card.effect)) {
      // Enumerate all valid (step0, step1) target combinations
      const step0Targets = getSpellTargets(state, card.effect, 0, {});
      for (const t0 of step0Targets) {
        // Simulate step 0 to get valid step 1 targets
        let tempState = cloneState(state);
        const tempP = tempState.players[ap];
        const cardIdx = tempP.hand.findIndex(c => c.uid === card.uid);
        // Set up pendingSpell as playCard would, then resolve step 0
        tempState.pendingSpell = { cardUid: card.uid, effect: card.effect, playerIdx: ap, step: 0, data: {} };
        tempState = resolveSpell(tempState, card.uid, t0);
        if (tempState.pendingSpell) {
          // Step 1 is now pending
          const step1Targets = getSpellTargets(tempState, card.effect, 1, tempState.pendingSpell.data || {});
          for (const t1 of step1Targets) {
            actions.push({ type: 'cast', cardUid: card.uid, targets: [t0, t1] });
          }
        }
      }
    } else {
      // Single-target spell
      const targets = getSpellTargets(state, card.effect, 0, {});
      for (const targetUid of targets) {
        actions.push({ type: 'cast', cardUid: card.uid, targets: [targetUid] });
      }
    }
  }

  // 5. Champion ability
  if (!champ.moved && !state.championAbilityUsed?.[ap]) {
    const champDef = getChampionDef(p);
    const attuned = champDef?.abilities?.attuned;
    if (attuned?.type === 'activated') {
      const abilityCost = attuned.cost?.amount ?? 2;
      if (p.resources >= abilityCost) {
        const tf = attuned.targetFilter;
        if (!tf || tf === 'none') {
          actions.push({ type: 'championAbility', abilityId: attuned.id, targetUid: null });
        } else {
          const abilityTargets = getChampionAbilityTargets(state, ap, tf);
          for (const targetUid of abilityTargets) {
            actions.push({ type: 'championAbility', abilityId: attuned.id, targetUid });
          }
        }
      }
    }
  }

  // 6. Unit action abilities
  const commandsUsed = p.commandsUsed ?? 0;
  if (commandsUsed < 3) {
    for (const unit of state.units.filter(u => u.owner === ap && !u.moved && !u.summoned)) {
      if (!ACTION_REGISTRY[unit.id]) continue;
      if (TARGETED_ACTION_UNITS.has(unit.id)) {
        // Enumerate valid targets for this unit's action
        const effectKey = `${unit.id}_action`;
        const targets = getSpellTargets(state, effectKey, 0, { sourceUid: unit.uid });
        for (const targetUid of targets) {
          actions.push({ type: 'unitAction', unitId: unit.uid, targetUid });
        }
      } else {
        // No-target action (sergeant, darkdealer, grovewarden)
        actions.push({ type: 'unitAction', unitId: unit.uid, targetUid: null });
      }
    }
  }

  // 7. End turn (always available in action phase)
  actions.push({ type: 'endTurn' });

  return actions;
}

// ── applyAction ───────────────────────────────────────────────────────────────

/**
 * Takes a game state and a legal action, applies it, resolves all triggers,
 * and returns the new game state. Does not mutate the original state.
 *
 * @param {object} state  - game state (will not be mutated)
 * @param {object} action - action object from getLegalActions
 * @returns {object}       new game state
 */
export function applyAction(state, action) {
  const ap = state.activePlayer;

  switch (action.type) {

    case 'championMove': {
      return moveChampion(state, action.row, action.col);
    }

    case 'move': {
      return moveUnit(state, action.unitId, action.targetTile[0], action.targetTile[1]);
    }

    case 'summon': {
      // playCard sets pendingSummon, then summonUnit places the unit
      let s = playCard(state, action.cardUid);
      if (!s.pendingSummon) return s; // card not valid (e.g. already spent)
      s = summonUnit(s, action.cardUid, action.targetTile[0], action.targetTile[1]);
      return s;
    }

    case 'terrain': {
      // playCard sets pendingTerrainCast, then castTerrainCard places terrain
      let s = playCard(state, action.cardUid);
      if (!s.pendingTerrainCast) return s;
      s = castTerrainCard(s, action.cardUid, action.targetTile[0], action.targetTile[1]);
      return s;
    }

    case 'cast': {
      const { cardUid, targets } = action;
      const p = cloneState(state).players[ap];
      const card = state.players[ap].hand.find(c => c.uid === cardUid);
      if (!card) return cloneState(state);

      if (NO_TARGET_SPELLS.has(card.effect)) {
        // playCard handles no-target spells entirely
        return playCard(state, cardUid);
      }

      if (TWO_STEP_SPELLS.has(card.effect)) {
        // Step 0: set up pendingSpell manually (as playCard would), then resolve step 0
        let s = cloneState(state);
        const pInner = s.players[ap];
        const cardIdx = pInner.hand.findIndex(c => c.uid === cardUid);
        if (cardIdx === -1) return s;
        s.pendingSpell = { cardUid, effect: card.effect, playerIdx: ap, step: 0, data: {} };
        s = resolveSpell(s, cardUid, targets[0]);
        // Step 1: if pendingSpell still set, resolve it
        if (s.pendingSpell && targets[1] != null) {
          s = resolveSpell(s, cardUid, targets[1]);
        }
        return s;
      }

      // Single-target spell: playCard sets pendingSpell, then resolveSpell resolves it
      let s = playCard(state, cardUid);
      if (!s.pendingSpell) return s; // played as no-target or something unexpected
      s = resolveSpell(s, cardUid, targets[0] ?? null);
      return s;
    }

    case 'championAbility': {
      return applyChampionAbility(state, ap, action.abilityId, action.targetUid);
    }

    case 'unitAction': {
      let s = triggerUnitAction(state, action.unitId);
      // If the action needs a target, pendingSpell is set — resolve it now
      if (s.pendingSpell && action.targetUid != null) {
        s = resolveSpell(s, action.unitId, action.targetUid);
      }
      return s;
    }

    case 'fleshtitheSacrifice': {
      return resolveFleshtitheSacrifice(state, action.choice, action.sacrificeUid);
    }

    case 'handSelect': {
      return resolveHandSelect(state, action.cardUid);
    }

    case 'pendingSpellTarget': {
      // Resolve a pending spell that was set up internally (e.g. by resolveHandSelect)
      const pending = state.pendingSpell;
      if (!pending) return cloneState(state);
      return resolveSpell(state, pending.cardUid, action.targetUid);
    }

    case 'endTurn': {
      return endTurn(state);
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
