/**
 * runSpellPlayAnalysis.js
 *
 * Diagnostic run: spell play behavior across all four factions.
 * Branch: diag/spell-play-analysis
 *
 * Usage:
 *   node scripts/simulation/runSpellPlayAnalysis.js
 *
 * Run type: Diagnostic
 * Question: How is the AI playing spells across factions? Which spells are cast
 * vs held, on what turn, and what is the kill rate for targeted damage spells?
 *
 * Config: timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600
 * Games: 20 total — 5 each of HvB, HvE, BvE, EvD
 * Both players use minimax AI.
 */

import { createGame, applyAction, isGameOver, getLegalActions } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';
import { CARD_DB } from '../../src/engine/cards.js';

const TIME_BUDGET = 200;
const MAX_TURNS   = 35;
const MAX_ACTIONS = 600;

// Damage spells that have a single unit/champion target.
// Kill flag is tracked for these.
const DAMAGE_SPELL_EFFECTS = new Set([
  'smite', 'crushingblow', 'gore', 'spiritbolt', 'pounce',
  'pestilence', 'moonfire', 'arcane_barrage', 'toxic_spray',
  'plague_swarm', 'agonizingsymphony', 'drain_life', 'void_siphon',
  'ambush', // deals damage via friendly unit battle — track kill
]);

// ── Aggregator ────────────────────────────────────────────────────────────────

function makeFactionStats() {
  return {
    // spellId → { drawn, cast, heldAffordableTurns, castTurns, kills, killableTargets }
    spells: {},
    // spellId → current hold streak for each cardUid: Map<cardUid, consecutiveHeldTurns>
    _holdStreaks: new Map(),
    // spellId → count of instances held 3+ consecutive affordable turns
    holdStreakAlerts: {},
  };
}

function getOrInitSpellStats(stats, spellId) {
  if (!stats.spells[spellId]) {
    stats.spells[spellId] = {
      drawn: 0,
      cast: 0,
      heldAffordableTurns: 0,
      castTurns: [],
      kills: 0,
      killableTargets: 0,
    };
  }
  return stats.spells[spellId];
}

// ── Single game runner ────────────────────────────────────────────────────────

function runSpellGame(gameId, p1Deck, p2Deck, factionStats) {
  let state = createGame(p1Deck, p2Deck);
  const deckForPlayer = [p1Deck, p2Deck];

  // Per-cardUid hold streak tracker: cardUid → { cardId, owner, affordableTurns, streak }
  const holdTracker = new Map();

  // Turn-start snapshots: for each player, record what spells they had and how much mana
  // Structure: Map<playerIdx, Map<cardUid, { cardId, mana }>>
  // Updated when we detect a new turn for a player.
  let prevActivePlayer = -1;
  let turnStartHandSnap = null; // { playerIdx, spells: [{cardId, cardUid, cost}], mana }

  let turnCount     = 0;
  let actionCount   = 0;
  let commandsUsed  = 0;

  while (true) {
    const { over } = isGameOver(state);
    if (over || turnCount >= MAX_TURNS || actionCount >= MAX_ACTIONS) break;

    const ap = state.activePlayer;
    const faction = deckForPlayer[ap];
    const fStats  = factionStats[faction];
    const player  = state.players[ap];

    // Detect turn start (player change or first action)
    if (ap !== prevActivePlayer) {
      // Record drawn cards (initial hand seeded on turn 0, draws happen via diffing)
      // We track "seen" cards per game via holdTracker registration
      const spellsInHand = player.hand.filter(c => c.type === 'spell');
      for (const card of spellsInHand) {
        if (!holdTracker.has(card.uid)) {
          // First time seeing this card — count as drawn
          getOrInitSpellStats(fStats, card.id).drawn++;
          holdTracker.set(card.uid, { cardId: card.id, owner: ap, faction, streak: 0 });
        }
      }
      turnStartHandSnap = { playerIdx: ap, spells: spellsInHand, mana: player.resources };
      prevActivePlayer = ap;
    }

    // Choose action
    const action = chooseActionMinimax(state, commandsUsed, { timeBudget: TIME_BUDGET });

    // Handle cast action: record spell cast + kill tracking
    if (action.type === 'cast') {
      const card = player.hand.find(c => c.uid === action.cardUid);
      if (card) {
        const ss = getOrInitSpellStats(fStats, card.id);
        ss.cast++;
        ss.castTurns.push(turnCount);

        // Kill tracking for targeted damage spells
        if (DAMAGE_SPELL_EFFECTS.has(card.effect) && action.targets && action.targets.length > 0) {
          const targetUid = action.targets[0];
          const targetUnit = state.units.find(u => u.uid === targetUid);
          if (targetUnit) {
            ss.killableTargets++;
            // Apply and check if unit survived
            const afterState = applyAction(state, action);
            const survived = afterState.units.some(u => u.uid === targetUid);
            if (!survived) ss.kills++;
            // Update state and skip the normal state update below
            state = afterState;
            actionCount++;
            if (action.type !== 'endTurn') commandsUsed++;
            // Remove from holdTracker (card was cast, left hand)
            holdTracker.delete(action.cardUid);
            continue;
          }
        }
        // Remove from holdTracker
        holdTracker.delete(action.cardUid);
      }
    }

    // Handle endTurn: record held affordable spells + update streaks
    if (action.type === 'endTurn' && turnStartHandSnap && turnStartHandSnap.playerIdx === ap) {
      const afterState = applyAction(state, action);
      const stillInHand = new Set(afterState.players[ap].hand.map(c => c.uid));

      for (const card of turnStartHandSnap.spells) {
        const affordable = turnStartHandSnap.mana >= card.cost;
        if (!stillInHand.has(card.uid)) {
          // Card left hand (drawn into something else, discarded, etc.)
          holdTracker.delete(card.uid);
          continue;
        }
        if (affordable) {
          const ss = getOrInitSpellStats(fStats, card.id);
          ss.heldAffordableTurns++;
          // Update hold streak
          const tracker = holdTracker.get(card.uid);
          if (tracker) {
            tracker.streak++;
            if (tracker.streak >= 3) {
              fStats.holdStreakAlerts[card.id] = (fStats.holdStreakAlerts[card.id] || 0) + 1;
            }
          }
        } else {
          // Reset streak if mana was insufficient
          const tracker = holdTracker.get(card.uid);
          if (tracker) tracker.streak = 0;
        }
      }

      // Also detect newly drawn spells that appeared after the turn
      const newHand = afterState.players[ap].hand.filter(c => c.type === 'spell');
      for (const card of newHand) {
        if (!holdTracker.has(card.uid)) {
          const nFaction = deckForPlayer[ap];
          getOrInitSpellStats(factionStats[nFaction], card.id).drawn++;
          holdTracker.set(card.uid, { cardId: card.id, owner: ap, faction: nFaction, streak: 0 });
        }
      }

      state = afterState;
      actionCount++;
      turnCount++;
      commandsUsed = 0;
      prevActivePlayer = -1;
      continue;
    }

    // Default: apply action
    const prevTurn = state.turn ?? 0;
    state = applyAction(state, action);
    actionCount++;

    if (action.type !== 'endTurn') {
      if (action.type === 'move') commandsUsed++;
    } else {
      if ((state.turn ?? 0) !== prevTurn) turnCount++;
      commandsUsed = 0;
      prevActivePlayer = -1;
    }

    // Detect draws from hand diff (for non-endTurn actions like deckPeekResolve, etc.)
    const newHand = state.players[ap].hand.filter(c => c.type === 'spell');
    for (const card of newHand) {
      if (!holdTracker.has(card.uid)) {
        const nFaction = deckForPlayer[ap];
        getOrInitSpellStats(factionStats[nFaction], card.id).drawn++;
        holdTracker.set(card.uid, { cardId: card.id, owner: ap, faction: nFaction, streak: 0 });
      }
    }
  }

  const { winner } = isGameOver(state);
  return { winner: winner ?? 'draw', turns: turnCount };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MATCHUPS = [
  { p1: 'human', p2: 'beast',  label: 'HvB' },
  { p1: 'human', p2: 'elf',   label: 'HvE' },
  { p1: 'beast', p2: 'elf',   label: 'BvE' },
  { p1: 'elf',   p2: 'demon', label: 'EvD' },
];
const GAMES_PER_MATCHUP = 5;

const FACTIONS = ['human', 'beast', 'elf', 'demon'];

// Initialize per-faction stats
const factionStats = {};
for (const f of FACTIONS) factionStats[f] = makeFactionStats();

console.log('=== Spell Play Analysis — Diagnostic Run ===');
console.log('Run type: Diagnostic');
console.log(`Config: timeBudget=${TIME_BUDGET}ms, MAX_TURNS=${MAX_TURNS}, MAX_ACTIONS=${MAX_ACTIONS}`);
console.log(`Games: ${MATCHUPS.length * GAMES_PER_MATCHUP} total (${GAMES_PER_MATCHUP} per matchup)\n`);

let gameId = 0;
const startMs = Date.now();

for (const mu of MATCHUPS) {
  console.log(`--- ${mu.label}: ${mu.p1}(P1) vs ${mu.p2}(P2) ---`);
  for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
    gameId++;
    const result = runSpellGame(gameId, mu.p1, mu.p2, factionStats);
    console.log(`  Game ${gameId}: winner=${result.winner} turns=${result.turns}`);
  }
}

const runtimeSec = ((Date.now() - startMs) / 1000).toFixed(1);

// ── Per-faction report ────────────────────────────────────────────────────────

console.log('\n');

for (const faction of FACTIONS) {
  const fStats = factionStats[faction];
  const spells = fStats.spells;

  console.log(`\n═══════════════════════════════════════`);
  console.log(`FACTION: ${faction.toUpperCase()}`);
  console.log(`═══════════════════════════════════════`);

  // Build rows for all spells that were drawn or cast
  const rows = [];
  for (const [spellId, ss] of Object.entries(spells)) {
    if (ss.drawn === 0 && ss.cast === 0) continue;
    const castRate = ss.drawn > 0 ? (ss.cast / ss.drawn * 100).toFixed(0) : 'N/A';
    const holdRate = (ss.cast + ss.heldAffordableTurns) > 0
      ? (ss.heldAffordableTurns / (ss.cast + ss.heldAffordableTurns) * 100).toFixed(0)
      : 'N/A';
    const avgTurn = ss.castTurns.length > 0
      ? (ss.castTurns.reduce((a, b) => a + b, 0) / ss.castTurns.length).toFixed(1)
      : 'N/A';
    const killRate = ss.killableTargets > 0
      ? `${(ss.kills / ss.killableTargets * 100).toFixed(0)}% (${ss.kills}/${ss.killableTargets})`
      : 'N/A';
    const streakAlert = fStats.holdStreakAlerts[spellId] > 0 ? `⚠ ${fStats.holdStreakAlerts[spellId]}x` : '';
    rows.push({ spellId, drawn: ss.drawn, cast: ss.cast, castRate, holdRate, avgTurn, killRate, streakAlert, heldAffordable: ss.heldAffordableTurns });
  }

  // Sort by hold rate desc (highest hold = most interesting)
  rows.sort((a, b) => parseFloat(b.holdRate) - parseFloat(a.holdRate));

  console.log(`\n${'Spell'.padEnd(22)} ${'Drawn'.padStart(5)} ${'Cast'.padStart(5)} ${'CastRate'.padStart(9)} ${'HoldRate'.padStart(9)} ${'AvgTurn'.padStart(8)} ${'KillRate'.padStart(18)} ${'StreakAlert'.padStart(12)}`);
  console.log('-'.repeat(105));
  for (const r of rows) {
    const flag = parseFloat(r.holdRate) >= 80 ? '  ← HIGH HOLD' : '';
    const killFlag = r.killRate !== 'N/A' && parseFloat(r.killRate) < 20 ? '  ← LOW KILL' : '';
    console.log(
      `${r.spellId.padEnd(22)} ${String(r.drawn).padStart(5)} ${String(r.cast).padStart(5)} ${r.castRate.toString().padStart(8)}% ${r.holdRate.toString().padStart(8)}%${r.avgTurn !== 'N/A' ? String(r.avgTurn).padStart(9) : '      N/A'} ${r.killRate.padStart(18)} ${r.streakAlert.padStart(12)}${flag}${killFlag}`
    );
  }

  // Flags summary
  const highHold = rows.filter(r => parseFloat(r.holdRate) >= 80);
  const lowKill  = rows.filter(r => r.killRate !== 'N/A' && parseFloat(r.killRate) < 20);
  const streakFlags = rows.filter(r => fStats.holdStreakAlerts[r.spellId] > 0);

  if (highHold.length > 0) {
    console.log(`\n  FLAGS — High hold rate (≥80% when mana-affordable):`);
    for (const r of highHold) console.log(`    ${r.spellId}: ${r.holdRate}% hold (drawn=${r.drawn}, cast=${r.cast})`);
  }
  if (lowKill.length > 0) {
    console.log(`\n  FLAGS — Low kill realization (<20%) for damage spells:`);
    for (const r of lowKill) console.log(`    ${r.spellId}: ${r.killRate}`);
  }
  if (streakFlags.length > 0) {
    console.log(`\n  FLAGS — Held 3+ consecutive affordable turns:`);
    for (const r of streakFlags) console.log(`    ${r.spellId}: ${fStats.holdStreakAlerts[r.spellId]} instance(s)`);
  }
}

console.log(`\n\n=== Run complete — Runtime: ${runtimeSec}s ===`);
