# Transposition Table + Iterative Deepening Validation — 2026-04-15

**Commits tested:** `5ad418e` (Zobrist hashing) → `cb09f1d` (transposition table) → `af6d480` (iterative deepening with time budget)  
**Config:** minimax timeBudget=800ms, maxDepth=20 (ID)  
**Baseline for comparison:** 37.9% overall DR (board centrality + throne control, LOG-1436 reopened)

---

## 20-Game Targeted Test Results

| Matchup | P1 Wins | P2 Wins | Draws | DR | Avg Turns | Avg Depth | TT Hit Rate |
|---|---|---|---|---|---|---|---|
| Human vs Beast | 2 | 6 | 2 | 20.0% | 19.0 | 18.64 | 66.7% |
| Elf vs Demon | 1 | 0 | 9 | 90.0% | 23.4 | 19.48 | 62.9% |
| **Combined** | **3** | **6** | **11** | **55.0%** | **21.2** | **~19.1** | **~65%** |

---

## Gate Condition Assessment

- **Avg depth > 3.0**: YES — 18.64 (HvB) and 19.48 (EvD). Strongly met.
- **DR ≤ 37.9%**: NO — combined 55.0% (11/20 draws).

Gate **NOT MET** per strict reading of validation instructions.

---

## AI Performance Metrics

| Metric | Human vs Beast | Elf vs Demon |
|---|---|---|
| Avg decision time | 326ms | 236ms |
| Avg depth reached/decision | 18.64 | 19.48 |
| TT hit rate | 66.7% | 62.9% |
| Avg TT size/decision | 16 entries | 28 entries |

---

## Analysis

### Why depth is so high (18-19 vs threshold of 3)
The TT hit rate of 63-67% means ~2/3 of nodes resolve instantly from cached positions.
This effectively collapses the search tree, allowing ID to complete many depth iterations
within 800ms. The game tree has few unique positions reachable from any decision point
(confirmed by avg TT size of 16-28 entries/decision — the effective branching factor is
very small due to endTurn transpositions and position repetition).

### Why DR gate may be misleading for 20-game test
The 37.9% DR baseline was measured across ALL 6 matchups × 2 directions = 1200 games.
This 20-game test covers only 2 matchups (one direction each):
- Human vs Beast: historically 3-7% DR → 20% on 10 games is within variance
- Elf vs Demon: historically 56-74% DR → 90% on 10 games is within variance

The Elf vs Demon matchup alone has enough variance at n=10 to push combined DR over 37.9%
regardless of whether the AI improved. The 20-game sample is not statistically reliable
for comparing against a 1200-game baseline.

### TT cache behavior
- 63-67% TT hit rate: good, consistent with prior search improvements
- 16-28 entries/decision: very low, indicating the game tree has very few unique positions
  reachable within the time budget (consistent with high depth + high hit rate)

---

## Status
Awaiting CEO direction. Options:
1. Run full 1200-game matrix to get a proper DR measurement (recommended)
2. Continue with smaller follow-up test if CPU cost is a concern
