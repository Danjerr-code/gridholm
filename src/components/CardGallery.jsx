import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CARD_DB, DECKS } from '../engine/cards.js';
import Card from './Card.jsx';
import { getCardImageUrl } from '../supabase.js';


const FACTIONS = [
  { name: 'Light',   unitType: 'Human', color: '#4a8abf' },
  { name: 'Primal',  unitType: 'Beast', color: '#4a8a4a' },
  { name: 'Mystic',  unitType: 'Elf',   color: '#8a4abf' },
  { name: 'Dark',    unitType: 'Demon', color: '#bf2a2a' },
];

function getGroupedCards() {
  const all = Object.values(CARD_DB);
  return FACTIONS.map(faction => {
    const deckKey = faction.unitType.toLowerCase();
    const deckCards = DECKS[deckKey]?.cards ?? [];
    const copyCount = {};
    for (const id of deckCards) {
      copyCount[id] = (copyCount[id] || 0) + 1;
    }
    const deckCardIds = new Set(deckCards);
    const cards = all.filter(c => deckCardIds.has(c.id));
    const units = cards.filter(c => c.type === 'unit').sort((a, b) => a.cost - b.cost);
    const spells = cards.filter(c => c.type === 'spell').sort((a, b) => a.cost - b.cost);
    return { ...faction, units, spells, copyCount };
  });
}

function CardModal({ card, onClose }) {
  const imageUrl = getCardImageUrl(card.image);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#08080f',
          border: '1px solid #C9A84C40',
          borderTop: '1px solid #C9A84C60',
          borderRadius: '12px',
          padding: '20px',
          width: '280px',
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>Card Detail</div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#6a6a8a', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
          >×</button>
        </div>

        {/* Art */}
        <div style={{ height: '160px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }} data-art-slot="true">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={card.name}
              onError={e => { e.target.style.display = 'none'; }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)',
              fontSize: '13px', fontFamily: "'Cinzel', serif", fontWeight: 500,
            }}>
              {card.type === 'spell' ? 'Spell' : (Array.isArray(card.unitType) ? card.unitType.join(' · ') : (card.unitType || 'Unit'))}
            </div>
          )}
        </div>

        {/* Name + Cost */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '17px', fontWeight: 700, color: card.legendary ? '#C9A84C' : '#ffffff', lineHeight: 1.2 }}>
            {card.legendary && <span style={{ color: '#C9A84C', marginRight: '4px' }}>♛</span>}
            {card.name}
          </span>
          <span style={{
            background: '#C9A84C',
            color: '#0a0a0f',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            fontWeight: 700,
            padding: '1px 8px',
            borderRadius: '99px',
            flexShrink: 0,
            marginLeft: '8px',
          }}>{card.cost}</span>
        </div>

        {/* Type / Attribute */}
        {card.type !== 'spell' && (
          <div>
            {card.attribute && (
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 500, color: '#9090b8', textTransform: 'capitalize' }}>
                {card.attribute}
              </div>
            )}
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#9CA3AF' }}>
              {Array.isArray(card.unitType) ? card.unitType.join(' · ') : card.unitType}
            </div>
          </div>
        )}

        {/* Stats */}
        {card.type === 'unit' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>{card.atk}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>{card.hp}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>{card.spd}</div>
            </div>
          </div>
        )}

        {/* Keyword badges */}
        {card.aura && (
          <div>
            <span style={{ fontSize: '10px', background: '#134e4a', color: '#5eead4', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
              Aura {card.aura.range}
            </span>
          </div>
        )}

        {/* Rules text */}
        {card.rules && (
          <div style={{
            fontFamily: 'var(--font-sans)',
            fontStyle: 'normal',
            fontSize: '13px',
            fontWeight: 400,
            color: '#e2e8f0',
            lineHeight: 1.6,
            marginTop: '4px',
            borderTop: '0.5px solid #1e1e2e',
            paddingTop: '8px',
          }}>
            {card.rules}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function CardGallery() {
  const groups = getGroupedCards();
  const [selectedCard, setSelectedCard] = useState(null);

  const handleClose = useCallback(() => setSelectedCard(null), []);

  useEffect(() => {
    if (!selectedCard) return;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCard, handleClose]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e5e7eb', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        background: 'rgba(10,10,15,0.95)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        padding: '12px 24px',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <button
          onClick={() => { window.location.hash = '/'; }}
          style={{
            background: 'none',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            color: '#9ca3af',
            fontSize: '13px',
            padding: '6px 12px',
            cursor: 'pointer',
          }}
          onMouseEnter={e => e.target.style.color = '#fff'}
          onMouseLeave={e => e.target.style.color = '#9ca3af'}
        >
          ← Back to Gridholm
        </button>
        <span style={{ fontFamily: "'Cinzel', serif", color: '#C9A84C', fontWeight: 600, fontSize: '14px', letterSpacing: '0.12em' }}>
          CARD GALLERY
        </span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
        {groups.map(faction => (
          <div key={faction.unitType} style={{ marginBottom: 56 }}>
            {/* Faction header */}
            <h2 style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 20,
              fontWeight: 600,
              color: faction.color,
              margin: '0 0 24px 0',
              letterSpacing: '0.06em',
              borderBottom: `0.5px solid ${faction.color}40`,
              paddingBottom: 10,
            }}>
              {faction.name}
            </h2>

            {/* Units */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6b7280',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}>
                Units
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {faction.units.map(card => (
                  <div key={card.id} style={{ position: 'relative' }}>
                    <Card card={card} isSelected={false} isPlayable={true} onClick={() => setSelectedCard(card)} />
                    <span style={{
                      position: 'absolute',
                      bottom: 4,
                      right: 4,
                      background: 'rgba(0,0,0,0.72)',
                      color: '#C9A84C',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-sans)',
                      pointerEvents: 'none',
                      letterSpacing: '0.03em',
                    }}>
                      {faction.copyCount[card.id] === 2 ? 'x2' : 'x1'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Spells */}
            {faction.spells.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6b7280',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}>
                  Spells
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {faction.spells.map(card => (
                    <div key={card.id} style={{ position: 'relative' }}>
                      <Card card={card} isSelected={false} isPlayable={true} onClick={() => setSelectedCard(card)} />
                      <span style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 4,
                        background: 'rgba(0,0,0,0.72)',
                        color: '#C9A84C',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 4,
                        fontFamily: 'var(--font-sans)',
                        pointerEvents: 'none',
                        letterSpacing: '0.03em',
                      }}>
                        {faction.copyCount[card.id] === 2 ? 'x2' : 'x1'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedCard && <CardModal card={selectedCard} onClose={handleClose} />}
    </div>
  );
}
