import { useState } from 'react';
import { getCardImageUrl } from '../supabase.js';
import { renderRules } from '../utils/rulesText.jsx';

// ── Shared Veil Seer modal components ────────────────────────────────────────

/**
 * The three-choice modal: Top of Deck / Opponent's Hand / Hidden Piece.
 * Shown when state.pendingVeilSeerChoice is set for the current player.
 *
 * Props:
 *   state         — current game state
 *   playerIndex   — the local player's index (determines visibility)
 *   isActiveTurn  — only show when it's this player's turn
 *   onChoiceDeck        — () => void
 *   onChoiceHand        — () => void
 *   onChoiceHiddenPiece — () => void  (null if no hidden enemies exist)
 */
export function VeilSeerChoiceModal({ state, playerIndex, isActiveTurn, onChoiceDeck, onChoiceHand, onChoiceHiddenPiece }) {
  const pending = state?.pendingVeilSeerChoice;
  if (!pending || pending.playerIndex !== playerIndex || !isActiveTurn) return null;
  // Already in select_hidden step — choice was made, waiting for target click
  if (pending.step === 'select_hidden') return null;

  const hasHiddenEnemies = state.units.some(u => u.owner !== playerIndex && u.hidden);

  const btnBase = {
    fontFamily: "'Cinzel', serif",
    fontSize: '12px',
    borderRadius: '5px',
    padding: '8px 16px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    minWidth: '120px',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)' }}
    >
      <div style={{
        background: 'linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 100%)',
        border: '1px solid #3a3a60',
        borderRadius: '10px',
        padding: '22px 26px',
        maxWidth: '340px',
        width: '90vw',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
      }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '13px',
          color: '#C9A84C',
          fontVariant: 'small-caps',
          letterSpacing: '0.08em',
          marginBottom: '6px',
          textAlign: 'center',
        }}>
          Veil Seer
        </div>
        <div style={{ fontSize: '11px', color: '#8080a0', textAlign: 'center', marginBottom: '18px', lineHeight: 1.4 }}>
          Choose what to reveal:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onChoiceDeck}
            style={{ ...btnBase, background: '#1a1a2e', border: '1px solid #4a4a7a', color: '#a0d0ff' }}
          >
            Top of Deck
          </button>
          <button
            onClick={onChoiceHand}
            style={{ ...btnBase, background: '#1a1a2e', border: '1px solid #4a4a7a', color: '#a0d0ff' }}
          >
            Opponent&apos;s Hand
          </button>
          {hasHiddenEnemies && (
            <button
              onClick={onChoiceHiddenPiece}
              style={{ ...btnBase, background: '#1a2030', border: '1px solid #06b6d4', color: '#06b6d4' }}
            >
              Hidden Piece
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A card tile using the mulligan-screen card view style.
 */
function CardTile({ card }) {
  const imageUrl = getCardImageUrl(card.image);
  return (
    <div style={{
      width: '110px',
      minHeight: '145px',
      background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
      border: '1px solid #3a3a60',
      borderRadius: '6px',
      overflow: 'hidden',
      userSelect: 'none',
      flexShrink: 0,
    }}>
      {imageUrl ? (
        <img src={imageUrl} alt={card.name} style={{ width: '100%', height: '88px', objectFit: 'cover', display: 'block' }} />
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
}

const REVEAL_LABELS = {
  deck: 'Veil Seer — Top of Your Deck',
  hand: "Veil Seer — Opponent's Hand",
  hidden: 'Veil Seer — Hidden Piece',
};

/**
 * The reveal info modal: shown after the player makes a choice.
 * Has minimize/maximize and auto-dismisses at end of turn (state clears pendingVeilSeerReveal).
 *
 * Props:
 *   state        — current game state
 *   playerIndex  — the local player's index (determines visibility)
 *   onDismiss    — () => void  called when player clicks Close
 */
export function VeilSeerRevealModal({ state, playerIndex, onDismiss }) {
  const [minimized, setMinimized] = useState(false);
  const reveal = state?.pendingVeilSeerReveal;

  if (!reveal || reveal.playerIndex !== playerIndex) return null;

  const label = REVEAL_LABELS[reveal.type] ?? 'Veil Seer';
  const cards = reveal.cards ?? [];

  if (minimized) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '70px',
          right: '12px',
          zIndex: 60,
          background: 'linear-gradient(135deg, #0d0d1a, #1a1a2e)',
          border: '1px solid #C9A84C80',
          borderRadius: '6px',
          padding: '6px 12px',
          cursor: 'pointer',
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          color: '#C9A84C',
          boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        onClick={() => setMinimized(false)}
      >
        <span>👁</span> Veil Seer
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.80)', pointerEvents: 'auto' }}
    >
      <div style={{
        background: 'linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 100%)',
        border: '1px solid #3a3a60',
        borderRadius: '10px',
        padding: '20px 24px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '13px',
            color: '#C9A84C',
            fontVariant: 'small-caps',
            letterSpacing: '0.08em',
          }}>
            {label}
          </div>
          <button
            onClick={() => setMinimized(true)}
            title="Minimize"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8080a0',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
              padding: '2px 6px',
            }}
          >—</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
          {cards.length === 0 && (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#8080a0' }}>
              {reveal.type === 'deck' ? 'Deck is empty.' : 'Hand is empty.'}
            </div>
          )}
          {cards.map((card, i) => (
            <CardTile key={card.uid ?? i} card={card} />
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={onDismiss}
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              color: '#C9A84C',
              background: 'transparent',
              border: '1px solid #C9A84C',
              borderRadius: '4px',
              padding: '6px 18px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
