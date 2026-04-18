import { useState, useMemo, useCallback } from 'react';
import MatchReviewBoard from './MatchReviewBoard.jsx';
import CardDetailModal from './CardDetailModal.jsx';
import { getCardImageUrl } from '../supabase.js';
import { findInflectionPoints } from '../engine/matchReview.js';

/**
 * MatchReview — post-game match review screen.
 *
 * Props:
 *   stateHistory  {Array}    — array of game state snapshots (one per turn end)
 *   onBack        {Function} — called when player clicks "Back"
 */
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

  function stepBack() {
    setCurrentIndex(i => Math.max(0, i - 1));
  }

  function stepForward() {
    setCurrentIndex(i => Math.min(totalTurns - 1, i + 1));
  }

  function jumpToInflection(point) {
    setCurrentIndex(Math.min(point.stateIndex, totalTurns - 1));
  }

  const activeInflectionIndex = inflectionPoints.findIndex(
    p => p.stateIndex === currentIndex
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        padding: '16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          width: '100%',
          maxWidth: '500px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            color: '#9ca3af',
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            fontWeight: 600,
            border: '1px solid #2a2a3a',
            borderRadius: '4px',
            padding: '6px 14px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          ← Back
        </button>
        <h2
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '16px',
            fontWeight: 700,
            color: '#C9A84C',
            margin: 0,
            letterSpacing: '0.06em',
          }}
        >
          Match Review
        </h2>
        <div style={{ width: '70px' }} />
      </div>

      {/* Turn navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <button
          onClick={stepBack}
          disabled={currentIndex === 0}
          style={navBtnStyle(currentIndex === 0)}
        >
          ◀
        </button>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: '#e8e8f0',
            minWidth: '80px',
            textAlign: 'center',
          }}
        >
          Turn {currentState?.turn ?? currentIndex + 1}
          <span style={{ color: '#6b7280', fontSize: '11px' }}>
            {' '}/ {stateHistory[totalTurns - 1]?.turn ?? totalTurns}
          </span>
        </span>
        <button
          onClick={stepForward}
          disabled={currentIndex === totalTurns - 1}
          style={navBtnStyle(currentIndex === totalTurns - 1)}
        >
          ▶
        </button>
      </div>

      {/* Turn slider */}
      <input
        type="range"
        min={0}
        max={totalTurns - 1}
        value={currentIndex}
        onChange={e => setCurrentIndex(Number(e.target.value))}
        style={{
          width: '100%',
          maxWidth: '440px',
          marginBottom: '12px',
          accentColor: '#C9A84C',
        }}
      />

      {/* Board */}
      <div style={{ width: '100%', maxWidth: '440px', marginBottom: '16px' }}>
        <MatchReviewBoard
          gameState={currentState}
          onUnitClick={handleUnitClick}
          onChampionClick={handleChampionClick}
        />
      </div>

      {/* Hand state */}
      {(currentState?.players?.[0]?.hand?.length > 0 || currentState?.players?.[1]?.hand?.length > 0) && (
        <div style={{ width: '100%', maxWidth: '440px', marginBottom: '16px' }}>
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
              {showOpponentHand ? 'Hide P2 hand' : 'Show P2 hand'}
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

      {/* Inflection point cards */}
      {inflectionPoints.length > 0 && (
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              color: '#6b7280',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            Key Moments
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {inflectionPoints.map((point, idx) => {
              const favorsP1 = point.delta > 0;
              const isActive = idx === activeInflectionIndex;
              return (
                <button
                  key={idx}
                  onClick={() => jumpToInflection(point)}
                  style={{
                    background: isActive
                      ? favorsP1
                        ? 'rgba(34,197,94,0.18)'
                        : 'rgba(239,68,68,0.18)'
                      : favorsP1
                        ? 'rgba(34,197,94,0.06)'
                        : 'rgba(239,68,68,0.06)',
                    border: isActive
                      ? `1px solid ${favorsP1 ? '#22c55e' : '#ef4444'}80`
                      : `1px solid ${favorsP1 ? '#22c55e' : '#ef4444'}30`,
                    borderRadius: '6px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: favorsP1 ? '#4ade80' : '#f87171',
                      minWidth: '28px',
                      textAlign: 'center',
                    }}
                  >
                    {favorsP1 ? '+' : ''}{point.delta}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      color: '#d1d5db',
                      lineHeight: 1.4,
                    }}
                  >
                    {point.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {inflectionPoints.length === 0 && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: '#4b5563',
            marginTop: '8px',
            fontStyle: 'italic',
          }}
        >
          No major turning points detected.
        </div>
      )}

      {inspectedItem && (
        <CardDetailModal
          inspectedItem={inspectedItem}
          gameState={currentState}
          onClose={() => setInspectedItem(null)}
        />
      )}
    </div>
  );
}

function ReviewHandStrip({ hand, label, labelColor, onCardClick }) {
  if (!hand || hand.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: labelColor, minWidth: '20px' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#4b5563', fontStyle: 'italic' }}>empty hand</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '8px' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: labelColor, minWidth: '20px', paddingTop: '4px' }}>{label}</span>
      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }} className="no-scrollbar">
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
              {/* Cost badge */}
              <div style={{ position: 'absolute', top: '2px', right: '2px', background: '#C9A84C',
                color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: '8px', fontWeight: 700,
                padding: '0 3px', borderRadius: '99px', lineHeight: 1.6 }}>
                {card.cost}
              </div>
              {/* Type pill */}
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
