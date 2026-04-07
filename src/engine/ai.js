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
  resolveHandSelect,
  getSpellTargets,
} from './gameEngine.js';

// AI deck selection: always Human for now.
// Update when AI difficulty levels are added.
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

  moveTiles.sort((a, b) => manhattan(a, [2, 2]) - manhattan(b, [2, 2]));
  const [r, c] = moveTiles[0];
  return moveChampion(state, r, c);
}

// ── Summon: highest cost unit that fits ───────────────────────────────────
function aiSummonCast(state) {
  let s = cloneState(state);
  const p = s.players[AI_PLAYER];

  // Play units first (highest cost)
  const units = p.hand.filter(c => c.type === 'unit').sort((a, b) => b.cost - a.cost);
  for (const card of units) {
    if (p.resources < card.cost) continue;
    const summonTiles = getSummonTiles(s);
    if (summonTiles.length === 0) break;
    const [r, c] = summonTiles[0];
    s = summonUnit(s, card.uid, r, c);
    // Clear any pending states from on-summon effects (auto-resolve for AI)
    if (s.pendingHandSelect) {
      // Chaos Spawn: auto-discard first card in hand
      if (s.pendingHandSelect.reason === 'chaospawn' && s.players[AI_PLAYER].hand.length > 0) {
        s = resolveHandSelect(s, s.players[AI_PLAYER].hand[0].uid);
      }
      s.pendingHandSelect = null;
    }
    if (s.pendingFleshtitheSacrifice) {
      // Flesh Tithe: AI declines sacrifice
      s.pendingFleshtitheSacrifice = null;
    }
    if (p.resources <= 0) break;
  }

  // Play spells
  // Cast Smite on highest HP enemy in range; Iron Shield on lowest HP friendly; others randomly
  const spells = s.players[AI_PLAYER].hand.filter(c => c.type === 'spell');
  for (const spell of spells) {
    if (s.players[AI_PLAYER].resources < spell.cost) continue;
    const targets = getSpellTargets(s, spell.effect);

    if (spell.effect === 'smite') {
      // Target highest HP enemy
      if (targets.length > 0) {
        const targetUnit = targets
          .map(uid => s.units.find(u => u.uid === uid))
          .filter(Boolean)
          .sort((a, b) => b.hp - a.hp)[0];
        if (targetUnit) s = resolveSpell(s, spell.uid, targetUnit.uid);
      }
    } else if (spell.effect === 'ironshield') {
      // Target lowest HP friendly
      if (targets.length > 0) {
        const targetUnit = targets
          .map(uid => s.units.find(u => u.uid === uid))
          .filter(Boolean)
          .sort((a, b) => a.hp - b.hp)[0];
        if (targetUnit) s = resolveSpell(s, spell.uid, targetUnit.uid);
      }
    } else if (targets.length > 0) {
      // Cast on first valid target
      s = resolveSpell(s, spell.uid, targets[0]);
      // Clear multi-step pending spells
      if (s.pendingSpell) s.pendingSpell = null;
    } else if (spell.effect === 'overgrowth' || spell.effect === 'rally' || spell.effect === 'crusade' ||
               spell.effect === 'infernalpact' || spell.effect === 'packhowl' || spell.effect === 'callofthesnakes' ||
               spell.effect === 'martiallaw' || spell.effect === 'fortify') {
      // No-target spells — resolve with null
      s = resolveSpell(s, spell.uid, null);
    }
  }

  return s;
}

// ── Unit move: toward nearest enemy ───────────────────────────────────────
function aiUnitMove(state) {
  let s = cloneState(state);
  // TODO: AI Hidden strategy — teach AI to place Hidden units strategically and
  // reveal at optimal moments. For now, Hidden AI units are treated as normal units.
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

// ── Main AI turn driver ────────────────────────────────────────────────────

export function runAITurn(state) {
  let s = cloneState(state);

  s = aiChampionMove(s);
  s = aiSummonCast(s);
  s = aiUnitMove(s);

  s = endActionPhase(s);
  s = endTurn(s);
  return s;
}
