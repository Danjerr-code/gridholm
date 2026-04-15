/**
 * validateMulligan.js
 *
 * Validates the curve-aware mulligan algorithm by comparing opening-hand
 * quality and turn-1 play rate between the old (cost>3 discard) and new
 * (curve-aware) mulligan over 100 games of Mystic vs Light.
 *
 * Usage:
 *   node validateMulligan.js
 */

import {
  createInitialState,
  autoAdvancePhase,
  submitMulligan,
} from '../../src/engine/gameEngine.js';
import { createGame, applyAction, isGameOver, getLegalActions } from './headlessEngine.js';
import { chooseMulligan } from './simAI.js';
import { chooseActionMinimax } from './minimaxAI.js';

const GAMES = 100;
const DEPTH = 2;

// ── Old mulligan: discard all cards costing more than 3 ──────────────────────
function oldMulligan(hand) {
  return hand
    .map((card, idx) => ({ card, idx }))
    .filter(({ card }) => card.cost > 3)
    .map(({ idx }) => idx);
}

// ── Create game with a specific mulligan function ────────────────────────────
function createGameWithMulligan(deck1Id, deck2Id, mulliganFn) {
  const s = createInitialState(deck1Id, deck2Id);
  submitMulligan(s, 0, mulliganFn(s.players[0].hand));
  submitMulligan(s, 1, mulliganFn(s.players[1].hand));
  return autoAdvancePhase(s);
}

// ── Describe opening hand ────────────────────────────────────────────────────
function describeHand(hand) {
  const units  = hand.filter(c => c.type === 'unit');
  const spells = hand.filter(c => c.type !== 'unit');
  const lowestCost = hand.length > 0 ? Math.min(...hand.map(c => c.cost)) : null;
  return { unitCount: units.length, spellCount: spells.length, lowestCost };
}

// ── Run one game, tracking opening hands and turn-1 play ─────────────────────
function runOneGame(deck1Id, deck2Id, mulliganFn) {
  const state = createGameWithMulligan(deck1Id, deck2Id, mulliganFn);

  // Capture opening hands immediately after mulligan
  const p1Hand = describeHand(state.players[0].hand);
  const p2Hand = describeHand(state.players[1].hand);

  let p1PlayedT1 = false;
  let p2PlayedT1 = false;
  let currentState = state;
  let turnCount = 0;

  while (true) {
    const { over } = isGameOver(currentState);
    if (over || turnCount >= 30) break;

    const action = chooseActionMinimax(currentState, 0, { depth: DEPTH });
    const beforeTurn = currentState.turn;
    const beforeActivePlayer = currentState.activePlayer;

    // Track whether a card was played this turn
    if (currentState.turn === 1) {
      if (action.type === 'summon' || action.type === 'cast') {
        if (beforeActivePlayer === 0) p1PlayedT1 = true;
        if (beforeActivePlayer === 1) p2PlayedT1 = true;
      }
    }

    currentState = applyAction(currentState, action);

    if (action.type === 'endTurn') {
      turnCount++;
    }

    // Stop tracking turn-1 play once both players have gone
    if (turnCount >= 2) break;
  }

  return { p1Hand, p2Hand, p1PlayedT1, p2PlayedT1 };
}

// ── Run N games with a given mulligan, aggregate stats ───────────────────────
function runBatch(label, mulliganFn, n) {
  console.log(`\n--- ${label} (${n} games) ---`);
  console.log('Game | P1 units | P1 spells | P1 low | P1 T1? | P2 units | P2 spells | P2 low | P2 T1?');
  console.log('-'.repeat(95));

  let p1T1Total = 0;
  let p2T1Total = 0;
  const p1HandStats = [];
  const p2HandStats = [];

  for (let g = 0; g < n; g++) {
    const { p1Hand, p2Hand, p1PlayedT1, p2PlayedT1 } = runOneGame('elf', 'human', mulliganFn);

    if (p1PlayedT1) p1T1Total++;
    if (p2PlayedT1) p2T1Total++;
    p1HandStats.push(p1Hand);
    p2HandStats.push(p2Hand);

    console.log(
      `  ${String(g + 1).padStart(2)} | ` +
      `${String(p1Hand.unitCount).padStart(8)} | ` +
      `${String(p1Hand.spellCount).padStart(9)} | ` +
      `${String(p1Hand.lowestCost ?? '-').padStart(6)} | ` +
      `${(p1PlayedT1 ? 'YES' : 'no').padEnd(6)} | ` +
      `${String(p2Hand.unitCount).padStart(8)} | ` +
      `${String(p2Hand.spellCount).padStart(9)} | ` +
      `${String(p2Hand.lowestCost ?? '-').padStart(6)} | ` +
      `${p2PlayedT1 ? 'YES' : 'no'}`
    );
  }

  const avgP1Units  = (p1HandStats.reduce((s, h) => s + h.unitCount,  0) / n).toFixed(2);
  const avgP2Units  = (p2HandStats.reduce((s, h) => s + h.unitCount,  0) / n).toFixed(2);
  const avgP1Spells = (p1HandStats.reduce((s, h) => s + h.spellCount, 0) / n).toFixed(2);
  const avgP2Spells = (p2HandStats.reduce((s, h) => s + h.spellCount, 0) / n).toFixed(2);
  const p1T1Pct = ((p1T1Total / n) * 100).toFixed(1);
  const p2T1Pct = ((p2T1Total / n) * 100).toFixed(1);

  console.log('');
  console.log(`  Avg P1 units in hand: ${avgP1Units}  spells: ${avgP1Spells}`);
  console.log(`  Avg P2 units in hand: ${avgP2Units}  spells: ${avgP2Spells}`);
  console.log(`  P1 played card on turn 1: ${p1T1Total}/${n} = ${p1T1Pct}%`);
  console.log(`  P2 played card on turn 1: ${p2T1Total}/${n} = ${p2T1Pct}%`);
  console.log(`  Combined turn-1 play rate: ${((p1T1Total + p2T1Total) / (n * 2) * 100).toFixed(1)}%`);

  return { p1T1Pct: parseFloat(p1T1Pct), p2T1Pct: parseFloat(p2T1Pct), avgP1Units, avgP2Units };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Mulligan Validation — Mystic (P1/elf) vs Light (P2/human) — ${GAMES} games each ===`);

  const oldResults = runBatch('OLD MULLIGAN (cost>3 discard)', oldMulligan, GAMES);
  const newResults = runBatch('NEW MULLIGAN (curve-aware)', chooseMulligan, GAMES);

  console.log('\n=== Comparison Summary ===');
  console.log(`                        Old Mulligan   New Mulligan   Delta`);
  console.log(`P1 turn-1 play rate:    ${String(oldResults.p1T1Pct + '%').padEnd(15)}${String(newResults.p1T1Pct + '%').padEnd(15)}${(newResults.p1T1Pct - oldResults.p1T1Pct).toFixed(1)}pp`);
  console.log(`P2 turn-1 play rate:    ${String(oldResults.p2T1Pct + '%').padEnd(15)}${String(newResults.p2T1Pct + '%').padEnd(15)}${(newResults.p2T1Pct - oldResults.p2T1Pct).toFixed(1)}pp`);
  console.log(`P1 avg units in hand:   ${String(oldResults.avgP1Units).padEnd(15)}${String(newResults.avgP1Units).padEnd(15)}`);
  console.log(`P2 avg units in hand:   ${String(oldResults.avgP2Units).padEnd(15)}${String(newResults.avgP2Units).padEnd(15)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
