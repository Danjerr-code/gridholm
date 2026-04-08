import { useState, useMemo } from 'react';
import { CHAMPIONS } from '../engine/champions.js';
import { ATTRIBUTES } from '../engine/attributes.js';
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
          onAddCard={handleAddCard}
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

function CardBrowser({ primaryAttr, secondaryAttr, deck, onAddCard, onBack, onNext }) {
  const [factionFilter, setFactionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [costFilter, setCostFilter] = useState(0); // index into COST_RANGES
  const [keywordFilter, setKeywordFilter] = useState('all');

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

  return (
    <div style={{ width: '100%', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

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
        <span style={{ marginLeft: 'auto', fontFamily: "'Cinzel', serif", fontSize: '13px', color: deckCount >= 20 ? '#C9A84C' : '#6a6a8a' }}>
          {deckCount} cards
        </span>
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
        {/* Faction filter */}
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

        {/* Type filter */}
        <FilterGroup label="Type">
          {[{ key: 'all', label: 'All' }, { key: 'unit', label: 'Unit' }, { key: 'spell', label: 'Spell' }].map(opt => (
            <FilterBtn key={opt.key} active={typeFilter === opt.key} onClick={() => setTypeFilter(opt.key)}>
              {opt.label}
            </FilterBtn>
          ))}
        </FilterGroup>

        {/* Cost filter */}
        <FilterGroup label="Cost">
          {COST_RANGES.map((r, i) => (
            <FilterBtn key={r.label} active={costFilter === i} onClick={() => setCostFilter(i)}>
              {r.label}
            </FilterBtn>
          ))}
        </FilterGroup>

        {/* Keyword filter */}
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
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '32px' }}>
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
