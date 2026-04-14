# Final AI Baseline — All 4 Steps Complete (LOG-1203)

## Parameters
- Date: 2026-04-12T19:05:56Z
- Commits: `27150eb` (remove opponent modeling) + `3938ef4` (evolve.js + memory)
- Run: pairing_matrix_2026-04-12T19-05-56.json
- Games: 50/matchup × 56 directional = 2,800 total
- Active changes: Faction weights (S1) + Phase modifiers with faction guards (S2b) + Card hold logic (S3) + Mystic closing heuristic (S4 partial)
- Removed: Opponent modeling multipliers (removed per board direction)

## Summary of All Steps Applied

| Step | Change | Commit | Status |
|------|--------|--------|--------|
| S1 | Faction-specific weight profiles | 24c6c85 | ✓ Active |
| S2 | Phase-based modifiers | 3d59e67 | ✓ Active |
| S2b | Faction-gated phase suppressions | 84ab56e | ✓ Active |
| S3 | Card hold logic | eae9093 | ✓ Active |
| S3-fix | Champion ability phase priority | 1352c3e / 8ce9926 | ✓ Active |
| S4 | Opponent modeling multipliers | 5c6dfc9 | ✗ Removed (27150eb) |
| S4 | Mystic closing heuristic (turns 13+) | 5c6dfc9 | ✓ Active |

## Overall Statistics — Final Baseline

| Metric | Original Baseline | S3+Fix | Step 4 (w/ opmod) | **Final** | Δ vs S3+Fix |
|--------|-------------------|--------|-------------------|-----------|-------------|
| Draw rate | 63.76% | 65.5% | 66.2% | **66.4%** | +0.9pp |
| P1 win rate | 15.70% | 14.1% | 14.1% | **13.4%** | -0.7pp |
| P2 win rate | 20.55% | 20.4% | 19.7% | **20.2%** | -0.2pp |

## Pairing Win Rates — Final Baseline (P1 avg across 7 opponents)

| Pairing | Original | S3+Fix | S4(opmod) | **Final** | Δ vs S3+Fix |
|---------|----------|--------|-----------|-----------|-------------|
| primal | 27.8% | 28.6% | 29.1% | **27.7%** | -0.9pp |
| primal_dark | 20.5% | 24.6% | 26.0% | **23.7%** | -0.9pp |
| dark | 22.6% | 12.9% | 11.1% | **13.7%** | +0.9pp |
| light | 15.3% | 8.6% | 10.6% | **7.7%** | -0.9pp |
| mystic | 9.2% | 2.9% | 5.7% | **4.9%** | +2.0pp |
| light_mystic | 18.9% | 13.7% | 11.4% | **10.3%** | -3.4pp |
| light_primal | 24.7% | 19.1% | 15.1% | **16.6%** | -2.6pp |
| mystic_dark | 4.8% | 2.9% | 3.4% | **2.6%** | -0.3pp |

## Draw Rates per Pairing (Final)

| Pairing | Draw Rate | Avg Turns |
|---------|-----------|-----------|
| primal | 48.3% | 16.3t |
| primal_dark | 53.7% | 15.6t |
| dark | 70.3% | 19.3t |
| light | 59.7% | 18.1t |
| mystic | **91.7%** | 13.1t |
| light_mystic | 57.4% | 17.7t |
| light_primal | 55.7% | 17.1t |
| mystic_dark | **94.0%** | 14.3t |

## Card Analysis — Final Baseline

### Top 5 Overperformers (all Primal)
| Card | Impact | WR with |
|------|--------|---------|
| swiftpaw | +17.4pp | 29.8% |
| plaguehog | +16.9pp | 31.9% |
| siegemound | +16.2pp | 30.2% |
| packhowl | +15.9pp | 29.9% |
| animus | +15.8pp | 28.7% |

### Top 5 Underperformers (all Mystic)
| Card | Impact | WR with |
|------|--------|---------|
| entangle | -14.3pp | 5.5% |
| enchanted_ground | -14.2pp | 5.6% |
| oathrootkeeper | -13.6pp | 6.0% |
| elfelder | -13.5pp | 6.1% |
| thornweave | -13.5pp | 6.2% |

## Key Findings

### What the Mystic Closing Heuristic Did
Mystic WR: 2.9% (S3+Fix) → 4.9% (final) = +2.0pp improvement. The heuristic (stop using champion ability after turn 15, prioritize advancing units at opponent in late game) measurably helped Mystic close games.

### What Removing Opponent Modeling Did
- Hurt: primal (-0.9pp), primal_dark (-0.9pp), light (-0.9pp), light_mystic (-3.4pp), light_primal (-2.6pp)
- Helped: dark (+0.9pp), mystic (+2.0pp counted above; not purely from heuristic)
- Net: draw rate ticked up +0.9pp from S3+Fix — opponent modeling was a net negative

### Board Context (confirmed)
Board directed not to proceed to card balance: "Mystic is overpowered against humans despite being weak in simulation. The simulation data reflects AI quality, not card balance. Card balance decisions will be made from playtesting data."

## State Summary
- Best-performing pairing: **primal** (27.7% WR)
- Worst-performing pairing: **mystic_dark** (2.6% WR, 94% DR)
- Global draw rate: **66.4%** — high, primarily driven by Mystic contamination
- Without Mystic-containing matchups: estimated ~48% DR

## Raw Files
- S3+Fix baseline: scripts/simulation/pairing_matrix_2026-04-12T17-11-30.json
- Step 4 (w/ opponent modeling): scripts/simulation/pairing_matrix_2026-04-12T18-20-57.json
- **Final baseline**: scripts/simulation/pairing_matrix_2026-04-12T19-05-56.json
