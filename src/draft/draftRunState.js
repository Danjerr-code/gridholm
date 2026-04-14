const STORAGE_KEY = 'gridholm_draft_run';

/**
 * Initial draft run state shape.
 */
export function createDraftRunState() {
  return {
    primaryFaction: null,
    secondaryFaction: null,
    deck: [],          // array of card IDs (30 cards)
    legendaryIds: [],  // IDs of legendaries in the deck
    wins: 0,
    losses: 0,
    currentGame: 0,
    runComplete: false,
  };
}

/**
 * Persist a draft run state to localStorage.
 * @param {Object} state
 */
export function saveDraftRun(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[draftRunState] Failed to save draft run:', e);
  }
}

/**
 * Load a draft run state from localStorage.
 * @returns {Object|null} saved state or null if none
 */
export function loadDraftRun() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[draftRunState] Failed to load draft run:', e);
    return null;
  }
}

/**
 * Clear the saved draft run from localStorage.
 */
export function clearDraftRun() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[draftRunState] Failed to clear draft run:', e);
  }
}
