/**
 * runSpellEvalValidation.js
 *
 * Validation script for LOG-1502 spell evaluation improvements.
 * Runs 20 targeted games (10 Human vs Beast, 10 Mystic vs Demon) using the
 * minimax AI and reports spell cast rates to validate Fix 1–3.
 *
 * Usage:
 *   node runSpellEvalValidation.js
 *
 * Reports:
 *   - Overall cast rate (casts / turns-with-spell-in-hand)
 *   - Per-spell cast vs. held breakdown
 *   - Specifically: Glimpse, Smite, and Overgrowth cast rates
 *   - Win/draw rates for the 20 games
 */

import { createGame, applyAction, isGameOver, getLegalActions } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';

const MAX_TURNS   = 35;
const MAX_ACTIONS = 300;

// ── Game runner ───────────────────────────────────────────────────────────────

function runValidationGame(p1Deck, p2Deck) {
  let state = createGame(p1Deck, p2Deck);
  let turnCount  = 0;
  let actionCount = 0;
  let commandsUsedThisTurn = 0;

  // Spell tracking: per player
  const spellsDrawn  = [{}, {}]; // playerIdx → { cardId: count }
  const spellsCast   = [{}, {}]; // playerIdx → { cardId: count }
  const spellsHeld   = [{}, {}]; // playerIdx → { cardId: hold-turns }

  // Track cards in hand: uid → cardId
  const inHand = [new Map(), new Map()];

  function seedHand(pIdx) {
    for (const c of state.players[pIdx].hand) {
      if (c.type === 'spell') {
        inHand[pIdx].set(c.uid, c.id);
        spellsDrawn[pIdx][c.id] = (spellsDrawn[pIdx][c.id] ?? 0) + 1;
      }
    }
  }
  seedHand(0);
  seedHand(1);

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS || actionCount >= MAX_ACTIONS) break;

    const ap = state.activePlayer;

    // Before deciding: mark spells in hand as held this decision point
    const handSpells = state.players[ap].hand.filter(c => c.type === 'spell');
    for (const c of handSpells) {
      spellsHeld[ap][c.id] = (spellsHeld[ap][c.id] ?? 0) + 1;
    }

    const action = chooseActionMinimax(state, commandsUsedThisTurn, { timeBudget: 200 });

    // Track new draws (after action, check for new cards in hand)
    const prevHandUids = new Set(state.players[ap].hand.map(c => c.uid));

    const prevTurn = state.turn ?? 0;
    state = applyAction(state, action);

    // Detect draws
    for (const c of state.players[ap].hand) {
      if (c.type === 'spell' && !prevHandUids.has(c.uid)) {
        inHand[ap].set(c.uid, c.id);
        spellsDrawn[ap][c.id] = (spellsDrawn[ap][c.id] ?? 0) + 1;
      }
    }

    // Track cast
    if (action.type === 'cast') {
      const cardId = inHand[ap].get(action.cardUid);
      if (cardId) {
        spellsCast[ap][cardId] = (spellsCast[ap][cardId] ?? 0) + 1;
        inHand[ap].delete(action.cardUid);
      }
    }

    if (action.type === 'endTurn') {
      commandsUsedThisTurn = 0;
      if ((state.turn ?? 0) !== prevTurn) turnCount++;
    } else if (action.type === 'move') {
      commandsUsedThisTurn++;
    }
    actionCount++;
  }

  const { winner } = isGameOver(state);
  return {
    winner: winner ?? 'draw',
    turns: turnCount,
    spellsDrawn,
    spellsCast,
    spellsHeld,
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregate(results) {
  const allDrawn  = {};
  const allCast   = {};
  const allHeld   = {};

  for (const r of results) {
    for (let p = 0; p < 2; p++) {
      for (const [id, n] of Object.entries(r.spellsDrawn[p])) {
        allDrawn[id] = (allDrawn[id] ?? 0) + n;
      }
      for (const [id, n] of Object.entries(r.spellsCast[p])) {
        allCast[id] = (allCast[id] ?? 0) + n;
      }
      for (const [id, n] of Object.entries(r.spellsHeld[p])) {
        allHeld[id] = (allHeld[id] ?? 0) + n;
      }
    }
  }

  // Overall cast rate: total casts / total held-decisions (when spell was in hand)
  const totalHeld = Object.values(allHeld).reduce((s, n) => s + n, 0);
  const totalCast = Object.values(allCast).reduce((s, n) => s + n, 0);
  const castRate  = totalHeld > 0 ? totalCast / totalHeld : 0;

  return { allDrawn, allCast, allHeld, totalHeld, totalCast, castRate };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MATCHUPS = [
  { p1: 'human',  p2: 'beast',  label: 'Human vs Beast',  count: 10 },
  { p1: 'elf',    p2: 'demon',  label: 'Elf (Mystic) vs Demon', count: 10 },
];

console.log('\n=== LOG-1502 Spell Evaluation Validation ===');
console.log('20 games: 10 Human vs Beast + 10 Mystic vs Demon\n');

const allResults = [];
let gameId = 0;

for (const { p1, p2, label, count } of MATCHUPS) {
  console.log(`--- ${label} (${count} games) ---`);
  const matchupResults = [];
  let wins = 0, p2wins = 0, draws = 0;

  for (let g = 0; g < count; g++) {
    const result = runValidationGame(p1, p2);
    matchupResults.push(result);
    allResults.push(result);
    if      (result.winner === 'p1') wins++;
    else if (result.winner === 'p2') p2wins++;
    else draws++;
    process.stdout.write(`  Game ${g + 1}/${count}: winner=${result.winner} turns=${result.turns}\n`);
  }

  const { castRate, totalCast, totalHeld } = aggregate(matchupResults);
  console.log(`  P1 wins: ${wins}  P2 wins: ${p2wins}  Draws: ${draws}  DR: ${(draws/count*100).toFixed(1)}%`);
  console.log(`  Cast rate: ${(castRate * 100).toFixed(1)}% (${totalCast} casts / ${totalHeld} held-decisions)\n`);
}

// ── Global aggregate ──────────────────────────────────────────────────────────

const { allCast, allHeld, totalCast, totalHeld, castRate } = aggregate(allResults);

const wins   = allResults.filter(r => r.winner === 'p1').length;
const p2wins = allResults.filter(r => r.winner === 'p2').length;
const draws  = allResults.filter(r => r.winner === 'draw').length;

console.log('=== AGGREGATE (all 20 games) ===');
console.log(`P1 wins: ${wins}  P2 wins: ${p2wins}  Draws: ${draws}  DR: ${(draws/20*100).toFixed(1)}%`);
console.log(`Overall cast rate: ${(castRate * 100).toFixed(1)}% (${totalCast} / ${totalHeld})`);
console.log(`Baseline: 16% (pre-fix strategicAI reference)\n`);

// Spotlight spells
const spotlight = ['glimpse', 'smite', 'overgrowth'];
console.log('Spotlight spells (Glimpse, Smite, Overgrowth):');
for (const id of spotlight) {
  const cast = allCast[id] ?? 0;
  const held = allHeld[id] ?? 0;
  const rate = (cast + held) > 0 ? ((cast / (cast + held)) * 100).toFixed(0) : 'N/A';
  console.log(`  ${id}: cast=${cast} held=${held} cast%=${rate}%`);
}

console.log('\nAll spells (held vs cast):');
const allSpellIds = new Set([...Object.keys(allCast), ...Object.keys(allHeld)]);
const rows = [];
for (const id of allSpellIds) {
  const cast = allCast[id] ?? 0;
  const held = allHeld[id] ?? 0;
  const rate = (cast + held) > 0 ? cast / (cast + held) : 0;
  rows.push({ id, cast, held, rate });
}
rows.sort((a, b) => b.rate - a.rate);
for (const r of rows) {
  console.log(`  ${r.id}: cast=${r.cast} held=${r.held} cast%=${(r.rate * 100).toFixed(0)}%`);
}

// Gate check
console.log('\n--- GATE CHECK ---');
if (castRate >= 0.30 && (allCast['glimpse'] ?? 0) >= 1) {
  console.log('✓ PASS: cast rate ≥ 30% AND Glimpse cast ≥ 1 → proceed to 1200-game matrix');
} else {
  const reasons = [];
  if (castRate < 0.30) reasons.push(`cast rate ${(castRate * 100).toFixed(1)}% < 30%`);
  if ((allCast['glimpse'] ?? 0) < 1) reasons.push('Glimpse never cast');
  console.log(`✗ FAIL: ${reasons.join(', ')} → do not proceed to full matrix`);
}
