# No-Profiles Validation Matrix — 2026-04-14

## Config
- AI: minimax depth 2
- Games per direction: 100 (1200 total)
- Flag: `--no-profiles` (base WEIGHTS only, all faction profile overrides disabled)
- Commit: 78b8b3e (feat: --no-profiles flag for clean weights validation)
- Avg AI time/game: 602ms

## Results

**Overall DR: 53.4%** (641/1200)

### Combined Matchup Stats

| Matchup | Row WR | Col WR | DR | Avg Turns |
|---|---|---|---|---|
| Human vs Beast | 35.5% | 54.0% | 10.5% | 21.2 |
| Human vs Elf | 0.0% | 14.0% | 86.0% | 19.1 |
| Human vs Demon | 20.0% | 25.0% | 55.0% | 26.5 |
| Beast vs Elf | 5.0% | 30.0% | 65.0% | 17.8 |
| Beast vs Demon | 37.5% | 35.5% | 27.0% | 23.0 |
| Elf vs Demon | 21.5% | 1.5% | 77.0% | 20.4 |

### First-Player Advantage
- Overall P1 win rate: 19.2% (230/1200) — P2 advantage consistent with prior runs

### Top 5 Cards by Win Rate Impact
**Human**: warlord (+14.5%), aendor (+11.2%), soulstone (+9.8%), battlestandard (+8.7%), standardbearer (+8.5%)
**Beast**: razorfang (+18.7%), sabretooth (+13.2%), savagegrowth (+13.1%), gore (+6.8%), wolf (+4.5%)
**Elf**: elfarcher (+21.9%), bloom (+17.2%), elfelder (+13.7%), sistersiofra (+13.5%), elfranger (+13.2%)
**Demon**: dreadknight (+12.2%), vexishollowking (+10.9%), shadowstalker (+10.8%), shadowfiend (+10.4%), dreadshade (+8.6%)

## Comparison vs Baseline (with profiles, 56.1% DR)

| Matchup | Profiles DR | No-Profiles DR | Delta |
|---|---|---|---|
| Human vs Beast | 14.5% | 10.5% | −4.0pp |
| Human vs Elf | 83.0% | **86.0%** | **+3.0pp (WORSE)** |
| Human vs Demon | 60.5% | 55.0% | −5.5pp |
| Beast vs Elf | 67.0% | 65.0% | −2.0pp |
| Beast vs Demon | 34.0% | 27.0% | −7.0pp |
| Elf vs Demon | 77.5% | 77.0% | −0.5pp |
| **Overall** | **56.1%** | **53.4%** | **−2.7pp** |

## Key Findings
- Removing profiles improves overall DR by −2.7pp (56.1% → 53.4%)
- **Human vs Elf gets WORSE (+3pp)**: Mystic profile was marginally helping reduce draws in this matchup — throneControlValue=20 and healingValue=0 were providing mild Elf aggression
- **Beast vs Demon** sees largest improvement (−7pp): likely a Demon profile passive tendency was prolonging games
- **Human vs Demon** meaningful improvement (−5.5pp)
- Human vs Elf draw problem is structural, not profile-related (86% without vs 83% with)

## Flags
- 🚨 Human vs Elf: 86.0% DR (critical — WORSE than baseline)
- 🚨 Elf vs Demon: 77.0% DR
- 🚨 Beast vs Elf: 65.0% DR
- 🚨 Human vs Demon: 55.0% DR
- ✅ Beast vs Demon: 27.0% DR (below 30% gate for first time)
- ✅ Human vs Beast: 10.5% DR (healthy)

## Conclusion
Faction profiles provide marginal benefit in specific matchups (Elf). Overall, base WEIGHTS alone produces −2.7pp fewer draws. The Elf structural draw problem is NOT profile-related — it persists regardless at 77-86% DR across Elf matchups. Recommend informing board that profile removal alone cannot solve the Elf problem.
