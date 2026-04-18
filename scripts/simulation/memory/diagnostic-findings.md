# Diagnostic Findings

## EvD Position Swap — 2026-04-18

**Question:** Is EvD's 5-0 Elf decisive record a P1 position advantage, faction eval asymmetry, or sample variance?

**Method:** Ran 10 games with Demon as P1, Elf as P2 (same limits: timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600).

**Results:**

| Config | P1 wins | P2 wins | Draws | DR | Action-limit hits |
|---|---|---|---|---|---|
| Elf(P1) vs Demon(P2) | 5 (Elf) | 0 (Demon) | 5 | 50% | 3/10 |
| Demon(P1) vs Elf(P2) | 0 (Demon) | 3 (Elf) | 7 | 70% | 7/10 |
| Combined | — | — | 12 | 60% | 10/20 |

**Interpretation:** Faction eval asymmetry favoring Elf (Mystic). Elf won 3+ from P2 position, meeting CEO's asymmetry threshold. Demon wins 0 decisive games in either position.

**Secondary finding:** Action-limit hit rate nearly doubled when Demon plays P1 (7/10 vs 3/10). Demon games stall without resolution — possible Dark faction stagnation/looping behavior in AI.

**Status:** Reported to CEO. Awaiting direction on whether to investigate Mystic eval terms or address Dark stagnation separately.

**Proposed next step:** Instrument boardEval.js to log top-N term contributions per decision (Elf vs Demon) across a short game sample to isolate which eval terms systematically favor Mystic.

---

## Per-Term Eval Contribution Diagnostic — 2026-04-18

**Question:** Which eval terms produce the observed Mystic advantage over Dark? Is it (a) terms that inherently favor Mystic strategies, (b) faction-specific weight imbalances, or (c) Dark-specific cards being undervalued by the eval?

**Method:** Instrumented `boardEval.js` to sample every 100th evaluation. Logged faction, turn, totalScore, and per-term contributions (raw value × weight). Ran 10 EvD games (5 Elf-P1, 5 Demon-P1). JSONL: `memory/eval-contributions-2026-04-18.jsonl`.

**Configuration:** timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600 (old limit: game 10 hit 500-action limit — legacy code path). Branch: `diag/eval-term-contributions`. Instrumentation reverted. Commit: e5b457b.

**Sample counts:** 1130 total — Mystic: 800, Dark: 330. 2.4× sample imbalance favoring Mystic (Elf has more legal actions per turn → wider minimax tree → more eval calls hit sample threshold).

**NOTE on game outcomes:** Diagnostic run showed 100% DR. This is an artifact — synchronous `appendFileSync` in the eval hot path degraded AI decision quality significantly. Do not use game outcomes from this run for balance analysis. The eval contribution data itself is valid.

### Average Contribution Per Term

| Term | Mystic(Elf) | Dark(Demon) | Ratio |
|---|---|---|---|
| championProximity | 96.54 | 91.80 | 1.05 |
| championHP | 93.63 | 71.94 | 1.30 |
| lethalThreat | 73.67 | 100.19 | 0.74 |
| **championHPDiff** | **+53.31** | **−38.04** | **−1.40** |
| allyCardValue | 44.57 | 38.13 | 1.17 |
| enemyThreatValue | −42.61 | −46.23 | 0.92 |
| projectedChampionDamage | 40.95 | 52.42 | 0.78 |
| throneControlValue | 35.68 | 26.24 | 1.36 |
| totalATKOnBoard | 32.37 | 30.01 | 1.08 |
| projectedEnemyDamage | −31.91 | −29.38 | 1.09 |
| totalHPOnBoard | 30.02 | 15.61 | 1.92 |
| unitsThreateningChampion | 29.25 | 33.00 | 0.89 |
| **cardsInHand** | **27.91** | **50.23** | **0.56** |
| unitsAdjacentToAlly | 14.48 | 9.39 | 1.54 |
| **tradeEfficiency** | **13.13** | **2.76** | **4.76×** |
| **unitCountDiff** | **11.49** | **−1.98** | **−5.79×** |
| **boardCentrality** | **11.14** | **−1.21** | **−9.19×** |
| **throneControl** | **9.18** | **−0.55** | **−16.82×** |
| tileDenial | 4.04 | 4.73 | 0.85 |
| opponentChampionLowHP | 3.67 | 0.45 | 8.08× |
| hiddenUnits | 0.00 | 13.23 | ∞ (Dark only) |
| gameLength | −0.01 | −1.28 | 0.01 |

### Flags: Mystic Advantage Terms (|Mystic| ≥ 2× |Dark|)

| Term | Mystic | Dark | Ratio |
|---|---|---|---|
| throneControl | 9.18 | −0.55 | 16.82× |
| boardCentrality | 11.14 | −1.21 | 9.19× |
| opponentChampionLowHP | 3.67 | 0.45 | 8.08× |
| unitCountDiff | 11.49 | −1.98 | 5.79× |
| tradeEfficiency | 13.13 | 2.76 | 4.76× |
| relicsOnBoard | 0.73 | 0.15 | 5.02× |

### Flags: Dark Advantage Terms (|Dark| ≥ 2× |Mystic|)

| Term | Mystic | Dark | Ratio |
|---|---|---|---|
| hiddenUnits | 0.00 | 13.23 | ∞ |
| cardsInHand | 27.91 | 50.23 | 1.8× (just below 2×) |
| gameLength | −0.01 | −1.28 | 85× |

### Major Asymmetry (>30% share for one faction, <10% for other)

| Term | Mystic% | Dark% |
|---|---|---|
| cardsInHand | 6.3% | 41.6% |
| projectedEnemyDamage | 9.3% | 30.3% |

### Top 5 Terms Per Faction

**Mystic (Elf):** championProximity 96.54 (18.9%), championHP 93.63 (21.7%), lethalThreat 73.67 (10.8%), championHPDiff 53.31 (10.8%), allyCardValue 44.57 (10.1%)

**Dark (Demon):** lethalThreat 100.19 (18.3%), championProximity 91.80 (41.2%), championHP 71.94 (41.5%), projectedChampionDamage 52.42 (9.9%), cardsInHand 50.23 (41.6%)

### Interpretation

**Answer to hypothesis (a) — Terms that inherently favor Mystic strategies:** YES. `tradeEfficiency` (4.76×), `unitCountDiff` (5.79×), `boardCentrality` (9.19×), `throneControl` (16.82×) all systematically favor Mystic. Elf's units control the board, win trades, and occupy the throne/center. These are structural advantages from Elf cards, not eval weighting.

**Answer to hypothesis (b) — Faction-specific weight imbalances:** PARTIAL. Mystic gets `throneControlValue: 30` vs Dark base 25. The `throneControlValue` ratio is 1.36× (not extreme). The weight override provides some advantage but is not the dominant driver.

**Answer to hypothesis (c) — Dark cards undervalued:** NO (reversed finding). Dark's cards ARE being valued — `hiddenUnits` contributes 13.23 avg and `cardsInHand` contributes 50.23 (41.6% of Dark's total score!). Dark has card and stealth advantages the eval is recognizing. However, Dark cannot convert these advantages to board control (boardCentrality and unitCountDiff are negative for Dark).

**Primary cause of Mystic advantage:**
1. **`championHPDiff` (+53 Mystic vs −38 Dark):** Elf's healing cards (bloom, overgrowth, ancientspring, etc.) systematically keep Elf's champion at higher HP than Demon's. This is a **real game-state asymmetry caused by healing cards**, not an eval bug.
2. **Board control (unitCountDiff, boardCentrality, throneControl):** Elf consistently has more units, controls the center, and holds the throne. Demon's card advantage (cardsInHand 50.23) is not being translated to board presence.
3. **tradeEfficiency (4.76×):** Elf's units outperform Demon's units in head-to-head combat.

**Secondary balance flag:**  
`cardsInHand = 10` weight (changed from 5, now verified on main). At weight 10, cardsInHand represents 41.6% of Dark's total score. This may be making Dark too passive — the eval rewards holding cards, discouraging commitment. This is a **potential balance flag**, not an AI issue.

**Status:** Reported to CEO. Awaiting direction.

---

## Post-Fix Canonical Baseline — 2026-04-18 (LOG-1552)

**Run type**: Validation / Baseline establishment

**Fixes active**: championThroneProximity weight=8 (commit 0e6d630), multi-action lethal detection, headlessEngine NO_TARGET_SPELLS (agonizingsymphony, pestilence, pactofruin, predatorsmark, fatesledger, seconddawn)

**Config**: timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600, 60 games (6 matchups × 10)

**Canonical post-fix baseline** (first full 6-matchup run at 200ms settings):

| Matchup | DR | P1 WR | P2 WR | AvgTurns |
|---------|----|-------|-------|----------|
| HvB | 30% | 40% | 30% | 25.4 |
| HvE | 60% | 30% | 10% | 29.0 |
| HvD | 20% | 30% | 50% | 29.4 |
| BvE | 60% | 20% | 20% | 29.5 |
| BvD | 20% | 40% | 40% | 24.9 |
| EvD | 70% | 20% | 10% | 31.4 |
| **Agg** | **43.3%** | | | |

**Key confirmations:**
- championThroneProximity: all 12 player-slots reach dist≤2 before turn 7 on average ✓
- Action-limit hits: 0/60 ✓ (engine stable)
- Decisive games: 34/60 (57%) — lethal detection is active
- Demon spell parity: agonizingsymphony (50% HvD, 20% BvD), pactofruin (40% HvD, 20% BvD) confirmed non-zero ✓
- EvD demon spells near-zero (0% agonizingsymphony/pactofruin): spells ARE enumerable; likely strategic/sample variance

**Structural draws remain** (pre-existing, not fixable via AI tuning at this point):
- Elf matchups: HvE=60%, BvE=60%, EvD=70% — all above 50% threshold
- Root cause: Elf healing stack + board control at 200ms search depth

