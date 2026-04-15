/**
 * runTier1Validation.js
 *
 * Validates Tier 1 search improvements (quiescence, history, PVS).
 *
 * Runs two matchup sets:
 *   Set A: 10 games Human vs Beast
 *   Set B: 10 games Elf vs Demon
 *
 * Reports per-set:
 *   - Win/Draw counts and DR
 *   - Average turns per game
 *   - Average AI decision time (ms)
 *   - Average depth reached per decision
 *   - Average TT hit rate
 *   - Average quiescence nodes searched per decision
 *
 * Gate checks:
 *   - Decision time must be < 3× baseline (baseline avg ~280ms from TT validation)
 *   - qNodes/decision reported (informational; no hard gate)
 *
 * Usage:
 *   node runTier1Validation.js
 */

import { performance } from 'perf_hooks';
import { createGame, applyAction, isGameOver, getLegalActions } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';

const MAX_TURNS           = 30;
const MAX_ACTIONS_GAME    = 500;
const MAX_ACTIONS_PER_TURN = 80;
const TIME_BUDGET_MS      = 800;

function runGame(p1Deck, p2Deck) {
  let state = createGame(p1Deck, p2Deck);

  const stats = {
    ttLookups: 0, ttHits: 0, depthSum: 0, ttSizeSum: 0,
    qNodesSum: 0, decisions: 0,
  };

  let turnCount       = 0;
  let actionCount     = 0;
  let commandsUsed    = 0;
  let actionsThisTurn = 0;
  let totalDecisionMs = 0;
  let forceDraw       = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) { forceDraw = true; break; }

    let action;
    if (actionsThisTurn >= MAX_ACTIONS_PER_TURN) {
      action = { type: 'endTurn' };
    } else {
      const t0 = performance.now();
      action = chooseActionMinimax(state, commandsUsed, {
        timeBudget: TIME_BUDGET_MS,
        stats,
      });
      totalDecisionMs += performance.now() - t0;
    }

    state = applyAction(state, action);
    actionCount++;

    if (action.type === 'endTurn') {
      turnCount++;
      commandsUsed    = 0;
      actionsThisTurn = 0;
    } else {
      if (action.type === 'move') commandsUsed++;
      actionsThisTurn++;
    }
  }

  const { over, winner } = isGameOver(state);
  return {
    winner: (!forceDraw && over) ? winner : 'draw',
    turns:  turnCount,
    stats,
    avgDecisionMs: stats.decisions > 0 ? totalDecisionMs / stats.decisions : 0,
  };
}

function runSet(label, p1Deck, p2Deck, n) {
  console.log(`\n--- ${label} (${n} games, timeBudget=${TIME_BUDGET_MS}ms) ---`);
  console.log('G  | Winner | Turns | AvgDepth | TT%  | qNodes/d | AvgMs');
  console.log('-'.repeat(65));

  let p1Wins = 0, p2Wins = 0, draws = 0;
  let totalTurns = 0;
  let totalDepthSum = 0, totalDecisions = 0;
  let totalTtHits = 0, totalTtLookups = 0;
  let totalQNodes = 0;
  let totalMs = 0;

  for (let g = 0; g < n; g++) {
    const result = runGame(p1Deck, p2Deck);
    const s = result.stats;

    const avgDepth = s.decisions > 0 ? (s.depthSum / s.decisions).toFixed(1) : '?';
    const ttPct    = s.ttLookups > 0 ? ((s.ttHits / s.ttLookups) * 100).toFixed(0) + '%' : '?';
    const qPerD    = s.decisions > 0 ? Math.round(s.qNodesSum / s.decisions) : 0;

    console.log(
      `${String(g + 1).padStart(2)} | ` +
      `${(result.winner ?? 'draw').padEnd(6)} | ` +
      `${String(result.turns).padStart(5)} | ` +
      `${String(avgDepth).padStart(8)} | ` +
      `${String(ttPct).padStart(4)} | ` +
      `${String(qPerD).padStart(8)} | ` +
      `${result.avgDecisionMs.toFixed(0)}ms`
    );

    if (result.winner === 'p1') p1Wins++;
    else if (result.winner === 'p2') p2Wins++;
    else draws++;

    totalTurns     += result.turns;
    totalDepthSum  += s.depthSum;
    totalDecisions += s.decisions;
    totalTtHits    += s.ttHits;
    totalTtLookups += s.ttLookups;
    totalQNodes    += s.qNodesSum;
    totalMs        += result.avgDecisionMs * s.decisions; // total ms across all decisions
  }

  const dr          = ((draws / n) * 100).toFixed(1);
  const avgTurns    = (totalTurns / n).toFixed(1);
  const avgDepthAll = totalDecisions > 0 ? (totalDepthSum / totalDecisions).toFixed(2) : '?';
  const ttHitAll    = totalTtLookups > 0 ? ((totalTtHits / totalTtLookups) * 100).toFixed(1) + '%' : '?';
  const qPerDAll    = totalDecisions > 0 ? Math.round(totalQNodes / totalDecisions) : 0;
  const avgMsAll    = totalDecisions > 0 ? (totalMs / totalDecisions).toFixed(0) : '?';

  console.log('-'.repeat(65));
  console.log(`   P1: ${p1Wins}  P2: ${p2Wins}  Draw: ${draws}  DR=${dr}%`);
  console.log(`   Avg turns: ${avgTurns}`);
  console.log(`   Avg depth: ${avgDepthAll}  TT hit: ${ttHitAll}`);
  console.log(`   qNodes/decision: ${qPerDAll}`);
  console.log(`   Avg decision time: ${avgMsAll}ms`);

  return { p1Wins, p2Wins, draws, dr: parseFloat(dr), avgTurns: parseFloat(avgTurns),
           avgDepth: parseFloat(avgDepthAll), ttHitRate: ttHitAll, qPerD: qPerDAll,
           avgMs: parseFloat(avgMsAll), n };
}

const BASELINE_AVG_MS = 280; // from transposition-table validation (HvB+EvD avg)

async function main() {
  console.log('\n=== Tier 1 Search Validation: Quiescence + History + PVS ===');
  console.log(`Time budget: ${TIME_BUDGET_MS}ms/decision`);
  console.log(`Decision time gate: < ${(BASELINE_AVG_MS * 3).toFixed(0)}ms (3× baseline of ${BASELINE_AVG_MS}ms)`);

  const setA = runSet('Human vs Beast', 'human', 'beast', 10);
  const setB = runSet('Elf vs Demon',   'elf',   'demon', 10);

  const combined = {
    p1: setA.p1Wins + setB.p1Wins,
    p2: setA.p2Wins + setB.p2Wins,
    draws: setA.draws + setB.draws,
    total: 20,
  };
  const combinedDR = ((combined.draws / combined.total) * 100).toFixed(1);
  const combinedAvgMs = ((setA.avgMs * setA.n + setB.avgMs * setB.n) / (setA.n + setB.n)).toFixed(0);
  const combinedAvgDepth = ((setA.avgDepth * setA.n + setB.avgDepth * setB.n) / (setA.n + setB.n)).toFixed(2);
  const combinedQPerD = Math.round((setA.qPerD * setA.n + setB.qPerD * setB.n) / (setA.n + setB.n));

  console.log('\n=== Combined Results (20 games) ===');
  console.log(`P1: ${combined.p1}  P2: ${combined.p2}  Draws: ${combined.draws}  Combined DR=${combinedDR}%`);
  console.log(`Avg depth:          ${combinedAvgDepth}`);
  console.log(`Avg decision time:  ${combinedAvgMs}ms`);
  console.log(`qNodes/decision:    ${combinedQPerD}`);

  console.log('\n=== Gate Checks ===');
  const timingOK = parseFloat(combinedAvgMs) < BASELINE_AVG_MS * 3;
  console.log(`Decision time < ${(BASELINE_AVG_MS * 3).toFixed(0)}ms: ${timingOK ? 'PASS' : 'FAIL'} (${combinedAvgMs}ms)`);
  console.log(`Baseline DR for comparison: 37.9% (1200-game) / 55.0% (20-game TT validation)`);
  console.log(`Combined DR this run: ${combinedDR}%`);
}

main().catch(e => { console.error(e); process.exit(1); });
