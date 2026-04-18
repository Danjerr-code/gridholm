/**
 * runThroneTest.js
 *
 * Targeted validation for board centrality eval changes.
 * Runs 20 games (10 Human vs Beast, 10 Mystic vs Demon) with minimax AI
 * and reports throne control at turn 5, turn 10, and game end.
 *
 * Usage:
 *   node scripts/simulation/runThroneTest.js
 */

import { createGame, applyAction, isGameOver } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';

const THRONE_ROW = 2;
const THRONE_COL = 2;

const MATCHUPS = [
  { p1: 'human', p2: 'beast', label: 'Human vs Beast' },
  { p1: 'elf',   p2: 'demon', label: 'Mystic vs Demon' },
];

const GAMES_PER_MATCHUP = 10;
const MAX_TURNS = 25;
const MAX_ACTIONS_GAME = 300;
const MAX_ACTIONS_PER_TURN = 80;
const MINIMAX_DEPTH = 2;

/**
 * Returns which player controls the Throne at a given state.
 * 'p1' if p1 champion or p1 unit is on throne, 'p2' if p2, 'none' otherwise.
 * If both, return 'both' (shouldn't happen but guard it).
 */
function throneController(state) {
  const p1OnThrone =
    (state.champions[0].row === THRONE_ROW && state.champions[0].col === THRONE_COL) ||
    state.units.some(u => u.owner === 0 && u.row === THRONE_ROW && u.col === THRONE_COL);
  const p2OnThrone =
    (state.champions[1].row === THRONE_ROW && state.champions[1].col === THRONE_COL) ||
    state.units.some(u => u.owner === 1 && u.row === THRONE_ROW && u.col === THRONE_COL);

  if (p1OnThrone && p2OnThrone) return 'both';
  if (p1OnThrone) return 'p1';
  if (p2OnThrone) return 'p2';
  return 'none';
}

function runGameWithThroneTracking(gameId, p1Deck, p2Deck) {
  let state = createGame(p1Deck, p2Deck);
  let turnCount = 0;
  let actionCount = 0;
  let actionsThisTurn = 0;
  let forceDraw = false;

  const snapshots = { t5: null, t10: null };

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) {
      forceDraw = true;
      break;
    }

    const action = chooseActionMinimax(state, actionsThisTurn, { depth: MINIMAX_DEPTH });
    const beforeTurn = turnCount;
    state = applyAction(state, action);
    actionCount++;

    if (action.type === 'endTurn') {
      turnCount++;
      actionsThisTurn = 0;
      // Capture snapshot at end of turn 5 and turn 10
      if (turnCount === 5)  snapshots.t5  = throneController(state);
      if (turnCount === 10) snapshots.t10 = throneController(state);
    } else {
      actionsThisTurn++;
    }
  }

  const result = forceDraw ? { over: false } : isGameOver(state);
  const winner = (!forceDraw && result.over) ? result.winner : null;

  return {
    gameId,
    p1Deck,
    p2Deck,
    winner,
    turns: turnCount,
    p1FinalHP: state.champions[0]?.hp ?? 0,
    p2FinalHP: state.champions[1]?.hp ?? 0,
    throneAt5:   snapshots.t5  ?? throneController(state),
    throneAt10:  snapshots.t10 ?? throneController(state),
    throneAtEnd: throneController(state),
    forceDraw,
  };
}

// ── Run all matchups ─────────────────────────────────────────────────────────

let allResults = [];

for (const { p1, p2, label } of MATCHUPS) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Matchup: ${label} (${GAMES_PER_MATCHUP} games)`);
  console.log('='.repeat(60));

  const results = [];
  for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
    const r = runGameWithThroneTracking(`${label}-g${g + 1}`, p1, p2);
    results.push(r);
    const winnerLabel = r.winner ? r.winner : 'draw';
    console.log(
      `  G${String(g + 1).padStart(2)}: ${winnerLabel.padEnd(4)} | ` +
      `turns=${String(r.turns).padStart(2)} | ` +
      `throne@t5=${r.throneAt5.padEnd(4)} ` +
      `throne@t10=${r.throneAt10.padEnd(4)} ` +
      `throne@end=${r.throneAtEnd}`
    );
  }

  allResults = allResults.concat(results);

  const draws  = results.filter(r => !r.winner).length;
  const p1Wins = results.filter(r => r.winner === 'p1').length;
  const p2Wins = results.filter(r => r.winner === 'p2').length;
  const avgTurns = (results.reduce((s, r) => s + r.turns, 0) / results.length).toFixed(1);
  const dr = ((draws / results.length) * 100).toFixed(1);

  // Throne at turn 5: how often did p1 (first player) control it?
  const t5P1Control  = results.filter(r => r.throneAt5 === 'p1').length;
  const t5P2Control  = results.filter(r => r.throneAt5 === 'p2').length;
  const t5NoControl  = results.filter(r => r.throneAt5 === 'none').length;
  const t10P1Control = results.filter(r => r.throneAt10 === 'p1').length;
  const t10P2Control = results.filter(r => r.throneAt10 === 'p2').length;

  console.log(`\n  Summary:`);
  console.log(`    DR: ${dr}%  |  p1 wins: ${p1Wins}  p2 wins: ${p2Wins}  draws: ${draws}`);
  console.log(`    Avg turns: ${avgTurns}`);
  console.log(`    Throne @ t5:  p1=${t5P1Control} p2=${t5P2Control} none=${t5NoControl}`);
  console.log(`    Throne @ t10: p1=${t10P1Control} p2=${t10P2Control}`);
}

// ── Aggregate across matchups ─────────────────────────────────────────────────

const totalGames  = allResults.length;
const totalDraws  = allResults.filter(r => !r.winner).length;
const overallDR   = ((totalDraws / totalGames) * 100).toFixed(1);
const anyT5Control = allResults.filter(r => r.throneAt5 !== 'none').length;

console.log(`\n${'='.repeat(60)}`);
console.log('Overall (20 games)');
console.log('='.repeat(60));
console.log(`  Overall DR: ${overallDR}%`);
console.log(`  Games where Throne was controlled by turn 5: ${anyT5Control}/${totalGames} (${((anyT5Control/totalGames)*100).toFixed(1)}%)`);

const p1T5 = allResults.filter(r => r.throneAt5 === 'p1').length;
const p2T5 = allResults.filter(r => r.throneAt5 === 'p2').length;
console.log(`    P1 controlled Throne at turn 5: ${p1T5}/${totalGames}`);
console.log(`    P2 controlled Throne at turn 5: ${p2T5}/${totalGames}`);

if (anyT5Control / totalGames > 0.5) {
  console.log('\n  GATE PASSED: Throne controlled by turn 5 in >50% of games.');
  console.log('  → Proceed to full 1200-game matrix.');
} else {
  console.log('\n  GATE NOT PASSED: Throne controlled in ≤50% of games by turn 5.');
  console.log('  → Consider raising boardCentrality to 6 and throneControlValue to 35.');
}
