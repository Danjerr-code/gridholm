# Minimax Depth Test Results — 2026-04-14

## Context
Following 64.2% DR on new-deck + Mystic eval matrix. Board hypothesized deeper search
might break Elf draw pattern. Analyst tested d=3 and d=4 on worst Elf matchups.

## Results (5 games each)

| Matchup | Depth | DR | Avg Turns | Avg AI ms/game | Notes |
|---------|-------|----|-----------|----------------|-------|
| Human vs Elf | d=2 | 87.0% | ~20 | 590ms | board's full 1200-game matrix |
| Human vs Elf | d=3 | 80.0% | 26.6 | 933ms | n=5, noise plausible |
| Human vs Elf | d=4 | 100.0% | 30.0 | 75ms | TIMEOUT — heuristic fallback firing |
| Elf vs Demon | d=2 | 89.0% | ~21 | 590ms | board's full 1200-game matrix |
| Elf vs Demon | d=3 | 100.0% | 27.4 | 657ms | WORSE than d=2 |
| Elf vs Demon | d=4 | — | — | — | not tested (d=4 already failed) |

## Key Findings

1. **d=3 does not help**: Human vs Elf 80% (marginal, within n=5 noise), Elf vs Demon 100% (WORSE)
2. **d=4 causes systematic timeout**: 75ms avg AI time → heuristic fallback fires → 100% DR
   The 5-second per-decision deadline cannot accommodate d=4 at normal game positions.
3. **Deeper search is NOT the fix**: The draw is structural — both AIs see the healing deadlock
   and don't commit at any depth that's computationally feasible within the 5s timeout.

## Root Cause Analysis

Card impact data from Human vs Elf (d=2 matrix, 100 games/direction):
- bloom, ancientspring, verdantsurge, overgrowth, thornweave, recall all show **negative** win
  rate impact when Elf draws them (-25% to -50%)
- This means: Elf's own healing cards REDUCE its win rate

**Interpretation**: The Mystic AI is over-using healing cards at the expense of attacking.
When Elf draws bloom/ancientspring, it plays them to maintain HP rather than attacking. This
delays games into draws. The healing cards are not providing win equity — they're causing stalls.

**The fix must be eval-level (boardEval.js), not search-depth.**

## Proposed Fix: Remove Mystic HP-Maintenance Incentive

| Parameter | Current | Proposed | Rationale |
|-----------|---------|----------|-----------|
| `healingValue` | 5 (was 8) | **0** | Completely remove passive HP reward |
| `championHP` | 10 | **5** | Reduce to WEIGHTS base — stop hoarding HP |
| `championHPDiff` | 3 | **8** | Restore to WEIGHTS base — reward HP LEAD not absolute HP |

Expected: Mystic AI stops prioritizing HP maintenance, focuses on attacking/threatening.
Healing cards still provide survivability (real defensive value) but are no longer
eval-rewarded directly → AI plays more aggressively.

## Status
Proposal pending board approval.
