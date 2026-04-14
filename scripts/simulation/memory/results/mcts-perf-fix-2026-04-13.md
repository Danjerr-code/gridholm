# MCTS Performance Fixes — 2026-04-13 (commit 6b34971)

## Changes (LOG-1335 board directive 282af76a)

### Fix 1: applyActionMutate
- Added `applyActionMutate()` to `headlessEngine.js`
- Skips redundant `cloneState` calls within the switch branches (cast
  TWO_STEP path uses `{ ...state, ... }` spread instead of full clone;
  error fallback paths return `state` directly instead of `cloneState(state)`)
- Engine functions (moveChampion, endTurn, etc.) still return new states
  internally — fundamental clone cost unchanged
- `randomRollout` and `biasedRollout` now use `applyActionMutate` in
  their inner loops

### Fix 2: MAX_ROLLOUT_ACTIONS 400 → 50
- `MAX_ROLLOUT_ACTIONS` constant reduced from 400 to 50 (8× reduction)
- Now configurable via `chooseActionMCTS(state, { maxRolloutActions: N })`
- Threaded through `randomRollout(state, idx, turns, maxActions)` and
  `biasedRollout(state, idx, turns, policy, maxActions)` as 4th/5th arg

## Timing Test Result

| Metric | Value |
|--------|-------|
| Config | `beast vs beast, games=1, ai=mcts, sims=1` |
| Wall time | **2:05.50** (125.24s) |
| Target | <2 min (120s) |
| Game turns | 21 |
| Winner | p1 |
| Winner HP | 18 |

**Result: 4% over the 2-minute threshold.**

## Analysis

Estimated action cost breakdown (21 turns, ~15 decisions/turn, sims=1):
- Per decision: 1 rollout × 50 actions ≈ 50 applyAction calls
- Lethal scan (when canKill=true, `enemyChamp.hp ≤ maxAtk+2`): up to N_actions
  additional applyAction calls before MCTS even starts — likely firing most of
  the game since beast units are aggressive
- applyAction throughput: ~5ms/call (engine-internal clone cost, unreduceable
  without src/ changes)

**Root cause**: applyAction = ~5ms from engine-internal cloneState. Fix 2 gave
the expected 8× reduction vs old MAX=400, but the lethal-scan overhead (not
addressed by Fix 1 or Fix 2) pushes the total over 2 min.

## Status
Awaiting board direction:
- Proceed with Mystic smoke test anyway (2:05 is ~4% over threshold)?
- OR apply additional fix: tighten lethal-scan guard (`+2` → `0` buffer, or
  restrict to attack/move actions only) to reduce applyAction calls per decision?
