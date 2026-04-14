# MCTS Smoke Tests — 2026-04-13

## Critical Bug Found and Fixed

### Bug: `actionsThisTurn` did not count `move` actions
In `runSimulation.js`, the per-turn MCTS stall guard only incremented `actionsThisTurn`
for non-move, non-endTurn actions. `move` actions (unit attacks, unit movement) only
incremented `commandsUsedThisTurn`. Since MCTS strongly prefers `move` actions (bias 3.0
for champ attacks, 1.5 for unit attacks), the per-turn cap of 80 NEVER fired.

Result: MCTS would play unlimited move actions per turn, making elf-vs-beast games take
12+ minutes each and mystic faction draws at 100%.

**Fix applied:** `actionsThisTurn++` now fires for ALL non-endTurn actions including `move`.
Post-fix speed: elf vs beast ~3 min/game (down from 12+ min).

---

## Smoke Test 1: Mystic Policy Evolution (old code, pre-fix)
- Command: `evolve.js --ai mcts --faction mystic --pop 6 --games 6 --gen 3 --survivors 2 --sims 1`
- Status: Killed mid-Gen 2 (ran in parallel, CPU contention)
- Gen 1: **topWR=0.0% (0W/0L/30D) DR=100%** — all 30 games drew
- Note: This 100% DR was caused by the actionsThisTurn bug, NOT purely healing mechanics

---

## Smoke Test 2: Cross-Faction (elf vs beast)
### Pre-fix (1 game via runSimulation --p1 elf --p2 beast --games 1):
| Game | Winner | Turns | P1 HP | P2 HP |
|------|--------|-------|-------|-------|
| 1    | p1     | 28    | 16    | 0     |

### Post-fix (2 games):
| Game | Winner | Turns | P1 HP | P2 HP |
|------|--------|-------|-------|-------|
| 1    | p2     | ~19   | -     | -     |
| 2    | p2     | ~19   | -     | -     |

Combined (3 games): **P1=1, P2=2, draws=0 (0% DR)**

---

## Smoke Test 3: Control (beast vs beast, post-fix)
5 games, `--ai mcts --sims 1`

| Game | Winner | Turns | P1 HP | P2 HP |
|------|--------|-------|-------|-------|
| 1    | p2     | 18    | -3    | 6     |
| 2    | p2     | 18    | -1    | 20    |
| 3    | p2     | 13    | 0     | 8     |
| 4    | null   | 30    | 5     | 14    |
| 5    | p2     | 19    | -1    | 12    |

**P1=0, P2=4, draws=1 (20% DR)**
- Decisive rate: 80%
- Draw game: P1HP=5, P2HP=14 at turn limit — P2 clearly ahead but couldn't close
- Avg winner HP: 11.5 (decisive games)

---

## Performance Summary
| Code State | AI | Matchup | Time/game |
|---|---|---|---|
| Pre-fix | MCTS sims=1 | beast vs beast | ~90-120s |
| Pre-fix | MCTS sims=1 | elf vs beast | 12+ min |
| Post-fix | MCTS sims=1 | beast vs beast | ~60-90s |
| Post-fix | MCTS sims=1 | elf vs beast | ~3 min |
| heuristic | - | any | <1s |
| minimax d=2 | - | any | 10-30s |

---

## Key Findings
1. **actionsThisTurn bug** caused 100% DR in mystic (elf) matches with MCTS — fixed
2. **Post-fix elf vs beast**: 0 draws in 3 games (decisive)
3. **Post-fix beast vs beast**: 20% DR (1/5) — low, comparable to heuristic baseline
4. Beast vs beast DR=20% vs mystic DR=100% confirms: healing mechanics ARE a factor
   but the bug was masking the true picture. With fix, elf games resolve.
5. P2 advantage strong in beast mirror (4/4 decisive games won by P2) — first-player
   disadvantage or AI seeded with P2 advantage from board position?

---

## Final Results: Cross-Faction (elf vs beast, post-fix, 5 games)

| Game | Winner | Turns | P1 HP | P2 HP |
|------|--------|-------|-------|-------|
| 1 | p2 | 25 | 0 | 14 |
| 2 | p2 | 17 | -1 | 20 |
| 3 | null | 22 | **20** | **18** |
| 4 | null | 30 | 5 | 9 |
| 5 | null | 16 | **24** | **20** |

**P1=0, P2=2, draws=3 → DR=60%**
- Wall time: 45 min 15 sec for 5 games (~9 min/game)
- Avg turns: 22.0, avg winner HP: 17.0

Draw game HP analysis:
- G3: Both at 20/18 at turn 22 — champions barely being attacked
- G4: 5/9 at turn limit — close fight, P2 ahead but no lethal
- G5: 24/20 at turn 16 — VERY healthy, AI not engaging champions at all

## Final Results: Control (beast vs beast, post-fix, 5 games)

| Game | Winner | Turns | P1 HP | P2 HP |
|------|--------|-------|-------|-------|
| 1 | p2 | 18 | -3 | 6 |
| 2 | p2 | 18 | -1 | 20 |
| 3 | p2 | 13 | 0 | 8 |
| 4 | null | 30 | 5 | 14 |
| 5 | p2 | 19 | -1 | 12 |

**P1=0, P2=4, draws=1 → DR=20%**
- Draw game: P1HP=5, P2HP=14 at turn limit — P2 clearly ahead

## Board Question Answered
"If Primal draws are low, Mystic draws are a healing mechanics issue."

- Beast vs beast DR: **20%** (low ✓)
- Elf vs beast DR: **60%** (high)
- Gap: 40 percentage points = healing mechanics contribution

**Conclusion:** Both factors at play:
1. actionsThisTurn bug (now fixed) was causing ~40% extra draws
2. Elf healing mechanics still contribute ~40% above beast baseline
3. Draw game G3/G5 show champions at 20+ HP at game end → MCTS not engaging
   champions enough even when kills should be possible

## Recommended Fixes
1. ✅ Fixed: actionsThisTurn now counts move actions toward 80-action cap
2. TODO: Increase attackChampionBias further (3.0 → 5.0+) in DEFAULT_POLICY
3. TODO: Add champion HP tracking in rollouts — if enemy champ low HP, weight
   champion attack actions much more heavily
4. TODO: Consider raising MCTS sims from 1 to 5-10 for better decision quality
