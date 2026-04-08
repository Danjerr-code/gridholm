import { useState } from 'react';
import { CHAMPIONS } from '../engine/champions.js';
import { ATTRIBUTES } from '../engine/attributes.js';
import { getCardImageUrl } from '../supabase.js';

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

  function handleChampionSelect(attributeKey) {
    setSelectedChampion(attributeKey);
    setStep('secondary');
  }

  function handleSecondarySelect(attributeKey) {
    if (onNext) {
      onNext(selectedChampion, attributeKey);
    }
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
        <p style={{
          fontFamily: "'Crimson Text', serif",
          fontStyle: 'italic',
          color: '#e2e8f0',
          fontSize: '15px',
        }}>
          {step === 'champion' ? 'Choose your champion' : 'Choose a secondary attribute'}
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
    </div>
  );
}

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
