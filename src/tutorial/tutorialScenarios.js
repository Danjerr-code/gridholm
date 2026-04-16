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
 *   p2Hand: [cardId, ...]  — cards in enemy's hand (for AI-turn scenarios)
 *   p1Mana: number  — starting mana for player
 *   p2Mana: number  — starting mana for enemy (AI-turn scenarios)
 *   p1Commands: number  — commands available at start (if different from 3)
 *   p1CommandsPerTurn: number — max commands per player turn (scenario 4: 1)
 *
 * step validAction values:
 *   'selectUnit'   — player clicks a unit; validTargets = [cardId, ...]
 *   'move'         — player moves a unit; validDestinations = [[r,c], ...]
 *                    optional: validUnit = cardId (which unit must be selected)
 *   'attack'       — player attacks; validTargets = [cardId|'enemyChampion']
 *                    optional: validUnit = cardId
 *   'selectCard'   — player clicks a card in hand; validTargets = [cardId, ...]
 *   'summon'       — player places a unit; validDestinations = 'champion_adjacent' | [[r,c], ...]
 *   'castSpell'    — player casts a spell; validCard = cardId, validTargets = [cardId, ...]
 *   'championMove' — player moves the champion; validDestinations = [[r,c], ...]
 *   'endTurn'      — player clicks End Turn; triggers enemy AI turn then resumes
 *   'endText'      — no action; display endText and advance
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
        { cardId: 'knight', owner: 0, row: 3, col: 2, overrides: { spd: 1 } },
      ],
      p1Hand: [],
      p1Mana: 0,
      p2Hand: ['hellhound'],
      p2Mana: 3,
    },
    steps: [
      {
        prompt: 'Select your Knight to see where it can move.',
        validAction: 'selectUnit',
        validTargets: ['knight'],
        highlightTargets: ['knight'],
      },
      {
        prompt: 'Move your Knight forward.',
        validAction: 'move',
        validUnit: 'knight',
        validDestinations: [[2, 2]],
      },
      {
        prompt: 'Press End Turn to let the enemy respond.',
        validAction: 'endTurn',
        highlightEndTurn: true,
      },
      {
        prompt: 'Your Knight can attack the adjacent enemy. Select your Knight and attack the Hellhound.',
        validAction: 'attack',
        validUnit: 'knight',
        validTargets: ['hellhound'],
        highlightTargets: ['hellhound'],
      },
      {
        endText: 'Units move in cardinal directions up to their speed. Adjacent units can attack each other. Combat damage is mutual.',
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
        { cardId: 'knight',    owner: 0, row: 3, col: 2 },
        { cardId: 'brutedemon', owner: 1, row: 1, col: 2 },
      ],
      p1Hand: ['smite'],
      p1Mana: 4,
    },
    steps: [
      {
        prompt: 'Move your Knight forward. (Command 1 of 3)',
        validAction: 'move',
        validUnit: 'knight',
        validDestinations: [[2, 2], [2, 1], [2, 3]],
        highlightTargets: ['knight'],
      },
      {
        prompt: 'Move your champion forward to get Smite in range. (Command 2 of 3)',
        validAction: 'championMove',
        validDestinations: [[3, 2], [3, 1], [3, 3]],
        highlightTargets: ['champion'],
      },
      {
        prompt: 'Cast Smite on the Infernal Spider. (Uses mana, not a command)',
        validAction: 'castSpell',
        validCard: 'smite',
        validTargets: ['brutedemon'],
      },
      {
        endText: 'You get 3 commands each turn. Moving a unit, attacking, and using abilities use commands. Playing cards from hand costs mana, not commands.',
      },
    ],
  },

  {
    id: 'winning',
    title: 'Winning the Game',
    description: "Move your units forward and defeat the enemy champion. Reduce its HP to 0 to win.",
    guided: true,
    boardConfig: {
      p1Champion: { row: 4, col: 2, hp: 20 },
      p2Champion: { row: 0, col: 2, hp: 8 },
      units: [
        { cardId: 'captain',     owner: 0, row: 2, col: 1 },
        { cardId: 'crossbowman', owner: 0, row: 2, col: 3 },
      ],
      p1Hand: [],
      p1Mana: 0,
    },
    steps: [],
    // Guided prompts shown based on game state (handled in TutorialController)
    guidedPrompts: {
      default: 'Chase down the enemy champion. Move a unit forward.',
      advancing: 'Keep advancing toward the enemy champion.',
      adjacent: 'Attack the enemy champion!',
      done: 'LESSON COMPLETE\nYou win! Reduce the enemy champion to 0 HP to claim victory.',
    },
    maxTurns: 20,
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
      p1Deck: [
        'militia', 'militia',
        'armourer', 'armourer',
        'squire', 'squire',
        'knight', 'knight',
        'crossbowman',
        'smite', 'smite',
        'ironshield', 'ironshield',
        'captain',
        'forgeweapon',
      ],
      p2Deck: [
        'imp', 'imp', 'imp',
        'hellhound', 'hellhound',
        'brutedemon', 'brutedemon',
        'imp', 'imp',
        'militia', 'militia',
        'squire',
      ],
      p1Hand: [],
      p1Mana: 2,
    },
    reminderText: 'Commands: actions per turn. Summon next to your champion. Attack adjacent enemies. Use the Hint button if you need guidance.',
    maxTurns: 15,
    steps: [],
  },
];
