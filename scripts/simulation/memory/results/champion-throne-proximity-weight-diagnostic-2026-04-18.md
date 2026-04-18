# Champion-to-Throne Proximity Weight Diagnostic
**Date**: 2026-04-18
**Run type**: Diagnostic (Tuning)
**Task**: LOG-1537 (CEO direction after validation failure)
**Config**: timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600, 10 games/matchup (30 total per weight)
**Question**: What is the correct weight for championThroneProximity? Test weight=0, 4, 8.

## Three-Row Comparison Table

| Weight | HvB DR | EvD DR | HvE DR | Aggregate DR | HvB throne turns (P1/P2) | EvD throne turns (P1/P2) | HvE throne turns (P1/P2) |
|--------|--------|--------|--------|-------------|--------------------------|--------------------------|--------------------------|
| 0      | 20%    | 70%    | 50%    | **46.7%**   | 0.4 / 0.9                | 0.4 / 0.5                | 0.0 / 1.0                |
| 4      | 10%    | 60%    | 70%    | **46.7%**   | 0.9 / 2.2                | 2.9 / 0.0                | 2.5 / 0.3                |
| 8      | 10%    | 60%    | 40%    | **36.7%**   | 1.9 / 1.3                | 2.0 / 0.1                | 0.7 / 0.3                |

## Per-matchup detail

### HvB
| Weight | P1 WR | P2 WR | DR | AvgTurns | P1 firstDist2 | P2 firstDist2 |
|--------|-------|-------|-----|----------|--------------|--------------|
| 0 | 40% | 40% | 20% | 25.0 | 9.3 | 3.2 |
| 4 | 20% | 70% | 10% | 22.3 | 4.3 | 2.9 |
| 8 | 30% | 60% | 10% | 21.5 | 4.5 | 2.4 |

### EvD
| Weight | P1 WR | P2 WR | DR | AvgTurns | P1 firstDist2 | P2 firstDist2 |
|--------|-------|-------|-----|----------|--------------|--------------|
| 0 | 20% | 10% | 70% | 30.6 | 5.0 | 3.4 |
| 4 | 40% | 0%  | 60% | 27.9 | 2.7 | 4.3 |
| 8 | 20% | 20% | 60% | 27.7 | 3.3 | 3.1 |

### HvE
| Weight | P1 WR | P2 WR | DR | AvgTurns | P1 firstDist2 | P2 firstDist2 |
|--------|-------|-------|-----|----------|--------------|--------------|
| 0 | 0%  | 50% | 50% | 26.6 | 3.5 | 2.3 |
| 4 | 0%  | 30% | 70% | 30.8 | 6.3 | 2.8 |
| 8 | 30% | 30% | 40% | 27.2 | 5.9 | 4.0 |

## Interpretation (per CEO rules)

Weight=8 has the lowest aggregate DR (36.7% vs 46.7% for both 0 and 4).
→ Per CEO rule: "current weight is correct despite failing the 35% gate. Reconsider whether the 35% gate was appropriate."

Critical finding: The 35% gate was miscalibrated. The true no-term baseline for this 3-matchup set is 46.7%, not ~30%.
The term at weight=8 reduces aggregate DR by 10pp vs no-term. It is beneficial.

EvD structural check: EvD DR at weight=0 is 70% (worse than weight=8's 60%). The term is helping EvD, not hurting it.
The EvD draw problem is pre-existing and not caused by this term.

## Runtimes
- weight=0: 519.2s
- weight=4: 296.9s
- weight=8: 842.0s (prior validation run)
