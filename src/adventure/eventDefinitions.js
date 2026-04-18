/**
 * eventDefinitions.js
 *
 * 8 mysterious event encounters for Adventure Mode.
 *
 * Exports:
 *   makeEventRng(seed, row, col) → LCG rng object
 *   getRandomEvent(rng)          → event definition object
 */

import { CARD_DB } from '../engine/cards.js';
import { BLESSINGS_POOL } from './encounterRewards.js';

// ── LCG (same params as dungeonGenerator) ────────────────────────────────────
function makeLCG(seed) {
  const A = 1664525;
  const C = 1013904223;
  const M = 2 ** 32;
  let state = seed >>> 0;
  return {
    next()        { state = ((A * state + C) >>> 0); return state / M; },
    nextInt(max)  { return Math.floor(this.next() * max); },
    shuffle(arr)  {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.nextInt(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

// ── Card pool helper ──────────────────────────────────────────────────────────
function _buildCardPool(faction, rarity) {
  return Object.values(CARD_DB).filter(card => {
    if (card.isToken || card.token || card.isChampion) return false;
    if (card.legendary) return false;
    if (card.bossOnly) return false;
    if (rarity && card.rarity !== rarity) return false;
    return card.attribute === faction || card.attribute === 'neutral';
  });
}

// ── Internal shuffle using rng ────────────────────────────────────────────────
function _rngShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 8 Event definitions ───────────────────────────────────────────────────────

const EVENTS = [
  // 1 ── Cursed Shrine
  {
    id: 'cursed_shrine',
    title: 'Cursed Shrine',
    description: 'A dark altar pulses with power. You feel it could strengthen you, but at a cost.',
    choices: [
      {
        label: 'Accept the power.',
        effectDesc: 'Gain a random blessing. Gain the Plagued curse (lose 1 HP per tile moved).',
        applyOutcome(state, rng) {
          const owned = state.blessings ?? [];
          const available = BLESSINGS_POOL.filter(b => !owned.includes(b.id));
          const rewards = [];
          let outcomeText;

          if (available.length > 0) {
            const blessing = available[rng.nextInt(available.length)];
            rewards.push({ type: 'blessing', value: blessing.id });
            if ((state.curses ?? []).includes('plagued')) {
              rewards.push({ type: 'curse', value: 'weakened' });
              outcomeText = `Power surges through you. Gained: ${blessing.name}. Already plagued, the darkness mutates — you feel Weakened.`;
            } else {
              rewards.push({ type: 'curse', value: 'plagued' });
              outcomeText = `Power surges through you. Gained: ${blessing.name}. But shadows seep in — you are now Plagued (lose 1 HP per move).`;
            }
          } else {
            rewards.push({ type: 'curse', value: 'plagued' });
            outcomeText = 'You already carry all possible blessings. The shrine grants nothing new, but curses you with Plague.';
          }
          return { outcomeText, rewards };
        },
      },
      {
        label: 'Walk away.',
        effectDesc: 'Nothing happens.',
        applyOutcome() {
          return { outcomeText: 'You resist the temptation and press on.', rewards: [] };
        },
      },
    ],
  },

  // 2 ── Wounded Traveler
  {
    id: 'wounded_traveler',
    title: 'Wounded Traveler',
    description: 'A fellow adventurer lies injured on the ground. They offer you their supplies in exchange for healing.',
    choices: [
      {
        label: 'Heal them.',
        effectDesc: 'Lose 3 HP. Gain 20 gold and 1 health potion.',
        applyOutcome() {
          return {
            outcomeText: 'You tend to their wounds. They press their remaining supplies into your hands with gratitude.',
            rewards: [
              { type: 'hp',     value: -3 },
              { type: 'gold',   value: 20 },
              { type: 'potion', value: 1  },
            ],
          };
        },
      },
      {
        label: 'Take their supplies.',
        effectDesc: 'Gain 10 gold. No HP cost.',
        applyOutcome() {
          return {
            outcomeText: "You pocket their coin purse and continue without stopping. The guilt lingers.",
            rewards: [{ type: 'gold', value: 10 }],
          };
        },
      },
    ],
  },

  // 3 ── Abandoned Armory
  {
    id: 'abandoned_armory',
    title: 'Abandoned Armory',
    description: 'Weapons and armor are scattered across the floor. Most are rusted, but a few look usable.',
    choices: [
      {
        label: 'Search carefully.',
        effectDesc: 'Gain 1 card offering — pick 1 of 3 guaranteed rare cards.',
        applyOutcome(state, rng) {
          const faction = state.championFaction ?? 'light';
          const pool = _rngShuffle(_buildCardPool(faction, 'rare'), rng);
          const offers = pool.slice(0, Math.min(3, pool.length));
          return {
            outcomeText: 'After careful searching you uncover several exceptional weapons. Choose one to take.',
            rewards: [],
            cardOffers: offers,
          };
        },
      },
      {
        label: 'Grab and go.',
        effectDesc: 'Add 2 random common cards directly to your deck.',
        applyOutcome(state, rng) {
          const faction = state.championFaction ?? 'light';
          const pool = _rngShuffle(_buildCardPool(faction, 'common'), rng);
          const cards = pool.slice(0, 2);
          return {
            outcomeText: cards.length > 0
              ? `You hastily grab ${cards.map(c => c.name).join(' and ')} and flee before trouble arrives.`
              : 'You grab whatever you can, but it crumbles to dust.',
            rewards: cards.map(c => ({ type: 'card', value: c.id })),
          };
        },
      },
    ],
  },

  // 4 ── Sacrificial Pit
  {
    id: 'sacrificial_pit',
    title: 'Sacrificial Pit',
    description: 'A bottomless pit whispers promises. It will consume one of your cards and return something greater.',
    choices: [
      {
        label: 'Sacrifice a card.',
        effectDesc: 'Select a card to remove from your deck. Gain 15 gold and restore 3 HP.',
        applyOutcome(state) {
          if ((state.deck ?? []).length === 0) {
            return {
              outcomeText: 'Your deck is empty — you have nothing to offer the pit.',
              rewards: [],
            };
          }
          return {
            outcomeText: 'The pit hungers. Choose a card to sacrifice.',
            rewards: [],
            needsCardRemoval: true,
            afterRemovalRewards: [
              { type: 'gold', value: 15 },
              { type: 'hp',   value: 3  },
            ],
            afterRemovalText: 'The card dissolves into the void. You receive gold and your wounds begin to close.',
          };
        },
      },
      {
        label: 'Keep your cards.',
        effectDesc: 'Nothing happens.',
        applyOutcome() {
          return {
            outcomeText: "You back away from the edge. Whatever it offers isn't worth the price.",
            rewards: [],
          };
        },
      },
    ],
  },

  // 5 ── Merchant's Ghost
  {
    id: 'merchants_ghost',
    title: "Merchant's Ghost",
    description: "The spirit of a dead merchant materializes. 'One trade, that is all I offer.'",
    choices: [
      {
        label: 'Trade your highest-cost card.',
        effectDesc: 'Remove your highest-cost card. Receive 2 random lower-cost cards.',
        applyOutcome(state, rng) {
          const deck = state.deck ?? [];
          if (deck.length === 0) {
            return { outcomeText: 'Your deck is empty. The ghost shrugs and fades away.', rewards: [] };
          }
          // Find highest-cost card in deck
          let highestId = deck[0];
          let highestCost = CARD_DB[deck[0]]?.cost ?? 0;
          for (const id of deck) {
            const cost = CARD_DB[id]?.cost ?? 0;
            if (cost > highestCost) { highestCost = cost; highestId = id; }
          }
          const removedCard = CARD_DB[highestId];

          // Pool: faction cards with strictly lower cost
          const faction = state.championFaction ?? 'light';
          const pool = _rngShuffle(
            Object.values(CARD_DB).filter(c =>
              !c.isToken && !c.token && !c.isChampion && !c.legendary && !c.bossOnly && !c.adventureOnly &&
              (c.attribute === faction || c.attribute === 'neutral') &&
              (c.cost ?? 0) < highestCost
            ),
            rng
          );
          const added = pool.slice(0, 2);

          const rewards = [
            { type: 'remove_card', value: highestId },
            ...added.map(c => ({ type: 'card', value: c.id })),
          ];

          const addedNames = added.length > 0
            ? added.map(c => c.name).join(' and ')
            : 'nothing of value';

          return {
            outcomeText: `The ghost takes ${removedCard?.name ?? highestId} and hands you ${addedNames} in return.`,
            rewards,
          };
        },
      },
      {
        label: 'Decline.',
        effectDesc: 'Nothing happens.',
        applyOutcome() {
          return { outcomeText: 'You refuse the deal. The ghost dissipates with a hollow sigh.', rewards: [] };
        },
      },
    ],
  },

  // 6 ── Mana Spring
  {
    id: 'mana_spring',
    title: 'Mana Spring',
    description: 'A glowing pool of pure mana. Drinking from it feels dangerous but exhilarating.',
    choices: [
      {
        label: 'Drink deep.',
        effectDesc: 'Gain Arcane Surge (start each fight with +2 mana on turn 1). Lose 4 HP.',
        applyOutcome(state) {
          const hasSurge = (state.blessings ?? []).includes('arcane_surge');
          if (hasSurge) {
            return {
              outcomeText: 'You drink again but already carry its power — only the pain remains. Lose 4 HP.',
              rewards: [{ type: 'hp', value: -4 }],
            };
          }
          return {
            outcomeText: 'Raw mana floods your veins. Power courses through you, but the price staggers you.',
            rewards: [
              { type: 'blessing', value: 'arcane_surge' },
              { type: 'hp',       value: -4            },
            ],
          };
        },
      },
      {
        label: 'Drink cautiously.',
        effectDesc: 'Restore 3 HP.',
        applyOutcome() {
          return {
            outcomeText: 'You sip carefully from the spring. The gentle mana warmth soothes your wounds.',
            rewards: [{ type: 'hp', value: 3 }],
          };
        },
      },
    ],
  },

  // 7 ── Trapped Chest
  {
    id: 'trapped_chest',
    title: 'Trapped Chest',
    description: 'A chest sits in the center of the room. The lock has a strange mechanism.',
    choices: [
      {
        label: 'Force it open.',
        effectDesc: '50%: gain 25 gold + 1 potion. 50%: lose 5 HP + gain 5 gold.',
        applyOutcome(state, rng) {
          if (rng.next() < 0.5) {
            return {
              outcomeText: 'The chest springs open — treasure inside! You grab everything before the dust settles.',
              rewards: [
                { type: 'gold',   value: 25 },
                { type: 'potion', value: 1  },
              ],
            };
          }
          return {
            outcomeText: 'A trap fires! Shards of metal tear through you. At least there was some gold inside.',
            rewards: [
              { type: 'hp',   value: -5 },
              { type: 'gold', value:  5 },
            ],
          };
        },
      },
      {
        label: 'Pick the lock carefully.',
        effectDesc: 'Always gain 10 gold. No risk.',
        applyOutcome() {
          return {
            outcomeText: 'You work the lock with patience. It opens without incident.',
            rewards: [{ type: 'gold', value: 10 }],
          };
        },
      },
    ],
  },

  // 8 ── Ancient Library
  {
    id: 'ancient_library',
    title: 'Ancient Library',
    description: 'Shelves of decaying scrolls. Most are illegible, but a few contain powerful knowledge.',
    choices: [
      {
        label: 'Study the scrolls.',
        effectDesc: 'Remove 1 random common card from your deck. Replace with a random rare card.',
        applyOutcome(state, rng) {
          const deck = state.deck ?? [];
          const commonIds = deck.filter(id => CARD_DB[id]?.rarity === 'common');
          if (commonIds.length === 0) {
            return {
              outcomeText: 'The scrolls demand common knowledge as tribute — you have none to offer.',
              rewards: [],
            };
          }
          const removeId = commonIds[rng.nextInt(commonIds.length)];
          const removedCard = CARD_DB[removeId];

          const faction = state.championFaction ?? 'light';
          const rarePool = _rngShuffle(_buildCardPool(faction, 'rare'), rng);
          const addCard = rarePool[0];

          if (!addCard) {
            return {
              outcomeText: 'The rare scrolls crumble before you can read them.',
              rewards: [],
            };
          }

          return {
            outcomeText: `Ancient knowledge replaces ${removedCard?.name ?? removeId} with the more powerful ${addCard.name}.`,
            rewards: [
              { type: 'remove_card', value: removeId  },
              { type: 'card',        value: addCard.id },
            ],
          };
        },
      },
      {
        label: 'Search for a map.',
        effectDesc: 'Reveal all tiles on the dungeon map.',
        applyOutcome() {
          return {
            outcomeText: 'You find a detailed map of the dungeon. All its secrets are laid bare.',
            rewards: [],
            revealAll: true,
          };
        },
      },
    ],
  },
];

// ── Card Upgrade Event (guaranteed once per act via tile subtype) ─────────────

export const CARD_UPGRADE_EVENT = {
  id: 'card_upgrade',
  title: "Artificer's Forge",
  description: "A master artificer offers to enhance one of your weapons. Upgraded units gain +1/+1 permanently. Upgraded spells cost 1 less mana. Each card can only be upgraded once.",
  choices: [
    {
      label: 'Upgrade a card.',
      effectDesc: 'Select one card from your deck to upgrade permanently.',
      applyOutcome(state) {
        const deck = state.deck ?? [];
        const upgrades = state.upgrades ?? deck.map(() => false);
        const hasUpgradeable = deck.some((id, i) => !upgrades[i]);
        if (!hasUpgradeable) {
          return {
            outcomeText: 'All your cards are already upgraded. The artificer nods with approval.',
            rewards: [],
          };
        }
        return {
          outcomeText: 'The forge glows hot. Choose a card to enhance.',
          rewards: [],
          needsCardUpgrade: true,
        };
      },
    },
    {
      label: 'Leave the forge.',
      effectDesc: 'Nothing happens.',
      applyOutcome() {
        return {
          outcomeText: 'You leave the forge untouched. The fire dims behind you.',
          rewards: [],
        };
      },
    },
  ],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a deterministic RNG for a specific tile event.
 * @param {number} seed  - run seed
 * @param {number} row   - tile row (0-4)
 * @param {number} col   - tile col (0-4)
 * @returns LCG rng object
 */
export function makeEventRng(seed, row, col) {
  const s = ((seed ^ (row * 2654435761 + col * 1013904223)) >>> 0);
  return makeLCG(s);
}

/**
 * Pick a random event from the pool using the provided rng.
 * The rng is advanced by 1 call (consumed for the pick).
 * @param {Object} rng - LCG rng object from makeEventRng
 * @returns event definition object
 */
export function getRandomEvent(rng) {
  return EVENTS[rng.nextInt(EVENTS.length)];
}
