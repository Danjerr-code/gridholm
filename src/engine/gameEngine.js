import { buildDeck, shuffle, TOKENS, CARD_DB } from './cards.js';
import { calculateResonance, RESONANCE_THRESHOLDS } from './attributes.js';
import { CHAMPIONS } from './champions.js';
import {
  getAuraAtkBonus,
  getEffectiveAtk,
  getEffectiveSpd,
} from './statUtils.js';
export { getAuraAtkBonus, getEffectiveAtk, getEffectiveSpd } from './statUtils.js';

const FACTION_ATTRIBUTE = {
  human: 'light',
  beast: 'primal',
  elf:   'mystic',
  demon: 'dark',
};

// Bright orange used to highlight ability targeting tiles (e.g. Vorn direction select).
// Defined as a constant so other ability targeting features can reuse it.
export const ABILITY_TILE_HIGHLIGHT_COLOR = '#f97316';

// ── Champion modifier helpers ──────────────────────────────────────────────
// Returns total ATK bonus granted to a champion from championAtkBuff modifiers
// when the champion is within range of each modifier's source unit,
// plus any temporary per-turn ATK bonus (e.g. from Howl).
export function getChampionAtkBuff(state, champion) {
  let buff = champion.turnAtkBonus || 0;
  if (!state.activeModifiers) return buff;
  for (const mod of state.activeModifiers) {
    if (mod.type !== 'championAtkBuff') continue;
    if (mod.playerIndex !== champion.owner) continue;
    const src = state.units.find(u => u.uid === mod.unitUid);
    if (!src) continue;
    const dist = Math.abs(src.row - champion.row) + Math.abs(src.col - champion.col);
    if (dist <= (mod.range || 0)) buff += (mod.amount || 0);
  }
  return buff;
}

// Returns total SPD bonus granted to a champion from championSpdBuff modifiers.
export function getChampionSpdBuff(state, champion) {
  if (!state.activeModifiers) return 0;
  let buff = 0;
  for (const mod of state.activeModifiers) {
    if (mod.type !== 'championSpdBuff') continue;
    if (mod.playerIndex !== champion.owner) continue;
    const src = state.units.find(u => u.uid === mod.unitUid);
    if (!src) continue;
    const dist = Math.abs(src.row - champion.row) + Math.abs(src.col - champion.col);
    if (dist <= (mod.range || 0)) buff += (mod.amount || 0);
  }
  return buff;
}

// Returns the effective spell cost for a card, accounting for spellCostReduction modifiers.
// Only applies to spell-type cards. Minimum cost is 1.
export function getEffectiveSpellCost(state, card) {
  if (card.type !== 'spell') return card.cost;
  if (!state.activeModifiers) return card.cost;
  let reduction = 0;
  for (const mod of state.activeModifiers) {
    if (mod.type !== 'spellCostReduction') continue;
    if (mod.playerIndex !== state.activePlayer) continue;
    reduction += (mod.amount || 0);
  }
  return Math.max(1, card.cost - reduction);
}

// Returns the effective cost of any card for a given player, accounting for active
// cost-reduction modifiers (e.g. Fennwick's spellCostReduction aura). Use this
// for display and playability checks in the hand. The static card.cost is never mutated.
export function getEffectiveCost(card, state, playerIndex) {
  if (!state?.activeModifiers) return card.cost;
  if (card.type !== 'spell') return card.cost;
  let reduction = 0;
  for (const mod of state.activeModifiers) {
    if (mod.type !== 'spellCostReduction') continue;
    if (mod.playerIndex !== playerIndex) continue;
    reduction += (mod.amount || 0);
  }
  return Math.max(1, card.cost - reduction);
}
import { SPELL_REGISTRY } from './spellRegistry.js';
import { ACTION_REGISTRY, dispatchAction as _actionDispatch } from './actionRegistry.js';
import {
  createTriggerListeners,
  registerUnit,
  unregisterUnit,
  registerModifiers,
  unregisterModifiers,
  fireTrigger,
  resetTurnTriggers,
  getConditionalStatBonus,
  registerDynamicTrigger,
  isAuraSpellImmune,
} from './triggerRegistry.js';
import { filterAvailableContracts, pickRandomContracts } from './contracts.js';

function unitTypes(u) {
  if (!u) return [];
  const ut = u.unitType;
  if (!Array.isArray(ut)) {
    return ut ? [ut] : [];
  }
  return ut;
}

// Phases in order
export const PHASES = ['begin-turn', 'action', 'end-turn'];

// ── helpers ────────────────────────────────────────────────────────────────

export function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

// Returns 1 if the unit benefits from Fortitude damage reduction, else 0.
// Fortitude: Light/ascended player's unit within 2 tiles of their champion.
function getFortitudeReduction(state, unit) {
  const ownerIdx = unit.owner;
  const p = state.players[ownerIdx];
  if (!p || FACTION_ATTRIBUTE[p.deckId] !== 'light' || p.resonance?.tier !== 'ascended') return 0;
  const champ = state.champions[ownerIdx];
  return manhattan([champ.row, champ.col], [unit.row, unit.col]) <= 2 ? 1 : 0;
}

export function cardinalNeighbors(row, col) {
  return [
    [row - 1, col], [row + 1, col],
    [row, col - 1], [row, col + 1],
  ].filter(([r, c]) => r >= 0 && r < 5 && c >= 0 && c < 5);
}

function unitAt(state, row, col) {
  return state.units.find(u => u.row === row && u.col === col) || null;
}

// Destroys any combat units whose effective HP (raw hp + conditional modifier bonus) <= 0.
// Called after hand size decreases so that conditional HP buffs can cause death when conditions drop.
function checkConditionalStatDeaths(state) {
  const toDestroy = state.units.filter(u => {
    if (u.isRelic || u.isOmen || u.hidden) return false;
    const bonus = getConditionalStatBonus(state, u).hp;
    if (bonus === 0) return false;
    return u.hp + bonus <= 0;
  });
  for (const u of toDestroy) {
    destroyUnit(u, state, 'conditional_stat');
  }
}

// ── Wildborne Aura helpers ─────────────────────────────────────────────────

function applyWildbornAura(unit, state) {
  if (unit.wildborneBuff) return;
  unit.wildborneBuff = true;
  unit.maxHp += 1;
  unit.hp += 1;
  addLog(state, `Wildborne Aura: ${unit.name} gains +1 HP and +1 max HP.`);
}

function removeWildbornAura(unit, state) {
  if (!unit.wildborneBuff) return;
  unit.wildborneBuff = false;
  unit.maxHp = Math.max(1, unit.maxHp - 1);
  unit.hp = Math.max(1, unit.hp - 1);
  addLog(state, `Wildborne Aura: ${unit.name} loses +1 HP and +1 max HP.`);
}

// Reconcile which friendly Beast units have the Wildborne HP buff.
// Called after any movement so entering/leaving range is handled automatically.
function updateWildbornAura(state) {
  for (const wb of state.units.filter(u => u.id === 'wildborne')) {
    for (const beast of state.units.filter(u => u.owner === wb.owner && u.uid !== wb.uid && unitTypes(u).includes('Beast') && !u.hidden)) {
      const inRange = manhattan([wb.row, wb.col], [beast.row, beast.col]) <= wb.aura.range;
      if (inRange) applyWildbornAura(beast, state);
      else removeWildbornAura(beast, state);
    }
  }
}

// ── Standard Bearer Aura helpers ───────────────────────────────────────────

function applyStandardBearerAura(unit, state) {
  if (unit.standardBearerBuff) return;
  unit.standardBearerBuff = true;
  unit.maxHp += 1;
  unit.hp += 1;
  addLog(state, `Standard Bearer Aura: ${unit.name} gains +1 HP and +1 max HP.`);
}

function removeStandardBearerAura(unit, state) {
  if (!unit.standardBearerBuff) return;
  unit.standardBearerBuff = false;
  unit.maxHp = Math.max(1, unit.maxHp - 1);
  unit.hp = Math.max(1, unit.hp - 1);
  addLog(state, `Standard Bearer Aura: ${unit.name} loses +1 HP and +1 max HP.`);
}

// Reconcile which friendly units have the Standard Bearer HP buff.
// Called after any movement so entering/leaving range is handled automatically.
function updateStandardBearerAura(state) {
  for (const sb of state.units.filter(u => u.id === 'standardbearer')) {
    for (const friendly of state.units.filter(u => u.owner === sb.owner && u.uid !== sb.uid && !u.hidden)) {
      const inRange = manhattan([sb.row, sb.col], [friendly.row, friendly.col]) <= sb.aura.range;
      if (inRange) applyStandardBearerAura(friendly, state);
      else removeStandardBearerAura(friendly, state);
    }
  }
}

function championAt(state, row, col) {
  return state.champions.find(c => c.row === row && c.col === col) || null;
}

function isTileOccupied(state, row, col) {
  return !!unitAt(state, row, col) || !!championAt(state, row, col);
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function getPlayer(state) { return state.players[state.activePlayer]; }


// Deep-clone state
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// ── HP restore ─────────────────────────────────────────────────────────────
// Single point of HP restoration for the entire engine.
// target: unit/champion object OR 'champion0'/'champion1' string.
// Returns actual amount healed.
export function restoreHP(target, amount, state, source = 'effect') {
  let holder;
  if (typeof target === 'string') {
    const idx = parseInt(target.replace('champion', ''), 10);
    holder = state.champions[idx];
  } else {
    holder = target;
  }
  // Lifedrinker Stag: apply the highest restoreHPMultiplier belonging to the active player
  if (state.activeModifiers) {
    let maxMultiplier = 1;
    for (const mod of state.activeModifiers) {
      if (mod.type === 'restoreHPMultiplier' && mod.playerIndex === state.activePlayer) {
        if ((mod.multiplier || 1) > maxMultiplier) maxMultiplier = mod.multiplier;
      }
    }
    if (maxMultiplier > 1) amount = amount * maxMultiplier;
  }
  const actual = Math.min(amount, holder.maxHp - holder.hp);
  if (actual > 0) {
    holder.hp += actual;
    const ap = state.activePlayer;
    if (state.players[ap].hpRestoredThisTurn == null) state.players[ap].hpRestoredThisTurn = 0;
    state.players[ap].hpRestoredThisTurn += actual;
    // Moonveil Mystic: gains +1/+1 once per restore call
    const mystic = state.units.find(u => u.owner === ap && u.id === 'moonveilmystic');
    if (mystic) {
      mystic.atk += 1;
      mystic.hp += 1;
      mystic.maxHp += 1;
      addLog(state, `Moonveil Mystic grows! Now ${mystic.atk}/${mystic.hp}.`);
    }
  }
  return actual;
}

// ── Command limit ───────────────────────────────────────────────────────────
// Returns the maximum commands allowed this turn for the given player.
// Base is 3; commandBonus modifiers in activeModifiers add to it.
export function getCommandLimit(state, playerIndex) {
  let limit = 3;
  if (state.activeModifiers) {
    for (const mod of state.activeModifiers) {
      if (mod.type === 'commandBonus' && mod.playerIndex === playerIndex) {
        limit += (mod.amount || 0);
      }
    }
  }
  return limit;
}

// ── Unit destruction ────────────────────────────────────────────────────────
// Single point of unit removal for the entire engine. Fires death triggers.
export function destroyUnit(unit, state, source = 'combat', destroyingUids = new Set(), combatTile = null) {
  if (destroyingUids.has(unit.uid)) return state;
  destroyingUids.add(unit.uid);

  // Chains of Light: log stun release before modifier is unregistered
  if (unit.id === 'chainsoflight' && state.activeModifiers) {
    const mod = state.activeModifiers.find(m => m.type === 'stunTarget' && m.unitUid === unit.uid);
    if (mod) {
      const stunnedUnit = state.units.find(u => u.uid === mod.targetUid);
      if (stunnedUnit) addLog(state, `Chains of Light fades. ${stunnedUnit.name} is no longer stunned.`);
    }
  }

  // Unregister declarative triggers and static modifiers before removal
  unregisterUnit(unit.uid, state);
  unregisterModifiers(unit.uid, state);

  // Push non-token units to the owner's grave before removal.
  // graveEntry is an explicit plain object with only serialisable primitives —
  // no circular references, no live board state, no triggerListeners.
  if (!unit.isToken && state.players[unit.owner]) {
    const graveEntry = {
      type: 'unit',
      id: unit.id,
      uid: unit.uid,
      name: unit.name,
      cost: unit.cost,
      atk: unit.atk,
      maxHp: unit.maxHp,
      hp: unit.maxHp, // restored to full health
      spd: CARD_DB[unit.id]?.spd ?? unit.spd, // always restore base SPD from card def to prevent NaN on rebirth
      unitType: unit.unitType,
      image: unit.image,
      rules: unit.rules,
      legendary: unit.legendary,
      attribute: unit.attribute,
      // permanent stat changes are captured via atk/maxHp above
    };
    if (!state.players[unit.owner].grave) state.players[unit.owner].grave = [];
    state.players[unit.owner].grave.push(graveEntry);
  }

  // Remove from board
  state.units = state.units.filter(u => u.uid !== unit.uid);

  // Fire death triggers
  fireDeathTriggers(unit, state, source, destroyingUids, combatTile);

  addLog(state, `${unit.name} destroyed`);
  return state;
}

// ============================================
// DEATH TRIGGERS
// Fires from destroyUnit whenever any unit is destroyed
// ADD NEW DEATH TRIGGERS HERE
// ============================================
function fireDeathTriggers(unit, state, source, destroyingUids, combatTile) {
  // 1. Thornweave: restore 3 HP to controlling player champion
  if (unit.id === 'thornweave') {
    const healed = restoreHP('champion' + unit.owner, 3, state, 'thornweave');
    if (healed > 0) addLog(state, `Thornweave: champion restores ${healed} HP.`);
  }

  // 2. Sister Siofra: controlling player champion gains +2 max HP
  const siofra = state.units.find(u => u.owner === unit.owner && u.id === 'sistersiofra');
  if (siofra && unit.id !== 'sistersiofra') {
    const champ = state.champions[unit.owner];
    champ.maxHp += 2;
    champ.hp = Math.min(champ.maxHp, champ.hp + 2);
    addLog(state, `Sister Siofra: champion gains +2 max HP permanently.`);
  }

  // 3. Plague Hog: deal 2 damage to all adjacent units, chain-destroy at 0
  if (unit.id === 'plaguehog') {
    const [r, c] = combatTile || [unit.row, unit.col];
    const adj = cardinalNeighbors(r, c);
    const nearby = state.units.filter(u => adj.some(([r, c]) => u.row === r && u.col === c));
    for (const t of nearby) {
      t.hp -= 2;
      addLog(state, `Plague Hog explodes! ${t.name} takes 2 damage.`);
      if (t.hp <= 0) destroyUnit(t, state, 'plaguehog', destroyingUids);
    }
    state.units = state.units.filter(u => u.hp > 0);
  }

  // 4. Shadow Trap Hole: destroy the enemy unit that triggered the reveal
  if (unit.id === 'shadowtrap' && source !== 'shadowtrap' && state.shadowTrapTriggerUid) {
    const triggerEnemy = state.units.find(u => u.uid === state.shadowTrapTriggerUid);
    if (triggerEnemy) destroyUnit(triggerEnemy, state, 'shadowtrap', destroyingUids);
    state.shadowTrapTriggerUid = null;
  }

  // 5. Waddles: deactivate damage reduction for owner's champion
  if (unit.id === 'waddles') {
    state.waddlesActive[unit.owner] = false;
    addLog(state, `Waddles, Trusted Aide: champion damage reduction lost.`);
  }

  // 6. Sapling token: restore 1 HP to controlling champion
  if (unit.id === 'sapling' || unit.id === 'token_sapling') {
    const healed = restoreHP('champion' + unit.owner, 1, state, 'sapling');
    if (healed > 0) addLog(state, `Sapling: champion restores ${healed} HP.`);
  }

  // 7. Wildborne: remove HP aura from all buffed friendly Beast units
  if (unit.id === 'wildborne') {
    const range = unit.aura ? unit.aura.range : 1;
    const [wr, wc] = combatTile || [unit.row, unit.col];
    for (const beast of state.units.filter(u => u.owner === unit.owner && unitTypes(u).includes('Beast') && !u.hidden)) {
      if (manhattan([wr, wc], [beast.row, beast.col]) <= range) {
        removeWildbornAura(beast, state);
      }
    }
  }

  // 8. Standard Bearer: remove persistent HP bonus from all buffed friendly units
  if (unit.id === 'standardbearer') {
    for (const friendly of state.units.filter(u => u.owner === unit.owner && u.standardBearerBuff)) {
      removeStandardBearerAura(friendly, state);
    }
  }

  // 9. Soulstone relic: when a friendly combat unit dies, destroy the Soulstone and
  //    respawn that unit on the Soulstone's tile.
  if (!unit.isRelic && !unit.isOmen) {
    const soulstone = state.units.find(u => u.owner === unit.owner && u.id === 'soulstone');
    if (soulstone) {
      const respawnRow = soulstone.row;
      const respawnCol = soulstone.col;
      destroyUnit(soulstone, state, 'soulstone', destroyingUids);
      // Respawn the dead unit at Soulstone's tile if not already occupied
      const tileOccupied = state.units.some(u => u.row === respawnRow && u.col === respawnCol)
        || state.champions.some(c => c.row === respawnRow && c.col === respawnCol);
      if (!tileOccupied) {
        const respawned = {
          ...unit,
          hp: unit.maxHp,
          row: respawnRow,
          col: respawnCol,
          summoned: true,
          moved: false,
          atkBonus: 0,
          shield: 0,
          speedBonus: 0,
          turnAtkBonus: 0,
          uid: `${unit.id}_${Math.random().toString(36).slice(2)}`,
        };
        state.units.push(respawned);
        registerUnit(respawned, state);
        registerModifiers(respawned, state);
        addLog(state, `Soulstone: ${unit.name} respawns at (${respawnRow},${respawnCol})!`);
      } else {
        addLog(state, `Soulstone: ${unit.name} could not respawn — tile occupied.`);
      }
    }
  }

  // 10. Soul Harvest (Dark, Attuned passive): the first time an enemy unit is destroyed
  //    during the Dark player's own turn, restore 1 HP to their champion (capped at 20).
  const ap = state.activePlayer;
  const darkPlayer = state.players[ap];
  if (
    FACTION_ATTRIBUTE[darkPlayer.deckId] === 'dark' &&
    (darkPlayer.resonance?.tier === 'attuned' || darkPlayer.resonance?.tier === 'ascended') &&
    unit.owner !== ap &&
    !state.soulHarvestUsed
  ) {
    const champ = state.champions[ap];
    const healed = Math.min(1, 20 - champ.hp);
    if (healed > 0) {
      champ.hp += healed;
      addLog(state, `Soul Harvest: ${darkPlayer.name}'s champion restores 1 HP.`);
    }
    state.soulHarvestUsed = true;
  }

  // 11. Bloodlust (Primal, Ascended passive): whenever an enemy unit is destroyed during
  //    the active player's turn, gain 1 temporary mana (max 3 per turn).
  //    Fires on all sources: combat, spells, AOE, removal, sacrifice.
  const apBL = state.activePlayer;
  const primalPlayer = state.players[apBL];
  if (
    FACTION_ATTRIBUTE[primalPlayer.deckId] === 'primal' &&
    primalPlayer.resonance?.tier === 'ascended' &&
    unit.owner !== apBL
  ) {
    if (!state.bloodlustTriggered) state.bloodlustTriggered = [0, 0];
    if (state.bloodlustTriggered[apBL] < 3) {
      state.bloodlustTriggered[apBL]++;
      primalPlayer.resources = Math.min(primalPlayer.resources + 1, 10);
      addLog(state, `Kragor's Bloodlust. +1 mana.`);
    }
  }

  // Lucern, Unbroken Vow: if destroyed on the Throne tile (2,2), schedule resummon
  if (unit.id === 'lucernunbrokenvow') {
    const [lr, lc] = combatTile || [unit.row, unit.col];
    if (lr === 2 && lc === 2) {
      if (!state.lucernPendingResummon) state.lucernPendingResummon = [null, null];
      state.lucernPendingResummon[unit.owner] = {
        atk: unit.atk,
        atkBonus: unit.atkBonus || 0,
        maxHp: unit.maxHp,
      };
      addLog(state, `Lucern, Unbroken Vow: will rise again at end of owner's next turn.`);
    }
  }

  // Gilded Cage relic: when destroyed, release the trapped unit on its tile.
  if (unit.id === 'gildedcage_relic' && unit.trappedUnit) {
    const tileOccupied = state.units.some(u => u.row === unit.row && u.col === unit.col)
      || state.champions.some(c => c.row === unit.row && c.col === unit.col);
    if (!tileOccupied) {
      const released = {
        ...unit.trappedUnit,
        row: unit.row,
        col: unit.col,
        summoned: true,
        moved: false,
        uid: `${unit.trappedUnit.id}_${Math.random().toString(36).slice(2)}`,
      };
      state.units.push(released);
      // Register declarative triggers for the released unit (on-summon triggers do NOT fire)
      registerUnit(released, state);
      registerModifiers(released, state);
      addLog(state, `Gilded Cage destroyed. Unit released.`);
    } else {
      addLog(state, `Gilded Cage destroyed. Released unit has no room — lost.`);
    }
  }

  // Spiteling: when this unit dies, deal 1 damage to a random enemy combat unit.
  // Fired here because the declarative listener is unregistered before fireTrigger runs.
  // Works for shadow copies too (checked via triggers array, not unit.id).
  if (!unit.isRelic && !unit.isOmen && Array.isArray(unit.triggers) &&
      unit.triggers.some(t => t.event === 'onFriendlyUnitDeath' && t.effect === 'deathPing' && t.selfTrigger)) {
    const pingEnemies = state.units.filter(u => u.owner !== unit.owner && !u.isRelic && !u.isOmen && !u.hidden);
    if (pingEnemies.length > 0) {
      const pingTarget = pingEnemies[Math.floor(Math.random() * pingEnemies.length)];
      addLog(state, `Spiteling lashes out. 1 damage to ${pingTarget.name}.`);
      applyDamageToUnit(state, pingTarget, 1, 'Spiteling', null);
    }
  }

  // Declarative trigger registry: fire onEnemyUnitDeath and onFriendlyUnitDeath
  if (!unit.isRelic && !unit.isOmen) {
    const deathCtx = { dyingUnit: unit, dyingPlayerIndex: unit.owner, triggeringUid: unit.uid };
    fireTrigger('onEnemyUnitDeath', deathCtx, state);
    fireTrigger('onFriendlyUnitDeath', deathCtx, state);
  }

  // A unit dying reduces friendly unit count — check if any friendlyUnitCount-scaled units
  // (e.g. Oathkeep Paragon) now have effective HP <= 0 and must die.
  if (!unit.isRelic && !unit.isOmen) {
    checkConditionalStatDeaths(state);
  }
}

// ============================================
// BEGIN TURN TRIGGERS
// Fires after draw and resource gain, before action phase
// ADD NEW BEGIN TURN TRIGGERS HERE
// ============================================
function fireBeginTurnTriggers(state, playerIdx) {
  console.log("[Nezzar] fireBeginTurnTriggers: checking for Nezzar");
  // Reset oncePerTurn flags for the declarative trigger registry
  resetTurnTriggers(state);

  // Soul Harvest (Dark, Attuned passive): reset once-per-turn flag at the start of Malachar's turn.
  const shPlayer = state.players[playerIdx];
  if (
    FACTION_ATTRIBUTE[shPlayer.deckId] === 'dark' &&
    (shPlayer.resonance?.tier === 'attuned' || shPlayer.resonance?.tier === 'ascended')
  ) {
    state.soulHarvestUsed = false;
  }

  // Nourish (Mystic, Ascended passive): at the start of your turn, the lowest HP friendly combat unit gains +1/+1.
  const nourishPlayer = state.players[playerIdx];
  if (FACTION_ATTRIBUTE[nourishPlayer.deckId] === 'mystic' && nourishPlayer.resonance?.tier === 'ascended') {
    const combatUnits = state.units.filter(u => u.owner === playerIdx && !u.isRelic && !u.isOmen);
    if (combatUnits.length > 0) {
      const minHp = Math.min(...combatUnits.map(u => u.hp));
      const tied = combatUnits.filter(u => u.hp === minHp);
      const target = tied[Math.floor(Math.random() * tied.length)];
      target.atk += 1;
      target.hp += 1;
      target.maxHp += 1;
      addLog(state, `Sylara nourishes ${target.name}. +1/+1.`);
    }
  }

  // Mana Well omen: gain 1 temporary mana this turn
  const manaWells = state.units.filter(u => u.owner === playerIdx && u.id === 'manawell');
  for (const mw of manaWells) {
    state.players[playerIdx].resources = Math.min((state.players[playerIdx].resources || 0) + 1, 10);
    addLog(state, `Mana Well: ${state.players[playerIdx].name} gains 1 temporary mana.`);
  }

  // Terrain onTurnStart: apply to units standing on terrain tiles at the start of their owner's turn
  if (state.terrainGrid) {
    for (const unit of state.units.filter(u => u.owner === playerIdx && !u.hidden)) {
      const terrain = state.terrainGrid[unit.row]?.[unit.col];
      if (terrain?.onTurnStart?.heal != null) {
        const healed = restoreHP(unit, terrain.onTurnStart.heal, state, terrain.ownerName || 'terrain');
        if (healed > 0) addLog(state, `${terrain.ownerName || 'Terrain'}: ${unit.name} restores ${healed} HP.`);
      }
    }
  }

  // Paladin Aura: permanently increase max HP of adjacent friendly combat units by 1
  const paladins = state.units.filter(u => u.owner === playerIdx && u.id === 'paladin');
  for (const pal of paladins) {
    const adj = cardinalNeighbors(pal.row, pal.col);
    const nearby = state.units.filter(u =>
      u.owner === playerIdx &&
      u.uid !== pal.uid &&
      adj.some(([r, c]) => u.row === r && u.col === c)
    );
    for (const u of nearby) {
      const wasAtMax = u.hp === u.maxHp;
      u.maxHp += 1;
      if (wasAtMax) u.hp += 1;
    }
    if (nearby.length) addLog(state, `Paladin Aura: ${nearby.length} adjacent unit(s) gain +1 max HP.`);
  }

  // Nezzar, Terms and Conditions: at beginning of owner's turn, offer 3 random contracts
  state.units.filter(u => u.owner === playerIdx).forEach(u => console.log("[Nezzar] unit on board:", u.id, u.owner));
  const nezzars = state.units.filter(u => u.owner === playerIdx && u.id === 'nezzartermsandconditions');
  console.log("[Nezzar] nezzars found on board for playerIdx=" + playerIdx + ": " + nezzars.length);
  for (const nezzar of nezzars) {
    console.log("[Nezzar] found Nezzar on board, unit uid: " + nezzar.uid);
    const available = filterAvailableContracts(state, playerIdx, nezzar.uid);
    console.log("[Nezzar] filterAvailableContracts result: " + available.map(c => c.id).join(", ") + " (count=" + available.length + ")");
    const contracts = pickRandomContracts(available);
    console.log("[Nezzar] pickRandomContracts result: " + contracts.map(c => c.id).join(", ") + " (count=" + contracts.length + ")");
    if (contracts.length > 0) {
      state.pendingContractSelect = { contracts, nezzarUid: nezzar.uid };
      console.log("[Nezzar] pendingContractSelect set:", JSON.stringify(state.pendingContractSelect));
      addLog(state, `Nezzar offers contracts.`);
    } else {
      console.log("[Nezzar] no contracts available — pendingContractSelect NOT set");
    }
    break; // Only one Nezzar fires per turn
  }

  // War Drum relic: the friendly combat unit with the lowest ATK gains +1 ATK this turn
  const warDrums = state.units.filter(u => u.owner === playerIdx && u.id === 'wardrum');
  if (warDrums.length > 0) {
    const combatUnits = state.units.filter(u => u.owner === playerIdx && !u.isRelic && !u.isOmen);
    if (combatUnits.length > 0) {
      const minAtk = Math.min(...combatUnits.map(u => getEffectiveAtk(state, u)));
      const candidates = combatUnits.filter(u => getEffectiveAtk(state, u) === minAtk);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      chosen.turnAtkBonus = (chosen.turnAtkBonus || 0) + 1;
      addLog(state, `War Drum: ${chosen.name} gains +1 ATK this turn (${getEffectiveAtk(state, chosen)} ATK).`);
    }
  }

  // Declarative onBeginTurn triggers (e.g. Bloodmoon)
  fireTrigger('onBeginTurn', { playerIndex: playerIdx }, state);
}

// ============================================
// END TURN TRIGGERS
// Fires before passing turn to opponent
// ADD NEW END TURN TRIGGERS HERE
// ============================================
function fireEndTurnTriggers(state, playerIdx) {
  const p = state.players[playerIdx];
  const champ = state.champions[playerIdx];

  // 1. Seedling: restore 1 HP to champion
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.id === 'seedling') {
      const healed = restoreHP(champ, 1, state);
      if (healed > 0) addLog(state, `Seedling restores 1 HP to champion.`);
    }
  });

  // 1b. Echo Stone relic: restore 1 HP to champion at end of turn
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.id === 'echostone') {
      const healed = restoreHP(champ, 1, state);
      if (healed > 0) addLog(state, `Echo Stone: champion restores ${healed} HP.`);
    }
  });

  // 2. Sentinel Aura: restore 1 HP to other friendly combat units within 1 tile
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.id === 'sentinel') {
      const adj = cardinalNeighbors(u.row, u.col);
      const nearby = state.units.filter(n =>
        n.owner === playerIdx &&
        n.uid !== u.uid &&
        adj.some(([r, c]) => n.row === r && n.col === c)
      );
      for (const n of nearby) {
        const healed = restoreHP(n, 1, state);
        if (healed > 0) addLog(state, `Sentinel Aura: ${n.name} restores ${healed} HP.`);
      }
    }
  });

  // 3. Pip the Hungry: +1/+1
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.id === 'pip') {
      u.atk += 1;
      u.hp += 1;
      u.maxHp += 1;
      addLog(state, `Pip the Hungry grows! Now ${u.atk}/${u.hp}.`);
    }
  });

  // 4. Zmore: deal 1 damage to all other combat units (excludes Zmore itself)
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.id === 'zmore' && !u.hidden) {
      addLog(state, `Zmore, Sleeping Ash stirs. All other combat units take 1 damage.`);
      const allUnits = [...state.units];
      for (const t of allUnits) {
        if (t.uid === u.uid) continue; // Zmore does not damage itself
        if (state.units.find(x => x.uid === t.uid)) {
          t.hp -= 1;
          if (t.hp <= 0) {
            destroyUnit(t, state, 'zmore');
          }
        }
      }
      state.units = state.units.filter(u => u.hp > 0);
    }
  });

  // 5. Yggara, Rootmother: summon a 1/1 Sapling in each adjacent empty tile
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.id === 'yggara') {
      const adj = cardinalNeighbors(u.row, u.col).filter(([r, c]) =>
        !state.units.some(x => x.row === r && x.col === c) &&
        !state.champions.some(ch => ch.row === r && ch.col === c)
      );
      for (const [r, c] of adj) {
        state.units.push({
          id: 'sapling', name: 'Sapling', type: 'unit', atk: 1, hp: 1, maxHp: 1, spd: 1,
          unitType: ['Plant'],
          rules: 'When this unit is destroyed restore 1 HP to your champion.', image: 'sapling-token.webp',
          token: true, owner: playerIdx, row: r, col: c,
          summoned: true, moved: false, atkBonus: 0, shield: 0, speedBonus: 0, hidden: false,
          turnAtkBonus: 0,
          uid: `sapling_${Math.random().toString(36).slice(2)}`,
        });
      }
      if (adj.length) addLog(state, `Yggara, Rootmother: summoned ${adj.length} Sapling(s).`);
    }
  });

  // 6. Throne damage: deal 2 damage to opponent champion (cannot reduce below 1 HP)
  if (champ.row === 2 && champ.col === 2) {
    const oppIdx = 1 - playerIdx;
    const maxDamage = Math.max(0, state.champions[oppIdx].hp - 1);
    const actualDamage = Math.min(2, maxDamage);
    if (actualDamage > 0) {
      state.champions[oppIdx].hp -= actualDamage;
      addLog(state, `${p.name}'s champion controls the Throne! ${state.players[oppIdx].name}'s champion takes ${actualDamage} damage.`);
    } else {
      addLog(state, `${p.name}'s champion controls the Throne, but the enemy champion is protected at 1 HP.`);
    }
    checkWinner(state);
  }

  // 7. Omen countdown: decrement turnsRemaining for each revealed omen the active player controls.
  //    Hidden omens (e.g. Dread Mirror) do not tick until revealed.
  //    Destroy omens that reach 0 (fires death triggers so any on-death effects resolve).
  const omensToTick = state.units.filter(u => u.owner === playerIdx && u.isOmen && !u.hidden);
  for (const omen of omensToTick) {
    omen.turnsRemaining -= 1;
    addLog(state, `${omen.name}: ${omen.turnsRemaining} turn(s) remaining.`);
    if (omen.turnsRemaining <= 0) {
      addLog(state, `${omen.name} expires.`);
      destroyUnit(omen, state, 'omen_expired');
    }
  }

  // Declarative trigger registry: fire onEndTurn for cards with end-turn listeners
  fireTrigger('onEndTurn', { playerIndex: playerIdx }, state);

  // Lucern, Unbroken Vow: resummon at end of owner's turn if scheduled
  if (state.lucernPendingResummon?.[playerIdx]) {
    const data = state.lucernPendingResummon[playerIdx];
    const startTile = state.championStartTile?.[playerIdx];
    const baseCard = CARD_DB['lucernunbrokenvow'];
    if (baseCard && startTile) {
      const candidates = [
        [startTile.r, startTile.c],
        ...cardinalNeighbors(startTile.r, startTile.c),
      ];
      let placed = false;
      for (const [tr, tc] of candidates) {
        if (tr < 0 || tr > 4 || tc < 0 || tc > 4) continue;
        const occupied =
          state.units.some(u => u.row === tr && u.col === tc) ||
          state.champions.some(ch => ch.row === tr && ch.col === tc);
        if (!occupied) {
          const resummoned = {
            ...baseCard,
            atk: data.atk,
            atkBonus: data.atkBonus,
            hp: data.maxHp,
            maxHp: data.maxHp,
            owner: playerIdx,
            row: tr,
            col: tc,
            summoned: true,
            moved: false,
            shield: 0,
            speedBonus: 0,
            turnAtkBonus: 0,
            hidden: false,
            uid: `lucernunbrokenvow_${Math.random().toString(36).slice(2)}`,
          };
          state.units.push(resummoned);
          registerUnit(resummoned, state);
          registerModifiers(resummoned, state);
          addLog(state, `Lucern, Unbroken Vow rises again at (${tr},${tc})!`);
          placed = true;
          break;
        }
      }
      if (!placed) {
        addLog(state, `Lucern, Unbroken Vow could not rise — no open tiles near champion start position.`);
      }
    }
    state.lucernPendingResummon[playerIdx] = null;
  }

  // Final Gambit: player loses at end of turn if the flag is set
  if (state.finalGambitActive?.[playerIdx] && !state.winner) {
    const loser = state.players[playerIdx];
    const winner = state.players[1 - playerIdx];
    state.finalGambitActive[playerIdx] = false;
    addLog(state, `Final Gambit: ${loser.name} has sealed their fate!`);
    state.winner = winner.name;
    addLog(state, `Game over! ${winner.name} wins!`);
  }
}

// ============================================
// ATTACK TRIGGERS
// Fires when a unit initiates combat movement
// killedDefender is true if the defender was destroyed in this combat
// ADD NEW ATTACK TRIGGERS HERE
// ============================================
export function fireAttackTriggers(attacker, defender, state, killedDefender) {
  const defenderIsChampion = !defender.uid;
  // Find live attacker (may have died in combat)
  const liveAttacker = state.units.find(u => u.uid === attacker.uid);

  // 1. Whisper: restore 2 HP to controlling champion
  if (liveAttacker && liveAttacker.id === 'whisper') {
    const champ = state.champions[liveAttacker.owner];
    const healed = restoreHP(champ, 2, state);
    addLog(state, `Whisper: champion restores ${healed} HP.`);
  }

  // 2. Crossbowman: draw 1 card on kill
  if (attacker.id === 'crossbowman' && killedDefender && !defenderIsChampion) {
    const unitPlayer = state.players[attacker.owner];
    const drawn = drawCard(state, attacker.owner);
    if (drawn) {
      unitPlayer.hand.push(drawn);
      addLog(state, `Crossbowman: drew ${drawn.name}.`, attacker.owner);
    }
  }

  // 3. Dread Knight: if defender is champion, opponent discards random card
  if (liveAttacker && liveAttacker.id === 'dreadknight' && defenderIsChampion) {
    const oppPlayer = state.players[defender.owner];
    if (oppPlayer.hand.length > 0) {
      const randIdx = Math.floor(Math.random() * oppPlayer.hand.length);
      const [discarded] = oppPlayer.hand.splice(randIdx, 1);
      oppPlayer.discard.push(discarded);
      addLog(state, `Dread Knight: ${state.players[defender.owner].name} discards ${discarded.name} at random.`);
    }
  }

  // 4. Razorfang: reset action on kill
  if (liveAttacker && liveAttacker.id === 'razorfang' && killedDefender && !liveAttacker.razorfangResetUsed) {
    liveAttacker.moved = false;
    liveAttacker.razorfangResetUsed = true;
    addLog(state, `Razorfang, Alpha: action reset!`);
  }

  // 5. (Hunger removed — replaced by Bloodlust passive in fireDeathTriggers)

  // Declarative trigger registry: fire onChampionDamageDealt when a unit attacks the enemy champion
  if (defenderIsChampion) {
    const liveAtt = state.units.find(u => u.uid === attacker.uid);
    if (liveAtt) {
      fireTrigger('onChampionDamageDealt', {
        attackerPlayerIndex: attacker.owner,
        damage: liveAtt.atk || 0,
        triggeringUid: attacker.uid,
      }, state);
    }
  }
}

// ============================================
// ON SUMMON TRIGGERS
// Fires when a unit enters the board
// ADD NEW SUMMON TRIGGERS HERE
// ============================================
export function fireOnSummonTriggers(unit, state) {
  const p = state.players[unit.owner];

  // 1. Elf Elder: restore 2 HP to controlling champion
  if (unit.id === 'elfelder') {
    const champ = state.champions[unit.owner];
    const healed = restoreHP(champ, 2, state);
    addLog(state, `Elf Elder: champion restores ${healed} HP.`);
  }

  // 2. Chaos Spawn: draw first, then prompt discard
  if (unit.id === 'chaospawn') {
    // Draw first
    const drawn = drawCard(state, unit.owner);
    if (drawn) {
      p.hand.push(drawn);
      addLog(state, `Chaos Spawn: drew ${drawn.name}.`, unit.owner);
    }
    // Then handle discard
    if (p.hand.length > 1) {
      state.pendingHandSelect = { reason: 'chaospawn', cardUid: unit.uid, data: {} };
    } else if (p.hand.length === 1) {
      const [discarded] = p.hand.splice(0, 1);
      p.discard.push(discarded);
      addLog(state, `Chaos Spawn: ${discarded.name} discarded.`);
      fireTrigger('onCardDiscarded', { playerIndex: unit.owner, discardedCard: discarded }, state);
    }
    // If hand is empty after drawing, skip discard
  }

  // 3. Flesh Tithe: prompt optional sacrifice (combat units only)
  if (unit.id === 'fleshtithe') {
    const friendlyCombatUnits = state.units.filter(u => u.owner === unit.owner && u.uid !== unit.uid && !u.isRelic && !u.isOmen);
    if (friendlyCombatUnits.length > 0) {
      state.pendingFleshtitheSacrifice = { unitUid: unit.uid };
    } else {
      addLog(state, `Flesh Tithe: enters as 3/3 (no units to sacrifice).`);
    }
  }

  // 4. Void Walker: deal 1 damage to controlling champion (not yet implemented)

  // 4b. Waddles: activate damage reduction for owner's champion
  if (unit.id === 'waddles') {
    state.waddlesActive[unit.owner] = true;
    addLog(state, `Waddles, Trusted Aide: champion damage reduction active.`);
  }

  // 5. Battle Priest: prompt adjacent enemy (step 0) then adjacent friendly (step 1)
  if (unit.id === 'battlepriestunit') {
    const adj = cardinalNeighbors(unit.row, unit.col);
    const hasEnemies = state.units.some(u => u.owner !== unit.owner && !u.hidden && adj.some(([r, c]) => u.row === r && u.col === c));
    const hasFriendlies = state.units.some(u => u.owner === unit.owner && u.uid !== unit.uid && adj.some(([r, c]) => u.row === r && u.col === c));
    if (hasEnemies) {
      state.pendingSpell = { cardUid: unit.uid, effect: 'battlepriestunit_summon', playerIdx: unit.owner, step: 0, data: { sourceUid: unit.uid, paid: true } };
    } else if (hasFriendlies) {
      state.pendingSpell = { cardUid: unit.uid, effect: 'battlepriestunit_summon', playerIdx: unit.owner, step: 1, data: { sourceUid: unit.uid, enemyUid: null, paid: true } };
    }
  }

  // 6. Wildborne summon: apply HP aura to Beast units already in range,
  //    and apply aura to Wildborne itself if a Wildborne is already on the board
  if (unitTypes(unit).includes('Beast')) {
    const wb = state.units.find(u => u.id === 'wildborne' && u.owner === unit.owner && u.uid !== unit.uid);
    if (wb && manhattan([wb.row, wb.col], [unit.row, unit.col]) <= wb.aura.range) {
      applyWildbornAura(unit, state);
    }
  }
  if (unit.id === 'wildborne') {
    for (const beast of state.units.filter(u => u.owner === unit.owner && u.uid !== unit.uid && unitTypes(u).includes('Beast') && !u.hidden)) {
      if (manhattan([unit.row, unit.col], [beast.row, beast.col]) <= unit.aura.range) {
        applyWildbornAura(beast, state);
      }
    }
  }

  // 7. Standard Bearer summon: apply HP aura to friendly units already in range,
  //    and apply HP bonus to this unit if a Standard Bearer is already on the board
  const existingSb = state.units.find(u => u.id === 'standardbearer' && u.owner === unit.owner && u.uid !== unit.uid);
  if (existingSb && manhattan([existingSb.row, existingSb.col], [unit.row, unit.col]) <= existingSb.aura.range) {
    applyStandardBearerAura(unit, state);
  }
  if (unit.id === 'standardbearer') {
    for (const friendly of state.units.filter(u => u.owner === unit.owner && u.uid !== unit.uid && !u.hidden)) {
      if (manhattan([unit.row, unit.col], [friendly.row, friendly.col]) <= unit.aura.range) {
        applyStandardBearerAura(friendly, state);
      }
    }
  }

  // 8. Battle Standard omen: buff adjacent friendly combat units +1/+1 when summoned
  if (unit.id === 'battlestandard') {
    const adj = cardinalNeighbors(unit.row, unit.col);
    const nearby = state.units.filter(u =>
      u.owner === unit.owner && !u.isOmen && !u.isRelic &&
      adj.some(([r, c]) => u.row === r && u.col === c)
    );
    for (const u of nearby) {
      u.atk += 1;
      u.hp += 1;
      u.maxHp += 1;
      addLog(state, `Battle Standard: ${u.name} gains +1/+1.`);
    }
  }

  // 8b. Friendly combat unit summoned adjacent to a Battle Standard omen — gains +1/+1
  if (!unit.isOmen && !unit.isRelic && unit.type !== 'spell') {
    const adj = cardinalNeighbors(unit.row, unit.col);
    const nearbyStandards = state.units.filter(u =>
      u.owner === unit.owner && u.id === 'battlestandard' && u.uid !== unit.uid &&
      adj.some(([r, c]) => u.row === r && u.col === c)
    );
    for (const _bs of nearbyStandards) {
      unit.atk += 1;
      unit.hp += 1;
      unit.maxHp += 1;
      addLog(state, `Battle Standard: ${unit.name} gains +1/+1.`);
    }
  }

  // 9. Smoke Bomb omen on summon: hide all friendly combat units within 2 tiles
  if (unit.id === 'smokebomb') {
    const nearby = state.units.filter(u =>
      u.owner === unit.owner && !u.isOmen && !u.isRelic &&
      manhattan([unit.row, unit.col], [u.row, u.col]) <= 2
    );
    for (const u of nearby) {
      if (!u.hidden) {
        u.hidden = true;
        addLog(state, `Smoke Bomb: ${u.name} becomes hidden.`);
      }
    }
  }

  // 9b. Friendly combat unit summoned within 2 tiles of a Smoke Bomb omen — gains Hidden
  if (!unit.isOmen && !unit.isRelic && unit.type !== 'spell') {
    const nearbySmoke = state.units.filter(u =>
      u.owner === unit.owner && u.id === 'smokebomb' && u.uid !== unit.uid &&
      manhattan([u.row, u.col], [unit.row, unit.col]) <= 2
    );
    if (nearbySmoke.length > 0 && !unit.hidden) {
      unit.hidden = true;
      addLog(state, `Smoke Bomb: ${unit.name} enters hidden.`);
    }
  }

  // 10. Friendly combat unit summoned adjacent to a Feral Surge omen — gains Rush
  if (!unit.isOmen && !unit.isRelic && unit.type !== 'spell') {
    const adj = cardinalNeighbors(unit.row, unit.col);
    const nearbyFeralSurge = state.units.filter(u =>
      u.owner === unit.owner && u.id === 'feralsurge' && u.uid !== unit.uid &&
      adj.some(([r, c]) => u.row === r && u.col === c)
    );
    if (nearbyFeralSurge.length > 0 && unit.summoned) {
      unit.summoned = false;
      addLog(state, `Feral Surge: ${unit.name} gains Rush!`);
    }
  }

  // 11. Sylvan Courier: draw 1 card when summoned
  if (unit.id === 'sylvancourier') {
    const drawn = drawCard(state, unit.owner);
    if (drawn) {
      p.hand.push(drawn);
      addLog(state, `Sylvan Courier delivers a message. Draw 1 card.`);
    } else {
      addLog(state, `Sylvan Courier delivers a message — deck empty.`);
    }
  }

  // 12. Canopy Sentinel: summon a Sapling in a random adjacent empty tile
  if (unit.id === 'canopysentinel') {
    const adj = cardinalNeighbors(unit.row, unit.col).filter(([r, c]) =>
      !state.units.some(u => u.row === r && u.col === c) &&
      !state.champions.some(ch => ch.row === r && ch.col === c)
    );
    if (adj.length > 0) {
      const [tr, tc] = adj[Math.floor(Math.random() * adj.length)];
      const sapling = {
        ...TOKENS.sapling,
        owner: unit.owner,
        row: tr,
        col: tc,
        maxHp: TOKENS.sapling.hp,
        summoned: true,
        moved: false,
        atkBonus: 0,
        shield: 0,
        speedBonus: 0,
        turnAtkBonus: 0,
        hidden: false,
        uid: `token_sapling_${Math.random().toString(36).slice(2)}`,
      };
      state.units.push(sapling);
      registerUnit(sapling, state);
      addLog(state, `Canopy Sentinel summons a Sapling.`);
    } else {
      addLog(state, `Canopy Sentinel: no adjacent tiles for a Sapling.`);
    }
  }

  // 13. Lifebinder: prompt player to select a friendly combat unit to restore to full health
  if (unit.id === 'lifebinder') {
    const friendlyCombatUnits = state.units.filter(u => u.owner === unit.owner && u.uid !== unit.uid && !u.isRelic && !u.isOmen);
    if (friendlyCombatUnits.length > 0) {
      state.pendingSpell = { cardUid: unit.uid, effect: 'lifebinder_summon', playerIdx: unit.owner, step: 0, data: { sourceUid: unit.uid, paid: true } };
    } else {
      addLog(state, `Lifebinder: no friendly combat units to restore.`);
    }
  }

  // 14. Wardlight Colossus: log aura shield activation on summon.
  if (unit.id === 'wardlightcolossus') {
    addLog(state, `Wardlight Colossus shields nearby allies from spells.`);
  }

  // 15. Peacekeeper: stun adjacent enemy combat units for their next turn.
  if (unit.id === 'peacekeeper') {
    const adj = cardinalNeighbors(unit.row, unit.col);
    const targets = state.units.filter(u =>
      u.owner !== unit.owner && !u.isRelic && !u.isOmen && !u.hidden &&
      adj.some(([r, c]) => u.row === r && u.col === c)
    );
    for (const t of targets) {
      t.skipNextAction = true;
      addLog(state, `Peacekeeper stuns ${t.name}.`);
    }
  }

  // 16. Chains of Light omen: prompt the player to select an enemy combat unit to stun.
  if (unit.id === 'chainsoflight') {
    const hasEnemies = state.units.some(u => u.owner !== unit.owner && !u.hidden && !u.isOmen && !u.isRelic);
    if (hasEnemies) {
      state.pendingSpell = {
        cardUid: unit.uid,
        effect: 'chainsoflight_summon',
        playerIdx: unit.owner,
        step: 0,
        data: { omenUid: unit.uid, paid: true },
      };
    } else {
      addLog(state, `Chains of Light: no valid enemy targets to stun.`);
    }
  }
}

// ── initializer ────────────────────────────────────────────────────────────

function computeResonance(deckId, cards) {
  let attr = FACTION_ATTRIBUTE[deckId] ?? 'light';
  if (deckId === 'custom') {
    const saved = JSON.parse(localStorage.getItem('gridholm_custom_deck') || 'null');
    if (saved?.primaryAttr) attr = saved.primaryAttr;
  }
  const score = calculateResonance(cards, attr);
  const tier = score >= RESONANCE_THRESHOLDS.ascended ? 'ascended'
    : score >= RESONANCE_THRESHOLDS.attuned ? 'attuned'
    : 'none';
  return { score, tier };
}

export function createInitialState(p1DeckId = 'human', p2DeckId = 'human') {
  const p1Deck = shuffle(buildDeck(p1DeckId));
  const p2Deck = shuffle(buildDeck(p2DeckId));

  const p1Resonance = computeResonance(p1DeckId, [...p1Deck]);
  const p2Resonance = computeResonance(p2DeckId, [...p2Deck]);

  const p1Hand = p1Deck.splice(0, 4);
  const p2Hand = p2Deck.splice(0, 4);

  const firstPlayer = Math.random() < 0.5 ? 0 : 1;
  const firstPlayerLabel = firstPlayer === 0 ? 'Player 1' : 'Player 2';

  // Build opening log line — include champion and deck name for custom decks.
  let openingLog;
  if (p1DeckId === 'custom') {
    const savedDeck = (() => {
      try { return JSON.parse(localStorage.getItem('gridholm_custom_deck') || 'null'); }
      catch { return null; }
    })();
    if (savedDeck?.champion) {
      const champName = CHAMPIONS[savedDeck.champion]?.name ?? savedDeck.champion;
      const deckName = savedDeck.deckName ?? 'Custom Deck';
      openingLog = `${champName} \u2014 ${deckName}. Coin flip: ${firstPlayerLabel} goes first. Both players start with 4 cards. ${firstPlayerLabel} skips draw on turn 1.`;
    }
  }
  if (!openingLog) {
    openingLog = `Game started. Coin flip: ${firstPlayerLabel} goes first. Both players start with 4 cards. ${firstPlayerLabel} skips draw on turn 1.`;
  }

  return {
    turn: 1,
    activePlayer: firstPlayer,
    firstPlayer,
    phase: 'begin-turn',
    phaseStep: 0,
    winner: null,
    pendingDiscard: false,
    players: [
      { id: 0, name: 'Player 1', resources: 0, maxResourcesThisTurn: 0, turnCount: 0, hand: p1Hand, deck: p1Deck, discard: [], grave: [], hpRestoredThisTurn: 0, resonance: p1Resonance, deckId: p1DeckId, commandsUsed: 0 },
      { id: 1, name: 'AI',       resources: 0, maxResourcesThisTurn: 0, turnCount: 0, hand: p2Hand, deck: p2Deck, discard: [], grave: [], hpRestoredThisTurn: 0, resonance: p2Resonance, deckId: p2DeckId, commandsUsed: 0 },
    ],
    champions: [
      { owner: 0, row: 0, col: 0, hp: 20, maxHp: 20, moved: false, attribute: FACTION_ATTRIBUTE[p1DeckId] ?? 'light' },
      { owner: 1, row: 4, col: 4, hp: 20, maxHp: 20, moved: false, attribute: FACTION_ATTRIBUTE[p2DeckId] ?? 'light' },
    ],
    units: [],
    log: [openingLog],
    pendingSpell: null,   // { cardUid, effect, playerIdx, step, data }
    pendingHandSelect: null, // { reason, cardUid, data } — when spell needs hand card selection
    pendingGraveSelect: null, // { reason, playerIdx, data } — when spell prompts player to select from grave
    pendingFleshtitheSacrifice: null, // { unitUid } — Flesh Tithe confirm
    pendingTerrainCast: null, // { cardUid, card } — waiting for terrain tile target
    pendingDirectionSelect: null, // { unitUid } — Vorn: waiting for player to click a cardinal adjacent tile
    pendingRelicPlace: null,  // { effect, playerIdx } — waiting for tile to place a relic (e.g. Amethyst Cache)
    pendingNegationCancel: null, // { crystalUid, playerIndex, pendingUnitUid, pendingTargets } — Negation Crystal prompt
    pendingDeckPeek: null, // { unitUid, cards } — Arcane Lens: player picks one of top N cards to keep on top
    pendingContractSelect: null, // { contracts, nezzarUid } — Nezzar contract choice at turn start
    pendingBloodPact: null, // { step: 'selectFriendly'|'selectEnemy', nezzarUid, sacrificedUid? }
    pendingChampionSaplingPlace: null, // { playerIdx, validTiles: [[r,c],...] } — Sapling Summon tile pick
    finalGambitActive: [false, false], // true when Final Gambit was chosen; player loses at end of their turn
    terrainGrid: Array.from({ length: 5 }, () => Array(5).fill(null)), // 5x5 terrain effect layer
    archerShot: [],
    recalledThisTurn: [],
    graveAccessActive: [false, false],
    waddlesActive: [false, false],
    championAbilityUsed: [false, false],
    triggerListeners: createTriggerListeners(),
    activeModifiers: [],
    championStartTile: [null, null],    // { r, c } snapshot at turn start, per player
    lucernPendingResummon: [null, null], // { atk, atkBonus, maxHp } when Lucern dies on Throne
    championStunned: [false, false],    // true when champion is stunned next turn (Kragor's Behemoth)
    deckEmpty: [false, false],          // true when a player's deck has reached 0 cards (fatigue active)
  };
}

// ── log helper ─────────────────────────────────────────────────────────────

export function addLog(state, msg, privateFor = null) {
  const entry = (typeof msg === 'object' && msg !== null && 'text' in msg)
    ? msg
    : { text: msg, privateFor };
  state.log = [...state.log, entry];
}

// ── fatigue / draw helper ───────────────────────────────────────────────────
// Central draw function. Draws one card for playerIndex.
// If the deck empties after a successful draw, sets the deckEmpty flag and logs it.
// If the deck is already empty (failed draw), applies champion weakening: -1 max HP.
// Returns the drawn card, or null on a failed draw.
export function drawCard(state, playerIndex) {
  const p = state.players[playerIndex];
  const drawn = p.deck.shift() || null;

  if (!state.deckEmpty) state.deckEmpty = [false, false];

  if (drawn) {
    // Successful draw — check if deck just ran out
    if (p.deck.length === 0 && !state.deckEmpty[playerIndex]) {
      state.deckEmpty[playerIndex] = true;
      addLog(state, `Deck empty. Opponent units gain +1 SPD.`);
    }
  } else {
    // Failed draw — deck was already empty; ensure flag is set
    if (!state.deckEmpty[playerIndex]) {
      state.deckEmpty[playerIndex] = true;
      addLog(state, `Deck empty. Opponent units gain +1 SPD.`);
    }
    // Weaken the champion: permanent max HP reduction
    const champ = state.champions[playerIndex];
    champ.maxHp = Math.max(0, champ.maxHp - 1);
    if (champ.hp > champ.maxHp) champ.hp = champ.maxHp;
    const champName = CHAMPIONS[champ.attribute]?.name ?? 'Champion';
    addLog(state, `${champName} weakens. Max HP reduced to ${champ.maxHp}.`);
    checkWinner(state);
  }

  return drawn;
}

// ── spell dispatch ─────────────────────────────────────────────────────────
// Single dispatch point for all spell effects. Looks up the resolver in
// SPELL_REGISTRY and delegates. Returns updated state.
function _dispatchSpell(state, caster, spellId, targets, options = {}) {
  const resolver = SPELL_REGISTRY[spellId];
  if (!resolver) {
    console.error(`No resolver found for spell: ${spellId}`);
    return state;
  }
  return resolver(state, caster, targets, options);
}

// ── action dispatch ────────────────────────────────────────────────────────
// Single dispatch point for all unit action abilities. Delegates to
// dispatchAction in actionRegistry.js which fires onEnemyAction before
// resolving, enabling reactive triggers like Negation Crystal.
function _dispatchAction(unit, state, targets) {
  return _actionDispatch(unit, state, targets);
}

// ── HIDDEN UNIT RULES ──────────────────────────────────────────────────────

function revealUnit(state, unit, excludeUnit = null, revealTile = null) {
  unit.hidden = false;
  addLog(state, `${unit.name} revealed!`);
  // On-reveal effects
  if (unit.id === 'shadowtrap') {
    // On reveal: destroy the enemy unit that revealed this unit (handled at call site)
  }
  if (unit.id === 'veilfiend') {
    // On reveal: deal 2 damage to all adjacent enemy units.
    // revealTile defaults to unit's current position.
    // excludeUnit is the direct combat opponent (already taking combat damage, skip splash).
    const [rRow, rCol] = revealTile ?? [unit.row, unit.col];
    const adj = cardinalNeighbors(rRow, rCol);
    const targets = state.units.filter(u =>
      u.owner !== unit.owner &&
      adj.some(([r, c]) => u.row === r && u.col === c) &&
      (!excludeUnit || u.uid !== excludeUnit.uid)
    );
    for (const t of targets) {
      applyDamageToUnit(state, t, 2, unit.name);
    }
    if (targets.length) addLog(state, `Veil Fiend reveal: ${targets.length} adjacent enemies hit for 2 damage.`);
  }
  if (unit.id === 'dreadshade') {
    // On reveal: gains +2 ATK this turn
    unit.turnAtkBonus = (unit.turnAtkBonus || 0) + 2;
    addLog(state, `Dread Shade reveal: +2 ATK this turn.`);
  }
  if (unit.id === 'dreadmirror') {
    // Register passive: restore 1 HP to champion whenever an enemy unit dies
    registerDynamicTrigger(unit.uid, { event: 'onEnemyUnitDeath', effect: 'restoreOneHPToChampion' }, state);
  }
  if (unit.id === 'curseflayer') {
    // On reveal: place Cursed Ground on the tile this unit was revealed on
    if (!state.terrainGrid) state.terrainGrid = Array.from({ length: 5 }, () => Array(5).fill(null));
    state.terrainGrid[unit.row][unit.col] = {
      id: 'cursed',
      whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'dark', combatOnly: true },
      ownerName: 'Cursed Ground',
      cardId: 'cursed_ground',
    };
    addLog(state, `Curse Flayer reveal: Cursed Ground placed at (${unit.row},${unit.col}).`);
  }
  if (unit.id === 'gravecaller') {
    // On reveal: return a random combat unit from owner's grave to hand
    const owner = unit.owner;
    const combatGrave = state.players[owner].grave.filter(u => !u.token && (u.type === 'unit'));
    if (combatGrave.length > 0) {
      const chosen = combatGrave[Math.floor(Math.random() * combatGrave.length)];
      state.players[owner].hand.push(chosen);
      addLog(state, `Gravecaller reveal: ${chosen.name} returned to hand.`);
    }
  }
  if (unit.id === 'gravefedhorror') {
    // On reveal: gain +1/+1 for each combat unit in owner's grave
    const owner = unit.owner;
    const combatGrave = state.players[owner].grave.filter(g => {
      const db = CARD_DB[g.id];
      return db && db.type === 'unit' && !db.isRelic && !db.isOmen;
    });
    const count = combatGrave.length;
    if (count > 0) {
      unit.atk += count;
      unit.hp += count;
      unit.maxHp += count;
      addLog(state, `Gravefed Horror reveals. Feeds on ${count} fallen unit${count !== 1 ? 's' : ''}. +${count}/+${count}.`);
    } else {
      addLog(state, `Gravefed Horror reveals. No fallen units to feed on.`);
    }
  }
}

export function playerRevealUnit(state, unitUid) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit || !unit.hidden || unit.owner !== s.activePlayer) return s;
  revealUnit(s, unit);
  unit.moved = true;
  return s;
}

// Consolidated Dread Mirror reveal handler. Called whenever a unit or champion
// moves onto a hidden Dread Mirror. Reveals the omen, deals ATK damage back to
// the revealer, and either destroys the omen (revealer survived) or leaves it
// on the board revealed (revealer died). Returns 'revealer_died' or 'omen_destroyed'.
function handleDreadMirrorReveal(state, revealedOmen, revealingUnit, isChampion) {
  // Step 1: Reveal the omen (clears hidden flag, registers passive trigger)
  revealUnit(state, revealedOmen);

  // Step 2: Damage = revealer's own ATK
  const revealerAtk = isChampion
    ? getChampionAtkBuff(state, revealingUnit)
    : getEffectiveAtk(state, revealingUnit);

  if (revealerAtk > 0) {
    addLog(state, `Dread Mirror reflects ${revealerAtk} damage.`);
    if (isChampion) {
      revealingUnit.hp -= revealerAtk;
    } else {
      applyDamageToUnit(state, revealingUnit, revealerAtk, 'Dread Mirror');
    }
  } else {
    addLog(state, `Dread Mirror revealed. ${isChampion ? state.players[revealingUnit.owner].name + "'s champion" : revealingUnit.name} takes 0 damage.`);
  }

  // Step 3: Check if revealer died
  const revealerDied = isChampion
    ? revealingUnit.hp <= 0
    : !state.units.find(u => u.uid === revealingUnit.uid);

  if (revealerDied) {
    // Omen stays on the board, revealed, passive active, timer ticking from reveal
    return 'revealer_died';
  }

  // Revealer survived — destroy the omen, revealer advances to tile
  const liveOmen = state.units.find(u => u.uid === revealedOmen.uid);
  if (liveOmen) destroyUnit(liveOmen, state, 'omen_removed');
  return 'omen_destroyed';
}

// ── phase auto-advance ─────────────────────────────────────────────────────

export function autoAdvancePhase(state) {
  const s = cloneState(state);
  if (s.phase === 'begin-turn') return doBeginTurnPhase(s);
  return s;
}

function doBeginTurnPhase(state) {
  const p = state.players[state.activePlayer];

  // Draw
  let drawnCard = null;
  const skipDraw = state.turn === 1 && state.activePlayer === state.firstPlayer;
  if (!skipDraw) {
    drawnCard = drawCard(state, state.activePlayer);
    if (drawnCard) p.hand.push(drawnCard);
  }

  // Gain resources
  p.turnCount = (p.turnCount || 0) + 1;
  const bonus = state.activePlayer !== state.firstPlayer ? 1 : 0;
  p.resources = Math.min(p.turnCount + bonus, 10);
  p.maxResourcesThisTurn = p.resources;

  const publicDrawPart = skipDraw
    ? 'Skipped draw (turn 1 rule).'
    : drawnCard
      ? 'Draws a card.'
      : 'No cards left to draw.';
  addLog(state, `${p.name} begins turn ${p.turnCount}. ${publicDrawPart} Mana: ${p.resources}/10.`);
  if (!skipDraw && drawnCard) {
    addLog(state, `Drew ${drawnCard.name}.`, state.activePlayer);
  }

  // Reset hpRestoredThisTurn
  p.hpRestoredThisTurn = 0;

  // Reset commands for new turn
  p.commandsUsed = 0;

  // Reset Bloodlust trigger counter (temp mana already wiped by the resources reset above)
  if (!state.bloodlustTriggered) state.bloodlustTriggered = [0, 0];
  state.bloodlustTriggered[state.activePlayer] = 0;

  // Clear summoning sickness and per-turn bonuses for active player
  // Must run before begin-turn triggers so that units summoned by triggers retain their summoning sickness this turn.
  state.units.forEach(u => {
    if (u.owner === state.activePlayer) {
      u.summoned = false;
      u.moved = false;
      u.speedBonus = 0;
      u.turnAtkBonus = 0;
      u.extraActionsRemaining = 0;
      // Clear razorfang reset used flag
      if (u.id === 'razorfang') u.razorfangResetUsed = false;
      // Reset Iron Queen's per-turn action counter
      if (u.id === 'ironqueen') u.ironQueenActionsUsed = 0;
    }
  });

  // Track champion position at turn start (used by Lucern resummon)
  const _startChamp = state.champions[state.activePlayer];
  if (!state.championStartTile) state.championStartTile = [null, null];
  state.championStartTile[state.activePlayer] = { r: _startChamp.row, c: _startChamp.col };

  // BEGIN TURN TRIGGERS
  fireBeginTurnTriggers(state, state.activePlayer);

  // Reset champion moved state
  state.champions[state.activePlayer].moved = false;

  // Apply skipNextAction: lock units and champion that were marked last turn
  // Also lock stunned units (Chains of Light) for the duration of the omen.
  state.units.forEach(u => {
    if (u.owner === state.activePlayer && u.skipNextAction) {
      u.moved = true;
      u.skipNextAction = false;
    }
    if (u.owner === state.activePlayer && state.activeModifiers?.some(m => m.type === 'stunTarget' && m.targetUid === u.uid)) {
      u.moved = true;
    }
  });
  if (state.champions[state.activePlayer].skipNextAction) {
    state.champions[state.activePlayer].moved = true;
    state.champions[state.activePlayer].skipNextAction = false;
  }
  // Apply Kragor's Behemoth champion stun: champion cannot move or use abilities this turn.
  if (state.championStunned?.[state.activePlayer]) {
    state.champions[state.activePlayer].moved = true;
  }

  // Clear recalled-this-turn
  state.recalledThisTurn = [];

  state.phase = 'action';
  return state;
}

// ── champion move ──────────────────────────────────────────────────────────

export function getChampionMoveTiles(state) {
  const champ = state.champions[state.activePlayer];
  if (champ.moved) return [];
  const champAtk = getChampionAtkBuff(state, champ);
  const spdBuff = getChampionSpdBuff(state, champ);
  const speed = 1 + (spdBuff > 0 ? 1 : 0);

  if (speed === 1) {
    return cardinalNeighbors(champ.row, champ.col)
      .filter(([r, c]) => {
        if (isTileOccupied(state, r, c)) {
          // Allow enemy unit tiles only when champion has ATK > 0
          const enemyUnit = state.units.find(u => u.owner !== state.activePlayer && u.row === r && u.col === c);
          if (enemyUnit) return champAtk > 0;
          // Allow opposing champion tile only when champion has ATK > 0
          const enemyChamp = state.champions.find(ch => ch.owner !== state.activePlayer && ch.row === r && ch.col === c);
          if (enemyChamp) return champAtk > 0;
          return false;
        }
        return true;
      });
  }

  // Speed 2 champion: BFS up to 2 tiles, blocked by friendly units
  const visited = new Set();
  const frontier = [[champ.row, champ.col, speed]];
  const result = [];
  visited.add(`${champ.row},${champ.col}`);
  while (frontier.length) {
    const [r, c, remaining] = frontier.shift();
    for (const [nr, nc] of cardinalNeighbors(r, c)) {
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const friendlyUnit = state.units.find(u => u.owner === state.activePlayer && u.row === nr && u.col === nc);
      const friendlyChamp = state.champions.find(ch => ch.owner === state.activePlayer && ch.row === nr && ch.col === nc);
      if (friendlyUnit || friendlyChamp) continue;
      const enemyUnit = state.units.find(u => u.owner !== state.activePlayer && u.row === nr && u.col === nc);
      const enemyChamp = state.champions.find(ch => ch.owner !== state.activePlayer && ch.row === nr && ch.col === nc);
      if (enemyUnit) {
        if (champAtk > 0) result.push([nr, nc]);
        continue; // cannot pass through enemy units
      }
      if (enemyChamp) {
        if (champAtk > 0) result.push([nr, nc]);
        continue; // cannot pass through enemy champion
      }
      result.push([nr, nc]);
      if (remaining > 1) frontier.push([nr, nc, remaining - 1]);
    }
  }
  return result;
}

export function moveChampion(state, row, col) {
  const s = cloneState(state);
  const champ = s.champions[s.activePlayer];

  // Check for enemy omen on destination tile — champion destroys it and advances, same as moveUnit.
  const enemyOmen = s.units.find(u => u.owner !== s.activePlayer && u.isOmen && u.row === row && u.col === col);
  if (enemyOmen) {
    if (enemyOmen.id === 'dreadmirror' && enemyOmen.hidden) {
      const result = handleDreadMirrorReveal(s, enemyOmen, champ, true);
      checkWinner(s);
      if (result === 'revealer_died') return s; // champion died — omen stays revealed
    } else {
      addLog(s, `${s.players[s.activePlayer].name}'s champion moves through ${enemyOmen.name}! The omen is destroyed.`);
      destroyUnit(enemyOmen, s, 'omen_removed');
    }
    champ.row = row;
    champ.col = col;
    champ.moved = true;
    checkWinner(s);
    return s;
  }

  const enemyUnit = s.units.find(u => u.owner !== s.activePlayer && u.row === row && u.col === col);

  if (enemyUnit) {
    // Reveal hidden enemy unit before champion combat
    if (enemyUnit.hidden) {
      revealUnit(s, enemyUnit);
      // Shadow Trap Hole on reveal: destroy the revealer — champion can't be destroyed, skip
    }
    // Combat: champion moves into enemy unit tile — simultaneous damage
    const combatTile = [row, col];
    const champAtk = getChampionAtkBuff(s, champ);
    const enemyAtk = getEffectiveAtk(s, enemyUnit, combatTile);
    addLog(s, `${getPlayer(s).name}'s champion attacks ${enemyUnit.name}!`);
    // Fortitude: reduce damage to enemy unit if they're Light/ascended and within 2 of their champion
    const unitFortRed = getFortitudeReduction(s, enemyUnit);
    const effectiveChampAtk = unitFortRed > 0 && champAtk > 0 ? Math.max(1, champAtk - unitFortRed) : champAtk;
    if (unitFortRed > 0 && champAtk > 0) addLog(s, `Fortitude: ${enemyUnit.name} takes 1 less damage.`);
    applyDamageToUnit(s, enemyUnit, effectiveChampAtk, 'Champion', combatTile);
    // Apply enemy's pre-combat ATK to champion (simultaneous)
    if (enemyAtk > 0) {
      let champIncomingDmg = enemyAtk;
      // Waddles: cap incoming combat damage at 2 if adjacent to champion
      if (s.waddlesActive && s.waddlesActive[s.activePlayer]) {
        const waddlesUnit = s.units.find(u => u.owner === s.activePlayer && u.id === 'waddles');
        if (waddlesUnit && manhattan([waddlesUnit.row, waddlesUnit.col], [champ.row, champ.col]) === 1) {
          champIncomingDmg = Math.min(champIncomingDmg, 2);
        }
      }
      champ.hp -= champIncomingDmg;
      addLog(s, `${enemyUnit.name} counterattacks champion for ${champIncomingDmg} damage.`);
    }
    // If enemy was destroyed, champion advances to that tile
    const enemyDestroyed = !s.units.find(u => u.uid === enemyUnit.uid);
    if (enemyDestroyed) {
      champ.row = row;
      champ.col = col;
    }
    champ.moved = true;
    checkWinner(s);
  } else {
    // Check if moving into the opposing champion's tile (champion vs champion combat)
    const opposingChamp = s.champions.find(ch => ch.owner !== s.activePlayer && ch.row === row && ch.col === col);
    if (opposingChamp) {
      const champAtk = getChampionAtkBuff(s, champ);
      const opposingChampAtk = getChampionAtkBuff(s, opposingChamp);
      addLog(s, `${getPlayer(s).name}'s champion attacks ${s.players[opposingChamp.owner].name}'s champion!`);
      // Active champion deals its ATK to opposing champion
      opposingChamp.hp -= champAtk;
      addLog(s, `${s.players[opposingChamp.owner].name}'s champion takes ${champAtk} damage.`);
      // Retaliation: opposing champion deals its ATK back (only if ATK > 0)
      if (opposingChampAtk > 0) {
        champ.hp -= opposingChampAtk;
        addLog(s, `${s.players[opposingChamp.owner].name}'s champion retaliates for ${opposingChampAtk} damage.`);
      }
      champ.moved = true;
      checkWinner(s);
    } else {
      champ.row = row;
      champ.col = col;
      champ.moved = true;
      addLog(s, `${getPlayer(s).name}'s champion moves to (${row},${col}).`);
      // Reveal hidden enemy units adjacent to champion's new position
      for (const [nr, nc] of cardinalNeighbors(row, col)) {
        const hiddenEnemy = s.units.find(u => u.owner !== s.activePlayer && u.row === nr && u.col === nc && u.hidden);
        if (hiddenEnemy) {
          revealUnit(s, hiddenEnemy);
          if (hiddenEnemy.id === 'shadowtrap') {
            // Shadow Trap Hole: destroy the unit that revealed it (champion can't be destroyed, skip)
          }
        }
      }
    }
  }
  return s;
}

// ── summon/cast ────────────────────────────────────────────────────────────

export function getSummonTiles(state) {
  const champ = state.champions[state.activePlayer];
  return cardinalNeighbors(champ.row, champ.col)
    .filter(([r, c]) => !isTileOccupied(state, r, c));
}

export function playCard(state, cardUid) {
  let s = cloneState(state);
  // Block card play while awaiting a hand-card selection (discard prompt must resolve first)
  if (s.pendingHandSelect) return s;
  // Block card play while Nezzar's contract selection is pending
  if (s.pendingContractSelect) return s;
  const p = s.players[s.activePlayer];

  // Fate's Ledger grave access: if graveAccessActive, allow playing cards from the grave
  if (s.graveAccessActive?.[s.activePlayer] && p.hand.findIndex(c => c.uid === cardUid) === -1) {
    const graveIdx = p.grave.findIndex(c => c.uid === cardUid);
    if (graveIdx !== -1) {
      // Temporarily move the grave card to hand so standard processing handles it
      const [graveCard] = p.grave.splice(graveIdx, 1);
      p.hand.push(graveCard);
      // Fall through to standard hand play logic below
    }
  }

  const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return s;
  const card = p.hand[cardIdx];
  // Use effective cost (applies spell cost reduction from Fennwick etc.)
  const effectiveCost = getEffectiveSpellCost(s, card);
  if (p.resources < effectiveCost) return s;

  if (card.type === 'unit' || card.type === 'relic' || card.type === 'omen') {
    if ((s.recalledThisTurn || []).includes(card.id)) return s;
    s.pendingSummon = { cardUid, card };
    return s;
  }

  if (card.type === 'terrain') {
    s.pendingTerrainCast = { cardUid, card };
    return s;
  }

  if (card.type === 'spell') {
    // Spirit Bolt: champion must not have acted yet this turn
    if (card.effect === 'spiritbolt') {
      if (s.champions[s.activePlayer].moved) return s;
    }

    // Champion action spells: check champion has not moved
    if (['agonizingsymphony', 'crushingblow'].includes(card.effect)) {
      if (s.champions[s.activePlayer].moved) return s;
    }

    // Rebirth: consume card, mark champion action, open grave selection
    if (card.effect === 'rebirth') {
      if (s.champions[s.activePlayer].moved) return s;
      const grave = p.grave.filter(u => u.type === 'unit' && !u.token);
      if (grave.length === 0) return s; // nothing to revive
      s.champions[s.activePlayer].moved = true;
      p.resources -= effectiveCost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.pendingGraveSelect = { reason: 'rebirth', playerIdx: s.activePlayer };
      addLog(s, `${p.name} casts Rebirth.`);
      return s;
    }

    // Glimpse: free action — does not consume the champion action, open deck peek
    if (card.effect === 'glimpse') {
      p.resources -= effectiveCost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      if (p.deck.length === 0) {
        addLog(s, `Glimpse: deck is empty. Drawing a card.`);
        // Draw from discard if possible (shuffle logic not in scope — just skip peek)
        return s;
      }
      const topCard = { ...p.deck[0] };
      s.pendingDeckPeek = { reason: 'glimpse', playerIdx: s.activePlayer, cards: [topCard] };
      addLog(s, `${p.name} casts Glimpse.`);
      return s;
    }

    // No-target spells: execute via registry directly
    const NO_TARGET_SPELLS = new Set([
      'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
      'ironthorns', 'infernalpact', 'martiallaw', 'fortify', 'shadowveil',
      'ancientspring', 'verdantsurge', 'predatorsmark',
      'agonizingsymphony', 'pestilence', 'fatesledger', 'seconddawn',
    ]);
    if (NO_TARGET_SPELLS.has(card.effect)) {
      p.resources -= effectiveCost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s = _dispatchSpell(s, s.activePlayer, card.effect, []);
      fireTrigger('onCardPlayed', { playerIndex: s.activePlayer, card }, s);
      // Azulon spell echo: targetless spells cast twice automatically
      if (s.players[s.activePlayer].spellEchoActive) {
        s.players[s.activePlayer].spellEchoActive = false;
        s = _dispatchSpell(s, s.activePlayer, card.effect, []);
        addLog(s, `Azulon amplifies the spell.`);
      }
      // Hand size decreased — check if any conditional HP buff units now have effective HP <= 0
      checkConditionalStatDeaths(s);
      checkWinner(s);
      return s;
    }

    // Amethyst Cache: needs an empty tile adjacent to champion — use pendingRelicPlace
    if (card.effect === 'amethystcache') {
      const champ = s.champions[s.activePlayer];
      const validTiles = cardinalNeighbors(champ.row, champ.col).filter(([r, c]) =>
        !s.units.some(u => u.row === r && u.col === c) &&
        !s.champions.some(ch => ch.row === r && ch.col === c)
      );
      if (validTiles.length === 0) return s; // no valid tiles — cannot cast
      p.resources -= effectiveCost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.pendingRelicPlace = { effect: 'amethystcache', playerIdx: s.activePlayer };
      return s;
    }

    // Pact of Ruin: needs hand card selection first, then enemy target
    if (card.effect === 'pactofruin') {
      if (typeof window !== 'undefined') console.log('[PactOfRuin] playCard: pactofruin entered. hand size:', p.hand.length, 'cardUid:', cardUid);
      if (p.hand.length <= 1) {
        // No cards to discard — cancel with no effect
        if (typeof window !== 'undefined') console.log('[PactOfRuin] playCard: hand.length <= 1, cancelling — no discard available');
        return s;
      }
      // Need to select a card to discard first
      p.resources -= effectiveCost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      fireTrigger('onCardPlayed', { playerIndex: s.activePlayer, card }, s);
      s.pendingHandSelect = { reason: 'pactofruin', cardUid, data: {} };
      if (typeof window !== 'undefined') console.log('[PactOfRuin] playCard: pendingHandSelect set:', JSON.stringify(s.pendingHandSelect));
      return s;
    }

    // Toll of Shadows: consume resources/card upfront and start sequential sacrifice chain
    if (card.effect === 'tollofshadows') {
      p.resources -= effectiveCost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      addLog(s, `${p.name} casts Toll of Shadows.`);
      fireTrigger('onCardPlayed', { playerIndex: s.activePlayer, card }, s);
      if (typeof window !== 'undefined') console.log('[TollOfShadows] playCard: cast initiated — casterIdx:', s.activePlayer, 'units:', s.units.filter(u => u.owner === s.activePlayer && !u.isRelic && !u.isOmen).length, 'omens:', s.units.filter(u => u.owner === s.activePlayer && u.isOmen).length, 'relics:', s.units.filter(u => u.owner === s.activePlayer && u.isRelic).length, 'handSize:', p.hand.length);
      return _tollAdvance(s, cardUid, s.activePlayer, 0, {});
    }

    // Needs a target — set pendingSpell
    s.pendingSpell = { cardUid, effect: card.effect, playerIdx: s.activePlayer, step: 0, data: {} };
    return s;
  }
  return s;
}

export function summonUnit(state, cardUid, row, col) {
  const s = cloneState(state);

  // Rebirth placement: place revived unit adjacent to champion (no hand lookup)
  if (s.pendingSummon?.rebirthMode) {
    const unit = s.pendingSummon.card;
    const champ = s.champions[s.activePlayer];
    const adj = cardinalNeighbors(champ.row, champ.col);
    if (!adj.some(([r, c]) => r === row && c === col)) return s;
    if (isTileOccupied(s, row, col)) return s;
    // Restore triggers, modifier, and spd from CARD_DB — graveEntry omits them for serialisation safety.
    const baseCard = CARD_DB[unit.id];
    const placed = {
      ...unit,
      owner: s.activePlayer,
      row,
      col,
      ...(baseCard?.triggers ? { triggers: baseCard.triggers } : {}),
      ...(baseCard?.modifier ? { modifier: baseCard.modifier } : {}),
      ...(baseCard?.spd != null ? { spd: baseCard.spd } : {}),
    };
    s.units.push(placed);
    registerUnit(placed, s);
    registerModifiers(placed, s);
    s.pendingSummon = null;
    addLog(s, `Rebirth: ${placed.name} returns to the battlefield at full HP!`);
    checkWinner(s);
    return s;
  }

  const p = s.players[s.activePlayer];
  const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return s;
  const card = p.hand[cardIdx];
  if (p.resources < card.cost) return s;
  if (isTileOccupied(s, row, col)) return s;

  p.resources -= card.cost;
  p.hand.splice(cardIdx, 1);
  p.discard.push(card);
  s.pendingSummon = null;

  const unit = {
    ...card,
    owner: s.activePlayer,
    row, col,
    maxHp: card.isOmen ? undefined : card.hp,
    summoned: (card.rush || card.type === 'relic') ? false : true,
    moved: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
    turnAtkBonus: 0,
    hidden: card.hidden || false,
    ...(card.isOmen ? { turnsRemaining: card.turnsRemaining } : {}),
    ...(card.id === 'ironqueen' ? { bonusActions: 1, ironQueenActionsUsed: 0 } : {}),
  };

  // Apply Sergeant buff if active
  if (s.players[s.activePlayer].sergeantBuff) {
    unit.atk += 1;
    unit.hp += 1;
    unit.maxHp += 1;
    s.players[s.activePlayer].sergeantBuff = false;
    addLog(s, `Sergeant buff applied: ${unit.name} gains +1/+1.`);
  }

  // Apply Shadow Veil pending flag
  if (s.pendingShadowVeil && s.pendingShadowVeil[s.activePlayer]) {
    unit.hidden = true;
    unit.shadowVeiled = true;
    s.pendingShadowVeil[s.activePlayer] = false;
  }

  s.units.push(unit);
  if (unit.hidden) {
    addLog(s, `${p.name} summons ${card.name} at (${row},${col}).${card.rush ? ' Rush!' : ''} (Hidden)`, s.activePlayer);
  } else {
    addLog(s, `${p.name} summons ${card.name} at (${row},${col}).${card.rush ? ' Rush!' : ''}`);
  }

  // Register declarative triggers and static modifiers for this unit
  registerUnit(unit, s);
  registerModifiers(unit, s);

  // Declarative trigger registry: fire onCardPlayed for the active player.
  // Pass triggeringUid so selfTrigger=false listeners skip their own summon event.
  fireTrigger('onCardPlayed', { playerIndex: s.activePlayer, card, triggeringUid: unit.uid }, s);

  // Hand size decreased — check if any conditional HP buff units now have effective HP <= 0
  checkConditionalStatDeaths(s);

  // ON SUMMON TRIGGERS
  fireOnSummonTriggers(unit, s);

  // Terrain onOccupy: trigger when unit is summoned on a terrain tile
  if (!unit.isRelic && !unit.isOmen) {
    const liveUnit = s.units.find(u => u.uid === unit.uid);
    if (liveUnit) fireTerrainOnOccupy(s, liveUnit, row, col);
  }

  return s;
}

// ── Toll of Shadows helpers ───────────────────────────────────────────────

// Auto-resolve opponent consequences for each category the caster sacrificed.
function _tollOpponentResolve(s, oppIdx, sacrificed) {
  if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: oppIdx:', oppIdx, 'sacrificed:', JSON.stringify(sacrificed), 'opp units:', s.units.filter(u => u.owner === oppIdx && !u.isRelic && !u.isOmen).length, 'opp omens:', s.units.filter(u => u.owner === oppIdx && u.isOmen).length, 'opp relics:', s.units.filter(u => u.owner === oppIdx && u.isRelic).length, 'opp handSize:', s.players[oppIdx].hand.length);
  if (sacrificed.unit) {
    const units = s.units.filter(u => u.owner === oppIdx && !u.isRelic && !u.isOmen);
    if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: unit retaliation — opp units available:', units.length);
    if (units.length > 0) {
      const t = units[Math.floor(Math.random() * units.length)];
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: destroying opp unit:', t.name, t.uid);
      addLog(s, `Toll of Shadows: ${s.players[oppIdx].name}'s ${t.name} is destroyed.`);
      destroyUnit(t, s, 'sacrifice');
      checkWinner(s);
    } else {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: unit retaliation skipped — no opp units');
    }
  }
  if (sacrificed.omen) {
    const omens = s.units.filter(u => u.owner === oppIdx && u.isOmen);
    if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: omen retaliation — opp omens available:', omens.length);
    if (omens.length > 0) {
      const t = omens[Math.floor(Math.random() * omens.length)];
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: destroying opp omen:', t.name, t.uid);
      addLog(s, `Toll of Shadows: ${s.players[oppIdx].name}'s ${t.name} is destroyed.`);
      destroyUnit(t, s, 'sacrifice');
    } else {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: omen retaliation skipped — no opp omens');
    }
  }
  if (sacrificed.relic) {
    const relics = s.units.filter(u => u.owner === oppIdx && u.isRelic);
    if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: relic retaliation — opp relics available:', relics.length);
    if (relics.length > 0) {
      const t = relics[Math.floor(Math.random() * relics.length)];
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: destroying opp relic:', t.name, t.uid);
      addLog(s, `Toll of Shadows: ${s.players[oppIdx].name}'s ${t.name} is destroyed.`);
      destroyUnit(t, s, 'sacrifice');
      checkWinner(s);
    } else {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: relic retaliation skipped — no opp relics');
    }
  }
  if (sacrificed.card) {
    const hand = s.players[oppIdx].hand;
    if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: card discard retaliation — opp handSize:', hand.length);
    if (hand.length > 0) {
      const [discarded] = hand.splice(Math.floor(Math.random() * hand.length), 1);
      s.players[oppIdx].discard.push(discarded);
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: opp discards:', discarded.name);
      addLog(s, `Toll of Shadows: ${s.players[oppIdx].name} discards ${discarded.name}.`);
    } else {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: card discard retaliation skipped — opp hand empty');
    }
  }
  if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollOpponentResolve: COMPLETE');
  return s;
}

// Advance Toll of Shadows to the next pending step starting from fromStep.
// Sets pendingSpell (for board unit/omen/relic selection) or pendingHandSelect
// (for discard), or runs opponent auto-resolution if all steps are complete.
function _tollAdvance(s, cardUid, castIdx, fromStep, sacrificed) {
  const oppIdx = 1 - castIdx;
  if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollAdvance: fromStep:', fromStep, 'casterIdx:', castIdx, 'sacrificed:', JSON.stringify(sacrificed), 'units:', s.units.filter(u => u.owner === castIdx && !u.isRelic && !u.isOmen).length, 'omens:', s.units.filter(u => u.owner === castIdx && u.isOmen).length, 'relics:', s.units.filter(u => u.owner === castIdx && u.isRelic).length, 'handSize:', s.players[castIdx].hand.length);
  // Recursion guard: fromStep > 3 means all caster steps are exhausted — skip to opponent resolution.
  if (fromStep > 3) {
    s.pendingSpell = null;
    return _tollOpponentResolve(s, oppIdx, sacrificed);
  }
  for (let st = fromStep; st <= 3; st++) {
    if (st === 0 && s.units.some(u => u.owner === castIdx && !u.isRelic && !u.isOmen)) {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollAdvance: → step 0 (sacrifice unit) — setting pendingSpell');
      s.pendingSpell = { cardUid, effect: 'tollofshadows', playerIdx: s.activePlayer, step: 0, data: { paid: true, casterIdx: castIdx, sacrificed } };
      return s;
    }
    if (st === 1 && s.units.some(u => u.owner === castIdx && u.isOmen)) {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollAdvance: → step 1 (sacrifice omen) — setting pendingSpell');
      s.pendingSpell = { cardUid, effect: 'tollofshadows', playerIdx: s.activePlayer, step: 1, data: { paid: true, casterIdx: castIdx, sacrificed } };
      return s;
    }
    if (st === 2 && s.units.some(u => u.owner === castIdx && u.isRelic)) {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollAdvance: → step 2 (sacrifice relic) — setting pendingSpell');
      s.pendingSpell = { cardUid, effect: 'tollofshadows', playerIdx: s.activePlayer, step: 2, data: { paid: true, casterIdx: castIdx, sacrificed } };
      return s;
    }
    if (st === 3 && s.players[castIdx].hand.length > 0) {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollAdvance: → step 3 (discard card) — setting pendingHandSelect');
      s.pendingSpell = null;
      s.pendingHandSelect = { reason: 'tollofshadows_discard', data: { casterIdx: castIdx, sacrificed } };
      return s;
    }
    if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollAdvance: step', st, 'skipped (no eligible targets)');
  }
  // All steps done or skipped — auto-resolve opponent
  if (typeof window !== 'undefined') console.log('[TollOfShadows] _tollAdvance: all caster steps complete — proceeding to opponent auto-resolve, sacrificed:', JSON.stringify(sacrificed));
  s.pendingSpell = null;
  return _tollOpponentResolve(s, oppIdx, sacrificed);
}

// ── hand card selection ───────────────────────────────────────────────────
// Called when player selects a card from hand during pendingHandSelect.

export function resolveHandSelect(state, selectedCardUid) {
  const s = cloneState(state);
  const hs = s.pendingHandSelect;
  if (!hs) return s;
  const p = s.players[s.activePlayer];

  if (hs.reason === 'pactofruin') {
    if (typeof window !== 'undefined') console.log('[PactOfRuin] resolveHandSelect: pactofruin — selectedCardUid:', selectedCardUid, 'hand:', p.hand.map(c => c.uid));
    // Discard the selected card
    const idx = p.hand.findIndex(c => c.uid === selectedCardUid);
    if (idx !== -1) {
      const [discarded] = p.hand.splice(idx, 1);
      p.discard.push(discarded);
      addLog(s, `Pact of Ruin: ${discarded.name} discarded.`);
      if (typeof window !== 'undefined') console.log('[PactOfRuin] resolveHandSelect: discarded', discarded.name);
      fireTrigger('onCardDiscarded', { playerIndex: s.activePlayer, discardedCard: discarded }, s);
    } else {
      if (typeof window !== 'undefined') console.log('[PactOfRuin] resolveHandSelect: selectedCardUid not found in hand — no discard');
    }
    s.pendingHandSelect = null;
    if (typeof window !== 'undefined') console.log('[PactOfRuin] resolveHandSelect: pendingHandSelect cleared, setting pendingSpell for damage target');
    // Now need to select an enemy target for 3 damage
    s.pendingSpell = { cardUid: null, effect: 'pactofruin_damage', playerIdx: s.activePlayer, step: 0, data: {} };
    if (typeof window !== 'undefined') console.log('[PactOfRuin] resolveHandSelect: pendingSpell set:', JSON.stringify(s.pendingSpell));
    return s;
  }

  if (hs.reason === 'chaospawn') {
    // Discard the selected card (draw already happened on summon)
    const idx = p.hand.findIndex(c => c.uid === selectedCardUid);
    if (idx !== -1) {
      const [discarded] = p.hand.splice(idx, 1);
      p.discard.push(discarded);
      addLog(s, `Chaos Spawn: ${discarded.name} discarded.`);
      fireTrigger('onCardDiscarded', { playerIndex: s.activePlayer, discardedCard: discarded }, s);
    }
    s.pendingHandSelect = null;
    return s;
  }

  if (hs.reason === 'discardOrDie') {
    // Clockwork Manimus end-of-turn discard. After discard, advance the turn.
    const idx = p.hand.findIndex(c => c.uid === selectedCardUid);
    if (idx !== -1) {
      const [discarded] = p.hand.splice(idx, 1);
      p.discard.push(discarded);
      addLog(s, `Clockwork Manimus: ${discarded.name} discarded.`);
    }
    s.pendingHandSelect = null;
    return completeTurnAdvance(s);
  }

  if (hs.reason === 'tollofshadows_discard') {
    const { casterIdx, sacrificed } = hs.data;
    const casterHand = s.players[casterIdx].hand;
    const idx = casterHand.findIndex(c => c.uid === selectedCardUid);
    const newSacrificed = { ...sacrificed };
    if (typeof window !== 'undefined') console.log('[TollOfShadows] resolveHandSelect: discard step — selectedCardUid:', selectedCardUid, 'handSize:', casterHand.length, 'found:', idx !== -1, 'sacrificed so far:', JSON.stringify(sacrificed));
    if (idx !== -1) {
      const [discarded] = casterHand.splice(idx, 1);
      s.players[casterIdx].discard.push(discarded);
      addLog(s, `${s.players[casterIdx].name} discards ${discarded.name}.`);
      newSacrificed.card = true;
      if (typeof window !== 'undefined') console.log('[TollOfShadows] resolveHandSelect: discarded', discarded.name, '— newSacrificed:', JSON.stringify(newSacrificed));
      fireTrigger('onCardDiscarded', { playerIndex: casterIdx, discardedCard: discarded }, s);
    } else {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] resolveHandSelect: selectedCardUid not found in hand — no discard');
    }
    s.pendingHandSelect = null;
    if (typeof window !== 'undefined') console.log('[TollOfShadows] resolveHandSelect: all caster steps done — calling _tollOpponentResolve for oppIdx:', 1 - casterIdx);
    // All caster steps done — auto-resolve opponent consequences
    return _tollOpponentResolve(s, 1 - casterIdx, newSacrificed);
  }

  if (hs.reason === 'darkBargain') {
    // Dark Bargain contract: discard selected card, then draw 2 cards
    const idx = p.hand.findIndex(c => c.uid === selectedCardUid);
    if (idx !== -1) {
      const [discarded] = p.hand.splice(idx, 1);
      p.discard.push(discarded);
      addLog(s, `Dark Bargain: ${discarded.name} discarded.`);
      fireTrigger('onCardDiscarded', { playerIndex: s.activePlayer, discardedCard: discarded }, s);
    }
    // Draw 2 cards
    for (let i = 0; i < 2; i++) {
      const drawn = drawCard(s, s.activePlayer);
      if (drawn) {
        p.hand.push(drawn);
        addLog(s, `Dark Bargain: drew ${drawn.name}.`, s.activePlayer);
      }
    }
    s.pendingHandSelect = null;
    return s;
  }

  s.pendingHandSelect = null;
  return s;
}

// ── grave card selection ──────────────────────────────────────────────────
// Called when player selects a unit from their grave during pendingGraveSelect.

export function resolveGraveSelect(state, selectedUid) {
  const s = cloneState(state);
  const gs = s.pendingGraveSelect;
  if (!gs) return s;

  if (gs.reason === 'rebirth') {
    const p = s.players[gs.playerIdx];
    const graveIdx = p.grave.findIndex(u => u.uid === selectedUid);
    if (graveIdx === -1) { s.pendingGraveSelect = null; return s; }
    const [graveUnit] = p.grave.splice(graveIdx, 1);
    const revived = {
      ...graveUnit,
      uid: `${graveUnit.id}_${Math.random().toString(36).slice(2)}`,
      hp: graveUnit.maxHp,
      summoned: true, // summoning sickness
      moved: false,
      atkBonus: graveUnit.atkBonus || 0,
      shield: 0,
      speedBonus: 0,
      turnAtkBonus: 0,
      hidden: false,
    };
    s.pendingGraveSelect = null;
    s.pendingSummon = { rebirthMode: true, card: revived, cardUid: revived.uid };
    addLog(s, `Rebirth: select a tile adjacent to your champion to place ${revived.name}.`);
    return s;
  }

  // Specific spell effects that use grave selection can be handled here by reason.
  s.pendingGraveSelect = null;
  return s;
}

// ── Nezzar contract selection ─────────────────────────────────────────────
// Called when the player chooses a contract (or passes with contractId = null).

export function resolveContractSelect(state, contractId) {
  console.log("[Nezzar] resolveContractSelect called with contractId=" + contractId);
  const s = cloneState(state);
  const pending = s.pendingContractSelect;
  if (!pending) {
    console.log("[Nezzar] resolveContractSelect: no pendingContractSelect — returning early");
    return s;
  }
  s.pendingContractSelect = null;

  const playerIdx = s.activePlayer;
  const p = s.players[playerIdx];
  const champ = s.champions[playerIdx];
  const enemyChamp = s.champions[1 - playerIdx];

  console.log("[Nezzar] resolveContractSelect: pending=" + JSON.stringify(pending) + ", activePlayer=" + playerIdx);

  if (!contractId) {
    addLog(s, `Contracts declined.`);
    console.log("[Nezzar] resolveContractSelect: contract declined");
    return s;
  }

  console.log("[Nezzar] resolveContractSelect: resolving contract=" + contractId);
  switch (contractId) {
    case 'soulPrice': {
      // Pay 2 life, deal 4 damage to enemy champion
      console.log("[Nezzar] soulPrice: champ.hp before=" + champ.hp + ", enemyChamp.hp before=" + enemyChamp.hp);
      champ.hp -= 2;
      addLog(s, `Soul Price accepted. ${p.name}'s champion pays 2 life (${champ.hp} HP remaining).`);
      enemyChamp.hp -= 4;
      addLog(s, `Soul Price: enemy champion takes 4 damage (${enemyChamp.hp} HP remaining).`);
      console.log("[Nezzar] soulPrice: champ.hp after=" + champ.hp + ", enemyChamp.hp after=" + enemyChamp.hp);
      checkWinnerLocal(s);
      break;
    }
    case 'cataclysm': {
      // Deal 2 damage to all other combat units (not Nezzar)
      const nezzarUid = pending.nezzarUid;
      const targets = [...s.units].filter(u => !u.isRelic && !u.isOmen && u.uid !== nezzarUid);
      console.log("[Nezzar] cataclysm: targeting " + targets.length + " units");
      addLog(s, `Cataclysm accepted. All other combat units take 2 damage.`);
      for (const t of targets) {
        if (s.units.find(u => u.uid === t.uid)) {
          console.log("[Nezzar] cataclysm: applying 2 damage to " + t.name + " (uid=" + t.uid + ")");
          applyDamageToUnit(s, t, 2, 'Cataclysm');
        }
      }
      break;
    }
    case 'darkTithe': {
      // Skip champion action, gain 2 temporary mana
      console.log("[Nezzar] darkTithe: resources before=" + p.resources);
      champ.moved = true;
      p.resources = Math.min((p.resources || 0) + 2, 10);
      addLog(s, `Dark Tithe accepted. Champion's action skipped. Gained 2 temporary mana (${p.resources} total).`);
      console.log("[Nezzar] darkTithe: resources after=" + p.resources);
      break;
    }
    case 'finalGambit': {
      // Gain an extra command, lose at end of turn
      console.log("[Nezzar] finalGambit: commandsUsed before=" + p.commandsUsed);
      p.commandsUsed = Math.max(0, (p.commandsUsed || 0) - 1);
      if (!s.finalGambitActive) s.finalGambitActive = [false, false];
      s.finalGambitActive[playerIdx] = true;
      addLog(s, `Final Gambit accepted. ${p.name} gains an extra command — but will lose at end of turn.`);
      console.log("[Nezzar] finalGambit: commandsUsed after=" + p.commandsUsed + ", finalGambitActive=" + JSON.stringify(s.finalGambitActive));
      break;
    }
    case 'bloodPact': {
      // Two-step: select friendly unit to sacrifice, then enemy unit to destroy
      console.log("[Nezzar] bloodPact: setting pendingBloodPact selectFriendly, nezzarUid=" + pending.nezzarUid);
      s.pendingBloodPact = { step: 'selectFriendly', nezzarUid: pending.nezzarUid };
      addLog(s, `Blood Pact accepted.`);
      break;
    }
    case 'darkBargain': {
      // Discard a card from hand, then draw 2
      console.log("[Nezzar] darkBargain: setting pendingHandSelect, hand size=" + p.hand?.length);
      s.pendingHandSelect = { reason: 'darkBargain', data: {} };
      addLog(s, `Dark Bargain accepted.`);
      break;
    }
    default:
      console.log("[Nezzar] resolveContractSelect: unknown contractId=" + contractId);
      break;
  }

  return s;
}

// Called when the player selects a friendly unit to sacrifice for Blood Pact.
export function resolveBloodPactFriendly(state, unitUid) {
  const s = cloneState(state);
  const bp = s.pendingBloodPact;
  if (!bp || bp.step !== 'selectFriendly') return s;

  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== s.activePlayer || unit.isRelic || unit.isOmen || unit.uid === bp.nezzarUid) return s;

  const sacrificedUid = unit.uid;
  const unitName = unit.name;
  destroyUnit(unit, s, 'bloodPact');
  addLog(s, `Blood Pact: ${unitName} sacrificed.`);
  s.pendingBloodPact = { step: 'selectEnemy', nezzarUid: bp.nezzarUid, sacrificedUid };
  return s;
}

// Called when the player selects an enemy unit to destroy for Blood Pact.
export function resolveBloodPactEnemy(state, unitUid) {
  const s = cloneState(state);
  const bp = s.pendingBloodPact;
  if (!bp || bp.step !== 'selectEnemy') return s;

  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner === s.activePlayer || unit.isRelic || unit.isOmen) return s;

  const unitName = unit.name;
  destroyUnit(unit, s, 'bloodPact');
  addLog(s, `Blood Pact: ${unitName} destroyed.`);
  s.pendingBloodPact = null;
  return s;
}

// Local checkWinner used within contract resolve (can't call exported version directly)
function checkWinnerLocal(state) {
  for (const champ of state.champions) {
    if (champ.hp <= 0) {
      const winner = state.players[1 - champ.owner];
      state.winner = winner.name;
      addLog(state, `Game over! ${winner.name} wins!`);
    }
  }
}

// ── Flesh Tithe sacrifice ─────────────────────────────────────────────────

export function resolveFleshtitheSacrifice(state, choice, sacrificeUid) {
  // choice: 'yes' | 'no'
  const s = cloneState(state);
  const pending = s.pendingFleshtitheSacrifice;
  if (!pending) return s;

  const fleshtithe = s.units.find(u => u.uid === pending.unitUid);
  s.pendingFleshtitheSacrifice = null;

  if (choice === 'yes' && sacrificeUid && fleshtithe) {
    const sacrifice = s.units.find(u => u.uid === sacrificeUid && !u.isRelic && !u.isOmen);
    if (sacrifice) {
      addLog(s, `Flesh Tithe: ${sacrifice.name} sacrificed.`);
      fireTrigger('onFriendlySacrifice', { sacrificedUnit: { ...sacrifice }, sacrificingPlayerIndex: sacrifice.owner }, s);
      destroyUnit(sacrifice, s, 'sacrifice');
      if (fleshtithe) {
        fleshtithe.atk += 2;
        fleshtithe.hp += 2;
        fleshtithe.maxHp += 2;
        addLog(s, `Flesh Tithe: gains +2/+2. Now ${fleshtithe.atk}/${fleshtithe.hp}.`);
      }
    }
  } else {
    addLog(s, `Flesh Tithe: enters as 3/3.`);
  }

  return s;
}

// ── spell resolution ──────────────────────────────────────────────────────

export function resolveSpell(state, cardUid, targetUnitUid) {
  let s = cloneState(state);
  const pending = s.pendingSpell;
  if (!pending) return s;

  const p = s.players[s.activePlayer];

  // For spells that consumed resources at pendingSpell creation we don't deduct again.
  // Unit actions and multi-step spells set paid:true in pendingSpell.data to skip the hand lookup.
  // Special case: 'pactofruin_damage' was already paid (card and resources consumed at creation).
  const isPaid = pending.effect === 'pactofruin_damage' || pending.data?.paid === true;

  let resolvedSpellCard = null;
  if (!isPaid) {
    const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
    if (cardIdx === -1) return s;
    const card = p.hand[cardIdx];
    const effectiveCost = getEffectiveSpellCost(s, card);
    if (p.resources < effectiveCost) return s;
    p.resources -= effectiveCost;
    p.hand.splice(cardIdx, 1);
    p.discard.push(card);
    resolvedSpellCard = card;
  }

  s.pendingSpell = null;
  let target = targetUnitUid ? s.units.find(u => u.uid === targetUnitUid) : null;
  if (!target && targetUnitUid && typeof targetUnitUid === 'string' && targetUnitUid.startsWith('champion')) {
    const idx = parseInt(targetUnitUid.replace('champion', ''), 10);
    if (!isNaN(idx)) target = s.champions[idx];
  }
  const effect = pending.effect;
  const step = pending.step || 0;
  const data = pending.data || {};

  // ── Smite ──
  if (effect === 'smite') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'smite', [target]);
  }
  // ── Forge Weapon ──
  else if (effect === 'forgeweapon') {
    s = _dispatchSpell(s, s.activePlayer, 'forgeweapon', [target]);
  }
  // ── Iron Shield ──
  else if (effect === 'ironshield') {
    s = _dispatchSpell(s, s.activePlayer, 'ironshield', [target]);
  }
  // ── Recall ──
  else if (effect === 'recall') {
    if (target && !target.isRelic && !target.isOmen) {
      s = _dispatchSpell(s, s.activePlayer, 'recall', [target]);
      checkWinner(s);
    }
  }
  // ── Glittering Gift ──
  else if (effect === 'glitteringgift') {
    if (target && !target.isRelic && !target.isOmen) {
      s = _dispatchSpell(s, s.activePlayer, 'glitteringgift', [target]);
    }
  }
  // ── Moonleaf ──
  else if (effect === 'moonleaf') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'moonleaf', [target]);
  }
  // ── Bloom (step 0: friendly, step 1: enemy) ──
  else if (effect === 'bloom') {
    if (step === 0) {
      if (target) s = _dispatchSpell(s, s.activePlayer, 'bloom', [target], { step: 0 });
      s.pendingSpell = { cardUid, effect: 'bloom', playerIdx: s.activePlayer, step: 1, data: { ...data, paid: true } };
    } else {
      if (target) s = _dispatchSpell(s, s.activePlayer, 'bloom', [target], { step: 1 });
    }
  }
  // ── Entangle ──
  else if (effect === 'entangle') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'entangle', [target]);
  }
  // ── Predator's Mark (no target — auto-targets enemy champion via registry) ──
  else if (effect === 'predatorsmark') {
    s = _dispatchSpell(s, s.activePlayer, 'predatorsmark', []);
  }
  // ── Pounce ──
  else if (effect === 'pounce') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'pounce', [target]);
  }
  // ── Savage Growth ──
  else if (effect === 'savagegrowth') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'savagegrowth', [target]);
  }
  // ── Ambush (step 0: select friendly Beast, step 1: resolve combat) ──
  else if (effect === 'ambush') {
    if (step === 0) {
      if (target) {
        s.pendingSpell = { cardUid, effect: 'ambush', playerIdx: s.activePlayer, step: 1, data: { beastUid: target.uid, paid: true } };
      }
    } else {
      const beast = s.units.find(u => u.uid === data.beastUid);
      if (beast && target) {
        s = _dispatchSpell(s, s.activePlayer, 'ambush', [beast, target], { step: 1 });
      }
    }
  }
  // ── Blood Offering (step 0: sacrifice friendly, step 1: damage enemy) ──
  else if (effect === 'bloodoffering') {
    if (step === 0) {
      if (target) {
        const sacrificeAtk = getEffectiveAtk(s, target);
        s = _dispatchSpell(s, s.activePlayer, 'bloodoffering', [target], { step: 0 });
        s.pendingSpell = { cardUid, effect: 'bloodoffering', playerIdx: s.activePlayer, step: 1, data: { sacrificeAtk, paid: true } };
      }
    } else {
      if (target) {
        s = _dispatchSpell(s, s.activePlayer, 'bloodoffering', [target], { step: 1, sacrificeAtk: data.sacrificeAtk || 0 });
      }
    }
  }
  // ── Pact of Ruin damage ──
  else if (effect === 'pactofruin_damage') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'pactofruin_damage', [target]);
  }
  // ── Dark Sentence ──
  else if (effect === 'darksentence') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'darksentence', [target]);
  }
  // ── Devour ──
  else if (effect === 'devour') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'devour', [target]);
  }
  // ── Soul Drain ──
  else if (effect === 'souldrain') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'souldrain', [target]);
  }
  // ── Petrify ──
  else if (effect === 'petrify') {
    if (target && target.hp <= 4 && !target.isRelic && !target.isOmen) {
      s = _dispatchSpell(s, s.activePlayer, 'petrify', [target]);
      checkWinner(s);
    }
  }
  // ── Stand Firm ──
  else if (effect === 'standfirm') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'standfirm', [target]);
  }
  // ── Gilded Cage ──
  else if (effect === 'gildedcage') {
    if (target && !target.isRelic && !target.isOmen) {
      s = _dispatchSpell(s, s.activePlayer, 'gildedcage', [target]);
      checkWinner(s);
    }
  }
  // ── Apex Rampage ──
  else if (effect === 'apexrampage') {
    if (target && !target.isRelic && !target.isOmen) {
      s = _dispatchSpell(s, s.activePlayer, 'apexrampage', [target]);
    }
  }
  // ── Animus ──
  else if (effect === 'animus') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'animus', [target]);
  }
  // ── Gore ──
  else if (effect === 'gore') {
    if (target) {
      s = _dispatchSpell(s, s.activePlayer, 'gore', [target]);
      checkWinner(s);
    }
  }
  // ── Demolish ──
  else if (effect === 'demolish') {
    if (target && (target.isRelic || target.isOmen)) {
      s = _dispatchSpell(s, s.activePlayer, 'demolish', [target]);
      checkWinner(s);
    }
  }
  // ── Mind Seize ──
  else if (effect === 'mindseize') {
    if (target && !target.isRelic && !target.isOmen) {
      s = _dispatchSpell(s, s.activePlayer, 'mindseize', [target]);
    }
  }
  // ── Chains of Light stun (triggered after omen is placed) ──
  else if (effect === 'chainsoflight_summon') {
    const omenUid = data.omenUid;
    if (target && omenUid) {
      s = _dispatchSpell(s, s.activePlayer, 'chainsoflight_summon', [target], { omenUid });
    }
  }
  // ── Spirit Bolt ──
  else if (effect === 'spiritbolt') {
    const champ = s.champions[s.activePlayer];
    champ.moved = true;
    if (target) {
      s = _dispatchSpell(s, s.activePlayer, 'spiritbolt', [target]);
      checkWinner(s);
    }
  }
  // ── Crushing Blow ──
  else if (effect === 'crushingblow') {
    if (target) {
      s = _dispatchSpell(s, s.activePlayer, 'crushingblow', [target]);
      checkWinner(s);
    }
  }
  // ── Woodland Guard action ──
  else if (effect === 'woodlandguard_action') {
    const unit = s.units.find(u => u.uid === data.sourceUid);
    if (unit && target) s = _dispatchAction(unit, s, [target]);
  }
  // ── Battle Priest summon trigger (step 0: collect enemy, step 1: collect friendly + execute) ──
  else if (effect === 'battlepriestunit_summon') {
    const priest = s.units.find(u => u.uid === data.sourceUid);
    if (step === 0) {
      const enemyUid = target ? target.uid : null;
      if (priest) {
        const adj = cardinalNeighbors(priest.row, priest.col);
        const hasFriendlies = s.units.some(u => u.owner === s.activePlayer && u.uid !== priest.uid && adj.some(([r, c]) => u.row === r && u.col === c));
        if (hasFriendlies) {
          s.pendingSpell = { cardUid, effect: 'battlepriestunit_summon', playerIdx: s.activePlayer, step: 1, data: { ...data, enemyUid, paid: true } };
        } else {
          // No friendly targets — execute now with enemy only
          const enemy = enemyUid ? s.units.find(u => u.uid === enemyUid) : null;
          if (enemy) {
            addLog(s, `Battle Priest: deals 2 damage to ${enemy.name}.`);
            applyDamageToUnit(s, enemy, 2, 'Battle Priest');
          }
          addLog(s, `Battle Priest: no friendly target in range.`);
        }
      }
    } else {
      // step 1 — execute with stored enemy + selected friendly
      const enemy = data.enemyUid ? s.units.find(u => u.uid === data.enemyUid) : null;
      if (enemy) {
        addLog(s, `Battle Priest: deals 2 damage to ${enemy.name}.`);
        applyDamageToUnit(s, enemy, 2, 'Battle Priest');
      } else {
        addLog(s, `Battle Priest: no enemy target in range.`);
      }
      if (target) {
        const healed = restoreHP(target, 2, s, 'battlepriestunit');
        addLog(s, `Battle Priest: restores ${healed} HP to ${target.name}.`);
      } else {
        addLog(s, `Battle Priest: no friendly target in range.`);
      }
    }
  }
  // ── Pack Runner action ──
  else if (effect === 'packrunner_action') {
    const unit = s.units.find(u => u.uid === data.sourceUid);
    if (unit && target) s = _dispatchAction(unit, s, [target]);
  }
  // ── Elf Archer action (ranged 2 damage) ──
  else if (effect === 'elfarcher_action') {
    const unit = s.units.find(u => u.uid === data.sourceUid);
    if (unit && target) s = _dispatchAction(unit, s, [target]);
  }
  // ── Blood Altar action (sacrifice adjacent friendly, draw 1 card) ──
  else if (effect === 'bloodaltar_action') {
    const unit = s.units.find(u => u.uid === data.sourceUid);
    if (unit && target) s = _dispatchAction(unit, s, [target]);
  }
  // ── Clockwork Manimus action (deal 2 damage to target enemy combat unit) ──
  else if (effect === 'clockworkmanimus_action') {
    const unit = s.units.find(u => u.uid === data.sourceUid);
    if (unit && target) {
      s = _dispatchAction(unit, s, [target]);
      checkWinner(s);
      const actorAfter = s.units.find(u => u.uid === unit.uid);
      fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, s);
      fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, s);
    }
  }
  // ── Lifebinder summon trigger (restore target friendly combat unit to full health) ──
  else if (effect === 'lifebinder_summon') {
    if (target) {
      restoreHP(target, target.maxHp, s, 'lifebinder');
      addLog(s, `Lifebinder restores ${target.name} to full health.`);
    }
  }
  // ── Rootsong Commander action (elf tribal buff until end of turn) ──
  else if (effect === 'elfTribalBuff') {
    const unit = s.units.find(u => u.uid === data.sourceUid);
    if (unit && target) {
      s = _dispatchAction(unit, s, [target]);
      const actorAfter = s.units.find(u => u.uid === unit.uid);
      fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, s);
      fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, s);
    }
  }
  // ── Toll of Shadows (sequential caster sacrifice chain with automatic opponent resolution) ──
  // steps 0=unit, 1=omen, 2=relic, 3=discard (caster only); opponent resolution is automatic
  else if (effect === 'tollofshadows') {
    const castIdx = data.casterIdx ?? s.activePlayer;
    const sacrificed = { ...(data.sacrificed ?? {}) };

    if (typeof window !== 'undefined') console.log('[TollOfShadows] resolveSpell: step:', step, 'target:', target?.name ?? 'none', 'target uid:', target?.uid ?? 'none', 'castIdx:', castIdx, 'sacrificed so far:', JSON.stringify(sacrificed));

    if (target) {
      // Caster selected a target for the current step — execute sacrifice
      if (typeof window !== 'undefined') console.log('[TollOfShadows] resolveSpell: executing sacrifice at step', step, '— target:', target.name);
      s = _dispatchSpell(s, castIdx, 'tollofshadows', [target], { step, casterIdx: castIdx });
      checkWinner(s);
      if (step === 0) sacrificed.unit = true;
      else if (step === 1) sacrificed.omen = true;
      else if (step === 2) sacrificed.relic = true;
      if (typeof window !== 'undefined') console.log('[TollOfShadows] resolveSpell: after sacrifice — sacrificed now:', JSON.stringify(sacrificed), 'advancing to step:', step + 1);
    } else {
      if (typeof window !== 'undefined') console.log('[TollOfShadows] resolveSpell: no target provided at step', step, '— re-prompting same step');
    }

    // Advance to next pending step (or run opponent auto-resolution when all done).
    // If no target was selected, re-prompt the same step so the player must pick a valid target.
    return _tollAdvance(s, cardUid, castIdx, target ? step + 1 : step, sacrificed);
  }

  // Fire onCardPlayed for targeted spells (the card was consumed in the !isPaid block above).
  // Unit actions (paid+sourceUid), echo casts (paid+isEcho), and multi-step continuations
  // (paid without a real card) are excluded.
  if (resolvedSpellCard && !s.pendingSpell) {
    fireTrigger('onCardPlayed', { playerIndex: s.activePlayer, card: resolvedSpellCard }, s);
  }

  // Azulon spell echo: if spellEchoActive was set before this spell and we just completed a
  // targeted spell (pendingSpell is now cleared by this resolution), schedule an echo cast.
  if (!s.pendingSpell && s.players[s.activePlayer]?.spellEchoActive && !data?.isEcho) {
    s.players[s.activePlayer].spellEchoActive = false;
    // Only echo spells, not action effects (action effects have paid=true but no card cost)
    const echoableEffects = new Set([
      'smite', 'darksentence', 'devour', 'souldrain', 'spiritbolt',
      'pactofruin_damage', 'bloodoffering', 'ambush',
    ]);
    if (echoableEffects.has(effect)) {
      s.pendingSpell = { cardUid: null, effect, playerIdx: s.activePlayer, step: 0, data: { isEcho: true, paid: true } };
      addLog(s, `Azulon amplifies the spell.`);
    }
  }

  return s;
}

export function cancelSpell(state) {
  const s = cloneState(state);
  if (s.pendingHandSelect && typeof window !== 'undefined') console.log('[PactOfRuin] cancelSpell: clearing pendingHandSelect (was:', JSON.stringify(s.pendingHandSelect), ')');
  s.pendingSpell = null;
  s.pendingSummon = null;
  s.pendingHandSelect = null;
  s.pendingGraveSelect = null;
  s.pendingTerrainCast = null;
  s.pendingDirectionSelect = null;
  s.pendingRelicPlace = null;
  s.pendingLineBlast = null;
  s.pendingNegationCancel = null;
  s.pendingDeckPeek = null;
  s.pendingChampionSaplingPlace = null;
  s.pendingFleshtitheSacrifice = null;
  return s;
}

// ── Vorn, Thundercaller: line blast direction resolution ──────────────────
// Called when the player chooses a cardinal direction for Vorn's lineBlast action.
// direction: 'up' | 'down' | 'left' | 'right'
export function resolveLineBlast(state, unitUid, direction) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit) return s;
  s.pendingLineBlast = null;
  // Iron Queen: action already counted in triggerUnitAction; other units mark moved here
  if (unit.id !== 'ironqueen') {
    unit.moved = true; // Mark action used
  }
  const result = _dispatchAction(unit, s, [direction]);
  checkWinner(result);
  const actorAfter = result.units.find(u => u.uid === unitUid);
  fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unitUid }, result);
  fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unitUid }, result);
  return result;
}

// ── Vorn: resolve direction tile selection ────────────────────────────────
// Called when the player clicks one of Vorn's 4 highlighted adjacent tiles.
// Derives the blast direction from Vorn's position to the chosen tile.
export function resolveDirectionTile(state, unitUid, targetRow, targetCol) {
  const unit = state.units.find(u => u.uid === unitUid);
  if (!unit) return state;
  const dr = targetRow - unit.row;
  const dc = targetCol - unit.col;
  let direction;
  if (dr < 0)      direction = 'up';
  else if (dr > 0) direction = 'down';
  else if (dc < 0) direction = 'left';
  else             direction = 'right';
  const result = resolveLineBlast(state, unitUid, direction);
  result.pendingDirectionSelect = null;
  return result;
}

// ── Negation Crystal: resolve confirm/decline ─────────────────────────────
// Called when the Negation Crystal owner responds to the prompt.
// confirmed=true: destroy the crystal and cancel the stored action.
// confirmed=false: clear pending state and execute the stored action.
export function resolveNegationCancel(state, confirmed) {
  const s = cloneState(state);
  const pending = s.pendingNegationCancel;
  if (!pending) return s;
  s.pendingNegationCancel = null;

  if (confirmed) {
    const crystal = s.units.find(u => u.uid === pending.crystalUid);
    if (crystal) {
      addLog(s, `Negation Crystal destroyed — enemy action cancelled!`);
      destroyUnit(crystal, s, 'negationcrystal_cancel');
    }
    checkWinner(s);
    return s;
  }

  // Declined: execute the stored action now
  addLog(s, `Negation Crystal: declined. Action resolves.`);
  const unit = s.units.find(u => u.uid === pending.pendingUnitUid);
  if (unit) {
    const resolver = ACTION_REGISTRY[unit.id];
    if (resolver) {
      const result = resolver(unit, s, pending.pendingTargets || []);
      checkWinner(result);
      const actorAfter = result.units.find(u => u.uid === pending.pendingUnitUid);
      fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
      fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
      return result;
    }
  }
  return s;
}

// ── Arcane Lens: deck peek resolution ────────────────────────────────────
// Called when the player selects a card from the deck peek modal.
// The selected card is placed at index 0 of the deck; remaining peeked cards are shuffled back.
export function resolveDeckPeek(state, selectedCardUid) {
  const s = cloneState(state);
  const pending = s.pendingDeckPeek;
  if (!pending) return s;
  s.pendingDeckPeek = null;
  const p = s.players[s.activePlayer];
  const peekCount = pending.cards.length;
  // Remove the top peekCount cards from the deck (they were peeked but not extracted)
  const topCards = p.deck.splice(0, peekCount);
  const selectedIdx = topCards.findIndex(c => c.uid === selectedCardUid);
  if (selectedIdx === -1) {
    // No valid selection — shuffle all peeked cards back
    for (let i = topCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [topCards[i], topCards[j]] = [topCards[j], topCards[i]];
    }
    p.deck.unshift(...topCards);
    addLog(s, `Arcane Lens: cards shuffled back.`);
    return s;
  }
  const [selected] = topCards.splice(selectedIdx, 1);
  // Shuffle the remaining peeked cards
  for (let i = topCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [topCards[i], topCards[j]] = [topCards[j], topCards[i]];
  }
  // Place selected on top, shuffled rest below
  p.deck.unshift(...topCards);
  p.deck.unshift(selected);
  addLog(s, `Arcane Lens: ${selected.name} placed on top of deck.`);
  return s;
}

// ── Glimpse: deck peek resolution ────────────────────────────────────────
// keepTop: true = leave card on top of deck (draw it), false = shuffle it back then draw
export function resolveGlimpse(state, keepTop) {
  const s = cloneState(state);
  const pending = s.pendingDeckPeek;
  if (!pending || pending.reason !== 'glimpse') return s;
  s.pendingDeckPeek = null;
  const p = s.players[s.activePlayer];
  if (!keepTop && p.deck.length > 0) {
    // Shuffle the top card back into the deck
    const top = p.deck.shift();
    const insertAt = Math.floor(Math.random() * (p.deck.length + 1));
    p.deck.splice(insertAt, 0, top);
    addLog(s, `Glimpse: card shuffled back into the deck.`);
  }
  // Draw 1 card
  const drawn = drawCard(s, s.activePlayer);
  if (drawn) {
    p.hand.push(drawn);
    addLog(s, `Glimpse: drew ${drawn.name}.`, s.activePlayer);
  } else {
    addLog(s, `Glimpse: deck is empty, no card drawn.`);
  }
  return s;
}

// ── Fennwick scry: dismiss without drawing ────────────────────────────────
// The card stays on top of the deck — just clears pendingDeckPeek.
export function resolveScry(state) {
  const s = cloneState(state);
  s.pendingDeckPeek = null;
  return s;
}

// ── Amethyst Cache tile placement ─────────────────────────────────────────

// Returns empty tiles adjacent (distance 1) to the active player's champion.
export function getAmethystCacheTiles(state) {
  const champ = state.champions[state.activePlayer];
  return cardinalNeighbors(champ.row, champ.col).filter(([r, c]) =>
    !state.units.some(u => u.row === r && u.col === c) &&
    !state.champions.some(ch => ch.row === r && ch.col === c)
  );
}

// Place the Amethyst Crystal relic at the chosen tile.
export function resolveRelicPlace(state, row, col) {
  let s = cloneState(state);
  if (!s.pendingRelicPlace) return s;
  const { effect, playerIdx } = s.pendingRelicPlace;

  // Validate the tile is still empty and adjacent to champion
  const champ = s.champions[playerIdx];
  const adj = cardinalNeighbors(champ.row, champ.col);
  const isAdj = adj.some(([r, c]) => r === row && c === col);
  const isEmpty = !s.units.some(u => u.row === row && u.col === col) &&
                  !s.champions.some(ch => ch.row === row && ch.col === col);
  if (!isAdj || !isEmpty) return s;

  s.pendingRelicPlace = null;
  s = _dispatchSpell(s, playerIdx, effect, [], { row, col });
  fireTrigger('onCardPlayed', { playerIndex: playerIdx, card: { effect } }, s);
  checkWinner(s);
  return s;
}

// ── terrain helpers ────────────────────────────────────────────────────────

// Tiles where terrain cannot be placed: throne + champion start corners.
const TERRAIN_RESTRICTED = new Set(['2,2', '0,0', '4,4']);

// Returns all valid tiles for casting a terrain card.
// Most terrain cards allow placement within Manhattan distance 2 of the casting player's champion.
// Enchanted Ground and Cursed Ground are restricted to Manhattan distance 1 (adjacent tiles only).
// Excludes champion start tiles (0,0) and (4,4) and the Throne tile (2,2).
export function getTerrainCastTiles(state, card = null) {
  const resolvedCard = card ?? state.pendingTerrainCast?.card;
  const maxDist = (resolvedCard?.id === 'enchanted_ground' || resolvedCard?.id === 'cursed_ground') ? 1 : 2;
  const champ = state.champions[state.activePlayer];
  const tiles = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (TERRAIN_RESTRICTED.has(`${r},${c}`)) continue;
      if (manhattan([champ.row, champ.col], [r, c]) > maxDist) continue;
      tiles.push([r, c]);
    }
  }
  return tiles;
}

// Returns all tiles affected by casting a terrain card at (targetRow, targetCol)
// given the card's terrainRadius.
function getTerrainAffectedTiles(targetRow, targetCol, radius) {
  const tiles = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (TERRAIN_RESTRICTED.has(`${r},${c}`)) continue;
      if (manhattan([targetRow, targetCol], [r, c]) <= radius) {
        tiles.push([r, c]);
      }
    }
  }
  return tiles;
}

// Returns the terrain effect at (row, col), or null.
export function getTerrainAt(state, row, col) {
  if (!state.terrainGrid) return null;
  return state.terrainGrid[row]?.[col] ?? null;
}

// Place a terrain card at the target tile (and all tiles within radius).
export function castTerrainCard(state, cardUid, targetRow, targetCol) {
  const s = cloneState(state);
  if (!s.pendingTerrainCast) return s;
  const p = s.players[s.activePlayer];

  // Validate restricted
  if (TERRAIN_RESTRICTED.has(`${targetRow},${targetCol}`)) return s;

  // Deduct cost and remove from hand
  const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return s;
  const card = p.hand[cardIdx];
  const effectiveCost = getEffectiveSpellCost(s, card);
  if (p.resources < effectiveCost) return s;
  p.resources -= effectiveCost;
  p.hand.splice(cardIdx, 1);
  p.discard.push(card);
  s.pendingTerrainCast = null;

  const radius = card.terrainRadius ?? 0;
  const affectedTiles = getTerrainAffectedTiles(targetRow, targetCol, radius);

  for (const [r, c] of affectedTiles) {
    s.terrainGrid[r][c] = { ...card.terrainEffect, ownerName: card.name, cardId: card.id };
  }

  addLog(s, `${p.name} casts ${card.name} at (${targetRow},${targetCol}). ${affectedTiles.length} tile(s) affected.`);

  // Trigger onOccupy for any unit currently standing on an affected tile
  for (const [r, c] of affectedTiles) {
    const unitOnTile = s.units.find(u => u.row === r && u.col === c);
    if (unitOnTile) {
      fireTerrainOnOccupy(s, unitOnTile, r, c);
    }
  }

  return s;
}

// Fire onOccupy terrain effect for a unit entering (or already on) a terrain tile.
function fireTerrainOnOccupy(state, unit, row, col) {
  const terrain = getTerrainAt(state, row, col);
  if (!terrain || !terrain.onOccupy) return;
  if (terrain.onOccupy.damage != null) {
    applyDamageToUnit(state, unit, terrain.onOccupy.damage, terrain.ownerName || 'Terrain');
    addLog(state, `${unit.name} enters ${terrain.ownerName || 'terrain'} and takes ${terrain.onOccupy.damage} damage!`);
  }
}

export function endActionPhase(state) {
  const s = cloneState(state);
  // Block end-of-action phase while Nezzar's contract selection is pending
  if (s.pendingContractSelect) return s;
  if (s.pendingHandSelect && typeof window !== 'undefined') console.log('[PactOfRuin] endActionPhase: clearing pendingHandSelect (was:', JSON.stringify(s.pendingHandSelect), ')');
  s.pendingSpell = null;
  s.pendingSummon = null;
  s.pendingHandSelect = null;
  s.pendingGraveSelect = null;
  s.pendingTerrainCast = null;
  s.pendingDirectionSelect = null;
  s.pendingRelicPlace = null;
  s.pendingLineBlast = null;
  s.pendingDeckPeek = null;
  s.pendingChampionSaplingPlace = null;
  s.phase = 'end-turn';
  return s;
}

// ── unit action abilities ─────────────────────────────────────────────────

export function triggerUnitAction(state, unitUid) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== s.activePlayer || unit.moved || unit.summoned) return s;

  // Command gate: action abilities cost 1 command (2 for doubleCommandCost units)
  const actionCmdCost = unit.doubleCommandCost ? 2 : 1;
  if ((s.players[s.activePlayer].commandsUsed ?? 0) + actionCmdCost > 3) return s;
  s.players[s.activePlayer].commandsUsed = (s.players[s.activePlayer].commandsUsed ?? 0) + actionCmdCost;

  // Reveal hidden unit when it uses an action ability
  if (unit.hidden) {
    revealUnit(s, unit);
  }

  // Iron Queen gets 2 actions per turn; track usage and only lock after the 2nd
  if (unit.id === 'ironqueen') {
    unit.ironQueenActionsUsed = (unit.ironQueenActionsUsed ?? 0) + 1;
    if (unit.ironQueenActionsUsed >= 2) unit.moved = true;
  } else if ((unit.extraActionsRemaining ?? 0) > 0) {
    unit.extraActionsRemaining--;
  } else {
    unit.moved = true;
  }

  // No-target actions — dispatch immediately via ACTION_REGISTRY
  if (unit.id === 'sergeant') {
    const result = _dispatchAction(unit, s, []);
    const actorAfter = result.units.find(u => u.uid === unit.uid);
    fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    return result;
  }
  if (unit.id === 'grovewarden') {
    const result = _dispatchAction(unit, s, []);
    const actorAfter = result.units.find(u => u.uid === unit.uid);
    fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    return result;
  }
  if (unit.id === 'darkdealer') {
    const result = _dispatchAction(unit, s, []);
    checkWinner(result);
    const actorAfter = result.units.find(u => u.uid === unit.uid);
    fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    return result;
  }
  if (unit.id === 'siegemound') {
    const result = _dispatchAction(unit, s, []);
    checkWinner(result);
    const actorAfter = result.units.find(u => u.uid === unit.uid);
    fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    return result;
  }

  // Target-needing actions — use pendingSpell for UI target collection,
  // then resolveSpell routes to _dispatchAction via ACTION_REGISTRY.
  if (unit.id === 'woodlandguard') {
    s.pendingSpell = { cardUid: unit.uid, effect: 'woodlandguard_action', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid, paid: true } };
    return s;
  }
  if (unit.id === 'packrunner') {
    s.pendingSpell = { cardUid: unit.uid, effect: 'packrunner_action', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid, paid: true } };
    return s;
  }
  if (unit.id === 'elfarcher') {
    s.pendingSpell = { cardUid: unit.uid, effect: 'elfarcher_action', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid, paid: true } };
    return s;
  }

  if (unit.id === 'rootsongcommander') {
    s.pendingSpell = { cardUid: unit.uid, effect: 'elfTribalBuff', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid, paid: true } };
    return s;
  }

  if (unit.id === 'bloodaltar') {
    s.pendingSpell = { cardUid: unit.uid, effect: 'bloodaltar_action', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid, paid: true } };
    return s;
  }

  // Vorn: board tile selection — highlights adjacent tiles for player to click
  if (unit.id === 'vornthundercaller') {
    s.pendingDirectionSelect = { unitUid: unit.uid };
    return s;
  }

  // The Iron Queen: direction selection — same tile selection flow as Vorn
  if (unit.id === 'ironqueen') {
    s.pendingDirectionSelect = { unitUid: unit.uid };
    return s;
  }

  // Mana Cannon: direction selection — uses same pendingDirectionSelect / direction_tile_select flow as Vorn
  if (unit.id === 'manacannon') {
    if ((s.players[s.activePlayer].resources || 0) < 1) {
      // Insufficient mana — abort (unit.moved already set to true; undo it)
      unit.moved = false;
      s.players[s.activePlayer].commandsUsed = Math.max(0, (s.players[s.activePlayer].commandsUsed ?? 1) - 1);
      return s;
    }
    s.pendingDirectionSelect = { unitUid: unit.uid };
    return s;
  }

  // Azulon: untargeted — sets spellEchoActive flag
  if (unit.id === 'azulonsilvertide') {
    const result = _dispatchAction(unit, s, []);
    const actorAfter = result.units.find(u => u.uid === unit.uid);
    fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    return result;
  }

  // Tangleroot Yew: untargeted — roots all adjacent enemy combat units
  if (unit.id === 'tanglerootypew') {
    const result = _dispatchAction(unit, s, []);
    const actorAfter = result.units.find(u => u.uid === unit.uid);
    fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    return result;
  }

  // Clockwork Manimus: targeted 2-damage action
  if (unit.id === 'clockworkmanimus') {
    s.pendingSpell = { cardUid: unit.uid, effect: 'clockworkmanimus_action', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid, paid: true } };
    return s;
  }

  // Fennwick: untargeted scry — reveals top card via pendingDeckPeek
  if (unit.id === 'fennwickthequiet') {
    const result = _dispatchAction(unit, s, []);
    const actorAfter = result.units.find(u => u.uid === unit.uid);
    fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: actorAfter || unit, triggeringUid: unit.uid }, result);
    return result;
  }

  return s;
}

// ── unit movement ──────────────────────────────────────────────────────────

export function getUnitMoveTiles(state, unitUid) {
  const unit = state.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== state.activePlayer) return [];
  // Relics, revealed omens, effective SPD 0, and rooted units cannot move.
  // Hidden units use getEffectiveSpd which returns 1 regardless of base SPD,
  // so Shadow Trap Hole, Dread Mirror, and any future hidden units with spd 0
  // can move 1 tile while hidden and revert to their base SPD on reveal.
  if (unit.isRelic || (unit.isOmen && !unit.hidden) || getEffectiveSpd(unit, state) === 0 || unit.rooted) return [];
  if (unit.summoned || unit.moved) {
    return [];
  }
  const speed = getEffectiveSpd(unit, state);
  return reachableTiles(state, unit, speed);
}

function reachableTiles(state, unit, speed) {
  const result = [];
  for (let nr = 0; nr < 5; nr++) {
    for (let nc = 0; nc < 5; nc++) {
      const dist = Math.abs(nr - unit.row) + Math.abs(nc - unit.col);
      if (dist === 0 || dist > speed) continue;
      const friendlyOccupied = isTileOccupiedByFriendly(state, unit.owner, nr, nc);
      if (friendlyOccupied) continue;
      const enemyUnit = state.units.find(u => u.owner !== unit.owner && u.row === nr && u.col === nc);
      const enemyChamp = state.champions.find(ch => ch.owner !== unit.owner && ch.row === nr && ch.col === nc);
      if (unit.canAttack === false && (enemyUnit || enemyChamp)) continue;
      result.push([nr, nc]);
    }
  }
  return result;
}

function findIntermediateTile(state, unit, champRow, champCol) {
  const champNeighbors = cardinalNeighbors(champRow, champCol);
  const onPath = champNeighbors.find(([r, c]) =>
    manhattan([unit.row, unit.col], [r, c]) === 1 && !isTileOccupied(state, r, c)
  );
  if (onPath) return onPath;
  return champNeighbors.find(([r, c]) => !isTileOccupied(state, r, c)) || [unit.row, unit.col];
}

// Returns valid approach tiles for a SPD 2 attacker targeting an enemy 2 tiles away.
// An approach tile is adjacent to the target, unoccupied, and exactly 1 step from the attacker.
export function getApproachTiles(state, unit, targetRow, targetCol) {
  return cardinalNeighbors(targetRow, targetCol).filter(([r, c]) =>
    !isTileOccupied(state, r, c) && manhattan([unit.row, unit.col], [r, c]) === 1
  );
}

function isTileOccupiedByFriendly(state, owner, row, col) {
  return state.units.some(u => u.owner === owner && u.row === row && u.col === col)
      || state.champions.some(c => c.owner === owner && c.row === row && c.col === col);
}

export function moveUnit(state, unitUid, row, col) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit) return s;

  // Command gate: player-directed unit moves cost 1 command (2 for doubleCommandCost); champion moves are exempt
  if (unit.owner === s.activePlayer) {
    const moveCmdCost = unit.doubleCommandCost ? 2 : 1;
    if ((s.players[s.activePlayer].commandsUsed ?? 0) + moveCmdCost > 3) return s;
    s.players[s.activePlayer].commandsUsed = (s.players[s.activePlayer].commandsUsed ?? 0) + moveCmdCost;
  }

  // Check for enemy omen on destination tile
  const enemyOmen = s.units.find(u => u.owner !== unit.owner && u.isOmen && u.row === row && u.col === col);
  if (enemyOmen) {
    if (enemyOmen.id === 'dreadmirror' && enemyOmen.hidden) {
      const result = handleDreadMirrorReveal(s, enemyOmen, unit, false);
      if (result === 'revealer_died') return s; // unit died — omen stays revealed on board
      // omen_destroyed: unit survived, place it on the tile
      const uu = s.units.find(u => u.uid === unitUid);
      if (uu) {
        uu.row = row;
        uu.col = col;
        if (uu.id === 'ironqueen') {
          uu.ironQueenActionsUsed = (uu.ironQueenActionsUsed ?? 0) + 1;
          if (uu.ironQueenActionsUsed >= 2) uu.moved = true;
        } else if ((uu.extraActionsRemaining ?? 0) > 0) {
          uu.extraActionsRemaining--;
        } else {
          uu.moved = true;
        }
      }
      updateWildbornAura(s);
      updateStandardBearerAura(s);
      return s;
    }
    // Normal omen: destroy it with no combat
    addLog(s, `${unit.name} moves through ${enemyOmen.name}! The omen is destroyed.`);
    destroyUnit(enemyOmen, s, 'omen_removed');
    const liveUnit = s.units.find(u => u.uid === unitUid);
    if (liveUnit) {
      liveUnit.row = row;
      liveUnit.col = col;
      if (liveUnit.id === 'ironqueen') {
        liveUnit.ironQueenActionsUsed = (liveUnit.ironQueenActionsUsed ?? 0) + 1;
        if (liveUnit.ironQueenActionsUsed >= 2) liveUnit.moved = true;
      } else if ((liveUnit.extraActionsRemaining ?? 0) > 0) {
        liveUnit.extraActionsRemaining--;
      } else {
        liveUnit.moved = true;
      }
    }
    updateWildbornAura(s);
    updateStandardBearerAura(s);
    return s;
  }

  const enemyUnit = s.units.find(u => u.owner !== unit.owner && u.row === row && u.col === col);
  const enemyChamp = s.champions.find(ch => ch.owner !== unit.owner && ch.row === row && ch.col === col);
  const combatTile = [row, col];

  if (enemyUnit) {
    // Reveal hidden attacking unit before combat (e.g. Veil Fiend moving into enemy tile).
    // Reveal tile is the destination; the defender is the excluded combat unit.
    const wasHiddenAttacker = unit.hidden;
    if (unit.hidden) {
      revealUnit(s, unit, enemyUnit, [row, col]);
    }
    // Special reveal effects for hidden attackers targeting enemy units.
    // These units stay on original tile after revealing — no normal combat.
    if (wasHiddenAttacker) {
      if (unit.id === 'shadowtrap') {
        // Shadow Trap: destroy the enemy unit, stay on original tile revealed as 1/1 SPD 0
        addLog(s, `Shadow Trap revealed. ${enemyUnit.name} destroyed.`);
        destroyUnit(enemyUnit, s, 'shadowtrap');
        const liveTrap = s.units.find(u => u.uid === unitUid);
        if (liveTrap) liveTrap.moved = true;
        updateWildbornAura(s);
        updateStandardBearerAura(s);
        return s;
      }
      if (unit.id === 'veilfiend' || unit.id === 'dreadshade') {
        // Reveal effects already fired in revealUnit; stay on original tile, no combat
        const liveUnit = s.units.find(u => u.uid === unitUid);
        if (liveUnit) liveUnit.moved = true;
        updateWildbornAura(s);
        updateStandardBearerAura(s);
        return s;
      }
    }
    // Reveal hidden enemy unit before resolving combat
    const wasHidden = enemyUnit.hidden;

    // Veilbreaker: destroy hidden enemy unit immediately without triggering the reveal sequence
    if (wasHidden && unit.id === 'veilbreaker') {
      addLog(s, `Veilbreaker strikes through the veil! ${enemyUnit.name} is destroyed without reveal.`);
      destroyUnit(enemyUnit, s, 'combat');
      const liveUnit = s.units.find(u => u.uid === unitUid);
      if (liveUnit) {
        liveUnit.row = row;
        liveUnit.col = col;
        if ((liveUnit.extraActionsRemaining ?? 0) > 0) {
          liveUnit.extraActionsRemaining--;
        } else {
          liveUnit.moved = true;
        }
      }
      updateWildbornAura(s);
      updateStandardBearerAura(s);
      return s;
    }

    if (wasHidden) revealUnit(s, enemyUnit, unit);

    // Shadow Trap on reveal: destroy the attacker
    if (wasHidden && enemyUnit.id === 'shadowtrap' && s.units.find(u => u.uid === enemyUnit.uid)) {
      addLog(s, `Shadow Trap Hole springs! ${unit.name} is destroyed.`);
      destroyUnit(unit, s, 'shadowtrap');
      // Shadow Trap is now revealed (no longer hidden) but stays
      return s;
    }

    // SPD 2 approach: if attacker is exactly 2 tiles away, slide to adjacent approach tile first
    const attackDist = manhattan([unit.row, unit.col], [row, col]);
    if (attackDist === 2) {
      const approachOptions = getApproachTiles(s, unit, row, col);
      if (approachOptions.length === 0) return s; // no valid approach — abort
      const [ar, ac] = approachOptions[0];
      unit.row = ar;
      unit.col = ac;
    }

    const attackerAtk = getEffectiveAtk(s, unit, combatTile);
    const defenderAtk = getEffectiveAtk(s, enemyUnit, combatTile);
    addLog(s, `${unit.name} attacks ${enemyUnit.name}!`);
    // Fortitude: reduce damage to defending enemy unit if they're Light/ascended and within 2 of their champion
    const enemyFortRed = getFortitudeReduction(s, enemyUnit);
    const effectiveAttackerAtk = enemyFortRed > 0 && attackerAtk > 0 ? Math.max(1, attackerAtk - enemyFortRed) : attackerAtk;
    if (enemyFortRed > 0 && attackerAtk > 0) addLog(s, `Fortitude: ${enemyUnit.name} takes 1 less damage.`);
    applyDamageToUnit(s, enemyUnit, effectiveAttackerAtk, unit.name, combatTile);

    const stillAlive = s.units.find(u => u.uid === unitUid);
    if (stillAlive) {
      // Fortitude: reduce counter-damage to attacking unit if they're Light/ascended and within 2 of their champion
      const attackerFortRed = getFortitudeReduction(s, stillAlive);
      const effectiveDefenderAtk = attackerFortRed > 0 && defenderAtk > 0 ? Math.max(1, defenderAtk - attackerFortRed) : defenderAtk;
      if (attackerFortRed > 0 && defenderAtk > 0) addLog(s, `Fortitude: ${stillAlive.name} takes 1 less damage.`);
      applyDamageToUnit(s, stillAlive, effectiveDefenderAtk, enemyUnit.name, combatTile);
      const stillAlive2 = s.units.find(u => u.uid === unitUid);
      if (stillAlive2) {
        const defenderDestroyed = !s.units.find(u => u.uid === enemyUnit.uid);
        if (defenderDestroyed && !stillAlive2.rooted) {
          stillAlive2.row = row;
          stillAlive2.col = col;
        }
        if (stillAlive2.id === 'ironqueen') {
          stillAlive2.ironQueenActionsUsed = (stillAlive2.ironQueenActionsUsed ?? 0) + 1;
          if (stillAlive2.ironQueenActionsUsed >= 2) stillAlive2.moved = true;
        } else if ((stillAlive2.extraActionsRemaining ?? 0) > 0) {
          stillAlive2.extraActionsRemaining--;
        } else {
          stillAlive2.moved = true;
        }
      }
    }
    // Iron Shield is a one-battle effect: clear any remaining shield after combat resolves
    const survivingAttacker = s.units.find(u => u.uid === unitUid);
    if (survivingAttacker && survivingAttacker.shield > 0) {
      addLog(s, `${survivingAttacker.name}'s Iron Shield fades after combat.`);
      survivingAttacker.shield = 0;
    }
    const survivingDefender = s.units.find(u => u.uid === enemyUnit.uid);
    if (survivingDefender && survivingDefender.shield > 0) {
      addLog(s, `${survivingDefender.name}'s Iron Shield fades after combat.`);
      survivingDefender.shield = 0;
    }
    // Fire attack triggers (Whisper, Crossbowman, Razorfang)
    const killedDefender = !s.units.find(u => u.uid === enemyUnit.uid);
    fireAttackTriggers(unit, enemyUnit, s, killedDefender);
    // Declarative trigger: onFriendlyAction / onFriendlyCommand — fired after attacker completes combat
    const attackerAfterCombat = s.units.find(u => u.uid === unitUid);
    if (attackerAfterCombat) {
      fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: attackerAfterCombat, triggeringUid: unitUid }, s);
      fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: attackerAfterCombat, triggeringUid: unitUid }, s);
    }
  } else if (enemyChamp) {
    // Reveal hidden attacking unit before champion combat
    const wasHiddenChampAttacker = unit.hidden;
    if (unit.hidden) {
      revealUnit(s, unit, null, [row, col]);
    }
    // Special reveal effects for hidden attackers targeting the champion.
    // These units stay on original tile after revealing — no normal champion combat,
    // except Shadow Trap which deals 1 damage to make hidden uniform across the pool.
    if (wasHiddenChampAttacker) {
      if (unit.id === 'shadowtrap') {
        // Shadow Trap vs champion: deal 1 damage, stay on original tile
        enemyChamp.hp -= 1;
        addLog(s, `Shadow Trap revealed. ${s.players[enemyChamp.owner].name}'s champion takes 1 damage.`);
        const liveTrap = s.units.find(u => u.uid === unitUid);
        if (liveTrap) liveTrap.moved = true;
        checkWinner(s);
        updateWildbornAura(s);
        updateStandardBearerAura(s);
        return s;
      }
      if (unit.id === 'veilfiend' || unit.id === 'dreadshade') {
        // Reveal effects already fired in revealUnit; stay on original tile, no champion combat
        const liveUnit = s.units.find(u => u.uid === unitUid);
        if (liveUnit) liveUnit.moved = true;
        updateWildbornAura(s);
        updateStandardBearerAura(s);
        return s;
      }
    }
    const attackerAtk = getEffectiveAtk(s, unit, combatTile);
    const dist = manhattan([unit.row, unit.col], [row, col]);
    if (dist > 1) {
      const [mr, mc] = findIntermediateTile(s, unit, row, col);
      unit.row = mr;
      unit.col = mc;
    }
    let champDmg = attackerAtk;
    // Waddles: cap incoming combat damage at 2 if adjacent to champion
    if (s.waddlesActive && s.waddlesActive[enemyChamp.owner]) {
      const waddlesUnit = s.units.find(u => u.owner === enemyChamp.owner && u.id === 'waddles');
      if (waddlesUnit && manhattan([waddlesUnit.row, waddlesUnit.col], [enemyChamp.row, enemyChamp.col]) === 1) {
        champDmg = Math.min(champDmg, 2);
      }
    }
    if (enemyChamp.thornShield) {
      const absorbed = Math.min(enemyChamp.thornShield.absorb, champDmg);
      champDmg -= absorbed;
      const thornDmg = enemyChamp.thornShield.thornDamage;
      addLog(s, `Iron Thorns absorbs ${absorbed} damage. Attacker takes ${thornDmg} damage.`);
      applyDamageToUnit(s, unit, thornDmg, 'Iron Thorns');
      enemyChamp.thornShield = null;
    }
    enemyChamp.hp -= champDmg;
    addLog(s, `${unit.name} attacks ${s.players[enemyChamp.owner].name}'s champion for ${champDmg} damage.`);

    const unitAfterThorn = s.units.find(u => u.uid === unitUid);
    if (unitAfterThorn) {
      if (unitAfterThorn.id === 'ironqueen') {
        unitAfterThorn.ironQueenActionsUsed = (unitAfterThorn.ironQueenActionsUsed ?? 0) + 1;
        if (unitAfterThorn.ironQueenActionsUsed >= 2) unitAfterThorn.moved = true;
      } else if ((unitAfterThorn.extraActionsRemaining ?? 0) > 0) {
        unitAfterThorn.extraActionsRemaining--;
      } else {
        unitAfterThorn.moved = true;
      }
    }
    // Fire attack triggers (Dread Knight)
    if (champDmg > 0) fireAttackTriggers(unit, enemyChamp, s, false);
    checkWinner(s);
    // Declarative trigger: onFriendlyAction / onFriendlyCommand — fired after attacker completes champion combat
    const attackerAfterChampCombat = s.units.find(u => u.uid === unitUid);
    if (attackerAfterChampCombat) {
      fireTrigger('onFriendlyAction', { playerIndex: unit.owner, actingUnit: attackerAfterChampCombat, triggeringUid: unitUid }, s);
      fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: attackerAfterChampCombat, triggeringUid: unitUid }, s);
    }
  } else {
    // Regular move — hidden units (including shadow-veil'd) do not reveal on move
    unit.row = row;
    unit.col = col;
    if (unit.id === 'ironqueen') {
      unit.ironQueenActionsUsed = (unit.ironQueenActionsUsed ?? 0) + 1;
      if (unit.ironQueenActionsUsed >= 2) unit.moved = true;
    } else if ((unit.extraActionsRemaining ?? 0) > 0) {
      unit.extraActionsRemaining--;
    } else {
      unit.moved = true;
    }
    // Terrain onOccupy: trigger when unit moves onto a terrain tile
    const movedUnit = s.units.find(u => u.uid === unitUid);
    if (movedUnit) fireTerrainOnOccupy(s, movedUnit, row, col);
    // onFriendlyCommand: fire for non-combat moves (movement costs a command)
    const unitAfterMove = s.units.find(u => u.uid === unitUid);
    if (unitAfterMove && unit.owner === s.activePlayer) {
      fireTrigger('onFriendlyCommand', { playerIndex: unit.owner, actingUnit: unitAfterMove, triggeringUid: unitUid }, s);
    }
  }

  // Gavriel, Holy Stride: consecrate the tile Gavriel moved to as Hallowed Ground
  const gavriel = s.units.find(u => u.uid === unitUid && u.id === 'gavrielholystride');
  if (gavriel) {
    if (!s.terrainGrid) s.terrainGrid = Array.from({ length: 5 }, () => Array(5).fill(null));
    s.terrainGrid[gavriel.row][gavriel.col] = {
      id: 'hallowed',
      whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'light', combatOnly: true },
      ownerName: 'Gavriel, Holy Stride',
      cardId: 'hallowed_ground',
    };
    addLog(s, `Gavriel consecrates the ground.`);
  }

  updateWildbornAura(s);
  updateStandardBearerAura(s);
  return s;
}

// Move a SPD 2 unit to a player-chosen approach tile, then resolve combat with the target.
// Used when multiple approach tiles exist and the player selects one.
export function executeApproachAndAttack(state, unitUid, approachRow, approachCol, targetRow, targetCol) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit) return s;

  // Command gate: counts as a single command for the whole approach+attack (2 for doubleCommandCost)
  const approachCmdCost = unit.doubleCommandCost ? 2 : 1;
  if (unit.owner === s.activePlayer) {
    if ((s.players[s.activePlayer].commandsUsed ?? 0) + approachCmdCost > 3) return s;
    s.players[s.activePlayer].commandsUsed = (s.players[s.activePlayer].commandsUsed ?? 0) + approachCmdCost;
  }

  // Move unit to the chosen approach tile
  unit.row = approachRow;
  unit.col = approachCol;

  // Temporarily undo the increment so moveUnit's own gate doesn't double-count
  s.players[unit.owner].commandsUsed = (s.players[unit.owner].commandsUsed ?? approachCmdCost) - approachCmdCost;

  // Resolve combat from approach tile (unit is now adjacent to target)
  return moveUnit(s, unitUid, targetRow, targetCol);
}

export function applyDamageToUnit(state, unit, dmg, sourceName, combatTile = null) {
  let actualDmg = dmg;
  if (unit.shield > 0) {
    const absorbed = Math.min(unit.shield, dmg);
    unit.shield -= absorbed;
    actualDmg -= absorbed;
    addLog(state, `${unit.name}'s shield absorbs ${absorbed} damage.`);
    if (unit.shield === 0) addLog(state, `${unit.name}'s shield breaks.`);
  }
  unit.hp -= actualDmg;
  if (actualDmg > 0) addLog(state, `${unit.name} takes ${actualDmg} damage (${unit.hp}/${unit.maxHp} HP).`);
  // Fire onDamageTaken before death check — allows bounce-before-death effects (e.g. Shimmer Guardian).
  if (actualDmg > 0) {
    fireTrigger('onDamageTaken', {
      damagedUnit: unit,
      damagedPlayerIndex: unit.owner,
      triggeringUid: unit.uid,
    }, state);
    // If the unit was removed from the board (e.g. returned to hand), skip death processing.
    if (!state.units.find(u => u.uid === unit.uid)) return;
  }
  if (unit.hp <= 0) {
    destroyUnit(unit, state, 'combat', undefined, combatTile);
  }
}

// Elf Archer ranged shot — player opts to skip move
export function archerShoot(state, archerUid, targetUid) {
  const s = cloneState(state);
  const archer = s.units.find(u => u.uid === archerUid);
  const target = s.units.find(u => u.uid === targetUid);
  if (!archer || !target) return s;
  if (archer.moved || archer.summoned) return s;
  if (manhattan([archer.row, archer.col], [target.row, target.col]) > 2) return s;

  // Command gate: archer ranged shot costs 1 command
  if ((s.players[s.activePlayer].commandsUsed ?? 0) >= 3) return s;
  s.players[s.activePlayer].commandsUsed = (s.players[s.activePlayer].commandsUsed ?? 0) + 1;

  archer.moved = true;
  s.archerShot.push(archerUid);
  applyDamageToUnit(s, target, 2, archer.name);
  addLog(s, `Elf Archer fires at ${target.name}!`);
  return s;
}

// ── end phase ──────────────────────────────────────────────────────────────

export function endActionAndTurn(state) {
  return endTurn(endActionPhase(state));
}

export function endTurn(state) {
  const s = cloneState(state);
  const p = s.players[s.activePlayer];

  // END TURN TRIGGERS
  fireEndTurnTriggers(s, s.activePlayer);
  if (s.winner) return s;
  // Clockwork Manimus (or any discardOrDie trigger) may set pendingHandSelect.
  // If so, pause turn advance and wait for the player to choose a card.
  if (s.pendingHandSelect) return s;

  // Hand limit: 6
  if (p.hand.length > 6) {
    if (s.activePlayer === 1) {
      while (p.hand.length > 6) {
        const lowestIdx = p.hand.reduce((minIdx, c, i, arr) => c.cost < arr[minIdx].cost ? i : minIdx, 0);
        const [discarded] = p.hand.splice(lowestIdx, 1);
        p.discard.push(discarded);
        addLog(s, `${p.name} discards ${discarded.name} (hand limit).`);
      }
    } else {
      s.pendingDiscard = true;
      addLog(s, `${p.name} has too many cards. Click a card to discard.`);
      return s;
    }
  }

  return completeTurnAdvance(s);
}

export function completeTurnAdvance(state) {
  const s = state;
  const champ = s.champions[s.activePlayer];

  s.pendingDiscard = false;

  // Clear per-turn state for active player's units
  s.units.forEach(u => {
    if (u.owner === s.activePlayer) {
      u.speedBonus = 0;
      u.turnAtkBonus = 0;
      u.extraActionsRemaining = 0;
      u.rooted = false;
      // Clear fortify bonus (revert temporary HP increase)
      if (u.fortifyBonus) {
        u.hp = Math.max(1, u.hp - u.fortifyBonus);
        u.fortifyBonus = 0;
      }
      // Clear verdant surge bonus (revert temporary HP increase)
      if (u.verdantSurgeBonus) {
        u.hp = Math.max(1, u.hp - u.verdantSurgeBonus);
        u.verdantSurgeBonus = 0;
      }
      // Clear elf tribal buff HP bonus (Rootsong Commander action)
      if (u.elfTribalHpBonus) {
        u.hp = Math.max(1, u.hp - u.elfTribalHpBonus);
        u.elfTribalHpBonus = 0;
      }
      // Clear Shield ability HP bonus
      if (u.shieldHpBonus) {
        u.hp = Math.max(1, u.hp - u.shieldHpBonus);
        u.maxHp = Math.max(1, u.maxHp - u.shieldHpBonus);
        u.shieldHpBonus = 0;
      }
    }
  });

  // Clear pestilence bonus on ALL units (affects enemy units, expires at end of caster's turn)
  s.units.forEach(u => {
    if (u.pestilenceBonus) {
      u.hp = Math.min(u.maxHp, u.hp + u.pestilenceBonus);
      u.pestilenceBonus = 0;
    }
  });

  // Reset champion ability used flag
  if (s.championAbilityUsed) s.championAbilityUsed[s.activePlayer] = false;

  // Clear champion per-turn bonuses
  if (champ.turnAtkBonus) champ.turnAtkBonus = 0;
  if (champ.verdantSurgeBonus) {
    champ.hp = Math.max(1, champ.hp - champ.verdantSurgeBonus);
    champ.verdantSurgeBonus = 0;
  }

  s.archerShot = [];
  s.recalledThisTurn = [];
  s.players[s.activePlayer].sergeantBuff = false;
  s.players[s.activePlayer].spellEchoActive = false;
  if (s.pendingShadowVeil) s.pendingShadowVeil[s.activePlayer] = false;
  if (s.graveAccessActive) s.graveAccessActive[s.activePlayer] = false;
  if (s.championStunned) s.championStunned[s.activePlayer] = false;
  s.pendingLineBlast = null;
  s.pendingDirectionSelect = null;

  champ.moved = false;

  const nextPlayer = 1 - s.activePlayer;
  s.activePlayer = nextPlayer;
  if (nextPlayer === 0) s.turn++;

  s.phase = 'begin-turn';
  addLog(s, `--- Turn ${s.turn}: ${s.players[nextPlayer].name}'s turn ---`);

  return autoAdvancePhase(s);
}

export function discardCard(state, cardUid) {
  const s = cloneState(state);
  const p = s.players[s.activePlayer];
  const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return s;

  const [discarded] = p.hand.splice(cardIdx, 1);
  p.discard.push(discarded);
  addLog(s, `${p.name} discards ${discarded.name}.`);

  // Hand size decreased — check if any conditional HP buff units now have effective HP <= 0
  checkConditionalStatDeaths(s);

  if (p.hand.length <= 6) {
    return completeTurnAdvance(s);
  }

  return s;
}

export function checkWinner(state) {
  for (const champ of state.champions) {
    if (champ.hp <= 0) {
      const winner = state.players[1 - champ.owner];
      state.winner = winner.name;
      addLog(state, `Game over! ${winner.name} wins!`);
    }
  }
}

// ── valid spell targets ─────────────────────────────────────────────────────

export function getSpellTargets(state, effect, step = 0, data = {}) {
  const raw = _rawSpellTargets(state, effect, step, data);
  return raw.filter(uid => {
    if (!uid || uid.startsWith('champion')) return true;
    const u = state.units.find(u => u.uid === uid);
    return !u || !isAuraSpellImmune(state, u);
  });
}

function _rawSpellTargets(state, effect, step = 0, data = {}) {
  const champ = state.champions[state.activePlayer];
  const p = state.players[state.activePlayer];

  switch (effect) {
    // Smite: enemy within 2 tiles of champion (not hidden, not omen, not spell-immune)
    case 'smite':
      return state.units
        .filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);

    // Forge Weapon, Iron Shield, Savage Growth: friendly units (not hidden, not spell-immune)
    case 'forgeweapon':
    case 'ironshield':
      return state.units.filter(u => u.owner === state.activePlayer && !u.hidden && !u.spellImmune).map(u => u.uid);
    case 'savagegrowth':
      return state.units.filter(u => u.owner === state.activePlayer && !u.isRelic && !u.isOmen && !u.hidden && !u.spellImmune).map(u => u.uid);
    // Recall: any combat unit (friendly or enemy), not a relic/omen, not spell-immune
    case 'recall':
      return state.units.filter(u => !u.isRelic && !u.isOmen && !u.hidden && !u.spellImmune).map(u => u.uid);
    // Glittering Gift: friendly combat unit (not relic, not omen, not hidden, not spell-immune)
    case 'glitteringgift':
      return state.units.filter(u => u.owner === state.activePlayer && !u.isRelic && !u.isOmen && !u.hidden && !u.spellImmune).map(u => u.uid);
    case 'moonleaf':
      return state.units.filter(u => u.owner === state.activePlayer && !u.hidden && u.type === 'unit' && !u.spellImmune).map(u => u.uid);

    // Bloom step 0: friendly unit or champion; step 1: enemy unit (not omen, not spell-immune)
    case 'bloom':
      if (step === 0) return ['champion' + state.activePlayer, ...state.units.filter(u => u.owner === state.activePlayer && !u.hidden && !u.spellImmune).map(u => u.uid)];
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune).map(u => u.uid);

    // Entangle: friendly Elf unit
    case 'entangle':
      return state.units.filter(u => u.owner === state.activePlayer && unitTypes(u).includes('Elf') && !u.hidden).map(u => u.uid);

    // Predator's Mark: always targets enemy champion
    case 'predatorsmark':
      return ['champion' + (1 - state.activePlayer)];

    // Pounce: any friendly Primal combat unit (resets its action)
    case 'pounce':
      return state.units.filter(u => u.owner === state.activePlayer && u.attribute === 'primal' && !u.isOmen && !u.isRelic).map(u => u.uid);

    // Ambush step 0: any friendly combat unit; step 1: enemy adjacent to selected unit (not omen)
    case 'ambush':
      if (step === 0) return state.units.filter(u => u.owner === state.activePlayer).map(u => u.uid);
      if (data.beastUid) {
        const beast = state.units.find(u => u.uid === data.beastUid);
        if (!beast) return [];
        const adj = cardinalNeighbors(beast.row, beast.col);
        return state.units.filter(u => u.owner !== state.activePlayer && !u.isOmen && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
      }
      return [];

    // Blood Offering step 0: friendly unit; step 1: any enemy (not omen, not spell-immune)
    case 'bloodoffering':
      if (step === 0) return state.units.filter(u => u.owner === state.activePlayer).map(u => u.uid);
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune).map(u => u.uid);

    // Pact of Ruin damage: any enemy unit or enemy champion (not omen, not spell-immune)
    case 'pactofruin_damage':
      return [
        'champion' + (1 - state.activePlayer),
        ...state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune).map(u => u.uid),
      ];

    // Dark Sentence: any enemy unit (not omen, not spell-immune)
    case 'darksentence':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune).map(u => u.uid);

    // Devour: enemy with 2 or less HP (not omen, not spell-immune)
    case 'devour':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune && u.hp <= 2).map(u => u.uid);

    // Soul Drain: enemy unit (not omen, not spell-immune)
    case 'souldrain':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune).map(u => u.uid);

    // Spirit Bolt: any enemy unit or the enemy champion
    case 'spiritbolt':
      return [
        'champion' + (1 - state.activePlayer),
        ...state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune).map(u => u.uid),
      ];

    // Apex Rampage: friendly combat unit (not relic, not omen, not hidden, not spell-immune)
    case 'apexrampage':
      return state.units.filter(u =>
        u.owner === state.activePlayer && !u.hidden && !u.isRelic && !u.isOmen && !u.spellImmune
      ).map(u => u.uid);

    // Crushing Blow: enemy combat unit adjacent (distance 1) to own champion (not relic, not omen, not spell-immune)
    case 'crushingblow':
      return state.units.filter(u =>
        u.owner !== state.activePlayer &&
        !u.hidden &&
        !u.isRelic &&
        !u.isOmen &&
        !u.cannotBeTargetedBySpells &&
        !u.spellImmune &&
        manhattan([champ.row, champ.col], [u.row, u.col]) === 1
      ).map(u => u.uid);

    // Woodland Guard action: enemy within 2 tiles (not omen, not spell-immune)
    case 'woodlandguard_action': {
      const src = state.units.find(u => u.uid === (data.sourceUid || ''));
      if (!src) return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune).map(u => u.uid);
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune && manhattan([src.row, src.col], [u.row, u.col]) <= 2).map(u => u.uid);
    }

    // Battle Priest summon trigger step 0: enemy within 1 tile (not omen, not spell-immune); step 1: friendly within 1 tile
    case 'battlepriestunit_summon': {
      const priest = state.units.find(u => u.uid === (data.sourceUid || ''));
      if (!priest) return [];
      const adj = cardinalNeighbors(priest.row, priest.col);
      if (step === 0) {
        return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
      }
      return state.units.filter(u => u.owner === state.activePlayer && u.uid !== priest.uid && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
    }

    // Pack Runner action: friendly unit (not packrunner itself)
    case 'packrunner_action':
      return state.units.filter(u => u.owner === state.activePlayer && u.id !== 'packrunner').map(u => u.uid);

    // Elf Archer action: enemy within 2 tiles (not omen)
    case 'elfarcher_action': {
      const archer = data.sourceUid ? state.units.find(u => u.uid === data.sourceUid) : null;
      if (!archer) return [];
      return state.units.filter(u => u.owner !== state.activePlayer && !u.isOmen && manhattan([archer.row, archer.col], [u.row, u.col]) <= 2).map(u => u.uid);
    }

    // Blood Altar action: adjacent friendly combat unit (not the altar itself)
    case 'bloodaltar_action': {
      const altar = data.sourceUid ? state.units.find(u => u.uid === data.sourceUid) : null;
      if (!altar) return [];
      const adj = cardinalNeighbors(altar.row, altar.col);
      return state.units.filter(u =>
        u.owner === state.activePlayer &&
        u.uid !== altar.uid &&
        !u.isRelic &&
        !u.isOmen &&
        adj.some(([r, c]) => u.row === r && u.col === c)
      ).map(u => u.uid);
    }

    // Clockwork Manimus action: any enemy combat unit (not omen, not relic, not spell-immune)
    case 'clockworkmanimus_action':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.isRelic && !u.isOmen && !u.hidden && !u.cannotBeTargetedBySpells && !u.spellImmune).map(u => u.uid);

    // Petrify: enemy combat unit with 4 or less HP (not relic, not omen, not hidden, not spell-immune)
    case 'petrify':
      return state.units.filter(u =>
        u.owner !== state.activePlayer &&
        !u.isRelic &&
        !u.isOmen &&
        !u.hidden &&
        !u.cannotBeTargetedBySpells && !u.spellImmune &&
        u.hp <= 4
      ).map(u => u.uid);

    // Stand Firm: any friendly combat unit (not hidden, not relic, not omen)
    case 'standfirm':
      return state.units.filter(u =>
        u.owner === state.activePlayer && !u.hidden && !u.isRelic && !u.isOmen
      ).map(u => u.uid);

    // Gilded Cage: any enemy combat unit (not relic, not omen, not hidden, not spell-immune)
    case 'gildedcage':
      return state.units.filter(u =>
        u.owner !== state.activePlayer && !u.hidden && !u.isRelic && !u.isOmen &&
        !u.cannotBeTargetedBySpells && !u.spellImmune
      ).map(u => u.uid);

    // Chains of Light stun target: any enemy combat unit (not relic, not omen, not hidden)
    case 'chainsoflight_summon':
      return state.units.filter(u =>
        u.owner !== state.activePlayer && !u.hidden && !u.isRelic && !u.isOmen
      ).map(u => u.uid);

    // Angelic Blessing: friendly combat unit adjacent (distance 1) to own champion, not relic, not omen, not spell-immune
    case 'angelicblessing':
      return state.units.filter(u =>
        u.owner === state.activePlayer &&
        !u.hidden &&
        !u.isRelic &&
        !u.isOmen &&
        !u.spellImmune &&
        manhattan([champ.row, champ.col], [u.row, u.col]) === 1
      ).map(u => u.uid);

    // Animus: friendly combat unit (not relic, not omen, not hidden, not spell-immune)
    case 'animus':
      return state.units.filter(u =>
        u.owner === state.activePlayer && !u.hidden && !u.isRelic && !u.isOmen && !u.spellImmune
      ).map(u => u.uid);

    // Gore: enemy combat unit (not relic, not omen, not hidden, not spell-immune)
    case 'gore':
      return state.units.filter(u =>
        u.owner !== state.activePlayer && !u.hidden && !u.isRelic && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune
      ).map(u => u.uid);

    // Demolish: any relic or omen on the board (friendly or enemy)
    case 'demolish':
      return state.units.filter(u => u.isRelic || u.isOmen).map(u => u.uid);

    // Mind Seize: enemy combat unit adjacent (distance 1) to own champion (not relic, not omen, not hidden, not spell-immune)
    case 'mindseize':
      return state.units.filter(u =>
        u.owner !== state.activePlayer &&
        !u.hidden &&
        !u.isRelic &&
        !u.isOmen &&
        !u.cannotBeTargetedBySpells &&
        !u.spellImmune &&
        manhattan([champ.row, champ.col], [u.row, u.col]) === 1
      ).map(u => u.uid);

    // Lifebinder summon: any friendly combat unit (not lifebinder itself, not relic, not omen)
    case 'lifebinder_summon': {
      const lifebinder = data.sourceUid ? state.units.find(u => u.uid === data.sourceUid) : null;
      return state.units.filter(u =>
        u.owner === state.activePlayer &&
        (!lifebinder || u.uid !== lifebinder.uid) &&
        !u.isRelic &&
        !u.isOmen
      ).map(u => u.uid);
    }

    // Rootsong Commander action: any friendly combat unit (not relic, not omen)
    case 'elfTribalBuff':
      return state.units.filter(u =>
        u.owner === state.activePlayer &&
        !u.isRelic &&
        !u.isOmen
      ).map(u => u.uid);

    // Toll of Shadows: multi-step caster sacrifice
    // step 0 = sacrifice a friendly combat unit; step 1 = sacrifice omen; step 2 = sacrifice relic
    // step 3 (discard) is handled via pendingHandSelect, not pendingSpell targets
    case 'tollofshadows': {
      const casterIdx = data.casterIdx ?? state.activePlayer;
      if (step === 0) return state.units.filter(u => u.owner === casterIdx && !u.isRelic && !u.isOmen).map(u => u.uid);
      if (step === 1) return state.units.filter(u => u.owner === casterIdx && u.isOmen).map(u => u.uid);
      if (step === 2) return state.units.filter(u => u.owner === casterIdx && u.isRelic).map(u => u.uid);
      return [];
    }

    default:
      return [];
  }
}

// ── spell playability pre-validation ──────────────────────────────────────
// Returns true if the card has at least one valid target given the current
// board state. Used to dim unplayable spells in the hand UI before the player
// even attempts to cast them. Does NOT change state.

export function hasValidTargets(card, state, playerIndex) {
  if (card.type === 'unit') {
    const champ = state.champions[playerIndex];
    return cardinalNeighbors(champ.row, champ.col)
      .some(([r, c]) => !isTileOccupied(state, r, c));
  }

  if (card.type !== 'spell') return true;

  const effect = card.effect;
  const champ = state.champions[playerIndex];
  const enemyUnits = state.units.filter(u => u.owner !== playerIndex && !u.hidden && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune && !isAuraSpellImmune(state, u));
  const friendlyUnits = state.units.filter(u => u.owner === playerIndex && !u.spellImmune && !isAuraSpellImmune(state, u));

  switch (effect) {
    case 'smite':
      return enemyUnits.some(u => manhattan([champ.row, champ.col], [u.row, u.col]) <= 2);

    case 'devour':
      return enemyUnits.some(u => u.hp <= 2);

    case 'darksentence':
      return enemyUnits.length > 0;

    case 'bloodoffering':
      return friendlyUnits.length > 0 && enemyUnits.length > 0;

    case 'pactofruin':
      return state.players[playerIndex].hand.length > 1 && enemyUnits.length > 0;

    case 'entangle': {
      const elfFriendly = friendlyUnits.filter(u => unitTypes(u).includes('Elf') && !u.hidden);
      if (elfFriendly.length === 0) return false;
      return enemyUnits.some(enemy =>
        elfFriendly.some(elf => {
          const adj = cardinalNeighbors(elf.row, elf.col);
          return adj.some(([r, c]) => enemy.row === r && enemy.col === c);
        })
      );
    }

    case 'souldrain':
      return enemyUnits.length > 0;

    case 'bloom': {
      const champBelowMax = champ.hp < champ.maxHp;
      const unitBelowMax = friendlyUnits.some(u => !u.hidden && u.hp < u.maxHp);
      return champBelowMax || unitBelowMax;
    }

    case 'ambush': {
      return friendlyUnits.some(friendly => {
        const adj = cardinalNeighbors(friendly.row, friendly.col);
        return state.units.some(u => u.owner !== playerIndex && adj.some(([r, c]) => u.row === r && u.col === c));
      });
    }

    case 'spiritbolt':
      return !champ.moved; // enemy champion is always a valid target

    case 'apexrampage':
      return state.units.some(u => u.owner === playerIndex && !u.hidden && !u.isRelic && !u.isOmen && !u.spellImmune);

    case 'petrify':
      return enemyUnits.some(u => !u.isRelic && u.hp <= 4);

    case 'rebirth':
      return !champ.moved && state.players[playerIndex].grave.some(u => u.type === 'unit' && !u.token);

    case 'glimpse':
      return !champ.moved;

    case 'crushingblow':
      return !champ.moved && enemyUnits.some(u => !u.isRelic && !u.isOmen && manhattan([champ.row, champ.col], [u.row, u.col]) === 1);

    case 'agonizingsymphony':
      return !champ.moved;

    case 'pestilence':
      return enemyUnits.some(u => !u.isRelic && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2);

    case 'predatorsmark':
      return true; // enemy champion always exists

    case 'martiallaw':
      return enemyUnits.some(u => manhattan([champ.row, champ.col], [u.row, u.col]) <= 2);

    case 'pounce':
      return friendlyUnits.some(u => u.attribute === 'primal' && !u.isOmen && !u.isRelic);

    case 'ironshield':
    case 'forgeweapon':
      return friendlyUnits.some(u => !u.hidden);

    case 'savagegrowth':
      return friendlyUnits.some(u => !u.isRelic && !u.isOmen && !u.hidden);

    case 'moonleaf':
      return friendlyUnits.some(u => !u.hidden && u.type === 'unit');

    case 'standfirm':
      return state.units.some(u => u.owner === playerIndex && !u.hidden && !u.isRelic && !u.isOmen);

    case 'gildedcage':
      return state.units.some(u => u.owner !== playerIndex && !u.hidden && !u.isRelic && !u.isOmen && !u.cannotBeTargetedBySpells && !u.spellImmune);

    case 'angelicblessing': {
      const adjTiles = cardinalNeighbors(state.champions[playerIndex].row, state.champions[playerIndex].col);
      return state.units.some(u =>
        u.owner === playerIndex &&
        !u.hidden &&
        !u.isRelic &&
        !u.isOmen &&
        !u.spellImmune &&
        adjTiles.some(([r, c]) => u.row === r && u.col === c)
      );
    }

    case 'animus':
      return state.units.some(u => u.owner === playerIndex && !u.hidden && !u.isRelic && !u.isOmen && !u.spellImmune);

    case 'glitteringgift':
      return state.units.some(u => u.owner === playerIndex && !u.hidden && !u.isRelic && !u.isOmen && !u.spellImmune);

    case 'recall':
      return state.units.some(u => !u.isRelic && !u.isOmen && !u.hidden && !u.spellImmune);

    case 'amethystcache': {
      const adjTiles = cardinalNeighbors(state.champions[playerIndex].row, state.champions[playerIndex].col);
      return adjTiles.some(([r, c]) =>
        !state.units.some(u => u.row === r && u.col === c) &&
        !state.champions.some(ch => ch.row === r && ch.col === c)
      );
    }

    case 'gore':
      return enemyUnits.some(u => !u.isRelic && !u.isOmen);

    case 'demolish':
      return state.units.some(u => u.isRelic || u.isOmen);

    case 'seconddawn':
      return state.players[playerIndex].grave.some(u => u.type === 'unit' && !u.token);

    default:
      return true;
  }
}

// ── archer shoot targets ───────────────────────────────────────────────────

export function getArcherShootTargets(state, archerUid) {
  const archer = state.units.find(u => u.uid === archerUid);
  if (!archer) return [];
  return state.units
    .filter(u => u.owner !== state.activePlayer && !u.isOmen && manhattan([archer.row, archer.col], [u.row, u.col]) <= 2)
    .map(u => u.uid);
}

// ── champion ability helpers ───────────────────────────────────────────────

export function getChampionDef(player) {
  const attr = FACTION_ATTRIBUTE[player.deckId] ?? 'light';
  return CHAMPIONS[attr] ?? CHAMPIONS.light;
}

export function getChampionAbilityTargets(state, playerIdx, targetFilter) {
  const champ = state.champions[playerIdx];
  switch (targetFilter) {
    case 'friendly_unit_within_2':
      return state.units
        .filter(u => u.owner === playerIdx && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);
    case 'friendly_combat_unit_within_2':
      return state.units
        .filter(u => u.owner === playerIdx && !u.isRelic && !u.isOmen && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);
    case 'friendly_champion_or_unit_within_2': {
      const units = state.units
        .filter(u => u.owner === playerIdx && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);
      return ['champion' + playerIdx, ...units];
    }
    case 'friendly_unit':
      return state.units.filter(u => u.owner === playerIdx && !u.hidden).map(u => u.uid);
    case 'enemy_unit':
      return state.units.filter(u => u.owner !== playerIdx && !u.hidden && !u.isOmen).map(u => u.uid);
    default:
      return [];
  }
}

export function applyChampionAbility(state, playerIdx, abilityId, targetUid) {
  const s = cloneState(state);
  const p = s.players[playerIdx];
  const champ = s.champions[playerIdx];

  // Ability uses the champion's action — cannot activate if champion already moved/acted
  if (champ.moved) return s;

  switch (abilityId) {
    case 'shield': {
      const unit = s.units.find(u => u.uid === targetUid);
      if (!unit) return s;
      const bonus = 2;
      unit.shieldHpBonus = (unit.shieldHpBonus || 0) + bonus;
      unit.hp += bonus;
      unit.maxHp += bonus;
      p.resources -= 2;
      addLog(s, `${p.name} invokes Shield: ${unit.name} gains +2 HP until end of turn.`);
      break;
    }
    case 'howl': {
      const unit = s.units.find(u => u.uid === targetUid);
      if (!unit) return s;
      unit.turnAtkBonus = (unit.turnAtkBonus || 0) + 2;
      p.resources -= 2;
      addLog(s, `${p.name} invokes Howl: ${unit.name} gains +2 ATK until end of turn.`);
      break;
    }
    case 'sapling_summon': {
      const champTile = s.champions[playerIdx];
      const openTiles = cardinalNeighbors(champTile.row, champTile.col).filter(([r, c]) =>
        !s.units.some(u => u.row === r && u.col === c) &&
        !s.champions.some(ch => ch.row === r && ch.col === c)
      );
      if (openTiles.length === 0) return s; // no valid placement — ability unusable
      p.resources -= 2;
      if (openTiles.length === 1) {
        const [r, c] = openTiles[0];
        const sapling = {
          ...TOKENS.sapling,
          owner: playerIdx, row: r, col: c,
          maxHp: TOKENS.sapling.hp,
          summoned: true, moved: false,
          atkBonus: 0, shield: 0, speedBonus: 0, hidden: false, turnAtkBonus: 0,
          uid: `token_sapling_${Math.random().toString(36).slice(2)}`,
        };
        s.units.push(sapling);
        registerUnit(sapling, s);
        addLog(s, `${p.name} invokes Sapling Summon: a Sapling appears at (${r},${c}).`);
      } else {
        s.pendingChampionSaplingPlace = { playerIdx, validTiles: openTiles };
        addLog(s, `${p.name} invokes Sapling Summon: choose an adjacent tile to place a Sapling.`);
      }
      break;
    }
    case 'corrupt': {
      const unit = s.units.find(u => u.uid === targetUid);
      if (!unit) return s;
      unit.hp -= 1;
      p.resources -= 2;
      addLog(s, `${p.name} invokes Corrupt: ${unit.name} takes 1 damage (${unit.hp} HP remaining).`);
      if (unit.hp <= 0) {
        destroyUnit(unit, s, 'corrupt');
      }
      break;
    }
    case 'dark_pact': {
      champ.hp -= 2;
      const drawn = drawCard(s, playerIdx);
      if (drawn) {
        p.hand.push(drawn);
        addLog(s, `${p.name} invokes Dark Pact: pays 2 HP and draws ${drawn.name}.`, playerIdx);
      } else {
        addLog(s, `${p.name} invokes Dark Pact: pays 2 HP but deck is empty.`);
      }
      checkWinner(s);
      break;
    }
    default:
      return s;
  }

  if (!s.championAbilityUsed) s.championAbilityUsed = [false, false];
  s.championAbilityUsed[playerIdx] = true;
  // Using the ability consumes the champion's action — prevents movement this turn
  champ.moved = true;
  return s;
}

// ── Sapling Summon: resolve tile selection ────────────────────────────────
// Called when the player picks a tile for the Sapling Summon champion ability.
export function resolveChampionSaplingPlace(state, row, col) {
  const s = cloneState(state);
  if (!s.pendingChampionSaplingPlace) return s;
  const { playerIdx, validTiles } = s.pendingChampionSaplingPlace;
  if (!validTiles.some(([r, c]) => r === row && c === col)) return s; // invalid tile
  const p = s.players[playerIdx];
  const sapling = {
    ...TOKENS.sapling,
    owner: playerIdx, row, col,
    maxHp: TOKENS.sapling.hp,
    summoned: true, moved: false,
    atkBonus: 0, shield: 0, speedBonus: 0, hidden: false, turnAtkBonus: 0,
    uid: `token_sapling_${Math.random().toString(36).slice(2)}`,
  };
  s.units.push(sapling);
  registerUnit(sapling, s);
  addLog(s, `${p.name}'s Sapling appears at (${row},${col}).`);
  s.pendingChampionSaplingPlace = null;
  return s;
}
