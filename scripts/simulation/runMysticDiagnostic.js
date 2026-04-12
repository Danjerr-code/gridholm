/**
 * runMysticDiagnostic.js
 *
 * Diagnostic: run the hand-picked Mystic control deck against
 * curve-built decks of all other pairings at 50 games per matchup.
 *
 * Purpose: determine whether the Mystic weight profile works when the
 * deck quality is correct, i.e. isolate deck builder vs. eval weight as
 * the cause of Mystic's low win rate.
 *
 * Usage:
 *   node scripts/simulation/runMysticDiagnostic.js [--games 50] [--depth 2]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { createPairingGame, applyAction, isGameOver, getLegalActions } from './pairingGameEngine.js';
import { buildDeck, ALL_PAIRINGS, CHAMPION_TO_DECKID } from './deckBuilder.js';
import { chooseActionMinimax } from './minimaxAI.js';

// ── Hand-picked Mystic control deck ─────────────────────────────────────────

// 30 cards selected by CEO to represent a proper Mystic control strategy.
// Card names mapped to engine IDs:
//   Yggara        → yggara
//   Azulon        → azulonsilvertide
//   Sister Siofra → sistersiofra
//   Fennwick      → fennwickthequiet
//   (all others use straightforward lowercase IDs)
const MYSTIC_HANDPICKED_DECK = [
  'yggara',             // Yggara, Rootmother (cost 8)
  'azulonsilvertide',   // Azulon, Silver Tide (cost 7)
  'sistersiofra',       // Sister Siofra, First Prayer (cost 5)
  'fennwickthequiet',   // Fennwick, the Quiet (cost 2)
  'whisper',            // Whisper (cost 2)
  'elfelder',           // Elf Elder (cost 3)
  'bloom',              // Bloom (cost 3)
  'ancientspring',      // Ancient Spring (cost 3)
  'overgrowth',         // Overgrowth (cost 4)
  'recall',             // Recall (cost 2)
  'canopysentinel',     // Canopy Sentinel (cost 6)
  'cascadesage',        // Cascade Sage (cost 6)
  'petrify',            // Petrify (cost 4)
  'mindseize',          // Mind Seize (cost 7)
  'verdantsurge',       // Verdant Surge (cost 5)
  'amethystcache',      // Amethyst Cache (cost 5)
  'thornweave',         // Thornweave (cost 3)
  'moonveilmystic',     // Moonveil Mystic (cost 4)
  'elfranger',          // Elf Ranger (cost 4)
  'oathrootkeeper',     // Oathroot Keeper (cost 3)
  'duskbloomtender',    // Duskbloom Tender (cost 3)
  'sylvancourier',      // Sylvan Courier (cost 2)
  'verdantarcher',      // Verdant Archer (cost 2)
  'elfscout',           // Elf Scout (cost 1)
  'seedling',           // Seedling (cost 1)
  'grovewarden',        // Grove Warden (cost 4)
  'woodlandguard',      // Woodland Guard (cost 2)
  'moonleaf',           // Moonleaf (cost 2)
  'entangle',           // Entangle (cost 3)
  'grovechampion',      // Grove Champion (cost 5)
];

// ── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { games: 50, depth: 2 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--games': args.games = parseInt(argv[++i], 10); break;
      case '--depth': args.depth = parseInt(argv[++i], 10); break;
    }
  }
  return args;
}

// ── Game loop ─────────────────────────────────────────────────────────────────

const MAX_TURNS        = 30;
const MAX_ACTIONS_GAME = 500;

/**
 * Run a single game.
 * mysticSide: 'p1' or 'p2' — which side uses the hand-picked deck.
 * opponentPairing: the opponent's pairing spec (curve deck built per game).
 */
function runGame(gameId, mysticSide, opponentPairing, depth) {
  const opponentBuild = buildDeck(opponentPairing.champion, opponentPairing.secondary, 'curve',
    { pairingId: opponentPairing.id });
  const opponentCardIds = opponentBuild.cardIds;
  const mysticDeckId = 'elf';
  const opponentDeckId = CHAMPION_TO_DECKID[opponentPairing.champion];

  let state;
  if (mysticSide === 'p1') {
    state = createPairingGame(mysticDeckId, MYSTIC_HANDPICKED_DECK, opponentDeckId, opponentCardIds);
  } else {
    state = createPairingGame(opponentDeckId, opponentCardIds, mysticDeckId, MYSTIC_HANDPICKED_DECK);
  }

  let turnCount = 0;
  let actionCount = 0;
  let commandsUsedThisTurn = 0;
  let forceDraw = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) { forceDraw = true; break; }

    let action;
    try {
      action = chooseActionMinimax(state, commandsUsedThisTurn, { depth });
      state = applyAction(state, action);
    } catch (e) {
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
  const p1FinalHP = finalChamps[0]?.hp ?? 0;
  const p2FinalHP = finalChamps[1]?.hp ?? 0;

  let winner = null;
  if (!forceDraw) {
    const result = isGameOver(state);
    winner = result.over ? result.winner : null;
  }

  return { gameId, mysticSide, opponentPairingId: opponentPairing.id, winner, turns: turnCount, p1FinalHP, p2FinalHP };
}

// ── Matchup runner ────────────────────────────────────────────────────────────

function runMatchup(opponentPairing, gamesPerDir, startGameId, depth) {
  let mysticWins = 0, opponentWins = 0, draws = 0, totalTurns = 0;
  const results = [];

  // Run half as P1, half as P2 (balanced side assignment)
  for (let i = 0; i < gamesPerDir; i++) {
    const mysticSide = i % 2 === 0 ? 'p1' : 'p2';
    const result = runGame(startGameId + i, mysticSide, opponentPairing, depth);
    results.push(result);

    if (result.winner === null) {
      draws++;
    } else if (result.winner === mysticSide) {
      mysticWins++;
    } else {
      opponentWins++;
    }
    totalTurns += result.turns;
  }

  return {
    opponentPairingId: opponentPairing.id,
    gamesRun: gamesPerDir,
    mysticWins,
    opponentWins,
    draws,
    mysticWinRate: +(mysticWins / gamesPerDir).toFixed(4),
    opponentWinRate: +(opponentWins / gamesPerDir).toFixed(4),
    drawRate: +(draws / gamesPerDir).toFixed(4),
    avgTurns: +(totalTurns / gamesPerDir).toFixed(1),
    results,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const { games: gamesPerDir, depth } = parseArgs(process.argv);

// All pairings except mystic mono (mirror match)
const OPPONENTS = ALL_PAIRINGS.filter(p => p.id !== 'mystic');

console.log('\n════════════════════════════════════════════════════════════');
console.log('  MYSTIC HAND-PICKED DECK DIAGNOSTIC');
console.log('════════════════════════════════════════════════════════════');
console.log(`  Hand-picked Mystic deck (${MYSTIC_HANDPICKED_DECK.length} cards) vs curve-built opponents`);
console.log(`  Games per matchup: ${gamesPerDir} (split P1/P2)`);
console.log(`  AI: minimax depth ${depth}`);
console.log(`  Opponents: ${OPPONENTS.length} pairings`);
console.log(`  Total games: ${OPPONENTS.length * gamesPerDir}`);
console.log('Running...\n');

const allResults = [];
let globalGameId = 0;

for (let i = 0; i < OPPONENTS.length; i++) {
  const opponent = OPPONENTS[i];
  const result = runMatchup(opponent, gamesPerDir, globalGameId, depth);
  allResults.push(result);
  globalGameId += gamesPerDir;

  const pct = (((i + 1) / OPPONENTS.length) * 100).toFixed(0);
  process.stdout.write(`\r  Progress: ${i + 1}/${OPPONENTS.length} matchups (${pct}%)`);
}
console.log('\n');

// ── Report ────────────────────────────────────────────────────────────────────

let totalMysticWins = 0, totalOpponentWins = 0, totalDraws = 0, totalGames = 0;
for (const r of allResults) {
  totalMysticWins  += r.mysticWins;
  totalOpponentWins += r.opponentWins;
  totalDraws       += r.draws;
  totalGames       += r.gamesRun;
}

const overallMysticWR  = totalMysticWins / totalGames;
const overallOpponentWR = totalOpponentWins / totalGames;
const overallDrawRate   = totalDraws / totalGames;

console.log('════════════════════════════════════════════════════════════');
console.log('  RESULTS — Mystic (hand-picked) vs Curve Opponents');
console.log('════════════════════════════════════════════════════════════');
console.log(`  Overall Mystic win rate: ${(overallMysticWR * 100).toFixed(1)}%`);
console.log(`  Overall opponent win rate: ${(overallOpponentWR * 100).toFixed(1)}%`);
console.log(`  Overall draw rate: ${(overallDrawRate * 100).toFixed(1)}%`);
console.log(`  Total games: ${totalGames}`);
console.log('');
console.log('  Opponent Pairing            Mystic W%  Opp W%  Draw%  AvgTurns');
console.log('  ─────────────────────────────────────────────────────────────');
for (const r of allResults) {
  const opp  = r.opponentPairingId.padEnd(26);
  const mwr  = (r.mysticWinRate  * 100).toFixed(1).padStart(7);
  const owr  = (r.opponentWinRate * 100).toFixed(1).padStart(6);
  const dr   = (r.drawRate        * 100).toFixed(1).padStart(5);
  const at   = r.avgTurns.toFixed(1).padStart(8);
  console.log(`  ${opp} ${mwr}%  ${owr}%  ${dr}%  ${at}`);
}

// Flags
const flags = [];
for (const r of allResults) {
  if (r.drawRate > 0.30) flags.push(`HIGH DRAW vs ${r.opponentPairingId}: ${(r.drawRate*100).toFixed(1)}%`);
  if (r.mysticWinRate > 0.60) flags.push(`MYSTIC DOMINANT vs ${r.opponentPairingId}: ${(r.mysticWinRate*100).toFixed(1)}%`);
  if (r.opponentWinRate > 0.60) flags.push(`OPPONENT DOMINANT vs ${r.opponentPairingId}: ${(r.opponentWinRate*100).toFixed(1)}%`);
}
if (flags.length > 0) {
  console.log('\n  FLAGS:');
  for (const f of flags) console.log(`  ⚠  ${f}`);
}
console.log('\n════════════════════════════════════════════════════════════\n');

// ── Save results ──────────────────────────────────────────────────────────────

mkdirSync('scripts/simulation/memory/results', { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputPath = `scripts/simulation/mystic_diagnostic_${timestamp}.json`;

const summary = {
  meta: {
    date: new Date().toISOString(),
    description: 'Mystic hand-picked deck vs curve-built opponents',
    deck: MYSTIC_HANDPICKED_DECK,
    gamesPerMatchup: gamesPerDir,
    minimaxDepth: depth,
    totalGames,
    overallMysticWinRate: +overallMysticWR.toFixed(4),
    overallOpponentWinRate: +overallOpponentWR.toFixed(4),
    overallDrawRate: +overallDrawRate.toFixed(4),
  },
  matchups: allResults.map(r => ({
    opponentPairingId: r.opponentPairingId,
    gamesRun: r.gamesRun,
    mysticWinRate: r.mysticWinRate,
    opponentWinRate: r.opponentWinRate,
    drawRate: r.drawRate,
    avgTurns: r.avgTurns,
  })),
  flags,
};

writeFileSync(outputPath, JSON.stringify(summary, null, 2));
console.log(`Results saved to: ${outputPath}`);

// Write memory
const memPath = `scripts/simulation/memory/results/mystic-diagnostic-${timestamp.slice(0,10)}.md`;
const memLines = [
  `# Mystic Diagnostic — ${timestamp.slice(0,10)}`,
  '',
  '## Purpose',
  'Test whether the Mystic weight profile produces correct decisions when paired with',
  'a hand-picked control deck. Isolates deck quality from eval weight quality.',
  '',
  '## Deck',
  MYSTIC_HANDPICKED_DECK.join(', '),
  '',
  `## Parameters`,
  `- Games: ${gamesPerDir} per matchup (split P1/P2)`,
  `- AI: minimax depth ${depth}`,
  '',
  '## Overall',
  `- Mystic win rate: **${(overallMysticWR * 100).toFixed(1)}%**`,
  `- Opponent win rate: ${(overallOpponentWR * 100).toFixed(1)}%`,
  `- Draw rate: ${(overallDrawRate * 100).toFixed(1)}%`,
  '',
  '## Per-Matchup',
  '',
  '| Opponent | Mystic W% | Opp W% | Draw% | Avg Turns |',
  '|----------|-----------|--------|-------|-----------|',
  ...allResults.map(r =>
    `| ${r.opponentPairingId} | ${(r.mysticWinRate*100).toFixed(1)}% | ${(r.opponentWinRate*100).toFixed(1)}% | ${(r.drawRate*100).toFixed(1)}% | ${r.avgTurns} |`
  ),
  '',
  '## Flags',
  ...(flags.length > 0 ? flags.map(f => `- ${f}`) : ['- None']),
];
writeFileSync(memPath, memLines.join('\n'));
console.log(`Memory saved to: ${memPath}`);
