# Known Issues — AI Capability State

**Last updated**: 2026-04-18 after LOG-1537 championThroneProximity commit.
**Baseline commits**: `8ce9926` (Step 3 fix) + `5c6dfc9` (Mystic closing heuristic) + `27150eb` (remove opponent modeling) + `d2829f9` (curve-aware mulligan) + `0e6d630` (championThroneProximity weight=8).

---

## Resolved Issues

### championThroneProximity eval term — COMMITTED (2026-04-18, commit 0e6d630, LOG-1537)
- Term: `max(0, 4 - manhattanDist(championPos, thronePos))`, weight=8
- Effect vs weight=0 baseline (46.7% aggregate DR for HvB+EvD+HvE at 200ms/35-turn):
  - HvB DR: 20% → 10% (−10pp)
  - EvD DR: 70% → 60% (−10pp)
  - HvE DR: 50% → 40% (−10pp)
  - Aggregate DR: 46.7% → 36.7% (−10pp)
- All three matchups improved — the term is broad in effect, not HvB-specific
- Live AI parity: `src/engine/strategicAI.js` updated by Brock in commit `9fe3b16`

### Champion Abilities Never Fire — FIXED (2026-04-11, commit a632997)
- Fixed: `champDef?.abilities?.attuned?.type === 'activated'` and cost from `.cost.amount`
- All 4 faction champions now use attuned abilities in simulation.

### Champion Ability Spam (mid/late game) — FIXED (2026-04-12, commit 8ce9926)
- Fixed in simAI.js: champAbility scored contextually by turn/game phase (0-18 range)
- Fixed in minimaxAI.js: champAbility priority suppressed after turn 9; Mystic hard-filter removes it after turn 15

### Card Impact Analysis Cross-Contamination — FIXED (2026-04-11)
- Fixed in runSimulation.js/runMatrix.js: faction-specific card analysis with correct player side selector.

### Human Deck 29-Card Count — FIXED (2026-04-11, Entry 1)
- Added shieldwall to HUMAN_DECK to restore 30-card count.

---

## Active AI Issues

### P2 Structural Advantage
- P2 WR: ~20% vs P1 WR: ~14% — consistent +6pp gap across all runs.
- Possible causes: reactive/defensive play has inherent advantage at low search depth; AI evaluates "respond to what's on the board" better as P2.
- Needs investigation at depth=3 or with alternating-first-player test to determine if AI artifact or game mechanic.

### MAX_CANDIDATES=4 Hard Cap — Most Significant Quality Limitation
- Only 4 non-endTurn actions considered per ply. Eliminates entire strategy classes:
  - Defensive moves (retreat, champion escape) pruned when offense scores higher
  - Multiple summon tile options collapsed to one (closest to enemy)
  - Protective unit placement cut when below top-4 offensive actions
- Raising to 6-8 would significantly improve quality at ~50% cost increase per decision.

### Champion Move Undervalued in Search
- `championMove` has priority 15 (lowest non-endTurn) in minimaxAI `actionPriority()`.
- Champions sit still while units do all the work.
- Champion repositioning (escape from threats, advance) is rarely selected in top-4 candidates.

### Evaluation Uses Base ATK, Not Effective ATK
- `boardEval.js` sums raw `u.atk` for `totalATKOnBoard` and lethal threat calculations.
- Buffs from Iron Thorns, Forgeweapon, Savage Growth, and Aura effects are invisible to the evaluator.
- A buffed 4-ATK unit scores as 4, not 7.

### No Healing Urgency in Board Evaluation
- When own champion is at 3 HP with healing spells in hand, `boardEval` adds no bonus.
- `championHP` weight (5) is the only signal. `lethalThreat` (35) and `opponentChampionLowHP` (30) both push offense hard with no symmetric defensive urgency factor.

### Hidden Unit Timing Not Modeled
- `hiddenUnits` weight (6) rewards having hidden units but ignores information advantage.
- Demon AI reveals hidden units at random rather than holding for optimal simultaneous ambush.
- Evaluation cannot represent "opponent doesn't know 2 units are here" as a signal.

### Multi-Turn Spell Combo Blindspot
- Depth 2 misses sequences requiring 3+ actions (summon + buff + attack).
- Infernal Pact (sacrifice for ATK) requires pre-positioning a sacrifice target — depth 2 misses this.
- Pack Howl + Savage Growth pre-buff timing is lost at depth 2.

### Summon Tile Selection Discarded in Dedup
- Summon deduplication keeps one tile per card (closest to enemy champion).
- Defensive summons near own champion and Aura-adjacent summons for +10 bonus are never considered.

### Vexis Hollow King Ascended Ability Never Fires
- `headlessEngine.js` only generates `attuned` champion ability actions.
- Malachar's ascended state (Corrupt → ascended ability) never triggered in simulation.
- Requires headlessEngine update to check `abilities.ascended` on Malachar.

---

## Current AI Capability Assessment (post LOG-1203 Steps 1–4)

### What the AI Does Well

1. **Lethal detection** — Pre-search pass checks every action for immediate wins before minimax. Never misses an obvious kill that's within one action.

2. **Champion attack coordination** — Minimax depth 2 discovers converging 3 units onto the enemy champion simultaneously. This is the core mechanism that reduced draw rate from 78% (heuristic) to ~66%.

3. **Kill-order on units** — Naturally prioritizes killing high-value enemy units. `unitCountDiff` and `unitsThreateningChampion` weights reward it correctly.

4. **Spell timing for removal** — Smite, Devour, Souldrain, Darksentence used at correct moments. Minimax evaluates board after applying them vs alternatives.

5. **Throne control** — Contests and defends center tile appropriately.

6. **Champion ability economy** — Uses abilities with leftover mana after board development (early game). Suppresses ability spam in mid/late game via contextual scoring.

7. **Hold logic for key cards** — cardHoldLogic.js holds game-changing cards (apexrampage, angelicblessing, tollofshadows, crushingblow, verdantsurge, seconddawn, bloodmoon) until conditions are right.

8. **Mystic closing** — At turn 13+, Mystic AI shifts from sustain to attack: healing suppressed (unless HP<5), verdantsurge prioritized, champAbility eliminated after turn 15. Reduced Mystic DR from 96% to 92%.

9. **Faction-specific weight profiles** — Primal AI uses rush weights (high attackOnBoard/proximity), Mystic uses sustain/control (high healingValue/cardsInHand), Light uses formation (high unitsAdjacentToAlly), Dark uses card advantage (high cardsInHand/handSize).

10. **Phase-gated suppressions** — Early-game attack signals suppressed for non-Primal factions to allow board development before committing to aggression.

### What the AI Still Cannot Do

1. **Multi-turn planning beyond 2 actions** — All sequences requiring 3+ actions are below the search horizon. This is the deepest structural limitation.

2. **Adaptive play vs opponent strategy** — Opponent modeling was attempted (Step 4) but caused regressions. AI currently plays its own strategy regardless of opponent faction.

3. **Hidden information exploitation** — Demon's hidden units are a pure randomness factor. The AI gains no advantage from the information asymmetry.

4. **Buff stack planning** — Moonleaf + Whisper stacking, Pack Howl pre-buff before attack mass — these require commitment to a plan that persists across turns.

5. **Defensive positioning** — Retreat, champion escape from threats, blocking with expendable units — all underscored relative to offensive actions.

---

## Faction Strategy: Correct vs Incorrect Plays

### Human (Light)
- **Correct**: Smite targeting, Warlord timing, Shieldwall placement under threat, Aendor buff
- **Correct**: Formation Aura synergy (summons adjacent to Aura units for +10 bonus)
- **Incorrect**: Iron Thorns board-wide buff invisible to evaluator (uses base ATK)
- **Incorrect**: Captain "recruit" ability 2-turn setup not planned (place Captain then use ability)

### Beast (Primal)
- **Correct**: Rush/converge strategy — depth 2 finds 3-unit coordinated attacks
- **Correct**: Razorfang execute targeting, Siege Mound area attack on champion
- **Incorrect**: Pack Howl + Savage Growth pre-buff timing lost at depth 2
- **Incorrect**: Ambush placement is random tile, not near likely approach path

### Elf (Mystic)
- **Correct**: Nurture healing with leftover mana (early game)
- **Correct**: Verdantsurge prioritized in closing phase (turn 13+)
- **Correct**: Petrify to remove champion blockers in closing phase
- **Incorrect**: Entangle Root effect not valued — no "enemy units immobilized" evaluation factor
- **Incorrect**: Ancient Spring terrain recovery dramatically underweighted (terrainBenefit=3)
- **Incorrect**: Moonleaf + Whisper stacking — no plan for multi-buff single unit
- **Structural issue**: Mystic is the weakest faction in simulation (5–8% WR). Board confirms this is AI decision quality, not card balance. Mystic is overpowered vs humans in real play.

### Demon (Dark)
- **Correct**: Void Titan on high-mana turns, Souldrain targeting
- **Correct**: Blood Offering sacrifice scoring (low-cost unit sacrificed for upgrade)
- **Incorrect**: Hidden unit reveal timing (too early — should hold until 2+ can burst champion)
- **Incorrect**: Vexis Hollow King ascended ability never fires in simulation (headlessEngine limitation)

---

## Card Interactions: Handled vs Missed

### Handled Correctly
- Smite, Devour, Souldrain, Darksentence: correct targeting, correct damage estimates
- Savage Growth, Pack Howl, Iron Shield: reflected in unit.atk after engine applies
- Siege Mound unitAction: area damage to champion when adjacent units present
- Fleshtithе sacrifice: low-cost units correctly chosen for sacrifice
- Bloodmoon hold: withheld until mana > 4 (cardHoldLogic)
- Verdantsurge hold: withheld until 2+ units on board (cardHoldLogic); override in Mystic closing

### Missed or Mishandled
- **Iron Thorns**: +1/+1 to all friendly — evaluator invisible to the buff until units deal damage
- **Pack Howl**: mass ATK buff reflected in unit.atk but pre-buff planning (summon → buff → attack) requires 3-action lookahead
- **Entangle / Root**: no evaluation term for "enemy units cannot move this turn"
- **Ancient Spring**: terrain HP recovery underweighted (terrainBenefit=3)
- **Infernal Pact**: sacrifice count planning requires pre-positioning; depth 2 misses it
- **Callofthesnakes**: mass snake summons — AI doesn't plan mana for burst turn
- **Second Dawn**: hold condition (2+ graveyard) functions; however graveyard cards' playability flag (`graveAccessActive`) is now respected in summon generation (recent engine fix)

---

## Deck Issues

- **Elf deck**: 33 cards (3 over limit). Non-blocking for pairing matrix (uses buildDeck curve mode, not raw DECKS). Needs board decision on which 3 cards to cut.
- **Human deck**: Fixed (30 cards, shieldwall added).

---

---

## MCTS-Specific Issues (LOG-1335)

### Rollout Policy / Game-Play Policy Conflation — ACTIVE STRUCTURAL PROBLEM
- **Problem**: `DEFAULT_POLICY` in `mctsAI.js` is used for both:
  1. Biased rollouts (evaluating the quality of game states via simulation)
  2. Game-play action selection (via biased rollout feedback to UCB1 scores)
- **Effect**: High `attackChampionBias` (6.0) causes rollouts to always attack the champion.
  Against healing factions (elf, demon), champion survives all attacks → every rollout returns 'loss'
  from attacking positions → MCTS UCB1 learns champion attacks are losing → passive play → 98.3% DR.
- **Tested values**: bias=3.0 (original) and bias=6.0 (board-requested). 6.0 is catastrophically worse.
- **Proposed fix (Option C)**: Separate `rolloutPolicy` (used inside biasedRollout) from `gamePolicy`
  (used to bias action selection at the MCTS decision level). Use neutral/lower bias in rollouts,
  keep aggressive bias in game-play selection.
- **Status**: Awaiting board direction. Do not change DEFAULT_POLICY values without CEO approval.

### MCTS sims=1 Sample Size Risk
- With only 1 rollout per action per MCTS decision, win rate estimates have very high variance.
- Small-sample pre-matrix tests (5 games) can show false-positive results that don't hold at scale.
- The 5-game elf vs beast test at bias=6.0 showed 20% DR; the 120-game full matrix showed 98.3%.
- Always validate policy changes with ≥50 games per matchup before reporting as confirmed.

---

## Recommended Next Improvements (Priority Order)

1. **MAX_CANDIDATES 4 → 6** — Highest impact single change. Defensive moves and alternative summon tiles enter search.
2. **`getEffectiveAtk` in boardEval** — Buffs (Iron Thorns, Forgeweapon, Savage Growth, Aura) correctly reflected in lethal threat.
3. **Defensive urgency factor** — championHP bonus per healing spell in hand when HP ≤ 8.
4. **Vexis Hollow King ascended ability** — headlessEngine update for Malachar ascended state.
5. **Depth 3 for production** — 687ms/game at depth 3, handles 3-action combos missed at depth 2.
6. **Evolutionary weight tuning** — evolve.js infrastructure (in progress per board directive).
