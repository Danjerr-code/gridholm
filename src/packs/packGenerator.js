import { CARD_DB } from '../engine/cards.js';

export const PACK_TYPES = {
  light:  { name: 'Light Pack',    color: '#F0E6D2', factionWeight: 0.6, faction: 'light' },
  primal: { name: 'Primal Pack',   color: '#22C55E', factionWeight: 0.6, faction: 'primal' },
  mystic: { name: 'Mystic Pack',   color: '#A855F7', factionWeight: 0.6, faction: 'mystic' },
  dark:   { name: 'Dark Pack',     color: '#EF4444', factionWeight: 0.6, faction: 'dark' },
  mixed:  { name: 'Gridholm Pack', color: '#C9A84C', factionWeight: 0,   faction: null },
};

const INVENTORY_KEY = 'gridholm_pack_inventory';
const PITY_KEY = 'gridholm_pity_counter';
const COLLECTION_KEY = 'gridholm_collection';

// Build filtered card pools once (exclude tokens)
function buildCardPools() {
  const all = Object.values(CARD_DB).filter(c => !c.token && !c.bossOnly);
  const byFaction = {};
  for (const faction of ['light', 'primal', 'mystic', 'dark']) {
    byFaction[faction] = all.filter(c => c.attribute === faction);
  }
  return { all, byFaction };
}

const POOLS = buildCardPools();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRarity(pools, faction, rarity) {
  const src = faction ? pools.byFaction[faction] : pools.all;
  const filtered = src.filter(c => c.rarity === rarity);
  if (filtered.length === 0) {
    // Fallback to all cards of that rarity
    return pick(pools.all.filter(c => c.rarity === rarity)) || null;
  }
  return pick(filtered);
}

function pickCard(pools, faction, forceRarity) {
  if (forceRarity) return pickRarity(pools, faction, forceRarity);
  return pick(faction ? pools.byFaction[faction] : pools.all);
}

function getPityCounter() {
  try { return parseInt(localStorage.getItem(PITY_KEY) || '0', 10); } catch { return 0; }
}

function setPityCounter(n) {
  try { localStorage.setItem(PITY_KEY, String(n)); } catch {}
}

/**
 * generatePack(packType)
 * Returns array of 5 card objects, sorted by rarity (commons first, legendary last).
 */
export function generatePack(packType) {
  const def = PACK_TYPES[packType];
  if (!def) throw new Error(`Unknown pack type: ${packType}`);

  const faction = def.faction; // null for mixed
  const pity = getPityCounter();

  // Slot 5 rarity — pity forces legendary if counter >= 10
  let slot5Rarity;
  if (pity >= 10) {
    slot5Rarity = 'legendary';
    setPityCounter(0);
  } else {
    slot5Rarity = Math.random() < 0.1 ? 'legendary' : 'rare';
    if (slot5Rarity === 'legendary') setPityCounter(0);
    else setPityCounter(pity + 1);
  }

  const usedIds = new Set();
  const cards = [];

  function drawCard(preferFaction, forceRarity) {
    let attempts = 0;
    while (attempts < 50) {
      const card = pickCard(POOLS, preferFaction, forceRarity);
      if (card && !usedIds.has(card.id)) {
        usedIds.add(card.id);
        return card;
      }
      attempts++;
    }
    // Fallback: pick anything unused
    const pool = forceRarity
      ? POOLS.all.filter(c => c.rarity === forceRarity && !usedIds.has(c.id))
      : POOLS.all.filter(c => !usedIds.has(c.id));
    if (pool.length === 0) return null;
    const card = pick(pool);
    usedIds.add(card.id);
    return card;
  }

  if (faction) {
    // 3 cards guaranteed from faction, 2 from anywhere
    // Slot distribution: assign faction to first 3 draws
    const factionSlots = [true, true, true, false, false];
    // Shuffle to randomize which of slots 1-4 get faction
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [factionSlots[i], factionSlots[j]] = [factionSlots[j], factionSlots[i]];
    }

    for (let i = 0; i < 4; i++) {
      const slotFaction = factionSlots[i] ? faction : null;
      const rarity = Math.random() < 0.85 ? 'common' : 'rare';
      const card = drawCard(slotFaction, rarity);
      if (card) cards.push(card);
    }
  } else {
    // Mixed pack: slots 1-4 from full pool
    for (let i = 0; i < 4; i++) {
      const rarity = Math.random() < 0.85 ? 'common' : 'rare';
      const card = drawCard(null, rarity);
      if (card) cards.push(card);
    }
  }

  // Slot 5: guaranteed rare or better
  const slot5Faction = faction && Math.random() < 0.5 ? faction : null;
  const slot5Card = drawCard(slot5Faction, slot5Rarity);
  if (slot5Card) cards.push(slot5Card);

  // Sort: common < rare < legendary (best card last)
  const RARITY_ORDER = { common: 0, rare: 1, legendary: 2 };
  cards.sort((a, b) => (RARITY_ORDER[a.rarity] || 0) - (RARITY_ORDER[b.rarity] || 0));

  return cards;
}

// ── Pack Inventory ─────────────────────────────────────────────────────────────

function defaultInventory() {
  return { light: 0, primal: 0, mystic: 0, dark: 0, mixed: 0 };
}

export function getPackInventory() {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) {
      // First load: give 3 free mixed packs
      const inv = { ...defaultInventory(), mixed: 3 };
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv));
      return inv;
    }
    return { ...defaultInventory(), ...JSON.parse(raw) };
  } catch {
    return defaultInventory();
  }
}

export function addPacks(packType, count) {
  const inv = getPackInventory();
  inv[packType] = (inv[packType] || 0) + count;
  try { localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv)); } catch {}
}

export function removePack(packType) {
  const inv = getPackInventory();
  if (inv[packType] > 0) {
    inv[packType]--;
    try { localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv)); } catch {}
  }
}

export function getTotalPackCount() {
  const inv = getPackInventory();
  return Object.values(inv).reduce((sum, n) => sum + n, 0);
}

export function hasLegendaryInPack(cards) {
  return cards.some(c => c.rarity === 'legendary');
}
