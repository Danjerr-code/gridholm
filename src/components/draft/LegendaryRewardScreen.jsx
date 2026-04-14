import { generateLegendaryPack } from '../../draft/draftPool.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { getCardImageUrl } from '../../supabase.js';

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
 * After a loss, offer the player a legendary card as a reward.
 * They pick 1 of 3 legendaries.
 *
 * Props:
 *   runState      - current draft run state
 *   onCardSelected(cardId) - called with chosen card ID
 */
export default function LegendaryRewardScreen({ runState, onCardSelected }) {
  const { primaryFaction, secondaryFaction, deck, legendaryIds } = runState;

  // All legendaries already in the deck are excluded
  const excluded = [...legendaryIds];
  const pack = generateLegendaryPack(primaryFaction, secondaryFaction, excluded);

  return (
    <div style={screen}>
      <div style={{ maxWidth: 560, width: '100%', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 32 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ ...heading, fontSize: 22, marginBottom: 4 }}>LEGENDARY REWARD</h2>
          <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14 }}>
            Choose 1 legendary to add to your deck
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {pack.map(card => (
            <FullCard key={card.id} card={card} onClick={() => onCardSelected(card.id)} />
          ))}
          {pack.length === 0 && (
            <p style={{ color: '#6a6a8a', fontFamily: "'Crimson Text', serif", fontStyle: 'italic' }}>
              No more legendaries available for this faction pair.
            </p>
          )}
        </div>

        {pack.length === 0 && (
          <button
            onClick={() => onCardSelected(null)}
            style={{
              background: 'transparent',
              color: '#6a6a8a',
              fontFamily: "'Cinzel', serif",
              fontSize: 13,
              border: '1px solid #2a2a3a',
              borderRadius: 4,
              padding: '10px 24px',
              cursor: 'pointer',
            }}
          >
            Continue Without Reward
          </button>
        )}
      </div>
    </div>
  );
}

function FullCard({ card, onClick }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  const imageUrl = getCardImageUrl(card.image);
  return (
    <div
      onClick={onClick}
      style={{
        background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
        border: `2px solid ${attrColor}66`,
        borderRadius: 8,
        padding: 12,
        width: 160,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = attrColor; e.currentTarget.style.boxShadow = `0 0 12px ${attrColor}50`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = `${attrColor}66`; e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 600, color: '#e8e8f0', lineHeight: 1.3, flex: 1 }}>
          <span style={{ color: '#C9A84C', marginRight: 2 }}>♛</span>
          {card.name}
        </span>
        <span style={{ background: '#C9A84C', color: '#0a0a14', fontFamily: "'Cinzel', serif", fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0, marginLeft: 4 }}>
          {card.cost}
        </span>
      </div>

      {imageUrl ? (
        <img src={imageUrl} alt={card.name} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 4 }} />
      ) : (
        <div style={{ width: '100%', height: 90, background: `${attrColor}22`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: attrColor, fontSize: 10, fontFamily: "'Cinzel', serif" }}>LEGENDARY</span>
        </div>
      )}

      {card.type === 'unit' && (
        <div style={{ display: 'flex', gap: 6, fontSize: 10, color: '#a0a0c0', fontFamily: 'monospace' }}>
          <span>⚔ {card.atk}</span>
          <span>❤ {card.hp}</span>
          <span>⚡ {card.spd}</span>
        </div>
      )}

      {card.rules ? (
        <p style={{ fontSize: 9, color: '#8a8aa0', margin: 0, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {card.rules}
        </p>
      ) : null}

      <span style={{ fontSize: 9, color: attrColor, fontFamily: "'Cinzel', serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {card.attribute}
      </span>
    </div>
  );
}
