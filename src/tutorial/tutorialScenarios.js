/**
 * tutorialScenarios.js
 *
 * Definitions for the 5 interactive tutorial scenarios.
 *
 * boardConfig fields:
 *   p1Champion: { row, col, hp }  — player champion (Valorian, light)
 *   p2Champion: { row, col, hp }  — enemy champion (Kragor, primal)
 *   units: [{ cardId, owner, row, col }]  — units to place on the board
 *   p1Hand: [cardId, ...]  — cards in player's hand
 *   p1Mana: number  — starting mana for player
 *   p1Commands: number  — commands available (if different from 3)
 *
 * step validAction values:
 *   'selectUnit'  — player clicks a unit on the board; validTargets = [cardId, ...]
 *   'move'        — player moves a unit to a tile; validDestinations = [[r,c], ...]
 *                   optional: validUnit = cardId (which unit must be selected)
 *   'attack'      — player moves a unit onto an enemy tile; validTargets = [cardId|'enemyChampion']
 *                   optional: validUnit = cardId
 *   'selectCard'  — player clicks a card in hand; validTargets = [cardId, ...]
 *   'summon'      — player places a unit after playing a card; validDestinations = 'champion_adjacent' | [[r,c], ...]
 *   'castSpell'   — player targets an enemy with a spell; validCard = cardId, validTargets = [cardId, ...]
 *   'championMove' — player moves the champion to a tile; validDestinations = [[r,c], ...]
 *   'endText'     — no action; just display endText and advance
 */

export const TUTORIAL_SCENARIOS = [
  {
    id: 'movement-combat',
    title: 'Movement and Combat',
    description: 'Learn how to select units, move them, and attack enemies.',
    boardConfig: {
      p1Champion: { row: 4, col: 2, hp: 20 },
      p2Champion: { row: 0, col: 2, hp: 20 },
      units: [
        { cardId: 'footsoldier', owner: 0, row: 3, col: 2 },
        { cardId: 'imp',         owner: 1, row: 1, col: 2 },
      ],
      p1Hand: [],
      p1Mana: 0,
    },
    steps: [
      {
        prompt: 'Select your Footsoldier to see where it can move.',
        validAction: 'selectUnit',
        validTargets: ['footsoldier'],
        highlightTargets: ['footsoldier'],
      },
      {
        prompt: 'Move your Footsoldier toward the enemy.',
        validAction: 'move',
        validUnit: 'footsoldier',
        validDestinations: [[2, 2], [2, 1], [2, 3]],
      },
      {
        prompt: 'Select your Footsoldier and attack the Imp.',
        validAction: 'attack',
        validUnit: 'footsoldier',
        validTargets: ['imp'],
        highlightTargets: ['imp'],
        resetMovedAfterPrev: true,
      },
      {
        endText: 'Units move in cardinal directions up to their speed. Adjacent units can attack by moving onto them. Combat damage is mutual.',
      },
    ],
  },

  {
    id: 'playing-cards',
    title: 'Playing Cards',
    description: 'Learn how to spend mana and summon units from your hand.',
    boardConfig: {
      p1Champion: { row: 4, col: 2, hp: 20 },
      p2Champion: { row: 0, col: 2, hp: 20 },
      units: [],
      p1Hand: ['militia'],
      p1Mana: 1,
    },
    steps: [
      {
        prompt: 'Select the Militia card in your hand to play it.',
        validAction: 'selectCard',
        validTargets: ['militia'],
        highlightTargets: ['militia'],
      },
      {
        prompt: 'Place your unit on a tile next to your champion.',
        validAction: 'summon',
        validDestinations: 'champion_adjacent',
      },
      {
        endText: 'Units are summoned to tiles adjacent to your champion. Each card costs mana to play. Manage your mana carefully.',
      },
    ],
  },

  {
    id: 'commands-spells',
    title: 'Commands and Spells',
    description: 'Learn about the command limit and how to cast spells.',
    boardConfig: {
      p1Champion: { row: 4, col: 2, hp: 20 },
      p2Champion: { row: 0, col: 2, hp: 20 },
      units: [
        { cardId: 'knight',     owner: 0, row: 3, col: 2 },
        { cardId: 'brutedemon', owner: 1, row: 1, col: 2 },
      ],
      p1Hand: ['smite'],
      p1Mana: 4,
    },
    steps: [
      {
        prompt: 'Move your Knight forward.',
        validAction: 'move',
        validUnit: 'knight',
        validDestinations: [[2, 2], [2, 1], [2, 3], [3, 1], [3, 3]],
        highlightTargets: ['knight'],
      },
      {
        prompt: 'Cast Smite on the enemy Infernal Spider.',
        validAction: 'castSpell',
        validCard: 'smite',
        validTargets: ['brutedemon'],
      },
      {
        prompt: 'Move your champion.',
        validAction: 'championMove',
        highlightTargets: ['champion'],
      },
      {
        endText: 'You get 3 commands each turn. Moving a unit, attacking, playing cards, and casting spells each cost 1 command. Spend them wisely.',
      },
    ],
  },

  {
    id: 'winning',
    title: 'Winning the Game',
    description: "Your opponent's champion is weakened. Move in for the kill.",
    boardConfig: {
      p1Champion: { row: 4, col: 2, hp: 20 },
      p2Champion: { row: 0, col: 2, hp: 5 },
      units: [
        { cardId: 'captain',     owner: 0, row: 2, col: 1 },
        { cardId: 'crossbowman', owner: 0, row: 1, col: 3 },
      ],
      p1Hand: [],
      p1Mana: 0,
    },
    steps: [
      {
        prompt: "Your opponent's champion is weakened. Move your Captain in.",
        validAction: 'move',
        validUnit: 'captain',
        validDestinations: [[0, 1], [1, 1], [1, 2]],
        highlightTargets: ['captain'],
      },
      {
        prompt: 'Attack the enemy champion with your Captain.',
        validAction: 'attack',
        validUnit: 'captain',
        validTargets: ['enemyChampion'],
        resetMovedAfterPrev: true,
      },
      {
        prompt: 'Finish the fight with your Crossbowman.',
        validAction: 'attack',
        validUnit: 'crossbowman',
        validTargets: ['enemyChampion'],
        resetMovedAfterPrev: true,
      },
      {
        endText: 'Reduce the enemy champion to 0 HP to win. Your units are your weapons — position them to strike.',
      },
    ],
  },

  {
    id: 'practice-round',
    title: 'Practice Round',
    description: 'Put it all together in a free match against a beginner AI.',
    freePlay: true,
    boardConfig: {
      p1Champion: { row: 4, col: 2, hp: 20 },
      p2Champion: { row: 0, col: 2, hp: 20 },
      units: [],
      // deck is built dynamically for free play — see buildTutorialState
      p1Deck: ['militia', 'militia', 'footsoldier', 'footsoldier', 'squire', 'squire', 'knight', 'knight', 'crossbowman', 'smite', 'smite', 'ironshield', 'ironshield'],
      p1Hand: [],
      p1Mana: 2,
    },
    reminderText: 'Commands: actions per turn. Summon next to your champion. Attack adjacent enemies.',
    maxTurns: 10,
    steps: [],
  },
];
