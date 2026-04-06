import { CARD_DB } from '../engine/cards.js';
import Card from './Card.jsx';

const FACTIONS = [
  { name: 'Humans', unitType: 'Human', color: '#4a8abf' },
  { name: 'Beasts', unitType: 'Beast', color: '#4a8a4a' },
  { name: 'Elves',  unitType: 'Elf',   color: '#8a4abf' },
  { name: 'Demons', unitType: 'Demon', color: '#bf2a2a' },
];

function getGroupedCards() {
  const all = Object.values(CARD_DB);
  return FACTIONS.map(faction => {
    const cards = all.filter(c => c.unitType === faction.unitType);
    const units = cards.filter(c => c.type === 'unit').sort((a, b) => a.cost - b.cost);
    const spells = cards.filter(c => c.type === 'spell').sort((a, b) => a.cost - b.cost);
    return { ...faction, units, spells };
  });
}

export default function CardGallery() {
  const groups = getGroupedCards();

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
                  <Card key={card.id} card={card} isSelected={false} isPlayable={true} onClick={() => {}} />
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
                    <Card key={card.id} card={card} isSelected={false} isPlayable={true} onClick={() => {}} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
