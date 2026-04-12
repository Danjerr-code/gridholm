/**
 * boardEval.js
 *
 * Board evaluation function for strategic AI.
 *
 * Supports four faction-specific weight profiles (Primal, Mystic, Light, Dark)
 * with three game phases: Early (turns 1–5), Mid (turns 6–12), Late (turns 13+).
 *
 * Phase modifiers multiply relevant weights to reflect how each faction should
 * play at each stage of the game:
 *   Early  — all factions develop board; attack urgency low
 *   Mid    — faction-specific strategies engage fully
 *   Late   — all factions push for champion damage; game-length urgency increases
 *
 * When no explicit weights are passed, evaluateBoard auto-detects the active
 * player's faction from gameState.champions[ap].attribute and applies the
 * matching profile with phase modifiers. Pass a custom weights object to override.
 *
 * Usage:
 *   import { evaluateBoard, WEIGHTS, FACTION_WEIGHTS } from './boardEval.js';
 *   const score = evaluateBoard(gameState, 'p1');           // auto-detects faction + phase
 *   const score = evaluateBoard(gameState, 'p1', myWeights); // explicit override
 */

import { manhattan } from '../../src/engine/gameEngine.js';

// Throne tile: center of the 5×5 board.
const THRONE_ROW = 2;
const THRONE_COL = 2;

/**
 * Universal weight constants — used as the base for all faction profiles.
 * These are the original balanced weights; faction profiles override specific keys.
 */
export const WEIGHTS = {
  championHP:               5,
  championHPDiff:           8,
  unitCountDiff:             8,
  totalATKOnBoard:           3,
  totalHPOnBoard:            2,
  throneControl:            20,
  unitsThreateningChampion: 18,
  unitsAdjacentToAlly:       4,
  cardsInHand:               5,
  hiddenUnits:               6,
  manaEfficiency:            2,
  lethalThreat:             35,
  championProximity:        10,
  opponentChampionLowHP:    30,
  relicsOnBoard:             4,
  omensOnBoard:              3,
  terrainBenefit:            3,  // friendly units on beneficial terrain
  terrainHarm:               3,  // enemy units on harmful terrain
  healingValue:              0,  // bonus per own-champion HP point (Mystic)
};

/**
 * Faction-specific weight profiles.
 * Each profile overrides select keys from WEIGHTS to reflect that faction's
 * win condition. The gameLength penalty start turn is stored separately.
 */
export const FACTION_WEIGHTS = {
  /**
   * Primal — aggressive rush, converge on the champion, play wide fast.
   * Low survivability concern, high attack pressure, short game preferred.
   */
  primal: {
    ...WEIGHTS,
    championHPDiff:           12,   // very aggressive about life lead
    unitsThreateningChampion: 25,   // converge on enemy champion
    championHP:                3,   // willing to take damage
    cardsInHand:               2,   // play everything, low hand value
    unitCountDiff:             5,
    totalATKOnBoard:           6,
    healingValue:              0,
    // gameLengthPenaltyStart: 8 (handled in computeGameLengthPenalty)
  },

  /**
   * Mystic — sustain/control, stay alive, value hand size and board presence.
   * Long game is good; no closing urgency until very late.
   * championHPDiff increases dynamically after turn 12 (late-game closing).
   */
  mystic: {
    ...WEIGHTS,
    championHP:               10,   // very high — staying alive is the strategy
    unitCountDiff:            10,   // maintain board presence
    cardsInHand:               8,   // high — card advantage matters
    championHPDiff:            3,   // low early (increases after turn 12)
    unitsThreateningChampion:  8,   // moderate, not primary early objective
    healingValue:              8,   // new: score board states where champion HP is high
    // gameLengthPenaltyStart: 20 (handled in computeGameLengthPenalty)
  },

  /**
   * Light — formation play, Aura synergies, durable board.
   * Rewards clustering, durability, and formation pressure.
   */
  light: {
    ...WEIGHTS,
    unitsAdjacentToAlly:      10,   // very high — formation matters
    championHP:                7,   // durable champion
    unitCountDiff:             8,   // maintain board
    totalHPOnBoard:            5,   // durability of units matters
    unitsThreateningChampion: 10,   // apply formation pressure
    cardsInHand:               4,
    healingValue:              0,
    // gameLengthPenaltyStart: 10 (default)
  },

  /**
   * Dark — card advantage, information asymmetry, HP as a resource.
   * Hidden units, hand size, and converting advantage into kills.
   */
  dark: {
    ...WEIGHTS,
    cardsInHand:               7,   // card advantage matters
    hiddenUnits:               8,   // information asymmetry
    championHPDiff:            6,   // willing to trade HP for advantage
    championHP:                4,   // HP is a resource, not precious
    unitCountDiff:             5,
    unitsThreateningChampion: 12,   // convert advantage into kills
    healingValue:              0,
    // gameLengthPenaltyStart: 10 (default)
  },
};

// ── Phase system ──────────────────────────────────────────────────────────────

/**
 * Returns the current game phase based on turn number.
 * @param {number} turn
 * @returns {'early'|'mid'|'late'}
 */
function getPhase(turn) {
  if (turn <= 5)  return 'early';
  if (turn <= 12) return 'mid';
  return 'late';
}

/**
 * Apply phase-based multipliers to a weight profile.
 *
 * Early (turns 1–5): develop the board; attack urgency reduced for most factions.
 *   - unitsThreateningChampion × 0.5  (don't rush champion early — EXCEPT Primal)
 *   - championProximity       × 0.5  (don't advance aggressively — EXCEPT Primal)
 *   - totalATKOnBoard         × 0.8  (raw ATK less urgent than position — EXCEPT Primal)
 *   - unitCountDiff           × 1.4  (establish board presence — all factions)
 *   - cardsInHand             × 1.3  (value hand development — all factions, never suppressed)
 *   Primal signature weights (unitsThreateningChampion, totalATKOnBoard) are never
 *   suppressed in early phase — Primal is the early-game aggression faction.
 *   Mystic/Dark cardsInHand is never suppressed in any phase (only amplified here).
 *   Dark hiddenUnits is never suppressed in early or mid phase (not touched here).
 *
 * Mid (turns 6–12): faction-specific strategies kick in fully.
 *   Primal  — increase attack urgency:
 *     unitsThreateningChampion × 1.4, championProximity × 1.3
 *   Mystic  — increase sustain priority:
 *     healingValue × 1.5, cardsInHand × 1.3
 *   Light   — increase formation clustering:
 *     unitsAdjacentToAlly × 1.5, unitCountDiff × 1.2
 *   Dark    — increase card advantage and hidden pressure:
 *     cardsInHand × 1.4, hiddenUnits × 1.5
 *
 * Late (turns 13+): all factions close the game.
 *   - championHPDiff           × 2.0  (finishing matters most)
 *   - unitsThreateningChampion × 1.5  (convert board into damage)
 *   - championProximity        × 1.5  (close the distance)
 *   - lethalThreat             × 1.5  (maximize kill potential)
 *   Mystic late — shift from sustain to closing:
 *     healingValue × 0.3, unitsThreateningChampion uses 18 (not 8)
 *
 * @param {object} w         - base weight profile
 * @param {string} faction   - 'primal'|'mystic'|'light'|'dark'
 * @param {string} phase     - 'early'|'mid'|'late'
 * @returns {object}           adjusted weight profile
 */
function applyPhaseModifiers(w, faction, phase) {
  // Start with a shallow copy
  const pw = { ...w };

  if (phase === 'early') {
    // Primal is the early-game faction — never suppress its core attack weights.
    // unitsThreateningChampion and totalATKOnBoard are Primal's signature weights;
    // suppressing them early defeats the entire Primal early-rush strategy.
    if (faction !== 'primal') {
      pw.unitsThreateningChampion = Math.round(w.unitsThreateningChampion * 0.5);
      pw.championProximity        = Math.round(w.championProximity        * 0.5);
      pw.totalATKOnBoard          = Math.round(w.totalATKOnBoard          * 0.8);
    }
    pw.unitCountDiff = Math.round(w.unitCountDiff * 1.4);
    // cardsInHand: amplify for all factions — this is never a suppression,
    // so Mystic/Dark signature hand values are always preserved or amplified.
    pw.cardsInHand   = Math.round(w.cardsInHand   * 1.3);
  }

  if (phase === 'mid') {
    switch (faction) {
      case 'primal':
        pw.unitsThreateningChampion = Math.round(w.unitsThreateningChampion * 1.4);
        pw.championProximity        = Math.round(w.championProximity        * 1.3);
        break;
      case 'mystic':
        pw.healingValue  = Math.round(w.healingValue  * 1.5);
        pw.cardsInHand   = Math.round(w.cardsInHand   * 1.3);
        break;
      case 'light':
        pw.unitsAdjacentToAlly = Math.round(w.unitsAdjacentToAlly * 1.5);
        pw.unitCountDiff       = Math.round(w.unitCountDiff       * 1.2);
        break;
      case 'dark':
        pw.cardsInHand  = Math.round(w.cardsInHand  * 1.4);
        pw.hiddenUnits  = Math.round(w.hiddenUnits  * 1.5);
        break;
    }
  }

  if (phase === 'late') {
    pw.championHPDiff           = Math.round(w.championHPDiff           * 2.0);
    pw.unitsThreateningChampion = Math.round(w.unitsThreateningChampion * 1.5);
    pw.championProximity        = Math.round(w.championProximity        * 1.5);
    pw.lethalThreat             = Math.round(w.lethalThreat             * 1.5);

    // Mystic late: shift from sustain to closing
    if (faction === 'mystic') {
      pw.healingValue             = Math.round(w.healingValue             * 0.3);
      pw.unitsThreateningChampion = 18;  // override: from 8 (mid) to 18 (late)
    }
  }

  return pw;
}

/**
 * Compute the game-length urgency penalty for a given faction.
 * Earlier start = more aggressive faction wants to close fast.
 *
 * @param {string} faction    - 'primal'|'mystic'|'light'|'dark'
 * @param {number} turnNumber - current turn
 * @returns {number}           negative penalty (0 if not yet reached start)
 */
function computeGameLengthPenalty(faction, turnNumber) {
  switch (faction) {
    case 'primal':
      // Aggressive: penalty starts at turn 8
      if (turnNumber <= 8)  return 0;
      if (turnNumber <= 18) return (turnNumber - 8) * -2;
      return -20 + (turnNumber - 18) * -5;

    case 'mystic':
      // Patient: no penalty until turn 20 (long game is fine)
      if (turnNumber <= 20) return 0;
      return (turnNumber - 20) * -5;

    default:
      // Light, Dark: default onset at turn 10
      if (turnNumber <= 10) return 0;
      if (turnNumber <= 20) return (turnNumber - 10) * -2;
      return -20 + (turnNumber - 20) * -5;
  }
}

/**
 * Resolve faction-specific weights for a given player, applying faction profile
 * and phase-based modifiers for the current turn.
 *
 * @param {string} faction    - 'primal'|'mystic'|'light'|'dark'
 * @param {number} turnNumber - current game turn
 * @returns {object}           weight profile to use in evaluateBoard
 */
function resolveFactionWeights(faction, turnNumber) {
  const base  = FACTION_WEIGHTS[faction] ?? WEIGHTS;
  const phase = getPhase(turnNumber);
  return applyPhaseModifiers(base, faction, phase);
}

/**
 * Evaluates the board position for a given player.
 *
 * When weights is null/undefined, the function auto-detects the player's
 * faction from gameState.champions[ap].attribute and applies the matching
 * FACTION_WEIGHTS profile (with dynamic adjustments for the current turn).
 *
 * @param {object}      gameState  - current game state
 * @param {string}      playerId   - 'p1' or 'p2'
 * @param {object|null} [weights]  - explicit weight overrides (null = auto-detect faction)
 * @returns {number}                score (higher is better for playerId)
 */
export function evaluateBoard(gameState, playerId, weights = null) {
  const ap = playerId === 'p1' ? 0 : 1;
  const op = 1 - ap;

  const myChamp  = gameState.champions[ap];
  const oppChamp = gameState.champions[op];
  const myUnits  = gameState.units.filter(u => u.owner === ap);
  const oppUnits = gameState.units.filter(u => u.owner === op);
  const myPlayer = gameState.players[ap];

  const turnNumber = gameState.turn ?? 0;

  // Resolve weights: auto-detect faction if not explicitly provided
  let w;
  let faction;
  if (weights != null) {
    w = weights;
    faction = myChamp?.attribute ?? 'light';
  } else {
    faction = myChamp?.attribute ?? 'light';
    w = resolveFactionWeights(faction, turnNumber);
  }

  // ── Individual factors ──────────────────────────────────────────────────────

  // championHP: evaluating player's champion HP
  const championHP = myChamp.hp;

  // healingValue: additional scoring for high own-champion HP (Mystic sustain reward)
  const healingValue = myChamp.hp;

  // championHPDiff: my champion HP minus opponent's champion HP.
  // Amplify when the opponent is close to death — creates urgency to close the game.
  const rawChampionHPDiff = myChamp.hp - oppChamp.hp;
  const hpDiffMultiplier  = oppChamp.hp <= 5 ? 3 : 1;
  const championHPDiff    = rawChampionHPDiff * hpDiffMultiplier;

  // unitCountDiff: my unit count minus opponent's unit count
  const unitCountDiff = myUnits.length - oppUnits.length;

  // totalATKOnBoard: sum of effective ATK of all my units
  const totalATKOnBoard = myUnits.reduce((sum, u) => sum + (u.atk ?? 0), 0);

  // totalHPOnBoard: sum of HP of all my units
  const totalHPOnBoard = myUnits.reduce((sum, u) => sum + (u.hp ?? 0), 0);

  // throneControl: +1 if I hold Throne, -1 if opponent holds it, 0 otherwise
  const myOnThrone = (
    (myChamp.row === THRONE_ROW && myChamp.col === THRONE_COL) ||
    myUnits.some(u => u.row === THRONE_ROW && u.col === THRONE_COL)
  );
  const oppOnThrone = (
    (oppChamp.row === THRONE_ROW && oppChamp.col === THRONE_COL) ||
    oppUnits.some(u => u.row === THRONE_ROW && u.col === THRONE_COL)
  );
  const throneControl = myOnThrone ? 1 : (oppOnThrone ? -1 : 0);

  // unitsThreateningChampion: my units within 2 Manhattan distance of opponent's champion
  const unitsThreateningChampion = myUnits.filter(u =>
    manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]) <= 2
  ).length;

  // unitsAdjacentToAlly: my units adjacent (cardinal, distance=1) to at least one other friendly unit
  const unitsAdjacentToAlly = myUnits.filter(u =>
    myUnits.some(ally =>
      ally !== u && manhattan([u.row, u.col], [ally.row, ally.col]) === 1
    )
  ).length;

  // cardsInHand: number of cards in my hand
  const cardsInHand = myPlayer.hand ? myPlayer.hand.length : 0;

  // hiddenUnits: count of my Hidden (unrevealed) units on board
  const hiddenUnits = myUnits.filter(u => u.hidden).length;

  // manaEfficiency: (totalMana - remainingMana) / max(totalMana, 1)
  const totalMana     = myPlayer.maxMana ?? myPlayer.mana ?? 0;
  const remainingMana = myPlayer.mana ?? 0;
  const manaEfficiency = (totalMana - remainingMana) / Math.max(totalMana, 1);

  // lethalThreat: sum of ATK of friendly units that can reach the enemy champion next turn.
  const lethalThreat = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return dist <= (u.spd ?? 1) ? sum + (u.atk ?? 0) : sum;
  }, 0);

  // gameLength: faction-aware escalating penalty (Primal starts early, Mystic starts late)
  const gameLength = computeGameLengthPenalty(faction, turnNumber);

  // opponentChampionLowHP: massive incentive to close out games when opponent is nearly dead.
  const opponentChampionLowHP = oppChamp.hp <= 3 ? 2 : (oppChamp.hp <= 5 ? 1 : 0);

  // championProximity: sum of (5 - Manhattan distance to enemy champion) for each friendly unit.
  const championProximity = myUnits.reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    return sum + Math.max(0, 5 - dist);
  }, 0);

  // relicsOnBoard: count of friendly relics alive on the board.
  const relicsOnBoard = myUnits.filter(u => u.isRelic).length;

  // omensOnBoard: count of friendly omens alive on the board.
  const omensOnBoard = myUnits.filter(u => u.isOmen).length;

  // terrainBenefit / terrainHarm
  let terrainBenefit = 0;
  let terrainHarm = 0;
  if (gameState.terrainGrid) {
    for (const u of myUnits) {
      const t = gameState.terrainGrid[u.row]?.[u.col];
      if (t?.whileOccupied?.hpBuff && t.whileOccupied.friendlyOnly) terrainBenefit += 1;
    }
    for (const u of oppUnits) {
      const t = gameState.terrainGrid[u.row]?.[u.col];
      if (t?.whileOccupied?.atkDebuff) terrainHarm += 1;
      if (t?.onOccupy?.damage) terrainHarm += 0.5;
    }
  }

  // ── Weighted sum ────────────────────────────────────────────────────────────

  const score =
    championHP               * w.championHP               +
    healingValue             * w.healingValue              +
    championHPDiff           * w.championHPDiff           +
    unitCountDiff            * w.unitCountDiff            +
    totalATKOnBoard          * w.totalATKOnBoard          +
    totalHPOnBoard           * w.totalHPOnBoard           +
    throneControl            * w.throneControl            +
    unitsThreateningChampion * w.unitsThreateningChampion +
    unitsAdjacentToAlly      * w.unitsAdjacentToAlly      +
    cardsInHand              * w.cardsInHand              +
    hiddenUnits              * w.hiddenUnits              +
    manaEfficiency           * w.manaEfficiency           +
    lethalThreat             * w.lethalThreat             +
    gameLength                                            +
    championProximity        * w.championProximity        +
    opponentChampionLowHP    * w.opponentChampionLowHP    +
    relicsOnBoard            * w.relicsOnBoard            +
    omensOnBoard             * w.omensOnBoard             +
    terrainBenefit           * w.terrainBenefit           +
    terrainHarm              * w.terrainHarm;

  return score;
}
