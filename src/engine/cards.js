// CARD POOL RULES:
// Each card has a unique ID. There are no faction-specific variants of the same card.
// Decks are compositions of cards drawn from the shared card pool.
// A card like Smite can appear in any deck. Its ID is always 'smite'.
// When building the deck builder UI show the full card pool and let players filter by faction affinity.

// ── Card Database ──────────────────────────────────────────────────────────

export const CARD_DB = {
  // Human units
  militia:         { id: 'militia',         name: 'Militia',             type: 'unit',  cost: 1, atk: 1, hp: 3, spd: 1, unitType: 'Human',  rules: '', image: 'militia.webp' },
  footsoldier:     { id: 'footsoldier',     name: 'Footsoldier',         type: 'unit',  cost: 1, atk: 2, hp: 1, spd: 1, unitType: 'Human',  rules: '', image: 'footsoldier.webp' },
  squire:          { id: 'squire',          name: 'Squire',              type: 'unit',  cost: 2, atk: 1, hp: 4, spd: 2, unitType: 'Human',  rules: '', image: 'squire.webp' },
  crossbowman:     { id: 'crossbowman',     name: 'Crossbowman',         type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Human',  rules: 'When this unit destroys an enemy unit draw 1 card.', image: 'crossbowman.webp' },
  shieldwall:      { id: 'shieldwall',      name: 'Shield Wall',         type: 'unit',  cost: 2, atk: 1, hp: 5, spd: 1, unitType: 'Human',  rules: '', image: 'shieldwall.webp' },
  sergeant:        { id: 'sergeant',        name: 'Sergeant',            type: 'unit',  cost: 3, atk: 2, hp: 2, spd: 1, unitType: 'Human',  rules: 'Action: The next combat unit you play this turn gains +1/+1.', action: true, image: 'sergeant.webp' },
  knight:          { id: 'knight',          name: 'Knight',              type: 'unit',  cost: 3, atk: 3, hp: 4, spd: 1, unitType: 'Human',  rules: '', image: 'knight.webp' },
  standardbearer:  { id: 'standardbearer',  name: 'Standard Bearer',     type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: 'Human',  rules: 'Aura 2: Friendly units within 2 tiles gain +1/+1.', aura: { range: 2, stat: 'both', value: 1, target: 'friendly' }, image: 'standardbearer.webp' },
  sentinel:        { id: 'sentinel',        name: 'Sentinel',            type: 'unit',  cost: 3, atk: 1, hp: 3, spd: 1, unitType: 'Human',  rules: 'Aura 1: Restore 1 HP to other friendly combat units within 1 tile at end of turn.', aura: { range: 1, stat: 'hp', value: 1, target: 'friendly', trigger: 'endturn', excludeSelf: true }, image: 'sentinel.webp' },
  warlord:         { id: 'warlord',         name: 'Warlord',             type: 'unit',  cost: 4, atk: 4, hp: 5, spd: 1, unitType: 'Human',  rules: '', image: 'warlord.webp' },
  battlepriestunit:{ id: 'battlepriestunit',name: 'Battle Priest',       type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: 'Human',  rules: 'When summoned: deal 2 damage to an adjacent enemy unit and restore 2 HP to an adjacent friendly unit.', image: 'battlepriestunit.webp' },
  paladin:         { id: 'paladin',         name: 'Paladin',             type: 'unit',  cost: 4, atk: 3, hp: 4, spd: 1, unitType: 'Human',  rules: 'Aura 1: Friendly combat units within 1 tile permanently gain +1 max HP at the beginning of your turn.', aura: { range: 1, stat: 'maxhp', value: 1, target: 'friendlycombat', trigger: 'beginturn', permanent: true }, image: 'paladin.webp' },
  // HOW TO ADD CARD ART:
  // 1. Generate art at 512x512px, export as WebP
  // 2. Upload to Supabase Storage bucket 'card-art'
  // 3. Set image field to the filename: image: 'captain.webp'
  // 4. The UI will automatically display it using getCardImageUrl()
  // Cards without art show a placeholder with the unit type label
  captain:         { id: 'captain',         name: 'Captain',             type: 'unit',  cost: 5, atk: 4, hp: 5, spd: 1, unitType: 'Human',  rules: 'Aura 1: Friendly units within 1 tile gain +1 ATK.', aura: { range: 1, stat: 'atk', value: 1, target: 'friendly' }, image: 'captain.webp' },
  aendor:          { id: 'aendor',          name: 'Aendor, The Ancient', type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: 'Human',  rules: 'Aura 1: Enemy units within 1 tile have -1 ATK in combat.', aura: { range: 1, stat: 'atk', value: -1, target: 'enemy' }, legendary: true, image: 'aendor.webp' },
  waddles:         { id: 'waddles',         name: 'Waddles, Trusted Aide', type: 'unit', cost: 2, atk: 1, hp: 2, spd: 1, unitType: 'Penguin', rules: 'While Waddles is adjacent to your champion, combat damage dealt to your champion is reduced to 2.', legendary: true, image: 'waddles.webp' },

  // Human spells
  smite:           { id: 'smite',           name: 'Smite',               type: 'spell', cost: 2, effect: 'smite',           unitType: 'Human', rules: 'Deal 4 damage to one enemy unit within 2 tiles of your champion.', image: 'smite.webp' },
  ironshield:      { id: 'ironshield',      name: 'Iron Shield',         type: 'spell', cost: 2, effect: 'ironshield',      unitType: 'Human', rules: 'Give a friendly unit a shield absorbing up to 5 damage from the next attack.', image: 'ironshield.webp' },
  ironthorns:      { id: 'ironthorns',      name: 'Iron Thorns',         type: 'spell', cost: 2, effect: 'ironthorns',      unitType: 'Human', rules: 'Give your champion a shield absorbing up to 3 damage from the next attack. The attacking unit takes 3 damage.', image: 'ironthorns.webp' },
  forgeweapon:     { id: 'forgeweapon',     name: 'Forge Weapon',        type: 'spell', cost: 2, effect: 'forgeweapon',     unitType: 'Human', rules: 'Give a friendly unit +3 ATK permanently.', image: 'forgeweapon.webp' },
  fortify:         { id: 'fortify',         name: 'Fortify',             type: 'spell', cost: 3, effect: 'fortify',         unitType: 'Human', rules: 'Give all friendly units +2 HP until start of your next turn.', image: 'fortify.webp' },
  rally:           { id: 'rally',           name: 'Rally',               type: 'spell', cost: 3, effect: 'rally',           unitType: 'Human', rules: 'All friendly units gain +1 ATK until end of turn.', image: 'rally.webp' },
  crusade:         { id: 'crusade',         name: 'Crusade',             type: 'spell', cost: 5, effect: 'crusade',         unitType: 'Human', rules: 'All friendly units gain +2 ATK this turn.', image: 'crusade.webp' },
  martiallaw:      { id: 'martiallaw',      name: 'Martial Law',         type: 'spell', cost: 4, effect: 'martiallaw',      unitType: 'Human', rules: 'Enemy combat units within 2 tiles of your champion skip their action next turn.', image: 'martiallaw.webp' },

  // Beast units
  boar:            { id: 'boar',            name: 'Boar',                type: 'unit',  cost: 1, atk: 1, hp: 1, spd: 1, unitType: 'Beast',  rules: 'Rush.', rush: true, image: 'boar.webp' },
  swiftpaw:        { id: 'swiftpaw',        name: 'Swiftpaw',            type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 2, unitType: 'Beast',  rules: '', image: 'swiftpaw.webp' },
  wolf:            { id: 'wolf',            name: 'Wolf',                type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: 'Beast',  rules: '', image: 'wolf.webp' },
  razorclaw:       { id: 'razorclaw',       name: 'Razorclaw',           type: 'unit',  cost: 2, atk: 3, hp: 1, spd: 2, unitType: 'Beast',  rules: '', image: 'razorclaw.webp' },
  pip:             { id: 'pip',             name: 'Pip the Hungry',      type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: 'Beast',  rules: 'At the end of your turn this unit gains +1/+1.', legendary: true, image: 'pip.webp' },
  eagerbeaver:     { id: 'eagerbeaver',     name: 'Eager Beaver',        type: 'unit',  cost: 3, atk: 3, hp: 3, spd: 1, unitType: 'Beast',  rules: 'Rush.', rush: true, image: 'eagerbeaver.webp' },
  stalker:         { id: 'stalker',         name: 'Stalker',             type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: 'Beast',  rules: '', image: 'stalker.webp' },
  packrunner:      { id: 'packrunner',      name: 'Pack Runner',         type: 'unit',  cost: 3, atk: 1, hp: 3, spd: 1, unitType: 'Beast',  rules: 'Action: Reset the action of a different friendly combat unit.', action: true, image: 'packrunner.webp' },
  packrunt:        { id: 'packrunt',        name: 'Pack Runt',           type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: 'Beast',  rules: 'Has +1 ATK for each other friendly Beast combat unit in play.', image: 'packrunt.webp' },
  rockhorn:        { id: 'rockhorn',        name: 'Rockhorn',            type: 'unit',  cost: 4, atk: 4, hp: 2, spd: 1, unitType: 'Beast',  rules: 'Rush.', rush: true, image: 'rockhorn.webp' },
  plaguehog:       { id: 'plaguehog',       name: 'Plague Hog',          type: 'unit',  cost: 4, atk: 4, hp: 1, spd: 1, unitType: 'Beast',  rules: 'Rush. When this unit is destroyed deal 2 damage to all adjacent units.', rush: true, image: 'plaguehog.webp' },
  sabretooth:      { id: 'sabretooth',      name: 'Sabretooth',          type: 'unit',  cost: 5, atk: 4, hp: 5, spd: 2, unitType: 'Beast',  rules: '', image: 'sabretooth.webp' },
  razorfang:       { id: 'razorfang',       name: 'Razorfang, Alpha',    type: 'unit',  cost: 6, atk: 5, hp: 5, spd: 2, unitType: 'Beast',  rules: "Rush. When this unit destroys an enemy combat unit reset this unit's action. Once per turn.", rush: true, legendary: true, image: 'razorfang.webp' },
  wildborne:       { id: 'wildborne',       name: 'Wildborne',           type: 'unit',  cost: 2, atk: 1, hp: 1, spd: 2, unitType: 'Human',  rules: 'Aura 1: Adjacent friendly Beast units gain +1 ATK in combat and +1 HP while in range.', aura: { range: 1, stat: 'atk', value: 1, target: 'friendlybeast' }, image: 'wildborne.webp' },

  // Beast spells
  ambush:          { id: 'ambush',          name: 'Ambush',              type: 'spell', cost: 3, effect: 'ambush',          unitType: 'Beast', rules: 'A friendly combat unit battles an adjacent enemy unit.', image: 'ambush.webp' },
  packhowl:        { id: 'packhowl',        name: 'Pack Howl',           type: 'spell', cost: 3, effect: 'packhowl',        unitType: 'Beast', rules: 'All friendly Beast combat units gain +1 ATK and +1 SPD this turn.', image: 'packhowl.webp' },
  pounce:          { id: 'pounce',          name: 'Pounce',              type: 'spell', cost: 2, effect: 'pounce',          unitType: 'Beast', rules: 'Reset the action of a friendly Beast unit.', image: 'pounce.webp' },
  predatorsmark:   { id: 'predatorsmark',   name: "Predator's Mark",     type: 'spell', cost: 3, effect: 'predatorsmark',   unitType: 'Beast', rules: 'An enemy unit within 2 tiles of your champion cannot move next turn.', image: 'predatorsmark.webp' },
  savagegrowth:    { id: 'savagegrowth',    name: 'Savage Growth',       type: 'spell', cost: 3, effect: 'savagegrowth',    unitType: 'Beast', rules: 'Give a friendly unit +2/+2 permanently.', image: 'savagegrowth.webp' },
  callofthesnakes: { id: 'callofthesnakes', name: 'Call of the Snakes',  type: 'spell', cost: 5, effect: 'callofthesnakes', unitType: 'Beast', rules: 'Summon a 1/1 Snake Beast combat unit in each open tile adjacent to your champion.', image: 'callofthesnakes.webp' },

  // Elf units
  elfscout:        { id: 'elfscout',        name: 'Elf Scout',           type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 2, unitType: 'Elf',    rules: '', image: 'elfscout.webp' },
  seedling:        { id: 'seedling',        name: 'Seedling',            type: 'unit',  cost: 1, atk: 0, hp: 3, spd: 0,                    rules: 'At the end of your turn restore 1 HP to your champion.', image: 'seedling.webp' },
  woodlandguard:   { id: 'woodlandguard',   name: 'Woodland Guard',      type: 'unit',  cost: 2, atk: 1, hp: 3, spd: 1, unitType: 'Elf',    rules: 'Action: Deal 1 damage to enemy combat unit within 2 tiles.', action: true, image: 'woodlandguard.webp' },
  whisper:         { id: 'whisper',         name: 'Whisper',             type: 'unit',  cost: 2, atk: 1, hp: 4, spd: 1, unitType: 'Elf',    rules: 'When this unit attacks restore 2 HP to your champion.', image: 'whisper.webp' },
  verdantarcher:   { id: 'verdantarcher',   name: 'Verdant Archer',      type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: 'Elf',    rules: '', image: 'verdantarcher.webp' },
  elfelder:        { id: 'elfelder',        name: 'Elf Elder',           type: 'unit',  cost: 3, atk: 2, hp: 4, spd: 1, unitType: 'Elf',    rules: 'When summoned restore 2 HP to your champion.', image: 'elfelder.webp' },
  thornweave:      { id: 'thornweave',      name: 'Thornweave',          type: 'unit',  cost: 3, atk: 2, hp: 3, spd: 1, unitType: 'Elf',    rules: 'When this unit is destroyed restore 3 HP to your champion.', image: 'thorneweave.webp' },
  elfranger:       { id: 'elfranger',       name: 'Elf Ranger',          type: 'unit',  cost: 4, atk: 3, hp: 4, spd: 2, unitType: 'Elf',    rules: '', image: 'elfranger.webp' },
  grovewarden:     { id: 'grovewarden',     name: 'Grove Warden',        type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: 'Elf',    rules: 'Action: Restore 1 HP to your champion for each friendly Elf combat unit you control.', action: true, image: 'grovewarden.webp' },
  moonveilmystic:  { id: 'moonveilmystic',  name: 'Moonveil Mystic',     type: 'unit',  cost: 4, atk: 1, hp: 2, spd: 1, unitType: 'Elf',    rules: 'Whenever you restore HP to your champion or a friendly unit this unit gains +1/+1. Triggers once per restore event.', image: 'moonveilmystic.webp' },
  elfarcher:       { id: 'elfarcher',       name: 'Elf Archer',          type: 'unit',  cost: 5, atk: 2, hp: 5, spd: 1, unitType: 'Elf',    rules: 'Action: Skip moving this unit to deal 2 damage to a unit within 2 tiles.', action: true, image: 'elfarcher.webp' },
  sistersiofra:    { id: 'sistersiofra',    name: 'Sister Siofra, First Prayer', type: 'unit', cost: 5, atk: 3, hp: 4, spd: 1, unitType: 'Elf', rules: 'When a friendly combat unit is destroyed your champion permanently gains +2 max HP.', legendary: true, image: 'sistersiofra.webp' },
  grovechampion:   { id: 'grovechampion',   name: 'Grove Champion',      type: 'unit',  cost: 5, atk: 5, hp: 5, spd: 1, unitType: 'Elf',    rules: '', image: 'grovechampion.webp' },
  yggara:          { id: 'yggara',          name: 'Yggara, Rootmother',  type: 'unit',  cost: 7, atk: 1, hp: 6, spd: 0, unitType: 'Elf',    rules: 'At the end of your turn summon a 1/1 Sapling in each adjacent tile.', legendary: true, image: 'yggara.webp' },
  sapling:         { id: 'sapling',         name: 'Sapling',             type: 'unit',  cost: 0, atk: 1, hp: 1, spd: 1,                    rules: 'When this unit is destroyed restore 1 HP to your champion.', token: true, image: null },

  // Elf spells
  moonleaf:        { id: 'moonleaf',        name: 'Moonleaf',            type: 'spell', cost: 2, effect: 'moonleaf',        unitType: 'Elf',   rules: 'Increase the current and max HP of a friendly combat unit by the number of cards in your hand.', image: 'moonleaf.webp' },
  overgrowth:      { id: 'overgrowth',      name: 'Overgrowth',          type: 'spell', cost: 4, effect: 'overgrowth',      unitType: 'Elf',   rules: 'Restore 2 HP to all friendly units.', image: 'overgrowth.webp' },
  bloom:           { id: 'bloom',           name: 'Bloom',               type: 'spell', cost: 3, effect: 'bloom',           unitType: 'Elf',   rules: 'Restore 2 HP to a friendly unit. Deal damage to an enemy combat unit equal to the total HP restored this turn.', image: 'bloom.webp' },
  entangle:        { id: 'entangle',        name: 'Entangle',            type: 'spell', cost: 3, effect: 'entangle',        unitType: 'Elf',   rules: 'Choose a friendly Elf. Adjacent enemy combat units cannot move next turn.', image: 'entangle.webp' },
  ancientspring:   { id: 'ancientspring',   name: 'Ancient Spring',      type: 'spell', cost: 3, effect: 'ancientspring',   unitType: 'Elf',   rules: 'Draw 2 cards.', image: 'ancientspring.webp' },
  verdantsurge:    { id: 'verdantsurge',    name: 'Verdant Surge',       type: 'spell', cost: 5, effect: 'verdantsurge',    unitType: 'Elf',   rules: 'Friendly units within 2 tiles of your champion gain +2 ATK and +2 HP this turn.', image: 'verdantsurge.webp' },
  spiritbolt:      { id: 'spiritbolt',      name: 'Spirit Bolt',         type: 'spell', cost: 3, effect: 'spiritbolt',      unitType: 'Elf',   rules: "Skip your champion's action this turn to deal damage to an enemy combat unit equal to the number of friendly units within 2 tiles of your champion.", image: 'spiritbolt.webp' },

  // Demon units
  imp:             { id: 'imp',             name: 'Imp',                 type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 1, unitType: 'Demon',  rules: 'Hidden.', hidden: true, image: 'imp.webp' },
  darkdealer:      { id: 'darkdealer',      name: 'Dark Dealer',         type: 'unit',  cost: 2, atk: 1, hp: 1, spd: 0, unitType: 'Demon',  rules: 'Action: Deal 2 damage to your champion. Draw a card.', action: true, legendary: true, image: 'darkdealer.webp' },
  dreadknight:     { id: 'dreadknight',     name: 'Dread Knight',        type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Demon',  rules: 'Hidden. When this unit deals damage to the enemy champion that player discards a card at random.', hidden: true, image: 'dreadknight.webp' },
  chaospawn:       { id: 'chaospawn',       name: 'Chaos Spawn',         type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: 'Demon',  rules: 'When summoned discard a card to draw a card.', image: 'chaospawn.webp' },
  hellhound:       { id: 'hellhound',       name: 'Hellhound',           type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: 'Demon',  rules: '', image: 'hellhound.webp' },
  brutedemon:      { id: 'brutedemon',      name: 'Brute Demon',         type: 'unit',  cost: 3, atk: 5, hp: 1, spd: 1, unitType: 'Demon',  rules: '', image: 'brutedemon.webp' },
  shadowtrap:      { id: 'shadowtrap',      name: 'Shadow Trap',         type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 0, unitType: 'Demon',  rules: 'Hidden. On reveal: destroy the enemy unit that revealed this unit.', hidden: true, image: 'shadowtrap.webp' },
  shadowstalker:   { id: 'shadowstalker',   name: 'Shadow Stalker',      type: 'unit',  cost: 3, atk: 3, hp: 3, spd: 1, unitType: 'Demon',  rules: 'Hidden.', hidden: true, image: 'shadowstalker.webp' },
  shadowfiend:     { id: 'shadowfiend',     name: 'Shadow Fiend',        type: 'unit',  cost: 4, atk: 4, hp: 5, spd: 1, unitType: 'Demon',  rules: '', image: 'shadowfiend.webp' },
  veilfiend:       { id: 'veilfiend',       name: 'Veil Fiend',          type: 'unit',  cost: 4, atk: 3, hp: 2, spd: 1, unitType: 'Demon',  rules: 'Hidden. On reveal: deal 2 damage to all adjacent enemy units.', hidden: true, image: 'veilfiend.webp' },
  fleshtithe:      { id: 'fleshtithe',      name: 'Flesh Tithe',         type: 'unit',  cost: 4, atk: 3, hp: 3, spd: 1, unitType: 'Demon',  rules: 'When summoned you may sacrifice a friendly combat unit. If you do this unit gains +2/+2.', image: 'fleshtithe.webp' },
  dreadshade:      { id: 'dreadshade',      name: 'Dread Shade',         type: 'unit',  cost: 5, atk: 5, hp: 4, spd: 1, unitType: 'Demon',  rules: 'Hidden. On reveal: this unit gains +2 ATK this turn.', hidden: true, image: 'dreadshade.webp' },
  zmore:           { id: 'zmore',           name: 'Zmore, Sleeping Ash', type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: 'Demon',  rules: 'At the end of your turn deal 1 damage to all other combat units.', legendary: true, image: 'zmore.webp' },
  voidtitan:       { id: 'voidtitan',       name: 'Void Titan',          type: 'unit',  cost: 6, atk: 6, hp: 6, spd: 1, unitType: 'Demon',  rules: '', image: 'voidtitan.webp' },

  // Demon spells
  bloodoffering:   { id: 'bloodoffering',   name: 'Blood Offering',      type: 'spell', cost: 2, effect: 'bloodoffering',   unitType: 'Demon', rules: 'Destroy a friendly combat unit. Deal damage equal to its current ATK to any enemy unit.', image: 'bloodoffering.webp' },
  pactofruin:      { id: 'pactofruin',      name: 'Pact of Ruin',        type: 'spell', cost: 1, effect: 'pactofruin',      unitType: 'Demon', rules: 'Discard a card to deal 3 damage to any enemy unit.', image: 'pactofruin.webp' },
  darksentence:    { id: 'darksentence',    name: 'Dark Sentence',       type: 'spell', cost: 5, effect: 'darksentence',    unitType: 'Demon', rules: 'Destroy an enemy combat unit.', image: 'darksentence.webp' },
  devour:          { id: 'devour',          name: 'Devour',              type: 'spell', cost: 3, effect: 'devour',          unitType: 'Demon', rules: 'Destroy an enemy combat unit with 2 or less HP.', image: 'devour.webp' },
  infernalpact:    { id: 'infernalpact',    name: 'Infernal Pact',       type: 'spell', cost: 3, effect: 'infernalpact',    unitType: 'Demon', rules: 'Deal 3 damage to your champion. All friendly Demon units gain +2 ATK this turn.', image: 'infernalpact.webp' },
  shadowveil:      { id: 'shadowveil',      name: 'Shadow Veil',         type: 'spell', cost: 2, effect: 'shadowveil',      unitType: 'Demon', rules: 'The next combat unit you play this turn is summoned with Hidden.', image: 'shadowveil.webp' },
  souldrain:       { id: 'souldrain',       name: 'Soul Drain',          type: 'spell', cost: 3, effect: 'souldrain',       unitType: 'Demon', rules: 'Deal 2 damage to an enemy combat unit. Restore HP to your champion equal to the damage dealt.', image: 'souldrain.webp' },
};

// ── Faction Deck Compositions ──────────────────────────────────────────────

const HUMAN_DECK = [
  'militia', 'militia',
  'footsoldier', 'footsoldier',
  'squire', 'squire',
  'crossbowman',
  'waddles',
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
  'razorclaw',
  'wildborne',
  'pip',
  'eagerbeaver',
  'stalker', 'stalker',
  'packrunner',
  'packrunt',
  'rockhorn', 'rockhorn',
  'plaguehog',
  'sabretooth', 'sabretooth',
  'razorfang',
  'smite', 'smite',
  'ironshield',
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
];

const DEMON_DECK = [
  'imp', 'imp',
  'darkdealer',
  'dreadknight',
  'chaospawn',
  'voidtitan',
  'hellhound', 'hellhound',
  'brutedemon', 'brutedemon',
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
