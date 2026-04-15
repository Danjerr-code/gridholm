# Matrix Results — Board Centrality + Throne Control — 2026-04-15

## Run Config
- AI: minimax depth=2
- Games: 100/direction × 6 pairs × 2 directions = 1200 total
- Commit: 9bff7e2 (feat: board centrality eval and increased throne control weighting)
- Changes: boardCentrality (weight 4), throneControlValue base 15→25 (Mystic 20→30),
  unit-on-throne +0.5 bonus, champion-toward-center gradient (4-dist)*0.3

## Win Rate Matrix (combined both directions)

|          | Human  | Beast  | Elf    | Demon  |
|----------|--------|--------|--------|--------|
| Human    | —      | 48.5%  | 1.0%   | 39.5%  |
| Beast    | 48.5%  | —      | 11.5%  | 51.0%  |
| Elf      | 23.0%  | 34.5%  | —      | 43.5%  |
| Demon    | 33.5%  | 37.5%  | 0.5%   | —      |

## Draw Rate per Matchup

| Matchup         | Draws | DR     |
|-----------------|-------|--------|
| Human vs Beast  | 6/200  | 3.0%  |
| Beast vs Demon  | 23/200 | 11.5% |
| Human vs Demon  | 54/200 | 27.0% |
| Beast vs Elf    | 108/200 | 54.0% |
| Elf vs Demon    | 112/200 | 56.0% |
| Human vs Elf    | 152/200 | 76.0% |

**Overall DR: 37.9%** (455/1200) — NEW ALL-TIME BEST

## Avg Game Length per Matchup

| Matchup         | Avg Turns |
|-----------------|-----------|
| Beast vs Elf    | 16.4t     |
| Human vs Elf    | 16.5t     |
| Elf vs Demon    | 18.1t     |
| Human vs Beast  | 18.6t     |
| Beast vs Demon  | 19.4t     |
| Human vs Demon  | 23.6t     |

## First-Player Advantage
- P1 win rate: 26.6% — P2 advantage persists

## Top Cards by Win Rate Impact

**Human:** soulstone +17.5%, captain +16.2%, aendor +15.1%, warlord +9.6%, forgeweapon +9.1%
Worst: squire -2.5%

**Beast:** razorfang +16.0%, savagegrowth +9.5%, sabretooth +6.9%, nighthoofreaver +2.8%, eagerbeaver +1.8%
Worst: ambush -22.5%

**Elf:** elfscout +17.7%, glitteringgift +14.3%, verdantarcher +14.1%, elfranger +9.6%, verdantsurge +9.4%
Worst: seedling -12.3%

**Demon:** hellhound +14.6%, vexishollowking +13.7%, shadowstalker +13.4%, shadowfiend +11.3%, devour +11.0%
Worst: bloodoffering -2.1%

## Flags

- 🚨 Human vs Elf: 76.0% DR (−5pp vs 81.0% — structural Elf weakness persists)
- ⚠️ Beast vs Elf: 54.0% DR (−11pp vs 65.0%)
- ⚠️ Elf vs Demon: 56.0% DR (−21.5pp vs 77.5% — largest per-matchup improvement ever)
- Elf win rate vs Human only 1.0% (structural imbalance)
- Elf win rate vs Beast only 11.5%

## Comparison vs Prior Baselines

| Run | Overall DR |
|-----|-----------|
| New-deck baseline (full profiles) | 64.2% |
| LOG-1426 (tradeEfficiency+tileDenial+MAX_CANDIDATES=6) | 51.4% |
| LOG-1335+LOG-1436 (simplified profiles) | 49.9% |
| **This run (boardCentrality + throneControlValue 25/30)** | **37.9%** |

Delta from prior best: **−12.0pp** — largest single-run improvement in project history.
