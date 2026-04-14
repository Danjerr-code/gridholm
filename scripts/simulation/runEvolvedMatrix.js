/**
 * runEvolvedMatrix.js
 *
 * Validation matrix for evolved weights. Runs all 8 pairings vs all 8 pairings
 * (28 pairs × 2 directions × gamesPerDir games = 2,800 at default 50 games).
 *
 * Each side uses EVOLVED_WEIGHTS[faction] if available, else falls back to
 * FACTION_WEIGHTS[faction] or WEIGHTS.
 *
 * Uses the same depth-1 evaluateBoard AI as evolve.js — this is an apples-to-apples
 * comparison to the evolve.js tournament results.
 *
 * Usage:
 *   node scripts/simulation/runEvolvedMatrix.js [--games 50] [--output matrix_evolved.json]
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { createPairingGame, applyAction, isGameOver, getLegalActions } from './pairingGameEngine.js';
import { buildDeck, ALL_PAIRINGS, CHAMPION_TO_DECKID } from './deckBuilder.js';
import { evaluateBoard, WEIGHTS, FACTION_WEIGHTS } from './boardEval.js';
import { EVOLVED_WEIGHTS } from './evolvedWeights.js';

const MAX_TURNS        = 30;
const MAX_ACTIONS_GAME = 800;
const RESULTS_DIR      = 'scripts/simulation/results';

// ── Weight selector ───────────────────────────────────────────────────────────

/**
 * Get the best available weights for a pairing.
 * Prefers evolved > faction seed > global baseline.
 */
function getWeightsForPairing(pairing) {
  const factionKey = pairing.secondary
    ? `${pairing.champion}_${pairing.secondary}`
    : pairing.champion;

  return EVOLVED_WEIGHTS[factionKey]
    ?? EVOLVED_WEIGHTS[pairing.champion]
    ?? FACTION_WEIGHTS?.[pairing.champion]
    ?? WEIGHTS;
}

// ── Action chooser (depth-1 evaluateBoard) ────────────────────────────────────

function withSilentLogs(fn) {
  const origLog  = console.log;
  const origWarn = console.warn;
  const origInfo = console.info;
  const origAssert = console.assert;
  console.log    = () => {};
  console.warn   = () => {};
  console.info   = () => {};
  console.assert = () => {};
  try {
    return fn();
  } finally {
    console.log    = origLog;
    console.warn   = origWarn;
    console.info   = origInfo;
    console.assert = origAssert;
  }
}

function chooseActionWithWeights(state, weights) {
  const candidates = withSilentLogs(() => getLegalActions(state));
  if (!candidates || candidates.length === 0) return null;

  const ap = state.activePlayer;
  let bestScore = -Infinity;
  let bestAction = candidates[0];

  for (const action of candidates) {
    let nextState;
    try {
      nextState = withSilentLogs(() => applyAction(state, action));
    } catch {
      continue;
    }

    const result = withSilentLogs(() => isGameOver(nextState));
    if (result.over) {
      if (result.winner === 'p1' && ap === 0) return action;
      if (result.winner === 'p2' && ap === 1) return action;
    }

    const score = evaluateBoard(nextState, ap === 0 ? 'p1' : 'p2', weights);
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return bestAction;
}

// ── Single game ───────────────────────────────────────────────────────────────

/**
 * Run one game with p1Pairing vs p2Pairing.
 * p1Weights and p2Weights are the evolved/best-available weights for each side.
 */
function runGame(p1Pairing, p2Pairing, p1Weights, p2Weights) {
  const p1Build = buildDeck(p1Pairing.champion, p1Pairing.secondary, 'curve');
  const p2Build = buildDeck(p2Pairing.champion, p2Pairing.secondary, 'curve');
  const p1DeckId = CHAMPION_TO_DECKID[p1Pairing.champion];
  const p2DeckId = CHAMPION_TO_DECKID[p2Pairing.champion];

  let state;
  try {
    state = withSilentLogs(() => createPairingGame(p1DeckId, p1Build.cardIds, p2DeckId, p2Build.cardIds));
  } catch {
    return { winner: null, turns: 0 };
  }

  let turnCount   = 0;
  let actionCount = 0;
  let cmdUsed     = 0;

  while (true) {
    const { over, winner } = withSilentLogs(() => isGameOver(state));
    if (over) return { winner, turns: turnCount };
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) break;

    const ap      = state.activePlayer;
    const weights = ap === 0 ? p1Weights : p2Weights;

    let action;
    try {
      action = withSilentLogs(() => chooseActionWithWeights(state, weights));
      state  = withSilentLogs(() => applyAction(state, action));
    } catch {
      break;
    }

    actionCount++;
    if (action?.type === 'move') {
      cmdUsed++;
    } else if (action?.type === 'endTurn') {
      turnCount++;
      cmdUsed = 0;
    }
  }

  return { winner: null, turns: turnCount };
}

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { games: 50, output: null };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--games':  args.games  = parseInt(argv[++i], 10); break;
      case '--output': args.output = argv[++i]; break;
    }
  }
  return args;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);

// Generate all C(8,2) = 28 unordered pairs
const PAIRS = [];
for (let i = 0; i < ALL_PAIRINGS.length; i++) {
  for (let j = i + 1; j < ALL_PAIRINGS.length; j++) {
    PAIRS.push([ALL_PAIRINGS[i], ALL_PAIRINGS[j]]);
  }
}

const totalDirectional = PAIRS.length * 2;
const totalGames       = totalDirectional * args.games;

console.log(`\n=== Evolved Weights Validation Matrix ===`);
console.log(`Pairings: ${ALL_PAIRINGS.length} (${PAIRS.length} pairs × 2 dirs × ${args.games} games = ${totalGames} total)\n`);

// Log which weights are in use
console.log('Weight sources:');
for (const p of ALL_PAIRINGS) {
  const key = p.secondary ? `${p.champion}_${p.secondary}` : p.champion;
  const source = EVOLVED_WEIGHTS[key]
    ? `evolved (${key})`
    : EVOLVED_WEIGHTS[p.champion]
      ? `evolved (${p.champion} fallback)`
      : 'seed (FACTION_WEIGHTS)';
  console.log(`  ${p.id.padEnd(15)} → ${source}`);
}
console.log('');

// Per-pair results storage
const pairResults = {};

let totalP1Wins = 0;
let totalP2Wins = 0;
let totalDraws  = 0;
let totalTurns  = 0;
let completedDirectional = 0;

for (const [pA, pB] of PAIRS) {
  const wA = getWeightsForPairing(pA);
  const wB = getWeightsForPairing(pB);
  const pairKey = `${pA.id}_vs_${pB.id}`;
  pairResults[pairKey] = {};

  for (const [dir, p1Pairing, p2Pairing, p1W, p2W] of [
    ['fwd', pA, pB, wA, wB],
    ['rev', pB, pA, wB, wA],
  ]) {
    const label = dir === 'fwd'
      ? `${pA.id} vs ${pB.id}`
      : `${pB.id} vs ${pA.id}`;

    process.stdout.write(`  ${label.padEnd(40)} ...`);

    let p1Wins = 0, p2Wins = 0, draws = 0, turns = 0;
    for (let g = 0; g < args.games; g++) {
      const result = runGame(p1Pairing, p2Pairing, p1W, p2W);
      if      (result.winner === 'p1') p1Wins++;
      else if (result.winner === 'p2') p2Wins++;
      else draws++;
      turns += result.turns;
    }

    const drawRate = draws / args.games;
    console.log(` P1: ${p1Wins} P2: ${p2Wins} D: ${draws} (drawRate: ${(drawRate*100).toFixed(1)}%)`);

    pairResults[pairKey][dir] = { p1Pairing: p1Pairing.id, p2Pairing: p2Pairing.id, p1Wins, p2Wins, draws, games: args.games, avgTurns: turns / args.games };

    totalP1Wins += p1Wins;
    totalP2Wins += p2Wins;
    totalDraws  += draws;
    totalTurns  += turns;
    completedDirectional++;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const totalGamesRun = totalP1Wins + totalP2Wins + totalDraws;
const overallDrawRate = totalDraws / totalGamesRun;
const overallP1WR    = totalP1Wins / totalGamesRun;
const overallP2WR    = totalP2Wins / totalGamesRun;
const avgTurns       = totalTurns / totalGamesRun;

console.log(`\n=== Summary ===`);
console.log(`Total games: ${totalGamesRun}`);
console.log(`Draw rate:   ${(overallDrawRate * 100).toFixed(2)}%`);
console.log(`P1 win rate: ${(overallP1WR * 100).toFixed(2)}%`);
console.log(`P2 win rate: ${(overallP2WR * 100).toFixed(2)}%`);
console.log(`Avg turns:   ${avgTurns.toFixed(1)}`);

// Per-pairing summary
console.log('\n── Per-Pairing Results (combined both directions) ──');
const pairingStats = {};

for (const p of ALL_PAIRINGS) {
  pairingStats[p.id] = { wins: 0, losses: 0, draws: 0, games: 0, turnTotal: 0 };
}

for (const [key, dirs] of Object.entries(pairResults)) {
  for (const dir of Object.values(dirs)) {
    const p1Id = dir.p1Pairing;
    const p2Id = dir.p2Pairing;
    if (pairingStats[p1Id]) {
      pairingStats[p1Id].wins   += dir.p1Wins;
      pairingStats[p1Id].losses += dir.p2Wins;
      pairingStats[p1Id].draws  += dir.draws;
      pairingStats[p1Id].games  += dir.games;
      pairingStats[p1Id].turnTotal += dir.avgTurns * dir.games;
    }
    if (pairingStats[p2Id]) {
      pairingStats[p2Id].wins   += dir.p2Wins;
      pairingStats[p2Id].losses += dir.p1Wins;
      pairingStats[p2Id].draws  += dir.draws;
      pairingStats[p2Id].games  += dir.games;
      pairingStats[p2Id].turnTotal += dir.avgTurns * dir.games;
    }
  }
}

const sortedPairings = Object.entries(pairingStats).sort((a, b) => {
  const aWR = a[1].wins / (a[1].games || 1);
  const bWR = b[1].wins / (b[1].games || 1);
  return bWR - aWR;
});

console.log(`${'Pairing'.padEnd(18)} ${'WR%'.padStart(6)} ${'DR%'.padStart(6)} ${'AvgT'.padStart(6)}`);
for (const [id, s] of sortedPairings) {
  const wr = (s.wins / s.games * 100).toFixed(1);
  const dr = (s.draws / s.games * 100).toFixed(1);
  const at = (s.turnTotal / s.games).toFixed(1);
  console.log(`${id.padEnd(18)} ${wr.padStart(6)}% ${dr.padStart(6)}% ${at.padStart(6)}t`);
}

// Flag high draw rates
console.log('\n── Draw Rate Flags (> 30%) ──');
let flags = 0;
for (const [key, dirs] of Object.entries(pairResults)) {
  for (const dir of Object.values(dirs)) {
    const dr = dir.draws / dir.games;
    if (dr > 0.30) {
      console.log(`  [FLAG] ${dir.p1Pairing} vs ${dir.p2Pairing}: ${(dr*100).toFixed(1)}% draws`);
      flags++;
    }
  }
}
if (flags === 0) console.log('  None');

// ── Save results ──────────────────────────────────────────────────────────────

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = args.output ?? `${RESULTS_DIR}/evolved_matrix_${timestamp}.json`;

writeFileSync(outPath, JSON.stringify({
  meta: {
    timestamp,
    gamesPerDirection: args.games,
    totalGames: totalGamesRun,
    totalDirectional,
    weightSources: Object.fromEntries(
      ALL_PAIRINGS.map(p => {
        const key = p.secondary ? `${p.champion}_${p.secondary}` : p.champion;
        const src = EVOLVED_WEIGHTS[key] ? 'evolved' : EVOLVED_WEIGHTS[p.champion] ? 'evolved_fallback' : 'seed';
        return [p.id, src];
      })
    ),
  },
  summary: {
    overallDrawRate:   +overallDrawRate.toFixed(4),
    overallP1WinRate:  +overallP1WR.toFixed(4),
    overallP2WinRate:  +overallP2WR.toFixed(4),
    avgGameLength:     +avgTurns.toFixed(2),
  },
  pairingStats,
  pairResults,
}, null, 2));

console.log(`\nResults saved: ${outPath}`);
