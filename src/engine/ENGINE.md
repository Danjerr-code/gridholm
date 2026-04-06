# Gridholm Game Engine

## Overview

The engine is a collection of pure functions. Game state is a plain JavaScript
object passed into and returned from every function. No direct mutations outside
of state updates. No side effects beyond logging.

All game logic lives in the following files:

| File | Purpose |
|---|---|
| `gameEngine.js` | Core state machine, turn structure, combat resolution |
| `cards.js` | All card definitions and four faction deck compositions |
| `spellRegistry.js` | All spell resolver functions, one per spell effect ID |
| `actionRegistry.js` | All Action ability resolver functions, one per unit ID |
| `statUtils.js` | All effective stat calculations (ATK, HP, SPD, aura bonuses) |
| `ai.js` | Rule-based AI opponent logic |

---

## Game State Shape
```javascript
{
  turn: number,                    // current turn number
  activePlayer: number,            // 0 or 1
  phase: string,                   // 'begin-turn' | 'action' | 'end-turn'
  gameOver: boolean,
  log: string[],                   // game log entries, chronological

  players: [
    {
      hp: number,                  // current champion HP
      maxHp: number,               // current max champion HP (can grow)
      res: number,                 // current resources
      turnCount: number,           // how many turns this player has taken
      deck: Card[],                // remaining deck
      hand: Card[],                // cards in hand
      playerPos: { r, c },         // champion position on 5x5 grid
      hasMoved: boolean,           // whether champion has moved this turn
      championMoved: boolean,      // alias for hasMoved
      hpRestoredThisTurn: number,  // running total of HP restored this turn (for Bloom)
      sergeantBuff: boolean,       // whether next summon gets +1/+1 from Sergeant
      thornShield: { absorb, thornDamage } | null, // Iron Thorns state
    },
    // player 1 same shape
  ],

  units: [
    {
      // Card fields (from cards.js definition)
      id: string,
      name: string,
      type: 'unit',
      cost: number,
      atk: number,                 // base ATK, may be modified by Forge Weapon etc
      hp: number,                  // current HP
      maxHp: number,               // max HP, may grow from Paladin/Sister Siofra
      spd: number,                 // base SPD
      unitType: string,            // 'Human' | 'Beast' | 'Elf' | 'Demon'
      rules: string,
      legendary: boolean,

      // Keyword flags
      hidden: boolean,             // Hidden keyword
      rush: boolean,               // Rush keyword
      action: boolean,             // has an Action ability
      cannotMove: boolean,         // cannot move (Seedling)
      aura: object | null,         // Aura definition if applicable
      shadowVeiled: boolean,       // was given Hidden by Shadow Veil spell

      // Board position
      r: number,                   // row 0-4
      c: number,                   // col 0-4
      owner: number,               // 0 or 1

      // Turn state
      uid: string,                 // unique instance ID
      sick: boolean,               // summoning sickness
      moved: boolean,              // has acted this turn
      razorfangResetUsed: boolean, // Razorfang once-per-turn reset used

      // Temporary buffs (cleared at start of next turn)
      turnAtkBonus: number,        // from Rally, Crusade, Infernal Pact
      speedBonus: number,          // from Pack Howl
      tempHpBonus: number,         // from Fortify
      fortifyExpires: boolean,     // flag to clear Fortify on next begin turn
      dreadShadeRevealBonus: boolean, // Dread Shade +2 ATK on reveal turn

      // Status effects
      martialLaw: boolean,         // cannot act next turn
      shield: number,              // damage absorption remaining (Iron Shield)
    }
  ],

  movedUnits: Set,         // set of unit uids that have acted this turn
  shadowTrapTriggerUid: string | null, // uid of unit that triggered Shadow Trap reveal
}
```

---

## Turn Structure

Three phases per turn, two of which auto-resolve:

Begin Turn (auto) → draw 1 card (P1 skips on turn 1) → gain resources: min(turnCount, 10), reset each turn → fire fireBeginTurnTriggers()

Action (player controlled) → move champion 1 tile (once per turn) → play any number of affordable cards → move any unit that has not yet moved and is not sick → use Action abilities instead of moving a unit → end phase manually

End Turn (auto) → fire fireEndTurnTriggers() → discard to hand limit (player selects) → pass to opponent

---

## Adding a New Card

### Step 1: Add the card definition to `cards.js`

Every unit card needs:
```javascript
{
  id: 'uniqueid',           // lowercase, no spaces
  name: 'Display Name',
  type: 'unit',
  cost: number,
  atk: number,
  hp: number,
  spd: number,
  unitType: 'Human' | 'Beast' | 'Elf' | 'Demon',
  rules: 'Rules text shown on card.',
  legendary: false,
  // keyword flags as needed:
  rush: false,
  hidden: false,
  action: false,
  cannotMove: false,
  aura: null,
}
```

Every spell card needs:
```javascript
{
  id: 'uniqueid',
  name: 'Display Name',
  type: 'spell',
  cost: number,
  effect: 'effectid',       // must match a key in SPELL_REGISTRY
  unitType: 'Human' | 'Beast' | 'Elf' | 'Demon',
  rules: 'Rules text shown on card.',
  legendary: false,
}
```

### Step 2: Add the card to a deck composition array

Add the card id (with copies as needed) to the appropriate deck array in `cards.js`. The deck validation assertion will catch any deck that is not exactly 30 cards.

### Step 3: Implement the card ability

**If it is a spell:**
Add a resolver function to `SPELL_REGISTRY` in `spellRegistry.js` keyed by the `effect` field. The resolver signature is `(state, caster, targets, options) => newState`. The spell registry validation will catch any missing resolver on startup.

**If it has an Action ability:**
Set `action: true` on the card definition. Add a resolver function to `ACTION_REGISTRY` in `actionRegistry.js` keyed by the card `id`. The action registry validation will catch any missing resolver on startup.

**If it triggers on begin turn:**
Add logic to `fireBeginTurnTriggers(state, playerIdx)` in `gameEngine.js`. Comment: `// [CARD NAME]: description`

**If it triggers on end turn:**
Add logic to `fireEndTurnTriggers(state, playerIdx)` in `gameEngine.js`. Comment: `// [CARD NAME]: description`

**If it triggers on death:**
Add logic to `fireDeathTriggers(unit, state, source)` in `gameEngine.js`. Always use `destroyUnit()` for any unit removal inside the trigger. Comment: `// [CARD NAME]: description`

**If it triggers on attack:**
Add logic to `fireAttackTriggers(attacker, defender, state, killedDefender)` in `gameEngine.js`. Comment: `// [CARD NAME]: description`

**If it triggers on summon:**
Add logic to `fireOnSummonTriggers(unit, state)` in `gameEngine.js`. Comment: `// [CARD NAME]: description`

---

## Keywords Reference

| Keyword | Field | Behavior |
|---|---|---|
| Rush | `rush: true` | Unit can move the turn it is summoned. `sick` is set to `false` on summon. |
| Hidden | `hidden: true` | Unit renders as face-down token to opponent. No stat-based spells can target it. Reveals on enemy contact or player choice. |
| Action | `action: true` | Unit has an ability usable instead of moving. Resolver in `actionRegistry.js`. |
| Aura | `aura: { range, stat, value, target }` | Passive bonus or debuff in a tile radius. Calculated at combat time via `getEffectiveAtk()`. Never written to unit state. |
| Cannot Move | `cannotMove: true` | Unit cannot be selected for movement. Can still be attacked. Seedling uses this. |
| Legendary | `legendary: true` | Visual gold border treatment. Only one legendary with the same id can be in a deck in future deck building. |

---

## Stat Calculation Rules

**Never read `unit.atk`, `unit.hp`, or `unit.spd` directly during combat or targeting.**

Always use the utilities from `statUtils.js`:

| Function | Use case |
|---|---|
| `getEffectiveAtk(unit, state)` | Combat damage calculation, spell targeting that references ATK |
| `getEffectiveHp(unit, state)` | Display and targeting that references current HP |
| `getEffectiveMaxHp(unit, state)` | Display of max HP |
| `getEffectiveSpd(unit, state)` | Movement range calculation |
| `getPackBonus(unit, state)` | Pack Runt scaling (internal to getEffectiveAtk) |
| `getFriendlyAuraBonus(unit, state)` | UI highlighting of aura-buffed units |
| `getEnemyAuraDebuff(unit, state)` | UI highlighting of aura-debuffed units |

Aura bonuses are calculated at resolution time and never written to unit state. This prevents stacking bugs across multiple turns.

---

## Unit Destruction Rules

**Never filter `state.units` directly.**

Always use `destroyUnit(unit, state, source)`:
```javascript
// CORRECT
state = destroyUnit(targetUnit, state, 'combat')

// WRONG - never do this
state.units = state.units.filter(u => u.uid !== targetUnit.uid)
```

`destroyUnit` automatically:
- Removes the unit from `state.units`
- Fires all death triggers via `fireDeathTriggers()`
- Adds a log entry

The `source` parameter is for logging only. Valid values: `'combat'`, `'spell'`, `'sacrifice'`, `'effect'`, `'zmore'`, `'shadowtrap'`, `'ambush'`, `'bloom'`, `'darksentence'`, `'devour'`, `'pactofruin'`, `'bloodoffering'`, `'souldrain'`, `'woodlandguard'`, `'elfarcher'`, `'battlepriestunit'`

---

## HP Restoration Rules

**Never increment HP values directly.**

Always use `restoreHP(target, amount, state, source)`:
```javascript
// CORRECT - restore to a unit
state = restoreHP(unit, 4, state, 'elfelder')

// CORRECT - restore to a champion by player index
state = restoreHP('champion0', 2, state, 'seedling')

// WRONG - never do this
player.hp = Math.min(player.maxHp, player.hp + 4)
```

`restoreHP` automatically:
- Caps restoration at `maxHp`
- Increments `hpRestoredThisTurn` for Bloom tracking
- Fires Moonveil Mystic trigger
- Adds a log entry

---

## Hidden Unit Rules

While `unit.hidden === true`:
- Renders as face-down dark token to opponent
- Controlling player sees their own Hidden units normally
- Cannot be targeted by stat-based spells (Smite, Forge Weapon, Iron Shield, Swift Step)
- Can be targeted by Recall
- Area damage effects do not affect Hidden units
- SPD is effectively 1 regardless of base SPD
- ATK is 0 (no stats exposed)
- Can move 1 tile per turn without revealing

Reveal triggers:
- Enemy unit moves into tile: reveal then resolve combat
- Enemy champion moves adjacent: reveal, no combat
- Controlling player uses unit action to reveal: mark as moved this turn

After reveal: full stats apply, targetable normally from next turn.

---

## Multiplayer State Sync

In multiplayer mode game state is stored as a JSONB blob in Supabase `game_sessions` table. Every player action writes the full new state to Supabase. Both clients subscribe via Realtime and re-render on change.

The engine is state-in state-out and works identically for local AI mode and multiplayer mode. The only difference is where state is persisted.

Hidden unit security note: the full game state including Hidden unit identities is stored in Supabase and sent to both clients. A technically savvy opponent could read network responses to identify Hidden units. This is acceptable for MVP. Server-side state filtering should be implemented before competitive ranked play is introduced.

---

## File Change Checklist

When modifying the engine always:

- [ ] Run `npm run build` before and after
- [ ] Verify deck validation assertions log no errors
- [ ] Verify spell registry validation logs no errors
- [ ] Verify action registry validation logs no errors
- [ ] Test the affected mechanic in a vs AI game
- [ ] Commit with a descriptive message referencing the card or mechanic changed
