/**
 * evolve.js
 *
 * Evolutionary weight tuning for boardEval.js FACTION_WEIGHTS profiles.
 *
 * Algorithm:
 *   1. Generate a population of N weight sets (mutations of the current faction profiles)
 *   2. Run a round-robin tournament — each weight set plays both sides vs all others
 *   3. Score each weight set by: wins + 0.5×draws (across all matchups)
 *   4. Select top-50% (elites) unchanged, generate 50% new children by mutation
 *   5. Repeat for G generations
 *   6. Report the best weight set found and compare to baseline
 *
 * Usage:
 *   node evolve.js [--generations 5] [--population 20] [--games 10] [--faction primal]
 *   node evolve.js --test   # 1-generation test with 5 weight sets
 *
 * The faction flag specifies which FACTION_WEIGHTS profile to evolve.
 * Only one faction is evolved per run to keep tournament size manageable.
 *
 * IMPORTANT: This script does NOT modify boardEval.js automatically.
 * It reports the best weights found and the analyst must propose changes for board approval.
 */

import { writeFileSync } from 'fs';
import { createPairingGame, applyAction, isGameOver } from './pairingGameEngine.js';
import { buildDeck, ALL_PAIRINGS, CHAMPION_TO_DECKID } from './deckBuilder.js';
import { chooseActionMinimax } from './minimaxAI.js';
import { FACTION_WEIGHTS, WEIGHTS } from './boardEval.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    generations: 5,
    population:  20,
    games:       10,   // games per directional matchup in tournament
    faction:     'primal',
    depth:       2,
    test:        false,
    output:      null,
  };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--generations': args.generations = parseInt(argv[++i], 10); break;
      case '--population':  args.population  = parseInt(argv[++i], 10); break;
      case '--games':       args.games       = parseInt(argv[++i], 10); break;
      case '--faction':     args.faction     = argv[++i]; break;
      case '--depth':       args.depth       = parseInt(argv[++i], 10); break;
      case '--output':      args.output      = argv[++i]; break;
      case '--test':
        args.generations = 1;
        args.population  = 5;
        args.games       = 5;
        args.test        = true;
        break;
    }
  }
  return args;
}

// ── Weight mutation ───────────────────────────────────────────────────────────

/**
 * The keys that will be evolved. Omits keys that have no effect on strategy
 * or are handled outside boardEval (e.g. gameLengthPenalty).
 */
const EVOLVABLE_KEYS = [
  'championHP',
  'championHPDiff',
  'unitCountDiff',
  'totalATKOnBoard',
  'totalHPOnBoard',
  'throneControl',
  'unitsThreateningChampion',
  'unitsAdjacentToAlly',
  'cardsInHand',
  'hiddenUnits',
  'lethalThreat',
  'championProximity',
  'opponentChampionLowHP',
  'relicsOnBoard',
  'terrainBenefit',
  'terrainHarm',
  'healingValue',
];

/**
 * Mutate a weight set.
 * Each key is independently perturbed: 70% chance of change, Gaussian-style
 * perturbation of ±30% of the current value, clamped to [0, 100].
 *
 * @param {object} weights - source weight set
 * @param {number} rate    - mutation rate (fraction of keys changed, default 0.5)
 * @param {number} scale   - perturbation scale factor (default 0.3 = ±30%)
 * @returns {object}         new weight set (copy)
 */
function mutate(weights, rate = 0.5, scale = 0.3) {
  const out = { ...weights };
  for (const key of EVOLVABLE_KEYS) {
    if (Math.random() < rate) {
      const current = out[key] ?? 0;
      // Gaussian approximation: sum of 2 uniforms in [-0.5, 0.5]
      const noise = (Math.random() - 0.5) + (Math.random() - 0.5);
      const delta = noise * scale * Math.max(current, 5); // floor prevents collapse to 0
      out[key] = Math.max(0, Math.min(100, Math.round(current + delta)));
    }
  }
  return out;
}

/**
 * Generate the initial population: the baseline weight set + (N-1) mutations.
 *
 * @param {string} faction  - faction to evolve ('primal'|'mystic'|'light'|'dark')
 * @param {number} size     - population size
 * @returns {object[]}        array of weight objects, first is baseline
 */
function seedPopulation(faction, size) {
  const base = FACTION_WEIGHTS[faction] ?? WEIGHTS;
  const population = [{ ...base, _label: 'baseline' }];
  for (let i = 1; i < size; i++) {
    population.push({ ...mutate(base, 0.6, 0.4), _label: `seed_${i}` });
  }
  return population;
}

// ── Tournament runner ─────────────────────────────────────────────────────────

const MAX_TURNS        = 30;
const MAX_ACTIONS_GAME = 500;

/**
 * Run a single game between two weight sets.
 * p1WeightSet is applied when evaluating P1's position; p2WeightSet for P2.
 *
 * Returns { winner: 'p1'|'p2'|null, turns }
 */
function runTournamentGame(p1Pairing, p2Pairing, p1Weights, p2Weights, depth, deckMode) {
  const p1Build  = buildDeck(p1Pairing.champion, p1Pairing.secondary, deckMode);
  const p2Build  = buildDeck(p2Pairing.champion, p2Pairing.secondary, deckMode);
  const p1DeckId = CHAMPION_TO_DECKID[p1Pairing.champion];
  const p2DeckId = CHAMPION_TO_DECKID[p2Pairing.champion];

  let state = createPairingGame(p1DeckId, p1Build.cardIds, p2DeckId, p2Build.cardIds);

  let turnCount   = 0;
  let actionCount = 0;
  let cmdUsed     = 0;
  let forceDraw   = false;

  while (true) {
    const { over } = isGameOver(state);
    if (over) break;
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) { forceDraw = true; break; }

    const ap = state.activePlayer; // 0 or 1
    const activeWeights = ap === 0 ? p1Weights : p2Weights;

    let action;
    try {
      action = chooseActionMinimax(state, cmdUsed, { depth, weights: activeWeights });
      state = applyAction(state, action);
    } catch (e) {
      forceDraw = true;
      break;
    }
    actionCount++;

    if (action.type === 'move') {
      cmdUsed++;
    } else if (action.type === 'endTurn') {
      turnCount++;
      cmdUsed = 0;
    }
  }

  if (forceDraw) return { winner: null, turns: turnCount };
  const result = isGameOver(state);
  return { winner: result.over ? result.winner : null, turns: turnCount };
}

/**
 * Run a round-robin tournament between all weight sets in the population.
 * Each pair plays `gamesPerDir` games in each direction.
 *
 * Returns scores[i] = tournament score for weight set i (wins + 0.5*draws).
 *
 * @param {object[]} population     - array of weight sets
 * @param {string}   faction        - the faction being evolved
 * @param {number}   gamesPerDir    - games per directional matchup
 * @param {number}   depth          - minimax depth
 * @param {string}   deckMode       - 'curve'
 * @returns {number[]}                scores array
 */
function runTournament(population, faction, gamesPerDir, depth, deckMode) {
  const N = population.length;
  const scores = new Array(N).fill(0);

  // Use only pairings that include the evolved faction
  // (others use baseline weights — we only vary the faction under test)
  const factionPairing = ALL_PAIRINGS.find(p => p.id === faction);
  const opponentPairings = ALL_PAIRINGS.filter(p => p.id !== faction);
  const testPairing = opponentPairings[0] ?? factionPairing; // fallback to self if needed

  let gamesPlayed = 0;

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      // i as P1 (evolved faction) vs j as P2 (test opponent faction)
      for (let g = 0; g < gamesPerDir; g++) {
        const r1 = runTournamentGame(factionPairing, testPairing, population[i], population[j], depth, deckMode);
        if      (r1.winner === 'p1') scores[i] += 1;
        else if (r1.winner === 'p2') scores[j] += 1;
        else { scores[i] += 0.5; scores[j] += 0.5; }
        gamesPlayed++;
      }
      // j as P1 vs i as P2
      for (let g = 0; g < gamesPerDir; g++) {
        const r2 = runTournamentGame(factionPairing, testPairing, population[j], population[i], depth, deckMode);
        if      (r2.winner === 'p1') scores[j] += 1;
        else if (r2.winner === 'p2') scores[i] += 1;
        else { scores[i] += 0.5; scores[j] += 0.5; }
        gamesPlayed++;
      }
    }
  }

  process.stderr.write(`  Tournament complete: ${gamesPlayed} games, ${N} weight sets\n`);
  return scores;
}

// ── Evolutionary loop ─────────────────────────────────────────────────────────

/**
 * Select elites and generate next generation.
 * Top 50% survive unchanged. Bottom 50% replaced by mutations of random elites.
 *
 * @param {object[]} population  - current population
 * @param {number[]} scores      - tournament scores
 * @returns {object[]}             next generation
 */
function nextGeneration(population, scores) {
  const N = population.length;
  // Sort by score descending
  const ranked = population.map((w, i) => ({ w, score: scores[i], idx: i }))
    .sort((a, b) => b.score - a.score);

  const eliteCount = Math.ceil(N / 2);
  const elites = ranked.slice(0, eliteCount).map(r => r.w);

  const next = [...elites];
  while (next.length < N) {
    const parent = elites[Math.floor(Math.random() * elites.length)];
    next.push({ ...mutate(parent, 0.4, 0.25), _label: `gen_child_${next.length}` });
  }

  return next;
}

/**
 * Compare two weight sets and return a diff string showing changed keys.
 */
function weightDiff(baseline, evolved) {
  const lines = [];
  for (const key of EVOLVABLE_KEYS) {
    const b = baseline[key] ?? 0;
    const e = evolved[key]  ?? 0;
    if (b !== e) {
      const sign = e > b ? '+' : '';
      lines.push(`  ${key.padEnd(28)}: ${String(b).padStart(3)} → ${String(e).padStart(3)} (${sign}${e - b})`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : '  (no changes)';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (!FACTION_WEIGHTS[args.faction]) {
    console.error(`Unknown faction: ${args.faction}. Valid: ${Object.keys(FACTION_WEIGHTS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=== Evolutionary Weight Tuning ===`);
  console.log(`Faction: ${args.faction} | Generations: ${args.generations} | Population: ${args.population} | Games/dir: ${args.games}`);
  if (args.test) console.log('(TEST MODE — reduced parameters)');

  let population = seedPopulation(args.faction, args.population);
  const baseline = { ...population[0] };

  const history = [];
  let bestWeights = null;
  let bestScore   = -Infinity;

  for (let gen = 0; gen < args.generations; gen++) {
    process.stderr.write(`\nGeneration ${gen + 1}/${args.generations}...\n`);
    const scores = runTournament(population, args.faction, args.games, args.depth, 'curve');

    // Track best
    const maxScore = Math.max(...scores);
    const maxIdx   = scores.indexOf(maxScore);
    if (maxScore > bestScore) {
      bestScore   = maxScore;
      bestWeights = { ...population[maxIdx] };
    }

    const totalGames = (args.population * (args.population - 1)) * args.games;
    const avgScore   = scores.reduce((a, b) => a + b, 0) / scores.length;
    history.push({ gen: gen + 1, maxScore, avgScore, bestLabel: population[maxIdx]._label });

    console.log(`Gen ${gen + 1}: best score ${maxScore.toFixed(1)} (${population[maxIdx]._label}), avg ${avgScore.toFixed(1)}`);

    if (gen < args.generations - 1) {
      population = nextGeneration(population, scores);
    }
  }

  // Report
  console.log('\n=== RESULTS ===');
  console.log(`Best weight set (score ${bestScore.toFixed(1)}):`);
  console.log('\nWeight diff vs baseline:');
  console.log(weightDiff(baseline, bestWeights));

  console.log('\nGeneration history:');
  for (const h of history) {
    console.log(`  Gen ${h.gen}: best=${h.maxScore.toFixed(1)} avg=${h.avgScore.toFixed(1)} (${h.bestLabel})`);
  }

  console.log('\nFull best weight set (paste into FACTION_WEIGHTS if approved):');
  const keyLines = EVOLVABLE_KEYS.map(k => `  ${k}: ${bestWeights[k] ?? 0},`).join('\n');
  console.log(`${args.faction}: {\n  ...WEIGHTS,\n${keyLines}\n}`);

  // Save output
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath   = args.output ?? `scripts/simulation/evolve_${args.faction}_${timestamp}.json`;
  const outData   = {
    meta: { faction: args.faction, generations: args.generations, population: args.population, gamesPerDir: args.games, depth: args.depth, timestamp },
    baseline,
    bestWeights,
    bestScore,
    history,
    diff: weightDiff(baseline, bestWeights),
  };
  writeFileSync(outPath, JSON.stringify(outData, null, 2));
  console.log(`\nResults saved: ${outPath}`);
}

main().catch(err => {
  console.error('evolve.js fatal error:', err);
  process.exit(1);
});
