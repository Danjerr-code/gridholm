/**
 * runDiagnostics.js
 *
 * Diagnostic runner for AI behavior analysis (LOG-1176).
 * Instruments the game loop to track 6 AI behavior issues:
 *
 *  1. Mystic healing spell/ability usage vs. missed opportunities
 *  2. Mystic token generation (Yggara, Canopy Sentinel, Sapling production)
 *  3. Card draw utilization (Ancient Spring, Glimpse, Sylvan Courier)
 *  4. Champion protection (attacked with no friendly blockers adjacent)
 *  5. Lethal opportunity recognition (endTurn chosen when lethal existed)
 *  6. Champion ability usage (chosen vs. available at endTurn)
 *
 * Usage:
 *   node runDiagnostics.js [--games 20] [--factions elf,human,beast,demon]
 *
 * Output: diagnostic report to console + scripts/simulation/diagnostic_results.json
 */

import { writeFileSync } from 'fs';
import {
  createGame, applyAction, isGameOver, getLegalActions,
} from './headlessEngine.js';
import { chooseAction } from './simAI.js';
import { manhattan } from '../../src/engine/gameEngine.js';

// ── Card-set constants ─────────────────────────────────────────────────────────

const HEALING_SPELL_EFFECTS = new Set(['overgrowth', 'bloom']);
const DRAW_SPELL_EFFECTS    = new Set(['ancientspring', 'glimpse']);
const DRAW_UNIT_IDS         = new Set(['sylvancourier']); // draw on summon

// Mystic healing card IDs (unit cards that have healing triggers — tracked by play)
const HEALING_UNIT_IDS = new Set([
  'seedling', 'whisper', 'elfelder', 'grovewarden', 'thornweave',
  'sistersiofra', 'moonveilmystic',
]);

// Token-generating unit IDs and effects
const TOKEN_GENERATOR_UNIT_IDS = new Set(['yggara', 'canopysentinel']);
// Saplings are the primary token; also snake (callofthesnakes for primal)
const TOKEN_UNIT_IDS = new Set(['sapling', 'snake']);

// Faction name for each deck ID
const FACTION_ATTR = {
  human: 'light',
  beast: 'primal',
  elf:   'mystic',
  demon: 'dark',
};

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    games: 20,
    factions: ['human', 'beast', 'elf', 'demon'],
    output: 'scripts/simulation/diagnostic_results.json',
  };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--games':    args.games    = parseInt(argv[++i], 10); break;
      case '--factions': args.factions = argv[++i].split(',');    break;
      case '--output':   args.output   = argv[++i];               break;
    }
  }
  return args;
}

// ── Per-game diagnostic tracker ────────────────────────────────────────────────

function initDiagState() {
  return {
    // Healing (primarily Mystic)
    healingSpellsCast: 0,
    healingSpellMissedAtEndTurn: 0,   // had healing spell + mana at endTurn but cast 0 this turn
    healingUnitsCast: 0,              // healing unit cards played

    // Token generation (Mystic)
    tokenGeneratorsPlayed: 0,         // Yggara / Canopy Sentinel summoned
    tokensCreated: 0,                 // sapling/snake units that appeared

    // Card draw
    cardsDrawn: 0,
    drawSpellsCast: 0,                // ancientspring / glimpse cast
    drawUnitsCast: 0,                 // sylvancourier summoned
    drawSpellMissedAtEndTurn: 0,      // had draw spell + mana at endTurn

    // Champion protection
    champAttackedUnprotected: 0,      // enemy unit attacked champion with no friendly adjacent
    champAttackedProtected: 0,        // enemy unit attacked champion with ≥1 friendly adjacent

    // Lethal opportunity
    lethalsAtEndTurn: 0,              // legal lethal existed but AI chose endTurn instead
    endTurnsChecked: 0,               // total endTurn actions taken (denominator)

    // Champion ability
    champAbilityUsed: 0,
    champAbilityMissedAtEndTurn: 0,   // ability was available at endTurn but not used
  };
}

// ── Opportunity detectors ──────────────────────────────────────────────────────

/**
 * Check whether a healing spell is in hand with enough mana to cast it.
 */
function hasHealingSpellAvailable(state, playerIdx) {
  const p = state.players[playerIdx];
  return p.hand.some(c =>
    c.type === 'spell' &&
    HEALING_SPELL_EFFECTS.has(c.effect) &&
    c.cost <= p.mana
  );
}

/**
 * Check whether a draw spell is in hand with enough mana to cast it.
 */
function hasDrawSpellAvailable(state, playerIdx) {
  const p = state.players[playerIdx];
  return p.hand.some(c =>
    c.type === 'spell' &&
    DRAW_SPELL_EFFECTS.has(c.effect) &&
    c.cost <= p.mana
  );
}

/**
 * Check whether any legal action results in killing the opponent champion.
 * Only checks direct lethal (move to champion tile killing it, or champion move to
 * opponent champion tile). Doesn't evaluate multi-step spell lethals for simplicity.
 */
function hasLethalAction(state) {
  const ap       = state.activePlayer;
  const enemyIdx = 1 - ap;
  const ec       = state.champions[enemyIdx];

  for (const action of getLegalActions(state)) {
    if (action.type === 'move') {
      const unit = state.units.find(u => u.uid === action.unitId);
      if (!unit) continue;
      if (
        action.targetTile[0] === ec.row &&
        action.targetTile[1] === ec.col &&
        unit.atk >= ec.hp
      ) return true;
    }
    if (action.type === 'championMove') {
      const mc = state.champions[ap];
      if (
        action.row === ec.row &&
        action.col === ec.col &&
        (mc.atk ?? 0) >= ec.hp
      ) return true;
    }
    // For cast actions: apply and see if winner set (handles damage spells)
    if (action.type === 'cast') {
      try {
        const ns = applyAction(state, action);
        if (ns.winner) return true;
      } catch { /* ignore */ }
    }
  }
  return false;
}

/**
 * Check whether a champion ability action is available right now.
 */
function hasChampionAbilityAvailable(state) {
  return getLegalActions(state).some(a => a.type === 'championAbility');
}

// ── Single game runner with diagnostics ───────────────────────────────────────

const MAX_TURNS        = 30;
const MAX_ACTIONS_GAME = 500;

function runDiagnosticGame(gameId, p1Deck, p2Deck) {
  let state = createGame(p1Deck, p2Deck);

  // Per-player diagnostic state
  const diag = [initDiagState(), initDiagState()];

  // Track hand size per player to detect cards drawn
  function getHandUids(pIdx) {
    return new Set(state.players[pIdx].hand.map(c => c.uid));
  }
  let prevHandUids = [getHandUids(0), getHandUids(1)];

  // Track unit uids to detect new tokens appearing
  function getUnitUids() {
    return new Set(state.units.map(u => u.uid));
  }
  let prevUnitUids = getUnitUids();

  // Track how many healing spells were cast this turn (for missed-at-endTurn logic)
  let healingCastThisTurn = [0, 0];

  let turnCount          = 0;
  let actionCount        = 0;
  let commandsUsed       = 0;
  let forceDraw          = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) { forceDraw = true; break; }

    const ap = state.activePlayer;
    const d  = diag[ap];

    // ── Pre-action diagnostics ─────────────────────────────────────────────────

    const action = chooseAction(state, commandsUsed);

    // 5. Lethal check: if AI chose endTurn but lethal existed
    if (action.type === 'endTurn') {
      d.endTurnsChecked++;
      if (hasLethalAction(state)) {
        d.lethalsAtEndTurn++;
      }
      // 1. Healing missed: if healing spell in hand + mana but none cast this turn
      if (hasHealingSpellAvailable(state, ap) && healingCastThisTurn[ap] === 0) {
        d.healingSpellMissedAtEndTurn++;
      }
      // 3. Draw spell missed
      if (hasDrawSpellAvailable(state, ap)) {
        d.drawSpellMissedAtEndTurn++;
      }
      // 6. Champion ability missed
      if (hasChampionAbilityAvailable(state)) {
        d.champAbilityMissedAtEndTurn++;
      }
    }

    // 4. Champion protection check: if enemy is moving to our champion's tile
    const enemyIdx = 1 - ap;  // enemy is the non-active player... wait
    // Actually it's the active player's action, so AP is the attacker.
    // We want to track: when AP moves a unit to the OPPONENT's champion's tile,
    // did the OPPONENT have any friendly unit adjacent to their champion?
    if (action.type === 'move') {
      const oppIdx = 1 - ap;
      const ec     = state.champions[oppIdx];
      if (
        action.targetTile[0] === ec.row &&
        action.targetTile[1] === ec.col
      ) {
        // Enemy (opponent) champion is being attacked — check if opponent had blockers
        const friendlyUnitsAdjacentToOppChamp = state.units.filter(u =>
          u.owner === oppIdx &&
          manhattan([u.row, u.col], [ec.row, ec.col]) === 1
        );
        if (friendlyUnitsAdjacentToOppChamp.length === 0) {
          diag[oppIdx].champAttackedUnprotected++;
        } else {
          diag[oppIdx].champAttackedProtected++;
        }
      }
    }

    // ── Apply action ──────────────────────────────────────────────────────────

    const beforeState = state;
    state = applyAction(state, action);
    actionCount++;

    // ── Post-action diagnostics ────────────────────────────────────────────────

    // 1. Track cast healing spells
    if (action.type === 'cast') {
      const card = beforeState.players[ap].hand.find(c => c.uid === action.cardUid);
      if (card) {
        if (HEALING_SPELL_EFFECTS.has(card.effect)) {
          d.healingSpellsCast++;
          healingCastThisTurn[ap]++;
        }
        if (DRAW_SPELL_EFFECTS.has(card.effect)) {
          d.drawSpellsCast++;
        }
      }
    }

    // 1. Track healing unit summons
    if (action.type === 'summon') {
      const card = beforeState.players[ap].hand.find(c => c.uid === action.cardUid);
      if (card) {
        if (HEALING_UNIT_IDS.has(card.id)) {
          d.healingUnitsCast++;
        }
        if (TOKEN_GENERATOR_UNIT_IDS.has(card.id)) {
          d.tokenGeneratorsPlayed++;
        }
        if (DRAW_UNIT_IDS.has(card.id)) {
          d.drawUnitsCast++;
        }
      }
    }

    // 6. Track champion ability use
    if (action.type === 'championAbility') {
      d.champAbilityUsed++;
    }

    // 2. Detect new token units (sapling / snake)
    const newUnitUids = getUnitUids();
    for (const unit of state.units) {
      if (!prevUnitUids.has(unit.uid) && TOKEN_UNIT_IDS.has(unit.id)) {
        // New token appeared — attribute to its owner
        diag[unit.owner].tokensCreated++;
      }
    }
    prevUnitUids = newUnitUids;

    // 3. Detect cards drawn (new uids in hand)
    for (let pIdx = 0; pIdx < 2; pIdx++) {
      const newHandUids = getHandUids(pIdx);
      for (const uid of newHandUids) {
        if (!prevHandUids[pIdx].has(uid)) {
          diag[pIdx].cardsDrawn++;
        }
      }
      prevHandUids[pIdx] = newHandUids;
    }

    // Reset per-turn counters on endTurn
    if (action.type === 'endTurn') {
      healingCastThisTurn[ap] = 0;
      turnCount++;
      commandsUsed = 0;
    } else if (action.type === 'move') {
      commandsUsed++;
    }
  }

  const result = isGameOver(state);
  const winner = !forceDraw && result.over ? result.winner : null;

  return {
    gameId,
    p1Deck,
    p2Deck,
    winner,
    turns: turnCount,
    diag,
  };
}

// ── Aggregate per-faction diagnostics ─────────────────────────────────────────

function aggregateDiag(results, faction) {
  const agg = initDiagState();
  let gameCount = 0;

  for (const r of results) {
    // Determine which player side used this faction
    let pIdx = null;
    if (r.p1Deck === faction) pIdx = 0;
    else if (r.p2Deck === faction) pIdx = 1;
    if (pIdx === null) continue;

    const d = r.diag[pIdx];
    for (const key of Object.keys(agg)) {
      agg[key] += d[key];
    }
    gameCount++;
  }

  // Build per-game averages
  const avg = {};
  for (const [key, total] of Object.entries(agg)) {
    avg[key] = gameCount > 0 ? +(total / gameCount).toFixed(3) : 0;
  }
  return { total: agg, avg, gameCount };
}

// ── Main ───────────────────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = parseArgs(process.argv);
  const factions = args.factions;
  const gamesPerMatchup = args.games;

  // Build all matchup pairs (cartesian product)
  const matchups = [];
  for (const f1 of factions) {
    for (const f2 of factions) {
      matchups.push([f1, f2]);
    }
  }

  console.log(`\nDiagnostic run: ${gamesPerMatchup} games × ${matchups.length} matchups = ${gamesPerMatchup * matchups.length} total games`);
  console.log(`Factions: ${factions.join(', ')}\n`);

  const allResults = [];
  let gamesRun = 0;

  for (const [p1Deck, p2Deck] of matchups) {
    process.stdout.write(`  ${p1Deck} vs ${p2Deck}...`);
    for (let i = 0; i < gamesPerMatchup; i++) {
      const r = runDiagnosticGame(gamesRun + 1, p1Deck, p2Deck);
      allResults.push(r);
      gamesRun++;
    }
    console.log(` done (${gamesPerMatchup} games)`);
  }

  // ── Per-faction aggregate report ─────────────────────────────────────────────

  const factionReport = {};
  for (const faction of factions) {
    factionReport[faction] = aggregateDiag(allResults, faction);
  }

  // ── Console report ────────────────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  AI DIAGNOSTIC REPORT (per-game averages)');
  console.log('══════════════════════════════════════════════════════════════\n');

  for (const faction of factions) {
    const { avg, gameCount } = factionReport[faction];
    console.log(`── ${faction.toUpperCase()} (${gameCount} games) ──────────────────────────────────`);
    console.log(`  [Healing]`);
    console.log(`    Healing spells cast/game:        ${avg.healingSpellsCast}`);
    console.log(`    Healing spell missed at endTurn: ${avg.healingSpellMissedAtEndTurn}`);
    console.log(`    Healing units cast/game:         ${avg.healingUnitsCast}`);
    console.log(`  [Tokens]`);
    console.log(`    Token generators played/game:    ${avg.tokenGeneratorsPlayed}`);
    console.log(`    Tokens created/game:             ${avg.tokensCreated}`);
    console.log(`  [Card Draw]`);
    console.log(`    Cards drawn/game:                ${avg.cardsDrawn}`);
    console.log(`    Draw spells cast/game:           ${avg.drawSpellsCast}`);
    console.log(`    Draw units cast/game:            ${avg.drawUnitsCast}`);
    console.log(`    Draw spell missed at endTurn:    ${avg.drawSpellMissedAtEndTurn}`);
    console.log(`  [Champion Protection]`);
    console.log(`    Champion attacked unprotected:   ${avg.champAttackedUnprotected}`);
    console.log(`    Champion attacked protected:     ${avg.champAttackedProtected}`);
    const totalAttacks = avg.champAttackedUnprotected + avg.champAttackedProtected;
    const unprotectedPct = totalAttacks > 0 ? ((avg.champAttackedUnprotected / totalAttacks) * 100).toFixed(1) : 'N/A';
    console.log(`    Unprotected rate:                ${unprotectedPct}%`);
    console.log(`  [Lethal Recognition]`);
    console.log(`    endTurns taken total/game:       ${avg.endTurnsChecked}`);
    console.log(`    Lethals missed at endTurn:       ${avg.lethalsAtEndTurn}`);
    const lethalMissRate = avg.endTurnsChecked > 0 ? ((avg.lethalsAtEndTurn / avg.endTurnsChecked) * 100).toFixed(1) : 'N/A';
    console.log(`    Lethal miss rate (% of endTurns):${lethalMissRate}%`);
    console.log(`  [Champion Ability]`);
    console.log(`    Ability used/game:               ${avg.champAbilityUsed}`);
    console.log(`    Ability missed at endTurn:       ${avg.champAbilityMissedAtEndTurn}`);
    const abilityMissRate = (avg.champAbilityUsed + avg.champAbilityMissedAtEndTurn) > 0
      ? ((avg.champAbilityMissedAtEndTurn / (avg.champAbilityUsed + avg.champAbilityMissedAtEndTurn)) * 100).toFixed(1)
      : 'N/A';
    console.log(`    Ability miss rate:               ${abilityMissRate}%`);
    console.log('');
  }

  // ── Flags ─────────────────────────────────────────────────────────────────────

  console.log('══ FLAGS ══════════════════════════════════════════════════════');
  let flagCount = 0;

  for (const faction of factions) {
    const { avg } = factionReport[faction];
    // Mystic-specific
    if (faction === 'elf') {
      if (avg.healingSpellsCast < 0.3) {
        console.log(`  [FLAG] ${faction}: very low healing spell usage (${avg.healingSpellsCast}/game)`);
        flagCount++;
      }
      if (avg.healingSpellMissedAtEndTurn > 0.5) {
        console.log(`  [FLAG] ${faction}: healing spell available at endTurn frequently missed (${avg.healingSpellMissedAtEndTurn}/game)`);
        flagCount++;
      }
      if (avg.drawSpellsCast < 0.5) {
        console.log(`  [FLAG] ${faction}: very low draw spell usage (${avg.drawSpellsCast}/game)`);
        flagCount++;
      }
      if (avg.drawSpellMissedAtEndTurn > 0.5) {
        console.log(`  [FLAG] ${faction}: draw spell available at endTurn frequently missed (${avg.drawSpellMissedAtEndTurn}/game)`);
        flagCount++;
      }
      if (avg.tokenGeneratorsPlayed < 0.1) {
        console.log(`  [FLAG] ${faction}: token generators rarely played (${avg.tokenGeneratorsPlayed}/game)`);
        flagCount++;
      }
    }
    // All factions
    const totalAttacks = avg.champAttackedUnprotected + avg.champAttackedProtected;
    const unprotectedPct = totalAttacks > 0 ? avg.champAttackedUnprotected / totalAttacks : 0;
    if (unprotectedPct > 0.7) {
      console.log(`  [FLAG] ${faction}: champion unprotected ${(unprotectedPct * 100).toFixed(0)}% of attacks (no blockers adjacent)`);
      flagCount++;
    }
    if (avg.lethalsAtEndTurn > 0.1) {
      console.log(`  [FLAG] ${faction}: lethal missed at endTurn ${avg.lethalsAtEndTurn}/game (lethal detection issue)`);
      flagCount++;
    }
    if (avg.champAbilityMissedAtEndTurn > 1.0) {
      console.log(`  [FLAG] ${faction}: champion ability available but not used ${avg.champAbilityMissedAtEndTurn}/endTurn (underused)`);
      flagCount++;
    }
  }

  if (flagCount === 0) console.log('  No flags raised — all metrics within acceptable range.');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Write JSON output
  const output = {
    meta: {
      date: new Date().toISOString().slice(0, 10),
      gamesPerMatchup,
      totalGames: allResults.length,
      factions,
    },
    factionReport,
    allResults: allResults.map(r => ({
      gameId: r.gameId,
      p1Deck: r.p1Deck,
      p2Deck: r.p2Deck,
      winner: r.winner,
      turns: r.turns,
      diagP1: r.diag[0],
      diagP2: r.diag[1],
    })),
  };

  writeFileSync(args.output, JSON.stringify(output, null, 2));
  console.log(`Results written to ${args.output}`);
}
