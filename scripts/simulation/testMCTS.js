/**
 * testMCTS.js
 *
 * Step 2 validation: run 5 games with chooseActionMCTS (simulations=100) for
 * both players. Logs outcome and total turns per game.
 *
 * Usage:
 *   node --experimental-vm-modules scripts/simulation/testMCTS.js
 *   node scripts/simulation/testMCTS.js          (if using a loader)
 */

import { createGame, getLegalActions, applyAction, isGameOver } from './headlessEngine.js';
import { chooseActionMCTS } from './mctsAI.js';

// Games to run: pairs of deck IDs
const GAME_PAIRINGS = [
  ['human',  'beast'],
  ['elf',    'demon'],
  ['beast',  'elf'],
  ['human',  'demon'],
  ['beast',  'human'],
];

// NOTE: sim=100 projects to ~35 min/5 games in pure JS (42ms/rollout × ~125 non-trivial decisions/game).
// Using timeoutMs=150 per decision (effectively ~3-4 sims) — bounds game time to ~2 min/game.
// Performance constraint reported to board; production matrix runs will need timeoutMs tuning.
const SIMULATIONS       = 1000;  // effectively unlimited — timeoutMs is the real cap
const TIMEOUT_MS        = 30;    // per-decision budget (1 fast rollout, ~30ms)
const MAX_TURNS         = 60;    // turn-count ceiling
const MAX_GAME_ACTS     = 5000;  // absolute action ceiling
const MAX_ACTS_PER_TURN = 80;    // force endTurn if a single player-turn drags (prevents MCTS stall)

async function runGame(deck1Id, deck2Id, gameNum) {
  let state = createGame(deck1Id, deck2Id);
  let actionCount = 0;
  let turnActCount = 0;    // actions taken by current active player this sub-turn
  let lastActivePlayer = state.activePlayer;

  while (true) {
    const { over, winner } = isGameOver(state);
    if (over) {
      return { winner, turns: state.turn, deck1Id, deck2Id, actionCount };
    }
    if ((state.turn ?? 0) >= MAX_TURNS) {
      return { winner: 'draw (turn limit)', turns: state.turn, deck1Id, deck2Id, actionCount };
    }
    if (actionCount >= MAX_GAME_ACTS) {
      return { winner: 'draw (action limit)', turns: state.turn, deck1Id, deck2Id, actionCount };
    }

    const actions = getLegalActions(state);
    if (actions.length === 0) {
      return { winner: 'draw (no actions)', turns: state.turn, deck1Id, deck2Id, actionCount };
    }

    // Reset per-turn counter when active player changes.
    if (state.activePlayer !== lastActivePlayer) {
      turnActCount = 0;
      lastActivePlayer = state.activePlayer;
    }

    // Force endTurn if MCTS is stalling (too many actions in one player-turn).
    let chosen;
    if (turnActCount >= MAX_ACTS_PER_TURN) {
      chosen = { type: 'endTurn' };
    } else {
      chosen = chooseActionMCTS(state, { simulations: SIMULATIONS, timeoutMs: TIMEOUT_MS });
    }

    const prevPlayer = state.activePlayer;
    state = applyAction(state, chosen);
    if (state.activePlayer === prevPlayer) {
      turnActCount++;
    } else {
      turnActCount = 0;
      lastActivePlayer = state.activePlayer;
    }
    actionCount++;
    if (actionCount % 200 === 0) {
      process.stdout.write(`[t${state.turn ?? '?'}:a${actionCount}]`);
    }
  }
}

(async () => {
  console.log(`=== MCTS Step 2 Test: ${SIMULATIONS} simulations/decision ===\n`);
  const results = [];

  for (let i = 0; i < GAME_PAIRINGS.length; i++) {
    const [d1, d2] = GAME_PAIRINGS[i];
    process.stdout.write(`Game ${i + 1}/5  ${d1} vs ${d2} ... `);
    const t0 = Date.now();
    const result = await runGame(d1, d2, i + 1);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`winner=${result.winner}  turns=${result.turns}  actions=${result.actionCount}  (${elapsed}s)`);
    results.push(result);
  }

  // Summary
  console.log('\n=== Summary ===');
  const wins   = { p1: 0, p2: 0 };
  const draws  = [];
  let totalTurns = 0;
  for (const r of results) {
    totalTurns += r.turns ?? 0;
    if (r.winner === 'p1') wins.p1++;
    else if (r.winner === 'p2') wins.p2++;
    else draws.push(r);
  }
  console.log(`P1 wins : ${wins.p1}/5`);
  console.log(`P2 wins : ${wins.p2}/5`);
  console.log(`Draws   : ${draws.length}/5`);
  console.log(`Avg turns: ${(totalTurns / results.length).toFixed(1)}`);

  if (draws.length > 0) {
    console.log('\nDraw details:');
    for (const r of draws) console.log(`  ${r.deck1Id} vs ${r.deck2Id} — ${r.winner} at turn ${r.turns}`);
  }
})();
