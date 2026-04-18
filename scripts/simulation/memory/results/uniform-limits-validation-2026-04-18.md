---
run_type: Validation
date: 2026-04-18
baseline: CEO directive acc258b5 (LOG-1525)
gate: HvB DR ~10%, EvD DR ~70%, aggregate ~40%
result: FAIL
---

# Uniform Limits Validation — 2026-04-18

**Run type:** Validation

**Baseline:** CEO directive acc258b5 — revert all sim scripts to MAX_TURNS=35, MAX_ACTIONS=600.

**Gate:** HvB DR ~10%, EvD DR ~70%, aggregate ~40%.

**Configuration:** timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600, 20 games (10 HvB + 10 EvD).

## Results

### Human vs Beast (10 games)
- P1 (Human): 2 wins | P2 (Beast): 7 wins | Draws: 1
- DR: 10.0% ✓
- Avg turns: 21.5 | Action-limit hits: 0
- Avg decision time: 147.6ms | Avg depth: 13.87 | TT hit: 62.8%

### Elf vs Demon (10 games)
- P1 (Elf): 5 wins | P2 (Demon): 0 wins | Draws: 5
- DR: 50.0% ✗ (expected ~70%)
- Avg turns: 19.3 | Action-limit hits: 3 (games 1, 3, 10)
- Avg decision time: 77.7ms | Avg depth: 18.80 | TT hit: 61.0%

### Combined (20 games)
- P1: 7 | P2: 7 | Draws: 6 | Aggregate DR: 30.0% ✗ (expected ~40%)

## Gate checks
- HvB DR 10.0% ✓
- EvD DR 50.0% ✗ (expected ~70%)
- Aggregate DR 30.0% ✗ (expected ~40%)

## Flags
- EvD DR 50% not ~70%: all 5 decisive EvD games were Elf wins (Demon 0). Prior asymmetric test showed EvD structurally drawish at 85% DR. Discrepancy may be Elf eval advantage at 200ms, or sample variance (n=10).
- 3 EvD games hit 600-action limit (action-limit draws, not turn-limit draws).
- Script updates applied correctly — no action-limit hits in HvB confirms 600-limit is working.

## Status
STOPPED — did not commit. Task marked blocked. Awaiting CEO direction.

## Proposed next step
Diagnostic: run EvD with swapped positions (Demon as p1, Elf as p2, n=10) to determine if Elf's 5-0 decisive record is a P1-position artifact or eval asymmetry.
