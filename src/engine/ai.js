import {
  cloneState,
  manhattan,
  getChampionMoveTiles,
  moveChampion,
  getSummonTiles,
  summonUnit,
  getUnitMoveTiles,
  moveUnit,
  endActionPhase,
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
  if (champ.moved || (champ.row === 2 && champ.col === 2)) return state;

  const moveTiles = getChampionMoveTiles(state);
  if (moveTiles.length === 0) return state;

  // Pick tile closest to center (2,2)
  moveTiles.sort((a, b) => manhattan(a, [2, 2]) - manhattan(b, [2, 2]));
  const [r, c] = moveTiles[0];
  return moveChampion(state, r, c);
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
    if (s.players[AI_PLAYER].resources <= 0) break;
  }

  // Try spells
  const spells = s.players[AI_PLAYER].hand.filter(c => c.type === 'spell');
  for (const spell of spells) {
    if (s.players[AI_PLAYER].resources < spell.cost) continue;
    const targets = getSpellTargets(s, spell.effect);
    if (spell.effect === 'mendallies') {
      s = resolveSpell(s, spell.uid, null);
    } else if (targets.length > 0) {
      s = resolveSpell(s, spell.uid, targets[0]);
    }
  }

  return s;
}

// ── Unit move: toward nearest enemy ───────────────────────────────────────
function aiUnitMove(state) {
  let s = cloneState(state);
  const aiUnits = s.units.filter(u => u.owner === AI_PLAYER && !u.summoned && !u.moved);

  for (const unit of aiUnits) {
    const liveUnit = s.units.find(u => u.uid === unit.uid);
    if (!liveUnit) continue;

    const moveTiles = getUnitMoveTiles(s, liveUnit.uid);
    if (moveTiles.length === 0) continue;

    const enemyUnits = s.units.filter(u => u.owner !== AI_PLAYER);
    const enemyChamp = s.champions[0];
    const targets = [
      ...enemyUnits.map(u => ({ row: u.row, col: u.col })),
      { row: enemyChamp.row, col: enemyChamp.col },
    ];

    if (targets.length === 0) continue;

    moveTiles.sort((a, b) => {
      const minA = Math.min(...targets.map(t => manhattan(a, [t.row, t.col])));
      const minB = Math.min(...targets.map(t => manhattan(b, [t.row, t.col])));
      return minA - minB;
    });

    const [tr, tc] = moveTiles[0];
    s = moveUnit(s, liveUnit.uid, tr, tc);
  }

  return s;
}

// AI Hidden unit handling: when Hidden cards are added to the AI deck, AI should
// reveal Hidden units when adjacent to enemy units rather than keeping them hidden
// indefinitely. Implement when Demon deck is built.

// ── Main AI turn driver ────────────────────────────────────────────────────

export function runAITurn(state) {
  let s = cloneState(state);

  // All actions happen in the single action phase
  s = aiChampionMove(s);
  s = aiSummonCast(s);
  s = aiUnitMove(s);

  // End action phase then end turn
  s = endActionPhase(s);
  s = endTurn(s);
  return s;
}
