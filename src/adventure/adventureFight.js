/**
 * Adventure fight builder.
 *
 * Constructs a full game state for a fight/elite_fight/boss tile using the
 * player's current run state. All adventure modifications (champion HP,
 * blessings, loop scaling, elite modifiers) are applied to the initial state
 * before the engine processes it.
 */

import { generateAIDeck } from '../draft/aiDrafter.js';
import { createInitialState, autoAdvancePhase } from '../engine/gameEngine.js';
import { CARD_DB } from '../engine/cards.js';
import { registerUnit, registerModifiers } from '../engine/triggerRegistry.js';
import { getBossDefinition } from './bossDefinitions.js';

// Maps adventure faction names to game engine deck IDs
export const FACTION_TO_DECK_ID = {
  light:  'human',
  primal: 'beast',
  mystic: 'elf',
  dark:   'demon',
};

const ALL_FACTIONS = ['light', 'primal', 'mystic', 'dark'];

// ── Rooms-cleared difficulty tiers ────────────────────────────────────────────

/**
 * Returns fight configuration based on rooms cleared so far.
 * Elite fights add on top of this base; boss ignores it entirely.
 *
 * Brackets:
 *   0–1  → Easy       (warmup, small underpowered deck)
 *   2–3  → Moderate   (fair fight, similarly-sized deck)
 *   4–5  → Challenging (AI plays smarter, bigger deck)
 *   6–8  → Hard       (deck advantage, higher HP)
 *   9+   → Deadly     (late dungeon — serious fight)
 */
function getFightTier(roomsCleared) {
  if (roomsCleared <= 1) return { deckSize: 15, aiDepth: 1, championHP: 12, label: 'Easy' };
  if (roomsCleared <= 3) return { deckSize: 20, aiDepth: 1, championHP: 15, label: 'Moderate' };
  if (roomsCleared <= 5) return { deckSize: 24, aiDepth: 2, championHP: 15, label: 'Challenging' };
  if (roomsCleared <= 8) return { deckSize: 28, aiDepth: 2, championHP: 18, label: 'Hard' };
  return { deckSize: 30, aiDepth: 2, championHP: 20, label: 'Deadly' };
}

/**
 * Returns a human-readable difficulty label for a fight tile based on rooms cleared.
 * Elite fights are prefixed with "Elite".
 * @param {number} roomsCleared
 * @param {string} tileType - 'fight' | 'elite_fight' | 'boss'
 * @returns {string}
 */
export function getFightDifficultyLabel(roomsCleared, tileType) {
  if (tileType === 'boss') return 'Boss';
  const { label } = getFightTier(roomsCleared);
  return tileType === 'elite_fight' ? `Elite · ${label}` : label;
}

// Pick two different random factions
function pickTwoFactions() {
  const f1 = ALL_FACTIONS[Math.floor(Math.random() * ALL_FACTIONS.length)];
  let f2;
  do { f2 = ALL_FACTIONS[Math.floor(Math.random() * ALL_FACTIONS.length)]; } while (f2 === f1);
  return [f1, f2];
}

// ── Elite modifiers ───────────────────────────────────────────────────────────

function pickEliteModifier() {
  const roll = Math.floor(Math.random() * 3);
  if (roll === 0) return { type: 'extra_unit' };
  if (roll === 1) return { type: 'extra_hp', amount: 5 };
  return { type: 'extra_mana', amount: 2 };
}

// Place one pre-summoned unit from the AI deck adjacent to the AI champion (4,4)
function placeEliteStartUnit(state, aiDeckCardIds) {
  const pool = aiDeckCardIds
    .map(id => CARD_DB[id])
    .filter(c => c && c.type === 'unit' && c.cost >= 2 && c.cost <= 3 && !c.isToken);
  if (pool.length === 0) return;

  const card = pool[Math.floor(Math.random() * pool.length)];

  // Prefer (3,4) then (4,3), skip if occupied
  const candidates = [{ row: 3, col: 4 }, { row: 4, col: 3 }];
  const pos = candidates.find(p => !state.units.some(u => u.row === p.row && u.col === p.col));
  if (!pos) return;

  const unit = {
    ...card,
    uid: `${card.id}_elite_${Math.random().toString(36).slice(2)}`,
    owner: 1,
    row: pos.row,
    col: pos.col,
    maxHp: card.hp,
    summoned: false, // no summoning sickness — pre-placed before the game starts
    moved: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
    turnAtkBonus: 0,
    hidden: false,
  };

  state.units.push(unit);
  registerUnit(unit, state);
  registerModifiers(unit, state);
}

// ── Blessing application ──────────────────────────────────────────────────────

function applyBlessings(state, blessings) {
  if (!blessings || blessings.length === 0) return;
  for (const blessing of blessings) {
    switch (blessing) {
      case 'arcane_efficiency':
        // Reduce spell cost by 1 (minimum 1) via engine modifier
        state.activeModifiers.push({ type: 'spellCostReduction', playerIndex: 0, amount: 1 });
        break;

      case 'fortified_start':
        // Champion starts each fight with +3 max HP
        state.champions[0].maxHp += 3;
        state.champions[0].hp = Math.min(state.champions[0].hp + 3, state.champions[0].maxHp);
        break;

      case 'prepared':
        // Draw 2 extra cards at fight start (pull from player's deck directly)
        for (let i = 0; i < 2; i++) {
          const card = state.players[0].deck.shift();
          if (card) state.players[0].hand.push(card);
        }
        break;

      case 'aggressive_posture':
        // +1 ATK to all player units on summon (engine reads adventurePlayerAtkBonus)
        state.adventurePlayerAtkBonus = (state.adventurePlayerAtkBonus || 0) + 1;
        break;

      case 'swift_advance':
        // +1 champion move range for first 3 turns (engine reads adventureSwiftAdvanceTurns)
        state.adventureSwiftAdvanceTurns = 3;
        break;

      // shield_of_faith: champion takes 1 less damage (stored as flag for engine checks)
      case 'shield_of_faith':
        state.adventureShieldOfFaith = true;
        break;

      // virulent: friendly units apply 1 Poison on combat damage (stored as flag)
      case 'virulent':
        state.adventureVirulent = true;
        break;

      // arcane_flow: after casting a spell, reveal deck until finding a cheaper card (stored as flag)
      case 'arcane_flow':
        state.adventureArcaneFlow = true;
        break;

      // throne_sense, resilience, and blood_tithe are handled outside the fight engine
      default:
        break;
    }
  }
}

// ── Curse application ─────────────────────────────────────────────────────────

function applyCurses(state, curses) {
  if (!curses || curses.length === 0) return;
  state.adventureCurses = [...(state.adventureCurses || []), ...curses];
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a complete adventure game state for a fight, elite_fight, or boss tile.
 *
 * @param {Object} run       - adventure run state from adventureState.js
 * @param {number} row       - tile row (0-4), kept for API compat
 * @param {number} col       - tile col (0-4), kept for API compat
 * @param {string} tileType  - 'fight' | 'elite_fight' | 'boss'
 * @returns {{ initialState: Object, aiDepth: number, fightDifficultyLabel: string }}
 */
export function buildAdventureGameState(run, row, col, tileType) {
  const isBoss  = tileType === 'boss';
  const isElite = tileType === 'elite_fight';

  // ── Player deck spec ─────────────────────────────────────────────────────
  const playerSpec = JSON.stringify({
    type: 'custom',
    cards: run.deck,
    primaryAttr: run.championFaction,
  });

  // ── Enemy deck spec ──────────────────────────────────────────────────────
  let aiCardIds;
  let aiPrimaryFaction;
  let aiDepth;
  let fightDifficultyLabel;

  if (isBoss) {
    const bossDef    = getBossDefinition('the_enthroned', run.loopCount);
    aiCardIds        = [...bossDef.deck];
    aiPrimaryFaction = 'light'; // mixed boss deck — label 'light' for champion selection
    aiDepth          = bossDef.aiDepth;
    fightDifficultyLabel = 'Boss';
  } else {
    const roomsCleared = run.combatRoomsCleared ?? 0;
    const tier         = getFightTier(roomsCleared);
    aiDepth            = tier.aiDepth;
    fightDifficultyLabel = getFightDifficultyLabel(roomsCleared, tileType);

    const [f1, f2]   = pickTwoFactions();
    aiPrimaryFaction = f1;
    // generateAIDeck always returns 30 cards; slice to target size
    const fullDeck   = generateAIDeck(f1, f2, 0, aiDepth, []);
    aiCardIds        = fullDeck.slice(0, tier.deckSize);
  }

  const aiSpec = JSON.stringify({
    type: 'custom',
    cards: aiCardIds,
    primaryAttr: aiPrimaryFaction,
  });

  // ── Base game state ──────────────────────────────────────────────────────
  const state = createInitialState(playerSpec, aiSpec);

  // ── Override player champion HP/maxHp from adventure run ─────────────────
  state.champions[0].hp    = run.championHP;
  state.champions[0].maxHp = run.maxChampionHP;

  // ── Apply active blessings ───────────────────────────────────────────────
  applyBlessings(state, run.blessings);

  // ── Apply active curses ──────────────────────────────────────────────────
  applyCurses(state, run.curses);

  // ── Loop scaling: store loop count so engine can buff enemy units on summon
  if (run.loopCount > 0) {
    state.adventureLoopCount = run.loopCount;
  }

  // ── AI depth: stored in state so the AI engine uses the right search depth
  state.adventureAIDepth = aiDepth;

  // ── Enemy champion HP from rooms-cleared tier ─────────────────────────────
  // Boss HP is set later in the boss block; only override for normal/elite fights.
  if (!isBoss) {
    const roomsCleared = run.combatRoomsCleared ?? 0;
    const tier = getFightTier(roomsCleared);
    // Elite adds +3 HP on top of the base tier HP
    const baseHP = tier.championHP + (isElite ? 3 : 0);
    state.champions[1].hp    = baseHP;
    state.champions[1].maxHp = baseHP;
  }

  // ── Elite modifiers ──────────────────────────────────────────────────────
  if (isElite) {
    const mod = pickEliteModifier();
    if (mod.type === 'extra_unit') {
      placeEliteStartUnit(state, aiCardIds);
    } else if (mod.type === 'extra_hp') {
      state.champions[1].hp    += mod.amount;
      state.champions[1].maxHp += mod.amount;
    } else if (mod.type === 'extra_mana') {
      // Consumed in doBeginTurnPhase when it's the AI's first turn
      state.adventureEliteBonus = { extraMana: mod.amount };
    }
  }

  // ── Boss setup ────────────────────────────────────────────────────────────
  if (isBoss) {
    const bossDef = getBossDefinition('the_enthroned', run.loopCount);

    // Override boss champion HP and place at the Throne tile (2,2)
    state.champions[1].hp    = bossDef.championHP;
    state.champions[1].maxHp = bossDef.championHP;
    state.champions[1].row   = 2;
    state.champions[1].col   = 2;

    // Place pre-defined starting units
    for (const { base, row: uRow, col: uCol } of bossDef.startingUnits) {
      // Skip if tile is occupied
      if (state.units.some(u => u.row === uRow && u.col === uCol)) continue;

      const unit = {
        ...base,
        uid: `${base.id}_${uRow}_${uCol}_${Math.random().toString(36).slice(2)}`,
        owner: 1,
        row: uRow,
        col: uCol,
        // Preserve dormant fields if present on the base definition
        ...(base.dormant ? { dormant: true, dormantCounter: base.dormantCounter ?? 1 } : {}),
      };
      state.units.push(unit);
      registerUnit(unit, state);
      registerModifiers(unit, state);
    }

    // Apply boss switch tiles
    if (bossDef.switchTiles && bossDef.switchTiles.length > 0) {
      state.switchTiles = bossDef.switchTiles.map(s => ({ ...s }));
    }

    // Apply boss passives to state so the engine can read them generically.
    if (bossDef.bossPassives && bossDef.bossPassives.length > 0) {
      state.bossPassives = [...bossDef.bossPassives];
    }

    // Flag for AI evaluation: heavily weight staying on the throne
    state.adventureBossFight = true;
  }

  // ── Tile movement HP penalty ──────────────────────────────────────────────
  // Enemy champion gains HP based on cumulative movement across all dungeons
  // plus the live penalty for the current dungeon's tile count so far.
  const tilesMoved = run.tilesMoved ?? 0;
  const cumulativeBonus = run.cumulativeChampionHPBonus ?? 0;
  const livePenalty = Math.floor(tilesMoved / 5);
  const totalBonus = cumulativeBonus + livePenalty;
  if (totalBonus > 0) {
    state.champions[1].hp    += totalBonus;
    state.champions[1].maxHp += totalBonus;
  }

  return {
    initialState: autoAdvancePhase(state),
    aiDepth,
    fightDifficultyLabel,
  };
}
