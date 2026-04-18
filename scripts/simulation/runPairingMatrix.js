/**
 * runPairingMatrix.js
 *
 * Runs a full matchup matrix across all 12 viable champion pairings.
 * Each pairing generates a fresh random curve deck per game.
 * Reports win rates, draw rates, average game length, and top cards per pairing.
 *
 * Usage:
 *   node runPairingMatrix.js [--games 50] [--mode curve] [--depth 2]
 *
 * Options:
 *   --games   Games per directional matchup (default: 50)
 *   --mode    Deck mode: 'random'|'curve'|'archetype' (default: curve)
 *   --depth   Minimax depth (always uses minimax AI, default: 2)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { createPairingGame, applyAction, isGameOver, getLegalActions } from './pairingGameEngine.js';
import { buildDeck, ALL_PAIRINGS, CHAMPION_TO_DECKID } from './deckBuilder.js';
import { chooseActionMinimax } from './minimaxAI.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { games: 50, mode: 'curve', depth: 2 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--games': args.games = parseInt(argv[++i], 10); break;
      case '--mode':  args.mode  = argv[++i]; break;
      case '--depth': args.depth = parseInt(argv[++i], 10); break;
    }
  }
  return args;
}

// ── Game loop ─────────────────────────────────────────────────────────────────

const MAX_TURNS        = 25;
const MAX_ACTIONS_GAME = 300;

/**
 * Run a single game between two pairings, using fresh generated decks.
 * Returns { winner: 'p1'|'p2'|null, turns, p1FinalHP, p2FinalHP, p1Resonance, p2Resonance, cardStats }
 */
function runPairingGame(gameId, p1Pairing, p2Pairing, depth, deckMode) {
  // Generate fresh decks for this game — buildDeck now returns { cardIds, resonance }
  const p1Build = buildDeck(p1Pairing.champion, p1Pairing.secondary, deckMode,
    { pairingId: p1Pairing.id });
  const p2Build = buildDeck(p2Pairing.champion, p2Pairing.secondary, deckMode,
    { pairingId: p2Pairing.id });

  const p1CardIds = p1Build.cardIds;
  const p2CardIds = p2Build.cardIds;

  const p1DeckId = CHAMPION_TO_DECKID[p1Pairing.champion];
  const p2DeckId = CHAMPION_TO_DECKID[p2Pairing.champion];

  let state = createPairingGame(p1DeckId, p1CardIds, p2DeckId, p2CardIds);

  // Track which cards were in each player's deck this game (for win-rate analysis)
  const p1DeckSet = new Set(p1CardIds);
  const p2DeckSet = new Set(p2CardIds);

  let turnCount   = 0;
  let actionCount = 0;
  let commandsUsedThisTurn = 0;
  let forceDraw   = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) {
      forceDraw = true;
      break;
    }

    let action;
    try {
      action = chooseActionMinimax(state, commandsUsedThisTurn, { depth });
      state = applyAction(state, action);
    } catch (e) {
      // Engine error in this game — treat as draw and skip remaining actions
      forceDraw = true;
      break;
    }
    actionCount++;

    if (action.type === 'move') {
      commandsUsedThisTurn++;
    } else if (action.type === 'endTurn') {
      turnCount++;
      commandsUsedThisTurn = 0;
    }
  }

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
    p1PairingId: p1Pairing.id,
    p2PairingId: p2Pairing.id,
    winner,
    turns: turnCount,
    p1FinalHP,
    p2FinalHP,
    p1CardIds,
    p2CardIds,
    p1ResonanceScore: p1Build.resonance.score,
    p1ResonanceTier:  p1Build.resonance.tier,
    p2ResonanceScore: p2Build.resonance.score,
    p2ResonanceTier:  p2Build.resonance.tier,
  };
}

// ── Matchup runner ────────────────────────────────────────────────────────────

function runMatchup(p1Pairing, p2Pairing, gamesPerDir, startGameId, depth, deckMode) {
  let p1Wins = 0, p2Wins = 0, draws = 0, totalTurns = 0;
  // Resonance tracking: per-player, count ascended/non-ascended decks and wins
  let p1AscendedWins = 0, p1AscendedGames = 0;
  let p2AscendedWins = 0, p2AscendedGames = 0;
  let p1TotalResonance = 0, p2TotalResonance = 0;
  const results = [];

  for (let i = 0; i < gamesPerDir; i++) {
    const result = runPairingGame(startGameId + i, p1Pairing, p2Pairing, depth, deckMode);
    results.push(result);
    if      (result.winner === 'p1') p1Wins++;
    else if (result.winner === 'p2') p2Wins++;
    else draws++;
    totalTurns += result.turns;

    // Resonance accumulation
    p1TotalResonance += result.p1ResonanceScore;
    p2TotalResonance += result.p2ResonanceScore;
    if (result.p1ResonanceTier === 'ascended') {
      p1AscendedGames++;
      if (result.winner === 'p1') p1AscendedWins++;
    }
    if (result.p2ResonanceTier === 'ascended') {
      p2AscendedGames++;
      if (result.winner === 'p2') p2AscendedWins++;
    }
  }

  return {
    p1PairingId: p1Pairing.id,
    p2PairingId: p2Pairing.id,
    gamesRun: gamesPerDir,
    p1Wins,
    p2Wins,
    draws,
    avgTurns: totalTurns / gamesPerDir,
    // Resonance summary
    p1AvgResonance: +(p1TotalResonance / gamesPerDir).toFixed(1),
    p2AvgResonance: +(p2TotalResonance / gamesPerDir).toFixed(1),
    p1AscendedGames,
    p1AscendedWins,
    p2AscendedGames,
    p2AscendedWins,
    results,
  };
}

// ── Card win-rate analysis ────────────────────────────────────────────────────

/**
 * Compute per-card win rate impact across all pairing matchups.
 * For each card, tracks: games where it appeared in a player's deck, and wins.
 */
function computePairingCardAnalysis(allResults) {
  // cardId → { gamesWithCard, winsWithCard, gamesWithoutCard, winsWithoutCard }
  const stats = new Map();

  function get(cardId) {
    if (!stats.has(cardId)) {
      stats.set(cardId, { gamesWithCard: 0, winsWithCard: 0, gamesWithoutCard: 0, winsWithoutCard: 0 });
    }
    return stats.get(cardId);
  }

  // Collect all unique card IDs seen across all games
  const allCardIds = new Set();
  for (const matchup of allResults) {
    for (const game of matchup.results) {
      for (const id of game.p1CardIds) allCardIds.add(id);
      for (const id of game.p2CardIds) allCardIds.add(id);
    }
  }

  for (const matchup of allResults) {
    for (const game of matchup.results) {
      const p1Set = new Set(game.p1CardIds);
      const p2Set = new Set(game.p2CardIds);

      for (const cardId of allCardIds) {
        // P1 side
        const s = get(cardId);
        if (p1Set.has(cardId)) {
          s.gamesWithCard++;
          if (game.winner === 'p1') s.winsWithCard++;
        } else {
          s.gamesWithoutCard++;
          if (game.winner === 'p1') s.winsWithoutCard++;
        }
        // P2 side
        if (p2Set.has(cardId)) {
          s.gamesWithCard++;
          if (game.winner === 'p2') s.winsWithCard++;
        } else {
          s.gamesWithoutCard++;
          if (game.winner === 'p2') s.winsWithoutCard++;
        }
      }
    }
  }

  const analysis = {};
  for (const [cardId, s] of stats) {
    const winRateWith    = s.gamesWithCard    > 0 ? s.winsWithCard    / s.gamesWithCard    : null;
    const winRateWithout = s.gamesWithoutCard > 0 ? s.winsWithoutCard / s.gamesWithoutCard : null;
    const impact         = (winRateWith != null && winRateWithout != null)
      ? winRateWith - winRateWithout
      : null;

    analysis[cardId] = {
      gamesWithCard:    s.gamesWithCard,
      winRateWith:      winRateWith    != null ? +winRateWith.toFixed(4)    : null,
      winRateWithout:   winRateWithout != null ? +winRateWithout.toFixed(4) : null,
      winRateImpact:    impact         != null ? +impact.toFixed(4)         : null,
    };
  }

  return analysis;
}

// ── Top 5 cards per pairing ───────────────────────────────────────────────────

/**
 * For each pairing, find the top 5 cards by win-rate impact when included in decks.
 * Only considers games where that pairing was P1 or P2.
 */
function computeTopCardsPerPairing(allResults) {
  const perPairing = {}; // pairingId → Map<cardId, { with, wins_with, without, wins_without }>

  for (const matchup of allResults) {
    for (const game of matchup.results) {
      for (const [pairingId, cardIds, playerKey] of [
        [game.p1PairingId, game.p1CardIds, 'p1'],
        [game.p2PairingId, game.p2CardIds, 'p2'],
      ]) {
        if (!perPairing[pairingId]) perPairing[pairingId] = new Map();
        const map = perPairing[pairingId];
        const cardSet = new Set(cardIds);
        const won = game.winner === playerKey;

        for (const cardId of cardIds) {
          if (!map.has(cardId)) map.set(cardId, { with: 0, wins_with: 0, without: 0, wins_without: 0 });
          const s = map.get(cardId);
          s.with++;
          if (won) s.wins_with++;
        }
        // "Without" counts: other cards seen in this pairing that aren't in this deck
        // (we skip this for per-pairing to keep it simple — just rank by win rate)
      }
    }
  }

  const result = {};
  for (const [pairingId, map] of Object.entries(perPairing)) {
    const cards = [];
    for (const [cardId, s] of map) {
      if (s.with >= 3) { // min sample threshold
        cards.push({
          cardId,
          gamesWithCard: s.with,
          winRateWith: +(s.wins_with / s.with).toFixed(4),
        });
      }
    }
    cards.sort((a, b) => b.winRateWith - a.winRateWith);
    result[pairingId] = cards.slice(0, 5);
  }
  return result;
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function buildReport(allResults, args) {
  const totalGames = allResults.reduce((s, m) => s + m.gamesRun, 0);
  let totalP1Wins = 0, totalP2Wins = 0, totalDraws = 0;
  for (const m of allResults) {
    totalP1Wins += m.p1Wins;
    totalP2Wins += m.p2Wins;
    totalDraws  += m.draws;
  }

  const overallDrawRate = totalDraws / totalGames;
  const flags = [];

  // Check for problematic matchups (draw rate > 30%)
  for (const m of allResults) {
    const drawRate = m.draws / m.gamesRun;
    if (drawRate > 0.30) {
      flags.push(`HIGH DRAW: ${m.p1PairingId} vs ${m.p2PairingId} = ${(drawRate * 100).toFixed(1)}%`);
    }
    const p1WinRate = m.p1Wins / m.gamesRun;
    if (p1WinRate > 0.60) {
      flags.push(`P1 DOMINANT: ${m.p1PairingId} vs ${m.p2PairingId} = P1 ${(p1WinRate * 100).toFixed(1)}%`);
    }
    if (p1WinRate < 0.20) {
      flags.push(`P2 DOMINANT: ${m.p1PairingId} vs ${m.p2PairingId} = P2 ${((1 - p1WinRate) * 100).toFixed(1)}%`);
    }
  }

  return {
    meta: {
      date: new Date().toISOString(),
      gamesPerMatchup: args.games,
      deckMode: args.mode,
      minimaxDepth: args.depth,
      totalGames,
      overallP1WinRate: +(totalP1Wins / totalGames).toFixed(4),
      overallP2WinRate: +(totalP2Wins / totalGames).toFixed(4),
      overallDrawRate:  +overallDrawRate.toFixed(4),
    },
    matchups: allResults.map(m => ({
      p1PairingId:     m.p1PairingId,
      p2PairingId:     m.p2PairingId,
      gamesRun:        m.gamesRun,
      p1WinRate:       +(m.p1Wins / m.gamesRun).toFixed(4),
      p2WinRate:       +(m.p2Wins / m.gamesRun).toFixed(4),
      drawRate:        +(m.draws  / m.gamesRun).toFixed(4),
      avgTurns:        +m.avgTurns.toFixed(1),
      // Resonance data
      p1AvgResonance:  m.p1AvgResonance,
      p2AvgResonance:  m.p2AvgResonance,
      p1AscendedGames: m.p1AscendedGames,
      p1AscendedWinRate: m.p1AscendedGames > 0
        ? +(m.p1AscendedWins / m.p1AscendedGames).toFixed(4) : null,
      p2AscendedGames: m.p2AscendedGames,
      p2AscendedWinRate: m.p2AscendedGames > 0
        ? +(m.p2AscendedWins / m.p2AscendedGames).toFixed(4) : null,
    })),
    flags,
  };
}

function printReport(report, topCards) {
  const m = report.meta;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  PAIRING MATRIX RESULTS');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Date:        ${m.date}`);
  console.log(`  Deck mode:   ${m.deckMode}`);
  console.log(`  AI:          minimax depth ${m.minimaxDepth}`);
  console.log(`  Games/pair:  ${m.gamesPerMatchup}`);
  console.log(`  Total games: ${m.totalGames}`);
  console.log(`  Overall draw rate: ${(m.overallDrawRate * 100).toFixed(1)}%`);
  console.log(`  P1 win: ${(m.overallP1WinRate * 100).toFixed(1)}%  P2 win: ${(m.overallP2WinRate * 100).toFixed(1)}%`);

  console.log('\n── Win Rate Matrix ──────────────────────────────────────────');
  console.log('  P1 Pairing              P2 Pairing              P1W%   P2W%   Draw%  AvgTurns');
  for (const r of report.matchups) {
    const p1 = r.p1PairingId.padEnd(22);
    const p2 = r.p2PairingId.padEnd(22);
    const p1w = (r.p1WinRate * 100).toFixed(1).padStart(5);
    const p2w = (r.p2WinRate * 100).toFixed(1).padStart(5);
    const dr  = (r.drawRate  * 100).toFixed(1).padStart(5);
    const at  = r.avgTurns.toFixed(1).padStart(7);
    console.log(`  ${p1} ${p2} ${p1w}% ${p2w}% ${dr}% ${at}`);
  }

  if (report.flags.length > 0) {
    console.log('\n── FLAGS ────────────────────────────────────────────────────');
    for (const f of report.flags) console.log(`  ⚠  ${f}`);
  } else {
    console.log('\n  ✓ No balance flags raised.');
  }

  // Resonance summary: aggregate across all matchups per pairing
  const resonanceByPairing = {};
  for (const r of report.matchups) {
    for (const [pid, avg, ascGames, ascWR] of [
      [r.p1PairingId, r.p1AvgResonance, r.p1AscendedGames, r.p1AscendedWinRate],
      [r.p2PairingId, r.p2AvgResonance, r.p2AscendedGames, r.p2AscendedWinRate],
    ]) {
      if (!resonanceByPairing[pid]) resonanceByPairing[pid] = { totalAvg: 0, count: 0, ascGames: 0, ascWins: 0 };
      const rb = resonanceByPairing[pid];
      rb.totalAvg += avg;
      rb.count++;
      rb.ascGames += ascGames;
      if (ascWR != null) rb.ascWins += Math.round(ascWR * ascGames);
    }
  }

  console.log('\n── Resonance per Pairing ────────────────────────────────────');
  console.log('  Pairing                  AvgScore  AscendedGames  AscendedWR');
  for (const pairing of ALL_PAIRINGS) {
    const rb = resonanceByPairing[pairing.id];
    if (!rb) continue;
    const avg = (rb.totalAvg / rb.count).toFixed(1);
    const ascWR = rb.ascGames > 0 ? ((rb.ascWins / rb.ascGames) * 100).toFixed(1) + '%' : 'n/a';
    console.log(`  ${pairing.label.padEnd(25)} ${avg.padStart(6)}    ${String(rb.ascGames).padStart(13)}  ${ascWR.padStart(10)}`);
  }

  console.log('\n── Top 5 Cards by Win Rate per Pairing ─────────────────────');
  for (const pairing of ALL_PAIRINGS) {
    const cards = topCards[pairing.id];
    if (!cards || cards.length === 0) continue;
    console.log(`\n  ${pairing.label}:`);
    for (const c of cards) {
      console.log(`    ${c.cardId.padEnd(28)} win% ${(c.winRateWith * 100).toFixed(1)}%  (n=${c.gamesWithCard})`);
    }
  }
  console.log('\n════════════════════════════════════════════════════════════\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const { games: gamesPerDir, mode: deckMode, depth } = parseArgs(process.argv);

// Build all directional matchup pairs: 8×8 excluding mirrors = 56 pairs
const MATCHUP_PAIRS = [];
for (let i = 0; i < ALL_PAIRINGS.length; i++) {
  for (let j = 0; j < ALL_PAIRINGS.length; j++) {
    if (i !== j) {
      MATCHUP_PAIRS.push([ALL_PAIRINGS[i], ALL_PAIRINGS[j]]);
    }
  }
}

const totalMatchups = MATCHUP_PAIRS.length;
const totalGames    = totalMatchups * gamesPerDir;

console.log(`\nPairing Matrix [mode=${deckMode}, minimax depth=${depth}]`);
console.log(`${ALL_PAIRINGS.length} pairings × ${ALL_PAIRINGS.length - 1} opponents × ${gamesPerDir} games = ${totalGames} total`);
console.log('(4 mono + 4 friendly pairings, bridge cards enforced, resonance tracked)');
console.log('Running...\n');

const allResults = [];
let globalGameId = 0;
let matchupsDone = 0;

for (const [p1Pairing, p2Pairing] of MATCHUP_PAIRS) {
  const matchup = runMatchup(p1Pairing, p2Pairing, gamesPerDir, globalGameId, depth, deckMode);
  allResults.push(matchup);
  globalGameId += gamesPerDir;
  matchupsDone++;

  if (matchupsDone % 12 === 0 || matchupsDone === totalMatchups) {
    const pct = ((matchupsDone / totalMatchups) * 100).toFixed(0);
    process.stdout.write(`\r  Progress: ${matchupsDone}/${totalMatchups} matchups (${pct}%)`);
  }
}
console.log();

// ── Compute analysis ──────────────────────────────────────────────────────────

const cardAnalysis = computePairingCardAnalysis(allResults);
const topCards     = computeTopCardsPerPairing(allResults);
const report       = buildReport(allResults, { games: gamesPerDir, mode: deckMode, depth });

printReport(report, topCards);

// ── Save results ──────────────────────────────────────────────────────────────

mkdirSync('scripts/simulation/memory/results', { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputPath = `scripts/simulation/pairing_matrix_${timestamp}.json`;
const memoryPath = `scripts/simulation/memory/results/pairing-matrix-${timestamp.slice(0, 10)}.md`;

// Thin results (strip per-game card arrays to save space, keep resonance)
const thinResults = allResults.map(m => ({
  ...m,
  results: m.results.map(g => ({
    gameId:           g.gameId,
    p1PairingId:      g.p1PairingId,
    p2PairingId:      g.p2PairingId,
    winner:           g.winner,
    turns:            g.turns,
    p1FinalHP:        g.p1FinalHP,
    p2FinalHP:        g.p2FinalHP,
    p1ResonanceScore: g.p1ResonanceScore,
    p1ResonanceTier:  g.p1ResonanceTier,
    p2ResonanceScore: g.p2ResonanceScore,
    p2ResonanceTier:  g.p2ResonanceTier,
  })),
}));

writeFileSync(outputPath, JSON.stringify({ report, cardAnalysis, matchups: thinResults }, null, 2));
console.log(`Results saved to: ${outputPath}`);

// Write memory report
const memLines = [
  `# Pairing Matrix — ${timestamp.slice(0, 10)}`,
  '',
  `## Parameters`,
  `- Games: ${gamesPerDir} per matchup direction × ${totalMatchups} = ${totalGames} total`,
  `- Deck mode: ${deckMode}`,
  `- AI: minimax depth ${depth}`,
  '',
  `## Overall Statistics`,
  `- Overall draw rate: **${(report.meta.overallDrawRate * 100).toFixed(1)}%**`,
  `- P1 win: ${(report.meta.overallP1WinRate * 100).toFixed(1)}% | P2 win: ${(report.meta.overallP2WinRate * 100).toFixed(1)}% | Draw: ${(report.meta.overallDrawRate * 100).toFixed(1)}%`,
  '',
  `## Win Rate Matrix`,
  '',
  '| P1 Pairing | P2 Pairing | P1 Win | P2 Win | Draw | Avg Turns |',
  '|------------|------------|--------|--------|------|-----------|',
  ...report.matchups.map(r =>
    `| ${r.p1PairingId} | ${r.p2PairingId} | ${(r.p1WinRate * 100).toFixed(1)}% | ${(r.p2WinRate * 100).toFixed(1)}% | ${(r.drawRate * 100).toFixed(1)}% | ${r.avgTurns.toFixed(1)} |`
  ),
  '',
  `## Flags`,
  ...(report.flags.length > 0 ? report.flags.map(f => `- ${f}`) : ['- None']),
  '',
  `## Top 5 Cards per Pairing`,
  ...ALL_PAIRINGS.flatMap(p => {
    const cards = topCards[p.id];
    if (!cards || cards.length === 0) return [];
    return [
      '',
      `### ${p.label}`,
      ...cards.map(c => `${c.cardId}: ${(c.winRateWith * 100).toFixed(1)}% win rate (n=${c.gamesWithCard})`),
    ];
  }),
];

writeFileSync(memoryPath, memLines.join('\n'));
console.log(`Memory report saved to: ${memoryPath}`);
