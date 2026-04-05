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

function effectiveAtk(state, unit) {
  // Captain aura: friendly units adjacent to captain gain +1 ATK
  const captains = state.units.filter(u => u.owner === unit.owner && u.id === 'captain' && u.uid !== unit.uid);
  const auraBonus = captains.some(c => manhattan([c.row, c.col], [unit.row, unit.col]) === 1) ? 1 : 0;
  return unit.atk + (unit.atkBonus || 0) + auraBonus;
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
  };
}

// ── log helper ─────────────────────────────────────────────────────────────

function addLog(state, msg) {
  state.log = [...state.log, msg].slice(-50);
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
    const nearby = state.units.filter(u => manhattan([u.row, u.col], [bomb.row, bomb.col]) <= 2 && u.uid !== bomb.uid);
    for (const target of nearby) {
      target.hp -= 2;
    }
    state.units = state.units.filter(u => u.uid !== bomb.uid);
    addLog(state, `Imp Time Bomb explodes! ${nearby.length} units hit.`);
  }
  // Remove units killed by the explosion
  state.units = state.units.filter(u => u.hp > 0);

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
      // Restore 2 HP to all friendly units
      s.units.forEach(u => {
        if (u.owner === s.activePlayer) {
          u.hp = Math.min(u.maxHp, u.hp + 2);
        }
      });
      addLog(s, `${p.name} casts Mend Allies. All friendly units restored 2 HP.`);
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
    summoned: true, // summoning sickness
    moved: false,
    atkBonus: 0,
    shield: 0,
    speedBonus: 0,
  };
  s.units.push(unit);
  addLog(s, `${p.name} summons ${card.name} at (${row},${col}).`);

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
  } else if (card.effect === 'swiftstep' && target) {
    target.speedBonus = (target.speedBonus || 0) + 1;
    addLog(s, `${p.name} casts Swift Step on ${target.name}. +1 speed this turn.`);
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
  const speed = unit.spd + (unit.speedBonus || 0);
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
    enemyChamp.hp -= attackerAtk;
    addLog(s, `${unit.name} attacks ${s.players[enemyChamp.owner].name}'s champion for ${attackerAtk} damage from (${unit.row},${unit.col}).`);
    unit.moved = true;
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

  // Throne check: if champion on (2,2), opponent takes 4 damage
  if (champ.row === 2 && champ.col === 2) {
    const oppIdx = 1 - s.activePlayer;
    s.champions[oppIdx].hp -= 4;
    addLog(s, `${p.name}'s champion controls the Throne! ${s.players[oppIdx].name}'s champion takes 4 damage.`);
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
      return state.units
        .filter(u => u.owner !== state.activePlayer && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        .map(u => u.uid);
    case 'forgeweapon':
    case 'ironshield':
    case 'swiftstep':
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
