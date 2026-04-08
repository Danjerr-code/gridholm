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
 */

import { writeFileSync } from 'fs';
import { createGame, applyAction, isGameOver, getGameStats, getLegalActions } from './headlessEngine.js';
import { chooseAction } from './simAI.js';

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { p1: 'human', p2: 'beast', games: 100, output: 'results.json' };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--p1':     args.p1     = argv[++i]; break;
      case '--p2':     args.p2     = argv[++i]; break;
      case '--games':  args.games  = parseInt(argv[++i], 10); break;
      case '--output': args.output = argv[++i]; break;
    }
  }
  return args;
}

// ── Single game runner ────────────────────────────────────────────────────────

const MAX_TURNS = 50;
const MAX_ACTIONS_PER_GAME = 500;

/**
 * Runs one game between p1Deck and p2Deck.
 * Returns a result object with winner, turns, HP, and cards played.
 */
function runGame(gameId, p1Deck, p2Deck) {
  let state = createGame(p1Deck, p2Deck);
  let turnCount = 0;
  let actionCount = 0;
  let commandsUsedThisTurn = 0;
  let forceDraw = false;

  const cardsPlayed = { p1: [], p2: [] };

  while (true) {
    const { over, winner } = isGameOver(state);
    if (over) break;

    if (turnCount >= MAX_TURNS) break;

    if (actionCount >= MAX_ACTIONS_PER_GAME) {
      console.warn(`[WARNING] Game ${gameId} hit ${MAX_ACTIONS_PER_GAME}-action limit — forcing draw.`);
      forceDraw = true;
      break;
    }

    const action = chooseAction(state, commandsUsedThisTurn);

    // Track cards played before applying the action
    if (action.type === 'summon' || action.type === 'cast') {
      const ap = state.activePlayer;
      const card = state.players[ap].hand.find(c => c.uid === action.cardUid);
      if (card) {
        const playerKey = ap === 0 ? 'p1' : 'p2';
        cardsPlayed[playerKey].push(card.id);
      }
    }

    state = applyAction(state, action);
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

  let resolvedWinner = null;
  if (!forceDraw) {
    const result = isGameOver(state);
    resolvedWinner = result.over ? result.winner : null;
  }

  return {
    gameId,
    p1Deck,
    p2Deck,
    winner: resolvedWinner,
    turns: turnCount,
    p1FinalHP,
    p2FinalHP,
    cardsPlayed,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);
const { p1: p1Deck, p2: p2Deck, games: totalGames, output } = args;

console.log(`Running ${totalGames} game(s): ${p1Deck} vs ${p2Deck}`);

const results = [];
let p1Wins = 0;
let p2Wins = 0;
let draws = 0;
let totalTurns = 0;
let winnerHPSum = 0;
let winnerHPCount = 0;

for (let i = 0; i < totalGames; i++) {
  const result = runGame(i + 1, p1Deck, p2Deck);
  results.push(result);

  if (result.winner === 'p1') {
    p1Wins++;
    winnerHPSum += result.p1FinalHP;
    winnerHPCount++;
  } else if (result.winner === 'p2') {
    p2Wins++;
    winnerHPSum += result.p2FinalHP;
    winnerHPCount++;
  } else {
    draws++;
  }
  totalTurns += result.turns;

  if ((i + 1) % 100 === 0 || i + 1 === totalGames) {
    process.stdout.write(`  Progress: ${i + 1}/${totalGames}\r`);
  }
}

console.log('');

writeFileSync(output, JSON.stringify(results, null, 2));
console.log(`Results written to ${output}`);

const avgTurns = totalGames > 0 ? (totalTurns / totalGames).toFixed(2) : 0;
const avgWinnerHP = winnerHPCount > 0 ? (winnerHPSum / winnerHPCount).toFixed(2) : 'N/A';

console.log('\n── Simulation Summary ──────────────────────');
console.log(`  Total games  : ${totalGames}`);
console.log(`  P1 wins      : ${p1Wins} (${((p1Wins / totalGames) * 100).toFixed(1)}%)`);
console.log(`  P2 wins      : ${p2Wins} (${((p2Wins / totalGames) * 100).toFixed(1)}%)`);
console.log(`  Draws        : ${draws} (${((draws / totalGames) * 100).toFixed(1)}%)`);
console.log(`  Avg turns    : ${avgTurns}`);
console.log(`  Avg winner HP: ${avgWinnerHP}`);
console.log('────────────────────────────────────────────');
