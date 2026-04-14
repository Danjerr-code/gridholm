# MCTS timeout=200ms Preliminary Validation — 2026-04-14

## Context
Board implemented time-budget MCTS (commit 474955e). Sanity check by board:
- timeout=100: 80% DR (games hit 500-action limit)
- timeout=200: 0% DR (beast vs beast, 5 games)
Board is running full 120-game matrix with timeout=200. These are analyst's
independent targeted checks of key matchups while waiting for full matrix.

## Targeted Results (5 games each, timeout=200ms)

| Matchup | P1W | P2W | D | DR |
|---------|-----|-----|---|-----|
| beast vs beast | 2 | 1 | 2 | 40% |
| human vs beast | 1 | 1 | 3 | 60% |
| beast vs demon | 0 | 1 | 4 | 80% |
| elf vs beast | 0 | 2 | 3 | 60% |

## vs sims=1 Baseline (120-game matrix)
| Matchup | DR sims=1 | DR timeout=200 (5g) |
|---------|-----------|----------------------|
| beast vs beast | 100% | 40% |
| human vs beast | 100% | 60% |
| beast vs demon | 70% | 80% |
| elf vs beast | 100% | 60% |

## Key Observations
1. timeout=200 is a clear improvement over sims=1 (100% → 40-80% for tested matchups)
2. Board's beast vs beast sanity check (0% DR) was likely a favorable 5-game sample
3. Human matchups still show elevated DR (60%) — formation/rally positioning harder
   for rollout-based MCTS at this time budget
4. beast vs demon regression may be noise at n=5

## Status
Full 120-game matrix pending (board running locally at timeout=200, ~112 min).
Expected overall DR: 40-70% range (significantly better than sims=1 93.3% but
may not match minimax d=2 baseline of 29.1%).
