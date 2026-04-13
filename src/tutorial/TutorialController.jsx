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
 * Layout matches the real game:
 *   - Commands + mana display on the LEFT of the board
 *   - End Turn button at BOTTOM RIGHT
 *   - Tutorial prompt banner at the TOP
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
  manhattan,
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
import { ResourceDisplay } from '../components/StatusBar.jsx';
import { CommandDisplay } from '../App.jsx';

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
      const aiSteps = runAITurnSteps(currentS);
      const finalAI = aiSteps.length > 0 ? aiSteps[aiSteps.length - 1] : currentS;

      // Replay each AI step with a short delay for visual feedback
      let i = 0;
      function replay() {
        if (i >= aiSteps.length) {
          const advanced = autoAdvancePhase(finalAI);
          setState(advanced);
          latestStateRef.current = advanced;
          aiRunningRef.current = false;
          setAiRunning(false);
          setEnemyTurnMsg('');
          if (afterAI) afterAI(advanced);
          return;
        }
        setState(aiSteps[i]);
        latestStateRef.current = aiSteps[i];
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
      const aiSteps = runAITurnSteps(s);
      const finalState = aiSteps.length > 0 ? aiSteps[aiSteps.length - 1] : s;
      let i = 0;
      function replay() {
        if (i >= aiSteps.length) {
          const advanced = autoAdvancePhase(aiSteps[aiSteps.length - 1] ?? s);
          setState(advanced);
          latestStateRef.current = advanced;
          aiRunningRef.current = false;
          setHintsUsedThisTurn(0);
          return;
        }
        setState(aiSteps[i]);
        latestStateRef.current = aiSteps[i];
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

  // Should End Turn be shown (and highlighted)?
  const showEndTurn = isP1Turn && !aiRunning && (
    isFreePlay ||
    isGuided ||
    currentStep?.validAction === 'endTurn' ||
    // Allow end turn in free-form guided/freePlay at any time
    false
  );

  // In scripted steps (non-freePlay, non-guided), only show End Turn if the current step calls for it
  const showEndTurnBtn = isP1Turn && !aiRunning && (isFreePlay || isGuided || currentStep?.validAction === 'endTurn');
  const highlightEndTurnBtn = !isFreePlay && !isGuided && currentStep?.highlightEndTurn;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Tutorial banner — top of screen */}
      <div style={{
        background: 'rgba(10,10,15,0.97)',
        borderBottom: '1px solid rgba(201,168,76,0.3)',
        padding: '8px 16px',
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
            background: enemyTurnMsg || aiRunning
              ? 'rgba(120,80,30,0.12)'
              : 'rgba(201,168,76,0.08)',
            border: `1px solid ${enemyTurnMsg || aiRunning ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.25)'}`,
            borderRadius: '4px',
            padding: '6px 12px',
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

      {/* Main game area: left panel + board + right panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '8px',
        gap: '0',
        overflow: 'hidden',
      }}>
        {/* LEFT PANEL: Commands + Mana (matches real game layout) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          paddingTop: '16px',
          paddingRight: '4px',
          flexShrink: 0,
          width: '64px',
        }}>
          <CommandDisplay commandsUsed={commandsUsed} />
          <div style={{ marginTop: '8px' }}>
            <ResourceDisplay
              current={mana}
              max={10}
              maxThisTurn={maxMana}
              playerColor="#185FA5"
              small
            />
          </div>
        </div>

        {/* CENTER: Board + Hand */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
          minWidth: 0,
          maxWidth: '480px',
        }}>
          {/* Board */}
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
            onInspectUnit={() => {}}
            onClearInspect={() => {}}
            onInspectTerrain={() => {}}
            isMyTurn={isP1Turn}
            myPlayerIndex={0}
            isMobile={false}
          />

          {/* Hand */}
          {state.players[0].hand.length > 0 && (
            <div style={{ width: '100%' }}>
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
        </div>

        {/* RIGHT PANEL: End Turn + status + hint button */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '8px',
          paddingTop: '16px',
          paddingLeft: '8px',
          flexShrink: 0,
          width: '108px',
        }}>
          {/* End Turn button — right side of board */}
          {showEndTurnBtn && (
            <button
              onClick={handleEndAction}
              style={{
                background: highlightEndTurnBtn
                  ? 'linear-gradient(135deg, #6a5a00, #E8C84C)'
                  : 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                color: '#0a0a0f',
                fontFamily: "'Cinzel', serif",
                fontSize: '11px',
                fontWeight: 600,
                border: highlightEndTurnBtn ? '2px solid #E8C84C' : 'none',
                borderRadius: '4px',
                padding: '7px 6px',
                cursor: 'pointer',
                letterSpacing: '0.03em',
                boxShadow: highlightEndTurnBtn
                  ? '0 0 12px rgba(201,168,76,0.6)'
                  : '0 2px 8px rgba(0,0,0,0.4)',
                whiteSpace: 'nowrap',
              }}
            >
              End Turn →
            </button>
          )}

          {/* Champion HP display */}
          <div style={{ fontSize: '10px', color: '#6a6a8a', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
            <div style={{ color: '#a0c0f0' }}>You: {state.champions[0]?.hp ?? 20}</div>
            <div style={{ color: '#f06060' }}>Enemy: {state.champions[1]?.hp ?? 20}</div>
          </div>

          {/* Hint button — scenario 5 only */}
          {isFreePlay && isP1Turn && !state.winner && (
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
                whiteSpace: 'nowrap',
              }}
            >
              Hint
            </button>
          )}
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
