import { getCardImageUrl } from '../supabase.js';

const FACTION_TEXT_COLORS = {
  Human: '#4a8abf',
  Beast: '#4a8a4a',
  Elf: '#8a4abf',
  Demon: '#bf2a2a',
};

function getFactionColor(unitType) {
  return FACTION_TEXT_COLORS[unitType] || '#6a6a8a';
}

export default function Card({ card, isSelected, isPlayable, onClick }) {
  const isSpell = card.type === 'spell';
  const selectedStyle = isSelected ? '-translate-y-2' : '';
  const playableStyle = isPlayable && !isSelected ? 'hover:-translate-y-1 cursor-pointer' : 'cursor-pointer';
  const dimStyle = !isPlayable && !isSelected ? 'opacity-50' : '';
  const isLegendary = !!card.legendary;
  const factionColor = getFactionColor(card.unitType);

  const imageUrl = getCardImageUrl(card.image);

  const cardBaseStyle = {
    background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
    border: isSelected ? '2px solid #C9A84C' : isLegendary ? '2px solid #C9A84C80' : '1px solid #2a2a3a',
    boxShadow: isSelected ? '0 0 8px #C9A84C40' : 'none',
  };

  return (
    <div
      className={`relative rounded-lg text-xs select-none transition-transform
        ${selectedStyle} ${playableStyle} ${dimStyle}
        ${isLegendary && !isSelected ? 'legendary-card' : ''}
        flex flex-col p-1.5 w-20
        md:w-[100px] md:h-[140px]`}
      style={cardBaseStyle}
      onClick={onClick}
      title={card.rules || card.name}
    >
      {/* === MOBILE LAYOUT (hidden on md+) === */}
      <div className="md:hidden flex flex-col">
        <div className="flex justify-between items-start mb-0.5">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
            {card.legendary && <span style={{ color: '#C9A84C', marginRight: '2px' }}>♛</span>}
            {card.name}
          </span>
          <span style={{
            background: '#C9A84C',
            color: '#0a0a0f',
            fontFamily: "'Cinzel', serif",
            fontSize: '9px',
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: '99px',
            lineHeight: 1.4,
            flexShrink: 0,
            marginLeft: '2px',
          }}>{card.cost}</span>
        </div>
        {card.type === 'unit' && (
          <>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: `${factionColor}99`, marginBottom: '2px' }}>{card.unitType}</div>
            <div className="flex justify-between" style={{ fontFamily: "'Crimson Text', serif", fontSize: '10px' }}>
              <span style={{ color: '#f87171' }}>⚔{card.atk}</span>
              <span style={{ color: '#4ade80' }}>♥{card.hp}</span>
              <span style={{ color: '#60a5fa' }}>⚡{card.spd}</span>
            </div>
          </>
        )}
        {card.type === 'spell' && (
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#8a4abf', marginTop: 'auto' }}>Spell</div>
        )}
        {card.aura && (
          <div className="mt-0.5">
            <span style={{ fontSize: '8px', background: '#134e4a', color: '#5eead4', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>
              Aura {card.aura.range}
            </span>
          </div>
        )}
        {card.rules && (
          <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '8px', color: '#8a8aaa', marginTop: '2px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{card.rules}</div>
        )}
      </div>

      {/* === DESKTOP LAYOUT (hidden on mobile, shown on md+) === */}
      <div className="hidden md:flex md:flex-col md:h-full">
        {/* Name + Cost row */}
        <div className="flex items-start mb-1 gap-0.5">
          <div
            style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: 600, color: '#fff', lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}
          >
            {card.legendary && <span style={{ color: '#C9A84C', marginRight: '2px' }}>♛</span>}
            {card.name}
          </div>
          <span style={{
            background: '#C9A84C',
            color: '#0a0a0f',
            fontFamily: "'Cinzel', serif",
            fontSize: '9px',
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: '99px',
            lineHeight: 1.4,
            flexShrink: 0,
            marginLeft: '2px',
          }}>{card.cost}</span>
        </div>

        {/* Art area */}
        <div
          className="rounded mb-1 flex-shrink-0 overflow-hidden"
          style={{ height: '56px' }}
          data-art-slot="true"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={card.name}
              onError={(e) => { e.target.style.display = 'none'; }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 'var(--border-radius-md)',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 'var(--border-radius-md)',
                border: '0.5px solid rgba(255,255,255,0.07)',
                color: `${factionColor}99`,
                fontSize: '11px',
                fontFamily: "'Cinzel', serif",
                fontWeight: 500,
              }}
            >
              {card.unitType || 'Spell'}
            </div>
          )}
        </div>

        {/* Stats row */}
        {card.type === 'unit' && (
          <div className="flex justify-between mb-0.5" style={{ fontFamily: "'Crimson Text', serif", fontSize: '10px' }}>
            <span style={{ color: '#f87171' }}>⚔{card.atk}</span>
            <span style={{ color: '#4ade80' }}>♥{card.hp}</span>
            <span style={{ color: '#60a5fa' }}>⚡{card.spd}</span>
          </div>
        )}
        {card.type === 'spell' && (
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#8a4abf', marginBottom: '2px' }}>Spell</div>
        )}

        {/* Keyword badges */}
        {card.aura && (
          <div className="mb-0.5">
            <span style={{ fontSize: '8px', background: '#134e4a', color: '#5eead4', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>
              Aura {card.aura.range}
            </span>
          </div>
        )}

        {/* Rules text */}
        {card.rules && (
          <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '8px', color: '#8a8aaa', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{card.rules}</div>
        )}

        {/* Card type label */}
        <div style={{ marginTop: 'auto', fontFamily: "'Cinzel', serif", fontSize: '8px', color: `${factionColor}99`, textTransform: 'capitalize' }}>
          {card.unitType || (isSpell ? 'Spell' : '')}
        </div>
      </div>
    </div>
  );
}
