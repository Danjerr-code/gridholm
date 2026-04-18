/**
 * TutorialController.jsx
 *
 * Wraps the game board for guided tutorial scenarios. Manages step progression,
 * action interception, end-text overlays, and the reminder overlay for free play.
 *
 * For scenarios 1–3: intercepts player actions and only allows valid ones per step.
 * For scenario 4: guided multi-turn mode — 1 command per turn, Kragor flees.
 * For scenario 5: free play with heuristic AI and a hint button.
 *
 * Renders through the real game layout (same as App.jsx) with a tutorial overlay
 * for the prompt banner. Per-scenario panels are hidden via visibility:hidden so
 * layout does not shift when the player transitions to a real game.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Board from '../components/Board.jsx';
import Hand from '../components/Hand.jsx';
import StatusBar from '../components/StatusBar.jsx';
import { ResourceDisplay } from '../components/StatusBar.jsx';
import PhaseTracker from '../components/PhaseTracker.jsx';
import Log from '../components/Log.jsx';
import TurnBanner from '../components/TurnBanner.jsx';
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
  manhattan,
  getCommandLimit,
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
import { CommandDisplay, CardDetailPanel } from '../App.jsx';

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

// ── Scenario 4 helpers ────────────────────────────────────────────────────────

/**
 * Move Kragor (enemy champion) one tile toward the nearest board corner,
 * away from the closest friendly unit or champion. Used during guided scenario 4.
 */
function moveKragorAway(state) {
  const s = cloneState(state);
  const kragor = s.champions[1];
  if (!kragor || kragor.moved) return s;

  // Corner candidates
  const corners = [[0,0],[0,4],[4,0],[4,4]];

  // Pick the corner farthest from all friendly units + champion
  const friendlyPositions = [
    [s.champions[0].row, s.champions[0].col],
    ...s.units.filter(u => u.owner === 0).map(u => [u.row, u.col]),
  ];

  function minDistToFriendly(pos) {
    return Math.min(...friendlyPositions.map(fp => manhattan(pos, fp)));
  }

  const bestCorner = corners.reduce((best, c) =>
    minDistToFriendly(c) > minDistToFriendly(best) ? c : best
  , corners[0]);

  // Move one step toward that corner (cardinal only, no diagonal)
  const dr = bestCorner[0] - kragor.row;
  const dc = bestCorner[1] - kragor.col;

  let moveRow = kragor.row;
  let moveCol = kragor.col;

  // Move along the axis with the larger distance first, then the other
  const candidates = [];
  if (dr !== 0) candidates.push([kragor.row + Math.sign(dr), kragor.col]);
  if (dc !== 0) candidates.push([kragor.row, kragor.col + Math.sign(dc)]);

  // Pick the first candidate not occupied by a friendly unit or the board edge
  for (const [r, c] of candidates) {
    if (r < 0 || r > 4 || c < 0 || c > 4) continue;
    const occupied = s.units.some(u => u.row === r && u.col === c)
      || s.champions.some(ch => ch.row === r && ch.col === c && ch.owner !== 1);
    if (!occupied) {
      moveRow = r;
      moveCol = c;
      break;
    }
  }

  kragor.row = moveRow;
  kragor.col = moveCol;
  kragor.moved = true;
  return s;
}

/**
 * Returns the guided prompt for scenario 4 based on current state.
 */
function getGuidedPrompt(state, scenario) {
  const kragor = state.champions[1];
  if (!kragor || state.winner) return '';

  const friendlyUnits = state.units.filter(u => u.owner === 0);
  const allFriendlyPositions = [
    [state.champions[0].row, state.champions[0].col],
    ...friendlyUnits.map(u => [u.row, u.col]),
  ];

  // Check if any friendly is adjacent to Kragor
  const adjacentToKragor = allFriendlyPositions.some(
    ([r, c]) => manhattan([r, c], [kragor.row, kragor.col]) === 1
  );

  if (adjacentToKragor) {
    return 'Attack the enemy champion!';
  }

  // Check if any friendly is getting close (within 2 tiles)
  const closeToKragor = allFriendlyPositions.some(
    ([r, c]) => manhattan([r, c], [kragor.row, kragor.col]) <= 2
  );

  if (closeToKragor) {
    return 'Keep advancing toward the enemy champion.';
  }

  return 'Chase down the enemy champion. Move a unit forward.';
}

export default function TutorialController({ scenario, onExit, onComplete, onGoToLobby }) {
  const [state, setState] = useState(() => buildTutorialState(scenario));
  const [stepIdx, setStepIdx] = useState(0);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  // 'unit_move' | 'summon' | 'spell' | 'champion_move' | null
  const [selectMode, setSelectMode] = useState(null);
  const [showEndText, setShowEndText] = useState(false);
  const [endText, setEndText] = useState('');
  const [pendingSpellCard, setPendingSpellCard] = useState(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [enemyTurnMsg, setEnemyTurnMsg] = useState('');
  const [inspectedItem, setInspectedItem] = useState(null);

  // Hint system (scenario 5)
  const [hintActive, setHintActive] = useState(false);
  const [hintText, setHintText] = useState('');
  const [hintsUsedThisTurn, setHintsUsedThisTurn] = useState(0);

  const aiRunningRef = useRef(false);
  const latestStateRef = useRef(state);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  const isFreePlay = !!scenario.freePlay;
  const isGuided = !!scenario.guided;
  const steps = scenario.steps || [];
  const p1CommandsPerTurn = scenario.boardConfig?.p1CommandsPerTurn ?? 3;

  // Current step (null for freePlay, guided, or after all action steps done)
  const currentStep = !isFreePlay && !isGuided && stepIdx < steps.length ? steps[stepIdx] : null;

  // Which card IDs are highlighted for the current step
  const highlightCardIds = currentStep?.highlightTargets ?? [];

  // ── Derived tile highlights ───────────────────────────────────────────────

  const championMoveTiles = (() => {
    if (state.activePlayer !== 0) return [];
    if (isFreePlay || isGuided) {
      return selectMode === 'champion_move' ? getChampionMoveTiles(state) : [];
    }
    if (currentStep?.validAction === 'championMove') {
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

  // Highlight friendly units valid for current step's selectUnit/move/attack
  const tutorialHighlightUids = (() => {
    if (!currentStep || isFreePlay || isGuided) return [];
    const targets = highlightCardIds;
    if (!targets.length) return [];
    return state.units
      .filter(u => u.owner === 0 && targets.includes(u.id))
      .map(u => u.uid);
  })();

  // Hint highlight UIDs (scenario 5)
  const hintHighlightUids = (() => {
    if (!hintActive || !isFreePlay) return [];
    return tutorialHighlightUids;
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
      clearSelection();
      setState(newState);
      return;
    }

    const nextStep = steps[nextIdx];

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

  // ── AI execution (shared by scenario 1 enemy turn and freePlay/guided) ─────

  function runAITurn(s, afterAI) {
    if (aiRunningRef.current) return;
    aiRunningRef.current = true;
    setAiRunning(true);

    setTimeout(() => {
      const currentS = s;
      if (currentS.activePlayer !== 1 || currentS.winner) {
        aiRunningRef.current = false;
        setAiRunning(false);
        if (afterAI) afterAI(currentS);
        return;
      }
      setAIMode('heuristic');
      const stepResults = runAITurnSteps(currentS);
      const finalResult = stepResults.length > 0 ? stepResults[stepResults.length - 1] : { state: currentS };

      // Replay each AI step with a short delay for visual feedback
      let i = 0;
      function replay() {
        if (i >= stepResults.length) {
          const advanced = autoAdvancePhase(finalResult.state);
          setState(advanced);
          latestStateRef.current = advanced;
          aiRunningRef.current = false;
          setAiRunning(false);
          setEnemyTurnMsg('');
          if (afterAI) afterAI(advanced);
          return;
        }
        const { state: stepState } = stepResults[i];
        setState(stepState);
        latestStateRef.current = stepState;
        i++;
        setTimeout(replay, 600);
      }
      replay();
    }, 200);
  }

  // ── Scenario 1: enemy turn after End Turn step ────────────────────────────
  // Scripted: AI places Hellhound on the tile directly between the Knight and
  // the AI champion. The AI champion does NOT move.

  function executeEnemyTurnScenario1(stateAfterEndTurn) {
    setEnemyTurnMsg('Enemy is acting…');
    // Advance from end-turn state so enemy resources are set for their turn
    const enemyStart = autoAdvancePhase(stateAfterEndTurn);
    setState(enemyStart);

    setTimeout(() => {
      let s = cloneState(enemyStart);

      const hellhoundCard = s.players[1].hand.find(c => c.id === 'hellhound');
      const knight = s.units.find(u => u.id === 'knight' && u.owner === 0);

      if (hellhoundCard && knight) {
        // Guarantee AI has enough mana to summon
        s.players[1].resources = Math.max(s.players[1].resources, hellhoundCard.cost);
        s.players[1].maxResourcesThisTurn = Math.max(s.players[1].maxResourcesThisTurn, hellhoundCard.cost);

        // Target tile: one row toward the AI champion from the Knight's current position
        const targetRow = Math.max(0, knight.row - 1);
        const targetCol = knight.col;

        // Fallback to [1, 2] if target is occupied
        const isOccupied =
          s.units.some(u => u.row === targetRow && u.col === targetCol) ||
          s.champions.some(c => c.row === targetRow && c.col === targetCol);
        const placeRow = isOccupied ? 1 : targetRow;
        const placeCol = isOccupied ? 2 : targetCol;

        s = playCard(s, hellhoundCard.uid);
        if (s.pendingSummon) {
          s = summonUnit(s, hellhoundCard.uid, placeRow, placeCol);
        }
      }

      // End AI turn properly: handleEndTurn advances to player 0's begin-turn phase,
      // resetting unit moved flags and commandsUsed via doBeginTurnPhase
      const final = handleEndTurn(s);
      setState(final);
      latestStateRef.current = final;
      setEnemyTurnMsg('');
    }, 800);
  }

  // ── Scenario 4: guided multi-turn with Kragor fleeing ────────────────────

  const [guidedTurn, setGuidedTurn] = useState(1);
  const [guidedWon, setGuidedWon] = useState(false);

  function executeKragorTurn(s) {
    if (s.winner) return;
    setEnemyTurnMsg('Kragor retreats…');
    setTimeout(() => {
      const s2 = moveKragorAway(s);
      // Manually advance to player 0's new turn without triggering drawCard on empty decks
      const s3 = {
        ...s2,
        activePlayer: 0,
        phase: 'action',
        turn: s2.turn + 1,
        // Reset player 0 units for new turn (moved/summoned flags)
        units: s2.units.map(u =>
          u.owner === 0 ? { ...u, moved: false, summoned: false } : u
        ),
        // Reset both champions' moved flag: player 0 for their turn, Kragor so he can flee next turn
        champions: s2.champions.map(c => ({ ...c, moved: false })),
        players: s2.players.map((p, i) =>
          i === 0 ? { ...p, commandsUsed: 0, resources: 0, maxResourcesThisTurn: 0 } : p
        ),
      };
      setState(s3);
      latestStateRef.current = s3;
      setGuidedTurn(t => t + 1);
      setHintsUsedThisTurn(0);
      setEnemyTurnMsg('');
    }, 800);
  }

  // Check if game was won in guided mode
  useEffect(() => {
    if (!isGuided) return;
    if (state.winner === 'Player 1' && !guidedWon) {
      setGuidedWon(true);
    }
  }, [state.winner, isGuided, guidedWon]);

  // ── freePlay AI (scenario 5) ──────────────────────────────────────────────

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
      const stepResults = runAITurnSteps(s);
      const finalResult = stepResults.length > 0 ? stepResults[stepResults.length - 1] : { state: s };
      let i = 0;
      function replay() {
        if (i >= stepResults.length) {
          const advanced = autoAdvancePhase(finalResult.state);
          setState(advanced);
          latestStateRef.current = advanced;
          aiRunningRef.current = false;
          setHintsUsedThisTurn(0);
          return;
        }
        const { state: stepState } = stepResults[i];
        setState(stepState);
        latestStateRef.current = stepState;
        i++;
        setTimeout(replay, 700);
      }
      replay();
      void finalState;
    }, 100);
  }, []);

  useEffect(() => {
    if (!isFreePlay) return;
    if (state.activePlayer === 1 && !state.winner && !aiRunningRef.current) {
      scheduleAI();
    }
  }, [state.activePlayer, state.winner, isFreePlay, scheduleAI]);

  // ── freePlay turn limit (scenario 5) ─────────────────────────────────────

  const turnLimitReached = isFreePlay && !state.winner && state.turn > (scenario.maxTurns ?? 15) * 2;
  const [showTurnLimitMsg, setShowTurnLimitMsg] = useState(false);
  useEffect(() => {
    if (turnLimitReached && !showTurnLimitMsg) setShowTurnLimitMsg(true);
  }, [turnLimitReached, showTurnLimitMsg]);

  // ── Hint system (scenario 5) ─────────────────────────────────────────────

  function computeHint() {
    if (!isFreePlay || hintsUsedThisTurn >= 1) return;

    const s = latestStateRef.current;
    const friendlyUnits = s.units.filter(u => u.owner === 0 && !u.moved && !u.summoned);
    const kragor = s.champions[1];

    // Simple hint: suggest moving the unit closest to the enemy champion
    if (friendlyUnits.length > 0) {
      const closest = friendlyUnits.reduce((best, u) => {
        const d = manhattan([u.row, u.col], [kragor.row, kragor.col]);
        const bd = manhattan([best.row, best.col], [kragor.row, kragor.col]);
        return d < bd ? u : best;
      });

      const moveTiles = getUnitMoveTiles(s, closest.uid);
      if (moveTiles.length > 0) {
        // Pick tile closest to Kragor
        const bestTile = moveTiles.reduce((bt, t) => {
          const td = manhattan(t, [kragor.row, kragor.col]);
          const bd = manhattan(bt, [kragor.row, kragor.col]);
          return td < bd ? t : bt;
        });

        const dist = manhattan(bestTile, [kragor.row, kragor.col]);
        if (dist === 1) {
          setHintText(`Try moving ${closest.name} to attack ${kragor ? 'the enemy champion' : 'an enemy'}`);
        } else {
          setHintText(`Try moving ${closest.name} closer to the enemy`);
        }
        setHintActive(true);
        setHintsUsedThisTurn(h => h + 1);
        setTimeout(() => setHintActive(false), 3000);
        return;
      }
    }

    // Hint: play a card from hand
    const hand = s.players[0].hand;
    const mana = s.players[0].resources;
    const playable = hand.filter(c => c.cost <= mana);
    if (playable.length > 0) {
      setHintText(`Try playing ${playable[0].name} from your hand`);
      setHintActive(true);
      setHintsUsedThisTurn(h => h + 1);
      setTimeout(() => setHintActive(false), 3000);
      return;
    }

    setHintText('Consider ending your turn');
    setHintActive(true);
    setHintsUsedThisTurn(h => h + 1);
    setTimeout(() => setHintActive(false), 3000);
  }

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleChampionMoveTile = useCallback((row, col) => {
    if (state.activePlayer !== 0) return;

    const isAllowed = isFreePlay || isGuided
      || currentStep?.validAction === 'championMove';
    if (!isAllowed) return;

    if (!isFreePlay && !isGuided && currentStep?.validAction === 'championMove') {
      if (currentStep.validDestinations) {
        if (!currentStep.validDestinations.some(([r, c]) => r === row && c === col)) return;
      }
    }

    playSfxMove();
    const newState = handleChampionMove(state, row, col);
    clearSelection();

    if (!isFreePlay && !isGuided && currentStep?.validAction === 'championMove') {
      advanceToNextStep(newState);
    } else {
      setState(newState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isFreePlay, isGuided, currentStep, stepIdx, steps, p1CommandsPerTurn]);

  const handleSelectUnit = useCallback((uid) => {
    if (state.activePlayer !== 0) return;
    const unit = state.units.find(u => u.uid === uid);
    if (!unit || unit.owner !== 0) return;

    if (!isFreePlay && !isGuided && currentStep) {
      if (currentStep.validAction === 'selectUnit') {
        if (currentStep.validTargets && !currentStep.validTargets.includes(unit.id)) return;
        const next = stepIdx + 1;
        if (next < steps.length && steps[next].endText) {
          setEndText(steps[next].endText);
          setShowEndText(true);
          setStepIdx(next);
        } else {
          setStepIdx(next);
        }
      } else if (currentStep.validAction === 'move' || currentStep.validAction === 'attack') {
        if (currentStep.validUnit && unit.id !== currentStep.validUnit) return;
      } else {
        return;
      }
    }

    setSelectedUnit(uid);
    setSelectedCard(null);
    setSelectMode('unit_move');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isFreePlay, isGuided, currentStep, stepIdx, steps]);

  const handleMoveUnit = useCallback((row, col) => {
    if (!selectedUnit || state.activePlayer !== 0) return;
    const unit = state.units.find(u => u.uid === selectedUnit);
    if (!unit) return;

    if (!isFreePlay && !isGuided && currentStep) {
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
        if (!isAttack) return;
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

      return;
    }

    // Free play / guided
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

    // Dismiss hint after action
    if (hintActive) setHintActive(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit, state, isFreePlay, isGuided, currentStep, stepIdx, steps, p1CommandsPerTurn, hintActive]);

  const handleSelectChampion = useCallback(() => {
    if (state.activePlayer !== 0) return;
    const isAllowed = isFreePlay || isGuided || currentStep?.validAction === 'championMove';
    if (!isAllowed) return;
    clearSelection();
    setSelectMode('champion_move');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activePlayer, isFreePlay, isGuided, currentStep]);

  const handlePlayCard = useCallback((cardUid) => {
    if (state.activePlayer !== 0) return;
    const p = state.players[0];
    const card = p.hand.find(c => c.uid === cardUid);
    if (!card) return;

    if (!isFreePlay && !isGuided && currentStep) {
      if (currentStep.validAction === 'selectCard') {
        if (currentStep.validTargets && !currentStep.validTargets.includes(card.id)) {
          playSfxNoMana();
          return;
        }
      } else if (currentStep.validAction === 'castSpell') {
        if (currentStep.validCard && card.id !== currentStep.validCard) {
          playSfxNoMana();
          return;
        }
      } else {
        return;
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

      if (!isFreePlay && !isGuided && currentStep?.validAction === 'castSpell') {
        setStepIdx(prev => prev + 1);
      }
      return;
    }

    if (newState.pendingSummon) {
      setSelectedCard(cardUid);
      setSelectMode('summon');
      setState(newState);

      if (!isFreePlay && !isGuided && currentStep?.validAction === 'selectCard') {
        setStepIdx(prev => prev + 1);
      }
      playUnitSummonSound();
      return;
    }

    setState(newState);
    clearSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isFreePlay, isGuided, currentStep, stepIdx]);

  const handleSummonOnTile = useCallback((row, col) => {
    if (!selectedCard) return;

    if (!isFreePlay && !isGuided && currentStep) {
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

    if (!isFreePlay && !isGuided && currentStep?.validAction === 'summon') {
      advanceToNextStep(newState);
    } else {
      setState(newState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, selectedCard, isFreePlay, isGuided, currentStep, stepIdx, steps]);

  const handleSpellTarget = useCallback((targetUid) => {
    if (!pendingSpellCard && !state.pendingSpell) return;
    const cardUid = state.pendingSpell?.cardUid ?? pendingSpellCard;

    const newState = execSpellTarget(state, cardUid, targetUid);
    playSfxSpell();
    clearSelection();

    // Advance past the castSpell step (step was already bumped when card was played)
    if (!isFreePlay && !isGuided) {
      // Find the step after the castSpell step
      const currentStepAfterBump = steps[stepIdx];
      if (currentStepAfterBump?.endText) {
        setEndText(currentStepAfterBump.endText);
        setShowEndText(true);
      }
    }

    setState(newState);
    if (hintActive) setHintActive(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pendingSpellCard, isFreePlay, isGuided, stepIdx, steps, hintActive]);

  const handleCancelSpellAction = useCallback(() => {
    const newState = handleCancelSpell(state);
    setState(newState);
    clearSelection();
  }, [state]);

  // End Turn — handles scenario 1 enemy turn, guided (Kragor), and freePlay
  const handleEndAction = useCallback(() => {
    if (state.activePlayer !== 0) return;

    // Scenario 1: endTurn step triggers AI enemy turn
    if (!isFreePlay && !isGuided && currentStep?.validAction === 'endTurn') {
      const newState = handleEndTurn(state);
      clearSelection();
      advanceToNextStep(newState);
      executeEnemyTurnScenario1(newState);
      return;
    }

    if (isGuided) {
      // Guided scenario 4: bypass handleEndTurn to avoid drawCard on empty decks (prevents deckEmpty SPD buff)
      clearSelection();
      executeKragorTurn(state);
      return;
    }

    const newState = handleEndTurn(state);
    clearSelection();

    if (isFreePlay) {
      const advanced = autoAdvancePhase(newState);
      setState(advanced);
      if (advanced.activePlayer === 1 && !advanced.winner) {
        scheduleAI();
      }
      setHintsUsedThisTurn(0);
    } else {
      setState(newState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isFreePlay, isGuided, currentStep, stepIdx, steps, scheduleAI]);

  // ── Board handlers object ─────────────────────────────────────────────────

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
    handleInspectUnit: (uid) => {
      const unit = state.units.find(u => u.uid === uid);
      if (unit) setInspectedItem({ type: 'unit', uid });
    },
    handleClearInspect: () => setInspectedItem(null),
    handleInspectTerrain: () => {},
    handleInspectChampion: (playerIdx) => setInspectedItem({ type: 'champion', playerIdx }),
    handleInspectCard: () => {},
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
    if (enemyTurnMsg) return enemyTurnMsg;
    if (aiRunning && !isFreePlay) return 'Enemy is acting…';
    if (isFreePlay) return hintActive ? hintText : 'Free play — use your cards and units freely.';
    if (isGuided) {
      if (guidedWon) return '';
      return getGuidedPrompt(state, scenario);
    }
    if (!currentStep) return '';
    if (currentStep.endText) return '';
    return currentStep.prompt ?? '';
  })();

  const commandsUsed = state.players[0]?.commandsUsed ?? 0;
  const mana = state.players[0]?.resources ?? 0;
  const maxMana = state.players[0]?.maxResourcesThisTurn ?? mana;
  const isP1Turn = state.activePlayer === 0;
  const p1CommandLimit = getCommandLimit(state, 0);

  // In scripted steps (non-freePlay, non-guided), only show End Turn if the current step calls for it
  const showEndTurnBtn = isP1Turn && !aiRunning && (isFreePlay || isGuided || currentStep?.validAction === 'endTurn');
  const highlightEndTurnBtn = !isFreePlay && !isGuided && currentStep?.highlightEndTurn;

  // Per-scenario panel visibility (use visibility:hidden, not display:none, to preserve layout)
  const hideLog = scenario.id !== 'practice-round';
  const hideCardDetail = scenario.id !== 'commands-spells' && scenario.id !== 'practice-round';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen overflow-hidden text-white p-2 flex flex-col gap-2" style={{ background: '#0a0a0f', paddingBottom: '8px' }}>

      {/* Tutorial prompt overlay — fixed at top, above real game UI */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        background: 'rgba(10,10,15,0.96)',
        borderBottom: '1px solid rgba(201,168,76,0.3)',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '44px',
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
            background: enemyTurnMsg || aiRunning
              ? 'rgba(120,80,30,0.12)'
              : 'rgba(201,168,76,0.08)',
            border: `1px solid ${enemyTurnMsg || aiRunning ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.25)'}`,
            borderRadius: '4px',
            padding: '5px 12px',
            fontSize: '14px',
            fontFamily: "'Crimson Text', serif",
            color: enemyTurnMsg || aiRunning ? '#c0a860' : '#f0e8d0',
            textAlign: 'center',
          }}>
            {promptText}
          </div>
        )}

        {!isFreePlay && !isGuided && (
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

      {/* Spacer to push content below the fixed tutorial overlay */}
      <div style={{ flexShrink: 0, height: '44px' }} />

      {/* Status Bar — same as real game */}
      <StatusBar
        state={state}
        myPlayerIndex={0}
        commandsUsed={commandsUsed}
        commandLimit={p1CommandLimit}
        aiThinking={aiRunning}
      />

      {/* Middle content row: left sidebar + board + right sidebar */}
      <div className="flex gap-2 flex-1 min-h-0">

        {/* Left column: phase tracker + card detail */}
        <div
          className="flex-shrink-0 flex flex-col gap-2"
          style={{ width: 220, minHeight: 0, visibility: hideCardDetail ? 'hidden' : 'visible' }}
        >
          <PhaseTracker
            phase={state.phase}
            phaseChangeId={`${state.turn}-${state.activePlayer}-${state.phase}`}
          />
          <CardDetailPanel
            inspectedItem={inspectedItem}
            state={state}
            handlers={handlers}
            phase={state.phase}
            isP1Turn={isP1Turn}
          />
        </div>

        {/* Center: CommandDisplay + Board */}
        <div className="flex flex-1 min-w-0 min-h-0">
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            <TurnBanner activePlayer={state.activePlayer} myPlayerIndex={0} />
            <div className="flex items-center flex-1 min-h-0 justify-center">
              <div className="flex flex-shrink-0 items-center">
                <CommandDisplay commandsUsed={commandsUsed} commandLimit={p1CommandLimit} />
              </div>
              <div className="flex-1 min-w-0 min-h-0">
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
                  spellTargetUids={spellTargetUids.length > 0
                    ? spellTargetUids
                    : (hintHighlightUids.length > 0 ? hintHighlightUids : tutorialHighlightUids)}
                  archerShootTargets={[]}
                  sacrificeTargetUids={[]}
                  selectedSacrificeUid={null}
                  championAbilityTargetUids={[]}
                  opponentMoveTiles={new Set()}
                  handlers={handlers}
                  onInspectUnit={handlers.handleInspectUnit}
                  onClearInspect={handlers.handleClearInspect}
                  onInspectTerrain={handlers.handleInspectTerrain}
                  isMyTurn={isP1Turn}
                  myPlayerIndex={0}
                  isMobile={false}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar: game log + action buttons */}
        <div
          className="w-48 flex-shrink-0 flex flex-col gap-2"
          style={{ minHeight: 0 }}
        >
          {/* Log hidden per-scenario via visibility so layout frame stays stable */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', visibility: hideLog ? 'hidden' : 'visible' }}>
            <Log entries={state.log} />
          </div>

          {/* Action buttons panel */}
          <div
            className="flex flex-col gap-2 flex-shrink-0"
            style={{
              background: '#0a0a14',
              border: '1px solid #1e1e2e',
              borderRadius: '6px',
              padding: '8px',
            }}
          >
            {isP1Turn && (
              <div className="flex flex-col gap-1">
                {(selectMode === 'summon' || selectMode === 'spell') && (
                  <button
                    onClick={handleCancelSpellAction}
                    style={{
                      background: 'transparent',
                      border: '1px solid #4a4a6a',
                      borderRadius: '4px',
                      color: '#6a6a8a',
                      fontFamily: "'Cinzel', serif",
                      fontSize: '11px',
                      padding: '6px 8px',
                      cursor: 'pointer',
                      letterSpacing: '0.03em',
                    }}
                  >
                    Cancel
                  </button>
                )}
                {showEndTurnBtn && (
                  <button
                    onClick={handleEndAction}
                    style={{
                      background: highlightEndTurnBtn
                        ? 'linear-gradient(135deg, #6a5a00, #E8C84C)'
                        : 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                      color: '#0a0a0f',
                      fontFamily: "'Cinzel', serif",
                      fontSize: '12px',
                      fontWeight: 600,
                      border: highlightEndTurnBtn ? '2px solid #E8C84C' : 'none',
                      borderRadius: '4px',
                      padding: '8px 6px',
                      cursor: 'pointer',
                      letterSpacing: '0.05em',
                      boxShadow: highlightEndTurnBtn
                        ? '0 0 12px rgba(201,168,76,0.6)'
                        : '0 2px 8px rgba(0,0,0,0.4)',
                      textTransform: 'uppercase',
                    }}
                  >
                    End Turn →
                  </button>
                )}
                {isFreePlay && !state.winner && (
                  <button
                    onClick={computeHint}
                    disabled={hintsUsedThisTurn >= 1}
                    style={{
                      background: hintsUsedThisTurn >= 1 ? 'transparent' : 'rgba(201,168,76,0.1)',
                      border: `1px solid ${hintsUsedThisTurn >= 1 ? '#2a2a3a' : 'rgba(201,168,76,0.4)'}`,
                      borderRadius: '4px',
                      color: hintsUsedThisTurn >= 1 ? '#3a3a5a' : '#C9A84C',
                      fontFamily: "'Cinzel', serif",
                      fontSize: '10px',
                      padding: '5px 8px',
                      cursor: hintsUsedThisTurn >= 1 ? 'default' : 'pointer',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Hint
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar: P1 hand (same as real game) */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          color: '#4a8abf',
          padding: '4px 8px 2px',
          fontWeight: 600,
        }}>
          Valorian
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '4px 8px 8px' }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '10px 12px',
            background: '#0f0f1e',
            border: '1px solid #252538',
            borderRadius: 8,
            minWidth: 72,
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 10, color: '#6a6a88', fontWeight: 500, fontFamily: 'var(--font-sans)', letterSpacing: '0.05em', marginBottom: 2 }}>
              MANA
            </div>
            <ResourceDisplay current={mana} max={10} maxThisTurn={maxMana} playerColor="#185FA5" small={false} />
          </div>
          <div style={{ overflow: 'hidden' }}>
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
        </div>
      </div>

      {/* Free play reminder (scenario 5) */}
      {isFreePlay && !state.winner && !showTurnLimitMsg && (
        <div style={{
          position: 'fixed',
          bottom: '56px',
          right: '16px',
          background: 'rgba(10,10,20,0.88)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '11px',
          color: '#8080a0',
          maxWidth: '200px',
          lineHeight: 1.5,
          fontFamily: 'inherit',
          pointerEvents: 'none',
        }}>
          {scenario.reminderText}
        </div>
      )}

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

      {/* Scenario 4: win overlay */}
      {isGuided && guidedWon && (
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
            <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '16px', color: '#e2e8f0', lineHeight: 1.6, marginBottom: '24px', whiteSpace: 'pre-line' }}>
              {"You win!\n\nReduce the enemy champion to 0 HP to claim victory.\n\nSPD 1 units move 1 tile per turn. SPD 2 units move twice as far."}
            </p>
            <button
              onClick={() => {
                markCompleted(scenario.id);
                if (onComplete) onComplete(scenario.id);
              }}
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
              {state.winner === 'Player 1' ? 'LESSON COMPLETE' : showTurnLimitMsg ? 'PRACTICE COMPLETE' : 'DEFEAT'}
            </div>
            <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '16px', color: '#e2e8f0', lineHeight: 1.6, marginBottom: '24px' }}>
              {state.winner === 'Player 1'
                ? "You're ready for battle. Head to the lobby to build your deck and prove your strength."
                : showTurnLimitMsg
                ? 'Good effort. Try again or move on to a real match.'
                : 'The enemy champion was victorious. Try again to sharpen your skills.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  markCompleted(scenario.id);
                  setState(buildTutorialState(scenario));
                  setShowTurnLimitMsg(false);
                  setHintActive(false);
                  setHintsUsedThisTurn(0);
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
              {state.winner === 'Player 1' && onGoToLobby && (
                <button
                  onClick={() => {
                    markCompleted(scenario.id);
                    onGoToLobby();
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #1a4a8a, #2a6ac9)',
                    color: '#f0f4ff',
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
                  Go to Lobby
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
