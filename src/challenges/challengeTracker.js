// Challenge Tracker: evaluates a game result against active challenges and updates progress.

import { getActiveChallenges, getChallengeProgress, saveChallengeProgress, recordNewCompletions } from './challengeManager.js';
import { addPacks } from '../packs/packGenerator.js';

/**
 * gameResult shape (assembled from final game state in App.jsx / DraftMode):
 * {
 *   won: boolean,
 *   faction: string,           // player deck attribute: 'light','primal','mystic','dark','custom'
 *   turns: number,             // state.turn at game end
 *   championDamageDealt: number,
 *   championTookDamage: boolean,
 *   unitsPlayed: number,
 *   unitsDestroyed: number,
 *   spellsCast: number,
 *   highCostCardsPlayed: number, // cards played with cost >= 5
 *   throneControlTurns: number,
 *   throneControlStreak: number, // max consecutive turns controlling throne
 *   isDraft: boolean,
 * }
 */
export function trackGameEnd(gameResult) {
  const { daily, weekly } = getActiveChallenges();
  const allChallenges = weekly ? [...daily, weekly] : [...daily];
  const progress = getChallengeProgress();
  const updates = {};
  const newlyCompleted = [];

  for (const challenge of allChallenges) {
    const req = challenge.requirement;
    const existing = progress[challenge.id] || { current: 0, target: req.target ?? 1, completed: false };

    // Skip already-completed challenges (don't over-count)
    if (existing.completed) continue;

    let gained = 0;

    switch (req.stat) {
      case 'winsWithFaction':
        if (gameResult.won && gameResult.faction === req.faction) gained = 1;
        break;

      case 'totalWins':
        if (gameResult.won) gained = 1;
        break;

      case 'factionWins': {
        // Track which factions the player has won with this week
        if (gameResult.won) {
          const store = _loadRawStore();
          const wonFactions = store.wonFactions || [];
          if (!wonFactions.includes(gameResult.faction)) {
            wonFactions.push(gameResult.faction);
            _saveWonFactions(wonFactions);
            gained = 1; // one new faction unlocked
          }
        }
        break;
      }

      case 'allFactionWins': {
        if (gameResult.won) {
          const store = _loadRawStore();
          const wonFactions = new Set(store.allFactionWins || []);
          if (!wonFactions.has(gameResult.faction)) {
            wonFactions.add(gameResult.faction);
            _saveAllFactionWins([...wonFactions]);
            gained = 1;
          }
        }
        break;
      }

      case 'championDamageDealt':
        gained = gameResult.championDamageDealt || 0;
        break;

      case 'champUndamaged':
        if (gameResult.won && !gameResult.championTookDamage) gained = 1;
        break;

      case 'unitsPlayed':
        // Daily: single-game check; weekly: accumulate
        if (challenge.type === 'daily') {
          // For single-game stats, set current to max of existing or new value
          const singleVal = gameResult.unitsPlayed || 0;
          const newEntry = {
            current: Math.max(existing.current, singleVal),
            target: existing.target,
            completed: existing.completed,
          };
          if (!newEntry.completed && newEntry.current >= newEntry.target) {
            newEntry.completed = true;
            newlyCompleted.push(challenge.id);
          }
          updates[challenge.id] = newEntry;
          continue;
        }
        gained = gameResult.unitsPlayed || 0;
        break;

      case 'unitsDestroyed':
        if (challenge.type === 'daily') {
          const singleVal = gameResult.unitsDestroyed || 0;
          const newEntry = {
            current: Math.max(existing.current, singleVal),
            target: existing.target,
            completed: existing.completed,
          };
          if (!newEntry.completed && newEntry.current >= newEntry.target) {
            newEntry.completed = true;
            newlyCompleted.push(challenge.id);
          }
          updates[challenge.id] = newEntry;
          continue;
        }
        gained = gameResult.unitsDestroyed || 0;
        break;

      case 'spellsCast':
        if (challenge.type === 'daily') {
          const singleVal = gameResult.spellsCast || 0;
          const newEntry = {
            current: Math.max(existing.current, singleVal),
            target: existing.target,
            completed: existing.completed,
          };
          if (!newEntry.completed && newEntry.current >= newEntry.target) {
            newEntry.completed = true;
            newlyCompleted.push(challenge.id);
          }
          updates[challenge.id] = newEntry;
          continue;
        }
        gained = gameResult.spellsCast || 0;
        break;

      case 'fastWin':
        if (gameResult.won && gameResult.turns < (req.maxTurns ?? 15)) gained = 1;
        break;

      case 'highCostCardsPlayed': {
        const singleVal = gameResult.highCostCardsPlayed || 0;
        const newEntry = {
          current: Math.max(existing.current, singleVal),
          target: existing.target,
          completed: existing.completed,
        };
        if (!newEntry.completed && newEntry.current >= newEntry.target) {
          newEntry.completed = true;
          newlyCompleted.push(challenge.id);
        }
        updates[challenge.id] = newEntry;
        continue;
      }

      case 'throneControlStreak': {
        const singleVal = gameResult.throneControlStreak || 0;
        const newEntry = {
          current: Math.max(existing.current, singleVal),
          target: existing.target,
          completed: existing.completed,
        };
        if (!newEntry.completed && newEntry.current >= newEntry.target) {
          newEntry.completed = true;
          newlyCompleted.push(challenge.id);
        }
        updates[challenge.id] = newEntry;
        continue;
      }

      case 'draftWin':
        if (gameResult.won && gameResult.isDraft) gained = 1;
        break;

      case 'draftWins':
        if (gameResult.won && gameResult.isDraft) gained = 1;
        break;

      default:
        break;
    }

    if (gained > 0 || updates[challenge.id] === undefined) {
      const newCurrent = existing.current + gained;
      const nowComplete = !existing.completed && newCurrent >= existing.target;
      updates[challenge.id] = {
        current: Math.min(newCurrent, existing.target),
        target: existing.target,
        completed: existing.completed || nowComplete,
      };
      if (nowComplete) newlyCompleted.push(challenge.id);
    }
  }

  if (Object.keys(updates).length > 0) {
    saveChallengeProgress(updates);
  }
  if (newlyCompleted.length > 0) {
    recordNewCompletions(newlyCompleted);

    // Award packs for newly completed challenges
    for (const challengeId of newlyCompleted) {
      const challenge = allChallenges.find(c => c.id === challengeId);
      if (!challenge) continue;
      if (challenge.type === 'daily') {
        addPacks('mixed', 1);
      } else if (challenge.type === 'weekly') {
        addPacks('mixed', 2);
      }
    }
  }

  // Return which challenges made progress and which were newly completed
  return {
    progressed: Object.keys(updates),
    completed: newlyCompleted,
    updates,
  };
}

// ── Internal helpers for faction tracking ─────────────────────────────────────

function _loadRawStore() {
  try {
    return JSON.parse(localStorage.getItem('gridholm_challenges') || 'null') || {};
  } catch {
    return {};
  }
}

function _saveWonFactions(factions) {
  const store = _loadRawStore();
  store.wonFactions = factions;
  localStorage.setItem('gridholm_challenges', JSON.stringify(store));
}

function _saveAllFactionWins(factions) {
  const store = _loadRawStore();
  store.allFactionWins = factions;
  localStorage.setItem('gridholm_challenges', JSON.stringify(store));
}
