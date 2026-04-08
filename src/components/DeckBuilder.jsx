import { useState, useMemo, useEffect } from 'react';
import { CHAMPIONS } from '../engine/champions.js';
import { ATTRIBUTES, calculateResonance, RESONANCE_THRESHOLDS } from '../engine/attributes.js';
import { CARD_DB } from '../engine/cards.js';
import { getCardImageUrl } from '../supabase.js';
import Card from './Card.jsx';

const ATTRIBUTE_ORDER = ['light', 'primal', 'mystic', 'dark'];

const CHAMPION_DESCRIPTIONS = {
  light: 'A radiant protector who shields allies and fortifies the battle line.',
  primal: 'A savage warlord who empowers allies and rewards conquest.',
  mystic: 'A nature-sage who nurtures life and summons an endless grove.',
  dark: 'A dark sorcerer who drains vitality to fuel terrible power.',
};

const FACTION_NAMES = {
  light: 'Humans',
  primal: 'Beasts',
  mystic: 'Elves',
  dark: 'Demons',
};

const ATTR_GRADIENTS = {
  light: 'linear-gradient(135deg, #74aef9, #3B82F6, #1a4b99)',
  primal: 'linear-gradient(135deg, #5edb8a, #22C55E, #0f6b30)',
  mystic: 'linear-gradient(135deg, #c988fb, #A855F7, #6b1fa8)',
  dark: 'linear-gradient(135deg, #f47a7a, #EF4444, #8b1a1a)',
};

export default function DeckBuilder({ onBack, onNext }) {
  const [step, setStep] = useState('champion');
  const [selectedChampion, setSelectedChampion] = useState(null);
  const [secondaryAttr, setSecondaryAttr] = useState(null);
  // deck: { [cardId]: count }
  const [deck, setDeck] = useState({});
  const [deckName, setDeckName] = useState('My Deck');

  function handleChampionSelect(attributeKey) {
    setSelectedChampion(attributeKey);
    setStep('secondary');
  }

  function handleSecondarySelect(attributeKey) {
    setSecondaryAttr(attributeKey);
    setStep('browser');
  }

  function handleAddCard(cardId) {
    const card = CARD_DB[cardId];
    if (!card) return;
    const maxCopies = card.legendary ? 1 : 2;
    const current = deck[cardId] || 0;
    if (current >= maxCopies) return;
    setDeck(prev => ({ ...prev, [cardId]: current + 1 }));
  }

  function handleRemoveCard(cardId) {
    const current = deck[cardId] || 0;
    if (current <= 0) return;
    setDeck(prev => {
      const next = { ...prev, [cardId]: current - 1 };
      if (next[cardId] === 0) delete next[cardId];
      return next;
    });
  }

  function handleClearDeck() {
    setDeck({});
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: step === 'browser' ? 'flex-start' : 'center',
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
        <p style={{
          fontFamily: "'Crimson Text', serif",
          fontStyle: 'italic',
          color: '#e2e8f0',
          fontSize: '15px',
        }}>
          {step === 'champion' ? 'Choose your champion' :
           step === 'secondary' ? 'Choose a secondary attribute' :
           'Build your deck'}
        </p>
      </div>

      {step === 'champion' && (
        <ChampionStep onSelect={handleChampionSelect} onBack={onBack} />
      )}

      {step === 'secondary' && (
        <SecondaryStep
          primaryAttribute={selectedChampion}
          onSelect={handleSecondarySelect}
          onBack={() => setStep('champion')}
        />
      )}

      {step === 'browser' && (
        <CardBrowser
          primaryAttr={selectedChampion}
          secondaryAttr={secondaryAttr}
          deck={deck}
          deckName={deckName}
          onDeckNameChange={setDeckName}
          onAddCard={handleAddCard}
          onRemoveCard={handleRemoveCard}
          onClearDeck={handleClearDeck}
          onBack={() => setStep('secondary')}
          onNext={onNext ? () => onNext(selectedChampion, secondaryAttr, deck) : null}
        />
      )}
    </div>
  );
}

// ── Card Browser ──────────────────────────────────────────────────────────────

const ATTR_UNIT_TYPE = {
  light: 'Human',
  primal: 'Beast',
  mystic: 'Elf',
  dark: 'Demon',
};

const COST_RANGES = [
  { label: 'All', test: () => true },
  { label: '1–2', test: c => c.cost <= 2 },
  { label: '3–4', test: c => c.cost === 3 || c.cost === 4 },
  { label: '5+',  test: c => c.cost >= 5 },
];

function CardBrowser({ primaryAttr, secondaryAttr, deck, deckName, onDeckNameChange, onAddCard, onRemoveCard, onClearDeck, onBack, onNext }) {
  const [factionFilter, setFactionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [costFilter, setCostFilter] = useState(0); // index into COST_RANGES
  const [keywordFilter, setKeywordFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const primaryUnitType = ATTR_UNIT_TYPE[primaryAttr];
  const secondaryUnitType = ATTR_UNIT_TYPE[secondaryAttr];
  const primaryAttrObj = ATTRIBUTES[primaryAttr];
  const secondaryAttrObj = ATTRIBUTES[secondaryAttr];

  // Build legal card pool (no tokens)
  const legalCards = useMemo(() => {
    return Object.values(CARD_DB).filter(c => {
      if (c.token) return false;
      return c.attribute === primaryAttr || c.attribute === secondaryAttr || c.attribute === 'neutral';
    });
  }, [primaryAttr, secondaryAttr]);

  // Group: primary, secondary, neutral
  const groups = useMemo(() => {
    const primary = legalCards.filter(c => c.attribute === primaryAttr).sort((a, b) => a.cost - b.cost);
    const secondary = legalCards.filter(c => c.attribute === secondaryAttr).sort((a, b) => a.cost - b.cost);
    const neutral = legalCards.filter(c => c.attribute === 'neutral').sort((a, b) => a.cost - b.cost);
    return [
      { key: 'primary', label: FACTION_NAMES[primaryAttr], attr: primaryAttr, color: primaryAttrObj.color, cards: primary },
      { key: 'secondary', label: FACTION_NAMES[secondaryAttr], attr: secondaryAttr, color: secondaryAttrObj.color, cards: secondary },
      { key: 'neutral', label: 'Neutral', attr: 'neutral', color: '#9CA3AF', cards: neutral },
    ];
  }, [legalCards, primaryAttr, secondaryAttr, primaryAttrObj, secondaryAttrObj]);

  // Apply filters
  function applyFilters(cards) {
    return cards.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (!COST_RANGES[costFilter].test(c)) return false;
      if (keywordFilter !== 'all') {
        if (keywordFilter === 'rush' && !c.rush) return false;
        if (keywordFilter === 'hidden' && !c.hidden) return false;
        if (keywordFilter === 'aura' && !c.aura) return false;
        if (keywordFilter === 'action' && !c.action) return false;
        if (keywordFilter === 'legendary' && !c.legendary) return false;
      }
      return true;
    });
  }

  const filteredGroups = useMemo(() => {
    return groups
      .filter(g => factionFilter === 'all' || g.key === factionFilter)
      .map(g => ({ ...g, cards: applyFilters(g.cards) }))
      .filter(g => g.cards.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, factionFilter, typeFilter, costFilter, keywordFilter]);

  const deckCount = Object.values(deck).reduce((s, n) => s + n, 0);

  const browserContent = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Champion summary bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        background: '#0d0d1a',
        border: '1px solid #2a2a3a',
        borderRadius: '8px',
        padding: '10px 16px',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Champion:</span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: primaryAttrObj.color }}>
          {CHAMPIONS[primaryAttr].name} · {primaryAttrObj.name}
        </span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Secondary:</span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: secondaryAttrObj.color }}>
          {secondaryAttrObj.name}
        </span>
        {isMobile && (
          <button
            style={{
              marginLeft: 'auto',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              fontWeight: 600,
              color: '#C9A84C',
              background: 'transparent',
              border: '1px solid #C9A84C60',
              borderRadius: '4px',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
            onClick={() => setDrawerOpen(o => !o)}
          >
            Deck ({deckCount}/30) {drawerOpen ? '▼' : '▲'}
          </button>
        )}
        {!isMobile && (
          <span style={{ marginLeft: 'auto', fontFamily: "'Cinzel', serif", fontSize: '13px', color: deckCount >= 20 ? '#C9A84C' : '#6a6a8a' }}>
            {deckCount}/30 cards
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        background: '#0d0d1a',
        border: '1px solid #2a2a3a',
        borderRadius: '8px',
        padding: '10px 16px',
      }}>
        <FilterGroup label="Faction">
          {[
            { key: 'all', label: 'All' },
            { key: 'primary', label: FACTION_NAMES[primaryAttr] },
            { key: 'secondary', label: FACTION_NAMES[secondaryAttr] },
            { key: 'neutral', label: 'Neutral' },
          ].map(opt => (
            <FilterBtn key={opt.key} active={factionFilter === opt.key} onClick={() => setFactionFilter(opt.key)}>
              {opt.label}
            </FilterBtn>
          ))}
        </FilterGroup>

        <FilterGroup label="Type">
          {[{ key: 'all', label: 'All' }, { key: 'unit', label: 'Unit' }, { key: 'spell', label: 'Spell' }].map(opt => (
            <FilterBtn key={opt.key} active={typeFilter === opt.key} onClick={() => setTypeFilter(opt.key)}>
              {opt.label}
            </FilterBtn>
          ))}
        </FilterGroup>

        <FilterGroup label="Cost">
          {COST_RANGES.map((r, i) => (
            <FilterBtn key={r.label} active={costFilter === i} onClick={() => setCostFilter(i)}>
              {r.label}
            </FilterBtn>
          ))}
        </FilterGroup>

        <FilterGroup label="Keyword">
          {[
            { key: 'all', label: 'All' },
            { key: 'rush', label: 'Rush' },
            { key: 'hidden', label: 'Hidden' },
            { key: 'aura', label: 'Aura' },
            { key: 'action', label: 'Action' },
            { key: 'legendary', label: 'Legendary' },
          ].map(opt => (
            <FilterBtn key={opt.key} active={keywordFilter === opt.key} onClick={() => setKeywordFilter(opt.key)}>
              {opt.label}
            </FilterBtn>
          ))}
        </FilterGroup>
      </div>

      {/* Card groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {filteredGroups.length === 0 && (
          <p style={{ fontFamily: "'Crimson Text', serif", color: '#4a4a6a', fontSize: '15px', textAlign: 'center', padding: '32px 0' }}>
            No cards match the current filters.
          </p>
        )}
        {filteredGroups.map(group => (
          <div key={group.key}>
            <h3 style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              fontWeight: 600,
              color: group.color,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '10px',
              paddingBottom: '6px',
              borderBottom: `1px solid ${group.color}33`,
            }}>
              {group.label}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {group.cards.map(card => {
                const copies = deck[card.id] || 0;
                const maxCopies = card.legendary ? 1 : 2;
                const atLimit = copies >= maxCopies;
                return (
                  <BrowserCard
                    key={card.id}
                    card={card}
                    copies={copies}
                    atLimit={atLimit}
                    onClick={() => onAddCard(card.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: isMobile ? '120px' : '32px' }}>
        <button
          style={backBtnStyle}
          onClick={onBack}
          onMouseEnter={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C60'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6a6a8a'; e.currentTarget.style.borderColor = '#2a2a3a'; }}
        >
          ← Back
        </button>
        {onNext && (
          <button
            style={{
              background: deckCount > 0 ? 'linear-gradient(135deg, #C9A84C, #a07830)' : '#2a2a3a',
              color: deckCount > 0 ? '#0a0a0f' : '#4a4a6a',
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              padding: '10px 28px',
              cursor: deckCount > 0 ? 'pointer' : 'default',
              letterSpacing: '0.04em',
            }}
            onClick={deckCount > 0 ? onNext : undefined}
          >
            Continue ({deckCount}) →
          </button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ width: '100%', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
        {browserContent}
        {/* Mobile bottom drawer */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          transform: drawerOpen ? 'translateY(0)' : 'translateY(calc(100% - 48px))',
          transition: 'transform 0.3s ease',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <button
            style={{
              height: '48px',
              background: '#141428',
              border: '1px solid #2a2a3a',
              borderBottom: 'none',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onClick={() => setDrawerOpen(o => !o)}
          >
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: '#C9A84C', letterSpacing: '0.06em' }}>
              DECK ({deckCount}/30)
            </span>
            <span style={{ color: '#C9A84C', fontSize: '10px' }}>{drawerOpen ? '▼' : '▲'}</span>
          </button>
          <div style={{ flex: 1, overflowY: 'auto', background: '#0d0d1a', border: '1px solid #2a2a3a', borderTop: 'none' }}>
            <DeckPanel
              primaryAttr={primaryAttr}
              secondaryAttr={secondaryAttr}
              deck={deck}
              deckName={deckName}
              onDeckNameChange={onDeckNameChange}
              onRemoveCard={onRemoveCard}
              onClearDeck={onClearDeck}
              onNext={onNext}
              deckCount={deckCount}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '1280px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      {browserContent}
      {/* Desktop sidebar */}
      <div style={{
        width: '280px',
        flexShrink: 0,
        position: 'sticky',
        top: '16px',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        background: '#0d0d1a',
        border: '1px solid #2a2a3a',
        borderRadius: '8px',
      }}>
        <DeckPanel
          primaryAttr={primaryAttr}
          secondaryAttr={secondaryAttr}
          deck={deck}
          deckName={deckName}
          onDeckNameChange={onDeckNameChange}
          onRemoveCard={onRemoveCard}
          onClearDeck={onClearDeck}
          onNext={onNext}
          deckCount={deckCount}
        />
      </div>
    </div>
  );
}

function BrowserCard({ card, copies, atLimit, onClick }) {
  return (
    <div style={{ position: 'relative', cursor: atLimit ? 'default' : 'pointer' }} onClick={atLimit ? undefined : onClick}>
      <div style={{ opacity: atLimit ? 0.45 : 1, transition: 'opacity 0.15s' }}>
        <Card card={card} isSelected={false} isPlayable={!atLimit} onClick={undefined} />
      </div>
      {copies > 0 && (
        <div style={{
          position: 'absolute',
          top: '-6px',
          right: '-6px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#C9A84C',
          color: '#0a0a0f',
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #0a0a0f',
          pointerEvents: 'none',
        }}>
          {copies}
        </div>
      )}
    </div>
  );
}

// ── Attribute Wheel ───────────────────────────────────────────────────────────

const WHEEL_POSITIONS = {
  light:  { cx: 60, cy: 12 },
  primal: { cx: 12, cy: 60 },
  dark:   { cx: 60, cy: 108 },
  mystic: { cx: 108, cy: 60 },
};

function AttributeWheel({ primaryAttr, secondaryAttr }) {
  const primary = ATTRIBUTES[primaryAttr];
  // Derive all connections to draw from primary's perspective
  const allKeys = ['light', 'primal', 'dark', 'mystic'];
  const lines = [];
  const seen = new Set();
  for (const a of allKeys) {
    for (const b of allKeys) {
      if (a === b) continue;
      const key = [a, b].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      const attrA = ATTRIBUTES[a];
      const isFriendly = attrA.friendly.includes(b);
      const isEnemy = attrA.enemy.includes(b);
      if (!isFriendly && !isEnemy) continue;
      lines.push({
        key,
        x1: WHEEL_POSITIONS[a].cx, y1: WHEEL_POSITIONS[a].cy,
        x2: WHEEL_POSITIONS[b].cx, y2: WHEEL_POSITIONS[b].cy,
        color: isFriendly ? '#22C55E' : '#EF4444',
        opacity: (a === primaryAttr || b === primaryAttr || a === secondaryAttr || b === secondaryAttr) ? 0.7 : 0.2,
      });
    }
  }

  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" style={{ display: 'block' }}>
      {/* Lines */}
      {lines.map(l => (
        <line
          key={l.key}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={l.color}
          strokeWidth="1.5"
          strokeOpacity={l.opacity}
        />
      ))}
      {/* Nodes */}
      {allKeys.map(key => {
        const pos = WHEEL_POSITIONS[key];
        const attr = ATTRIBUTES[key];
        const isPrimary = key === primaryAttr;
        const isSecondary = key === secondaryAttr;
        const r = isPrimary ? 11 : isSecondary ? 9 : 7;
        const opacity = isPrimary || isSecondary ? 1 : 0.3;
        return (
          <g key={key} opacity={opacity}>
            <circle
              cx={pos.cx} cy={pos.cy} r={r}
              fill={isPrimary ? attr.color : '#0d0d1a'}
              stroke={attr.color}
              strokeWidth={isPrimary ? 0 : 1.5}
            />
            <text
              x={pos.cx} y={pos.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isPrimary ? '6' : '5'}
              fontFamily="Cinzel, serif"
              fill={isPrimary ? '#0a0a0f' : attr.color}
              fontWeight="600"
            >
              {attr.name[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Deck Panel ────────────────────────────────────────────────────────────────

function DeckPanel({ primaryAttr, secondaryAttr, deck, deckName, onDeckNameChange, onRemoveCard, onClearDeck, onNext, deckCount }) {
  const [confirmClear, setConfirmClear] = useState(false);

  const primary = ATTRIBUTES[primaryAttr];
  const secondary = ATTRIBUTES[secondaryAttr];

  // Expand deck to card array for resonance calculation
  const deckCards = useMemo(() => {
    return Object.entries(deck).flatMap(([id, count]) => {
      const card = CARD_DB[id];
      return card ? Array(count).fill(card) : [];
    });
  }, [deck]);

  const resonance = useMemo(() => calculateResonance(deckCards, primaryAttr), [deckCards, primaryAttr]);
  const tier = resonance >= RESONANCE_THRESHOLDS.ascended ? 'ascended'
    : resonance >= RESONANCE_THRESHOLDS.attuned ? 'attuned'
    : 'none';

  const TIER_STYLE = {
    ascended: { color: '#C9A84C', label: 'Ascended' },
    attuned:  { color: '#ffffff', label: 'Attuned' },
    none:     { color: '#4a4a6a', label: 'Unaligned' },
  };

  // Attribute breakdown
  const breakdown = useMemo(() => {
    const counts = { primary: 0, friendly: 0, enemy: 0, neutral: 0 };
    for (const card of deckCards) {
      if (card.attribute === primaryAttr) counts.primary++;
      else if (primary.friendly.includes(card.attribute)) counts.friendly++;
      else if (primary.enemy.includes(card.attribute)) counts.enemy++;
      else counts.neutral++;
    }
    return counts;
  }, [deckCards, primaryAttr, primary]);

  // Cards grouped by faction, sorted by cost
  const groupedCards = useMemo(() => {
    const groups = [
      { key: 'primary', label: primary.name, color: primary.color, attr: primaryAttr },
      { key: 'secondary', label: secondary.name, color: secondary.color, attr: secondaryAttr },
      { key: 'neutral', label: 'Neutral', color: '#9CA3AF', attr: 'neutral' },
    ];
    return groups.map(g => {
      const entries = Object.entries(deck)
        .filter(([id]) => CARD_DB[id]?.attribute === g.attr)
        .map(([id, count]) => ({ card: CARD_DB[id], count }))
        .filter(e => e.card)
        .sort((a, b) => a.card.cost - b.card.cost);
      return { ...g, entries };
    }).filter(g => g.entries.length > 0);
  }, [deck, primaryAttr, secondaryAttr, primary, secondary]);

  const maxResonance = 60; // 30 cards × max 2 pts

  return (
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Deck name */}
      <input
        value={deckName}
        onChange={e => onDeckNameChange(e.target.value)}
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid #2a2a3a',
          color: '#C9A84C',
          fontFamily: "'Cinzel', serif",
          fontSize: '14px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          width: '100%',
          padding: '4px 0',
          outline: 'none',
        }}
        onFocus={e => { e.target.style.borderBottomColor = '#C9A84C60'; }}
        onBlur={e => { e.target.style.borderBottomColor = '#2a2a3a'; }}
      />

      {/* Card count + resonance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: deckCount >= 30 ? '#C9A84C' : '#6a6a8a' }}>
          {deckCount}/30
        </span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: TIER_STYLE[tier].color, letterSpacing: '0.06em' }}>
          {TIER_STYLE[tier].label} · {resonance}
        </span>
      </div>

      {/* Resonance bar */}
      <div style={{ background: '#1a1a2a', borderRadius: '4px', height: '6px', position: 'relative' }}>
        <div style={{
          height: '100%',
          borderRadius: '4px',
          width: `${Math.min(100, (resonance / maxResonance) * 100)}%`,
          background: tier === 'ascended' ? 'linear-gradient(90deg, #3B82F6, #C9A84C)'
            : tier === 'attuned' ? 'linear-gradient(90deg, #3B82F6, #ffffff)'
            : '#3B82F6',
          transition: 'width 0.3s ease',
        }} />
        {/* Attuned threshold marker */}
        <div style={{
          position: 'absolute',
          top: '-2px',
          left: `${(RESONANCE_THRESHOLDS.attuned / maxResonance) * 100}%`,
          width: '1px',
          height: '10px',
          background: '#ffffff44',
        }} />
        {/* Ascended threshold marker */}
        <div style={{
          position: 'absolute',
          top: '-2px',
          left: `${(RESONANCE_THRESHOLDS.ascended / maxResonance) * 100}%`,
          width: '1px',
          height: '10px',
          background: '#C9A84C66',
        }} />
      </div>

      {/* Attribute wheel */}
      <div style={{ width: '80px', margin: '0 auto' }}>
        <AttributeWheel primaryAttr={primaryAttr} secondaryAttr={secondaryAttr} />
      </div>

      {/* Attribute breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
        {[
          { label: 'Primary', count: breakdown.primary, color: primary.color },
          { label: 'Friendly', count: breakdown.friendly, color: '#22C55E' },
          { label: 'Enemy', count: breakdown.enemy, color: '#EF4444' },
          { label: 'Neutral', count: breakdown.neutral, color: '#9CA3AF' },
        ].map(b => (
          <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', background: '#141428', borderRadius: '3px' }}>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: b.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{b.label}</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: b.count > 0 ? b.color : '#2a2a4a' }}>{b.count}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: '#1a1a2a' }} />

      {/* Card list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {groupedCards.length === 0 && (
          <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#2a2a4a', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
            No cards yet
          </p>
        )}
        {groupedCards.map(group => (
          <div key={group.key}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '9px',
              color: group.color,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '4px',
              opacity: 0.8,
            }}>
              {group.label}
            </div>
            {group.entries.map(({ card, count }) => (
              <div
                key={card.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onClick={() => onRemoveCard(card.id)}
                onMouseEnter={e => { e.currentTarget.style.background = '#1a1a2a'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                title="Click to remove one copy"
              >
                <span style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '3px',
                  background: '#141428',
                  border: `1px solid ${group.color}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '9px',
                  color: '#6a6a8a',
                  flexShrink: 0,
                }}>
                  {card.cost}
                </span>
                <span style={{
                  flex: 1,
                  fontFamily: "'Cinzel', serif",
                  fontSize: '10px',
                  color: '#b0b0c8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {card.name}
                </span>
                <span style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: '10px',
                  color: count === 2 ? '#C9A84C' : '#4a4a6a',
                  flexShrink: 0,
                }}>
                  ×{count}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Clear deck */}
      {deckCount > 0 && (
        <div style={{ marginTop: '4px' }}>
          {confirmClear ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                style={{ flex: 1, background: '#EF4444', color: '#fff', fontFamily: "'Cinzel', serif", fontSize: '10px', border: 'none', borderRadius: '3px', padding: '5px', cursor: 'pointer' }}
                onClick={() => { onClearDeck(); setConfirmClear(false); }}
              >
                Clear All
              </button>
              <button
                style={{ flex: 1, background: 'transparent', color: '#6a6a8a', fontFamily: "'Cinzel', serif", fontSize: '10px', border: '1px solid #2a2a3a', borderRadius: '3px', padding: '5px', cursor: 'pointer' }}
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              style={{ width: '100%', background: 'transparent', color: '#4a4a6a', fontFamily: "'Cinzel', serif", fontSize: '10px', border: '1px solid #1a1a2a', borderRadius: '3px', padding: '5px', cursor: 'pointer', letterSpacing: '0.04em' }}
              onClick={() => setConfirmClear(true)}
              onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = '#EF444430'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#4a4a6a'; e.currentTarget.style.borderColor = '#1a1a2a'; }}
            >
              Clear Deck
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
      <span style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '10px',
        color: '#4a4a6a',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginRight: '4px',
        whiteSpace: 'nowrap',
      }}>{label}:</span>
      {children}
    </div>
  );
}

function FilterBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '11px',
        fontWeight: active ? 600 : 400,
        color: active ? '#0a0a0f' : '#6a6a8a',
        background: active ? '#C9A84C' : 'transparent',
        border: `1px solid ${active ? '#C9A84C' : '#2a2a3a'}`,
        borderRadius: '4px',
        padding: '3px 10px',
        cursor: 'pointer',
        transition: 'color 0.12s, background 0.12s, border-color 0.12s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ── Champion Selection Step ──────────────────────────────────────────────────

function ChampionStep({ onSelect, onBack }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
        {ATTRIBUTE_ORDER.map(attrKey => {
          const champ = CHAMPIONS[attrKey];
          const attr = ATTRIBUTES[attrKey];
          const imageUrl = getCardImageUrl(champ.image);
          return (
            <ChampionCard
              key={attrKey}
              champion={champ}
              attribute={attr}
              attributeKey={attrKey}
              imageUrl={imageUrl}
              description={CHAMPION_DESCRIPTIONS[attrKey]}
              onSelect={() => onSelect(attrKey)}
            />
          );
        })}
      </div>

      <button
        style={backBtnStyle}
        onClick={onBack}
        onMouseEnter={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C60'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#6a6a8a'; e.currentTarget.style.borderColor = '#2a2a3a'; }}
      >
        ← Back to Lobby
      </button>
    </>
  );
}

function ChampionCard({ champion, attribute, attributeKey, imageUrl, description, onSelect }) {
  return (
    <div
      style={{
        background: '#0d0d1a',
        border: `1px solid ${attribute.color}55`,
        borderLeft: `3px solid ${attribute.color}`,
        borderRadius: '8px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onClick={onSelect}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = `inset 0 0 16px ${attribute.color}33`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {imageUrl && (
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={imageUrl}
            alt={champion.name}
            onError={e => { e.target.style.display = 'none'; }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      <div>
        <h2 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '16px',
          fontWeight: 600,
          color: attribute.color,
          marginBottom: '2px',
        }}>
          {champion.name}
        </h2>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          color: '#4a4a6a',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {attribute.name}
        </span>
      </div>

      <p style={{
        fontFamily: "'Crimson Text', serif",
        fontSize: '14px',
        color: '#8a8aaa',
        lineHeight: 1.6,
        flex: 1,
      }}>
        {description}
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
          background: ATTR_GRADIENTS[attributeKey] || attribute.color,
          border: 'none',
          boxShadow: `0 2px 8px ${attribute.color}60`,
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

// ── Secondary Attribute Step ──────────────────────────────────────────────────

function SecondaryStep({ primaryAttribute, onSelect, onBack }) {
  const primaryAttr = ATTRIBUTES[primaryAttribute];

  return (
    <>
      <div style={{
        background: '#0d0d1a',
        border: `1px solid ${primaryAttr.color}55`,
        borderRadius: '8px',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '12px',
          color: '#4a4a6a',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>Champion:</span>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '14px',
          fontWeight: 600,
          color: primaryAttr.color,
        }}>
          {CHAMPIONS[primaryAttribute].name} · {primaryAttr.name}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
        {ATTRIBUTE_ORDER.map(attrKey => {
          const attr = ATTRIBUTES[attrKey];
          const isPrimary = attrKey === primaryAttribute;
          const isFriendly = primaryAttr.friendly.includes(attrKey);
          const isEnemy = primaryAttr.enemy.includes(attrKey);

          return (
            <SecondaryAttrCard
              key={attrKey}
              attributeKey={attrKey}
              attribute={attr}
              isPrimary={isPrimary}
              isFriendly={isFriendly}
              isEnemy={isEnemy}
              onSelect={isPrimary ? null : () => onSelect(attrKey)}
            />
          );
        })}
      </div>

      <button
        style={backBtnStyle}
        onClick={onBack}
        onMouseEnter={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C60'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#6a6a8a'; e.currentTarget.style.borderColor = '#2a2a3a'; }}
      >
        ← Back to Champion
      </button>
    </>
  );
}

function SecondaryAttrCard({ attributeKey, attribute, isPrimary, isFriendly, isEnemy, onSelect }) {
  const isSelectable = !isPrimary;

  let relationLabel = null;
  let relationColor = null;
  let relationIcon = null;
  if (isPrimary) {
    relationLabel = 'Primary';
    relationColor = attribute.color;
    relationIcon = '★';
  } else if (isFriendly) {
    relationLabel = 'Friendly';
    relationColor = '#22C55E';
    relationIcon = '✓';
  } else if (isEnemy) {
    relationLabel = 'Enemy';
    relationColor = '#EF4444';
    relationIcon = '✕';
  }

  return (
    <div
      style={{
        background: '#0d0d1a',
        border: isPrimary
          ? `2px solid ${attribute.color}`
          : `1px solid ${attribute.color}55`,
        borderLeft: `3px solid ${attribute.color}`,
        borderRadius: '8px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: isSelectable ? 'pointer' : 'default',
        opacity: isPrimary ? 0.7 : 1,
        transition: isSelectable ? 'transform 0.15s, box-shadow 0.15s' : 'none',
      }}
      onClick={isSelectable ? onSelect : undefined}
      onMouseEnter={isSelectable ? e => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = `inset 0 0 16px ${attribute.color}33`;
      } : undefined}
      onMouseLeave={isSelectable ? e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '';
      } : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '16px',
            fontWeight: 600,
            color: attribute.color,
            marginBottom: '2px',
          }}>
            {attribute.name}
          </h2>
          <span style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '10px',
            color: '#4a4a6a',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {FACTION_NAMES[attributeKey]}
          </span>
        </div>

        {relationLabel && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '99px',
            border: `1px solid ${relationColor}55`,
            background: `${relationColor}11`,
          }}>
            <span style={{ color: relationColor, fontSize: '11px' }}>{relationIcon}</span>
            <span style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '10px',
              color: relationColor,
              letterSpacing: '0.06em',
            }}>
              {relationLabel}
            </span>
          </div>
        )}
      </div>

      {isPrimary ? (
        <p style={{
          fontFamily: "'Crimson Text', serif",
          fontSize: '14px',
          color: '#4a4a6a',
          lineHeight: 1.6,
          fontStyle: 'italic',
        }}>
          Primary attribute (locked)
        </p>
      ) : (
        <button
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            fontWeight: 600,
            color: '#0a0a0f',
            background: ATTR_GRADIENTS[attributeKey] || attribute.color,
            border: 'none',
            boxShadow: `0 2px 8px ${attribute.color}60`,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
          onClick={e => { e.stopPropagation(); onSelect(); }}
        >
          Select
        </button>
      )}
    </div>
  );
}

const backBtnStyle = {
  background: 'transparent',
  color: '#6a6a8a',
  fontFamily: "'Cinzel', serif",
  fontSize: '13px',
  border: '1px solid #2a2a3a',
  borderRadius: '4px',
  padding: '8px 24px',
  cursor: 'pointer',
  transition: 'color 0.15s, border-color 0.15s',
};
