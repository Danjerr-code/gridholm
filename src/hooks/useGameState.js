import { useState, useCallback } from 'react';
import {
  createInitialState,
  autoAdvancePhase,
  getChampionMoveTiles,
  moveChampion,
  skipChampionMove,
  endChampionMovePhase,
  getSummonTiles,
  playCard,
  summonUnit,
  resolveSpell,
  cancelSpell,
  endSummonCastPhase,
  getUnitMoveTiles,
  moveUnit,
  archerShoot,
  endUnitMovePhase,
  endTurn,
  discardCard,
  getSpellTargets,
  getArcherShootTargets,
} from '../engine/gameEngine.js';
import { runAITurn } from '../engine/ai.js';

const AI_PLAYER = 1;

export function useGameState() {
  const [state, setState] = useState(() => {
    const s = createInitialState();
    return autoAdvancePhase(autoAdvancePhase(s));
  });

  // Selected card uid (for summon/spell targeting)
  const [selectedCard, setSelectedCard] = useState(null);
  // Selected unit uid (for move targeting or archer shoot)
  const [selectedUnit, setSelectedUnit] = useState(null);
  // Mode: null | 'summon' | 'spell' | 'unit_move' | 'archer_target'
  const [selectMode, setSelectMode] = useState(null);
  // Inspected item for detail panel: null | { type: 'unit', uid: string } | { type: 'card', card: object }
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

  // ── Phase helpers ─────────────────────────────────────────────────────

  const handleChampionMoveTile = useCallback((row, col) => {
    setState(prev => {
      const s = moveChampion(prev, row, col);
      s.phase = 'summon_cast';
      return s;
    });
    clearSelection();
  }, [clearSelection]);

  const handleSkipChampionMove = useCallback(() => {
    setState(prev => skipChampionMove(prev));
    clearSelection();
  }, [clearSelection]);

  const handleEndChampionMove = useCallback(() => {
    setState(prev => endChampionMovePhase(prev));
    clearSelection();
  }, [clearSelection]);

  const handlePlayCard = useCallback((cardUid) => {
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

  const handleEndSummonCast = useCallback(() => {
    setState(prev => endSummonCastPhase(prev));
    clearSelection();
  }, [clearSelection]);

  const handleSelectUnit = useCallback((unitUid) => {
    setState(prev => {
      if (prev.phase !== 'unit_move' || prev.activePlayer === AI_PLAYER) return prev;
      const unit = prev.units.find(u => u.uid === unitUid);
      if (!unit || unit.owner !== prev.activePlayer || unit.summoned || unit.moved) return prev;
      setSelectedUnit(unitUid);
      setSelectMode('unit_move');
      return prev;
    });
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

  const handleEndUnitMove = useCallback(() => {
    setState(prev => endUnitMovePhase(prev));
    clearSelection();
  }, [clearSelection]);

  const handleEndTurn = useCallback(() => {
    setState(prev => {
      const s = endTurn(prev);
      return s;
    });
    clearSelection();
    if (state.activePlayer !== AI_PLAYER) {
      // After end turn, check if now AI's turn
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
    // After discard, if turn advanced to AI, trigger AI
    setTimeout(() => {
      setState(prev => {
        if (prev.activePlayer === AI_PLAYER && !prev.winner && !prev.pendingDiscard) {
          return runAITurn(prev);
        }
        return prev;
      });
    }, 600);
  }, []);

  const handleNewGame = useCallback(() => {
    const s = createInitialState();
    setState(autoAdvancePhase(autoAdvancePhase(s)));
    clearSelection();
  }, [clearSelection]);

  // ── Derived highlight data ─────────────────────────────────────────────

  const championMoveTiles = state.phase === 'champion_move' && state.activePlayer === 0
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
      handleSkipChampionMove,
      handleEndChampionMove,
      handlePlayCard,
      handleSummonOnTile,
      handleSpellTarget,
      handleCancelSpell,
      handleEndSummonCast,
      handleSelectUnit,
      handleMoveUnit,
      handleArcherSelectTarget,
      handleArcherShoot,
      handleEndUnitMove,
      handleEndTurn,
      handleDiscardCard,
      handleNewGame,
      clearSelection,
      handleInspectUnit,
      handleInspectCard,
      handleClearInspect,
    },
  };
}
