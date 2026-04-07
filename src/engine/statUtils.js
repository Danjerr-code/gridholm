// ============================================
// EFFECTIVE STAT UTILITIES
// Never read unit.atk, unit.hp, unit.spd directly during combat or targeting.
// Always use these functions instead.
// ADD NEW STAT MODIFIERS HERE
// ============================================

import { manhattan } from './gameEngine.js';

// Returns effective ATK bonus from friendly auras (stat === 'atk') and
// enemy debuff auras (stat === 'atk', target === 'enemy').
export function getAuraAtkBonus(state, unit, combatTile = null) {
  let bonus = 0;
  for (const other of state.units) {
    if (other.owner !== unit.owner || other.uid === unit.uid) continue;
    if (!other.aura || other.aura.stat !== 'atk' || other.aura.target === 'enemy') continue;
    if (other.aura.target === 'friendlybeast' && unit.unitType !== 'Beast') continue;
    if (manhattan([other.row, other.col], [unit.row, unit.col]) <= other.aura.range) {
      bonus += other.aura.value;
    }
  }
  // Enemy debuff auras (e.g. Aendor): check combat tile position, not stored unit position
  for (const other of state.units) {
    if (other.owner === unit.owner) continue;
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
    if (!other.aura || other.aura.stat !== 'both') continue;
    if (manhattan([other.row, other.col], [unit.row, unit.col]) <= other.aura.range) {
      atk += other.aura.value;
      hp += other.aura.value;
    }
  }
  return { atk, hp };
}

// Returns the Pack Runt ATK bonus count: +1 ATK for each other friendly Beast combat unit.
export function getPackBonus(state, unit) {
  if (unit.id !== 'packrunt') return 0;
  return state.units.filter(u =>
    u.owner === unit.owner &&
    u.uid !== unit.uid &&
    u.unitType === 'Beast' &&
    !u.hidden
  ).length;
}

// Returns effective ATK for a unit including all aura bonuses, temporary buffs,
// and turn-based bonuses. Never writes to unit state.
export function getEffectiveAtk(state, unit, combatTile = null) {
  const base = (unit.atk || 0) + (unit.atkBonus || 0) + (unit.turnAtkBonus || 0) + getAuraAtkBonus(state, unit, combatTile);
  const sbBonus = getStandardBearerBonus(state, unit).atk;
  const packBonus = getPackBonus(state, unit);
  return Math.max(0, base + sbBonus + packBonus);
}

// Returns effective HP for display (current HP after damage counters).
export function getEffectiveHp(state, unit) {
  if (unit.hidden) return '?';
  return unit.hp;
}

// Returns effective max HP for display.
export function getEffectiveMaxHp(state, unit) {
  if (unit.hidden) return '?';
  return unit.maxHp;
}

// Returns effective SPD including speed bonuses. Hidden units move at SPD 1.
export function getEffectiveSpd(unit) {
  if (unit.hidden) return 1;
  return unit.spd + (unit.speedBonus || 0);
}

// Returns all active friendly aura bonuses affecting a unit as { atk, hp }.
export function getFriendlyAuraBonus(state, unit) {
  const bonus = { atk: 0, hp: 0 };
  if (unit.hidden) return bonus;
  for (const other of state.units) {
    if (other.owner !== unit.owner || other.uid === unit.uid || other.hidden) continue;
    if (!other.aura || (other.aura.target !== 'friendly' && other.aura.target !== 'friendlybeast')) continue;
    if (other.aura.target === 'friendlybeast' && unit.unitType !== 'Beast') continue;
    const dist = manhattan([other.row, other.col], [unit.row, unit.col]);
    if (dist > other.aura.range) continue;
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
