export const CARD_DB = {
  footsoldier: { id: 'footsoldier', name: 'Footsoldier', type: 'unit', cost: 1, atk: 2, hp: 1, spd: 1, unitType: 'Human', rules: '' },
  knight:       { id: 'knight',       name: 'Knight',       type: 'unit', cost: 3, atk: 3, hp: 4, spd: 1, unitType: 'Human', rules: '' },
  crossbowman:  { id: 'crossbowman',  name: 'Crossbowman',  type: 'unit', cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Human', rules: 'When this unit destroys an enemy unit, draw 1 card.' },
  captain:      { id: 'captain',      name: 'Captain',      type: 'unit', cost: 5, atk: 4, hp: 5, spd: 1, unitType: 'Human', rules: 'Friendly units adjacent to this unit gain +1 ATK.' },
  wolf:         { id: 'wolf',         name: 'Wolf',         type: 'unit', cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Beast', rules: '' },
  sabretooth:   { id: 'sabretooth',   name: 'Sabretooth',   type: 'unit', cost: 5, atk: 4, hp: 5, spd: 2, unitType: 'Beast', rules: '' },
  elfscout:     { id: 'elfscout',     name: 'Elf Scout',    type: 'unit', cost: 1, atk: 1, hp: 2, spd: 2, unitType: 'Elf',   rules: '' },
  elfblade:     { id: 'elfblade',     name: 'Elf Blade',    type: 'unit', cost: 3, atk: 3, hp: 2, spd: 2, unitType: 'Elf',   rules: '' },
  elfelder:     { id: 'elfelder',     name: 'Elf Elder',    type: 'unit', cost: 3, atk: 2, hp: 4, spd: 1, unitType: 'Elf',   rules: 'When summoned, restore 2 HP to your champion.' },
  elfranger:    { id: 'elfranger',    name: 'Elf Ranger',   type: 'unit', cost: 4, atk: 3, hp: 4, spd: 2, unitType: 'Elf',   rules: '' },
  elfarcher:    { id: 'elfarcher',    name: 'Elf Archer',   type: 'unit', cost: 5, atk: 2, hp: 5, spd: 1, unitType: 'Elf',   rules: 'Skip moving this unit to deal 2 damage to a unit within 2 tiles.' },
  hellhound:    { id: 'hellhound',    name: 'Hellhound',    type: 'unit', cost: 3, atk: 3, hp: 2, spd: 2, unitType: 'Demon', rules: '' },
  brutedemon:   { id: 'brutedemon',   name: 'Brute Demon',  type: 'unit', cost: 3, atk: 5, hp: 1, spd: 1, unitType: 'Demon', rules: '' },
  shadowfiend:  { id: 'shadowfiend',  name: 'Shadow Fiend', type: 'unit', cost: 4, atk: 4, hp: 5, spd: 1, unitType: 'Demon', rules: '' },
  demonlord:    { id: 'demonlord',    name: 'Demon Lord',   type: 'unit', cost: 6, atk: 6, hp: 6, spd: 1, unitType: 'Demon', rules: '' },

  smite:       { id: 'smite',       name: 'Smite',        type: 'spell', cost: 2, effect: 'smite',       rules: 'Deal 4 damage to one enemy unit within 2 tiles of your champion.' },
  mendallies:  { id: 'mendallies',  name: 'Mend Allies',  type: 'spell', cost: 4, effect: 'mendallies',  rules: 'Restore 2 HP to all friendly units.' },
  forgeweapon: { id: 'forgeweapon', name: 'Forge Weapon', type: 'spell', cost: 2, effect: 'forgeweapon', rules: 'Give a friendly unit +3 ATK permanently.' },
  ironshield:  { id: 'ironshield',  name: 'Iron Shield',  type: 'spell', cost: 2, effect: 'ironshield',  rules: 'Give a friendly unit a shield absorbing up to 5 damage from the next attack.' },
  swiftstep:   { id: 'swiftstep',   name: 'Swift Step',   type: 'spell', cost: 3, effect: 'swiftstep',   rules: 'Give a friendly unit +1 speed this turn.' },
};

const DECK_RECIPE = [
  ['footsoldier', 2], ['knight', 2], ['crossbowman', 1], ['captain', 1],
  ['wolf', 1], ['sabretooth', 1],
  ['elfscout', 2], ['elfblade', 1], ['elfelder', 1], ['elfranger', 2], ['elfarcher', 1],
  ['hellhound', 1], ['brutedemon', 1], ['shadowfiend', 2], ['demonlord', 1],
  ['smite', 2], ['mendallies', 2], ['forgeweapon', 2], ['ironshield', 2], ['swiftstep', 2],
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

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
