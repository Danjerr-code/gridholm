/**
 * runSimulation.js
 *
 * Runs automated games between two AI agents and logs results.
 *
 * Usage:
 *   node runSimulation.js --p1 human --p2 beast --games 1000 --output results.json
 *
 * Options:
 *   --p1      Deck ID for player 1 (human|beast|elf|demon, default: human)
 *   --p2      Deck ID for player 2 (human|beast|elf|demon, default: beast)
 *   --games   Number of games to simulate (default: 100)
 *   --output  Output file path (default: results.json)
 *   --ai      AI mode: heuristic | minimax | mcts (default: minimax)
 *   --depth   Minimax depth (default: 4, only used when --ai minimax)
 *   --sims    MCTS simulations upper bound (default: 10000, only used when --ai mcts)
 *   --timeout MCTS per-decision time cap in ms (default: 100, only used when --ai mcts)
 */

import { writeFileSync } from 'fs';
import { createGame, applyAction, isGameOver, getGameStats, getLegalActions } from './headlessEngine.js';
import { chooseAction } from './simAI.js';
import { chooseActionMinimax } from './minimaxAI.js';
import { chooseActionMCTS } from './mctsAI.js';

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { p1: 'human', p2: 'beast', games: 100, output: 'results.json', ai: 'minimax', depth: 2, sims: 10000, timeout: 100 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--p1':      args.p1      = argv[++i]; break;
      case '--p2':      args.p2      = argv[++i]; break;
      case '--games':   args.games   = parseInt(argv[++i], 10); break;
      case '--output':  args.output  = argv[++i]; break;
      case '--ai':      args.ai      = argv[++i]; break;
      case '--depth':   args.depth   = parseInt(argv[++i], 10); break;
      case '--sims':    args.sims    = parseInt(argv[++i], 10); break;
      case '--timeout': args.timeout = parseInt(argv[++i], 10); break;
    }
  }
  return args;
}

// ── Card tracker helpers ──────────────────────────────────────────────────────

/**
 * Initialize per-player, per-card stat accumulator for one game.
 */
function initGameTracker() {
  return {
    // cardId → stats, separate for p1 and p2
    p1: new Map(),
    p2: new Map(),
    // cardUid → { cardId, playerIdx, turnDrawn } — tracks cards currently in hand
    inHand: new Map(),
    // unitUid → { cardId, playerIdx } — tracks summoned units on the board
    units: new Map(),
  };
}

function playerKey(playerIdx) {
  return playerIdx === 0 ? 'p1' : 'p2';
}

function getOrInitCardStats(tracker, playerIdx, cardId) {
  const map = playerIdx === 0 ? tracker.p1 : tracker.p2;
  if (!map.has(cardId)) {
    map.set(cardId, {
      timesDrawn: 0,
      timesPlayed: 0,
      turnsInHand: 0,
      damageDealt: 0,
      damageAbsorbed: 0,
      killCount: 0,
      survivedUntilEnd: false,
    });
  }
  return map.get(cardId);
}

/**
 * Diff both players' hands before/after an action to detect draws and plays.
 * Plays are tracked separately (via action type); this function only detects draws.
 * Cards that leave hand without being played (discards, spell costs) are noted
 * but we only record turnsInHand for explicitly played cards.
 */
function diffHandsForDraws(beforeState, afterState, turnCount, tracker) {
  for (let pIdx = 0; pIdx < 2; pIdx++) {
    const beforeUids = new Set(beforeState.players[pIdx].hand.map(c => c.uid));
    const afterHand  = afterState.players[pIdx].hand;
    for (const card of afterHand) {
      if (!beforeUids.has(card.uid)) {
        // New card entered hand → drawn
        const stats = getOrInitCardStats(tracker, pIdx, card.id);
        stats.timesDrawn++;
        tracker.inHand.set(card.uid, { cardId: card.id, playerIdx: pIdx, turnDrawn: turnCount });
      }
    }
  }
}

/**
 * Record a played card: increment timesPlayed and accumulate turnsInHand.
 */
function recordCardPlayed(tracker, cardUid, turnCount) {
  const entry = tracker.inHand.get(cardUid);
  if (!entry) return; // card wasn't tracked (dealt in initial hand — tracked below)
  const stats = getOrInitCardStats(tracker, entry.playerIdx, entry.cardId);
  stats.timesPlayed++;
  stats.turnsInHand += turnCount - entry.turnDrawn;
  tracker.inHand.delete(cardUid);
}

/**
 * After a summon action resolves, find the newly placed unit and register it
 * in the unit tracker so combat can be attributed to its card.
 */
function registerSummonedUnit(beforeState, afterState, action, tracker) {
  if (action.type !== 'summon') return;
  const ap = beforeState.activePlayer;
  const card = beforeState.players[ap].hand.find(c => c.uid === action.cardUid);
  if (!card) return;
  // Find new unit on board that wasn't there before
  const beforeUids = new Set(beforeState.units.map(u => u.uid));
  for (const unit of afterState.units) {
    if (!beforeUids.has(unit.uid) && unit.owner === ap && unit.id === card.id) {
      tracker.units.set(unit.uid, { cardId: card.id, playerIdx: ap });
      break;
    }
  }
}

/**
 * Diff unit states before/after a move action to track combat damage.
 */
function trackCombatDamage(beforeState, afterState, action, tracker) {
  if (action.type !== 'move') return;

  const ap = beforeState.activePlayer;
  const enemyIdx = 1 - ap;
  const [tr, tc] = action.targetTile;

  const movingUnit = beforeState.units.find(u => u.uid === action.unitId);
  if (!movingUnit) return;

  const movingEntry  = tracker.units.get(action.unitId);

  // Check what was at the target tile
  const targetUnit  = beforeState.units.find(u => u.owner === enemyIdx && u.row === tr && u.col === tc);
  const enemyChamp  = beforeState.champions[enemyIdx];
  const hitsChamp   = enemyChamp.row === tr && enemyChamp.col === tc;

  if (!targetUnit && !hitsChamp) return; // no combat

  const movingAfter = afterState.units.find(u => u.uid === action.unitId);
  const movingHpLost = movingAfter ? movingUnit.hp - movingAfter.hp : movingUnit.hp;

  if (targetUnit) {
    const targetEntry = tracker.units.get(targetUnit.uid);
    const targetAfter = afterState.units.find(u => u.uid === targetUnit.uid);
    const targetHpLost = targetAfter ? targetUnit.hp - targetAfter.hp : targetUnit.hp;
    const targetKilled = !targetAfter;

    if (movingEntry) {
      const s = getOrInitCardStats(tracker, movingEntry.playerIdx, movingEntry.cardId);
      s.damageDealt   += Math.max(0, targetHpLost);
      s.damageAbsorbed += Math.max(0, movingHpLost);
      if (targetKilled) s.killCount++;
    }
    if (targetEntry) {
      const s = getOrInitCardStats(tracker, targetEntry.playerIdx, targetEntry.cardId);
      s.damageAbsorbed += Math.max(0, targetHpLost);
      s.damageDealt    += Math.max(0, movingHpLost);
      if (!movingAfter) s.killCount++; // moving unit killed by defender
    }
  } else if (hitsChamp) {
    // Champion doesn't have a card entry; only track the attacker's damage dealt
    const champAfter = afterState.champions[enemyIdx];
    const champHpLost = enemyChamp.hp - champAfter.hp;
    if (movingEntry) {
      const s = getOrInitCardStats(tracker, movingEntry.playerIdx, movingEntry.cardId);
      s.damageDealt    += Math.max(0, champHpLost);
      s.damageAbsorbed += Math.max(0, movingHpLost);
    }
  }
}

/**
 * After the game ends, mark survivedUntilEnd for units still on the board.
 */
function markSurvivors(finalState, tracker) {
  const aliveUids = new Set(finalState.units.map(u => u.uid));
  for (const [uid, entry] of tracker.units) {
    if (aliveUids.has(uid)) {
      getOrInitCardStats(tracker, entry.playerIdx, entry.cardId).survivedUntilEnd = true;
    }
  }
}

/**
 * Serialize tracker maps into a plain-object cardStats ready for JSON output.
 * Format: { p1: { cardId: {...} }, p2: { cardId: {...} } }
 */
function serializeCardStats(tracker) {
  const out = { p1: {}, p2: {} };
  for (const [cardId, stats] of tracker.p1) out.p1[cardId] = { ...stats };
  for (const [cardId, stats] of tracker.p2) out.p2[cardId] = { ...stats };
  return out;
}

// ── Single game runner ────────────────────────────────────────────────────────

const MAX_TURNS         = 30;
const MAX_ACTIONS_GAME  = 500;

// Max actions within a single player's turn before forcing endTurn (prevents MCTS stalls).
const MAX_ACTIONS_PER_TURN = 80;

export function runGame(gameId, p1Deck, p2Deck, opts = {}) {
  const useMinimaxAI = opts.ai === 'minimax';
  const useMCTS         = opts.ai === 'mcts';
  const minimaxDepth    = opts.depth ?? 2;
  const mctsSimulations = opts.sims ?? 10000;
  const mctsTimeoutMs   = opts.timeout ?? 100;

  let state = createGame(p1Deck, p2Deck);
  const tracker = initGameTracker();

  // Seed initial hands as if they were drawn on turn 0
  for (let pIdx = 0; pIdx < 2; pIdx++) {
    for (const card of state.players[pIdx].hand) {
      const stats = getOrInitCardStats(tracker, pIdx, card.id);
      stats.timesDrawn++;
      tracker.inHand.set(card.uid, { cardId: card.id, playerIdx: pIdx, turnDrawn: 0 });
    }
  }

  let turnCount             = 0;
  let actionCount           = 0;
  let commandsUsedThisTurn  = 0;
  let actionsThisTurn       = 0;
  let forceDraw             = false;
  let minimaxTotalMs        = 0;
  let mctsTotalMs           = 0;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) {
      console.warn(`[WARNING] Game ${gameId} hit ${MAX_ACTIONS_GAME}-action limit — forcing draw.`);
      forceDraw = true;
      break;
    }

    let action;
    if (useMCTS && actionsThisTurn >= MAX_ACTIONS_PER_TURN) {
      // Force end-of-turn to prevent MCTS stalls (low sim budget avoids endTurn).
      action = { type: 'endTurn' };
    } else if (useMinimaxAI) {
      const t0 = performance.now();
      action = chooseActionMinimax(state, commandsUsedThisTurn, { depth: minimaxDepth });
      minimaxTotalMs += performance.now() - t0;
    } else if (useMCTS) {
      const t0 = performance.now();
      action = chooseActionMCTS(state, { simulations: mctsSimulations, timeoutMs: mctsTimeoutMs });
      mctsTotalMs += performance.now() - t0;
    } else {
      action = chooseAction(state, commandsUsedThisTurn);
    }

    // Track played cards before applying (recordCardPlayed handles timesPlayed + turnsInHand)
    if (action.type === 'summon' || action.type === 'cast') {
      recordCardPlayed(tracker, action.cardUid, turnCount);
    }

    const beforeState = state;
    state = applyAction(state, action);
    actionCount++;

    // Post-action bookkeeping
    diffHandsForDraws(beforeState, state, turnCount, tracker);
    if (action.type === 'summon') registerSummonedUnit(beforeState, state, action, tracker);
    if (action.type === 'move')   trackCombatDamage(beforeState, state, action, tracker);

    if (action.type === 'endTurn') {
      turnCount++;
      commandsUsedThisTurn = 0;
      actionsThisTurn = 0;
    } else {
      // Count all non-endTurn actions toward per-turn cap (move, championMove, summon, etc.)
      if (action.type === 'move') commandsUsedThisTurn++;
      actionsThisTurn++;
    }
  }

  markSurvivors(state, tracker);

  const finalChamps = state.champions;
  const p1FinalHP   = finalChamps[0]?.hp ?? 0;
  const p2FinalHP   = finalChamps[1]?.hp ?? 0;

  let winner = null;
  if (!forceDraw) {
    const result = isGameOver(state);
    winner = result.over ? result.winner : null;
  }

  return {
    gameId,
    p1Deck,
    p2Deck,
    winner,
    turns: turnCount,
    p1FinalHP,
    p2FinalHP,
    cardsPlayed: {
      p1: [...(tracker.p1)].filter(([, s]) => s.timesPlayed > 0).map(([id]) => id),
      p2: [...(tracker.p2)].filter(([, s]) => s.timesPlayed > 0).map(([id]) => id),
    },
    cardStats: serializeCardStats(tracker),
    ...(useMinimaxAI ? { minimaxMs: minimaxTotalMs } : {}),
    ...(useMCTS      ? { mctsMs: mctsTotalMs }       : {}),
  };
}

// ── Aggregate card analysis ───────────────────────────────────────────────────

/**
 * Compute per-card aggregate statistics across all game results.
 *
 * For each cardId, tracks stats from the perspective of the player who had
 * the card in their deck (p1 side or p2 side in each game).
 *
 * @param {Array}    results            - array of game result objects
 * @param {Function} [playerSideSelector] - optional fn(result) → 'p1'|'p2'.
 *   When provided, only the specified player side is analysed for each game.
 *   Use this for faction-specific analysis to avoid cross-faction contamination
 *   (e.g. opponent cards showing up in a faction's top-card rankings).
 *   When omitted, both sides are analysed (legacy behaviour / single-matchup use).
 */
export function computeCardAnalysis(results, playerSideSelector = null) {
  // Accumulate per-card across all games and both player sides
  const agg = new Map(); // cardId → aggregated counts

  function getAgg(cardId) {
    if (!agg.has(cardId)) {
      agg.set(cardId, {
        totalDrawn: 0, totalPlayed: 0, totalTurnsInHand: 0,
        totalDamageDealt: 0, totalKills: 0,
        // For win-rate calculations
        gamesPlayed: 0,      winsWhenPlayed: 0,
        gamesNotDrawn: 0,    winsWhenNotDrawn: 0,
      });
    }
    return agg.get(cardId);
  }

  /** Return the [[pKey, statsMap], ...] pairs to process for a given result. */
  function sidesForResult(result) {
    if (playerSideSelector) {
      const side = playerSideSelector(result);
      return side ? [[side, result.cardStats[side]]] : [];
    }
    return [['p1', result.cardStats.p1], ['p2', result.cardStats.p2]];
  }

  for (const result of results) {
    const { winner } = result;

    for (const [pKey, statsMap] of sidesForResult(result)) {
      const playerWon = winner === pKey;

      for (const [cardId, stats] of Object.entries(statsMap)) {
        const a = getAgg(cardId);
        a.totalDrawn      += stats.timesDrawn;
        a.totalPlayed     += stats.timesPlayed;
        a.totalTurnsInHand += stats.turnsInHand;
        a.totalDamageDealt += stats.damageDealt;
        a.totalKills      += stats.killCount;

        if (stats.timesPlayed > 0) {
          a.gamesPlayed++;
          if (playerWon) a.winsWhenPlayed++;
        }
      }
    }
  }

  // Second pass: for each cardId, find games where it was never drawn by the
  // relevant player side and track the win rate in those games.
  // First, collect which (cardId, pKey) pairs have ever been observed.
  const cardPlayerSides = new Map(); // cardId → Set of 'p1' | 'p2'
  for (const result of results) {
    for (const [pKey, statsMap] of sidesForResult(result)) {
      for (const cardId of Object.keys(statsMap)) {
        if (!cardPlayerSides.has(cardId)) cardPlayerSides.set(cardId, new Set());
        cardPlayerSides.get(cardId).add(pKey);
      }
    }
  }

  for (const result of results) {
    const { winner } = result;
    // Which sides are relevant for this result?
    const relevantSides = new Set(sidesForResult(result).map(([pKey]) => pKey));

    for (const [cardId, sides] of cardPlayerSides) {
      const a = getAgg(cardId);
      for (const pKey of sides) {
        // Only check sides that are relevant for this result
        if (!relevantSides.has(pKey)) continue;
        const statsMap = result.cardStats[pKey];
        if (!statsMap[cardId]) {
          // Card never drawn by this player in this game
          a.gamesNotDrawn++;
          if (winner === pKey) a.winsWhenNotDrawn++;
        }
      }
    }
  }

  // Build final analysis object
  const analysis = {};
  for (const [cardId, a] of agg) {
    const playRate        = a.totalDrawn > 0 ? a.totalPlayed / a.totalDrawn : 0;
    const avgTurnsInHand  = a.totalPlayed > 0 ? a.totalTurnsInHand / a.totalPlayed : 0;
    const avgDamageDealt  = a.gamesPlayed > 0 ? a.totalDamageDealt / a.gamesPlayed : 0;
    const avgKills        = a.gamesPlayed > 0 ? a.totalKills / a.gamesPlayed : 0;
    const winRateWhenPlayed   = a.gamesPlayed > 0 ? a.winsWhenPlayed / a.gamesPlayed : null;
    const winRateWhenNotDrawn = a.gamesNotDrawn > 0 ? a.winsWhenNotDrawn / a.gamesNotDrawn : null;
    const winRateImpact = (winRateWhenPlayed != null && winRateWhenNotDrawn != null)
      ? winRateWhenPlayed - winRateWhenNotDrawn
      : null;

    analysis[cardId] = {
      playRate: +playRate.toFixed(4),
      avgTurnsInHand: +avgTurnsInHand.toFixed(2),
      avgDamageDealt: +avgDamageDealt.toFixed(2),
      avgKills: +avgKills.toFixed(3),
      winRateWhenPlayed:   winRateWhenPlayed   != null ? +winRateWhenPlayed.toFixed(4)   : null,
      winRateWhenNotDrawn: winRateWhenNotDrawn != null ? +winRateWhenNotDrawn.toFixed(4) : null,
      winRateImpact:       winRateImpact       != null ? +winRateImpact.toFixed(4)       : null,
    };
  }
  return analysis;
}

// ── Main (only runs when invoked directly) ────────────────────────────────────

import { fileURLToPath } from 'url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {

const args = parseArgs(process.argv);
const { p1: p1Deck, p2: p2Deck, games: totalGames, output, ai: aiMode, depth: minimaxDepth, sims: mctsSims, timeout: mctsTimeout } = args;
const gameOpts = { ai: aiMode, depth: minimaxDepth, sims: mctsSims, timeout: mctsTimeout };

console.log(`Running ${totalGames} game(s): ${p1Deck} vs ${p2Deck} [ai=${aiMode}${aiMode === 'minimax' ? ` depth=${minimaxDepth}` : ''}${aiMode === 'mcts' ? ` timeout=${mctsTimeout}ms` : ''}]`);

const results = [];
let p1Wins = 0, p2Wins = 0, draws = 0, totalTurns = 0;
let winnerHPSum = 0, winnerHPCount = 0;
let totalMinimaxMs = 0;

for (let i = 0; i < totalGames; i++) {
  const result = runGame(i + 1, p1Deck, p2Deck, gameOpts);
  results.push(result);
  if (result.minimaxMs != null) totalMinimaxMs += result.minimaxMs;

  if      (result.winner === 'p1') { p1Wins++; winnerHPSum += result.p1FinalHP; winnerHPCount++; }
  else if (result.winner === 'p2') { p2Wins++; winnerHPSum += result.p2FinalHP; winnerHPCount++; }
  else draws++;

  totalTurns += result.turns;

  if ((i + 1) % 100 === 0 || i + 1 === totalGames) {
    process.stdout.write(`  Progress: ${i + 1}/${totalGames}\r`);
  }
}

console.log('');

const cardAnalysis = computeCardAnalysis(results);

writeFileSync(output, JSON.stringify({ results, cardAnalysis }, null, 2));
console.log(`Results written to ${output}`);

const avgTurns    = totalGames > 0 ? (totalTurns / totalGames).toFixed(2) : 0;
const avgWinnerHP = winnerHPCount > 0 ? (winnerHPSum / winnerHPCount).toFixed(2) : 'N/A';

console.log('\n── Simulation Summary ──────────────────────');
console.log(`  Total games  : ${totalGames}`);
console.log(`  P1 wins      : ${p1Wins} (${((p1Wins / totalGames) * 100).toFixed(1)}%)`);
console.log(`  P2 wins      : ${p2Wins} (${((p2Wins / totalGames) * 100).toFixed(1)}%)`);
console.log(`  Draws        : ${draws} (${((draws / totalGames) * 100).toFixed(1)}%)`);
console.log(`  Avg turns    : ${avgTurns}`);
console.log(`  Avg winner HP: ${avgWinnerHP}`);
if (aiMode === 'minimax') {
  const avgDecisionMs = totalGames > 0 ? totalMinimaxMs / totalGames : 0;
  console.log(`  Avg AI time/game: ${avgDecisionMs.toFixed(0)}ms`);
  if (avgDecisionMs > 1000) {
    console.log('  [WARNING] Average decision time exceeds 1s — consider reducing --depth or --games.');
  }
}
console.log('────────────────────────────────────────────');

// Top/bottom 10 by winRateImpact
const ranked = Object.entries(cardAnalysis)
  .filter(([, a]) => a.winRateImpact != null)
  .sort((a, b) => b[1].winRateImpact - a[1].winRateImpact);

if (ranked.length > 0) {
  console.log('\n── Top 10 Cards by Win Rate Impact ─────────');
  for (const [cardId, a] of ranked.slice(0, 10)) {
    console.log(`  ${cardId.padEnd(20)} impact: ${(a.winRateImpact * 100).toFixed(1).padStart(6)}%  (played: ${(a.winRateWhenPlayed * 100).toFixed(1)}%  not-drawn: ${(a.winRateWhenNotDrawn * 100).toFixed(1)}%)`);
  }
  console.log('\n── Bottom 10 Cards by Win Rate Impact ──────');
  for (const [cardId, a] of ranked.slice(-10).reverse()) {
    console.log(`  ${cardId.padEnd(20)} impact: ${(a.winRateImpact * 100).toFixed(1).padStart(6)}%  (played: ${(a.winRateWhenPlayed * 100).toFixed(1)}%  not-drawn: ${(a.winRateWhenNotDrawn * 100).toFixed(1)}%)`);
  }
  console.log('────────────────────────────────────────────');
}

} // end isMain
