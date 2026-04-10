import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CARD_DB } from '../engine/cards.js';
import Card from './Card.jsx';
import { getCardImageUrl } from '../supabase.js';
import { renderRules } from '../utils/rulesText.jsx';

const ATTRIBUTE_SECTIONS = [
  { key: 'light',   name: 'Light',   color: '#3B82F6' },
  { key: 'primal',  name: 'Primal',  color: '#22C55E' },
  { key: 'mystic',  name: 'Mystic',  color: '#A855F7' },
  { key: 'dark',    name: 'Dark',    color: '#EF4444' },
  { key: 'neutral', name: 'Neutral', color: '#9CA3AF' },
];

const TYPE_LABEL = {
  unit:    'U',
  spell:   'S',
  relic:   'R',
  omen:    'O',
  terrain: 'T',
};

const TYPE_SECTIONS = [
  { key: 'all',     name: 'All' },
  { key: 'unit',    name: 'Units' },
  { key: 'spell',   name: 'Spells' },
  { key: 'relic',   name: 'Relics' },
  { key: 'omen',    name: 'Omens' },
  { key: 'terrain', name: 'Terrain' },
];

function getGroupedByAttribute() {
  const all = Object.values(CARD_DB).filter(c => !c.token);
  const byAttr = {};
  for (const section of ATTRIBUTE_SECTIONS) {
    byAttr[section.key] = [];
  }
  for (const card of all) {
    const attr = card.attribute || 'neutral';
    if (byAttr[attr]) {
      byAttr[attr].push(card);
    }
  }
  for (const key of Object.keys(byAttr)) {
    byAttr[key].sort((a, b) => {
      const costDiff = (a.cost ?? 0) - (b.cost ?? 0);
      if (costDiff !== 0) return costDiff;
      return a.name.localeCompare(b.name);
    });
  }
  return byAttr;
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
              {TYPE_LABEL[card.type] || 'U'}
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

export default function CardGallery() {
  const grouped = getGroupedByAttribute();
  const totalCardCount = Object.values(grouped).reduce((acc, cards) => acc + cards.length, 0);
  const [selectedCard, setSelectedCard] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [activeTypeTab, setActiveTypeTab] = useState('all');

  const handleClose = useCallback(() => setSelectedCard(null), []);

  useEffect(() => {
    if (!selectedCard) return;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCard, handleClose]);

  const visibleSections = activeTab === 'all'
    ? ATTRIBUTE_SECTIONS
    : ATTRIBUTE_SECTIONS.filter(s => s.key === activeTab);

  function filterByType(cards) {
    if (activeTypeTab === 'all') return cards;
    return cards.filter(c => c.type === activeTypeTab);
  }

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
        flexDirection: 'column',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#6b7280', letterSpacing: '0.04em' }}>
            Cards: {totalCardCount}
          </span>
        </div>

        {/* Attribute filter tabs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              background: activeTab === 'all' ? 'rgba(255,255,255,0.12)' : 'transparent',
              border: activeTab === 'all' ? '0.5px solid rgba(255,255,255,0.3)' : '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: activeTab === 'all' ? '#fff' : '#9ca3af',
              fontSize: '12px',
              fontWeight: 600,
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.04em',
            }}
          >
            All
          </button>
          {ATTRIBUTE_SECTIONS.map(section => (
            <button
              key={section.key}
              onClick={() => setActiveTab(section.key)}
              style={{
                background: activeTab === section.key ? `${section.color}22` : 'transparent',
                border: activeTab === section.key ? `0.5px solid ${section.color}88` : '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: activeTab === section.key ? section.color : '#9ca3af',
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.04em',
              }}
            >
              {section.name}
            </button>
          ))}
        </div>

        {/* Type filter tabs (secondary) */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {TYPE_SECTIONS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTypeTab(t.key)}
              style={{
                background: activeTypeTab === t.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: activeTypeTab === t.key ? '0.5px solid rgba(255,255,255,0.22)' : '0.5px solid rgba(255,255,255,0.07)',
                borderRadius: '4px',
                color: activeTypeTab === t.key ? '#d1d5db' : '#6b7280',
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 9px',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
        {visibleSections.map(section => {
          const cards = filterByType(grouped[section.key] || []);
          if (cards.length === 0) return null;
          return (
            <div key={section.key} style={{ marginBottom: 56 }}>
              {/* Section header */}
              <h2 style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 20,
                fontWeight: 600,
                color: section.color,
                margin: '0 0 8px 0',
                letterSpacing: '0.06em',
                borderBottom: `0.5px solid ${section.color}40`,
                paddingBottom: 10,
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
              }}>
                {section.name}
                <span style={{ fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 400, color: `${section.color}99`, letterSpacing: '0.03em' }}>
                  {cards.length} cards
                </span>
              </h2>

              {/* Cards grid */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {cards.map(card => (
                  <div key={card.id} style={{ position: 'relative' }}>
                    <Card card={card} isSelected={false} isPlayable={true} onClick={() => setSelectedCard(card)} />
                  </div>
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
