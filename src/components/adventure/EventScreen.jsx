/**
 * EventScreen — renders a mysterious event encounter.
 *
 * Props:
 *   event  — event definition object from eventDefinitions.js
 *   run    — current adventure run state (needed for card removal display)
 *   rng    — LCG rng object for deterministic outcomes
 *   onDone(rewards, extras) — called when player finishes the event
 *             rewards: [{type, value}, ...]
 *             extras:  { revealAll: boolean }
 */

import { useState } from 'react';
import { CARD_DB } from '../../engine/cards.js';

const RARITY_COLOR = { rare: '#C9A84C', common: '#a0a0c0', legendary: '#e040fb' };

// ── Shared style constants ────────────────────────────────────────────────────

const screenStyle = {
  minHeight: '100vh',
  background: '#0a0a0f',
  color: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
  gap: '20px',
  overflowY: 'auto',
};

const boxStyle = {
  width: '100%',
  maxWidth: '480px',
  background: '#0d0d18',
  border: '1px solid #2a2a3a',
  borderRadius: '8px',
  padding: '18px 20px',
};

const goldBtn = {
  background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
  color: '#0a0a0f',
  fontFamily: "'Cinzel', serif",
  fontSize: '13px',
  fontWeight: 600,
  border: 'none',
  borderRadius: '4px',
  padding: '11px 28px',
  cursor: 'pointer',
  letterSpacing: '0.06em',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function EventScreen({ event, run, rng, onDone }) {
  const [view, setView] = useState('choice'); // 'choice' | 'outcome'
  const [outcome, setOutcome] = useState(null);
  const [pickedCardId, setPickedCardId] = useState(null);   // for card offer pick
  const [sacrificeCardId, setSacrificeCardId] = useState(null); // for card removal

  function handleChoiceSelect(idx) {
    const result = event.choices[idx].applyOutcome(run, rng);
    setOutcome(result);
    setView('outcome');
  }

  function handleContinue() {
    if (!outcome) return;
    const rewards = [...(outcome.rewards ?? [])];
    if (outcome.cardOffers?.length > 0 && pickedCardId) {
      rewards.push({ type: 'card', value: pickedCardId });
    }
    if (outcome.needsCardRemoval && sacrificeCardId) {
      rewards.push({ type: 'remove_card', value: sacrificeCardId });
      for (const r of outcome.afterRemovalRewards ?? []) rewards.push(r);
    }
    onDone(rewards, { revealAll: outcome.revealAll ?? false });
  }

  const needsCardPick   = view === 'outcome' && (outcome?.cardOffers?.length ?? 0) > 0;
  const needsRemoval    = view === 'outcome' && outcome?.needsCardRemoval && (run?.deck?.length ?? 0) > 0;
  const cardPickDone    = !needsCardPick  || pickedCardId !== null;
  const removalDone     = !needsRemoval   || sacrificeCardId !== null;
  const showContinue    = view === 'outcome' && cardPickDone && removalDone;

  if (view === 'choice') {
    return (
      <div style={screenStyle}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '0.12em', color: '#8a6a8a', marginBottom: '4px' }}>
            MYSTERIOUS EVENT
          </div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', color: '#C9A84C', letterSpacing: '0.1em' }}>
            {event.title}
          </div>
        </div>

        {/* Description */}
        <div style={{ ...boxStyle, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '16px', color: '#c8c0d8', lineHeight: 1.65 }}>
            {event.description}
          </div>
        </div>

        {/* Choices */}
        <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {event.choices.map((choice, idx) => (
            <ChoiceButton key={idx} choice={choice} onSelect={() => handleChoiceSelect(idx)} />
          ))}
        </div>
      </div>
    );
  }

  // Outcome view
  return (
    <div style={screenStyle}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', color: '#C9A84C', letterSpacing: '0.1em' }}>
        {event.title}
      </div>

      {/* Outcome text */}
      <div style={{ ...boxStyle, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '15px', color: '#c8c0d8', lineHeight: 1.65 }}>
          {outcome.outcomeText}
        </div>
      </div>

      {/* Immediate rewards summary */}
      {outcome.rewards?.length > 0 && (
        <RewardSummary rewards={outcome.rewards} />
      )}

      {/* After-removal reward summary (shown before removal to inform the player) */}
      {needsRemoval && outcome.afterRemovalRewards?.length > 0 && (
        <div style={{ width: '100%', maxWidth: '480px', fontSize: '12px', color: '#8a8aaa', fontFamily: "'Crimson Text', serif", textAlign: 'center' }}>
          After sacrifice: {outcome.afterRemovalText ?? 'You receive your reward.'}
        </div>
      )}

      {/* Card offer picker */}
      {needsCardPick && (
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '0.1em', color: '#8a8aaa', marginBottom: '8px', textAlign: 'center' }}>
            CHOOSE A CARD
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {outcome.cardOffers.map(card => (
              <CardOfferRow
                key={card.id}
                card={card}
                selected={pickedCardId === card.id}
                onSelect={() => setPickedCardId(pickedCardId === card.id ? null : card.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Card removal picker */}
      {needsRemoval && !sacrificeCardId && (
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '0.1em', color: '#8a8aaa', marginBottom: '8px', textAlign: 'center' }}>
            SELECT A CARD TO SACRIFICE
          </div>
          <DeckCardPicker deck={run.deck} onSelect={setSacrificeCardId} />
        </div>
      )}

      {/* Sacrificed card confirmation */}
      {needsRemoval && sacrificeCardId && (
        <div style={{ width: '100%', maxWidth: '480px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#f87171' }}>
            Sacrificing: <strong>{CARD_DB[sacrificeCardId]?.name ?? sacrificeCardId}</strong>
          </div>
          <button
            onClick={() => setSacrificeCardId(null)}
            style={{ marginTop: '6px', background: 'none', border: '1px solid #4a4a6a', borderRadius: '4px', color: '#8a8aaa', fontFamily: "'Cinzel', serif", fontSize: '10px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.05em' }}
          >
            Change selection
          </button>
        </div>
      )}

      {/* Reveal all notice */}
      {outcome.revealAll && (
        <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#80e880', textAlign: 'center' }}>
          🗺 The entire dungeon map has been revealed.
        </div>
      )}

      {showContinue && (
        <button style={goldBtn} onClick={handleContinue}>
          Continue
        </button>
      )}
    </div>
  );
}

// ── Choice button ─────────────────────────────────────────────────────────────

function ChoiceButton({ choice, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? '#14141f' : '#0d0d18',
        border: `1px solid ${hover ? '#8a5fba' : '#2a2a3a'}`,
        borderRadius: '6px',
        padding: '14px 18px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 120ms ease, background 120ms ease',
        boxShadow: hover ? '0 0 10px #8a5fba30' : 'none',
      }}
    >
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: '#e8d8f8', marginBottom: '4px' }}>
        {choice.label}
      </div>
      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#8a8aaa', fontStyle: 'italic' }}>
        {choice.effectDesc}
      </div>
    </button>
  );
}

// ── Reward summary ────────────────────────────────────────────────────────────

function RewardSummary({ rewards }) {
  const items = rewards.map((r, i) => {
    if (r.type === 'gold')        return <span key={i} style={{ color: '#C9A84C' }}>+{r.value} gold</span>;
    if (r.type === 'hp' && r.value > 0)  return <span key={i} style={{ color: '#4ade80' }}>+{r.value} HP</span>;
    if (r.type === 'hp' && r.value < 0)  return <span key={i} style={{ color: '#f87171' }}>{r.value} HP</span>;
    if (r.type === 'potion')      return <span key={i} style={{ color: '#60a0e0' }}>+1 potion</span>;
    if (r.type === 'blessing')    return <span key={i} style={{ color: '#e0a0f0' }}>blessing: {r.value}</span>;
    if (r.type === 'curse')       return <span key={i} style={{ color: '#f87171' }}>curse: {r.value}</span>;
    if (r.type === 'card')        return <span key={i} style={{ color: '#a0c8e0' }}>+{CARD_DB[r.value]?.name ?? r.value}</span>;
    if (r.type === 'remove_card') return <span key={i} style={{ color: '#f87171' }}>removed: {CARD_DB[r.value]?.name ?? r.value}</span>;
    return null;
  }).filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div style={{ width: '100%', maxWidth: '480px', background: '#0d0d18', border: '1px solid #2a2a3a', borderRadius: '6px', padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
      {items.map((item, i) => (
        <span key={i} style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '0.04em' }}>{item}</span>
      ))}
    </div>
  );
}

// ── Card offer row ────────────────────────────────────────────────────────────

function CardOfferRow({ card, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const rarityColor = RARITY_COLOR[card.rarity] ?? '#a0a0c0';
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: selected ? '#1a1400' : hover ? '#14141f' : '#0d0d18',
        border: `1px solid ${selected ? '#C9A84C' : hover ? rarityColor + '80' : '#2a2a3a'}`,
        borderRadius: '6px',
        padding: '10px 14px',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: selected ? `0 0 10px #C9A84C40` : 'none',
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#f0e8d0' }}>{card.name}</span>
        <span style={{ fontFamily: "'Crimson Text', serif", fontSize: '11px', color: '#8a8aaa', fontStyle: 'italic' }}>
          {card.type} · cost {card.cost}
        </span>
      </div>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: rarityColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {card.rarity}
        {selected && ' ✓'}
      </span>
    </button>
  );
}

// ── Deck card picker (for card removal) ──────────────────────────────────────

function DeckCardPicker({ deck, onSelect }) {
  // Group deck by card id
  const counts = {};
  for (const id of deck) {
    counts[id] = (counts[id] ?? 0) + 1;
  }
  const unique = Object.keys(counts);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
      {unique.map(id => {
        const card = CARD_DB[id];
        if (!card) return null;
        const rarityColor = RARITY_COLOR[card.rarity] ?? '#a0a0c0';
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            style={{
              background: '#0d0d18',
              border: '1px solid #2a2a3a',
              borderRadius: '5px',
              padding: '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3a'; }}
          >
            <div>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: '#f0e8d0' }}>{card.name}</span>
              <span style={{ fontFamily: "'Crimson Text', serif", fontSize: '11px', color: '#8a8aaa', marginLeft: '8px', fontStyle: 'italic' }}>
                {card.type} · cost {card.cost}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: rarityColor }}>{card.rarity}</span>
              {counts[id] > 1 && (
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#6a6a8a' }}>×{counts[id]}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
