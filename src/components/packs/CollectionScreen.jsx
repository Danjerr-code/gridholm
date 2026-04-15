import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CARD_DB } from '../../engine/cards.js';
import { getCollection } from '../../packs/collection.js';
import { getCardImageUrl } from '../../supabase.js';
import { renderRules } from '../../utils/rulesText.jsx';
import { AutoSizeText } from '../AutoSizeText.jsx';

const FACTION_ORDER = ['light', 'primal', 'mystic', 'dark'];
const FACTION_COLORS = {
  light: '#F0E6D2',
  primal: '#22C55E',
  mystic: '#A855F7',
  dark: '#EF4444',
  neutral: '#9CA3AF',
};
const FACTION_LABELS = {
  light: 'Light',
  primal: 'Primal',
  mystic: 'Mystic',
  dark: 'Dark',
  neutral: 'Neutral',
};
const RARITY_COLORS = { common: '#9CA3AF', rare: '#818CF8', legendary: '#F59E0B' };

function getAllCards() {
  return Object.values(CARD_DB).filter(c => !c.token);
}

function groupByFaction(cards) {
  const groups = {};
  for (const faction of [...FACTION_ORDER, 'neutral']) {
    groups[faction] = [];
  }
  for (const card of cards) {
    const f = card.attribute || 'neutral';
    if (groups[f]) groups[f].push(card);
    else groups['neutral'].push(card);
  }
  // Sort within each faction: by cost, then name
  for (const f of Object.keys(groups)) {
    groups[f].sort((a, b) => {
      const costDiff = (a.cost ?? 0) - (b.cost ?? 0);
      if (costDiff !== 0) return costDiff;
      return a.name.localeCompare(b.name);
    });
  }
  return groups;
}

const TYPE_LABEL = {
  unit: 'U',
  spell: 'S',
  relic: 'R',
  omen: 'O',
  terrain: 'T',
};

function CardModal({ card, onClose }) {
  const imageUrl = getCardImageUrl(card.image);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        <div style={{ height: '160px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
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
              {TYPE_LABEL[card.type] || 'U'}
            </div>
          )}
        </div>

        {/* Name + Cost */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <AutoSizeText maxFontSize={17} style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, color: card.legendary ? '#C9A84C' : '#ffffff', lineHeight: 1.2 }}>
            {card.legendary && <span style={{ color: '#C9A84C', marginRight: '4px' }}>♛</span>}
            {card.name}
          </AutoSizeText>
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
          }}>{card.cost ?? 0}</span>
        </div>

        {/* Type badge */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{
            fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-sans)',
            background: 'rgba(255,255,255,0.07)', color: '#9CA3AF',
            padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {card.type}
          </span>
          {card.attribute && (
            <span style={{ fontSize: '10px', fontWeight: 500, color: '#9090b8', fontFamily: 'var(--font-sans)', textTransform: 'capitalize' }}>
              {card.attribute}
            </span>
          )}
        </div>

        {/* Stats */}
        {card.type === 'unit' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>{card.atk ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>{card.hp ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>{card.spd ?? 0}</div>
            </div>
          </div>
        )}
        {card.type === 'relic' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>{card.hp ?? 0}</div>
            </div>
          </div>
        )}
        {card.type === 'omen' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Turns</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>{card.turnsRemaining ?? 0}</div>
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
            {renderRules(card.rules)}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function CollectionCard({ card, count, onClick }) {
  const owned = count > 0;
  const imageUrl = getCardImageUrl(card.image);
  const rarityColor = RARITY_COLORS[card.rarity] || '#9CA3AF';

  return (
    <div
      onClick={onClick}
      style={{
      position: 'relative',
      width: 72,
      height: 104,
      borderRadius: 6,
      border: `1px solid ${owned ? rarityColor + '80' : '#2a2a3a'}`,
      background: owned ? '#0f0f1e' : '#090910',
      overflow: 'hidden',
      opacity: owned ? 1 : 0.35,
      boxShadow: owned && card.rarity === 'legendary' ? `0 0 10px ${rarityColor}60` : 'none',
      flexShrink: 0,
      cursor: 'pointer',
    }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={card.name}
          style={{ width: '100%', height: 60, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          height: 60,
          background: `${rarityColor}11`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          color: rarityColor,
          fontFamily: "'Cinzel', serif",
        }}>{card.type?.toUpperCase()}</div>
      )}
      <div style={{ padding: '3px 5px' }}>
        <AutoSizeText maxFontSize={10} style={{
          fontFamily: "'Cinzel', serif",
          fontWeight: 600,
          color: owned ? rarityColor : '#3a3a5a',
          lineHeight: 1.2,
        }}>{card.name}</AutoSizeText>
        <div style={{
          fontSize: 8,
          color: '#4a4a6a',
          marginTop: 1,
        }}>Cost {card.cost ?? '—'}</div>
      </div>
      {/* Count badge */}
      {owned && (
        <div style={{
          position: 'absolute',
          top: 3,
          right: 3,
          background: rarityColor,
          color: '#0a0a0f',
          fontSize: 9,
          fontFamily: "'Cinzel', serif",
          fontWeight: 700,
          borderRadius: 8,
          padding: '1px 4px',
          lineHeight: 1.3,
        }}>×{count}</div>
      )}
    </div>
  );
}

export default function CollectionScreen({ onBack }) {
  const allCards = getAllCards();
  const collection = getCollection();
  const grouped = groupByFaction(allCards);
  const [selectedCard, setSelectedCard] = useState(null);
  const handleClose = useCallback(() => setSelectedCard(null), []);

  const totalOwned = allCards.filter(c => (collection[c.id] || 0) > 0).length;
  const total = allCards.length;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 16px',
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 540, display: 'flex', alignItems: 'center', marginBottom: 20, position: 'relative' }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#4a4a6a',
            fontFamily: "'Cinzel', serif",
            fontSize: 13,
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >← Back</button>
        <h2 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 20,
          fontWeight: 600,
          color: '#C9A84C',
          letterSpacing: '0.15em',
          margin: 0,
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
        }}>COLLECTION</h2>
      </div>

      {/* Progress */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 12,
        color: '#6a6a8a',
        letterSpacing: '0.06em',
        marginBottom: 20,
        textAlign: 'center',
      }}>
        {totalOwned} / {total} cards collected
        <div style={{
          marginTop: 6,
          height: 4,
          width: 200,
          background: '#1a1a2a',
          borderRadius: 2,
          overflow: 'hidden',
          margin: '6px auto 0',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.round((totalOwned / total) * 100)}%`,
            background: 'linear-gradient(90deg, #8a6a00, #C9A84C)',
            borderRadius: 2,
          }} />
        </div>
      </div>

      {/* Cards by faction */}
      <div style={{ width: '100%', maxWidth: 540 }}>
        {[...FACTION_ORDER, 'neutral'].map(faction => {
          const cards = grouped[faction];
          if (!cards || cards.length === 0) return null;
          const color = FACTION_COLORS[faction];
          const ownedInFaction = cards.filter(c => (collection[c.id] || 0) > 0).length;

          return (
            <div key={faction} style={{ marginBottom: 28 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 10,
                borderBottom: `1px solid ${color}30`,
                paddingBottom: 6,
              }}>
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 11,
                  fontWeight: 600,
                  color: color,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>{FACTION_LABELS[faction]}</div>
                <div style={{ fontSize: 10, color: '#4a4a6a', fontFamily: "'Cinzel', serif" }}>
                  {ownedInFaction}/{cards.length}
                </div>
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}>
                {cards.map(card => (
                  <CollectionCard
                    key={card.id}
                    card={card}
                    count={collection[card.id] || 0}
                    onClick={() => setSelectedCard(card)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedCard && <CardModal card={selectedCard} onClose={handleClose} />}
    </div>
  );
}
