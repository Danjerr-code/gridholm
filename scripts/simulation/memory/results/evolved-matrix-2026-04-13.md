# Evolved Weights Validation Matrix — 2026-04-13

## Run Parameters
- Script: `runEvolvedMatrix.js`
- Games: 28 per direction × 56 directional pairs = 1,568 total
- Weights: All 8 factions using evolved weights from full run (--pop 20 --games 20 --gen 5 --survivors 5)
- Output: `scripts/simulation/results/matrix_evolved_validation.json`

## Overall Statistics

| Metric | Pre-Evolution Baseline | Evolved Cross-Faction | Delta |
|--------|------------------------|----------------------|-------|
| Draw rate | 66.4% | **97.5%** | +31pp 🚨 |
| P1 win rate | 13.4% | 1.8% | -11.6pp |
| P2 win rate | 20.2% | 0.7% | -19.5pp |
| Avg turns | ~16.5t | **9.7t** | -6.8t 🚨 |

## Per-Faction WR (combined both directions vs all opponents)

| Faction | WR% | Draw Rate | Avg Turns |
|---------|-----|-----------|-----------|
| primal | 4.6% | 93.9% | 9.4t |
| primal_dark | 2.3% | 97.2% | 9.9t |
| mystic_dark | 1.0% | 98.0% | 9.7t |
| light | 0.5% | 97.7% | 9.8t |
| mystic | 0.5% | 98.2% | 9.7t |
| light_primal | 0.5% | 97.7% | 9.8t |
| light_mystic | 0.5% | 98.2% | 10.2t |
| dark | 0.0% | 99.2% | 9.3t |

## Key Findings

### Finding 1: Cross-faction evolution catastrophically increases draw rate
Self-play evolution succeeded within-faction (primal: 66% → 15% draws during self-play).
But cross-faction validation shows 97.5% draws — far worse than the 66.4% pre-evolution baseline.

**Root cause**: Evolution optimized each faction in self-play isolation. Primal's weights beat primal.
Light's weights beat light. When deployed cross-faction, neither side's weights are optimized for
the opponent's style, producing mutual stalling that resolves as a draw.

### Finding 2: Average game length dropped from 16.5t → 9.7t
Games are ending earlier (draws), not at the 30-turn limit. This suggests the evolved weights
are causing AIs to reach a low-activity equilibrium faster — possibly playing fewer cards,
avoiding attacks, or rapidly reaching a position where neither side has good moves.

### Finding 3: Evolved weights should NOT be deployed to production AI
Deploying these weights would make the already-problematic 66.4% draw rate dramatically worse.
The cross-faction matrix invalidates the self-play improvement.

### Finding 4: Weight tuning alone cannot fix the draw problem
5 full evolutionary generations produced no meaningful improvement in dark (69% draws) or
mystic (80% draws) even in self-play. Cross-faction makes it 97-99%.
The draw problem is structural in game mechanics, not in AI evaluation.

## Self-Play Evolution Results (for reference — from log files)

| Faction | Final Gen WR | Draw Rate | Note |
|---------|-------------|-----------|------|
| primal | 50.0% | ~15% | Excellent — self-play works |
| light | 38.7% | 36% | Good |
| light_primal | 33.9% | 49% | Moderate |
| light_mystic | 32.1% | 49% | Moderate |
| mystic_dark | 30.8% | 50% | Moderate |
| primal_dark | 29.5% | 48% | Moderate |
| dark | 18.9% | 69% | ⚠ Structural issue |
| mystic | 12.6% | 80% | 🚨 Severe structural issue |

## Recommendation

Do not deploy evolved weights. Instead investigate:
1. Why games are resolving as draws at turn 9.7 on average (much lower than 16.5t baseline)
2. What specific mechanics cause mystic and dark to draw even in self-play
3. Whether co-evolutionary weight training (all factions competing simultaneously) would be viable
4. Game engine draw conditions — are there mechanical stalls being triggered?
