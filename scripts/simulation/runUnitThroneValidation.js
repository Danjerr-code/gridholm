/**
 * runUnitThroneValidation.js
 *
 * Targeted validation for throne unit occupation value (LOG-1499).
 * Runs 20 games (10 Human vs Beast, 10 Mystic vs Dark) and reports
 * per-game throne occupancy stats focused on UNIT (not champion) occupation.
 *
 * Reports per game:
 *   - Turn that any friendly piece (unit OR champion) first occupied the Throne for each player
 *   - Whether the Throne was contested (changed hands at least once)
 *   - Total turns each player had a UNIT (not champion) on the Throne
 *
 * Gate condition: AI uses units on Throne in ≥50% of games → change is working.
 *
 * Usage:
 *   node runUnitThroneValidation.js [--depth 2]
 */

import { createGame, applyAction, isGameOver, getLegalActions } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';

const THRONE_ROW = 2;
const THRONE_COL = 2;
const MAX_TURNS            = 30;
const MAX_ACTIONS_GAME     = 500;
const MAX_ACTIONS_PER_TURN = 80;

function parseArgs(argv) {
  const args = { depth: 2 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--depth') args.depth = parseInt(argv[++i], 10);
  }
  return args;
}

/**
 * Run a single game and return throne stats for each player.
 *
 * Per-player stats:
 *   firstPieceTurn:  turn any piece (unit or champion) first occupied Throne
 *   unitTurnCount:   total turns a UNIT (not champion) was on Throne at end-of-turn
 *   contested:       whether Throne changed hands at least once
 *
 * @returns {{ p1: Stats, p2: Stats, winner, turns }}
 */
function runGame(p1Deck, p2Deck, depth) {
  let state = createGame(p1Deck, p2Deck);

  // Per-player stats (indexed by owner: 0=p1, 1=p2)
  const stats = [
    { firstPieceTurn: null, unitTurnCount: 0 },
    { firstPieceTurn: null, unitTurnCount: 0 },
  ];

  // Track throne control across the game for contested detection
  let lastThroneOwner = null;  // 0, 1, or null
  let contested       = false;

  let turnCount        = 0;
  let actionCount      = 0;
  let commandsUsed     = 0;
  let actionsThisTurn  = 0;
  let forceDraw        = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) {
      forceDraw = true;
      break;
    }

    const ap = state.activePlayer;

    let action;
    if (actionsThisTurn >= MAX_ACTIONS_PER_TURN) {
      action = { type: 'endTurn' };
    } else {
      action = chooseActionMinimax(state, commandsUsed, { depth });
    }

    state = applyAction(state, action);
    actionCount++;

    if (action.type === 'endTurn') {
      // Snapshot throne state at end of this player's turn
      for (let pi = 0; pi < 2; pi++) {
        const champ = state.champions[pi];
        const units = state.units.filter(u => u.owner === pi);

        const champOnThrone = champ.row === THRONE_ROW && champ.col === THRONE_COL;
        const unitOnThrone  = units.some(u => u.row === THRONE_ROW && u.col === THRONE_COL);
        const pieceOnThrone = champOnThrone || unitOnThrone;

        if (pieceOnThrone && stats[pi].firstPieceTurn === null) {
          stats[pi].firstPieceTurn = turnCount;
        }

        if (unitOnThrone) {
          stats[pi].unitTurnCount++;
        }
      }

      // Track contested: did Throne change hands?
      const p0Throne = (state.champions[0].row === THRONE_ROW && state.champions[0].col === THRONE_COL) ||
        state.units.some(u => u.owner === 0 && u.row === THRONE_ROW && u.col === THRONE_COL);
      const p1Throne = (state.champions[1].row === THRONE_ROW && state.champions[1].col === THRONE_COL) ||
        state.units.some(u => u.owner === 1 && u.row === THRONE_ROW && u.col === THRONE_COL);

      const currentOwner = p0Throne ? 0 : (p1Throne ? 1 : null);
      if (lastThroneOwner !== null && currentOwner !== null && currentOwner !== lastThroneOwner) {
        contested = true;
      }
      if (currentOwner !== null) lastThroneOwner = currentOwner;

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
    p1: stats[0],
    p2: stats[1],
    winner: (!forceDraw && over) ? winner : 'draw',
    turns: turnCount,
    contested,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const matchups = [
    { label: 'Human vs Beast',  p1: 'human', p2: 'beast', n: 10 },
    { label: 'Mystic vs Dark',  p1: 'elf',   p2: 'demon', n: 10 },
  ];

  console.log(`\n=== Unit Throne Occupation Validation — depth=${args.depth} ===\n`);

  let totalGames       = 0;
  let gamesWithUnitOnThrone = 0;  // games where at least one player had a unit on throne ≥1 turn

  for (const matchup of matchups) {
    console.log(`--- ${matchup.label} (${matchup.n} games) ---`);
    console.log(
      'Game | P1 firstT | P1 unitTurns | P2 firstT | P2 unitTurns | Contested | Winner | Turns'
    );
    console.log('-'.repeat(95));

    for (let g = 0; g < matchup.n; g++) {
      const result = runGame(matchup.p1, matchup.p2, args.depth);
      const p1 = result.p1;
      const p2 = result.p2;

      const p1ft = p1.firstPieceTurn ?? '-';
      const p2ft = p2.firstPieceTurn ?? '-';

      console.log(
        `  ${String(g + 1).padStart(2)} | ` +
        `${String(p1ft).padStart(9)} | ` +
        `${String(p1.unitTurnCount).padStart(12)} | ` +
        `${String(p2ft).padStart(9)} | ` +
        `${String(p2.unitTurnCount).padStart(12)} | ` +
        `${(result.contested ? 'YES' : 'no').padEnd(9)} | ` +
        `${(result.winner ?? 'draw').padEnd(6)} | ${result.turns}`
      );

      totalGames++;
      if (p1.unitTurnCount > 0 || p2.unitTurnCount > 0) {
        gamesWithUnitOnThrone++;
      }
    }
    console.log('');
  }

  const unitPct = ((gamesWithUnitOnThrone / totalGames) * 100).toFixed(1);

  console.log('=== Summary ===');
  console.log(`Total games: ${totalGames}`);
  console.log(`Games with any unit on Throne ≥1 turn: ${gamesWithUnitOnThrone}/${totalGames} = ${unitPct}%  (gate: ≥50%)`);
  console.log('');

  if (parseFloat(unitPct) >= 50) {
    console.log('✓ GATE PASSED — AI using units on Throne in ≥50% of games. Proceed to full 1200-game matrix.');
  } else {
    console.log('✗ GATE NOT MET — Units on Throne in <50% of games.');
    console.log('  → Issue is search visibility, not eval weight. Report avg depth and throne turn stats.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
