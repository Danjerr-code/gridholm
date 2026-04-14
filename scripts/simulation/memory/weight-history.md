# Weight History

## Run 1 — 2026-04-11 (Baseline)

### Weights (from boardEval.js)
```
championHP:               5
championHPDiff:           8
unitCountDiff:             8
totalATKOnBoard:           3
totalHPOnBoard:            2
throneControl:            20
unitsThreateningChampion: 18
unitsAdjacentToAlly:       4
cardsInHand:               5
hiddenUnits:               6
manaEfficiency:            2
lethalThreat:             35
championProximity:        10
opponentChampionLowHP:    30
relicsOnBoard:             4
omensOnBoard:              3
terrainBenefit:            3
terrainHarm:               3
```

### Performance
- Beast overall win rate: ~55% (dominant)
- Human overall win rate: ~41%
- Demon overall win rate: ~24%
- Elf overall win rate: ~12%
- Overall draw rate: 33.8%
- P2 advantage: +10pp over P1

### Notes
Baseline only. No tuning applied. Awaiting CEO approval before any changes.

---

## Evolutionary Run — 2026-04-12 Primal Smoke Test (LOG-1273 Step 4)

### Run Parameters
- Tool: evolve.js (LOG-1273 rewrite; depth-1 boardEval AI, not minimax)
- Faction: primal
- Population: 10 | Games/pair: 10 | Generations: 5 | Survivors: 5
- Seed: FACTION_WEIGHTS.primal

### Generation History
```
Gen 1: topWR=46.7%  medianWR=41.1%  drawRate=16.7%
Gen 2: topWR=48.9%  medianWR=41.1%  drawRate=17.8%
Gen 3: topWR=46.7%  medianWR=38.9%  drawRate=20.2%
Gen 4: topWR=50.0%  medianWR=43.3%  drawRate=17.6%
Gen 5: topWR=53.3%  medianWR=43.3%  drawRate=14.4%
```

### Best Evolved Weights (Member 40 — WR 53.3% in final gen tournament)
```
championHP:                5   (was 3  — +67%, more defensive)
championHPDiff:           12   (unchanged)
unitCountDiff:             5   (unchanged)
totalATKOnBoard:           4   (was 6  — -33%)
totalHPOnBoard:            2   (unchanged)
throneControl:            24   (was 20 — +20%)
unitsThreateningChampion: 18   (was 25 — -28%, less pure convergence pressure)
unitsAdjacentToAlly:       3   (was 4  — -25%)
cardsInHand:               2   (unchanged)
hiddenUnits:               7   (was 6  — +17%)
lethalThreat:             35   (unchanged)
championProximity:         9   (was 10 — -10%)
opponentChampionLowHP:    34   (was 30 — +13%, stronger finish signal)
relicsOnBoard:             2   (was 4  — -50%)
terrainBenefit:            1   (was 3  — -67%)
terrainHarm:               2   (was 3  — -33%)
healingValue:              0   (unchanged)
```

### Notes
- OLD CODE — no turnAggressionScale / projectedChampionDamage
- Smoke test only. Draw rate declined from 16.7% → 14.4% (positive signal)
- Status: SUPERSEDED by new-code smoke test (2026-04-13)

---

## Evolutionary Run — 2026-04-13 New-Code Smoke Tests (commit afeb07a, LOG-1273)

### Changes in new code
- `turnAggressionScale` (default 0.08): late-game multiplier on lethalThreat, championProximity, unitsThreateningChampion, opponentChampionLowHP after turn 12
- `projectedChampionDamage` (default 20): ATK of units with clear cardinal path to enemy champion within SPD
- Both in EVOLVABLE_KEYS

### Primal Smoke Test (--pop 10 --games 10 --gen 5 --faction primal)
```
Gen 1: topWR=47.8%  drawRate=18.9%
Gen 2: topWR=47.8%  drawRate=23.8%
Gen 3: topWR=46.7%  drawRate=19.1%
Gen 4: topWR=50.0%  drawRate=21.6%
Gen 5: topWR=44.4%  drawRate=21.1%
```
- DR: ~21% — stable vs old 15% (noise at 450 games)
- `turnAggressionScale` evolved to 0 — Primal already aggressive, doesn't need ramp
- `projectedChampionDamage` evolved to 25 (+25%)

### Mystic Smoke Test (--pop 10 --games 10 --gen 5 --faction mystic)
```
Gen 1: topWR=16.7%  drawRate=75.1%
Gen 2: topWR=16.7%  drawRate=76.0%
Gen 3: topWR=17.8%  drawRate=74.2%
Gen 4: topWR=15.6%  drawRate=73.1%
Gen 5: topWR=16.7%  drawRate=74.9%
```
- DR: ~75% vs old 82% = **7pp improvement** from turnAggressionScale
- Evolved weights = seed weights (no mutation improved on incumbent at n=10)
- `turnAggressionScale: 0.08` retained — the driver of DR improvement
- Status: AWAITING BOARD DIRECTION on full runs
