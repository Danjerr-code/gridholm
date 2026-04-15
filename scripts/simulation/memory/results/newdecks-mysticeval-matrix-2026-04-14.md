# New Decks + Mystic Eval Validation Matrix — 2026-04-14

## Config
- AI: minimax depth 2
- Games per direction: 100 (1200 total, 6 pairs × 2 directions)
- Commits: a0e9fe4 (new deck compositions) + deck count fixes (callofthesnakes removed from Beast, shadowveil removed from Demon, both 31→30) + 74266e3 (Mystic eval changes)

## Deck Changes Applied
- Beast: `callofthesnakes` removed (31→30 cards)
- Demon: `shadowveil` removed (31→30 cards)
- Human: already 30 cards (no change)
- Elf: already 30 cards (no change)
- **Note**: Board should confirm which cards should actually be removed — the analyst chose alphabetically/last in list

## Mystic Eval Changes Applied (commit 74266e3)
- `unitsThreateningChampion`: 8 → 14
- `healingValue`: 8 → 5
- `opponentChampionLowHP`: (new override) → 45 (was 30 from WEIGHTS)
- `gameLengthPenaltyStart` for mystic: 20 → 14

## Results

**Overall DR: 64.2%** (771/1200 games drew)

### Combined Matchup Stats

| Matchup | Row WR | Col WR | DR | Avg Turns |
|---|---|---|---|---|
| Human vs Beast | 37.5% | 39.5% | 23.0% | ~21 |
| Human vs Elf | 6.5% | 6.5% | 87.0% | ~20 |
| Human vs Demon | 8.0% | 22.0% | 70.0% | ~27 |
| Beast vs Elf | 11.5% | 11.0% | 77.5% | ~20 |
| Beast vs Demon | 34.5% | 26.5% | 39.0% | ~22 |
| Elf vs Demon | 5.5% | 5.5% | 89.0% | ~21 |

## Comparison vs Prior Baseline

| Run | DR | Notes |
|---|---|---|
| minimax d=2 original clean (2026-04-11) | 29.1% | Before faction weights |
| minimax d=2 post-LOG-1203 (2026-04-14) | 63.3% | Old decks, no Mystic eval |
| This run (new decks + Mystic eval) | 64.2% | +0.9pp — within noise |

## Mystic Eval Impact (Human vs Elf)
- Before: 97.0% DR
- After: 87.0% DR
- Change: −10pp — insufficient; still far above 30% gate

## Flags
- 🚨 Overall DR 64.2% > 60% threshold
- 🚨 Human vs Elf: 87.0% DR
- 🚨 Human vs Demon: 70.0% DR
- 🚨 Elf vs Demon: 89.0% DR
- 🚨 Beast vs Elf: 77.5% DR
- ⚠️ Beast vs Demon: 39.0% DR (above 30%)
- ✅ Human vs Beast: 23.0% DR (healthy)

## Top 5 Cards by Win Rate Impact

**Human**: battlestandard, smite, captain, aendor, paladin
**Beast**: razorfang, packhowl, sabretooth, savagegrowth, pip
**Elf**: glitteringgift, verdantarcher, overgrowth, elfscout, verdantsurge
**Demon**: hellhound, shadowfiend, dreadshade, wanderingconstruct, zmore

## Key Finding
Mystic eval changes had minimal impact on overall DR (+0.9pp vs prior, noise level).
Elf matchups remain structurally broken (77-89% DR). Human vs Beast is the only healthy matchup.
MCTS (at any timeout setting, 100ms or 200ms) performed worse than minimax (85-98% DR).
Minimax depth 2 remains the best available AI, but is insufficient for Elf matchups.
