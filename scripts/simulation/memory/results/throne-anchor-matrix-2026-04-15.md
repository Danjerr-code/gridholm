# Throne Anchor + Champion Approach — Full Matrix 2026-04-15

**Run config:** minimax depth=2, 100 games/direction, 1200 total games  
**Commits tested:** `b6c6370` (early game champion approach priority boost) on top of `bd8e3e2` (throne anchor incentive)  
**Baseline for comparison:** 37.9% DR (prior best minimax result)

---

## Overall Result

**Overall DR: 44.0%** — REGRESSION vs 37.9% baseline (+6.1pp)

---

## Raw Matchup Data (100 games each direction)

| P1 | P2 | P1 Wins | P2 Wins | Draws | DR | Avg Turns |
|---|---|---|---|---|---|---|
| human | beast | 44 | 51 | 5 | 5.0% | 18.9 |
| human | elf | 0 | 13 | 87 | 87.0% | 17.6 |
| human | demon | 23 | 36 | 41 | 41.0% | 25.5 |
| beast | human | 44 | 51 | 5 | 5.0% | 18.5 |
| beast | elf | 8 | 41 | 51 | 51.0% | 17.3 |
| beast | demon | 37 | 53 | 10 | 10.0% | 19.0 |
| elf | human | 16 | 1 | 83 | 83.0% | 15.2 |
| elf | beast | 31 | 10 | 59 | 59.0% | 16.4 |
| elf | demon | 22 | 0 | 78 | 78.0% | 17.6 |
| demon | human | 36 | 37 | 27 | 27.0% | 24.2 |
| demon | beast | 38 | 50 | 12 | 12.0% | 19.0 |
| demon | elf | 0 | 30 | 70 | 70.0% | 19.9 |

---

## Combined Win Rate Matrix

| Matchup | F1 WR | F2 WR | DR | Flag |
|---|---|---|---|---|
| beast vs human | 47.5% | 47.5% | 5.0% | |
| elf vs human | 14.5% | 0.5% | 85.0% | ⚠️ SEVERE |
| demon vs human | 36.0% | 30.0% | 34.0% | ⚠️ FLAGGED |
| beast vs elf | 9.0% | 36.0% | 55.0% | ⚠️ SEVERE |
| beast vs demon | 43.5% | 45.5% | 11.0% | |
| demon vs elf | 0.0% | 26.0% | 74.0% | ⚠️ SEVERE |

---

## Flags

- **4 matchups above 30% DR threshold** (3 above 50%)
- **No faction above 60% WR** in any single matchup
- Elf matchups dominate the DR problem: H vs E (85%), B vs E (55%), E vs D (74%)

---

## Top Cards by Win Rate Impact

- Human: captain (14.8%), ironthorns (12.6%), warlord (12.4%), forgeweapon (10.0%), aendor (9.9%)
- Beast: razorfang (17.1%), savagegrowth (11.3%), sabretooth (1.9%)
- Elf: elfranger (18.3%), glitteringgift (14.1%), yggara (10.3%), elfscout (9.8%), ancientspring (9.6%)
- Demon: dreadshade (13.0%), brutedemon (12.9%), wanderingconstruct (11.9%), shadowstalker (11.4%), souldrain (9.3%)

---

## Analysis

The throne anchor changes caused a 6.1pp DR regression. Primary driver is elf matchups.

**Root cause:** The combination of (1) throneAnchor +15 eval, (2) summon +5 when on throne, and (3) projectedChampionDamage halved when on throne makes Elf AI extremely passive. Elf already has high sustain. With champion damage incentive removed, elf sits on throne and heals/summons indefinitely without closing games. Elf DR was already the weakest point (Mystic closing issues documented in known-issues.md).

**Revert recommendation:** Changes in b6c6370 and bd8e3e2 net-worsen the game. Recommend board decide on revert.
