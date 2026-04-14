# Full Matrix — MCTS timeoutMs=200 — 2026-04-14

## Config
- AI: MCTS, simulations=10000 (upper bound), timeoutMs=200 (hard cap)
- attackChampionBias: 3.0, moveTowardChampionBias: 1.3 (original values, reverted from 6.0/2.0)
- Games per direction: 10 (120 total)
- Commit: 474955e (feat: time-budget MCTS with timeoutMs parameter)

## Sanity Check (beast vs beast, 5 games)

### timeoutMs=100
- DR: 80% (4/5 draws, 3 games hit 500-action limit)
- Time: ~50s/game

### timeoutMs=200
- DR: 0% (5/5 decisive: P1=3, P2=2)
- Time: ~56s/game
- Cleared both gates (DR<40%, time<2min)

## Full Matrix Results — CATASTROPHIC (85.8% DR)

**Overall DR: 85.8%** (103/120 games)
**P1 WR: 1.7%** (2/120)

| Matchup (P1→P2) | DR | Avg Turns |
|---|---|---|
| human vs beast | 80.0% | 25.1 |
| beast vs human | 80.0% | 21.5 |
| human vs elf | 100.0% | 19.1 |
| elf vs human | 100.0% | 21.4 |
| human vs demon | 100.0% | 22.8 |
| demon vs human | 100.0% | 24.6 |
| beast vs elf | 70.0% | 20.4 |
| elf vs beast | 70.0% | 24.0 |
| beast vs demon | 80.0% | 26.4 |
| demon vs beast | 70.0% | 27.4 |
| elf vs demon | 90.0% | 25.8 |
| demon vs elf | 90.0% | 26.5 |

## Combined Win Rate Matrix (both directions)
| | Human | Beast | Elf | Demon |
|---|---|---|---|---|
| Human | — | 10.0% | 0.0% | 0.0% |
| Beast | 10.0% | — | 15.0% | 15.0% |
| Elf | 0.0% | 15.0% | — | 5.0% |
| Demon | 0.0% | 10.0% | 5.0% | — |

## Comparison vs Baselines
- Minimax d=2: 29.1% DR (6,000 games) ← gold standard
- MCTS sims=1 (bias=3.0): 93.3% DR (120 games)
- MCTS sims=1 (bias=6.0): 98.3% DR (120 games)
- MCTS timeout=100ms: N/A (sanity only, 80% DR beast vs beast)
- MCTS timeout=200ms: **85.8% DR (120 games)** ← current

## Root Cause (confirmed)

Flat MCTS with biased rollouts cannot match minimax d=2. Rollouts average over
noise; minimax evaluates concrete multi-step sequences deterministically.

5-game sanity checks consistently give misleadingly low DR due to small sample
and favorable random seeds. Full 120-game matrix reveals true structural ceiling.

## Top 5 Cards by Win Rate Impact
Human: crusade, ironshield, warlord, gavrielholystride, smite
Beast: siegemound, sabretooth, crushingblow, razorfang, bloodmoon
Elf: yggara, thornweave, canopysentinel, verdantsurge, sistersiofra
Demon: souldrain, dreadshade, shadowtrap, devour, imp

## Status
Posted to LOG-1335 comment 6cdaf83d. Awaiting board direction.
Recommended options: (1) revert to minimax, (2) hybrid minimax/MCTS,
(3) full tree MCTS, (4) continue MCTS tuning.
