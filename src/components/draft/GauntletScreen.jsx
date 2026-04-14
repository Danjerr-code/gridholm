import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CARD_DB } from '../../engine/cards.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { getRandomFactions } from '../../draft/draftPool.js';
import { generateAIDeck } from '../../draft/aiDrafter.js';
import { saveDraftRun } from '../../draft/draftRunState.js';
import { getCardImageUrl } from '../../supabase.js';
import { renderRules } from '../../utils/rulesText.jsx';

const FACTION_STYLE = {
  light:  { label: 'Light' },
  primal: { label: 'Primal' },
  mystic: { label: 'Mystic' },
  dark:   { label: 'Dark' },
};

const MAX_LOSSES = 3;

const TYPE_LABEL = {
  unit:    'U',
  spell:   'S',
  relic:   'R',
  omen:    'O',
  terrain: 'T',
};

// ── Difficulty mapping by wins ────────────────────────────────────────────────
function getDifficulty(wins) {
  if (wins === 0) return 0;
  if (wins <= 2) return 2;
  if (wins <= 4) return 4;
  if (wins <= 6) return 6;
  return 8;
}

// ── Shared styles ────────────────────────────────────────────────────────────
const screen = {
  minHeight: '100vh',
  background: 'linear-gradient(160deg, #07070d 0%, #0a0a0f 40%, #0d0a12 100%)',
  backgroundImage: `
    linear-gradient(160deg, #07070d 0%, #0a0a0f 40%, #0d0a12 100%),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")
  `,
  backgroundBlendMode: 'normal, overlay',
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

const btnPrimary = {
  background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
  color: '#0a0a0f',
  fontFamily: "'Cinzel', serif",
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  borderRadius: 4,
  padding: '12px 24px',
  cursor: 'pointer',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

// ── Card Detail Modal (same as card gallery) ─────────────────────────────────
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

// ── Component ────────────────────────────────────────────────────────────────
export default function GauntletScreen({ runState, onLaunchGame, onRunComplete }) {
  const { wins, losses, deck, legendaryIds, primaryFaction, secondaryFaction } = runState;
  const sortedDeck = getSortedDeck(deck);
  const [selectedCard, setSelectedCard] = useState(null);
  const handleCloseModal = useCallback(() => setSelectedCard(null), []);

  function handleNextGame() {
    const difficulty = getDifficulty(wins);
    const [aiFaction1, aiFaction2] = getRandomFactions(2);
    const aiDeckIds = generateAIDeck(
      aiFaction1,
      aiFaction2,
      legendaryIds.length,
      difficulty,
      legendaryIds
    );

    const playerSpec = JSON.stringify({
      type: 'custom',
      cards: deck,
      primaryAttr: primaryFaction,
    });
    const aiSpec = JSON.stringify({
      type: 'custom',
      cards: aiDeckIds,
      primaryAttr: aiFaction1,
    });

    onLaunchGame(playerSpec, aiSpec);
  }

  return (
    <div style={screen}>
      <div style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 32 }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ ...heading, fontSize: 22, marginBottom: 4 }}>GAUNTLET</h2>
          <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14 }}>
            {FACTION_STYLE[primaryFaction]?.label} / {FACTION_STYLE[secondaryFaction]?.label}
          </p>
        </div>

        {/* Record */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 28, color: '#C9A84C' }}>{wins}W</span>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 28, color: '#6a6a8a' }}>–</span>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 28, color: '#f87171' }}>{losses}L</span>
        </div>

        {/* Lives */}
        <div>
          <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', marginBottom: 8 }}>LIVES REMAINING</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {Array.from({ length: MAX_LOSSES }).map((_, i) => {
              const alive = i < (MAX_LOSSES - losses);
              return (
                <div
                  key={i}
                  style={{
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    filter: alive
                      ? 'drop-shadow(0 0 6px rgba(201,168,76,0.7))'
                      : 'none',
                    opacity: alive ? 1 : 0.2,
                    transition: 'opacity 0.3s, filter 0.3s',
                  }}
                >
                  <svg width="24" height="22" viewBox="0 0 24 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id={`heartGold${i}`} x1="12" y1="0" x2="12" y2="22" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#FFD97D" />
                        <stop offset="40%" stopColor="#C9A84C" />
                        <stop offset="100%" stopColor="#8a6a00" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M12 20.5C12 20.5 2 13.5 2 7C2 4.2 4.2 2 7 2C9 2 10.8 3.1 12 4.7C13.2 3.1 15 2 17 2C19.8 2 22 4.2 22 7C22 13.5 12 20.5 12 20.5Z"
                      fill={alive ? `url(#heartGold${i})` : '#3a3a4a'}
                      stroke={alive ? '#C9A84C' : '#2a2a3a'}
                      strokeWidth="1"
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>

        {/* Next game button */}
        <button style={btnPrimary} onClick={handleNextGame}>
          Next Game →
        </button>

        {/* Deck list */}
        <div>
          <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', marginBottom: 8 }}>
            YOUR DECK (30 cards)
          </p>
          <CardTypeCounter ids={deck} />
          {/* Gold divider */}
          <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #C9A84C60, transparent)', margin: '10px 0' }} />
          <div
            className="no-scrollbar"
            style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 320, overflowY: 'auto', border: '1px solid #1a1a2a', borderRadius: 4, padding: '4px 8px' }}
          >
            {sortedDeck.map((card, i) => (
              <DeckListRow key={i} card={card} onClick={() => setSelectedCard(card)} />
            ))}
          </div>
        </div>
      </div>

      {selectedCard && <CardModal card={selectedCard} onClose={handleCloseModal} />}
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

function DeckListRow({ card, onClick }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #1a1a2a', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C9A84C', minWidth: 18, textAlign: 'right' }}>{card.cost}</span>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#e8e8f0', flex: 1 }}>
        {card.legendary && <span style={{ color: '#C9A84C', marginRight: 3 }}>♛</span>}
        {card.name}
      </span>
      <span style={{ fontSize: 9, color: attrColor, fontFamily: "'Cinzel', serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {card.type}
      </span>
    </div>
  );
}

function getSortedDeck(ids) {
  return ids
    .map(id => CARD_DB[id])
    .filter(Boolean)
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
}
