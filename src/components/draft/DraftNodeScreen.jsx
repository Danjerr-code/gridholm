/**
 * DraftNodeScreen
 * ---------------
 * Handles the two-step interaction at a standard (or fork) node:
 *   Step 1: Show 4 bucket options. Player picks one.
 *   Step 2: Show 3 cards from that bucket. Player picks one.
 *
 * Props:
 *   node             — current map node object
 *   buckets          — array of 4 bucket IDs
 *   primaryFaction
 *   secondaryFaction
 *   draftedIds       — card IDs already drafted
 *   isFork           — true when this is the fork node (branch commitment)
 *   branchSpecialTypes — map of branch → specialType (for fork display)
 *   onComplete       — called with { cardId, bucketId, committedBranch? }
 */

import { useState } from 'react';
import {
  BUCKET_LABELS,
  BUCKET_DESCRIPTIONS,
  BUCKET_IDS,
  drawBucketCards,
} from '../../draft/draftBuckets.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { CARD_DB } from '../../engine/cards.js';
import { getCardImageUrl } from '../../supabase.js';
import { AutoSizeText } from '../AutoSizeText.jsx';

const BRANCH_SPECIAL_ICONS = {
  primary_faction:   '★',
  secondary_faction: '◆',
  swap:              '⇄',
  rare:              '✦',
};

const BRANCH_LABELS = {
  A: 'Branch A',
  B: 'Branch B',
  C: 'Branch C',
  D: 'Branch D',
};

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

export default function DraftNodeScreen({
  node,
  buckets,
  primaryFaction,
  secondaryFaction,
  draftedIds,
  isFork = false,
  branchSpecialTypes = {},
  onComplete,
}) {
  const [step, setStep] = useState('bucket');  // 'bucket' | 'cards'
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [selectedBranchIdx, setSelectedBranchIdx] = useState(null); // for fork
  const [cards, setCards] = useState([]);

  function handleBucketPick(bucketId, branchIdx) {
    // Draw 3 cards from the bucket
    const drawn = drawBucketCards(bucketId, primaryFaction, secondaryFaction, draftedIds, false);
    setSelectedBucket(bucketId);
    if (isFork) setSelectedBranchIdx(branchIdx);
    setCards(drawn);
    setStep('cards');
  }

  function handleCardPick(cardId) {
    // Determine committed branch for fork
    let committedBranch = undefined;
    if (isFork && selectedBranchIdx !== null) {
      const BRANCHES = ['A', 'B', 'C', 'D'];
      committedBranch = BRANCHES[selectedBranchIdx];
    }
    onComplete({ cardId, bucketId: selectedBucket, committedBranch });
  }

  return (
    <div style={scrn}>
      <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ ...heading, fontSize: 18 }}>
            {isFork ? 'CHOOSE YOUR PATH' : 'NODE ' + node.position}
          </h2>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#6a6a8a' }}>
            {step === 'bucket' ? 'Choose a bucket' : 'Choose a card'}
          </span>
        </div>

        {step === 'bucket' && (
          <BucketStep
            buckets={buckets}
            isFork={isFork}
            branchSpecialTypes={branchSpecialTypes}
            primaryFaction={primaryFaction}
            secondaryFaction={secondaryFaction}
            onPick={handleBucketPick}
          />
        )}

        {step === 'cards' && (
          <CardStep
            cards={cards}
            bucketId={selectedBucket}
            onPick={handleCardPick}
          />
        )}
      </div>
    </div>
  );
}

// ── Bucket Step ───────────────────────────────────────────────────────────────

function BucketStep({ buckets, isFork, branchSpecialTypes, primaryFaction, secondaryFaction, onPick }) {
  const BRANCHES = ['A', 'B', 'C', 'D'];

  return (
    <>
      {isFork && (
        <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14, margin: 0 }}>
          Your bucket choice determines your branch. Each branch ends at a different special node.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {buckets.map((bucketId, i) => {
          const isMystery = bucketId === BUCKET_IDS.MYSTERY;
          const branch = isFork ? BRANCHES[i] : null;
          const specialType = isFork && branch ? branchSpecialTypes[branch] : null;
          return (
            <BucketCard
              key={i}
              bucketId={bucketId}
              isMystery={isMystery}
              isFork={isFork}
              branch={branch}
              specialType={specialType}
              primaryFaction={primaryFaction}
              secondaryFaction={secondaryFaction}
              onPick={() => onPick(bucketId, i)}
            />
          );
        })}
      </div>
    </>
  );
}

function BucketCard({ bucketId, isMystery, isFork, branch, specialType, primaryFaction, secondaryFaction, onPick }) {
  const label = BUCKET_LABELS[bucketId] ?? bucketId;
  const desc  = BUCKET_DESCRIPTIONS[bucketId] ?? '';

  // Color for mystery vs normal
  let accentColor = '#C9A84C';
  if (isMystery) accentColor = '#d060e8';
  else if (bucketId === BUCKET_IDS.AURA)    accentColor = '#3B82F6';
  else if (bucketId === BUCKET_IDS.RUSH)    accentColor = '#22C55E';
  else if (bucketId === BUCKET_IDS.RESTORE) accentColor = '#A855F7';
  else if (bucketId === BUCKET_IDS.HIDDEN)  accentColor = '#EF4444';

  // For fork, show special destination info
  let specialInfo = null;
  if (isFork && specialType) {
    const BRANCH_SPECIAL_LABELS = {
      primary_faction:   `${ATTRIBUTES[primaryFaction]?.name ?? 'Primary'} Faction`,
      secondary_faction: `${ATTRIBUTES[secondaryFaction]?.name ?? 'Secondary'} Faction`,
      swap:              'Swap Node',
      rare:              'Rare Node',
    };
    const icon = BRANCH_SPECIAL_ICONS[specialType] ?? '?';
    specialInfo = `${icon} ${BRANCH_SPECIAL_LABELS[specialType]}`;
  }

  return (
    <button
      onClick={onPick}
      style={{
        background: '#0d0d1a',
        border: `1px solid ${accentColor}44`,
        borderTop: `3px solid ${accentColor}`,
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
        e.currentTarget.style.borderColor = `${accentColor}88`;
        e.currentTarget.style.boxShadow = `0 0 12px ${accentColor}33`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = `${accentColor}44`;
        e.currentTarget.style.boxShadow = '';
      }}
    >
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700, color: accentColor, letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: 13, color: '#9a9ab0' }}>
        {isMystery ? 'Unknown — anything possible' : desc}
      </span>
      {specialInfo && (
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', marginTop: 4 }}>
          Leads to: {specialInfo}
        </span>
      )}
    </button>
  );
}

// ── Card Step ─────────────────────────────────────────────────────────────────

function CardStep({ cards, bucketId, onPick }) {
  const label = BUCKET_LABELS[bucketId] ?? bucketId;

  if (cards.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ color: '#6a6a8a', fontFamily: "'Crimson Text', serif" }}>
          No cards available in this bucket.
        </p>
        <button
          style={btnSecondary}
          onClick={() => onPick('_skip')}
        >
          Skip pick
        </button>
      </div>
    );
  }

  return (
    <>
      <p style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#6a6a8a', letterSpacing: '0.08em', margin: 0 }}>
        BUCKET: {label.toUpperCase()} — Pick 1 of {cards.length}
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {cards.map(card => (
          <FullCard key={card.id} card={card} onClick={() => onPick(card.id)} />
        ))}
      </div>
    </>
  );
}

// ── Full Card ─────────────────────────────────────────────────────────────────

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
      {/* Cost + Name */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <AutoSizeText maxFontSize={11} style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, color: '#e8e8f0', lineHeight: 1.3, flex: 1 }}>
          {isLegendary && <span style={{ color: '#C9A84C', marginRight: 2 }}>♛</span>}
          {card.name}
        </AutoSizeText>
        <span style={{ background: '#C9A84C', color: '#0a0a14', fontFamily: "'Cinzel', serif", fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0, marginLeft: 4 }}>
          {card.cost}
        </span>
      </div>

      {/* Art */}
      {imageUrl ? (
        <img src={imageUrl} alt={card.name} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 4 }} />
      ) : (
        <div style={{ width: '100%', height: 90, background: `${attrColor}22`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: attrColor, fontSize: 10, fontFamily: "'Cinzel', serif" }}>{card.type?.toUpperCase()}</span>
        </div>
      )}

      {/* Stats */}
      {card.type === 'unit' && (
        <div style={{ display: 'flex', gap: 6, fontSize: 10, color: '#a0a0c0', fontFamily: 'monospace' }}>
          <span>⚔ {card.atk}</span>
          <span>❤ {card.hp}</span>
          <span>⚡ {card.spd}</span>
        </div>
      )}

      {/* Rules */}
      {card.rules ? (
        <p style={{ fontSize: 9, color: '#8a8aa0', margin: 0, lineHeight: 1.4, height: 38, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {card.rules}
        </p>
      ) : null}

      {/* Rarity + faction */}
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

// ── Button styles ─────────────────────────────────────────────────────────────
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
