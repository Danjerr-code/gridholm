// ============================================
// EFFECTIVE STAT UTILITIES
// Never read unit.atk, unit.hp, unit.spd directly during combat or targeting.
// Always use these functions instead.
// ADD NEW STAT MODIFIERS HERE
// ============================================

import { manhattan } from './gameEngine.js';
import { getConditionalStatBonus, getZoneSpdBonus, getFriendlyAuraRangeBonus } from './triggerRegistry.js';

function unitTypes(u) {
  if (!u) return [];
  const ut = u.unitType;
  if (!Array.isArray(ut)) {
    return ut ? [ut] : [];
  }
  return ut;
}

// Returns effective ATK bonus from friendly auras (stat === 'atk') and
// enemy debuff auras (stat === 'atk', target === 'enemy').
export function getAuraAtkBonus(state, unit, combatTile = null) {
  let bonus = 0;
  for (const other of state.units) {
    if (other.owner !== unit.owner || other.uid === unit.uid) continue;
    if (other.hidden) continue;
    if (!other.aura || other.aura.stat !== 'atk' || other.aura.target === 'enemy') continue;
    if (other.aura.target === 'friendlybeast' && !unitTypes(unit).includes('Beast')) continue;
    const rangeBonus = getFriendlyAuraRangeBonus(state, other.owner);
    const anchorRow = other.aura.champAnchor ? state.champions[other.owner].row : other.row;
    const anchorCol = other.aura.champAnchor ? state.champions[other.owner].col : other.col;
    if (manhattan([anchorRow, anchorCol], [unit.row, unit.col]) <= other.aura.range + rangeBonus) {
      bonus += other.aura.value;
    }
  }
  // Enemy debuff auras (e.g. Aendor): check combat tile position, not stored unit position
  for (const other of state.units) {
    if (other.owner === unit.owner) continue;
    if (other.hidden) continue;
    if (!other.aura || other.aura.stat !== 'atk' || other.aura.target !== 'enemy') continue;
    const [checkRow, checkCol] = combatTile || [unit.row, unit.col];
    if (manhattan([other.row, other.col], [checkRow, checkCol]) <= other.aura.range) {
      bonus -= Math.abs(other.aura.value);
    }
  }
  return bonus;
}

// Standard Bearer "both" aura: +1 ATK and +1 HP in combat (not permanent).
// Returns { atk, hp } bonuses from Standard Bearer within range.
function getStandardBearerBonus(state, unit) {
  let atk = 0, hp = 0;
  for (const other of state.units) {
    if (other.owner !== unit.owner || other.uid === unit.uid) continue;
    if (other.hidden) continue;
    if (!other.aura || other.aura.stat !== 'both') continue;
    const rangeBonus = getFriendlyAuraRangeBonus(state, other.owner);
    if (manhattan([other.row, other.col], [unit.row, unit.col]) <= other.aura.range + rangeBonus) {
      atk += other.aura.value;
      hp += other.aura.value;
    }
  }
  return { atk, hp };
}

// Returns the Pack Runt ATK bonus count: +1 ATK for each other friendly combat unit.
// Also applies to shadow copies of Pack Runt (sourceId === 'packrunt').
export function getPackBonus(state, unit) {
  if (unit.id !== 'packrunt' && unit.sourceId !== 'packrunt') return 0;
  return state.units.filter(u =>
    u.owner === unit.owner &&
    u.uid !== unit.uid &&
    !u.isRelic &&
    !u.isOmen &&
    !u.hidden
  ).length;
}

// Returns 'buff', 'debuff', or 'none' for the terrain effect on the given unit.
function getTerrainEffectType(wo, unit) {
  if (wo.combatOnly && (unit.isRelic || unit.isOmen)) return 'none';
  if (wo.attributeOnly && unit.attribute === wo.attributeOnly) return 'buff';
  if (wo.opposingAttribute && unit.attribute === wo.opposingAttribute) return 'debuff';
  return 'none';
}

// Returns the terrain whileOccupied ATK modifier for a unit at its current tile.
function getTerrainAtkModifier(state, unit) {
  if (!state.terrainGrid) return 0;
  const terrain = state.terrainGrid[unit.row]?.[unit.col];
  if (!terrain?.whileOccupied) return 0;
  const wo = terrain.whileOccupied;
  const effect = getTerrainEffectType(wo, unit);
  if (effect === 'buff') {
    if (wo.atkBuff != null) return wo.atkBuff;
    if (wo.atkDebuff != null) return -wo.atkDebuff;
    return 0;
  }
  if (effect === 'debuff') return wo.atkBuff != null ? -wo.atkBuff : 0;
  return 0;
}

// Returns the terrain whileOccupied HP modifier for a unit at its current tile.
// Debuff HP modifier is capped so effective HP cannot drop below 1 from terrain alone.
export function getTerrainHpModifier(state, unit) {
  if (!state.terrainGrid) return 0;
  const terrain = state.terrainGrid[unit.row]?.[unit.col];
  if (!terrain?.whileOccupied) return 0;
  const wo = terrain.whileOccupied;
  const effect = getTerrainEffectType(wo, unit);
  if (effect === 'buff') {
    if (wo.hpBuff != null) {
      if (wo.friendlyOnly) {
        if (unit.hidden) return 0;
        return wo.hpBuff;
      }
      return wo.hpBuff;
    }
    return 0;
  }
  if (effect === 'debuff' && wo.hpBuff != null) {
    // Terrain debuff cannot reduce HP below 1; unit cannot die from terrain alone.
    return -Math.min(wo.hpBuff, unit.hp - 1);
  }
  return 0;
}

// Returns effective ATK for a unit including all aura bonuses, temporary buffs,
// terrain effects, turn-based bonuses, and activeModifier conditional buffs.
export function getEffectiveAtk(state, unit, combatTile = null) {
  const base = (unit.atk || 0) + (unit.atkBonus || 0) + (unit.turnAtkBonus || 0) + getAuraAtkBonus(state, unit, combatTile);
  const sbBonus = getStandardBearerBonus(state, unit).atk;
  const packBonus = getPackBonus(state, unit);
  const terrainMod = getTerrainAtkModifier(state, unit);
  const modBonus = getConditionalStatBonus(state, unit).atk;
  let total = Math.max(0, base + sbBonus + packBonus + terrainMod + modBonus);
  // exhaustion curse: player 0's units have -1 ATK (minimum 0)
  if (state?.adventureCurses?.includes('exhaustion') && unit.owner === 0 && !unit.isRelic && !unit.isOmen) {
    total = Math.max(0, total - 1);
  }
  return total;
}

// Returns effective HP for display (current HP after damage counters + terrain bonus + conditional modifier).
export function getEffectiveHp(state, unit) {
  if (unit.hidden) return '?';
  const modBonus = getConditionalStatBonus(state, unit).hp;
  return unit.hp + getTerrainHpModifier(state, unit) + modBonus;
}

// Returns effective max HP for display.
export function getEffectiveMaxHp(state, unit) {
  if (unit.hidden) return '?';
  return unit.maxHp;
}

// Returns effective SPD including speed bonuses, zone SPD buffs, hidden override,
// and the fatigue +1 SPD bonus (when the owning player's opponent has an empty deck).
export function getEffectiveSpd(unit, state = null) {
  if (unit.hidden) return 1;
  const zoneBonus = state ? getZoneSpdBonus(state, unit) : 0;
  // Fatigue: if the enemy player's deck is empty, friendly combat units gain +1 SPD (disabled in tutorial)
  const fatigueBonus = (state && !state.isTutorial && !unit.isRelic && !unit.isOmen && state.deckEmpty?.[1 - unit.owner]) ? 1 : 0;
  return unit.spd + (unit.speedBonus || 0) + zoneBonus + fatigueBonus;
}

// Returns all active friendly aura bonuses affecting a unit as { atk, hp }.
export function getFriendlyAuraBonus(state, unit) {
  const bonus = { atk: 0, hp: 0 };
  if (unit.hidden) return bonus;
  for (const other of state.units) {
    if (other.owner !== unit.owner || other.uid === unit.uid || other.hidden) continue;
    if (!other.aura || (other.aura.target !== 'friendly' && other.aura.target !== 'friendlybeast')) continue;
    if (other.aura.target === 'friendlybeast' && !unitTypes(unit).includes('Beast')) continue;
    const anchorRow = other.aura.champAnchor ? state.champions[other.owner].row : other.row;
    const anchorCol = other.aura.champAnchor ? state.champions[other.owner].col : other.col;
    const dist = manhattan([anchorRow, anchorCol], [unit.row, unit.col]);
    const rangeBonus = getFriendlyAuraRangeBonus(state, other.owner);
    if (dist > other.aura.range + rangeBonus) continue;
    if (other.aura.stat === 'atk') bonus.atk += other.aura.value;
    if (other.aura.stat === 'hp') bonus.hp += other.aura.value;
    if (other.aura.stat === 'both') {
      bonus.atk += other.aura.value;
      bonus.hp += other.aura.value;
    }
  }
  return bonus;
}

// Returns all active enemy aura debuffs affecting a unit as { atk } (negative values).
export function getEnemyAuraDebuff(state, unit) {
  const debuff = { atk: 0 };
  if (unit.hidden) return debuff;
  for (const other of state.units) {
    if (other.owner === unit.owner || other.hidden) continue;
    if (!other.aura || other.aura.target !== 'enemy') continue;
    const dist = manhattan([other.row, other.col], [unit.row, unit.col]);
    if (dist > other.aura.range) continue;
    if (other.aura.stat === 'atk') debuff.atk -= Math.abs(other.aura.value);
  }
  return debuff;
}

// Returns true if a unit is receiving any aura buff from a friendly source.
// Used for UI highlighting.
export function isAuraBuffed(state, unit) {
  const bonus = getFriendlyAuraBonus(state, unit);
  return bonus.atk > 0 || bonus.hp > 0;
}

// Returns true if a unit is affected by an enemy aura debuff.
// Used for UI highlighting.
export function isAuraDebuffed(state, unit) {
  const debuff = getEnemyAuraDebuff(state, unit);
  return debuff.atk < 0;
}
