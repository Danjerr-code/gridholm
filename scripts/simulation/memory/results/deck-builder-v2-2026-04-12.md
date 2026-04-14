# Deck Builder v2 + Primary Lean Results (LOG-1203)

## Parameters
- Date: 2026-04-12T07:29:19Z
- Run: pairing_matrix_2026-04-12T07-29-19.json
- Deck builder: commit 133918d (primary lean 18/9/3 + mandatory bridge cards + resonance tracking)
- Games: 50 per matchup × 56 directional = 2,800 total
- Scope: 8 pairings only (4 mono: light, primal, mystic, dark + 4 friendly: light_primal, light_mystic, primal_dark, mystic_dark)
- AI: faction weights (Step 1) + minimax depth 2

## Overall Statistics

| Metric | Baseline (uni. weights) | Step 1 (faction weights) | v2 (faction + deck) | Δ vs S1 |
|--------|------------------------|--------------------------|---------------------|---------|
| Overall draw rate | 63.76% | 62.85% | 64.32% | +1.47pp |
| P1 win rate | 15.70% | 16.48% | 15.32% | -1.16pp |
| P2 win rate | 20.55% | 20.67% | 20.36% | -0.31pp |

Note: v2 only covers 8 pairings vs 12 in S1/baseline — direct overall comparison is approximate.

## Pairing Comparison (vs Step 1)

| Pairing | S1 WR | v2 WR | Δ WR | S1 DR | v2 DR | Δ DR |
|---------|-------|-------|------|-------|-------|------|
| primal | 35.3% | **38.4%** | +3.2pp | 45.8% | 47.3% | +1.5pp |
| dark | 20.5% | **24.0%** | +3.5pp | 64.1% | 66.9% | +2.8pp |
| primal_dark | 26.4% | 22.0% | -4.4pp | 48.3% | 46.7% | -1.6pp |
| light_mystic | 14.7% | 16.4% | +1.7pp | 59.2% | 56.4% | -2.8pp |
| light_primal | 23.0% | 15.9% | **-7.1pp** | 49.6% | 56.3% | +6.6pp |
| light | 12.7% | 15.4% | +2.7pp | 59.5% | 57.7% | -1.8pp |
| mystic | 7.3% | 7.6% | +0.3pp | 90.1% | 89.9% | -0.2pp |
| mystic_dark | 5.5% | **3.0%** | **-2.5pp** | 89.2% | **93.4%** | **+4.2pp** |

## Bridge Card Performance

| Bridge Card | Pairing | Impact | WR | n |
|------------|---------|--------|-----|---|
| nighthoofreaver | Primal/Dark | +10.5pp | 26.4% | 1,026 |
| lifedrinkerstag | Light/Primal | +7.9pp | 24.1% | 1,141 |
| gorethirstfiend | Primal/Dark | +5.5pp | 22.4% | 1,006 |
| vanguardtaskmaster | Light/Primal | -2.6pp | 16.0% | 1,626 |
| runebladesentinel | Light/Mystic | -3.1pp | 15.6% | 1,572 |
| moonveilmystic | Light/Mystic | -6.1pp | 13.0% | 1,191 |
| hexbloodwarlock | Mystic/Dark | -11.8pp | 8.1% | 977 |
| duskbloomtender | Mystic/Dark | **-16.7pp** | 4.3% | 1,068 |

**Key finding**: Bridge cards are not uniformly helpful. Primal-side bridges (nighthoofreaver, gorethirstfiend, lifedrinkerstag) all positive. Mystic-side bridges (duskbloomtender, hexbloodwarlock, moonveilmystic) all negative.
`duskbloomtender` is the single worst performing card in the entire game (-16.7pp).

## Resonance Analysis

| Metric | Value |
|--------|-------|
| Avg resonance (most matchups) | 45–47 (all attuned) |
| Ascended games (score ≥ 50) | 7.1% of all games |
| Avg ascended WR | 23.4% |
| Overall avg WR | ~17–20% |

Resonance is deterministic at 45 for most paired decks with 18/9/3 split (18 primary + 9 friendly secondary = 36 resonance points + some secondary buffs = exactly attuned). The ascended threshold (50+) requires scoring bonus from legendaries. With only 7.1% ascended games, the signal is too weak for reliable conclusions but ascended WR shows no dramatic advantage.

## Top Overperformers (v2)
All Primal: crushingblow +25.8pp, razorfang +25.7pp, pip +24.5pp, bloodmoon +24.3pp, callofthesnakes +23.5pp

## Top Underperformers (v2)
All Mystic: duskbloomtender -16.7pp, manawell -15.7pp, oathrootkeeper -15.6pp, entangle -15.5pp, bloom -15.3pp

## Most Decisive Matchups
1. primal_dark vs primal: **14% draw** (best so far)
2. light_primal vs primal_dark: 22% draw
3. primal_dark vs light_mystic: 24% draw

## Assessment

Primary lean (18/9/3) helped Primal and Dark slightly (+3pp). Mystic fundamentally unchanged. Mystic bridge cards are actively harmful — `duskbloomtender` is the worst card in game when used in any matchup. The mandatory bridge inclusion rule hurts Mystic/Dark decks.

**Root causes confirmed:**
1. Mystic card pool lacks offensive win conditions — no amount of deck optimization fixes this
2. The "mandatory bridge" rule for Mystic bridges is counterproductive
3. Primal continues to improve with every AI/deck improvement

**Recommended action:**
- Remove mandatory bridge inclusion for Mystic-side bridges; make them optional/low-priority
- Proceed to Step 2 (phase-based scoring) to see if late-game closing shift helps Mystic
