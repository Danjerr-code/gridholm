import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getCardImageUrl } from '../supabase.js';
import { getChampionDef } from '../engine/gameEngine.js';
import { KEYWORD_REMINDERS } from '../engine/keywords.js';
import { ATTRIBUTES } from '../engine/attributes.js';
import { renderRules } from '../utils/rulesText.jsx';

function getActiveKeywords(source) {
  const keys = ['rush', 'flying', 'hidden', 'action', 'legendary'];
  const result = [];
  for (const key of keys) {
    if (source[key]) result.push({ key, ...KEYWORD_REMINDERS[key] });
  }
  if (source.aura) {
    const range = source.aura.range;
    const base = KEYWORD_REMINDERS.aura;
    const label = range === 1 ? 'Aura 1' : range === 2 ? 'Aura 2' : base.label;
    result.push({ key: 'aura', ...base, label });
  }
  return result;
}

function KeywordBubbles({ keywords }) {
  const [openKey, setOpenKey] = useState(null);
  if (!keywords || keywords.length === 0) return null;
  const activeKw = keywords.find(kw => kw.key === openKey);
  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0' }}>
        {keywords.map(kw => {
          const isOpen = openKey === kw.key;
          return (
            <div
              key={kw.key}
              onClick={() => setOpenKey(isOpen ? null : kw.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: isOpen ? `${kw.color}40` : `${kw.color}26`,
                border: `0.5px solid ${kw.color}`,
                borderRadius: '99px',
                padding: '4px 10px',
                marginRight: '6px',
                marginBottom: '6px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 500, color: kw.color, fontFamily: 'var(--font-sans)' }}>
                {kw.label}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          overflow: 'hidden',
          maxHeight: activeKw ? '120px' : '0',
          opacity: activeKw ? 1 : 0,
          transition: 'max-height 0.2s ease, opacity 0.2s ease',
        }}
      >
        {activeKw && (
          <div style={{
            fontSize: '12px',
            color: '#9090b8',
            lineHeight: 1.5,
            padding: '6px 8px',
            background: '#1a1a2e',
            borderRadius: '4px',
            borderLeft: `2px solid ${activeKw.color}`,
            fontFamily: 'var(--font-sans)',
          }}>
            <span style={{ fontWeight: 500, color: activeKw.color }}>{activeKw.label}: </span>
            {activeKw.reminder}
          </div>
        )}
      </div>
    </div>
  );
}

const nameStyle = { fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 };
const typeStyle = { fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#9090b8' };
const rulesStyle = {
  fontFamily: 'var(--font-sans)',
  fontStyle: 'normal',
  fontSize: '12px',
  fontWeight: 400,
  color: '#c0c0d8',
  lineHeight: 1.6,
  marginTop: '4px',
  borderTop: '0.5px solid #252538',
  paddingTop: '4px',
};

function ArtSlot({ url, alt, label }) {
  return (
    <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
      {url ? (
        <img src={url} alt={alt} onError={e => { e.target.style.display = 'none'; }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
          color: 'rgba(156,163,175,1)', fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500 }}>
          {label}
        </div>
      )}
    </div>
  );
}

function StatGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length},1fr)`, gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
      {items.map(({ label, value, color }) => (
        <div key={label}>
          <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function CardDetailContent({ inspectedItem, gameState }) {
  if (!inspectedItem) return null;

  if (inspectedItem.type === 'champion') {
    const { playerIdx = 0 } = inspectedItem;
    const champions = Array.isArray(gameState?.champions)
      ? gameState.champions
      : Object.values(gameState?.champions ?? {});
    const champ = champions[playerIdx];
    const player = gameState?.players?.[playerIdx];
    if (!champ || !player) return null;
    const champDef = getChampionDef(player);
    const tier = player.resonance?.tier ?? 'none';
    const ownerLabel = playerIdx === 0 ? 'P1' : 'P2';
    const ownerColor = playerIdx === 0 ? '#4a8abf' : '#bf4a4a';
    const champImageUrl = getCardImageUrl(champDef.image);
    return (
      <div className="flex flex-col gap-1">
        <ArtSlot url={champImageUrl} alt={champDef.name} label="Champion" />
        <div className="flex justify-between items-start">
          <span style={{ ...nameStyle, color: '#C9A84C' }}>{champDef.name}</span>
          <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
        </div>
        <div style={typeStyle}>Champion · {tier !== 'none' ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Unbound'}</div>
        <StatGrid items={[
          { label: 'HP', value: `${champ.hp}/${champ.maxHp}`, color: champ.hp <= 5 ? '#f87171' : '#ffffff' },
          { label: 'Resonance', value: player.resonance?.score ?? 0, color: '#C9A84C' },
        ]} />
      </div>
    );
  }

  if (inspectedItem.type === 'unit') {
    const unit = inspectedItem.unit;
    if (!unit) return null;
    const ownerLabel = unit.owner === 0 ? 'P1' : 'P2';
    const ownerColor = unit.owner === 0 ? '#4a8abf' : '#bf4a4a';
    const effectiveAtk = (unit.atk ?? 0) + (unit.atkBonus ?? 0) + (unit.turnAtkBonus ?? 0);
    const effectiveSpd = (unit.spd ?? 1) + (unit.speedBonus ?? 0);
    const imageUrl = getCardImageUrl(unit.image);
    const keywords = getActiveKeywords(unit);
    return (
      <div className="flex flex-col gap-1">
        <ArtSlot url={imageUrl} alt={unit.name} label={unit.unitType || 'Unit'} />
        <div className="flex justify-between items-start">
          <span style={{ ...nameStyle, color: unit.legendary ? '#C9A84C' : '#ffffff' }}>{unit.name}</span>
          <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
        </div>
        {unit.unitType && <div style={typeStyle}>{unit.unitType}</div>}
        <StatGrid items={[
          { label: 'ATK', value: effectiveAtk, color: '#e05050' },
          { label: 'HP', value: `${unit.hp ?? '?'}/${unit.maxHp ?? '?'}`, color: '#50c050' },
          { label: 'SPD', value: effectiveSpd, color: '#5090e0' },
        ]} />
        {unit.shield > 0 && (
          <div style={{ fontSize: '11px', color: '#67e8f9', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>🛡 Shield: {unit.shield}</div>
        )}
        {unit.rules && <div style={rulesStyle}>{renderRules(unit.rules)}</div>}
        <KeywordBubbles keywords={keywords} />
      </div>
    );
  }

  if (inspectedItem.type === 'card') {
    const { card } = inspectedItem;
    const imageUrl = getCardImageUrl(card.image);
    const keywords = getActiveKeywords(card);
    const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? null) : null;
    return (
      <div className="flex flex-col gap-1">
        <ArtSlot url={imageUrl} alt={card.name} label={card.type === 'spell' ? 'Spell' : (card.unitType || 'Unit')} />
        <div className="flex justify-between items-start">
          <span style={{ ...nameStyle, color: card.legendary ? '#C9A84C' : '#ffffff' }}>{card.name}</span>
          <span style={{ background: '#C9A84C', color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px' }}>{card.cost}</span>
        </div>
        <div style={{ ...typeStyle, color: attrColor ?? '#9090b8' }}>{card.type === 'spell' ? 'Spell' : card.unitType}</div>
        {card.type === 'unit' && (
          <StatGrid items={[
            { label: 'ATK', value: card.atk, color: '#e05050' },
            { label: 'HP', value: card.hp, color: '#50c050' },
            { label: 'SPD', value: card.spd, color: '#5090e0' },
          ]} />
        )}
        {card.rules && <div style={rulesStyle}>{renderRules(card.rules)}</div>}
        <KeywordBubbles keywords={keywords} />
      </div>
    );
  }

  return null;
}

export default function CardDetailModal({ inspectedItem, gameState, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!inspectedItem) return null;

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', zIndex: 9999, paddingTop: 80 }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', background: '#0f0f1e', border: '2px solid #C9A84C',
          borderRadius: '12px', padding: '16px', width: 280, maxHeight: '70vh',
          overflowY: 'auto', zIndex: 10000 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', color: '#9ca3af',
            cursor: 'pointer', fontSize: '14px' }}
          aria-label="Close"
        >✕</button>
        <div style={{ paddingRight: '20px' }}>
          <CardDetailContent inspectedItem={inspectedItem} gameState={gameState} />
        </div>
      </div>
    </div>,
    document.body
  );
}
