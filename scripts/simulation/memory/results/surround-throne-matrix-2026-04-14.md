# Surround Pressure + Throne Control Full Matrix — 2026-04-14

## Config
- AI: minimax depth 2
- Games per direction: 100 (1200 total)
- Commits: 5e6b69d (championSurroundPressure + throneControlValue)
- Avg AI time/game: 556ms

## Results

**Overall DR: 56.1%** (673/1200) — first time below 60% since LOG-1203

### Combined Matchup Stats

| Matchup | Row WR | Col WR | DR | Avg Turns |
|---|---|---|---|---|
| Human vs Beast | 35.5% | 50.0% | 14.5% | 20.8 |
| Human vs Elf | 1.0% | 16.0% | 83.0% | 20.2 |
| Human vs Demon | 19.0% | 20.5% | 60.5% | 26.7 |
| Beast vs Elf | 6.5% | 26.5% | 67.0% | 18.4 |
| Beast vs Demon | 33.0% | 33.0% | 34.0% | 23.7 |
| Elf vs Demon | 22.0% | 0.5% | 77.5% | 21.6 |

### First-Player Advantage
- Overall P1 win rate: 17.4% (209/1200) — P2 advantage still present

### Top 5 Cards by Win Rate Impact
**Human**: smite (+10.8%), aendor (+9.3%), crusade (+9.2%), standardbearer (+9.1%), ironthorns (+8.6%)
**Beast**: savagegrowth (+13.6%), sabretooth (+12.4%), razorfang (+11.1%), eagerbeaver (+7.4%), gore (+5.0%)
**Elf**: elfranger (+22.2%), glitteringgift (+19.4%), cascadesage (+19.1%), verdantsurge (+19.0%), moonleaf (+17.8%)
**Demon**: hellhound (+15.1%), shadowfiend (+13.6%), fleshtithe (+9.3%), wanderingconstruct (+9.1%), shadowstalker (+7.5%)

## Comparison vs Baselines

| Run | Overall DR | Notes |
|---|---|---|
| Minimax d=2 original clean | 29.1% | Before LOG-1203 faction weights |
| Post-LOG-1203 (old decks) | 63.3% | Old decks |
| New decks + Mystic eval | 64.2% | Previous validated baseline |
| **This run (surround + throne)** | **56.1%** | **−8.1pp improvement** |

## Key Changes vs Prior Baseline (64.2% DR)
- Human vs Elf: 87.0% → 83.0% (−4pp)
- Human vs Demon: 70.0% → 60.5% (−9.5pp) ← large improvement
- Beast vs Elf: 77.5% → 67.0% (−10.5pp) ← large improvement
- Beast vs Demon: 39.0% → 34.0% (−5pp)
- Elf vs Demon: 89.0% → 77.5% (−11.5pp) ← largest improvement
- Human vs Beast: 23.0% → 14.5% (−8.5pp) ← even more decisive

## Flags
- ✅ Overall DR 56.1% — BELOW 60% threshold for first time since LOG-1203
- 🚨 Human vs Elf: 83.0% DR (still critical)
- 🚨 Elf vs Demon: 77.5% DR
- 🚨 Beast vs Elf: 67.0% DR
- 🚨 Human vs Demon: 60.5% DR (borderline)
- ⚠️ Beast vs Demon: 34.0% DR (above 30% gate)
- ✅ Human vs Beast: 14.5% DR (very healthy)
- ⚠️ Beast vs Human WR: 50.0% — Beast dominance flag for this matchup

## Notable: Elf Win Rates Improved Dramatically
- Elf vs Human: 16.0% (was ~6.5%)
- Elf vs Beast: 26.5% (was ~11.0%)
- Elf vs Demon: 22.0% (was ~5.5%)
- throneControlValue (Mystic override=20) appears to be the driver
