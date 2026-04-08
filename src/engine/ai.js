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
  getChampionDef,
  getChampionAbilityTargets,
  applyChampionAbility,
} from './gameEngine.js';
import { chooseActionStrategic, applyAction as applyActionStrategic } from './strategicAI.js';

// ── AI mode ────────────────────────────────────────────────────────────────────
// 'strategic' uses minimax (default). 'heuristic' uses the rule-based AI.
let _aiMode = 'strategic';
export function setAIMode(mode) { _aiMode = mode; }
export function getAIMode() { return _aiMode; }

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

  // Play units and relics first (highest cost)
  const units = p.hand.filter(c => c.type === 'unit' || c.type === 'relic').sort((a, b) => b.cost - a.cost);
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

// ── Lethal pre-check: move a unit into the enemy champion for the win ──────
// Scores lethal moves at 1000 priority: if any unit can move onto the enemy champion
// tile and its ATK is >= the champion HP, apply that move immediately and return the
// new state. Returns the original state if no lethal exists.
function aiLethalCheck(state) {
  const s = cloneState(state);
  const enemyChamp = s.champions[0]; // AI is player 1, enemy is player 0

  for (const unit of s.units.filter(u => u.owner === AI_PLAYER && !u.moved)) {
    const moveTiles = getUnitMoveTiles(s, unit.uid);
    const lethalTile = moveTiles.find(([r, c]) => r === enemyChamp.row && c === enemyChamp.col);
    if (lethalTile && unit.atk >= enemyChamp.hp) {
      return moveUnit(s, unit.uid, lethalTile[0], lethalTile[1]);
    }
  }

  return state;
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

// ── Champion ability: evaluated after summoning, before unit move ──────────
function aiChampionAbility(state) {
  const s = cloneState(state);
  const p = s.players[AI_PLAYER];
  const champ = s.champions[AI_PLAYER];

  // Skip if champion has already moved/acted this turn (ability uses the action)
  if (champ.moved) return s;

  // Prioritize board development in the first 4 turns
  if (s.turn <= 4) return s;

  const champDef = getChampionDef(p);
  const isAscended = p.resonance?.tier === 'ascended';
  const ability = isAscended && champDef.abilities.ascended?.type === 'activated'
    ? champDef.abilities.ascended
    : champDef.abilities.attuned;

  if (!ability || ability.type !== 'activated') return s;

  // Determine mana cost (dark_pact costs HP not mana)
  const manaCost = ability.cost?.type === 'mana' ? ability.cost.amount : 0;

  // Skip if using ability would leave insufficient mana to summon any unit in hand
  if (manaCost > 0) {
    const unitsInHand = p.hand.filter(c => c.type === 'unit');
    if (unitsInHand.length > 0) {
      const cheapestUnit = Math.min(...unitsInHand.map(c => c.cost));
      if (p.resources - manaCost < cheapestUnit) return s;
    }
    if (p.resources < manaCost) return s;
  }

  const attr = champDef.attribute;

  if (attr === 'light') {
    // Shield: use on a friendly unit adjacent to an enemy that would die without the +2 HP
    // Prioritize units with aura keyword
    const targets = getChampionAbilityTargets(s, AI_PLAYER, 'friendly_unit_within_2');
    const enemyUnits = s.units.filter(u => u.owner !== AI_PLAYER);

    const vulnerable = targets
      .map(uid => s.units.find(u => u.uid === uid))
      .filter(Boolean)
      .filter(unit => {
        // Must be adjacent to at least one enemy
        const adjacentEnemy = enemyUnits.find(e => manhattan([unit.row, unit.col], [e.row, e.col]) <= 1);
        if (!adjacentEnemy) return false;
        // Would die without the shield bonus
        return adjacentEnemy.atk >= unit.hp;
      });

    if (vulnerable.length === 0) return s;

    // Prioritize aura units, then by how close they are to dying
    vulnerable.sort((a, b) => {
      const auraA = a.rules && a.rules.toLowerCase().includes('aura') ? 1 : 0;
      const auraB = b.rules && b.rules.toLowerCase().includes('aura') ? 1 : 0;
      if (auraB !== auraA) return auraB - auraA;
      return a.hp - b.hp; // lower HP first (most at risk)
    });

    return applyChampionAbility(s, AI_PLAYER, 'shield', vulnerable[0].uid);

  } else if (attr === 'primal') {
    // Howl: use on a unit about to attack (adjacent to an enemy).
    // Prioritize the unit that can now kill an enemy it couldn't before.
    const targets = getChampionAbilityTargets(s, AI_PLAYER, 'friendly_unit_within_2');
    const enemyUnits = s.units.filter(u => u.owner !== AI_PLAYER);

    const attackers = targets
      .map(uid => s.units.find(u => u.uid === uid))
      .filter(Boolean)
      .filter(unit => enemyUnits.some(e => manhattan([unit.row, unit.col], [e.row, e.col]) <= 1));

    if (attackers.length === 0) return s;

    // Score: prefer a unit that can now kill an enemy it couldn't before
    attackers.sort((a, b) => {
      const gainA = enemyUnits.some(e => a.atk < e.hp && (a.atk + 2) >= e.hp) ? 1 : 0;
      const gainB = enemyUnits.some(e => b.atk < e.hp && (b.atk + 2) >= e.hp) ? 1 : 0;
      return gainB - gainA;
    });

    return applyChampionAbility(s, AI_PLAYER, 'howl', attackers[0].uid);

  } else if (attr === 'mystic') {
    // Nurture: use on the friendly unit with the highest HP. Skip Saplings.
    const targets = getChampionAbilityTargets(s, AI_PLAYER, 'friendly_unit');
    const eligible = targets
      .map(uid => s.units.find(u => u.uid === uid))
      .filter(Boolean)
      .filter(unit => unit.id !== 'sapling' && unit.id !== 'token_sapling');

    if (eligible.length === 0) return s;

    eligible.sort((a, b) => b.hp - a.hp);
    return applyChampionAbility(s, AI_PLAYER, 'nurture', eligible[0].uid);

  } else if (attr === 'dark') {
    if (isAscended) {
      // Dark Pact: use if champion has more than 10 HP and fewer than 3 cards in hand
      if (champ.hp > 10 && p.hand.length < 3) {
        return applyChampionAbility(s, AI_PLAYER, 'dark_pact', null);
      }
    } else {
      // Corrupt: target the enemy unit with the lowest HP
      const targets = getChampionAbilityTargets(s, AI_PLAYER, 'enemy_unit');
      if (targets.length === 0) return s;

      const lowestHp = targets
        .map(uid => s.units.find(u => u.uid === uid))
        .filter(Boolean)
        .sort((a, b) => a.hp - b.hp)[0];

      if (!lowestHp) return s;
      return applyChampionAbility(s, AI_PLAYER, 'corrupt', lowestHp.uid);
    }
  }

  return s;
}

// ── Main AI turn driver ────────────────────────────────────────────────────

export function runAITurn(state) {
  if (_aiMode === 'strategic') {
    return runStrategicTurn(state);
  }
  return runHeuristicTurn(state);
}

// Returns an array of intermediate states, one per action step.
// Decision logic is identical to runAITurn — this only adds step recording.
// Synchronous so all AI decisions are computed in Phase 1 before any visual replay begins.
export function runAITurnSteps(state) {
  if (_aiMode === 'strategic') {
    return runStrategicTurnSteps(state);
  }
  return runHeuristicTurnSteps(state);
}

function runHeuristicTurn(state) {
  let s = cloneState(state);

  // Pre-check lethal: if a unit can kill the enemy champion, do it first.
  const lethalState = aiLethalCheck(s);
  if (lethalState !== s) return endTurn(endActionPhase(lethalState));

  s = aiChampionAbility(s);
  s = aiChampionMove(s);
  s = aiSummonCast(s);
  s = aiUnitMove(s);

  s = endActionPhase(s);
  s = endTurn(s);
  return s;
}

function runHeuristicTurnSteps(state) {
  const steps = [];
  let s = cloneState(state);

  // Pre-check lethal: if a unit can kill the enemy champion, do it first.
  const lethalState = aiLethalCheck(s);
  if (lethalState !== s) {
    steps.push(lethalState);
    steps.push(endTurn(endActionPhase(lethalState)));
    return steps;
  }

  s = aiChampionAbility(s); steps.push(s);
  s = aiChampionMove(s); steps.push(s);
  s = aiSummonCast(s); steps.push(s);
  s = aiUnitMove(s); steps.push(s);
  s = endActionPhase(s);
  s = endTurn(s);
  steps.push(s);
  return steps;
}

function runStrategicTurn(state) {
  let s = cloneState(state);
  let actionCount = 0;
  const MAX_ACTIONS = 150; // safety cap

  while (!s.winner && actionCount < MAX_ACTIONS) {
    const commandsUsed = s.players[s.activePlayer]?.commandsUsed ?? 0;
    const action = chooseActionStrategic(s, commandsUsed);
    s = applyActionStrategic(s, action);
    actionCount++;
    if (action.type === 'endTurn') break;
  }

  return s;
}

function runStrategicTurnSteps(state) {
  const steps = [];
  let s = cloneState(state);
  let actionCount = 0;
  const MAX_ACTIONS = 150;

  while (!s.winner && actionCount < MAX_ACTIONS) {
    const commandsUsed = s.players[s.activePlayer]?.commandsUsed ?? 0;
    const action = chooseActionStrategic(s, commandsUsed);
    s = applyActionStrategic(s, action);
    steps.push(s);
    actionCount++;
    if (action.type === 'endTurn') break;
  }

  return steps;
}
