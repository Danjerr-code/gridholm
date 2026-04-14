# Tuning Log

## Entry 1 — 2026-04-11
- **Action**: Deck count fix (not a weight change)
- **Change**: Added `shieldwall` to HUMAN_DECK to restore 30-card count
  (clockworkmanimus was commented out due to LOG-1152)
- **Before**: Human deck = 29 cards (assertion warning at startup)
- **After**: Human deck = 30 cards (assertion passes)
- **Approved by**: Built into task scope (LOG-1171 description explicitly authorizes this fix)

## Entry 2 — 2026-04-11 (LOG-1175) [SUPERSEDED by LOG-1176]
- **Proposed action**: Increase gameLength urgency penalty in boardEval.js
- **Status**: Superseded. CEO redirected to fix AI capability first (LOG-1176).

## Entry 3 — 2026-04-11 (LOG-1176) — Fix 1: Champion ability bug
- **Action**: Fix headlessEngine.js champion ability generation
- **Change**: `champDef?.ability` → `champDef?.abilities?.attuned?.type === 'activated'`
  Cost: `champDef.ability.cost ?? 2` → `champDef.abilities.attuned.cost?.amount ?? 2`
- **Result**: All 4 faction champions now use their attuned abilities in simulation.
- **Approved by**: CEO (LOG-1176 comment 2026-04-11)
- **Commit**: a632997

## Entry 4 — 2026-04-11 (LOG-1176) — Fixes 2+3: Healing urgency + champion protection [OVERCORRECTED]
- **Action**: simAI.js healing urgency scaling + champion protection move bonus
- **Fix 2**: overgrowth/bloom removed from BUFF_SPELL_EFFECTS, scored 12–65 by HP tier
  - HP<=5: 65, HP<=10: 45, HP<=15: 25, else 12
- **Fix 3**: Unit move adjacent to threatened own champion scores 17 (vs advance at 15)
- **Outcome**: REGRESSION — overall draw rate rose from 38% baseline to 81%
  - Elf matchups: 90–98% draw (HP<=15 threshold fires after only 5 damage on a 20HP champ)
  - All factions: units guard champion instead of advancing (score 17 > advance 15)
- **Root cause**: HP<=15 "proactive" healing tier too aggressive; protection score too high
- **Commit**: a39bd32

## Entry 5 — 2026-04-11 (LOG-1176) — Fix 2b + Fix 3b [AWAITING APPROVAL]
- **Proposed changes**:
  Fix 2b: HP<=5 → 60, HP<=10 → 30, else 8 (removes proactive tier; healing below advance unless ≤50% HP)
  Fix 3b: Protection score 17 → 13 (below advance 15, above throne approach 12 — fallback not priority)
- **Actual change**: Fix 3b modified by CEO — protection score is contextual:
  16 if enemy immediately adjacent to own champion (distance 1); 12 if within 2 tiles
- **Commit**: 170296a
- **Outcome**: STILL REGRESSION. Overall draw rate 81.2% — identical to previous run.
  Recalibrations were not the bottleneck. Root cause identified as Fix 4 below.

## Entry 6 — 2026-04-11 (LOG-1176) — Fix 4: Champion ability contextual scoring
- **Change**: championAbility: 10 (default) / 14 (plentiful mana + friendly target) / 18 (already acted + ≤2 mana after)
- **Approved by**: CEO (with modification)
- **Commit**: 6a8bad5
- **Outcome**: MINIMAL IMPACT. Overall draw rate 79.7% (was 81.2%). Barely moved.
  The draw rate problem is deeper — games timeout because AI has no closing instinct.

## Entry 7 — 2026-04-11 (LOG-1176) — Fix 5: Champion-HP-aware urgency scaling
- **Change**: move/cast/unitAction all scale score by enemy champion HP tier (≤8/≤15/full)
  Champion attack: dmg×20/15/10; Advance: 35/22/15; Unit abilities: 30/22/15; Spells: same mult
- **Approved by**: CEO
- **Commit**: 332a8b9
- **Outcome**: MINIMAL IMPACT. Overall draw rate 78.0% (was 79.7%). Elf still 84-96%.
  KEY FINDING: Bloom win rate when NOT drawn = 8.7% ≈ when drawn 7.5%. Healing is NOT cause.
  Root cause: greedy heuristic AI cannot coordinate multi-turn champion attacks. No lookahead.

## Overall Fix Progress (heuristic AI)
Baseline: ~38% draw → after all 5 fixes: 78% draw → NET REGRESSION
All fixes since Fix 1 had minimal impact. Fix 1 (champion abilities) is the dominant driver.
The ability to coordinate champion attacks requires minimax (forward planning), not heuristics.

## Entry 8 — 2026-04-11 (LOG-1176) — Minimax depth 2 validation runs
- **Action**: Two independent 500-game/matchup minimax depth 2 matrix runs
- **Run 1**: 29.1% overall draw (results/2026-04-11h.md, matrix_results_minimax_d2.json)
- **Run 2**: 29.3% overall draw (results/2026-04-11i.md, matrix_results_minimax_d2_run2.json)
- **Delta**: +0.2pp — simulation infrastructure confirmed reliable and reproducible
- **Archetype triangle**: All 4 relationships broken (Elf>Beast>Demon≈Human, not Primal>Mystic>Light>Primal)
- **Decision**: No balance changes until card pool locked at 175 (currently 164). CEO approved.
- **Status**: Blocked — awaiting card pool lock signal from Brock

## Entry 9 — 2026-04-12 (LOG-1203 Step 1) — Faction weight profiles
- **Action**: Added four faction-specific weight profiles to boardEval.js (FACTION_WEIGHTS)
- **Profiles**: primal (rush), mystic (sustain/control), light (formation), dark (card advantage)
- **Commit**: feat(sim): add faction-specific weight profiles
- **Before** (Step 1 baseline, 8-pairing × 50 games, matrix_results_minimax_d2.json proxy):
  primal 38.4% WR / mystic 7.6% / dark 24.0% / primal_dark 22.0% — Overall DR 64.3%
- **Outcome**: Primal mono confirmed dominant. Mystic flat. Dark moderate.

## Entry 10 — 2026-04-12 (LOG-1203 Step 2) — Phase-based scoring shifts
- **Action**: Added phase system (early/mid/late) with applyPhaseModifiers() in boardEval.js
- **Change**: Early phase suppresses unitsThreateningChampion/championProximity for all factions
- **Commit**: 3d59e67
- **Before**: Step 1 baseline (primal 38.4% / primal_dark 22.0%)
- **After** (pairing_matrix_2026-04-12T09-00-19.json):
  primal 30.6% (-7.8%) — REGRESSION; primal_dark 33.3% (+11.3%); Overall DR 65.5%
- **Root cause of regression**: Blanket early-phase suppression hurt Primal (early-rush faction)

## Entry 11 — 2026-04-12 (LOG-1203 Step 2b) — Faction-gated phase suppressions
- **Action**: Gated early-phase attack suppressions by faction in applyPhaseModifiers()
- **Change**: unitsThreateningChampion, championProximity, totalATKOnBoard suppressed early ONLY for non-Primal factions
- **Commit**: 84ab56e
- **After** (pairing_matrix_2026-04-12T10-05-25.json, 2800 games):
  primal **33.1%** (partial recovery +2.5pp from S2's 30.6%; still -5.3pp vs Step 1b 38.4%)
  primal_dark **28.6%** (-4.7pp vs S2's 33.3%; still +6.6pp vs S1b 22.0% — maintains directional improvement)
  dark **14.0%** (-1.7pp vs S2's 15.7%) — ongoing regression vs all prior baselines
  mystic **4.0%** (was 8.0% in S2; likely noise due to 94% draw rate)
  light **11.4%** (flat vs S2 11.3%)
  light_mystic **13.7%** (flat vs S2 13.4%)
  light_primal **17.7%** (-1.4pp vs S2 19.1%)
  mystic_dark **1.1%** (was 6.4%; likely noise due to 95% draw rate)
  Overall DR **64.64%** (-0.9pp vs S2 65.54%) — slight improvement
- **Root cause of primal_dark regression**: Step 2's global suppression was also suppressing Primal opponents,
  which artificially helped primal_dark. Removing suppression for Primal restored Primal opponents' strength.
  primal vs primal_dark matchup: evenly split (34% each as P1). Expected outcome.
- **Status**: PARTIAL SUCCESS — Primal mono partially recovered. primal_dark maintains +6.6pp over S1b baseline.
  Dark/Light ongoing regressions unaddressed. Mystic/Mystic_dark structurally broken (94-95% DR).

## Entry 12 — 2026-04-12 (LOG-1203 Step 3) — Card hold logic
- **Action**: Added cardHoldLogic.js with 8 hold conditions (apexrampage, angelicblessing, tollofshadows, crushingblow, verdantsurge, seconddawn, bloodmoon, azulon ability)
- **Commit**: eae9093
- **After** (pairing_matrix_2026-04-12T16-20-46.json):
  primal 31.0% (-7.4% vs S1) — continued regression
  light 10.3% (-5.1% vs S1) — angelicblessing (ATK>=5 bar) and seconddawn (3+ grave) hold too strict
  primal_dark 29.6% (+7.6% vs S1) — maintained
  mystic_dark 5.1% (+2.1% vs S1) — small improvement
- **Root cause**: angelicblessing ATK>=5 rarely triggered; seconddawn 3+ grave almost never in 30-turn games
- **Diagnostic** (mystic_dark_diag): 74.3% of Mystic/Dark late-game decisions are champAbility
  AI spams Azulon ability instead of advancing units to kill range
  champAbility priority=35 in filterActions — always occupies a candidate slot
  Fix needed: lower champAbility priority in late phase (turn 13+) when opp HP < 15

## Entry 13 — 2026-04-12 (LOG-1203 Step 3 Fix) — champAbility priority + hold relaxations: NULL RESULT
- **Action**: Phase-aware champAbility priority in simAI.js and minimaxAI.js; relax angelicblessing (ATK>=3) and seconddawn (2+ grave)
- **Commits**: 1352c3e (fix, had ReferenceError bug) → 8ce9926 (bug fix: `ap` → `myIdx` in actionPriority)
- **Bug**: 1352c3e used `ap` inside actionPriority() where only `enemyIdx` is in scope → ReferenceError caught silently → 100% draws
- **After fix** (pairing_matrix_2026-04-12T17-11-30.json, 2800 games):
  Overall DR: **65.5%** (flat vs Step 3's 65.5%)
  primal: 31.9% (+0.9pp vs S3)  |  light: 10.7% (+0.4pp)
  mystic: 7.9% (-1.0pp)          |  dark: 16.1% (-0.4pp)
  primal_dark: 29.0% (-0.6pp)   |  mystic_dark: 5.6% (+0.4pp)
  light_primal: 19.9% (-0.4pp)  |  light_mystic: 17.0% (+0.7pp)
  All deltas within ±1pp — NOISE, NOT SIGNAL.
- **Root cause of null result**: champAbility fix targets AI decision quality; structural Mystic weakness is a deckbuilding/card balance problem
- **Card analysis finding**: Bottom-5 cards by winRateImpact are ALL Elf/Mystic faction (ancientspring −13.6%, thornweave −13.3%, oathrootkeeper −12.9%, bloom −12.7%, seedling −12.6%). Top-10 are all Primal/Beast.
- **Mystic structural status**: 94-100% draw rate in most matchups, 7.9% combined WR. Elf cards negatively correlated with winning.
- **P2 advantage**: P2 WR 20.4% vs P1 WR 14.1% — significant second-player advantage requiring investigation

## Entry 14 — 2026-04-12 (LOG-1203 Step 4) — Opponent modeling + Mystic closing heuristic
- **Action**: boardEval `applyOpponentModifiers()` (per-faction weight shifts); simAI/minimaxAI Mystic closing heuristic (turn≥13/15)
- **Commit**: 5c6dfc9
- **After** (pairing_matrix_2026-04-12T18-20-57.json, 2800 games):
  Overall DR: **66.3%** (+0.7pp vs S3+Fix baseline)
  primal: 29.1% (-2.8pp)  |  light: 10.6% (-0.1pp)
  mystic: 5.7% (-2.2pp)   |  dark: 11.1% (-5.0pp)
  primal_dark: 26.0% (-3.0pp)  |  mystic_dark: 3.4% (-2.2pp)
  light_primal: 15.1% (-4.8pp) |  light_mystic: 11.4% (-5.6pp)
- **Mystic DR**: 91.7% (was 96.0%) — closing heuristic reduced DR by 4.3pp. First measurable Mystic improvement.
- **mystic_dark DR**: 92.3% (was 94.3%) — 2.0pp improvement.
- **Regressions**: dark −5.0pp, light_primal −4.8pp, light_mystic −5.6pp. Opponent modifiers (vs-Primal weight boost) causing non-Primal factions to play defensively in broader matchups.
- **Hypothesis**: vs-Primal championHP ×1.5 multiplier fires in non-Primal matchups when opponent also defends champion, creating mutual stall.
- **Card bottom-5**: Still all Elf/Mystic (thornweave −11.8%, elfelder −11.9%, manawell −12.1%, duskbloomtender −12.3%, oathrootkeeper −12.8%). Structural card issue persists.
- **Status**: MIXED RESULT — Mystic closing works; opponent modifiers net-negative. All 4 steps complete. Awaiting board assessment.

## Entry 15 — 2026-04-13 (LOG-1335) — MCTS actionsThisTurn bug fix
- **Action**: Fixed critical bug in runSimulation.js — `move` actions were not counted toward `actionsThisTurn`
- **Bug**: Only non-move, non-endTurn actions incremented `actionsThisTurn`. Since MCTS strongly favors `move` (attack bias ≥1.5), the 80-action per-turn cap never fired → unlimited moves per turn → 12+ min/game (elf vs beast)
- **Fix**: All non-endTurn actions now increment `actionsThisTurn`
- **Commit**: b1b6647
- **Before**: elf vs beast DR=100% (60% confirmed post-fix with 5-game test). beast vs beast DR=20%.

## Entry 16 — 2026-04-13 (LOG-1335) — MCTS defaults + attackChampionBias=6.0: FAILURE
- **Action**: Set MCTS sims=1 as default in runSimulation.js and runMatrix.js (commit cf6a81a).
  Raised attackChampionBias 3.0→6.0, moveTowardChampionBias 1.3→2.0 per board comment 910cf8e6 (commit 9d729f0).
- **Full matrix result** (120 games, 10/direction, MCTS sims=1): **98.3% overall DR** — catastrophic.
  All 12 matchups at 90-100% DR. Only 2 decisive games total.
- **Root cause**: High attackChampionBias in biasedRollout causes aggressive champion attacks in all rollouts.
  Against healing factions (elf, demon), champion survives → rollout returns 'loss' every time →
  MCTS UCB1 learns champion attacks are losing moves → real game play becomes passive → draws.
  The rollout evaluation policy and game-play action policy CANNOT be the same object with healing opponents.
- **Comparison**: minimax d=2 baseline 29.1% DR (6,000 games). Bias=6.0 is 69pp worse.
- **Prior 5-game sample caveat**: Pre-matrix elf vs beast test with bias=6.0 showed 20% DR (cleared the 40% gate).
  This was a lucky seed artifact — the full matrix exposes the systematic failure.
- **Status**: FAILED. Awaiting board direction on whether to revert, try intermediate value (4.0–4.5), or
  decouple rollout policy from game-play policy.

## Entry 17 — 2026-04-14 (LOG-1335) — Time-budget MCTS (timeoutMs parameter): FAILED
- **Action**: Changed chooseActionMCTS defaults to simulations=10000 / timeoutMs=100 (hard cap).
  Added --timeout CLI flag to runSimulation.js and runMatrix.js.
- **Commit**: 474955e
- **Sanity check** (beast vs beast):
  - timeout=100ms: 80% DR (above 40% gate)
  - timeout=200ms: 0% DR — cleared gate (but unrepresentative 5-game sample)
- **Full matrix result** (120 games, timeoutMs=200): **85.8% overall DR** — still catastrophic.
  Only 17/120 decisive games. Human faction: 100% DR in 4 matchups. Beast best at 10-15% WR.
- **Root cause confirmed**: Flat MCTS with biased rollouts is structurally incapable of matching
  minimax d=2 (29.1% DR). Minimax searches deterministic multi-step sequences; MCTS rollouts
  average over noisy random play that rarely produces champion kills in 30 turns.
- **5-game sample problem**: Every 5-game beast vs beast sanity check has shown misleadingly low DR
  (0% at timeout=200ms) while full 120-game matrix shows 85.8% DR. Small samples with favorable
  seeds cannot gate full matrix runs.
- **Status**: FAILED. Awaiting board direction on next steps. Proposed: revert to minimax,
  hybrid approach, or full-tree MCTS.

## Entry 18 — 2026-04-14 (LOG-1335) — Minimax d=2 revert + validation matrix
- **Action**: Reverted runSimulation.js and runMatrix.js defaults to --ai minimax --depth 2.
  Audited boardEval.js: all 6 requested eval terms already present (allyCardValue, enemyThreatValue,
  projectedChampionDamage, turnAggressionScale, trappedAllyPenalty, highValueUnitActivity).
- **Commit**: 56a9682
- **Full matrix result** (1200 games, minimax d=2): **63.3% overall DR**
  - Human vs Beast: 12.5% DR ✅ (only healthy matchup)
  - Human vs Elf: 97.0% DR 🚨 (critical)
  - Human vs Demon: 74.0% DR 🚨
  - Beast vs Elf: 77.0% DR 🚨
  - Beast vs Demon: 31.5% DR ⚠️
  - Elf vs Demon: 88.0% DR 🚨
- **Comparison**: LOG-1203 final 66.3% DR → current 63.3% DR (+3pp improvement, within noise)
  Original clean minimax d=2 baseline: 29.1% (from before faction weight additions)
- **Root cause of gap vs 29.1% baseline**: LOG-1203 faction weights, phase scoring, and card hold
  logic improved some matchups but severely worsened Elf matchups (from manageable to 77-97% DR).
- **Per board protocol**: DR > 60% → hybrid approach is next step.
- **Status**: Reported. Awaiting board direction on hybrid implementation.
