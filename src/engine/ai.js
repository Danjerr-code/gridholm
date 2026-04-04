import {
  cloneState,
  manhattan,
  cardinalNeighbors,
  getChampionMoveTiles,
  moveChampion,
  getSummonTiles,
  summonUnit,
  getUnitMoveTiles,
  moveUnit,
  endChampionMovePhase,
  endSummonCastPhase,
  endUnitMovePhase,
  endTurn,
  resolveSpell,
  getSpellTargets,
} from './gameEngine.js';

const AI_PLAYER = 1;

function getAIChampion(state) {
  return state.champions[AI_PLAYER];
}

// ── Champion move: toward center ───────────────────────────────────────────
function aiChampionMove(state) {
  const champ = getAIChampion(state);
  if (champ.row === 2 && champ.col === 2) return endChampionMovePhase(state);

  const moveTiles = getChampionMoveTiles(state);
  if (moveTiles.length === 0) return endChampionMovePhase(state);

  // Pick tile closest to center (2,2)
  moveTiles.sort((a, b) => manhattan(a, [2, 2]) - manhattan(b, [2, 2]));
  const [r, c] = moveTiles[0];
  let s = moveChampion(state, r, c);
  s.phase = 'summon_cast';
  return s;
}

// ── Summon: highest cost unit that fits ───────────────────────────────────
function aiSummonCast(state) {
  let s = cloneState(state);
  const p = s.players[AI_PLAYER];

  // Try to play units first
  const units = p.hand.filter(c => c.type === 'unit').sort((a, b) => b.cost - a.cost);
  for (const card of units) {
    if (p.resources < card.cost) continue;
    const summonTiles = getSummonTiles(s);
    if (summonTiles.length === 0) break;
    const [r, c] = summonTiles[0];
    s = summonUnit(s, card.uid, r, c);
    // Re-fetch player after state clone
    if (s.players[AI_PLAYER].resources <= 0) break;
  }

  // Try spells
  const spells = s.players[AI_PLAYER].hand.filter(c => c.type === 'spell');
  for (const spell of spells) {
    if (s.players[AI_PLAYER].resources < spell.cost) continue;
    const targets = getSpellTargets(s, spell.effect);
    if (spell.effect === 'mendallies') {
      // Resolve directly (no target needed) via resolveSpell with null
      s = resolveSpell(s, spell.uid, null);
    } else if (targets.length > 0) {
      // Pick first valid target
      const targetUid = targets[0];
      s = resolveSpell(s, spell.uid, targetUid);
    }
  }

  s.phase = 'unit_move';
  return s;
}

// ── Unit move: toward nearest enemy ───────────────────────────────────────
function aiUnitMove(state) {
  let s = cloneState(state);
  const aiUnits = s.units.filter(u => u.owner === AI_PLAYER && !u.summoned && !u.moved);

  for (const unit of aiUnits) {
    // Re-fetch unit from current state (may have been destroyed)
    const liveUnit = s.units.find(u => u.uid === unit.uid);
    if (!liveUnit) continue;

    const moveTiles = getUnitMoveTiles(s, liveUnit.uid);
    if (moveTiles.length === 0) continue;

    // Find nearest target (enemy unit or enemy champion)
    const enemyUnits = s.units.filter(u => u.owner !== AI_PLAYER);
    const enemyChamp = s.champions[0];
    const targets = [
      ...enemyUnits.map(u => ({ row: u.row, col: u.col })),
      { row: enemyChamp.row, col: enemyChamp.col },
    ];

    if (targets.length === 0) continue;

    // Sort move tiles by min distance to any target
    moveTiles.sort((a, b) => {
      const minA = Math.min(...targets.map(t => manhattan(a, [t.row, t.col])));
      const minB = Math.min(...targets.map(t => manhattan(b, [t.row, t.col])));
      return minA - minB;
    });

    const [tr, tc] = moveTiles[0];
    s = moveUnit(s, liveUnit.uid, tr, tc);
  }

  s.phase = 'end';
  return s;
}

// ── Main AI turn driver ────────────────────────────────────────────────────

export function runAITurn(state) {
  let s = cloneState(state);

  // Phase: champion_move
  s = aiChampionMove(s);
  // Phase: summon_cast
  s = aiSummonCast(s);
  // Phase: unit_move
  s = aiUnitMove(s);
  // End turn
  s = endTurn(s);
  return s;
}
