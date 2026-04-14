# Pairing Matrix — Full Run (50 Games/Matchup)

## Parameters
- Date: 2026-04-12T01:36:11Z
- Games: 50 per directional matchup × 132 directions = **6,600 total**
- Deck mode: curve
- AI: minimax depth 2
- Source file: `scripts/simulation/pairing_matrix_2026-04-12T01-36-11.json`

## Overall Statistics

| Metric | Value |
|--------|-------|
| Overall draw rate | **63.76%** |
| P1 win rate | 15.70% |
| P2 win rate | 20.55% |
| P2 advantage | +4.85pp |
| Avg game length | 17.0 turns |
| Min avg turns (matchup) | 10.6 |
| Max avg turns (matchup) | 23.4 |
| Comparison (starter decks, same AI) | 29.1% draws |

## Pairing Win Rates (Aggregated — Both Sides, n=1100 each)

| Pairing | Win Rate | Draw Rate | Rank |
|---------|----------|-----------|------|
| primal (mono) | **27.8%** | 48.3% | 1 |
| light_primal (friendly) | 24.7% | 51.3% | 2 |
| primal_mystic (enemy) | 24.4% | 53.4% | 3 |
| dark (mono) | 22.6% | 62.1% | 4 |
| primal_dark (friendly) | 20.5% | 51.1% | 5 |
| dark_light (enemy) | 20.5% | 60.5% | 6 |
| light_mystic (friendly) | 18.9% | 58.3% | 7 |
| light_dark (enemy) | 15.9% | 58.2% | 8 |
| light (mono) | 15.3% | 59.2% | 9 |
| mystic_primal (enemy) | 12.7% | **82.9%** | 10 ⚠ |
| mystic (mono) | 9.2% | **88.5%** | 11 ⚠ |
| mystic_dark (friendly) | 4.8% | **91.5%** | 12 ⚠ |

## Win Rate Matrix (All 132 Directional Matchups)

| P1 Pairing | P2 Pairing | P1 Win | P2 Win | Draw | Avg Turns |
|------------|------------|--------|--------|------|-----------|
| light | dark | 10.0% | 32.0% | 58.0% | 19.5 |
| light | dark_light | 18.0% | 26.0% | 56.0% | 19.8 |
| light | light_dark | 22.0% | 18.0% | 60.0% | 18.2 |
| light | light_mystic | 24.0% | 30.0% | 46.0% | 21.3 |
| light | light_primal | 22.0% | 42.0% | 36.0% | 19.8 |
| light | mystic | 2.0% | 16.0% | 82.0% | 12.6 |
| light | mystic_dark | 2.0% | 4.0% | 94.0% | 14.4 |
| light | mystic_primal | 0.0% | 12.0% | 88.0% | 14.0 |
| light | primal | 14.0% | 44.0% | 42.0% | 19.8 |
| light | primal_dark | 8.0% | 38.0% | 54.0% | 19.8 |
| light | primal_mystic | 14.0% | 36.0% | 50.0% | 18.1 |
| primal | dark | 28.0% | 32.0% | 40.0% | 16.0 |
| primal | dark_light | 18.0% | 36.0% | 46.0% | 17.2 |
| primal | light | 40.0% | 16.0% | 44.0% | 17.5 |
| primal | light_dark | 44.0% | 26.0% | 30.0% | 15.9 |
| primal | light_mystic | 30.0% | 38.0% | 32.0% | 17.5 |
| primal | light_primal | 38.0% | 38.0% | 24.0% | 16.9 |
| primal | mystic | 12.0% | 22.0% | 66.0% | 14.7 |
| primal | mystic_dark | 14.0% | 8.0% | 78.0% | 13.8 |
| primal | mystic_primal | 8.0% | 22.0% | 70.0% | 13.8 |
| primal | primal_dark | 32.0% | 34.0% | 34.0% | 16.0 |
| primal | primal_mystic | 22.0% | 42.0% | 36.0% | 17.9 |
| mystic | dark | 4.0% | 6.0% | 90.0% | 15.4 |
| mystic | dark_light | 10.0% | 2.0% | 88.0% | 16.3 |
| mystic | light | 8.0% | 0.0% | 92.0% | 12.7 |
| mystic | light_dark | 14.0% | 0.0% | 86.0% | 13.2 |
| mystic | light_mystic | 2.0% | 0.0% | 98.0% | 13.0 |
| mystic | light_primal | 6.0% | 6.0% | 88.0% | 13.8 |
| mystic | mystic_dark | 2.0% | 0.0% | 98.0% | 14.0 |
| mystic | mystic_primal | 2.0% | 0.0% | 98.0% | 11.3 |
| mystic | primal | 4.0% | 8.0% | 88.0% | 13.2 |
| mystic | primal_dark | 8.0% | 4.0% | 88.0% | 14.4 |
| mystic | primal_mystic | 2.0% | 4.0% | 94.0% | 12.5 |
| dark | dark_light | 16.0% | 14.0% | 70.0% | 21.1 |
| dark | light | 26.0% | 24.0% | 50.0% | 20.3 |
| dark | light_dark | 32.0% | 8.0% | 60.0% | 21.4 |
| dark | light_mystic | 18.0% | 26.0% | 56.0% | 22.8 |
| dark | light_primal | 24.0% | 24.0% | 52.0% | 19.8 |
| dark | mystic | 0.0% | 20.0% | 80.0% | 15.5 |
| dark | mystic_dark | 4.0% | 6.0% | 90.0% | 16.1 |
| dark | mystic_primal | 8.0% | 32.0% | 60.0% | 14.5 |
| dark | primal | 26.0% | 26.0% | 48.0% | 16.9 |
| dark | primal_dark | 36.0% | 18.0% | 46.0% | 17.8 |
| dark | primal_mystic | 20.0% | 16.0% | 64.0% | 17.1 |
| light_primal | dark | 12.0% | 38.0% | 50.0% | 17.6 |
| light_primal | dark_light | 20.0% | 24.0% | 56.0% | 18.8 |
| light_primal | light | 38.0% | 32.0% | 30.0% | 18.8 |
| light_primal | light_dark | 26.0% | 24.0% | 50.0% | 19.4 |
| light_primal | light_mystic | 32.0% | 36.0% | 32.0% | 21.5 |
| light_primal | mystic | 6.0% | 12.0% | 82.0% | 14.0 |
| light_primal | mystic_dark | 8.0% | 12.0% | 80.0% | 14.3 |
| light_primal | mystic_primal | 4.0% | 20.0% | 76.0% | 16.8 |
| light_primal | primal | 40.0% | 38.0% | 22.0% | 16.5 |
| light_primal | primal_dark | 36.0% | 26.0% | 38.0% | 17.7 |
| light_primal | primal_mystic | 24.0% | 44.0% | 32.0% | 19.3 |
| light_mystic | dark | 8.0% | 22.0% | 70.0% | 20.2 |
| light_mystic | dark_light | 18.0% | 28.0% | 54.0% | 22.3 |
| light_mystic | light | 22.0% | 14.0% | 64.0% | 22.1 |
| light_mystic | light_dark | 26.0% | 26.0% | 48.0% | 21.2 |
| light_mystic | light_primal | 26.0% | 42.0% | 32.0% | 20.2 |
| light_mystic | mystic | 0.0% | 10.0% | 90.0% | 14.5 |
| light_mystic | mystic_dark | 0.0% | 6.0% | 94.0% | 15.5 |
| light_mystic | mystic_primal | 4.0% | 14.0% | 82.0% | 15.8 |
| light_mystic | primal | 18.0% | 52.0% | 30.0% | 18.5 |
| light_mystic | primal_dark | 16.0% | 36.0% | 48.0% | 17.8 |
| light_mystic | primal_mystic | 28.0% | 34.0% | 38.0% | 20.9 |
| primal_dark | dark | 10.0% | 44.0% | 46.0% | 20.4 |
| primal_dark | dark_light | 12.0% | 44.0% | 44.0% | 19.8 |
| primal_dark | light | 32.0% | 22.0% | 46.0% | 17.5 |
| primal_dark | light_dark | 26.0% | 38.0% | 36.0% | 21.4 |
| primal_dark | light_mystic | 26.0% | 28.0% | 46.0% | 18.8 |
| primal_dark | light_primal | 26.0% | 44.0% | 30.0% | 17.1 |
| primal_dark | mystic | 0.0% | 20.0% | 80.0% | 14.5 |
| primal_dark | mystic_dark | 4.0% | 14.0% | 82.0% | 14.8 |
| primal_dark | mystic_primal | 6.0% | 28.0% | 66.0% | 15.4 |
| primal_dark | primal | 24.0% | 40.0% | 36.0% | 15.2 |
| primal_dark | primal_mystic | 36.0% | 42.0% | 22.0% | 18.4 |
| mystic_dark | dark | 6.0% | 4.0% | 90.0% | 14.2 |
| mystic_dark | dark_light | 12.0% | 8.0% | 80.0% | 16.1 |
| mystic_dark | light | 2.0% | 0.0% | 98.0% | 12.6 |
| mystic_dark | light_dark | 4.0% | 0.0% | 96.0% | 14.1 |
| mystic_dark | light_mystic | 0.0% | 0.0% | 100.0% | 13.5 |
| mystic_dark | light_primal | 0.0% | 2.0% | 98.0% | 14.4 |
| mystic_dark | mystic | 0.0% | 2.0% | 98.0% | 10.6 |
| mystic_dark | mystic_primal | 0.0% | 8.0% | 92.0% | 12.7 |
| mystic_dark | primal | 0.0% | 2.0% | 98.0% | 12.4 |
| mystic_dark | primal_dark | 4.0% | 6.0% | 90.0% | 13.6 |
| mystic_dark | primal_mystic | 2.0% | 2.0% | 96.0% | 12.5 |
| primal_mystic | dark | 4.0% | 38.0% | 58.0% | 20.4 |
| primal_mystic | dark_light | 26.0% | 26.0% | 48.0% | 18.2 |
| primal_mystic | light | 44.0% | 28.0% | 28.0% | 21.0 |
| primal_mystic | light_dark | 34.0% | 26.0% | 40.0% | 20.5 |
| primal_mystic | light_mystic | 32.0% | 32.0% | 36.0% | 20.4 |
| primal_mystic | light_primal | 38.0% | 28.0% | 34.0% | 18.4 |
| primal_mystic | mystic | 0.0% | 12.0% | 88.0% | 14.3 |
| primal_mystic | mystic_dark | 6.0% | 8.0% | 86.0% | 14.2 |
| primal_mystic | mystic_primal | 6.0% | 20.0% | 74.0% | 14.4 |
| primal_mystic | primal | 22.0% | 36.0% | 42.0% | 16.2 |
| primal_mystic | primal_dark | 40.0% | 32.0% | 28.0% | 18.0 |
| mystic_primal | dark | 10.0% | 4.0% | 86.0% | 16.5 |
| mystic_primal | dark_light | 12.0% | 0.0% | 88.0% | 15.5 |
| mystic_primal | light | 6.0% | 2.0% | 92.0% | 16.1 |
| mystic_primal | light_dark | 18.0% | 0.0% | 82.0% | 14.5 |
| mystic_primal | light_mystic | 10.0% | 0.0% | 90.0% | 14.1 |
| mystic_primal | light_primal | 8.0% | 10.0% | 82.0% | 13.6 |
| mystic_primal | mystic | 0.0% | 4.0% | 96.0% | 14.1 |
| mystic_primal | mystic_dark | 2.0% | 2.0% | 96.0% | 13.3 |
| mystic_primal | primal | 10.0% | 16.0% | 74.0% | 12.6 |
| mystic_primal | primal_dark | 12.0% | 6.0% | 82.0% | 15.7 |
| mystic_primal | primal_mystic | 10.0% | 4.0% | 86.0% | 13.9 |
| light_dark | dark | 14.0% | 36.0% | 50.0% | 20.1 |
| light_dark | dark_light | 8.0% | 24.0% | 68.0% | 20.8 |
| light_dark | light | 26.0% | 40.0% | 34.0% | 18.6 |
| light_dark | light_mystic | 20.0% | 34.0% | 46.0% | 21.9 |
| light_dark | light_primal | 20.0% | 30.0% | 50.0% | 20.4 |
| light_dark | mystic | 0.0% | 12.0% | 88.0% | 16.4 |
| light_dark | mystic_dark | 2.0% | 2.0% | 96.0% | 14.1 |
| light_dark | mystic_primal | 2.0% | 16.0% | 82.0% | 15.8 |
| light_dark | primal | 22.0% | 36.0% | 42.0% | 16.3 |
| light_dark | primal_dark | 28.0% | 26.0% | 46.0% | 19.6 |
| light_dark | primal_mystic | 22.0% | 30.0% | 48.0% | 20.8 |
| dark_light | dark | 16.0% | 32.0% | 52.0% | 19.0 |
| dark_light | light | 20.0% | 22.0% | 58.0% | 20.2 |
| dark_light | light_dark | 38.0% | 20.0% | 42.0% | 19.1 |
| dark_light | light_mystic | 24.0% | 26.0% | 50.0% | 23.4 |
| dark_light | light_primal | 14.0% | 32.0% | 54.0% | 20.1 |
| dark_light | mystic | 2.0% | 10.0% | 88.0% | 16.4 |
| dark_light | mystic_dark | 2.0% | 14.0% | 84.0% | 15.1 |
| dark_light | mystic_primal | 8.0% | 10.0% | 82.0% | 16.4 |
| dark_light | primal | 32.0% | 28.0% | 40.0% | 17.3 |
| dark_light | primal_dark | 40.0% | 24.0% | 36.0% | 20.0 |
| dark_light | primal_mystic | 24.0% | 30.0% | 46.0% | 22.3 |

## Card Analysis — Global

### Overperformers (>+6pp impact, n≥1000)

| Card | Impact | Win Rate | n |
|------|--------|----------|---|
| razorfang | +8.9pp | 26.1% | 1447 |
| apexrampage | +8.6pp | 24.6% | 3238 |
| siegemound | +8.1pp | 25.2% | 1715 |
| sabretooth | +7.8pp | 24.2% | 2979 |
| crushingblow | +7.5pp | 24.4% | 2256 |
| savagegrowth | +7.1pp | 24.3% | 1754 |
| eagerbeaver | +7.1pp | 24.3% | 1708 |
| stalker | +6.9pp | 24.1% | 1795 |
| swiftpaw | +6.7pp | 23.0% | 3513 |
| wolf | +6.6pp | 23.7% | 2061 |
| boar | +6.6pp | 22.9% | 3586 |
| spiritbolt | +6.6pp | 23.2% | 3012 |
| razorclaw | +6.6pp | 23.6% | 2111 |
| kragorsbehemoth | +6.6pp | 23.1% | 3248 |
| gore | +6.5pp | 23.6% | 2109 |

All 15 overperformers are **Primal (Beast)** cards.

### Underperformers (<-6pp impact, n≥1000)

| Card | Impact | Win Rate | n |
|------|--------|----------|---|
| yggara | -7.5pp | 11.5% | 1422 |
| moonveilmystic | -7.3pp | 12.2% | 2391 |
| seedling | -7.3pp | 12.8% | 3537 |
| fennwickthequiet | -7.2pp | 11.7% | 1370 |
| grovewarden | -7.0pp | 12.4% | 2382 |
| spitechanneler | -7.0pp | 12.4% | 2434 |
| canopysentinel | -6.7pp | 12.7% | 2501 |
| temporalrift | -6.6pp | 12.8% | 2543 |
| overgrowth | -6.5pp | 12.8% | 2362 |
| thornweave | -6.4pp | 12.6% | 1817 |
| elfranger | -6.4pp | 12.9% | 2440 |
| elfarcher | -6.4pp | 13.0% | 2622 |
| verdantsurge | -6.4pp | 13.0% | 2590 |
| ancientspring | -6.2pp | 12.8% | 1873 |
| elfelder | -6.2pp | 12.8% | 1891 |

All 15 underperformers are **Mystic (Elf)** cards.

### Unused Cards
None — all cards appeared in at least one generated deck.

## Flags Summary

### CRITICAL: Mystic faction non-functional with curve decks
- mystic_dark: **91.5% DR** — 100% draws vs light_mystic
- mystic mono: **88.5% DR** — only 9.2% win rate across all matchups
- mystic_primal: **82.9% DR**
- Best Mystic win rate in any single matchup: mystic vs dark_light = 10% (as P1)
- Root cause: Mystic curve-eligible cards (GrovWarden, TemporalRift, CascadeSage, Yggara,
  Seedling, Overgrowth) are utility/sustain — none produce lethal pressure within 30 turns

### CRITICAL: 63.76% global draw rate (vs 29.1% starter baseline, +34.7pp)
- Even excluding all Mystic-containing matchups, draw rate estimated ~50%+
- Best matchup draw rate: light_primal vs primal = 22%
- NO matchup achieves < 20% draw rate

### P2 structural advantage: +4.85pp (consistent across all prior runs)

### Primal faction dominant in decisive games:
- All top-15 globally overperforming cards are Primal
- primal mono leads all pairings at 27.8% WR
- Decisive matchup cluster: any two Primal-containing pairings

## Consistency Check (10-game vs 50-game)

| Metric | 10-game | 50-game | Δ |
|--------|---------|---------|---|
| Overall draw rate | 63.3% | 63.76% | +0.46pp |
| primal WR | 29.5% | 27.8% | -1.7pp |
| mystic_dark WR | 5.9% | 4.8% | -1.1pp |
| mystic DR | 88.6% | 88.5% | -0.1pp |
| P2 advantage | +5.0pp | +4.85pp | -0.15pp |

10-game results were highly predictive of 50-game results. Patterns are robust.
