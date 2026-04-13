import { useState, useCallback } from 'react';
import { useGameState } from './hooks/useGameState.js';
import { getAuraAtkBonus, playerRevealUnit, getChampionDef, manhattan } from './engine/gameEngine.js';
import { CARD_DB } from './engine/cards.js';
import { getCardImageUrl } from './supabase.js';
import { KEYWORD_REMINDERS } from './engine/keywords.js';
import StatusBar, { ResourceDisplay } from './components/StatusBar.jsx';
import Board from './components/Board.jsx';
import Hand from './components/Hand.jsx';
import Card from './components/Card.jsx';
import Log, { renderLogText, entryText } from './components/Log.jsx';
import PhaseTracker from './components/PhaseTracker.jsx';
import useIsMobile from './hooks/useIsMobile.js';
import GameEndOverlay from './components/GameEndOverlay.jsx';
import MulliganOverlay from './components/MulliganOverlay.jsx';
import TurnBanner from './components/TurnBanner.jsx';
import { isMuted, setMuted } from './audio.js';
import { renderRules } from './utils/rulesText.jsx';

const PHASE_GUIDANCE = {
  'begin-turn': 'Beginning turn…',
  action: 'Move your champion, play cards, and move units in any order. Click End Turn when done.',
  discard: 'You have too many cards. Click a card to discard.',
};

export default function App({ onBackToLobby, onPlayAgain, deckId = 'human' } = {}) {
  const {
    state,
    selectedCard,
    selectedUnit,
    selectMode,
    inspectedItem,
    aiThinking,
    championMoveTiles,
    championAbilityTargetUids,
    championSaplingTiles,
    summonTiles,
    unitMoveTiles,
    approachTiles,
    terrainTargetTiles,
    directionTargetTiles,
    spellTargetUids,
    archerShootTargets,
    sacrificeTargetUids,
    selectedSacrificeUid,
    handlers,
  } = useGameState({ deckId });

  const isMobile = useIsMobile();
  const [logOpen, setLogOpen] = useState(false);
  const [muted, setMutedState] = useState(() => isMuted());

  // ── Card drag state ────────────────────────────────────────────────────
  const [dragCard, setDragCard] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 });
  const [dragSnapping, setDragSnapping] = useState(false);

  const handleCardDragStart = useCallback((card, clientX, clientY, rect) => {
    setDragCard(card);
    setDragPos({ x: clientX, y: clientY });
    setDragOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    setDragSnapping(false);
    handlers.handlePlayCard(card.uid);
  }, [handlers]);

  const handleCardDragMove = useCallback((clientX, clientY) => {
    setDragPos({ x: clientX, y: clientY });
  }, []);

  const handleCardDragEnd = useCallback((clientX, clientY) => {
    // If the card play triggered a hand-card selection prompt (e.g. Pact of Ruin), the drag
    // started before pendingHandSelect was set. Just snap the ghost back — do NOT cancel the
    // spell or clear pendingHandSelect; the player still needs to click a card to discard.
    if (selectMode === 'hand_select') {
      setDragSnapping(true);
      setTimeout(() => { setDragCard(null); setDragSnapping(false); }, 300);
      return;
    }

    if (clientX === null || clientY === null) {
      // Pointer was cancelled — snap back
      handlers.handleCancelSpell();
      setDragSnapping(true);
      setTimeout(() => { setDragCard(null); setDragSnapping(false); }, 300);
      return;
    }

    // Try to resolve drop on the board grid
    const boardGrid = document.querySelector('[data-board-grid]');
    if (boardGrid) {
      const rect = boardGrid.getBoundingClientRect();
      const col = Math.floor((clientX - rect.left) / (rect.width / 5));
      const row = Math.floor((clientY - rect.top) / (rect.height / 5));
      if (row >= 0 && row < 5 && col >= 0 && col < 5) {
        // Use the selectMode that was set by handlePlayCard at drag-start
        // Access via the closure — selectMode is current when this callback runs
        if (selectMode === 'summon') {
          if (summonTiles.some(([r, c]) => r === row && c === col)) {
            handlers.handleSummonOnTile(row, col);
            setDragCard(null);
            return;
          }
        } else if (selectMode === 'terrain_cast') {
          if (terrainTargetTiles.some(([r, c]) => r === row && c === col)) {
            handlers.handleTerrainCast(row, col);
            setDragCard(null);
            return;
          }
        } else if (selectMode === 'spell') {
          const unit = state.units.find(u => u.row === row && u.col === col);
          const champion = state.champions.find(c => c.row === row && c.col === col);
          if (unit && spellTargetUids.includes(unit.uid)) {
            handlers.handleSpellTarget(unit.uid);
            setDragCard(null);
            return;
          }
          if (champion && spellTargetUids.includes('champion' + champion.owner)) {
            handlers.handleSpellTarget('champion' + champion.owner);
            setDragCard(null);
            return;
          }
        }
      }
    }

    // Targetless spell: cast when dragged more than 1/3 of screen height from hand
    if (selectMode === 'targetless_spell') {
      if (clientY < window.innerHeight * 0.67) {
        handlers.handleCastTargetlessSpell();
        setDragCard(null);
        return;
      }
    }

    // Invalid drop — snap ghost back to hand
    setDragSnapping(true);
    handlers.handleCancelSpell();
    setTimeout(() => { setDragCard(null); setDragSnapping(false); }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers, selectMode, summonTiles, terrainTargetTiles, spellTargetUids, state.units, state.champions]);

  const isP1Turn = state.activePlayer === 0;
  const { phase, winner, pendingDiscard } = state;

  const p1 = state.players[0];
  const p2 = state.players[1];

  const selectedCardObj = selectedCard ? p1.hand.find(c => c.uid === selectedCard) : null;

  const selectedUnitObj = selectedUnit ? state.units.find(u => u.uid === selectedUnit) : null;

  let guidance = isP1Turn ? (PHASE_GUIDANCE[phase] || '') : 'AI is thinking…';
  if (pendingDiscard && isP1Turn) guidance = PHASE_GUIDANCE.discard;
  if (selectMode === 'summon') guidance = 'Click a green tile to summon the unit.';
  if (selectMode === 'spell') {
    guidance = spellTargetUids.length === 0
      ? 'No valid targets. Cancel the spell.'
      : 'Click a highlighted unit to target the spell.';
  }
  if (selectMode === 'targetless_spell') {
    guidance = `Click Cast to play ${selectedCardObj?.name ?? 'spell'} or click the card again to cancel.`;
  }
  if (selectMode === 'unit_move') {
    guidance = selectedUnitObj?.action && !selectedUnitObj.moved
      ? `Move ${selectedUnitObj.name} to a highlighted tile or click Action to use its ability.`
      : 'Click a blue tile to move the unit. Or select another unit.';
  }
  if (selectMode === 'action_confirm' && selectedUnitObj) guidance = `Use ${selectedUnitObj.name} Action?`;
  if (selectMode === 'hand_select') guidance = 'Select a card from your hand to discard.';
  if (selectMode === 'fleshtithe_sacrifice') guidance = selectedSacrificeUid ? 'Confirm sacrifice for Flesh Tithe +2/+2, or Cancel to summon as 3/3.' : 'Select a friendly unit to sacrifice for Flesh Tithe +2/+2, or Cancel to summon as 3/3.';
  if (selectMode === 'champion_ability') guidance = 'Click a highlighted unit to Invoke, or Cancel.';
  if (selectMode === 'terrain_cast') guidance = 'Click a tile to place the terrain card there.';
  if (selectMode === 'approach_select') guidance = 'Multiple approach tiles available. Click a gold tile to position your unit before attacking.';
  if (selectMode === 'direction_select') guidance = 'Choose a direction for the line blast.';
  if (selectMode === 'grave_select') guidance = 'Select a unit from your grave.';

  const isImportantGuidance = selectMode === 'spell' || selectMode === 'summon' || selectMode === 'action_confirm' || selectMode === 'fleshtithe_sacrifice' || selectMode === 'targetless_spell' || selectMode === 'champion_ability' || selectMode === 'terrain_cast' || selectMode === 'direction_select';

  const showAction = selectedUnitObj?.action === true
    && !selectedUnitObj.moved
    && !selectedUnitObj.summoned
    && selectMode === 'unit_move'
    && phase === 'action'
    && isP1Turn
    && (p1.commandsUsed ?? 0) < 3;
  const showHiddenReveal = selectedUnitObj?.hidden
    && selectedUnitObj.owner === 0
    && !selectedUnitObj.moved
    && selectMode === 'unit_move'
    && phase === 'action'
    && isP1Turn;

  return (
    <div className="h-screen overflow-hidden text-white p-2 flex flex-col gap-2" style={{ background: '#0a0a0f', paddingBottom: isMobile ? '72px' : '8px' }}>
      {/* Mulligan overlay — shown at the start of every game before play begins */}
      {phase === 'mulligan' && (
        <MulliganOverlay
          hand={p1.hand}
          deadline={state.mulliganDeadline}
          onConfirm={handlers.handleMulliganSubmit}
        />
      )}

      {/* Winner overlay */}
      {winner && (
        <GameEndOverlay isWinner={winner === p1.name}>
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
            onClick={onPlayAgain ?? handlers.handleNewGame}
          >
            Play Again
          </button>
        </GameEndOverlay>
      )}

      {/* Deck peek modal — Arcane Lens (click-to-select), Glimpse (keep/shuffle), or Scry (dismiss) */}
      {state.pendingDeckPeek && isP1Turn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '480px',
            width: '90vw',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            {state.pendingDeckPeek.reason === 'scry' ? (
              <>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
                  Fennwick — Top card of your deck
                </div>
                {state.pendingDeckPeek.cards.map(card => (
                  <div key={card.uid} style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)', border: '1px solid #3a3a60', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#e8e8f0', marginBottom: '4px' }}>{card.name}</div>
                    <div style={{ fontSize: '10px', color: '#C9A84C' }}>Cost {card.cost}</div>
                    {card.type === 'unit' && <div style={{ fontSize: '10px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>}
                    {card.rules && <div style={{ fontSize: '9px', color: '#6060a0', marginTop: '4px', lineHeight: 1.3 }}>{renderRules(card.rules)}</div>}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => handlers.handleScryDismiss()}
                    style={{ background: '#1a1a2a', border: '1px solid #4a4a7a', borderRadius: '4px', color: '#a0a0d0', fontSize: '11px', padding: '6px 20px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >Dismiss</button>
                </div>
              </>
            ) : state.pendingDeckPeek.reason === 'glimpse' ? (
              <>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
                  Glimpse — Top card of your deck
                </div>
                {state.pendingDeckPeek.cards.map(card => (
                  <div key={card.uid} style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)', border: '1px solid #3a3a60', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#e8e8f0', marginBottom: '4px' }}>{card.name}</div>
                    <div style={{ fontSize: '10px', color: '#C9A84C' }}>Cost {card.cost}</div>
                    {card.type === 'unit' && <div style={{ fontSize: '10px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>}
                    {card.rules && <div style={{ fontSize: '9px', color: '#6060a0', marginTop: '4px', lineHeight: 1.3 }}>{renderRules(card.rules)}</div>}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    onClick={() => handlers.handleGlimpseDecision(true)}
                    style={{ background: '#1a2a1a', border: '1px solid #2a7a2a', borderRadius: '4px', color: '#6cf06c', fontSize: '11px', padding: '6px 16px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >Keep on top</button>
                  <button
                    onClick={() => handlers.handleGlimpseDecision(false)}
                    style={{ background: '#2a1a1a', border: '1px solid #7a2a2a', borderRadius: '4px', color: '#f06c6c', fontSize: '11px', padding: '6px 16px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >Shuffle back</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
                  Arcane Lens — Choose a card to keep on top
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {state.pendingDeckPeek.cards.map(card => (
                    <div
                      key={card.uid}
                      onClick={() => handlers.handleDeckPeekSelect(card.uid)}
                      style={{
                        background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                        border: '1px solid #3a3a60',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        minWidth: '100px',
                        textAlign: 'center',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#3a3a60'}
                    >
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, color: '#e8e8f0', marginBottom: '4px' }}>{card.name}</div>
                      <div style={{ fontSize: '10px', color: '#C9A84C' }}>Cost {card.cost}</div>
                      {card.type === 'unit' && <div style={{ fontSize: '10px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>}
                      {card.rules && <div style={{ fontSize: '9px', color: '#6060a0', marginTop: '4px', lineHeight: 1.3 }}>{renderRules(card.rules)}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Grave select modal */}
      {state.pendingGraveSelect && isP1Turn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '520px',
            width: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
              {state.pendingGraveSelect?.reason === 'rebirth' ? 'Rebirth — Select a unit to return' : 'Select a unit from your grave'}
            </div>
            {(() => {
              const graveCards = state.pendingGraveSelect?.reason === 'rebirth'
                ? (p1.grave || []).filter(u => u.type === 'unit' && !u.token)
                : (p1.grave || []);
              return graveCards.length > 0 ? (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {graveCards.map((card, idx) => {
                  const imageUrl = getCardImageUrl(card.image);
                  return (
                    <div
                      key={card.uid ?? idx}
                      onClick={() => handlers.handleGraveSelect(card.uid)}
                      style={{
                        background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                        border: '1px solid #3a3a60',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        minWidth: '100px',
                        maxWidth: '130px',
                        textAlign: 'center',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#3a3a60'}
                    >
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt={card.name}
                          onError={e => { e.target.style.display = 'none'; }}
                          style={{ width: '100%', borderRadius: '4px', marginBottom: '6px', objectFit: 'cover', maxHeight: '70px' }}
                        />
                      )}
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, color: '#e8e8f0', marginBottom: '2px' }}>{card.name}</div>
                      <div style={{ fontSize: '10px', color: '#C9A84C', marginBottom: '2px' }}>Cost {card.cost}</div>
                      <div style={{ fontSize: '10px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#6a6a8a', fontSize: '12px' }}>
                {state.pendingGraveSelect?.reason === 'rebirth' ? 'No eligible units in grave.' : 'Your grave is empty.'}
              </div>
            );
            })()}
          </div>
        </div>
      )}

      {/* Nezzar contract selection modal */}
      {state.pendingContractSelect && isP1Turn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.80)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '600px',
            width: '92vw',
            boxShadow: '0 4px 32px rgba(0,0,0,0.8)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#EF4444', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '4px', textAlign: 'center' }}>
              Nezzar, Terms and Conditions
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#8080a0', marginBottom: '16px', textAlign: 'center' }}>
              Choose a deadly contract — or decline.
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
              {state.pendingContractSelect.contracts.map(contract => (
                <div
                  key={contract.id}
                  onClick={() => handlers.handleContractSelect(contract.id)}
                  style={{
                    background: 'linear-gradient(180deg, #1a0a0a 0%, #200d0d 100%)',
                    border: '1px solid #7a2a2a',
                    borderRadius: '6px',
                    padding: '12px',
                    cursor: 'pointer',
                    minWidth: '130px',
                    maxWidth: '160px',
                    textAlign: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.background = 'linear-gradient(180deg, #2a0a0a 0%, #300d0d 100%)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#7a2a2a'; e.currentTarget.style.background = 'linear-gradient(180deg, #1a0a0a 0%, #200d0d 100%)'; }}
                >
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, color: '#EF4444', marginBottom: '6px', letterSpacing: '0.04em' }}>{contract.name}</div>
                  <div style={{ fontSize: '10px', color: '#c0a0a0', lineHeight: 1.4 }}>{contract.description}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => handlers.handleContractSelect(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid #2a2a42',
                  borderRadius: '4px',
                  color: '#6060a0',
                  fontSize: '11px',
                  padding: '6px 20px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >Decline</button>
            </div>
          </div>
        </div>
      )}

      {/* Blood Pact friendly unit selection */}
      {state.pendingBloodPact?.step === 'selectFriendly' && isP1Turn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '520px',
            width: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#EF4444', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
              Blood Pact — Sacrifice a friendly unit
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {state.units
                .filter(u => u.owner === 0 && !u.isRelic && !u.isOmen && u.uid !== state.pendingBloodPact.nezzarUid)
                .map(u => (
                  <div
                    key={u.uid}
                    onClick={() => handlers.handleBloodPactSelect(u.uid)}
                    style={{
                      background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                      border: '1px solid #7a2a2a',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      minWidth: '90px',
                      textAlign: 'center',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#EF4444'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#7a2a2a'}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#e8e8f0', marginBottom: '2px' }}>{u.name}</div>
                    <div style={{ fontSize: '10px', color: '#8080a0' }}>{u.atk}/{u.hp}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Blood Pact enemy unit selection */}
      {state.pendingBloodPact?.step === 'selectEnemy' && isP1Turn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '520px',
            width: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#EF4444', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
              Blood Pact — Destroy an enemy unit
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {state.units
                .filter(u => u.owner !== 0 && !u.isRelic && !u.isOmen)
                .map(u => (
                  <div
                    key={u.uid}
                    onClick={() => handlers.handleBloodPactSelect(u.uid)}
                    style={{
                      background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                      border: '1px solid #7a2a2a',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      minWidth: '90px',
                      textAlign: 'center',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#EF4444'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#7a2a2a'}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#e8e8f0', marginBottom: '2px' }}>{u.name}</div>
                    <div style={{ fontSize: '10px', color: '#8080a0' }}>{u.atk}/{u.hp}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile log drawer */}
      {logOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setLogOpen(false)}
        >
          <div
            className="flex flex-col"
            style={{
              background: '#0f0f1e',
              border: '1px solid #252538',
              borderRadius: '0 0 12px 12px',
              padding: '12px',
              height: '80vh',
              boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '8px', flexShrink: 0 }}>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em' }}>Game Log</span>
              <button
                onClick={() => setLogOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #2a2a42',
                  borderRadius: '4px',
                  color: '#8080a0',
                  fontSize: '12px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >✕ Close</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} className="no-scrollbar">
              {state.log.map((entry, i) => {
                const text = entryText(entry);
                return (
                  <div
                    key={i}
                    style={{
                      fontSize: '13px',
                      fontFamily: 'var(--font-sans)',
                      lineHeight: 1.6,
                      padding: '3px 4px',
                      borderRadius: '2px',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      borderBottom: '0.5px solid #0f0f1a',
                      ...((() => {
                        const lower = text.toLowerCase();
                        if (/damage|hits|destroyed|takes/.test(lower)) return { color: '#c06060' };
                        if (/restores|heals|gains hp/.test(lower)) return { color: '#60a060' };
                        if (/turn|begins|starts/.test(lower)) return { color: '#C9A84C', fontSize: '14px', fontWeight: 600 };
                        if (/summons|plays|draws/.test(lower)) return { color: '#6080c0' };
                        return { color: '#9090b8' };
                      })()),
                    }}
                  >{renderLogText(text, handlers.handleInspectCard)}</div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', fontWeight: 600, color: '#C9A84C', letterSpacing: '0.1em' }}>GRIDHOLM</h1>
        <div className="flex gap-2">
          {onBackToLobby && (
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
              color: '#C9A84C',
              background: 'transparent',
              border: '1px solid #C9A84C60',
              borderRadius: '4px',
              padding: '2px 8px',
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
            }}
            onClick={onPlayAgain ?? handlers.handleNewGame}
          >
            New Game
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar state={state} myPlayerIndex={0} commandsUsed={state.players[0].commandsUsed ?? 0} aiThinking={aiThinking} onOpenLog={isMobile ? () => setLogOpen(true) : undefined} />

      {/* Middle content row: board + log (does not include bottom bar) */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left column: phase tracker + card detail */}
        <div className="flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ width: 220, minHeight: 0 }}>
          <PhaseTracker
            phase={phase}
            phaseChangeId={`${state.turn}-${state.activePlayer}-${phase}`}
          />
          <CardDetailPanel inspectedItem={inspectedItem} state={state} handlers={handlers} phase={phase} isP1Turn={isP1Turn} />
        </div>

        {/* Center: command strip flush against board left edge + board */}
        <div className="flex flex-1 min-w-0 min-h-0">
          <div className="hidden sm:flex flex-col items-center justify-center flex-shrink-0">
            <CommandDisplay commandsUsed={state.players[0].commandsUsed ?? 0} />
          </div>
          <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">
          <TurnBanner activePlayer={state.activePlayer} myPlayerIndex={0} />
          <Board
            state={state}
            selectedUnit={selectedUnit}
            selectMode={selectMode}
            championMoveTiles={championMoveTiles}
            championAbilityTargetUids={championAbilityTargetUids}
            championSaplingTiles={championSaplingTiles}
            summonTiles={summonTiles}
            unitMoveTiles={unitMoveTiles}
            approachTiles={approachTiles}
            terrainTargetTiles={terrainTargetTiles}
            directionTargetTiles={directionTargetTiles}
            spellTargetUids={spellTargetUids}
            archerShootTargets={archerShootTargets}
            sacrificeTargetUids={sacrificeTargetUids}
            selectedSacrificeUid={selectedSacrificeUid}
            myPlayerIndex={0}
            handlers={handlers}
            onInspectUnit={handlers.handleInspectUnit}
            onClearInspect={handlers.handleClearInspect}
            onInspectTerrain={handlers.handleInspectTerrain}
            isMobile={isMobile}
            onLongPressUnit={isMobile ? handlers.handleInspectUnit : undefined}
            onLongPressDismiss={isMobile ? handlers.handleClearInspect : undefined}
          />
          </div>
        </div>

        {/* Right sidebar: game log + action buttons */}
        <div className="w-48 flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ minHeight: 0 }}>
          <Log entries={state.log} onCardNameClick={handlers.handleInspectCard} />

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

            {isP1Turn && (
              <div className="flex flex-col gap-1">
                {phase === 'action' && selectMode === 'summon' && (
                  <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="cancel" fullWidth />
                )}
                {phase === 'action' && selectMode === 'spell' && (
                  <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel Spell" variant="cancel" fullWidth />
                )}
                {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && selectedSacrificeUid && (
                  <ActionBtn onClick={() => handlers.handleFleshtitheSacrifice('yes', selectedSacrificeUid)} label="Confirm Sacrifice" variant="action" fullWidth />
                )}
                {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
                  <ActionBtn onClick={() => handlers.handleFleshtitheSacrifice('no', null)} label="Cancel (3/3)" variant="cancel" fullWidth />
                )}
                {phase === 'action' && selectMode === 'champion_ability' && (
                  <ActionBtn onClick={handlers.handleChampionAbilityCancel} label="Cancel" variant="cancel" fullWidth />
                )}
                {phase === 'action' && selectMode === 'terrain_cast' && (
                  <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel Terrain" variant="cancel" fullWidth />
                )}
                {phase === 'action' && selectMode === 'targetless_spell' && (
                  <>
                    <ActionBtn onClick={handlers.handleCastTargetlessSpell} label={isMobile ? 'Cast' : `Cast ${selectedCardObj?.name ?? 'Spell'}`} variant="action" fullWidth />
                    <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="cancel" fullWidth />
                  </>
                )}
                {phase === 'action' && showAction && (
                  <ActionBtn
                    onClick={() => handlers.handleActionButtonClick(selectedUnit)}
                    label="Action"
                    variant="action"
                    fullWidth
                  />
                )}
                {phase === 'action' && selectMode === 'action_confirm' && selectedUnitObj && (
                  <>
                    <ActionBtn onClick={handlers.handleConfirmAction} label="Confirm" variant="action" fullWidth />
                    <ActionBtn onClick={handlers.clearSelection} label="Cancel" variant="cancel" fullWidth />
                  </>
                )}
                {phase === 'action' && selectMode === 'direction_select' && (
                  <>
                    <ActionBtn onClick={() => handlers.handleLineBlastDirection('up')}    label="↑ Up"    variant="action" fullWidth />
                    <ActionBtn onClick={() => handlers.handleLineBlastDirection('down')}  label="↓ Down"  variant="action" fullWidth />
                    <ActionBtn onClick={() => handlers.handleLineBlastDirection('left')}  label="← Left"  variant="action" fullWidth />
                    <ActionBtn onClick={() => handlers.handleLineBlastDirection('right')} label="→ Right" variant="action" fullWidth />
                    <ActionBtn onClick={handlers.clearSelection} label="Cancel" variant="cancel" fullWidth />
                  </>
                )}
                {phase === 'action' && showHiddenReveal && (
                  <ActionBtn
                    onClick={() => { handlers.handleRevealUnit(selectedUnit); handlers.clearSelection(); }}
                    label="Reveal"
                    variant="gold"
                    fullWidth
                  />
                )}
                {phase === 'action' && selectedUnit && (
                  <ActionBtn onClick={handlers.clearSelection} label="Deselect" variant="cancel" fullWidth />
                )}
                {phase === 'action' && (
                  <ActionBtn onClick={handlers.handleEndAction} label="End Turn →" variant="endphase" fullWidth />
                )}
                {pendingDiscard && (
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C', fontWeight: 600 }}>Discard a card to continue</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile fixed bottom action bar */}
      {isMobile && isP1Turn && (
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
            <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'spell' && (
            <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && selectedSacrificeUid && (
            <ActionBtn onClick={() => handlers.handleFleshtitheSacrifice('yes', selectedSacrificeUid)} label="Confirm" variant="action" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
            <ActionBtn onClick={() => handlers.handleFleshtitheSacrifice('no', null)} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'champion_ability' && (
            <ActionBtn onClick={handlers.handleChampionAbilityCancel} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'terrain_cast' && (
            <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'targetless_spell' && (
            <>
              <ActionBtn onClick={handlers.handleCastTargetlessSpell} label={isMobile ? 'Cast' : `Cast ${selectedCardObj?.name ?? 'Spell'}`} variant="action" style={{ minHeight: '44px' }} />
              <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
            </>
          )}
          {phase === 'action' && selectMode === 'action_confirm' && (
            <ActionBtn onClick={handlers.clearSelection} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'direction_select' && (
            <>
              <ActionBtn onClick={() => handlers.handleLineBlastDirection('up')}    label="↑" variant="action" style={{ minHeight: '44px', minWidth: '44px' }} />
              <ActionBtn onClick={() => handlers.handleLineBlastDirection('down')}  label="↓" variant="action" style={{ minHeight: '44px', minWidth: '44px' }} />
              <ActionBtn onClick={() => handlers.handleLineBlastDirection('left')}  label="←" variant="action" style={{ minHeight: '44px', minWidth: '44px' }} />
              <ActionBtn onClick={() => handlers.handleLineBlastDirection('right')} label="→" variant="action" style={{ minHeight: '44px', minWidth: '44px' }} />
              <ActionBtn onClick={handlers.clearSelection} label="✕" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
            </>
          )}
          {phase === 'action' && selectedUnit && (
            <ActionBtn onClick={handlers.clearSelection} label="Deselect" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && (
            <ActionBtn onClick={handlers.handleEndAction} label="End Turn →" variant="endphase" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
        </div>
      )}

      {/* Bottom bar: P1 hand */}
      <div style={{
        background: pendingDiscard && isP1Turn ? 'rgba(201,168,76,0.05)' : 'rgba(13,13,26,0.5)',
        border: `1px solid ${pendingDiscard && isP1Turn ? '#C9A84C' : '#1e1e2e'}`,
        borderRadius: '6px',
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          color: '#4a8abf',
          padding: '4px 8px 2px',
          fontWeight: 600,
        }}>
          {p1.name}
          <span className="hidden sm:inline" style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontWeight: 400, color: '#4a4a6a', fontSize: '12px' }}>
            {phase === 'action' && isP1Turn ? '  (click cards to play)' : ''}
            {pendingDiscard && isP1Turn ? '  — click a card to discard' : ''}
          </span>
        </div>
        {/* Desktop: resources + hand side by side */}
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
            <ResourceDisplay current={p1.resources} max={10} maxThisTurn={p1.maxResourcesThisTurn} playerColor="#185FA5" small={false} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <Hand
              player={p1}
              resources={p1.resources}
              isActive={true}
              canPlay={isP1Turn && phase === 'action'}
              pendingDiscard={pendingDiscard && isP1Turn}
              pendingHandSelect={isP1Turn && selectMode === 'hand_select'}
              selectedCard={selectedCard}
              gameState={state}
              playerIndex={0}
              onPlayCard={handlers.handlePlayCard}
              onDiscardCard={handlers.handleDiscardCard}
              onHandSelect={handlers.handleHandSelect}
              onInspectCard={handlers.handleInspectCard}
              onCardDragStart={handleCardDragStart}
              onCardDragMove={handleCardDragMove}
              onCardDragEnd={handleCardDragEnd}
              graveAccessActive={isP1Turn && !!(state.graveAccessActive?.[0])}
              grave={p1.grave || []}
            />
          </div>
        </div>
        {/* Mobile: resources on top, hand scrollable below */}
        <div className="flex flex-col sm:hidden" style={{ padding: '4px 8px 8px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            padding: '6px 0',
            marginBottom: 4,
            position: 'relative',
            zIndex: 10,
          }}>
            <ResourceDisplay current={p1.resources} max={10} maxThisTurn={p1.maxResourcesThisTurn} playerColor="#185FA5" singleRow={true} />
          </div>
          <Hand
            player={p1}
            resources={p1.resources}
            isActive={true}
            canPlay={isP1Turn && phase === 'action'}
            pendingDiscard={pendingDiscard && isP1Turn}
            pendingHandSelect={isP1Turn && selectMode === 'hand_select'}
            selectedCard={selectedCard}
            gameState={state}
            playerIndex={0}
            onPlayCard={handlers.handlePlayCard}
            onDiscardCard={handlers.handleDiscardCard}
            onHandSelect={handlers.handleHandSelect}
            onInspectCard={handlers.handleInspectCard}
            isMobile={true}
            onMobileTap={(card) => {
              handlers.handlePlayCard(card.uid);
            }}
            onLongPressCard={handlers.handleInspectCard}
            onLongPressDismiss={handlers.handleClearInspect}
            onCardDragStart={handleCardDragStart}
            onCardDragMove={handleCardDragMove}
            onCardDragEnd={handleCardDragEnd}
            graveAccessActive={isP1Turn && !!(state.graveAccessActive?.[0])}
            grave={p1.grave || []}
          />
        </div>
      </div>

      {/* Mobile bottom sheet: card / unit detail */}
      {isMobile && inspectedItem && (
        <MobileBottomSheet
          inspectedItem={inspectedItem}
          state={state}
          onDismiss={handlers.handleClearInspect}
          handlers={handlers}
          phase={phase}
          isP1Turn={isP1Turn}
        />
      )}

      {/* Drag ghost card — follows pointer, semi-transparent */}
      {dragCard && (
        <div
          style={{
            position: 'fixed',
            left: dragSnapping ? dragOrigin.x : dragPos.x,
            top: dragSnapping ? dragOrigin.y : dragPos.y,
            transform: 'translate(-50%, -60%)',
            opacity: 0.65,
            zIndex: 9999,
            pointerEvents: 'none',
            transition: dragSnapping ? 'left 0.25s ease, top 0.25s ease' : 'none',
          }}
        >
          <Card card={dragCard} isSelected={false} isPlayable={false} />
        </div>
      )}

      {/* Targetless spell cast ring — shown when dragged past threshold */}
      {dragCard && selectMode === 'targetless_spell' && dragPos.y < window.innerHeight * 0.67 && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            top: '42%',
            transform: 'translate(-50%, -50%)',
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: '2px solid #C9A84C',
            boxShadow: '0 0 20px #C9A84C70, 0 0 40px #C9A84C30',
            pointerEvents: 'none',
            zIndex: 50,
            animation: 'drag-cast-ring 1s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

function MobileBottomSheet({ inspectedItem, state, onDismiss, handlers, phase, isP1Turn }) {
  let content = null;

  if (inspectedItem?.type === 'champion') {
    const playerIdx = inspectedItem.playerIdx ?? 0;
    const champ = state.champions[playerIdx];
    const player = state.players[playerIdx];
    const champDef = getChampionDef(player);
    const tier = player.resonance?.tier ?? 'none';
    const abilityUsed = champ.moved;
    const ownerLabel = playerIdx === 0 ? 'Friendly' : 'Enemy';
    const ownerColor = playerIdx === 0 ? '#4a8abf' : '#bf4a4a';
    content = (
      <div className="flex flex-col gap-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: '#C9A84C', lineHeight: 1.2 }}>{champDef.name}</span>
          <span style={{ fontSize: 11, color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#e2e8f0' }}>Champion · {tier !== 'none' ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Unbound'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 4, fontFamily: 'var(--font-sans)' }}>
          <div><div style={{ fontSize: 10, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div><div style={{ fontSize: 14, fontWeight: 700, color: champ.hp <= 5 ? '#f87171' : '#ffffff' }}>{champ.hp}/{champ.maxHp}</div></div>
          <div><div style={{ fontSize: 10, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resonance</div><div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C' }}>{player.resonance?.score ?? 0}</div></div>
        </div>
        {playerIdx === 0 && (
          <ChampionAbilitySection
            champDef={champDef}
            tier={tier}
            champ={champ}
            player={player}
            abilityUsed={abilityUsed}
            isP1Turn={isP1Turn}
            phase={phase}
            state={state}
            onActivate={(abilityId, targetFilter) => {
              handlers?.handleChampionAbilityActivate(abilityId, targetFilter);
              onDismiss();
            }}
          />
        )}
      </div>
    );
  } else if (inspectedItem?.type === 'unit') {
    const unit = state.units.find(u => u.uid === inspectedItem.uid)
      || state.champions.find(c => c.uid === inspectedItem.uid);
    if (unit) {
      const ownerLabel = unit.owner === 0 ? 'Friendly' : 'Enemy';
      const ownerColor = unit.owner === 0 ? '#4a8abf' : '#bf4a4a';
      const auraBonus = getAuraAtkBonus(state, unit);
      const displayAtk = unit.atk + (unit.atkBonus || 0) + auraBonus;
      const unitImageUrl = getCardImageUrl(unit.image);
      content = (
        <div className="flex flex-col gap-2">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 90, height: 120, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#252538' }}>
              {unitImageUrl
                ? <img src={unitImageUrl} alt={unit.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a4a6a', fontSize: 11, fontFamily: "'Cinzel', serif" }}>{unit.unitType || 'Unit'}</div>
              }
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: unit.legendary ? '#C9A84C' : '#ffffff', lineHeight: 1.2 }}>
                  {unit.legendary && <span style={{ color: '#C9A84C', marginRight: 3 }}>♛</span>}{unit.name}
                </span>
                <span style={{ fontSize: 11, color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
              </div>
              {unit.unitType && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#e2e8f0' }}>{unit.unitType}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, fontFamily: 'var(--font-sans)' }}>
                <div><div style={{ fontSize: 10, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div><div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>{displayAtk}{auraBonus > 0 && <span style={{ color: '#5eead4', fontSize: 11 }}> +{auraBonus}</span>}</div></div>
                <div><div style={{ fontSize: 10, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div><div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>{unit.hp}/{unit.maxHp}</div></div>
                <div><div style={{ fontSize: 10, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div><div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>{unit.spd + (unit.speedBonus || 0)}</div></div>
              </div>
              {unit.shield > 0 && <div style={{ fontSize: 12, color: '#67e8f9', fontWeight: 600 }}>🛡 Shield: {unit.shield}</div>}
            </div>
          </div>
          <KeywordPills item={unit} />
          {unit.rules && (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#e2e8f0', lineHeight: 1.6, borderTop: '0.5px solid #1e1e2e', paddingTop: 8 }}>
              {renderRules(unit.rules)}
            </div>
          )}
        </div>
      );
    }
  } else if (inspectedItem?.type === 'terrain') {
    const terrainCard = inspectedItem.terrain?.cardId ? CARD_DB[inspectedItem.terrain.cardId] : null;
    if (terrainCard) {
      const cardImageUrl = getCardImageUrl(terrainCard.image);
      content = (
        <div className="flex flex-col gap-2">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 90, height: 120, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#252538' }}>
              {cardImageUrl
                ? <img src={cardImageUrl} alt={terrainCard.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a4a6a', fontSize: 11, fontFamily: "'Cinzel', serif" }}>Terrain</div>
              }
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>{terrainCard.name}</span>
                <span style={{ background: '#C9A84C', color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{terrainCard.cost}</span>
              </div>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#e2e8f0' }}>Terrain</span>
            </div>
          </div>
          {terrainCard.rules && (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#e2e8f0', lineHeight: 1.6, borderTop: '0.5px solid #1e1e2e', paddingTop: 8 }}>
              {renderRules(terrainCard.rules)}
            </div>
          )}
        </div>
      );
    } else {
      content = (
        <div className="flex flex-col gap-2">
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: '#ffffff' }}>Throne</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#e2e8f0' }}>Terrain</span>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#e2e8f0', lineHeight: 1.6, borderTop: '0.5px solid #1e1e2e', paddingTop: 8 }}>
            End your turn with your champion here to deal 4 damage to the enemy champion. This effect cannot reduce the enemy champion below 1 HP.
          </div>
        </div>
      );
    }
  } else if (inspectedItem?.type === 'card') {
    const card = inspectedItem.card;
    const cardImageUrl = getCardImageUrl(card.image);
    content = (
      <div className="flex flex-col gap-2">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 90, height: 120, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#252538' }}>
            {cardImageUrl
              ? <img src={cardImageUrl} alt={card.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a4a6a', fontSize: 11, fontFamily: "'Cinzel', serif" }}>{card.type === 'spell' ? 'Spell' : (card.unitType || 'Unit')}</div>
            }
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: card.legendary ? '#C9A84C' : '#ffffff', lineHeight: 1.2 }}>
                {card.legendary && <span style={{ color: '#C9A84C', marginRight: 3 }}>♛</span>}{card.name}
              </span>
              <span style={{ background: '#C9A84C', color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{card.cost}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#e2e8f0' }}>{card.type === 'spell' ? 'Spell' : card.unitType}</div>
            {card.type === 'unit' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, fontFamily: 'var(--font-sans)' }}>
                <div><div style={{ fontSize: 10, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div><div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>{card.atk}</div></div>
                <div><div style={{ fontSize: 10, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div><div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>{card.hp}</div></div>
                <div><div style={{ fontSize: 10, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div><div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>{card.spd}</div></div>
              </div>
            )}
          </div>
        </div>
        <KeywordPills item={card} />
        {card.rules && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#e2e8f0', lineHeight: 1.6, borderTop: '0.5px solid #1e1e2e', paddingTop: 8 }}>
            {renderRules(card.rules)}
          </div>
        )}
      </div>
    );
  }

  if (!content) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onDismiss}
        style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(0,0,0,0.5)' }}
      />
      {/* Sheet */}
      <div className="no-scrollbar" style={{
        position: 'fixed',
        top: 80,
        left: 0,
        right: 0,
        zIndex: 50,
        background: '#0d0d1a',
        border: '1px solid #C9A84C40',
        borderTop: 'none',
        borderRadius: '0 0 16px 16px',
        padding: '16px',
        maxHeight: 'calc(50vh - 80px)',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>Card Detail</div>
          <button
            onClick={onDismiss}
            style={{ background: 'transparent', border: 'none', color: '#6a6a8a', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
          >×</button>
        </div>
        {content}
      </div>
    </>
  );
}

function KeywordPills({ item }) {
  const [openPill, setOpenPill] = useState(null);
  const activeKeywords = [];
  if (item.rush) activeKeywords.push('rush');
  if (item.flying) activeKeywords.push('flying');
  if (item.hidden) activeKeywords.push('hidden');
  if (item.action) activeKeywords.push('action');
  if (item.aura) activeKeywords.push('aura');
  if (item.legendary) activeKeywords.push('legendary');
  if (item.stunned) activeKeywords.push('stunned');
  if (activeKeywords.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
      {activeKeywords.map(kw => {
        const def = KEYWORD_REMINDERS[kw];
        if (!def) return null;
        const label = kw === 'aura' ? `Aura ${item.aura.range}` : def.label;
        const isOpen = openPill === kw;
        return (
          <div key={kw} style={{ width: '100%' }}>
            <span
              onClick={() => setOpenPill(isOpen ? null : kw)}
              style={{
                display: 'inline-block',
                fontSize: '10px',
                background: `${def.color}22`,
                color: def.color,
                border: `1px solid ${def.color}55`,
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              {label}
            </span>
            {isOpen && (
              <div style={{
                fontSize: '10px',
                color: '#c0c0d0',
                fontFamily: 'var(--font-sans)',
                lineHeight: 1.5,
                padding: '4px 6px',
                marginTop: '2px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '4px',
                borderLeft: `2px solid ${def.color}55`,
              }}>
                {def.reminder}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChampionAbilitySection({ champDef, tier, champ, player, abilityUsed, isP1Turn, phase, onActivate, state }) {
  if (tier === 'none' || !isP1Turn || phase !== 'action') return null;

  const ascended = champDef.abilities.ascended;
  const attuned = champDef.abilities.attuned;
  const attunedPassive = champDef.abilities.attunedPassive;

  // Determine activated ability
  let activatedAbility = attuned;
  if (tier === 'ascended' && ascended?.type === 'activated' && ascended?.replacesAbility) {
    activatedAbility = ascended;
  }

  // Determine passive at ascended tier
  let passiveAbility = null;
  if (tier === 'ascended' && ascended?.type === 'passive') {
    passiveAbility = ascended;
  }

  const costLabel = activatedAbility?.cost
    ? `${activatedAbility.cost.amount} ${activatedAbility.cost.type}`
    : null;

  const canAfford = activatedAbility?.cost
    ? (activatedAbility.cost.type === 'mana'
        ? player.resources >= activatedAbility.cost.amount
        : champ.hp > activatedAbility.cost.amount)
    : true;

  const hasValidTargets = activatedAbility?.targetFilter === 'friendly_unit_within_2'
    ? (state?.units ?? []).some(u => u.owner === champ.owner && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
    : activatedAbility?.targetFilter === 'friendly_unit'
      ? (state?.units ?? []).some(u => u.owner === champ.owner && !u.hidden)
      : true;

  const btnDisabled = !canAfford || abilityUsed || !hasValidTargets;

  return (
    <div style={{ borderTop: '0.5px solid #1e1e2e', paddingTop: 6, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#9090b8', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>
        Invoke:
      </div>
      {activatedAbility && (
        <button
          disabled={btnDisabled}
          onClick={() => !btnDisabled && onActivate(activatedAbility.id, activatedAbility.targetRequired ? activatedAbility.targetFilter : null)}
          style={{
            background: btnDisabled ? 'transparent' : 'linear-gradient(135deg, #5a3a00, #8a6a00)',
            color: btnDisabled ? '#4a4a6a' : '#C9A84C',
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            fontWeight: 600,
            border: `1px solid ${btnDisabled ? '#2a2a3a' : '#C9A84C60'}`,
            borderRadius: '4px',
            padding: '5px 8px',
            cursor: btnDisabled ? 'not-allowed' : 'pointer',
            textAlign: 'left',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span>{activatedAbility.name}</span>
            {costLabel && <span style={{ fontSize: '10px', opacity: 0.8 }}>{costLabel}</span>}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 400, lineHeight: 1.4, opacity: 0.85 }}>
            {activatedAbility.description}
          </div>
          {abilityUsed && (
            <div style={{ fontSize: '9px', color: '#6a6a8a', marginTop: 2 }}>Invoke used — cannot move this turn</div>
          )}
        </button>
      )}
      {passiveAbility && (
        <div style={{ fontSize: '11px', color: '#9090b8', fontFamily: 'var(--font-sans)', fontStyle: 'italic', lineHeight: 1.4, paddingLeft: 2 }}>
          <span style={{ fontWeight: 600, fontStyle: 'normal', color: '#b0a0c0' }}>{passiveAbility.name}:</span> {passiveAbility.description}
        </div>
      )}
      {attunedPassive && (
        <div style={{ fontSize: '11px', color: '#9090b8', fontFamily: 'var(--font-sans)', fontStyle: 'italic', lineHeight: 1.4, paddingLeft: 2 }}>
          <span style={{ fontWeight: 600, fontStyle: 'normal', color: '#b0a0c0' }}>{attunedPassive.name}:</span> {attunedPassive.description}
        </div>
      )}
    </div>
  );
}

function CardDetailPanel({ inspectedItem, state, handlers, phase, isP1Turn }) {
  let content = null;

  if (inspectedItem?.type === 'champion') {
    const playerIdx = inspectedItem.playerIdx ?? 0;
    const champ = state.champions[playerIdx];
    const player = state.players[playerIdx];
    const champDef = getChampionDef(player);
    const tier = player.resonance?.tier ?? 'none';
    const abilityUsed = champ.moved;
    const ownerLabel = playerIdx === 0 ? 'Friendly' : 'Enemy';
    const ownerColor = playerIdx === 0 ? '#4a8abf' : '#bf4a4a';
    const champImageUrl = getCardImageUrl(champDef.image);
    content = (
      <div className="flex flex-col gap-1">
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          {champImageUrl ? (
            <img src={champImageUrl} alt={champDef.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)' }} />
          )}
        </div>
        <div className="flex justify-between items-start">
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 700, color: '#C9A84C', lineHeight: 1.2 }}>{champDef.name}</span>
          <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#e2e8f0' }}>Champion · {tier !== 'none' ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Unbound'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: champ.hp <= 5 ? '#f87171' : '#ffffff' }}>{champ.hp}/{champ.maxHp}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resonance</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#C9A84C' }}>{player.resonance?.score ?? 0}</div>
          </div>
        </div>
        {playerIdx === 0 && (
          <ChampionAbilitySection
            champDef={champDef}
            tier={tier}
            champ={champ}
            player={player}
            abilityUsed={abilityUsed}
            isP1Turn={isP1Turn}
            phase={phase}
            state={state}
            onActivate={handlers?.handleChampionAbilityActivate}
          />
        )}
      </div>
    );
  } else if (inspectedItem?.type === 'unit') {
    const unit = state.units.find(u => u.uid === inspectedItem.uid);
    if (unit) {
      const ownerLabel = unit.owner === 0 ? 'Friendly' : 'Enemy';
      const ownerColor = unit.owner === 0 ? '#4a8abf' : '#bf4a4a';
      const auraBonus = getAuraAtkBonus(state, unit);
      const displayAtk = unit.atk + (unit.atkBonus || 0) + auraBonus;
      const unitImageUrl = getCardImageUrl(unit.image);
      content = (
        <div className="flex flex-col gap-1">
          <div
            style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}
            data-art-slot="true"
          >
            {unitImageUrl ? (
              <img
                src={unitImageUrl}
                alt={unit.name}
                onError={(e) => { e.target.style.display = 'none'; }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)',
                fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500,
              }}>
                {unit.unitType || 'Unit'}
              </div>
            )}
          </div>
          <div className="flex justify-between items-start">
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 700, color: unit.legendary ? '#C9A84C' : '#ffffff', lineHeight: 1.2 }}>{unit.name}</span>
            <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
          </div>
          {unit.unitType && <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#e2e8f0' }}>{unit.unitType}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {displayAtk}{auraBonus > 0 && <span style={{ color: '#5eead4', fontSize: '11px' }}> +{auraBonus}</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{unit.hp}/{unit.maxHp}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{unit.spd + (unit.speedBonus || 0)}</div>
            </div>
          </div>
          {unit.shield > 0 && (
            <div style={{ fontSize: '11px', color: '#67e8f9', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>🛡 Shield: {unit.shield}</div>
          )}
          <KeywordPills item={unit} />
          {unit.rules && (
            <div style={{
              fontFamily: 'var(--font-sans)',
              fontStyle: 'normal',
              fontSize: '12px',
              fontWeight: 400,
              color: '#e2e8f0',
              lineHeight: 1.6,
              marginTop: '4px',
              borderTop: '0.5px solid #1e1e2e',
              paddingTop: '4px',
            }}>
              {renderRules(unit.rules)}
            </div>
          )}
        </div>
      );
    }
  } else if (inspectedItem?.type === 'terrain') {
    const terrainCard = inspectedItem.terrain?.cardId ? CARD_DB[inspectedItem.terrain.cardId] : null;
    if (terrainCard) {
      const cardImageUrl = getCardImageUrl(terrainCard.image);
      content = (
        <div className="flex flex-col gap-1">
          <div
            style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}
            data-art-slot="true"
          >
            {cardImageUrl ? (
              <img
                src={cardImageUrl}
                alt={terrainCard.name}
                onError={(e) => { e.target.style.display = 'none'; }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)',
                fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500,
              }}>
                Terrain
              </div>
            )}
          </div>
          <div className="flex justify-between items-start">
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>{terrainCard.name}</span>
            <span style={{
              background: '#C9A84C',
              color: '#0a0a0f',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: '99px',
            }}>{terrainCard.cost}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#e2e8f0' }}>Terrain</div>
          {terrainCard.rules && (
            <div style={{
              fontFamily: 'var(--font-sans)',
              fontStyle: 'normal',
              fontSize: '12px',
              fontWeight: 400,
              color: '#e2e8f0',
              lineHeight: 1.6,
              marginTop: '4px',
              borderTop: '0.5px solid #1e1e2e',
              paddingTop: '4px',
            }}>
              {renderRules(terrainCard.rules)}
            </div>
          )}
        </div>
      );
    } else {
      content = (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-start">
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>Throne</span>
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#e2e8f0' }}>Terrain</div>
          <div style={{
            fontFamily: 'var(--font-sans)',
            fontStyle: 'normal',
            fontSize: '12px',
            fontWeight: 400,
            color: '#e2e8f0',
            lineHeight: 1.6,
            marginTop: '4px',
            borderTop: '0.5px solid #1e1e2e',
            paddingTop: '4px',
          }}>
            End your turn with your champion here to deal 4 damage to the enemy champion. This effect cannot reduce the enemy champion below 1 HP.
          </div>
        </div>
      );
    }
  } else if (inspectedItem?.type === 'card') {
    const card = inspectedItem.card;
    const cardImageUrl = getCardImageUrl(card.image);
    content = (
      <div className="flex flex-col gap-1">
        <div
          style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}
          data-art-slot="true"
        >
          {cardImageUrl ? (
            <img
              src={cardImageUrl}
              alt={card.name}
              onError={(e) => { e.target.style.display = 'none'; }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)',
              fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500,
            }}>
              {card.type === 'spell' ? 'Spell' : (card.unitType || 'Unit')}
            </div>
          )}
        </div>
        <div className="flex justify-between items-start">
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 700, color: card.legendary ? '#C9A84C' : '#ffffff', lineHeight: 1.2 }}>{card.name}</span>
          <span style={{
            background: '#C9A84C',
            color: '#0a0a0f',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            fontWeight: 700,
            padding: '1px 7px',
            borderRadius: '99px',
          }}>{card.cost}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#e2e8f0' }}>
          {card.type === 'spell' ? 'Spell' : card.unitType}
        </div>
        {card.type === 'unit' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{card.atk}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{card.hp}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{card.spd}</div>
            </div>
          </div>
        )}
        <KeywordPills item={card} />
        {card.rules && (
          <div style={{
            fontFamily: 'var(--font-sans)',
            fontStyle: 'normal',
            fontSize: '12px',
            fontWeight: 400,
            color: '#e2e8f0',
            lineHeight: 1.6,
            marginTop: '4px',
            borderTop: '0.5px solid #1e1e2e',
            paddingTop: '4px',
          }}>
            {renderRules(card.rules)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#08080f',
        border: '1px solid #1e1e2e',
        borderTop: '1px solid #C9A84C30',
        borderRadius: '6px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#C9A84C', marginBottom: '6px', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>Card Detail</div>
      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
        {content || (
          <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '11px', color: '#2a2a3a', lineHeight: 1.5 }}>
            Click a card or unit to inspect
          </div>
        )}
      </div>
    </div>
  );
}

export function CommandDisplay({ commandsUsed }) {
  const allUsed = commandsUsed >= 3;
  return (
    <div
      className="flex-shrink-0"
      style={{
        width: 54,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 0',
      }}
    >
      {[1, 2, 3].map(i => {
        const used = i <= commandsUsed;
        return (
          <div key={i} style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            flexShrink: 0,
            background: allUsed ? '#800020' : used ? '#C9A84C' : '#0f1729',
            border: `1px solid ${allUsed ? '#80002080' : used ? '#C9A84C80' : '#2a2a3a'}`,
            boxShadow: used && !allUsed ? '0 0 6px #C9A84C60' : 'none',
            transition: 'background 0.2s, border-color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontSize: '11px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              color: allUsed ? '#ff666680' : used ? '#0a0a0f' : '#2a2a4a',
            }}>{i}</span>
          </div>
        );
      })}
      {allUsed && (
        <div style={{
          fontSize: '8px',
          fontFamily: 'var(--font-sans)',
          color: '#ffffff',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          textAlign: 'center',
          lineHeight: 1.3,
        }}>
          Commands<br />Exhausted
        </div>
      )}
    </div>
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
