import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame.js';
import { getAuraAtkBonus } from '../engine/gameEngine.js';
import { KEYWORD_REMINDERS } from '../engine/keywords.js';
import DeckSelect from './DeckSelect.jsx';
import {
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
import { getGuestId } from '../supabase.js';
import StatusBar, { ResourceDisplay } from './StatusBar.jsx';
import Board from './Board.jsx';
import Hand from './Hand.jsx';
import Log from './Log.jsx';
import PhaseTracker from './PhaseTracker.jsx';

const PHASE_GUIDANCE = {
  'begin-turn': 'Beginning turn…',
  action: 'Move your champion, play cards, and move units in any order. Click End Phase when done.',
  'end-turn': 'Click "End Turn" to pass to opponent.',
  discard: 'You have too many cards. Click a card to discard.',
};


export default function MultiplayerGame({ gameId, onBackToLobby }) {
  const {
    session,
    loading,
    error,
    gameState,
    myPlayerIndex,
    isMyTurn,
    dispatchAction,
    guestId,
    opponentDisconnected,
    abandonGame,
    playAgain,
    selectDeck,
    inDeckSelect,
    myDeck,
    opponentDeck,
    cancelWaiting,
  } = useMultiplayerGame(gameId);

  // Local UI selection state
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectMode, setSelectMode] = useState(null);
  const [inspectedItem, setInspectedItem] = useState(null);
  const [mobileModalItem, setMobileModalItem] = useState(null);
  const [mobilePrimedCard, setMobilePrimedCard] = useState(null);
  const [playAgainLoading, setPlayAgainLoading] = useState(false);
  const [isRematch, setIsRematch] = useState(false);
  const [opponentLeftCountdown, setOpponentLeftCountdown] = useState(null);
  const prevStatusRef = useRef(null);
  const countdownRef = useRef(null);

  // Detect status transitions: rematch and opponent-left
  useEffect(() => {
    const prev = prevStatusRef.current;
    const cur = session?.status;
    if (prev === 'complete' && cur === 'deck_select') {
      setIsRematch(true);
    }
    if (cur === 'abandoned' && prev !== 'abandoned') {
      setOpponentLeftCountdown(5);
    }
    prevStatusRef.current = cur;
  }, [session?.status]);

  useEffect(() => {
    if (opponentLeftCountdown === null) return;
    if (opponentLeftCountdown <= 0) {
      onBackToLobby();
      return;
    }
    countdownRef.current = setTimeout(() => {
      setOpponentLeftCountdown(n => n - 1);
    }, 1000);
    return () => clearTimeout(countdownRef.current);
  }, [opponentLeftCountdown, onBackToLobby]);

  const clearSelection = useCallback(() => {
    setSelectedCard(null);
    setSelectedUnit(null);
    setSelectMode(null);
  }, []);

  const NO_TARGET_SPELL_EFFECTS = new Set([
    'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
    'ironthorns', 'infernalpact', 'martiallaw', 'fortify',
  ]);

  // Dispatch helper: compute new state then write to Supabase
  const dispatch = useCallback(async (newState) => {
    clearSelection();
    await dispatchAction(newState);
  }, [dispatchAction, clearSelection]);

  // ── Action handlers ────────────────────────────────────────────────────

  const handleChampionMoveTile = useCallback(async (row, col) => {
    if (!gameState) return;
    await dispatch(moveChampion(gameState, row, col));
  }, [gameState, dispatch]);

  const handlePlayCard = useCallback(async (cardUid) => {
    if (!gameState) return;

    // Second click on the already-selected card → deselect
    if (cardUid === selectedCard) {
      clearSelection();
      if (gameState.pendingSpell || gameState.pendingSummon) {
        await dispatch(cancelSpell(gameState));
      }
      return;
    }

    setSelectedUnit(null);
    setSelectMode(null);

    // Cancel any leftover pending state from a previous selection
    const base = (gameState.pendingSpell || gameState.pendingSummon) ? cancelSpell(gameState) : gameState;
    const p = base.players[base.activePlayer];
    const card = p.hand.find(c => c.uid === cardUid);
    if (!card || p.resources < card.cost) return;

    // Targetless spell: preview mode — don't execute yet
    if (card.type === 'spell' && NO_TARGET_SPELL_EFFECTS.has(card.effect)) {
      setSelectedCard(cardUid);
      setSelectMode('targetless_spell');
      if (base !== gameState) await dispatchAction(base);
      return;
    }

    const s = playCard(base, cardUid);
    if (s.pendingSummon) {
      setSelectedCard(cardUid);
      setSelectMode('summon');
      await dispatchAction(s);
    } else if (s.pendingSpell) {
      setSelectedCard(cardUid);
      setSelectMode('spell');
      await dispatchAction(s);
    } else {
      await dispatch(s);
    }
  }, [gameState, selectedCard, clearSelection, dispatch, dispatchAction]);

  const handleCastTargetlessSpell = useCallback(async () => {
    if (!gameState || !selectedCard || selectMode !== 'targetless_spell') return;
    const s = playCard(gameState, selectedCard);
    await dispatch(s);
  }, [gameState, selectedCard, selectMode, dispatch]);

  const handleSummonOnTile = useCallback(async (row, col) => {
    if (!gameState || !selectedCard) return;
    const s = summonUnit(gameState, selectedCard, row, col);
    if (s.pendingFleshtitheSacrifice) {
      setSelectMode('fleshtithe_sacrifice');
      await dispatchAction(s);
    } else {
      await dispatch(s);
    }
  }, [gameState, selectedCard, dispatch, dispatchAction]);

  const handleFleshtitheSacrifice = useCallback(async (choice, sacrificeUid) => {
    if (!gameState) return;
    await dispatch(resolveFleshtitheSacrifice(gameState, choice, sacrificeUid));
  }, [gameState, dispatch]);

  const handleSpellTarget = useCallback(async (targetUid) => {
    if (!gameState) return;
    const cardUid = gameState.pendingSpell?.cardUid ?? selectedCard;
    if (!cardUid && !gameState.pendingSpell) return;
    const newState = resolveSpell(gameState, cardUid, targetUid);
    if (newState.pendingSpell) {
      // Multi-step spell or action: stay in spell mode, don't clear selection
      await dispatchAction(newState);
    } else {
      await dispatch(newState);
    }
  }, [gameState, selectedCard, dispatch, dispatchAction]);

  const handleCancelSpell = useCallback(async () => {
    if (!gameState) return;
    await dispatch(cancelSpell(gameState));
  }, [gameState, dispatch]);

  const handleEndAction = useCallback(async () => {
    if (!gameState) return;
    await dispatch(endActionPhase(gameState));
  }, [gameState, dispatch]);

  const handleSelectChampion = useCallback(() => {
    setSelectedUnit(null);
    setSelectedCard(null);
    setSelectMode('champion_move');
  }, []);

  const handleSelectUnit = useCallback((unitUid) => {
    setSelectedUnit(unitUid);
    setSelectMode('unit_move');
  }, []);

  const handleMoveUnit = useCallback(async (row, col) => {
    if (!gameState || !selectedUnit) return;
    await dispatch(moveUnit(gameState, selectedUnit, row, col));
  }, [gameState, selectedUnit, dispatch]);

  const handleArcherSelectTarget = useCallback((archerUid) => {
    setSelectedUnit(archerUid);
    setSelectMode('archer_target');
  }, []);

  const handleArcherShoot = useCallback(async (targetUid) => {
    if (!gameState || !selectedUnit) return;
    await dispatch(archerShoot(gameState, selectedUnit, targetUid));
  }, [gameState, selectedUnit, dispatch]);

  const handleEndTurn = useCallback(async () => {
    if (!gameState) return;
    await dispatch(endTurn(gameState));
  }, [gameState, dispatch]);

  const handleDiscardCard = useCallback(async (cardUid) => {
    if (!gameState) return;
    await dispatch(discardCard(gameState, cardUid));
  }, [gameState, dispatch]);

  const handleRevealUnit = useCallback(async (unitUid) => {
    if (!gameState) return;
    await dispatch(playerRevealUnit(gameState, unitUid));
  }, [gameState, dispatch]);

  // Units whose action needs a target (routes through pendingSpell / resolveSpell)
  const TARGETED_ACTION_UNITS = new Set(['battlepriestunit', 'woodlandguard', 'packrunner', 'elfarcher']);

  const handleTriggerUnitAction = useCallback(async (unitUid) => {
    if (!gameState) return;
    const newState = triggerUnitAction(gameState, unitUid);
    if (newState.pendingSpell) {
      setSelectedCard(newState.pendingSpell.cardUid);
      setSelectMode('spell');
      await dispatchAction(newState);
    } else {
      await dispatch(newState);
    }
  }, [gameState, dispatch, dispatchAction]);

  const handleActionButtonClick = useCallback((unitUid) => {
    if (!gameState) return;
    const unit = gameState.units.find(u => u.uid === unitUid);
    if (!unit) return;
    if (TARGETED_ACTION_UNITS.has(unit.id)) {
      handleTriggerUnitAction(unitUid);
    } else {
      setSelectMode('action_confirm');
    }
  }, [gameState, TARGETED_ACTION_UNITS, handleTriggerUnitAction]);

  const handleConfirmAction = useCallback(async () => {
    if (!selectedUnit) return;
    await handleTriggerUnitAction(selectedUnit);
  }, [selectedUnit, handleTriggerUnitAction]);

  const handleInspectUnit = useCallback((unit) => {
    setInspectedItem({ type: 'unit', uid: unit.uid });
    if (window.innerWidth < 768 && gameState) {
      const isMoveable = unit.owner === myPlayerIndex && !unit.moved && !unit.summoned;
      if (selectedUnit === unit.uid || !isMoveable || !isMyTurn || gameState.phase !== 'action') {
        setMobileModalItem({ type: 'unit', uid: unit.uid });
      }
    }
  }, [selectedUnit, myPlayerIndex, isMyTurn, gameState]);

  const handleInspectCard = useCallback((card) => {
    setInspectedItem({ type: 'card', card });
  }, []);

  const handleClearInspect = useCallback(() => {
    setInspectedItem(null);
  }, []);

  const handleInspectTerrain = useCallback(() => {
    setInspectedItem({ type: 'terrain', name: 'Throne' });
    if (window.innerWidth < 768) {
      setMobileModalItem({ type: 'terrain', name: 'Throne' });
    }
  }, []);

  const handleMobileModalDismiss = useCallback(() => {
    if (mobileModalItem?.type === 'card') {
      setMobilePrimedCard(mobileModalItem.card.uid);
    }
    setMobileModalItem(null);
  }, [mobileModalItem]);

  const handleMobileHandCardTap = useCallback((card) => {
    const canPlayNow = isMyTurn && gameState?.phase === 'action';
    if (mobilePrimedCard === card.uid && canPlayNow) {
      setMobilePrimedCard(null);
      handlePlayCard(card.uid);
    } else {
      setMobilePrimedCard(null);
      setMobileModalItem({ type: 'card', card });
    }
  }, [mobilePrimedCard, handlePlayCard, isMyTurn, gameState]);

  const handlePlayAgain = useCallback(async () => {
    if (playAgainLoading) return;
    setPlayAgainLoading(true);
    await playAgain();
    setPlayAgainLoading(false);
  }, [playAgain, playAgainLoading]);

  // ── Loading / Error states ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-400 text-sm">Connecting to game…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
            onClick={onBackToLobby}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Deck selection phase
  if (inDeckSelect) {
    // Player hasn't selected their deck yet
    if (!myDeck) {
      return (
        <DeckSelect
          onSelect={selectDeck}
          waitingForOpponent={false}
          opponentSelected={!!opponentDeck}
          isRematch={isRematch}
        />
      );
    }
    // Player selected, waiting for opponent
    return (
      <DeckSelect
        onSelect={selectDeck}
        waitingForOpponent={true}
        selectedDeck={myDeck}
        opponentSelected={!!opponentDeck}
        isRematch={isRematch}
      />
    );
  }

  // Waiting for player 2 to join (legacy waiting status or pre-deck-select)
  if ((session?.status === 'waiting' || (session?.status === 'deck_select' && !session?.player2_id)) && myPlayerIndex === 0) {
    const gameLink = `${window.location.origin}${window.location.pathname}#/game/${gameId}`;
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-amber-400">GRIDHOLM</h1>
          <p className="text-gray-300 text-sm">Waiting for opponent to join…</p>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
            <div>
              <div className="text-gray-400 text-xs mb-1">Game ID</div>
              <div className="text-3xl font-mono font-bold text-white tracking-widest">{gameId}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs mb-1">Share link</div>
              <div className="bg-gray-900 rounded px-2 py-1.5 text-xs text-gray-300 font-mono break-all">
                {gameLink}
              </div>
              <button
                className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                onClick={() => navigator.clipboard?.writeText(gameLink)}
              >
                Copy link
              </button>
            </div>
          </div>
          <button
            className="text-xs text-gray-500 hover:text-gray-300 underline"
            onClick={async () => { await cancelWaiting(); onBackToLobby(); }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // If player 2 slot is taken but we're neither player — show error
  if (session && myPlayerIndex === null) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">This game is already in progress.</p>
          <button
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
            onClick={onBackToLobby}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  const state = gameState;
  const { phase, winner, pendingDiscard } = state;
  const isActiveTurn = isMyTurn;
  const p1 = state.players[0];
  const p2 = state.players[1];
  const myPlayer = state.players[myPlayerIndex];
  const oppPlayerIndex = 1 - myPlayerIndex;
  const oppPlayer = state.players[oppPlayerIndex];

  const selectedCardObj = selectedCard ? myPlayer.hand.find(c => c.uid === selectedCard) : null;
  const selectedUnitObj = selectedUnit ? state.units.find(u => u.uid === selectedUnit) : null;

  let guidance = isActiveTurn ? (PHASE_GUIDANCE[phase] || '') : 'Waiting for opponent…';
  if (pendingDiscard && isActiveTurn) guidance = PHASE_GUIDANCE.discard;
  if (selectMode === 'summon') guidance = 'Click a green tile to summon the unit.';
  if (selectMode === 'spell') guidance = 'Click a highlighted unit to target the spell.';
  if (selectMode === 'targetless_spell') {
    guidance = `Click Cast to play ${selectedCardObj?.name ?? 'spell'} or click the card again to cancel.`;
  }
  if (selectMode === 'unit_move') {
    guidance = selectedUnitObj?.action && !selectedUnitObj.moved
      ? `Move ${selectedUnitObj.name} to a highlighted tile or click Action to use its ability.`
      : 'Click a blue tile to move the unit. Or select another unit.';
  }
  if (selectMode === 'action_confirm' && selectedUnitObj) guidance = `Use ${selectedUnitObj.name} Action?`;
  if (selectMode === 'fleshtithe_sacrifice') guidance = 'Select a friendly unit to sacrifice for Flesh Tithe +2/+2, or click Cancel to summon as 3/3.';

  const showAction = selectedUnitObj?.action === true
    && !selectedUnitObj.moved
    && !selectedUnitObj.summoned
    && selectMode === 'unit_move'
    && phase === 'action'
    && isActiveTurn;
  const showHiddenReveal = selectedUnitObj?.hidden
    && selectedUnitObj.owner === myPlayerIndex
    && !selectedUnitObj.moved
    && selectMode === 'unit_move'
    && phase === 'action'
    && isActiveTurn;

  // Derived highlight data (only valid when it's my turn and champion is explicitly selected)
  const championMoveTiles = phase === 'action' && isActiveTurn && selectMode === 'champion_move'
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
        .filter(u => u.owner === myPlayerIndex && u.uid !== state.pendingFleshtitheSacrifice.unitUid)
        .map(u => u.uid)
    : [];

  const handlers = {
    handleChampionMoveTile,
    handlePlayCard,
    handleCastTargetlessSpell,
    handleSummonOnTile,
    handleSpellTarget,
    handleCancelSpell,
    handleEndAction,
    handleSelectChampion,
    handleSelectUnit,
    handleMoveUnit,
    handleArcherSelectTarget,
    handleArcherShoot,
    handleTriggerUnitAction,
    handleActionButtonClick,
    handleConfirmAction,
    handleRevealUnit,
    handleFleshtitheSacrifice,
    handleEndTurn,
    handleDiscardCard,
    handleNewGame: onBackToLobby,
    clearSelection,
    handleInspectUnit,
    handleInspectCard,
    handleClearInspect,
    handleInspectTerrain,
  };

  return (
    <div className="h-screen overflow-hidden bg-gray-950 text-white p-2 flex flex-col gap-2">
      {/* Opponent left overlay (after game over) */}
      {opponentLeftCountdown !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-60">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl p-8 text-center shadow-2xl max-w-xs">
            <p className="text-gray-300 font-bold mb-2">Opponent left the game</p>
            <p className="text-gray-500 text-sm">Returning to lobby in {opponentLeftCountdown}…</p>
          </div>
        </div>
      )}

      {/* Winner overlay */}
      {winner && opponentLeftCountdown === null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-yellow-500 rounded-2xl p-8 text-center shadow-2xl">
            <div className="text-4xl mb-4">🏆</div>
            <h2 className="text-2xl font-bold text-yellow-400 mb-2">{winner} wins!</h2>
            <p className="text-gray-300 mb-6">The champion has fallen.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-2 rounded-lg"
                onClick={handlePlayAgain}
                disabled={playAgainLoading}
              >
                {playAgainLoading ? 'Resetting…' : 'Play Again'}
              </button>
              <button
                className="bg-gray-600 hover:bg-gray-500 text-white font-bold px-6 py-2 rounded-lg"
                onClick={async () => { await abandonGame(); onBackToLobby(); }}
              >
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent disconnected overlay */}
      {opponentDisconnected && !winner && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40">
          <div className="bg-gray-800 border border-orange-500 rounded-2xl p-6 text-center shadow-2xl max-w-xs">
            <p className="text-orange-400 font-bold mb-2">Opponent disconnected</p>
            <p className="text-gray-400 text-sm mb-4">
              Your opponent hasn't made a move in over a minute. They may have disconnected.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm"
                onClick={async () => { await abandonGame(); onBackToLobby(); }}
              >
                Abandon Game
              </button>
              <button
                className="bg-gray-600 hover:bg-gray-500 text-white font-bold px-4 py-2 rounded-lg text-sm"
                onClick={onBackToLobby}
              >
                Keep Waiting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Turn lock banner */}
      {!isActiveTurn && !winner && (
        <div className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-xs text-center text-gray-400 flex-shrink-0">
          Waiting for opponent…
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-bold text-amber-400 tracking-wide">GRIDHOLM</h1>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 hidden sm:inline">#{gameId}</span>
          <button
            className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-2 py-1 rounded"
            onClick={onBackToLobby}
          >
            Lobby
          </button>
        </div>
      </div>

      {/* Player identity indicator */}
      <div className={`text-xs font-semibold px-2 py-0.5 rounded text-center flex-shrink-0 ${myPlayerIndex === 0 ? 'text-blue-300 bg-blue-950/60 border border-blue-800' : 'text-red-300 bg-red-950/60 border border-red-800'}`}>
        You are {myPlayerIndex === 0 ? 'Player 1' : 'Player 2'}
      </div>

      {/* Status Bar */}
      <StatusBar state={state} myPlayerIndex={myPlayerIndex} />

      {/* Middle content row */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left column: phase tracker + card detail */}
        <div className="flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ width: 140, minHeight: 0 }}>
          <PhaseTracker
            phase={phase}
            phaseChangeId={`${state.turn}-${state.activePlayer}-${phase}`}
          />
          <CardDetailPanel inspectedItem={inspectedItem} state={state} myPlayerIndex={myPlayerIndex} />
        </div>

        {/* Center: board */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <Board
            state={state}
            selectedUnit={selectedUnit}
            selectMode={isActiveTurn ? selectMode : null}
            championMoveTiles={isActiveTurn ? championMoveTiles : []}
            summonTiles={isActiveTurn ? summonTiles : []}
            unitMoveTiles={isActiveTurn ? unitMoveTiles : []}
            spellTargetUids={isActiveTurn ? spellTargetUids : []}
            archerShootTargets={isActiveTurn ? archerShootTargets : []}
            sacrificeTargetUids={isActiveTurn ? sacrificeTargetUids : []}
            handlers={handlers}
            onInspectUnit={handleInspectUnit}
            onClearInspect={handleClearInspect}
            onInspectTerrain={handleInspectTerrain}
            isMyTurn={isActiveTurn}
            myPlayerIndex={myPlayerIndex}
          />
        </div>

        {/* Right sidebar: game log */}
        <div className="w-48 flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ minHeight: 0 }}>
          <div className="text-xs text-gray-400 mb-1 px-1">Game Log</div>
          <Log entries={state.log} />
        </div>
      </div>

      {/* Bottom bar: guidance + action buttons */}
      <div className="instruction-bar rounded-lg px-3 py-1.5 flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center flex-shrink-0 text-xs" style={{ background: '#0f0f1e', borderTop: '1px solid #252538', border: '1px solid #252538' }}>
        <span className="hidden sm:inline sm:flex-1" style={{ fontSize: '13px', fontFamily: 'var(--font-sans)', color: selectMode === 'spell' || selectMode === 'summon' || selectMode === 'targetless_spell' || selectMode === 'unit_move' || selectMode === 'action_confirm' || selectMode === 'fleshtithe_sacrifice' ? '#C9A84C' : '#9090b8', fontWeight: selectMode ? 500 : 400 }}>{guidance}</span>

        {isActiveTurn && (
          <>
            {phase === 'action' && selectMode === 'summon' && (
              <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="gray" />
            )}
            {phase === 'action' && selectMode === 'spell' && (
              <ActionBtn onClick={handleCancelSpell} label="Cancel Spell" variant="gray" />
            )}
            {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
              <ActionBtn onClick={() => handleFleshtitheSacrifice('no', null)} label="Cancel (summon as 3/3)" variant="gray" />
            )}
            {phase === 'action' && selectMode === 'targetless_spell' && (
              <>
                <ActionBtn onClick={handleCastTargetlessSpell} label={`Cast ${selectedCardObj?.name ?? 'Spell'}`} variant="blue" />
                <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="gray" />
              </>
            )}
            {phase === 'action' && showAction && (
              <ActionBtn
                onClick={() => handleActionButtonClick(selectedUnit)}
                label="Action"
                variant="amber"
              />
            )}
            {phase === 'action' && selectMode === 'action_confirm' && selectedUnitObj && (
              <>
                <ActionBtn onClick={handleConfirmAction} label="Confirm" variant="amber" />
                <ActionBtn onClick={clearSelection} label="Cancel" variant="gray" />
              </>
            )}
            {phase === 'action' && showHiddenReveal && (
              <ActionBtn
                onClick={() => { handleRevealUnit(selectedUnit); clearSelection(); }}
                label="Reveal"
                variant="gold"
              />
            )}
            {phase === 'action' && selectedUnit && (
              <ActionBtn onClick={clearSelection} label="Deselect" variant="gray" />
            )}
            {phase === 'action' && (
              <ActionBtn onClick={handleEndAction} label="End Phase →" fullWidth />
            )}
            {phase === 'end-turn' && !pendingDiscard && (
              <ActionBtn onClick={handleEndTurn} label="End Turn ⏎" variant="green" fullWidth />
            )}
            {pendingDiscard && (
              <span className="text-xs text-yellow-400 font-semibold">Discard a card to continue</span>
            )}
          </>
        )}
      </div>

      {/* Opponent hand (face down) */}
      {/* NEVER RENDER OPPONENT RESOURCES - game design decision */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg flex-shrink-0">
        <div className="text-xs text-red-400 px-2 pt-1 font-semibold">
          {oppPlayer.name}
        </div>
        <Hand
          player={oppPlayer}
          resources={oppPlayer.resources}
          isActive={false}
          canPlay={false}
          pendingDiscard={false}
          selectedCard={null}
          onPlayCard={() => {}}
          onDiscardCard={() => {}}
          onInspectCard={() => {}}
        />
      </div>

      {/* My hand (face up) */}
      <div className={`bg-gray-800/50 border rounded-lg flex-shrink-0 ${pendingDiscard && isActiveTurn ? 'border-yellow-500' : 'border-gray-700'}`}>
        <div className="text-xs text-blue-400 px-2 pt-1 font-semibold">
          {myPlayer.name} (you)
          <span className="hidden sm:inline">
            {phase === 'action' && isActiveTurn ? '  (click cards to play)' : ''}
            {pendingDiscard && isActiveTurn ? '  — click a card to discard' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '4px 8px 8px' }}>
          {/* Resource panel */}
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
              RESOURCES
            </div>
            <ResourceDisplay
              current={myPlayer.resources}
              max={10}
              playerColor={myPlayerIndex === 0 ? '#185FA5' : '#993C1D'}
              small={false}
            />
          </div>
          {/* Hand cards */}
          <div style={{ overflow: 'hidden' }}>
            <Hand
              player={myPlayer}
              resources={myPlayer.resources}
              isActive={true}
              canPlay={isActiveTurn && phase === 'action'}
              pendingDiscard={pendingDiscard && isActiveTurn}
              pendingHandSelect={isActiveTurn && selectMode === 'hand_select'}
              selectedCard={selectedCard}
              onPlayCard={handlePlayCard}
              onDiscardCard={handleDiscardCard}
              onHandSelect={async (cardUid) => {
                if (!gameState) return;
                const s = resolveHandSelect(gameState, cardUid);
                await dispatch(s);
              }}
              onInspectCard={handleInspectCard}
              isMobile={window.innerWidth < 768}
              onMobileTap={handleMobileHandCardTap}
            />
          </div>
        </div>
      </div>
      {/* Mobile card detail modal */}
      {mobileModalItem && (
        <CardDetailModal
          inspectedItem={mobileModalItem}
          state={state}
          onClose={handleMobileModalDismiss}
          myPlayerIndex={myPlayerIndex}
        />
      )}
    </div>
  );
}

function getActiveKeywords(source) {
  const keys = ['rush', 'hidden', 'action', 'cannotMove', 'legendary'];
  const result = [];
  for (const key of keys) {
    if (source[key]) result.push({ key, ...KEYWORD_REMINDERS[key] });
  }
  if (source.aura) {
    const range = source.aura.range;
    const base = KEYWORD_REMINDERS.aura;
    const label = range === 1 ? 'Aura 1' : range === 2 ? 'Aura 2' : base.label;
    result.push({ key: 'aura', ...base, label });
  }
  return result;
}

function KeywordBubbles({ keywords }) {
  if (!keywords || keywords.length === 0) return null;
  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0' }}>
        {keywords.map(kw => (
          <div
            key={kw.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: `${kw.color}26`,
              border: `0.5px solid ${kw.color}`,
              borderRadius: '99px',
              padding: '4px 10px',
              marginRight: '6px',
              marginBottom: '6px',
              cursor: 'default',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 500, color: kw.color, fontFamily: 'var(--font-sans)' }}>
              {kw.label}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {keywords.map(kw => (
          <div
            key={kw.key}
            style={{
              fontSize: '12px',
              color: '#9090b8',
              lineHeight: 1.5,
              padding: '6px 8px',
              background: '#1a1a2e',
              borderRadius: '4px',
              borderLeft: `2px solid ${kw.color}`,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span style={{ fontWeight: 500, color: kw.color }}>{kw.label}: </span>
            {kw.reminder}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardDetailContent({ inspectedItem, state, large = false, myPlayerIndex }) {
  const nameStyle = { fontFamily: 'var(--font-sans)', fontSize: large ? '15px' : '15px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 };
  const typeStyle = { fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#9090b8' };
  const rulesStyle = {
    fontFamily: 'var(--font-sans)',
    fontStyle: 'normal',
    fontSize: '12px',
    fontWeight: 400,
    color: '#c0c0d8',
    lineHeight: 1.6,
    marginTop: '4px',
    borderTop: '0.5px solid #252538',
    paddingTop: '4px',
  };

  if (inspectedItem?.type === 'unit') {
    const unit = state.units.find(u => u.uid === inspectedItem.uid);
    if (!unit) return null;
    const ownerLabel = unit.owner === 0 ? 'P1' : 'P2';
    const ownerColor = unit.owner === 0 ? '#4a8abf' : '#bf4a4a';

    // Opponent's hidden unit: show redacted information
    const isOpponentHidden = unit.hidden && unit.owner !== myPlayerIndex;
    if (isOpponentHidden) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-start">
            <span style={nameStyle}>Hidden Unit</span>
            <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
          </div>
          <div style={typeStyle}>Unknown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e05050' }}>⚔ ???</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#50c050' }}>♥ ???</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#5090e0' }}>⚡ ???</div>
          </div>
        </div>
      );
    }

    const auraBonus = getAuraAtkBonus(state, unit);
    const displayAtk = unit.atk + (unit.atkBonus || 0) + auraBonus;
    const unitKeywords = !large ? getActiveKeywords(unit) : [];
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-start">
          <span style={{ ...nameStyle, color: unit.legendary ? '#C9A84C' : '#ffffff' }}>{unit.name}</span>
          <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
        </div>
        {unit.unitType && <div style={typeStyle}>{unit.unitType}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e05050' }}>
              {displayAtk}{auraBonus > 0 && <span style={{ color: '#5eead4', fontSize: '11px' }}> +{auraBonus}</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#50c050' }}>{unit.hp}/{unit.maxHp}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#5090e0' }}>{unit.spd + (unit.speedBonus || 0)}</div>
          </div>
        </div>
        {unit.shield > 0 && (
          <div style={{ fontSize: '11px', color: '#67e8f9', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>🛡 Shield: {unit.shield}</div>
        )}
        {unit.rules && <div style={rulesStyle}>{unit.rules}</div>}
        <KeywordBubbles keywords={unitKeywords} />
      </div>
    );
  }

  if (inspectedItem?.type === 'terrain') {
    const terrainKeyword = !large ? [{ key: 'terrain', ...KEYWORD_REMINDERS.terrain }] : [];
    return (
      <div className="flex flex-col gap-1">
        <span style={nameStyle}>Throne</span>
        <div style={{ ...typeStyle, color: '#9090b8' }}>Terrain</div>
        {large && (
          <div style={rulesStyle}>
            End your turn with your champion here to deal 4 damage to the enemy champion. This effect cannot reduce the enemy champion below 1 HP.
          </div>
        )}
        <KeywordBubbles keywords={terrainKeyword} />
      </div>
    );
  }

  if (inspectedItem?.type === 'card') {
    const card = inspectedItem.card;
    const cardKeywords = !large ? getActiveKeywords(card) : [];
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-start">
          <span style={{ ...nameStyle, color: card.legendary ? '#C9A84C' : '#ffffff' }}>{card.name}</span>
          <span style={{ background: '#C9A84C', color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px' }}>{card.cost}</span>
        </div>
        <div style={typeStyle}>{card.type === 'spell' ? 'Spell' : card.unitType}</div>
        {card.type === 'unit' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#e05050' }}>{card.atk}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#50c050' }}>{card.hp}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#5090e0' }}>{card.spd}</div>
            </div>
          </div>
        )}
        {card.rules && <div style={rulesStyle}>{card.rules}</div>}
        <KeywordBubbles keywords={cardKeywords} />
      </div>
    );
  }

  return null;
}

function CardDetailPanel({ inspectedItem, state, myPlayerIndex }) {
  return (
    <div
      className="bg-gray-900 border border-gray-700 rounded-lg p-2 flex flex-col"
      style={{ flex: 1, minHeight: 0 }}
    >
      <div className="text-xs text-gray-400 mb-1.5 font-semibold">Card Detail</div>
      <div className="flex-1 overflow-y-auto">
        {inspectedItem ? (
          <CardDetailContent inspectedItem={inspectedItem} state={state} myPlayerIndex={myPlayerIndex} />
        ) : (
          <div className="text-gray-600 text-[10px] italic leading-snug">
            Click a card or unit to inspect
          </div>
        )}
      </div>
    </div>
  );
}

function CardDetailModal({ inspectedItem, state, onClose, myPlayerIndex }) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="relative bg-gray-900 border-2 border-amber-500 rounded-xl p-4 overflow-y-auto"
        style={{ width: 280, maxHeight: '80vh', zIndex: 10000 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          className="absolute top-2 right-2 flex items-center justify-center text-gray-400 hover:text-white text-sm"
          style={{ width: 44, height: 44 }}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        <div className="pr-6">
          <CardDetailContent inspectedItem={inspectedItem} state={state} large myPlayerIndex={myPlayerIndex} />
        </div>
      </div>
    </div>,
    document.body
  );
}

function ActionBtn({ onClick, label, variant = 'blue', fullWidth = false }) {
  const styles = {
    blue:  { background: 'linear-gradient(135deg, #1e40af, #2563eb)', color: '#d0d0e8' },
    green: { background: 'linear-gradient(135deg, #166534, #16a34a)', color: '#d0d0e8' },
    gray:  { background: '#1e1e2e', color: '#d0d0e8', border: '1px solid #3a3a5a' },
    pink:  { background: 'linear-gradient(135deg, #9d174d, #db2777)', color: '#d0d0e8' },
    gold:  { background: 'linear-gradient(135deg, #b45309, #C9A84C)', color: '#0a0a14' },
    amber: { background: 'linear-gradient(135deg, #92400e, #d97706)', color: '#0a0a14' },
  };
  const s = styles[variant] || styles.blue;
  return (
    <button
      className={`text-xs font-bold px-3 py-3 sm:py-1.5 rounded ${fullWidth ? 'w-full sm:w-auto' : ''}`}
      style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, ...s }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
