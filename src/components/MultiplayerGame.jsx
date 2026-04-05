import { useState, useCallback } from 'react';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame.js';
import { getAuraAtkBonus } from '../engine/gameEngine.js';
import {
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
  createInitialState,
  autoAdvancePhase,
} from '../engine/gameEngine.js';
import { supabase, getGuestId } from '../supabase.js';
import StatusBar from './StatusBar.jsx';
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

function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

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
  } = useMultiplayerGame(gameId);

  // Local UI selection state
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectMode, setSelectMode] = useState(null);
  const [inspectedItem, setInspectedItem] = useState(null);
  const [mobileModalItem, setMobileModalItem] = useState(null);
  const [mobilePrimedCard, setMobilePrimedCard] = useState(null);
  const [playAgainId, setPlayAgainId] = useState(null);
  const [creatingPlayAgain, setCreatingPlayAgain] = useState(false);

  const clearSelection = useCallback(() => {
    setSelectedCard(null);
    setSelectedUnit(null);
    setSelectMode(null);
  }, []);

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
    setSelectedUnit(null);
    setSelectMode(null);
    const s = playCard(gameState, cardUid);
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
  }, [gameState, dispatch, dispatchAction]);

  const handleSummonOnTile = useCallback(async (row, col) => {
    if (!gameState || !selectedCard) return;
    await dispatch(summonUnit(gameState, selectedCard, row, col));
  }, [gameState, selectedCard, dispatch]);

  const handleSpellTarget = useCallback(async (targetUid) => {
    if (!gameState || !selectedCard) return;
    await dispatch(resolveSpell(gameState, selectedCard, targetUid));
  }, [gameState, selectedCard, dispatch]);

  const handleCancelSpell = useCallback(async () => {
    if (!gameState) return;
    await dispatch(cancelSpell(gameState));
  }, [gameState, dispatch]);

  const handleEndAction = useCallback(async () => {
    if (!gameState) return;
    await dispatch(endActionPhase(gameState));
  }, [gameState, dispatch]);

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
    if (!supabase || creatingPlayAgain) return;
    setCreatingPlayAgain(true);
    const newId = generateGameId();
    const s = createInitialState();
    s.players[0].name = 'Player 1';
    s.players[1].name = 'Player 2';
    const initialState = autoAdvancePhase(s);

    const { error } = await supabase.from('game_sessions').insert({
      id: newId,
      player1_id: guestId,
      game_state: initialState,
      active_player: guestId,
      status: 'waiting',
    });

    setCreatingPlayAgain(false);
    if (!error) setPlayAgainId(newId);
  }, [guestId, creatingPlayAgain]);

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

  // Waiting for player 2 to join (player 1's waiting screen)
  if (session?.status === 'waiting' && myPlayerIndex === 0) {
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
            onClick={onBackToLobby}
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
          <p className="text-red-400 mb-4">This game is full.</p>
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

  let guidance = isActiveTurn ? (PHASE_GUIDANCE[phase] || '') : 'Waiting for opponent…';
  if (pendingDiscard && isActiveTurn) guidance = PHASE_GUIDANCE.discard;
  if (selectMode === 'summon') guidance = 'Click a green tile to summon the unit.';
  if (selectMode === 'spell') guidance = 'Click a highlighted unit to target the spell.';
  if (selectMode === 'unit_move') guidance = 'Click a blue tile to move the unit. Or select another unit.';
  if (selectMode === 'archer_target') guidance = 'Click an enemy unit (pink highlight) for Elf Archer to shoot.';

  const selectedUnitObj = selectedUnit ? state.units.find(u => u.uid === selectedUnit) : null;
  const showArcherShoot = selectedUnitObj?.id === 'elfarcher'
    && !selectedUnitObj.moved
    && !selectedUnitObj.summoned
    && selectMode === 'unit_move'
    && phase === 'action'
    && isActiveTurn;

  // Derived highlight data (only valid when it's my turn)
  const championMoveTiles = phase === 'action' && isActiveTurn
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

  const handlers = {
    handleChampionMoveTile,
    handlePlayCard,
    handleSummonOnTile,
    handleSpellTarget,
    handleCancelSpell,
    handleEndAction,
    handleSelectUnit,
    handleMoveUnit,
    handleArcherSelectTarget,
    handleArcherShoot,
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
      {/* Winner overlay */}
      {winner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-yellow-500 rounded-2xl p-8 text-center shadow-2xl">
            <div className="text-4xl mb-4">🏆</div>
            <h2 className="text-2xl font-bold text-yellow-400 mb-2">{winner} wins!</h2>
            <p className="text-gray-300 mb-6">The champion has fallen.</p>
            {playAgainId ? (
              <div className="flex flex-col gap-2 items-center">
                <p className="text-gray-300 text-sm">New game created! Share this ID with your opponent:</p>
                <div className="text-2xl font-mono font-bold text-amber-400 tracking-widest">{playAgainId}</div>
                <button
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded-lg text-sm"
                  onClick={() => { window.location.hash = `/game/${playAgainId}`; }}
                >
                  Go to New Game
                </button>
              </div>
            ) : (
              <div className="flex gap-3 justify-center flex-wrap">
                <button
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-2 rounded-lg"
                  onClick={handlePlayAgain}
                  disabled={creatingPlayAgain}
                >
                  {creatingPlayAgain ? 'Creating…' : 'Play Again'}
                </button>
                <button
                  className="bg-gray-600 hover:bg-gray-500 text-white font-bold px-6 py-2 rounded-lg"
                  onClick={onBackToLobby}
                >
                  Back to Lobby
                </button>
              </div>
            )}
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

      {/* Status Bar */}
      <StatusBar state={state} />

      {/* Middle content row */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left column: phase tracker + card detail */}
        <div className="flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ width: 140, minHeight: 0 }}>
          <PhaseTracker
            phase={phase}
            phaseChangeId={`${state.turn}-${state.activePlayer}-${phase}`}
          />
          <CardDetailPanel inspectedItem={inspectedItem} state={state} />
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
            handlers={handlers}
            onInspectUnit={handleInspectUnit}
            onClearInspect={handleClearInspect}
            onInspectTerrain={handleInspectTerrain}
          />
        </div>

        {/* Right sidebar: game log */}
        <div className="w-48 flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ minHeight: 0 }}>
          <div className="text-xs text-gray-400 mb-1 px-1">Game Log</div>
          <Log entries={state.log} />
        </div>
      </div>

      {/* Bottom bar: guidance + action buttons */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center flex-shrink-0 text-xs">
        <span className="hidden sm:inline text-xs text-gray-300 sm:flex-1">{guidance}</span>

        {isActiveTurn && (
          <>
            {phase === 'action' && selectMode === 'summon' && (
              <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="gray" />
            )}
            {phase === 'action' && selectMode === 'spell' && (
              <ActionBtn onClick={handleCancelSpell} label="Cancel Spell" variant="gray" />
            )}
            {phase === 'action' && showArcherShoot && (
              <ActionBtn
                onClick={() => handleArcherSelectTarget(selectedUnit)}
                label="Archer: Shoot"
                variant="pink"
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
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg flex-shrink-0">
        <div className="text-xs text-red-400 px-2 pt-1 font-semibold">
          {oppPlayer.name} — {oppPlayer.resources}/10 💎
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
          {myPlayer.name} (you) — {myPlayer.resources}/10 💎
          <span className="hidden sm:inline">
            {phase === 'action' && isActiveTurn ? '  (click cards to play)' : ''}
            {pendingDiscard && isActiveTurn ? '  — click a card to discard' : ''}
          </span>
        </div>
        <Hand
          player={myPlayer}
          resources={myPlayer.resources}
          isActive={true}
          canPlay={isActiveTurn && phase === 'action'}
          pendingDiscard={pendingDiscard && isActiveTurn}
          selectedCard={selectedCard}
          onPlayCard={handlePlayCard}
          onDiscardCard={handleDiscardCard}
          onInspectCard={handleInspectCard}
          isMobile={window.innerWidth < 768}
          onMobileTap={handleMobileHandCardTap}
        />
      </div>
      {/* Mobile card detail modal */}
      {mobileModalItem && (
        <CardDetailModal
          inspectedItem={mobileModalItem}
          state={state}
          onClose={handleMobileModalDismiss}
        />
      )}
    </div>
  );
}

function CardDetailContent({ inspectedItem, state, large = false }) {
  const nameClass = large ? 'font-bold text-white text-sm leading-tight' : 'font-bold text-white text-xs leading-tight';
  const typeClass = large ? 'text-gray-400 text-xs' : 'text-gray-400 text-[10px]';
  const statsClass = large ? 'grid grid-cols-3 gap-x-1 text-xs mt-0.5' : 'grid grid-cols-3 gap-x-1 text-[10px] mt-0.5';
  const rulesClass = large
    ? 'text-gray-400 text-xs leading-tight mt-1 border-t border-gray-700 pt-1'
    : 'text-gray-400 text-[10px] leading-tight mt-1 border-t border-gray-700 pt-1';

  if (inspectedItem?.type === 'unit') {
    const unit = state.units.find(u => u.uid === inspectedItem.uid);
    if (!unit) return null;
    const ownerLabel = unit.owner === 0 ? 'P1' : 'P2';
    const ownerColor = unit.owner === 0 ? 'text-blue-400' : 'text-red-400';
    const auraBonus = getAuraAtkBonus(state, unit);
    const displayAtk = unit.atk + (unit.atkBonus || 0) + auraBonus;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-start">
          <span className={nameClass}>{unit.name}</span>
          <span className={`text-[10px] ${ownerColor}`}>{ownerLabel}</span>
        </div>
        {unit.unitType && <div className={typeClass}>{unit.unitType}</div>}
        <div className={statsClass}>
          <span className="text-red-400">
            ⚔ {displayAtk}{auraBonus > 0 && <span className="text-teal-400"> (+{auraBonus})</span>}
          </span>
          <span className="text-green-400">♥ {unit.hp}/{unit.maxHp}</span>
          <span className="text-blue-400">⚡ {unit.spd + (unit.speedBonus || 0)}</span>
        </div>
        {unit.shield > 0 && (
          <div className={`text-cyan-400 ${large ? 'text-xs' : 'text-[10px]'}`}>🛡 Shield: {unit.shield}</div>
        )}
        {unit.rules && <div className={rulesClass}>{unit.rules}</div>}
      </div>
    );
  }

  if (inspectedItem?.type === 'terrain') {
    return (
      <div className="flex flex-col gap-1">
        <span className={nameClass}>Throne</span>
        <div className={`text-amber-700 font-semibold ${large ? 'text-xs' : 'text-[10px]'}`}>Terrain</div>
        <div className={rulesClass}>
          End your turn with your champion here to deal 4 damage to the enemy champion.
        </div>
      </div>
    );
  }

  if (inspectedItem?.type === 'card') {
    const card = inspectedItem.card;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-start">
          <span className={nameClass}>{card.name}</span>
          <span className={`text-yellow-400 font-bold ${large ? 'text-sm' : 'text-xs'}`}>{card.cost}💎</span>
        </div>
        <div className={typeClass}>{card.type === 'spell' ? 'Spell' : card.unitType}</div>
        {card.type === 'unit' && (
          <div className={statsClass}>
            <span className="text-red-400">⚔ {card.atk}</span>
            <span className="text-green-400">♥ {card.hp}</span>
            <span className="text-blue-400">⚡ {card.spd}</span>
          </div>
        )}
        {card.rules && <div className={rulesClass}>{card.rules}</div>}
      </div>
    );
  }

  return null;
}

function CardDetailPanel({ inspectedItem, state }) {
  return (
    <div
      className="bg-gray-900 border border-gray-700 rounded-lg p-2 flex flex-col"
      style={{ flex: 1, minHeight: 0 }}
    >
      <div className="text-xs text-gray-400 mb-1.5 font-semibold">Card Detail</div>
      <div className="flex-1 overflow-y-auto">
        {inspectedItem ? (
          <CardDetailContent inspectedItem={inspectedItem} state={state} />
        ) : (
          <div className="text-gray-600 text-[10px] italic leading-snug">
            Click a card or unit to inspect
          </div>
        )}
      </div>
    </div>
  );
}

function CardDetailModal({ inspectedItem, state, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="relative bg-gray-900 border-2 border-amber-500 rounded-xl p-4"
        style={{ width: 280 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white text-sm"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        <div className="pr-6">
          <CardDetailContent inspectedItem={inspectedItem} state={state} large />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ onClick, label, variant = 'blue', fullWidth = false }) {
  const colors = {
    blue: 'bg-blue-600 hover:bg-blue-500 text-white',
    green: 'bg-green-600 hover:bg-green-500 text-white',
    gray: 'bg-gray-600 hover:bg-gray-500 text-white',
    pink: 'bg-pink-600 hover:bg-pink-500 text-white',
  };
  return (
    <button
      className={`text-xs font-semibold px-3 py-3 sm:py-1.5 rounded ${colors[variant]} ${fullWidth ? 'w-full sm:w-auto' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
