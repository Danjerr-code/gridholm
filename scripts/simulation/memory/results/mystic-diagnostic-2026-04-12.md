# Mystic Diagnostic — 2026-04-12

## Purpose
Test whether the Mystic weight profile produces correct decisions when paired with
a hand-picked control deck. Isolates deck quality from eval weight quality.

## Deck
yggara, azulonsilvertide, sistersiofra, fennwickthequiet, whisper, elfelder, bloom, ancientspring, overgrowth, recall, canopysentinel, cascadesage, petrify, mindseize, verdantsurge, amethystcache, thornweave, moonveilmystic, elfranger, oathrootkeeper, duskbloomtender, sylvancourier, verdantarcher, elfscout, seedling, grovewarden, woodlandguard, moonleaf, entangle, grovechampion

## Parameters
- Games: 50 per matchup (split P1/P2)
- AI: minimax depth 2

## Overall
- Mystic win rate: **28.5%**
- Opponent win rate: 3.1%
- Draw rate: 68.4%

## Per-Matchup

| Opponent | Mystic W% | Opp W% | Draw% | Avg Turns |
|----------|-----------|--------|-------|-----------|
| light | 36.0% | 2.0% | 62.0% | 16.7 |
| primal | 36.0% | 8.0% | 56.0% | 15.1 |
| dark | 36.0% | 2.0% | 62.0% | 17.2 |
| light_primal | 34.0% | 6.0% | 60.0% | 16.4 |
| light_mystic | 36.0% | 0.0% | 64.0% | 18.3 |
| primal_dark | 22.0% | 2.0% | 76.0% | 16.4 |
| mystic_dark | 8.0% | 4.0% | 88.0% | 13.7 |
| primal_mystic | 28.0% | 8.0% | 64.0% | 16.2 |
| mystic_primal | 16.0% | 2.0% | 82.0% | 15.9 |
| light_dark | 32.0% | 0.0% | 68.0% | 18.9 |
| dark_light | 30.0% | 0.0% | 70.0% | 18.2 |

## Flags
- HIGH DRAW vs light: 62.0%
- HIGH DRAW vs primal: 56.0%
- HIGH DRAW vs dark: 62.0%
- HIGH DRAW vs light_primal: 60.0%
- HIGH DRAW vs light_mystic: 64.0%
- HIGH DRAW vs primal_dark: 76.0%
- HIGH DRAW vs mystic_dark: 88.0%
- HIGH DRAW vs primal_mystic: 64.0%
- HIGH DRAW vs mystic_primal: 82.0%
- HIGH DRAW vs light_dark: 68.0%
- HIGH DRAW vs dark_light: 70.0%