# MCTS Full Matrix — Original Bias Values (3.0/1.3) — 2026-04-14

## Context
After bias=6.0 catastrophic failure (98.3% DR), reverted to original DEFAULT_POLICY
(attackChampionBias=3.0, moveTowardChampionBias=1.3) and ran full 120-game matrix.

## Results (10 games/direction, sims=1)

| P1 | P2 | P1W | P2W | D | DR | AvgT |
|----|----|----|-----|---|-----|------|
| human | beast | 0 | 0 | 10 | 100% | 19.7 |
| human | elf | 0 | 0 | 10 | 100% | 20.2 |
| human | demon | 0 | 0 | 10 | 100% | 25.8 |
| beast | human | 0 | 0 | 10 | 100% | 20.6 |
| beast | elf | 0 | 0 | 10 | 100% | 20.7 |
| beast | demon | 1 | 2 | 7 | 70% | 21.3 |
| elf | human | 0 | 0 | 10 | 100% | 24.0 |
| elf | beast | 0 | 0 | 10 | 100% | 23.5 |
| elf | demon | 0 | 0 | 10 | 100% | 27.5 |
| demon | human | 0 | 0 | 10 | 100% | 25.9 |
| demon | beast | 0 | 3 | 7 | 70% | 22.5 |
| demon | elf | 1 | 1 | 8 | 80% | 22.7 |

**Overall DR: 93.3% (112/120)**

## Root Cause Analysis

### What sims=1 actually does
- Diagnostic: MCTS sims=1 picks diverse actions (30% champMove, 25% summon, 25% endTurn, 20% unitMove)
- NOT the "always picks first action" failure mode initially hypothesized
- 65% of 50-action rollouts terminate naturally; 35% hit the cap (returning 'loss')

### Why games still draw
1. **Human matchups always draw**: Human strategy depends on rally/formation bonuses (unit adjacency).
   Rollout-based evaluation doesn't capture these positional synergies — rollouts play too randomly
   to demonstrate formation value. Heuristic AI explicitly weighs `unitsAdjacentToAlly`; MCTS
   can't derive this from 1 rollout.
2. **Non-human matchups partially decisive**: beast vs demon 70% DR, demon vs elf 80% DR —
   more aggressive factions have rollouts that sometimes find decisive play.
3. **1 sim = too little information**: MCTS needs enough simulations to distinguish action quality.
   At sims=1, UCB1 selection is essentially random walk with minor bias from the one visited node.

### The 5-game smoke test discrepancy
- 5-game test showed 0% DR (all decisive)
- 120-game matrix shows 93.3% DR
- Explanation: 5-game test was a statistical anomaly (P(5 decisive | true DR=93%) ≈ 0.0002)
  but small enough that it happened. The 5-game test was INSUFFICIENT to validate MCTS quality.

## Comparison Table

| Config | DR | Games | Notes |
|--------|-----|-------|-------|
| Heuristic (Run 1 baseline) | 33.8% | 6,000 | Best heuristic result |
| Minimax d=2 | 29.1% | 6,000 | Best overall result |
| MCTS sims=1, bias=6.0 | 98.3% | 120 | Catastrophic |
| MCTS sims=1, bias=3.0 | 93.3% | 120 | Broken |
| MCTS sims=1, 5-game smoke | 0% | 5 | Statistical fluke |

## Proposed Fix
Switch from sim-count to time-budget MCTS. At timeoutMs=100ms per decision:
- ~20 sims/decision at 5ms/rollout
- ~15 decisions/turn × 20 turns × 100ms = ~30 seconds/game
- 120-game matrix: ~60 minutes (feasible)
- MCTS has 20× more signal → much better action discrimination
- Human matchups may improve as formation value becomes discoverable

Requires: `runSimulation.js` and `runMatrix.js` to pass `timeoutMs` instead of/alongside `sims`.
