import { useState, useMemo, useCallback } from 'react';
import MatchReviewBoard from './MatchReviewBoard.jsx';
import { CardDetailContent } from './CardDetailModal.jsx';
import { getCardImageUrl } from '../supabase.js';
import { findInflectionPoints } from '../engine/matchReview.js';

/**
 * MatchReview — post-game match review screen.
 *
 * Props:
 *   stateHistory  {Array}    — array of game state snapshots (one per turn end)
 *   onBack        {Function} — called when player clicks "Back"
 */

const LEFT_COL_W = 220;
const RIGHT_COL_W = 192;
const COL_GAP = 8;

export default function MatchReview({ stateHistory, onBack }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inspectedItem, setInspectedItem] = useState(null);
  const [showOpponentHand, setShowOpponentHand] = useState(true);

  const handleUnitClick = useCallback((unit) => {
    setInspectedItem({ type: 'unit', unit });
  }, []);

  const handleChampionClick = useCallback((champion) => {
    setInspectedItem({ type: 'champion', playerIdx: champion.owner ?? 0 });
  }, []);

  const inflectionPoints = useMemo(
    () => findInflectionPoints(stateHistory),
    [stateHistory]
  );

  const totalTurns = stateHistory.length;
  const currentState = stateHistory[currentIndex];

  const turnActions = useMemo(() => {
    if (!currentState) return [];
    const prevLog = currentIndex > 0 ? (stateHistory[currentIndex - 1]?.log ?? []) : [];
    const currLog = currentState.log ?? [];
    const newEntries = currLog.slice(prevLog.length);
    return newEntries
      .map(e => (typeof e === 'string' ? e : e?.text ?? ''))
      .filter(text => {
        const t = text.toLowerCase();
        return (
          /summons|plays|casts|moves|attacks|uses|draws|invokes|champion/.test(t) &&
          !/^turn \d+ begins/i.test(t)
        );
      })
      .slice(0, 8);
  }, [currentState, currentIndex, stateHistory]);

  const activeInflectionIndex = inflectionPoints.findIndex(
    p => p.stateIndex === currentIndex
  );

  const hasHands =
    (currentState?.players?.[0]?.hand?.length > 0 ||
      currentState?.players?.[1]?.hand?.length > 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header — compact single row */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '7px 12px',
          borderBottom: '1px solid #1e1e2e',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            color: '#9ca3af',
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            fontWeight: 600,
            border: '1px solid #2a2a3a',
            borderRadius: '4px',
            padding: '4px 12px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          ← Back
        </button>
        <h2
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '14px',
            fontWeight: 700,
            color: '#C9A84C',
            margin: 0,
            letterSpacing: '0.06em',
            flex: 1,
            textAlign: 'center',
          }}
        >
          Match Review
        </h2>
        {/* Balancing spacer same width as back button area */}
        <div style={{ width: '80px', flexShrink: 0 }} />
      </div>

      {/* Nav strip — positioned above the board (center column width only) */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          gap: COL_GAP,
          padding: `8px 8px 0`,
        }}
      >
        <div style={{ width: LEFT_COL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              style={navBtnStyle(currentIndex === 0)}
            >◀</button>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#e8e8f0', minWidth: '80px', textAlign: 'center' }}>
              Turn {currentState?.turn ?? currentIndex + 1}
              <span style={{ color: '#6b7280', fontSize: '11px' }}>{' '}/ {stateHistory[totalTurns - 1]?.turn ?? totalTurns}</span>
            </span>
            <button
              onClick={() => setCurrentIndex(i => Math.min(totalTurns - 1, i + 1))}
              disabled={currentIndex === totalTurns - 1}
              style={navBtnStyle(currentIndex === totalTurns - 1)}
            >▶</button>
          </div>
          <input
            type="range"
            min={0}
            max={totalTurns - 1}
            value={currentIndex}
            onChange={e => setCurrentIndex(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#C9A84C' }}
          />
        </div>
        <div style={{ width: RIGHT_COL_W, flexShrink: 0 }} />
      </div>

      {/* Three-column body — columns aligned at board top */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: COL_GAP, padding: '8px 8px 0' }}>

        {/* Left column: card detail (220px) */}
        <div style={{ width: LEFT_COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            style={{
              background: '#0f0f1e',
              border: '1px solid #252538',
              borderRadius: '6px',
              padding: '10px',
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
            className="no-scrollbar"
          >
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#C9A84C', marginBottom: '8px', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>
              Card Detail
            </div>
            {inspectedItem ? (
              <CardDetailContent inspectedItem={inspectedItem} gameState={currentState} />
            ) : (
              <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '11px', color: '#2a2a3a', lineHeight: 1.5 }}>
                Click a unit or card to inspect
              </div>
            )}
          </div>
        </div>

        {/* Center column: board only */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <MatchReviewBoard
            gameState={currentState}
            onUnitClick={handleUnitClick}
            onChampionClick={handleChampionClick}
          />
        </div>

        {/* Right column: actions + key moments (192px) */}
        <div style={{ width: RIGHT_COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>

          {/* Actions this turn */}
          <div
            style={{
              background: '#0f0f1e',
              border: '1px solid #252538',
              borderRadius: '6px',
              padding: '10px',
              flexShrink: 0,
              maxHeight: '200px',
              overflowY: 'auto',
            }}
            className="no-scrollbar"
          >
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
              Actions This Turn
            </div>
            {turnActions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {turnActions.map((text, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#9090b8', lineHeight: 1.5 }}>
                    · {text}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#2a2a3a', fontStyle: 'italic' }}>
                No actions recorded
              </div>
            )}
          </div>

          {/* Key moments */}
          <div
            style={{
              background: '#0f0f1e',
              border: '1px solid #252538',
              borderRadius: '6px',
              padding: '10px',
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
            className="no-scrollbar"
          >
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', flexShrink: 0 }}>
              Key Moments
            </div>
            {inflectionPoints.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {inflectionPoints.map((point, idx) => {
                  const favorsP1 = point.delta > 0;
                  const isActive = idx === activeInflectionIndex;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentIndex(Math.min(point.stateIndex, totalTurns - 1))}
                      style={{
                        background: isActive
                          ? favorsP1 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'
                          : favorsP1 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                        border: isActive
                          ? `1px solid ${favorsP1 ? '#22c55e' : '#ef4444'}80`
                          : `1px solid ${favorsP1 ? '#22c55e' : '#ef4444'}30`,
                        borderRadius: '6px',
                        padding: '6px 8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, color: favorsP1 ? '#4ade80' : '#f87171' }}>
                          {favorsP1 ? '+' : ''}{point.delta}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#e2e8f0', lineHeight: 1.4 }}>
                        {point.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#2a2a3a', fontStyle: 'italic' }}>
                No major turning points detected.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Full-width hands strip */}
      {hasHands && (
        <div style={{ flexShrink: 0, padding: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Hands
            </div>
            <button
              onClick={() => setShowOpponentHand(v => !v)}
              style={{ background: 'transparent', border: '1px solid #252538', borderRadius: '4px',
                color: '#6b7280', fontFamily: 'var(--font-sans)', fontSize: '10px',
                padding: '2px 8px', cursor: 'pointer' }}
            >
              {showOpponentHand ? 'Hide P2' : 'Show P2'}
            </button>
          </div>
          <ReviewHandStrip
            hand={currentState?.players?.[0]?.hand ?? []}
            label="P1"
            labelColor="#3b82f6"
            onCardClick={(card) => setInspectedItem({ type: 'card', card })}
          />
          {showOpponentHand && (
            <ReviewHandStrip
              hand={currentState?.players?.[1]?.hand ?? []}
              label="P2"
              labelColor="#ef4444"
              onCardClick={(card) => setInspectedItem({ type: 'card', card })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReviewHandStrip({ hand, label, labelColor, onCardClick }) {
  if (!hand || hand.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: labelColor, minWidth: '20px' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#4b5563', fontStyle: 'italic' }}>empty</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '8px' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: labelColor, minWidth: '20px', paddingTop: '4px' }}>{label}</span>
      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px', flex: 1 }} className="no-scrollbar">
        {hand.map((card, i) => {
          const imageUrl = card.image ? getCardImageUrl(card.image) : null;
          const isSpell = card.type === 'spell';
          return (
            <div
              key={card.uid ?? i}
              onClick={() => onCardClick(card)}
              title={card.name}
              style={{
                position: 'relative',
                flexShrink: 0,
                width: '48px',
                height: '64px',
                borderRadius: '4px',
                background: '#0d0d1a',
                border: '1px solid #2a2a42',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt={card.name}
                  onError={e => { e.target.style.display = 'none'; }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-sans)', fontSize: '9px', color: '#6b7280', textAlign: 'center', padding: '2px' }}>
                  {card.name}
                </div>
              )}
              <div style={{ position: 'absolute', top: '2px', right: '2px', background: '#C9A84C',
                color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: '8px', fontWeight: 700,
                padding: '0 3px', borderRadius: '99px', lineHeight: 1.6 }}>
                {card.cost}
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.75)', color: '#9ca3af',
                fontFamily: 'var(--font-sans)', fontSize: '7px', fontWeight: 600,
                padding: '1px 3px', textAlign: 'center', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isSpell ? '✦' : `${card.atk}/${card.hp}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function navBtnStyle(disabled) {
  return {
    background: 'transparent',
    color: disabled ? '#374151' : '#9ca3af',
    fontFamily: 'var(--font-sans)',
    fontSize: '16px',
    border: `1px solid ${disabled ? '#1f2937' : '#374151'}`,
    borderRadius: '4px',
    padding: '4px 10px',
    cursor: disabled ? 'default' : 'pointer',
    lineHeight: 1,
  };
}
