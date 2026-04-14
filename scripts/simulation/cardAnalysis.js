/**
 * cardAnalysis.js
 *
 * Reads a pairing matrix result JSON and produces card-level analysis:
 * - Card inclusion rate (how often each card appears in generated decks)
 * - Card win rate (win rate of decks containing vs. not containing each card)
 * - Overperformers: cards with > 10pp above-average win rate when included
 * - Underperformers: cards with below-average win rate when included
 * - Unused cards: cards that never appeared in any generated deck
 *
 * Usage:
 *   node cardAnalysis.js [--input path/to/pairing_matrix.json]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { CARD_DB } from '../../src/engine/cards.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  let input = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input') input = argv[++i];
  }
  return { input };
}

const { input: inputPath } = parseArgs(process.argv);
if (!inputPath) {
  console.error('Usage: node cardAnalysis.js --input path/to/pairing_matrix.json');
  process.exit(1);
}

// ── Load results ──────────────────────────────────────────────────────────────

let data;
try {
  data = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (e) {
  console.error(`Failed to read ${inputPath}: ${e.message}`);
  process.exit(1);
}

const { cardAnalysis, report, matchups } = data;

// ── Card pool reference ───────────────────────────────────────────────────────

// All non-token cards that could appear in generated decks
const allPoolCardIds = new Set(
  Object.values(CARD_DB)
    .filter(c => !c.token)
    .map(c => c.id)
);

// Cards that appeared in at least one generated deck
const seenCardIds = new Set(Object.keys(cardAnalysis ?? {}));

// Cards never seen in any deck
const unusedCardIds = [...allPoolCardIds].filter(id => !seenCardIds.has(id));

// ── Compute average win rate across all analyzed cards ────────────────────────

const withRates = Object.values(cardAnalysis ?? {})
  .filter(s => s.winRateWith != null)
  .map(s => s.winRateWith);
const avgWinRateOverall = withRates.length > 0
  ? withRates.reduce((a, b) => a + b, 0) / withRates.length
  : 0.5;

// ── Classify cards ────────────────────────────────────────────────────────────

const MIN_GAMES_THRESHOLD = 5; // minimum games to qualify for classification

const overperformers  = [];
const underperformers = [];
const normalCards     = [];

for (const [cardId, stats] of Object.entries(cardAnalysis ?? {})) {
  if (stats.winRateWith == null || stats.gamesWithCard < MIN_GAMES_THRESHOLD) continue;

  const impact = stats.winRateImpact ?? (stats.winRateWith - avgWinRateOverall);
  const entry = { cardId, ...stats, impact };

  if (impact > 0.10) {
    overperformers.push(entry);
  } else if (impact < -0.10) {
    underperformers.push(entry);
  } else {
    normalCards.push(entry);
  }
}

overperformers.sort((a, b) => b.impact - a.impact);
underperformers.sort((a, b) => a.impact - b.impact);

// ── Compute inclusion rate (how often each card appears in generated decks) ───

// From the matchups data: each game has p1CardIds and p2CardIds as card ID arrays
// We look at them as Sets per game (a card either appears or not in the 30-card deck)
const inclusionStats = new Map(); // cardId → { totalDecks, includedIn }

let totalDeckSlots = 0;
if (matchups) {
  for (const matchup of matchups) {
    for (const game of matchup.results ?? []) {
      // If per-game cardIds were stripped, we can't compute per-game inclusion
      if (!game.p1CardIds && !game.p2CardIds) continue;
      for (const [cardIds] of [[game.p1CardIds], [game.p2CardIds]]) {
        if (!cardIds) continue;
        totalDeckSlots++;
        const cardSet = new Set(cardIds);
        for (const cardId of allPoolCardIds) {
          if (!inclusionStats.has(cardId)) {
            inclusionStats.set(cardId, { totalDecks: 0, includedIn: 0 });
          }
          const s = inclusionStats.get(cardId);
          s.totalDecks++;
          if (cardSet.has(cardId)) s.includedIn++;
        }
      }
    }
  }
}

// ── Print report ──────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════');
console.log('  CARD ANALYSIS REPORT');
console.log('════════════════════════════════════════════════════════════');
console.log(`  Source: ${inputPath}`);
console.log(`  Total matchups analyzed: ${matchups?.length ?? 'N/A'}`);
console.log(`  Average win rate (overall): ${(avgWinRateOverall * 100).toFixed(1)}%`);
console.log(`  Cards seen in decks: ${seenCardIds.size} / ${allPoolCardIds.size}`);

console.log('\n── Overperformers (>10pp above avg when included) ───────────');
if (overperformers.length === 0) {
  console.log('  None.');
} else {
  for (const c of overperformers) {
    const name = CARD_DB[c.cardId]?.name ?? c.cardId;
    console.log(
      `  ${name.padEnd(30)} impact: +${(c.impact * 100).toFixed(1)}pp` +
      `  win%: ${(c.winRateWith * 100).toFixed(1)}%  n=${c.gamesWithCard}`
    );
  }
}

console.log('\n── Underperformers (>10pp below avg when included) ──────────');
if (underperformers.length === 0) {
  console.log('  None.');
} else {
  for (const c of underperformers) {
    const name = CARD_DB[c.cardId]?.name ?? c.cardId;
    console.log(
      `  ${name.padEnd(30)} impact: ${(c.impact * 100).toFixed(1)}pp` +
      `  win%: ${(c.winRateWith * 100).toFixed(1)}%  n=${c.gamesWithCard}`
    );
  }
}

console.log('\n── Unused Cards (never appeared in generated decks) ─────────');
if (unusedCardIds.length === 0) {
  console.log('  None — all cards appeared in at least one deck.');
} else {
  for (const id of unusedCardIds.sort()) {
    const name = CARD_DB[id]?.name ?? id;
    const attr = CARD_DB[id]?.attribute ?? '?';
    console.log(`  ${name.padEnd(30)} [${attr}]`);
  }
}

if (inclusionStats.size > 0) {
  console.log('\n── Card Inclusion Rates (top 20 most included) ──────────────');
  const sorted = [...inclusionStats.entries()]
    .filter(([, s]) => s.totalDecks > 0)
    .map(([cardId, s]) => ({ cardId, rate: s.includedIn / s.totalDecks, count: s.includedIn, total: s.totalDecks }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 20);

  for (const { cardId, rate, count, total } of sorted) {
    const name = CARD_DB[cardId]?.name ?? cardId;
    console.log(`  ${name.padEnd(30)} ${(rate * 100).toFixed(1)}% (${count}/${total} decks)`);
  }
}

console.log('\n════════════════════════════════════════════════════════════\n');

// ── Save analysis ─────────────────────────────────────────────────────────────

mkdirSync('scripts/simulation/memory/results', { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = `scripts/simulation/card_analysis_${timestamp}.json`;

const output = {
  meta: {
    date: new Date().toISOString(),
    sourceFile: inputPath,
    avgWinRateOverall: +avgWinRateOverall.toFixed(4),
    totalCards: allPoolCardIds.size,
    seenCards:  seenCardIds.size,
    unusedCards: unusedCardIds.length,
  },
  overperformers:  overperformers.map(c => ({ cardId: c.cardId, name: CARD_DB[c.cardId]?.name, impact: +c.impact.toFixed(4), winRateWith: c.winRateWith, gamesWithCard: c.gamesWithCard })),
  underperformers: underperformers.map(c => ({ cardId: c.cardId, name: CARD_DB[c.cardId]?.name, impact: +c.impact.toFixed(4), winRateWith: c.winRateWith, gamesWithCard: c.gamesWithCard })),
  unusedCards: unusedCardIds.map(id => ({ cardId: id, name: CARD_DB[id]?.name, attribute: CARD_DB[id]?.attribute })),
  fullCardAnalysis: cardAnalysis,
};

writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Card analysis saved to: ${outPath}`);
