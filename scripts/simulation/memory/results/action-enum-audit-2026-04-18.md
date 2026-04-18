# Action Enumeration Completeness Audit — 2026-04-18

**Run type**: Diagnostic  
**Task**: LOG-1547  
**Branch**: diag/action-enumeration-audit  
**Harness**: scripts/simulation/runActionEnumAudit.js  
**Question**: Does headlessEngine's getLegalActions generate all legal actions that gameEngine would accept? Where do they diverge?

## Configuration
- 4 matchups: HvB, EvD, HvE, BvD
- 3 trials per matchup
- States captured at turn 1-2, 6-12, 18+
- 206 valid action-phase test states
- Runtime: 1.0s

## Runtime Findings (standard 4-faction decks)

### MISSING (1)
- **devour** [missing_spell_no_targets]: `hasValidTargets` includes enemy relics with hp≤2 (relic filter absent from hasValidTargets), but `getSpellTargets` correctly excludes relics. In states where the only enemy piece with hp≤2 is a relic, hasValidTargets=true but getSpellTargets returns [] → devour not cast. Functionally correct behavior (can't cast devour on relic), but hasValidTargets is inconsistent.

### FALSE POSITIVES (0)
None detected across 206 states. No enumerated action leads to stuck/unresolved state for standard decks.

### STUCK STATES (0)
None.

### ODDITIES (1)
- **predatorsmark**: gameEngine dispatches as no-target (in its NO_TARGET_SPELLS), but headlessEngine doesn't have it in its NO_TARGET_SPELLS and enumerates it via getSpellTargets (returns [champion1]). Result: generates { type: 'cast', targets: ['champion1'] }. When applied, playCard dispatches it as no-target and returns (pendingSpell not set), so applyActionMutate returns the post-cast state with the target parameter ignored. Works correctly but generates unnecessary target-variant actions.

## Static Code Analysis Findings (non-standard cards)

These divergences don't affect current simulation (cards absent from standard decks) but would cause bugs in draft/adventure scenarios.

### Missing no-target spells from headlessEngine.NO_TARGET_SPELLS
| Spell | Status | Impact |
|-------|--------|--------|
| fatesledger | In gameEngine NO_TARGET_SPELLS, NOT in headlessEngine's | Never cast by sim AI |
| seconddawn | Same | Never cast by sim AI |

### Spells with no getSpellTargets entry (returns [])
| Spell | playCard behavior | Enumeration result |
|-------|------------------|-------------------|
| amethystcache | sets pendingRelicPlace | getSpellTargets=[] → never enumerated |
| finalexchange | sets pendingSpell(step0) for unit sacrifice | getSpellTargets=[] → never enumerated |
| tollofshadows | calls _tollAdvance multi-step | getSpellTargets=[] → never enumerated |

### Non-pendingSpell stuck states
| Spell | playCard behavior | Stuck state |
|-------|------------------|-------------|
| rebirth | sets pendingGraveSelect (not pendingSpell) | applyActionMutate returns with pendingGraveSelect; getLegalActions ignores it and continues enumerating normal actions → spell resolves without completing the grave selection |

## Key Conclusion
For the **standard 4-faction decks (human, beast, elf, demon)**, action enumeration is clean. No structural bugs that cause stuck states or AI failures.

For **non-standard cards** (fatesledger, seconddawn, amethystcache, finalexchange, tollofshadows, rebirth): 6 divergences identified that would prevent those spells from being cast by the sim AI, and one (rebirth) that could cause a stuck/incomplete game state.

## Tag
- AI issue (sim parity gap, not game design)
- Not affecting current matchup simulation
- Would need fixes before draft/adventure simulation
