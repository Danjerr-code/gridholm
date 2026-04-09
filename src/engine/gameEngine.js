import { buildDeck, shuffle, TOKENS } from './cards.js';
import { calculateResonance, RESONANCE_THRESHOLDS } from './attributes.js';
import { CHAMPIONS } from './champions.js';

const FACTION_ATTRIBUTE = {
  human: 'light',
  beast: 'primal',
  elf:   'mystic',
  demon: 'dark',
};
import {
  getAuraAtkBonus,
  getEffectiveAtk,
  getEffectiveSpd,
} from './statUtils.js';
export { getAuraAtkBonus, getEffectiveAtk, getEffectiveSpd } from './statUtils.js';
import { SPELL_REGISTRY } from './spellRegistry.js';
import { ACTION_REGISTRY } from './actionRegistry.js';
import {
  createTriggerListeners,
  registerUnit,
  unregisterUnit,
  registerModifiers,
  unregisterModifiers,
  fireTrigger,
  resetTurnTriggers,
  getConditionalStatBonus,
} from './triggerRegistry.js';

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

// ── Unit destruction ────────────────────────────────────────────────────────
// Single point of unit removal for the entire engine. Fires death triggers.
export function destroyUnit(unit, state, source = 'combat', destroyingUids = new Set(), combatTile = null) {
  if (destroyingUids.has(unit.uid)) return state;
  destroyingUids.add(unit.uid);

  // Unregister declarative triggers and static modifiers before removal
  unregisterUnit(unit.uid, state);
  unregisterModifiers(unit.uid, state);

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

  // Declarative trigger registry: fire onEnemyUnitDeath and onFriendlyUnitDeath
  if (!unit.isRelic && !unit.isOmen) {
    const deathCtx = { dyingUnit: unit, dyingPlayerIndex: unit.owner, triggeringUid: unit.uid };
    fireTrigger('onEnemyUnitDeath', deathCtx, state);
    fireTrigger('onFriendlyUnitDeath', deathCtx, state);
  }
}

// ============================================
// BEGIN TURN TRIGGERS
// Fires after draw and resource gain, before action phase
// ADD NEW BEGIN TURN TRIGGERS HERE
// ============================================
function fireBeginTurnTriggers(state, playerIdx) {
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

  // Grove Tend (Mystic, Ascended passive): summon a Sapling adjacent to champion each turn (skip turn 1).
  const grovePLayer = state.players[playerIdx];
  if (FACTION_ATTRIBUTE[grovePLayer.deckId] === 'mystic' && grovePLayer.resonance?.tier === 'ascended') {
    if (grovePLayer.turnCount !== 1) {
      const champ = state.champions[playerIdx];
      const openTiles = cardinalNeighbors(champ.row, champ.col).filter(([r, c]) =>
        !state.units.some(u => u.row === r && u.col === c) &&
        !state.champions.some(ch => ch.row === r && ch.col === c)
      );
      if (openTiles.length > 0) {
        const [r, c] = openTiles[Math.floor(Math.random() * openTiles.length)];
        state.units.push({
          ...TOKENS.sapling,
          owner: playerIdx, row: r, col: c,
          maxHp: TOKENS.sapling.hp,
          summoned: true, moved: false,
          atkBonus: 0, shield: 0, speedBonus: 0, hidden: false, turnAtkBonus: 0,
          uid: `token_sapling_${Math.random().toString(36).slice(2)}`,
        });
        addLog(state, `Grove Tend: ${grovePLayer.name}'s champion summons a Sapling at (${r},${c}).`);
      }
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
    if (u.owner === playerIdx && u.id === 'zmore') {
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

  // 7. Omen countdown: decrement turnsRemaining for each omen the active player controls.
  //    Destroy omens that reach 0 (fires death triggers so any on-death effects resolve).
  const omensToTick = state.units.filter(u => u.owner === playerIdx && u.isOmen);
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
    const drawn = unitPlayer.deck.shift();
    if (drawn) {
      unitPlayer.hand.push(drawn);
      addLog(state, `Crossbowman: drew ${drawn.name}.`);
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

  // 5. Hunger (Primal, Ascended passive): gain 1 temporary mana on kill, cap 3 per turn
  if (killedDefender && !defenderIsChampion) {
    const ownerIdx = attacker.owner;
    const p = state.players[ownerIdx];
    if (FACTION_ATTRIBUTE[p.deckId] === 'primal' && p.resonance?.tier === 'ascended') {
      const currentTemp = p.hungerTempMana || 0;
      if (currentTemp < 3) {
        p.hungerTempMana = currentTemp + 1;
        p.resources = Math.min(p.resources + 1, 10);
        addLog(state, `Hunger: ${p.name} gains 1 temporary mana (${p.resources} total).`);
      }
    }
  }

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
function fireOnSummonTriggers(unit, state) {
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
    const drawn = p.deck.shift();
    if (drawn) {
      p.hand.push(drawn);
      addLog(state, `Chaos Spawn: drew ${drawn.name}.`);
    }
    // Then handle discard
    if (p.hand.length > 1) {
      state.pendingHandSelect = { reason: 'chaospawn', cardUid: unit.uid, data: {} };
    } else if (p.hand.length === 1) {
      const [discarded] = p.hand.splice(0, 1);
      p.discard.push(discarded);
      addLog(state, `Chaos Spawn: ${discarded.name} discarded.`);
    }
    // If hand is empty after drawing, skip discard
  }

  // 3. Flesh Tithe: prompt optional sacrifice
  if (unit.id === 'fleshtithe') {
    const friendlyUnits = state.units.filter(u => u.owner === unit.owner && u.uid !== unit.uid);
    if (friendlyUnits.length > 0) {
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
      { id: 0, name: 'Player 1', resources: 0, maxResourcesThisTurn: 0, turnCount: 0, hand: p1Hand, deck: p1Deck, discard: [], hpRestoredThisTurn: 0, resonance: p1Resonance, deckId: p1DeckId, commandsUsed: 0 },
      { id: 1, name: 'AI',       resources: 0, maxResourcesThisTurn: 0, turnCount: 0, hand: p2Hand, deck: p2Deck, discard: [], hpRestoredThisTurn: 0, resonance: p2Resonance, deckId: p2DeckId, commandsUsed: 0 },
    ],
    champions: [
      { owner: 0, row: 0, col: 0, hp: 20, maxHp: 20, moved: false },
      { owner: 1, row: 4, col: 4, hp: 20, maxHp: 20, moved: false },
    ],
    units: [],
    log: [openingLog],
    pendingSpell: null,   // { cardUid, effect, playerIdx, step, data }
    pendingHandSelect: null, // { reason, cardUid, data } — when spell needs hand card selection
    pendingFleshtitheSacrifice: null, // { unitUid } — Flesh Tithe confirm
    pendingTerrainCast: null, // { cardUid, card } — waiting for terrain tile target
    terrainGrid: Array.from({ length: 5 }, () => Array(5).fill(null)), // 5x5 terrain effect layer
    archerShot: [],
    recalledThisTurn: [],
    waddlesActive: [false, false],
    championAbilityUsed: [false, false],
    triggerListeners: createTriggerListeners(),
    activeModifiers: [],
  };
}

// ── log helper ─────────────────────────────────────────────────────────────

export function addLog(state, msg) {
  state.log = [...state.log, msg].slice(-50);
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
// Single dispatch point for all unit action abilities. Looks up the resolver
// in ACTION_REGISTRY by unit.id and delegates. Returns updated state.
function _dispatchAction(unit, state, targets) {
  const resolver = ACTION_REGISTRY[unit.id];
  if (!resolver) {
    console.error(`No action resolver found for unit: ${unit.id}`);
    return state;
  }
  return resolver(unit, state, targets);
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
}

export function playerRevealUnit(state, unitUid) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit || !unit.hidden || unit.owner !== s.activePlayer) return s;
  revealUnit(s, unit);
  unit.moved = true;
  return s;
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
    drawnCard = p.deck.shift() || null;
    if (drawnCard) p.hand.push(drawnCard);
  }

  // Gain resources
  p.turnCount = (p.turnCount || 0) + 1;
  const bonus = state.activePlayer !== state.firstPlayer ? 1 : 0;
  p.resources = Math.min(p.turnCount + bonus, 10);
  p.maxResourcesThisTurn = p.resources;

  const drawnPart = skipDraw
    ? 'Skipped draw (turn 1 rule).'
    : drawnCard
      ? `Drew ${drawnCard.name}.`
      : 'No cards left to draw.';
  addLog(state, `${p.name} begins turn ${p.turnCount}. ${drawnPart} Mana: ${p.resources}/10.`);

  // Reset hpRestoredThisTurn
  p.hpRestoredThisTurn = 0;

  // Reset commands for new turn
  p.commandsUsed = 0;

  // Reset Hunger temp mana tracking (temp mana already wiped by the resources reset above)
  p.hungerTempMana = 0;

  // Clear summoning sickness and per-turn bonuses for active player
  // Must run before begin-turn triggers so that units summoned by triggers
  // (e.g. Grove Tend Sapling) retain their summoning sickness this turn.
  state.units.forEach(u => {
    if (u.owner === state.activePlayer) {
      u.summoned = false;
      u.moved = false;
      u.speedBonus = 0;
      u.turnAtkBonus = 0;
      // Clear razorfang reset used flag
      if (u.id === 'razorfang') u.razorfangResetUsed = false;
    }
  });

  // BEGIN TURN TRIGGERS
  fireBeginTurnTriggers(state, state.activePlayer);

  // Reset champion moved state
  state.champions[state.activePlayer].moved = false;

  // Apply skipNextAction: lock units and champion that were marked last turn
  state.units.forEach(u => {
    if (u.owner === state.activePlayer && u.skipNextAction) {
      u.moved = true;
      u.skipNextAction = false;
    }
  });
  if (state.champions[state.activePlayer].skipNextAction) {
    state.champions[state.activePlayer].moved = true;
    state.champions[state.activePlayer].skipNextAction = false;
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
  const champAtk = getEffectiveAtk(state, champ);
  return cardinalNeighbors(champ.row, champ.col)
    .filter(([r, c]) => {
      if (isTileOccupied(state, r, c)) {
        // Allow enemy unit tiles only when champion has ATK > 0
        const enemyUnit = state.units.find(u => u.owner !== state.activePlayer && u.row === r && u.col === c);
        return !!enemyUnit && champAtk > 0;
      }
      return true;
    });
}

export function moveChampion(state, row, col) {
  const s = cloneState(state);
  const champ = s.champions[s.activePlayer];
  const enemyUnit = s.units.find(u => u.owner !== s.activePlayer && u.row === row && u.col === col);

  if (enemyUnit) {
    // Reveal hidden enemy unit before champion combat
    if (enemyUnit.hidden) {
      revealUnit(s, enemyUnit);
      // Shadow Trap Hole on reveal: destroy the revealer — champion can't be destroyed, skip
    }
    // Combat: champion moves into enemy unit tile — simultaneous damage
    const combatTile = [row, col];
    const champAtk = getEffectiveAtk(s, champ, combatTile);
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
  const p = s.players[s.activePlayer];
  const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return s;
  const card = p.hand[cardIdx];
  if (p.resources < card.cost) return s;

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

    // No-target spells: execute via registry directly
    const NO_TARGET_SPELLS = new Set([
      'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
      'ironthorns', 'infernalpact', 'martiallaw', 'fortify', 'shadowveil',
      'ancientspring', 'verdantsurge', 'predatorsmark',
    ]);
    if (NO_TARGET_SPELLS.has(card.effect)) {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s = _dispatchSpell(s, s.activePlayer, card.effect, []);
      fireTrigger('onCardPlayed', { playerIndex: s.activePlayer, card }, s);
      // Hand size decreased — check if any conditional HP buff units now have effective HP <= 0
      checkConditionalStatDeaths(s);
      checkWinner(s);
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
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.pendingHandSelect = { reason: 'pactofruin', cardUid, data: {} };
      if (typeof window !== 'undefined') console.log('[PactOfRuin] playCard: pendingHandSelect set:', JSON.stringify(s.pendingHandSelect));
      return s;
    }

    // Needs a target — set pendingSpell
    s.pendingSpell = { cardUid, effect: card.effect, playerIdx: s.activePlayer, step: 0, data: {} };
    return s;
  }
  return s;
}

export function summonUnit(state, cardUid, row, col) {
  const s = cloneState(state);
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
    summoned: card.rush ? false : true,
    moved: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
    turnAtkBonus: 0,
    hidden: card.hidden || false,
    ...(card.isOmen ? { turnsRemaining: card.turnsRemaining } : {}),
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
  addLog(s, `${p.name} summons ${card.name} at (${row},${col}).${card.rush ? ' Rush!' : ''}${unit.shadowVeiled ? ' (Hidden)' : ''}`);

  // Register declarative triggers and static modifiers for this unit
  registerUnit(unit, s);
  registerModifiers(unit, s);

  // Declarative trigger registry: fire onCardPlayed for the active player
  fireTrigger('onCardPlayed', { playerIndex: s.activePlayer, card }, s);

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
    }
    s.pendingHandSelect = null;
    return s;
  }

  s.pendingHandSelect = null;
  return s;
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
    const sacrifice = s.units.find(u => u.uid === sacrificeUid);
    if (sacrifice) {
      addLog(s, `Flesh Tithe: ${sacrifice.name} sacrificed.`);
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

  if (!isPaid) {
    const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
    if (cardIdx === -1) return s;
    const card = p.hand[cardIdx];
    if (p.resources < card.cost) return s;
    p.resources -= card.cost;
    p.hand.splice(cardIdx, 1);
    p.discard.push(card);
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
    if (target) s = _dispatchSpell(s, s.activePlayer, 'recall', [target]);
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
        const sacrificeAtk = target.atk;
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
  // ── Spirit Bolt ──
  else if (effect === 'spiritbolt') {
    const champ = s.champions[s.activePlayer];
    champ.moved = true;
    if (target) s = _dispatchSpell(s, s.activePlayer, 'spiritbolt', [target]);
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

  return s;
}

export function cancelSpell(state) {
  const s = cloneState(state);
  if (s.pendingHandSelect && typeof window !== 'undefined') console.log('[PactOfRuin] cancelSpell: clearing pendingHandSelect (was:', JSON.stringify(s.pendingHandSelect), ')');
  s.pendingSpell = null;
  s.pendingSummon = null;
  s.pendingHandSelect = null;
  s.pendingTerrainCast = null;
  return s;
}

// ── terrain helpers ────────────────────────────────────────────────────────

// Tiles where terrain cannot be placed (champion starts + throne).
const TERRAIN_RESTRICTED = new Set(['0,0', '4,4', '2,2']);

// Returns all valid tiles for casting a terrain card.
// Valid tiles must be within Manhattan distance 2 of the casting player's champion.
export function getTerrainCastTiles(state) {
  const champ = state.champions[state.activePlayer];
  const tiles = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (TERRAIN_RESTRICTED.has(`${r},${c}`)) continue;
      if (manhattan([champ.row, champ.col], [r, c]) > 2) continue;
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
  const pending = s.pendingTerrainCast;
  const p = s.players[s.activePlayer];

  // Validate restricted
  if (TERRAIN_RESTRICTED.has(`${targetRow},${targetCol}`)) {
    return s;
  }

  // Deduct cost and remove from hand
  const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return s;
  const card = p.hand[cardIdx];
  if (p.resources < card.cost) return s;
  p.resources -= card.cost;
  p.hand.splice(cardIdx, 1);
  p.discard.push(card);
  s.pendingTerrainCast = null;

  const radius = card.terrainRadius ?? 0;
  const affectedTiles = getTerrainAffectedTiles(targetRow, targetCol, radius);

  for (const [r, c] of affectedTiles) {
    s.terrainGrid[r][c] = { ...card.terrainEffect, ownerName: card.name };
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
  if (s.pendingHandSelect && typeof window !== 'undefined') console.log('[PactOfRuin] endActionPhase: clearing pendingHandSelect (was:', JSON.stringify(s.pendingHandSelect), ')');
  s.pendingSpell = null;
  s.pendingSummon = null;
  s.pendingHandSelect = null;
  s.pendingTerrainCast = null;
  s.phase = 'end-turn';
  return s;
}

// ── unit action abilities ─────────────────────────────────────────────────

export function triggerUnitAction(state, unitUid) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== s.activePlayer || unit.moved || unit.summoned) return s;

  // Command gate: action abilities cost 1 command
  if ((s.players[s.activePlayer].commandsUsed ?? 0) >= 3) return s;
  s.players[s.activePlayer].commandsUsed = (s.players[s.activePlayer].commandsUsed ?? 0) + 1;

  // Reveal hidden unit when it uses an action ability
  if (unit.hidden) {
    revealUnit(s, unit);
  }

  unit.moved = true;

  // No-target actions — dispatch immediately via ACTION_REGISTRY
  if (unit.id === 'sergeant') {
    return _dispatchAction(unit, s, []);
  }
  if (unit.id === 'grovewarden') {
    return _dispatchAction(unit, s, []);
  }
  if (unit.id === 'darkdealer') {
    const result = _dispatchAction(unit, s, []);
    checkWinner(result);
    return result;
  }
  if (unit.id === 'siegemound') {
    const result = _dispatchAction(unit, s, []);
    checkWinner(result);
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

  if (unit.id === 'bloodaltar') {
    s.pendingSpell = { cardUid: unit.uid, effect: 'bloodaltar_action', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid, paid: true } };
    return s;
  }

  return s;
}

// ── unit movement ──────────────────────────────────────────────────────────

export function getUnitMoveTiles(state, unitUid) {
  const unit = state.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== state.activePlayer) return [];
  // Relics, omens, and SPD 0 units cannot move
  if (unit.isRelic || unit.isOmen || unit.spd === 0) return [];
  if (unit.summoned || unit.moved) {
    return [];
  }
  const speed = getEffectiveSpd(unit);
  return reachableTiles(state, unit, speed);
}

function reachableTiles(state, unit, speed) {
  const visited = new Set();
  const frontier = [[unit.row, unit.col, speed]];
  const result = [];
  visited.add(`${unit.row},${unit.col}`);

  while (frontier.length) {
    const [r, c, remaining] = frontier.shift();
    for (const [nr, nc] of cardinalNeighbors(r, c)) {
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const enemyUnit = state.units.find(u => u.owner !== unit.owner && u.row === nr && u.col === nc);
      const enemyChamp = state.champions.find(ch => ch.owner !== unit.owner && ch.row === nr && ch.col === nc);
      const friendlyOccupied = isTileOccupiedByFriendly(state, unit.owner, nr, nc);
      if (friendlyOccupied) continue;
      if (unit.canAttack === false && (enemyUnit || enemyChamp)) continue;
      result.push([nr, nc]);
      if (remaining > 1 && !enemyUnit && !enemyChamp && !friendlyOccupied) {
        frontier.push([nr, nc, remaining - 1]);
      }
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

  // Command gate: player-directed unit moves cost 1 command; champion moves are exempt
  if (unit.owner === s.activePlayer) {
    if ((s.players[s.activePlayer].commandsUsed ?? 0) >= 3) return s;
    s.players[s.activePlayer].commandsUsed = (s.players[s.activePlayer].commandsUsed ?? 0) + 1;
  }

  // Check for enemy omen on destination tile — destroy it with no combat
  const enemyOmen = s.units.find(u => u.owner !== unit.owner && u.isOmen && u.row === row && u.col === col);
  if (enemyOmen) {
    addLog(s, `${unit.name} moves through ${enemyOmen.name}! The omen is destroyed.`);
    destroyUnit(enemyOmen, s, 'omen_removed');
    const liveUnit = s.units.find(u => u.uid === unitUid);
    if (liveUnit) {
      liveUnit.row = row;
      liveUnit.col = col;
      liveUnit.moved = true;
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
    if (unit.hidden) {
      revealUnit(s, unit, enemyUnit, [row, col]);
    }
    // Reveal hidden enemy unit before resolving combat
    const wasHidden = enemyUnit.hidden;
    if (wasHidden) revealUnit(s, enemyUnit, unit);

    // Shadow Trap on reveal: destroy the attacker
    if (wasHidden && enemyUnit.id === 'shadowtrap' && s.units.find(u => u.uid === enemyUnit.uid)) {
      addLog(s, `Shadow Trap Hole springs! ${unit.name} is destroyed.`);
      destroyUnit(unit, s, 'shadowtrap');
      // Shadow Trap is now revealed (no longer hidden) but stays
      return s;
    }

    // SPD 2 approach: if attacker is more than 1 tile away, slide to adjacent approach tile first
    const attackDist = manhattan([unit.row, unit.col], [row, col]);
    if (attackDist > 1) {
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
        if (defenderDestroyed) {
          stillAlive2.row = row;
          stillAlive2.col = col;
        }
        stillAlive2.moved = true;
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
  } else if (enemyChamp) {
    // Reveal hidden attacking unit before champion combat
    if (unit.hidden) {
      revealUnit(s, unit, null, [row, col]);
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
    if (unitAfterThorn) unitAfterThorn.moved = true;
    // Fire attack triggers (Dread Knight)
    if (champDmg > 0) fireAttackTriggers(unit, enemyChamp, s, false);
    checkWinner(s);
  } else {
    // Regular move — hidden units (including shadow-veil'd) do not reveal on move
    unit.row = row;
    unit.col = col;
    unit.moved = true;
    // Terrain onOccupy: trigger when unit moves onto a terrain tile
    const movedUnit = s.units.find(u => u.uid === unitUid);
    if (movedUnit) fireTerrainOnOccupy(s, movedUnit, row, col);
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

  // Command gate: counts as a single command for the whole approach+attack
  if (unit.owner === s.activePlayer) {
    if ((s.players[s.activePlayer].commandsUsed ?? 0) >= 3) return s;
    s.players[s.activePlayer].commandsUsed = (s.players[s.activePlayer].commandsUsed ?? 0) + 1;
  }

  // Move unit to the chosen approach tile
  unit.row = approachRow;
  unit.col = approachCol;

  // Temporarily undo the increment so moveUnit's own gate doesn't double-count
  s.players[unit.owner].commandsUsed = (s.players[unit.owner].commandsUsed ?? 1) - 1;

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

function completeTurnAdvance(state) {
  const s = state;
  const champ = s.champions[s.activePlayer];

  s.pendingDiscard = false;

  // Clear per-turn state for active player's units
  s.units.forEach(u => {
    if (u.owner === s.activePlayer) {
      u.speedBonus = 0;
      u.turnAtkBonus = 0;
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
      // Clear Shield ability HP bonus
      if (u.shieldHpBonus) {
        u.hp = Math.max(1, u.hp - u.shieldHpBonus);
        u.maxHp = Math.max(1, u.maxHp - u.shieldHpBonus);
        u.shieldHpBonus = 0;
      }
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
  if (s.pendingShadowVeil) s.pendingShadowVeil[s.activePlayer] = false;

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

function checkWinner(state) {
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
  const champ = state.champions[state.activePlayer];
  const p = state.players[state.activePlayer];

  switch (effect) {
    // Smite: enemy within 2 tiles of champion (not hidden, not omen)
    case 'smite':
      return state.units
        .filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);

    // Forge Weapon, Iron Shield, Recall, Moonleaf, Savage Growth, Pounce: friendly (not hidden for most)
    case 'forgeweapon':
    case 'ironshield':
    case 'savagegrowth':
      return state.units.filter(u => u.owner === state.activePlayer && !u.hidden).map(u => u.uid);
    case 'recall':
      return state.units.filter(u => u.owner === state.activePlayer).map(u => u.uid);
    case 'moonleaf':
      return state.units.filter(u => u.owner === state.activePlayer && !u.hidden && u.type === 'unit').map(u => u.uid);

    // Bloom step 0: friendly unit or champion; step 1: enemy unit (not omen)
    case 'bloom':
      if (step === 0) return ['champion' + state.activePlayer, ...state.units.filter(u => u.owner === state.activePlayer && !u.hidden).map(u => u.uid)];
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen).map(u => u.uid);

    // Entangle: friendly Elf unit
    case 'entangle':
      return state.units.filter(u => u.owner === state.activePlayer && unitTypes(u).includes('Elf') && !u.hidden).map(u => u.uid);

    // Predator's Mark: always targets enemy champion
    case 'predatorsmark':
      return ['champion' + (1 - state.activePlayer)];

    // Pounce: friendly Beast unit (resets its action)
    case 'pounce':
      return state.units.filter(u => u.owner === state.activePlayer && unitTypes(u).includes('Beast')).map(u => u.uid);

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

    // Blood Offering step 0: friendly unit; step 1: any enemy (not omen)
    case 'bloodoffering':
      if (step === 0) return state.units.filter(u => u.owner === state.activePlayer).map(u => u.uid);
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen).map(u => u.uid);

    // Pact of Ruin damage: any enemy unit or enemy champion (not omen)
    case 'pactofruin_damage':
      return [
        'champion' + (1 - state.activePlayer),
        ...state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen).map(u => u.uid),
      ];

    // Dark Sentence: any enemy unit (not omen)
    case 'darksentence':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen).map(u => u.uid);

    // Devour: enemy with 2 or less HP (not omen — omens have no HP)
    case 'devour':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && u.hp <= 2).map(u => u.uid);

    // Soul Drain: enemy unit (not omen)
    case 'souldrain':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen).map(u => u.uid);

    // Spirit Bolt: any enemy unit on the board (no range restriction, not omen)
    case 'spiritbolt':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen).map(u => u.uid);

    // Woodland Guard action: enemy within 2 tiles (not omen)
    case 'woodlandguard_action': {
      const src = state.units.find(u => u.uid === (data.sourceUid || ''));
      if (!src) return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen).map(u => u.uid);
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && manhattan([src.row, src.col], [u.row, u.col]) <= 2).map(u => u.uid);
    }

    // Battle Priest summon trigger step 0: enemy within 1 tile (not omen); step 1: friendly within 1 tile
    case 'battlepriestunit_summon': {
      const priest = state.units.find(u => u.uid === (data.sourceUid || ''));
      if (!priest) return [];
      const adj = cardinalNeighbors(priest.row, priest.col);
      if (step === 0) {
        return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && !u.isOmen && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
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

    default:
      return [];
  }
}

// ── spell playability pre-validation ──────────────────────────────────────
// Returns true if the card has at least one valid target given the current
// board state. Used to dim unplayable spells in the hand UI before the player
// even attempts to cast them. Does NOT change state.

export function hasValidTargets(card, state, playerIndex) {
  if (card.type !== 'spell') return true;

  const effect = card.effect;
  const champ = state.champions[playerIndex];
  const enemyUnits = state.units.filter(u => u.owner !== playerIndex && !u.hidden && !u.isOmen);
  const friendlyUnits = state.units.filter(u => u.owner === playerIndex);

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
      return !champ.moved && enemyUnits.length > 0;

    case 'predatorsmark':
      return true; // enemy champion always exists

    case 'martiallaw':
      return enemyUnits.some(u => manhattan([champ.row, champ.col], [u.row, u.col]) <= 2);

    case 'pounce':
      return friendlyUnits.some(u => unitTypes(u).includes('Beast'));

    case 'ironshield':
    case 'savagegrowth':
    case 'forgeweapon':
      return friendlyUnits.some(u => !u.hidden);

    case 'moonleaf':
      return friendlyUnits.some(u => !u.hidden && u.type === 'unit');

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
      addLog(s, `${p.name} uses Shield: ${unit.name} gains +2 HP until end of turn.`);
      break;
    }
    case 'howl': {
      const unit = s.units.find(u => u.uid === targetUid);
      if (!unit) return s;
      unit.turnAtkBonus = (unit.turnAtkBonus || 0) + 2;
      p.resources -= 2;
      addLog(s, `${p.name} uses Howl: ${unit.name} gains +2 ATK until end of turn.`);
      break;
    }
    case 'nurture': {
      const unit = s.units.find(u => u.uid === targetUid);
      if (!unit) return s;
      unit.atk += 1;
      unit.hp += 1;
      unit.maxHp += 1;
      p.resources -= 2;
      addLog(s, `${p.name} uses Nurture: ${unit.name} gains +1/+1 permanently.`);
      break;
    }
    case 'corrupt': {
      const unit = s.units.find(u => u.uid === targetUid);
      if (!unit) return s;
      unit.hp -= 1;
      p.resources -= 2;
      addLog(s, `${p.name} uses Corrupt: ${unit.name} takes 1 damage (${unit.hp} HP remaining).`);
      if (unit.hp <= 0) {
        destroyUnit(unit, s, 'corrupt');
      }
      break;
    }
    case 'dark_pact': {
      champ.hp -= 2;
      const drawn = p.deck.shift();
      if (drawn) {
        p.hand.push(drawn);
        addLog(s, `${p.name} uses Dark Pact: pays 2 HP and draws ${drawn.name}.`);
      } else {
        addLog(s, `${p.name} uses Dark Pact: pays 2 HP but deck is empty.`);
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
