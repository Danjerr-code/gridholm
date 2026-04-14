# Step 2 Results — Phase-Based Scoring + Bridge Card Fix (LOG-1203)

## Parameters
- Date: 2026-04-12T09:00:19Z
- Commit: 3d59e67 (feat(sim): phase-based eval scoring + remove mandatory bridge cards)
- Run: pairing_matrix_2026-04-12T09-00-19.json
- Games: 50/matchup × 56 directional = 2,800 total
- Scope: 8 pairings (4 mono + 4 friendly), same as Step 1b comparison
- AI: faction weights (Step 1) + phase modifiers (Step 2) + no mandatory bridges

## Overall Statistics

| Metric | Baseline (uni.) | Step 1 (faction) | Step 1b (8-pair) | Step 2 | Δ vs S1b |
|--------|----------------|------------------|-----------------|--------|---------|
| Overall draw rate | 63.76% | 62.85% | 64.32% | **65.54%** | +1.22pp |
| P1 win rate | 15.70% | 16.48% | 15.32% | 15.00% | -0.32pp |
| P2 win rate | 20.55% | 20.67% | 20.36% | 19.46% | -0.90pp |
| Avg game length | — | — | — | 16.6t | — |

## Pairing Win Rate Comparison (Step 1b → Step 2)

| Pairing | S1b WR | S2 WR | Δ WR | S1b DR | S2 DR | Δ DR |
|---------|--------|-------|------|--------|-------|------|
| primal_dark | 22.0% | **33.3%** | **+11.3pp** | 46.7% | 52.4% | +5.7pp |
| primal | 38.4% | 30.6% | **-7.9pp** | 47.3% | 50.4% | +3.1pp |
| light_primal | 15.9% | 19.1% | +3.3pp | 56.3% | 54.6% | -1.7pp |
| dark | 24.0% | 15.7% | **-8.3pp** | 66.9% | 69.4% | +2.6pp |
| light_mystic | 16.4% | 13.4% | -3.0pp | 56.4% | 58.4% | +2.0pp |
| light | 15.4% | 11.3% | -4.1pp | 57.7% | 60.1% | +2.4pp |
| mystic | 7.6% | 8.0% | +0.4pp | 89.9% | 89.3% | -0.6pp |
| mystic_dark | 3.0% | 6.4% | +3.4pp | 93.4% | 89.6% | -3.9pp |

## Card Analysis

### Top Overperformers (all Primal — impact INCREASED vs S1b)
| Card | S2 | S1b | Δ |
|------|----|-----|---|
| savagegrowth | +18.8pp | +14.1pp | +4.7pp |
| siegemound | +18.7pp | +13.4pp | +5.3pp |
| huntingground | +18.0pp | +11.0pp | +7.0pp |
| predatorsmark | +17.7pp | +10.8pp | +6.8pp |
| swiftpaw | +17.4pp | +12.1pp | +5.3pp |
| nighthoofreaver | +16.9pp | +10.5pp | +6.4pp |

### Top Underperformers (all Mystic — IMPROVED vs S1b)
| Card | S2 | S1b | Δ |
|------|----|-----|---|
| ancientspring | -12.9pp | -15.0pp | +2.1pp |
| manawell | -12.8pp | -15.7pp | +2.9pp |
| entangle | -12.5pp | -15.5pp | +3.0pp |
| bloom | -12.4pp | -15.3pp | +2.9pp |
| elfelder | -12.1pp | -14.4pp | +2.3pp |

Mystic card impact IMPROVED (less negative) with phase shifts, suggesting the late-game closing modifier is helping somewhat — but still deeply negative overall.

## Bridge Card Analysis (Optional vs Mandatory)

| Card | S2 (optional) | S1b (mandatory) | Δ | Interpretation |
|------|--------------|-----------------|---|----------------|
| hexbloodwarlock | -1.7pp | -11.8pp | +10.1pp | NOW NEARLY NEUTRAL — appears when useful |
| duskbloomtender | -11.6pp | -16.7pp | +5.1pp | Still negative but less harmful |
| nighthoofreaver | +16.9pp | +10.5pp | +6.4pp | Better without forced pairing |
| lifedrinkerstag | +11.7pp | +7.9pp | +3.8pp | Better without forced pairing |
| gorethirstfiend | -0.4pp | +5.5pp | -5.9pp | Appears less → neutral |

Removing mandatory inclusion was the right call. Hexbloodwarlock went from -11.8pp to -1.7pp — when the AI chooses to include it naturally, it's nearly neutral.

## Key Findings

### What Worked
1. **primal_dark: +11.3pp WR** — biggest single-pairing improvement in any Step. Phase mid-Dark
   (cardsInHand ×1.4, hiddenUnits ×1.5) + mid-Primal (unitsThreateningChampion ×1.4) compound
   well for a hybrid faction that benefits from both
2. **mystic_dark: +3.4pp WR, -3.9pp DR** — modest but consistent improvement
3. **Mystic underperformers improved** — all Mystic cards less negative (2–5pp less harmful)
4. **Bridge card fix confirmed** — hexbloodwarlock nearly neutral at -1.7pp (was -11.8pp)

### What Did Not Work
1. **Pure Primal: -7.9pp WR** — early-phase unitsThreateningChampion ×0.5 dampens Primal's
   rush from turn 1. Primal's faction weight is already 25 on this metric; ×0.5 early cuts it
   to 12.5 in turns 1–5, slowing the key threat-building phase of Primal's strategy
2. **Dark mono: -8.3pp WR** — Dark's patience profile doesn't benefit from the early/mid
   development emphasis; Dark relies on incremental advantage accumulation, not burst phases
3. **Light regressions**: -4.1pp for light mono, -3.0pp for light_mystic
4. **Overall draw rate: 65.54%** — slightly higher than Step 1b (64.32%)

### Root Cause of Primal Regression
The global early-phase modifier (all factions: unitsThreateningChampion ×0.5) conflicts with
Primal's core strategy. Primal should pressure the enemy champion from turn 1. Applying the
"develop first" suppression to Primal negates the faction weight profile that made Step 1 work.

Fix candidate: exclude Primal from the early-phase unitsThreateningChampion suppression, or add a
Primal-specific early modifier that *increases* pressure weight in turns 1-5.

## Cumulative Progress (vs Original Baseline)

| Pairing | Baseline WR | Step 2 WR | Net Change |
|---------|------------|-----------|------------|
| primal | 27.8% | 30.6% | +2.8pp |
| primal_dark | 20.5% | 33.3% | +12.8pp |
| mystic | 9.2% | 8.0% | -1.2pp |
| mystic_dark | 4.8% | 6.4% | +1.6pp |
| light | 15.3% | 11.3% | -4.0pp |
| dark | 22.6% | 15.7% | -6.9pp |

## Raw Files
- Step 1b (8-pair): scripts/simulation/pairing_matrix_2026-04-12T07-29-19.json
- Step 2:           scripts/simulation/pairing_matrix_2026-04-12T09-00-19.json
