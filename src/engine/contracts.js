// ============================================
// CONTRACT POOL
// For Nezzar, Terms and Conditions
// At the beginning of the owner's turn, 3 contracts are randomly
// selected (filtered for availability) and offered to the player.
// ============================================

export const CONTRACT_POOL = [
  {
    id: 'bloodPact',
    name: 'Blood Pact',
    description: 'Sacrifice a friendly combat unit. Destroy an enemy combat unit.',
  },
  {
    id: 'darkBargain',
    name: 'Dark Bargain',
    description: 'Discard a card. Draw two cards.',
  },
  {
    id: 'soulPrice',
    name: 'Soul Price',
    description: 'Pay 2 life. Deal 4 damage to the enemy champion.',
  },
  {
    id: 'cataclysm',
    name: 'Cataclysm',
    description: 'Deal 2 damage to all other combat units.',
  },
  {
    id: 'darkTithe',
    name: 'Dark Tithe',
    description: "Skip your champion's action this turn. Gain 2 temporary mana.",
  },
  {
    id: 'finalGambit',
    name: 'Final Gambit',
    description: 'Gain an extra command this turn. Lose the game at end of turn.',
  },
];

// Filter CONTRACT_POOL to only include contracts whose conditions are met.
// nezzarUid is excluded from friendly combat unit counts (Nezzar can't sacrifice itself).
export function filterAvailableContracts(state, playerIndex, nezzarUid) {
  const player = state.players[playerIndex];
  const champ = state.champions[playerIndex];
  const friendlyCombatUnits = state.units.filter(u =>
    u.owner === playerIndex && !u.isRelic && !u.isOmen && u.uid !== nezzarUid
  );
  const enemyCombatUnits = state.units.filter(u =>
    u.owner !== playerIndex && !u.isRelic && !u.isOmen
  );

  return CONTRACT_POOL.filter(c => {
    switch (c.id) {
      case 'bloodPact':
        return friendlyCombatUnits.length > 0 && enemyCombatUnits.length > 0;
      case 'darkBargain':
        return player.hand && player.hand.length > 0;
      case 'soulPrice':
        return champ.hp > 2;
      default:
        // cataclysm, darkTithe, finalGambit are always selectable
        return true;
    }
  });
}

// Randomly select up to `count` contracts from the available pool.
export function pickRandomContracts(available, count = 3) {
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
