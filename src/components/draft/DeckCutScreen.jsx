import { useState } from 'react';
import { CARD_DB } from '../../engine/cards.js';
import { ATTRIBUTES } from '../../engine/attributes.js';

const screen = {
  minHeight: '100vh',
  background: '#0a0a0f',
  color: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '16px',
  overflowY: 'auto',
};

const heading = {
  fontFamily: "'Cinzel', serif",
  color: '#C9A84C',
  letterSpacing: '0.15em',
};

/**
 * Show the 31-card deck after a legendary reward. Player taps one card to remove.
 *
 * Props:
 *   deck         - array of 31 card IDs (existing 30 + 1 new legendary)
 *   newCardId    - the ID of the newly added legendary
 *   legendaryIds - all current legendary IDs (pre-update)
 *   onCutComplete({ deck, legendaryIds }) - called with updated deck (30 cards)
 */
export default function DeckCutScreen({ deck, newCardId, legendaryIds, onCutComplete }) {
  const [confirmId, setConfirmId] = useState(null);

  const sortedDeck = getSortedDeck(deck);

  function handleCardTap(cardId) {
    setConfirmId(prev => prev === cardId ? null : cardId);
  }

  function handleConfirmCut(cardId) {
    const newDeck = removeFirst(deck, cardId);
    const newLegIds = [...legendaryIds, newCardId];
    onCutComplete({ deck: newDeck, legendaryIds: newLegIds });
  }

  return (
    <div style={screen}>
      <div style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 32 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ ...heading, fontSize: 22, marginBottom: 4 }}>CUT YOUR DECK</h2>
          <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14 }}>
            Your deck has {deck.length} cards. Remove 1 to return to 30.
          </p>
        </div>

        <CardTypeCounter ids={deck} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #1a1a2a', borderRadius: 4, padding: '4px 8px' }}>
          {sortedDeck.map((card, i) => {
            const isNew = card.id === newCardId;
            const isConfirming = confirmId === card.id;
            return (
              <div key={`${card.id}-${i}`}>
                <DeckCutRow
                  card={card}
                  isNew={isNew}
                  isConfirming={isConfirming}
                  onTap={() => handleCardTap(card.id)}
                />
                {isConfirming && (
                  <ConfirmBanner
                    cardName={card.name}
                    onConfirm={() => handleConfirmCut(card.id)}
                    onCancel={() => setConfirmId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DeckCutRow({ card, isNew, isConfirming, onTap }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 4px',
        borderBottom: '1px solid #1a1a2a',
        cursor: 'pointer',
        background: isConfirming ? '#1a0a0a' : isNew ? '#0d1a0d' : 'transparent',
        borderLeft: isNew ? '3px solid #4ade80' : isConfirming ? '3px solid #f87171' : '3px solid transparent',
        transition: 'background 100ms ease',
      }}
    >
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C9A84C', minWidth: 18, textAlign: 'right' }}>{card.cost}</span>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: isNew ? '#4ade80' : '#e8e8f0', flex: 1 }}>
        {card.legendary && <span style={{ color: '#C9A84C', marginRight: 3 }}>♛</span>}
        {card.name}
        {isNew && <span style={{ fontSize: 9, color: '#4ade80', marginLeft: 6, fontFamily: "'Crimson Text', serif", fontStyle: 'italic' }}>NEW</span>}
      </span>
      <span style={{ fontSize: 9, color: attrColor, fontFamily: "'Cinzel', serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {card.type}
      </span>
      <span style={{ fontSize: 11, color: '#6a6a8a', marginLeft: 4 }}>✕</span>
    </div>
  );
}

function ConfirmBanner({ cardName, onConfirm, onCancel }) {
  return (
    <div style={{
      background: '#1a0808',
      border: '1px solid #f8717160',
      borderRadius: 4,
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      margin: '2px 0',
    }}>
      <span style={{ fontFamily: "'Crimson Text', serif", fontSize: 13, color: '#f87171', flex: 1, fontStyle: 'italic' }}>
        Remove {cardName}?
      </span>
      <button
        onClick={onConfirm}
        style={{
          background: '#f87171',
          color: '#0a0a0f',
          fontFamily: "'Cinzel', serif",
          fontSize: 11,
          fontWeight: 600,
          border: 'none',
          borderRadius: 3,
          padding: '4px 10px',
          cursor: 'pointer',
        }}
      >
        Remove
      </button>
      <button
        onClick={onCancel}
        style={{
          background: 'transparent',
          color: '#6a6a8a',
          fontFamily: "'Cinzel', serif",
          fontSize: 11,
          border: '1px solid #2a2a3a',
          borderRadius: 3,
          padding: '4px 10px',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

function getTypeCounts(ids) {
  let units = 0, spells = 0, relics = 0, omens = 0;
  for (const id of ids) {
    const card = CARD_DB[id];
    if (!card) continue;
    if (card.isRelic || card.type === 'relic') relics++;
    else if (card.isOmen || card.type === 'omen') omens++;
    else if (card.type === 'spell') spells++;
    else if (card.type === 'unit') units++;
  }
  return { units, spells, relics, omens };
}

function CardTypeCounter({ ids }) {
  const { units, spells, relics, omens } = getTypeCounts(ids);
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#a0a0c0', letterSpacing: '0.06em' }}>
        Units: <span style={{ color: '#e8e8f0' }}>{units}</span>
      </span>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#a0a0c0', letterSpacing: '0.06em' }}>
        Spells: <span style={{ color: '#e8e8f0' }}>{spells}</span>
      </span>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#a0a0c0', letterSpacing: '0.06em' }}>
        Relics: <span style={{ color: '#e8e8f0' }}>{relics}</span>
      </span>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#a0a0c0', letterSpacing: '0.06em' }}>
        Omens: <span style={{ color: '#e8e8f0' }}>{omens}</span>
      </span>
    </div>
  );
}

// ── Utility ───────────────────────���──────────────────────────────────────────

function getSortedDeck(ids) {
  return ids
    .map(id => CARD_DB[id])
    .filter(Boolean)
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
}

/** Remove first occurrence of `id` from an array of IDs. */
function removeFirst(ids, id) {
  const idx = ids.indexOf(id);
  if (idx === -1) return ids;
  return [...ids.slice(0, idx), ...ids.slice(idx + 1)];
}
