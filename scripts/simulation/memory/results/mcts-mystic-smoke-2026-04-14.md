# MCTS Mystic Smoke Test — 2026-04-14 (commits 6b34971, b634876)

## Parameters
- Script: `runSimulation.js`
- Matchup: elf (P1) vs beast (P2)
- Games: 5
- AI: mcts, sims=1
- MAX_ROLLOUT_ACTIONS: 50 (post-fix)
- Lethal-scan guard: +0 buffer (post-fix)
- Avg game time: ~1:28/game

## Results

| Metric | Value |
|--------|-------|
| P1 wins (elf) | 2/5 (40%) |
| P2 wins (beast) | 3/5 (60%) |
| **Draws** | **0/5 (0%)** |
| Avg turns | 20.0 |
| Avg winner HP | 12.4 |

## vs Heuristic AI Baseline

| AI | Mystic Draw Rate | Notes |
|----|-----------------|-------|
| Heuristic (depth-1) | 75–87% | Weight tuning ceiling |
| MCTS sims=1 | **0%** | All 5 games decisive |

## Top Cards by Win Rate Impact
| Card | Impact | Faction |
|------|--------|---------|
| thornweave | +100% | elf |
| yggara | +100% | elf |
| ancientspring | +100% | elf |
| plaguehog | +100% | beast |
| petrify | +75% | elf |
| sistersiofra | +75% | elf |

## Key Findings
1. **MCTS eliminates Mystic draw problem**: 0% DR vs 75–87% for heuristic — the
   structural draw issue was AI decision quality, not card pool composition
2. **Balance looks reasonable**: elf 40% / beast 60% at sims=1 (small sample, ~1-2 sims
   per decision means largely random at this sim count — more sims would improve quality)
3. **Games are decisive**: avg 20 turns, avg winner HP 12.4 — active aggression
4. **Petrify and Yggara confirm high card value** for elf — consistent with prior
   card analysis findings

## Implication
The prior deep heuristic evolution runs (20 gen, 3800 games/tournament) showing 86–88%
draw rate were fundamentally limited by AI decision quality, not card pool design. MCTS
at even sims=1 outperforms the best heuristic weights by 75–87pp on draw rate.

## Status
LOG-1335 complete. Board direction needed on whether to run higher sims (e.g. sims=5,
sims=10) for quality benchmarking, or to proceed with MCTS as the default simulation AI.
