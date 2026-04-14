# Pairing Matrix — Initial Results (LOG-1194)

## Parameters
- Games: 10 per directional matchup (132 directions = 1,320 total games)
- Deck mode: curve
- AI: minimax depth 2
- Note: 50-game full matrix run in progress (background job started 2026-04-12)

## Overall Statistics
- **Overall draw rate: 63.3%**  ← CRITICAL FLAG
- P1 win: 15.8% | P2 win: 20.8% | Draw: 63.3%
- Comparison: starter deck baseline at same depth = 29.1% draws
- Root cause: Mystic-containing decks draw 80–100% of matchups (see below)

## Pairing Win Rates (Aggregated, Both Sides)

| Pairing | Win Rate | Draw Rate | Notes |
|---------|----------|-----------|-------|
| primal (mono) | 29.5% | 42.7% | Top pairing |
| primal_dark (friendly) | 27.7% | 54.1% | |
| primal_mystic (enemy) | 24.5% | 53.2% | |
| light_primal (friendly) | 23.2% | 50.5% | |
| dark (mono) | 19.5% | 62.3% | |
| light_mystic (friendly) | 18.2% | 53.6% | |
| dark_light (enemy) | 18.2% | 61.4% | |
| light_dark (enemy) | 16.8% | 58.6% | |
| light (mono) | 15.0% | 60.9% | |
| mystic_primal (enemy) | 11.8% | 85.0% | ⚠ FLAG |
| mystic (mono) | 9.5% | 88.6% | ⚠ FLAG |
| mystic_dark (friendly) | 5.9% | 89.1% | ⚠ FLAG |

## Win Rate Matrix (selected rows — see pairing-matrix-2026-04-11.md for full table)

Highest-variance matchups (< 30% draw rate):
| P1 Pairing | P2 Pairing | P1 Win | P2 Win | Draw | Avg Turns |
|------------|------------|--------|--------|------|-----------|
| primal | light_mystic | 20% | 60% | 20% | 18.4 |
| primal | primal_mystic | 50% | 50% | 0% | 16.9 |
| light_primal | primal | 30% | 60% | 10% | 19.9 |
| dark | light_primal | 70% | 10% | 20% | 21.6 |
| primal_dark | light_primal | 50% | 30% | 20% | 17.6 |
| primal_dark | light_mystic | 50% | 20% | 30% | 14.8 |
| primal_mystic | light_mystic | 50% | 50% | 0% | 18.3 |

## Top 5 Cards by Win Rate per Pairing
(See pairing-matrix-2026-04-11.md for full breakdown)

### Global Overperformers (>+10pp impact, n≥100)
| Card | Impact | Win Rate | n |
|------|--------|----------|---|
| razorfang | +11.6pp | 28.7% | 275 |
| wolf | +11.4pp | 28.0% | 404 |
| wildborne | +10.3pp | 26.9% | 438 |

### Global Near-Overperformers (+7–10pp impact, n≥100)
| Card | Impact | Win Rate | n |
|------|--------|----------|---|
| swiftpaw | +9.9pp | 25.6% | 699 |
| siegemound | +9.8pp | 26.8% | 370 |
| spiritbolt | +9.5pp | 25.7% | 587 |
| packhowl | +9.5pp | 26.6% | 354 |
| apexrampage | +9.5pp | 25.5% | 639 |
| crushingblow | +8.9pp | 25.7% | 451 |
| kragorsbehemoth | +8.6pp | 24.9% | 622 |
| lifedrinkerstag | +8.0pp | 24.8% | 483 |
| packrunt | +7.9pp | 24.9% | 425 |
| stalker | +7.9pp | 25.2% | 321 |
| pip | +7.5pp | 25.1% | 255 |
| pounce | +7.5pp | 24.7% | 397 |

### Global Underperformers (<-7pp impact, n≥100)
| Card | Impact | Win Rate | n |
|------|--------|----------|---|
| grovewarden | -10.0pp | 10.2% | 489 |
| nezzartermsandconditions | -9.4pp | 9.9% | 283 |
| woodlandguard | -8.5pp | 11.1% | 387 |
| cascadesage | -8.2pp | 11.6% | 473 |
| recall | -8.1pp | 11.4% | 394 |
| verdantsurge | -7.4pp | 12.3% | 504 |
| temporalrift | -7.3pp | 12.4% | 514 |
| ancientspring | -7.1pp | 12.2% | 352 |
| canopysentinel | -7.0pp | 12.6% | 483 |
| yggara | -6.8pp | 12.3% | 292 |

## Flags

### CRITICAL: Mystic Faction Cannot Close Games
- **mystic_dark**: 89.1% draw rate — draws against ALL 11 other pairings
- **mystic (mono)**: 88.6% draw rate
- **mystic_primal**: 85.0% draw rate
- **Any matchup involving Mystic**: typically 80–100% draws

Root cause hypothesis: Curve-built Mystic decks fill up with utility/control cards
(AncientSpring, GrovWarden, TemporalRift, Verdantsurge, CascadeSage) that cannot
deal lethal damage within 30 turns. The AI with these cards stalls but never closes.

### CRITICAL: Global Draw Rate 63.3% vs 29.1% Baseline
Curve-built decks produce far more stalemates than starter decks. Three causes:
1. Mystic contamination (see above)
2. Secondary-attribute cards may dilute the winning archetypes of primary factions
3. Curve builder may over-weight low-cost utility cards that don't contribute to win conditions

### P2 Structural Advantage (Confirmed in Pairing Matrix)
- Across all pairings: P2 wins 20.8% vs P1 wins 15.8%
- P2 advantage: +5pp. Consistent with starter deck findings.

### Primal Faction Dominance in Non-Draw Games
- All top 15 overperforming cards are Primal (Beast) cards
- Primal mono wins 29.5% of all games — 3× the win rate of Mystic mono
- Primal_dark and primal_mystic are top-3 pairings by win rate

### Unused Cards
- None: all 163 tracked cards appear in at least one generated deck.
  This confirms the deck builder's card pool covers the full card set.

## Comparison to Starter Deck Baseline

| Metric | Starter Decks | Pairing Matrix (curve) |
|--------|--------------|------------------------|
| Overall draw rate | 29.1% | 63.3% |
| Human (Light) WR | ~31% | 15.0% |
| Beast (Primal) WR | ~35% | 29.5% |
| Elf (Mystic) WR | ~38% (overpowered) | 9.5% |
| Demon (Dark) WR | ~18% | 19.5% |

Notable reversal: Mystic went from overpowered (38% WR) in starter decks to
worst pairing (9.5% WR) in curve-built decks. This suggests Mystic's strength
in starter decks comes from specific synergistic cards pre-selected, not from
the faction's card pool in general.

## Notes on 50-Game Full Matrix
- Background run started 2026-04-12 (~28 min estimated runtime)
- Will produce `pairing_matrix_YYYY-MM-DDTHH-MM-SS.json` in scripts/simulation/
- Expected: patterns above will hold with lower variance at n=50 per matchup
- File: check scripts/simulation/ for most recent pairing_matrix_*.json
