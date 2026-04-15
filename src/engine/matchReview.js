import { CARD_DB } from './cards.js';

/**
 * Compute a simple positional eval score for a game state, from P1's perspective.
 * Higher = better for P1.
 */
function evalState(state) {
  const p1Champ = state.champions?.[0];
  const p2Champ = state.champions?.[1];

  const myChampionHP = p1Champ?.hp ?? 0;
  const oppChampionHP = p2Champ?.hp ?? 0;

  const p1Units = (state.units ?? []).filter(u => u.owner === 0 && !u.isRelic && !u.isOmen);
  const p2Units = (state.units ?? []).filter(u => u.owner === 1 && !u.isRelic && !u.isOmen);

  const myUnitCount = p1Units.length;
  const oppUnitCount = p2Units.length;

  const myTotalATK = p1Units.reduce((sum, u) => sum + (u.atk ?? 0) + (u.atkBonus ?? 0), 0);
  const oppTotalATK = p2Units.reduce((sum, u) => sum + (u.atk ?? 0) + (u.atkBonus ?? 0), 0);

  // throneControl: +1 if P1 controls (2,2), -1 if P2 controls, 0 if neither
  const p1HasThrone =
    (p1Champ?.row === 2 && p1Champ?.col === 2) ||
    (state.units ?? []).some(u => u.owner === 0 && u.row === 2 && u.col === 2);
  const p2HasThrone =
    (p2Champ?.row === 2 && p2Champ?.col === 2) ||
    (state.units ?? []).some(u => u.owner === 1 && u.row === 2 && u.col === 2);
  const throneControl = p1HasThrone ? 1 : p2HasThrone ? -1 : 0;

  return (
    (myChampionHP - oppChampionHP) * 3 +
    (myUnitCount - oppUnitCount) * 5 +
    (myTotalATK - oppTotalATK) * 2 +
    throneControl * 10
  );
}

/**
 * Find the highest-value unit lost between two snapshots for a given player.
 * Returns the unit card name if found, else null.
 */
function findHighestThreatLost(prevState, nextState, playerOwner) {
  const prevUnits = (prevState.units ?? []).filter(u => u.owner === playerOwner && !u.isRelic && !u.isOmen);
  const nextUids = new Set((nextState.units ?? []).map(u => u.uid));
  const lost = prevUnits.filter(u => !nextUids.has(u.uid));
  if (lost.length === 0) return null;
  // Sort by ATK + atkBonus descending to find the highest threat
  lost.sort((a, b) => ((b.atk ?? 0) + (b.atkBonus ?? 0)) - ((a.atk ?? 0) + (a.atkBonus ?? 0)));
  const top = lost[0];
  return { name: top.name ?? CARD_DB[top.id]?.name ?? top.id, count: lost.length };
}

/**
 * Generate a human-readable description for an inflection point.
 */
function generateDescription(turn, prevState, nextState, delta) {
  const p1Prev = prevState.champions?.[0];
  const p1Next = nextState.champions?.[0];
  const p2Prev = prevState.champions?.[1];
  const p2Next = nextState.champions?.[1];

  const prevUids = new Set((prevState.units ?? []).map(u => u.uid));
  const nextUids = new Set((nextState.units ?? []).map(u => u.uid));

  // Who gained / lost advantage?
  const gainingPlayer = delta > 0 ? 'P1' : 'P2';
  const losingPlayer = delta > 0 ? 'P2' : 'P1';

  // Multi-unit loss: more than one unit disappeared from the losing player
  const losingPlayerIdx = delta > 0 ? 1 : 0;
  const losingPrevUnits = (prevState.units ?? []).filter(u => u.owner === losingPlayerIdx && !u.isRelic && !u.isOmen);
  const lostUnits = losingPrevUnits.filter(u => !nextUids.has(u.uid));
  if (lostUnits.length > 1) {
    lostUnits.sort((a, b) => ((b.atk ?? 0) + (b.atkBonus ?? 0)) - ((a.atk ?? 0) + (a.atkBonus ?? 0)));
    const highestName = lostUnits[0].name ?? CARD_DB[lostUnits[0].id]?.name ?? lostUnits[0].id;
    return `Turn ${turn}: ${losingPlayer} lost ${lostUnits.length} units including ${highestName}.`;
  }

  // Champion HP spike: significant HP drop on either champion
  const p1Damage = (p1Prev?.hp ?? 0) - (p1Next?.hp ?? 0);
  const p2Damage = (p2Prev?.hp ?? 0) - (p2Next?.hp ?? 0);
  const champDamageThreshold = 5;
  if (p1Damage >= champDamageThreshold || p2Damage >= champDamageThreshold) {
    const affected = p1Damage >= p2Damage ? 'P1' : 'P2';
    const damage = p1Damage >= p2Damage ? p1Damage : p2Damage;
    const hp = p1Damage >= p2Damage ? (p1Next?.hp ?? 0) : (p2Next?.hp ?? 0);
    return `Turn ${turn}: ${affected}'s champion took ${damage} damage, dropping to ${hp} HP.`;
  }

  // Throne control change
  const prevP1Throne =
    (p1Prev?.row === 2 && p1Prev?.col === 2) ||
    (prevState.units ?? []).some(u => u.owner === 0 && u.row === 2 && u.col === 2);
  const prevP2Throne =
    (p2Prev?.row === 2 && p2Prev?.col === 2) ||
    (prevState.units ?? []).some(u => u.owner === 1 && u.row === 2 && u.col === 2);
  const nextP1Throne =
    (p1Next?.row === 2 && p1Next?.col === 2) ||
    (nextState.units ?? []).some(u => u.owner === 0 && u.row === 2 && u.col === 2);
  const nextP2Throne =
    (p2Next?.row === 2 && p2Next?.col === 2) ||
    (nextState.units ?? []).some(u => u.owner === 1 && u.row === 2 && u.col === 2);

  if (!prevP1Throne && nextP1Throne) {
    return `Turn ${turn}: P1 seized control of the Throne.`;
  }
  if (!prevP2Throne && nextP2Throne) {
    return `Turn ${turn}: P2 seized control of the Throne.`;
  }

  // High-value unit summoned on the gaining side
  const gainingPlayerIdx = delta > 0 ? 0 : 1;
  const newUnits = (nextState.units ?? []).filter(
    u => u.owner === gainingPlayerIdx && !prevUids.has(u.uid) && !u.isRelic && !u.isOmen
  );
  if (newUnits.length > 0) {
    newUnits.sort((a, b) => ((b.atk ?? 0) + (b.atkBonus ?? 0)) - ((a.atk ?? 0) + (a.atkBonus ?? 0)));
    const topNew = newUnits[0];
    const unitName = topNew.name ?? CARD_DB[topNew.id]?.name ?? topNew.id;
    return `Turn ${turn}: ${gainingPlayer} summoned ${unitName}.`;
  }

  // High-value unit killed (single unit loss)
  if (lostUnits.length === 1) {
    const unitName = lostUnits[0].name ?? CARD_DB[lostUnits[0].id]?.name ?? lostUnits[0].id;
    return `Turn ${turn}: ${unitName} was destroyed, shifting board control.`;
  }

  return `Turn ${turn}: A significant shift in board control occurred.`;
}

/**
 * Find the top 3 inflection points in a game's state history.
 *
 * @param {Array} stateHistory - Array of game state snapshots, one per turn end.
 * @returns {Array} Top 3 inflection points sorted by absolute delta descending.
 *   Each entry: { turn, evalBefore, evalAfter, delta, description }
 */
export function findInflectionPoints(stateHistory) {
  if (!stateHistory || stateHistory.length < 2) return [];

  const THRESHOLD = 15;
  const candidates = [];

  for (let i = 1; i < stateHistory.length; i++) {
    const prev = stateHistory[i - 1];
    const curr = stateHistory[i];
    const evalBefore = evalState(prev);
    const evalAfter = evalState(curr);
    const delta = evalAfter - evalBefore;

    if (Math.abs(delta) > THRESHOLD) {
      const turn = curr.turn ?? i;
      candidates.push({
        turn,
        evalBefore,
        evalAfter,
        delta,
        description: generateDescription(turn, prev, curr, delta),
        stateIndex: i,
      });
    }
  }

  // Sort by absolute delta descending, take top 3
  candidates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return candidates.slice(0, 3);
}
