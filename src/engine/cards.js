export const CARD_DB = {
  footsoldier: { id: 'footsoldier', name: 'Footsoldier', type: 'unit', cost: 1, atk: 2, hp: 1, spd: 1, unitType: 'Human', rules: '' },
  knight:       { id: 'knight',       name: 'Knight',       type: 'unit', cost: 3, atk: 3, hp: 4, spd: 1, unitType: 'Human', rules: '' },
  crossbowman:  { id: 'crossbowman',  name: 'Crossbowman',  type: 'unit', cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Human', rules: 'When this unit destroys an enemy unit, draw 1 card.' },
  captain:      { id: 'captain',      name: 'Captain',      type: 'unit', cost: 5, atk: 4, hp: 5, spd: 1, unitType: 'Human', rules: 'Aura 1: Friendly units within 1 tile gain +1 ATK.', aura: { range: 1, stat: 'atk', value: 1 } },
  wolf:         { id: 'wolf',         name: 'Wolf',         type: 'unit', cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Beast', rules: '' },
  sabretooth:   { id: 'sabretooth',   name: 'Sabretooth',   type: 'unit', cost: 5, atk: 4, hp: 5, spd: 2, unitType: 'Beast', rules: '' },
  eagerbeaver:  { id: 'eagerbeaver',  name: 'Eager Beaver',  type: 'unit', cost: 3, atk: 3, hp: 3, spd: 1, unitType: 'Beast', rules: 'Rush: This unit may move the turn it is summoned.', rush: true },
  mastodon:     { id: 'mastodon',     name: 'Mastodon',     type: 'unit', cost: 6, atk: 5, hp: 7, spd: 1, unitType: 'Beast', rules: '' },
  elfscout:     { id: 'elfscout',     name: 'Elf Scout',    type: 'unit', cost: 1, atk: 1, hp: 2, spd: 2, unitType: 'Elf',   rules: '' },
  elfblade:     { id: 'elfblade',     name: 'Elf Blade',    type: 'unit', cost: 3, atk: 3, hp: 2, spd: 2, unitType: 'Elf',   rules: '' },
  elfelder:     { id: 'elfelder',     name: 'Elf Elder',    type: 'unit', cost: 3, atk: 2, hp: 4, spd: 1, unitType: 'Elf',   rules: 'When summoned, restore 2 HP to your champion.' },
  elfranger:    { id: 'elfranger',    name: 'Elf Ranger',   type: 'unit', cost: 4, atk: 3, hp: 4, spd: 2, unitType: 'Elf',   rules: '' },
  elfarcher:    { id: 'elfarcher',    name: 'Elf Archer',   type: 'unit', cost: 5, atk: 2, hp: 5, spd: 1, unitType: 'Elf',   rules: 'Skip moving this unit to deal 2 damage to a unit within 2 tiles.' },
  sistersiofra: { id: 'sistersiofra', name: 'Sister Siofra', type: 'unit', cost: 5, atk: 3, hp: 2, spd: 1, unitType: 'Elf', rules: 'Whenever a friendly unit is destroyed, restore 2 HP to your champion.', legendary: true },
  hellhound:    { id: 'hellhound',    name: 'Hellhound',    type: 'unit', cost: 3, atk: 3, hp: 2, spd: 2, unitType: 'Demon', rules: '' },
  brutedemon:   { id: 'brutedemon',   name: 'Brute Demon',  type: 'unit', cost: 3, atk: 5, hp: 1, spd: 1, unitType: 'Demon', rules: '' },
  shadowfiend:  { id: 'shadowfiend',  name: 'Shadow Fiend', type: 'unit', cost: 4, atk: 4, hp: 5, spd: 1, unitType: 'Demon', rules: '' },
  demonlord:    { id: 'demonlord',    name: 'Demon Lord',   type: 'unit', cost: 6, atk: 6, hp: 6, spd: 1, unitType: 'Demon', rules: '' },
  pip:          { id: 'pip',          name: 'Pip the Hungry', type: 'unit', cost: 3, atk: 1, hp: 1, spd: 1, unitType: 'Beast', rules: 'At the end of your turn, this unit gains +1 ATK and +1 HP.', legendary: true },
  imptimebomb:  { id: 'imptimebomb',  name: 'Imp Time Bomb', type: 'unit', cost: 3, atk: 1, hp: 3, spd: 1, unitType: 'Demon', rules: 'At the beginning of your turn, sacrifice this unit to deal 2 damage to all units within 2 tiles.' },
  zmore:        { id: 'zmore',        name: 'Zmore, Sleeping Ash', type: 'unit', cost: 8, atk: 4, hp: 6, spd: 1, unitType: 'Demon', rules: 'At the beginning of your turn, deal 1 damage to all enemy units.', legendary: true },
  aendor:       { id: 'aendor',       name: 'Aendor, The Ancient', type: 'unit', cost: 6, atk: 4, hp: 6, spd: 1, unitType: 'Human', rules: 'Aura 1: Enemy units within 1 tile have -2 ATK in combat.', aura: { range: 1, stat: 'atk', value: -2, target: 'enemy' }, legendary: true },

  smite:        { id: 'smite',        name: 'Smite',        type: 'spell', cost: 2, effect: 'smite',        rules: 'Deal 4 damage to one enemy unit within 2 tiles of your champion.' },
  mendallies:   { id: 'mendallies',   name: 'Mend Allies',  type: 'spell', cost: 4, effect: 'mendallies',   rules: 'Restore 2 HP to all friendly units.' },
  forgeweapon:  { id: 'forgeweapon',  name: 'Forge Weapon', type: 'spell', cost: 2, effect: 'forgeweapon',  rules: 'Give a friendly unit +3 ATK permanently.' },
  ironshield:   { id: 'ironshield',   name: 'Iron Shield',  type: 'spell', cost: 2, effect: 'ironshield',   rules: 'Give a friendly unit a shield absorbing up to 5 damage from the next attack.' },
  crownshatter: { id: 'crownshatter', name: 'Crownshatter', type: 'spell', cost: 6, effect: 'crownshatter', rules: 'Deal 3 damage to all units within 2 tiles of the Throne.', legendary: true },
  recall:       { id: 'recall',       name: 'Recall',       type: 'spell', cost: 2, effect: 'recall',       rules: 'Return a friendly unit to your hand. It cannot be played this turn.' },
  rallyingcry:  { id: 'rallyingcry',  name: 'Rallying Cry', type: 'spell', cost: 3, effect: 'rallyingcry',  rules: 'All friendly units gain +1 SPD this turn.' },
  ironthorns:   { id: 'ironthorns',   name: 'Iron Thorns',  type: 'spell', cost: 2, effect: 'ironthorns',   rules: 'Give your champion a shield absorbing up to 3 damage from the next attack. The attacking unit takes 3 damage.' },
};

// Total: 30 cards
const DECK_RECIPE = [
  ['footsoldier', 2], ['knight', 2], ['crossbowman', 1], ['captain', 1],
  ['wolf', 2], ['sabretooth', 1], ['pip', 1], ['eagerbeaver', 1], ['mastodon', 1],
  ['elfscout', 1], ['elfelder', 1], ['elfranger', 2], ['elfarcher', 1], ['sistersiofra', 1],
  ['brutedemon', 1], ['shadowfiend', 2], ['demonlord', 1], ['zmore', 1],
  ['aendor', 1],
  ['smite', 2], ['mendallies', 1], ['forgeweapon', 1], ['ironshield', 1], ['ironthorns', 1],
];

export function buildDeck() {
  const deck = [];
  for (const [id, count] of DECK_RECIPE) {
    for (let i = 0; i < count; i++) {
      deck.push({ ...CARD_DB[id], uid: `${id}_${Math.random().toString(36).slice(2)}` });
    }
  }
  return deck;
}

const _deckTotal = DECK_RECIPE.reduce((sum, [, count]) => sum + count, 0);
console.assert(_deckTotal === 30, 'Deck must be 30 cards, got ' + _deckTotal);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
