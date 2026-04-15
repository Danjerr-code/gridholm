import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../supabase.js';
import {
  createInitialState,
  autoAdvancePhase,
  submitMulligan,
  getChampionMoveTiles,
  getSummonTiles,
  playCard,
  summonUnit,
  getUnitMoveTiles,
  getSpellTargets,
  getArcherShootTargets,
  triggerUnitAction,
  getChampionAbilityTargets,
  getChampionDef,
  getTerrainCastTiles,
  getAmethystCacheTiles,
  getApproachTiles,
  manhattan,
  resolveLineBlast,
  getEffectiveCost,
  cloneState,
} from '../engine/gameEngine.js';
import { FACTION_INFO } from '../engine/cards.js';
import { runAITurnSteps } from '../engine/ai.js';
import { chooseMulligan } from '../engine/strategicAI.js';
import {
  handleChampionMove,
  handleUnitMove,
  handleTriggerUnitAction as execTriggerUnitAction,
  handleSpellTarget as execSpellTarget,
  handleCancelSpell as execCancelSpell,
  handleHandSelect as execHandSelect,
  handleGraveSelect as execGraveSelect,
  handleEndTurn,
  handleArcherShoot as execArcherShoot,
  handleDiscardCard as execDiscardCard,
  handleRevealUnit as execRevealUnit,
  handleDirectionTileSelect as execDirectionTileSelect,
  handleApproachAttack,
  handleChampionAbility as execChampionAbility,
  handleChampionSaplingPlace as execChampionSaplingPlace,
  handleDeckPeekSelect as execDeckPeekSelect,
  handleGlimpseDecision as execGlimpseDecision,
  handleScryDismiss as execScryDismiss,
  handleContractSelect as execContractSelect,
  handleBloodPactFriendly as execBloodPactFriendly,
  handleBloodPactEnemy as execBloodPactEnemy,
  handleFleshtitheSacrifice as execFleshtitheSacrifice,
  handleTerrainCast as execTerrainCast,
  handleRelicPlace as execRelicPlace,
} from '../engine/actionHandler.js';
import {
  playTurnStartSound,
  playSfxAttack, playSfxMove, playSfxDraw, playSfxSpell,
  playSfxNoMana, playSfxWin, playSfxUheal, playSfxCheal, playSfxAttackBlock,
  playUnitSummonSound,
} from '../audio.js';

const AI_PLAYER = 1;
const AI_DECKS = ['human', 'beast', 'elf', 'demon'];

function pickRandomAiDeck() {
  // Draft mode injects a custom AI deck spec via localStorage before launching the game.
  const draftAiDeck = localStorage.getItem('gridholm_draft_ai_deck');
  if (draftAiDeck) {
    localStorage.removeItem('gridholm_draft_ai_deck');
    return draftAiDeck;
  }
  return AI_DECKS[Math.floor(Math.random() * AI_DECKS.length)];
}

function createStateWithAiLog(deckId, aiDeckId) {
  console.log(`[createInitialState] Player 1 deckId="${deckId}" | AI (Player 2) deckId="${aiDeckId}"`);
  const s = createInitialState(deckId, aiDeckId);
  const aiName = FACTION_INFO[aiDeckId]?.name ?? aiDeckId;
  const aiChampDef = getChampionDef(s.players[1]);
  return { ...s, log: [...s.log, `AI is playing ${aiName} with ${aiChampDef.name}.`] };
}

export function useGameState({ deckId = 'human', gameMode = 'quickplay' } = {}) {
  const [state, setState] = useState(() => {
    const aiDeckId = pickRandomAiDeck();
    console.log(`[useGameState] Initializing game | Player 1 deckId="${deckId}" | AI deckId="${aiDeckId}"`);
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
  const TARGETED_ACTION_UNITS = new Set(['battlepriestunit', 'woodlandguard', 'packrunner', 'elfarcher', 'clockworkmanimus', 'rootsongcommander', 'bloodaltar']);
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
  // Skip during mulligan phase — the human player submits mulligan first.
  useEffect(() => {
    if (state.activePlayer === AI_PLAYER && !state.winner && state.phase !== 'mulligan') {
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
      playSfxDraw();
    }
    prevActivePlayerRef.current = state.activePlayer;
  }, [state.activePlayer, state.winner]);

  // Play win sound when player 0 wins.
  const prevWinnerRef = useRef(null);
  useEffect(() => {
    const p0Name = state.players[0].name;
    if (state.winner === p0Name && !prevWinnerRef.current) {
      console.log('[audio] sfx-win triggered for winning player:', state.winner);
      playSfxWin();
    }
    prevWinnerRef.current = state.winner;
  }, [state.winner]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist replay data on game completion (quickplay and draft only, not tutorial).
  // Fire-and-forget: failures are logged but never surface to the player.
  const replayPersistedRef = useRef(false);
  useEffect(() => {
    if (!state.winner || replayPersistedRef.current) return;
    if (gameMode === 'tutorial') return;
    if (!supabase) return;
    replayPersistedRef.current = true;

    const p1 = state.players[0];
    const p2 = state.players[1];
    const winnerValue = state.winner === p1.name ? 'p1' : state.winner === p2.name ? 'p2' : 'draw';

    const getCardIds = (player) => [
      ...(player.hand || []),
      ...(player.deck || []),
      ...(player.discard || []),
      ...(player.grave || []),
      ...(player.banished || []),
    ].map(c => c.id);

    const { stateHistory, ...finalState } = state;

    supabase.from('match_replays').insert({
      game_mode: gameMode,
      p1_faction: p1.deckId ?? null,
      p2_faction: p2.deckId ?? null,
      p1_deck: getCardIds(p1),
      p2_deck: getCardIds(p2),
      winner: winnerValue,
      total_turns: state.turn ?? 0,
      state_history: stateHistory ?? [],
      final_state: finalState,
    }).then(({ error }) => {
      if (error) console.warn('[Replay] Insert failed:', error.message);
    });
  }, [state.winner]); // eslint-disable-line react-hooks/exhaustive-deps

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
    'ancientspring', 'shadowveil', 'verdantsurge', 'predatorsmark',
    'agonizingsymphony', 'pestilence', 'fatesledger', 'seconddawn',
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

  const handleInspectTerrain = useCallback((terrain) => {
    if (terrain?.cardId) {
      setInspectedItem({ type: 'terrain', terrain });
    } else {
      setInspectedItem({ type: 'terrain', name: 'Throne' });
    }
  }, []);

  // ── Phase helpers ─────────────────────────────────────────────────────

  const handleChampionMoveTile = useCallback((row, col) => {
    playSfxMove();
    setState(prev => handleChampionMove(prev, row, col));
    clearSelection();
  }, [clearSelection]);

  const handlePlayCard = useCallback((cardUid) => {
    // Second click on the already-selected card → deselect
    if (cardUid === selectedCard) {
      setState(prev => execCancelSpell(prev));
      clearSelection();
      return;
    }

    setSelectedUnit(null);

    setState(prev => {
      // Block normal card play while awaiting a hand-card selection (e.g. Pact of Ruin, Chaos Spawn).
      // Guard BEFORE setSelectMode(null) so a drag-triggered handlePlayCard during pendingHandSelect
      // cannot corrupt the selectMode and break the discard UI.
      if (prev.pendingHandSelect) return prev;
      setSelectMode(null);
      // Auto-decline any pending Flesh Tithe sacrifice before processing new card
      const preFT = prev.pendingFleshtitheSacrifice ? execFleshtitheSacrifice(prev, 'no', null) : prev;
      // Cancel any leftover pending state from a previous selection
      const base = (preFT.pendingSpell || preFT.pendingSummon || preFT.pendingTerrainCast || preFT.pendingRelicPlace) ? execCancelSpell(preFT) : preFT;
      const p = base.players[base.activePlayer];
      const graveAccessActive = base.graveAccessActive?.[base.activePlayer];
      const card = p.hand.find(c => c.uid === cardUid)
        || (graveAccessActive && (p.grave || []).find(c => c.uid === cardUid));
      const effectiveCost = card ? getEffectiveCost(card, base, base.activePlayer) : 0;
      if (!card || p.resources < effectiveCost) {
        if (card && p.resources < effectiveCost) playSfxNoMana();
        return base;
      }

      // Targetless spell (and Pact of Ruin): preview mode — don't execute yet
      if (card.type === 'spell' && (NO_TARGET_SPELL_EFFECTS.has(card.effect) || card.effect === 'pactofruin')) {
        setSelectedCard(cardUid);
        setSelectMode('targetless_spell');
        return base;
      }

      const s = playCard(base, cardUid);
      console.log(`[handlePlayCard] cardUid=${cardUid} pendingRelicPlace=${JSON.stringify(s.pendingRelicPlace)}`);
      if (s.pendingHandSelect) {
        setSelectedCard(cardUid);
        setSelectMode('hand_select');
      } else if (s.pendingSummon) {
        setSelectedCard(cardUid);
        setSelectMode('summon');
      } else if (s.pendingTerrainCast) {
        setSelectedCard(cardUid);
        setSelectMode('terrain_cast');
      } else if (s.pendingRelicPlace) {
        setSelectedCard(cardUid);
        setSelectMode('relic_place');
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
    playSfxSpell();
    // Pact of Ruin sets pendingHandSelect after cast; all other targetless spells complete immediately.
    const card = state.players[state.activePlayer].hand.find(c => c.uid === cardUid);
    setState(prev => playCard(prev, cardUid));
    if (card?.effect === 'pactofruin') {
      setSelectedCard(null);
      setSelectedUnit(null);
      setSelectMode('hand_select');
    } else {
      clearSelection();
    }
  }, [selectedCard, selectMode, state, clearSelection]);

  const handleSummonOnTile = useCallback((row, col) => {
    if (!selectedCard) return;
    setState(prev => {
      const s = summonUnit(prev, selectedCard, row, col);
      playUnitSummonSound();
      if (s.pendingHandSelect) {
        setSelectMode('hand_select');
      } else if (s.pendingFleshtitheSacrifice) {
        setSelectMode('fleshtithe_sacrifice');
      } else if (s.pendingSpell) {
        setSelectMode('spell');
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
      const prevChampHp = prev.champions[0]?.hp;
      const prevUnitHps = prev.units.filter(u => u.owner === 0).map(u => ({ uid: u.uid, hp: u.hp }));
      const s = execSpellTarget(prev, cardUid, targetUid);
      if (s.pendingSpell) {
        // multi-step spell continues
        setSelectMode('spell');
      } else if (s.pendingHandSelect) {
        // Spell step completed but a hand-select is now required (e.g. Toll of Shadows discard)
        playSfxSpell();
        setSelectMode('hand_select');
      } else {
        playSfxSpell();
        clearSelection();
      }
      // Detect heal: champion
      if ((s.champions[0]?.hp ?? 0) > prevChampHp) playSfxCheal();
      // Detect heal: friendly unit
      const healed = prevUnitHps.find(({ uid, hp }) => {
        const after = s.units.find(u => u.uid === uid);
        return after && after.hp > hp;
      });
      if (healed) playSfxUheal();
      return s;
    });
  }, [selectedCard, state, clearSelection]);

  const handleHandSelect = useCallback((cardUid) => {
    setState(prev => {
      const hs = prev.pendingHandSelect;
      console.log('[PactOfRuin] handleHandSelect: card clicked while pendingHandSelect active. cardUid:', cardUid, 'reason:', hs?.reason, 'isPactOfRuin:', hs?.reason === 'pactofruin');
      const s = execHandSelect(prev, cardUid);
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

  const handleGraveSelect = useCallback((cardUid) => {
    setState(prev => {
      const s = execGraveSelect(prev, cardUid);
      if (s.pendingSummon?.rebirthMode) {
        setSelectedCard(s.pendingSummon.card.uid);
        setSelectMode('summon');
      } else if (s.pendingSpell) {
        setSelectMode('spell');
      } else {
        clearSelection();
        scheduleAITurn();
      }
      return s;
    });
  }, [clearSelection, scheduleAITurn]);

  const [selectedSacrificeUid, setSelectedSacrificeUid] = useState(null);

  const handleFleshtitheSacrificeSelect = useCallback((uid) => {
    setSelectedSacrificeUid(uid);
  }, []);

  const handleFleshtitheSacrifice = useCallback((choice, sacrificeUid) => {
    setState(prev => execFleshtitheSacrifice(prev, choice, sacrificeUid));
    setSelectedSacrificeUid(null);
    clearSelection();
  }, [clearSelection]);

  const handleContractSelect = useCallback((contractId) => {
    setState(prev => {
      const s = execContractSelect(prev, contractId);
      // If Blood Pact selected, stay in action phase with pendingBloodPact set
      // If Dark Bargain selected, pendingHandSelect is set — wire up selectMode so Hand shows discard UI
      if (s.pendingHandSelect) {
        setSelectMode('hand_select');
      }
      return s;
    });
  }, []);

  const handleBloodPactSelect = useCallback((unitUid) => {
    setState(prev => {
      if (prev.pendingBloodPact?.step === 'selectFriendly') {
        return execBloodPactFriendly(prev, unitUid);
      }
      if (prev.pendingBloodPact?.step === 'selectEnemy') {
        const s = execBloodPactEnemy(prev, unitUid);
        // Blood Pact complete — schedule AI if needed
        if (!s.pendingBloodPact && s.activePlayer === 1 && !s.winner) {
          scheduleAITurn();
        }
        return s;
      }
      return prev;
    });
  }, [scheduleAITurn]);

  const handleCancelSpell = useCallback(() => {
    setState(prev => execCancelSpell(prev));
    clearSelection();
  }, [clearSelection]);

  const handleEndAction = useCallback(() => {
    setState(prev => {
      const next = handleEndTurn(prev);
      latestStateRef.current = next;
      return next;
    });
    clearSelection();
    if (latestStateRef.current?.pendingHandSelect) {
      // Clockwork Manimus (or similar) paused turn advance waiting for discard.
      // Enter hand-select mode so the player can pick a card; do not schedule the AI.
      setSelectMode('hand_select');
    } else if (state.activePlayer !== AI_PLAYER) {
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
      setState(prev => execChampionAbility(prev, 0, abilityId, null));
      return;
    }
    setPendingChampionAbility({ abilityId, targetFilter });
    setSelectMode('champion_ability');
  }, []);

  const handleChampionAbilityTarget = useCallback((targetUid) => {
    if (!pendingChampionAbility) return;
    setState(prev => {
      const prevChampHp = prev.champions[0]?.hp;
      const prevUnitHps = prev.units.filter(u => u.owner === 0).map(u => ({ uid: u.uid, hp: u.hp }));
      const next = execChampionAbility(prev, 0, pendingChampionAbility.abilityId, targetUid);
      if ((next.champions[0]?.hp ?? 0) > prevChampHp) playSfxCheal();
      const healed = prevUnitHps.find(({ uid, hp }) => {
        const after = next.units.find(u => u.uid === uid);
        return after && after.hp > hp;
      });
      if (healed) playSfxUheal();
      return next;
    });
    setPendingChampionAbility(null);
    setSelectMode(null);
  }, [pendingChampionAbility]);

  const handleChampionAbilityCancel = useCallback(() => {
    setPendingChampionAbility(null);
    setSelectMode(null);
  }, []);

  // Enter tile-selection mode when sapling_summon has multiple valid tiles.
  useEffect(() => {
    if (state.pendingChampionSaplingPlace) {
      setSelectMode('champion_sapling_place');
    }
  }, [state.pendingChampionSaplingPlace]);

  const handleChampionSaplingPlace = useCallback((row, col) => {
    setState(prev => execChampionSaplingPlace(prev, row, col));
    setSelectMode(null);
  }, []);

  const handleSelectUnit = useCallback((unitUid) => {
    setSelectedUnit(unitUid);
    setSelectMode('unit_move');
  }, []);

  const handleMoveUnit = useCallback((row, col) => {
    if (!selectedUnit) return;
    const unitUidSnap = selectedUnit;
    let enteringApproach = false;
    let attackInfo = null;
    setState(prev => {
      const result = handleUnitMove(prev, unitUidSnap, row, col);
      if (result.needsApproach) {
        enteringApproach = true;
        return prev;
      }
      // Determine sound effects: check if this was an attack vs plain move
      const targetHasEnemy = prev.units.some(u => u.owner !== prev.activePlayer && u.row === row && u.col === col)
        || prev.champions.some(ch => ch.owner !== prev.activePlayer && ch.row === row && ch.col === col)
        || prev.units.some(u => u.id === 'amethystcrystal' && u.owner === prev.activePlayer && u.row === row && u.col === col);
      if (targetHasEnemy) {
        attackInfo = { survived: !!result.state.units.find(u => u.uid === unitUidSnap) };
      }
      return result.state;
    });
    if (enteringApproach) {
      setPendingApproach({ unitUid: selectedUnit, targetRow: row, targetCol: col });
      setSelectMode('approach_select');
    } else {
      if (attackInfo) {
        if (!attackInfo.survived) playSfxAttackBlock(); else playSfxAttack();
      } else {
        playSfxMove();
      }
      clearSelection();
    }
  }, [selectedUnit, clearSelection]);

  const handleApproachTileChosen = useCallback((approachRow, approachCol) => {
    if (!pendingApproach) return;
    const { unitUid, targetRow, targetCol } = pendingApproach;
    setState(prev => {
      const next = handleApproachAttack(prev, unitUid, approachRow, approachCol, targetRow, targetCol);
      const attackerSurvived = next.units.find(u => u.uid === unitUid);
      if (!attackerSurvived) {
        playSfxAttackBlock();
      } else {
        playSfxAttack();
      }
      return next;
    });
    setPendingApproach(null);
    clearSelection();
  }, [pendingApproach, clearSelection]);

  const handleArcherSelectTarget = useCallback((archerUid) => {
    setSelectedUnit(archerUid);
    setSelectMode('archer_target');
  }, []);

  const handleArcherShoot = useCallback((targetUid) => {
    if (!selectedUnit) return;
    playSfxAttack();
    setState(prev => execArcherShoot(prev, selectedUnit, targetUid));
    clearSelection();
  }, [selectedUnit, clearSelection]);

  const handleDiscardCard = useCallback((cardUid) => {
    setState(prev => {
      const next = execDiscardCard(prev, cardUid);
      latestStateRef.current = next;
      return next;
    });
    scheduleAITurn();
  }, [scheduleAITurn]);

  const handleRevealUnit = useCallback((unitUid) => {
    setState(prev => execRevealUnit(prev, unitUid));
    clearSelection();
  }, [clearSelection]);

  const handleTriggerUnitAction = useCallback((unitUid) => {
    setState(prev => {
      const s = execTriggerUnitAction(prev, unitUid);
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
      // Vorn / Mana Cannon / Iron Queen: board tile direction selection
      if (unit.id === 'vornthundercaller' || unit.id === 'manacannon' || unit.id === 'ironqueen') {
        const s = execTriggerUnitAction(prev, unitUid);
        if (s.pendingDirectionSelect) {
          setSelectMode('direction_tile_select');
        }
        return s;
      }
      if (TARGETED_ACTION_UNITS.has(unit.id)) {
        const s = execTriggerUnitAction(prev, unitUid);
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

  const handleDirectionTileSelect = useCallback((row, col) => {
    setState(prev => {
      const ds = prev.pendingDirectionSelect;
      if (!ds) return prev;
      return execDirectionTileSelect(prev, ds.unitUid, row, col);
    });
    clearSelection();
  }, [clearSelection]);

  const handleDeckPeekSelect = useCallback((cardUid) => {
    setState(prev => execDeckPeekSelect(prev, cardUid));
    clearSelection();
  }, [clearSelection]);

  const handleGlimpseDecision = useCallback((keepTop) => {
    setState(prev => execGlimpseDecision(prev, keepTop));
    clearSelection();
  }, [clearSelection]);

  const handleScryDismiss = useCallback(() => {
    setState(prev => execScryDismiss(prev));
    clearSelection();
  }, [clearSelection]);

  const handleConfirmAction = useCallback(() => {
    if (!selectedUnit) return;
    setState(prev => execTriggerUnitAction(prev, selectedUnit));
    clearSelection();
  }, [selectedUnit, clearSelection]);

  const handleTerrainCast = useCallback((row, col) => {
    if (!selectedCard) return;
    setState(prev => execTerrainCast(prev, selectedCard, row, col));
    clearSelection();
  }, [selectedCard, clearSelection]);

  const handleRelicPlace = useCallback((row, col) => {
    setState(prev => execRelicPlace(prev, row, col));
    clearSelection();
  }, [clearSelection]);

  const handleNewGame = useCallback(() => {
    const aiDeckId = pickRandomAiDeck();
    applyAndMaybeAI(autoAdvancePhase(createStateWithAiLog(deckId, aiDeckId)));
    clearSelection();
  }, [clearSelection, deckId, applyAndMaybeAI]);

  // Submit the local player's mulligan choice. Immediately resolves AI mulligan
  // so both players are submitted simultaneously and the game transitions to play.
  const handleMulliganSubmit = useCallback((cardIndices) => {
    const s = cloneState(latestStateRef.current);
    const aiChoices = chooseMulligan(s.players[AI_PLAYER].hand);
    submitMulligan(s, 0, cardIndices);
    submitMulligan(s, AI_PLAYER, aiChoices);
    // Both submitted: phase is now 'begin-turn'; advance to action.
    applyAndMaybeAI(autoAdvancePhase(s));
    clearSelection();
  }, [applyAndMaybeAI, clearSelection]);

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
        .filter(u => u.owner === state.activePlayer && u.uid !== state.pendingFleshtitheSacrifice.unitUid && !u.isRelic && !u.isOmen)
        .map(u => u.uid)
    : [];

  const terrainTargetTiles = selectMode === 'terrain_cast'
    ? getTerrainCastTiles(state)
    : [];

  const relicPlaceTiles = selectMode === 'relic_place'
    ? getAmethystCacheTiles(state)
    : [];

  // Vorn direction selection: the 4 cardinal adjacent tiles on the board
  const directionTargetTiles = selectMode === 'direction_tile_select' && state.pendingDirectionSelect
    ? (() => {
        const unit = state.units.find(u => u.uid === state.pendingDirectionSelect.unitUid);
        if (!unit) return [];
        return [[-1, 0], [1, 0], [0, -1], [0, 1]]
          .map(([dr, dc]) => [unit.row + dr, unit.col + dc])
          .filter(([r, c]) => r >= 0 && r < 5 && c >= 0 && c < 5);
      })()
    : [];

  const championSaplingTiles = selectMode === 'champion_sapling_place' && state.pendingChampionSaplingPlace
    ? state.pendingChampionSaplingPlace.validTiles
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
    championSaplingTiles,
    summonTiles,
    unitMoveTiles,
    approachTiles,
    terrainTargetTiles,
    relicPlaceTiles,
    directionTargetTiles,
    spellTargetUids,
    archerShootTargets,
    sacrificeTargetUids,
    selectedSacrificeUid,
    handlers: {
      handleChampionMoveTile,
      handlePlayCard,
      handleCastTargetlessSpell,
      handleSummonOnTile,
      handleSpellTarget,
      handleHandSelect,
      handleGraveSelect,
      handleFleshtitheSacrificeSelect,
      handleFleshtitheSacrifice,
      handleCancelSpell,
      handleEndAction,
      handleSelectChampion,
      handleChampionAbilityActivate,
      handleChampionAbilityTarget,
      handleChampionAbilityCancel,
      handleChampionSaplingPlace,
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
      handleDirectionTileSelect,
      handleDeckPeekSelect,
      handleGlimpseDecision,
      handleScryDismiss,
      handleContractSelect,
      handleBloodPactSelect,
      handleNewGame,
      handleMulliganSubmit,
      handleTerrainCast,
      handleRelicPlace,
      clearSelection,
      handleInspectUnit,
      handleInspectChampion,
      handleInspectCard,
      handleClearInspect,
      handleInspectTerrain,
    },
  };
}
