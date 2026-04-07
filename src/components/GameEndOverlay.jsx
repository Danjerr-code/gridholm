import { useState } from 'react';

/**
 * GameEndOverlay — minimizable win/loss popup.
 *
 * Props:
 *   isWinner  {boolean}   — true if the local player won
 *   children              — action buttons rendered inside the full overlay
 */
export default function GameEndOverlay({ isWinner, children }) {
  const [minimized, setMinimized] = useState(false);

  const resultLabel = isWinner ? 'You Win' : 'You Lose';
  const resultColor = isWinner ? '#C9A84C' : '#8a8aaa';

  if (minimized) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '10px 20px',
          background: 'linear-gradient(90deg, #0d0d1a 0%, #141420 100%)',
          borderTop: '1px solid #C9A84C',
          boxShadow: '0 -4px 20px #C9A84C20',
        }}
      >
        <span
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '14px',
            fontWeight: 700,
            color: resultColor,
            letterSpacing: '0.05em',
          }}
        >
          {resultLabel}
        </span>
        <button
          onClick={() => setMinimized(false)}
          style={{
            background: 'transparent',
            color: '#6a6a8a',
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            fontWeight: 600,
            border: '1px solid #2a2a3a',
            borderRadius: '4px',
            padding: '4px 12px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          ▲ Expand
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.85)' }}
    >
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
          border: '1px solid #C9A84C',
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center',
          boxShadow: '0 0 40px #C9A84C20',
          minWidth: '240px',
        }}
      >
        {/* Minimize button */}
        <button
          onClick={() => setMinimized(true)}
          title="Minimize"
          style={{
            position: 'absolute',
            top: '10px',
            right: '12px',
            background: 'transparent',
            border: 'none',
            color: '#6a6a8a',
            fontSize: '18px',
            lineHeight: 1,
            cursor: 'pointer',
            padding: '2px 4px',
          }}
        >
          ▾
        </button>

        <div className="text-4xl mb-4">⚔️</div>
        <h2
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '24px',
            fontWeight: 700,
            color: resultColor,
            marginBottom: '8px',
          }}
        >
          {resultLabel}
        </h2>
        <p
          style={{
            fontFamily: "'Crimson Text', serif",
            fontSize: '16px',
            color: '#8a8aaa',
            marginBottom: '24px',
          }}
        >
          The champion has fallen.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
