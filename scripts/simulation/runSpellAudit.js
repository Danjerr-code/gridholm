/**
 * runSpellAudit.js
 *
 * Runs 5 quickplay games against each faction (20 total) using the live game AI
 * (strategicAI.js / chooseActionStrategic) and collects spell usage statistics.
 *
 * Usage:
 *   node runSpellAudit.js
 *
 * The AI uses chooseActionStrategic (same as the live game) for p2.
 * p1 uses the heuristic simAI (chooseAction) so p2 has a real opponent.
 * Spell audit logging is enabled on strategicAI and captured per decision.
 */

import { createGame, isGameOver, applyAction as headlessApply, getLegalActions as headlessLegalActions } from './headlessEngine.js';
import { chooseAction } from './simAI.js';
import { chooseActionStrategic, setSpellAudit } from '../../src/engine/strategicAI.js';

const FACTIONS  = ['human', 'beast', 'elf', 'demon'];
const GAMES_PER_FACTION = 5;
const MAX_TURNS = 35;
const MAX_ACTIONS = 600;

// ── Audit log capture ─────────────────────────────────────────────────────────

const _auditLines = [];

// Monkey-patch console.log to intercept [SPELL_AUDIT] lines
const _origLog = console.log;
console.log = (...args) => {
  const str = typeof args[0] === 'string' ? args[0] : '';
  if (str.startsWith('[SPELL_AUDIT] ')) {
    _auditLines.push(str.slice('[SPELL_AUDIT] '.length));
  } else {
    _origLog(...args);
  }
};

function flushAuditLines() {
  const lines = _auditLines.splice(0);
  return lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// ── Game runner ───────────────────────────────────────────────────────────────

function runAuditGame(gameId, p1Deck, p2Deck) {
  let state = createGame(p1Deck, p2Deck);
  let turnCount = 0;
  let actionCount = 0;
  let commandsUsedThisTurn = 0;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS || actionCount >= MAX_ACTIONS) break;

    const ap = state.activePlayer;
    let action;

    if (ap === 0) {
      // p1: heuristic AI
      action = chooseAction(state, commandsUsedThisTurn);
    } else {
      // p2: live game AI (with spell audit enabled).
      //
      // Two runner-specific stall paths require special handling:
      //
      // 1. Pending-state stall: strategicAI.getLegalActions returns [] for pending states
      //    (pendingHandSelect, pendingSpell, pendingFleshtitheSacrifice), so it falls back
      //    to endTurn which doesn't advance the turn when a pending state is active.
      //    Fix: delegate to simAI when any pending state is active.
      //
      // 2. No-target unit action loop: strategicAI doesn't know bloodaltar is a targeted-
      //    action unit, so it generates { type: 'unitAction', targetUid: null }. triggerUnitAction
      //    then refunds the command (no adjacent targets), leaving the unit ready and creating
      //    an infinite loop. Fix: validate p2's chosen action against headlessEngine's legal
      //    action list (which correctly enumerates targeted-unit targets) before applying it.
      const needsPendingResolution =
        state.pendingHandSelect ||
        state.pendingSpell ||
        state.pendingFleshtitheSacrifice;
      if (needsPendingResolution) {
        action = chooseAction(state, commandsUsedThisTurn);
      } else {
        action = chooseActionStrategic(state, commandsUsedThisTurn);
        // Guard against no-op unitAction loops caused by strategicAI generating
        // targetUid: null for units that actually require a target (e.g. bloodaltar).
        // Two sub-cases:
        //   a) headlessEngine lists the unit with a non-null targetUid — strategicAI
        //      chose null so fall back to simAI which picks a valid targeted action.
        //   b) headlessEngine omits the unit entirely — it requires a target but none
        //      exists (e.g. bloodaltar with no adjacent friendly units). triggerUnitAction
        //      refunds the command and resets moved=false, creating an infinite loop.
        //      Fall back to simAI which will ignore the unit and pick a real action.
        if (action.type === 'unitAction' && action.targetUid == null) {
          const legalActions = headlessLegalActions(state);
          const hasTargetedVariant = legalActions.some(
            la => la.type === 'unitAction' && la.unitId === action.unitId && la.targetUid != null
          );
          const hasAnyVariant = legalActions.some(
            la => la.type === 'unitAction' && la.unitId === action.unitId
          );
          if (hasTargetedVariant || !hasAnyVariant) {
            action = chooseAction(state, commandsUsedThisTurn);
          }
        }
      }
    }

    const prevTurn = state.turn ?? 0;
    state = headlessApply(state, action);

    if (action.type === 'endTurn') {
      commandsUsedThisTurn = 0;
      if ((state.turn ?? 0) !== prevTurn) turnCount++;
    } else if (action.type === 'move') {
      commandsUsedThisTurn++;
    }
    actionCount++;
  }

  const { winner } = isGameOver(state);
  return { winner: winner ?? 'draw', turns: turnCount, decisions: flushAuditLines() };
}

// ── Stats aggregation ─────────────────────────────────────────────────────────

function aggregateStats(allDecisions) {
  let totalDecisions = 0;
  let decisionsWithSpellCandidate = 0;
  let decisionsWithSpellInHand = 0;
  let decisionsWhereCastChosen = 0;
  let turnsCastWhenSpellInHand = 0;
  const spellsCast = {};      // spellId → cast count
  const spellsHeld = {};      // spellId → turns held without casting

  for (const d of allDecisions) {
    totalDecisions++;

    const hadSpellInHand = d.spellsInHand && d.spellsInHand.length > 0;
    if (hadSpellInHand) decisionsWithSpellInHand++;
    if (d.hasSpellCandidate) decisionsWithSpellCandidate++;

    if (d.chosen === 'cast' && d.spellCast) {
      decisionsWhereCastChosen++;
      if (hadSpellInHand) turnsCastWhenSpellInHand++;
      const id = d.spellCast.id;
      spellsCast[id] = (spellsCast[id] || 0) + 1;
    } else if (hadSpellInHand) {
      // Had a spell in hand but didn't cast — record as held
      for (const id of d.spellsInHand) {
        if (!d.spellCast || d.spellCast.id !== id) {
          spellsHeld[id] = (spellsHeld[id] || 0) + 1;
        }
      }
    }
  }

  return {
    totalDecisions,
    decisionsWithSpellInHand,
    decisionsWithSpellCandidate,
    decisionsWhereCastChosen,
    pctDecisionsWithSpellCandidate: totalDecisions > 0
      ? ((decisionsWithSpellCandidate / totalDecisions) * 100).toFixed(1) + '%'
      : 'N/A',
    pctCastWhenSpellInHand: decisionsWithSpellInHand > 0
      ? ((turnsCastWhenSpellInHand / decisionsWithSpellInHand) * 100).toFixed(1) + '%'
      : 'N/A',
    spellsCast,
    spellsHeld,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

setSpellAudit(true);

_origLog('\n=== AI Spell Usage Audit ===');
_origLog(`Running ${GAMES_PER_FACTION} games per faction (${FACTIONS.length * GAMES_PER_FACTION} total)\n`);

const allDecisions = [];
let gameId = 0;

for (const faction of FACTIONS) {
  _origLog(`--- Faction: ${faction} (p1=human vs p2=${faction}) ---`);
  let factionDecisions = [];
  let results = [];

  for (let g = 0; g < GAMES_PER_FACTION; g++) {
    const result = runAuditGame(gameId++, 'human', faction);
    factionDecisions.push(...result.decisions);
    allDecisions.push(...result.decisions);
    results.push(result);
    _origLog(`  Game ${g + 1}: winner=${result.winner} turns=${result.turns} ai_decisions=${result.decisions.length}`);
  }

  const fStats = aggregateStats(factionDecisions);
  _origLog(`  Faction stats:`);
  _origLog(`    AI decisions: ${fStats.totalDecisions}`);
  _origLog(`    Decisions with spell candidate in pool: ${fStats.decisionsWithSpellCandidate} (${fStats.pctDecisionsWithSpellCandidate})`);
  _origLog(`    Turns AI had spell in hand: ${fStats.decisionsWithSpellInHand}`);
  _origLog(`    Turns AI cast a spell (when spell in hand): ${fStats.decisionsWhereCastChosen} (${fStats.pctCastWhenSpellInHand})`);
  _origLog(`    Spells cast: ${JSON.stringify(fStats.spellsCast)}`);
  _origLog(`    Spells held (turns): ${JSON.stringify(fStats.spellsHeld)}`);
  _origLog('');
}

setSpellAudit(false);

// ── Global aggregate ──────────────────────────────────────────────────────────

const global = aggregateStats(allDecisions);

_origLog('=== AGGREGATE RESULTS (all 20 games) ===');
_origLog(`Total AI decisions: ${global.totalDecisions}`);
_origLog(`Decisions where ≥1 spell was in candidate pool: ${global.decisionsWithSpellCandidate} (${global.pctDecisionsWithSpellCandidate})`);
_origLog(`Turns AI had a spell in hand: ${global.decisionsWithSpellInHand}`);
_origLog(`Turns AI cast a spell (when spell in hand): ${global.decisionsWhereCastChosen} (${global.pctCastWhenSpellInHand})`);

_origLog('\nSpells cast (most → least):');
const castSorted = Object.entries(global.spellsCast).sort((a, b) => b[1] - a[1]);
for (const [id, count] of castSorted) _origLog(`  ${id}: ${count}`);

_origLog('\nSpells held but never cast (total held-turns):');
const heldNeverCast = Object.entries(global.spellsHeld)
  .filter(([id]) => !global.spellsCast[id])
  .sort((a, b) => b[1] - a[1]);
for (const [id, turns] of heldNeverCast) _origLog(`  ${id}: ${turns} held-turns`);

_origLog('\nSpells held despite being in hand (held vs cast ratio):');
const allSpellIds = new Set([...Object.keys(global.spellsCast), ...Object.keys(global.spellsHeld)]);
const ratioRows = [];
for (const id of allSpellIds) {
  const cast = global.spellsCast[id] || 0;
  const held = global.spellsHeld[id] || 0;
  ratioRows.push({ id, cast, held, total: cast + held, heldRate: held / (cast + held) });
}
ratioRows.sort((a, b) => b.heldRate - a.heldRate);
for (const r of ratioRows) {
  _origLog(`  ${r.id}: cast=${r.cast} held=${r.held} held%=${(r.heldRate * 100).toFixed(0)}%`);
}
