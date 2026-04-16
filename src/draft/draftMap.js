/**
 * draftMap.js
 * -----------
 * Defines the node-based draft map structure and generates a fresh map instance.
 *
 * Map layout:
 *   Nodes 1-7  : standard (pre-fork), branchId null
 *   Node 8     : fork, branchId null — player commits to a branch here
 *   Nodes 9-25 : standard per branch (17 nodes), branchId A/B/C/D
 *   Node 26    : special per branch, branchId A/B/C/D
 *   Nodes 27-29: standard per branch, branchId A/B/C/D
 *
 * A "playthrough" visits 8 shared nodes + 21 branch nodes = 29 nodes total.
 * All 4 branches are generated in the map object; only one is traversed.
 */

export const BRANCHES = ['A', 'B', 'C', 'D'];

/**
 * Special type assigned to each branch's node 26.
 * Shuffled during generateDraftMap so branch→special assignment varies per run.
 */
export const SPECIAL_TYPES = {
  primary_faction: 'primary_faction',
  secondary_faction: 'secondary_faction',
  swap: 'swap',
  rare: 'rare',
};

/**
 * Generate a full draft map for a run.
 *
 * @param {string} primaryFaction
 * @param {string} secondaryFaction
 * @returns {Object} map — keyed by nodeId, plus `branchSpecialTypes` metadata
 */
export function generateDraftMap(primaryFaction, secondaryFaction) {
  const nodes = {};

  // Pre-fork nodes (1-7)
  for (let pos = 1; pos <= 7; pos++) {
    const id = `node_${pos}`;
    nodes[id] = {
      id,
      position: pos,
      type: 'standard',
      specialType: null,
      branchId: null,
      buckets: null,
      cards: null,
    };
  }

  // Fork node (8)
  nodes['node_8'] = {
    id: 'node_8',
    position: 8,
    type: 'fork',
    specialType: null,
    branchId: null,
    buckets: null,
    cards: null,
  };

  // Shuffle special types among branches
  const shuffledSpecials = shuffleArray([
    SPECIAL_TYPES.primary_faction,
    SPECIAL_TYPES.secondary_faction,
    SPECIAL_TYPES.swap,
    SPECIAL_TYPES.rare,
  ]);
  const branchSpecialTypes = {};
  BRANCHES.forEach((branch, i) => {
    branchSpecialTypes[branch] = shuffledSpecials[i];
  });

  // Branch nodes (9-29 per branch)
  for (const branch of BRANCHES) {
    for (let pos = 9; pos <= 29; pos++) {
      const id = `node_${pos}_${branch}`;
      let type = 'standard';
      let specialType = null;
      if (pos === 26) {
        type = 'special';
        specialType = branchSpecialTypes[branch];
      }
      nodes[id] = {
        id,
        position: pos,
        type,
        specialType,
        branchId: branch,
        buckets: null,
        cards: null,
      };
    }
  }

  return {
    nodes,
    branchSpecialTypes,
    primaryFaction,
    secondaryFaction,
  };
}

/**
 * Get the node ID for a given position and optional branch.
 * Pre-fork nodes (1-8) don't use a branch suffix.
 *
 * @param {number} position
 * @param {string|null} branch  'A'|'B'|'C'|'D'|null
 * @returns {string}
 */
export function getNodeId(position, branch) {
  if (position <= 8 || branch == null) return `node_${position}`;
  return `node_${position}_${branch}`;
}

/**
 * Get the ordered list of node IDs the player will traverse.
 *
 * @param {string|null} committedBranch  null = pre-fork, 'A'|'B'|'C'|'D' = committed
 * @returns {string[]}
 */
export function getDraftPath(committedBranch) {
  const path = [];
  // Pre-fork (1-8)
  for (let pos = 1; pos <= 8; pos++) {
    path.push(`node_${pos}`);
  }
  // Branch (9-29)
  if (committedBranch) {
    for (let pos = 9; pos <= 29; pos++) {
      path.push(`node_${pos}_${committedBranch}`);
    }
  }
  return path;
}

/**
 * Get the node the player is currently at, given their current position index (0-based).
 *
 * @param {Object}      map
 * @param {number}      mapPosition  — 0-based index into the traversal path
 * @param {string|null} branch
 * @returns {Object|null} node
 */
export function getCurrentNode(map, mapPosition, branch) {
  const path = getDraftPath(branch);
  const nodeId = path[mapPosition];
  return nodeId ? (map.nodes[nodeId] ?? null) : null;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
