/**
 * SpecialNodeScreen
 * -----------------
 * Handles the four special node types at map position 26:
 *
 *   primary_faction   — 3 draftStrong cards from primary faction, pick 1
 *   secondary_faction — 3 draftStrong cards from secondary faction, pick 1
 *   swap              — optional: remove 1 card from deck, then normal bucket pick
 *   rare              — normal bucket pick but force all cards to rare+
 *
 * Props:
 *   node              — current map node (type 'special', specialType set)
 *   specialType       — 'primary_faction' | 'secondary_faction' | 'swap' | 'rare'
 *   primaryFaction
 *   secondaryFaction
 *   deck              — current drafted card IDs (for swap display)
 *   buckets           — 4 bucket IDs (used for swap + rare bucket selection)
 *   onComplete        — called with { cardId, removedCardId?, bucketId? }
 */

import { useState } from 'react';
import {
  BUCKET_LABELS,
  BUCKET_DESCRIPTIONS,
  BUCKET_IDS,
  drawBucketCards,
  drawDraftStrongCards,
} from '../../draft/draftBuckets.js';
import { CARD_DB } from '../../engine/cards.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { getCardImageUrl } from '../../supabase.js';
import { AutoSizeText } from '../AutoSizeText.jsx';

// ── Shared styles ─────────────────────────────────────────────────────────────
const scrn = {
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
  margin: 0,
};

export default function SpecialNodeScreen({
  node,
  specialType,
  primaryFaction,
  secondaryFaction,
  deck,
  buckets,
  onComplete,
}) {
  switch (specialType) {
    case 'primary_faction':
      return (
        <FactionNode
          faction={primaryFaction}
          label="PRIMARY FACTION NODE"
          onComplete={(cardId) => onComplete({ cardId })}
        />
      );
    case 'secondary_faction':
      return (
        <FactionNode
          faction={secondaryFaction}
          label="SECONDARY FACTION NODE"
          onComplete={(cardId) => onComplete({ cardId })}
        />
      );
    case 'swap':
      return (
        <SwapNode
          deck={deck}
          buckets={buckets}
          primaryFaction={primaryFaction}
          secondaryFaction={secondaryFaction}
          onComplete={onComplete}
        />
      );
    case 'rare':
      return (
        <RareNode
          buckets={buckets}
          primaryFaction={primaryFaction}
          secondaryFaction={secondaryFaction}
          deck={deck}
          onComplete={onComplete}
        />
      );
    default:
      return null;
  }
}

// ── Faction Node (Primary / Secondary) ───────────────────────────────────────

function FactionNode({ faction, label, onComplete }) {
  const factionColor = ATTRIBUTES[faction]?.color ?? '#C9A84C';
  const factionName  = ATTRIBUTES[faction]?.name ?? faction;

  // Draw 3 draftStrong cards from this faction
  const [cards] = useState(() => drawDraftStrongCards(faction));

  return (
    <div style={scrn}>
      <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: factionColor, letterSpacing: '0.12em', marginBottom: 4 }}>
            {label}
          </div>
          <h2 style={{ ...heading, fontSize: 20 }}>
            <span style={{ color: factionColor }}>{factionName}</span> Champions
          </h2>
          <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14, margin: '4px 0 0' }}>
            Choose 1 powerful {factionName} card to add to your deck.
          </p>
        </div>

        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: '#6a6a8a', fontFamily: "'Crimson Text', serif" }}>
              No featured cards available for {factionName}.
            </p>
            <button style={btnPrimary} onClick={() => onComplete('_skip')}>
              Continue
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {cards.map(card => (
              <FullCard key={card.id} card={card} onClick={() => onComplete(card.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Swap Node ─────────────────────────────────────────────────────────────────

function SwapNode({ deck, buckets, primaryFaction, secondaryFaction, onComplete }) {
  const [step, setStep] = useState('swap');     // 'swap' | 'bucket' | 'cards'
  const [removedCardId, setRemovedCardId] = useState(null);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [cards, setCards] = useState([]);

  function handleSkipSwap() {
    setRemovedCardId(null);
    setStep('bucket');
  }

  function handleRemoveCard(cardId) {
    setRemovedCardId(cardId);
    setStep('bucket');
  }

  function handleBucketPick(bucketId) {
    const drawn = drawBucketCards(bucketId, primaryFaction, secondaryFaction, deck, false);
    setSelectedBucket(bucketId);
    setCards(drawn);
    setStep('cards');
  }

  function handleCardPick(cardId) {
    onComplete({ cardId, removedCardId, bucketId: selectedBucket });
  }

  // Render swap step
  if (step === 'swap') {
    const deckCards = deck.map(id => CARD_DB[id]).filter(Boolean);
    return (
      <div style={scrn}>
        <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#60a0e0', letterSpacing: '0.12em', marginBottom: 4 }}>
              SWAP NODE
            </div>
            <h2 style={{ ...heading, fontSize: 20 }}>Rework Your Deck</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14, margin: '4px 0 0' }}>
              Optionally remove 1 card from your deck, then pick a new card.
            </p>
          </div>

          <button
            style={{ ...btnSecondary, alignSelf: 'center' }}
            onClick={handleSkipSwap}
          >
            Skip — keep deck as-is
          </button>

          <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', margin: 0 }}>
            YOUR DECK ({deckCards.length} cards) — click to remove
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {deckCards.map((card, i) => (
              <RemovableCardPill key={i} card={card} onClick={() => handleRemoveCard(card.id)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Render bucket step
  if (step === 'bucket') {
    return (
      <div style={scrn}>
        <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#60a0e0', letterSpacing: '0.12em', marginBottom: 4 }}>
              SWAP NODE
            </div>
            <h2 style={{ ...heading, fontSize: 20 }}>Choose a Bucket</h2>
            {removedCardId && (
              <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 13, margin: '4px 0 0' }}>
                Removed: <span style={{ color: '#EF4444' }}>{CARD_DB[removedCardId]?.name ?? removedCardId}</span>
              </p>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {buckets.map((bucketId, i) => (
              <BucketCard key={i} bucketId={bucketId} onPick={() => handleBucketPick(bucketId)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Render cards step
  if (step === 'cards') {
    return (
      <div style={scrn}>
        <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#60a0e0', letterSpacing: '0.12em', marginBottom: 4 }}>
              SWAP NODE — {BUCKET_LABELS[selectedBucket]}
            </div>
            <h2 style={{ ...heading, fontSize: 20 }}>Choose a Card</h2>
          </div>
          {cards.length === 0 ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#6a6a8a', fontFamily: "'Crimson Text', serif" }}>No cards available.</p>
              <button style={btnPrimary} onClick={() => handleCardPick('_skip')}>Continue</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {cards.map(card => (
                <FullCard key={card.id} card={card} onClick={() => handleCardPick(card.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ── Rare Node ─────────────────────────────────────────────────────────────────

function RareNode({ buckets, primaryFaction, secondaryFaction, deck, onComplete }) {
  const [step, setStep] = useState('bucket');
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [cards, setCards] = useState([]);

  function handleBucketPick(bucketId) {
    // Force rare draws
    const drawn = drawBucketCards(bucketId, primaryFaction, secondaryFaction, deck, true);
    setSelectedBucket(bucketId);
    setCards(drawn);
    setStep('cards');
  }

  function handleCardPick(cardId) {
    onComplete({ cardId, bucketId: selectedBucket });
  }

  if (step === 'bucket') {
    return (
      <div style={scrn}>
        <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#e040d0', letterSpacing: '0.12em', marginBottom: 4 }}>
              RARE NODE
            </div>
            <h2 style={{ ...heading, fontSize: 20 }}>
              <span style={{ color: '#e040d0' }}>✦</span> All Cards Rare or Higher
            </h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14, margin: '4px 0 0' }}>
              Choose a bucket — every card in it will be rare or legendary.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {buckets.map((bucketId, i) => (
              <BucketCard key={i} bucketId={bucketId} accentColor="#e040d0" onPick={() => handleBucketPick(bucketId)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'cards') {
    return (
      <div style={scrn}>
        <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#e040d0', letterSpacing: '0.12em', marginBottom: 4 }}>
              RARE NODE — {BUCKET_LABELS[selectedBucket]}
            </div>
            <h2 style={{ ...heading, fontSize: 20 }}>Choose a Card</h2>
          </div>
          {cards.length === 0 ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#6a6a8a', fontFamily: "'Crimson Text', serif" }}>No rare cards available in this bucket.</p>
              <button style={btnPrimary} onClick={() => handleCardPick('_skip')}>Continue</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {cards.map(card => (
                <FullCard key={card.id} card={card} onClick={() => handleCardPick(card.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function BucketCard({ bucketId, onPick, accentColor }) {
  const isMystery = bucketId === BUCKET_IDS.MYSTERY;
  const label = BUCKET_LABELS[bucketId] ?? bucketId;
  const desc  = BUCKET_DESCRIPTIONS[bucketId] ?? '';

  const accent = accentColor ?? (
    isMystery ? '#d060e8'
    : bucketId === BUCKET_IDS.AURA    ? '#3B82F6'
    : bucketId === BUCKET_IDS.RUSH    ? '#22C55E'
    : bucketId === BUCKET_IDS.RESTORE ? '#A855F7'
    : bucketId === BUCKET_IDS.HIDDEN  ? '#EF4444'
    : '#C9A84C'
  );

  return (
    <button
      onClick={onPick}
      style={{
        background: '#0d0d1a',
        border: `1px solid ${accent}44`,
        borderTop: `3px solid ${accent}`,
        borderRadius: 6,
        padding: '14px 16px',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${accent}88`;
        e.currentTarget.style.boxShadow = `0 0 12px ${accent}33`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = `${accent}44`;
        e.currentTarget.style.boxShadow = '';
      }}
    >
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700, color: accent, letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: 13, color: '#9a9ab0' }}>
        {isMystery ? 'Unknown — anything possible' : desc}
      </span>
    </button>
  );
}

function FullCard({ card, onClick }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  const imageUrl = getCardImageUrl(card.image);
  const isLegendary = card.rarity === 'legendary';

  return (
    <div
      onClick={onClick}
      className={isLegendary ? 'legendary-draft-glow' : undefined}
      style={{
        background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
        border: isLegendary ? '1px solid rgba(255,140,0,0.8)' : `2px solid ${attrColor}66`,
        borderRadius: 8,
        padding: 12,
        width: 160,
        height: 240,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        overflow: 'hidden',
        transition: 'border-color 150ms, transform 150ms',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = isLegendary ? 'rgba(255,140,0,1)' : attrColor;
        if (!isLegendary) e.currentTarget.style.boxShadow = `0 0 12px ${attrColor}50`;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = isLegendary ? 'rgba(255,140,0,0.8)' : `${attrColor}66`;
        if (!isLegendary) e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.transform = '';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <AutoSizeText maxFontSize={11} style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, color: '#e8e8f0', lineHeight: 1.3, flex: 1 }}>
          {isLegendary && <span style={{ color: '#C9A84C', marginRight: 2 }}>♛</span>}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
        <span style={{ fontSize: 9, color: isLegendary ? '#C9A84C' : '#4a4a6a', fontFamily: "'Cinzel', serif", letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {card.rarity}
        </span>
        <span style={{ fontSize: 9, color: attrColor, fontFamily: "'Cinzel', serif", letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {card.attribute}
        </span>
      </div>
    </div>
  );
}

function RemovableCardPill({ card, onClick }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  return (
    <button
      onClick={onClick}
      style={{
        background: '#0d0d1a',
        border: `1px solid ${attrColor}44`,
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 10,
        color: '#c0c0d0',
        fontFamily: "'Cinzel', serif",
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
        cursor: 'pointer',
        transition: 'border-color 150ms, background 150ms',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#1a0a0a';
        e.currentTarget.style.borderColor = '#EF444488';
        e.currentTarget.style.color = '#EF4444';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = '#0d0d1a';
        e.currentTarget.style.borderColor = `${attrColor}44`;
        e.currentTarget.style.color = '#c0c0d0';
      }}
    >
      <span style={{ color: '#C9A84C', marginRight: 3 }}>{card.cost}</span>
      {card.name}
      <span style={{ color: '#EF444466', marginLeft: 4 }}>✕</span>
    </button>
  );
}

// ── Button styles ─────────────────────────────────────────────────────────────
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

const btnSecondary = {
  background: 'transparent',
  color: '#C9A84C',
  fontFamily: "'Cinzel', serif",
  fontSize: 13,
  border: '1px solid #C9A84C60',
  borderRadius: 4,
  padding: '10px 24px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
};
