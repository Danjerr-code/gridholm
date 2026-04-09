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
  getChampionAbilityTargets,
  applyChampionAbility,
  getTerrainCastTiles,
  castTerrainCard,
  getApproachTiles,
  executeApproachAndAttack,
  manhattan,
  resolveLineBlast,
} from '../engine/gameEngine.js';
import { FACTION_INFO } from '../engine/cards.js';
import { runAITurnSteps } from '../engine/ai.js';
import { playTurnStartSound } from '../audio.js';

const AI_PLAYER = 1;
const AI_DECKS = ['human', 'beast', 'elf', 'demon'];

function pickRandomAiDeck() {
  return AI_DECKS[Math.floor(Math.random() * AI_DECKS.length)];
}

function createStateWithAiLog(deckId, aiDeckId) {
  const s = createInitialState(deckId, aiDeckId);
  const aiName = FACTION_INFO[aiDeckId]?.name ?? aiDeckId;
  return { ...s, log: [...s.log, `AI is playing ${aiName}.`] };
}

export function useGameState({ deckId = 'human' } = {}) {
  const [state, setState] = useState(() => {
    const aiDeckId = pickRandomAiDeck();
    return autoAdvancePhase(createStateWithAiLog(deckId, aiDeckId));
  });

  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  // Mode: null | 'summon' | 'spell' | 'unit_move' | 'archer_target' | 'hand_select' | 'fleshtithe_sacrifice' | 'action_confirm' | 'champion_ability' | 'approach_select'
  const [selectMode, setSelectMode] = useState(null);
  // Active champion ability targeting: { abilityId, targetFilter } | null
  const [pendingChampionAbility, setPendingChampionAbility] = useState(null);
  // Pending approach+attack: { unitUid, targetRow, targetCol } | null
  const [pendingApproach, setPendingApproach] = useState(null);

  // Units whose action needs a target (routes through pendingSpell / resolveSpell)
  const TARGETED_ACTION_UNITS = new Set(['battlepriestunit', 'woodlandguard', 'packrunner', 'elfarcher', 'clockworkmanimus']);
  const [inspectedItem, setInspectedItem] = useState(null);

  // True while the AI is computing its turn (shows "Thinking..." in UI)
  const [aiThinking, setAiThinking] = useState(false);

  // Ref tracking latest committed state so scheduleAITurn can read it outside setState.
  const latestStateRef = useRef(state);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  // Guard against double-scheduling a concurrent AI turn.
  const aiRunningRef = useRef(false);

  // Schedules an AI turn in two phases:
  // Phase 1 — Yield once to the browser event loop (setTimeout 0), then compute all AI
  //   decisions synchronously and store them as an ordered step list. No state changes yet.
  //   UI shows "AI is thinking…" throughout.
  // Phase 2 — Replay each step one at a time with a fixed 800ms delay so the player can
  //   follow each move, summon, or spell at a predictable rhythm.
  //   "AI is thinking…" is cleared before replay begins.
  // Only game-state actions are blocked during both phases; card inspection and log reading
  // remain available throughout.
  const scheduleAITurn = useCallback(() => {
    if (aiRunningRef.current) return;
    aiRunningRef.current = true;
    setAiThinking(true);
    // Phase 1: yield to the browser event loop once so any queued UI interactions
    // (inspect clicks, log scrolls) are processed before computation begins.
    setTimeout(async () => {
      const currentState = latestStateRef.current;
      if (currentState.activePlayer !== AI_PLAYER || currentState.winner) {
        setAiThinking(false);
        aiRunningRef.current = false;
        return;
      }
      // Compute all AI decisions synchronously — no yielding during computation.
      const steps = runAITurnSteps(currentState);
      // AI has decided — clear thinking indicator before starting visual replay.
      setAiThinking(false);
      // Phase 2: replay each step at a fixed 800ms cadence so the turn duration is
      // predictable (~800ms × number of actions).
      for (let i = 0; i < steps.length; i++) {
        setState(steps[i]);
        if (i < steps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
      aiRunningRef.current = false;
    }, 0);
  }, []); // reads only from stable refs — no state deps needed

  // Trigger AI turn if AI wins the coin flip and goes first on initial mount or new game.
  useEffect(() => {
    if (state.activePlayer === AI_PLAYER && !state.winner) {
      scheduleAITurn();
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
    latestStateRef.current = newState;
    setState(newState);
    if (newState.activePlayer === AI_PLAYER && !newState.winner) {
      scheduleAITurn();
    }
  }, [scheduleAITurn]);

  const clearSelection = useCallback(() => {
    setSelectedCard(null);
    setSelectedUnit(null);
    setSelectMode(null);
    setPendingChampionAbility(null);
    setPendingApproach(null);
  }, []);

  const NO_TARGET_SPELL_EFFECTS = new Set([
    'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
    'ironthorns', 'infernalpact', 'martiallaw', 'fortify',
    'ancientspring', 'shadowveil',
  ]);

  const handleInspectUnit = useCallback((unit) => {
    setInspectedItem({ type: 'unit', uid: unit.uid });
  }, []);

  const handleInspectChampion = useCallback((playerIdx = 0) => {
    setInspectedItem({ type: 'champion', playerIdx });
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
      } else if (s.pendingTerrainCast) {
        setSelectedCard(cardUid);
        setSelectMode('terrain_cast');
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
        scheduleAITurn();
      }
      return s;
    });
  }, [clearSelection, scheduleAITurn]);

  const handleFleshtitheSacrifice = useCallback((choice, sacrificeUid) => {
    setState(prev => resolveFleshtitheSacrifice(prev, choice, sacrificeUid));
    clearSelection();
  }, [clearSelection]);

  const handleCancelSpell = useCallback(() => {
    setState(prev => cancelSpell(prev));
    clearSelection();
  }, [clearSelection]);

  const handleEndAction = useCallback(() => {
    setState(prev => {
      const next = endActionAndTurn(prev);
      latestStateRef.current = next;
      return next;
    });
    clearSelection();
    if (state.activePlayer !== AI_PLAYER) {
      scheduleAITurn();
    }
  }, [state.activePlayer, clearSelection, scheduleAITurn]);

  const handleSelectChampion = useCallback(() => {
    setSelectedUnit(null);
    setSelectedCard(null);
    setPendingChampionAbility(null);
    setSelectMode('champion_move');
  }, []);

  // Activate a champion ability. If it requires targeting, enters champion_ability mode.
  // If targetless (dark_pact), applies immediately.
  const handleChampionAbilityActivate = useCallback((abilityId, targetFilter) => {
    if (!targetFilter) {
      // Targetless — apply immediately (e.g. Dark Pact)
      setState(prev => applyChampionAbility(prev, 0, abilityId, null));
      return;
    }
    setPendingChampionAbility({ abilityId, targetFilter });
    setSelectMode('champion_ability');
  }, []);

  const handleChampionAbilityTarget = useCallback((targetUid) => {
    if (!pendingChampionAbility) return;
    setState(prev => applyChampionAbility(prev, 0, pendingChampionAbility.abilityId, targetUid));
    setPendingChampionAbility(null);
    setSelectMode(null);
  }, [pendingChampionAbility]);

  const handleChampionAbilityCancel = useCallback(() => {
    setPendingChampionAbility(null);
    setSelectMode(null);
  }, []);

  const handleSelectUnit = useCallback((unitUid) => {
    setSelectedUnit(unitUid);
    setSelectMode('unit_move');
  }, []);

  const handleMoveUnit = useCallback((row, col) => {
    if (!selectedUnit) return;
    let enteringApproach = false;
    setState(prev => {
      const unit = prev.units.find(u => u.uid === selectedUnit);
      const targetHasEnemy = prev.units.some(u => u.owner !== prev.activePlayer && u.row === row && u.col === col)
        || prev.champions.some(ch => ch.owner !== prev.activePlayer && ch.row === row && ch.col === col);
      if (unit && targetHasEnemy && manhattan([unit.row, unit.col], [row, col]) > 1) {
        const tiles = getApproachTiles(prev, unit, row, col);
        if (tiles.length > 1) {
          enteringApproach = true;
          return prev;
        }
      }
      return moveUnit(prev, selectedUnit, row, col);
    });
    if (enteringApproach) {
      setPendingApproach({ unitUid: selectedUnit, targetRow: row, targetCol: col });
      setSelectMode('approach_select');
    } else {
      clearSelection();
    }
  }, [selectedUnit, clearSelection]);

  const handleApproachTileChosen = useCallback((approachRow, approachCol) => {
    if (!pendingApproach) return;
    const { unitUid, targetRow, targetCol } = pendingApproach;
    setState(prev => executeApproachAndAttack(prev, unitUid, approachRow, approachCol, targetRow, targetCol));
    setPendingApproach(null);
    clearSelection();
  }, [pendingApproach, clearSelection]);

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
      const next = discardCard(prev, cardUid);
      latestStateRef.current = next;
      return next;
    });
    scheduleAITurn();
  }, [scheduleAITurn]);

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
      // Vorn: direction selection mode
      if (unit.id === 'vornthundercaller') {
        const s = triggerUnitAction(prev, unitUid);
        if (s.pendingLineBlast) {
          setSelectMode('direction_select');
        }
        return s;
      }
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

  const handleLineBlastDirection = useCallback((direction) => {
    if (!selectedUnit) return;
    setState(prev => {
      const lb = prev.pendingLineBlast;
      if (!lb) return prev;
      return resolveLineBlast(prev, lb.unitUid, direction);
    });
    clearSelection();
  }, [selectedUnit, clearSelection]);

  const handleConfirmAction = useCallback(() => {
    if (!selectedUnit) return;
    setState(prev => {
      const s = triggerUnitAction(prev, selectedUnit);
      return s;
    });
    clearSelection();
  }, [selectedUnit, clearSelection]);

  const handleTerrainCast = useCallback((row, col) => {
    if (!selectedCard) return;
    setState(prev => {
      const s = castTerrainCard(prev, selectedCard, row, col);
      return s;
    });
    clearSelection();
  }, [selectedCard, clearSelection]);

  const handleNewGame = useCallback(() => {
    const aiDeckId = pickRandomAiDeck();
    applyAndMaybeAI(autoAdvancePhase(createStateWithAiLog(deckId, aiDeckId)));
    clearSelection();
  }, [clearSelection, deckId, applyAndMaybeAI]);

  // ── Derived highlight data ─────────────────────────────────────────────

  const championMoveTiles = state.phase === 'action' && state.activePlayer === 0 && selectMode === 'champion_move'
    ? getChampionMoveTiles(state)
    : [];

  const championAbilityTargetUids = selectMode === 'champion_ability' && pendingChampionAbility
    ? getChampionAbilityTargets(state, 0, pendingChampionAbility.targetFilter)
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

  const terrainTargetTiles = selectMode === 'terrain_cast'
    ? getTerrainCastTiles(state)
    : [];

  const approachTiles = selectMode === 'approach_select' && pendingApproach
    ? (() => {
        const unit = state.units.find(u => u.uid === pendingApproach.unitUid);
        return unit ? getApproachTiles(state, unit, pendingApproach.targetRow, pendingApproach.targetCol) : [];
      })()
    : [];

  return {
    state,
    selectedCard,
    selectedUnit,
    selectMode,
    inspectedItem,
    aiThinking,
    pendingChampionAbility,
    championMoveTiles,
    championAbilityTargetUids,
    summonTiles,
    unitMoveTiles,
    approachTiles,
    terrainTargetTiles,
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
      handleChampionAbilityActivate,
      handleChampionAbilityTarget,
      handleChampionAbilityCancel,
      handleSelectUnit,
      handleMoveUnit,
      handleApproachTileChosen,
      handleArcherSelectTarget,
      handleArcherShoot,
      handleDiscardCard,
      handleRevealUnit,
      handleTriggerUnitAction,
      handleActionButtonClick,
      handleConfirmAction,
      handleLineBlastDirection,
      handleNewGame,
      handleTerrainCast,
      clearSelection,
      handleInspectUnit,
      handleInspectChampion,
      handleInspectCard,
      handleClearInspect,
      handleInspectTerrain,
    },
  };
}
