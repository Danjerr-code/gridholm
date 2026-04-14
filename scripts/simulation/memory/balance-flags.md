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
