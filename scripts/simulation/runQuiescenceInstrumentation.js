/**
 * runQuiescenceInstrumentation.js
 *
 * Diagnostic script for LOG-1502 Part 2: quiescence search instrumentation.
 * Runs 20 games (10 HvB + 10 EvD) and reports:
 *   - Quiescence invocations per turn (qNodes / turns)
 *   - Stand-pat exit rate (qStandPat / qNodes)
 *   - Avg quiescence depth reached per decision
 *   - Action-limit game analysis for EvD (which action types dominate)
 *
 * Branch: diag/quiescence-instrumentation
 * Do NOT merge to main.
 *
 * Usage:
 *   node runQuiescenceInstrumentation.js
 */

import { createGame, applyAction, isGameOver, getLegalActions } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';

const MAX_TURNS   = 35;
const MAX_ACTIONS = 600;

function runGame(p1Deck, p2Deck) {
  let state = createGame(p1Deck, p2Deck);
  let turnCount  = 0;
  let actionCount = 0;
  let commandsUsedThisTurn = 0;

  // Quiescence stats accumulated across all decisions
  const gameStats = {
    ttLookups: 0, ttHits: 0,
    qNodesSum: 0, qStandPatSum: 0, qDepthMaxSum: 0,
    depthSum: 0, ttSizeSum: 0, decisions: 0,
  };

  // Action-limit analysis: count action types taken
  const actionTypeCounts = {};
  let hitActionLimit = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS || actionCount >= MAX_ACTIONS) {
      if (actionCount >= MAX_ACTIONS) hitActionLimit = true;
      break;
    }

    const action = chooseActionMinimax(state, commandsUsedThisTurn, {
      timeBudget: 200,
      stats: gameStats,
    });

    if (!action) break;

    const aType = action.type;
    actionTypeCounts[aType] = (actionTypeCounts[aType] ?? 0) + 1;

    const prevTurn = state.turn ?? 0;
    state = applyAction(state, action);

    if (action.type === 'endTurn') {
      commandsUsedThisTurn = 0;
      if ((state.turn ?? 0) !== prevTurn) turnCount++;
    } else if (action.type === 'move') {
      commandsUsedThisTurn++;
    }
    actionCount++;
  }

  const { winner } = isGameOver(state);
  return {
    winner: winner ?? 'draw',
    turns: turnCount,
    actionCount,
    hitActionLimit,
    actionTypeCounts,
    stats: gameStats,
  };
}

// ── Reporting helpers ─────────────────────────────────────────────────────────

function pct(n, d) {
  return d > 0 ? ((n / d) * 100).toFixed(1) + '%' : 'N/A';
}

function avg(n, d) {
  return d > 0 ? (n / d).toFixed(2) : 'N/A';
}

function reportMatchup(label, results) {
  const wins   = results.filter(r => r.winner === 'p1').length;
  const p2wins = results.filter(r => r.winner === 'p2').length;
  const draws  = results.filter(r => r.winner === 'draw').length;
  const dr     = pct(draws, results.length);

  const totalQ        = results.reduce((s, r) => s + r.stats.qNodesSum, 0);
  const totalStandPat = results.reduce((s, r) => s + r.stats.qStandPatSum, 0);
  const totalDepthMax = results.reduce((s, r) => s + r.stats.qDepthMaxSum, 0);
  const totalDecisions= results.reduce((s, r) => s + r.stats.decisions, 0);
  const totalTurns    = results.reduce((s, r) => s + r.turns, 0);
  const totalActions  = results.reduce((s, r) => s + r.actionCount, 0);
  const limitGames    = results.filter(r => r.hitActionLimit).length;

  console.log(`\n--- ${label} (${results.length} games) ---`);
  console.log(`  Results: P1 ${wins} / P2 ${p2wins} / Draw ${draws}  DR=${dr}`);
  console.log(`  Avg turns: ${avg(totalTurns, results.length)}  Avg actions/game: ${avg(totalActions, results.length)}`);
  console.log(`  Action-limit games: ${limitGames}/${results.length}`);
  console.log(`  Quiescence:`);
  console.log(`    Total qNodes:      ${totalQ}  (${avg(totalQ, totalDecisions)} per decision, ${avg(totalQ, totalTurns)} per turn)`);
  console.log(`    Stand-pat exits:   ${totalStandPat}  rate=${pct(totalStandPat, totalQ)}`);
  console.log(`    Avg qDepthMax/dec: ${avg(totalDepthMax, totalDecisions)}`);
  console.log(`    Avg search depth:  ${avg(results.reduce((s,r)=>s+r.stats.depthSum,0), totalDecisions)}`);

  if (limitGames > 0) {
    // Aggregate action type counts for action-limit games
    const limitResults = results.filter(r => r.hitActionLimit);
    const combined = {};
    for (const r of limitResults) {
      for (const [t, n] of Object.entries(r.actionTypeCounts)) {
        combined[t] = (combined[t] ?? 0) + n;
      }
    }
    const totalAct = Object.values(combined).reduce((s, n) => s + n, 0);
    const sorted = Object.entries(combined).sort((a, b) => b[1] - a[1]);
    console.log(`  Action-limit game breakdown (${limitGames} games, ${totalAct} total actions):`);
    for (const [t, n] of sorted) {
      console.log(`    ${t}: ${n} (${pct(n, totalAct)})`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MATCHUPS = [
  { p1: 'human', p2: 'beast', label: 'Human vs Beast', count: 10 },
  { p1: 'elf',   p2: 'demon', label: 'Elf vs Demon',   count: 10 },
];

console.log('\n=== Quiescence Search Instrumentation (diag/quiescence-instrumentation) ===');
console.log('20 games: 10 HvB + 10 EvD, timeBudget=200ms\n');

const allResults = [];

for (const { p1, p2, label, count } of MATCHUPS) {
  const results = [];
  for (let g = 0; g < count; g++) {
    process.stdout.write(`  [${label}] game ${g+1}/${count}...\r`);
    const r = runGame(p1, p2);
    results.push(r);
    allResults.push(r);
  }
  reportMatchup(label, results);
}

// Aggregate
console.log('\n=== AGGREGATE (all 20 games) ===');
reportMatchup('All matchups', allResults);
