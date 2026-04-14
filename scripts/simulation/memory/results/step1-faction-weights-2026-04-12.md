# Step 1 Results — Faction-Specific Evaluation Weights (LOG-1203)

## Parameters
- Date: 2026-04-12T04:25:58Z
- Commit: 24c6c85 (feat(sim): faction-specific evaluation weight profiles)
- Games: 50 per directional matchup × 132 = 6,600 total
- Deck mode: curve | AI: minimax depth 2
- Baseline: pairing_matrix_2026-04-12T01-36-11.json (universal weights)
- New run: pairing_matrix_2026-04-12T04-25-58.json (faction weights)

## Overall Statistics

| Metric | Baseline | Step 1 | Δ |
|--------|----------|--------|---|
| Overall draw rate | 63.76% | 62.85% | -0.91pp |
| P1 win rate | 15.70% | 16.48% | +0.78pp |
| P2 win rate | 20.55% | 20.67% | +0.12pp |

## Pairing Win Rate Comparison

| Pairing | Base WR | New WR | Δ WR | Base DR | New DR | Δ DR |
|---------|---------|--------|------|---------|--------|------|
| light | 15.3% | 12.7% | -2.5pp | 59.2% | 59.5% | +0.4pp |
| primal | 27.8% | **35.3%** | **+7.5pp** | 48.3% | 45.8% | -2.5pp |
| mystic | 9.2% | 7.3% | -1.9pp | 88.5% | 90.1% | +1.6pp ⚠ |
| dark | 22.6% | 20.5% | -2.1pp | 62.1% | 64.1% | +2.0pp |
| light_primal | 24.7% | 23.0% | -1.7pp | 51.3% | 49.6% | -1.6pp |
| light_mystic | 18.9% | 14.7% | -4.2pp | 58.3% | 59.2% | +0.9pp |
| primal_dark | 20.5% | **26.4%** | **+5.8pp** | 51.1% | 48.3% | -2.8pp |
| mystic_dark | 4.8% | 5.5% | +0.7pp | 91.5% | 89.2% | -2.4pp |
| primal_mystic | 24.4% | **32.8%** | **+8.5pp** | 53.4% | 48.2% | -5.2pp |
| mystic_primal | 12.7% | 13.2% | +0.5pp | 82.9% | 80.3% | -2.6pp |
| light_dark | 15.9% | 13.4% | -2.5pp | 58.2% | 57.6% | -0.5pp |
| dark_light | 20.5% | 18.1% | -2.5pp | 60.5% | 62.3% | +1.8pp |

## Key Findings

### What Worked: Primal Profile
- primal mono: +7.5pp WR, -2.5pp DR
- primal_mystic: +8.5pp WR, -5.2pp DR (best improvement)
- primal_dark: +5.8pp WR, -2.8pp DR
- Most decisive matchup: light_primal vs primal_mystic = **16% draw rate** (down from 32%)
  and primal_dark vs primal_mystic = **16% draw rate** (down from 22%)
- Primal aggressive weights (unitsThreateningChampion=25, championHPDiff=12, gameLengthPenalty@turn8)
  translate directly to faster game closes and more wins

### What Did Not Work: Mystic Profile
- mystic mono: -1.9pp WR, **+1.6pp DR** (got slightly WORSE)
- mystic_dark: +0.7pp WR (noise), -2.4pp DR (marginal)
- mystic_primal: +0.5pp WR (noise), -2.6pp DR (marginal)
- Root cause: Mystic's card pool (curve-built) contains only utility/sustain cards.
  The profile's "patient long game" strategy assumes Mystic has win conditions in late game.
  With GrovWarden, TemporalRift, CascadeSage, Seedling, Overgrowth as the primary curve
  cards, there is no closing mechanism even with infinite turns.
  **The profile is correct for the intended Mystic strategy, but the deck pool cannot execute it.**

### Regressions
- light mono: -2.5pp WR
- light_mystic: -4.2pp WR (largest regression)
- dark mono: -2.1pp WR
- dark_light: -2.5pp WR
- Possible cause: Primal's aggressive profile made Primal matchups harder for everyone else.
  The relative rankings shifted because Primal improved more than other factions.

## Card Analysis (New Weights)

### Top Overperformers (all Primal — impact INCREASED vs baseline)
| Card | New | Baseline | Δ |
|------|-----|---------|---|
| sabretooth | +14.7pp | +7.8pp | +6.9pp |
| razorfang | +13.6pp | +8.9pp | +4.6pp |
| apexrampage | +13.1pp | +8.6pp | +4.5pp |
| swiftpaw | +12.8pp | +6.7pp | +6.1pp |
| savagegrowth | +12.8pp | +7.1pp | +5.7pp |

### Top Underperformers (all Mystic — impact UNCHANGED or slightly worse)
| Card | New | Baseline | Δ |
|------|-----|---------|---|
| fennwickthequiet | -8.3pp | -7.2pp | -1.1pp |
| verdantsurge | -7.6pp | -6.4pp | -1.2pp |
| moonveilmystic | -7.4pp | -7.3pp | -0.2pp |
| amethystcache | -7.2pp | -5.8pp | -1.4pp |

## Most Decisive Matchups (new)
1. light_primal vs primal_mystic: 16% draw (-16pp vs baseline 32%)
2. primal_dark vs primal_mystic: 16% draw (baseline 22%)
3. light_mystic vs primal_dark: 22% draw
4. primal_dark vs primal: 22% draw
5. primal vs light_primal: 24% draw

## Assessment

Step 1 achieved its design goal for **Primal**: the aggressive profile made primal-containing
pairings faster, more decisive, and higher win-rate. The Primal profile is a clear success.

Step 1 **did not help Mystic**. The patient/control profile correctly models how Mystic
*should* play, but the deck construction pool lacks the win conditions to close games
even given all the time in the world. This is a deckbuilding problem, not an AI problem.

**Recommendation for approval discussion:**
- Step 1 Primal profile: approve, keep
- Step 1 Mystic profile: the direction is correct but the impact requires better Mystic
  archetypes (archetype deck mode, not curve mode) to be measurable
- Overall draw rate (62.85%) remains very high — proceed to Step 2 to address this
- Step 2 phase-based scoring may help Mystic shift to closing mode in late game

## Raw Files
- Baseline: `scripts/simulation/pairing_matrix_2026-04-12T01-36-11.json`
- Step 1:   `scripts/simulation/pairing_matrix_2026-04-12T04-25-58.json`
