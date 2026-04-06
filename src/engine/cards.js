// ── Card Database ──────────────────────────────────────────────────────────

export const CARD_DB = {
  // Human units
  militia:         { id: 'militia',         name: 'Militia',             type: 'unit',  cost: 1, atk: 1, hp: 3, spd: 1, unitType: 'Human',  rules: '', image: null },
  footsoldier:     { id: 'footsoldier',     name: 'Footsoldier',         type: 'unit',  cost: 1, atk: 2, hp: 1, spd: 1, unitType: 'Human',  rules: '', image: null },
  squire:          { id: 'squire',          name: 'Squire',              type: 'unit',  cost: 2, atk: 1, hp: 4, spd: 2, unitType: 'Human',  rules: '', image: null },
  crossbowman:     { id: 'crossbowman',     name: 'Crossbowman',         type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Human',  rules: 'When this unit destroys an enemy unit draw 1 card.', image: null },
  shieldwall:      { id: 'shieldwall',      name: 'Shield Wall',         type: 'unit',  cost: 2, atk: 1, hp: 5, spd: 1, unitType: 'Human',  rules: '', image: null },
  sergeant:        { id: 'sergeant',        name: 'Sergeant',            type: 'unit',  cost: 3, atk: 2, hp: 2, spd: 1, unitType: 'Human',  rules: 'Action: The next combat unit you play this turn gains +1/+1.', action: true, image: null },
  knight:          { id: 'knight',          name: 'Knight',              type: 'unit',  cost: 3, atk: 3, hp: 4, spd: 1, unitType: 'Human',  rules: '', image: null },
  standardbearer:  { id: 'standardbearer',  name: 'Standard Bearer',     type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: 'Human',  rules: 'Aura 2: Friendly units within 2 tiles gain +1/+1.', aura: { range: 2, stat: 'both', value: 1, target: 'friendly' }, image: null },
  sentinel:        { id: 'sentinel',        name: 'Sentinel',            type: 'unit',  cost: 3, atk: 1, hp: 3, spd: 1, unitType: 'Human',  rules: 'Aura 1: Restore 1 HP to other friendly combat units within 1 tile at end of turn.', aura: { range: 1, stat: 'hp', value: 1, target: 'friendly', trigger: 'endturn', excludeSelf: true }, image: null },
  warlord:         { id: 'warlord',         name: 'Warlord',             type: 'unit',  cost: 4, atk: 4, hp: 5, spd: 1, unitType: 'Human',  rules: '', image: null },
  battlepriestunit:{ id: 'battlepriestunit',name: 'Battle Priest',       type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: 'Human',  rules: 'Action: Deal 2 damage to an enemy unit within 1 tile and restore 2 HP to a friendly unit within 1 tile.', action: true, image: null },
  paladin:         { id: 'paladin',         name: 'Paladin',             type: 'unit',  cost: 4, atk: 3, hp: 4, spd: 1, unitType: 'Human',  rules: 'Aura 1: Friendly combat units within 1 tile permanently gain +1 max HP at the beginning of your turn.', aura: { range: 1, stat: 'maxhp', value: 1, target: 'friendlycombat', trigger: 'beginturn', permanent: true }, image: null },
  // HOW TO ADD CARD ART:
  // 1. Generate art at 512x512px, export as WebP
  // 2. Upload to Supabase Storage bucket 'card-art'
  // 3. Set image field to the filename: image: 'captain.webp'
  // 4. The UI will automatically display it using getCardImageUrl()
  // Cards without art show a placeholder with the unit type label
  captain:         { id: 'captain',         name: 'Captain',             type: 'unit',  cost: 5, atk: 4, hp: 5, spd: 1, unitType: 'Human',  rules: 'Aura 1: Friendly units within 1 tile gain +1 ATK.', aura: { range: 1, stat: 'atk', value: 1, target: 'friendly' }, image: 'captain.webp' },
  aendor:          { id: 'aendor',          name: 'Aendor, The Ancient', type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: 'Human',  rules: 'Aura 1: Enemy units within 1 tile have -2 ATK in combat.', aura: { range: 1, stat: 'atk', value: -2, target: 'enemy' }, legendary: true, image: null },

  // Human spells
  smite:           { id: 'smite',           name: 'Smite',               type: 'spell', cost: 2, effect: 'smite',           unitType: 'Human', rules: 'Deal 4 damage to one enemy unit within 2 tiles of your champion.', image: null },
  ironshield:      { id: 'ironshield',      name: 'Iron Shield',         type: 'spell', cost: 2, effect: 'ironshield',      unitType: 'Human', rules: 'Give a friendly unit a shield absorbing up to 5 damage from the next attack.', image: null },
  ironthorns:      { id: 'ironthorns',      name: 'Iron Thorns',         type: 'spell', cost: 2, effect: 'ironthorns',      unitType: 'Human', rules: 'Give your champion a shield absorbing up to 3 damage from the next attack. The attacking unit takes 3 damage.', image: null },
  forgeweapon:     { id: 'forgeweapon',     name: 'Forge Weapon',        type: 'spell', cost: 2, effect: 'forgeweapon',     unitType: 'Human', rules: 'Give a friendly unit +3 ATK permanently.', image: null },
  fortify:         { id: 'fortify',         name: 'Fortify',             type: 'spell', cost: 3, effect: 'fortify',         unitType: 'Human', rules: 'Give all friendly units +2 HP until start of your next turn.', image: null },
  rally:           { id: 'rally',           name: 'Rally',               type: 'spell', cost: 3, effect: 'rally',           unitType: 'Human', rules: 'All friendly units gain +1 ATK until end of turn.', image: null },
  crusade:         { id: 'crusade',         name: 'Crusade',             type: 'spell', cost: 5, effect: 'crusade',         unitType: 'Human', rules: 'All friendly units gain +2 ATK this turn.', image: null },
  martiallaw:      { id: 'martiallaw',      name: 'Martial Law',         type: 'spell', cost: 4, effect: 'martiallaw',      unitType: 'Human', rules: 'Enemy combat units within 2 tiles of your champion skip their action next turn.', image: null },

  // Beast units
  boar:            { id: 'boar',            name: 'Boar',                type: 'unit',  cost: 1, atk: 1, hp: 1, spd: 1, unitType: 'Beast',  rules: 'Rush.', rush: true, image: null },
  swiftpaw:        { id: 'swiftpaw',        name: 'Swiftpaw',            type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 2, unitType: 'Beast',  rules: '', image: null },
  wolf:            { id: 'wolf',            name: 'Wolf',                type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: 'Beast',  rules: '', image: null },
  razorclaw:       { id: 'razorclaw',       name: 'Razorclaw',           type: 'unit',  cost: 2, atk: 3, hp: 1, spd: 2, unitType: 'Beast',  rules: '', image: null },
  pip:             { id: 'pip',             name: 'Pip the Hungry',      type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: 'Beast',  rules: 'At the end of your turn this unit gains +1/+1.', legendary: true, image: null },
  eagerbeaver:     { id: 'eagerbeaver',     name: 'Eager Beaver',        type: 'unit',  cost: 3, atk: 3, hp: 3, spd: 1, unitType: 'Beast',  rules: 'Rush.', rush: true, image: null },
  stalker:         { id: 'stalker',         name: 'Stalker',             type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: 'Beast',  rules: '', image: null },
  packrunner:      { id: 'packrunner',      name: 'Pack Runner',         type: 'unit',  cost: 3, atk: 1, hp: 3, spd: 1, unitType: 'Beast',  rules: 'Action: Reset the action of a different friendly combat unit.', action: true, image: null },
  packrunt:        { id: 'packrunt',        name: 'Pack Runt',           type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: 'Beast',  rules: 'Has +1/+1 for each other friendly Beast combat unit in play.', image: null },
  rockhorn:        { id: 'rockhorn',        name: 'Rockhorn',            type: 'unit',  cost: 4, atk: 4, hp: 2, spd: 1, unitType: 'Beast',  rules: 'Rush.', rush: true, image: null },
  plaguehog:       { id: 'plaguehog',       name: 'Plague Hog',          type: 'unit',  cost: 4, atk: 4, hp: 1, spd: 1, unitType: 'Beast',  rules: 'Rush. When this unit is destroyed deal 2 damage to all adjacent units.', rush: true, image: null },
  sabretooth:      { id: 'sabretooth',      name: 'Sabretooth',          type: 'unit',  cost: 5, atk: 4, hp: 5, spd: 2, unitType: 'Beast',  rules: '', image: null },
  razorfang:       { id: 'razorfang',       name: 'Razorfang, Alpha',    type: 'unit',  cost: 6, atk: 5, hp: 5, spd: 2, unitType: 'Beast',  rules: "Rush. When this unit destroys an enemy combat unit reset this unit's action. Once per turn.", rush: true, legendary: true, image: null },

  // Beast spells
  beastsmite:      { id: 'beastsmite',      name: 'Smite',               type: 'spell', cost: 2, effect: 'smite',           unitType: 'Beast', rules: 'Deal 4 damage to one enemy unit within 2 tiles of your champion.', image: null },
  beastironshield: { id: 'beastironshield', name: 'Iron Shield',         type: 'spell', cost: 2, effect: 'ironshield',      unitType: 'Beast', rules: 'Give a friendly unit a shield absorbing up to 5 damage from the next attack.', image: null },
  ambush:          { id: 'ambush',          name: 'Ambush',              type: 'spell', cost: 3, effect: 'ambush',          unitType: 'Beast', rules: 'A friendly Beast unit battles an adjacent enemy unit.', image: null },
  packhowl:        { id: 'packhowl',        name: 'Pack Howl',           type: 'spell', cost: 2, effect: 'packhowl',        unitType: 'Beast', rules: 'All friendly Beast units gain +1 SPD this turn.', image: null },
  pounce:          { id: 'pounce',          name: 'Pounce',              type: 'spell', cost: 2, effect: 'pounce',          unitType: 'Beast', rules: 'Move a friendly Beast unit up to 2 tiles ignoring summoning sickness.', image: null },
  predatorsmark:   { id: 'predatorsmark',   name: "Predator's Mark",     type: 'spell', cost: 3, effect: 'predatorsmark',   unitType: 'Beast', rules: 'An enemy unit within 2 tiles of your champion cannot move next turn.', image: null },
  savagegrowth:    { id: 'savagegrowth',    name: 'Savage Growth',       type: 'spell', cost: 3, effect: 'savagegrowth',    unitType: 'Beast', rules: 'Give a friendly unit +2/+2 permanently.', image: null },
  callofthesnakes: { id: 'callofthesnakes', name: 'Call of the Snakes',  type: 'spell', cost: 5, effect: 'callofthesnakes', unitType: 'Beast', rules: 'Summon a 1/1 Snake Beast combat unit in each open tile adjacent to your champion.', image: null },

  // Elf units
  elfscout:        { id: 'elfscout',        name: 'Elf Scout',           type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 2, unitType: 'Elf',    rules: '', image: null },
  seedling:        { id: 'seedling',        name: 'Seedling',            type: 'unit',  cost: 1, atk: 0, hp: 3, spd: 1, unitType: 'Elf',    rules: 'Cannot move. At the end of your turn restore 1 HP to your champion.', cannotMove: true, image: null },
  woodlandguard:   { id: 'woodlandguard',   name: 'Woodland Guard',      type: 'unit',  cost: 2, atk: 1, hp: 3, spd: 1, unitType: 'Elf',    rules: 'Action: Deal 2 damage to an enemy combat unit within 2 tiles.', action: true, image: null },
  whisper:         { id: 'whisper',         name: 'Whisper',             type: 'unit',  cost: 2, atk: 1, hp: 4, spd: 1, unitType: 'Elf',    rules: 'When this unit attacks restore 2 HP to your champion.', image: null },
  verdantarcher:   { id: 'verdantarcher',   name: 'Verdant Archer',      type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: 'Elf',    rules: '', image: null },
  elfelder:        { id: 'elfelder',        name: 'Elf Elder',           type: 'unit',  cost: 3, atk: 2, hp: 4, spd: 1, unitType: 'Elf',    rules: 'When summoned restore 2 HP to your champion.', image: null },
  thornweave:      { id: 'thornweave',      name: 'Thornweave',          type: 'unit',  cost: 3, atk: 2, hp: 3, spd: 1, unitType: 'Elf',    rules: 'When this unit is destroyed restore 3 HP to your champion.', image: null },
  elfranger:       { id: 'elfranger',       name: 'Elf Ranger',          type: 'unit',  cost: 4, atk: 3, hp: 4, spd: 2, unitType: 'Elf',    rules: '', image: null },
  grovewarden:     { id: 'grovewarden',     name: 'Grove Warden',        type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: 'Elf',    rules: 'Action: Restore 1 HP to your champion for each friendly Elf combat unit you control.', action: true, image: null },
  moonveilmystic:  { id: 'moonveilmystic',  name: 'Moonveil Mystic',     type: 'unit',  cost: 4, atk: 1, hp: 2, spd: 1, unitType: 'Elf',    rules: 'Whenever you restore HP to your champion or a friendly unit this unit gains +1/+1. Triggers once per restore event.', image: null },
  elfarcher:       { id: 'elfarcher',       name: 'Elf Archer',          type: 'unit',  cost: 5, atk: 2, hp: 5, spd: 1, unitType: 'Elf',    rules: 'Action: Skip moving this unit to deal 2 damage to a unit within 2 tiles.', image: null },
  sistersiofra:    { id: 'sistersiofra',    name: 'Sister Siofra, First Prayer', type: 'unit', cost: 5, atk: 3, hp: 4, spd: 1, unitType: 'Elf', rules: 'When a friendly combat unit is destroyed your champion permanently gains +2 max HP.', legendary: true, image: null },

  // Elf spells
  elfsmite:        { id: 'elfsmite',        name: 'Smite',               type: 'spell', cost: 2, effect: 'smite',           unitType: 'Elf',   rules: 'Deal 4 damage to one enemy unit within 2 tiles of your champion.', image: null },
  moonleaf:        { id: 'moonleaf',        name: 'Moonleaf',            type: 'spell', cost: 2, effect: 'moonleaf',        unitType: 'Elf',   rules: 'Increase the current and max HP of a friendly combat unit by the number of cards in your hand.', image: null },
  overgrowth:      { id: 'overgrowth',      name: 'Overgrowth',          type: 'spell', cost: 4, effect: 'overgrowth',      unitType: 'Elf',   rules: 'Restore 2 HP to all friendly units.', image: null },
  bloom:           { id: 'bloom',           name: 'Bloom',               type: 'spell', cost: 3, effect: 'bloom',           unitType: 'Elf',   rules: 'Restore 2 HP to a friendly unit. Deal damage to an enemy combat unit equal to the total HP restored this turn.', image: null },
  entangle:        { id: 'entangle',        name: 'Entangle',            type: 'spell', cost: 3, effect: 'entangle',        unitType: 'Elf',   rules: 'Choose a friendly Elf. Adjacent enemy combat units cannot move next turn.', image: null },

  // Demon units
  imp:             { id: 'imp',             name: 'Imp',                 type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 1, unitType: 'Demon',  rules: 'Hidden.', hidden: true, image: null },
  darkdealer:      { id: 'darkdealer',      name: 'Dark Dealer',         type: 'unit',  cost: 2, atk: 2, hp: 3, spd: 1, unitType: 'Demon',  rules: 'Action: Deal 2 damage to your champion. Draw a card.', action: true, image: null },
  dreadknight:     { id: 'dreadknight',     name: 'Dread Knight',        type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Demon',  rules: 'Hidden. When this unit deals damage to the enemy champion that player discards a card at random.', hidden: true, image: null },
  chaospawn:       { id: 'chaospawn',       name: 'Chaos Spawn',         type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Demon',  rules: 'When summoned discard a card to draw a card.', image: null },
  hellhound:       { id: 'hellhound',       name: 'Hellhound',           type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: 'Demon',  rules: '', image: null },
  brutedemon:      { id: 'brutedemon',      name: 'Brute Demon',         type: 'unit',  cost: 3, atk: 5, hp: 1, spd: 1, unitType: 'Demon',  rules: '', image: null },
  shadowtrap:      { id: 'shadowtrap',      name: 'Shadow Trap',         type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: 'Demon',  rules: 'Hidden. On reveal: destroy the enemy unit that revealed this unit.', hidden: true, image: null },
  shadowstalker:   { id: 'shadowstalker',   name: 'Shadow Stalker',      type: 'unit',  cost: 3, atk: 3, hp: 3, spd: 1, unitType: 'Demon',  rules: 'Hidden.', hidden: true, image: null },
  shadowfiend:     { id: 'shadowfiend',     name: 'Shadow Fiend',        type: 'unit',  cost: 4, atk: 4, hp: 5, spd: 1, unitType: 'Demon',  rules: '', image: null },
  veilfiend:       { id: 'veilfiend',       name: 'Veil Fiend',          type: 'unit',  cost: 4, atk: 3, hp: 2, spd: 1, unitType: 'Demon',  rules: 'Hidden. On reveal: deal 2 damage to all adjacent enemy units.', hidden: true, image: null },
  fleshtithe:      { id: 'fleshtithe',      name: 'Flesh Tithe',         type: 'unit',  cost: 4, atk: 3, hp: 3, spd: 1, unitType: 'Demon',  rules: 'When summoned you may sacrifice a friendly combat unit. If you do this unit gains +2/+2.', image: null },
  dreadshade:      { id: 'dreadshade',      name: 'Dread Shade',         type: 'unit',  cost: 5, atk: 5, hp: 4, spd: 1, unitType: 'Demon',  rules: 'Hidden. On reveal: this unit gains +2 ATK this turn.', hidden: true, image: null },
  zmore:           { id: 'zmore',           name: 'Zmore, Sleeping Ash', type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: 'Demon',  rules: 'At the end of your turn deal 1 damage to all units.', legendary: true, image: null },

  // Demon spells
  demonsmite:      { id: 'demonsmite',      name: 'Smite',               type: 'spell', cost: 2, effect: 'smite',           unitType: 'Demon', rules: 'Deal 4 damage to one enemy unit within 2 tiles of your champion.', image: null },
  demonironshield: { id: 'demonironshield', name: 'Iron Shield',         type: 'spell', cost: 2, effect: 'ironshield',      unitType: 'Demon', rules: 'Give a friendly unit a shield absorbing up to 5 damage from the next attack.', image: null },
  bloodoffering:   { id: 'bloodoffering',   name: 'Blood Offering',      type: 'spell', cost: 2, effect: 'bloodoffering',   unitType: 'Demon', rules: 'Destroy a friendly combat unit. Deal damage equal to its current ATK to any enemy unit.', image: null },
  pactofruin:      { id: 'pactofruin',      name: 'Pact of Ruin',        type: 'spell', cost: 1, effect: 'pactofruin',      unitType: 'Demon', rules: 'Discard a card. Deal 3 damage to any enemy unit.', image: null },
  darksentence:    { id: 'darksentence',    name: 'Dark Sentence',       type: 'spell', cost: 5, effect: 'darksentence',    unitType: 'Demon', rules: 'Destroy an enemy combat unit.', image: null },
  devour:          { id: 'devour',          name: 'Devour',              type: 'spell', cost: 3, effect: 'devour',          unitType: 'Demon', rules: 'Destroy an enemy combat unit with 2 or less HP.', image: null },
  infernalpact:    { id: 'infernalpact',    name: 'Infernal Pact',       type: 'spell', cost: 3, effect: 'infernalpact',    unitType: 'Demon', rules: 'Deal 3 damage to your champion. All friendly Demon units gain +2 ATK this turn.', image: null },
  shadowveil:      { id: 'shadowveil',      name: 'Shadow Veil',         type: 'spell', cost: 2, effect: 'shadowveil',      unitType: 'Demon', rules: 'Give a friendly unit Hidden until it moves or attacks.', image: null },
  souldrain:       { id: 'souldrain',       name: 'Soul Drain',          type: 'spell', cost: 3, effect: 'souldrain',       unitType: 'Demon', rules: 'Deal 2 damage to an enemy combat unit. Restore HP to your champion equal to the damage dealt.', image: null },
};

// ── Faction Deck Compositions ──────────────────────────────────────────────

const HUMAN_DECK = [
  'militia', 'militia',
  'footsoldier', 'footsoldier',
  'squire', 'squire',
  'crossbowman', 'crossbowman',
  'shieldwall',
  'sergeant',
  'knight', 'knight',
  'standardbearer',
  'sentinel',
  'warlord', 'warlord',
  'battlepriestunit',
  'paladin',
  'captain',
  'aendor',
  'smite', 'smite',
  'ironshield', 'ironshield',
  'ironthorns',
  'forgeweapon',
  'fortify',
  'rally',
  'crusade',
  'martiallaw',
];

const BEAST_DECK = [
  'boar', 'boar',
  'swiftpaw', 'swiftpaw',
  'wolf', 'wolf',
  'razorclaw', 'razorclaw',
  'pip',
  'eagerbeaver', 'eagerbeaver',
  'stalker',
  'packrunner',
  'packrunt', 'packrunt',
  'rockhorn',
  'plaguehog',
  'sabretooth', 'sabretooth',
  'razorfang',
  'beastsmite', 'beastsmite',
  'beastironshield',
  'ambush', 'ambush',
  'packhowl',
  'pounce',
  'predatorsmark',
  'savagegrowth',
  'callofthesnakes',
];

const ELF_DECK = [
  'elfscout', 'elfscout',
  'seedling', 'seedling',
  'woodlandguard', 'woodlandguard',
  'whisper', 'whisper',
  'verdantarcher',
  'elfelder', 'elfelder',
  'thornweave', 'thornweave',
  'elfranger', 'elfranger',
  'grovewarden',
  'moonveilmystic', 'moonveilmystic',
  'elfarcher', 'elfarcher',
  'sistersiofra',
  'elfsmite', 'elfsmite',
  'moonleaf', 'moonleaf',
  'overgrowth', 'overgrowth',
  'bloom', 'bloom',
  'entangle',
];

const DEMON_DECK = [
  'imp', 'imp',
  'darkdealer',
  'dreadknight',
  'chaospawn', 'chaospawn',
  'hellhound', 'hellhound',
  'brutedemon', 'brutedemon',
  'shadowtrap',
  'shadowstalker', 'shadowstalker',
  'shadowfiend', 'shadowfiend',
  'veilfiend',
  'fleshtithe',
  'dreadshade', 'dreadshade',
  'zmore',
  'demonsmite', 'demonsmite',
  'demonironshield',
  'bloodoffering',
  'pactofruin',
  'darksentence',
  'devour',
  'infernalpact',
  'shadowveil',
  'souldrain',
];

export const DECKS = {
  human: { name: 'Humans',  color: '#3B82F6', cards: HUMAN_DECK },
  beast: { name: 'Beasts',  color: '#22C55E', cards: BEAST_DECK },
  elf:   { name: 'Elves',   color: '#A855F7', cards: ELF_DECK   },
  demon: { name: 'Demons',  color: '#EF4444', cards: DEMON_DECK },
};

export const FACTION_INFO = {
  human: {
    id: 'human',
    name: 'Humans',
    color: '#3B82F6',
    description: 'Disciplined warriors who grow stronger in formation. Master the art of positioning to unlock powerful Aura bonuses.',
    mechanic: 'Aura',
  },
  beast: {
    id: 'beast',
    name: 'Beasts',
    color: '#22C55E',
    description: 'Primal hunters who strike before the enemy can react. Flood the board fast and overwhelm with speed and numbers.',
    mechanic: 'Rush',
  },
  elf: {
    id: 'elf',
    name: 'Elves',
    color: '#A855F7',
    description: 'Ancient healers who refuse to fall. Restore your champion and outlast every threat the opponent can throw at you.',
    mechanic: 'Restore HP',
  },
  demon: {
    id: 'demon',
    name: 'Demons',
    color: '#EF4444',
    description: 'Dangerous and unpredictable. Hidden units lurk unseen while self-damage effects fuel overwhelming power.',
    mechanic: 'Hidden',
  },
};

// ── Deck builder ──────────────────────────────────────────────────────────

export function buildDeck(deckId = 'human') {
  const deck = DECKS[deckId] ?? DECKS.human;
  return deck.cards.map(id => ({
    ...CARD_DB[id],
    uid: `${id}_${Math.random().toString(36).slice(2)}`,
  }));
}

// Deck validation
Object.entries(DECKS).forEach(([id, deck]) => {
  console.assert(deck.cards.length === 30, `${id} deck must be 30 cards, got ${deck.cards.length}`);
});

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
