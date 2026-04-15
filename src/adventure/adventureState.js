import { generateDungeon } from './dungeonGenerator.js';

const STORAGE_KEY = 'gridholm_adventure_run';

// Starting decks (20 cards) per faction
const FACTION_STARTER_DECKS = {
  light: [
    'militia', 'militia',
    'footsoldier',
    'squire',
    'crossbowman',
    'shieldwall',
    'sergeant',
    'knight',
    'standardbearer',
    'sentinel',
    'warlord',
    'battlepriestunit',
    'paladin',
    'captain',
    'smite', 'smite',
    'ironshield',
    'forgeweapon',
    'crusade',
    'standfirm',
  ],
  primal: [
    'boar',
    'swiftpaw',
    'wolf', 'wolf',
    'razorclaw',
    'wildborne',
    'tuskling',
    'eagerbeaver',
    'stalker',
    'packrunner',
    'rockhorn', 'rockhorn',
    'plaguehog',
    'sabretooth',
    'ambush',
    'packhowl',
    'pounce',
    'savagegrowth',
    'animus',
    'gore',
  ],
  mystic: [
    'elfscout',
    'seedling',
    'woodlandguard',
    'sylvancourier',
    'whisper', 'whisper',
    'verdantarcher',
    'elfelder',
    'thornweave',
    'elfranger',
    'elfarcher',
    'canopysentinel',
    'cascadesage',
    'glimpse',
    'moonleaf',
    'bloom',
    'ancientspring',
    'overgrowth',
    'petrify',
    'recall',
  ],
  dark: [
    'imp', 'imp',
    'spiteling',
    'dreadknight',
    'chaospawn',
    'hellhound',
    'brutedemon',
    'shadowstalker', 'shadowstalker',
    'shadowfiend', 'shadowfiend',
    'veilfiend',
    'dreadshade', 'dreadshade',
    'agonizingsymphony',
    'pestilence',
    'bloodoffering',
    'pactofruin',
    'devour',
    'souldrain',
  ],
};

/**
 * Create a fresh adventure run for the given champion faction.
 * @param {string} championFaction - 'light' | 'primal' | 'mystic' | 'dark'
 * @returns {Object} initial run state
 */
export function createNewRun(championFaction) {
  const seed = Math.floor(Math.random() * 2 ** 32);
  const dungeonLayout = generateDungeon(seed);

  // Find start tile
  let startTile = null;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (dungeonLayout[r][c].type === 'start') {
        startTile = { row: r, col: c };
        break;
      }
    }
    if (startTile) break;
  }

  // Reveal start tile and adjacent tiles
  const revealedTiles = _revealAround(startTile.row, startTile.col, []);

  const deck = [...(FACTION_STARTER_DECKS[championFaction] ?? FACTION_STARTER_DECKS.light)];

  return {
    seed,
    championFaction,
    deck,
    blessings: [],
    curses: [],
    gold: 0,
    potions: 0,
    championHP: 15,
    maxChampionHP: 15,
    currentTile: startTile,
    revealedTiles,
    completedTiles: [startTile],
    dungeonLayout,
    fightHistory: [],
    bossDefeated: false,
    loopCount: 0,
    roomsCleared: 0,
  };
}

/**
 * Move the player to a tile and reveal adjacent tiles.
 * @param {Object} state
 * @param {number} row
 * @param {number} col
 * @returns {Object} new state
 */
export function moveToTile(state, row, col) {
  const newRevealedTiles = _revealAround(row, col, state.revealedTiles);
  const newState = {
    ...state,
    currentTile: { row, col },
    revealedTiles: newRevealedTiles,
  };
  return saveRun(newState), newState;
}

/**
 * Apply a reward to the run state.
 * @param {Object} state
 * @param {Object} reward - { type: 'card'|'gold'|'potion'|'hp'|'blessing'|'curse'|'maxhp', value }
 * @returns {Object} new state
 */
export function applyReward(state, reward) {
  let newState = { ...state };

  switch (reward.type) {
    case 'card':
      newState = { ...newState, deck: [...newState.deck, reward.value] };
      break;
    case 'gold':
      newState = { ...newState, gold: newState.gold + reward.value };
      break;
    case 'potion':
      newState = { ...newState, potions: Math.min(3, newState.potions + 1) };
      break;
    case 'hp':
      newState = { ...newState, championHP: Math.min(newState.maxChampionHP, newState.championHP + reward.value) };
      break;
    case 'maxhp':
      newState = { ...newState, maxChampionHP: newState.maxChampionHP + reward.value, championHP: newState.championHP + reward.value };
      break;
    case 'blessing':
      newState = { ...newState, blessings: [...newState.blessings, reward.value] };
      break;
    case 'curse':
      newState = { ...newState, curses: [...newState.curses, reward.value] };
      break;
    default:
      break;
  }

  saveRun(newState);
  return newState;
}

/**
 * Mark a tile as completed, record fight result if any.
 * @param {Object} state
 * @param {number} row
 * @param {number} col
 * @param {Object|null} fightResult - optional fight outcome
 * @returns {Object} new state
 */
export function completeTile(state, row, col, fightResult = null) {
  const alreadyCompleted = state.completedTiles.some(t => t.row === row && t.col === col);
  if (alreadyCompleted) return state;

  // Update dungeonLayout tile as completed
  const newLayout = state.dungeonLayout.map((r, ri) =>
    r.map((tile, ci) => (ri === row && ci === col ? { ...tile, completed: true } : tile))
  );

  const fightHistory = fightResult
    ? [...state.fightHistory, fightResult]
    : state.fightHistory;

  const isBoss = state.dungeonLayout[row]?.[col]?.type === 'boss';
  let loopCount = state.loopCount;
  let dungeonLayout = newLayout;
  let seed = state.seed;
  let revealedTiles = state.revealedTiles;
  let completedTiles = [...state.completedTiles, { row, col }];
  let bossDefeated = state.bossDefeated;

  if (isBoss) {
    loopCount = state.loopCount + 1;
    seed = (state.seed + loopCount) >>> 0;
    dungeonLayout = generateDungeon(seed);
    // Find new start tile and reveal around it
    let startTile = null;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (dungeonLayout[r][c].type === 'start') {
          startTile = { row: r, col: c };
          break;
        }
      }
      if (startTile) break;
    }
    revealedTiles = _revealAround(startTile.row, startTile.col, []);
    completedTiles = [startTile];
    bossDefeated = true;
  }

  const newState = {
    ...state,
    dungeonLayout,
    seed,
    completedTiles,
    revealedTiles,
    fightHistory,
    bossDefeated,
    loopCount,
    roomsCleared: state.roomsCleared + 1,
  };

  saveRun(newState);
  return newState;
}

/**
 * Persist run state to localStorage.
 */
export function saveRun(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[adventureState] Failed to save run:', e);
  }
  return state;
}

/**
 * Load run state from localStorage.
 * @returns {Object|null}
 */
export function loadRun() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[adventureState] Failed to load run:', e);
    return null;
  }
}

/**
 * Clear the saved run from localStorage.
 */
export function clearRun() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[adventureState] Failed to clear run:', e);
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _revealAround(row, col, existingRevealed) {
  const toReveal = [
    { row, col },
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].filter(t => t.row >= 0 && t.row < 5 && t.col >= 0 && t.col < 5);

  const result = [...existingRevealed];
  for (const tile of toReveal) {
    if (!result.some(t => t.row === tile.row && t.col === tile.col)) {
      result.push(tile);
    }
  }
  return result;
}
