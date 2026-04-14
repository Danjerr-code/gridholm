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
  militia:         { id: 'militia', rarity: 'common',         name: 'Militia',             type: 'unit',  cost: 1, atk: 1, hp: 3, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '', image: 'militia.webp' },
  footsoldier:     { id: 'footsoldier', rarity: 'common',     name: 'Cutthroat',           type: 'unit',  cost: 1, atk: 2, hp: 1, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '', image: 'footsoldier.webp' },
  squire:          { id: 'squire', rarity: 'common',          name: 'Squire',              type: 'unit',  cost: 2, atk: 1, hp: 4, spd: 2, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '', image: 'squire.webp' },
  crossbowman:     { id: 'crossbowman', rarity: 'rare',     name: 'Crossbowman',         type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.SOLDIER], attribute: 'light',   rules: 'When this unit destroys an enemy unit, draw 1 card.', image: 'crossbowman.webp' },
  shieldwall:      { id: 'shieldwall', rarity: 'common',      name: 'Shield Wall',         type: 'unit',  cost: 2, atk: 1, hp: 5, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '', image: 'shieldwall.webp' },
  sergeant:        { id: 'sergeant', rarity: 'rare',        name: 'Sergeant',            type: 'unit',  cost: 3, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.SOLDIER], attribute: 'light',   rules: 'Action: The next unit you play this turn gains +1/+1.', action: true, image: 'sergeant.webp' },
  knight:          { id: 'knight', rarity: 'common',          name: 'Knight',              type: 'unit',  cost: 3, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.KNIGHT], attribute: 'light',   rules: '', image: 'knight.webp' },
  standardbearer:  { id: 'standardbearer', rarity: 'rare',  name: 'Standard Bearer',     type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: 'Aura 2: Friendly units within 2 tiles have +1/+1.', aura: { range: 2, stat: 'both', value: 1, target: 'friendly' }, image: 'standardbearer.webp' },
  sentinel:        { id: 'sentinel', rarity: 'rare',        name: 'Sentinel',            type: 'unit',  cost: 3, atk: 1, hp: 3, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: 'Aura 1: Restore 1 HP to friendly units within 1 tile at end of turn.', aura: { range: 1, stat: 'hp', value: 1, target: 'friendly', trigger: 'endturn', excludeSelf: true }, image: 'sentinel.webp' },
  warlord:         { id: 'warlord', rarity: 'common',         name: 'Warlord',             type: 'unit',  cost: 4, atk: 4, hp: 5, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.KNIGHT], attribute: 'light',   rules: '', image: 'warlord.webp' },
  battlepriestunit:{ id: 'battlepriestunit', rarity: 'rare',name: 'Battle Priest',       type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.CLERIC], attribute: 'light',   rules: 'When summoned, deal 2 damage to an adjacent enemy unit and restore 2 HP to an adjacent friendly unit.', image: 'battlepriestunit.webp' },
  paladin:         { id: 'paladin', rarity: 'rare',         name: 'Paladin',             type: 'unit',  cost: 4, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.PALADIN], attribute: 'light',   rules: 'Aura 1: Friendly units within 1 tile permanently gain +1 HP at the beginning of your turn.', aura: { range: 1, stat: 'maxhp', value: 1, target: 'friendlycombat', trigger: 'beginturn', permanent: true }, image: 'paladin.webp' },
  captain:         { id: 'captain', rarity: 'rare',         name: 'Captain',             type: 'unit',  cost: 5, atk: 4, hp: 5, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: 'Aura 1: Friendly units within 1 tile have +1 ATK.', aura: { range: 1, stat: 'atk', value: 1, target: 'friendly' }, image: 'captain.webp' },
  aendor:          { id: 'aendor', rarity: 'legendary',          name: 'Aendor, The Ancient', type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: [UNIT_TYPES.ANGEL], attribute: 'light',   rules: 'Flying|Aura 1: Enemy units within 1 tile have -1 ATK.', flying: true, aura: { range: 1, stat: 'atk', value: -1, target: 'enemy' }, legendary: true, image: 'aendor.webp' },
  waddles:         { id: 'waddles', rarity: 'legendary',         name: 'Waddles, Trusted Aide', type: 'unit', cost: 2, atk: 1, hp: 2, spd: 1, unitType: [UNIT_TYPES.PENGUIN], attribute: 'light',  rules: 'While Waddles is adjacent to your champion, combat damage dealt to your champion is reduced to 2.', legendary: true, image: 'waddles.webp' },
  shimmerguardian: { id: 'shimmerguardian', rarity: 'rare', name: 'Shimmer Guardian',      type: 'unit',  cost: 5, atk: 5, hp: 6, spd: 1, unitType: [UNIT_TYPES.SPIRIT], attribute: 'light',   rules: 'When this unit takes damage, return it to your hand.', triggers: [{ event: 'onDamageTaken', effect: 'returnToHand', selfTrigger: true }], image: 'shimmerguardian.webp' },
  veilbreaker:     { id: 'veilbreaker', rarity: 'rare',     name: 'Veilbreaker',           type: 'unit',  cost: 6, atk: 5, hp: 5, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.KNIGHT], attribute: 'light',   rules: 'When this unit attacks a Hidden unit, destroy that unit. The Hidden reveal is not activated.', image: 'veilbreaker.webp' },
  oathkeepparagon:  { id: 'oathkeepparagon', rarity: 'rare',  name: 'Oathkeep Paragon',    type: 'unit',  cost: 5, atk: 4, hp: 1, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: '+1 HP for each other friendly unit you control.', modifier: { type: 'conditionalStatBuff', stat: 'hp', scaling: 'friendlyUnitCount' }, image: 'oathkeepparagon.webp' },
  wardlightcolossus:{ id: 'wardlightcolossus', rarity: 'rare', name: 'Wardlight Colossus',  type: 'unit',  cost: 7, atk: 6, hp: 7, spd: 1, unitType: [UNIT_TYPES.ANGEL], attribute: 'light',   rules: 'Aura 2: Friendly units within 2 tiles cannot be targeted by spells.', modifier: [{ type: 'auraSpellImmunity', range: 2 }], image: 'wardlightcolossus.webp' },
  peacekeeper:      { id: 'peacekeeper', rarity: 'rare',       name: 'Peacekeeper',         type: 'unit',  cost: 6, atk: 5, hp: 5, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: 'When summoned, adjacent enemy units are stunned next turn.', image: 'peacekeeper.webp' },

  // Human spells
  smite:           { id: 'smite', rarity: 'common',           name: 'Smite',               type: 'spell', cost: 3, effect: 'smite',           unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Deal 4 damage to one enemy unit or relic within 2 tiles of your champion.', image: 'smite.webp' },
  ironshield:      { id: 'ironshield', rarity: 'common',      name: 'Iron Shield',         type: 'spell', cost: 2, effect: 'ironshield',      unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Give a friendly unit a shield absorbing up to 5 damage from the next attack.', image: 'ironshield.webp' },
  ironthorns:      { id: 'ironthorns', rarity: 'common',      name: 'Iron Thorns',         type: 'spell', cost: 2, effect: 'ironthorns',      unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Give your champion a shield absorbing up to 3 damage from the next attack. The attacking unit takes 3 damage.', image: 'ironthorns.webp' },
  forgeweapon:     { id: 'forgeweapon', rarity: 'common',     name: 'Forge Weapon',        type: 'spell', cost: 2, effect: 'forgeweapon',     unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Give a friendly unit +2 ATK permanently.', image: 'forgeweapon.webp' },
  fortify:         { id: 'fortify', rarity: 'common',         name: 'Fortify',             type: 'spell', cost: 3, effect: 'fortify',         unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'All friendly units gain +2 HP until end of turn.', image: 'fortify.webp' },
  rally:           { id: 'rally', rarity: 'common',           name: 'Rally',               type: 'spell', cost: 3, effect: 'rally',           unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'All friendly units gain +1 ATK until end of turn.', image: 'rally.webp' },
  crusade:         { id: 'crusade', rarity: 'common',         name: 'Crusade',             type: 'spell', cost: 5, effect: 'crusade',         unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'All friendly units gain +2 ATK until end of turn.', image: 'crusade.webp' },
  martiallaw:      { id: 'martiallaw', rarity: 'rare',      name: 'Martial Law',         type: 'spell', cost: 4, effect: 'martiallaw',      unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Enemy units within 2 tiles of your champion are stunned next turn.', image: 'martiallaw.webp' },
  rebirth:         { id: 'rebirth', rarity: 'rare',         name: 'Rebirth',             type: 'spell', cost: 4, effect: 'rebirth',         unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: "Skip your champion's action this turn. Return a friendly unit from your grave to an adjacent tile.", image: 'rebirth.webp' },
  standfirm:       { id: 'standfirm', rarity: 'common',       name: 'Stand Firm',          type: 'spell', cost: 1, effect: 'standfirm',       unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Target friendly unit has +2 HP this turn.', image: 'standfirm.webp' },
  gildedcage:      { id: 'gildedcage', rarity: 'rare',      name: 'Gilded Cage',         type: 'spell', cost: 4, effect: 'gildedcage',      unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Target enemy unit becomes trapped in a 5 HP Relic.', image: 'gildedcage.webp' },
  angelicblessing: { id: 'angelicblessing', rarity: 'rare', name: 'Angelic Blessing',    type: 'spell', cost: 6, effect: 'angelicblessing', unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: "Target friendly unit adjacent to your champion gains +4/+4 and 'Cannot be targeted by spells'.", image: 'angelicblessing.webp' },
  seconddawn:      { id: 'seconddawn', rarity: 'rare',      name: 'Second Dawn',         type: 'spell', cost: 8, effect: 'seconddawn',      unitType: [UNIT_TYPES.HUMAN],attribute: 'light',   rules: 'Return all friendly units from your grave to tiles adjacent to your champion.', image: 'seconddawn.webp' },
  chainsoflight:   { id: 'chainsoflight', rarity: 'rare',   name: 'Chains of Light',     type: 'omen',  cost: 5, atk: 0, spd: 0, turnsRemaining: 4, isOmen: true, unitType: [UNIT_TYPES.HUMAN], attribute: 'light',   rules: 'Target enemy unit is Stunned.', image: 'chainsoflight.webp' },

  // Beast units
  boar:            { id: 'boar', rarity: 'common',            name: 'Boar',                type: 'unit',  cost: 1, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush', rush: true, image: 'boar.webp' },
  swiftpaw:        { id: 'swiftpaw', rarity: 'common',        name: 'Swiftpaw',            type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'swiftpaw.webp' },
  wolf:            { id: 'wolf', rarity: 'common',            name: 'Wolf',                type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'wolf.webp' },
  razorclaw:       { id: 'razorclaw', rarity: 'common',       name: 'Razorclaw',           type: 'unit',  cost: 2, atk: 3, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'razorclaw.webp' },
  pip:             { id: 'pip', rarity: 'legendary',             name: 'Pip the Hungry',      type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'At the end of your turn, this unit gains +1/+1.', legendary: true, image: 'pip.webp' },
  eagerbeaver:     { id: 'eagerbeaver', rarity: 'common',     name: 'Eager Beaver',        type: 'unit',  cost: 3, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush', rush: true, image: 'eagerbeaver.webp' },
  stalker:         { id: 'stalker', rarity: 'common',         name: 'Stalker',             type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'stalker.webp' },
  packrunner:      { id: 'packrunner', rarity: 'rare',      name: 'Pack Runner',         type: 'unit',  cost: 3, atk: 1, hp: 3, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Action: Reset the action of a different friendly unit or relic.', action: true, image: 'packrunner.webp' },
  packrunt:        { id: 'packrunt', rarity: 'rare',        name: 'Pack Runt',           type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Has +1 ATK for each other friendly unit in play.', image: 'packrunt.webp' },
  rockhorn:        { id: 'rockhorn', rarity: 'common',        name: 'Rockhorn',            type: 'unit',  cost: 4, atk: 4, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush', rush: true, image: 'rockhorn.webp' },
  plaguehog:       { id: 'plaguehog', rarity: 'rare',       name: 'Plague Hog',          type: 'unit',  cost: 4, atk: 4, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush|When this unit dies, deal 2 damage to all adjacent units.', rush: true, image: 'plaguehog.webp' },
  sabretooth:      { id: 'sabretooth', rarity: 'common',      name: 'Sabretooth',          type: 'unit',  cost: 5, atk: 4, hp: 5, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: '', image: 'sabretooth.webp' },
  razorfang:       { id: 'razorfang', rarity: 'legendary',       name: 'Razorfang, Alpha',    type: 'unit',  cost: 6, atk: 5, hp: 5, spd: 2, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: "Rush|When this unit destroys an enemy unit or relic, reset this unit's action. Once per turn.", rush: true, legendary: true, image: 'razorfang.webp' },
  tuskling:        { id: 'tuskling', rarity: 'common',        name: 'Tuskling',            type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'Rush', rush: true, image: 'tuskling.webp' },
  unrulythundertusk: { id: 'unrulythundertusk', rarity: 'rare', name: 'Unruly Thundertusk', type: 'unit', cost: 5, atk: 7, hp: 4, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal', rules: "This unit's actions cost 2 commands.", doubleCommandCost: true, image: 'unrulythundertusk.webp' },
  wildborne:       { id: 'wildborne', rarity: 'rare',       name: 'Wildborne',           type: 'unit',  cost: 2, atk: 1, hp: 1, spd: 2, unitType: [UNIT_TYPES.HUMAN], attribute: 'primal',  rules: 'Aura 1: Friendly units within 1 tile gain +1/+1.', aura: { range: 1, stat: 'atk', value: 1, target: 'friendly' }, image: 'wildborne.webp' },
  nighthoofreaver: { id: 'nighthoofreaver', rarity: 'rare', name: 'Nighthoof Reaver',     type: 'unit',  cost: 3, atk: 2, hp: 1, spd: 1, unitType: [UNIT_TYPES.BEASTKIN], attribute: 'primal',  rules: 'Gain +1/+1 whenever an enemy unit dies.', triggers: [{ event: 'onEnemyUnitDeath', effect: 'gainPlusOnePlusOne', selfTrigger: false }], image: 'nighthoofreaver.webp' },
  kragorsbehemoth: { id: 'kragorsbehemoth', rarity: 'rare', name: "Kragor's Behemoth",    type: 'unit',  cost: 7, atk: 5, hp: 4, spd: 1, unitType: [UNIT_TYPES.BEAST], attribute: 'primal',  rules: 'When this unit deals damage to the enemy champion, that champion is stunned next turn.', triggers: [{ event: 'onChampionDamageDealt', effect: 'stunEnemyChampion' }], image: 'kragorsbehemoth.webp' },

  // Beast spells
  ambush:          { id: 'ambush', rarity: 'common',          name: 'Ambush',              type: 'spell', cost: 3, effect: 'ambush',          unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'A friendly unit battles an adjacent enemy unit.', image: 'ambush.webp' },
  packhowl:        { id: 'packhowl', rarity: 'rare',        name: 'Pack Howl',           type: 'spell', cost: 3, effect: 'packhowl',        unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'All friendly Primal units gain +1 ATK and +1 SPD this turn.', image: 'packhowl.webp' },
  pounce:          { id: 'pounce', rarity: 'common',          name: 'Pounce',              type: 'spell', cost: 2, effect: 'pounce',          unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Reset the action of a friendly Primal unit.', image: 'pounce.webp' },
  predatorsmark:   { id: 'predatorsmark', rarity: 'common',   name: "Predator's Mark",     type: 'spell', cost: 3, effect: 'predatorsmark',   unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'The enemy champion skips their action next turn.', image: 'predatorsmark.webp' },
  savagegrowth:    { id: 'savagegrowth', rarity: 'common',    name: 'Savage Growth',       type: 'spell', cost: 3, effect: 'savagegrowth',    unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Give a friendly unit +2/+2 permanently.', image: 'savagegrowth.webp' },
  callofthesnakes: { id: 'callofthesnakes', rarity: 'rare', name: 'Call of the Snakes',  type: 'spell', cost: 5, effect: 'callofthesnakes', unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Summon a 1/1 Snake in each open tile adjacent to your champion.', image: 'callofthesnakes.webp' },
  crushingblow:    { id: 'crushingblow', rarity: 'rare',    name: 'Crushing Blow',       type: 'spell', cost: 4, effect: 'crushingblow',    unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: "Skip your champion's action this turn. Deal 4 damage to an adjacent unit and push it back 1 tile.", image: 'crushingblow.webp' },
  animus:          { id: 'animus', rarity: 'common',          name: 'Animus',              type: 'spell', cost: 1, effect: 'animus',          unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Target friendly unit gains +2 ATK this turn.', image: 'animus.webp' },
  gore:            { id: 'gore', rarity: 'common',            name: 'Gore',                type: 'spell', cost: 2, effect: 'gore',            unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Deal 2 damage to target piece.', image: 'gore.webp' },
  demolish:        { id: 'demolish', rarity: 'common',        name: 'Demolish',            type: 'spell', cost: 2, effect: 'demolish',        unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Destroy target Relic or Omen.', image: 'demolish.webp' },
  apexrampage:     { id: 'apexrampage', rarity: 'rare',     name: 'Apex Rampage',        type: 'spell', cost: 7, effect: 'apexrampage',     unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: 'Target friendly unit gains +2 ATK and 2 extra actions this turn.', image: 'apexrampage.webp' },

  // Elf units
  elfscout:        { id: 'elfscout', rarity: 'common',        name: 'Sylvan Scout',        type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 2, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: '', image: 'elfscout.webp' },
  seedling:        { id: 'seedling', rarity: 'common',        name: 'Seedling',            type: 'unit',  cost: 1, atk: 0, hp: 3, spd: 0, unitType: [UNIT_TYPES.PLANT], attribute: 'mystic',  rules: 'At the end of your turn, restore 1 HP to your champion.', image: 'seedling.webp' },
  woodlandguard:   { id: 'woodlandguard', rarity: 'rare',   name: 'Woodland Guard',      type: 'unit',  cost: 2, atk: 1, hp: 3, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'Action: Deal 1 damage to an enemy unit or relic within 2 tiles.', action: true, image: 'woodlandguard.webp' },
  whisper:         { id: 'whisper', rarity: 'rare',         name: 'Whisper',             type: 'unit',  cost: 2, atk: 1, hp: 4, spd: 1, unitType: [UNIT_TYPES.ELF, UNIT_TYPES.SPIRIT],   attribute: 'mystic',  rules: 'When this unit attacks, restore 1 HP to your champion.', image: 'whisper.webp' },
  verdantarcher:   { id: 'verdantarcher', rarity: 'common',   name: 'Verdant Archer',      type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: '', image: 'verdantarcher.webp' },
  elfelder:        { id: 'elfelder', rarity: 'common',        name: 'Mystic Elder',        type: 'unit',  cost: 3, atk: 2, hp: 4, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'When summoned, restore 2 HP to your champion.', image: 'elfelder.webp' },
  thornweave:      { id: 'thornweave', rarity: 'common',      name: 'Thornweaver',         type: 'unit',  cost: 3, atk: 2, hp: 3, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'When this unit is destroyed, restore 3 HP to your champion.', image: 'thorneweave.webp' },
  elfranger:       { id: 'elfranger', rarity: 'common',       name: 'Sylvan Ranger',       type: 'unit',  cost: 4, atk: 3, hp: 4, spd: 2, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: '', image: 'elfranger.webp' },
  grovewarden:     { id: 'grovewarden', rarity: 'rare',     name: 'Grove Warden',        type: 'unit',  cost: 4, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'Action: Restore 1 HP to your champion for each friendly Mystic unit you control.', action: true, image: 'grovewarden.webp' },
  moonveilmystic:  { id: 'moonveilmystic', rarity: 'rare',  name: 'Moonveil Mystic',     type: 'unit',  cost: 4, atk: 1, hp: 2, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'Whenever you restore HP to your champion or a friendly unit, this unit gains +1/+1. Triggers once per restore event.', image: 'moonveilmystic.webp' },
  elfarcher:       { id: 'elfarcher', rarity: 'rare',       name: 'Highborne Archer',    type: 'unit',  cost: 5, atk: 2, hp: 5, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'Action: Deal 2 damage to a unit within 2 tiles.', action: true, image: 'elfarcher.webp' },
  sistersiofra:    { id: 'sistersiofra', rarity: 'legendary',    name: 'Sister Siofra, First Prayer', type: 'unit', cost: 5, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.ELF],attribute: 'mystic', rules: 'When a friendly unit is destroyed, your champion gains +2 HP.', legendary: true, image: 'sistersiofra.webp' },
  grovechampion:   { id: 'grovechampion', rarity: 'common',   name: 'Grove Champion',      type: 'unit',  cost: 5, atk: 5, hp: 5, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: '', image: 'grovechampion.webp' },
  yggara:          { id: 'yggara', rarity: 'legendary',          name: 'Yggara, Rootmother',  type: 'unit',  cost: 8, atk: 1, hp: 6, spd: 0, unitType: [UNIT_TYPES.SPIRIT, UNIT_TYPES.PLANT],   attribute: 'mystic',  rules: 'At the end of your turn, summon a 1/1 Sapling in each adjacent tile.', legendary: true, image: 'yggara.webp' },
  sapling:         { id: 'sapling', rarity: 'common',         name: 'Sapling',             type: 'unit',  cost: 0, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.PLANT], attribute: 'mystic',  rules: 'When this unit dies, restore 1 HP to your champion.', token: true, image: 'sapling-token.webp' },

  sylvancourier:    { id: 'sylvancourier', rarity: 'common',    name: 'Sylvan Courier',     type: 'unit',  cost: 2, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic',  rules: 'When summoned, draw a card.', image: 'sylvancourier.webp' },
  canopysentinel:   { id: 'canopysentinel', rarity: 'rare',   name: 'Canopy Sentinel',    type: 'unit',  cost: 6, atk: 5, hp: 5, spd: 1, unitType: [UNIT_TYPES.PLANT],   attribute: 'mystic',  rules: 'When summoned, summon a Sapling in an adjacent tile.', image: 'canopysentinel.webp' },
  cascadesage:      { id: 'cascadesage', rarity: 'rare',      name: 'Cascade Sage',       type: 'unit',  cost: 6, atk: 4, hp: 4, spd: 1, unitType: [UNIT_TYPES.WIZARD],   attribute: 'mystic',  rules: 'The first time you cast a spell each turn, draw a card.', triggers: [{ event: 'onCardPlayed', effect: 'drawOnFirstSpell', oncePerTurn: true }], image: 'cascadesage.webp' },
  stormcrestdrake:  { id: 'stormcrestdrake', rarity: 'rare',  name: 'Stormcrest Drake',   type: 'unit',  cost: 7, atk: 6, hp: 6, spd: 2, unitType: [UNIT_TYPES.DRAGON],  attribute: 'mystic',  rules: 'Flying', flying: true, image: 'stormcrestdrake.webp' },
  lifebinder:       { id: 'lifebinder', rarity: 'rare',       name: 'Lifebinder',          type: 'unit',  cost: 6, atk: 5, hp: 6, spd: 1, unitType: [UNIT_TYPES.ELF, UNIT_TYPES.GIANT], attribute: 'mystic',  rules: 'When summoned, return target friendly unit to full health.', image: 'lifebinder.webp' },
  rootsongcommander:{ id: 'rootsongcommander', rarity: 'rare',name: 'Rootsong Commander',  type: 'unit',  cost: 5, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.ELF],     attribute: 'mystic',  rules: 'Action: Target friendly unit gains +1/+1 for each friendly Elf you control until end of turn.', action: true, image: 'rootsongcommander.webp' },

  // Elf spells
  moonleaf:        { id: 'moonleaf', rarity: 'rare',        name: 'Moonleaf',            type: 'spell', cost: 2, effect: 'moonleaf',        unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Increase the HP of a friendly unit equal to the number of cards in your hand.', image: 'moonleaf.webp' },
  overgrowth:      { id: 'overgrowth', rarity: 'common',      name: 'Overgrowth',          type: 'spell', cost: 4, effect: 'overgrowth',      unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Restore 2 HP to all friendly units.', image: 'overgrowth.webp' },
  bloom:           { id: 'bloom', rarity: 'rare',           name: 'Bloom',               type: 'spell', cost: 3, effect: 'bloom',           unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: "Restore 2 HP to a friendly unit. Deal damage to an enemy unit equal to the total HP you've restored this turn.", image: 'bloom.webp' },
  entangle:        { id: 'entangle', rarity: 'rare',        name: 'Entangle',            type: 'spell', cost: 3, effect: 'entangle',        unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Choose a friendly Mystic unit. Enemy units adjacent to that unit cannot move next turn.', image: 'entangle.webp' },
  ancientspring:   { id: 'ancientspring', rarity: 'common',   name: 'Ancient Spring',      type: 'spell', cost: 3, effect: 'ancientspring',   unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Draw 2 cards.', image: 'ancientspring.webp' },
  verdantsurge:    { id: 'verdantsurge', rarity: 'common',    name: 'Verdant Surge',       type: 'spell', cost: 5, effect: 'verdantsurge',    unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Give your champion and friendly units within 2 tiles of your champion +2/+2 this turn.', image: 'verdantsurge.webp' },
  spiritbolt:      { id: 'spiritbolt', rarity: 'rare',      name: 'Spirit Bolt',         type: 'spell', cost: 5, effect: 'spiritbolt',      unitType: [UNIT_TYPES.BEAST],attribute: 'primal',  rules: "Skip your champion's action this turn. Deal damage to any enemy unit or champion equal to the number of friendly units within 2 tiles of your champion.", image: 'spiritbolt.webp' },
  glimpse:         { id: 'glimpse', rarity: 'common',         name: 'Glimpse',             type: 'spell', cost: 1, effect: 'glimpse',         unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: "Skip your champion's action this turn. Look at the top card of your deck. You may shuffle it back. Draw a card.", image: 'glimpse.webp' },
  petrify:         { id: 'petrify', rarity: 'rare',         name: 'Petrify',             type: 'spell', cost: 4, effect: 'petrify',         unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Transform target enemy unit with 4 or less HP into a Relic with no abilities.', image: 'petrify.webp' },
  glitteringgift:  { id: 'glitteringgift', rarity: 'rare',  name: 'Glittering Gift',     type: 'spell', cost: 2, effect: 'glitteringgift',  unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: "Give a friendly unit +1/+1 and 'When this unit is destroyed, draw a card.'", image: 'glitteringgift.webp' },
  recall:          { id: 'recall', rarity: 'rare',          name: 'Recall',              type: 'spell', cost: 2, effect: 'recall',          unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: "Return target unit to its owner's hand.", image: 'recall.webp' },
  amethystcache:   { id: 'amethystcache', rarity: 'rare',   name: 'Amethyst Cache',      type: 'spell', cost: 5, effect: 'amethystcache',   unitType: [UNIT_TYPES.ELF],  attribute: 'mystic',  rules: 'Create an Amethyst Crystal in a tile adjacent to your champion.', image: 'amythstcache.webp' },
  amethystcrystal: { id: 'amethystcrystal', rarity: 'common', name: 'Amethyst Crystal',    type: 'relic', cost: 0, atk: 0, hp: 5, spd: 0, isRelic: true, unitType: [], attribute: 'mystic',  rules: 'When this relic is destroyed, draw 3 cards.', triggers: [{ event: 'onFriendlyUnitDeath', effect: 'drawThreeCards', selfTrigger: true }], token: true, image: 'ameythystcrystal-relic.webp' },

  // Demon units
  spiteling:       { id: 'spiteling', rarity: 'common',       name: 'Spiteling',           type: 'unit',  cost: 1, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'When this unit dies, deal 1 damage to a random enemy unit.', triggers: [{ event: 'onFriendlyUnitDeath', effect: 'deathPing', selfTrigger: true }], image: 'spiteling.webp' },
  imp:             { id: 'imp', rarity: 'common',             name: 'Imp',                 type: 'unit',  cost: 1, atk: 1, hp: 2, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'Hidden', hidden: true, image: 'imp.webp' },
  darkdealer:      { id: 'darkdealer', rarity: 'legendary',      name: 'Nameless Dealer',      type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 0, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'Action: Deal 2 damage to your champion. Draw a card.', action: true, legendary: true, image: 'darkdealer.webp' },
  dreadknight:     { id: 'dreadknight', rarity: 'rare',     name: 'Dread Knight',        type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.DEMON, UNIT_TYPES.KNIGHT], attribute: 'dark',    rules: 'Hidden|When this unit deals damage to the enemy champion, that player discards a card at random.', hidden: true, image: 'dreadknight.webp' },
  chaospawn:       { id: 'chaospawn', rarity: 'rare',       name: 'Chaos Spawn',         type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HORROR], attribute: 'dark',    rules: 'When summoned, draw a card then discard a card.', image: 'chaospawn.webp' },
  hellhound:       { id: 'hellhound', rarity: 'common',       name: 'Hellhound',           type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: [UNIT_TYPES.DEMON, UNIT_TYPES.BEAST], attribute: 'dark',    rules: '', image: 'hellhound.webp' },
  brutedemon:      { id: 'brutedemon', rarity: 'common',      name: 'Infernal Spider',     type: 'unit',  cost: 3, atk: 5, hp: 1, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: '', image: 'brutedemon.webp' },
  shadowtrap:      { id: 'shadowtrap', rarity: 'rare',      name: 'Shadow Trap Hole',    type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 0, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',    rules: 'Hidden|On reveal: destroy the enemy unit that revealed this unit.', hidden: true, image: 'shadowtrap.webp' },
  shadowstalker:   { id: 'shadowstalker', rarity: 'common',   name: 'Shadow Stalker',      type: 'unit',  cost: 3, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',    rules: 'Hidden', hidden: true, image: 'shadowstalker.webp' },
  shadowfiend:     { id: 'shadowfiend', rarity: 'common',     name: 'Shadow Fiend',        type: 'unit',  cost: 4, atk: 4, hp: 5, spd: 1, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',    rules: '', image: 'shadowfiend.webp' },
  veilfiend:       { id: 'veilfiend', rarity: 'rare',       name: 'Veil Fiend',          type: 'unit',  cost: 4, atk: 3, hp: 2, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'Hidden|On reveal: deal 2 damage to all adjacent enemy units.', hidden: true, image: 'veilfiend.webp' },
  fleshtithe:      { id: 'fleshtithe', rarity: 'rare',      name: 'Flesh Tithe',         type: 'unit',  cost: 4, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'When summoned, you may sacrifice a friendly unit. If you do, this unit gains +2/+2.', image: 'fleshtithe.webp' },
  dreadshade:      { id: 'dreadshade', rarity: 'common',      name: 'Dread Shade',         type: 'unit',  cost: 5, atk: 5, hp: 4, spd: 1, unitType: [UNIT_TYPES.WRAITH], attribute: 'dark',    rules: 'Hidden|On reveal: this unit gains +2 ATK this turn.', hidden: true, image: 'dreadshade.webp' },
  curseflayer:     { id: 'curseflayer', rarity: 'common',     name: 'Curse Flayer',        type: 'unit',  cost: 2, atk: 2, hp: 1, spd: 1, unitType: [UNIT_TYPES.DEMON],  attribute: 'dark',    rules: 'Hidden|On reveal: the tile this unit is revealed on becomes Cursed Ground.', hidden: true, image: 'curseflayer.webp' },
  gravecaller:     { id: 'gravecaller', rarity: 'rare',     name: 'Gravecaller',         type: 'unit',  cost: 5, atk: 4, hp: 4, spd: 1, unitType: [UNIT_TYPES.WRAITH], attribute: 'dark',    rules: 'Hidden|On reveal: return a random unit from your Grave to your hand.', hidden: true, image: 'gravecaller.webp' },
  gravefedhorror:  { id: 'gravefedhorror', rarity: 'rare',  name: 'Gravefed Horror',     type: 'unit',  cost: 5, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',    rules: 'Hidden|On reveal: gain +1/+1 for each unit in your grave.', hidden: true, image: 'gravefedhorror.webp' },
  inkdrinker:      { id: 'inkdrinker', rarity: 'rare',      name: 'Ink Drinker',         type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: [UNIT_TYPES.DEMON],  attribute: 'dark',    rules: 'Whenever you discard a card, draw a card.', triggers: [{ event: 'onCardDiscarded', effect: 'drawOneCard', selfTrigger: false }], image: 'inkdrinker.webp' },
  zmore:           { id: 'zmore', rarity: 'legendary',           name: 'Zmore, Sleeping Ash', type: 'unit',  cost: 6, atk: 4, hp: 6, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'At the end of your turn, deal 1 damage to all other units.', legendary: true, image: 'zmore.webp' },
  voidtitan:       { id: 'voidtitan', rarity: 'common',       name: 'Void Titan',          type: 'unit',  cost: 6, atk: 6, hp: 6, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: '', image: 'voidtitan.webp' },
  gorethirstfiend: { id: 'gorethirstfiend', rarity: 'rare', name: 'Gorethirst Fiend',     type: 'unit',  cost: 3, atk: 2, hp: 3, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',    rules: 'Whenever you deal damage to the enemy champion, deal 2 damage to a random enemy unit.', triggers: [{ event: 'onChampionDamageDealt', effect: 'dealTwoToRandomEnemyUnit', preventRetrigger: true }], image: 'gorethirstfiend.webp' },
  hexbloodwarlock: { id: 'hexbloodwarlock', rarity: 'rare', name: 'Hexblood Warlock',     type: 'unit',  cost: 3, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.DEMON, UNIT_TYPES.WIZARD], attribute: 'dark',    rules: 'Whenever you play a card, deal 1 damage to the enemy champion.', triggers: [{ event: 'onCardPlayed', effect: 'dealOneToEnemyChampion', selfTrigger: false }], image: 'hexbloodwarlock.webp' },

  // Mystic/Dark bridge units (Batch 2)
  duskbloomtender:  { id: 'duskbloomtender', rarity: 'rare',  name: 'Duskbloom Tender',  type: 'unit',  cost: 3, atk: 3, hp: 2, spd: 2, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic', rules: 'Whenever a friendly unit dies, this unit gains +1 HP.', triggers: [{ event: 'onFriendlyUnitDeath', effect: 'gainPlusOneHP', selfTrigger: false }], image: 'duskbloomtender.webp' },
  oathrootkeeper:   { id: 'oathrootkeeper', rarity: 'rare',   name: 'Oathroot Keeper',   type: 'unit',  cost: 3, atk: 1, hp: 4, spd: 1, unitType: [UNIT_TYPES.ELF],   attribute: 'mystic', rules: 'At the end of your turn, if you control 4 or more units, restore 1 HP to each friendly unit.', triggers: [{ event: 'onEndTurn', effect: 'restoreOneHPToAllFriendly', condition: { type: 'minFriendlyUnits', count: 4 } }], image: 'oathrootkeeper.webp' },

  // Light/Mystic bridge units (Batch 2)
  runebladesentinel: { id: 'runebladesentinel', rarity: 'rare', name: 'Runeblade Sentinel', type: 'unit', cost: 3, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN], attribute: 'light', rules: '+3/+3 while you have 5 or more cards in hand.', modifier: { type: 'conditionalStatBuff', stat: 'atkAndHp', amount: 3, condition: { type: 'minCardsInHand', count: 5 } }, image: 'runebladesentinel.webp' },

  // Light/Primal and Enemy Pair Bridge Cards (Batch 3)
  siegeclawwarchief:  { id: 'siegeclawwarchief', rarity: 'rare',  name: 'Siegeclaw Warchief',  type: 'unit', cost: 3, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEASTKIN], attribute: 'primal',  rules: 'Friendly units within 2 tiles of the enemy champion have +1 SPD.', modifier: [{ type: 'zoneSpdBuff', anchor: 'enemyChampion', range: 2, amount: 1 }], image: 'siegeclawwarchief.webp' },
  vanguardtaskmaster: { id: 'vanguardtaskmaster', rarity: 'rare', name: 'Vanguard Taskmaster', type: 'unit', cost: 3, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.HUMAN],  attribute: 'light',   rules: 'Whenever another friendly unit uses a command, it gains +1 HP.', triggers: [{ event: 'onFriendlyCommand', effect: 'gainPlusOneHPOnCommand' }], image: 'vanguardtaskmaster.webp' },
  lifedrinkerstag:    { id: 'lifedrinkerstag', rarity: 'rare',    name: 'Lifedrinker Stag',    type: 'unit', cost: 4, atk: 3, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEAST],  attribute: 'primal',  rules: 'Whenever you restore HP, restore double that amount instead.', modifier: [{ type: 'restoreHPMultiplier', multiplier: 2 }], image: 'lifedrinkerstag.webp' },

  // Enemy Pair Bridge Cards (Batch 4)
  spitechanneler:    { id: 'spitechanneler', rarity: 'rare',    name: 'Spite Channeler',    type: 'unit', cost: 4, atk: 3, hp: 3, spd: 1, unitType: [UNIT_TYPES.WIZARD],   attribute: 'mystic', rules: 'Whenever you deal non-combat damage to the enemy champion, deal 1 additional damage.', triggers: [{ event: 'onNonCombatChampionDamage', effect: 'plusOneNonCombatChampionDamage', preventRetrigger: true }], image: 'spitechanneler.webp' },
  forbiddenchaplain: { id: 'forbiddenchaplain', rarity: 'rare', name: 'Forbidden Chaplain', type: 'unit', cost: 4, atk: 1, hp: 1, spd: 1, unitType: [UNIT_TYPES.WIZARD], attribute: 'light',  rules: 'The first time you sacrifice a friendly unit each turn, return that unit to play.', triggers: [{ event: 'onFriendlySacrifice', effect: 'returnSacrificedUnit', oncePerTurn: true }], image: 'forbiddenchaplain.webp' },
  exiledguardian:    { id: 'exiledguardian', rarity: 'rare',    name: 'Exiled Guardian',    type: 'unit', cost: 4, atk: 4, hp: 4, spd: 1, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',   rules: 'Friendly Aura effects have +1 range.', modifier: [{ type: 'auraRangeBuff', amount: 1 }], image: 'exiledguardian.webp' },

  // Batch 5: Legendaries Part 1
  vornthundercaller: { id: 'vornthundercaller', rarity: 'legendary', name: 'Vorn, Thundercaller', type: 'unit', cost: 4, atk: 2, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEASTKIN],  attribute: 'primal',  rules: 'Action: Choose a direction. Deal 2 damage to every unit and champion in that direction.', action: true, legendary: true, image: 'vorn.webp' },
  azulonsilvertide:  { id: 'azulonsilvertide', rarity: 'legendary',  name: 'Azulon, Silver Tide', type: 'unit', cost: 7, atk: 5, hp: 6, spd: 2, unitType: [UNIT_TYPES.DRAGON],    attribute: 'mystic',  rules: 'Flying|Action: The next spell you cast this turn casts twice.', flying: true, action: true, legendary: true, image: 'azulon.webp' },
  // TEMP: Clockwork Manimus removed pending trigger resolution system fix (LOG-1152)
  // clockworkmanimus:  { id: 'clockworkmanimus', rarity: 'common',  name: 'Clockwork Manimus',   type: 'unit', cost: 5, atk: 5, hp: 5, spd: 1, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: 'At the end of your turn, discard a card or destroy this unit.|Action: Deal 2 damage to target unit.', action: true, legendary: true, triggers: [{ event: 'onEndTurn', effect: 'discardOrDie', oncePerTurn: true }], image: 'clockworkmanimus.webp' },

  // Batch 6: Legendaries Part 2
  vexishollowking:   { id: 'vexishollowking', rarity: 'legendary',   name: 'Vexis, the Hollow King', type: 'unit', cost: 7, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.SHADOW], attribute: 'dark',  rules: 'The first time an enemy unit dies each turn, summon a 1/1 shadow copy in an adjacent tile.', legendary: true, triggers: [{ event: 'onEnemyUnitDeath', effect: 'summonShadowCopy', oncePerTurn: true }], image: 'vexis.webp' },
  lucernunbrokenvow: { id: 'lucernunbrokenvow', rarity: 'legendary', name: 'Lucern, Unbroken Vow',    type: 'unit', cost: 5, atk: 3, hp: 3, spd: 2, unitType: [UNIT_TYPES.SPIRIT], attribute: 'light', rules: 'When this unit dies on the Throne tile, resummon it at the end of your turn in your champion\'s starting tile. Retains all permanent stat changes.', legendary: true, image: 'lucern.webp' },

  // Batch 8: Legendaries Part 4
  nezzartermsandconditions: { id: 'nezzartermsandconditions', rarity: 'legendary', name: 'Nezzar, Terms and Conditions', type: 'unit', cost: 4, atk: 1, hp: 3, spd: 0, unitType: [UNIT_TYPES.DEMON], attribute: 'dark', rules: 'At the beginning of your turn, choose a deadly contract.', legendary: true, image: 'nezzar.webp' },

  // Batch 7: Legendaries Part 3
  korraksecondang:   { id: 'korraksecondang', rarity: 'legendary',   name: 'Korrak, Second Fang',   type: 'unit', cost: 5, atk: 3, hp: 2, spd: 1, unitType: [UNIT_TYPES.BEASTKIN], attribute: 'primal', rules: 'While your champion is within 2 tiles, your champion has +3 ATK and +1 SPD.', legendary: true, modifier: [{ type: 'championAtkBuff', range: 2, amount: 3 }, { type: 'championSpdBuff', range: 2, amount: 1 }], image: 'korrak.webp' },
  fennwickthequiet:  { id: 'fennwickthequiet', rarity: 'legendary',  name: 'Fennwick, the Quiet',   type: 'unit', cost: 2, atk: 1, hp: 2, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.WIZARD],   attribute: 'mystic', rules: 'Your spells cost 1 less, minimum 1. Action: Look at the top card of your deck.', legendary: true, action: true, modifier: [{ type: 'spellCostReduction', amount: 1 }], image: 'fennwick.webp' },
  gavrielholystride: { id: 'gavrielholystride', rarity: 'legendary', name: 'Gavriel, Holy Stride',  type: 'unit', cost: 4, atk: 3, hp: 4, spd: 1, unitType: [UNIT_TYPES.HUMAN, UNIT_TYPES.PALADIN], attribute: 'light',  rules: 'Cannot be targeted by spells. |When this unit moves into a tile, that tile becomes Hallowed Ground.', legendary: true, spellImmune: true, image: 'gavriel.webp' },

  // Demon omens and dark spells (Batch 17)
  dreadmirror:     { id: 'dreadmirror', rarity: 'rare',     name: 'Dread Mirror',        type: 'omen',  cost: 4, atk: 0, spd: 0, turnsRemaining: 2, isOmen: true, hidden: true, unitType: [UNIT_TYPES.DEMON], attribute: 'dark', rules: 'Hidden On reveal: Deal damage to the revealing unit equal to its ATK. Whenever an enemy unit dies, restore 1 HP to your champion.', image: 'dreadmirror.webp' },
  fatesledger:     { id: 'fatesledger', rarity: 'rare',     name: "Fate's Ledger",       type: 'spell', cost: 5, effect: 'fatesledger',     unitType: [UNIT_TYPES.DEMON], attribute: 'dark', rules: 'You may play cards from your grave this turn.', image: 'fatesledger.webp' },
  tollofshadows:   { id: 'tollofshadows', rarity: 'rare',   name: 'Toll of Shadows',     type: 'spell', cost: 6, effect: 'tollofshadows',   unitType: [UNIT_TYPES.DEMON], attribute: 'dark', rules: 'Each player sacrifices a unit, an omen, a relic, and discards a card.', image: 'tollofshadows.webp' },

  // Demon spells
  bloodoffering:   { id: 'bloodoffering', rarity: 'rare',   name: 'Blood Offering',      type: 'spell', cost: 2, effect: 'bloodoffering',   unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Destroy a friendly unit. Deal damage equal to its current ATK to any enemy unit.', image: 'bloodoffering.webp' },
  pactofruin:      { id: 'pactofruin', rarity: 'common',      name: 'Pact of Ruin',        type: 'spell', cost: 1, effect: 'pactofruin',      unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Discard a card to deal 3 damage to any enemy unit.', image: 'pactofruin.webp' },
  darksentence:    { id: 'darksentence', rarity: 'rare',    name: 'Dark Sentence',       type: 'spell', cost: 5, effect: 'darksentence',    unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Destroy an enemy unit.', image: 'darksentence.webp' },
  devour:          { id: 'devour', rarity: 'common',          name: 'Devour',              type: 'spell', cost: 3, effect: 'devour',          unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Destroy an enemy unit with 2 or less HP.', image: 'devour.webp' },
  infernalpact:    { id: 'infernalpact', rarity: 'common',    name: 'Infernal Pact',       type: 'spell', cost: 3, effect: 'infernalpact',    unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Deal 3 damage to your champion. All friendly units gain +2 ATK this turn.', image: 'infernalpact.webp' },
  shadowveil:      { id: 'shadowveil', rarity: 'common',      name: 'Shadow Veil',         type: 'spell', cost: 1, effect: 'shadowveil',      unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'The next unit you play this turn is summoned with Hidden', image: 'shadowveil.webp' },
  souldrain:       { id: 'souldrain', rarity: 'common',       name: 'Soul Drain',          type: 'spell', cost: 3, effect: 'souldrain',       unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Deal 2 damage to an enemy unit. Restore HP to your champion equal to the damage dealt.', image: 'souldrain.webp' },
  agonizingsymphony: { id: 'agonizingsymphony', rarity: 'rare', name: 'Agonizing Symphony', type: 'spell', cost: 3, effect: 'agonizingsymphony', unitType: [UNIT_TYPES.DEMON],attribute: 'dark',  rules: "Skip your champion's action this turn. Your opponent discards 2 cards at random.", image: 'agonizingsymphany.webp' },
  pestilence:      { id: 'pestilence', rarity: 'rare',      name: 'Pestilence',          type: 'spell', cost: 3, effect: 'pestilence',      unitType: [UNIT_TYPES.DEMON],attribute: 'dark',    rules: 'Enemy units within 2 tiles of your champion have -2/-2 this turn.', image: 'pestilence.webp' },

  // ── Relics ─────────────────────────────────────────────────────────────────
  // Relics are non-combat board entities: ATK 0, SPD 0, isRelic: true.
  // They cannot move or attack. Combat units can move into their tile to attack them.
  // The relic takes damage equal to the attacker's ATK and deals 0 damage back.
  // Relics can be targeted by spells. They can have passive/aura/action effects.

  soulstone:   { id: 'soulstone', rarity: 'rare',   name: 'Soulstone',         type: 'relic', cost: 4, atk: 0, hp: 5, spd: 0, isRelic: true, unitType: [UNIT_TYPES.HUMAN], attribute: 'light', rules: 'When a friendly unit dies, destroy this Relic and summon that unit in this tile.', image: 'soulstone.webp' },
  bloodaltar:  { id: 'bloodaltar', rarity: 'rare',  name: 'Blood Altar',       type: 'relic', cost: 3, atk: 0, hp: 1, spd: 0, isRelic: true, unitType: [UNIT_TYPES.DEMON], attribute: 'dark',  rules: 'Action: sacrifice an adjacent friendly unit. Draw 1 card.', action: true, image: 'bloodaltar.webp' },
  echostone:        { id: 'echostone', rarity: 'common',        name: 'Echo Stone',        type: 'relic', cost: 3, atk: 0, hp: 3, spd: 0, isRelic: true, unitType: [],                 attribute: 'neutral', rules: 'At the end of your turn, restore 1 HP to your champion.', image: 'echostone.webp' },
  siegemound:       { id: 'siegemound', rarity: 'rare',       name: 'Siege Mound',       type: 'relic', cost: 3, atk: 0, hp: 3, spd: 0, isRelic: true, unitType: [UNIT_TYPES.BEAST], attribute: 'primal', rules: 'Action: Deal 2 damage to the enemy champion.', action: true, image: 'siegemound.webp' },
  wardrum:          { id: 'wardrum', rarity: 'rare',          name: 'War Drum',          type: 'relic', cost: 3, atk: 0, hp: 3, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: 'At the start of your turn, the friendly unit with the lowest ATK gains +1 ATK this turn. Random if tied.', image: 'wardrum.webp' },
  manacannon:       { id: 'manacannon', rarity: 'rare',       name: 'Mana Cannon',       type: 'relic', cost: 2, atk: 0, hp: 2, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: 'Action ⓵: Deal 1 damage to the first unit in the chosen direction, friendly or enemy.', action: true, image: 'manacannon.webp' },
  negationcrystal:  { id: 'negationcrystal', rarity: 'rare',  name: 'Negation Crystal',  type: 'relic', cost: 2, atk: 0, hp: 1, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: 'When an enemy unit uses its Action ability, automatically destroy this Relic to cancel that ability.', triggers: [{ event: 'onEnemyAction', effect: 'negationcrystal_cancel' }], image: 'negationcrystal.webp' },
  arcanelens:       { id: 'arcanelens', rarity: 'rare',       name: 'Arcane Lens',       type: 'relic', cost: 2, atk: 0, hp: 2, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: 'Action: Look at the top 3 cards of your deck. Put one on top and shuffle the rest back.', action: true, image: 'arcanelens.webp' },
  darkirongate:     { id: 'darkirongate', rarity: 'common',     name: 'Darkiron Gate',     type: 'relic', cost: 3, atk: 0, hp: 6, spd: 0, isRelic: true, unitType: [], attribute: 'neutral', rules: null, image: 'darkirongate.webp' },
  tanglerootypew:   { id: 'tanglerootypew', rarity: 'rare',   name: 'Tangleroot Yew',    type: 'relic', cost: 2, atk: 0, hp: 3, spd: 0, isRelic: true, unitType: [UNIT_TYPES.ELF], attribute: 'mystic', rules: 'Action: Adjacent enemy units become Rooted.', action: true, image: 'tanglerootyew.webp' },
  dustwall:         { id: 'dustwall', rarity: 'common',         name: 'Dustball',          type: 'unit',  cost: 1, atk: 0, hp: 3, spd: 1, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: '', image: 'dustwall.webp' },
  coldsteeldrifter: { id: 'coldsteeldrifter', rarity: 'common', name: 'Coldsteel Drifter', type: 'unit',  cost: 2, atk: 2, hp: 2, spd: 2, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: null, image: 'coldsteeldrifter.webp' },
  stoneguard:       { id: 'stoneguard', rarity: 'common',       name: 'Stoneguard',        type: 'unit',  cost: 3, atk: 2, hp: 4, spd: 1, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: 'Cannot be targeted by spells.', cannotBeTargetedBySpells: true, image: 'stoneguard.webp' },
  wanderingconstruct: { id: 'wanderingconstruct', rarity: 'common', name: 'Wandering Construct', type: 'unit', cost: 4, atk: 4, hp: 4, spd: 1, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: null, image: 'wanderingconstruct.webp' },
  ironqueen:        { id: 'ironqueen', rarity: 'legendary',        name: 'The Iron Queen',    type: 'unit',  cost: 6, atk: 6, hp: 6, spd: 1, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: 'Action: Choose a direction. This unit moves to the furthest empty tile in that direction.|This unit may take 2 actions per turn.', action: true, legendary: true, image: 'ironqueen.webp' },
  grindgearcolossus: { id: 'grindgearcolossus', rarity: 'common', name: 'Grindgear Colossus', type: 'unit', cost: 8, atk: 8, hp: 8, spd: 1, unitType: [UNIT_TYPES.CONSTRUCT], attribute: 'neutral', rules: "This unit's actions cost 2 commands.", doubleCommandCost: true, image: 'grindgearcolossus.webp' },

  // Elf spells (Batch 16)
  temporalrift: { id: 'temporalrift', rarity: 'rare', name: 'Temporal Rift',  type: 'omen',  cost: 6, atk: 0, spd: 0, turnsRemaining: 3, isOmen: true, unitType: [UNIT_TYPES.ELF], attribute: 'mystic', rules: 'You have an extra command each turn.', modifier: [{ type: 'commandBonus', amount: 1 }], triggers: [{ event: 'onBeginTurn', effect: 'temporalrift_log' }], image: 'temporalrift.webp' },
  mindseize:    { id: 'mindseize', rarity: 'rare',    name: 'Mind Seize',     type: 'spell', cost: 7, effect: 'mindseize',    unitType: [UNIT_TYPES.ELF], attribute: 'mystic', rules: "Skip your champion's action. Gain control of target enemy unit adjacent to your champion.", image: 'mindseize.webp' },

  // ── Omens ──────────────────────────────────────────────────────────────────
  // Omens are temporary non-combat board entities: ATK 0, SPD 0, no HP, isOmen: true.
  // They expire after turnsRemaining turns (decremented at end of the owner's turn).
  // Any enemy unit that moves onto an omen tile destroys it instantly — no combat.
  // Omens cannot be targeted by spells. They can have passive/aura/begin-of-turn/end-of-turn effects.

  battlestandard: { id: 'battlestandard', rarity: 'common', name: 'Battle Standard', type: 'omen', cost: 2, atk: 0, spd: 0, turnsRemaining: 3, isOmen: true, unitType: [], attribute: 'light',   rules: 'Friendly units summoned adjacent to this omen gain +1/+1 permanently.', image: 'battlestandard.webp' },
  smokebomb:      { id: 'smokebomb', rarity: 'common',      name: 'Smoke Bomb',      type: 'omen', cost: 2, atk: 0, spd: 0, turnsRemaining: 2, isOmen: true, unitType: [], attribute: 'dark',    rules: 'Friendly units within 2 tiles become hidden. Any friendly unit summoned within 2 tiles gains Hidden', image: 'smokebomb.webp' },
  manawell:       { id: 'manawell', rarity: 'common',       name: 'Mana Well',       type: 'omen', cost: 3, atk: 0, spd: 0, turnsRemaining: 4, isOmen: true, unitType: [], attribute: 'mystic',  rules: 'At the start of your turn, gain 1 temporary mana this turn.', image: 'manawell.webp' },
  feralsurge:     { id: 'feralsurge', rarity: 'common',     name: 'Feral Surge',     type: 'omen', cost: 2, atk: 0, spd: 0, turnsRemaining: 3, isOmen: true, unitType: [], attribute: 'primal',  rules: 'Friendly units summoned adjacent to this omen gain Rush', image: 'feralsurge.webp' },
  bloodmoon:      { id: 'bloodmoon', rarity: 'rare',      name: 'Bloodmoon',       type: 'omen', cost: 4, atk: 0, spd: 0, turnsRemaining: 3, isOmen: true, unitType: [], attribute: 'primal',  rules: 'At the beginning of your turn, friendly units gain ATK equal to the number of time counters remaining on this omen.', triggers: [{ event: 'onBeginTurn', effect: 'bloodmoonBuff' }], image: 'bloodmoon.webp' },

  // ── Terrain Spells ─────────────────────────────────────────────────────────
  // Terrain cards (type: 'terrain', isTerrain: true) modify tiles on the board.
  // terrainRadius 0 = target tile only, 1 = target + adjacent tiles, 2 = all tiles within Manhattan 2.
  // Cannot be placed on champion start tiles (0,0) and (4,4), or the Throne tile (2,2).
  // Terrain persists until replaced. Both players can see all terrain at all times.

  hallowed_ground: { id: 'hallowed_ground', rarity: 'common', name: 'Hallowed Ground', type: 'terrain', isTerrain: true, cost: 3, terrainRadius: 2, unitType: [], attribute: 'light',  rules: 'Light units within this terrain area have +1/+1.', terrainEffect: { id: 'hallowed', rarity: 'common', whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'light', combatOnly: true } }, image: 'hallowedground.webp' },
  scorched_earth:  { id: 'scorched_earth', rarity: 'common',  name: 'Scorched Earth',  type: 'terrain', isTerrain: true, cost: 4, terrainRadius: 2, unitType: [], attribute: 'primal', rules: 'Any unit that moves onto a tile in this terrain area takes 1 damage.', terrainEffect: { id: 'scorched', rarity: 'common', onOccupy: { damage: 1 } }, image: 'scorchedearth.webp' },
  enchanted_ground:{ id: 'enchanted_ground', rarity: 'common',name: 'Enchanted Ground', type: 'terrain', isTerrain: true, cost: 3, terrainRadius: 2, unitType: [], attribute: 'mystic', rules: 'Mystic units within this terrain area have +1/+1.', terrainEffect: { id: 'enchanted', rarity: 'common', whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'mystic', combatOnly: true } }, image: 'enchantedground.webp' },
  cursed_ground:   { id: 'cursed_ground', rarity: 'common',   name: 'Cursed Ground',   type: 'terrain', isTerrain: true, cost: 3, terrainRadius: 2, unitType: [], attribute: 'dark',   rules: 'Dark units within this terrain area have +1/+1.', terrainEffect: { id: 'cursed', rarity: 'common', whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'dark', combatOnly: true } }, image: 'cursedground.webp' },
  huntingground:   { id: 'huntingground', rarity: 'common',   name: 'Hunting Ground',  type: 'terrain', isTerrain: true, cost: 3, terrainRadius: 2, unitType: [], attribute: 'primal',  rules: 'Primal units within this terrain area have +1/+1.', terrainEffect: { id: 'huntingground', rarity: 'common', name: 'Hunting Ground', description: 'Primal units within this terrain area have +1/+1.', whileOccupied: { atkBuff: 1, hpBuff: 1, attributeOnly: 'primal', combatOnly: true } }, image: 'huntingground.webp' },
};

// ── Token Definitions ──────────────────────────────────────────────────────

export const TOKENS = {
  sapling: {
    id: 'token_sapling', rarity: 'common',
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
  'crusade',
  'martiallaw',
  'hallowed_ground',
  'battlestandard',
  'soulstone',
  // 'clockworkmanimus', // TEMP: removed pending trigger resolution system fix (LOG-1152)
  'shieldwall',         // replacement card to restore 30-card count
  'lucernunbrokenvow',
  'gavrielholystride',
];

const BEAST_DECK = [
  'boar',
  'swiftpaw',
  'wolf', 'wolf',
  'razorclaw',
  'wildborne',
  'pip',
  'eagerbeaver',
  'stalker',
  'packrunner',
  'rockhorn', 'rockhorn',
  'plaguehog',
  'sabretooth', 'sabretooth',
  'razorfang',
  'crushingblow',
  'ambush',
  'packhowl',
  'pounce',
  'predatorsmark',
  'savagegrowth',
  'callofthesnakes',
  'siegemound', 'siegemound',
  'feralsurge', 'feralsurge',
  'bloodmoon',
  'vornthundercaller',
  'korraksecondang',
];

const ELF_DECK = [
  'elfscout',
  'seedling',
  'woodlandguard',
  'sylvancourier',
  'whisper', 'whisper',
  'verdantarcher',
  'elfelder',
  'thornweave',
  'elfranger',
  'grovewarden',
  'moonveilmystic',
  'elfarcher',
  'sistersiofra',
  'yggara',
  'glimpse',
  'petrify',
  'arcanelens',
  'moonleaf',
  'overgrowth',
  'bloom',
  'ancientspring',
  'verdantsurge',
  'enchanted_ground',
  'manawell',
  'tanglerootypew',
  'azulonsilvertide',
  'fennwickthequiet',
  'canopysentinel',
  'cascadesage',
  // stormcrestdrake, lifebinder, rootsongcommander removed to restore 30-card count
  // (they were added in feat: add Stormcrest Drake, Lifebinder, Rootsong Commander
  //  without removing 3 existing cards — game designers should decide replacements)
];

const DEMON_DECK = [
  'imp', 'imp',
  'darkdealer',
  'dreadknight',
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
  'agonizingsymphony',
  'pestilence',
  'echostone',
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
    id: 'human', rarity: 'common',
    name: 'Light',
    color: '#F0E6D2',
    description: 'Disciplined warriors who grow stronger in formation. Master the art of positioning to unlock powerful Aura bonuses.',
    mechanic: 'Aura',
  },
  beast: {
    id: 'beast', rarity: 'common',
    name: 'Primal',
    color: '#22C55E',
    description: 'Primal hunters who strike before the enemy can react. Flood the board fast and overwhelm with speed and numbers.',
    mechanic: 'Rush',
  },
  elf: {
    id: 'elf', rarity: 'common',
    name: 'Mystic',
    color: '#A855F7',
    description: 'Ancient healers who refuse to fall. Restore your champion and outlast every threat the opponent can throw at you.',
    mechanic: 'Restore HP',
  },
  demon: {
    id: 'demon', rarity: 'common',
    name: 'Dark',
    color: '#EF4444',
    description: 'Dangerous and unpredictable. Hidden units lurk unseen while self-damage effects fuel overwhelming power.',
    mechanic: 'Hidden',
  },
};

// ── Deck builder ──────────────────────────────────────────────────────────

/**
 * Parse a deck spec from a JSON-encoded string (used in multiplayer to transmit
 * custom deck data through Supabase without a schema change).
 * Returns the spec object if deckId is a JSON custom deck spec, otherwise null.
 */
export function parseDeckSpec(deckId) {
  if (typeof deckId === 'string' && deckId.startsWith('{')) {
    try {
      const spec = JSON.parse(deckId);
      if (spec.type === 'custom' && Array.isArray(spec.cards)) return spec;
    } catch {}
  }
  return null;
}

export function buildDeck(deckId = 'human') {
  // Handle JSON-encoded custom deck spec (multiplayer cross-device deck passing)
  const spec = parseDeckSpec(deckId);
  if (spec) {
    const cards = spec.cards.map(id => ({
      ...CARD_DB[id],
      uid: `${id}_${Math.random().toString(36).slice(2)}`,
    })).filter(c => c.id);
    console.log('[buildDeck] deck spec (multiplayer custom):', spec.deckName, `${cards.length} cards`);
    return cards;
  }

  if (deckId === 'custom') {
    const saved = JSON.parse(localStorage.getItem('gridholm_custom_deck') || 'null');
    console.log('[buildDeck] deckId=custom | localStorage gridholm_custom_deck:', saved ? `found (${saved.cards?.length ?? 0} cards)` : 'null');
    if (saved && Array.isArray(saved.cards) && saved.cards.length > 0) {
      const cards = saved.cards.map(id => ({
        ...CARD_DB[id],
        uid: `${id}_${Math.random().toString(36).slice(2)}`,
      })).filter(c => c.id);
      const legendaries = cards.filter(c => c.legendary).map(c => c.name);
      console.log('[buildDeck] custom deck card IDs:', saved.cards);
      console.log('[buildDeck] custom deck card names:', cards.map(c => c.name));
      console.log('[buildDeck] custom deck legendaries:', legendaries.length ? legendaries : '(none)');
      return cards;
    }
  }
  const deck = DECKS[deckId] ?? DECKS.human;
  const resolvedDeckId = DECKS[deckId] ? deckId : 'human';
  const cards = deck.cards.map(id => ({
    ...CARD_DB[id],
    uid: `${id}_${Math.random().toString(36).slice(2)}`,
  }));
  const legendaries = cards.filter(c => c.legendary).map(c => c.name);
  console.log(`[buildDeck] requested deckId="${deckId}" → resolved="${resolvedDeckId}" | card IDs:`, deck.cards);
  console.log(`[buildDeck] card names:`, cards.map(c => c.name));
  console.log(`[buildDeck] legendaries:`, legendaries.length ? legendaries : '(none)');
  return cards;
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
