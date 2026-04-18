/**
 * runEvalDiagnostic.js
 *
 * Diagnostic run: per-term eval contribution analysis for Elf (Mystic) vs Demon (Dark).
 * Branch: diag/eval-term-contributions
 *
 * Usage:
 *   node scripts/simulation/runEvalDiagnostic.js
 *
 * Produces:
 *   scripts/simulation/memory/eval-contributions-2026-04-18.jsonl
 *
 * Question: Which eval terms produce the observed Mystic advantage over Dark?
 * Is it (a) terms that inherently favor Mystic strategies, (b) faction-specific weight
 * imbalances, or (c) Dark-specific cards being undervalued by the eval function?
 */

import { appendFileSync, writeFileSync, readFileSync } from 'fs';
import { runGame } from './runSimulation.js';
import { setEvalLogger, clearEvalLogger } from './boardEval.js';

const OUTPUT_JSONL = 'scripts/simulation/memory/eval-contributions-2026-04-18.jsonl';

// Clear/initialize the output file
writeFileSync(OUTPUT_JSONL, '');

let logCount = 0;

function makeLogger() {
  return (record) => {
    appendFileSync(OUTPUT_JSONL, JSON.stringify(record) + '\n');
    logCount++;
  };
}

const AI_OPTS = { ai: 'minimax', depth: 20, timeBudget: 200 };

console.log('=== Eval Contribution Diagnostic — Elf vs Demon ===');
console.log('Run type: Diagnostic');
console.log('Baseline: commit 028b8e7 (current main)');
console.log('Config: timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600, 10 games (5 EvD Elf-P1, 5 EvD Demon-P1)');
console.log('');

const results = [];

// 5 games: Elf as P1, Demon as P2
console.log('--- Phase 1: Elf(P1) vs Demon(P2) — 5 games ---');
for (let g = 0; g < 5; g++) {
  setEvalLogger(makeLogger());
  const result = runGame(g + 1, 'elf', 'demon', AI_OPTS);
  clearEvalLogger();
  results.push({ ...result, phase: 'elf_p1' });
  const w = result.winner === 'p1' ? 'Elf' : result.winner === 'p2' ? 'Demon' : 'Draw';
  console.log(`  Game ${g + 1}: ${w} | turns=${result.turns} | p1hp=${result.p1FinalHP} | p2hp=${result.p2FinalHP}`);
}

// 5 games: Demon as P1, Elf as P2
console.log('--- Phase 2: Demon(P1) vs Elf(P2) — 5 games ---');
for (let g = 0; g < 5; g++) {
  setEvalLogger(makeLogger());
  const result = runGame(g + 6, 'demon', 'elf', AI_OPTS);
  clearEvalLogger();
  results.push({ ...result, phase: 'demon_p1' });
  const w = result.winner === 'p1' ? 'Demon' : result.winner === 'p2' ? 'Elf' : 'Draw';
  console.log(`  Game ${g + 6}: ${w} | turns=${result.turns} | p1hp=${result.p1FinalHP} | p2hp=${result.p2FinalHP}`);
}

console.log('');
console.log(`Total log entries: ${logCount}`);
console.log(`JSONL written to: ${OUTPUT_JSONL}`);
console.log('');

// ── Analysis ──────────────────────────────────────────────────────────────────

console.log('=== Analysis ===');
console.log('');

// Parse the JSONL and aggregate by faction
const lines = readFileSync(OUTPUT_JSONL, 'utf8').trim().split('\n').filter(Boolean);
const records = lines.map(l => JSON.parse(l));

console.log(`Total evaluation samples loaded: ${records.length}`);

// Group by faction
const byFaction = {};
for (const r of records) {
  const f = r.faction;
  if (!byFaction[f]) byFaction[f] = [];
  byFaction[f].push(r);
}

for (const [f, recs] of Object.entries(byFaction)) {
  console.log(`  faction=${f}: ${recs.length} samples`);
}

console.log('');

// Aggregate average contribution per term per faction
// allTerms contains all 31 terms with their contributions
const termNames = records[0]?.allTerms?.map(t => t.name) ?? [];

const termStats = {}; // faction → { termName → { sum, count, absPctSum } }

for (const r of records) {
  const f = r.faction;
  if (!termStats[f]) termStats[f] = {};
  const total = Math.abs(r.totalScore) || 1;
  for (const t of (r.allTerms ?? [])) {
    if (!termStats[f][t.name]) termStats[f][t.name] = { sum: 0, count: 0, absPctSum: 0 };
    termStats[f][t.name].sum     += t.contrib;
    termStats[f][t.name].count   += 1;
    termStats[f][t.name].absPctSum += Math.abs(t.contrib) / total * 100;
  }
}

// Compute averages
const avgContrib = {}; // faction → { termName → { avg, avgAbsPct } }
for (const [f, terms] of Object.entries(termStats)) {
  avgContrib[f] = {};
  for (const [name, s] of Object.entries(terms)) {
    avgContrib[f][name] = {
      avg:       s.count > 0 ? s.sum / s.count : 0,
      avgAbsPct: s.count > 0 ? s.absPctSum / s.count : 0,
    };
  }
}

const mysticAvg = avgContrib['mystic'] ?? {};
const darkAvg   = avgContrib['dark']   ?? {};

// Print average contribution table
const allTermNames = [...new Set([...Object.keys(mysticAvg), ...Object.keys(darkAvg)])];

console.log('=== Average Contribution Per Term Per Faction ===');
console.log('');
console.log(`${'Term'.padEnd(30)} ${'Mystic(Elf)'.padStart(14)} ${'Dark(Demon)'.padStart(12)} ${'Ratio(M/D)'.padStart(12)}`);
console.log('-'.repeat(72));

const rows = allTermNames.map(name => {
  const m = mysticAvg[name]?.avg ?? 0;
  const d = darkAvg[name]?.avg   ?? 0;
  const ratio = d !== 0 ? m / d : (m !== 0 ? Infinity : 1);
  return { name, m, d, ratio };
});

// Sort by absolute mystic avg descending
rows.sort((a, b) => Math.abs(b.m) - Math.abs(a.m));

for (const { name, m, d, ratio } of rows) {
  const mStr     = m.toFixed(2).padStart(14);
  const dStr     = d.toFixed(2).padStart(12);
  const ratioStr = isFinite(ratio) ? ratio.toFixed(2).padStart(12) : '     ∞'.padStart(12);
  console.log(`${name.padEnd(30)} ${mStr} ${dStr} ${ratioStr}`);
}

console.log('');

// ── Flag: terms where Elf contribution >= 2× Demon's ─────────────────────────
console.log('=== FLAG: Terms where |Mystic avg| >= 2× |Dark avg| (Mystic advantage candidates) ===');
let found = false;
for (const { name, m, d } of rows) {
  if (Math.abs(m) > 0.1 && Math.abs(d) > 0 && Math.abs(m) >= 2 * Math.abs(d)) {
    console.log(`  ${name.padEnd(30)}  Mystic=${m.toFixed(2)}  Dark=${d.toFixed(2)}  ratio=${(Math.abs(m)/Math.abs(d)).toFixed(2)}×`);
    found = true;
  }
}
if (!found) console.log('  (none)');

console.log('');

// ── Flag: terms where Demon contribution >= 2× Elf's ─────────────────────────
console.log('=== FLAG: Terms where |Dark avg| >= 2× |Mystic avg| (Dark advantage candidates) ===');
found = false;
for (const { name, m, d } of rows) {
  if (Math.abs(d) > 0.1 && Math.abs(m) > 0 && Math.abs(d) >= 2 * Math.abs(m)) {
    console.log(`  ${name.padEnd(30)}  Mystic=${m.toFixed(2)}  Dark=${d.toFixed(2)}  ratio=${(Math.abs(d)/Math.abs(m)).toFixed(2)}×`);
    found = true;
  }
}
if (!found) console.log('  (none)');

console.log('');

// ── Flag: major asymmetry (>30% for one, <10% for the other) ─────────────────
console.log('=== FLAG: Major asymmetry (>30% share for one faction, <10% for other) ===');
found = false;
for (const name of allTermNames) {
  const mPct = mysticAvg[name]?.avgAbsPct ?? 0;
  const dPct = darkAvg[name]?.avgAbsPct   ?? 0;
  if ((mPct > 30 && dPct < 10) || (dPct > 30 && mPct < 10)) {
    console.log(`  ${name.padEnd(30)}  Mystic%=${mPct.toFixed(1)}%  Dark%=${dPct.toFixed(1)}%`);
    found = true;
  }
}
if (!found) console.log('  (none)');

console.log('');

// ── Top 5 terms by contribution per faction ───────────────────────────────────
console.log('=== Top 5 Highest-Contributing Terms per Faction ===');

for (const [faction, avgs] of Object.entries(avgContrib)) {
  const sorted = Object.entries(avgs)
    .map(([name, s]) => ({ name, avg: s.avg, absPct: s.avgAbsPct }))
    .sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg))
    .slice(0, 5);
  console.log(`  ${faction === 'mystic' ? 'Mystic (Elf)' : 'Dark (Demon)'}:`);
  for (const { name, avg, absPct } of sorted) {
    console.log(`    ${name.padEnd(30)} avg=${avg.toFixed(2).padStart(8)}  share=${absPct.toFixed(1)}%`);
  }
}

console.log('');

// ── Game summary ──────────────────────────────────────────────────────────────
console.log('=== Game Outcomes ===');
const elfWins   = results.filter(r => (r.phase === 'elf_p1'   && r.winner === 'p1') || (r.phase === 'demon_p1' && r.winner === 'p2')).length;
const demonWins = results.filter(r => (r.phase === 'demon_p1' && r.winner === 'p1') || (r.phase === 'elf_p1'   && r.winner === 'p2')).length;
const draws     = results.filter(r => r.winner === null).length;
const totalGames = results.length;

console.log(`  Total games: ${totalGames}`);
console.log(`  Elf wins:    ${elfWins}  (${(elfWins/totalGames*100).toFixed(0)}%)`);
console.log(`  Demon wins:  ${demonWins}  (${(demonWins/totalGames*100).toFixed(0)}%)`);
console.log(`  Draws:       ${draws}  DR=${(draws/totalGames*100).toFixed(0)}%`);
