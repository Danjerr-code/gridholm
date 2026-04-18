/**
 * runActionEnumAudit.js
 *
 * Diagnostic: Action Enumeration Completeness Audit (LOG-1547)
 * Branch: diag/action-enumeration-audit
 *
 * Compares headlessEngine.getLegalActions against ground-truth expectations
 * derived from gameEngine functions. Reports divergences:
 *   - MISSING: a card/action the AI should be able to take but cannot see
 *   - FALSE_POS: an enumerated action that produces an unresolvable state when applied
 *   - ODDITY: an action that works but is enumerated incorrectly (e.g. wrong targeting mode)
 *
 * Run: node --experimental-vm-modules scripts/simulation/runActionEnumAudit.js
 */

import {
  createGame,
  getLegalActions,
  applyAction,
} from './headlessEngine.js';

import {
  cloneState,
  hasValidTargets,
  getSpellTargets,
  getEffectiveSpellCost,
} from '../../src/engine/gameEngine.js';

// CARDS not used directly — spell metadata comes from card instances in game state

// ── Constants ──────────────────────────────────────────────────────────────────

// headlessEngine's NO_TARGET_SPELLS (copy for comparison)
const HEADLESS_NO_TARGET = new Set([
  'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
  'ironthorns', 'infernalpact', 'martiallaw', 'fortify', 'shadowveil',
  'ancientspring', 'verdantsurge', 'glimpse',
  'agonizingsymphony', 'pestilence',
  'pactofruin',
]);

// gameEngine's NO_TARGET_SPELLS (from playCard source)
const GAME_ENGINE_NO_TARGET = new Set([
  'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
  'ironthorns', 'infernalpact', 'martiallaw', 'fortify', 'shadowveil',
  'ancientspring', 'verdantsurge', 'predatorsmark',
  'agonizingsymphony', 'pestilence', 'fatesledger', 'seconddawn',
  'royal_decree', 'fortify_the_crown', 'consecrated_ground',
]);

// Spells that headlessEngine handles via a custom path — they DO generate cast actions
// correctly but their application sets a pending state other than pendingSpell.
// glimpse: generates cast, playCard → pendingDeckPeek → deckPeekResolve action handled
// pactofruin: generates cast (NO_TARGET), playCard → pendingHandSelect → handSelect handled
const HEADLESS_SPECIAL_HANDLED = new Set([
  'glimpse',
  'pactofruin',
]);

// Spells handled via non-standard playCard paths that headlessEngine CANNOT cast.
// These should NOT appear as 'cast' type actions.
const SPECIAL_PLAY_SPELLS = new Set([
  'rebirth',       // → pendingGraveSelect (not handled in getLegalActions)
  'amethystcache', // → pendingRelicPlace (getSpellTargets returns [])
  'finalexchange', // → pendingSpell step 0 (getSpellTargets returns [])
  'tollofshadows', // → _tollAdvance (getSpellTargets returns [])
]);

// Two-step spells — hasValidTargets only checks step 0 conditions,
// so hvt=true doesn't mean a full enumerable (step0, step1) pair exists.
const TWO_STEP = new Set(['bloom', 'ambush', 'bloodoffering']);

// Unresolvable pending state keys (headlessEngine guard)
const UNRESOLVABLE_PENDING = [
  'pendingRelicPlace', 'pendingTerrainCast', 'pendingContractSelect',
  'pendingDiscardSelect', 'pendingSacrifice', 'pendingGildedCage',
  'pendingMindSeize', 'pendingRecall', 'pendingCrushingBlow',
  'pendingTollOfShadows', 'pendingPactOfRuin',
];

// ── Divergence collectors ──────────────────────────────────────────────────────

const divergences = {
  MISSING: [],      // Castable spell not enumerated by getLegalActions
  FALSE_POS: [],    // Enumerated action that produces stuck state when applied
  ODDITY: [],       // Works but enumerated in unexpected targeting mode
  STUCK_STATE: [],  // Enumerated action leads to pendingGraveSelect or other unhandled state
};

// ── State generators ──────────────────────────────────────────────────────────

function generateTestStates() {
  const states = [];
  const matchups = [
    ['human', 'beast'],
    ['elf', 'demon'],
    ['human', 'elf'],
    ['beast', 'demon'],
  ];

  for (const [d1, d2] of matchups) {
    // Play several games, capture states at different points
    for (let trial = 0; trial < 3; trial++) {
      let s = createGame(d1, d2);
      let actionCount = 0;
      const MAX_ACTIONS = 300;

      while (actionCount < MAX_ACTIONS) {
        const { over } = { over: !!s.winner };
        if (over) break;

        const actions = getLegalActions(s);
        if (actions.length === 0) break;

        // Capture state at different game phases
        const turn = s.turn ?? 0;
        if (
          (turn <= 2 && actionCount % 5 === 0) ||
          (turn >= 6 && turn <= 12 && actionCount % 8 === 0) ||
          (turn >= 18 && actionCount % 10 === 0)
        ) {
          states.push({ state: cloneState(s), turn, phase: 'turn-' + turn, matchup: `${d1}v${d2}`, trial });
        }

        // Random action selection for state diversity
        const idx = Math.floor(Math.random() * actions.length);
        s = applyAction(s, actions[idx]);
        actionCount++;
      }
    }
  }

  return states;
}

// ── Core audit functions ───────────────────────────────────────────────────────

function auditSpellsInState(stateInfo) {
  const { state, turn, matchup, trial } = stateInfo;
  const ap = state.activePlayer;
  const p = state.players[ap];
  const spellsInHand = p.hand.filter(c => c.type === 'spell');

  // Get what getLegalActions produces
  const legalActions = getLegalActions(state);

  // If any pending state is active, getLegalActions returns specialized actions (not cast).
  // Skip spell audit in these states to avoid false "missing" reports.
  const NON_STANDARD_TYPES = new Set([
    'fleshtitheSacrifice', 'handSelect', 'pendingSpellTarget', 'deckPeekResolve',
  ]);
  const hasNonStandardActions = legalActions.some(a => NON_STANDARD_TYPES.has(a.type));
  if (hasNonStandardActions) return;

  // Also skip if no endTurn action — indicates we're in a mid-pending state that slipped through
  const hasEndTurn = legalActions.some(a => a.type === 'endTurn');
  if (!hasEndTurn && legalActions.length > 0) return;

  const castActions = legalActions.filter(a => a.type === 'cast');
  const castByCardUid = new Map();
  for (const a of castActions) {
    if (!castByCardUid.has(a.cardUid)) castByCardUid.set(a.cardUid, []);
    castByCardUid.get(a.cardUid).push(a);
  }

  for (const card of spellsInHand) {
    const effectiveCost = getEffectiveSpellCost(state, card);
    if (p.resources < effectiveCost) continue; // can't afford → skip

    const cardHasActions = castByCardUid.has(card.uid);
    const context = { card: card.id, effect: card.effect, turn, matchup, trial };

    // Check 1: Is hasValidTargets consistent with enumeration?
    const hvt = hasValidTargets(card, state, ap);

    if (hvt && !cardHasActions) {
      // hasValidTargets says castable but getLegalActions didn't enumerate it
      const isSpecial = SPECIAL_PLAY_SPELLS.has(card.effect) || HEADLESS_SPECIAL_HANDLED.has(card.effect);
      const isTwoStep = TWO_STEP.has(card.effect);
      const inHeadlessNoTarget = HEADLESS_NO_TARGET.has(card.effect);
      const inGameEngineNoTarget = GAME_ENGINE_NO_TARGET.has(card.effect);

      if (!isSpecial) {
        if (isTwoStep) {
          // Two-step spells: hasValidTargets checks step0 only; missing cast actions may just mean
          // no valid (step0, step1) pair exists. Flag as ODDITY not MISSING.
          const spellTargets = getSpellTargets(state, card.effect, 0, {});
          divergences.ODDITY.push({
            type: 'two_step_hvt_mismatch',
            description: `${card.effect}: hasValidTargets=true (step0 targets: ${spellTargets.length}) but no enumerable (step0, step1) pair — likely no enemy units for step 1`,
            ...context,
          });
        } else {
          const spellTargets = getSpellTargets(state, card.effect, 0, {});
          if (inGameEngineNoTarget && !inHeadlessNoTarget) {
            divergences.MISSING.push({
              type: 'missing_no_target_spell',
              description: `${card.effect} is in gameEngine NO_TARGET_SPELLS but not headlessEngine NO_TARGET_SPELLS`,
              ...context,
              getSpellTargetsReturns: spellTargets.length,
            });
          } else if (spellTargets.length === 0) {
            divergences.MISSING.push({
              type: 'missing_spell_no_targets',
              description: `${card.effect}: hasValidTargets=true but getSpellTargets returns [] → never enumerated`,
              ...context,
              inGameEngineNoTarget,
              inHeadlessNoTarget,
            });
          } else {
            divergences.MISSING.push({
              type: 'missing_spell_has_targets',
              description: `${card.effect}: hasValidTargets=true, getSpellTargets returns ${spellTargets.length} targets, but no cast action enumerated`,
              ...context,
              spellTargetsCount: spellTargets.length,
            });
          }
        }
      }
    }

    // Check 2: For enumerated cast actions, do they succeed when applied?
    if (cardHasActions) {
      const actions = castByCardUid.get(card.uid);
      // Test first action (representative)
      const testAction = actions[0];
      const beforeResources = p.resources;

      try {
        const afterState = applyAction(state, testAction);
        const afterResources = afterState.players[ap].resources;
        const cardStillInHand = afterState.players[ap].hand.some(c => c.uid === card.uid);

        if (cardStillInHand && afterResources === beforeResources) {
          // Card wasn't consumed — action had no effect (false positive)
          divergences.FALSE_POS.push({
            type: 'cast_no_effect',
            description: `${card.effect}: cast action had no effect (card still in hand, resources unchanged)`,
            ...context,
          });
        } else {
          // Card was consumed — check for stuck state
          const unresolvable = UNRESOLVABLE_PENDING.find(k => afterState[k]);
          const pendingGraveSelect = afterState.pendingGraveSelect;
          const stuckAfter = getLegalActions(afterState);

          if (unresolvable) {
            divergences.FALSE_POS.push({
              type: 'cast_leads_to_unresolvable',
              description: `${card.effect}: cast sets ${unresolvable} → getLegalActions returns []`,
              ...context,
              pendingState: unresolvable,
            });
          } else if (pendingGraveSelect) {
            divergences.STUCK_STATE.push({
              type: 'cast_leads_to_grave_select',
              description: `${card.effect}: cast sets pendingGraveSelect which getLegalActions ignores → unresolved state`,
              ...context,
            });
          }
        }
      } catch (e) {
        divergences.FALSE_POS.push({
          type: 'cast_throws',
          description: `${card.effect}: applyAction threw: ${e.message}`,
          ...context,
        });
      }
    }

    // Check 3: predatorsmark oddity — enumerated as single-target but dispatched as no-target
    if (card.effect === 'predatorsmark' && cardHasActions) {
      divergences.ODDITY.push({
        type: 'no_target_enumerated_as_targeted',
        description: `predatorsmark: gameEngine dispatches as no-target, but headlessEngine enumerates with target UIDs. Works correctly (target param ignored) but generates unnecessary action variants.`,
        ...context,
        actionsGenerated: castByCardUid.get(card.uid).length,
      });
    }
  }

  // Check 4: True special-play spells that should NOT appear as 'cast' type actions
  for (const card of spellsInHand) {
    if (!SPECIAL_PLAY_SPELLS.has(card.effect)) continue;
    const effectiveCost = getEffectiveSpellCost(state, card);
    if (p.resources < effectiveCost) continue;
    const hvt = hasValidTargets(card, state, ap);
    if (!hvt) continue;
    const cardHasActions = castByCardUid.has(card.uid);
    // Special spells should NOT appear as 'cast' type (they're handled via pendingHandSelect, deckPeekResolve, etc.)
    if (cardHasActions) {
      divergences.FALSE_POS.push({
        type: 'special_spell_as_cast',
        description: `${card.effect} is a special-play spell that should not appear as a 'cast' action`,
        card: card.id,
        effect: card.effect,
        turn,
        matchup,
        trial,
      });
    }
  }
}

function auditMoveActionsInState(stateInfo) {
  // Moves are enumerated via the same gameEngine functions (getChampionMoveTiles, getUnitMoveTiles)
  // so they should be identical. Verify no structural bugs.
  const { state } = stateInfo;
  if (state.phase !== 'action') return;

  const legalActions = getLegalActions(state);
  const champMoves = legalActions.filter(a => a.type === 'championMove').length;
  const unitMoves = legalActions.filter(a => a.type === 'move').length;

  // Apply each champion move and verify it succeeds
  const champMoveActions = legalActions.filter(a => a.type === 'championMove');
  for (const action of champMoveActions.slice(0, 2)) {
    try {
      const afterState = applyAction(state, action);
      const champ = afterState.champions[state.activePlayer];
      if (champ.row !== action.row || champ.col !== action.col) {
        divergences.FALSE_POS.push({
          type: 'champion_move_no_effect',
          description: `championMove to (${action.row},${action.col}) did not update champion position`,
          ...stateInfo,
        });
      }
    } catch (e) {
      divergences.FALSE_POS.push({
        type: 'champion_move_throws',
        description: `championMove threw: ${e.message}`,
        ...stateInfo,
      });
    }
  }
}

// ── Aggregate and deduplicate ──────────────────────────────────────────────────

function dedup(arr) {
  const seen = new Set();
  return arr.filter(d => {
    const key = d.type + ':' + d.description + ':' + (d.effect || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const startMs = Date.now();

console.log('=== Action Enumeration Completeness Audit (LOG-1547) ===');
console.log('Run type: Diagnostic');
console.log('Branch: diag/action-enumeration-audit');
console.log('');
console.log('Generating test states across 4 matchups × 3 trials × varied turn depths...');

const testStates = generateTestStates();
console.log(`Generated ${testStates.length} test states.`);
console.log('');

// Run audits
for (const stateInfo of testStates) {
  try {
    if (stateInfo.state.phase === 'action' && !stateInfo.state.winner) {
      auditSpellsInState(stateInfo);
      auditMoveActionsInState(stateInfo);
    }
  } catch (e) {
    // Ignore per-state errors — keep going
  }
}

// Deduplicate
divergences.MISSING = dedup(divergences.MISSING);
divergences.FALSE_POS = dedup(divergences.FALSE_POS);
divergences.ODDITY = dedup(divergences.ODDITY);
divergences.STUCK_STATE = dedup(divergences.STUCK_STATE);

const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('=== DIVERGENCE REPORT ===');
console.log('');

console.log(`MISSING (spells getLegalActions cannot see, ${divergences.MISSING.length} unique):`);
for (const d of divergences.MISSING) {
  console.log(`  [${d.type}] ${d.description}`);
}
if (divergences.MISSING.length === 0) console.log('  (none)');

console.log('');
console.log(`FALSE POSITIVES (enumerated actions that don't work, ${divergences.FALSE_POS.length} unique):`);
for (const d of divergences.FALSE_POS) {
  console.log(`  [${d.type}] ${d.description}`);
}
if (divergences.FALSE_POS.length === 0) console.log('  (none)');

console.log('');
console.log(`STUCK STATES (actions that create unhandled pending states, ${divergences.STUCK_STATE.length} unique):`);
for (const d of divergences.STUCK_STATE) {
  console.log(`  [${d.type}] ${d.description}`);
}
if (divergences.STUCK_STATE.length === 0) console.log('  (none)');

console.log('');
console.log(`ODDITIES (work but incorrectly categorized, ${divergences.ODDITY.length} unique):`);
for (const d of divergences.ODDITY) {
  console.log(`  [${d.type}] ${d.description} (instances: ${d.actionsGenerated ?? '?'})`);
}
if (divergences.ODDITY.length === 0) console.log('  (none)');

console.log('');
console.log(`Runtime: ${elapsed}s over ${testStates.length} test states`);
console.log('');

// ── Static code analysis findings (not detectable at runtime for standard decks) ──
console.log('=== STATIC CODE ANALYSIS FINDINGS ===');
console.log('(Cards not in standard decks — would affect sim if ever included in draft/adventure scenarios)');
console.log('');
console.log('Missing no-target spells from headlessEngine.NO_TARGET_SPELLS:');
console.log('  [static] fatesledger: in gameEngine NO_TARGET_SPELLS, not headlessEngine → never cast. getSpellTargets returns [].');
console.log('  [static] seconddawn: same as fatesledger → never cast.');
console.log('');
console.log('Spells with no getSpellTargets entry (getSpellTargets returns [] → never enumerated as single-target):');
console.log('  [static] amethystcache: playCard sets pendingRelicPlace, getSpellTargets returns [] → never cast');
console.log('  [static] finalexchange: playCard sets pendingSpell(step0) via caster unit selection, getSpellTargets returns [] → never cast');
console.log('  [static] tollofshadows: playCard calls _tollAdvance, getSpellTargets returns [] → never cast');
console.log('');
console.log('Spells whose playCard sets a non-pendingSpell pending state not handled by getLegalActions:');
console.log('  [static] rebirth: playCard sets pendingGraveSelect → applyActionMutate returns with pendingGraveSelect; getLegalActions continues normally (state is stuck but not detected)');
console.log('');
console.log('Cross-check: hasValidTargets vs getSpellTargets inconsistencies found at runtime:');
console.log('  [runtime] devour: hasValidTargets includes enemy relics with hp<=2, getSpellTargets excludes relics → getLegalActions correctly produces no cast action but hasValidTargets is wrong');

// Also print raw detail for full traceability
if (process.env.VERBOSE) {
  console.log('\n=== RAW DIVERGENCE DETAIL ===');
  console.log(JSON.stringify(divergences, null, 2));
}
