const COLLECTION_KEY = 'gridholm_collection';

/**
 * getCollection()
 * Returns { cardId: count, ... }
 */
export function getCollection() {
  try {
    return JSON.parse(localStorage.getItem(COLLECTION_KEY) || 'null') || {};
  } catch {
    return {};
  }
}

/**
 * addCardsToCollection(cardIds)
 * Increments each card's count in the collection.
 */
export function addCardsToCollection(cardIds) {
  const col = getCollection();
  for (const id of cardIds) {
    col[id] = (col[id] || 0) + 1;
  }
  try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(col)); } catch {}
}

export function getCardCount(cardId) {
  const col = getCollection();
  return col[cardId] || 0;
}
