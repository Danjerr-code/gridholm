/**
 * runMatrix.js
 *
 * Runs a full round-robin of all faction pairs and produces a matchup matrix.
 * Each pair runs in both directions to account for first-player advantage.
 *
 * Usage:
 *   node runMatrix.js [--games 500]
 *
 * Options:
 *   --games  Games per direction per matchup (default: 500)
 */

import { writeFileSync } from 'fs';
import { runGame, computeCardAnalysis } from './runSimulation.js';

const FACTIONS = ['human', 'beast', 'elf', 'demon'];

// All unordered pairs (6 total)
const PAIRS = [];
for (let i = 0; i < FACTIONS.length; i++) {
  for (let j = i + 1; j < FACTIONS.length; j++) {
    PAIRS.push([FACTIONS[i], FACTIONS[j]]);
  }
}

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { games: 500, ai: 'minimax', depth: 2, sims: 10000, timeout: 100 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--games':   args.games   = parseInt(argv[++i], 10); break;
      case '--ai':      args.ai      = argv[++i]; break;
      case '--depth':   args.depth   = parseInt(argv[++i], 10); break;
      case '--sims':    args.sims    = parseInt(argv[++i], 10); break;
      case '--timeout': args.timeout = parseInt(argv[++i], 10); break;
    }
  }
  return args;
}

// ── Run all matchups ──────────────────────────────────────────────────────────

/**
 * Run one directional matchup (gamesPerDir games) and return aggregate stats.
 */
function runMatchup(p1Faction, p2Faction, gamesPerDir, globalGameId, opts = {}) {
  const results = [];
  let p1Wins = 0, p2Wins = 0, draws = 0, totalTurns = 0, minimaxTotalMs = 0;

  for (let i = 0; i < gamesPerDir; i++) {
    const result = runGame(globalGameId + i, p1Faction, p2Faction, opts);
    results.push(result);
    if      (result.winner === 'p1') { p1Wins++; }
    else if (result.winner === 'p2') { p2Wins++; }
    else draws++;
    totalTurns += result.turns;
    if (result.minimaxMs != null) minimaxTotalMs += result.minimaxMs;
  }

  return {
    p1Faction,
    p2Faction,
    gamesRun: gamesPerDir,
    p1Wins,
    p2Wins,
    draws,
    avgTurns: gamesPerDir > 0 ? totalTurns / gamesPerDir : 0,
    minimaxTotalMs,
    results,
  };
}

const { games: gamesPerDir, ai: aiMode, depth: minimaxDepth, sims: mctsSimulations, timeout: mctsTimeoutMs } = parseArgs(process.argv);
const gameOpts = { ai: aiMode, depth: minimaxDepth, sims: mctsSimulations, timeout: mctsTimeoutMs };

const totalMatchups   = PAIRS.length * 2; // each pair × 2 directions
const totalGamesAll   = totalMatchups * gamesPerDir;

console.log(`Running matchup matrix: ${FACTIONS.join(', ')} [ai=${aiMode}${aiMode === 'minimax' ? ` depth=${minimaxDepth}` : ''}${aiMode === 'mcts' ? ` timeout=${mctsTimeoutMs}ms` : ''}]`);
console.log(`${PAIRS.length} pairs × 2 directions × ${gamesPerDir} games = ${totalGamesAll} total games\n`);

// matchupData[p1][p2] = { p1Wins, p2Wins, draws, avgTurns, gamesRun }
const matchupData = {};
for (const f of FACTIONS) matchupData[f] = {};

// Per-faction card analysis accumulator
const factionResults = {}; // faction → all game results where it was p1 or p2
for (const f of FACTIONS) factionResults[f] = [];

let globalGameId = 1;
let completedMatchups = 0;
let totalMinimaxMs = 0;

for (const [fA, fB] of PAIRS) {
  // Direction 1: fA as p1, fB as p2
  process.stdout.write(`  ${fA} vs ${fB} (dir 1)...`);
  const dir1 = runMatchup(fA, fB, gamesPerDir, globalGameId, gameOpts);
  globalGameId += gamesPerDir;
  matchupData[fA][fB] = dir1;
  factionResults[fA].push(...dir1.results);
  factionResults[fB].push(...dir1.results);
  totalMinimaxMs += dir1.minimaxTotalMs;
  console.log(` done (${fA} wins: ${dir1.p1Wins}/${gamesPerDir})`);

  // Direction 2: fB as p1, fA as p2
  process.stdout.write(`  ${fB} vs ${fA} (dir 2)...`);
  const dir2 = runMatchup(fB, fA, gamesPerDir, globalGameId, gameOpts);
  globalGameId += gamesPerDir;
  matchupData[fB][fA] = dir2;
  factionResults[fB].push(...dir2.results);
  factionResults[fA].push(...dir2.results);
  totalMinimaxMs += dir2.minimaxTotalMs;
  console.log(` done (${fB} wins: ${dir2.p1Wins}/${gamesPerDir})`);

  completedMatchups += 2;
}

// ── Compute win rates ─────────────────────────────────────────────────────────

/**
 * Overall win rate for `faction` against `opponent` (both directions combined).
 * Returns a value in [0,1].
 */
function combinedWinRate(faction, opponent) {
  const asP1 = matchupData[faction]?.[opponent];
  const asP2 = matchupData[opponent]?.[faction];

  let factionWins = 0, total = 0;
  if (asP1) { factionWins += asP1.p1Wins; total += asP1.gamesRun; }
  if (asP2) { factionWins += asP2.p2Wins; total += asP2.gamesRun; }
  return total > 0 ? factionWins / total : null;
}

// ── Print matchup matrix ──────────────────────────────────────────────────────

const COL_W = 9;
const pad = (s, w) => String(s).padStart(w);
const pct = v => v == null ? '  -   ' : `${(v * 100).toFixed(1)}%`;

console.log('\n── Matchup Matrix (row faction win rate vs column faction) ──\n');

// Header
let header = ''.padEnd(COL_W + 2);
for (const f of FACTIONS) header += pad(f.charAt(0).toUpperCase() + f.slice(1), COL_W + 1);
console.log(header);

for (const rowF of FACTIONS) {
  let line = (rowF.charAt(0).toUpperCase() + rowF.slice(1)).padEnd(COL_W + 2);
  for (const colF of FACTIONS) {
    if (rowF === colF) {
      line += pad('-', COL_W + 1);
    } else {
      line += pad(pct(combinedWinRate(rowF, colF)), COL_W + 1);
    }
  }
  console.log(line);
}

// ── First-player advantage ────────────────────────────────────────────────────

let allP1Wins = 0, allGames = 0;
for (const fA of FACTIONS) {
  for (const fB of Object.keys(matchupData[fA])) {
    const m = matchupData[fA][fB];
    allP1Wins += m.p1Wins;
    allGames  += m.gamesRun;
  }
}
const p1AdvantageRate = allGames > 0 ? allP1Wins / allGames : 0;

console.log('\n── First-Player Advantage ───────────────────');
console.log(`  Overall P1 win rate: ${(p1AdvantageRate * 100).toFixed(1)}% (${allP1Wins}/${allGames} games)`);

if (aiMode === 'minimax') {
  const avgDecisionMs = allGames > 0 ? totalMinimaxMs / allGames : 0;
  console.log('\n── Minimax AI Performance ───────────────────');
  console.log(`  Avg AI time/game: ${avgDecisionMs.toFixed(0)}ms`);
  if (avgDecisionMs > 1000) {
    console.log('  [WARNING] Average decision time exceeds 1s — consider reducing --depth or --games.');
  }
}

// ── Avg game length per matchup ───────────────────────────────────────────────

console.log('\n── Avg Game Length per Matchup (turns) ─────');
for (const [fA, fB] of PAIRS) {
  const d1 = matchupData[fA][fB];
  const d2 = matchupData[fB][fA];
  const avgTurns = ((d1.avgTurns + d2.avgTurns) / 2).toFixed(1);
  console.log(`  ${fA.padEnd(6)} vs ${fB.padEnd(6)}: ${avgTurns} avg turns`);
}

// ── Top 5 cards by winRateImpact per faction ─────────────────────────────────

console.log('\n── Top 5 Cards by Win Rate Impact per Faction ──');
for (const faction of FACTIONS) {
  // Pass a selector so only the faction's own side is analysed — prevents
  // opponent cards from appearing in a faction's top-card rankings.
  const analysis = computeCardAnalysis(
    factionResults[faction],
    result => result.p1Deck === faction ? 'p1' : 'p2',
  );
  // Only include cards that appeared in this faction's games as p1
  const ranked = Object.entries(analysis)
    .filter(([, a]) => a.winRateImpact != null)
    .sort((a, b) => b[1].winRateImpact - a[1].winRateImpact)
    .slice(0, 5);

  console.log(`\n  ${faction.charAt(0).toUpperCase() + faction.slice(1)}:`);
  if (ranked.length === 0) {
    console.log('    (no data)');
  } else {
    for (const [cardId, a] of ranked) {
      console.log(`    ${cardId.padEnd(22)} impact: ${(a.winRateImpact * 100).toFixed(1).padStart(6)}%`);
    }
  }
}
console.log('');

// ── Save results ──────────────────────────────────────────────────────────────

// Strip per-game results arrays from matchupData to keep the matrix file lean
const matrixSummary = {};
for (const fA of FACTIONS) {
  matrixSummary[fA] = {};
  for (const [fB, m] of Object.entries(matchupData[fA])) {
    matrixSummary[fA][fB] = {
      p1Faction: m.p1Faction,
      p2Faction: m.p2Faction,
      gamesRun:  m.gamesRun,
      p1Wins:    m.p1Wins,
      p2Wins:    m.p2Wins,
      draws:     m.draws,
      avgTurns:  +m.avgTurns.toFixed(2),
      p1WinRate: +(m.p1Wins / m.gamesRun).toFixed(4),
    };
  }
}

const factionCardAnalysis = {};
for (const faction of FACTIONS) {
  factionCardAnalysis[faction] = computeCardAnalysis(
    factionResults[faction],
    result => result.p1Deck === faction ? 'p1' : 'p2',
  );
}

const outputPath = 'scripts/simulation/matrix_results.json';
writeFileSync(outputPath, JSON.stringify({
  config: { gamesPerDirection: gamesPerDir, totalGames: allGames },
  matrix: matrixSummary,
  firstPlayerAdvantage: +p1AdvantageRate.toFixed(4),
  factionCardAnalysis,
}, null, 2));

console.log(`Full results saved to ${outputPath}`);
