import { generateDungeon } from './dungeonGenerator.js';

const STORAGE_KEY = 'gridholm_adventure_run';
const CHAMPION_PROGRESS_KEY = 'gridholm_adventure_champion_progress';

// XP thresholds for tiers 1, 2, 3
const XP_TIERS = [50, 150, 350];

const DEFAULT_CHAMPION_PROGRESS = {
  light:  { xp: 0, tier: 0 },
  primal: { xp: 0, tier: 0 },
  mystic: { xp: 0, tier: 0 },
  dark:   { xp: 0, tier: 0 },
};

/**
 * Cards unlocked per tier for each faction in Adventure Mode.
 * Tier 0 = always available; Tier 1/2 = unlocked at that tier.
 */
export const FACTION_ADVENTURE_CARD_POOL = {
  light: {
    0: ['vanguardcharger', 'shieldmaiden', 'oathofvalor', 'wardenoflight'],
    1: ['squiresoath', 'repel', 'consecratingStrike'],
    2: ['immortalbastion', 'divinejudgment', 'eternalvigil'],
  },
  primal: {
    0: ['viper', 'denmothers', 'survivorshide', 'venomfang'],
    1: ['plagueswarm', 'scavenger', 'carrionfeeder'],
    2: ['corneredbeast', 'toxicspray', 'festeringwounds'],
  },
  mystic: {
    0: ['verdantblade', 'timewornSage', 'moonfire', 'dominate'],
    1: ['arcanecascade', 'manasurge', 'echospell'],
    2: ['reflectingpool', 'spellweaver', 'arcanebarrage'],
  },
  dark: {
    0: ['soulturech', 'cursedresilience', 'shadowmend', 'graveharvest'],
    1: ['deathsembrace', 'revenant', 'drainlife'],
    2: ['abyssalfiend', 'voidsiphon', 'undyingpact'],
  },
};

/** Return all card IDs available to a faction at its current unlock tier. */
export function getAdventureCardPool(faction) {
  const tier = getChampionTier(faction);
  const tiers = FACTION_ADVENTURE_CARD_POOL[faction] ?? {};
  const ids = [];
  for (let t = 0; t <= Math.min(tier, 2); t++) {
    ids.push(...(tiers[t] ?? []));
  }
  return ids;
}

/** Return the full cross-run progress object for all factions. */
function _loadAllProgress() {
  try {
    const raw = localStorage.getItem(CHAMPION_PROGRESS_KEY);
    if (!raw) return { ...DEFAULT_CHAMPION_PROGRESS };
    return { ...DEFAULT_CHAMPION_PROGRESS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CHAMPION_PROGRESS };
  }
}

/** Return { xp, tier } for a specific faction. */
export function getChampionProgress(faction) {
  return _loadAllProgress()[faction] ?? { xp: 0, tier: 0 };
}

/** Return the current tier number for a faction. */
export function getChampionTier(faction) {
  return getChampionProgress(faction).tier;
}

/**
 * Add XP to a faction's champion, upgrading tier if thresholds are crossed.
 * Returns { xp, tier, newTierReached } — newTierReached is the highest new tier
 * reached in this call, or null if no tier change occurred.
 */
export function addChampionXP(faction, amount) {
  try {
    const all = _loadAllProgress();
    const current = all[faction] ?? { xp: 0, tier: 0 };
    const newXP = current.xp + amount;
    let newTier = current.tier;
    let newTierReached = null;
    for (let i = current.tier; i < XP_TIERS.length; i++) {
      if (newXP >= XP_TIERS[i]) {
        newTier = i + 1;
        newTierReached = i + 1;
      }
    }
    all[faction] = { xp: newXP, tier: newTier };
    localStorage.setItem(CHAMPION_PROGRESS_KEY, JSON.stringify(all));
    return { xp: newXP, tier: newTier, newTierReached };
  } catch {
    return { xp: 0, tier: 0, newTierReached: null };
  }
}

/**
 * 12 curated common cards per faction for the adventure starting deck.
 * These are combined with 8 drafted cards to form a 20-card starting deck.
 */
export const FACTION_CURATED_CARDS = {
  light: [
    'militia', 'militia',
    'squire',
    'shieldwall',
    'knight', 'knight',
    'crossbowman',
    'smite', 'smite',
    'ironshield',
    'standfirm',
    'forgeweapon',
  ],
  primal: [
    'boar', 'boar',
    'wolf', 'wolf',
    'swiftpaw',
    'razorclaw',
    'tuskling',
    'crushingblow',
    'animus',
    'packhowl',
    'pounce',
    'gore',
  ],
  mystic: [
    'elfscout',
    'seedling',
    'woodlandguard',
    'whisper', 'whisper',
    'verdantarcher',
    'sylvancourier',
    'glimpse',
    'moonleaf',
    'bloom',
    'ancientspring',
    'glitteringgift',
  ],
  dark: [
    'imp', 'imp',
    'spiteling',
    'chaospawn',
    'hellhound',
    'dreadknight',
    'shadowstalker',
    'agonizingsymphony',
    'pestilence',
    'bloodoffering',
    'pactofruin',
    'darksentence',
  ],
};

/**
 * Create a fresh adventure run for the given champion faction.
 * @param {string} championFaction - 'light' | 'primal' | 'mystic' | 'dark'
 * @param {string[]} [startingDeck] - 20-card deck (12 curated + 8 drafted). Falls back to
 *   the curated 12 if omitted (e.g. for legacy saved runs that predate the draft flow).
 * @returns {Object} initial run state
 */
export function createNewRun(championFaction, startingDeck) {
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

  // Mark start tile as completed so it is passable after the player leaves
  dungeonLayout[startTile.row][startTile.col] = {
    ...dungeonLayout[startTile.row][startTile.col],
    completed: true,
  };

  // Reveal start tile and adjacent tiles
  const revealedTiles = _revealAround(startTile.row, startTile.col, []);

  const deck = startingDeck
    ? [...startingDeck]
    : [...(FACTION_CURATED_CARDS[championFaction] ?? FACTION_CURATED_CARDS.light)];

  return {
    seed,
    championFaction,
    deck,
    blessings: [],
    curses: [],
    gold: 0,
    potions: 0,
    majorPotions: 0,
    bossGatePotionGranted: false,
    championHP: 15,
    maxChampionHP: 15,
    currentTile: startTile,
    revealedTiles,
    completedTiles: [startTile],
    movementPath: [startTile],
    dungeonLayout,
    fightHistory: [],
    bossDefeated: false,
    loopCount: 0,
    roomsCleared: 0,
    combatRoomsCleared: 0,
    tilesMoved: 0,
    cumulativeChampionHPBonus: 0,
    championTierAtRunStart: getChampionTier(championFaction),
    highestTierReachedThisRun: null,
  };
}

/**
 * Move the player to a tile and reveal tiles around the new position.
 * Throne Sense blessing expands reveal radius from 1 to 2.
 * @param {Object} state
 * @param {number} row
 * @param {number} col
 * @returns {Object} new state
 */
export function moveToTile(state, row, col) {
  const hasTroneSense = state.blessings?.includes('throne_sense');
  const newRevealedTiles = hasTroneSense
    ? _revealRadius(row, col, 2, state.revealedTiles)
    : _revealAround(row, col, state.revealedTiles);
  const newState = {
    ...state,
    currentTile: { row, col },
    revealedTiles: newRevealedTiles,
    movementPath: [...(state.movementPath ?? [state.currentTile]), { row, col }],
    tilesMoved: Math.min(100, (state.tilesMoved ?? 0) + 1),
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
      // Throne Sense: immediately reveal tiles within radius 2 of current position
      if (reward.value === 'throne_sense') {
        const { row, col } = newState.currentTile;
        newState = { ...newState, revealedTiles: _revealRadius(row, col, 2, newState.revealedTiles) };
      }
      break;
    case 'remove_card': {
      // Remove first occurrence of reward.value (card ID) from the deck
      const idx = newState.deck.indexOf(reward.value);
      if (idx !== -1) {
        const newDeck = [...newState.deck];
        newDeck.splice(idx, 1);
        newState = { ...newState, deck: newDeck };
      }
      break;
    }
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

  const tileType = state.dungeonLayout[row]?.[col]?.type;
  const isBoss = tileType === 'boss';
  const isCombat = tileType === 'fight' || tileType === 'elite_fight';
  const isElite = tileType === 'elite_fight';

  // Award cross-run champion XP based on tile type
  let highestTierReachedThisRun = state.highestTierReachedThisRun ?? null;
  if (isCombat || isBoss) {
    const xpGrants = [];
    if (isCombat) xpGrants.push(10);
    if (isElite)  xpGrants.push(25);
    if (isBoss)   xpGrants.push(60, 80);
    for (const xp of xpGrants) {
      const result = addChampionXP(state.championFaction, xp);
      if (result.newTierReached !== null) {
        highestTierReachedThisRun = Math.max(
          highestTierReachedThisRun ?? 0,
          result.newTierReached,
        );
      }
    }
  }

  let loopCount = state.loopCount;
  let dungeonLayout = newLayout;
  let seed = state.seed;
  let revealedTiles = state.revealedTiles;
  let completedTiles = [...state.completedTiles, { row, col }];
  let bossDefeated = state.bossDefeated;
  let tilesMoved = state.tilesMoved ?? 0;
  let cumulativeChampionHPBonus = state.cumulativeChampionHPBonus ?? 0;
  let movementPath = state.movementPath ?? [];
  let currentTile = state.currentTile;

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
    // Mark start tile as completed so it is passable after the player leaves
    dungeonLayout[startTile.row][startTile.col] = {
      ...dungeonLayout[startTile.row][startTile.col],
      completed: true,
    };
    currentTile = startTile;
    revealedTiles = _revealAround(startTile.row, startTile.col, []);
    completedTiles = [startTile];
    movementPath = [startTile];
    bossDefeated = true;
    // Accumulate HP bonus earned this dungeon, then reset tile counter
    cumulativeChampionHPBonus += Math.floor(tilesMoved / 5);
    tilesMoved = 0;
  }

  const bossGatePotionGranted = isBoss ? false : (state.bossGatePotionGranted ?? false);

  const newState = {
    ...state,
    currentTile,
    dungeonLayout,
    seed,
    completedTiles,
    revealedTiles,
    movementPath,
    fightHistory,
    bossDefeated,
    loopCount,
    roomsCleared: state.roomsCleared + 1,
    // combatRoomsCleared counts only fight/elite_fight completions; resets on new loop
    combatRoomsCleared: isBoss ? 0 : (state.combatRoomsCleared ?? 0) + (isCombat ? 1 : 0),
    tilesMoved,
    cumulativeChampionHPBonus,
    bossGatePotionGranted,
    highestTierReachedThisRun,
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
  return _revealRadius(row, col, 1, existingRevealed);
}

/**
 * Reveal all tiles within `radius` Manhattan distance of (row, col).
 * Radius 1 = the 4 orthogonal neighbors + self.
 * Radius 2 = all tiles in a 5×5 diamond (capped to the 5×5 grid).
 */
function _revealRadius(row, col, radius, existingRevealed) {
  const toReveal = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (Math.abs(dr) + Math.abs(dc) > radius) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < 5 && c >= 0 && c < 5) {
        toReveal.push({ row: r, col: c });
      }
    }
  }

  const result = [...existingRevealed];
  for (const tile of toReveal) {
    if (!result.some(t => t.row === tile.row && t.col === tile.col)) {
      result.push(tile);
    }
  }
  return result;
}
