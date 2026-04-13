/**
 * evolve.js
 *
 * Evolutionary weight tuning for boardEval.js WEIGHTS / FACTION_WEIGHTS.
 *
 * Steps:
 *   Step 1 — generatePopulation(seedWeights, populationSize, mutationRange)
 *   Step 2 — runTournament(population, gamesPerPair, options)
 *   Step 3 — runEvolution(generations, populationSize, gamesPerPair, survivorCount, mutationRange)
 *   Step 4 — faction-specific evolution via --faction flag; output evolvedWeights.js
 *
 * Usage:
 *   node evolve.js [--pop 20] [--games 20] [--gen 30] [--survivors 5] [--faction primal]
 *   node evolve.js --pop 4 --games 4 --gen 1    # quick smoke test
 *
 * IMPORTANT: Does NOT modify boardEval.js automatically.
 * Reports best weights found; board must approve before committing to boardEval.js.
 *
 * AI selection note:
 *   The tournament uses a depth-1 boardEval selector: for each legal action,
 *   apply the action then evaluate the resulting state with the candidate weight set.
 *   This is fast (no minimax recursion) and directly exercises the evolved weights.
 *   The heuristic simAI does not call evaluateBoard, so this is the correct fast path
 *   for weight evolution.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { createPairingGame, applyAction, isGameOver, getLegalActions } from './pairingGameEngine.js';
import { buildDeck, ALL_PAIRINGS, CHAMPION_TO_DECKID } from './deckBuilder.js';
import { evaluateBoard, WEIGHTS } from './boardEval.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_TURNS        = 30;
const MAX_ACTIONS_GAME = 800;
const RESULTS_DIR      = 'scripts/simulation/results';

// All weight keys that are evolved. Structural / non-strategy keys are excluded.
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
  'turnAggressionScale',
  'projectedChampionDamage',
];

// ── Step 1: Population Generator ─────────────────────────────────────────────

/**
 * Generate a population of weight sets by mutating the seed.
 *
 * Each weight is multiplied by a random factor in the range
 * [(1 - mutationRange), (1 + mutationRange)], then rounded to the nearest
 * integer and clamped to [0, 100].
 *
 * Member 0 is always the unmodified seed (the "incumbent").
 *
 * @param {object} seedWeights    - source weight set (typically WEIGHTS or FACTION_WEIGHTS[f])
 * @param {number} populationSize - total number of members including the seed
 * @param {number} mutationRange  - fractional perturbation range (default 0.3 = ±30%)
 * @returns {Array<{id: number, weights: object, wins: number, losses: number, draws: number}>}
 */
export function generatePopulation(seedWeights, populationSize = 20, mutationRange = 0.3) {
  const population = [];

  // Member 0: unmodified seed (incumbent)
  population.push({
    id:     0,
    weights: { ...seedWeights },
    wins:   0,
    losses: 0,
    draws:  0,
  });

  // Remaining members: mutations of the seed
  for (let i = 1; i < populationSize; i++) {
    const mutated = { ...seedWeights };
    for (const key of EVOLVABLE_KEYS) {
      const base = seedWeights[key] ?? 0;
      // Random factor uniformly sampled from [1 - range, 1 + range]
      const factor = 1 + (Math.random() * 2 - 1) * mutationRange;
      mutated[key] = Math.max(0, Math.min(100, Math.round(base * factor)));
    }
    population.push({
      id:     i,
      weights: mutated,
      wins:   0,
      losses: 0,
      draws:  0,
    });
  }

  return population;
}

// ── Depth-1 heuristic AI (weight-aware) ──────────────────────────────────────

/**
 * Choose an action using a depth-1 board evaluation with the provided weights.
 * For each legal action, apply it to a cloned state and evaluate the result.
 * Returns the action with the highest evaluation score.
 *
 * This is the "heuristic AI with weight override" path — fast (no recursion),
 * and directly sensitive to the candidate weight set being evolved.
 *
 * @param {object} state        - current game state
 * @param {number} cmdUsed      - unit move commands used this turn
 * @param {object} weights      - weight set to use for evaluation
 * @returns {object}              action to apply
 */
function chooseActionWithWeights(state, cmdUsed, weights) {
  let actions = getLegalActions(state);

  // Enforce 3-command limit for unit moves
  if (cmdUsed >= 3) {
    actions = actions.filter(a => a.type !== 'move');
  }

  if (actions.length === 0) return { type: 'endTurn' };

  const ap = state.activePlayer;

  // Filter out pure endTurn if other options exist (avoid premature passing)
  const nonEnd = actions.filter(a => a.type !== 'endTurn');
  const candidates = nonEnd.length > 0 ? nonEnd : actions;

  let bestScore = -Infinity;
  let bestAction = candidates[0];

  for (const action of candidates) {
    let nextState;
    try {
      nextState = withSilentLogs(() => applyAction(state, action));
    } catch {
      continue;
    }

    // Check for immediate win
    const result = withSilentLogs(() => isGameOver(nextState));
    if (result.over) {
      if (result.winner === 'p1' && ap === 0) return action;
      if (result.winner === 'p2' && ap === 1) return action;
    }

    const score = evaluateBoard(nextState, ap === 0 ? 'p1' : 'p2', weights);
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return bestAction;
}

// ── Verbose log suppressor ────────────────────────────────────────────────────

/**
 * Suppress console.log/warn/info during fn(), then restore.
 * The engine's createInitialState triggers verbose [buildDeck] logging from
 * src/engine/cards.js which cannot be disabled at the source.
 */
function withSilentLogs(fn) {
  const origLog  = console.log;
  const origWarn = console.warn;
  const origInfo = console.info;
  console.log  = () => {};
  console.warn = () => {};
  console.info = () => {};
  try {
    return fn();
  } finally {
    console.log  = origLog;
    console.warn = origWarn;
    console.info = origInfo;
  }
}

// ── Step 2: Round-Robin Tournament Runner ────────────────────────────────────

/**
 * Run a single game between two weight sets.
 * p1Weights and p2Weights are both candidate weights being evaluated.
 *
 * Uses chooseActionWithWeights (depth-1 eval AI) for both players.
 * The faction pairing rotates through all 8 pairings across gamesPerPair games.
 *
 * @param {object} p1Weights  - weight set for player 1
 * @param {object} p2Weights  - weight set for player 2
 * @param {object} pairing    - faction pairing { champion, secondary }
 * @returns {{ winner: 'p1'|'p2'|null, turns: number }}
 */
function runGame(p1Weights, p2Weights, pairing) {
  const p1Build  = buildDeck(pairing.champion, pairing.secondary, 'curve');
  const p2Build  = buildDeck(pairing.champion, pairing.secondary, 'curve');
  const deckId   = CHAMPION_TO_DECKID[pairing.champion];

  let state = withSilentLogs(() => createPairingGame(deckId, p1Build.cardIds, deckId, p2Build.cardIds));

  let turnCount   = 0;
  let actionCount = 0;
  let cmdUsed     = 0;
  let forceDraw   = false;

  while (true) {
    const { over, winner } = withSilentLogs(() => isGameOver(state));
    if (over) return { winner, turns: turnCount };
    if (turnCount >= MAX_TURNS) break;
    if (actionCount >= MAX_ACTIONS_GAME) { forceDraw = true; break; }

    const ap      = state.activePlayer;
    const weights = ap === 0 ? p1Weights : p2Weights;

    let action;
    try {
      action = withSilentLogs(() => chooseActionWithWeights(state, cmdUsed, weights));
      state  = withSilentLogs(() => applyAction(state, action));
    } catch {
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

  return { winner: null, turns: turnCount };
}

/**
 * Run a round-robin tournament for the population.
 *
 * Every member plays every other member. Each pairing plays `gamesPerPair`
 * total games: half with member i as P1, half as P2, neutralizing the P1/P2
 * structural advantage. The 8 faction pairings cycle evenly across games.
 *
 * Wins, losses, and draws are recorded on each population member in-place.
 * Returns the population sorted by win rate (descending) after the tournament.
 *
 * @param {Array}  population  - array of {id, weights, wins, losses, draws} members
 * @param {number} gamesPerPair - total games between each pair of members
 * @param {object} [options]
 * @param {string} [options.faction] - if set, only run games where one player uses this faction
 * @returns {Array}  sorted population (highest win rate first)
 */
export function runTournament(population, gamesPerPair = 20, options = {}) {
  const N = population.length;

  // Reset win/loss/draw counters
  for (const m of population) {
    m.wins = 0; m.losses = 0; m.draws = 0;
  }

  // Choose pairings to use: all 8, or only those involving the specified faction
  let pairings = ALL_PAIRINGS;
  if (options.faction) {
    pairings = ALL_PAIRINGS.filter(p =>
      p.champion === options.faction || p.secondary === options.faction
    );
    if (pairings.length === 0) pairings = ALL_PAIRINGS;
  }

  const halfGames = Math.max(1, Math.floor(gamesPerPair / 2));
  let totalGames  = 0;

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      // i as P1 (first halfGames games)
      for (let g = 0; g < halfGames; g++) {
        const pairing = pairings[g % pairings.length];
        const result  = runGame(population[i].weights, population[j].weights, pairing);
        if      (result.winner === 'p1') { population[i].wins++;   population[j].losses++; }
        else if (result.winner === 'p2') { population[j].wins++;   population[i].losses++; }
        else                             { population[i].draws++;  population[j].draws++;  }
        totalGames++;
      }
      // j as P1 (second halfGames games)
      for (let g = 0; g < halfGames; g++) {
        const pairing = pairings[g % pairings.length];
        const result  = runGame(population[j].weights, population[i].weights, pairing);
        if      (result.winner === 'p1') { population[j].wins++;   population[i].losses++; }
        else if (result.winner === 'p2') { population[i].wins++;   population[j].losses++; }
        else                             { population[i].draws++;  population[j].draws++;  }
        totalGames++;
      }
    }
  }

  process.stderr.write(`  Tournament: ${totalGames} games, ${N} members\n`);

  // Sort by win rate (wins / total games played) descending
  population.sort((a, b) => {
    const aTotal = a.wins + a.losses + a.draws;
    const bTotal = b.wins + b.losses + b.draws;
    const aWR = aTotal > 0 ? a.wins / aTotal : 0;
    const bWR = bTotal > 0 ? b.wins / bTotal : 0;
    return bWR - aWR;
  });

  return population;
}

// ── Step 3: Selection and Mutation Loop ──────────────────────────────────────

/**
 * Mutate a weight set.
 * Each evolvable key is perturbed by the same range logic as generatePopulation.
 *
 * @param {object} weights       - source weights
 * @param {number} mutationRange - fractional perturbation range
 * @returns {object}               new weight set (copy)
 */
function mutateWeights(weights, mutationRange) {
  const out = { ...weights };
  for (const key of EVOLVABLE_KEYS) {
    const base   = weights[key] ?? 0;
    const factor = 1 + (Math.random() * 2 - 1) * mutationRange;
    out[key] = Math.max(0, Math.min(100, Math.round(base * factor)));
  }
  return out;
}

/**
 * Run the evolutionary loop.
 *
 * Generation 0: initial population from seedWeights.
 * Each generation: run tournament, keep top survivorCount unchanged,
 * fill remaining slots by mutating random survivors.
 *
 * @param {object} seedWeights    - starting weight set
 * @param {number} generations    - number of generations to run
 * @param {number} populationSize - population size per generation
 * @param {number} gamesPerPair   - games per pair per generation tournament
 * @param {number} survivorCount  - number of elites carried forward unchanged
 * @param {number} mutationRange  - fractional perturbation for new children
 * @param {object} [options]      - optional { faction } forwarded to runTournament
 * @returns {{ best: object, history: Array, finalPopulation: Array }}
 */
export function runEvolution(
  seedWeights,
  generations    = 30,
  populationSize = 20,
  gamesPerPair   = 20,
  survivorCount  = 5,
  mutationRange  = 0.3,
  options        = {}
) {
  let population = generatePopulation(seedWeights, populationSize, mutationRange);

  const history  = [];
  let   best     = { member: null, winRate: -1 };

  for (let gen = 0; gen < generations; gen++) {
    process.stderr.write(`\nGeneration ${gen + 1}/${generations}...\n`);

    population = runTournament(population, gamesPerPair, options);

    // Compute stats
    const stats = population.map(m => {
      const total = m.wins + m.losses + m.draws;
      return { ...m, total, winRate: total > 0 ? m.wins / total : 0 };
    });

    const topMember  = stats[0];
    const totalGames = stats.reduce((s, m) => s + m.total, 0);
    const totalDraws = stats.reduce((s, m) => s + m.draws, 0);
    const drawRate   = totalGames > 0 ? totalDraws / totalGames : 0;
    const medianWR   = stats[Math.floor(stats.length / 2)]?.winRate ?? 0;

    history.push({
      gen:     gen + 1,
      topWR:   topMember.winRate,
      medianWR,
      drawRate,
      topId:   topMember.id,
      topWins: topMember.wins,
      topLosses: topMember.losses,
      topDraws:  topMember.draws,
    });

    process.stderr.write(
      `  Gen ${gen + 1}: topWR=${(topMember.winRate * 100).toFixed(1)}%` +
      ` (${topMember.wins}W/${topMember.losses}L/${topMember.draws}D)` +
      ` medianWR=${(medianWR * 100).toFixed(1)}%` +
      ` drawRate=${(drawRate * 100).toFixed(1)}%\n`
    );

    if (topMember.winRate > best.winRate) {
      best = { member: { ...topMember }, winRate: topMember.winRate };
    }

    // Build next generation
    if (gen < generations - 1) {
      const survivors = population.slice(0, survivorCount).map(m => ({
        ...m,
        wins: 0, losses: 0, draws: 0,
      }));
      const children = [];
      while (children.length < populationSize - survivorCount) {
        const parent = survivors[Math.floor(Math.random() * survivors.length)];
        children.push({
          id:     populationSize + gen * populationSize + children.length,
          weights: mutateWeights(parent.weights, mutationRange),
          wins:   0,
          losses: 0,
          draws:  0,
        });
      }
      population = [...survivors, ...children];
    }
  }

  return { best: best.member, history, finalPopulation: population };
}

// ── Weight diff helper ────────────────────────────────────────────────────────

function weightDiff(baseline, evolved) {
  const lines = [];
  for (const key of EVOLVABLE_KEYS) {
    const b = baseline[key] ?? 0;
    const e = evolved[key]  ?? 0;
    if (b !== e) {
      const sign  = e > b ? '+' : '';
      const pct   = b > 0 ? ` (${sign}${(((e - b) / b) * 100).toFixed(0)}%)` : '';
      lines.push(`  ${key.padEnd(28)}: ${String(b).padStart(3)} → ${String(e).padStart(3)}${pct}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : '  (no changes)';
}

// ── CLI arg parser ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    generations:  5,
    population:   20,
    games:        20,
    survivors:    5,
    mutationRange: 0.3,
    faction:      'primal',
    output:       null,
  };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      // Long forms
      case '--generations':    args.generations    = parseInt(argv[++i], 10); break;
      case '--population':     args.population     = parseInt(argv[++i], 10); break;
      case '--games':          args.games          = parseInt(argv[++i], 10); break;
      case '--survivors':      args.survivors      = parseInt(argv[++i], 10); break;
      case '--mutation-range': args.mutationRange  = parseFloat(argv[++i]);   break;
      case '--faction':        args.faction        = argv[++i]; break;
      case '--output':         args.output         = argv[++i]; break;
      // Short forms (as specified in LOG-1273)
      case '--gen':  args.generations = parseInt(argv[++i], 10); break;
      case '--pop':  args.population  = parseInt(argv[++i], 10); break;
    }
  }
  return args;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Import FACTION_WEIGHTS lazily to pick seed for the specified faction
  const { FACTION_WEIGHTS } = await import('./boardEval.js');
  const seedWeights = FACTION_WEIGHTS[args.faction] ?? WEIGHTS;

  console.log(`\n=== Evolutionary Weight Tuning ===`);
  console.log(`Faction: ${args.faction} | Generations: ${args.generations} | Pop: ${args.population} | Games/pair: ${args.games} | Survivors: ${args.survivors}`);

  // Step 1 output: log the generated population
  const initialPop = generatePopulation(seedWeights, args.population, args.mutationRange);
  console.log(`\nInitial population (${initialPop.length} members):`);
  for (const m of initialPop) {
    const keys = EVOLVABLE_KEYS.map(k => `${k}:${m.weights[k]}`).join(', ');
    console.log(`  Member ${m.id}: ${keys}`);
  }

  // Steps 2+3: run evolution
  const { best, history, finalPopulation } = runEvolution(
    seedWeights,
    args.generations,
    args.population,
    args.games,
    args.survivors,
    args.mutationRange,
    { faction: args.faction }
  );

  // ── Report ───────────────────────────────────────────────────────────────

  console.log('\n=== RESULTS ===');
  console.log(`\nGeneration history:`);
  for (const h of history) {
    console.log(
      `  Gen ${h.gen}: topWR=${(h.topWR * 100).toFixed(1)}%` +
      ` medianWR=${(h.medianWR * 100).toFixed(1)}%` +
      ` drawRate=${(h.drawRate * 100).toFixed(1)}%`
    );
  }

  console.log(`\nTop 5 final leaderboard:`);
  for (const [rank, m] of finalPopulation.slice(0, 5).entries()) {
    const total = m.wins + m.losses + m.draws;
    const wr    = total > 0 ? (m.wins / total * 100).toFixed(1) : '0.0';
    console.log(`  ${rank + 1}. Member ${m.id}: ${m.wins}W/${m.losses}L/${m.draws}D (${wr}% WR)`);
  }

  console.log('\nBest weight set found:');
  console.log(`  Member ${best?.id ?? '?'} | WR: ${((best?.winRate ?? 0) * 100).toFixed(1)}%`);
  console.log('\nWeight diff vs baseline faction seed:');
  if (best) {
    console.log(weightDiff(seedWeights, best.weights));
    console.log('\nFull weight set (paste into FACTION_WEIGHTS if board approves):');
    console.log(`${args.faction}: {`);
    console.log(`  ...WEIGHTS,`);
    for (const key of EVOLVABLE_KEYS) {
      console.log(`  ${key}: ${best.weights[key] ?? 0},`);
    }
    console.log(`}`);
  }

  // ── Save output ───────────────────────────────────────────────────────────

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath   = args.output ?? `${RESULTS_DIR}/evolution_${args.faction}_${timestamp}.json`;

  const outData = {
    meta: {
      faction:      args.faction,
      generations:  args.generations,
      population:   args.population,
      gamesPerPair: args.games,
      survivors:    args.survivors,
      mutationRange: args.mutationRange,
      timestamp,
    },
    seedWeights,
    best:          best ?? null,
    history,
    finalPopulation,
  };

  writeFileSync(outPath, JSON.stringify(outData, null, 2));
  console.log(`\nResults saved: ${outPath}`);

  // ── Step 4: save per-faction evolved weights ──────────────────────────────

  if (best) {
    const factionOutPath = `${RESULTS_DIR}/evolved_weights_${args.faction}.json`;
    writeFileSync(factionOutPath, JSON.stringify({
      faction:     args.faction,
      timestamp,
      seedWeights,
      evolvedWeights: best.weights,
      winRate:     best.winRate,
      diff:        weightDiff(seedWeights, best.weights),
    }, null, 2));
    console.log(`Faction weights saved: ${factionOutPath}`);
  }
}

main().catch(err => {
  console.error('evolve.js fatal error:', err);
  process.exit(1);
});
