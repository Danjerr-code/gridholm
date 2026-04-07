import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { isMuted, setMuted } from '../audio.js';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame.js';
import useIsMobile from '../hooks/useIsMobile.js';
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
import { getGuestId, getCardImageUrl } from '../supabase.js';
import StatusBar, { ResourceDisplay } from './StatusBar.jsx';
import Board from './Board.jsx';
import Hand from './Hand.jsx';
import Log from './Log.jsx';
import PhaseTracker from './PhaseTracker.jsx';
import GameEndOverlay from './GameEndOverlay.jsx';

const PHASE_GUIDANCE = {
  'begin-turn': 'Beginning turn…',
  action: 'Move your champion, play cards, and move units in any order. Click End Turn when done.',
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
    concedeGame,
    abandonGame,
    playAgain,
    selectDeck,
    inDeckSelect,
    myDeck,
    opponentDeck,
    cancelWaiting,
  } = useMultiplayerGame(gameId);

  const isMobile = useIsMobile();
  const [muted, setMutedState] = useState(() => isMuted());

  // Local UI selection state
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectMode, setSelectMode] = useState(null);
  const [inspectedItem, setInspectedItem] = useState(null);
  const [mobileModalItem, setMobileModalItem] = useState(null);
  const [mobilePrimedCard, setMobilePrimedCard] = useState(null);
  const [playAgainLoading, setPlayAgainLoading] = useState(false);
  const [isRematch, setIsRematch] = useState(false);
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(false);
  const [opponentLeftCountdown, setOpponentLeftCountdown] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const copiedTimerRef = useRef(null);
  const prevStatusRef = useRef(null);
  const countdownRef = useRef(null);
  const prevGameStateRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const [opponentMoveTiles, setOpponentMoveTiles] = useState(new Set());
  const [extraLogEntries, setExtraLogEntries] = useState([]);
  const [handExpanded, setHandExpanded] = useState(true);
  const touchStartYRef = useRef(null);

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

  // Detect opponent moves for tile highlights and missing log entries
  useEffect(() => {
    const prev = prevGameStateRef.current;
    prevGameStateRef.current = gameState;

    if (!prev || !gameState || myPlayerIndex === null) return;

    const oppIndex = 1 - myPlayerIndex;
    const newLogSlice = gameState.log.slice(prev.log.length);
    const movedTiles = new Set();
    const newEntries = [];

    // Detect opponent unit position changes
    for (const newUnit of gameState.units) {
      if (newUnit.owner !== oppIndex) continue;
      const prevUnit = prev.units.find(u => u.uid === newUnit.uid);
      if (!prevUnit) continue;
      if (prevUnit.row === newUnit.row && prevUnit.col === newUnit.col) continue;
      movedTiles.add(`${newUnit.row},${newUnit.col}`);
      // Plain move (no combat) — not logged by engine; add locally
      const alreadyLogged = newLogSlice.some(e =>
        e.includes(newUnit.name) && (e.includes('attacks') || e.includes('moves') || e.includes('revealed') || e.includes('pounce'))
      );
      if (!alreadyLogged) {
        newEntries.push(`Opponent moves ${newUnit.name} to (${newUnit.row},${newUnit.col}).`);
      }
    }

    // Detect opponent champion moves for tile highlights
    const oppChampNew = gameState.champions.find(c => c.owner === oppIndex);
    const oppChampPrev = prev.champions.find(c => c.owner === oppIndex);
    if (oppChampNew && oppChampPrev && (oppChampNew.row !== oppChampPrev.row || oppChampNew.col !== oppChampPrev.col)) {
      movedTiles.add(`${oppChampNew.row},${oppChampNew.col}`);
    }

    if (movedTiles.size > 0) {
      setOpponentMoveTiles(movedTiles);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setOpponentMoveTiles(new Set()), 1000);
    }
    if (newEntries.length > 0) {
      setExtraLogEntries(prev => [...prev, ...newEntries]);
    }
  }, [gameState, myPlayerIndex]);

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

  // Dispatch helper: compute new state then write to Supabase
  const dispatch = useCallback(async (newState) => {
    clearSelection();
    await dispatchAction(newState);
  }, [dispatchAction, clearSelection]);

  // ── Action handlers ────────────────────────────────────────────────────

  const handleChampionMoveTile = useCallback(async (row, col) => {
    if (!gameState) return;
    if (isMobile && !selectedCard) setHandExpanded(false);
    await dispatch(moveChampion(gameState, row, col));
  }, [gameState, dispatch, isMobile, selectedCard]);

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
    if (s.pendingHandSelect) {
      setSelectMode('hand_select');
      await dispatchAction(s);
    } else if (s.pendingFleshtitheSacrifice) {
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
    await dispatch(endActionAndTurn(gameState));
  }, [gameState, dispatch]);

  const handleSelectChampion = useCallback(() => {
    setSelectedUnit(null);
    setSelectedCard(null);
    setSelectMode('champion_move');
    if (isMobile && !selectedCard) setHandExpanded(false);
  }, [isMobile, selectedCard]);

  const handleSelectUnit = useCallback((unitUid) => {
    setSelectedUnit(unitUid);
    setSelectMode('unit_move');
    if (isMobile && !selectedCard) setHandExpanded(false);
  }, [isMobile, selectedCard]);

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
    const handleCopyLink = () => {
      navigator.clipboard.writeText(gameLink).then(() => {
        setCopiedLink(true);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopiedLink(false), 2000);
      });
    };
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#111827' }}>
        <div className="text-center flex flex-col gap-5" style={{ maxWidth: '340px', width: '100%' }}>
          <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.12em', margin: 0 }}>
            GRIDHOLM
          </h1>
          <p style={{ color: '#8a8aaa', fontSize: '13px', margin: 0 }}>Waiting for opponent to join…</p>
          <div style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3a',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#6a6a8a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Game ID</div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '32px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.18em' }}>{gameId}</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#6a6a8a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Share link</div>
              <div style={{
                background: '#070710',
                border: '1px solid #1a1a2e',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '11px',
                color: '#8a8aaa',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                textAlign: 'left',
              }}>
                {gameLink}
              </div>
              <button
                style={{
                  marginTop: '10px',
                  background: 'transparent',
                  color: copiedLink ? '#60a060' : '#C9A84C',
                  border: `1px solid ${copiedLink ? '#3a6a3a' : '#C9A84C40'}`,
                  borderRadius: '4px',
                  padding: '6px 18px',
                  cursor: 'pointer',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  transition: 'color 0.2s, border-color 0.2s',
                }}
                onClick={handleCopyLink}
              >
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
          <button
            style={{
              background: 'transparent',
              color: '#3a3a5a',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              letterSpacing: '0.05em',
            }}
            onMouseEnter={e => e.target.style.color = '#6a6a8a'}
            onMouseLeave={e => e.target.style.color = '#3a3a5a'}
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
    handleDiscardCard,
    handleNewGame: onBackToLobby,
    clearSelection,
    handleInspectUnit,
    handleInspectCard,
    handleClearInspect,
    handleInspectTerrain,
  };

  const isImportantGuidance = selectMode === 'spell' || selectMode === 'summon' || selectMode === 'action_confirm' || selectMode === 'fleshtithe_sacrifice' || selectMode === 'targetless_spell';

  return (
    <div className="h-screen overflow-hidden text-white p-2 flex flex-col gap-2" style={{ background: '#0a0a0f', paddingBottom: isMobile ? '72px' : '8px' }}>
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
        <GameEndOverlay isWinner={winner === myPlayer.name}>
          <button
            style={{
              background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
              color: '#0a0a0f',
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              padding: '10px 24px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px #C9A84C40',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
            onClick={handlePlayAgain}
            disabled={playAgainLoading}
          >
            {playAgainLoading ? 'Resetting…' : 'Play Again'}
          </button>
          <button
            style={{
              background: 'transparent',
              color: '#6a6a8a',
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #2a2a3a',
              borderRadius: '4px',
              padding: '10px 24px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
            onClick={async () => { await abandonGame(); onBackToLobby(); }}
          >
            Leave Game
          </button>
        </GameEndOverlay>
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

      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', fontWeight: 600, color: '#C9A84C', letterSpacing: '0.1em' }}>GRIDHOLM</h1>
        <div className="flex gap-2 items-center">
          <span className="hidden sm:inline" style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#4a4a6a' }}>#{gameId}</span>
          {session?.status === 'active' && (
            <button
              style={{
                fontSize: '11px',
                color: '#4a3a3a',
                background: 'transparent',
                border: '1px solid #2a1a1a',
                borderRadius: '4px',
                padding: '2px 8px',
                cursor: 'pointer',
                fontFamily: "'Cinzel', serif",
              }}
              onMouseEnter={e => { e.target.style.color = '#8a4a4a'; e.target.style.borderColor = '#3a2a2a'; }}
              onMouseLeave={e => { e.target.style.color = '#4a3a3a'; e.target.style.borderColor = '#2a1a1a'; }}
              onClick={() => setShowConcedeConfirm(true)}
            >
              Concede
            </button>
          )}
          <button
            title={muted ? 'Unmute' : 'Mute'}
            style={{
              fontSize: '14px',
              color: muted ? '#4a4a6a' : '#C9A84C',
              background: 'transparent',
              border: '1px solid ' + (muted ? '#2a2a3a' : '#C9A84C60'),
              borderRadius: '4px',
              padding: '2px 8px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            style={{
              fontSize: '12px',
              color: '#6a6a8a',
              background: 'transparent',
              border: '1px solid #2a2a3a',
              borderRadius: '4px',
              padding: '2px 8px',
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
            }}
            onMouseEnter={e => e.target.style.color = '#C9A84C'}
            onMouseLeave={e => e.target.style.color = '#6a6a8a'}
            onClick={onBackToLobby}
          >
            ← Lobby
          </button>
        </div>
      </div>

      {/* Concede confirmation dialog */}
      {showConcedeConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3a',
            borderRadius: '10px',
            padding: '28px 32px',
            textAlign: 'center',
            maxWidth: '320px',
            width: '90%',
          }}>
            <p style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#c0c0d8', marginBottom: '20px', lineHeight: 1.5 }}>
              Are you sure you want to concede?<br />This will end the game.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                style={{
                  background: '#2a1a1a',
                  color: '#bf6060',
                  border: '1px solid #3a2a2a',
                  borderRadius: '4px',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                  fontWeight: 600,
                }}
                onClick={async () => { setShowConcedeConfirm(false); await concedeGame(); }}
              >
                Concede
              </button>
              <button
                style={{
                  background: 'transparent',
                  color: '#6a6a8a',
                  border: '1px solid #2a2a3a',
                  borderRadius: '4px',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                }}
                onClick={() => setShowConcedeConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <StatusBar state={state} myPlayerIndex={myPlayerIndex} />

      {/* Middle content row */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left column: phase tracker + card detail */}
        {!isMobile && (
          <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: 220, minHeight: 0 }}>
            <PhaseTracker
              phase={phase}
              phaseChangeId={`${state.turn}-${state.activePlayer}-${phase}`}
            />
            <CardDetailPanel inspectedItem={inspectedItem} state={state} myPlayerIndex={myPlayerIndex} />
          </div>
        )}

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
            opponentMoveTiles={opponentMoveTiles}
            handlers={handlers}
            onInspectUnit={handleInspectUnit}
            onClearInspect={handleClearInspect}
            onInspectTerrain={handleInspectTerrain}
            isMyTurn={isActiveTurn}
            myPlayerIndex={myPlayerIndex}
            isMobile={isMobile}
            onLongPressUnit={isMobile ? handleInspectUnit : undefined}
            onLongPressDismiss={isMobile ? handleClearInspect : undefined}
          />
        </div>

        {/* Right sidebar: game log + action buttons */}
        {!isMobile && (
          <div className="w-48 flex-shrink-0 flex flex-col gap-2" style={{ minHeight: 0 }}>
            <Log entries={[...state.log, ...extraLogEntries]} />

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
              <span
                style={{
                  fontFamily: "'Crimson Text', serif",
                  fontStyle: isImportantGuidance ? 'normal' : 'italic',
                  fontSize: '12px',
                  color: isImportantGuidance ? '#C9A84C' : '#8a8aaa',
                  lineHeight: 1.4,
                }}
              >{guidance}</span>

              {isActiveTurn && (
                <div className="flex flex-col gap-1">
                  {phase === 'action' && selectMode === 'summon' && (
                    <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" fullWidth />
                  )}
                  {phase === 'action' && selectMode === 'spell' && (
                    <ActionBtn onClick={handleCancelSpell} label="Cancel Spell" variant="cancel" fullWidth />
                  )}
                  {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
                    <ActionBtn onClick={() => handleFleshtitheSacrifice('no', null)} label="Cancel (3/3)" variant="cancel" fullWidth />
                  )}
                  {phase === 'action' && selectMode === 'targetless_spell' && (
                    <>
                      <ActionBtn onClick={handleCastTargetlessSpell} label={`Cast ${selectedCardObj?.name ?? 'Spell'}`} variant="action" fullWidth />
                      <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" fullWidth />
                    </>
                  )}
                  {phase === 'action' && showAction && (
                    <ActionBtn
                      onClick={() => handleActionButtonClick(selectedUnit)}
                      label="Action"
                      variant="action"
                      fullWidth
                    />
                  )}
                  {phase === 'action' && selectMode === 'action_confirm' && selectedUnitObj && (
                    <>
                      <ActionBtn onClick={handleConfirmAction} label="Confirm" variant="action" fullWidth />
                      <ActionBtn onClick={clearSelection} label="Cancel" variant="cancel" fullWidth />
                    </>
                  )}
                  {phase === 'action' && showHiddenReveal && (
                    <ActionBtn
                      onClick={() => { handleRevealUnit(selectedUnit); clearSelection(); }}
                      label="Reveal"
                      variant="gold"
                      fullWidth
                    />
                  )}
                  {phase === 'action' && selectedUnit && (
                    <ActionBtn onClick={clearSelection} label="Deselect" variant="cancel" fullWidth />
                  )}
                  {phase === 'action' && (
                    <ActionBtn onClick={handleEndAction} label="End Turn →" variant="endphase" fullWidth />
                  )}
                  {pendingDiscard && (
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C', fontWeight: 600 }}>Discard a card to continue</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile fixed bottom action bar */}
      {isMobile && isActiveTurn && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: '#0a0a14',
          borderTop: '1px solid #1e1e2e',
          padding: '8px 12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}>
          {phase === 'action' && selectMode === 'summon' && (
            <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'spell' && (
            <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
            <ActionBtn onClick={() => handleFleshtitheSacrifice('no', null)} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'targetless_spell' && (
            <>
              <ActionBtn onClick={handleCastTargetlessSpell} label={`Cast ${selectedCardObj?.name ?? 'Spell'}`} variant="action" style={{ minHeight: '44px' }} />
              <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
            </>
          )}
          {phase === 'action' && selectMode === 'action_confirm' && (
            <ActionBtn onClick={clearSelection} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectedUnit && (
            <ActionBtn onClick={clearSelection} label="Deselect" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && (
            <ActionBtn onClick={handleEndAction} label="End Turn →" variant="endphase" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
        </div>
      )}

      {/* Mobile hand toggle button */}
      {isMobile && (
        <button
          style={{
            position: 'fixed',
            bottom: '68px',
            right: '12px',
            zIndex: 41,
            width: '36px',
            height: '36px',
            background: '#0a0a14',
            border: '1px solid #2a2a3a',
            borderRadius: '6px',
            color: '#6a6a8a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
          }}
          onClick={() => setHandExpanded(v => !v)}
        >
          {handExpanded ? '▼' : '▲'}
        </button>
      )}

      {/* My hand (face up) */}
      <div style={{
        background: pendingDiscard && isActiveTurn ? 'rgba(201,168,76,0.05)' : 'rgba(13,13,26,0.5)',
        border: `1px solid ${pendingDiscard && isActiveTurn ? '#C9A84C' : '#1e1e2e'}`,
        borderRadius: '6px',
        flexShrink: 0,
        ...(isMobile && { transition: 'transform 0.3s ease', transform: handExpanded ? 'translateY(0)' : 'translateY(120%)' }),
      }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          color: myPlayerIndex === 0 ? '#4a8abf' : '#bf4a4a',
          padding: '4px 8px 2px',
          fontWeight: 600,
        }}>
          {myPlayer.name}
          <span className="hidden sm:inline" style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontWeight: 400, color: '#4a4a6a', fontSize: '12px' }}>
            {phase === 'action' && isActiveTurn ? '  (click cards to play)' : ''}
            {pendingDiscard && isActiveTurn ? '  — click a card to discard' : ''}
          </span>
        </div>
        <div className="hidden sm:flex" style={{ alignItems: 'center', justifyContent: 'center', gap: 12, padding: '4px 8px 8px' }}>
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
            <ResourceDisplay
              current={myPlayer.resources}
              max={10}
              maxThisTurn={myPlayer.maxResourcesThisTurn}
              playerColor={myPlayerIndex === 0 ? '#185FA5' : '#993C1D'}
              small={false}
            />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <Hand
              player={myPlayer}
              resources={myPlayer.resources}
              isActive={true}
              canPlay={isActiveTurn && phase === 'action'}
              gameState={gameState}
              playerIndex={myPlayerIndex}
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
            />
          </div>
        </div>
        {/* Mobile: resources on top, hand scrollable below */}
        <div
          className="flex flex-col sm:hidden"
          style={{ padding: '4px 8px 8px' }}
          onTouchStart={e => { touchStartYRef.current = e.touches[0].clientY; }}
          onTouchEnd={e => {
            if (touchStartYRef.current === null) return;
            const delta = e.changedTouches[0].clientY - touchStartYRef.current;
            touchStartYRef.current = null;
            if (Math.abs(delta) > 30) setHandExpanded(delta < 0);
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            padding: '4px 0',
            marginBottom: 0,
          }}>
            <ResourceDisplay current={myPlayer.resources} max={10} maxThisTurn={myPlayer.maxResourcesThisTurn} playerColor={myPlayerIndex === 0 ? '#185FA5' : '#993C1D'} singleRow={true} />
          </div>
          <Hand
            player={myPlayer}
            resources={myPlayer.resources}
            isActive={true}
            canPlay={isActiveTurn && phase === 'action'}
            gameState={gameState}
            playerIndex={myPlayerIndex}
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
            isMobile={true}
            onMobileTap={handleMobileHandCardTap}
            onLongPressCard={handleInspectCard}
            onLongPressDismiss={handleClearInspect}
          />
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
  const keys = ['rush', 'hidden', 'action', 'legendary'];
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
  const [openKey, setOpenKey] = useState(null);
  if (!keywords || keywords.length === 0) return null;
  const activeKw = keywords.find(kw => kw.key === openKey);
  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0' }}>
        {keywords.map(kw => {
          const isOpen = openKey === kw.key;
          return (
            <div
              key={kw.key}
              onClick={() => setOpenKey(isOpen ? null : kw.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: isOpen ? `${kw.color}40` : `${kw.color}26`,
                border: `0.5px solid ${kw.color}`,
                borderRadius: '99px',
                padding: '4px 10px',
                marginRight: '6px',
                marginBottom: '6px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 500, color: kw.color, fontFamily: 'var(--font-sans)' }}>
                {kw.label}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          overflow: 'hidden',
          maxHeight: activeKw ? '120px' : '0',
          opacity: activeKw ? 1 : 0,
          transition: 'max-height 0.2s ease, opacity 0.2s ease',
        }}
      >
        {activeKw && (
          <div
            style={{
              fontSize: '12px',
              color: '#9090b8',
              lineHeight: 1.5,
              padding: '6px 8px',
              background: '#1a1a2e',
              borderRadius: '4px',
              borderLeft: `2px solid ${activeKw.color}`,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span style={{ fontWeight: 500, color: activeKw.color }}>{activeKw.label}: </span>
            {activeKw.reminder}
          </div>
        )}
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
          <KeywordBubbles keywords={[{ key: 'hidden', ...KEYWORD_REMINDERS.hidden }]} />
        </div>
      );
    }

    const auraBonus = getAuraAtkBonus(state, unit);
    const displayAtk = unit.atk + (unit.atkBonus || 0) + auraBonus;
    const unitKeywords = !large ? getActiveKeywords(unit) : [];
    const unitImageUrl = getCardImageUrl(unit.image);
    return (
      <div className="flex flex-col gap-1">
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          {unitImageUrl ? (
            <img src={unitImageUrl} alt={unit.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)', fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500 }}>
              {unit.unitType || 'Unit'}
            </div>
          )}
        </div>
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
    const cardImageUrl = getCardImageUrl(card.image);
    return (
      <div className="flex flex-col gap-1">
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          {cardImageUrl ? (
            <img src={cardImageUrl} alt={card.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)', fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500 }}>
              {card.type === 'spell' ? 'Spell' : (card.unitType || 'Unit')}
            </div>
          )}
        </div>
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
  const scrollRef = useRef(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 2);
  }, []);

  useEffect(() => {
    const t = setTimeout(checkScroll, 0);
    return () => clearTimeout(t);
  }, [inspectedItem, checkScroll]);

  const arrowStyle = {
    position: 'absolute', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(15,15,30,0.85)', color: '#6b7280', border: 'none',
    cursor: 'pointer', fontSize: '9px', lineHeight: 1, padding: '2px 8px',
    zIndex: 10,
  };

  return (
    <div
      style={{
        background: '#0f0f1e',
        border: '1px solid #252538',
        borderRadius: '6px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#C9A84C', marginBottom: '6px', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>Card Detail</div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {canScrollUp && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ top: -60, behavior: 'smooth' })}
            style={{ ...arrowStyle, top: 0, borderRadius: '0 0 4px 4px' }}
          >▲</button>
        )}
        <div
          ref={scrollRef}
          className="no-scrollbar"
          style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
          onScroll={checkScroll}
        >
          {inspectedItem ? (
            <CardDetailContent inspectedItem={inspectedItem} state={state} myPlayerIndex={myPlayerIndex} />
          ) : (
            <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '11px', color: '#2a2a3a', lineHeight: 1.5 }}>
              Click a card or unit to inspect
            </div>
          )}
        </div>
        {canScrollDown && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ top: 60, behavior: 'smooth' })}
            style={{ ...arrowStyle, bottom: 0, borderRadius: '4px 4px 0 0' }}
          >▼</button>
        )}
      </div>
    </div>
  );
}

function CardDetailModal({ inspectedItem, state, onClose, myPlayerIndex }) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', zIndex: 9999, paddingTop: 80 }}
      onClick={onClose}
    >
      <div
        className="relative bg-gray-900 border-2 border-amber-500 rounded-xl p-4 overflow-y-auto"
        style={{ width: 280, maxHeight: '70vh', zIndex: 10000 }}
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

function ActionBtn({ onClick, label, variant = 'endphase', fullWidth = false, style: extraStyle }) {
  const styles = {
    endphase: {
      background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
      color: '#0a0a0f',
      fontFamily: "'Cinzel', serif",
      fontSize: '12px',
      fontWeight: 600,
      border: 'none',
      borderRadius: '4px',
      boxShadow: '0 2px 8px #C9A84C40',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    action: {
      background: 'linear-gradient(135deg, #5a3a00, #8a6a00)',
      color: '#C9A84C',
      fontFamily: "'Cinzel', serif",
      fontSize: '12px',
      fontWeight: 600,
      border: '1px solid #C9A84C60',
      borderRadius: '4px',
      letterSpacing: '0.04em',
    },
    cancel: {
      background: 'transparent',
      color: '#6a6a8a',
      fontFamily: "'Cinzel', serif",
      fontSize: '12px',
      border: '1px solid #2a2a3a',
      borderRadius: '4px',
    },
    gold: {
      background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
      color: '#0a0a0f',
      fontFamily: "'Cinzel', serif",
      fontSize: '12px',
      fontWeight: 600,
      border: 'none',
      borderRadius: '4px',
      boxShadow: '0 2px 8px #C9A84C40',
    },
  };

  return (
    <button
      className={`px-3 py-3 sm:py-1.5 cursor-pointer${fullWidth ? ' w-full sm:w-auto' : ''}`}
      style={{ ...(styles[variant] || styles.endphase), ...extraStyle }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
