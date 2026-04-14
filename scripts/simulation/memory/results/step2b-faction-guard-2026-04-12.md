# Step 2b Results — Faction Signature Weight Protection (LOG-1203)

## Parameters
- Date: 2026-04-12T10:05:25Z
- Commit: 84ab56e (fix(sim): gate early-phase suppression by faction)
- Run: pairing_matrix_2026-04-12T10-05-25.json
- Games: 50/matchup × 56 directional = 2,800 total
- Scope: 8 pairings (4 mono + 4 friendly)
- AI: faction weights (Step 1) + phase modifiers (Step 2b) with faction guards

## Changes from Step 2 → Step 2b

`applyPhaseModifiers()` now gates early-phase suppressions per faction:
- **Primal** excluded from early-phase ×0.5 on `unitsThreateningChampion`, `championProximity`, `totalATKOnBoard`
- **cardsInHand**: only ever amplified (×1.3 early), never suppressed — Mystic/Dark safe
- **hiddenUnits**: only amplified in mid (×1.5), never suppressed — Dark safe
- **ownChampionHP**: never suppressed anywhere — Mystic safe

## Overall Statistics

| Metric | Step 1b | Step 2 | Step 2b | Δ vs S2 |
|--------|---------|--------|---------|---------|
| Overall draw rate | 64.32% | 65.54% | **64.64%** | -0.90pp |
| P1 win rate | 15.32% | 15.00% | 15.46% | +0.46pp |
| P2 win rate | 20.36% | 19.46% | 19.89% | +0.43pp |
| Avg game length | — | 16.6t | ~16.7t | flat |

## Pairing Win Rate Comparison (Step 2 → Step 2b)

Win rate = P1WR average across all 7 opponents.

| Pairing | S1b WR | S2 WR | S2b WR | Δ vs S2 | vs S1b |
|---------|--------|-------|--------|---------|--------|
| primal | 38.4% | 30.6% | **33.1%** | **+2.5pp ✓** | -5.3pp |
| primal_dark | 22.0% | **33.3%** | 28.6% | -4.7pp | +6.6pp ✓ |
| dark | 24.0% | 15.7% | 14.0% | -1.7pp | -10.0pp |
| light | 15.4% | 11.3% | 11.4% | +0.1pp | -4.0pp |
| mystic | 7.6% | 8.0% | 4.0% | -4.0pp* | -3.6pp |
| light_mystic | 16.4% | 13.4% | 13.7% | +0.3pp | -2.7pp |
| light_primal | 15.9% | 19.1% | 17.7% | -1.4pp | +1.8pp |
| mystic_dark | 3.0% | 6.4% | 1.1% | -5.3pp* | -1.9pp |

*High-variance; mystic draw rates >94% make WR estimates unreliable at n=50

## Avg Draw Rate per Pairing (Step 2b)

| Pairing | Avg DR | S2 DR | Δ |
|---------|--------|-------|---|
| primal | 49.4% | 50.4% | -1.0pp |
| primal_dark | 48.0% | 52.4% | -4.4pp |
| dark | 65.7% | 69.4% | -3.7pp |
| light | 57.4% | 54.6% | +2.8pp |
| mystic | **94.0%** | 89.3% | **+4.7pp** ⚠ |
| light_mystic | 56.9% | 58.4% | -1.5pp |
| light_primal | 50.6% | 54.6% | -4.0pp |
| mystic_dark | **95.1%** | 89.6% | **+5.5pp** ⚠ |

## Avg Game Length per Pairing (Step 2b)

| Pairing | Avg Turns |
|---------|-----------|
| primal | 15.1t |
| mystic | 14.6t |
| mystic_dark | 16.0t |
| primal_dark | 16.1t |
| light | 17.4t |
| light_primal | 17.0t |
| light_mystic | 18.2t |
| dark | 19.4t |

## Card Analysis

### Top Overperformers (all Primal — impacts INCREASED vs Step 2)
| Card | S2b | S2 | Δ |
|------|----|-----|---|
| siegemound | +19.87pp | +18.7pp | +1.2pp |
| gore | +19.16pp | — | new high |
| lifedrinkerstag | +18.68pp | — | new high |
| wolf | +18.28pp | — | new high |
| boar | +18.42pp | — | new high |
| huntingground | +18.09pp | +18.0pp | +0.1pp |
| savagegrowth | +17.22pp | +18.8pp | -1.6pp |

Primal card impacts broadly increased — the early-phase suppression removal is working.

### Top Underperformers (all Mystic — MORE negative vs Step 2)
| Card | S2b | S2 | Δ |
|------|----|-----|---|
| manawell | -15.55pp | -12.8pp | -2.75pp |
| thornweave | -15.08pp | — | new high |
| elfelder | -15.03pp | -12.1pp | -2.93pp |
| entangle | -14.98pp | -12.5pp | -2.48pp |
| ancientspring | -14.51pp | -12.9pp | -1.61pp |
| bloom | -14.34pp | -12.4pp | -1.94pp |
| duskbloomtender | -14.45pp | -11.6pp | -2.85pp |

Mystic card impacts worsened. Root cause: Primal decks now play harder against Mystic-adjacent matchups.

### Notable Bridge Cards
| Card | S2b | S2 | Note |
|------|----|-----|------|
| hexbloodwarlock | **+1.21pp** | -1.7pp | Now slightly positive |
| gorethirstfiend | **-4.76pp** | -0.4pp | Regressed significantly |
| lifedrinkerstag | +18.68pp | +11.7pp | Best bridge by far |
| nighthoofreaver | +15.84pp | +16.9pp | Slight regression |

## Key Findings

### What Worked
1. **Primal mono recovered +2.5pp** (30.6% → 33.1%): The early-phase suppression removal directly helped Primal's early rush, as intended. Primal card impacts are the highest ever recorded.
2. **Draw rate slightly improved**: 65.54% → 64.64% (-0.9pp). Small but in the right direction.
3. **primal_dark maintains meaningful improvement over S1b baseline**: 22% → 28.6% = +6.6pp net improvement from S1b.
4. **hexbloodwarlock finally positive** (+1.21pp): When naturally selected, it's a net benefit.

### What Did Not Work
1. **Primal mono still below S1b level**: 38.4% (S1b) → 33.1% (S2b). Recovery is partial.
2. **primal_dark regressed -4.7pp from Step 2 peak** (33.3% → 28.6%): Root cause — Step 2's global suppression was artificially helping primal_dark by also slowing DOWN Primal opponents. Removing Primal suppression restored Primal opponents' effectiveness, which balanced out the hybrid advantage.
3. **dark continues to decline**: 24.0% (S1b) → 14.0% (S2b). Net -10pp from S1b baseline. Dark is consistently the worst-improving faction.
4. **mystic/mystic_dark high variance**: 94-95% draw rates make WR estimates unreliable at n=50 per matchup. Structural draw rate is the real problem.

## Root Cause Analysis

### Why primal_dark regressed from Step 2
In Step 2, the global early-phase suppression (×0.5 on unitsThreateningChampion for ALL) was inadvertently helping primal_dark by making ALL opponents (including pure Primal) slower and less decisive early. When we removed the suppression for Primal only, pure Primal opponents became stronger again, which disproportionately hurts the Primal-containing hybrid deck in those matchups.

Evidence: primal vs primal_dark matchup → P1(primal)=34%, P2(primal_dark)=34%, DR=32%. Even matchup. But primal_dark vs primal → P1(primal_dark)=34%, P2(primal)=44%. Primal wins 44% as P2 against primal_dark. The aggressive Primal start-position advantage is strong.

### Why dark keeps regressing
Dark's strategy (card advantage accumulation, patience) is fundamentally mismatched with the current game tempo. With Primal now playing aggressively from turn 1 without suppression, Dark doesn't have time to build advantage before the champion is threatened. Dark's gameLengthPenalty starts at turn 10, but games against Primal are ending in ~17-19t anyway.

### Why mystic draw rate increased
With Primal playing faster and more aggressive, Mystic-including matchups should be MORE decisive — but draw rates increased. Hypothesis: when Primal rushes, both sides damage each other quickly, and neither champion survives to win on the standard turn limit. The high draw rates in mystic matchups suggest a structural issue with the Mystic deck's inability to close games OR prevent damage, leading to both champions reaching low HP simultaneously.

## Board Decision Criteria (from board comment 09:29)
- Condition 1: "primal_dark maintains its improvement" → PARTIAL ✓ (maintains +6.6pp over S1b, but regressed from S2 peak)
- Condition 2: "primal mono recovers" → PARTIAL ✓ (recovered +2.5pp from S2 trough, not yet to S1b level)
- Board said: "If both conditions met, proceed to Step 3"

## Cumulative Progress (vs Original Baseline)

| Pairing | Baseline | S1b | S2 | S2b | Net vs Base |
|---------|----------|-----|----|-----|-------------|
| primal | 27.8% | 38.4% | 30.6% | **33.1%** | +5.3pp |
| primal_dark | 20.5% | 22.0% | 33.3% | **28.6%** | +8.1pp |
| dark | 22.6% | 24.0% | 15.7% | **14.0%** | -8.6pp |
| light | 15.3% | 15.4% | 11.3% | **11.4%** | -3.9pp |
| mystic | 9.2% | 7.6% | 8.0% | **4.0%** | -5.2pp |
| light_mystic | 18.9% | 16.4% | 13.4% | **13.7%** | -5.2pp |
| light_primal | 24.7% | 15.9% | 19.1% | **17.7%** | -7.0pp |
| mystic_dark | 4.8% | 3.0% | 6.4% | **1.1%** | -3.7pp |

Light, Dark, Light, Mystic, Light_primal, Mystic_dark all show net regression vs baseline. Primal and primal_dark are the only improving factions.

## Raw Files
- Step 2:   scripts/simulation/pairing_matrix_2026-04-12T09-00-19.json
- Step 2b:  scripts/simulation/pairing_matrix_2026-04-12T10-05-25.json
