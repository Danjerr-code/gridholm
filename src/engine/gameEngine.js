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

// Returns the total ATK aura bonus applied to a unit from all friendly aura units on the board.
export function getAuraAtkBonus(state, unit) {
  let bonus = 0;
  for (const other of state.units) {
    if (other.owner !== unit.owner || other.uid === unit.uid) continue;
    if (!other.aura || other.aura.stat !== 'atk' || other.aura.target === 'enemy') continue;
    if (manhattan([other.row, other.col], [unit.row, unit.col]) <= other.aura.range) {
      bonus += other.aura.value;
    }
  }
  // Enemy debuff auras (e.g. Aendor): enemy units with aura.target === 'enemy' reduce this unit's ATK
  for (const other of state.units) {
    if (other.owner === unit.owner) continue;
    if (!other.aura || other.aura.stat !== 'atk' || other.aura.target !== 'enemy') continue;
    if (manhattan([other.row, other.col], [unit.row, unit.col]) <= other.aura.range) {
      bonus -= Math.abs(other.aura.value);
    }
  }
  return bonus;
}

// HP aura stub — no HP aura cards exist yet, but follows the same pattern for future use.
export function getAuraHpBonus(/* state, unit */) {
  // Future: scan state.units for aura.stat === 'hp' and sum bonuses within range.
  return 0;
}

// SPD aura stub — no SPD aura cards exist yet, follows same pattern for future use.
export function getAuraSpdBonus(/* state, unit */) {
  // Future: scan state.units for aura.stat === 'spd' and sum bonuses within range.
  return 0;
}

function effectiveAtk(state, unit) {
  return Math.max(0, unit.atk + (unit.atkBonus || 0) + getAuraAtkBonus(state, unit));
}

// Exported variant for UI components that need the resolved ATK value.
export function getEffectiveAtk(state, unit) {
  return effectiveAtk(state, unit);
}

// Deep-clone state
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// ── initializer ────────────────────────────────────────────────────────────

export function createInitialState() {
  const p1Deck = shuffle(buildDeck());
  const p2Deck = shuffle(buildDeck());

  const p1Hand = p1Deck.splice(0, 5);
  const p2Hand = p2Deck.splice(0, 5);

  return {
    turn: 1,
    activePlayer: 0, // 0 = P1, 1 = P2
    phase: 'begin-turn',
    phaseStep: 0, // for auto-phases
    winner: null,
    pendingDiscard: false,
    players: [
      { id: 0, name: 'Player 1', resources: 0, turnCount: 0, hand: p1Hand, deck: p1Deck, discard: [] },
      { id: 1, name: 'AI',       resources: 0, turnCount: 0, hand: p2Hand, deck: p2Deck, discard: [] },
    ],
    champions: [
      { owner: 0, row: 0, col: 0, hp: 20, maxHp: 20, moved: false },
      { owner: 1, row: 4, col: 4, hp: 20, maxHp: 20, moved: false },
    ],
    units: [],
    log: ['Game started. P1 goes first. Both players start with 5 cards. P1 skips draw on turn 1.'],
    // Pending spell state
    pendingSpell: null, // { cardUid, effect, playerIdx }
    // Archer shot tracking: set of unit UIDs that used skip-to-shoot this turn
    archerShot: [],
    // Recall tracking: card IDs recalled this turn cannot be replayed
    recalledThisTurn: [],
  };
}

// ── log helper ─────────────────────────────────────────────────────────────

function addLog(state, msg) {
  state.log = [...state.log, msg].slice(-50);
}

// ── HIDDEN UNIT RULES ──────────────────────────────────────────────────────
// Hidden units are face-down tokens invisible to the opponent.
// - Movement: Hidden units move at most 1 tile per turn regardless of base SPD.
//   Moving does not reveal the unit.
// - Reveal triggers (automatically): enemy unit steps onto hidden tile (combat
//   resolves normally after reveal); enemy champion moves adjacent to hidden
//   unit (reveal, no combat).
// - Player-initiated reveal: controlling player may reveal as the unit's action;
//   the unit is marked moved:true and cannot act further this turn.
// - Spell/ability targeting while hidden: Smite, Forge Weapon, Iron Shield, and
//   Swift Step cannot target hidden units. Recall can. Mend Allies and area spells
//   (Crownshatter, Imp Time Bomb) skip hidden units.
// - After reveal the unit is a full combat unit. All spells and abilities can
//   target it. Its full SPD applies from the next turn onward.

function revealUnit(state, unit) {
  unit.hidden = false;
  addLog(state, `${unit.name} revealed!`);
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

  // Draw: P1 skips draw on turn 1
  let drawnCard = null;
  const skipDraw = state.turn === 1 && state.activePlayer === 0;
  if (!skipDraw) {
    drawnCard = p.deck.shift() || null;
    if (drawnCard) p.hand.push(drawnCard);
  }

  // Gain resources
  p.turnCount = (p.turnCount || 0) + 1;
  // P2 going-second bonus: first turn grants 2 resources instead of 1
  const bonus = state.activePlayer === 1 ? 1 : 0;
  p.resources = Math.min(p.turnCount + bonus, 10);

  // Combined begin-turn log entry
  const drawnPart = skipDraw
    ? 'Skipped draw (turn 1 rule).'
    : drawnCard
      ? `Drew ${drawnCard.name}.`
      : 'No cards left to draw.';
  addLog(state, `${p.name} begins turn ${p.turnCount}. ${drawnPart} Resources: ${p.resources}/10.`);

  // BEGIN TURN TRIGGERS - card abilities fire here

  // Imp Time Bomb: sacrifice to deal 2 damage to all units within 2 tiles
  const impBombs = state.units.filter(u => u.owner === state.activePlayer && u.id === 'imptimebomb');
  for (const bomb of impBombs) {
    // Hidden units are unaffected by Imp Time Bomb area damage
    const nearby = state.units.filter(u => !u.hidden && manhattan([u.row, u.col], [bomb.row, bomb.col]) <= 2 && u.uid !== bomb.uid);
    for (const target of nearby) {
      target.hp -= 2;
    }
    state.units = state.units.filter(u => u.uid !== bomb.uid);
    addLog(state, `Imp Time Bomb explodes! ${nearby.length} units hit.`);
  }
  // Remove units killed by the explosion
  state.units = state.units.filter(u => u.hp > 0);

  // Zmore, Sleeping Ash: deal 1 damage to all enemy units at beginning of owner's turn
  const zmores = state.units.filter(u => u.owner === state.activePlayer && u.id === 'zmore');
  for (const zmore of zmores) {
    const enemies = state.units.filter(u => u.owner !== state.activePlayer);
    for (const enemy of enemies) {
      enemy.hp -= 1;
    }
    addLog(state, `Zmore, Sleeping Ash awakens! All enemy units take 1 damage.`);
  }
  // Remove units killed by Zmore
  state.units = state.units.filter(u => u.hp > 0);

  // Clear recalled-this-turn at the start of each turn
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
    if (hiddenEnemy) revealUnit(s, hiddenEnemy);
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
    // Recalled units cannot be played the turn they were recalled
    if ((s.recalledThisTurn || []).includes(card.id)) return s;
    // Unit summon — needs a target tile; return state with pendingSummon marker
    s.pendingSummon = { cardUid, card };
    return s;
  }

  if (card.type === 'spell') {
    // Some spells need a target, some don't
    if (card.effect === 'mendallies') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      // Restore 2 HP to all friendly units (Hidden units are not restored)
      s.units.forEach(u => {
        if (u.owner === s.activePlayer && !u.hidden) {
          u.hp = Math.min(u.maxHp, u.hp + 2);
        }
      });
      addLog(s, `${p.name} casts Mend Allies. All friendly units restored 2 HP.`);
    } else if (card.effect === 'rallyingcry') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      // All friendly units gain +1 SPD this turn
      s.units.forEach(u => {
        if (u.owner === s.activePlayer) {
          u.speedBonus = (u.speedBonus || 0) + 1;
        }
      });
      addLog(s, `${p.name} casts Rallying Cry. All friendly units gain +1 SPD this turn.`);
    } else if (card.effect === 'crownshatter') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      // Deal 3 damage to all units within 2 tiles of the Throne (row 2, col 2)
      // Hidden units are unaffected by Crownshatter area damage
      const throneRow = 2, throneCol = 2;
      const hit = s.units.filter(u => !u.hidden && manhattan([u.row, u.col], [throneRow, throneCol]) <= 2);
      for (const u of hit) {
        u.hp -= 3;
        addLog(s, `Crownshatter hits ${u.name} for 3 damage (${u.hp}/${u.maxHp} HP).`);
      }
      const destroyed = hit.filter(u => u.hp <= 0);
      for (const u of destroyed) {
        addLog(s, `${u.name} is destroyed.`);
        onFriendlyUnitDestroyed(s, u);
      }
      s.units = s.units.filter(u => u.hp > 0);
      addLog(s, `${p.name} casts Crownshatter! ${hit.length} unit(s) hit.`);
    } else if (card.effect === 'ironthorns') {
      p.resources -= card.cost;
      p.hand.splice(cardIdx, 1);
      p.discard.push(card);
      // Give the active player's champion a thorn shield
      const champ = s.champions[s.activePlayer];
      champ.thornShield = { absorb: 3, thornDamage: 3 };
      addLog(s, `${p.name} casts Iron Thorns. Champion gains a thorn shield (absorb 3, thorn 3).`);
    } else {
      // Needs target — set pendingSpell
      s.pendingSpell = { cardUid, effect: card.effect, playerIdx: s.activePlayer };
      return s;
    }
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
    summoned: card.rush ? false : true, // Rush units can move immediately
    moved: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
    hidden: card.hidden || false,
  };
  s.units.push(unit);
  addLog(s, `${p.name} summons ${card.name} at (${row},${col}).${card.rush ? ' Rush!' : ''}`);

  // Elf Elder on-summon: restore 2 HP to champion
  if (card.id === 'elfelder') {
    const champ = s.champions[s.activePlayer];
    champ.hp = Math.min(champ.maxHp, champ.hp + 2);
    addLog(s, `Elf Elder restores 2 HP to ${p.name}'s champion.`);
  }

  return s;
}

export function resolveSpell(state, cardUid, targetUnitUid) {
  const s = cloneState(state);
  const p = s.players[s.activePlayer];
  const cardIdx = p.hand.findIndex(c => c.uid === cardUid);
  if (cardIdx === -1) return s;
  const card = p.hand[cardIdx];
  if (p.resources < card.cost) return s;

  p.resources -= card.cost;
  p.hand.splice(cardIdx, 1);
  p.discard.push(card);
  s.pendingSpell = null;

  const target = s.units.find(u => u.uid === targetUnitUid);

  if (card.effect === 'smite' && target) {
    const champ = s.champions[s.activePlayer];
    if (manhattan([champ.row, champ.col], [target.row, target.col]) <= 2) {
      applyDamageToUnit(s, target, 4, p.name);
    }
  } else if (card.effect === 'forgeweapon' && target) {
    target.atkBonus = (target.atkBonus || 0) + 3;
    addLog(s, `${p.name} forges weapon on ${target.name}. +3 ATK.`);
  } else if (card.effect === 'ironshield' && target) {
    target.shield = (target.shield || 0) + 5;
    addLog(s, `${p.name} gives Iron Shield to ${target.name}.`);
  } else if (card.effect === 'recall' && target) {
    // Return the unit to the owner's hand, restored to base stats
    const { owner: _o, row: _r, col: _c, maxHp: _mh, summoned: _s, moved: _mv,
            atkBonus: _ab, shield: _sh, speedBonus: _sb, ...baseFields } = target;
    const recalledCard = {
      ...baseFields,
      hp: target.maxHp, // restore to full HP
      uid: `${target.id}_${Math.random().toString(36).slice(2)}`,
    };
    s.units = s.units.filter(u => u.uid !== target.uid);
    p.hand.push(recalledCard);
    s.recalledThisTurn = [...(s.recalledThisTurn || []), recalledCard.id];
    addLog(s, `${target.name} recalled to hand. Cannot be played this turn.`);
  }

  return s;
}

export function cancelSpell(state) {
  const s = cloneState(state);
  s.pendingSpell = null;
  s.pendingSummon = null;
  return s;
}

export function endActionPhase(state) {
  const s = cloneState(state);
  s.pendingSpell = null;
  s.pendingSummon = null;
  s.phase = 'end-turn';
  return s;
}

// ── unit movement ──────────────────────────────────────────────────────────

export function getUnitMoveTiles(state, unitUid) {
  const unit = state.units.find(u => u.uid === unitUid);
  if (!unit || unit.owner !== state.activePlayer || unit.summoned || unit.moved) return [];
  // Hidden units move at most 1 tile per turn regardless of base SPD
  const speed = unit.hidden ? 1 : (unit.spd + (unit.speedBonus || 0));
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
      // Can move onto enemy unit or champion (combat), or empty tile
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

// For a speed-2 unit clicking the champion tile from distance 2, find the
// cardinal neighbor of the champion tile that the unit should land on.
function findIntermediateTile(state, unit, champRow, champCol) {
  const champNeighbors = cardinalNeighbors(champRow, champCol);
  // Prefer a champion neighbor that is directly adjacent to the unit and unoccupied
  const onPath = champNeighbors.find(([r, c]) =>
    manhattan([unit.row, unit.col], [r, c]) === 1 && !isTileOccupied(state, r, c)
  );
  if (onPath) return onPath;
  // Fallback: any unoccupied champion neighbor
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

  if (enemyUnit) {
    // Reveal hidden enemy unit before resolving combat
    if (enemyUnit.hidden) revealUnit(s, enemyUnit);
    // Combat: both deal damage simultaneously
    const attackerAtk = effectiveAtk(s, unit);
    const defenderAtk = effectiveAtk(s, enemyUnit);
    addLog(s, `${unit.name} attacks ${enemyUnit.name}!`);
    applyDamageToUnit(s, enemyUnit, attackerAtk, unit.name);
    // Check if attacker survives
    const stillAlive = s.units.find(u => u.uid === unitUid);
    if (stillAlive) {
      applyDamageToUnit(s, stillAlive, defenderAtk, enemyUnit.name);
      const stillAlive2 = s.units.find(u => u.uid === unitUid);
      if (stillAlive2) {
        // Only advance into the tile if the defender was destroyed
        const defenderDestroyed = !s.units.find(u => u.uid === enemyUnit.uid);
        if (defenderDestroyed) {
          stillAlive2.row = row;
          stillAlive2.col = col;
        }
        stillAlive2.moved = true;
      }
    }
    // Crossbowman draw trigger: if crossbowman destroyed a unit
    if (unit.id === 'crossbowman' && !s.units.find(u => u.uid === enemyUnit.uid)) {
      const p = s.players[unit.owner];
      const drawn = p.deck.shift();
      if (drawn) {
        p.hand.push(drawn);
        addLog(s, `Crossbowman trigger: ${s.players[unit.owner].name} draws ${drawn.name}.`);
      }
    }
  } else if (enemyChamp) {
    // CHAMPION ATTACK - unit stays in its current tile (or advances to adjacent tile for speed-2)
    // No unit removal code in this block — champion attacks do not counter-attack.
    const attackerAtk = effectiveAtk(s, unit);
    const dist = manhattan([unit.row, unit.col], [row, col]);
    if (dist > 1) {
      // Speed-2 unit attacking from 2 tiles away: advance to the adjacent tile on the path
      const [mr, mc] = findIntermediateTile(s, unit, row, col);
      unit.row = mr;
      unit.col = mc;
    }
    // If dist === 1 the unit is already adjacent; stays where it is.
    let champDmg = attackerAtk;
    if (enemyChamp.thornShield) {
      // If the attacker is a Hidden unit, reveal it before thorn damage applies
      if (unit.hidden) revealUnit(s, unit);
      const absorbed = Math.min(enemyChamp.thornShield.absorb, champDmg);
      champDmg -= absorbed;
      const thornDmg = enemyChamp.thornShield.thornDamage;
      addLog(s, `Iron Thorns absorbs ${absorbed} damage. Attacker takes ${thornDmg} damage.`);
      applyDamageToUnit(s, unit, thornDmg, 'Iron Thorns');
      enemyChamp.thornShield = null;
    }
    enemyChamp.hp -= champDmg;
    addLog(s, `${unit.name} attacks ${s.players[enemyChamp.owner].name}'s champion for ${champDmg} damage from (${unit.row},${unit.col}).`);
    // unit may have been destroyed by thorn — re-check
    const unitAfterThorn = s.units.find(u => u.uid === unitUid);
    if (unitAfterThorn) unitAfterThorn.moved = true;
    checkWinner(s);
  } else {
    // Regular move
    unit.row = row;
    unit.col = col;
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
  addLog(state, `${unit.name} takes ${actualDmg} damage (${unit.hp}/${unit.maxHp} HP).`);
  // Guard: only remove a unit when hp has actually dropped to zero or below.
  // A unit with positive HP must never be removed by this filter.
  if (unit.hp <= 0) {
    addLog(state, `${unit.name} is destroyed.`);
    state.units = state.units.filter(u => u.uid !== unit.uid);
    // Sister Siofra: restore 2 HP to owner's champion when a friendly unit is destroyed
    onFriendlyUnitDestroyed(state, unit);
  }
}

function onFriendlyUnitDestroyed(state, destroyedUnit) {
  const siofra = state.units.find(u => u.owner === destroyedUnit.owner && u.id === 'sistersiofra');
  if (!siofra || destroyedUnit.id === 'sistersiofra') return;
  const champ = state.champions[destroyedUnit.owner];
  const healed = Math.min(2, champ.maxHp - champ.hp);
  champ.hp = Math.min(champ.maxHp, champ.hp + 2);
  addLog(state, `Sister Siofra mourns. Champion restored ${healed} HP.`);
}

// Elf Archer ranged shot — player opts to skip move
export function archerShoot(state, archerUid, targetUid) {
  const s = cloneState(state);
  const archer = s.units.find(u => u.uid === archerUid);
  const target = s.units.find(u => u.uid === targetUid);
  if (!archer || !target) return s;
  if (archer.moved || archer.summoned) return s;
  if (manhattan([archer.row, archer.col], [target.row, target.col]) > 2) return s;

  archer.moved = true; // can't also move this turn
  s.archerShot.push(archerUid);
  applyDamageToUnit(s, target, 2, archer.name);
  addLog(s, `Elf Archer fires at ${target.name}!`);
  return s;
}

// ── end phase ──────────────────────────────────────────────────────────────

export function endTurn(state) {
  const s = cloneState(state);
  const p = s.players[s.activePlayer];
  const champ = s.champions[s.activePlayer];

  // Throne check: if champion on (2,2), opponent takes up to 4 damage (cannot reduce below 1 HP)
  if (champ.row === 2 && champ.col === 2) {
    const oppIdx = 1 - s.activePlayer;
    const maxDamage = Math.max(0, s.champions[oppIdx].hp - 1);
    const actualDamage = Math.min(4, maxDamage);
    if (actualDamage > 0) {
      s.champions[oppIdx].hp -= actualDamage;
      addLog(s, `${p.name}'s champion controls the Throne! ${s.players[oppIdx].name}'s champion takes ${actualDamage} damage.`);
    } else {
      addLog(s, `${p.name}'s champion controls the Throne, but the enemy champion is protected at 1 HP.`);
    }
    checkWinner(s);
    if (s.winner) return s;
  }

  // Hand limit: 6
  if (p.hand.length > 6) {
    if (s.activePlayer === 1) {
      // AI: auto-discard lowest cost card(s)
      while (p.hand.length > 6) {
        const lowestIdx = p.hand.reduce((minIdx, c, i, arr) => c.cost < arr[minIdx].cost ? i : minIdx, 0);
        const [discarded] = p.hand.splice(lowestIdx, 1);
        p.discard.push(discarded);
        addLog(s, `${p.name} discards ${discarded.name} (hand limit).`);
      }
    } else {
      // Human: enter pending discard state — turn does not advance yet
      s.pendingDiscard = true;
      addLog(s, `${p.name} has too many cards. Click a card to discard.`);
      return s;
    }
  }

  return completeTurnAdvance(s);
}

function completeTurnAdvance(state) {
  const s = state; // already cloned by caller
  const champ = s.champions[s.activePlayer];

  s.pendingDiscard = false;

  // Clear summoning sickness and speed bonuses for active player's units
  s.units.forEach(u => {
    if (u.owner === s.activePlayer) {
      u.summoned = false;
      u.moved = false;
      u.speedBonus = 0;
    }
  });

  // Reset archer shot list
  s.archerShot = [];
  // Recalled cards can be played again next turn
  s.recalledThisTurn = [];

  // Reset champion moved state
  champ.moved = false;

  // END TURN TRIGGERS - card abilities fire here

  // Pip the Hungry: gains +1 ATK and +1 HP at end of owner's turn
  s.units.forEach(u => {
    if (u.owner === s.activePlayer && u.id === 'pip') {
      u.atk += 1;
      u.hp += 1;
      u.maxHp += 1;
      addLog(s, `Pip the Hungry grows! Now ${u.atk}/${u.hp}.`);
    }
  });

  // Advance turn
  const nextPlayer = 1 - s.activePlayer;
  s.activePlayer = nextPlayer;
  if (nextPlayer === 0) s.turn++;

  s.phase = 'begin-turn';
  addLog(s, `--- Turn ${s.turn}: ${s.players[nextPlayer].name}'s turn ---`);

  return autoAdvancePhase(s); // auto begin-turn (draw + resource + advance to action)
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

  return s; // still over limit, keep pendingDiscard: true
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

export function getSpellTargets(state, effect) {
  const champ = state.champions[state.activePlayer];
  switch (effect) {
    case 'smite':
      // Hidden units cannot be targeted by Smite
      return state.units
        .filter(u => u.owner !== state.activePlayer && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);
    case 'forgeweapon':
    case 'ironshield':
    case 'swiftstep':
      // Hidden units cannot be targeted by Forge Weapon, Iron Shield, or Swift Step
      return state.units.filter(u => u.owner === state.activePlayer && !u.hidden).map(u => u.uid);
    case 'recall':
      // Recall can target Hidden units
      return state.units.filter(u => u.owner === state.activePlayer).map(u => u.uid);
    default:
      return [];
  }
}

// ── summon tile validity ───────────────────────────────────────────────────

export function getArcherShootTargets(state, archerUid) {
  const archer = state.units.find(u => u.uid === archerUid);
  if (!archer) return [];
  return state.units
    .filter(u => u.owner !== state.activePlayer && manhattan([archer.row, archer.col], [u.row, u.col]) <= 2)
    .map(u => u.uid);
}
