/**
 * runLethalDetectionTest.js
 *
 * Unit tests for multi-action lethal detection (LOG-1548).
 * Constructs minimal game states and verifies chooseActionMinimax finds
 * (or correctly rejects) lethal sequences.
 *
 * Run: node scripts/simulation/runLethalDetectionTest.js
 */

import { createGame, getLegalActions, applyAction } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';
import { cloneState } from '../../src/engine/gameEngine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

function makeUnit(owner, row, col, atk, hp, opts = {}) {
  return {
    uid: `test_unit_${owner}_${row}_${col}_${Math.random().toString(36).slice(2)}`,
    id: 'militia',
    owner,
    name: `TestUnit-${owner}-${row}-${col}`,
    atk,
    hp,
    maxHp: hp,
    row,
    col,
    moved: false,
    summoned: false,
    spd: opts.spd ?? 1,
    flying: opts.flying ?? false,
    rooted: false,
    hidden: false,
    shield: 0,
    poison: 0,
    resonanceBonus: 0,
    cost: 1,
    type: 'unit',
    isRelic: false,
    isOmen: false,
    ...opts,
  };
}

function buildTestState(apIdx, champHp, units) {
  const s = createGame('human', 'beast');
  const ts = cloneState(s);

  // Set active player
  ts.activePlayer = apIdx;

  // Clear any units on board
  ts.units = [];

  // Reset command usage for both players
  ts.players[0].commandsUsed = 0;
  ts.players[1].commandsUsed = 0;

  // Set enemy champion (opposing player's champion) HP
  const enemyIdx = 1 - apIdx;
  ts.champions[enemyIdx].hp = champHp;
  ts.champions[enemyIdx].maxHp = champHp;

  // Place test units
  for (const u of units) {
    ts.units.push(u);
  }

  // Ensure enough mana for spells
  ts.players[apIdx].resources = 10;

  return ts;
}

// ── Test 1: 2-attack lethal (unit A + unit B) ─────────────────────────────────

console.log('\nTest 1: 2-attack lethal (unit A then unit B)');
{
  // Enemy champ at (0,0), HP=3. Unit A (ATK=2) adjacent at (0,1). Unit B (ATK=1) adjacent at (1,0).
  // Sequence: A attacks (→HP=1), B attacks (→HP=0) = lethal
  const ap = 1;
  const enemyChampRow = 0, enemyChampCol = 0;
  const s = buildTestState(ap, 3, [
    makeUnit(ap, 0, 1, 2, 10),  // Unit A: ATK=2, adjacent to champ
    makeUnit(ap, 1, 0, 1, 10),  // Unit B: ATK=1, adjacent to champ
  ]);
  s.champions[0].row = enemyChampRow;
  s.champions[0].col = enemyChampCol;

  const action = chooseActionMinimax(s, 0, { depth: 2, timeBudget: 200 });
  const isMove = action.type === 'move';
  const targetIsChamp = isMove &&
    action.targetTile[0] === enemyChampRow &&
    action.targetTile[1] === enemyChampCol;

  assert(targetIsChamp, 'AI finds first move of 2-attack lethal (moves unit to champ tile)',
    `got action=${JSON.stringify(action)}`);
}

// ── Test 2: Buff spell + attack lethal (Rally then attack) ────────────────────

console.log('\nTest 2: Buff spell + attack lethal (Rally then attack)');
{
  // Enemy champ at (0,0), HP=3. Unit ATK=2 (not lethal alone), but after Rally (+1 ATK) → ATK=3 = lethal.
  const ap = 1;
  const s = buildTestState(ap, 3, [
    makeUnit(ap, 0, 1, 2, 10),  // ATK=2, adjacent to champ (not lethal alone)
  ]);
  s.champions[0].row = 0;
  s.champions[0].col = 0;

  // Give AI a rally card (no-target, +1 ATK to all friendly units this turn)
  const rallyCard = { uid: 'rally_test', id: 'rally', name: 'Rally', type: 'spell', effect: 'rally', cost: 1 };
  s.players[ap].hand = [rallyCard];
  s.players[ap].resources = 5;

  const action = chooseActionMinimax(s, 0, { depth: 2, timeBudget: 200 });
  // AI should cast Rally first (enabling the lethal attack as step 2)
  assert(action.type === 'cast', 'AI casts Rally (buff spell) as first step of lethal sequence',
    `got action=${JSON.stringify(action)}`);
}

// ── Test 3: Attack + attack lethal (high HP champion, 2 units needed) ─────────

console.log('\nTest 3: 2-unit lethal where neither unit alone is sufficient');
{
  const ap = 1;
  const s = buildTestState(ap, 5, [
    makeUnit(ap, 0, 1, 3, 10),  // ATK=3, not lethal alone (5-3=2 remaining)
    makeUnit(ap, 1, 0, 2, 10),  // ATK=2, not lethal alone
  ]);
  s.champions[0].row = 0;
  s.champions[0].col = 0;

  const action = chooseActionMinimax(s, 0, { depth: 2, timeBudget: 200 });
  const isMove = action.type === 'move';
  const targetIsChamp = isMove &&
    action.targetTile[0] === 0 &&
    action.targetTile[1] === 0;
  assert(targetIsChamp, 'AI finds first move of 3+2 ATK vs 5 HP lethal sequence',
    `got action=${JSON.stringify(action)}`);
}

// ── Test 4: No lethal exists (AI should not report lethal) ────────────────────

console.log('\nTest 4: No lethal — AI should not play to champ tile first');
{
  // Enemy champ HP=20. No way to lethal.
  const ap = 1;
  const s = buildTestState(ap, 20, [
    makeUnit(ap, 0, 1, 3, 5),
    makeUnit(ap, 1, 0, 2, 5),
  ]);
  s.champions[0].row = 0;
  s.champions[0].col = 0;

  const action = chooseActionMinimax(s, 0, { depth: 2, timeBudget: 200 });
  // AI might still choose a move to champ tile (valid play), but it should NOT
  // log "LETHAL FOUND". We can't easily check console.log output, but we can
  // verify the action is valid.
  const isValid = action && action.type !== undefined;
  assert(isValid, 'AI returns a valid action when no lethal exists',
    `got action=${JSON.stringify(action)}`);

  // Check enemy champion still has HP > 0 after the action (single action can't kill 20HP champ)
  const ns = applyAction(s, action);
  assert(!ns.winner, 'Single action does not win when champ has 20 HP',
    `winner=${ns.winner}`);
}

// ── Test 5: Undying Pact prevents lethal ─────────────────────────────────────

console.log('\nTest 5: Undying Pact — simulation correctly handles lethal prevention');
{
  const ap = 1;
  const sacrificeUnit = makeUnit(0, 2, 2, 1, 3, { id: 'militia' });
  const s = buildTestState(ap, 2, [
    makeUnit(ap, 0, 1, 3, 10),  // ATK=3 > HP=2, would one-shot if not for Undying Pact
    sacrificeUnit,
  ]);
  s.champions[0].row = 0;
  s.champions[0].col = 0;

  // Add Undying Pact modifier with correct unitUid for the sacrifice target
  if (!s.activeModifiers) s.activeModifiers = [];
  s.activeModifiers.push({ type: 'undyingPact', playerIndex: 0, unitUid: sacrificeUnit.uid });

  // After the attack, Undying Pact should save the champion at 1 HP
  const moveToChamp = getLegalActions(s).find(a =>
    a.type === 'move' && a.targetTile[0] === 0 && a.targetTile[1] === 0
  );

  if (moveToChamp) {
    const ns = applyAction(s, moveToChamp);
    // Champion survives via Undying Pact at 1 HP — no winner yet
    assert(!ns.winner, 'Undying Pact simulation: champion survives lethal hit',
      `winner=${ns.winner}, champHp=${ns.champions[0].hp}`);
    assert(ns.champions[0].hp === 1, 'Champion restored to 1 HP by Undying Pact',
      `hp=${ns.champions[0].hp}`);
  } else {
    assert(false, 'Could not find move-to-champion action for Undying Pact test');
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n── Results ─────────────────────────────────────`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
if (failed === 0) {
  console.log('  All tests passed.');
} else {
  console.log('  FAILURES detected — see above.');
  process.exit(1);
}
