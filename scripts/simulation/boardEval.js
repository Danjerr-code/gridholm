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
import { getCardRating } from '../../src/engine/cardThreatRatings.js';

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
  turnAggressionScale:    0.08,  // per-turn aggression ramp after turn 12 (evolved per faction)
  projectedChampionDamage:  20,  // ATK of units that can reach enemy champion this turn
  allyCardValue:             3,  // sum of allyValue ratings for friendly combat units
  enemyThreatValue:          4,  // sum of threatValue ratings for enemy combat units (applied negatively)
  trappedAllyPenalty:        5,  // penalty per 10 allyValue points when a friendly unit is caged
  highValueUnitActivity:     3,  // penalty for idle high-value (allyValue >= 7) friendly units
  throneControlValue:       25,  // bonus for friendly champion on/near throne (raised 15→25; Mystic overrides to 30)
  tradeEfficiency:           5,  // bonus for favorable trades: kills defender while surviving
  tileDenial:                6,  // bonus per friendly unit adjacent to enemy champion (blocks summons)
  boardCentrality:           4,  // net centrality score: sum of (4 - manhattanDistToCenter) per friendly piece minus enemy
  projectedEnemyDamage:      4,  // penalty per unit of projected damage from enemy units over next 2 turns
};

/**
 * Faction-specific weight profiles.
 * All factions use base WEIGHTS. Only one targeted override remains:
 * Mystic gets throneControlValue: 20 (2× base) because throne control
 * is a confirmed decisive factor for Mystic matchup draw rate.
 * All other faction differentiation comes from applyPhaseModifiers and
 * computeGameLengthPenalty below.
 */
export const FACTION_WEIGHTS = {
  primal: { ...WEIGHTS },
  mystic: { ...WEIGHTS, throneControlValue: 30 },  // raised 20→30; throne control decisive for Mystic closing
  light:  { ...WEIGHTS },
  dark:   { ...WEIGHTS },
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
      // Urgency starts at turn 14 (lowered from 20) to push mid-game closing
      if (turnNumber <= 14) return 0;
      if (turnNumber <= 24) return (turnNumber - 14) * -2;
      return -20 + (turnNumber - 24) * -5;

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

  // projectedChampionDamage: sum of ATK of friendly combat units that can reach the enemy champion
  // this turn via a clear cardinal path (same row or column, no blocking units in between,
  // within Manhattan distance <= unit SPD).
  const projectedChampionDamage = myUnits.filter(u => !u.isRelic && !u.isOmen).reduce((sum, u) => {
    const dist = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    if (dist > (u.spd ?? 1)) return sum;
    if (u.row === oppChamp.row) {
      const minC = Math.min(u.col, oppChamp.col);
      const maxC = Math.max(u.col, oppChamp.col);
      const blocked = gameState.units.some(
        other => other !== u && other.row === u.row && other.col > minC && other.col < maxC
      );
      return blocked ? sum : sum + (u.atk ?? 0);
    }
    if (u.col === oppChamp.col) {
      const minR = Math.min(u.row, oppChamp.row);
      const maxR = Math.max(u.row, oppChamp.row);
      const blocked = gameState.units.some(
        other => other !== u && other.col === u.col && other.row > minR && other.row < maxR
      );
      return blocked ? sum : sum + (u.atk ?? 0);
    }
    return sum;
  }, 0);

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

  // allyCardValue: sum of allyValue ratings for my combat units on board.
  const myCombatUnits = myUnits.filter(u => !u.isRelic && !u.isOmen);
  const allyCardValue = myCombatUnits.reduce((sum, u) => {
    return sum + getCardRating(u.id, 'ally', u.cost ?? 4);
  }, 0);

  // enemyThreatValue: sum of threatValue ratings for enemy combat units (applied negatively).
  const oppCombatUnits = oppUnits.filter(u => !u.isRelic && !u.isOmen);
  const enemyThreatValue = -oppCombatUnits.reduce((sum, u) => {
    return sum + getCardRating(u.id, 'threat', u.cost ?? 4);
  }, 0);

  // trappedAllyPenalty: penalise when a high-value friendly unit is trapped in a Gilded Cage.
  // A cage relic is owned by the caster (opponent); the trapped unit belongs to us.
  let trappedAllyPenaltyValue = 0;
  for (const u of oppUnits) {
    if (u.id === 'gildedcage_relic' && u.trappedUnit && u.trappedUnit.owner === ap) {
      const rating = getCardRating(u.trappedUnit.id, 'ally', u.trappedUnit.cost ?? 4);
      trappedAllyPenaltyValue -= rating * (w.trappedAllyPenalty ?? 5) / 10;
    }
  }

  // highValueUnitActivity: penalise idle high-value friendly units far from any target.
  // A unit is "idle" if it has not moved and was not just summoned this turn.
  let highValueIdlePenalty = 0;
  for (const u of myCombatUnits) {
    const allyVal = getCardRating(u.id, 'ally', u.cost ?? 4);
    if (allyVal < 7) continue;
    if (u.moved || u.summoned) continue;
    const distToEnemy = manhattan([u.row, u.col], [oppChamp.row, oppChamp.col]);
    const nearEnemyUnit = oppUnits.some(eu =>
      manhattan([u.row, u.col], [eu.row, eu.col]) <= 2
    );
    if (distToEnemy > 2 && !nearEnemyUnit) {
      highValueIdlePenalty -= (allyVal - 6) * (w.highValueUnitActivity ?? 3) / 10;
    }
  }

  // tradeEfficiency: reward favorable trades available this turn.
  // For each friendly combat unit that can reach an enemy unit (dist <= spd):
  //   - If attacker.atk >= defender.hp (kills defender):
  //     - If attacker survives (defender.atk < attacker.hp): add threatRating(defender)
  //     - If attacker also dies (defender.atk >= attacker.hp): add threatRating(defender) - allyRating(attacker)
  // Scaled by the tradeEfficiency weight.
  let tradeEfficiencyValue = 0;
  for (const attacker of myCombatUnits) {
    for (const defender of oppCombatUnits) {
      const dist = manhattan([attacker.row, attacker.col], [defender.row, defender.col]);
      if (dist > (attacker.spd ?? 1)) continue;
      if ((attacker.atk ?? 0) >= (defender.hp ?? 1)) {
        // Attacker kills defender
        const defenderThreat = getCardRating(defender.id, 'threat', defender.cost ?? 4);
        if ((defender.atk ?? 0) < (attacker.hp ?? 1)) {
          // Attacker survives — pure win trade
          tradeEfficiencyValue += defenderThreat;
        } else {
          // Attacker also dies — even trade: net value
          const attackerAlly = getCardRating(attacker.id, 'ally', attacker.cost ?? 4);
          tradeEfficiencyValue += defenderThreat - attackerAlly;
        }
      }
    }
  }

  // championSurroundPressure: reward positions where friendly units adjacent to enemy champion
  // threaten a kill. Two components:
  //   1. Kill-threat: (sumATK - oppHP) × 15 if positive (lethal); × 8 if >half HP covered.
  //   2. Pin-bonus: (occupiedAdjTiles) × 4 when ≥2 friendly units adjacent (limits summoning).
  const BOARD_SIZE = 5;
  const adjDirs = [[-1,0],[1,0],[0,-1],[0,1]];

  // tileDenial: score positional choking of enemy champion by counting friendly units
  // adjacent to the enemy champion. Each such unit blocks a potential summon tile.
  // Only friendly units count — enemy units adjacent to their own champion do not deny.
  // Independent from championSurroundPressure (which scores ATK kill-threat).
  const adjToOppChampForDenial = adjDirs
    .map(([dr, dc]) => [oppChamp.row + dr, oppChamp.col + dc])
    .filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);

  const tileDenialCount = adjToOppChampForDenial.filter(([r, c]) =>
    myUnits.some(u => u.row === r && u.col === c)
  ).length;
  const adjToOppChamp = adjDirs
    .map(([dr, dc]) => [oppChamp.row + dr, oppChamp.col + dc])
    .filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);

  const adjFriendlyUnits = myUnits.filter(u =>
    adjToOppChamp.some(([r, c]) => u.row === r && u.col === c)
  );
  const adjATKSum = adjFriendlyUnits.reduce((s, u) => s + (u.atk ?? 0), 0);
  const netKillPressure = adjATKSum - oppChamp.hp;

  let killThreatScore = 0;
  if (netKillPressure > 0) {
    killThreatScore = netKillPressure * 15;
  } else if (adjATKSum > oppChamp.hp / 2) {
    killThreatScore = adjATKSum * 8;
  }

  let pinBonus = 0;
  if (adjFriendlyUnits.length >= 2) {
    const emptyAdjTiles = adjToOppChamp.filter(([r, c]) =>
      !gameState.units.some(u => u.row === r && u.col === c) &&
      !(gameState.champions[0].row === r && gameState.champions[0].col === c) &&
      !(gameState.champions[1].row === r && gameState.champions[1].col === c)
    ).length;
    pinBonus = (adjToOppChamp.length - emptyAdjTiles) * 4;
  }

  const championSurroundPressure = killThreatScore + pinBonus;

  // throneControlValue: throne positioning bonus.
  // Components:
  //   1. Champion on throne              → +1.0 factor
  //   2. Friendly unit on throne         → +0.75 factor (increased from 0.5; preparation and denial value)
  //   3. Denial bonus: unit on throne + enemy champion within 2 tiles → +1.0 extra (blocking approach)
  //   4. Preparation bonus: unit on throne + own champion adjacent → +0.5 extra (champion takeover setup)
  //   5. Champion adjacent to empty throne → +0.4 factor
  //   6. Champion-toward-center gradient   → +(4 - distToCenter) * 0.3 when no friendly piece on throne
  const myChampOnThrone = myChamp.row === THRONE_ROW && myChamp.col === THRONE_COL;
  const myUnitOnThrone  = myUnits.some(u => u.row === THRONE_ROW && u.col === THRONE_COL);
  const myPieceOnThrone = myChampOnThrone || myUnitOnThrone;

  let throneControlValue = 0;

  if (myChampOnThrone) {
    throneControlValue += 1.0;
  }

  if (myUnitOnThrone) {
    throneControlValue += 0.75;  // raised from 0.5

    // Denial bonus: enemy champion within 2 tiles of throne — friendly unit blocks their advance
    const oppChampDistToThrone = manhattan([oppChamp.row, oppChamp.col], [THRONE_ROW, THRONE_COL]);
    if (oppChampDistToThrone <= 2) {
      throneControlValue += 1.0;
    }

    // Preparation bonus: own champion adjacent to throne — unit holds it while champion steps in next turn
    const myChampAdjacentToThrone = adjDirs.some(
      ([dr, dc]) => myChamp.row + dr === THRONE_ROW && myChamp.col + dc === THRONE_COL
    );
    if (myChampAdjacentToThrone) {
      throneControlValue += 0.5;
    }
  }

  if (!myChampOnThrone) {
    const throneOccupied = gameState.units.some(u => u.row === THRONE_ROW && u.col === THRONE_COL) ||
      (gameState.champions[0].row === THRONE_ROW && gameState.champions[0].col === THRONE_COL) ||
      (gameState.champions[1].row === THRONE_ROW && gameState.champions[1].col === THRONE_COL);
    const champAdjacentToThrone = adjDirs.some(
      ([dr, dc]) => myChamp.row + dr === THRONE_ROW && myChamp.col + dc === THRONE_COL
    );
    if (champAdjacentToThrone && !throneOccupied) {
      throneControlValue += 0.4;
    }

    // Champion-toward-center gradient: pull champion toward throne when it is unclaimed.
    if (!myPieceOnThrone) {
      const champDistToCenter = manhattan([myChamp.row, myChamp.col], [THRONE_ROW, THRONE_COL]);
      throneControlValue += (4 - champDistToCenter) * 0.3;
    }
  }

  // projectedEnemyDamage: total damage enemy units can deal to us over the next 2 turns.
  // For each enemy combat unit:
  //   - Adjacent to our champion (dist=1): atk*2 (can attack twice)
  //   - Within SPD of our champion:        atk*1 (move+attack once)
  //   - Adjacent to a friendly unit:       atk*1 (can trade once)
  //   - Otherwise (positional threat):     atk*0.5
  // Applied as a penalty (negative contribution).
  let projectedEnemyDamageTotal = 0;
  for (const eu of oppCombatUnits) {
    const atkVal = eu.atk ?? 0;
    if (atkVal <= 0) continue;
    const distToMyChamp = manhattan([eu.row, eu.col], [myChamp.row, myChamp.col]);
    if (distToMyChamp <= 1) {
      projectedEnemyDamageTotal += atkVal * 2;
    } else if (distToMyChamp <= (eu.spd ?? 1)) {
      projectedEnemyDamageTotal += atkVal * 1;
    } else if (myUnits.some(ally => manhattan([eu.row, eu.col], [ally.row, ally.col]) <= 1)) {
      projectedEnemyDamageTotal += atkVal * 1;
    } else {
      projectedEnemyDamageTotal += atkVal * 0.5;
    }
  }

  // boardCentrality: net Manhattan-from-center score across all pieces.
  // Each piece scores (4 - distToCenter): center=4, adj=3, dist2=2, dist3=1, corner=0.
  // Subtract the same calculation for all enemy pieces.
  const boardCentrality =
    (myUnits.reduce((sum, u) =>
      sum + Math.max(0, 4 - manhattan([u.row, u.col], [THRONE_ROW, THRONE_COL])), 0) +
     Math.max(0, 4 - manhattan([myChamp.row, myChamp.col], [THRONE_ROW, THRONE_COL]))) -
    (oppUnits.reduce((sum, u) =>
      sum + Math.max(0, 4 - manhattan([u.row, u.col], [THRONE_ROW, THRONE_COL])), 0) +
     Math.max(0, 4 - manhattan([oppChamp.row, oppChamp.col], [THRONE_ROW, THRONE_COL])));

  // ── Weighted sum ────────────────────────────────────────────────────────────

  // Turn-scaling aggression multiplier: ramps up after turn 12 to push closing behavior.
  // At turn 12: 1.0×. At turn 20: 1.64×. At turn 30: 2.44×. Evolved per faction.
  const aggressionScale = w.turnAggressionScale ?? 0.08;
  const aggressionMult  = 1 + Math.max(0, turnNumber - 12) * aggressionScale;

  const score =
    championHP               * w.championHP               +
    healingValue             * w.healingValue              +
    championHPDiff           * w.championHPDiff           +
    unitCountDiff            * w.unitCountDiff            +
    totalATKOnBoard          * w.totalATKOnBoard          +
    totalHPOnBoard           * w.totalHPOnBoard           +
    throneControl            * w.throneControl            +
    unitsThreateningChampion * w.unitsThreateningChampion * aggressionMult +
    unitsAdjacentToAlly      * w.unitsAdjacentToAlly      +
    cardsInHand              * w.cardsInHand              +
    hiddenUnits              * w.hiddenUnits              +
    manaEfficiency           * w.manaEfficiency           +
    lethalThreat             * w.lethalThreat             * aggressionMult +
    gameLength                                            +
    championProximity        * w.championProximity        * aggressionMult +
    opponentChampionLowHP    * w.opponentChampionLowHP    * aggressionMult +
    projectedChampionDamage  * (w.projectedChampionDamage ?? 20) +
    relicsOnBoard            * w.relicsOnBoard            +
    omensOnBoard             * w.omensOnBoard             +
    terrainBenefit           * w.terrainBenefit           +
    terrainHarm              * w.terrainHarm              +
    allyCardValue            * (w.allyCardValue ?? 3)     +
    enemyThreatValue         * (w.enemyThreatValue ?? 4)  +
    trappedAllyPenaltyValue                               +
    highValueIdlePenalty                                  +
    championSurroundPressure                              +
    throneControlValue        * (w.throneControlValue ?? 25) +
    tradeEfficiencyValue      * (w.tradeEfficiency ?? 5)  +
    tileDenialCount           * (w.tileDenial ?? 6)       +
    boardCentrality           * (w.boardCentrality ?? 4)  +
    -projectedEnemyDamageTotal * (w.projectedEnemyDamage ?? 4);

  return score;
}
