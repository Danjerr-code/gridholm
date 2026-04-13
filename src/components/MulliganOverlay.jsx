import { useState, useEffect } from 'react';
import { renderRules } from '../utils/rulesText.jsx';
import { getCardImageUrl } from '../supabase.js';

// ── MulliganOverlay ────────────────────────────────────────────────────────────
// Full-screen overlay shown during the mulligan phase.
//
// Props:
//   hand           — array of card objects (the local player's opening hand)
//   deadline       — ms timestamp when mulligan auto-submits
//   onConfirm      — (cardIndices: number[]) => void  called when player submits
//   waitingFor     — 'opponent' | null  (multiplayer only: show waiting state)
//   opponentCount  — number | null  cards opponent mulliganed (shown briefly after both submit)

export default function MulliganOverlay({ hand, deadline, onConfirm, waitingFor = null, opponentCount = null }) {
  const [selected, setSelected] = useState(new Set()); // hand indices toggled for replacement
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  // Countdown timer
  useEffect(() => {
    if (!deadline) return;

    const tick = () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !submitted) {
        // Auto-submit keep-all on timeout
        setSubmitted(true);
        onConfirm([]);
      }
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [deadline, submitted, onConfirm]);

  function toggle(idx) {
    if (submitted) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleConfirm() {
    if (submitted) return;
    setSubmitted(true);
    onConfirm([...selected]);
  }

  function handleKeepAll() {
    if (submitted) return;
    setSubmitted(true);
    onConfirm([]);
  }

  const timerColor = timeLeft !== null && timeLeft <= 5 ? '#ef4444' : '#C9A84C';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.88)' }}
    >
      <div style={{
        background: 'linear-gradient(180deg, #0c0c1e 0%, #0f0f1a 100%)',
        border: '1px solid #C9A84C50',
        borderRadius: '10px',
        padding: '24px 20px',
        width: '90vw',
        maxWidth: '560px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '15px',
            color: '#C9A84C',
            fontVariant: 'small-caps',
            letterSpacing: '0.1em',
            marginBottom: '4px',
          }}>
            Opening Mulligan
          </div>
          <div style={{ fontSize: '11px', color: '#7070a0', lineHeight: 1.4 }}>
            Tap cards to replace them. Replaced cards go to the bottom of your deck.
          </div>

          {/* Timer */}
          {timeLeft !== null && !submitted && (
            <div style={{ fontSize: '11px', color: timerColor, marginTop: '6px', fontVariant: 'tabular-nums' }}>
              Auto-keep in {timeLeft}s
            </div>
          )}
        </div>

        {/* Hand */}
        {!submitted && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
            {hand.map((card, idx) => {
              const isReplacing = selected.has(idx);
              const imageUrl = getCardImageUrl(card.image);
              return (
                <div
                  key={card.uid ?? idx}
                  onClick={() => toggle(idx)}
                  style={{
                    position: 'relative',
                    width: '88px',
                    minHeight: '120px',
                    background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                    border: isReplacing ? '2px solid #ef4444' : '1px solid #3a3a60',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    opacity: isReplacing ? 0.5 : 1,
                    transition: 'all 0.15s',
                    overflow: 'hidden',
                    userSelect: 'none',
                  }}
                >
                  {/* Replace indicator */}
                  {isReplacing && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2,
                      pointerEvents: 'none',
                    }}>
                      <div style={{
                        background: 'rgba(239,68,68,0.85)',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        color: '#fff',
                        fontWeight: 700,
                      }}>↓</div>
                    </div>
                  )}

                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={card.name}
                      style={{ width: '100%', height: '70px', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ height: '40px', background: '#1a1a30' }} />
                  )}

                  <div style={{ padding: '4px 5px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: '#e8e8f0', lineHeight: 1.2, marginBottom: '2px' }}>{card.name}</div>
                    <div style={{ fontSize: '9px', color: '#C9A84C' }}>Cost {card.cost}</div>
                    {card.type === 'unit' && (
                      <div style={{ fontSize: '9px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>
                    )}
                    {card.rules && (
                      <div style={{ fontSize: '8px', color: '#6060a0', marginTop: '2px', lineHeight: 1.2 }}>
                        {renderRules(card.rules)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Submitted: waiting state */}
        {submitted && waitingFor === 'opponent' && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#8080a0', fontSize: '12px' }}>
            Waiting for opponent…
          </div>
        )}

        {/* Submitted: result */}
        {submitted && opponentCount !== null && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ color: '#C9A84C', fontSize: '13px', marginBottom: '4px' }}>Mulligan complete!</div>
            <div style={{ color: '#8080a0', fontSize: '11px' }}>
              Opponent replaced {opponentCount} card{opponentCount !== 1 ? 's' : ''}.
            </div>
          </div>
        )}

        {/* Buttons */}
        {!submitted && (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={handleKeepAll}
              style={{
                background: '#1a1a2e',
                border: '1px solid #3a3a60',
                borderRadius: '5px',
                color: '#a0a0d0',
                fontSize: '11px',
                padding: '8px 20px',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Keep All
            </button>
            <button
              onClick={handleConfirm}
              style={{
                background: selected.size > 0
                  ? 'linear-gradient(135deg, #8a1a1a, #c0302e)'
                  : 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                border: 'none',
                borderRadius: '5px',
                color: '#0a0a0f',
                fontSize: '11px',
                fontWeight: 700,
                padding: '8px 24px',
                cursor: 'pointer',
                fontFamily: "'Cinzel', serif",
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {selected.size > 0 ? `Replace ${selected.size}` : 'Confirm'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
