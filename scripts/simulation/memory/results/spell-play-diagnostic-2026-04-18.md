# Spell Play Analysis — Diagnostic Run
**Date**: 2026-04-18
**Run type**: Diagnostic
**Task**: LOG-1539
**Branch**: diag/spell-play-analysis
**Config**: timeBudget=200ms, MAX_TURNS=35, MAX_ACTIONS=600, 20 games (HvB×5, HvE×5, BvE×5, EvD×5), both players minimax AI
**Runtime**: 1059.7s (~17.7 min)
**Question**: How is the AI playing spells across factions?

## Game Outcomes
| Matchup | Draws | P1 W | P2 W | DR |
|---------|-------|------|------|-----|
| HvB (5) | 2 | 1 | 2 | 40% |
| HvE (5) | 5 | 0 | 0 | 100% |
| BvE (5) | 5 | 0 | 0 | 100% |
| EvD (5) | 5 | 0 | 0 | 100% |
| **Total** | **17/20** | | | **85%** |

Note: High DR is pre-existing; this is a diagnostic context, not a validation.

## Per-Faction Spell Data

### HUMAN
| Spell | Drawn | Cast | CastRate | HoldRate | AvgTurn | KillRate | Streak |
|-------|-------|------|----------|----------|---------|----------|--------|
| forgeweapon | 3 | 2 | 67% | 93% | 17.0 | N/A | ⚠ 24x |
| ironthorns | 5 | 3 | 60% | 93% | 12.3 | N/A | ⚠ 32x |
| ironshield | 10 | 7 | 70% | 90% | 12.9 | N/A | ⚠ 52x |
| smite | 5 | 4 | 80% | 89% | 9.0 | 100% (4/4) | ⚠ 28x |
| crusade | 2 | 2 | 100% | 71% | 12.5 | N/A | ⚠ 1x |
| martiallaw | 4 | 4 | 100% | 64% | 13.5 | N/A | ⚠ 2x |

### BEAST
| Spell | Drawn | Cast | CastRate | HoldRate | AvgTurn | KillRate | Streak |
|-------|-------|------|----------|----------|---------|----------|--------|
| savagegrowth | 3 | 2 | 67% | 94% | 14.5 | N/A | ⚠ 28x |
| predatorsmark | 4 | 3 | 75% | 92% | 11.7 | N/A | ⚠ 28x |
| packhowl | 3 | 2 | 67% | 78% | 11.5 | N/A | ⚠ 2x |
| crushingblow | 4 | 3 | 75% | 73% | 11.0 | 100% (3/3) | ⚠ 3x |
| pounce | 3 | 3 | 100% | 25% | 17.3 | 0% (0/3) | - |

Note: pounce kill rate 0% is NOT a flag — pounce resets a unit's action, it deals no damage. Script incorrectly classifies it as a damage spell.

### ELF
| Spell | Drawn | Cast | CastRate | HoldRate | AvgTurn | KillRate | Streak |
|-------|-------|------|----------|----------|---------|----------|--------|
| entangle | 5 | 2 | 40% | 92% | 12.0 | N/A | ⚠ 13x |
| bloom | 5 | 4 | 80% | 90% | 10.0 | N/A | ⚠ 29x |
| verdantsurge | 8 | 4 | 50% | 89% | 11.5 | N/A | ⚠ 26x |
| glitteringgift | 7 | 5 | 71% | 89% | 6.6 | N/A | ⚠ 30x |
| moonleaf | 5 | 4 | 80% | 78% | 10.0 | N/A | ⚠ 7x |
| ancientspring | 3 | 2 | 67% | 78% | 8.0 | N/A | ⚠ 3x |
| recall | 7 | 5 | 71% | 50% | 8.2 | N/A | ⚠ 1x |
| petrify | 7 | 5 | 71% | 44% | 8.6 | N/A | ⚠ 1x |

### DEMON
| Spell | Drawn | Cast | CastRate | HoldRate | AvgTurn | KillRate | Streak |
|-------|-------|------|----------|----------|---------|----------|--------|
| agonizingsymphony | 2 | 0 | **0%** | 100% | N/A | N/A | ⚠ 5x |
| devour | 1 | 0 | **0%** | 100% | N/A | N/A | - |
| pestilence | 3 | 0 | **0%** | 100% | N/A | N/A | ⚠ 7x |
| pactofruin | 2 | 0 | **0%** | 100% | N/A | N/A | ⚠ 1x |
| bloodoffering | 1 | 1 | 100% | 75% | 17.0 | N/A | ⚠ 1x |

## Root Cause Analysis

### AI Issue 1: agonizingsymphony and pestilence never cast (CRITICAL)
**Root cause**: `headlessEngine.js` NO_TARGET_SPELLS (lines 54-58) does NOT include `agonizingsymphony` or `pestilence`. `gameEngine.js`'s playCard NO_TARGET_SPELLS (line ~2179) DOES include them. This mismatch means:
- getLegalActions tries to find targets via `getSpellTargets(state, effect, ...)` 
- Neither effect has a case in `_rawSpellTargets` → returns `[]`
- Therefore these spells NEVER appear in legal actions → AI never casts them

**Fix required**: Add `agonizingsymphony` and `pestilence` to headlessEngine.js NO_TARGET_SPELLS. **Requires Brock (src/ file).**

### AI Issue 2: pactofruin never cast (CRITICAL)
**Root cause**: `pactofruin` (cost 1, requires discard + target enemy) has no case in `_rawSpellTargets`, and isn't in headlessEngine's NO_TARGET_SPELLS. When getLegalActions generates spell candidates, `getSpellTargets(state, 'pactofruin', ...)` returns `[]`. The multi-step nature (pendingHandSelect → pendingSpell for 'pactofruin_damage') is not handled in the simulation's getLegalActions generation path.

**Fix required**: headlessEngine.js needs to either (a) add `pactofruin` to NO_TARGET_SPELLS (gameEngine handles discard internally) or (b) add special case. **Requires Brock (src/ file).**

### Expected Behavior: devour never cast (1 game, small sample)
**Root cause**: devour requires an enemy unit with ≤2 HP. In 5 EvD games, this condition was not met when Demon had mana available. This may be a balance issue (condition too rare/fragile) rather than a bug. Sample of 5 games is too small to conclude. NOT escalating as a bug.

### Hold Rate Interpretation Note
High hold rates (80-93%) for Human/Beast/Elf spells reflect the metric design: `heldAffordableTurns / (cast + heldAffordableTurns)` accumulates every turn a spell sits in hand when mana-affordable. A spell held 15 turns before casting scores 93% hold rate. These rates do NOT necessarily indicate incorrect AI behavior — they indicate spells are held for extended periods before being cast (which may be strategically appropriate for defensive/reactive spells like ironshield, ironthorns).

True flags requiring separate investigation would require casting CONTEXT (what was the board state when the AI held despite having mana and the spell having valid targets?). That's a separate diagnostic question.
