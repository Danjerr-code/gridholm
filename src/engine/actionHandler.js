/**
 * actionHandler.js — Shared action handler for single-player and multiplayer.
 *
 * Each export takes the current game state plus action parameters, delegates to
 * the appropriate game-engine functions, and returns the new game state.
 *
 * Rules:
 *  - Zero UI logic (no selectMode, no React state, no sound effects)
 *  - Zero Supabase logic
 *  - Pure game logic routing only
 *
 * Adding a new mechanic: add it here once. Both single-player (useGameState.js)
 * and multiplayer (MultiplayerGame.jsx) automatically support it.
 */

import {
  moveChampion,
  moveUnit,
  getApproachTiles,
  manhattan,
  triggerUnitAction,
  resolveSpell,
  endActionAndTurn,
  archerShoot,
  discardCard,
  playerRevealUnit,
  resolveDirectionTile,
  executeApproachAndAttack,
  applyChampionAbility,
  resolveChampionSaplingPlace,
  resolveDeckPeek,
  resolveGlimpse,
  resolveScry,
  resolveHandSelect,
  resolveGraveSelect,
  resolveFleshtitheSacrifice,
  resolveContractSelect,
  resolveBloodPactFriendly,
  resolveBloodPactEnemy,
  cancelSpell,
  castTerrainCard,
  resolveRelicPlace,
} from './gameEngine.js';

// ── Champion movement ──────────────────────────────────────────────────────

/**
 * Move the active player's champion to (row, col).
 * @param {object} state - current game state
 * @param {number} row
 * @param {number} col
 * @returns {object} new game state
 */
export function handleChampionMove(state, row, col) {
  return moveChampion(state, row, col);
}

// ── Unit movement ──────────────────────────────────────────────────────────

/**
 * Move a unit to (row, col), handling approach-attack disambiguation.
 *
 * When a unit is 2 tiles away from an enemy and multiple approach paths exist,
 * the player must choose which intermediate tile to step through. In that case
 * we cannot commit to moveUnit yet — the caller must show approach-tile selection.
 *
 * @param {object} state - current game state
 * @param {string} unitUid
 * @param {number} row
 * @param {number} col
 * @returns {{ needsApproach: false, state: object }|{ needsApproach: true, state: object }}
 *   needsApproach=true means the caller should enter 'approach_select' mode;
 *   the state is unchanged in that case (no commit yet).
 *   needsApproach=false means the move (and any attack) has been applied.
 */
export function handleUnitMove(state, unitUid, row, col) {
  const unit = state.units.find(u => u.uid === unitUid);
  const targetHasEnemy =
    state.units.some(u => u.owner !== state.activePlayer && u.row === row && u.col === col) ||
    state.champions.some(ch => ch.owner !== state.activePlayer && ch.row === row && ch.col === col) ||
    state.units.some(u => u.id === 'amethystcrystal' && u.owner === state.activePlayer && u.row === row && u.col === col);

  if (unit && targetHasEnemy && manhattan([unit.row, unit.col], [row, col]) === 2) {
    const tiles = getApproachTiles(state, unit, row, col);
    if (tiles.length > 1) {
      return { needsApproach: true, state };
    } else if (tiles.length === 1) {
      const [ar, ac] = tiles[0];
      return { needsApproach: false, state: executeApproachAndAttack(state, unitUid, ar, ac, row, col) };
    } else {
      // No approach tiles available — highlight check should prevent this path, but guard anyway.
      return { needsApproach: false, state };
    }
  }

  return { needsApproach: false, state: moveUnit(state, unitUid, row, col) };
}

// ── Unit actions ───────────────────────────────────────────────────────────

/**
 * Trigger the special action for a unit.
 *
 * The caller inspects the returned state's pending fields to determine
 * which UI mode to enter next:
 *   newState.pendingDirectionSelect  → enter 'direction_tile_select' mode
 *   newState.pendingSpell            → enter 'spell' mode
 *   (neither)                        → action is complete, commit state
 *
 * @param {object} state - current game state
 * @param {string} unitUid
 * @returns {object} new game state
 */
export function handleTriggerUnitAction(state, unitUid) {
  return triggerUnitAction(state, unitUid);
}

// ── Spell / card resolution ────────────────────────────────────────────────

/**
 * Resolve a spell targeting a unit or champion.
 * Multi-step spells leave newState.pendingSpell set — the caller stays in
 * 'spell' mode. When pendingSpell is cleared the spell is complete.
 * @param {object} state
 * @param {string} cardUid
 * @param {string} targetUid
 * @returns {object} new game state
 */
export function handleSpellTarget(state, cardUid, targetUid) {
  return resolveSpell(state, cardUid, targetUid);
}

/**
 * Cancel any pending spell, summon, or terrain-cast.
 * @param {object} state
 * @returns {object} new game state
 */
export function handleCancelSpell(state) {
  return cancelSpell(state);
}

/**
 * Resolve a hand-card selection (e.g. Pact of Ruin discard, Clockwork Manimus).
 * @param {object} state
 * @param {string} cardUid - the card chosen from hand
 * @returns {object} new game state
 */
export function handleHandSelect(state, cardUid) {
  return resolveHandSelect(state, cardUid);
}

/**
 * Resolve a grave-card selection (e.g. Rebirth targeting, Glimpse of Fate).
 * @param {object} state
 * @param {string} cardUid
 * @returns {object} new game state
 */
export function handleGraveSelect(state, cardUid) {
  return resolveGraveSelect(state, cardUid);
}

// ── End turn ──────────────────────────────────────────────────────────────

/**
 * End the active player's action phase and advance the turn.
 * The caller should check newState.pendingHandSelect — if set, a Clockwork
 * Manimus (or similar) discard is required before the AI can take its turn.
 * @param {object} state
 * @returns {object} new game state
 */
export function handleEndTurn(state) {
  return endActionAndTurn(state);
}

// ── Archer ────────────────────────────────────────────────────────────────

/**
 * Fire an archer at a target.
 * @param {object} state
 * @param {string} archerUid
 * @param {string} targetUid
 * @returns {object} new game state
 */
export function handleArcherShoot(state, archerUid, targetUid) {
  return archerShoot(state, archerUid, targetUid);
}

// ── Discard / reveal ───────────────────────────────────────────────────────

/**
 * Discard a card from the active player's hand.
 * @param {object} state
 * @param {string} cardUid
 * @returns {object} new game state
 */
export function handleDiscardCard(state, cardUid) {
  return discardCard(state, cardUid);
}

/**
 * Reveal a hidden friendly unit.
 * @param {object} state
 * @param {string} unitUid
 * @returns {object} new game state
 */
export function handleRevealUnit(state, unitUid) {
  return playerRevealUnit(state, unitUid);
}

// ── Direction tile selection ───────────────────────────────────────────────

/**
 * Resolve which board tile the player chose for a direction-select unit action
 * (Vorn, Mana Cannon, Iron Queen).
 * @param {object} state
 * @param {string} unitUid
 * @param {number} row
 * @param {number} col
 * @returns {object} new game state
 */
export function handleDirectionTileSelect(state, unitUid, row, col) {
  return resolveDirectionTile(state, unitUid, row, col);
}

// ── Approach attack ────────────────────────────────────────────────────────

/**
 * Execute an approach-and-attack via an intermediate tile.
 * @param {object} state
 * @param {string} unitUid
 * @param {number} approachRow
 * @param {number} approachCol
 * @param {number} targetRow
 * @param {number} targetCol
 * @returns {object} new game state
 */
export function handleApproachAttack(state, unitUid, approachRow, approachCol, targetRow, targetCol) {
  return executeApproachAndAttack(state, unitUid, approachRow, approachCol, targetRow, targetCol);
}

// ── Champion abilities ─────────────────────────────────────────────────────

/**
 * Apply a champion ability, optionally targeting a unit/champion.
 * @param {object} state
 * @param {number} playerIdx
 * @param {string} abilityId
 * @param {string|null} targetUid - null for targetless abilities (e.g. Dark Pact)
 * @returns {object} new game state
 */
export function handleChampionAbility(state, playerIdx, abilityId, targetUid) {
  return applyChampionAbility(state, playerIdx, abilityId, targetUid);
}

/**
 * Place a champion sapling on a chosen tile.
 * @param {object} state
 * @param {number} row
 * @param {number} col
 * @returns {object} new game state
 */
export function handleChampionSaplingPlace(state, row, col) {
  return resolveChampionSaplingPlace(state, row, col);
}

// ── Deck / graveyard interactions ──────────────────────────────────────────

/**
 * Resolve a deck-peek card selection.
 * @param {object} state
 * @param {string} cardUid
 * @returns {object} new game state
 */
export function handleDeckPeekSelect(state, cardUid) {
  return resolveDeckPeek(state, cardUid);
}

/**
 * Resolve a Glimpse decision (keep top card or swap).
 * @param {object} state
 * @param {boolean} keepTop
 * @returns {object} new game state
 */
export function handleGlimpseDecision(state, keepTop) {
  return resolveGlimpse(state, keepTop);
}

/**
 * Dismiss the Scry overlay (confirms the card order).
 * @param {object} state
 * @returns {object} new game state
 */
export function handleScryDismiss(state) {
  return resolveScry(state);
}

// ── Contracts / Blood Pact ─────────────────────────────────────────────────

/**
 * Select a contract from the contract chooser (Dark Bargain / Blood Pact).
 * @param {object} state
 * @param {string} contractId
 * @returns {object} new game state
 */
export function handleContractSelect(state, contractId) {
  return resolveContractSelect(state, contractId);
}

/**
 * Select the friendly unit for a Blood Pact sacrifice.
 * @param {object} state
 * @param {string} unitUid
 * @returns {object} new game state
 */
export function handleBloodPactFriendly(state, unitUid) {
  return resolveBloodPactFriendly(state, unitUid);
}

/**
 * Select the enemy target for a Blood Pact attack.
 * @param {object} state
 * @param {string} unitUid
 * @returns {object} new game state
 */
export function handleBloodPactEnemy(state, unitUid) {
  return resolveBloodPactEnemy(state, unitUid);
}

// ── Flesh Tithe ────────────────────────────────────────────────────────────

/**
 * Resolve a Flesh Tithe sacrifice decision.
 * @param {object} state
 * @param {'yes'|'no'} choice
 * @param {string|null} sacrificeUid - the unit to sacrifice, or null for 'no'
 * @returns {object} new game state
 */
export function handleFleshtitheSacrifice(state, choice, sacrificeUid) {
  return resolveFleshtitheSacrifice(state, choice, sacrificeUid);
}

// ── Terrain ────────────────────────────────────────────────────────────────

/**
 * Place a terrain card on a board tile.
 * @param {object} state
 * @param {string} cardUid
 * @param {number} row
 * @param {number} col
 * @returns {object} new game state
 */
export function handleTerrainCast(state, cardUid, row, col) {
  return castTerrainCard(state, cardUid, row, col);
}

// ── Relic placement (Amethyst Cache) ──────────────────────────────────────

/**
 * Place the Amethyst Crystal relic on a player-chosen tile adjacent to champion.
 * Called after pendingRelicPlace is set by playCard (Amethyst Cache effect).
 * @param {object} state
 * @param {number} row
 * @param {number} col
 * @returns {object} new game state
 */
export function handleRelicPlace(state, row, col) {
  return resolveRelicPlace(state, row, col);
}
