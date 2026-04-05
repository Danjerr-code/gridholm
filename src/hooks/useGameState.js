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
} from '../engine/gameEngine.js';
import { runAITurn } from '../engine/ai.js';

const AI_PLAYER = 1;

export function useGameState() {
  const [state, setState] = useState(() => {
    const s = createInitialState();
    return autoAdvancePhase(s);
  });

  // Selected card uid (for summon/spell targeting)
  const [selectedCard, setSelectedCard] = useState(null);
  // Selected unit uid (for move targeting or archer shoot)
  const [selectedUnit, setSelectedUnit] = useState(null);
  // Mode: null | 'summon' | 'spell' | 'unit_move' | 'archer_target'
  const [selectMode, setSelectMode] = useState(null);
  // Inspected item for detail panel: null | { type: 'unit', uid: string } | { type: 'card', card: object } | { type: 'terrain', name: string }
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
    // Clear any selected unit so its move highlights don't persist while playing a card.
    setSelectedUnit(null);
    setSelectMode(null);
    setState(prev => {
      const s = playCard(prev, cardUid);
      if (s.pendingSummon) {
        setSelectedCard(cardUid);
        setSelectMode('summon');
      } else if (s.pendingSpell) {
        setSelectedCard(cardUid);
        setSelectMode('spell');
      }
      return s;
    });
  }, []);

  const handleSummonOnTile = useCallback((row, col) => {
    if (!selectedCard) return;
    setState(prev => {
      const s = summonUnit(prev, selectedCard, row, col);
      return s;
    });
    clearSelection();
  }, [selectedCard, clearSelection]);

  const handleSpellTarget = useCallback((targetUid) => {
    if (!selectedCard) return;
    setState(prev => resolveSpell(prev, selectedCard, targetUid));
    clearSelection();
  }, [selectedCard, clearSelection]);

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
    // Clear previous selection immediately before setting new one, ensuring
    // old unit's move tiles are not shown alongside the new unit's tiles.
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

  const handleNewGame = useCallback(() => {
    const s = createInitialState();
    setState(autoAdvancePhase(s));
    clearSelection();
  }, [clearSelection]);

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

  const spellTargetUids = selectMode === 'spell' && selectedCard
    ? (() => {
        const card = state.players[state.activePlayer].hand.find(c => c.uid === selectedCard);
        return card ? getSpellTargets(state, card.effect) : [];
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
      handleSummonOnTile,
      handleSpellTarget,
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
      handleNewGame,
      clearSelection,
      handleInspectUnit,
      handleInspectCard,
      handleClearInspect,
      handleInspectTerrain,
    },
  };
}
