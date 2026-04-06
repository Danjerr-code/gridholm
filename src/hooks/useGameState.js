import { useState, useCallback } from 'react';
import {
  createInitialState,
  autoAdvancePhase,
  getChampionMoveTiles,
  moveChampion,
  getSummonTiles,
  playCard,
  summonUnit,
  resolveSpell,
  resolveHandSelect,
  resolveFleshtitheSacrifice,
  cancelSpell,
  endActionPhase,
  getUnitMoveTiles,
  moveUnit,
  archerShoot,
  endTurn,
  discardCard,
  getSpellTargets,
  getArcherShootTargets,
  playerRevealUnit,
  triggerUnitAction,
} from '../engine/gameEngine.js';
import { runAITurn } from '../engine/ai.js';

const AI_PLAYER = 1;

export function useGameState({ deckId = 'human' } = {}) {
  const [state, setState] = useState(() => {
    const s = createInitialState(deckId, 'human'); // AI always human
    return autoAdvancePhase(s);
  });

  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  // Mode: null | 'summon' | 'spell' | 'unit_move' | 'archer_target' | 'hand_select' | 'fleshtithe_sacrifice'
  const [selectMode, setSelectMode] = useState(null);
  const [inspectedItem, setInspectedItem] = useState(null);

  const applyAndMaybeAI = useCallback((newState) => {
    setState(newState);
    if (newState.activePlayer === AI_PLAYER && !newState.winner) {
      setTimeout(() => {
        setState(prev => {
          if (prev.activePlayer !== AI_PLAYER || prev.winner) return prev;
          return runAITurn(prev);
        });
      }, 600);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCard(null);
    setSelectedUnit(null);
    setSelectMode(null);
  }, []);

  const NO_TARGET_SPELL_EFFECTS = new Set([
    'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
    'ironthorns', 'infernalpact', 'martiallaw', 'fortify',
  ]);

  const handleInspectUnit = useCallback((unit) => {
    setInspectedItem({ type: 'unit', uid: unit.uid });
  }, []);

  const handleInspectCard = useCallback((card) => {
    setInspectedItem({ type: 'card', card });
  }, []);

  const handleClearInspect = useCallback(() => {
    setInspectedItem(null);
  }, []);

  const handleInspectTerrain = useCallback(() => {
    setInspectedItem({ type: 'terrain', name: 'Throne' });
  }, []);

  // ── Phase helpers ─────────────────────────────────────────────────────

  const handleChampionMoveTile = useCallback((row, col) => {
    setState(prev => moveChampion(prev, row, col));
    clearSelection();
  }, [clearSelection]);

  const handlePlayCard = useCallback((cardUid) => {
    // Second click on the already-selected card → deselect
    if (cardUid === selectedCard) {
      setState(prev => cancelSpell(prev));
      clearSelection();
      return;
    }

    setSelectedUnit(null);
    setSelectMode(null);

    setState(prev => {
      // Cancel any leftover pending state from a previous selection
      const base = (prev.pendingSpell || prev.pendingSummon) ? cancelSpell(prev) : prev;
      const p = base.players[base.activePlayer];
      const card = p.hand.find(c => c.uid === cardUid);
      if (!card || p.resources < card.cost) return base;

      // Targetless spell: preview mode — don't execute yet
      if (card.type === 'spell' && NO_TARGET_SPELL_EFFECTS.has(card.effect)) {
        setSelectedCard(cardUid);
        setSelectMode('targetless_spell');
        return base;
      }

      const s = playCard(base, cardUid);
      if (s.pendingHandSelect) {
        setSelectedCard(cardUid);
        setSelectMode('hand_select');
      } else if (s.pendingSummon) {
        setSelectedCard(cardUid);
        setSelectMode('summon');
      } else if (s.pendingSpell) {
        setSelectedCard(cardUid);
        setSelectMode('spell');
      }
      return s;
    });
  }, [selectedCard, clearSelection]);

  const handleCastTargetlessSpell = useCallback(() => {
    if (!selectedCard || selectMode !== 'targetless_spell') return;
    const cardUid = selectedCard;
    setState(prev => playCard(prev, cardUid));
    clearSelection();
  }, [selectedCard, selectMode, clearSelection]);

  const handleSummonOnTile = useCallback((row, col) => {
    if (!selectedCard) return;
    setState(prev => {
      const s = summonUnit(prev, selectedCard, row, col);
      if (s.pendingHandSelect) {
        setSelectMode('hand_select');
      } else if (s.pendingFleshtitheSacrifice) {
        setSelectMode('fleshtithe_sacrifice');
      }
      return s;
    });
    if (!state.pendingHandSelect && !state.pendingFleshtitheSacrifice) {
      clearSelection();
    }
  }, [selectedCard, clearSelection, state]);

  const handleSpellTarget = useCallback((targetUid) => {
    if (!selectedCard && !state.pendingSpell) return;
    setState(prev => {
      const cardUid = prev.pendingSpell?.cardUid ?? selectedCard;
      const s = resolveSpell(prev, cardUid, targetUid);
      if (s.pendingSpell) {
        // multi-step spell continues
        setSelectMode('spell');
      } else {
        clearSelection();
      }
      return s;
    });
  }, [selectedCard, state, clearSelection]);

  const handleHandSelect = useCallback((cardUid) => {
    setState(prev => {
      const s = resolveHandSelect(prev, cardUid);
      if (s.pendingSpell) {
        setSelectMode('spell');
      } else {
        clearSelection();
      }
      return s;
    });
  }, [clearSelection]);

  const handleFleshtitheSacrifice = useCallback((choice, sacrificeUid) => {
    setState(prev => resolveFleshtitheSacrifice(prev, choice, sacrificeUid));
    clearSelection();
  }, [clearSelection]);

  const handleCancelSpell = useCallback(() => {
    setState(prev => cancelSpell(prev));
    clearSelection();
  }, [clearSelection]);

  const handleEndAction = useCallback(() => {
    setState(prev => endActionPhase(prev));
    clearSelection();
  }, [clearSelection]);

  const handleSelectChampion = useCallback(() => {
    setSelectedUnit(null);
    setSelectedCard(null);
    setSelectMode('champion_move');
  }, []);

  const handleSelectUnit = useCallback((unitUid) => {
    setSelectedUnit(unitUid);
    setSelectMode('unit_move');
  }, []);

  const handleMoveUnit = useCallback((row, col) => {
    if (!selectedUnit) return;
    setState(prev => moveUnit(prev, selectedUnit, row, col));
    clearSelection();
  }, [selectedUnit, clearSelection]);

  const handleArcherSelectTarget = useCallback((archerUid) => {
    setSelectedUnit(archerUid);
    setSelectMode('archer_target');
  }, []);

  const handleArcherShoot = useCallback((targetUid) => {
    if (!selectedUnit) return;
    setState(prev => archerShoot(prev, selectedUnit, targetUid));
    clearSelection();
  }, [selectedUnit, clearSelection]);

  const handleEndTurn = useCallback(() => {
    setState(prev => {
      const s = endTurn(prev);
      return s;
    });
    clearSelection();
    if (state.activePlayer !== AI_PLAYER) {
      setTimeout(() => {
        setState(prev => {
          if (prev.activePlayer === AI_PLAYER && !prev.winner) {
            return runAITurn(prev);
          }
          return prev;
        });
      }, 600);
    }
  }, [state.activePlayer, clearSelection]);

  const handleDiscardCard = useCallback((cardUid) => {
    setState(prev => {
      const s = discardCard(prev, cardUid);
      return s;
    });
    setTimeout(() => {
      setState(prev => {
        if (prev.activePlayer === AI_PLAYER && !prev.winner && !prev.pendingDiscard) {
          return runAITurn(prev);
        }
        return prev;
      });
    }, 600);
  }, []);

  const handleRevealUnit = useCallback((unitUid) => {
    setState(prev => playerRevealUnit(prev, unitUid));
    clearSelection();
  }, [clearSelection]);

  const handleTriggerUnitAction = useCallback((unitUid) => {
    setState(prev => {
      const s = triggerUnitAction(prev, unitUid);
      if (s.pendingSpell) {
        setSelectedCard(s.pendingSpell.cardUid);
        setSelectMode('spell');
      }
      return s;
    });
  }, []);

  const handleNewGame = useCallback(() => {
    const s = createInitialState(deckId, 'human');
    setState(autoAdvancePhase(s));
    clearSelection();
  }, [clearSelection, deckId]);

  // ── Derived highlight data ─────────────────────────────────────────────

  const championMoveTiles = state.phase === 'action' && state.activePlayer === 0 && selectMode === 'champion_move'
    ? getChampionMoveTiles(state)
    : [];

  const summonTiles = selectMode === 'summon'
    ? getSummonTiles(state)
    : [];

  const unitMoveTiles = selectMode === 'unit_move' && selectedUnit
    ? getUnitMoveTiles(state, selectedUnit)
    : [];

  const spellTargetUids = selectMode === 'spell' && state.pendingSpell
    ? (() => {
        const ps = state.pendingSpell;
        return getSpellTargets(state, ps.effect, ps.step || 0, ps.data || {});
      })()
    : [];

  const archerShootTargets = selectMode === 'archer_target' && selectedUnit
    ? getArcherShootTargets(state, selectedUnit)
    : [];

  return {
    state,
    selectedCard,
    selectedUnit,
    selectMode,
    inspectedItem,
    championMoveTiles,
    summonTiles,
    unitMoveTiles,
    spellTargetUids,
    archerShootTargets,
    handlers: {
      handleChampionMoveTile,
      handlePlayCard,
      handleCastTargetlessSpell,
      handleSummonOnTile,
      handleSpellTarget,
      handleHandSelect,
      handleFleshtitheSacrifice,
      handleCancelSpell,
      handleEndAction,
      handleSelectChampion,
      handleSelectUnit,
      handleMoveUnit,
      handleArcherSelectTarget,
      handleArcherShoot,
      handleEndTurn,
      handleDiscardCard,
      handleRevealUnit,
      handleTriggerUnitAction,
      handleNewGame,
      clearSelection,
      handleInspectUnit,
      handleInspectCard,
      handleClearInspect,
      handleInspectTerrain,
    },
  };
}
