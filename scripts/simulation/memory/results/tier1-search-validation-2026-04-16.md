# Tier 1 Search Quality Validation — 2026-04-16

**Task:** LOG-1485  
**Commits tested:** `9e27c14` (quiescence + history + PVS) + `db8406c` (spell eval, projectedEnemyDamage, throneControlValue unit fixes)  
**Config:** minimax timeBudget=800ms, maxDepth=20 (iterative deepening)  
**Baseline for comparison:**  
- TT+ID-only baseline (transposition-table-validation-2026-04-15.md): HvB 20% DR, EvD 90% DR, combined 55%, avgDepth ~19  
- 37.9% overall DR baseline (boardCentrality + throneControlValue, 1200 games, no Tier 1 search)

---

## Step 1: Quiescence Search Validation

| Metric | Without quiescence (TT+ID baseline) | With quiescence (current) | Change |
|---|---|---|---|
| HvB DR | 20.0% (n=10) | 10.0% (n=10) | −10pp |
| EvD DR | 90.0% (n=10) | PENDING | — |
| HvB avgDepth | 18.64 | 18.04 | −0.60 |
| EvD avgDepth | 19.48 | PENDING | — |
| HvB decision time | 326ms | 384ms | +1.18x |
| EvD decision time | 236ms | PENDING | — |
| HvB qNodes/decision | N/A | **394.46** | — |
| EvD qNodes/decision | N/A | PENDING | — |

**Gate check (Step 1):**
- Decision time increase > 3x (too slow)? → HvB: 1.18x ✅ PASS
- Avg qNodes per decision: 394 per decision (HvB)

## Step 2: History Heuristic Validation

All three improvements committed together in `9e27c14`. Combined Step 2+3 validation:

| Metric | Value |
|---|---|
| HvB DR | 10.0% |
| EvD DR | PENDING |
| HvB avgDepth | 18.04 |
| EvD avgDepth | PENDING |

## Step 3: PVS Validation

Combined with all Tier 1 improvements. Full comparison vs baselines below.

---

## 20-Game Targeted Test Results (Steps 1–3 Combined)

| Matchup | P1 Wins | P2 Wins | Draws | DR | Avg Turns | Avg Depth | TT Hit Rate | qNodes/decision |
|---|---|---|---|---|---|---|---|---|
| Human vs Beast | 4 | 5 | 1 | **10.0%** | 22.1 | 18.04 | — | 394 |
| Elf vs Demon | — | — | — | **PENDING** | — | — | — | — |
| **Combined** | — | — | — | **PENDING** | — | — | — | — |

---

## Analysis (HvB only, preliminary)

### DR comparison
- 37.9% baseline (minimax d=2, no Tier 1): HvB at **3.0%**  
- TT+ID only baseline (2026-04-15): HvB at **20.0%** (n=10, high variance)
- Full Tier 1 active: HvB at **10.0%** (n=10, high variance)

HvB is naturally low-DR. All three measurements are consistent with ~5-10% true DR at this matchup.

### Decision time
- +1.18x increase from TT+ID to full Tier 1 (quiescence adds some overhead)
- Well below the 3x threshold
- Absolute: 384ms per decision (within 800ms budget, ID typically completes 18 depth levels)

### qNodes
- 394 qNodes per decision in HvB: each leaf node of the main search explores ~394 tactical positions
- This is the capture generator resolving tactical sequences before returning leaf evaluations

---

## 30-Game Matrix (Running)

30 games per direction × 12 directions = 360 total games. Running in background.
All Tier 1 improvements active + projectedEnemyDamage + throneControlValue unit bonus.
Results will be added here when complete.

---

## Status
- Step 1-3 targeted validation: HvB complete, EvD PENDING
- Full matrix: 30-game matrix running
