/**
 * runThroneValidation.js
 *
 * Targeted throne-anchor validation test. Runs 20 games (10 Mystic vs Light,
 * 10 Light vs Primal) and reports per-game throne occupancy stats for each AI.
 *
 * Reports per game:
 *   - Which turn the AI champion first reached the Throne
 *   - Max consecutive turns on Throne
 *   - Whether the AI voluntarily left the Throne (excluding game-ending moves)
 *
 * Usage:
 *   node runThroneValidation.js [--depth 2]
 */

import { createGame, applyAction, isGameOver, getLegalActions } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';

const THRONE_ROW = 2;
const THRONE_COL = 2;
const MAX_TURNS          = 30;   // match runSimulation.js
const MAX_ACTIONS_GAME   = 500;  // match runSimulation.js — guards against infinite loops
const MAX_ACTIONS_PER_TURN = 80; // match runSimulation.js — per-turn safety cap

function parseArgs(argv) {
  const args = { depth: 2 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--depth') args.depth = parseInt(argv[++i], 10);
  }
  return args;
}

/**
 * Run a single game and return throne stats for each player.
 * Mirrors runSimulation.js safety limits to prevent infinite loops.
 * Additionally tracks champion throne occupancy per turn.
 *
 * Throne stats are sampled at each endTurn transition: when a player ends
 * their turn, we record whether their champion was on the Throne that turn.
 *
 * @returns {{ p1: ThroneStats, p2: ThroneStats, winner, turns }}
 */
function runGame(p1Deck, p2Deck, depth) {
  let state = createGame(p1Deck, p2Deck);

  // Per-player throne tracking (indexed by activePlayer: 0=p1, 1=p2)
  const stats = [
    { firstTurn: null, consecutiveNow: 0, maxConsecutive: 0, leftVoluntarily: false },
    { firstTurn: null, consecutiveNow: 0, maxConsecutive: 0, leftVoluntarily: false },
  ];

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
      console.warn(`[WARNING] Game hit ${MAX_ACTIONS_GAME}-action limit — forcing draw.`);
      forceDraw = true;
      break;
    }

    const ap = state.activePlayer;

    // Sample throne status BEFORE the action: this represents the position
    // the champion held at the start of this action.
    const champ = state.champions[ap];
    const onThrone = champ.row === THRONE_ROW && champ.col === THRONE_COL;

    // Force endTurn if per-turn action cap exceeded (mirrors runSimulation.js)
    let action;
    if (actionsThisTurn >= MAX_ACTIONS_PER_TURN) {
      action = { type: 'endTurn' };
    } else {
      action = chooseActionMinimax(state, commandsUsed, { depth });
    }

    state = applyAction(state, action);
    actionCount++;

    if (action.type === 'endTurn') {
      // Snapshot throne status at end of this player's turn
      const s = stats[ap];
      if (onThrone) {
        if (s.firstTurn === null) s.firstTurn = turnCount;
        s.consecutiveNow++;
        if (s.consecutiveNow > s.maxConsecutive) s.maxConsecutive = s.consecutiveNow;
      } else {
        if (s.consecutiveNow > 0) {
          // Was on throne last turn, now isn't — voluntarily left
          s.leftVoluntarily = true;
        }
        s.consecutiveNow = 0;
      }

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
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const matchups = [
    { label: 'Mystic vs Light', p1: 'elf', p2: 'human', n: 10 },
    { label: 'Light vs Primal', p1: 'human', p2: 'beast', n: 10 },
  ];

  console.log(`\n=== Throne Anchor Validation — depth=${args.depth} ===\n`);

  let totalGames = 0;
  let thronByT3  = 0;  // player-slots where champion reached throne by turn 4 (earliest possible with SPD 1)
  let stay5plus  = 0;  // player-slots where champion stayed 5+ consecutive turns

  for (const matchup of matchups) {
    console.log(`--- ${matchup.label} (${matchup.n} games) ---`);
    console.log(
      'Game | P1 firstT | P1 maxConsc | P1 left? | P2 firstT | P2 maxConsc | P2 left? | Winner | Turns'
    );
    console.log('-'.repeat(100));

    for (let g = 0; g < matchup.n; g++) {
      const result = runGame(matchup.p1, matchup.p2, args.depth);
      const p1 = result.p1;
      const p2 = result.p2;

      const p1ft  = p1.firstTurn ?? '-';
      const p2ft  = p2.firstTurn ?? '-';

      console.log(
        `  ${String(g + 1).padStart(2)} | ` +
        `${String(p1ft).padStart(9)} | ` +
        `${String(p1.maxConsecutive).padStart(11)} | ` +
        `${(p1.leftVoluntarily ? 'YES' : 'no').padEnd(8)} | ` +
        `${String(p2ft).padStart(9)} | ` +
        `${String(p2.maxConsecutive).padStart(11)} | ` +
        `${(p2.leftVoluntarily ? 'YES' : 'no').padEnd(8)} | ` +
        `${(result.winner ?? 'draw').padEnd(6)} | ${result.turns}`
      );

      totalGames++;
      for (const st of [p1, p2]) {
        if (st.firstTurn !== null && st.firstTurn <= 4) thronByT3++;
        if (st.maxConsecutive >= 5) stay5plus++;
      }
    }
    console.log('');
  }

  const totalSlots = totalGames * 2;
  const pct3 = ((thronByT3 / totalSlots) * 100).toFixed(1);
  const pct5 = ((stay5plus / totalSlots) * 100).toFixed(1);

  console.log('=== Summary ===');
  console.log(`Total games: ${totalGames} (${totalSlots} player slots)`);
  console.log(`Throne by turn 4:        ${thronByT3}/${totalSlots} = ${pct3}%  (gate: >70%)`);
  console.log(`Stayed 5+ consec turns:  ${stay5plus}/${totalSlots} = ${pct5}%  (gate: >50%)`);
  console.log('');

  if (parseFloat(pct3) > 70 && parseFloat(pct5) > 50) {
    console.log('✓ VALIDATION PASSED — proceed to full 1200-game matrix');
  } else {
    console.log('✗ VALIDATION FAILED — thresholds not met, do not run full matrix');
    console.log(`  → Throne by t4: ${pct3}% (need >70%), Stay 5+: ${pct5}% (need >50%)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
