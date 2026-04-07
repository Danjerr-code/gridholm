import { useState, useCallback, useEffect, useRef } from 'react';
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
  endActionAndTurn,
  getUnitMoveTiles,
  moveUnit,
  archerShoot,
  discardCard,
  getSpellTargets,
  getArcherShootTargets,
  playerRevealUnit,
  triggerUnitAction,
} from '../engine/gameEngine.js';
import { runAITurn } from '../engine/ai.js';
import { playTurnStartSound } from '../audio.js';

const AI_PLAYER = 1;

export function useGameState({ deckId = 'human' } = {}) {
  const [state, setState] = useState(() => {
    const s = createInitialState(deckId, 'human'); // AI always human
    return autoAdvancePhase(s);
  });

  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  // Mode: null | 'summon' | 'spell' | 'unit_move' | 'archer_target' | 'hand_select' | 'fleshtithe_sacrifice' | 'action_confirm'
  const [selectMode, setSelectMode] = useState(null);

  // Units whose action needs a target (routes through pendingSpell / resolveSpell)
  const TARGETED_ACTION_UNITS = new Set(['battlepriestunit', 'woodlandguard', 'packrunner', 'elfarcher']);
  const [inspectedItem, setInspectedItem] = useState(null);

  // Trigger AI turn if AI wins the coin flip and goes first on initial mount or new game.
  useEffect(() => {
    if (state.activePlayer === AI_PLAYER && !state.winner) {
      const timeout = setTimeout(() => {
        setState(prev => {
          if (prev.activePlayer !== AI_PLAYER || prev.winner) return prev;
          return runAITurn(prev);
        });
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Play a chime when control returns to the local player (player 0) after the AI acts.
  const prevActivePlayerRef = useRef(null);
  useEffect(() => {
    if (prevActivePlayerRef.current === null) {
      prevActivePlayerRef.current = state.activePlayer;
      return;
    }
    if (prevActivePlayerRef.current !== state.activePlayer && state.activePlayer !== AI_PLAYER && !state.winner) {
      playTurnStartSound();
    }
    prevActivePlayerRef.current = state.activePlayer;
  }, [state.activePlayer, state.winner]);

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
    'ancientspring', 'shadowveil',
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
      // Block normal card play while awaiting a hand-card selection (e.g. Pact of Ruin, Chaos Spawn)
      if (prev.pendingHandSelect) return prev;
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

      if (card.effect === 'pactofruin') {
        console.log('[PactOfRuin] useGameState handlePlayCard: calling playCard for pactofruin. cardUid:', cardUid, 'hand size:', p.hand.length, 'resources:', p.resources);
      }
      const s = playCard(base, cardUid);
      if (card.effect === 'pactofruin') {
        console.log('[PactOfRuin] useGameState handlePlayCard: playCard returned. pendingHandSelect:', JSON.stringify(s.pendingHandSelect), 'pendingSpell:', JSON.stringify(s.pendingSpell));
      }
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
      } else {
        setSelectedCard(null);
        setSelectedUnit(null);
        setSelectMode(null);
      }
      return s;
    });
  }, [selectedCard]);

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
      const hs = prev.pendingHandSelect;
      console.log('[PactOfRuin] handleHandSelect: card clicked while pendingHandSelect active. cardUid:', cardUid, 'reason:', hs?.reason, 'isPactOfRuin:', hs?.reason === 'pactofruin');
      const s = resolveHandSelect(prev, cardUid);
      console.log('[PactOfRuin] handleHandSelect: resolveHandSelect returned. pendingHandSelect:', JSON.stringify(s.pendingHandSelect), 'pendingSpell:', JSON.stringify(s.pendingSpell));
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
    setState(prev => endActionAndTurn(prev));
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

  // Unified action button handler: targeted units go to spell targeting; untargeted show confirmation.
  const handleActionButtonClick = useCallback((unitUid) => {
    setState(prev => {
      const unit = prev.units.find(u => u.uid === unitUid);
      if (!unit) return prev;
      if (TARGETED_ACTION_UNITS.has(unit.id)) {
        const s = triggerUnitAction(prev, unitUid);
        if (s.pendingSpell) {
          setSelectedCard(s.pendingSpell.cardUid);
          setSelectMode('spell');
        }
        return s;
      }
      // Untargeted: enter confirmation mode without dispatching yet
      setSelectMode('action_confirm');
      return prev;
    });
  }, [TARGETED_ACTION_UNITS]);

  const handleConfirmAction = useCallback(() => {
    if (!selectedUnit) return;
    setState(prev => {
      const s = triggerUnitAction(prev, selectedUnit);
      return s;
    });
    clearSelection();
  }, [selectedUnit, clearSelection]);

  const handleNewGame = useCallback(() => {
    const s = createInitialState(deckId, 'human');
    applyAndMaybeAI(autoAdvancePhase(s));
    clearSelection();
  }, [clearSelection, deckId, applyAndMaybeAI]);

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

  const sacrificeTargetUids = selectMode === 'fleshtithe_sacrifice' && state.pendingFleshtitheSacrifice
    ? state.units
        .filter(u => u.owner === state.activePlayer && u.uid !== state.pendingFleshtitheSacrifice.unitUid)
        .map(u => u.uid)
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
    sacrificeTargetUids,
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
      handleDiscardCard,
      handleRevealUnit,
      handleTriggerUnitAction,
      handleActionButtonClick,
      handleConfirmAction,
      handleNewGame,
      clearSelection,
      handleInspectUnit,
      handleInspectCard,
      handleClearInspect,
      handleInspectTerrain,
    },
  };
}
