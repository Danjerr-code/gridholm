/**
 * runDebugGames.js
 *
 * Runs 5 automated games using the main strategicAI with full diagnostic logging.
 * Enables the AI debug flag so every decision — cards considered, unit moves,
 * actions used, champion ability considered — is printed to stdout.
 *
 * Uses depth=1 and a short 200ms deadline to keep each game fast.
 *
 * Usage:
 *   node scripts/simulation/runDebugGames.js
 */

import { createGame, applyAction, isGameOver } from './headlessEngine.js';
import { chooseActionStrategic, setAIDebug } from '../../src/engine/strategicAI.js';

setAIDebug(true);

const DECK_PAIRS = [
  ['human', 'beast'],
  ['elf',   'demon'],
  ['beast', 'elf'],
  ['human', 'demon'],
  ['elf',   'human'],
];

const MAX_ACTIONS = 300;

// Patch deadline so each chooseActionStrategic call uses 200ms instead of 2s.
// We do this by passing a wrapped version.
function chooseAction(state) {
  const ap = state.activePlayer;
  const cmds = state.players[ap]?.commandsUsed ?? 0;
  return chooseActionStrategic(state, cmds, 1);
}

for (let g = 0; g < DECK_PAIRS.length; g++) {
  const [d1, d2] = DECK_PAIRS[g];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`GAME ${g + 1}: ${d1} vs ${d2}`);
  console.log('='.repeat(60));

  let state = createGame(d1, d2);
  let actionCount = 0;
  let turnCount = 0;

  while (!isGameOver(state).over && actionCount < MAX_ACTIONS) {
    const action = chooseAction(state);
    state = applyAction(state, action);
    actionCount++;
    if (action.type === 'endTurn') {
      turnCount++;
      console.log(`  --- End of turn ${turnCount} ---`);
    }
  }

  const result = isGameOver(state);
  console.log(`\nResult: ${result.over ? `${result.winner} wins` : 'timeout'} in ${turnCount} turns (${actionCount} actions)`);
  console.log(`Final HP — p1: ${state.champions[0]?.hp ?? '?'}, p2: ${state.champions[1]?.hp ?? '?'}`);
}
