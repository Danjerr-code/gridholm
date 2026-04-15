# Trade Efficiency + Tile Denial + MAX_CANDIDATES=6 Matrix — 2026-04-14

## Config
- AI: minimax depth 2
- Games per direction: 100 (1200 total)
- Commit: b479083 (feat: trade efficiency eval, expanded candidates, tile denial scoring)
- Avg AI time/game: 825ms (+269ms vs prior baseline of 556ms; well under 2s flag threshold)

## Changes vs Baseline (surround-throne 56.1% DR)
- `tradeEfficiency` eval term (weight 5): scores favorable attack trades reachable this turn
- `tileDenial` eval term (weight 6): friendly units adj to enemy champion block summon tiles
- `MAX_CANDIDATES`: raised 4 → 6 in minimaxAI.js

## Results

**Overall DR: 51.4%** (617/1200) — −4.7pp vs surround-throne baseline (56.1%)

### Win Rate Matrix (row WR vs col faction)

|        | Human | Beast | Elf   | Demon |
|--------|-------|-------|-------|-------|
| Human  | —     | 37.0% | 1.5%  | 24.0% |
| Beast  | 52.0% | —     | 7.5%  | 43.5% |
| Elf    | 18.0% | 20.5% | —     | 25.5% |
| Demon  | 24.5% | 37.0% | 0.5%  | —     |

### Combined Matchup Stats

| Matchup       | Row WR | Col WR | DR    | Avg Turns |
|---------------|--------|--------|-------|-----------|
| Human vs Beast| 37.0%  | 52.0%  | 11.0% | 20.0      |
| Human vs Elf  | 1.5%   | 18.0%  | 80.5% | 18.7      |
| Human vs Demon| 24.0%  | 24.5%  | 51.5% | 25.5      |
| Beast vs Elf  | 7.5%   | 20.5%  | 72.0% | 19.1      |
| Beast vs Demon| 43.5%  | 37.0%  | 19.5% | 21.3      |
| Elf vs Demon  | 25.5%  | 0.5%   | 74.0% | 21.7      |

### First-Player Advantage
- Overall P1 win rate: 20.5% (246/1200) — P2 advantage persistent

### Top 5 Cards by Win Rate Impact

| Faction | Card           | Impact |
|---------|----------------|--------|
| Human   | captain        | 17.4%  |
| Human   | battlepriestunit| 11.4% |
| Human   | warlord        | 10.5%  |
| Human   | ironthorns     | 10.3%  |
| Human   | knight         | 8.6%   |
| Beast   | razorfang      | 21.4%  |
| Beast   | sabretooth     | 7.3%   |
| Beast   | savagegrowth   | 6.6%   |
| Beast   | wolf           | 5.6%   |
| Beast   | gore           | 5.5%   |
| Elf     | cascadesage    | 22.5%  |
| Elf     | sistersiofra   | 16.6%  |
| Elf     | verdantarcher  | 12.9%  |
| Elf     | glitteringgift | 12.2%  |
| Elf     | elfscout       | 11.2%  |
| Demon   | vexishollowking| 16.0%  |
| Demon   | fleshtithe     | 11.5%  |
| Demon   | hellhound      | 10.0%  |
| Demon   | smokebomb      | 8.3%   |
| Demon   | dreadshade     | 8.1%   |

## Comparison vs Surround-Throne Baseline (56.1% DR)

| Matchup       | Baseline DR | This DR | Delta        |
|---------------|-------------|---------|--------------|
| Human vs Beast| 14.5%       | 11.0%   | −3.5pp ✅    |
| Human vs Elf  | 83.0%       | 80.5%   | −2.5pp ✅    |
| Human vs Demon| 60.5%       | 51.5%   | −9.0pp ✅    |
| Beast vs Elf  | 67.0%       | 72.0%   | **+5.0pp 🚨** |
| Beast vs Demon| 34.0%       | 19.5%   | −14.5pp ✅   |
| Elf vs Demon  | 77.5%       | 74.0%   | −3.5pp ✅    |
| **Overall**   | **56.1%**   | **51.4%**| **−4.7pp ✅** |

## Flags
- 🚨 Human vs Elf: 80.5% DR (structural problem — persists across all runs)
- 🚨 Elf vs Demon: 74.0% DR
- 🚨 Beast vs Elf: 72.0% DR (REGRESSION: +5pp vs baseline — worst performing change)
- ⚠️ Human vs Demon: 51.5% DR (first time below 60%; still elevated)
- ✅ Beast vs Demon: 19.5% DR (well below 30% gate — best matchup)
- ✅ Human vs Beast: 11.0% DR (very healthy)
- ✅ Avg AI time: 825ms (well under 2s threshold despite MAX_CANDIDATES=6)

## Key Findings
- **Beast vs Demon**: −14.5pp, now at 19.5% — best result across all runs for this matchup
- **Human vs Demon**: −9.0pp, first time below 60% — significant improvement
- **Beast vs Elf REGRESSION**: +5.0pp worse. Likely cause: with 6 candidates, Elf AI
  is selecting passive heal/sustain spells more often (cascadesage, glitteringgift) that
  prolong games vs Beast aggression. tileDenial may also be scoring Elf's adjacent units
  near Beast champion, rewarding passive positions instead of finishing.
- **Overall −4.7pp**: Largest single-run DR improvement since LOG-1203 faction weights.
- **AI time 825ms**: +48% vs 556ms baseline — acceptable but notable. If MAX_CANDIDATES
  is raised further, may approach 2s flag.

## Recommendations
- Investigate Beast vs Elf regression: consider whether tileDenial weight (6) is creating
  perverse incentives for Elf to cluster near champion rather than push
- Consider reducing tileDenial for Mystic/Elf faction profile or adding a phase gate
  (e.g., only score tileDenial after turn 6)
- Beast vs Demon and Human vs Demon show tradeEfficiency working as intended
