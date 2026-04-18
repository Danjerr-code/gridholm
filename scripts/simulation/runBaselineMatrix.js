/**
 * runBaselineMatrix.js
 *
 * Post-Fix Comprehensive Baseline Matrix — LOG-1552
 * Label: baseline-post-april-18-fixes
 *
 * Runs all 6 faction matchups bidirectionally (5 games/direction = 10/matchup = 60 total).
 * Configuration: timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600.
 *
 * Metrics collected per matchup:
 *   - Win rate (P1 and P2), draw rate
 *   - Average game length (turns)
 *   - Action-limit hits (games ended by 600-action cap)
 *   - Decisive wins (winner != draw)
 *   - Demon spell cast rates: agonizingsymphony, pestilence, pactofruin
 *   - Avg turn champion first within dist 2 of Throne (both players)
 *   - Avg turn champion first ON Throne (both players)
 *
 * Usage:
 *   node scripts/simulation/runBaselineMatrix.js
 */

import { createGame, applyAction, isGameOver } from './headlessEngine.js';
import { chooseActionMinimax } from './minimaxAI.js';

const TIME_BUDGET          = 200;
const MAX_TURNS            = 35;
const MAX_ACTIONS_GAME     = 600;
const MAX_ACTIONS_PER_TURN = 80;

const THRONE_ROW = 2;
const THRONE_COL = 2;

// Demon spells to track cast rates (confirms spell parity fix)
const DEMON_SPELLS_TO_TRACK = ['agonizingsymphony', 'pestilence', 'pactofruin'];

function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function runGame(gameId, p1Deck, p2Deck) {
  let state = createGame(p1Deck, p2Deck);

  // Throne proximity tracking — per player
  const firstTurnWithinDist2 = [null, null];
  const firstTurnOnThrone    = [null, null];
  const turnsOnThrone        = [0, 0];

  // Cards played per player
  const cardsPlayedByPlayer = [new Set(), new Set()];

  let turnCount      = 0;
  let actionCount    = 0;
  let actionsThisTurn = 0;
  let commandsUsed   = 0;
  let forceDraw      = false;
  let actionLimitHit = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) {
      forceDraw      = true;
      actionLimitHit = true;
      break;
    }

    const ap = state.activePlayer;

    let action;
    if (actionsThisTurn >= MAX_ACTIONS_PER_TURN) {
      action = { type: 'endTurn' };
    } else {
      action = chooseActionMinimax(state, commandsUsed, { timeBudget: TIME_BUDGET });
    }

    // Track card plays before apply (look up card.id from cardUid in hand)
    if ((action.type === 'summon' || action.type === 'cast') && action.cardUid) {
      const card = state.players[ap].hand.find(c => c.uid === action.cardUid);
      if (card?.id) cardsPlayedByPlayer[ap].add(card.id);
    }

    state = applyAction(state, action);
    actionCount++;

    if (action.type === 'endTurn') {
      // Sample champion position at end-of-turn
      const champ = state.champions[ap];
      if (champ) {
        const dist = manhattan([champ.row, champ.col], [THRONE_ROW, THRONE_COL]);
        if (dist <= 2 && firstTurnWithinDist2[ap] === null) {
          firstTurnWithinDist2[ap] = turnCount;
        }
        if (dist === 0) {
          if (firstTurnOnThrone[ap] === null) firstTurnOnThrone[ap] = turnCount;
          turnsOnThrone[ap]++;
        }
      }

      turnCount++;
      commandsUsed    = 0;
      actionsThisTurn = 0;
    } else {
      if (action.type === 'move') commandsUsed++;
      actionsThisTurn++;
    }
  }

  const { over, winner: gameWinner } = isGameOver(state);
  const winner = (!forceDraw && over) ? gameWinner : 'draw';

  return {
    gameId,
    p1Deck,
    p2Deck,
    winner,
    turns: turnCount,
    actionLimitHit,
    firstTurnWithinDist2,
    firstTurnOnThrone,
    turnsOnThrone,
    cardsPlayedByPlayer: [
      [...cardsPlayedByPlayer[0]],
      [...cardsPlayedByPlayer[1]],
    ],
  };
}

function aggregateMatchup(label, p1Deck, p2Deck, results) {
  const n = results.length;
  let p1Wins = 0, p2Wins = 0, draws = 0, totalTurns = 0;
  let actionLimitHits = 0;
  let decisiveGames   = 0;
  const sumDist2      = [0, 0];
  const cntDist2      = [0, 0];
  const sumThrone     = [0, 0];
  const cntThrone     = [0, 0];
  const throneCtrlSum = [0, 0];

  // Spell cast counts: spellId → count of games where it appeared
  const spellGamesPlayed = {}; // spellId → count of games where at least one play occurred
  for (const spellId of DEMON_SPELLS_TO_TRACK) spellGamesPlayed[spellId] = 0;

  for (const r of results) {
    if      (r.winner === 'p1') { p1Wins++;  decisiveGames++; }
    else if (r.winner === 'p2') { p2Wins++;  decisiveGames++; }
    else draws++;

    totalTurns += r.turns;
    if (r.actionLimitHit) actionLimitHits++;

    for (let p = 0; p < 2; p++) {
      if (r.firstTurnWithinDist2[p] !== null) {
        sumDist2[p] += r.firstTurnWithinDist2[p];
        cntDist2[p]++;
      }
      if (r.firstTurnOnThrone[p] !== null) {
        sumThrone[p] += r.firstTurnOnThrone[p];
        cntThrone[p]++;
      }
      throneCtrlSum[p] += r.turnsOnThrone[p];

      // Track demon spells (regardless of which player slot demon occupies)
      const faction = p === 0 ? p1Deck : p2Deck;
      if (faction === 'demon') {
        for (const spellId of DEMON_SPELLS_TO_TRACK) {
          if (r.cardsPlayedByPlayer[p].includes(spellId)) {
            spellGamesPlayed[spellId]++;
          }
        }
      }
    }
  }

  return {
    label, p1Deck, p2Deck, n,
    p1Wins, p2Wins, draws, decisiveGames,
    dr:      +(draws       / n * 100).toFixed(1),
    p1wr:    +(p1Wins      / n * 100).toFixed(1),
    p2wr:    +(p2Wins      / n * 100).toFixed(1),
    avgTurns: +(totalTurns / n).toFixed(1),
    actionLimitHits,
    avgDist2: [
      cntDist2[0] > 0 ? +(sumDist2[0] / cntDist2[0]).toFixed(1) : null,
      cntDist2[1] > 0 ? +(sumDist2[1] / cntDist2[1]).toFixed(1) : null,
    ],
    avgThroneFirst: [
      cntThrone[0] > 0 ? +(sumThrone[0] / cntThrone[0]).toFixed(1) : null,
      cntThrone[1] > 0 ? +(sumThrone[1] / cntThrone[1]).toFixed(1) : null,
    ],
    avgThroneControl: [
      +(throneCtrlSum[0] / n).toFixed(2),
      +(throneCtrlSum[1] / n).toFixed(2),
    ],
    spellGamesPlayed,   // per-game occurrence rate for demon spells
    demonGames: results.filter(r => r.p1Deck === 'demon' || r.p2Deck === 'demon').length,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const FACTIONS = ['human', 'beast', 'elf', 'demon'];
const PAIRS = [];
for (let i = 0; i < FACTIONS.length; i++) {
  for (let j = i + 1; j < FACTIONS.length; j++) {
    PAIRS.push([FACTIONS[i], FACTIONS[j]]);
  }
}

const GAMES_PER_DIRECTION = 5; // 5 × 2 directions = 10 per matchup, 60 total

const t0 = Date.now();
console.log('\n=== Post-Fix Comprehensive Baseline Matrix — LOG-1552 ===');
console.log(`Label: baseline-post-april-18-fixes`);
console.log(`Config: timeBudget=${TIME_BUDGET}ms, MAX_TURNS=${MAX_TURNS}, MAX_ACTIONS=${MAX_ACTIONS_GAME}`);
console.log(`${PAIRS.length} pairs × 2 directions × ${GAMES_PER_DIRECTION} games = ${PAIRS.length * 2 * GAMES_PER_DIRECTION} total games\n`);

const matchupStats = [];
let globalGameId   = 1;

for (const [fA, fB] of PAIRS) {
  // Run both directions combined into a single "matchup" entry
  const allResults = [];

  process.stdout.write(`  ${fA} vs ${fB} (dir 1)... `);
  for (let i = 0; i < GAMES_PER_DIRECTION; i++) {
    allResults.push(runGame(globalGameId++, fA, fB));
  }
  const d1Wins = allResults.filter(r => r.winner === 'p1').length;
  console.log(`done (${fA} p1-wins: ${d1Wins}/${GAMES_PER_DIRECTION})`);

  process.stdout.write(`  ${fB} vs ${fA} (dir 2)... `);
  const dir2Results = [];
  for (let i = 0; i < GAMES_PER_DIRECTION; i++) {
    const r = runGame(globalGameId++, fB, fA);
    dir2Results.push(r);
    allResults.push(r);
  }
  const d2Wins = dir2Results.filter(r => r.winner === 'p1').length;
  console.log(`done (${fB} p1-wins: ${d2Wins}/${GAMES_PER_DIRECTION})`);

  const label = `${fA[0].toUpperCase()}v${fB[0].toUpperCase()}`;
  const stats = aggregateMatchup(label, fA, fB, allResults);
  matchupStats.push(stats);
}

// ── Print results ─────────────────────────────────────────────────────────────

const runtimeSec = ((Date.now() - t0) / 1000).toFixed(0);

console.log('\n══════════════════════════════════════════════════════════');
console.log('RESULTS — Per Matchup');
console.log('══════════════════════════════════════════════════════════\n');

for (const s of matchupStats) {
  const drFlag      = s.dr > 50 ? ' ⚑ DR>50%' : s.dr > 30 ? ' ⚠ DR>30%' : '';
  const limitsStr   = s.actionLimitHits > 0 ? `  actionLimitHits=${s.actionLimitHits}` : '';
  const d2Str = s.avgDist2.map(v => v === null ? 'N/A' : v).join(' / ');
  const thrStr = s.avgThroneFirst.map(v => v === null ? 'N/A' : v).join(' / ');

  console.log(`${s.label} (${s.p1Deck} vs ${s.p2Deck}, n=${s.n})`);
  console.log(`  P1 WR: ${s.p1wr}%  P2 WR: ${s.p2wr}%  DR: ${s.dr}%${drFlag}  AvgTurns: ${s.avgTurns}${limitsStr}`);
  console.log(`  Decisive wins: ${s.decisiveGames}/${s.n}  (draws: ${s.draws})`);
  console.log(`  Avg turn champion within dist 2 of Throne: P1=${s.avgDist2[0] ?? 'N/A'}  P2=${s.avgDist2[1] ?? 'N/A'}`);
  console.log(`  Avg turn champion first on Throne:         P1=${s.avgThroneFirst[0] ?? 'N/A'}  P2=${s.avgThroneFirst[1] ?? 'N/A'}`);
  console.log(`  Avg turns champion on Throne per game:     P1=${s.avgThroneControl[0]}  P2=${s.avgThroneControl[1]}`);

  // Demon spell rates (only in matchups involving demon)
  if (s.p1Deck === 'demon' || s.p2Deck === 'demon') {
    const demSpells = DEMON_SPELLS_TO_TRACK.map(id => {
      const rate = s.n > 0 ? (s.spellGamesPlayed[id] / s.n * 100).toFixed(0) : 0;
      return `${id}=${s.spellGamesPlayed[id]}/${s.n}(${rate}%)`;
    }).join('  ');
    console.log(`  Demon spells (games with ≥1 cast): ${demSpells}`);
  }
  console.log('');
}

// ── Aggregate summary ─────────────────────────────────────────────────────────

const totalGames    = matchupStats.reduce((s, m) => s + m.n, 0);
const totalDraws    = matchupStats.reduce((s, m) => s + m.draws, 0);
const totalDecisive = matchupStats.reduce((s, m) => s + m.decisiveGames, 0);
const totalALHits   = matchupStats.reduce((s, m) => s + m.actionLimitHits, 0);
const aggDR         = +(totalDraws / totalGames * 100).toFixed(1);

console.log('══════════════════════════════════════════════════════════');
console.log('AGGREGATE SUMMARY');
console.log('══════════════════════════════════════════════════════════\n');

for (const s of matchupStats) {
  const flag = s.dr > 50 ? ' ⚑' : s.dr > 30 ? ' ⚠' : ' ✓';
  console.log(`  ${s.label.padEnd(4)} ${s.p1Deck.padEnd(7)} vs ${s.p2Deck.padEnd(7)}  DR=${String(s.dr+'%').padEnd(7)} P1=${s.p1wr}%  P2=${s.p2wr}%${flag}`);
}
console.log(`\n  Aggregate DR: ${aggDR}% (${totalDraws}/${totalGames} draws)`);
console.log(`  Decisive games: ${totalDecisive}/${totalGames}`);
console.log(`  Action-limit hits: ${totalALHits}/${totalGames}`);
console.log(`  Runtime: ${runtimeSec}s`);

// ── Flags ─────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('FLAGS');
console.log('══════════════════════════════════════════════════════════\n');

let flagCount = 0;

// Per-faction win rates
const factionWins  = {};
const factionGames = {};
for (const f of FACTIONS) { factionWins[f] = 0; factionGames[f] = 0; }
for (const s of matchupStats) {
  for (const r of []) { /* no per-game results here — use matchup stats */ }
  // Approximate combined WR from matchup-level data
  // fA side: p1Wins in dir1 + p2Wins in dir2 = fA wins
  // We don't have direction-split data here, so skip per-faction WR
}

for (const s of matchupStats) {
  if (s.dr > 50) {
    console.log(`  ⚑ CRITICAL DR: ${s.label} DR=${s.dr}% (above 50% threshold)`);
    flagCount++;
  } else if (s.dr > 30) {
    console.log(`  ⚠ ELEVATED DR: ${s.label} DR=${s.dr}% (above 30% threshold)`);
    flagCount++;
  }
}

// Spell parity check
for (const s of matchupStats) {
  if (s.p1Deck === 'demon' || s.p2Deck === 'demon') {
    for (const spellId of DEMON_SPELLS_TO_TRACK) {
      if (s.spellGamesPlayed[spellId] === 0) {
        console.log(`  ⚑ SPELL PARITY FAIL: ${spellId} never cast in ${s.label} (demon involved)`);
        flagCount++;
      }
    }
  }
}

// Throne proximity check — both AIs should reach dist 2 in all matchups
for (const s of matchupStats) {
  if (s.avgDist2[0] === null) {
    console.log(`  ⚠ THRONE: P1 (${s.p1Deck}) never reached dist≤2 in ${s.label}`);
    flagCount++;
  }
  if (s.avgDist2[1] === null) {
    console.log(`  ⚠ THRONE: P2 (${s.p2Deck}) never reached dist≤2 in ${s.label}`);
    flagCount++;
  }
}

if (flagCount === 0) {
  console.log('  None — all checks passed.');
}

console.log(`\n  Comparison to pre-fix 3-matchup baseline:`);
console.log(`    Pre-fix (weight=0 baseline): HvB 20%  EvD 70%  HvE 50%  Aggregate 46.7%`);
console.log(`    This run:                    HvB ${matchupStats.find(s=>s.label==='HV' || (s.p1Deck==='human'&&s.p2Deck==='beast'))?.dr??'?'}%`);

// Better label lookup
const hvb = matchupStats.find(s => (s.p1Deck==='human'&&s.p2Deck==='beast'));
const evd = matchupStats.find(s => (s.p1Deck==='elf'  &&s.p2Deck==='demon'));
const hve = matchupStats.find(s => (s.p1Deck==='human'&&s.p2Deck==='elf'));

if (hvb && evd && hve) {
  const sub3DR = ((hvb.draws + evd.draws + hve.draws) / (hvb.n + evd.n + hve.n) * 100).toFixed(1);
  console.log('\n  3-matchup sub-baseline comparison (HvB, EvD, HvE):');
  console.log(`    Pre-fix (weight=0): HvB=20%  EvD=70%  HvE=50%  Agg=46.7%`);
  console.log(`    This run:           HvB=${hvb.dr}%  EvD=${evd.dr}%  HvE=${hve.dr}%  Agg=${sub3DR}%`);
}

console.log('');
