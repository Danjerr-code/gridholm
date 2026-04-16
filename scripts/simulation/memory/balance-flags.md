# Balance Flags

## Active Flags (as of 2026-04-11 baseline run)

### Faction Dominance
- **Beast vs Human: 60.0%** — At the FLAG threshold. Beast is the strongest faction.
  Beast's Rush mechanic + high-ATK units (Razorfang, Rockhorn, Savagegrowth) consistently outpace Human.

### Draw Rate Problems (>30% threshold)
- **Elf vs Demon: 55.0% draw rate** — Games stall out; neither faction closes.
  Elf's healing sustains champion HP but lacks closing damage; Demon's Hidden units delay but don't kill.
- **Human vs Elf: 50.0% draw rate** — Elf healing cancels Human damage output.
- **Human vs Demon: 45.0% draw rate** — Both factions struggle to close games.
- **Beast vs Elf: 35.0% draw rate** — Less severe but still flagged.

### Weak Factions
- **Elf** is severely underperforming: 2.5% vs Human, 17.5% vs Beast, 15.0% vs Demon.
  Max win rate across any matchup is 17.5%. Root cause likely: AI does not exploit healing well,
  and Elf has no offensive board wipe tools to close games.
- **Demon** underperforming vs Human (10.0%) and weak overall. Hidden mechanic may not be well-utilized by AI.

### First-Player Disadvantage
- P2 wins 37.9% vs P1's 28.3%. Inverted from expected. 
  Possible cause: minimax at depth=2 benefits from seeing more moves; reactive play has advantage;
  or the turn-structure gives P2 a meaningful tempo advantage at low depth.

## Pairing Matrix Flags (2026-04-12 Step 2b, curve decks, minimax depth 2, commit 84ab56e)

### CRITICAL: Mystic/Mystic_Dark Near Non-Functional (Step 2b)
- **mystic_dark**: 95.1% avg draw rate across all 7 opponents
- **mystic (mono)**: 94.0% avg draw rate across all 7 opponents
- Both factions win <5% of their P1 games
- Root cause: Mystic card pool has no offensive win conditions (GrovWarden, TemporalRift, CascadeSage)
- Phase modifiers for Mystic (late: unitsThreateningChampion → 18) not enough to close games
- **With Primal opponents now playing more aggressively (Step 2b), Mystic draw rate worsened vs Step 2**
- Structural problem: no AI tuning will fix this without better Mystic archetypes

### CRITICAL: Dark Faction Persistent Regression
- **dark mono**: 14.0% WR — down from 24.0% in S1b, 22.6% original baseline
- Net -8.6pp regression from Step 1b despite all AI improvements
- Root cause: Dark's patient card-advantage strategy cannot function when game pace is too fast
- Dark gameLengthPenalty starts turn 10, but Primal opponents end games in 15-19t
- No improvement path within current phase-modifier approach

### CRITICAL: 64.6% Global Draw Rate (Step 2b)
- Mystic contamination remains the dominant cause
- Without mystic/mystic_dark matchups: estimated ~47% draw rate
- Slight improvement from Step 2's 65.5% after Primal early-phase restoration

### Primal Faction Dominance (Step 2b)
- primal mono WR: **33.1%** (highest sustained WR of any faction)
- primal_dark WR: **28.6%** (+6.6pp vs baseline)
- Top Primal cards: siegemound (+19.9pp), gore (+19.2pp), lifedrinkerstag (+18.7pp)
- Primal card impacts are at all-time high after early-phase suppression removal

### Top Underperforming Cards (all Mystic — Step 2b)
- manawell: -15.6pp, thornweave: -15.1pp, elfelder: -15.0pp, entangle: -15.0pp
- ancientspring: -14.5pp, duskbloomtender: -14.5pp, bloom: -14.3pp
- All Mystic core cards are deeply negative — structural card pool issue

## Current Active Flags — 2026-04-14 (minimax d=2, new decks + Mystic eval, 1200 games)

### 🚨 CRITICAL: Overall DR 64.2% (above 60% board threshold)
- Baseline established with new deck compositions (commit a0e9fe4 + count fixes) and Mystic eval changes (commit 74266e3)
- Mystic eval changes had negligible impact (+0.9pp from 63.3%)

### 🚨 All Elf Matchups Broken (77.5–89.0% DR)
- **Human vs Elf**: 87.0% DR (improved from 97.0% with Mystic eval changes, still critical)
- **Beast vs Elf**: 77.5% DR
- **Elf vs Demon**: 89.0% DR
- Root cause: Elf healing stack (bloom, ancientspring, verdantsurge, glitteringgift, recall, overgrowth) creates near-unkillable sustain at minimax depth 2

### 🚨 Human vs Demon: 70.0% DR
- Secondary priority after Elf matchups
- Demon Hidden mechanic + champion healing likely cause

### ⚠️ Beast vs Demon: 39.0% DR
- Above 30% gate, lower priority

### ✅ Human vs Beast: 23.0% DR — HEALTHY

### MCTS Approach: Failed
- Best MCTS result: 85.8% DR (worse than minimax 63.3%)
- attackChampionBias backfire: high bias causes healing faction rollouts to return 'loss' → passive play
- Minimax depth 2 remains best available AI

## Depth Test Finding — 2026-04-14

**Deeper search does NOT fix Elf draws** (tested d=3 and d=4):
- d=3 Human vs Elf: 80% DR (marginal vs 87% at d=2, within n=5 noise)
- d=3 Elf vs Demon: 100% DR (WORSE than 89% at d=2)
- d=4: systematic 5s-timeout → heuristic fallback → 100% DR

Root cause: Mystic AI over-uses healing cards (negative win impact). Fix must be eval-level.
Proposed: `healingValue 5→0`, `championHP 10→5`, `championHPDiff 3→8`. Awaiting approval.

## Current Active Flags — 2026-04-14 (LOG-1426, minimax d=2, tradeEfficiency+tileDenial+MAX_CANDIDATES=6)

### Overall DR: 51.4% — Largest single-run improvement, now below 56.1% baseline

### 🚨 CRITICAL: Human vs Elf — 80.5% DR (persistent structural problem)
- Improved −2.5pp from 83.0% but remains critical
- No weight or search change has solved this — structural Elf healing issue

### 🚨 Elf vs Demon — 74.0% DR (−3.5pp vs 77.5%)
- Improved but still critical

### 🚨 Beast vs Elf — 72.0% DR (+5.0pp REGRESSION vs 67.0%)
- WORSE than baseline. Only regressing matchup in this run.
- Hypothesis: MAX_CANDIDATES=6 lets Elf passive spells (cascadesage, glitteringgift) enter search tree more, sustaining against Beast aggression
- tileDenial may perversely reward Elf for staying near Beast champion
- Needs investigation: consider tileDenial phase gate or Mystic faction profile override

### ⚠️ Human vs Demon — 51.5% DR (−9.0pp vs 60.5%)
- First run below 60% — significant improvement, still elevated

### ✅ Beast vs Demon — 19.5% DR (best ever, −14.5pp vs 34.0%)
### ✅ Human vs Beast — 11.0% DR (very healthy, −3.5pp)
### ✅ AI time — 825ms/game (under 2s threshold despite MAX_CANDIDATES=6)

## Resolved Flags
- hexbloodwarlock (mystic_dark bridge): was -11.8pp mandatory, now +1.21pp optional — resolved by removing mandatory bridge inclusion (Step 2)

## Evolved Weights Validation — 2026-04-13 (CRITICAL)

### 🚨 Cross-Faction Draw Rate: 97.5% with Evolved Weights
- Baseline was 66.4%. Evolved weights made it dramatically worse.
- Self-play evolution succeeds (primal: 66% → 15% draws against itself)
- Cross-faction deployment fails: faction weights optimized for self-play create mutual stalls
- Average game length dropped 16.5t → 9.7t — early-game stall equilibrium forming

### 🚨 Mystic: 80–100% Draw Rate (Structural — Weight-Tuning Resistant)
- 5 full evolution generations: <1% draw rate improvement in mystic self-play
- Cross-faction mystic matchups: 92–100% draws in every matchup
- Root cause: healing mechanics + stall patterns — not evaluable via weights
- Requires game mechanics investigation

### ⚠️ Dark: 69–100% Draw Rate (Structural)
- Self-play: 69% draws, no improvement across 5 gens
- Cross-faction: 96–100% draws in every matchup

### Recommendation Status
- Evolved weights: DO NOT DEPLOY — would worsen production draw rate
- Next steps pending board direction: co-evolution, mechanics fix, turn limit, or draw penalty

## Current Active Flags — 2026-04-15b (boardCentrality + throneControlValue 25/30, minimax d=2, 1200 games)

### Overall DR: 37.9% — NEW ALL-TIME BEST (commit 9bff7e2, −12.0pp from 49.9%)
- boardCentrality (weight 4) + throneControlValue base 15→25, Mystic 20→30
- Largest single-run improvement in project history

### 🚨 CRITICAL: Human vs Elf — 76.0% DR (−5pp vs 81.0%)
### ⚠️ Elf vs Demon — 56.0% DR (−21.5pp vs 77.5% — massive improvement)
### ⚠️ Beast vs Elf — 54.0% DR (−11pp vs 65.0%)
### ✅ Human vs Demon — 27.0% DR (−19.5pp, first below 30% for this matchup)
### ✅ Beast vs Demon — 11.5% DR (−10.5pp)
### ✅ Human vs Beast — 3.0% DR (healthiest matchup ever)
### ✅ No faction above 60% WR threshold

### Root Cause Summary (Elf draws)
- Human vs Elf remains the last critical structural problem (76% DR)
- Board centrality helped all other matchups enormously but Elf sustain still dominates vs Human
- Elf vs Demon improved dramatically (77.5% → 56%) — centrality pulling Demon into closing positions

## LOG-1464 Throne Anchor — 2026-04-15 — BLOCKED (commit bd8e3e2)
### Validation gate failed — awaiting CEO direction

- throneAnchor weight=15 added; summon +5/priority boost when on throne; pcdWeight ×0.5 on throne
- Validation gate "T3 throne by turn 3" was physically impossible (champions start at dist=4, speed=1); CORRECTED to turn 4 in runThroneValidation.js (LOG-1465)
- Actual anchor behavior: 3/7 champions that reached throne stayed 5+ turns (43% stay rate)
- Root issue: championMove priority=15 below summon/cast in minimax tree — champion doesn't head to throne early
- Decision needed: Option A (run matrix as-is) or Option B (add throne-approach priority boost first)

---

## Prior Active Flags — 2026-04-15 (LOG-1335 + LOG-1436, minimax d=2, simplified profiles, 1200 games)

### Overall DR: 49.9% — New All-Time Best (commit 11c2d85)
- Beats 53.4% no-profiles experiment and 51.4% LOG-1426 baseline

### 🚨 CRITICAL: Human vs Elf — 81.0% DR
### 🚨 CRITICAL: Elf vs Demon — 77.5% DR
### 🚨 CRITICAL: Beast vs Elf — 65.0% DR
### ⚠️ Human vs Demon — 46.5% DR
### ✅ Beast vs Demon — 22.0% DR
### ✅ Human vs Beast — 7.5% DR
### ✅ No faction above 60% WR threshold

### Root Cause Summary (Elf draws — confirmed exhausted all AI levers)
- healingValue=0, championHP reduced, all profile overrides removed — no improvement
- Deeper search (d=3/d=4) confirmed non-fix via depth test
- Move ordering + selective deepening + killer heuristic did not fix draws
- Fix requires game mechanics investigation (card pool reduction, draw rule, or turn limit)

---

## 2026-04-16 — Tier 1 Full Matrix (PENDING RESULTS)

**Matrix running:** 1200 games (100/direction, 800ms budget, all Tier 1 active: TT + ID + quiescence + history + PVS)
**Baseline:** 37.9% overall DR (board centrality + throne control, commit `9bff7e2`)
**Expected completion:** ~9 hours from 8:06 PM PDT 2026-04-16

**Tier 1 improvements active:**
- Transposition table (Zobrist hash, 1M cap, TT_EXACT/LOWER/UPPER)
- Iterative deepening (800ms budget, maxDepth=20)
- Quiescence search (capture-only, delta pruning, MVV-LVA, TT-integrated)
- History heuristic (depth²-weighted, gravity formula, move ordering)
- Principal variation search (null-window for non-PV nodes)

**Gate condition:** Overall DR ≤ 30% for Tier 2 to be applied immediately; otherwise report and await direction.

**Tier 2 branch ready:** `tier2-eval-improvements` (commit `6658174`) — champion safety S-curve + contempt factor, do not merge until Tier 1 results in.
