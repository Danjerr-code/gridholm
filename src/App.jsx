import { useState } from 'react';
import { useGameState } from './hooks/useGameState.js';
import { getAuraAtkBonus, playerRevealUnit } from './engine/gameEngine.js';
import { getCardImageUrl } from './supabase.js';
import StatusBar, { ResourceDisplay } from './components/StatusBar.jsx';
import Board from './components/Board.jsx';
import Hand from './components/Hand.jsx';
import Log from './components/Log.jsx';
import PhaseTracker from './components/PhaseTracker.jsx';
import useIsMobile from './hooks/useIsMobile.js';

const PHASE_GUIDANCE = {
  'begin-turn': 'Beginning turn…',
  action: 'Move your champion, play cards, and move units in any order. Click End Phase when done.',
  'end-turn': 'Click "End Turn" to pass to opponent.',
  discard: 'You have too many cards. Click a card to discard.',
};

export default function App({ onBackToLobby, deckId = 'human' } = {}) {
  const {
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
    handlers,
  } = useGameState({ deckId });

  const isMobile = useIsMobile();
  const [logOpen, setLogOpen] = useState(false);
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
  if (selectMode === 'fleshtithe_sacrifice') guidance = 'Select a friendly unit to sacrifice for Flesh Tithe +2/+2, or click Cancel to summon as 3/3.';

  const isImportantGuidance = selectMode === 'spell' || selectMode === 'summon' || selectMode === 'action_confirm' || selectMode === 'fleshtithe_sacrifice' || selectMode === 'targetless_spell';

  const showAction = selectedUnitObj?.action === true
    && !selectedUnitObj.moved
    && !selectedUnitObj.summoned
    && selectMode === 'unit_move'
    && phase === 'action'
    && isP1Turn;
  const showHiddenReveal = selectedUnitObj?.hidden
    && selectedUnitObj.owner === 0
    && !selectedUnitObj.moved
    && selectMode === 'unit_move'
    && phase === 'action'
    && isP1Turn;

  return (
    <div className="h-screen overflow-hidden text-white p-2 flex flex-col gap-2" style={{ background: '#0a0a0f', paddingBottom: isMobile ? '72px' : '8px' }}>
      {/* Winner overlay */}
      {winner && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div style={{
            background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
            border: '1px solid #C9A84C',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            boxShadow: '0 0 40px #C9A84C20',
          }}>
            <div className="text-4xl mb-4">⚔️</div>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', fontWeight: 700, color: '#C9A84C', marginBottom: '8px' }}>{winner} wins!</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '16px', color: '#8a8aaa', marginBottom: '24px' }}>The champion has fallen.</p>
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
              onClick={handlers.handleNewGame}
            >
              New Game
            </button>
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
              {state.log.map((entry, i) => (
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
                      const lower = entry.toLowerCase();
                      if (/damage|hits|destroyed|takes/.test(lower)) return { color: '#c06060' };
                      if (/restores|heals|gains hp/.test(lower)) return { color: '#60a060' };
                      if (/turn|begins|starts/.test(lower)) return { color: '#C9A84C', fontSize: '14px', fontWeight: 600 };
                      if (/summons|plays|draws/.test(lower)) return { color: '#6080c0' };
                      return { color: '#9090b8' };
                    })()),
                  }}
                >{entry}</div>
              ))}
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
            onClick={handlers.handleNewGame}
          >
            New Game
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar state={state} myPlayerIndex={0} onOpenLog={isMobile ? () => setLogOpen(true) : undefined} />

      {/* Middle content row: board + log (does not include bottom bar) */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left column: phase tracker + card detail */}
        <div className="flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ width: 220, minHeight: 0 }}>
          <PhaseTracker
            phase={phase}
            phaseChangeId={`${state.turn}-${state.activePlayer}-${phase}`}
          />
          <CardDetailPanel inspectedItem={inspectedItem} state={state} />
        </div>

        {/* Center: board only */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <Board
            state={state}
            selectedUnit={selectedUnit}
            selectMode={selectMode}
            championMoveTiles={championMoveTiles}
            summonTiles={summonTiles}
            unitMoveTiles={unitMoveTiles}
            spellTargetUids={spellTargetUids}
            archerShootTargets={archerShootTargets}
            sacrificeTargetUids={sacrificeTargetUids}
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

        {/* Right sidebar: game log + action buttons */}
        <div className="w-48 flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ minHeight: 0 }}>
          <Log entries={state.log} />

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
                {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
                  <ActionBtn onClick={() => handlers.handleFleshtitheSacrifice('no', null)} label="Cancel (3/3)" variant="cancel" fullWidth />
                )}
                {phase === 'action' && selectMode === 'targetless_spell' && (
                  <>
                    <ActionBtn onClick={handlers.handleCastTargetlessSpell} label={`Cast ${selectedCardObj?.name ?? 'Spell'}`} variant="action" fullWidth />
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
                  <ActionBtn onClick={handlers.handleEndAction} label="End Phase →" variant="endphase" fullWidth />
                )}

                {phase === 'end-turn' && !pendingDiscard && (
                  <ActionBtn onClick={handlers.handleEndTurn} label="End Turn ⏎" variant="endphase" fullWidth />
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
          {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
            <ActionBtn onClick={() => handlers.handleFleshtitheSacrifice('no', null)} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'targetless_spell' && (
            <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'action_confirm' && (
            <ActionBtn onClick={handlers.clearSelection} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectedUnit && (
            <ActionBtn onClick={handlers.clearSelection} label="Deselect" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && (
            <ActionBtn onClick={handlers.handleEndAction} label="End Phase →" variant="endphase" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'end-turn' && !pendingDiscard && (
            <ActionBtn onClick={handlers.handleEndTurn} label="End Turn ⏎" variant="endphase" style={{ minHeight: '44px', minWidth: '44px' }} />
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
              RESOURCES
            </div>
            <ResourceDisplay current={p1.resources} max={10} playerColor="#185FA5" small={false} />
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
              onPlayCard={handlers.handlePlayCard}
              onDiscardCard={handlers.handleDiscardCard}
              onHandSelect={handlers.handleHandSelect}
              onInspectCard={handlers.handleInspectCard}
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
          }}>
            <div style={{ fontSize: 10, color: '#6a6a88', fontWeight: 500, fontFamily: 'var(--font-sans)', letterSpacing: '0.05em' }}>
              RESOURCES
            </div>
            <ResourceDisplay current={p1.resources} max={10} playerColor="#185FA5" small={true} />
          </div>
          <Hand
            player={p1}
            resources={p1.resources}
            isActive={true}
            canPlay={isP1Turn && phase === 'action'}
            pendingDiscard={pendingDiscard && isP1Turn}
            pendingHandSelect={isP1Turn && selectMode === 'hand_select'}
            selectedCard={selectedCard}
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
          />
        </div>
      </div>

      {/* Mobile bottom sheet: card / unit detail */}
      {isMobile && inspectedItem && (
        <MobileBottomSheet
          inspectedItem={inspectedItem}
          state={state}
          onDismiss={handlers.handleClearInspect}
        />
      )}
    </div>
  );
}

function MobileBottomSheet({ inspectedItem, state, onDismiss }) {
  let content = null;

  if (inspectedItem?.type === 'unit') {
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
                ? <img src={unitImageUrl} alt={unit.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
              {unit.unitType && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#9090b8' }}>{unit.unitType}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, fontFamily: 'var(--font-sans)' }}>
                <div><div style={{ fontSize: 10, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div><div style={{ fontSize: 14, fontWeight: 700, color: '#e05050' }}>{displayAtk}{auraBonus > 0 && <span style={{ color: '#5eead4', fontSize: 11 }}> +{auraBonus}</span>}</div></div>
                <div><div style={{ fontSize: 10, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div><div style={{ fontSize: 14, fontWeight: 700, color: '#50c050' }}>{unit.hp}/{unit.maxHp}</div></div>
                <div><div style={{ fontSize: 10, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div><div style={{ fontSize: 14, fontWeight: 700, color: '#5090e0' }}>{unit.spd + (unit.speedBonus || 0)}</div></div>
              </div>
              {unit.shield > 0 && <div style={{ fontSize: 12, color: '#67e8f9', fontWeight: 600 }}>🛡 Shield: {unit.shield}</div>}
            </div>
          </div>
          {unit.rules && (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#c0c0d8', lineHeight: 1.6, borderTop: '0.5px solid #1e1e2e', paddingTop: 8 }}>
              {unit.rules}
            </div>
          )}
        </div>
      );
    }
  } else if (inspectedItem?.type === 'terrain') {
    content = (
      <div className="flex flex-col gap-2">
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: '#ffffff' }}>Throne</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#9090b8' }}>Terrain</span>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#c0c0d8', lineHeight: 1.6, borderTop: '0.5px solid #1e1e2e', paddingTop: 8 }}>
          End your turn with your champion here to deal 4 damage to the enemy champion. This effect cannot reduce the enemy champion below 1 HP.
        </div>
      </div>
    );
  } else if (inspectedItem?.type === 'card') {
    const card = inspectedItem.card;
    const cardImageUrl = getCardImageUrl(card.image);
    content = (
      <div className="flex flex-col gap-2">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 90, height: 120, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#252538' }}>
            {cardImageUrl
              ? <img src={cardImageUrl} alt={card.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#9090b8' }}>{card.type === 'spell' ? 'Spell' : card.unitType}</div>
            {card.type === 'unit' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, fontFamily: 'var(--font-sans)' }}>
                <div><div style={{ fontSize: 10, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div><div style={{ fontSize: 14, fontWeight: 700, color: '#e05050' }}>{card.atk}</div></div>
                <div><div style={{ fontSize: 10, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div><div style={{ fontSize: 14, fontWeight: 700, color: '#50c050' }}>{card.hp}</div></div>
                <div><div style={{ fontSize: 10, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div><div style={{ fontSize: 14, fontWeight: 700, color: '#5090e0' }}>{card.spd}</div></div>
              </div>
            )}
            {card.aura && (
              <span style={{ fontSize: 11, background: '#134e4a', color: '#5eead4', padding: '2px 6px', borderRadius: 4, fontWeight: 600, alignSelf: 'flex-start' }}>Aura {card.aura.range}</span>
            )}
          </div>
        </div>
        {card.rules && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#c0c0d8', lineHeight: 1.6, borderTop: '0.5px solid #1e1e2e', paddingTop: 8 }}>
            {card.rules}
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
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: '#0d0d1a',
        border: '1px solid #C9A84C40',
        borderBottom: 'none',
        borderRadius: '16px 16px 0 0',
        padding: '16px',
        maxHeight: '65vh',
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

function CardDetailPanel({ inspectedItem, state }) {
  let content = null;

  if (inspectedItem?.type === 'unit') {
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
          {unit.unitType && <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#9090b8' }}>{unit.unitType}</div>}
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
          {unit.rules && (
            <div style={{
              fontFamily: 'var(--font-sans)',
              fontStyle: 'normal',
              fontSize: '12px',
              fontWeight: 400,
              color: '#c0c0d8',
              lineHeight: 1.6,
              marginTop: '4px',
              borderTop: '0.5px solid #1e1e2e',
              paddingTop: '4px',
            }}>
              {unit.rules}
            </div>
          )}
        </div>
      );
    }
  } else if (inspectedItem?.type === 'terrain') {
    content = (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-start">
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>Throne</span>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#9090b8' }}>Terrain</div>
        <div style={{
          fontFamily: 'var(--font-sans)',
          fontStyle: 'normal',
          fontSize: '12px',
          fontWeight: 400,
          color: '#c0c0d8',
          lineHeight: 1.6,
          marginTop: '4px',
          borderTop: '0.5px solid #1e1e2e',
          paddingTop: '4px',
        }}>
          End your turn with your champion here to deal 4 damage to the enemy champion. This effect cannot reduce the enemy champion below 1 HP.
        </div>
      </div>
    );
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
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#9090b8' }}>
          {card.type === 'spell' ? 'Spell' : card.unitType}
        </div>
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
        {card.rules && (
          <div style={{
            fontFamily: 'var(--font-sans)',
            fontStyle: 'normal',
            fontSize: '12px',
            fontWeight: 400,
            color: '#c0c0d8',
            lineHeight: 1.6,
            marginTop: '4px',
            borderTop: '0.5px solid #1e1e2e',
            paddingTop: '4px',
          }}>
            {card.rules}
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
      }}
    >
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#C9A84C', marginBottom: '6px', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>Card Detail</div>
      <div className="flex-1 overflow-y-auto">
        {content || (
          <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '11px', color: '#2a2a3a', lineHeight: 1.5 }}>
            Click a card or unit to inspect
          </div>
        )}
      </div>
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
