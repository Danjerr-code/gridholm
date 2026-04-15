/**
 * Dungeon Generator — creates a deterministic 5x5 dungeon layout from a seed.
 *
 * Tile types: 'start' | 'boss' | 'wall' | 'fight' | 'elite_fight' | 'shop' | 'treasure' | 'rest' | 'event'
 */

// ── Linear Congruential Generator ────────────────────────────────────────────
// Produces deterministic pseudo-random numbers from a seed.
function makeLCG(seed) {
  // LCG parameters (Numerical Recipes)
  const A = 1664525;
  const C = 1013904223;
  const M = 2 ** 32;
  let state = seed >>> 0;

  return {
    next() {
      state = ((A * state + C) >>> 0);
      return state / M; // [0, 1)
    },
    nextInt(max) {
      return Math.floor(this.next() * max);
    },
    // Shuffle array in-place using Fisher-Yates
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.nextInt(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

// ── BFS connectivity check ────────────────────────────────────────────────────
function isConnected(layout, start, goal) {
  const visited = Array.from({ length: 5 }, () => Array(5).fill(false));
  const queue = [start];
  visited[start.row][start.col] = true;

  while (queue.length > 0) {
    const { row, col } = queue.shift();
    if (row === goal.row && col === goal.col) return true;

    const neighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];
    for (const n of neighbors) {
      if (n.row < 0 || n.row >= 5 || n.col < 0 || n.col >= 5) continue;
      if (visited[n.row][n.col]) continue;
      if (layout[n.row][n.col].type === 'wall') continue;
      visited[n.row][n.col] = true;
      queue.push(n);
    }
  }
  return false;
}

// ── Tile type assignment ──────────────────────────────────────────────────────
const TILE_WEIGHTS = [
  { type: 'fight',       weight: 40 },
  { type: 'elite_fight', weight: 12 },
  { type: 'shop',        weight: 12 },
  { type: 'treasure',    weight: 15 },
  { type: 'rest',        weight: 10 },
  { type: 'event',       weight: 11 },
];
const TOTAL_WEIGHT = TILE_WEIGHTS.reduce((s, t) => s + t.weight, 0);

function randomTileType(rng) {
  let roll = rng.next() * TOTAL_WEIGHT;
  for (const entry of TILE_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  return 'fight';
}

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * Generate a deterministic 5x5 dungeon layout.
 * @param {number} seed - unsigned 32-bit integer
 * @returns {Object[][]} 5x5 array of tile objects
 */
export function generateDungeon(seed) {
  const rng = makeLCG(seed >>> 0);

  // Initialize empty grid
  const layout = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) => ({
      row: r,
      col: c,
      type: 'empty',
      completed: false,
      revealed: false,
      encounter: null,
    }))
  );

  // 1. Boss at center
  layout[2][2].type = 'boss';

  // 2. Random start tile on an edge (excluding corners preferred, but any edge OK)
  const edgeTiles = [];
  for (let i = 0; i < 5; i++) {
    if (!(i === 2 && 0 === 2)) edgeTiles.push({ row: 0, col: i });
    if (!(i === 2 && 4 === 2)) edgeTiles.push({ row: 4, col: i });
    if (i > 0 && i < 4) {
      edgeTiles.push({ row: i, col: 0 });
      edgeTiles.push({ row: i, col: 4 });
    }
  }
  // Exclude center just in case
  const validEdges = edgeTiles.filter(t => !(t.row === 2 && t.col === 2));
  rng.shuffle(validEdges);
  const startTile = validEdges[0];
  layout[startTile.row][startTile.col].type = 'start';

  // 3. Pick gate tile — one of the 4 tiles adjacent to center; this is the
  //    only tile from which the player can enter the boss room.
  const adjacentToCenter = [
    { row: 1, col: 2 },
    { row: 3, col: 2 },
    { row: 2, col: 1 },
    { row: 2, col: 3 },
  ];
  rng.shuffle(adjacentToCenter);
  const gateTile = adjacentToCenter[0];

  // 4. Place 4–6 walls, ensuring path from start to gate tile stays open.
  //    The gate tile is protected from becoming a wall.
  const wallCount = 4 + rng.nextInt(3); // 4, 5, or 6
  let wallsPlaced = 0;
  const candidateWalls = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (layout[r][c].type !== 'empty') continue;
      if (r === gateTile.row && c === gateTile.col) continue; // protect gate tile
      candidateWalls.push({ row: r, col: c });
    }
  }
  rng.shuffle(candidateWalls);

  for (const candidate of candidateWalls) {
    if (wallsPlaced >= wallCount) break;
    layout[candidate.row][candidate.col].type = 'wall';
    if (!isConnected(layout, startTile, gateTile)) {
      // Would block path to gate — remove
      layout[candidate.row][candidate.col].type = 'empty';
    } else {
      wallsPlaced++;
    }
  }

  // 5. Assign remaining empty tiles
  const emptyTiles = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (layout[r][c].type === 'empty') emptyTiles.push(layout[r][c]);
    }
  }

  for (const tile of emptyTiles) {
    tile.type = randomTileType(rng);
  }

  // 6. Ensure at least 1 rest and 1 shop tile
  const hasRest = emptyTiles.some(t => t.type === 'rest');
  const hasShop = emptyTiles.some(t => t.type === 'shop');

  if (!hasRest) {
    const fightTile = emptyTiles.find(t => t.type === 'fight');
    if (fightTile) fightTile.type = 'rest';
  }
  if (!hasShop) {
    const fightTile = emptyTiles.find(t => t.type === 'fight');
    if (fightTile) fightTile.type = 'shop';
  }

  // 7. Mark gate tile — single entrance to the boss room
  layout[gateTile.row][gateTile.col].isGate = true;

  return layout;
}
