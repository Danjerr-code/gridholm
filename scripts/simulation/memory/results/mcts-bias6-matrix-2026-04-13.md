# Full Matrix — attackChampionBias=6.0 — 2026-04-13

## Config
- AI: MCTS, sims=1
- Games per direction: 10 (120 total)
- attackChampionBias: 6.0 (raised from 3.0 per board comment 910cf8e6)
- moveTowardChampionBias: 2.0 (raised from 1.3)

## Results: CATASTROPHIC FAILURE

**Overall DR: 98.3%** (118/120 games drew)
**P1 WR: 0.0%** (0/120 decisive games won by P1)
**P2 WR: 1.7%** (2/120 decisive games won by P2)

| Matchup (P1 → P2) | P1 WR | DR | Avg Turns |
|---|---|---|---|
| human vs beast | 0.0% | 90.0% | 18.8 |
| human vs elf | 0.0% | 100.0% | 21.2 |
| human vs demon | 0.0% | 100.0% | 21.7 |
| beast vs human | 0.0% | 100.0% | 19.9 |
| beast vs elf | 0.0% | 100.0% | 20.9 |
| beast vs demon | 0.0% | 100.0% | 26.8 |
| elf vs human | 0.0% | 100.0% | 21.6 |
| elf vs beast | 0.0% | 100.0% | 23.4 |
| elf vs demon | 0.0% | 100.0% | 24.0 |
| demon vs human | 0.0% | 100.0% | 25.1 |
| demon vs beast | 0.0% | 90.0% | 25.2 |
| demon vs elf | 0.0% | 100.0% | 28.3 |

All 12 matchups flagged (>30% DR).
Comparison: minimax d=2 baseline was 29.1% DR (6,000 games).

## Root Cause

High attackChampionBias in biasedRollout causes rollouts to always attack the
champion. Against healing factions (elf, demon), champion never dies in rollouts
→ rollout always returns 'loss' from attacking position → MCTS UCB1 learns that
champion attacks are losing moves → real game play becomes passive → draws.

This is a structural problem: the rollout evaluation policy and the game-play
action policy cannot be the same object when healing opponents are present.

## Prior 5-game sample (false gate pass)

Before this matrix, a 5-game elf vs beast test at bias=6.0 showed 20% DR,
clearing the 40% gate to run the full matrix. This was a lucky seed artifact.
The full matrix reveals the systematic 98.3% DR.

## Reported to LOG-1335
Comment ID: d17bfef1-4bcf-45af-ab18-342dfac67147
Awaiting board direction on next steps.
