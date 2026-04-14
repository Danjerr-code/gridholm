import { useState } from 'react';
import { CARD_DB } from '../../engine/cards.js';
import { getCollection } from '../../packs/collection.js';
import { getCardImageUrl } from '../../supabase.js';

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

function CollectionCard({ card, count }) {
  const owned = count > 0;
  const imageUrl = getCardImageUrl(card.image);
  const rarityColor = RARITY_COLORS[card.rarity] || '#9CA3AF';

  return (
    <div style={{
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
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 8,
          fontWeight: 600,
          color: owned ? rarityColor : '#3a3a5a',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{card.name}</div>
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
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
