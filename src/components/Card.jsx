import { getCardImageUrl } from '../supabase.js';

const FACTION_TEXT_COLORS = {
  Human: '#4a8abf',
  Beast: '#4a8a4a',
  Elf: '#8a4abf',
  Demon: '#bf2a2a',
};

const FACTION_DISPLAY_NAMES = {
  Human: 'Light',
  Beast: 'Primal',
  Elf: 'Mystic',
  Demon: 'Dark',
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
    border: isSelected ? '2px solid #C9A84C' : isLegendary ? '2px solid #C9A84C80' : '1px solid #2a2a42',
    boxShadow: isSelected ? '0 0 8px #C9A84C40' : 'none',
  };

  return (
    <div
      className={`relative rounded-lg text-xs select-none transition-transform
        ${selectedStyle} ${playableStyle} ${dimStyle}
        ${isLegendary && !isSelected ? 'legendary-card' : ''}
        flex flex-col p-1.5 h-[130px] w-[30vw] max-w-[120px]
        md:w-[124px] md:h-[172px]`}
      style={cardBaseStyle}
      onClick={onClick}
      title={card.rules || card.name}
    >
      {/* === MOBILE LAYOUT (hidden on md+) === */}
      <div className="md:hidden flex flex-col h-full">
        {/* Name + Cost row */}
        <div className="flex justify-between items-start mb-1" style={{ flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, color: '#e8e8f0', lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>
            {card.legendary && <span style={{ color: '#C9A84C', marginRight: '2px' }}>♛</span>}
            {card.name}
          </span>
          <span style={{
            background: '#C9A84C',
            color: '#0a0a14',
            fontFamily: 'var(--font-sans)',
            fontSize: '9px',
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: '99px',
            lineHeight: 1.4,
            flexShrink: 0,
            marginLeft: '2px',
          }}>{card.cost}</span>
        </div>
        {/* Art area */}
        <div className="rounded overflow-hidden" style={{ flex: 1, minHeight: 0 }} data-art-slot="true">
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
                WebkitTouchCallout: 'none',
                userSelect: 'none',
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#252538',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              color: '#4a4a6a',
              fontSize: '11px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
            }}>
              {(card.unitType || 'Spell')[0]}
            </div>
          )}
        </div>
      </div>

      {/* === DESKTOP LAYOUT (hidden on mobile, shown on md+) === */}
      <div className="hidden md:flex md:flex-col md:h-full">
        {/* Name + Cost row */}
        <div className="flex items-start mb-1 gap-0.5">
          <div
            style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#e8e8f0', lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}
          >
            {card.legendary && <span style={{ color: '#C9A84C', marginRight: '2px' }}>♛</span>}
            {card.name}
          </div>
          <span style={{
            background: '#C9A84C',
            color: '#0a0a14',
            fontFamily: 'var(--font-sans)',
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
          style={{ height: '70px' }}
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
                WebkitTouchCallout: 'none',
                userSelect: 'none',
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
                background: '#252538',
                borderRadius: 'var(--border-radius-md)',
                border: '0.5px solid rgba(255,255,255,0.07)',
                color: '#4a4a6a',
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
              }}
            >
              {(card.unitType || 'Spell')[0]}
            </div>
          )}
        </div>

        {/* Stats row */}
        {card.type === 'unit' && (
          <div className="flex justify-between mb-0.5" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px' }}>
            <span style={{ color: '#ffffff' }}>⚔{card.atk}</span>
            <span style={{ color: '#ffffff' }}>♥{card.hp}</span>
            <span style={{ color: '#ffffff' }}>⚡{card.spd}</span>
          </div>
        )}

        {/* Keyword badges */}
        {card.aura && (
          <div className="mb-0.5">
            <span style={{ fontSize: '8px', background: '#134e4a', color: '#5eead4', padding: '1px 4px', borderRadius: '4px', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
              Aura {card.aura.range}
            </span>
          </div>
        )}

        {/* Rules text */}
        {card.rules && (
          <div style={{ fontFamily: 'var(--font-sans)', fontStyle: 'normal', fontSize: '8px', color: '#e2e8f0', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{card.rules}</div>
        )}

        {/* Card type label */}
        {!isSpell && (
          <div style={{ marginTop: 'auto', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 500, color: `${factionColor}cc`, textTransform: 'capitalize' }}>
            {FACTION_DISPLAY_NAMES[card.unitType] || card.unitType}
          </div>
        )}
      </div>
    </div>
  );
}
