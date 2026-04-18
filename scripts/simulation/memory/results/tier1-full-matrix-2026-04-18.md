# Tier 1 Full Matrix — 2026-04-18

**Task:** LOG-1485  
**Config:** minimax timeBudget=200ms, 10 games/direction × 12 directions = 120 total games  
**Active:** TT + ID + quiescence + history + PVS + contempt(-30) + one-sided stagnation penalty + MAX_TURNS=25, MAX_ACTIONS=250  
**Baseline for comparison:** 37.9% overall DR (boardCentrality + throneControlValue, 1200 games, no Tier 1 search, depth=2)

## Win Rate Matrix (combined both directions)

|         | Human  | Beast  | Elf    | Demon  |
|---------|--------|--------|--------|--------|
| Human   | —      | 20.0%  | 0.0%   | 20.0%  |
| Beast   | 40.0%  | —      | 5.0%   | 25.0%  |
| Elf     | 10.0%  | 10.0%  | —      | 15.0%  |
| Demon   | 5.0%   | 10.0%  | 0.0%   | —      |

## Draw Rate per Matchup

| Matchup         | Wins (A/B) | Draws | Games | DR     | Avg Turns |
|-----------------|------------|-------|-------|--------|-----------|
| Human vs Beast  | 4W / 8W    | 8     | 20    | 40.0%  | 20.6      |
| Human vs Elf    | 0W / 2W    | 18    | 20    | 90.0%  | 18.3      |
| Human vs Demon  | 4W / 1W    | 15    | 20    | 75.0%  | 24.0      |
| Beast vs Elf    | 1W / 2W    | 17    | 20    | 85.0%  | 21.0      |
| Beast vs Demon  | 5W / 2W    | 13    | 20    | 65.0%  | 22.4      |
| Elf vs Demon    | 3W / 0W    | 17    | 20    | 85.0%  | 20.9      |
| **Aggregate**   |            | **88**| **120**| **73.3%** | —    |

## P1 Advantage
Overall P1 win rate: 10.0% (12/120 games)

## Top 5 Cards by Win Rate Impact

| Faction | Card           | Impact  |
|---------|----------------|---------|
| Human   | martiallaw     | 20.7%   |
| Human   | shieldwall     | 18.2%   |
| Human   | paladin        | 15.9%   |
| Human   | stoneguard     | 14.8%   |
| Human   | sergeant       | 13.8%   |
| Beast   | savagegrowth   | 24.8%   |
| Beast   | packhowl       | 19.7%   |
| Beast   | plaguehog      | 18.0%   |
| Beast   | razorfang      | 16.2%   |
| Beast   | swiftpaw       | 13.0%   |
| Elf     | manawell       | 52.7% ⚠️|
| Elf     | elfarcher      | 37.5%   |
| Elf     | cascadesage    | 29.8%   |
| Elf     | petrify        | 24.4%   |
| Elf     | sistersiofra   | 23.1%   |
| Demon   | dreadshade     | 9.7%    |
| Demon   | shadowfiend    | 9.1%    |
| Demon   | chaospawn      | 8.6%    |
| Demon   | hellhound      | 7.1%    |
| Demon   | infernalpact   | 6.8%    |

## Flags

- ⚠️ ALL 6 matchups above 30% DR threshold
- ⚠️ Aggregate DR 73.3% — 35pp REGRESSION vs 37.9% baseline
- ⚠️ Elf manawell impact 52.7% — extreme balance outlier
- ⚠️ Demon faction all-card impact < 10% — faction is underperforming
- ⚠️ HvE 90% DR — Elf dominant (0 human wins in 20 games)
- SPD2-AUDIT logging in src/engine/gameEngine.js floods stderr — must suppress with 2>/dev/null in all sim runs

## Key Finding

Tier 1 search improvements INCREASED draw rate vs 37.9% depth=2 baseline (73.3% vs 37.9%). Deeper search makes both AIs more conservative. Contempt(-30) and one-sided stagnation are insufficient to overcome this. The gating condition for Tier 2 (DR < 30%) is far from met.
