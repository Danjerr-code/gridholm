import { useState } from 'react';
import { CARD_DB, shuffle } from '../../engine/cards.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { getCardImageUrl } from '../../supabase.js';
import { AutoSizeText } from '../AutoSizeText.jsx';
import { buildDraftPool, generatePack } from '../../draft/draftPool.js';
import { FACTION_CURATED_CARDS } from '../../adventure/adventureState.js';

const ADVENTURE_DRAFT_PICKS = 8; // 1 special first pick + 7 standard picks

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate the first adventure draft pack: 2 legendaries + 1 rare,
 * all from the champion's faction or neutral.
 */
function generateAdventureFirstPack(faction) {
  const legendaries = Object.values(CARD_DB).filter(card =>
    card.legendary && !card.isToken && !card.token && !card.isChampion && !card.bossOnly && !card.adventureOnly &&
    (card.attribute === faction || card.attribute === 'neutral')
  );
  const rares = Object.values(CARD_DB).filter(card =>
    card.rarity === 'rare' && !card.legendary &&
    !card.isToken && !card.token && !card.isChampion && !card.bossOnly && !card.adventureOnly &&
    (card.attribute === faction || card.attribute === 'neutral')
  );
  const shuffledLegs = shuffle([...legendaries]);
  const shuffledRares = shuffle([...rares]);
  return [...shuffledLegs.slice(0, 2), ...shuffledRares.slice(0, 1)];
}

/**
 * Assign 2 or 3 rare slots out of picks 1–7 (the 7 standard picks).
 * Returns a Set of pick numbers (1-indexed relative to those picks).
 */
function assignAdventureRareSlots() {
  const count = 2 + Math.floor(Math.random() * 2); // 2 or 3
  const positions = [1, 2, 3, 4, 5, 6, 7];
  const shuffled = shuffle([...positions]);
  return new Set(shuffled.slice(0, count));
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Adventure mode 8-pick starting draft.
 *
 * Props:
 *   faction          - champion faction ('light' | 'primal' | 'mystic' | 'dark')
 *   onDraftComplete  - callback(draftedIds: string[]) with the 8 drafted card IDs
 *   onBack           - callback to cancel and return to champion select
 */
export default function AdventureDraftScreen({ faction, onDraftComplete, onBack }) {
  const curatedCards = FACTION_CURATED_CARDS[faction] ?? FACTION_CURATED_CARDS.light;

  // Pool: champion faction + neutral (no secondary faction in adventure)
  const [pool] = useState(() => buildDraftPool(faction, faction));
  const [rareSlots] = useState(() => assignAdventureRareSlots());
  const [offerCounts, setOfferCounts] = useState({});

  // pickIndex 0 = special first pick (2 legs + 1 rare), pickIndex 1-7 = standard
  const [pickIndex, setPickIndex] = useState(0);
  const [draftedIds, setDraftedIds] = useState([]);
  const [currentPack, setCurrentPack] = useState(() => generateAdventureFirstPack(faction));

  const attrColor = ATTRIBUTES[faction]?.color ?? '#C9A84C';
  const isFirstPick = pickIndex === 0;

  function handlePick(card) {
    const newDraftedIds = [...draftedIds, card.id];
    setDraftedIds(newDraftedIds);

    const nextIndex = pickIndex + 1;
    if (nextIndex >= ADVENTURE_DRAFT_PICKS) {
      onDraftComplete(newDraftedIds);
      return;
    }

    setPickIndex(nextIndex);

    // Picks 1-7 use standard generatePack with pick numbers 1-7
    const pack = generatePack(
      pool,
      newDraftedIds,
      nextIndex,        // 1-indexed pick number for cost-bracket logic
      faction,
      null,             // no secondary faction in adventure draft
      rareSlots,
      offerCounts
    );
    const newOfferCounts = { ...offerCounts };
    for (const c of pack) newOfferCounts[c.id] = (newOfferCounts[c.id] ?? 0) + 1;
    setOfferCounts(newOfferCounts);
    setCurrentPack(pack);
  }

  const curveCounts = getCurveCounts(draftedIds);
  const sortedDrafted = getSortedDeck(draftedIds);

  return (
    <div style={screen}>
      <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ ...heading, fontSize: 18, margin: 0, color: attrColor }}>
              ADVENTURE DRAFT
            </h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 12, margin: '2px 0 0' }}>
              {isFirstPick
                ? 'Choose a card from the opening pack — 2 legendaries and 1 rare'
                : 'Draft 3 cards per pick to build your starting hand'}
            </p>
          </div>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: attrColor }}>
            Pick {pickIndex + 1} of {ADVENTURE_DRAFT_PICKS}
          </span>
        </div>

        {/* Current pack */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {currentPack.map(card => (
            <FullCard key={card.id} card={card} onClick={() => handlePick(card)} />
          ))}
          {currentPack.length === 0 && (
            <p style={{ color: '#6a6a8a', fontFamily: "'Crimson Text', serif" }}>
              No cards available for this pick.
            </p>
          )}
        </div>

        {/* Mana curve for drafted picks */}
        {draftedIds.length > 0 && (
          <>
            <ManaCurveBar counts={curveCounts} />
            <div>
              <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', marginBottom: 6 }}>
                DRAFTED ({draftedIds.length} / {ADVENTURE_DRAFT_PICKS})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sortedDrafted.map((card, i) => (
                  <MiniCardPill key={i} card={card} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Divider */}
        <div style={{ borderTop: '1px solid #1a1a2a', paddingTop: 12 }}>
          <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#4a4a6a', letterSpacing: '0.08em', marginBottom: 8 }}>
            YOUR STARTING 12 CARDS (curated)
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {getSortedDeck(curatedCards).map((card, i) => (
              <MiniCardPill key={i} card={card} dimmed />
            ))}
          </div>
          <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: 11, color: '#4a4a6a', marginTop: 6 }}>
            After the draft, these 12 cards combine with your 8 picks for a 20-card starting deck.
          </p>
        </div>

        {/* Back/cancel */}
        <button onClick={onBack} style={btnCancel}>
          ← Back to Faction Select
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FullCard({ card, onClick }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  const imageUrl = getCardImageUrl(card.image);
  return (
    <div
      onClick={onClick}
      className={card.legendary ? 'legendary-draft-glow' : undefined}
      style={{
        background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
        border: card.legendary ? '1px solid rgba(255, 140, 0, 0.8)' : `2px solid ${attrColor}66`,
        borderRadius: 8,
        padding: 12,
        width: 160,
        height: 240,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        overflow: 'hidden',
        transition: 'border-color 150ms ease, transform 150ms ease',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = card.legendary ? 'rgba(255, 140, 0, 1)' : attrColor;
        if (!card.legendary) e.currentTarget.style.boxShadow = `0 0 12px ${attrColor}50`;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = card.legendary ? 'rgba(255, 140, 0, 0.8)' : `${attrColor}66`;
        if (!card.legendary) e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.transform = '';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <AutoSizeText maxFontSize={11} style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, color: '#e8e8f0', lineHeight: 1.3, flex: 1 }}>
          {card.legendary && <span style={{ color: '#C9A84C', marginRight: 2 }}>♛</span>}
          {card.name}
        </AutoSizeText>
        <span style={{ background: '#C9A84C', color: '#0a0a14', fontFamily: "'Cinzel', serif", fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0, marginLeft: 4 }}>
          {card.cost}
        </span>
      </div>

      {imageUrl ? (
        <img src={imageUrl} alt={card.name} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 4 }} />
      ) : (
        <div style={{ width: '100%', height: 90, background: `${attrColor}22`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: attrColor, fontSize: 10, fontFamily: "'Cinzel', serif" }}>{card.type?.toUpperCase()}</span>
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
        <p style={{ fontSize: 9, color: '#8a8aa0', margin: 0, lineHeight: 1.4, height: 38, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {card.rules}
        </p>
      ) : null}

      <span style={{ fontSize: 9, color: attrColor, fontFamily: "'Cinzel', serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {card.attribute}
      </span>
    </div>
  );
}

function MiniCardPill({ card, dimmed = false }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  return (
    <div style={{
      background: dimmed ? '#0a0a12' : '#0d0d1a',
      border: `1px solid ${dimmed ? attrColor + '22' : attrColor + '44'}`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 10,
      color: dimmed ? '#6a6a8a' : '#c0c0d0',
      fontFamily: "'Cinzel', serif",
      whiteSpace: 'nowrap',
      letterSpacing: '0.02em',
    }}>
      <span style={{ color: dimmed ? '#5a5a6a' : '#C9A84C', marginRight: 3 }}>{card.cost}</span>
      {card.name}
    </div>
  );
}

function ManaCurveBar({ counts }) {
  const values = Object.values(counts);
  const maxCount = values.length > 0 ? Math.max(1, ...values) : 1;
  const costs = [1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <div>
      <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', marginBottom: 6 }}>
        MANA CURVE
      </p>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 48 }}>
        {costs.map(cost => {
          const count = counts[cost] ?? 0;
          const height = count === 0 ? 4 : Math.max(8, Math.round((count / maxCount) * 44));
          return (
            <div key={cost} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              {count > 0 && (
                <span style={{ fontSize: 9, color: '#C9A84C', fontFamily: 'monospace', marginBottom: 2 }}>{count}</span>
              )}
              <div style={{ width: '100%', height, background: count === 0 ? '#1a1a2a' : '#C9A84C55', borderRadius: 2, border: '1px solid #2a2a3a' }} />
              <span style={{ fontSize: 8, color: '#4a4a6a', fontFamily: 'monospace', marginTop: 2 }}>{cost}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function getSortedDeck(ids) {
  return ids
    .map(id => CARD_DB[id])
    .filter(Boolean)
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
}

function getCurveCounts(ids) {
  const counts = {};
  for (const id of ids) {
    const card = CARD_DB[id];
    if (!card) continue;
    const cost = card.cost ?? 0;
    counts[cost] = (counts[cost] ?? 0) + 1;
  }
  return counts;
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  letterSpacing: '0.15em',
};

const btnCancel = {
  background: 'transparent',
  color: '#4a4a6a',
  fontFamily: "'Cinzel', serif",
  fontSize: 12,
  border: '1px solid #2a2a3a',
  borderRadius: 4,
  padding: '8px 20px',
  cursor: 'pointer',
  alignSelf: 'flex-start',
};
