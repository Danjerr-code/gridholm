/**
 * TutorialController.jsx
 *
 * Wraps the game board for guided tutorial scenarios. Manages step progression,
 * action interception, end-text overlays, and the reminder overlay for free play.
 *
 * For scenarios 1–4: intercepts player actions and only allows valid ones per step.
 * For scenario 5: free play with heuristic AI and a persistent reminder overlay.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Board from '../components/Board.jsx';
import Hand from '../components/Hand.jsx';
import { buildTutorialState } from './buildTutorialState.js';
import {
  getChampionMoveTiles,
  getSummonTiles,
  getUnitMoveTiles,
  getSpellTargets,
  playCard,
  summonUnit,
  autoAdvancePhase,
  cloneState,
} from '../engine/gameEngine.js';
import {
  handleChampionMove,
  handleUnitMove,
  handleSpellTarget as execSpellTarget,
  handleCancelSpell,
  handleEndTurn,
} from '../engine/actionHandler.js';
import { runAITurnSteps, setAIMode } from '../engine/ai.js';
import { playSfxMove, playSfxAttack, playSfxAttackBlock, playSfxSpell, playUnitSummonSound, playSfxNoMana } from '../audio.js';

const TUTORIAL_STORAGE_KEY = 'gridholm_tutorial_completed';

function loadCompleted() {
  try {
    return JSON.parse(localStorage.getItem(TUTORIAL_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function markCompleted(scenarioId) {
  const completed = loadCompleted();
  if (!completed.includes(scenarioId)) {
    completed.push(scenarioId);
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(completed));
  }
}

export default function TutorialController({ scenario, onExit, onComplete }) {
  const [state, setState] = useState(() => buildTutorialState(scenario));
  const [stepIdx, setStepIdx] = useState(0);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  // 'unit_move' | 'summon' | 'spell' | 'champion_move' | null
  const [selectMode, setSelectMode] = useState(null);
  const [showEndText, setShowEndText] = useState(false);
  const [endText, setEndText] = useState('');
  const [pendingSpellCard, setPendingSpellCard] = useState(null); // cardUid while targeting

  const aiRunningRef = useRef(false);
  const latestStateRef = useRef(state);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  const isFreePlay = !!scenario.freePlay;
  const steps = scenario.steps || [];

  // Current step (may be null for freePlay or after all action steps done)
  const currentStep = !isFreePlay && stepIdx < steps.length ? steps[stepIdx] : null;

  // Which unit IDs are highlighted as valid targets for the current step
  const highlightCardIds = currentStep?.highlightTargets ?? [];

  // ── Derived tile highlights ───────────────────────────────────────────────

  const championMoveTiles = (() => {
    if (state.activePlayer !== 0) return [];
    if (isFreePlay || currentStep?.validAction === 'championMove') {
      return selectMode === 'champion_move' ? getChampionMoveTiles(state) : [];
    }
    return [];
  })();

  const unitMoveTiles = (() => {
    if (!selectedUnit || selectMode !== 'unit_move') return [];
    return getUnitMoveTiles(state, selectedUnit);
  })();

  const summonTiles = (() => {
    if (selectMode !== 'summon' || !state.pendingSummon) return [];
    return getSummonTiles(state);
  })();

  const spellTargetUids = (() => {
    if (selectMode !== 'spell' || !pendingSpellCard) return [];
    const s = getSpellTargets(state, state.pendingSpell?.effect ?? '');
    return s ?? [];
  })();

  // Highlight friendly units that are valid for the current step's selectUnit/move/attack
  const tutorialHighlightUids = (() => {
    if (!currentStep || isFreePlay) return [];
    const targets = highlightCardIds;
    if (!targets.length) return [];
    return state.units
      .filter(u => u.owner === 0 && targets.includes(u.id))
      .map(u => u.uid);
  })();

  // ── Step advancement ──────────────────────────────────────────────────────

  function clearSelection() {
    setSelectedUnit(null);
    setSelectedCard(null);
    setSelectMode(null);
    setPendingSpellCard(null);
  }

  function advanceToNextStep(newState) {
    const nextIdx = stepIdx + 1;
    if (nextIdx >= steps.length) {
      // All steps done — shouldn't happen if last step is endText; guard anyway
      clearSelection();
      setState(newState);
      return;
    }

    const nextStep = steps[nextIdx];

    // If the next step has resetMovedAfterPrev, clear moved flag on player units
    // so the tutorial can teach "select unit → move → attack" as separate steps.
    let finalState = newState;
    if (nextStep.resetMovedAfterPrev) {
      finalState = {
        ...newState,
        units: newState.units.map(u =>
          u.owner === 0 ? { ...u, moved: false } : u
        ),
      };
    }

    clearSelection();
    setState(finalState);

    if (nextStep.endText) {
      setEndText(nextStep.endText);
      setShowEndText(true);
      setStepIdx(nextIdx);
    } else {
      setStepIdx(nextIdx);
    }
  }

  function handleEndTextContinue() {
    setShowEndText(false);
    markCompleted(scenario.id);
    if (onComplete) onComplete(scenario.id);
  }

  // ── AI for freePlay (scenario 5) ──────────────────────────────────────────

  const scheduleAI = useCallback(() => {
    if (aiRunningRef.current) return;
    aiRunningRef.current = true;
    setTimeout(async () => {
      const s = latestStateRef.current;
      if (s.activePlayer !== 1 || s.winner) {
        aiRunningRef.current = false;
        return;
      }
      setAIMode('heuristic');
      const steps = runAITurnSteps(s);
      const finalState = steps.length > 0 ? steps[steps.length - 1] : s;
      // Replay each step visually with delay
      let i = 0;
      function replay() {
        if (i >= steps.length) {
          const advanced = autoAdvancePhase(steps[steps.length - 1] ?? s);
          setState(advanced);
          latestStateRef.current = advanced;
          aiRunningRef.current = false;
          return;
        }
        setState(steps[i]);
        latestStateRef.current = steps[i];
        i++;
        setTimeout(replay, 700);
      }
      replay();
      void finalState; // suppress unused warning
    }, 100);
  }, []);

  // After state changes, check if AI should move
  useEffect(() => {
    if (!isFreePlay) return;
    if (state.activePlayer === 1 && !state.winner && !aiRunningRef.current) {
      scheduleAI();
    }
  }, [state.activePlayer, state.winner, isFreePlay, scheduleAI]);

  // Check scenario 5 turn limit
  const turnLimitReached = isFreePlay && !state.winner && state.turn > (scenario.maxTurns ?? 10) * 2;
  const [showTurnLimitMsg, setShowTurnLimitMsg] = useState(false);
  useEffect(() => {
    if (turnLimitReached && !showTurnLimitMsg) {
      setShowTurnLimitMsg(true);
    }
  }, [turnLimitReached, showTurnLimitMsg]);

  // ── Action handlers ───────────────────────────────────────────────────────

  // Champion move
  const handleChampionMoveTile = useCallback((row, col) => {
    if (state.activePlayer !== 0) return;
    if (!isFreePlay && currentStep?.validAction !== 'championMove') return;
    playSfxMove();
    const newState = handleChampionMove(state, row, col);
    clearSelection();
    if (!isFreePlay) {
      advanceToNextStep(newState);
    } else {
      setState(newState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isFreePlay, currentStep, stepIdx, steps]);

  // Select unit from board
  const handleSelectUnit = useCallback((uid) => {
    if (state.activePlayer !== 0) return;
    const unit = state.units.find(u => u.uid === uid);
    if (!unit || unit.owner !== 0) return;

    if (!isFreePlay && currentStep) {
      if (currentStep.validAction === 'selectUnit') {
        if (currentStep.validTargets && !currentStep.validTargets.includes(unit.id)) return;
        // Valid selection — advance step, then allow selection to show move tiles
        const next = stepIdx + 1;
        if (next < steps.length && steps[next].endText) {
          setEndText(steps[next].endText);
          setShowEndText(true);
          setStepIdx(next);
        } else {
          setStepIdx(next);
        }
      } else if (currentStep.validAction === 'move' || currentStep.validAction === 'attack') {
        // Allow selecting the correct unit to show move tiles
        if (currentStep.validUnit && unit.id !== currentStep.validUnit) return;
      } else {
        return; // Wrong action type for this step
      }
    }

    setSelectedUnit(uid);
    setSelectedCard(null);
    setSelectMode('unit_move');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isFreePlay, currentStep, stepIdx, steps]);

  // Move unit to tile (also handles attacks)
  const handleMoveUnit = useCallback((row, col) => {
    if (!selectedUnit || state.activePlayer !== 0) return;
    const unit = state.units.find(u => u.uid === selectedUnit);
    if (!unit) return;

    if (!isFreePlay && currentStep) {
      const isAttack = state.units.some(u => u.owner !== 0 && u.row === row && u.col === col)
        || state.champions.some(c => c.owner !== 0 && c.row === row && c.col === col);

      if (currentStep.validAction === 'move') {
        if (currentStep.validUnit && unit.id !== currentStep.validUnit) return;
        if (currentStep.validDestinations) {
          if (!currentStep.validDestinations.some(([r, c]) => r === row && c === col)) return;
        }
        const result = handleUnitMove(state, selectedUnit, row, col);
        playSfxMove();
        advanceToNextStep(result.state);
        return;
      }

      if (currentStep.validAction === 'attack') {
        if (!isAttack) return; // Must attack, not move to empty tile
        if (currentStep.validUnit && unit.id !== currentStep.validUnit) return;
        if (currentStep.validTargets) {
          const targetUnit = state.units.find(u => u.owner !== 0 && u.row === row && u.col === col);
          const targetChamp = state.champions.find(c => c.owner !== 0 && c.row === row && c.col === col);
          const targetId = targetUnit?.id ?? (targetChamp ? 'enemyChampion' : null);
          if (!currentStep.validTargets.includes(targetId)) return;
        }
        const result = handleUnitMove(state, selectedUnit, row, col);
        const survived = !!result.state.units.find(u => u.uid === selectedUnit);
        if (!survived) { playSfxAttackBlock(); } else { playSfxAttack(); }
        advanceToNextStep(result.state);
        return;
      }

      return; // Wrong action for this step
    }

    // Free play / unguided
    const result = handleUnitMove(state, selectedUnit, row, col);
    const wasAttack = state.units.some(u => u.owner !== state.activePlayer && u.row === row && u.col === col)
      || state.champions.some(c => c.owner !== state.activePlayer && c.row === row && c.col === col);
    if (wasAttack) {
      const survived = !!result.state.units.find(u => u.uid === selectedUnit);
      if (!survived) { playSfxAttackBlock(); } else { playSfxAttack(); }
    } else {
      playSfxMove();
    }
    clearSelection();
    setState(result.state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit, state, isFreePlay, currentStep, stepIdx, steps]);

  // Select champion for movement
  const handleSelectChampion = useCallback(() => {
    if (state.activePlayer !== 0) return;
    if (!isFreePlay && currentStep?.validAction !== 'championMove') return;
    clearSelection();
    setSelectMode('champion_move');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activePlayer, isFreePlay, currentStep]);

  // Play a card from hand
  const handlePlayCard = useCallback((cardUid) => {
    if (state.activePlayer !== 0) return;
    const p = state.players[0];
    const card = p.hand.find(c => c.uid === cardUid);
    if (!card) return;

    if (!isFreePlay && currentStep) {
      if (currentStep.validAction === 'selectCard') {
        if (currentStep.validTargets && !currentStep.validTargets.includes(card.id)) {
          playSfxNoMana();
          return;
        }
        // Valid card selection — play it
      } else if (currentStep.validAction === 'castSpell') {
        if (currentStep.validCard && card.id !== currentStep.validCard) {
          playSfxNoMana();
          return;
        }
        // Valid spell card — fall through to play
      } else {
        return; // Not the right action
      }
    }

    if (p.resources < card.cost) {
      playSfxNoMana();
      return;
    }

    const newState = playCard(state, cardUid);

    if (newState.pendingSpell) {
      setSelectedCard(cardUid);
      setPendingSpellCard(newState.pendingSpell.cardUid ?? cardUid);
      setSelectMode('spell');
      setState(newState);

      if (!isFreePlay && currentStep?.validAction === 'castSpell') {
        // Advance step after card is played — targeting will be handled by handleSpellTarget
        setStepIdx(prev => prev + 1);
      }
      return;
    }

    if (newState.pendingSummon) {
      setSelectedCard(cardUid);
      setSelectMode('summon');
      setState(newState);

      if (!isFreePlay && currentStep?.validAction === 'selectCard') {
        setStepIdx(prev => prev + 1);
      }
      playUnitSummonSound();
      return;
    }

    setState(newState);
    clearSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isFreePlay, currentStep, stepIdx]);

  // Summon a unit on a tile after playing a card
  const handleSummonOnTile = useCallback((row, col) => {
    if (!selectedCard) return;

    if (!isFreePlay && currentStep) {
      if (currentStep.validAction === 'summon') {
        if (currentStep.validDestinations === 'champion_adjacent') {
          const champ = state.champions[0];
          const adjacent = [[champ.row - 1, champ.col], [champ.row + 1, champ.col], [champ.row, champ.col - 1], [champ.row, champ.col + 1]];
          if (!adjacent.some(([r, c]) => r === row && c === col)) return;
        } else if (Array.isArray(currentStep.validDestinations)) {
          if (!currentStep.validDestinations.some(([r, c]) => r === row && c === col)) return;
        }
      } else {
        return;
      }
    }

    const newState = summonUnit(state, selectedCard, row, col);
    playUnitSummonSound();
    clearSelection();

    if (!isFreePlay && currentStep?.validAction === 'summon') {
      advanceToNextStep(newState);
    } else {
      setState(newState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, selectedCard, isFreePlay, currentStep, stepIdx, steps]);

  // Spell target selected
  const handleSpellTarget = useCallback((targetUid) => {
    if (!pendingSpellCard && !state.pendingSpell) return;
    const cardUid = state.pendingSpell?.cardUid ?? pendingSpellCard;

    const newState = execSpellTarget(state, cardUid, targetUid);
    playSfxSpell();
    clearSelection();

    // For guided spell steps, the step was already advanced when the card was played
    setState(newState);
  }, [state, pendingSpellCard]);

  // Cancel spell / summon
  const handleCancelSpellAction = useCallback(() => {
    const newState = handleCancelSpell(state);
    setState(newState);
    clearSelection();
  }, [state]);

  // End turn
  const handleEndAction = useCallback(() => {
    if (state.activePlayer !== 0) return;
    const newState = handleEndTurn(state);
    clearSelection();
    if (isFreePlay) {
      const advanced = autoAdvancePhase(newState);
      setState(advanced);
      if (advanced.activePlayer === 1 && !advanced.winner) {
        scheduleAI();
      }
    } else {
      setState(newState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isFreePlay, scheduleAI]);

  // ── Board handlers object (matches Board component expectations) ──────────

  const handlers = {
    handleChampionMoveTile,
    handleSelectUnit,
    handleMoveUnit,
    handleSelectChampion,
    handlePlayCard,
    handleSummonOnTile,
    handleSpellTarget,
    handleCancelSpell: handleCancelSpellAction,
    handleEndAction,
    // No-ops for actions not needed in tutorial
    handleInspectUnit: () => {},
    handleClearInspect: () => {},
    handleInspectTerrain: () => {},
    handleInspectChampion: () => {},
    handleArcherSelectTarget: () => {},
    handleArcherShoot: () => {},
    handleActionButtonClick: () => {},
    handleRevealUnit: () => {},
    handleDiscardCard: () => {},
    handleApproachTileChosen: () => {},
    handleChampionAbilityActivate: () => {},
    handleChampionAbilityTarget: () => {},
    handleChampionAbilityCancel: () => {},
    handleNewGame: () => {},
    handleMulliganSubmit: () => {},
    handleBloodPactSelect: () => {},
    handleFleshtitheSacrificeSelect: () => {},
    handleFleshtitheSacrifice: () => {},
    handleContractSelect: () => {},
    handleDeckPeekSelect: () => {},
    handleGlimpseDecision: () => {},
    handleScryDismiss: () => {},
    handleGraveSelect: () => {},
    handleChampionSaplingPlace: () => {},
    handleDirectionTileSelect: () => {},
    handleCastTargetlessSpell: () => {},
    handleHandSelect: () => {},
  };

  // ── Prompt text ───────────────────────────────────────────────────────────

  const promptText = (() => {
    if (isFreePlay) return 'Free play — use your cards and units freely.';
    if (!currentStep) return '';
    if (currentStep.endText) return '';
    return currentStep.prompt ?? '';
  })();

  // Commands left for display
  const commandsUsed = state.players[0]?.commandsUsed ?? 0;
  const commandsLeft = 3 - commandsUsed;
  const mana = state.players[0]?.resources ?? 0;
  const isP1Turn = state.activePlayer === 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Tutorial banner */}
      <div style={{
        background: 'rgba(10,10,15,0.97)',
        borderBottom: '1px solid rgba(201,168,76,0.3)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minHeight: '48px',
        flexShrink: 0,
      }}>
        <button
          onClick={onExit}
          style={{
            background: 'none',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: '4px',
            color: '#6a6a8a',
            fontSize: '12px',
            padding: '4px 10px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          ← Exit
        </button>

        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          color: '#C9A84C',
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}>
          {scenario.title.toUpperCase()}
        </div>

        {promptText && (
          <div style={{
            flex: 1,
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.25)',
            borderRadius: '4px',
            padding: '6px 12px',
            fontSize: '14px',
            fontFamily: "'Crimson Text', serif",
            color: '#f0e8d0',
            textAlign: 'center',
          }}>
            {promptText}
          </div>
        )}

        {!isFreePlay && (
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '10px',
            color: '#4a4a6a',
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}>
            {steps.filter(s => !s.endText).indexOf(currentStep) + 1} / {steps.filter(s => !s.endText).length}
          </div>
        )}
      </div>

      {/* Game area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '8px',
        gap: '8px',
        overflow: 'hidden',
      }}>
        {/* Status row */}
        <div style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          fontSize: '12px',
          fontFamily: "'Cinzel', serif",
          color: isP1Turn ? '#C9A84C' : '#6a6a8a',
          letterSpacing: '0.06em',
        }}>
          <span>Mana: {mana}</span>
          <span>Commands: {commandsLeft}</span>
          {!isP1Turn && isFreePlay && (
            <span style={{ color: '#7a7a9a' }}>AI thinking…</span>
          )}
          {isP1Turn && isFreePlay && (
            <button
              onClick={handleEndAction}
              style={{
                background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                color: '#0a0a0f',
                fontFamily: "'Cinzel', serif",
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '3px',
                padding: '4px 12px',
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              End Turn
            </button>
          )}
        </div>

        {/* Board */}
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <Board
            state={state}
            selectedUnit={selectedUnit}
            selectMode={selectMode}
            championMoveTiles={championMoveTiles}
            summonTiles={summonTiles}
            unitMoveTiles={unitMoveTiles}
            approachTiles={[]}
            terrainTargetTiles={[]}
            relicPlaceTiles={[]}
            directionTargetTiles={[]}
            championSaplingTiles={[]}
            spellTargetUids={spellTargetUids.length > 0 ? spellTargetUids : tutorialHighlightUids}
            archerShootTargets={[]}
            sacrificeTargetUids={[]}
            selectedSacrificeUid={null}
            championAbilityTargetUids={[]}
            opponentMoveTiles={new Set()}
            handlers={handlers}
            onInspectUnit={() => {}}
            onClearInspect={() => {}}
            onInspectTerrain={() => {}}
            isMyTurn={isP1Turn}
            myPlayerIndex={0}
            isMobile={false}
          />
        </div>

        {/* Hand */}
        {state.players[0].hand.length > 0 && (
          <div style={{ width: '100%', maxWidth: '480px' }}>
            <Hand
              player={state.players[0]}
              resources={mana}
              isActive={isP1Turn}
              canPlay={isP1Turn && state.phase === 'action'}
              gameState={state}
              playerIndex={0}
              pendingDiscard={false}
              pendingHandSelect={null}
              selectedCard={selectedCard}
              onPlayCard={handlePlayCard}
              onDiscardCard={() => {}}
              onHandSelect={() => {}}
              onInspectCard={() => {}}
              isMobile={false}
            />
          </div>
        )}

        {/* Cancel button when in spell/summon mode */}
        {(selectMode === 'spell' || selectMode === 'summon') && (
          <button
            onClick={handleCancelSpellAction}
            style={{
              background: 'transparent',
              border: '1px solid #4a4a6a',
              borderRadius: '4px',
              color: '#6a6a8a',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              padding: '4px 16px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}

        {/* Free play reminder overlay */}
        {isFreePlay && (
          <div style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            background: 'rgba(10,10,20,0.88)',
            border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '11px',
            color: '#8080a0',
            maxWidth: '220px',
            lineHeight: 1.5,
            fontFamily: 'inherit',
          }}>
            {scenario.reminderText}
          </div>
        )}
      </div>

      {/* End text overlay */}
      {showEndText && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid rgba(201,168,76,0.4)',
            borderRadius: '8px',
            padding: '32px 28px',
            maxWidth: '420px',
            width: '90vw',
            textAlign: 'center',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', letterSpacing: '0.1em', marginBottom: '16px' }}>
              LESSON COMPLETE
            </div>
            <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '16px', color: '#e2e8f0', lineHeight: 1.6, marginBottom: '24px' }}>
              {endText}
            </p>
            <button
              onClick={handleEndTextContinue}
              style={{
                background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                color: '#0a0a0f',
                fontFamily: "'Cinzel', serif",
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                padding: '10px 28px',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Scenario 5: win/turn-limit overlay */}
      {(state.winner || showTurnLimitMsg) && isFreePlay && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid rgba(201,168,76,0.4)',
            borderRadius: '8px',
            padding: '32px 28px',
            maxWidth: '420px',
            width: '90vw',
            textAlign: 'center',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', letterSpacing: '0.1em', marginBottom: '16px' }}>
              {state.winner === 'Player 1' ? 'VICTORY' : showTurnLimitMsg ? 'PRACTICE COMPLETE' : 'DEFEAT'}
            </div>
            <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '16px', color: '#e2e8f0', lineHeight: 1.6, marginBottom: '24px' }}>
              {state.winner === 'Player 1'
                ? 'You have learned the basics of Gridholm. Build your deck and challenge stronger opponents.'
                : showTurnLimitMsg
                ? 'Good effort. Try again or jump into a real match.'
                : 'The enemy champion was victorious. Try again to sharpen your skills.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  markCompleted(scenario.id);
                  setState(buildTutorialState(scenario));
                  setShowTurnLimitMsg(false);
                  clearSelection();
                }}
                style={{
                  background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                  color: '#0a0a0f',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  markCompleted(scenario.id);
                  if (onComplete) onComplete(scenario.id);
                }}
                style={{
                  background: 'transparent',
                  color: '#C9A84C',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                  border: '1px solid rgba(201,168,76,0.4)',
                  borderRadius: '4px',
                  padding: '8px 20px',
                  cursor: 'pointer',
                }}
              >
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
