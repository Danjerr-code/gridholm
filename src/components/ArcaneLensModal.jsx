import { useState } from 'react';
import { getCardImageUrl } from '../supabase.js';
import { renderRules } from '../utils/rulesText.jsx';

// ── ArcaneLensModal ────────────────────────────────────────────────────────────
// Modal for the Arcane Lens unit action: shows top 3 deck cards, player clicks
// one to highlight it, then confirms with "Put On Top".
//
// Supports minimize: collapses to a floating tab so the player can view the board.
// While unminimized the full-screen backdrop blocks all game interaction.
//
// Props:
//   cards     — array of up to 3 card objects (top of deck)
//   onConfirm — (cardUid: string) => void  called when player confirms selection

export default function ArcaneLensModal({ cards, onConfirm }) {
  const [selectedUid, setSelectedUid] = useState(null);
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          background: '#0f0f1e',
          border: '1px solid #C9A84C80',
          borderRadius: '6px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 2px 14px rgba(0,0,0,0.7)',
        }}
      >
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          color: '#C9A84C',
          fontVariant: 'small-caps',
          letterSpacing: '0.06em',
        }}>
          Arcane Lens
        </span>
        {selectedUid && (
          <span style={{ fontSize: '10px', color: '#7070a0' }}>· card selected</span>
        )}
        <button
          onClick={() => setMinimized(false)}
          title="Expand"
          style={{
            background: 'none',
            border: '1px solid #3a3a60',
            borderRadius: '3px',
            color: '#C9A84C',
            cursor: 'pointer',
            fontSize: '10px',
            padding: '1px 6px',
            lineHeight: 1.4,
            fontFamily: 'var(--font-sans)',
          }}
        >
          ▲
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.78)' }}
    >
      <div style={{
        background: 'linear-gradient(180deg, #0c0c1e 0%, #0f0f1a 100%)',
        border: '1px solid #C9A84C50',
        borderRadius: '10px',
        padding: '20px',
        maxWidth: '520px',
        width: '90vw',
        boxShadow: '0 8px 40px rgba(0,0,0,0.85)',
      }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              color: '#C9A84C',
              fontVariant: 'small-caps',
              letterSpacing: '0.08em',
            }}>
              Arcane Lens
            </div>
            <div style={{ fontSize: '10px', color: '#7070a0', marginTop: '2px' }}>
              Click a card to select it, then confirm.
            </div>
          </div>
          <button
            onClick={() => setMinimized(true)}
            title="Minimize — view board"
            style={{
              background: 'none',
              border: '1px solid #3a3a60',
              borderRadius: '4px',
              color: '#7070a0',
              cursor: 'pointer',
              fontSize: '10px',
              padding: '3px 8px',
              lineHeight: 1.4,
              fontFamily: 'var(--font-sans)',
              flexShrink: 0,
            }}
          >
            ▼ View Board
          </button>
        </div>

        {/* Card grid */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
          {cards.map(card => {
            const imageUrl = getCardImageUrl(card.image);
            const isSelected = card.uid === selectedUid;
            return (
              <div
                key={card.uid}
                onClick={() => setSelectedUid(card.uid)}
                style={{
                  position: 'relative',
                  width: '110px',
                  minHeight: '145px',
                  background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                  border: isSelected ? '2px solid #C9A84C' : '1px solid #3a3a60',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  overflow: 'hidden',
                  userSelect: 'none',
                  boxShadow: isSelected ? '0 0 14px rgba(201,168,76,0.45)' : 'none',
                }}
              >
                {/* Selected highlight overlay */}
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(201,168,76,0.12)',
                    zIndex: 1,
                    pointerEvents: 'none',
                    borderRadius: '4px',
                  }} />
                )}

                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={card.name}
                    style={{ width: '100%', height: '88px', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ height: '40px', background: '#1a1a30' }} />
                )}

                <div style={{ padding: '4px 5px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#e8e8f0', lineHeight: 1.2, marginBottom: '2px' }}>
                    {card.name}
                  </div>
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

        {/* Confirm button */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => { if (selectedUid) onConfirm(selectedUid); }}
            disabled={!selectedUid}
            style={{
              background: selectedUid
                ? 'linear-gradient(135deg, #8a6a00, #C9A84C)'
                : '#1a1a2e',
              border: selectedUid ? 'none' : '1px solid #3a3a60',
              borderRadius: '5px',
              color: selectedUid ? '#0a0a0f' : '#4a4a6a',
              fontSize: '11px',
              fontWeight: selectedUid ? 700 : 400,
              padding: '8px 28px',
              cursor: selectedUid ? 'pointer' : 'default',
              fontFamily: "'Cinzel', serif",
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            Put On Top
          </button>
        </div>

      </div>
    </div>
  );
}
