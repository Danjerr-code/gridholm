import { UNIT_TYPES } from './unitTypes.js';

// CARD POOL RULES:
// Each card has a unique ID. There are no faction-specific variants of the same card.
// Decks are compositions of cards drawn from the shared card pool.
// A card like Smite can appear in any deck. Its ID is always 'smite'.
// When building the deck builder UI show the full card pool and let players filter by faction affinity.

// ── Card Database ──────────────────────────────────────────────────────────

  // HOW TO ADD CARD ART:
  // 1. Generate art at 512x512px, export as WebP
  // 2. Upload to Supabase Storage bucket 'card-art'
  // 3. Set image field to the filename: image: 'captain.webp'
  // 4. The UI will automatically display it using getCardImageUrl()
  // Cards without art show a placeholder with the unit type label

export const CARD_DB = {
  // Human units
  militia:         { id: 'militia',         name: 'Militia',             type: 'unit',  cost: 1, atk: 1, hp: 3, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '', image: 'militia.webp' },
  footsoldier:     { id: 'footsoldier',     name: 'Footsoldier',         type: 'unit',  cost: 1, atk: 2, hp: 1, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '', image: 'footsoldier.webp' },
  squire:          { id: 'squire',          name: 'Squire',              type: 'unit',  cost: 2, atk: 1, hp: 4, spd: 2, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '', image: 'squire.webp' },
  crossbowman:     { id: 'crossbowman',     name: 'Crossbowman',         type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.SOLDIER], attribute: 'light',   rules: 'When this unit destroys an enemy unit, draw 1 card.', image: 'crossbowman.webp' },
  shieldwall:      { id: 'shieldwall',      name: 'Shield Wall',         type: 'unit',  cost: 2, atk: 1, hp: 5, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '', image: 'shieldwall.webp' },
  sergeant:        { id: 'sergeant',        name: 'Sergeant',            type: 'unit',  cost: 3, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.SOLDIER], attribute: 'light',   rules: 'Action: The next combat unit you play this turn gains +1/+1.', action: true, image: 'sergeant.webp' },
  knight:          { id: 'knight',          name: 'Knight',              type: 'unit',  cost: 3, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.KNIGHT], attribute: 'light',   rules: '', image: 'knight.webp' },
  standardbearer:  { id: 'standardbearer',  name: 'Standard Bearer',     type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: 'Aura 2: Friendly combat units within 2 tiles have +1/+1.', aura: { range: 2, stat: 'both', value: 1, target: 'friendly' }, image: 'standardbearer.webp' },
  sentinel:        { id: 'sentinel',        name: 'Sentinel',            type: 'unit',  cost: 3, atk: 1, hp: 3, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: 'Aura 1: Restore 1 HP to friendly combat units within 1 tile at end of turn.', aura: { range: 1, stat: 'hp', value: 1, target: 'friendly', trigger: 'endturn', excludeSelf: true }, image: 'sentinel.webp' },
  warlord:         { id: 'warlord',         name: 'Warlord',             type: 'unit',  cost: 4, atk: 4, hp: 5, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.KNIGHT], attribute: 'light',   rules: '', image: 'warlord.webp' },
  battlepriestunit:{ id: 'battlepriestunit',name: 'Battle Priest',       type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.CLERIC], attribute: 'light',   rules: 'When summoned, deal 2 damage to an adjacent enemy unit and restore 2 HP to an adjacent friendly unit.', image: 'battlepriestunit.webp' },
  paladin:         { id: 'paladin',         name: 'Paladin',             type: 'unit',  cost: 4, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.PALADIN], attribute: 'light',   rules: 'Aura 1: Friendly combat units within 1 tile permanently gain +1 HP at the beginning of your turn.', aura: { range: 1, stat: 'maxhp', value: 1, target: 'friendlycombat', trigger: 'beginturn', permanent: true }, image: 'paladin.webp' },
  captain:         { id: 'captain',         name: 'Captain',             type: 'unit',  cost: 5, atk: 4, hp: 5, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: 'Aura 1: Friendly combat units within 1 tile have +1 ATK.', aura: { range: 1, stat: 'atk', value: 1, target: 'friendly' }, image: 'captain.webp' },
  aendor:          { id: 'aendor',          name: 'Aendor, The Ancient', type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: [UNIT_TYPES.ANGEL], attribute: 'light',   rules: 'Aura 1: Enemy combat units within 1 tile have -1 ATK.', aura: { range: 1, stat: 'atk', value: -1, target: 'enemy' }, legendary: true, image: 'aendor.webp' },
  waddles:         { id: 'waddles',         name: 'Waddles, Trusted Aide', type: 'unit', cost: 2, atk: 1, hp: 2, spd: 1, unitType: [UNIT_TYPES.PENGUIN], attribute: 'light',  rules: 'While Waddles is adjacent to your champion, combat damage dealt to your champion is reduced to 2.', legendary: true, image: 'waddles.webp' },

  // Human spells
  smite:           { id: 'smite',           name: 'Smite',               type: 'spell', cost: 2, effect: 'smite',           unitType: [UNIT_TYPES.HUMAN],attribute: 'neutral', rules: 'Deal 4 damage to one enemy combat unit within 2 tiles of your champion.', image: 'smite.webp' },
  ironshield:      { id: 'ironshield',      name: 'Iron Shield',         type: 'spell', cost: 2, effect: 'ironshield',      unitType: [UNIT_TYPES.HUMAN],attribute: 'neutral', rules: 'Give a friendly combat unit a shield absorbing up to 5 damage from the next attack.', image: 'ironshield.webp' },
  ironthorns:      { id: 'ironthorns',      name: 'Iron Thorns',         type: 'spell', cost: 2, effect: 'ironthorns',      unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Give your champion a shield absorbing up to 3 damage from the next attack. The attacking unit takes 3 damage.', image: 'ironthorns.webp' },
  forgeweapon:     { id: 'forgeweapon',     name: 'Forge Weapon',        type: 'spell', cost: 2, effect: 'forgeweapon',     unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Give a friendly unit +3 ATK permanently.', image: 'forgeweapon.webp' },
  fortify:         { id: 'fortify',         name: 'Fortify',             type: 'spell', cost: 3, effect: 'fortify',         unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'All friendly combat units gain +2 HP until end of turn.', image: 'fortify.webp' },
  rally:           { id: 'rally',           name: 'Rally',               type: 'spell', cost: 3, effect: 'rally',           unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'All friendly combat units gain +1 ATK until end of turn.', image: 'rally.webp' },
  crusade:         { id: 'crusade',         name: 'Crusade',             type: 'spell', cost: 5, effect: 'crusade',         unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'All friendly combat units gain +2 ATK until end of turn.', image: 'crusade.webp' },
  martiallaw:      { id: 'martiallaw',      name: 'Martial Law',         type: 'spell', cost: 4, effect: 'martiallaw',      unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Enemy combat units within 2 tiles of your champion skip their action next turn.', image: 'martiallaw.webp' },

  // Beast units
  boar:            { id: 'boar',            name: 'Boar',                type: 'unit',  cost: 1, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush.', rush: true, image: 'boar.webp' },
  swiftpaw:        { id: 'swiftpaw',        name: 'Swiftpaw',            type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'swiftpaw.webp' },
  wolf:            { id: 'wolf',            name: 'Wolf',                type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'wolf.webp' },
  razorclaw:       { id: 'razorclaw',       name: 'Razorclaw',           type: 'unit',  cost: 2, atk: 3, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'razorclaw.webp' },
  pip:             { id: 'pip',             name: 'Pip the Hungry',      type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'At the end of your turn, this unit gains +1/+1.', legendary: true, image: 'pip.webp' },
  eagerbeaver:     { id: 'eagerbeaver',     name: 'Eager Beaver',        type: 'unit',  cost: 3, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush.', rush: true, image: 'eagerbeaver.webp' },
  stalker:         { id: 'stalker',         name: 'Stalker',             type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'stalker.webp' },
  packrunner:      { id: 'packrunner',      name: 'Pack Runner',         type: 'unit',  cost: 3, atk: 1, hp: 3, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Action: Reset the action of a different friendly combat unit.', action: true, image: 'packrunner.webp' },
  packrunt:        { id: 'packrunt',        name: 'Pack Runt',           type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Has +1 ATK for each other friendly Primal combat unit in play.', image: 'packrunt.webp' },
  rockhorn:        { id: 'rockhorn',        name: 'Rockhorn',            type: 'unit',  cost: 4, atk: 4, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush.', rush: true, image: 'rockhorn.webp' },
  plaguehog:       { id: 'plaguehog',       name: 'Plague Hog',          type: 'unit',  cost: 4, atk: 4, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush. When this unit dies, deal 2 damage to all adjacent units.', rush: true, image: 'plaguehog.webp' },
  sabretooth:      { id: 'sabretooth',      name: 'Sabretooth',          type: 'unit',  cost: 5, atk: 4, hp: 5, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'sabretooth.webp' },
  razorfang:       { id: 'razorfang',       name: 'Razorfang, Alpha',    type: 'unit',  cost: 6, atk: 5, hp: 5, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: "Rush. When this unit destroys an enemy combat unit, reset this unit's action. Once per turn.", rush: true, legendary: true, image: 'razorfang.webp' },
  wildborne:       { id: 'wildborne',       name: 'Wildborne',           type: 'unit',  cost: 2, atk: 1, hp: 1, spd: 2, unitType: [UNIT_TYPES.HUMAN], attribute: 'primal',  rules: 'Aura 1: Friendly Primal units within 1 tile gain +1/+1.', aura: { range: 1, stat: 'atk', value: 1, target: 'friendlybeast' }, image: 'wildborne.webp' },
  nighthoofreaver: { id: 'nighthoofreaver', name: 'Nighthoof Reaver',     type: 'unit',  cost: 3, atk: 2, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEASTKIN], attribute: 'primal',  rules: 'Gain +1/+1 whenever an enemy unit dies.', triggers: [{ event: 'onEnemyUnitDeath', effect: 'gainPlusOnePlusOne', selfTrigger: false }], image: 'nighthoofreaver.webp' },

  // Beast spells
  ambush:          { id: 'ambush',          name: 'Ambush',              type: 'spell', cost: 3, effect: 'ambush',          unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'A friendly combat unit battles an adjacent enemy unit.', image: 'ambush.webp' },
  packhowl:        { id: 'packhowl',        name: 'Pack Howl',           type: 'spell', cost: 3, effect: 'packhowl',        unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'All friendly Primal combat units gain +1 ATK and +1 SPD this turn.', image: 'packhowl.webp' },
  pounce:          { id: 'pounce',          name: 'Pounce',              type: 'spell', cost: 2, effect: 'pounce',          unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Reset the action of a friendly Primal unit.', image: 'pounce.webp' },
  predatorsmark:   { id: 'predatorsmark',   name: "Predator's Mark",     type: 'spell', cost: 3, effect: 'predatorsmark',   unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'The enemy champion skips their action next turn.', image: 'predatorsmark.webp' },
  savagegrowth:    { id: 'savagegrowth',    name: 'Savage Growth',       type: 'spell', cost: 3, effect: 'savagegrowth',    unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Give a friendly unit +2/+2 permanently.', image: 'savagegrowth.webp' },
  callofthesnakes: { id: 'callofthesnakes', name: 'Call of the Snakes',  type: 'spell', cost: 5, effect: 'callofthesnakes', unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Summon a 1/1 Snake in each open tile adjacent to your champion.', image: 'callofthesnakes.webp' },

  // Elf units
  elfscout:        { id: 'elfscout',        name: 'Elf Scout',           type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 2, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: '', image: 'elfscout.webp' },
  seedling:        { id: 'seedling',        name: 'Seedling',            type: 'unit',  cost: 1, atk: 0, hp: 3, spd: 0, unitType: [UNIT_TYPES.PLANT], attribute: 'mystic',  rules: 'At the end of your turn, restore 1 HP to your champion.', image: 'seedling.webp' },
  woodlandguard:   { id: 'woodlandguard',   name: 'Woodland Guard',      type: 'unit',  cost: 2, atk: 1, hp: 3, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'Action: Deal 1 damage to an enemy combat unit within 2 tiles.', action: true, image: 'woodlandguard.webp' },
  whisper:         { id: 'whisper',         name: 'Whisper',             type: 'unit',  cost: 2, atk: 1, hp: 4, spd: 1, unitType: [UNIT_TYPES.ELF, UNIT_TYPES.SPIRIT],   attribute: 'mystic',  rules: 'When this unit attacks, restore 2 HP to your champion.', image: 'whisper.webp' },
  verdantarcher:   { id: 'verdantarcher',   name: 'Verdant Archer',      type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: '', image: 'verdantarcher.webp' },
  elfelder:        { id: 'elfelder',        name: 'Elf Elder',           type: 'unit',  cost: 3, atk: 2, hp: 4, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'When summoned, restore 2 HP to your champion.', image: 'elfelder.webp' },
  thornweave:      { id: 'thornweave',      name: 'Thornweave',          type: 'unit',  cost: 3, atk: 2, hp: 3, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'When this unit is destroyed, restore 3 HP to your champion.', image: 'thorneweave.webp' },
  elfranger:       { id: 'elfranger',       name: 'Elf Ranger',          type: 'unit',  cost: 4, atk: 3, hp: 4, spd: 2, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: '', image: 'elfranger.webp' },
  grovewarden:     { id: 'grovewarden',     name: 'Grove Warden',        type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'Action: Restore 1 HP to your champion for each friendly Mystic combat unit you control.', action: true, image: 'grovewarden.webp' },
  moonveilmystic:  { id: 'moonveilmystic',  name: 'Moonveil Mystic',     type: 'unit',  cost: 4, atk: 1, hp: 2, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'Whenever you restore HP to your champion or a friendly unit, this unit gains +1/+1. Triggers once per restore event.', image: 'moonveilmystic.webp' },
  elfarcher:       { id: 'elfarcher',       name: 'Elf Archer',          type: 'unit',  cost: 5, atk: 2, hp: 5, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'Action: Deal 2 damage to a unit within 2 tiles.', action: true, image: 'elfarcher.webp' },
  sistersiofra:    { id: 'sistersiofra',    name: 'Sister Siofra, First Prayer', type: 'unit', cost: 5, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.ELF],attribute: 'mystic', rules: 'When a friendly combat unit is destroyed, your champion gains +2 HP.', legendary: true, image: 'sistersiofra.webp' },
  grovechampion:   { id: 'grovechampion',   name: 'Grove Champion',      type: 'unit',  cost: 5, atk: 5, hp: 5, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: '', image: 'grovechampion.webp' },
  yggara:          { id: 'yggara',          name: 'Yggara, Rootmother',  type: 'unit',  cost: 8, atk: 1, hp: 6, spd: 0, unitType: [UNIT_TYPES.SPIRIT, UNIT_TYPES.PLANT],   attribute: 'mystic',  rules: 'At the end of your turn, summon a 1/1 Sapling in each adjacent tile.', legendary: true, image: 'yggara.webp' },
  sapling:         { id: 'sapling',         name: 'Sapling',             type: 'unit',  cost: 0, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.PLANT], attribute: 'mystic',  rules: 'When this unit dies, restore 1 HP to your champion.', token: true, image: 'sapling-token.webp' },

  // Elf spells
  moonleaf:        { id: 'moonleaf',        name: 'Moonleaf',            type: 'spell', cost: 2, effect: 'moonleaf',        unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Increase the HP of a friendly combat unit equal to the number of cards in your hand.', image: 'moonleaf.webp' },
  overgrowth:      { id: 'overgrowth',      name: 'Overgrowth',          type: 'spell', cost: 4, effect: 'overgrowth',      unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Restore 2 HP to all friendly units.', image: 'overgrowth.webp' },
  bloom:           { id: 'bloom',           name: 'Bloom',               type: 'spell', cost: 3, effect: 'bloom',           unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: "Restore 2 HP to a friendly unit. Deal damage to an enemy combat unit equal to the total HP you've restored this turn.", image: 'bloom.webp' },
  entangle:        { id: 'entangle',        name: 'Entangle',            type: 'spell', cost: 3, effect: 'entangle',        unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Choose a friendly Mystic unit. Enemy combat units adjacent to that unit cannot move next turn.', image: 'entangle.webp' },
  ancientspring:   { id: 'ancientspring',   name: 'Ancient Spring',      type: 'spell', cost: 3, effect: 'ancientspring',   unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Draw 2 cards.', image: 'ancientspring.webp' },
  verdantsurge:    { id: 'verdantsurge',    name: 'Verdant Surge',       type: 'spell', cost: 5, effect: 'verdantsurge',    unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Give your champion and friendly units within 2 tiles of your champion +2/+2 this turn.', image: 'verdantsurge.webp' },
  spiritbolt:      { id: 'spiritbolt',      name: 'Spirit Bolt',         type: 'spell', cost: 3, effect: 'spiritbolt',      unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: "Skip your champion's action this turn to deal damage to an enemy combat unit equal to the number of friendly units within 2 tiles of your champion.", image: 'spiritbolt.webp' },

  // Demon units
  imp:             { id: 'imp',             name: 'Imp',                 type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'Hidden.', hidden: true, image: 'imp.webp' },
  darkdealer:      { id: 'darkdealer',      name: 'Dark Dealer',         type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 0, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'Action: Deal 2 damage to your champion. Draw a card.', action: true, legendary: true, image: 'darkdealer.webp' },
  dreadknight:     { id: 'dreadknight',     name: 'Dread Knight',        type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.DEMON, UNIT_TYPES.KNIGHT], attribute: 'dark',    rules: 'Hidden. When this unit deals damage to the enemy champion, that player discards a card at random.', hidden: true, image: 'dreadknight.webp' },
  chaospawn:       { id: 'chaospawn',       name: 'Chaos Spawn',         type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HORROR], attribute: 'dark',    rules: 'When summoned, draw a card then discard a card.', image: 'chaospawn.webp' },
  hellhound:       { id: 'hellhound',       name: 'Hellhound',           type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: [UNIT_TYPES.DEMON, UNIT_TYPES.BEAST], attribute: 'dark',    rules: '', image: 'hellhound.webp' },
  brutedemon:      { id: 'brutedemon',      name: 'Brute Demon',         type: 'unit',  cost: 3, atk: 5, hp: 1, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: '', image: 'brutedemon.webp' },
  shadowtrap:      { id: 'shadowtrap',      name: 'Shadow Trap Hole',    type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 0, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',    rules: 'Hidden. On reveal: destroy the enemy unit that revealed this unit.', hidden: true, image: 'shadowtrap.webp' },
  shadowstalker:   { id: 'shadowstalker',   name: 'Shadow Stalker',      type: 'unit',  cost: 3, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',    rules: 'Hidden.', hidden: true, image: 'shadowstalker.webp' },
  shadowfiend:     { id: 'shadowfiend',     name: 'Shadow Fiend',        type: 'unit',  cost: 4, atk: 4, hp: 5, spd: 1, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',    rules: '', image: 'shadowfiend.webp' },
  veilfiend:       { id: 'veilfiend',       name: 'Veil Fiend',          type: 'unit',  cost: 4, atk: 3, hp: 2, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'Hidden. On reveal: deal 2 damage to all adjacent enemy units.', hidden: true, image: 'veilfiend.webp' },
  fleshtithe:      { id: 'fleshtithe',      name: 'Flesh Tithe',         type: 'unit',  cost: 4, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'When summoned, you may sacrifice a friendly combat unit. If you do, this unit gains +2/+2.', image: 'fleshtithe.webp' },
  dreadshade:      { id: 'dreadshade',      name: 'Dread Shade',         type: 'unit',  cost: 5, atk: 5, hp: 4, spd: 1, unitType: [UNIT_TYPES.WRAITH], attribute: 'dark',    rules: 'Hidden. On reveal: this unit gains +2 ATK this turn.', hidden: true, image: 'dreadshade.webp' },
  zmore:           { id: 'zmore',           name: 'Zmore, Sleeping Ash', type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'At the end of your turn, deal 1 damage to all other combat units.', legendary: true, image: 'zmore.webp' },
  voidtitan:       { id: 'voidtitan',       name: 'Void Titan',          type: 'unit',  cost: 6, atk: 6, hp: 6, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: '', image: 'voidtitan.webp' },
  gorethirstfiend: { id: 'gorethirstfiend', name: 'Gorethirst Fiend',     type: 'unit',  cost: 3, atk: 2, hp: 3, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'Whenever you deal damage to the enemy champion, deal 2 damage to a random enemy combat unit.', triggers: [{ event: 'onChampionDamageDealt', effect: 'dealTwoToRandomEnemyUnit', preventRetrigger: true }], image: 'gorethirstfiend.webp' },
  hexbloodwarlock: { id: 'hexbloodwarlock', name: 'Hexblood Warlock',     type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.DEMON, UNIT_TYPES.WIZARD], attribute: 'dark',    rules: 'Whenever you play a card, deal 1 damage to the enemy champion.', triggers: [{ event: 'onCardPlayed', effect: 'dealOneToEnemyChampion', selfTrigger: false }], image: 'hexbloodwarlock.webp' },

  // Mystic/Dark bridge units (Batch 2)
  duskbloomtender:  { id: 'duskbloomtender',  name: 'Duskbloom Tender',  type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic', rules: 'Whenever a friendly unit dies, this unit gains +1 HP.', triggers: [{ event: 'onFriendlyUnitDeath', effect: 'gainPlusOneHP', selfTrigger: false }], image: 'duskbloomtender.webp' },
  oathrootkeeper:   { id: 'oathrootkeeper',   name: 'Oathroot Keeper',   type: 'unit',  cost: 3, atk: 1, hp: 4, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic', rules: 'At the end of your turn, if you control 4 or more combat units, restore 1 HP to each friendly combat unit.', triggers: [{ event: 'onEndTurn', effect: 'restoreOneHPToAllFriendly', condition: { type: 'minFriendlyUnits', count: 4 } }], image: 'oathrootkeeper.webp' },

  // Light/Mystic bridge units (Batch 2)
  runebladesentinel: { id: 'runebladesentinel', name: 'Runeblade Sentinel', type: 'unit', cost: 3, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light', rules: 'Has +3/+3 while you have 5 or more cards in hand.', modifier: { type: 'conditionalStatBuff', stat: 'atkAndHp', amount: 3, condition: { type: 'minCardsInHand', count: 5 } }, image: 'runebladesentinel.webp' },

  // Light/Primal and Enemy Pair Bridge Cards (Batch 3)
  siegeclawwarchief:  { id: 'siegeclawwarchief',  name: 'Siegeclaw Warchief',  type: 'unit', cost: 3, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEASTKIN], attribute: 'primal',  rules: 'Friendly combat units within 2 tiles of the enemy champion have +1 SPD.', modifier: [{ type: 'zoneSpdBuff', anchor: 'enemyChampion', range: 2, amount: 1 }], image: 'siegeclawwarchief.webp' },
  vanguardtaskmaster: { id: 'vanguardtaskmaster', name: 'Vanguard Taskmaster', type: 'unit', cost: 3, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.HUMAN],  attribute: 'light',   rules: 'Whenever a friendly combat unit uses an action, it gains +1 HP.', triggers: [{ event: 'onFriendlyAction', effect: 'gainPlusOneHPOnAction', selfTrigger: true }], image: 'vanguardtaskmaster.webp' },
  lifedrinkerstag:    { id: 'lifedrinkerstag',    name: 'Lifedrinker Stag',    type: 'unit', cost: 4, atk: 3, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEAST],  attribute: 'primal',  rules: 'Whenever you restore HP, restore double that amount instead.', modifier: [{ type: 'restoreHPMultiplier', multiplier: 2 }], image: 'lifedrinkerstag.webp' },

  // Enemy Pair Bridge Cards (Batch 4)
  spitechanneler:    { id: 'spitechanneler',    name: 'Spite Channeler',    type: 'unit', cost: 4, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic', rules: 'Whenever you deal non-combat damage to the enemy champion, deal 1 additional damage.', triggers: [{ event: 'onNonCombatChampionDamage', effect: 'plusOneNonCombatChampionDamage', preventRetrigger: true }], image: 'spitechanneler.webp' },
  forbiddenchaplain: { id: 'forbiddenchaplain', name: 'Forbidden Chaplain', type: 'unit', cost: 4, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.WIZARD], attribute: 'light',  rules: 'The first time you sacrifice a friendly combat unit each turn, return that unit to play.', triggers: [{ event: 'onFriendlySacrifice', effect: 'returnSacrificedUnit', oncePerTurn: true }], image: 'forbiddenchaplain.webp' },
  exiledguardian:    { id: 'exiledguardian',    name: 'Exiled Guardian',    type: 'unit', cost: 4, atk: 4, hp: 4, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',   rules: 'Friendly Aura effects have +1 range.', modifier: [{ type: 'auraRangeBuff', amount: 1 }], image: 'exiledguardian.webp' },

  // Batch 5: Legendaries Part 1
  vornthundercaller: { id: 'vornthundercaller', name: 'Vorn, Thundercaller', type: 'unit', cost: 4, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEASTKIN],  attribute: 'primal',  rules: 'Action: Choose a direction. Deal 2 damage to every unit and champion in a straight line.', action: true, legendary: true, image: 'vornthundercaller.webp' },
  azulonsilvertide:  { id: 'azulonsilvertide',  name: 'Azulon, Silver Tide', type: 'unit', cost: 7, atk: 5, hp: 6, spd: 2, unitType: [UNIT_TYPES.DRAGON],    attribute: 'mystic',  rules: 'Action: The next spell you cast this turn casts twice.', action: true, legendary: true, image: 'azulonsilvertide.webp' },
  clockworkmanimus:  { id: 'clockworkmanimus',  name: 'Clockwork Manimus',   type: 'unit', cost: 5, atk: 5, hp: 5, spd: 1, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: 'At the end of your turn, discard a card or destroy this unit. Action: Deal 2 damage to target combat unit.', action: true, legendary: true, triggers: [{ event: 'onEndTurn', effect: 'discardOrDie', oncePerTurn: true }], image: 'clockworkmanimus.webp' },

  // Batch 6: Legendaries Part 2
  vexishollowking:   { id: 'vexishollowking',   name: 'Vexis, the Hollow King', type: 'unit', cost: 7, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',  rules: 'The first time an enemy combat unit dies each turn, summon a 1/1 shadow copy in an adjacent tile.', legendary: true, triggers: [{ event: 'onEnemyUnitDeath', effect: 'summonShadowCopy', oncePerTurn: true }], image: 'vexishollowking.webp' },
  lucernunbrokenvow: { id: 'lucernunbrokenvow', name: 'Lucern, Unbroken Vow',    type: 'unit', cost: 5, atk: 3, hp: 3, spd: 2, unitType: [UNIT_TYPES.HUMAN], attribute: 'light', rules: 'When this unit dies on the Throne tile, resummon it at the end of your turn in your champion\'s starting tile. Retains all permanent stat changes.', legendary: true, image: 'lucernunbrokenvow.webp' },

  // Demon spells
  bloodoffering:   { id: 'bloodoffering',   name: 'Blood Offering',      type: 'spell', cost: 2, effect: 'bloodoffering',   unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Destroy a friendly combat unit. Deal damage equal to its current ATK to any enemy combat unit.', image: 'bloodoffering.webp' },
  pactofruin:      { id: 'pactofruin',      name: 'Pact of Ruin',        type: 'spell', cost: 1, effect: 'pactofruin',      unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Discard a card to deal 3 damage to any enemy unit.', image: 'pactofruin.webp' },
  darksentence:    { id: 'darksentence',    name: 'Dark Sentence',       type: 'spell', cost: 5, effect: 'darksentence',    unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Destroy an enemy combat unit.', image: 'darksentence.webp' },
  devour:          { id: 'devour',          name: 'Devour',              type: 'spell', cost: 3, effect: 'devour',          unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Destroy an enemy combat unit with 2 or less HP.', image: 'devour.webp' },
  infernalpact:    { id: 'infernalpact',    name: 'Infernal Pact',       type: 'spell', cost: 3, effect: 'infernalpact',    unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Deal 3 damage to your champion. All friendly Dark units gain +2 ATK this turn.', image: 'infernalpact.webp' },
  shadowveil:      { id: 'shadowveil',      name: 'Shadow Veil',         type: 'spell', cost: 1, effect: 'shadowveil',      unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'The next combat unit you play this turn is summoned with Hidden.', image: 'shadowveil.webp' },
  souldrain:       { id: 'souldrain',       name: 'Soul Drain',          type: 'spell', cost: 3, effect: 'souldrain',       unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Deal 2 damage to an enemy combat unit. Restore HP to your champion equal to the damage dealt.', image: 'souldrain.webp' },

  // ── Relics ─────────────────────────────────────────────────────────────────
  // Relics are non-combat board entities: ATK 0, SPD 0, isRelic: true.
  // They cannot move or attack. Combat units can move into their tile to attack them.
  // The relic takes damage equal to the attacker's ATK and deals 0 damage back.
  // Relics can be targeted by spells. They can have passive/aura/action effects.

  soulstone:   { id: 'soulstone',   name: 'Soulstone',         type: 'relic', cost: 4, atk: 0, hp: 5, spd: 0, isRelic: true, unitType: [UNIT_TYPES.HUMAN], attribute: 'light', rules: 'When a friendly combat unit dies, destroy this Relic and summon that unit in this tile.', image: 'soulstone.webp' },
  bloodaltar:  { id: 'bloodaltar',  name: 'Blood Altar',       type: 'relic', cost: 3, atk: 0, hp: 1, spd: 0, isRelic: true, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',  rules: 'Action: sacrifice an adjacent friendly combat unit. Draw 1 card.', action: true, image: 'bloodaltar.webp' },
  echostone:        { id: 'echostone',        name: 'Echo Stone',        type: 'relic', cost: 3, atk: 0, hp: 3, spd: 0, isRelic: true, unitType: [],                 attribute: 'neutral', rules: 'At the end of your turn, restore 1 HP to your champion.', image: 'echostone.webp' },
  siegemound:       { id: 'siegemound',       name: 'Siege Mound',       type: 'relic', cost: 3, atk: 0, hp: 3, spd: 0, isRelic: true, unitType: [UNIT_TYPES.BEAST], attribute: 'primal', rules: 'Action: Deal 2 damage to the enemy champion.', action: true, image: 'siegemound.webp' },
  wardrum:          { id: 'wardrum',          name: 'War Drum',          type: 'relic', cost: 3, atk: 0, hp: 3, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: 'At the start of your turn, the friendly combat unit with the lowest ATK gains +1 ATK this turn. Random if tied.', image: null },
  manacannon:       { id: 'manacannon',       name: 'Mana Cannon',       type: 'relic', cost: 2, atk: 0, hp: 2, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: 'Action ⓵: Deal 1 damage to the first unit in the chosen direction, friendly or enemy.', action: true, image: null },
  negationcrystal:  { id: 'negationcrystal',  name: 'Negation Crystal',  type: 'relic', cost: 2, atk: 0, hp: 1, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: 'When an enemy unit uses its Action ability, you may destroy this Relic to cancel that ability.', triggers: [{ event: 'onEnemyAction', effect: 'negationcrystal_cancel' }], image: null },
  arcanelens:       { id: 'arcanelens',       name: 'Arcane Lens',       type: 'relic', cost: 2, atk: 0, hp: 2, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: 'Action: Look at the top 3 cards of your deck. Put one on top and shuffle the rest back.', action: true, image: null },
  darkirongate:     { id: 'darkirongate',     name: 'Darkiron Gate',     type: 'relic', cost: 3, atk: 0, hp: 6, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: null, image: null },
  coldsteeldrifter: { id: 'coldsteeldrifter', name: 'Coldsteel Drifter', type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: null, image: null },

  // ── Omens ──────────────────────────────────────────────────────────────────
  // Omens are temporary non-combat board entities: ATK 0, SPD 0, no HP, isOmen: true.
  // They expire after turnsRemaining turns (decremented at end of the owner's turn).
  // Any enemy combat unit that moves onto an omen tile destroys it instantly — no combat.
  // Omens cannot be targeted by spells. They can have passive/aura/begin-of-turn/end-of-turn effects.

  battlestandard: { id: 'battlestandard', name: 'Battle Standard', type: 'omen', cost: 2, atk: 0, spd: 0, turnsRemaining: 3, isOmen: true, unitType: [], attribute: 'light',   rules: 'Friendly units summoned adjacent to this omen gain +1/+1 permanently.', image: 'battlestandard.webp' },
  smokebomb:      { id: 'smokebomb',      name: 'Smoke Bomb',      type: 'omen', cost: 2, atk: 0, spd: 0, turnsRemaining: 2, isOmen: true, unitType: [], attribute: 'dark',    rules: 'Friendly combat units within 2 tiles become hidden. Any friendly combat unit summoned within 2 tiles gains Hidden.', image: 'smokebomb.webp' },
  manawell:       { id: 'manawell',       name: 'Mana Well',       type: 'omen', cost: 3, atk: 0, spd: 0, turnsRemaining: 4, isOmen: true, unitType: [], attribute: 'mystic',  rules: 'At the start of your turn, gain 1 temporary mana this turn.', image: 'manawell.webp' },
  feralsurge:     { id: 'feralsurge',     name: 'Feral Surge',     type: 'omen', cost: 2, atk: 0, spd: 0, turnsRemaining: 3, isOmen: true, unitType: [], attribute: 'primal',  rules: 'Friendly combat units summoned adjacent to this omen gain Rush.', image: 'feralsurge.webp' },

  // ── Terrain Spells ─────────────────────────────────────────────────────────
  // Terrain cards (type: 'terrain', isTerrain: true) modify tiles on the board.
  // terrainRadius 0 = target tile only, 1 = target + adjacent tiles, 2 = all tiles within Manhattan 2.
  // Cannot be placed on champion start tiles (0,0) and (4,4), or the Throne tile (2,2).
  // Terrain persists until replaced. Both players can see all terrain at all times.

  hallowed_ground: { id: 'hallowed_ground', name: 'Hallowed Ground', type: 'terrain', isTerrain: true, cost: 3, terrainRadius: 0, unitType: [], attribute: 'light',  rules: 'Light combat units on this tile have +1/+1.', terrainEffect: { id: 'hallowed', whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'light', combatOnly: true } }, image: 'hallowedground.webp' },
  scorched_earth:  { id: 'scorched_earth',  name: 'Scorched Earth',  type: 'terrain', isTerrain: true, cost: 4, terrainRadius: 0, unitType: [], attribute: 'primal', rules: 'Any unit that moves onto this tile takes 1 damage.', terrainEffect: { id: 'scorched', onOccupy: { damage: 1 } }, image: 'scorchedearth.webp' },
  enchanted_ground:{ id: 'enchanted_ground',name: 'Enchanted Ground', type: 'terrain', isTerrain: true, cost: 3, terrainRadius: 0, unitType: [], attribute: 'mystic', rules: 'Mystic combat units on this tile have +1/+1.', terrainEffect: { id: 'enchanted', whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'mystic', combatOnly: true } }, image: 'enchantedground.webp' },
  cursed_ground:   { id: 'cursed_ground',   name: 'Cursed Ground',   type: 'terrain', isTerrain: true, cost: 3, terrainRadius: 0, unitType: [], attribute: 'dark',   rules: 'Dark combat units on this tile have +1/+1.', terrainEffect: { id: 'cursed', whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'dark', combatOnly: true } }, image: 'cursedground.webp' },
  huntingground:   { id: 'huntingground',   name: 'Hunting Ground',  type: 'terrain', isTerrain: true, cost: 3, terrainRadius: 0, unitType: [], attribute: 'primal',  rules: 'Primal combat units on this tile have +1/+1.', terrainEffect: { id: 'huntingground', name: 'Hunting Ground', description: 'Primal combat units on this tile have +1/+1.', whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'primal', combatOnly: true } }, image: 'huntingground.webp' },
};

// ── Token Definitions ──────────────────────────────────────────────────────

export const TOKENS = {
  sapling: {
    id: 'token_sapling',
    name: 'Sapling',
    type: 'unit',
    unitType: [UNIT_TYPES.PLANT],
    attribute: 'mystic',
    cost: 0,
    atk: 1,
    hp: 1,
    spd: 1,
    rules: 'When this unit is destroyed, restore 1 HP to your champion.',
    isToken: true,
    image: 'sapling-token.webp',
  },
};

// ── Faction Deck Compositions ──────────────────────────────────────────────

const HUMAN_DECK = [
  'militia', 'militia',
  'footsoldier',
  'squire',
  'crossbowman',
  'waddles',
  'shieldwall',
  'sergeant',
  'knight',
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
  'hallowed_ground',
  'battlestandard',
  'soulstone',
  'clockworkmanimus',
  'lucernunbrokenvow',
];

const BEAST_DECK = [
  'boar', 'boar',
  'swiftpaw',
  'wolf', 'wolf',
  'razorclaw',
  'wildborne',
  'pip',
  'eagerbeaver',
  'stalker',
  'packrunner',
  'packrunt',
  'rockhorn', 'rockhorn',
  'plaguehog',
  'sabretooth', 'sabretooth',
  'razorfang',
  'smite', 'smite',
  'ironshield',
  'ambush',
  'packhowl',
  'pounce',
  'predatorsmark',
  'savagegrowth',
  'callofthesnakes',
  'siegemound', 'siegemound',
  'feralsurge', 'feralsurge',
  'huntingground',
  'vornthundercaller',
];

const ELF_DECK = [
  'elfscout',
  'seedling',
  'woodlandguard', 'woodlandguard',
  'whisper', 'whisper',
  'verdantarcher',
  'elfelder', 'elfelder',
  'thornweave', 'thornweave',
  'elfranger',
  'grovewarden',
  'moonveilmystic',
  'elfarcher',
  'sistersiofra',
  'grovechampion',
  'yggara',
  'smite', 'smite',
  'moonleaf',
  'overgrowth',
  'bloom',
  'entangle',
  'ancientspring',
  'verdantsurge',
  'spiritbolt',
  'echostone',
  'enchanted_ground',
  'manawell',
  'azulonsilvertide',
];

const DEMON_DECK = [
  'imp', 'imp',
  'darkdealer',
  'dreadknight',
  'chaospawn',
  'voidtitan',
  'hellhound',
  'brutedemon',
  'shadowtrap',
  'shadowstalker', 'shadowstalker',
  'shadowfiend', 'shadowfiend',
  'veilfiend',
  'fleshtithe',
  'dreadshade', 'dreadshade',
  'zmore',
  'smite', 'smite',
  'ironshield',
  'bloodoffering',
  'pactofruin',
  'darksentence',
  'devour',
  'infernalpact',
  'souldrain',
  'smokebomb',
  'cursed_ground',
  'bloodaltar',
  'vexishollowking',
];

export const DECKS = {
  human: { name: 'Light',   color: '#F0E6D2', cards: HUMAN_DECK },
  beast: { name: 'Primal',  color: '#22C55E', cards: BEAST_DECK },
  elf:   { name: 'Mystic',  color: '#A855F7', cards: ELF_DECK   },
  demon: { name: 'Dark',    color: '#EF4444', cards: DEMON_DECK },
};

export const FACTION_INFO = {
  human: {
    id: 'human',
    name: 'Light',
    color: '#F0E6D2',
    description: 'Disciplined warriors who grow stronger in formation. Master the art of positioning to unlock powerful Aura bonuses.',
    mechanic: 'Aura',
  },
  beast: {
    id: 'beast',
    name: 'Primal',
    color: '#22C55E',
    description: 'Primal hunters who strike before the enemy can react. Flood the board fast and overwhelm with speed and numbers.',
    mechanic: 'Rush',
  },
  elf: {
    id: 'elf',
    name: 'Mystic',
    color: '#A855F7',
    description: 'Ancient healers who refuse to fall. Restore your champion and outlast every threat the opponent can throw at you.',
    mechanic: 'Restore HP',
  },
  demon: {
    id: 'demon',
    name: 'Dark',
    color: '#EF4444',
    description: 'Dangerous and unpredictable. Hidden units lurk unseen while self-damage effects fuel overwhelming power.',
    mechanic: 'Hidden',
  },
};

// ── Deck builder ──────────────────────────────────────────────────────────

export function buildDeck(deckId = 'human') {
  if (deckId === 'custom') {
    const saved = JSON.parse(localStorage.getItem('gridholm_custom_deck') || 'null');
    if (saved && Array.isArray(saved.cards) && saved.cards.length > 0) {
      return saved.cards.map(id => ({
        ...CARD_DB[id],
        uid: `${id}_${Math.random().toString(36).slice(2)}`,
      })).filter(c => c.id);
    }
  }
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
