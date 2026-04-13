import { createPortal } from 'react-dom';
import Card from './Card.jsx';
import { getEffectiveCost } from '../engine/gameEngine.js';

export default function GraveViewerModal({ cards, title, onClose, canPlayFromGrave, onPlayCard, gameState, playerIndex, resources }) {
  const nonTokenCards = (cards || []).filter(c => !c.token && !c.isToken);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="no-scrollbar"
        style={{
          background: '#0f0f1e',
          border: '1px solid #3a3a60',
          borderRadius: '10px',
          padding: '20px',
          maxWidth: '600px',
          width: '90vw',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em' }}>
            {title}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#6a6a8a', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 2px' }}
          >✕</button>
        </div>
        {nonTokenCards.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            {nonTokenCards.map(card => {
              const effectiveCost = gameState ? getEffectiveCost(card, gameState, playerIndex) : card.cost;
              const isPlayable = !!(canPlayFromGrave && resources >= effectiveCost);
              return (
                <div
                  key={card.uid}
                  style={{ cursor: isPlayable ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (isPlayable && onPlayCard) {
                      onPlayCard(card.uid);
                      onClose();
                    }
                  }}
                >
                  <Card card={card} effectiveCost={effectiveCost} isPlayable={isPlayable} isSelected={false} />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#6a6a8a', fontSize: '12px', padding: '20px 0' }}>
            Grave is empty.
          </div>
        )}
        {canPlayFromGrave && nonTokenCards.length > 0 && (
          <div style={{ textAlign: 'center', fontSize: '10px', color: '#7a5aaa', marginTop: '10px', fontFamily: 'var(--font-sans)' }}>
            Fate's Ledger — click a card to play it from grave
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
