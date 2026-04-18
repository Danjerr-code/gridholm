/**
 * runMysticDarkDiagnostic.js
 *
 * Diagnostic: run N games of Primal (P1) vs Mystic/Dark (P2) with full
 * decision logging on the Mystic/Dark side during turns 15–25.
 *
 * For each Mystic/Dark decision point on turns 15–25, logs:
 *   - All candidate actions (post-filtering, as the minimax considers them)
 *   - The board evaluation score each candidate produces
 *   - The action actually chosen
 *
 * Purpose: understand what Mystic/Dark does (or fails to do) during the late-game
 * closing window — specifically whether it's stalling, retreating, or simply
 * can't find a path to a win.
 *
 * Usage:
 *   node scripts/simulation/runMysticDarkDiagnostic.js [--games 50] [--depth 2]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { createPairingGame, applyAction, isGameOver, getLegalActions } from './pairingGameEngine.js';
import { buildDeck, CHAMPION_TO_DECKID } from './deckBuilder.js';
import { chooseActionMinimax } from './minimaxAI.js';
import { evaluateBoard } from './boardEval.js';
import { manhattan } from '../../src/engine/gameEngine.js';
import { shouldHoldCard, shouldHoldChampionAbility } from './cardHoldLogic.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const THRONE_ROW = 2;
const THRONE_COL = 2;
const LOG_TURN_MIN = 15;
const LOG_TURN_MAX = 25;
const MAX_LOG_CANDIDATES = 8;

// ── CLI args ──────────────────────────────────────────────────────────────────

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

// ── Action description ────────────────────────────────────────────────────────

function describeAction(action, state, apIdx) {
  const ap = apIdx;
  switch (action.type) {
    case 'endTurn': return 'endTurn';
    case 'move': {
      const unit = state.units.find(u => u.uid === action.unitId);
      const [tr, tc] = action.targetTile;
      // Check what's at the target tile
      const enemyIdx = 1 - ap;
      const targetsChamp = state.champions[enemyIdx].row === tr && state.champions[enemyIdx].col === tc;
      const targetsUnit  = state.units.find(u => u.owner === enemyIdx && u.row === tr && u.col === tc);
      const suffix = targetsChamp ? '→ENEMY_CHAMP' : (targetsUnit ? `→kills?${targetsUnit.name}` : '→['+tr+','+tc+']');
      return `move ${unit?.name ?? '?'} ${suffix}`;
    }
    case 'summon': {
      const card = state.players[ap].hand.find(c => c.uid === action.cardUid);
      return `summon ${card?.name ?? action.cardUid} @[${action.targetTile}]`;
    }
    case 'cast': {
      const card = state.players[ap].hand.find(c => c.uid === action.cardUid);
      return `cast ${card?.name ?? action.cardUid}`;
    }
    case 'championMove':
      return `champMove→[${action.row},${action.col}]`;
    case 'championAbility':
      return `champAbility`;
    case 'unitAction': {
      const unit = state.units.find(u => u.uid === action.unitId);
      return `unitAction ${unit?.name ?? '?'}→${action.targetUid}`;
    }
    default:
      return action.type;
  }
}

// ── Candidate scorer ──────────────────────────────────────────────────────────

/**
 * Get the top candidates the AI would consider, scored by board eval after applying each.
 * Mimics the key filtering logic in minimaxAI.filterActions for the logging path.
 */
function scoredCandidates(state, commandsUsed, apIdx) {
  const ap       = apIdx;
  const enemyIdx = 1 - ap;
  const enemyChamp = state.champions[enemyIdx];
  const hand       = state.players[ap].hand;
  const playerId   = ap === 0 ? 'p1' : 'p2';

  let actions = getLegalActions(state);
  if (commandsUsed >= 3) actions = actions.filter(a => a.type !== 'move');

  const unitCards   = hand.filter(c => c.type === 'unit' && c.cost <= state.players[ap].resources);
  const minUnitCost = unitCards.length > 0 ? Math.min(...unitCards.map(c => c.cost ?? 0)) : Infinity;

  const candidates = actions.filter(a => {
    if (a.type === 'endTurn') return false;
    if (a.type === 'move') {
      const unit = state.units.find(u => u.uid === a.unitId);
      if (!unit) return false;
      const [tr, tc] = a.targetTile;
      if (state.units.some(u => u.owner === enemyIdx && u.row === tr && u.col === tc) ||
          (enemyChamp.row === tr && enemyChamp.col === tc)) return true;
      const curDE = manhattan([unit.row, unit.col], [enemyChamp.row, enemyChamp.col]);
      const newDE = manhattan([tr, tc], [enemyChamp.row, enemyChamp.col]);
      const curDT = manhattan([unit.row, unit.col], [THRONE_ROW, THRONE_COL]);
      const newDT = manhattan([tr, tc], [THRONE_ROW, THRONE_COL]);
      return !(newDE > curDE && newDT > curDT);
    }
    if (a.type === 'summon') {
      const card = hand.find(c => c.uid === a.cardUid);
      return card ? card.cost <= 2 * minUnitCost : false;
    }
    return true;
  });

  // Dedup summons
  const seen = new Set();
  const deduped = candidates.filter(a => {
    if (a.type !== 'summon') return true;
    if (seen.has(a.cardUid)) return false;
    seen.add(a.cardUid);
    return true;
  });

  // Classify hold cards
  const isHeld = a => {
    if (a.type === 'championAbility') return shouldHoldChampionAbility(state, ap);
    if (a.type === 'cast' || a.type === 'summon') {
      const card = hand.find(c => c.uid === a.cardUid);
      return card ? shouldHoldCard(card, state, ap) : false;
    }
    return false;
  };

  // Score each candidate by post-action board eval
  const scored = deduped.map(a => {
    let score = null;
    let held  = isHeld(a);
    try {
      const ns = applyAction(state, a);
      score = evaluateBoard(ns, playerId);
    } catch {}
    return { desc: describeAction(a, state, ap), held, score };
  });

  // Baseline: endTurn score
  const baseLine = evaluateBoard(state, playerId);
  scored.push({ desc: 'endTurn', held: false, score: baseLine });

  // Sort descending
  scored.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  return scored.slice(0, MAX_LOG_CANDIDATES);
}

// ── Game loop ─────────────────────────────────────────────────────────────────

const MAX_TURNS        = 25;
const MAX_ACTIONS_GAME = 300;

function runGame(gameId, depth) {
  // Build decks using attribute keys as champion identifiers
  const p1Build = buildDeck('primal', null,   'curve', { pairingId: 'primal' });
  const p2Build = buildDeck('mystic', 'dark',  'curve', { pairingId: 'mystic_dark' });

  const p1DeckId = CHAMPION_TO_DECKID['primal']; // 'beast'
  const p2DeckId = CHAMPION_TO_DECKID['mystic']; // 'elf'

  let state = createPairingGame(p1DeckId, p1Build.cardIds, p2DeckId, p2Build.cardIds);

  const decisionLog = [];
  let turnCount = 0;
  let actionCount = 0;
  let commandsUsedThisTurn = 0;
  let forceDraw = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) { forceDraw = true; break; }

    const ap          = state.activePlayer;
    const isMD        = ap === 1; // Mystic/Dark is always P2
    const isLogTurn   = isMD && turnCount >= LOG_TURN_MIN && turnCount <= LOG_TURN_MAX;

    // Capture candidates BEFORE choosing (state is still pre-action)
    let candidates = null;
    if (isLogTurn) {
      candidates = scoredCandidates(state, commandsUsedThisTurn, ap);
    }

    let action;
    try {
      action = chooseActionMinimax(state, commandsUsedThisTurn, { depth });
    } catch (e) {
      forceDraw = true;
      break;
    }

    // Describe the chosen action while state is still pre-application
    const chosenDesc = isLogTurn ? describeAction(action, state, ap) : null;

    try {
      state = applyAction(state, action);
    } catch (e) {
      forceDraw = true;
      break;
    }
    actionCount++;

    if (isLogTurn && candidates !== null) {
      decisionLog.push({
        gameId,
        turn: turnCount,
        myHP:  state.champions[1]?.hp ?? 0, // Mystic/Dark champion HP after action
        oppHP: state.champions[0]?.hp ?? 0, // Primal champion HP after action
        hand:  state.players[1].hand.map(c => `${c.name}(${c.cost})`),
        board: state.units.filter(u => u.owner === 1).map(u => `${u.name}(${u.atk}/${u.hp})`),
        candidates,
        chosen: chosenDesc,
      });
    }

    if (action.type === 'move') {
      commandsUsedThisTurn++;
    } else if (action.type === 'endTurn') {
      turnCount++;
      commandsUsedThisTurn = 0;
    }
  }

  const result = isGameOver(state);
  const winner = forceDraw ? null : (result.over ? result.winner : null);

  return {
    gameId,
    winner,
    turns: turnCount,
    p1FinalHP: state.champions[0]?.hp ?? 0,
    p2FinalHP: state.champions[1]?.hp ?? 0,
    decisionLog,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const { games, depth } = parseArgs(process.argv);

console.log('\n════════════════════════════════════════════════════════════');
console.log('  MYSTIC/DARK CLOSING DIAGNOSTIC');
console.log('════════════════════════════════════════════════════════════');
console.log(`  Primal (P1) vs Mystic/Dark (P2)  |  Games: ${games}  |  Depth: ${depth}`);
console.log(`  Decision logging: Mystic/Dark turns ${LOG_TURN_MIN}–${LOG_TURN_MAX}`);
console.log('Running...\n');

let p1Wins = 0, p2Wins = 0, draws = 0, totalTurns = 0;
const allGames = [];

for (let i = 0; i < games; i++) {
  const result = runGame(i, depth);
  allGames.push(result);
  if      (result.winner === 'p1') p1Wins++;
  else if (result.winner === 'p2') p2Wins++;
  else                             draws++;
  totalTurns += result.turns;
  process.stdout.write(`\r  Progress: ${i + 1}/${games}`);
}
console.log('\n');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('════════════════════════════════════════════════════════════');
console.log('  OUTCOMES');
console.log('════════════════════════════════════════════════════════════');
console.log(`  Primal (P1) wins:      ${p1Wins}  (${(p1Wins/games*100).toFixed(1)}%)`);
console.log(`  Mystic/Dark (P2) wins: ${p2Wins}  (${(p2Wins/games*100).toFixed(1)}%)`);
console.log(`  Draws:                 ${draws}  (${(draws/games*100).toFixed(1)}%)`);
console.log(`  Average turns:         ${(totalTurns/games).toFixed(1)}`);

// ── Decision log analysis ─────────────────────────────────────────────────────

const allDecisions = allGames.flatMap(g => g.decisionLog);
const endTurnCount = allDecisions.filter(d => d.chosen === 'endTurn').length;
const activeCount  = allDecisions.length - endTurnCount;

console.log('\n════════════════════════════════════════════════════════════');
console.log('  DECISION LOG — MYSTIC/DARK TURNS 15–25');
console.log('════════════════════════════════════════════════════════════');
console.log(`  Total decision points: ${allDecisions.length}`);
console.log(`  endTurn chosen:   ${endTurnCount} (${(endTurnCount/Math.max(1,allDecisions.length)*100).toFixed(1)}%)`);
console.log(`  Active action:    ${activeCount} (${(activeCount/Math.max(1,allDecisions.length)*100).toFixed(1)}%)`);

// Action type breakdown
const typeCounts = {};
for (const d of allDecisions) {
  const type = d.chosen === 'endTurn' ? 'endTurn' : d.chosen.split(' ')[0];
  typeCounts[type] = (typeCounts[type] ?? 0) + 1;
}
console.log('\n  Action type breakdown:');
for (const [t, n] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${t.padEnd(20)} ${n.toString().padStart(4)}  (${(n/Math.max(1,allDecisions.length)*100).toFixed(1)}%)`);
}

// Average HP at log decisions (how healthy are both champions during this window)
if (allDecisions.length > 0) {
  const avgMyHP  = allDecisions.reduce((s, d) => s + d.myHP,  0) / allDecisions.length;
  const avgOppHP = allDecisions.reduce((s, d) => s + d.oppHP, 0) / allDecisions.length;
  console.log('\n  Champion HP during logged turns (avg):');
  console.log(`    Mystic/Dark: ${avgMyHP.toFixed(1)}  |  Primal: ${avgOppHP.toFixed(1)}`);
}

// Most common hand cards during logged turns
const handFreq = {};
for (const d of allDecisions) {
  for (const c of d.hand) {
    handFreq[c] = (handFreq[c] ?? 0) + 1;
  }
}
const topHand = Object.entries(handFreq).sort((a,b) => b[1]-a[1]).slice(0, 8);
console.log('\n  Most common cards in hand during turns 15–25:');
for (const [name, n] of topHand) {
  console.log(`    ${name.padEnd(30)} (${n}x)`);
}

// Score gap analysis: how often was a better action available but not chosen?
let scoreGaps = 0, totalGapSize = 0;
for (const d of allDecisions) {
  if (d.candidates.length > 0) {
    const topScore   = d.candidates[0].score;
    const chosen     = d.candidates.find(c => c.desc === d.chosen);
    const chosenScore = chosen?.score ?? (d.chosen === 'endTurn' ? d.candidates.find(c=>c.desc==='endTurn')?.score : null);
    if (topScore !== null && chosenScore !== null && topScore > chosenScore + 5) {
      scoreGaps++;
      totalGapSize += topScore - chosenScore;
    }
  }
}
console.log(`\n  Decisions where AI left >5pts on table: ${scoreGaps}/${allDecisions.length} (avg gap: ${scoreGaps > 0 ? (totalGapSize/scoreGaps).toFixed(0) : 0}pts)`);

// Show a few example decision points for inspection
console.log('\n  Sample decision points (games with decisions on turns ≥ 20):');
const lateTurnSamples = allDecisions.filter(d => d.turn >= 20).slice(0, 5);
for (const d of lateTurnSamples) {
  console.log(`\n  Game ${d.gameId}, Turn ${d.turn} | MyHP:${d.myHP} OppHP:${d.oppHP}`);
  console.log(`  Hand: ${d.hand.join(', ')}`);
  console.log(`  Board: ${d.board.join(', ')}`);
  console.log(`  Chosen: ${d.chosen}`);
  console.log('  Candidates:');
  for (const c of d.candidates.slice(0, 5)) {
    const heldStr = c.held ? ' [HELD]' : '';
    console.log(`    ${c.desc.padEnd(45)} score=${c.score?.toFixed(0).padStart(6) ?? 'n/a'}${heldStr}`);
  }
}

console.log('\n════════════════════════════════════════════════════════════\n');

// ── Save ──────────────────────────────────────────────────────────────────────

mkdirSync('scripts/simulation/memory/results', { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputPath = `scripts/simulation/mystic_dark_diag_${timestamp}.json`;

writeFileSync(outputPath, JSON.stringify({
  meta: {
    date: new Date().toISOString(),
    description: 'Primal P1 vs Mystic/Dark P2 — decision logging turns 15-25',
    games, minimaxDepth: depth,
    p1Wins, p2Wins, draws,
    avgTurns: +(totalTurns/games).toFixed(1),
    decisionPointsLogged: allDecisions.length,
  },
  games: allGames.map(g => ({
    gameId: g.gameId, winner: g.winner, turns: g.turns,
    p1FinalHP: g.p1FinalHP, p2FinalHP: g.p2FinalHP,
    decisions: g.decisionLog,
  })),
}, null, 2));
console.log(`Results saved to: ${outputPath}`);
