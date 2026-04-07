import { buildDeck, shuffle } from './cards.js';
import {
  getAuraAtkBonus,
  getEffectiveAtk,
  getEffectiveSpd,
} from './statUtils.js';
export { getAuraAtkBonus, getEffectiveAtk, getEffectiveSpd } from './statUtils.js';
import { SPELL_REGISTRY } from './spellRegistry.js';
import { ACTION_REGISTRY } from './actionRegistry.js';

// Phases in order
export const PHASES = ['begin-turn', 'action', 'end-turn'];

// ── helpers ────────────────────────────────────────────────────────────────

export function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
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
    for (const beast of state.units.filter(u => u.owner === wb.owner && u.uid !== wb.uid && u.unitType === 'Beast' && !u.hidden)) {
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

  // 4. Shadow Trap: destroy the enemy unit that triggered the reveal
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
  if (unit.id === 'sapling') {
    const healed = restoreHP('champion' + unit.owner, 1, state, 'sapling');
    if (healed > 0) addLog(state, `Sapling: champion restores ${healed} HP.`);
  }

  // 7. Wildborne: remove HP aura from all buffed friendly Beast units
  if (unit.id === 'wildborne') {
    const range = unit.aura ? unit.aura.range : 1;
    const [wr, wc] = combatTile || [unit.row, unit.col];
    for (const beast of state.units.filter(u => u.owner === unit.owner && u.unitType === 'Beast' && !u.hidden)) {
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
}

// ============================================
// BEGIN TURN TRIGGERS
// Fires after draw and resource gain, before action phase
// ADD NEW BEGIN TURN TRIGGERS HERE
// ============================================
function fireBeginTurnTriggers(state, playerIdx) {
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

  // 1. Seedling: restore 1 HP to champion for each friendly SPD 0 unit
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.spd === 0) {
      const healed = restoreHP(champ, 1, state);
      if (healed > 0) addLog(state, `Seedling restores 1 HP to champion.`);
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
          rules: 'When this unit is destroyed restore 1 HP to your champion.', image: null,
          token: true, owner: playerIdx, row: r, col: c,
          summoned: true, moved: false, atkBonus: 0, shield: 0, speedBonus: 0, hidden: false,
          turnAtkBonus: 0,
          uid: `sapling_${Math.random().toString(36).slice(2)}`,
        });
      }
      if (adj.length) addLog(state, `Yggara, Rootmother: summoned ${adj.length} Sapling(s).`);
    }
  });

  // 6. Throne damage: deal 4 damage to opponent champion (cannot reduce below 1 HP)
  if (champ.row === 2 && champ.col === 2) {
    const oppIdx = 1 - playerIdx;
    const maxDamage = Math.max(0, state.champions[oppIdx].hp - 1);
    const actualDamage = Math.min(4, maxDamage);
    if (actualDamage > 0) {
      state.champions[oppIdx].hp -= actualDamage;
      addLog(state, `${p.name}'s champion controls the Throne! ${state.players[oppIdx].name}'s champion takes ${actualDamage} damage.`);
    } else {
      addLog(state, `${p.name}'s champion controls the Throne, but the enemy champion is protected at 1 HP.`);
    }
    checkWinner(state);
  }
}

// ============================================
// ATTACK TRIGGERS
// Fires when a unit initiates combat movement
// killedDefender is true if the defender was destroyed in this combat
// ADD NEW ATTACK TRIGGERS HERE
// ============================================
function fireAttackTriggers(attacker, defender, state, killedDefender) {
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

  // 2. Chaos Spawn: prompt discard then draw
  if (unit.id === 'chaospawn') {
    if (p.hand.length > 0) {
      state.pendingHandSelect = { reason: 'chaospawn', cardUid: unit.uid, data: {} };
    } else {
      const drawn = p.deck.shift();
      if (drawn) {
        p.hand.push(drawn);
        addLog(state, `Chaos Spawn: drew ${drawn.name}.`);
      }
    }
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
    const hasFriendlies = state.units.some(u => u.owner === unit.owner && u.uid !== unit.uid && u.hp < u.maxHp && adj.some(([r, c]) => u.row === r && u.col === c));
    if (hasEnemies) {
      state.pendingSpell = { cardUid: unit.uid, effect: 'battlepriestunit_summon', playerIdx: unit.owner, step: 0, data: { sourceUid: unit.uid, paid: true } };
    } else if (hasFriendlies) {
      state.pendingSpell = { cardUid: unit.uid, effect: 'battlepriestunit_summon', playerIdx: unit.owner, step: 1, data: { sourceUid: unit.uid, enemyUid: null, paid: true } };
    }
  }

  // 6. Wildborne summon: apply HP aura to Beast units already in range,
  //    and apply aura to Wildborne itself if a Wildborne is already on the board
  if (unit.unitType === 'Beast') {
    const wb = state.units.find(u => u.id === 'wildborne' && u.owner === unit.owner && u.uid !== unit.uid);
    if (wb && manhattan([wb.row, wb.col], [unit.row, unit.col]) <= wb.aura.range) {
      applyWildbornAura(unit, state);
    }
  }
  if (unit.id === 'wildborne') {
    for (const beast of state.units.filter(u => u.owner === unit.owner && u.uid !== unit.uid && u.unitType === 'Beast' && !u.hidden)) {
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
}

// ── initializer ────────────────────────────────────────────────────────────

export function createInitialState(p1DeckId = 'human', p2DeckId = 'human') {
  const p1Deck = shuffle(buildDeck(p1DeckId));
  const p2Deck = shuffle(buildDeck(p2DeckId));

  const p1Hand = p1Deck.splice(0, 5);
  const p2Hand = p2Deck.splice(0, 5);

  const firstPlayer = Math.random() < 0.5 ? 0 : 1;
  const firstPlayerLabel = firstPlayer === 0 ? 'Player 1' : 'Player 2';

  return {
    turn: 1,
    activePlayer: firstPlayer,
    firstPlayer,
    phase: 'begin-turn',
    phaseStep: 0,
    winner: null,
    pendingDiscard: false,
    players: [
      { id: 0, name: 'Player 1', resources: 0, turnCount: 0, hand: p1Hand, deck: p1Deck, discard: [], hpRestoredThisTurn: 0 },
      { id: 1, name: 'AI',       resources: 0, turnCount: 0, hand: p2Hand, deck: p2Deck, discard: [], hpRestoredThisTurn: 0 },
    ],
    champions: [
      { owner: 0, row: 0, col: 0, hp: 20, maxHp: 20, moved: false },
      { owner: 1, row: 4, col: 4, hp: 20, maxHp: 20, moved: false },
    ],
    units: [],
    log: [`Game started. Coin flip: ${firstPlayerLabel} goes first. Both players start with 5 cards. ${firstPlayerLabel} skips draw on turn 1.`],
    pendingSpell: null,   // { cardUid, effect, playerIdx, step, data }
    pendingHandSelect: null, // { reason, cardUid, data } — when spell needs hand card selection
    pendingFleshtitheSacrifice: null, // { unitUid } — Flesh Tithe confirm
    archerShot: [],
    recalledThisTurn: [],
    waddlesActive: [false, false],
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

function revealUnit(state, unit) {
  unit.hidden = false;
  addLog(state, `${unit.name} revealed!`);
  // On-reveal effects
  if (unit.id === 'shadowtrap') {
    // On reveal: destroy the enemy unit that revealed this unit (handled at call site)
  }
  if (unit.id === 'veilfiend') {
    // On reveal: deal 2 damage to all adjacent enemy units
    const adj = cardinalNeighbors(unit.row, unit.col);
    const targets = state.units.filter(u => u.owner !== unit.owner && adj.some(([r, c]) => u.row === r && u.col === c));
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

  const drawnPart = skipDraw
    ? 'Skipped draw (turn 1 rule).'
    : drawnCard
      ? `Drew ${drawnCard.name}.`
      : 'No cards left to draw.';
  addLog(state, `${p.name} begins turn ${p.turnCount}. ${drawnPart} Mana: ${p.resources}/10.`);

  // Reset hpRestoredThisTurn
  p.hpRestoredThisTurn = 0;

  // BEGIN TURN TRIGGERS
  fireBeginTurnTriggers(state, state.activePlayer);

  // Clear martial law from the opponent's units (applied last turn)
  state.units.forEach(u => {
    if (u.owner !== state.activePlayer && u.martialLaw) {
      u.moved = true; // skip action
      u.martialLaw = false;
    }
  });

  // Clear summoning sickness and per-turn bonuses for active player
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

  // Reset champion moved state
  state.champions[state.activePlayer].moved = false;

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
    // Combat: champion moves into enemy unit tile — simultaneous damage
    const combatTile = [row, col];
    const champAtk = getEffectiveAtk(s, champ, combatTile);
    const enemyAtk = getEffectiveAtk(s, enemyUnit, combatTile);
    addLog(s, `${getPlayer(s).name}'s champion attacks ${enemyUnit.name}!`);
    applyDamageToUnit(s, enemyUnit, champAtk, 'Champion', combatTile);
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
          // Shadow Trap: destroy the unit that revealed it (champion can't be destroyed, skip)
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
  const p = s.players[s.activePlayer];
  const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return s;
  const card = p.hand[cardIdx];
  if (p.resources < card.cost) return s;

  if (card.type === 'unit') {
    if ((s.recalledThisTurn || []).includes(card.id)) return s;
    s.pendingSummon = { cardUid, card };
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
      'ancientspring', 'verdantsurge',
    ]);
    if (NO_TARGET_SPELLS.has(card.effect)) {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s = _dispatchSpell(s, s.activePlayer, card.effect, []);
      checkWinner(s);
      return s;
    }

    // Pact of Ruin: needs hand card selection first, then enemy target
    if (card.effect === 'pactofruin') {
      if (p.hand.length <= 1) {
        // No cards to discard — cancel with no effect
        return s;
      }
      // Need to select a card to discard first
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.pendingHandSelect = { reason: 'pactofruin', cardUid, data: {} };
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
    maxHp: card.hp,
    summoned: card.rush ? false : true,
    moved: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
    turnAtkBonus: 0,
    hidden: card.hidden || false,
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

  // ON SUMMON TRIGGERS
  fireOnSummonTriggers(unit, s);

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
    // Discard the selected card
    const idx = p.hand.findIndex(c => c.uid === selectedCardUid);
    if (idx !== -1) {
      const [discarded] = p.hand.splice(idx, 1);
      p.discard.push(discarded);
      addLog(s, `Pact of Ruin: ${discarded.name} discarded.`);
    }
    s.pendingHandSelect = null;
    // Now need to select an enemy target for 3 damage
    s.pendingSpell = { cardUid: null, effect: 'pactofruin_damage', playerIdx: s.activePlayer, step: 0, data: {} };
    return s;
  }

  if (hs.reason === 'chaospawn') {
    // Discard the selected card
    const idx = p.hand.findIndex(c => c.uid === selectedCardUid);
    if (idx !== -1) {
      const [discarded] = p.hand.splice(idx, 1);
      p.discard.push(discarded);
      addLog(s, `Chaos Spawn: ${discarded.name} discarded.`);
    }
    // Draw a card
    const drawn = p.deck.shift();
    if (drawn) {
      p.hand.push(drawn);
      addLog(s, `Chaos Spawn: drew ${drawn.name}.`);
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
  // ── Predator's Mark ──
  else if (effect === 'predatorsmark') {
    if (target) s = _dispatchSpell(s, s.activePlayer, 'predatorsmark', [target]);
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
        const hasFriendlies = s.units.some(u => u.owner === s.activePlayer && u.uid !== priest.uid && u.hp < u.maxHp && adj.some(([r, c]) => u.row === r && u.col === c));
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

  return s;
}

export function cancelSpell(state) {
  const s = cloneState(state);
  s.pendingSpell = null;
  s.pendingSummon = null;
  s.pendingHandSelect = null;
  return s;
}

export function endActionPhase(state) {
  const s = cloneState(state);
  s.pendingSpell = null;
  s.pendingSummon = null;
  s.pendingHandSelect = null;
  s.phase = 'end-turn';
  return s;
}

// ── unit action abilities ─────────────────────────────────────────────────

export function triggerUnitAction(state, unitUid) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== s.activePlayer || unit.moved || unit.summoned) return s;

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

  return s;
}

// ── unit movement ──────────────────────────────────────────────────────────

export function getUnitMoveTiles(state, unitUid) {
  const unit = state.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== state.activePlayer) return [];
  // SPD 0 units cannot be selected for movement
  if (unit.spd === 0) return [];
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

function isTileOccupiedByFriendly(state, owner, row, col) {
  return state.units.some(u => u.owner === owner && u.row === row && u.col === col)
      || state.champions.some(c => c.owner === owner && c.row === row && c.col === col);
}

export function moveUnit(state, unitUid, row, col) {
  const s = cloneState(state);
  const unit = s.units.find(u => u.uid === unitUid);
  if (!unit) return s;

  const enemyUnit = s.units.find(u => u.owner !== unit.owner && u.row === row && u.col === col);
  const enemyChamp = s.champions.find(ch => ch.owner !== unit.owner && ch.row === row && ch.col === col);
  const combatTile = [row, col];

  if (enemyUnit) {
    // Reveal hidden enemy unit before resolving combat
    const wasHidden = enemyUnit.hidden;
    if (wasHidden) revealUnit(s, enemyUnit);

    // Shadow Trap on reveal: destroy the attacker
    if (wasHidden && enemyUnit.id === 'shadowtrap' && s.units.find(u => u.uid === enemyUnit.uid)) {
      addLog(s, `Shadow Trap springs! ${unit.name} is destroyed.`);
      destroyUnit(unit, s, 'shadowtrap');
      // Shadow Trap is now revealed (no longer hidden) but stays
      return s;
    }

    const attackerAtk = getEffectiveAtk(s, unit, combatTile);
    const defenderAtk = getEffectiveAtk(s, enemyUnit, combatTile);
    addLog(s, `${unit.name} attacks ${enemyUnit.name}!`);
    applyDamageToUnit(s, enemyUnit, attackerAtk, unit.name, combatTile);

    const stillAlive = s.units.find(u => u.uid === unitUid);
    if (stillAlive) {
      applyDamageToUnit(s, stillAlive, defenderAtk, enemyUnit.name, combatTile);
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
    // Fire attack triggers (Whisper, Crossbowman, Razorfang)
    const killedDefender = !s.units.find(u => u.uid === enemyUnit.uid);
    fireAttackTriggers(unit, enemyUnit, s, killedDefender);
  } else if (enemyChamp) {
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
  }

  updateWildbornAura(s);
  updateStandardBearerAura(s);
  return s;
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
    }
  });

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
    // Smite: enemy within 2 tiles of champion (not hidden)
    case 'smite':
      return state.units
        .filter(u => u.owner !== state.activePlayer && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
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

    // Bloom step 0: friendly unit or champion; step 1: enemy unit
    case 'bloom':
      if (step === 0) return ['champion' + state.activePlayer, ...state.units.filter(u => u.owner === state.activePlayer && !u.hidden).map(u => u.uid)];
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden).map(u => u.uid);

    // Entangle: friendly Elf unit
    case 'entangle':
      return state.units.filter(u => u.owner === state.activePlayer && u.unitType === 'Elf' && !u.hidden).map(u => u.uid);

    // Predator's Mark: enemy within 2 tiles of champion
    case 'predatorsmark':
      return state.units
        .filter(u => u.owner !== state.activePlayer && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);

    // Pounce: friendly Beast unit (resets its action)
    case 'pounce':
      return state.units.filter(u => u.owner === state.activePlayer && u.unitType === 'Beast').map(u => u.uid);

    // Ambush step 0: any friendly combat unit; step 1: enemy adjacent to selected unit
    case 'ambush':
      if (step === 0) return state.units.filter(u => u.owner === state.activePlayer).map(u => u.uid);
      if (data.beastUid) {
        const beast = state.units.find(u => u.uid === data.beastUid);
        if (!beast) return [];
        const adj = cardinalNeighbors(beast.row, beast.col);
        return state.units.filter(u => u.owner !== state.activePlayer && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
      }
      return [];

    // Blood Offering step 0: friendly unit; step 1: any enemy
    case 'bloodoffering':
      if (step === 0) return state.units.filter(u => u.owner === state.activePlayer).map(u => u.uid);
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden).map(u => u.uid);

    // Pact of Ruin damage: any enemy unit or enemy champion
    case 'pactofruin_damage':
      return [
        'champion' + (1 - state.activePlayer),
        ...state.units.filter(u => u.owner !== state.activePlayer && !u.hidden).map(u => u.uid),
      ];

    // Dark Sentence: any enemy unit
    case 'darksentence':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden).map(u => u.uid);

    // Devour: enemy with 2 or less HP
    case 'devour':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && u.hp <= 2).map(u => u.uid);

    // Soul Drain: enemy unit
    case 'souldrain':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden).map(u => u.uid);

    // Woodland Guard action: enemy within 2 tiles
    case 'woodlandguard_action': {
      const src = state.units.find(u => u.uid === (data.sourceUid || ''));
      if (!src) return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden).map(u => u.uid);
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && manhattan([src.row, src.col], [u.row, u.col]) <= 2).map(u => u.uid);
    }

    // Battle Priest summon trigger step 0: enemy within 1 tile; step 1: friendly within 1 tile
    case 'battlepriestunit_summon': {
      const priest = state.units.find(u => u.uid === (data.sourceUid || ''));
      if (!priest) return [];
      const adj = cardinalNeighbors(priest.row, priest.col);
      if (step === 0) {
        return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
      }
      return state.units.filter(u => u.owner === state.activePlayer && u.uid !== priest.uid && u.hp < u.maxHp && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
    }

    // Pack Runner action: friendly unit (not packrunner itself)
    case 'packrunner_action':
      return state.units.filter(u => u.owner === state.activePlayer && u.id !== 'packrunner').map(u => u.uid);

    // Elf Archer action: enemy within 2 tiles
    case 'elfarcher_action': {
      const archer = data.sourceUid ? state.units.find(u => u.uid === data.sourceUid) : null;
      if (!archer) return [];
      return state.units.filter(u => u.owner !== state.activePlayer && manhattan([archer.row, archer.col], [u.row, u.col]) <= 2).map(u => u.uid);
    }

    default:
      return [];
  }
}

// ── archer shoot targets ───────────────────────────────────────────────────

export function getArcherShootTargets(state, archerUid) {
  const archer = state.units.find(u => u.uid === archerUid);
  if (!archer) return [];
  return state.units
    .filter(u => u.owner !== state.activePlayer && manhattan([archer.row, archer.col], [u.row, u.col]) <= 2)
    .map(u => u.uid);
}
