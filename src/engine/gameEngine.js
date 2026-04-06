import { buildDeck, shuffle } from './cards.js';

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

function championAt(state, row, col) {
  return state.champions.find(c => c.row === row && c.col === col) || null;
}

function isTileOccupied(state, row, col) {
  return !!unitAt(state, row, col) || !!championAt(state, row, col);
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function getPlayer(state) { return state.players[state.activePlayer]; }

// Returns effective ATK bonus from friendly/enemy auras (stat === 'atk')
export function getAuraAtkBonus(state, unit) {
  let bonus = 0;
  for (const other of state.units) {
    if (other.owner !== unit.owner || other.uid === unit.uid) continue;
    if (!other.aura || other.aura.stat !== 'atk' || other.aura.target === 'enemy') continue;
    if (manhattan([other.row, other.col], [unit.row, unit.col]) <= other.aura.range) {
      bonus += other.aura.value;
    }
  }
  // Enemy debuff auras (e.g. Aendor)
  for (const other of state.units) {
    if (other.owner === unit.owner) continue;
    if (!other.aura || other.aura.stat !== 'atk' || other.aura.target !== 'enemy') continue;
    if (manhattan([other.row, other.col], [unit.row, unit.col]) <= other.aura.range) {
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

// Pack Runt: +1/+1 per other friendly Beast combat unit in play
function getPackRuntBonus(state, unit) {
  if (unit.id !== 'packrunt') return { atk: 0, hp: 0 };
  const count = state.units.filter(u => u.owner === unit.owner && u.uid !== unit.uid && u.unitType === 'Beast').length;
  return { atk: count, hp: count };
}

function effectiveAtk(state, unit) {
  const base = unit.atk + (unit.atkBonus || 0) + (unit.turnAtkBonus || 0) + getAuraAtkBonus(state, unit);
  const sbBonus = getStandardBearerBonus(state, unit).atk;
  const packBonus = getPackRuntBonus(state, unit).atk;
  return Math.max(0, base + sbBonus + packBonus);
}

export function getEffectiveAtk(state, unit) {
  return effectiveAtk(state, unit);
}

export function getEffectiveSpd(unit) {
  return unit.spd + (unit.speedBonus || 0);
}

// HP aura stub
export function getAuraHpBonus(/* state, unit */) {
  return 0;
}

// SPD aura stub
export function getAuraSpdBonus(/* state, unit */) {
  return 0;
}

// Deep-clone state
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// ── HP restore ─────────────────────────────────────────────────────────────
// Single point of HP restoration for the entire engine.
// target: unit/champion object OR 'champion0'/'champion1' string.
// Returns actual amount healed.
function restoreHP(target, amount, state, source = 'effect') {
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
export function destroyUnit(unit, state, source = 'combat', destroyingUids = new Set()) {
  if (destroyingUids.has(unit.uid)) return state;
  destroyingUids.add(unit.uid);

  // Remove from board
  state.units = state.units.filter(u => u.uid !== unit.uid);

  // Fire death triggers
  fireDeathTriggers(unit, state, source, destroyingUids);

  addLog(state, `${unit.name} destroyed`);
  return state;
}

// ============================================
// DEATH TRIGGERS
// Fires from destroyUnit whenever any unit is destroyed
// ADD NEW DEATH TRIGGERS HERE
// ============================================
function fireDeathTriggers(unit, state, source, destroyingUids) {
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
    const adj = cardinalNeighbors(unit.row, unit.col);
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

  // 1. Seedling: restore 1 HP to champion for each friendly cannotMove unit
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.cannotMove) {
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

  // 4. Zmore: deal 1 damage to all units
  state.units.forEach(u => {
    if (u.owner === playerIdx && u.id === 'zmore') {
      addLog(state, `Zmore, Sleeping Ash stirs. All units take 1 damage.`);
      const allUnits = [...state.units];
      for (const t of allUnits) {
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

  // 5. Throne damage: deal 4 damage to opponent champion (cannot reduce below 1 HP)
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
}

// ── initializer ────────────────────────────────────────────────────────────

export function createInitialState(p1DeckId = 'human', p2DeckId = 'human') {
  const p1Deck = shuffle(buildDeck(p1DeckId));
  const p2Deck = shuffle(buildDeck(p2DeckId));

  const p1Hand = p1Deck.splice(0, 5);
  const p2Hand = p2Deck.splice(0, 5);

  return {
    turn: 1,
    activePlayer: 0,
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
    log: ['Game started. P1 goes first. Both players start with 5 cards. P1 skips draw on turn 1.'],
    pendingSpell: null,   // { cardUid, effect, playerIdx, step, data }
    pendingHandSelect: null, // { reason, cardUid, data } — when spell needs hand card selection
    pendingFleshtitheSacrifice: null, // { unitUid } — Flesh Tithe confirm
    archerShot: [],
    recalledThisTurn: [],
  };
}

// ── log helper ─────────────────────────────────────────────────────────────

function addLog(state, msg) {
  state.log = [...state.log, msg].slice(-50);
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
  const skipDraw = state.turn === 1 && state.activePlayer === 0;
  if (!skipDraw) {
    drawnCard = p.deck.shift() || null;
    if (drawnCard) p.hand.push(drawnCard);
  }

  // Gain resources
  p.turnCount = (p.turnCount || 0) + 1;
  const bonus = state.activePlayer === 1 ? 1 : 0;
  p.resources = Math.min(p.turnCount + bonus, 10);

  const drawnPart = skipDraw
    ? 'Skipped draw (turn 1 rule).'
    : drawnCard
      ? `Drew ${drawnCard.name}.`
      : 'No cards left to draw.';
  addLog(state, `${p.name} begins turn ${p.turnCount}. ${drawnPart} Resources: ${p.resources}/10.`);

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
  return cardinalNeighbors(champ.row, champ.col)
    .filter(([r, c]) => !isTileOccupied(state, r, c));
}

export function moveChampion(state, row, col) {
  const s = cloneState(state);
  const champ = s.champions[s.activePlayer];
  champ.row = row;
  champ.col = col;
  champ.moved = true;
  addLog(s, `${getPlayer(s).name}'s champion moves to (${row},${col}).`);
  // Reveal Hidden enemy units adjacent to champion's new position
  for (const [nr, nc] of cardinalNeighbors(row, col)) {
    const hiddenEnemy = s.units.find(u => u.owner !== s.activePlayer && u.row === nr && u.col === nc && u.hidden);
    if (hiddenEnemy) {
      revealUnit(s, hiddenEnemy);
      if (hiddenEnemy.id === 'shadowtrap') {
        // Shadow Trap: destroy the unit that revealed it (champion can't be destroyed, skip)
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
  const s = cloneState(state);
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
    // Spells that resolve immediately without a target
    if (card.effect === 'overgrowth') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.units.forEach(u => {
        if (u.owner === s.activePlayer && !u.hidden) {
          const healed = restoreHP(u, 2, s);
          if (healed > 0) addLog(s, `${u.name} restored ${healed} HP.`);
        }
      });
      // Also restore champion
      const champ = s.champions[s.activePlayer];
      const champHealed = restoreHP(champ, 2, s);
      if (champHealed > 0) addLog(s, `${p.name}'s champion restored ${champHealed} HP.`);
      addLog(s, `${p.name} casts Overgrowth. All friendly units restore 2 HP.`);
      return s;
    }

    if (card.effect === 'packhowl') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.units.forEach(u => {
        if (u.owner === s.activePlayer && u.unitType === 'Beast') {
          u.speedBonus = (u.speedBonus || 0) + 1;
        }
      });
      addLog(s, `${p.name} casts Pack Howl. All friendly Beasts gain +1 SPD this turn.`);
      return s;
    }

    if (card.effect === 'callofthesnakes') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      const champ = s.champions[s.activePlayer];
      const adj = cardinalNeighbors(champ.row, champ.col).filter(([r, c]) => !isTileOccupied(s, r, c));
      for (const [r, c] of adj) {
        s.units.push({
          id: 'snake', name: 'Snake', type: 'unit', atk: 1, hp: 1, maxHp: 1, spd: 1,
          unitType: 'Beast', rules: '', owner: s.activePlayer, row: r, col: c,
          summoned: true, moved: false, atkBonus: 0, shield: 0, speedBonus: 0, hidden: false,
          uid: `snake_${Math.random().toString(36).slice(2)}`,
        });
      }
      addLog(s, `${p.name} casts Call of the Snakes. ${adj.length} Snake(s) summoned.`);
      return s;
    }

    if (card.effect === 'rally') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.units.forEach(u => {
        if (u.owner === s.activePlayer) {
          u.turnAtkBonus = (u.turnAtkBonus || 0) + 1;
        }
      });
      addLog(s, `${p.name} casts Rally. All friendly units gain +1 ATK this turn.`);
      return s;
    }

    if (card.effect === 'crusade') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.units.forEach(u => {
        if (u.owner === s.activePlayer) {
          u.turnAtkBonus = (u.turnAtkBonus || 0) + 2;
        }
      });
      addLog(s, `${p.name} casts Crusade. All friendly units gain +2 ATK this turn.`);
      return s;
    }

    if (card.effect === 'ironthorns') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      const champ = s.champions[s.activePlayer];
      champ.thornShield = { absorb: 3, thornDamage: 3 };
      addLog(s, `${p.name} casts Iron Thorns. Champion gains a thorn shield (absorb 3, thorn 3).`);
      return s;
    }

    if (card.effect === 'infernalpact') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      const champ = s.champions[s.activePlayer];
      champ.hp = Math.max(1, champ.hp - 3);
      addLog(s, `${p.name} casts Infernal Pact. Champion takes 3 damage.`);
      s.units.forEach(u => {
        if (u.owner === s.activePlayer && u.unitType === 'Demon') {
          u.turnAtkBonus = (u.turnAtkBonus || 0) + 2;
        }
      });
      addLog(s, `All friendly Demons gain +2 ATK this turn.`);
      return s;
    }

    if (card.effect === 'martiallaw') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      const champ = s.champions[s.activePlayer];
      const affected = s.units.filter(u =>
        u.owner !== s.activePlayer &&
        manhattan([champ.row, champ.col], [u.row, u.col]) <= 2
      );
      for (const u of affected) {
        u.martialLaw = true;
      }
      addLog(s, `${p.name} casts Martial Law. ${affected.length} enemy unit(s) affected.`);
      return s;
    }

    if (card.effect === 'fortify') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      s.units.forEach(u => {
        if (u.owner === s.activePlayer) {
          u.hp = Math.min(u.maxHp + 2, u.hp + 2);
          u.fortifyBonus = (u.fortifyBonus || 0) + 2;
        }
      });
      addLog(s, `${p.name} casts Fortify. All friendly units gain +2 HP until next turn.`);
      return s;
    }

    // Pact of Ruin: needs hand card selection first, then enemy target
    if (card.effect === 'pactofruin') {
      if (p.hand.length <= 1) {
        // No other cards to discard — skip the discard step and deal damage directly
        p.resources -= card.cost;
        p.hand.splice(cardIdx, 1);
        p.discard.push(card);
        s.pendingSpell = { cardUid: null, effect: 'pactofruin_damage', playerIdx: s.activePlayer, step: 0, data: {} };
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

  s.units.push(unit);
  addLog(s, `${p.name} summons ${card.name} at (${row},${col}).${card.rush ? ' Rush!' : ''}`);

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
  const s = cloneState(state);
  const pending = s.pendingSpell;
  if (!pending) return s;

  const p = s.players[s.activePlayer];

  // For spells that consumed resources at pendingSpell creation we don't deduct again.
  // For spells that set pendingSpell from playCard, resources/hand already consumed.
  // Special case: 'pactofruin_damage' was already paid.
  const isPaid = pending.effect === 'pactofruin_damage';

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
  const target = targetUnitUid ? s.units.find(u => u.uid === targetUnitUid) : null;
  const effect = pending.effect;
  const step = pending.step || 0;
  const data = pending.data || {};

  // ── Smite ──
  if (effect === 'smite') {
    if (target) {
      const champ = s.champions[s.activePlayer];
      if (manhattan([champ.row, champ.col], [target.row, target.col]) <= 2) {
        applyDamageToUnit(s, target, 4, 'Smite');
      }
    }
  }
  // ── Forge Weapon ──
  else if (effect === 'forgeweapon') {
    if (target) {
      target.atkBonus = (target.atkBonus || 0) + 3;
      addLog(s, `${p.name} forges weapon on ${target.name}. +3 ATK.`);
    }
  }
  // ── Iron Shield ──
  else if (effect === 'ironshield') {
    if (target) {
      target.shield = (target.shield || 0) + 5;
      addLog(s, `${p.name} gives Iron Shield to ${target.name}.`);
    }
  }
  // ── Recall ──
  else if (effect === 'recall') {
    if (target) {
      const { owner: _o, row: _r, col: _c, maxHp: _mh, summoned: _s, moved: _mv,
              atkBonus: _ab, shield: _sh, speedBonus: _sb, turnAtkBonus: _ta, ...baseFields } = target;
      const recalledCard = { ...baseFields, hp: target.maxHp, uid: `${target.id}_${Math.random().toString(36).slice(2)}` };
      s.units = s.units.filter(u => u.uid !== target.uid);
      p.hand.push(recalledCard);
      s.recalledThisTurn = [...(s.recalledThisTurn || []), recalledCard.id];
      addLog(s, `${target.name} recalled to hand. Cannot be played this turn.`);
    }
  }
  // ── Moonleaf ──
  else if (effect === 'moonleaf') {
    if (target) {
      const handCount = p.hand.length; // hand size AFTER playing moonleaf (already removed)
      target.maxHp += handCount;
      const healed = restoreHP(target, handCount, s);
      addLog(s, `Moonleaf: ${target.name} gains +${handCount} HP.`);
    }
  }
  // ── Bloom (step 0: friendly, step 1: enemy) ──
  else if (effect === 'bloom') {
    if (step === 0) {
      // Friendly unit selected: restore 2 HP
      if (target) {
        const healed = restoreHP(target, 2, s);
        addLog(s, `Bloom: ${target.name} restored ${healed} HP.`);
      }
      // Now pick enemy target
      s.pendingSpell = { cardUid, effect: 'bloom', playerIdx: s.activePlayer, step: 1, data: { ...data, paid: true } };
    } else {
      // Step 1: enemy target — deal damage equal to hpRestoredThisTurn
      if (target) {
        const dmg = p.hpRestoredThisTurn || 0;
        addLog(s, `Bloom: deals ${dmg} damage to ${target.name}.`);
        applyDamageToUnit(s, target, dmg, 'Bloom');
      }
    }
  }
  // ── Bloom step 1 can come back through resolveSpell after s.pendingSpell is set ──
  else if (effect === 'bloom' && step === 1) {
    if (target) {
      const dmg = p.hpRestoredThisTurn || 0;
      addLog(s, `Bloom: deals ${dmg} damage to ${target.name}.`);
      applyDamageToUnit(s, target, dmg, 'Bloom');
    }
  }
  // ── Entangle ──
  else if (effect === 'entangle') {
    if (target) {
      const adj = cardinalNeighbors(target.row, target.col);
      const affected = s.units.filter(u =>
        u.owner !== s.activePlayer &&
        adj.some(([r, c]) => u.row === r && u.col === c)
      );
      for (const u of affected) u.martialLaw = true;
      addLog(s, `Entangle: ${affected.length} enemy unit(s) around ${target.name} cannot move next turn.`);
    }
  }
  // ── Predator's Mark ──
  else if (effect === 'predatorsmark') {
    if (target) {
      target.martialLaw = true;
      addLog(s, `Predator's Mark: ${target.name} cannot act next turn.`);
    }
  }
  // ── Pounce ──
  else if (effect === 'pounce') {
    if (target) {
      // Select this unit: mark as pending for movement (handled by UI selecting tiles)
      // Engine-side: just mark the unit as pounce-ready (engine resolves actual move via moveUnit)
      target.pounceReady = true;
      addLog(s, `Pounce: ${target.name} may move up to 2 tiles ignoring sickness.`);
      // The UI will trigger moveUnit which respects pounceReady
    }
  }
  // ── Savage Growth ──
  else if (effect === 'savagegrowth') {
    if (target) {
      target.atk += 2;
      target.hp += 2;
      target.maxHp += 2;
      addLog(s, `Savage Growth: ${target.name} gains +2/+2 permanently.`);
    }
  }
  // ── Ambush (step 0: friendly Beast, step 1: adjacent enemy) ──
  else if (effect === 'ambush') {
    if (step === 0) {
      // Select a friendly Beast unit
      if (target) {
        s.pendingSpell = { cardUid, effect: 'ambush', playerIdx: s.activePlayer, step: 1, data: { beastUid: target.uid, paid: true } };
      }
    } else {
      // Step 1: select adjacent enemy (unit or champion implied via uid)
      const beast = s.units.find(u => u.uid === data.beastUid);
      if (beast && target) {
        // Resolve combat: beast attacks target without moving
        const attackerAtk = effectiveAtk(s, beast);
        addLog(s, `Ambush: ${beast.name} battles ${target.name}!`);
        applyDamageToUnit(s, target, attackerAtk, beast.name);
        // Beast does NOT take counterattack from enemy unit combat in Ambush
      }
    }
  }
  // ── Blood Offering (step 0: sacrifice, step 1: enemy target) ──
  else if (effect === 'bloodoffering') {
    if (step === 0) {
      // Select friendly unit to sacrifice
      if (target) {
        const sacrificeAtk = target.atk;
        addLog(s, `Blood Offering: ${target.name} (${sacrificeAtk} ATK) sacrificed.`);
        destroyUnit(target, s, 'sacrifice');
        s.pendingSpell = { cardUid, effect: 'bloodoffering', playerIdx: s.activePlayer, step: 1, data: { sacrificeAtk, paid: true } };
      }
    } else {
      // Step 1: deal sacrifice ATK damage to enemy target
      if (target) {
        const dmg = data.sacrificeAtk || 0;
        addLog(s, `Blood Offering: ${dmg} damage to ${target.name}.`);
        applyDamageToUnit(s, target, dmg, 'Blood Offering');
      }
    }
  }
  // ── Pact of Ruin damage ──
  else if (effect === 'pactofruin_damage') {
    if (target) {
      addLog(s, `Pact of Ruin: 3 damage to ${target.name}.`);
      applyDamageToUnit(s, target, 3, 'Pact of Ruin');
    }
  }
  // ── Dark Sentence ──
  else if (effect === 'darksentence') {
    if (target) {
      addLog(s, `Dark Sentence: ${target.name} destroyed.`);
      destroyUnit(target, s, 'darksentence');
    }
  }
  // ── Devour ──
  else if (effect === 'devour') {
    if (target && target.hp <= 2) {
      addLog(s, `Devour: ${target.name} consumed.`);
      destroyUnit(target, s, 'devour');
    }
  }
  // ── Shadow Veil ──
  else if (effect === 'shadowveil') {
    if (target) {
      target.hidden = true;
      addLog(s, `Shadow Veil: ${target.name} becomes Hidden.`);
    }
  }
  // ── Soul Drain ──
  else if (effect === 'souldrain') {
    if (target) {
      const actualDmg = Math.min(2, target.hp);
      addLog(s, `Soul Drain: 2 damage to ${target.name}.`);
      applyDamageToUnit(s, target, 2, 'Soul Drain');
      const champ = s.champions[s.activePlayer];
      const healed = restoreHP(champ, actualDmg, s);
      addLog(s, `Soul Drain: champion restores ${healed} HP.`);
    }
  }
  // ── Woodland Guard action ──
  else if (effect === 'woodlandguard_action') {
    if (target) {
      addLog(s, `Woodland Guard: deals 2 damage to ${target.name}.`);
      applyDamageToUnit(s, target, 2, 'Woodland Guard');
    }
  }
  // ── Battle Priest action (step 0: enemy, step 1: friendly) ──
  else if (effect === 'battlepriestunit_action') {
    if (step === 0) {
      // Enemy target selected
      if (target) {
        addLog(s, `Battle Priest: deals 2 damage to ${target.name}.`);
        applyDamageToUnit(s, target, 2, 'Battle Priest');
      }
      s.pendingSpell = { cardUid, effect: 'battlepriestunit_action', playerIdx: s.activePlayer, step: 1, data: { ...data, paid: true } };
    } else {
      // Friendly target selected: restore 2 HP
      if (target) {
        const healed = restoreHP(target, 2, s);
        addLog(s, `Battle Priest: restores ${healed} HP to ${target.name}.`);
      }
    }
  }
  // ── Grove Warden action ──
  else if (effect === 'grovewarden_action') {
    const elfCount = s.units.filter(u => u.owner === s.activePlayer && u.unitType === 'Elf' && u.id !== 'grovewarden').length;
    const champ = s.champions[s.activePlayer];
    const healed = restoreHP(champ, elfCount, s);
    addLog(s, `Grove Warden: champion restores ${elfCount} HP (${elfCount} friendly Elves).`);
  }
  // ── Pack Runner action ──
  else if (effect === 'packrunner_action') {
    if (target && target.id !== 'packrunner') {
      target.moved = false;
      // Don't clear summoning sickness
      addLog(s, `Pack Runner: ${target.name} action reset.`);
    }
  }
  // ── Dark Dealer action ──
  else if (effect === 'darkdealer_action') {
    const champ = s.champions[s.activePlayer];
    champ.hp = Math.max(1, champ.hp - 2);
    addLog(s, `Dark Dealer: champion takes 2 damage.`);
    const drawn = p.deck.shift();
    if (drawn && p.hand.length < 6) {
      p.hand.push(drawn);
      addLog(s, `Dark Dealer: drew ${drawn.name}.`);
    }
  }
  // ── Sergeant action ──
  else if (effect === 'sergeant_action') {
    p.sergeantBuff = true;
    addLog(s, `Sergeant: next unit played this turn gains +1/+1.`);
  }
  // ── Elf Archer action (ranged 2 damage) ──
  else if (effect === 'elfarcher_action') {
    if (target) {
      applyDamageToUnit(s, target, 2, 'Elf Archer');
      addLog(s, `Elf Archer fires at ${target.name}!`);
    }
    // Mark the archer as moved
    if (data.archerUid) {
      const archer = s.units.find(u => u.uid === data.archerUid);
      if (archer) archer.moved = true;
    }
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

  if (unit.id === 'sergeant') {
    unit.moved = true;
    s.pendingSpell = { cardUid: null, effect: 'sergeant_action', playerIdx: s.activePlayer, step: 0, data: {} };
    // Resolve immediately — no target needed
    return resolveSpell(s, null, null);
  }
  if (unit.id === 'battlepriestunit') {
    unit.moved = true;
    s.pendingSpell = { cardUid: unit.uid, effect: 'battlepriestunit_action', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid } };
    return s; // wait for enemy target selection
  }
  if (unit.id === 'woodlandguard') {
    unit.moved = true;
    s.pendingSpell = { cardUid: unit.uid, effect: 'woodlandguard_action', playerIdx: s.activePlayer, step: 0, data: { sourceUid: unit.uid } };
    return s; // wait for enemy target
  }
  if (unit.id === 'grovewarden') {
    unit.moved = true;
    s.pendingSpell = { cardUid: unit.uid, effect: 'grovewarden_action', playerIdx: s.activePlayer, step: 0, data: {} };
    return resolveSpell(s, null, null);
  }
  if (unit.id === 'packrunner') {
    unit.moved = true;
    s.pendingSpell = { cardUid: unit.uid, effect: 'packrunner_action', playerIdx: s.activePlayer, step: 0, data: {} };
    return s; // wait for friendly target
  }
  if (unit.id === 'darkdealer') {
    unit.moved = true;
    s.pendingSpell = { cardUid: unit.uid, effect: 'darkdealer_action', playerIdx: s.activePlayer, step: 0, data: {} };
    return resolveSpell(s, null, null);
  }
  if (unit.id === 'elfarcher') {
    unit.moved = true;
    s.pendingSpell = { cardUid: unit.uid, effect: 'elfarcher_action', playerIdx: s.activePlayer, step: 0, data: { archerUid: unit.uid } };
    return s; // wait for target selection
  }

  return s;
}

// ── unit movement ──────────────────────────────────────────────────────────

export function getUnitMoveTiles(state, unitUid) {
  const unit = state.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== state.activePlayer) return [];
  // cannotMove units (Seedling) cannot be selected for movement
  if (unit.cannotMove) return [];
  if (unit.summoned || unit.moved) {
    // Pounce: Beast unit can move ignoring sickness
    if (unit.pounceReady) {
      const speed = 2;
      return reachableTiles(state, unit, speed);
    }
    return [];
  }
  // Hidden units move at most 1 tile
  const speed = unit.hidden ? 1 : getEffectiveSpd(unit);
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

  // Clear pounce ready flag
  const wasPounce = unit.pounceReady;
  unit.pounceReady = false;

  const enemyUnit = s.units.find(u => u.owner !== unit.owner && u.row === row && u.col === col);
  const enemyChamp = s.champions.find(ch => ch.owner !== unit.owner && ch.row === row && ch.col === col);

  if (enemyUnit) {
    // Reveal shadow veil-given hidden before combat
    if (unit.hidden) revealUnit(s, unit);
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

    const attackerAtk = effectiveAtk(s, unit);
    const defenderAtk = effectiveAtk(s, enemyUnit);
    addLog(s, `${unit.name} attacks ${enemyUnit.name}!`);
    applyDamageToUnit(s, enemyUnit, attackerAtk, unit.name);

    const stillAlive = s.units.find(u => u.uid === unitUid);
    if (stillAlive) {
      applyDamageToUnit(s, stillAlive, defenderAtk, enemyUnit.name);
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
    // Reveal hidden attacker
    if (unit.hidden) revealUnit(s, unit);
    const attackerAtk = effectiveAtk(s, unit);
    const dist = manhattan([unit.row, unit.col], [row, col]);
    if (dist > 1) {
      const [mr, mc] = findIntermediateTile(s, unit, row, col);
      unit.row = mr;
      unit.col = mc;
    }
    let champDmg = attackerAtk;
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
    // Regular move — clear shadow-veil hidden if moving
    if (unit.hidden && !unit.id) {
      // Shadow veil'd units lose hidden on move
      unit.hidden = false;
    }
    unit.row = row;
    unit.col = col;
    unit.moved = !wasPounce; // if pounce, stay moveable? No — pounce marks moved after
    unit.moved = true;
  }

  return s;
}

function applyDamageToUnit(state, unit, dmg, sourceName) {
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
    destroyUnit(unit, state, 'combat');
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
    }
  });

  s.archerShot = [];
  s.recalledThisTurn = [];
  s.players[s.activePlayer].sergeantBuff = false;

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

    // Forge Weapon, Iron Shield, Shadow Veil, Recall, Moonleaf, Savage Growth, Pounce: friendly (not hidden for most)
    case 'forgeweapon':
    case 'ironshield':
    case 'shadowveil':
    case 'savagegrowth':
      return state.units.filter(u => u.owner === state.activePlayer && !u.hidden).map(u => u.uid);
    case 'recall':
      return state.units.filter(u => u.owner === state.activePlayer).map(u => u.uid);
    case 'moonleaf':
      return state.units.filter(u => u.owner === state.activePlayer && !u.hidden && u.type === 'unit').map(u => u.uid);

    // Bloom step 0: friendly unit; step 1: enemy unit
    case 'bloom':
      if (step === 0) return state.units.filter(u => u.owner === state.activePlayer && !u.hidden).map(u => u.uid);
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden).map(u => u.uid);

    // Entangle: friendly Elf unit
    case 'entangle':
      return state.units.filter(u => u.owner === state.activePlayer && u.unitType === 'Elf' && !u.hidden).map(u => u.uid);

    // Predator's Mark: enemy within 2 tiles of champion
    case 'predatorsmark':
      return state.units
        .filter(u => u.owner !== state.activePlayer && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);

    // Pounce: friendly Beast unit
    case 'pounce':
      return state.units.filter(u => u.owner === state.activePlayer && u.unitType === 'Beast').map(u => u.uid);

    // Ambush step 0: friendly Beast; step 1: enemy adjacent to selected Beast
    case 'ambush':
      if (step === 0) return state.units.filter(u => u.owner === state.activePlayer && u.unitType === 'Beast').map(u => u.uid);
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

    // Pact of Ruin damage: any enemy unit
    case 'pactofruin_damage':
      return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden).map(u => u.uid);

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

    // Battle Priest action step 0: enemy within 1 tile; step 1: friendly within 1 tile
    case 'battlepriestunit_action': {
      const priest = state.units.find(u => u.uid === (data.sourceUid || ''));
      if (!priest) return [];
      if (step === 0) {
        const adj = cardinalNeighbors(priest.row, priest.col);
        return state.units.filter(u => u.owner !== state.activePlayer && !u.hidden && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
      }
      const adj = cardinalNeighbors(priest.row, priest.col);
      return state.units.filter(u => u.owner === state.activePlayer && u.uid !== priest.uid && adj.some(([r, c]) => u.row === r && u.col === c)).map(u => u.uid);
    }

    // Pack Runner action: friendly unit (not packrunner itself)
    case 'packrunner_action':
      return state.units.filter(u => u.owner === state.activePlayer && u.id !== 'packrunner').map(u => u.uid);

    // Elf Archer action: enemy within 2 tiles
    case 'elfarcher_action': {
      const archer = data.archerUid ? state.units.find(u => u.uid === data.archerUid) : null;
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
