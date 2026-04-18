# Champion-to-Throne Proximity Eval Term — Validation Run
**Date**: 2026-04-18
**Run type**: Validation
**Task**: LOG-1537
**Config**: timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600, 10 games/matchup (30 total)
**Term added**: `championThroneProximity = max(0, 4 - manhattanDistToThrone)`, weight=8
**Baseline**: No explicit prior for this 3-matchup set at 200ms. Closest: LOG-1536 HvB+EvD combined DR=30% (10 games each, same settings).

## Results

| Matchup | P1 WR | P2 WR | DR | AvgTurns | P1 firstDist2 | P2 firstDist2 | P1 firstThrone | P2 firstThrone | P1 throneCtrl | P2 throneCtrl |
|---------|-------|-------|-----|---------|-------------|-------------|--------------|--------------|-------------|-------------|
| HvB | 30% | 60% | 10% | 21.5 | 4.5 | 2.4 | 15.0 | 7.4 | 1.9 | 1.3 |
| EvD | 20% | 20% | 60% | 27.7 | 3.3 | 3.1 | 8.0 | 6.0 | 2.0 | 0.1 |
| HvE | 30% | 30% | 40% | 27.2 | 5.9 | 4.0 | 15.0 | 7.7 | 0.7 | 0.3 |
| **Aggregate** | | | **36.7%** | | | | | | | |

## Gate Evaluation
- DR gate (aggDR ≤ 35%): **FAIL** — 36.7% is 1.7pp over gate
- Proximity gate (both AIs reach dist≤2 in all matchups): **PASS**

## Flags
- EvD DR=60%: pre-existing structural Elf draw problem. Was 50% in LOG-1536 10-game test (same settings). +10pp may be noise (10-game sample).
- HvE DR=40%: no prior baseline for this matchup at 200ms/35-turn/600-action settings.
- HvB DR=10%: healthy, consistent with prior results.
- No baseline exists for this exact 3-matchup combination at 200ms — gate threshold of 35% was estimated.

## Proposed Diagnostic
Run same 30 games with championThroneProximity weight=0 to establish true no-term baseline for these 3 matchups at these settings. If baseline DR ≥ 36.7%, regression is pre-existing (gate threshold should be adjusted, term not causing harm). If baseline DR is significantly lower, term is causing regression.

## Runtime
842s (~14 min)
