# New-Code Smoke Tests — 2026-04-13 (LOG-1273, commit afeb07a)

## Parameters
- Commit: afeb07a (feat: draws-as-losses fitness, turn-scaling aggression, projected champion damage)
- Run: --pop 10 --games 10 --gen 5
- 450 games/tournament
- New factors: turnAggressionScale (0.08), projectedChampionDamage (20)

## Primal Smoke Test

| Gen | Top WR | Draw Rate |
|-----|--------|-----------|
| 1 | 47.8% | 18.9% |
| 2 | 47.8% | 23.8% |
| 3 | 46.7% | 19.1% |
| 4 | 50.0% | 21.6% |
| 5 | 44.4% | 21.1% |

**Best evolved weights:**
- turnAggressionScale: 0.08 → 0 (-100%) — Primal already aggressive
- projectedChampionDamage: 20 → 25 (+25%)
- unitsThreateningChampion: 25 → 31 (+24%)
- opponentChampionLowHP: 30 → 37 (+23%)
- throneControl: 20 → 16 (-20%)

Baseline comparison: Old smoke test DR ~15%, new ~21% — within noise at 450 games.

## Mystic Smoke Test

| Gen | Top WR | Draw Rate |
|-----|--------|-----------|
| 1 | 16.7% | 75.1% |
| 2 | 16.7% | 76.0% |
| 3 | 17.8% | 74.2% |
| 4 | 15.6% | 73.1% |
| 5 | 16.7% | 74.9% |

**Best evolved weights:** identical to seed (no mutations improved on incumbent)

Baseline comparison: Old code 82% DR → New code 75% DR = **-7pp improvement**

## Key Findings

1. `turnAggressionScale` is the primary driver of Mystic DR improvement (+7pp)
2. Primal correctly evolves `turnAggressionScale` to 0 (no need for late ramp)
3. Mystic is at convergence for 5-gen 10-member search — full runs needed to search wider
4. 75% Mystic DR still high — structural card pool issue remains; AI tuning helping at margin

## Status
Awaiting board direction on whether to proceed with full faction runs using new code.
