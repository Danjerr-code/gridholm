# Baseline Simulation Run — 2026-04-11

## Config
- AI: minimax depth=2 (both players)
- Games per direction: 20
- Total games: 240 (6 pairs × 2 directions × 20)
- Factions: Human, Beast, Elf, Demon

## Deck Fix Applied
- Human deck was 29 cards (clockworkmanimus commented out due to LOG-1152)
- Added `shieldwall` (2-cost, 1/5, no triggers) to restore 30-card count before run

## Win Rate Matrix (row = winner faction, col = opponent faction)
| Faction | Human | Beast |  Elf  | Demon |
|---------|-------|-------|-------|-------|
| Human   |   -   | 32.5% | 47.5% | 45.0% |
| Beast   | 60.0% |   -   | 47.5% | 57.5% |
| Elf     |  2.5% | 17.5% |   -   | 15.0% |
| Demon   | 10.0% | 32.5% | 30.0% |   -   |

## Draw Rates per Matchup (combined both directions, 40 games each)
| Matchup        | Draws | Draw Rate | Flag     |
|----------------|-------|-----------|----------|
| Human vs Beast |  3/40 |    7.5%   |          |
| Human vs Elf   | 20/40 |   50.0%   | FLAG >30% |
| Human vs Demon | 18/40 |   45.0%   | FLAG >30% |
| Beast vs Elf   | 14/40 |   35.0%   | FLAG >30% |
| Beast vs Demon |  4/40 |   10.0%   |          |
| Elf vs Demon   | 22/40 |   55.0%   | FLAG >30% |

## Avg Game Length per Matchup
| Matchup        | Avg Turns |
|----------------|-----------|
| Human vs Beast |    19.8   |
| Human vs Elf   |    26.4   |
| Human vs Demon |    24.4   |
| Beast vs Elf   |    23.4   |
| Beast vs Demon |    19.6   |
| Elf vs Demon   |    27.5   |

## First-Player Advantage
| Metric              | Value  |
|---------------------|--------|
| P1 overall win rate | 28.3%  |
| P2 overall win rate | 37.9%  |
| Draw rate           | 33.8%  |
- P2 has a ~10pp advantage over P1 — inverted from expected; possible depth-2 minimax artifact.

## Overall Faction Win Rates (across all matchups)
| Faction | Win Rate | Flag       |
|---------|----------|------------|
| Beast   | ~55%     | FLAG >60% borderline |
| Human   | ~41%     |            |
| Demon   | ~24%     |            |
| Elf     | ~12%     |            |

## Top 5 Cards by Win Rate Impact per Faction
*Note: cross-faction contamination suspected — opponent cards may appear in lists. See known-issues.md.*

- **Human context**: savagegrowth (39.1%), korraksecondang (37.3%), wildborne (34.7%), pip (31.7%), wolf (31.7%)
- **Beast context**: savagegrowth (27.8%), razorfang (27.4%), wolf (21.5%), packhowl (21.4%), razorclaw (20.7%)
- **Elf context**: pip (39.8%), razorclaw (38.7%), captain (37.4%), aendor (34.5%), callofthesnakes (33.8%)
- **Demon context**: razorfang (46.8%), packhowl (42.0%), savagegrowth (37.8%), feralsurge (36.3%), wolf (32.4%)

## Flags Summary
| # | Flag                               | Value  | Threshold |
|---|------------------------------------|--------|-----------|
| 1 | Beast win rate vs Human            | 60.0%  | >60%      |
| 2 | Elf vs Demon draw rate             | 55.0%  | >30%      |
| 3 | Human vs Elf draw rate             | 50.0%  | >30%      |
| 4 | Human vs Demon draw rate           | 45.0%  | >30%      |
| 5 | Beast vs Elf draw rate             | 35.0%  | >30%      |
| 6 | Elf severely weak (max 17.5% win)  | —      | faction   |
| 7 | Demon weak vs Human (10.0% win)    | —      | faction   |
| 8 | P2 structural advantage inverted   | +9.6pp | >5pp gap  |
