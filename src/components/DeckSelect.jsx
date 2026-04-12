import { useState } from 'react';
import { FACTION_INFO, buildDeck, parseDeckSpec } from '../engine/cards.js';
import { calculateResonance, RESONANCE_THRESHOLDS } from '../engine/attributes.js';
import { CHAMPIONS } from '../engine/champions.js';
import { getCardImageUrl } from '../supabase.js';
import { ATTR_SYMBOLS } from '../assets/attributeSymbols.jsx';

const FACTION_ATTRIBUTE = {
  human: 'light',
  beast: 'primal',
  elf:   'mystic',
  demon: 'dark',
};

function getResonanceInfo(factionId) {
  const cards = buildDeck(factionId);
  const score = calculateResonance(cards, FACTION_ATTRIBUTE[factionId]);
  const tier = score >= RESONANCE_THRESHOLDS.ascended ? 'ascended'
    : score >= RESONANCE_THRESHOLDS.attuned ? 'attuned'
    : 'none';
  return { score, tier };
}

function loadSavedDecks() {
  try {
    const decks = JSON.parse(localStorage.getItem('gridholm_saved_decks') || '[]');
    return Array.isArray(decks) ? decks : [];
  } catch {
    return [];
  }
}

function savedDeckToSpec(deck) {
  return JSON.stringify({
    type: 'custom',
    champion: deck.primaryAttribute,
    primaryAttr: deck.primaryAttribute,
    secondaryAttr: deck.secondaryAttribute,
    cards: deck.cards,
    deckName: deck.name,
  });
}

function getSelectedDeckLabel(selectedDeck) {
  if (!selectedDeck) return null;
  const spec = parseDeckSpec(selectedDeck);
  if (spec) return { name: spec.deckName ?? 'Custom Deck', color: '#C9A84C' };
  return { name: FACTION_INFO[selectedDeck]?.name ?? 'Unknown', color: FACTION_INFO[selectedDeck]?.color ?? '#C9A84C' };
}

const ATTR_COLORS = {
  light: '#F0E6D2',
  primal: '#22C55E',
  mystic: '#A855F7',
  dark: '#EF4444',
};

const FACTIONS = Object.values(FACTION_INFO);

const FACTION_GRADIENTS = {
  human: 'linear-gradient(135deg, #f8f0e0, #F0E6D2, #c4a882)',
  beast: 'linear-gradient(135deg, #5edb8a, #22C55E, #0f6b30)',
  elf:   'linear-gradient(135deg, #c988fb, #A855F7, #6b1fa8)',
  demon: 'linear-gradient(135deg, #f47a7a, #EF4444, #8b1a1a)',
};

export default function DeckSelect({ onSelect, waitingForOpponent = false, selectedDeck = null, opponentSelected = false, isRematch = false }) {
  const [savedDecks] = useState(loadSavedDecks);

  if (waitingForOpponent) {
    const label = getSelectedDeckLabel(selectedDeck);
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '360px' }}>
          <h1 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '28px',
            fontWeight: 600,
            color: '#C9A84C',
            letterSpacing: '0.2em',
            marginBottom: '16px',
          }}>GRIDHOLM</h1>
          {isRematch && (
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#C9A84C', marginBottom: '12px' }}>Rematch! Select your deck.</p>
          )}
          <div style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3a',
            borderRadius: '8px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <PlayerStatusRow youSelected={true} opponentSelected={opponentSelected} />
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: '16px',
                fontWeight: 600,
                color: label?.color || '#C9A84C',
              }}
            >
              {label?.name ?? 'Unknown'} selected
            </div>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#4a4a6a', fontSize: '14px' }}>Waiting for opponent to choose their deck…</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '2px solid #C9A84C',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      gap: '24px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '32px',
          fontWeight: 600,
          color: '#C9A84C',
          letterSpacing: '0.2em',
          marginBottom: '4px',
        }}>GRIDHOLM</h1>
        {isRematch
          ? <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#C9A84C', fontSize: '15px' }}>Rematch! Select your deck.</p>
          : <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#e2e8f0', fontSize: '15px' }}>Choose your deck</p>
        }
      </div>

      {opponentSelected !== null && (
        <PlayerStatusRow youSelected={false} opponentSelected={opponentSelected} />
      )}

      {savedDecks.length > 0 && (
        <div style={{ width: '100%', maxWidth: '56rem' }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            color: '#6a6a8a',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}>Your Saved Decks</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {savedDecks.map((deck, i) => (
              <SavedDeckCard
                key={i}
                deck={deck}
                onSelect={() => onSelect(savedDeckToSpec(deck))}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '56rem' }}>
        {savedDecks.length > 0 && (
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            color: '#6a6a8a',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}>Starter Decks</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          {FACTIONS.map(faction => (
            <FactionCard
              key={faction.id}
              faction={faction}
              resonance={getResonanceInfo(faction.id)}
              onSelect={() => onSelect(faction.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SavedDeckCard({ deck, onSelect }) {
  const attr = deck.primaryAttribute;
  const color = ATTR_COLORS[attr] ?? '#C9A84C';
  const AttrCrystal = ATTR_SYMBOLS[attr] ?? null;
  const champImage = CHAMPIONS[attr]?.image;
  const champImageUrl = getCardImageUrl(champImage);

  return (
    <div
      style={{
        background: '#0d0d1a',
        border: `1px solid ${color}55`,
        borderLeft: `3px solid ${color}`,
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
        minWidth: '160px',
        maxWidth: '220px',
        flex: '1 1 160px',
      }}
      onClick={onSelect}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = `inset 0 0 16px ${color}33`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {champImageUrl && (
        <div style={{ height: '80px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
          <img src={champImageUrl} alt="" onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {AttrCrystal && <AttrCrystal size={16} />}
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color }}>{deck.name}</span>
      </div>
      <span style={{ fontFamily: "'Crimson Text', serif", fontSize: '12px', color: '#6a6a8a' }}>
        {deck.cards?.length ?? 0} cards · {attr}
      </span>
      <button
        style={{
          marginTop: 'auto',
          padding: '6px 8px',
          borderRadius: '4px',
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          fontWeight: 600,
          color: '#0a0a0f',
          background: `linear-gradient(135deg, ${color}cc, ${color})`,
          border: 'none',
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        Select
      </button>
    </div>
  );
}

function PlayerStatusRow({ youSelected, opponentSelected }) {
  const pillStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    borderRadius: '99px',
    border: `1px solid ${active ? '#C9A84C' : '#2a2a3a'}`,
    fontFamily: "'Cinzel', serif",
    fontSize: '11px',
    color: active ? '#C9A84C' : '#4a4a6a',
  });
  return (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
      <div style={pillStyle(youSelected)}>
        {youSelected ? '✓' : '…'} You
      </div>
      <div style={pillStyle(opponentSelected)}>
        {opponentSelected ? '✓' : '…'} Opponent
      </div>
    </div>
  );
}

function ResonanceBadge({ tier, score }) {
  const TIER_STYLE = {
    ascended: { color: '#C9A84C', label: 'Ascended' },
    attuned:  { color: '#ffffff', label: 'Attuned'  },
    none:     { color: '#4a4a6a', label: 'Unaligned' },
  };
  const { color, label } = TIER_STYLE[tier] ?? TIER_STYLE.none;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '11px',
        color,
        letterSpacing: '0.06em',
      }}>
        {label}
      </span>
      <span style={{ width: '1px', height: '10px', background: '#3a3a5a', display: 'inline-block', flexShrink: 0 }} />
      <span style={{
        fontFamily: "'Crimson Text', serif",
        fontSize: '11px',
        color: '#4a4a6a',
      }}>
        {score}
      </span>
    </div>
  );
}

function FactionCard({ faction, resonance, onSelect }) {
  const champAttribute = FACTION_ATTRIBUTE[faction.id];
  const champImage = champAttribute ? CHAMPIONS[champAttribute]?.image : null;
  const champImageUrl = getCardImageUrl(champImage);
  const AttrCrystal = champAttribute ? ATTR_SYMBOLS[champAttribute] : null;
  return (
    <div
      style={{
        background: '#0d0d1a',
        border: `1px solid ${faction.color}55`,
        borderLeft: `3px solid ${faction.color}`,
        borderRadius: '8px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'transform 0.15s, border-color 0.15s',
      }}
      onClick={onSelect}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = `inset 0 0 16px ${faction.color}33`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {champImageUrl && (
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          <img src={champImageUrl} alt={CHAMPIONS[champAttribute]?.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          {AttrCrystal && <AttrCrystal size={20} />}
          <h2
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '16px',
              fontWeight: 600,
              color: faction.color,
              margin: 0,
            }}
          >
            {faction.name}
          </h2>
        </div>
        {resonance && <ResonanceBadge tier={resonance.tier} score={resonance.score} />}
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          color: '#4a4a6a',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {faction.mechanic}
        </span>
      </div>

      <p style={{
        fontFamily: "'Crimson Text', serif",
        fontSize: '14px',
        color: '#8a8aaa',
        lineHeight: 1.6,
        flex: 1,
      }}>
        {faction.description}
      </p>

      <button
        style={{
          width: '100%',
          padding: '8px',
          borderRadius: '4px',
          fontFamily: "'Cinzel', serif",
          fontSize: '12px',
          fontWeight: 600,
          color: '#0a0a0f',
          background: FACTION_GRADIENTS[faction.id] || faction.color,
          border: 'none',
          boxShadow: `0 2px 8px ${faction.color}60`,
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        Select
      </button>
    </div>
  );
}
