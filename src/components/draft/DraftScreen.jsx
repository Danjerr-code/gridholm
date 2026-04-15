import { useState, useCallback } from 'react';
import { CARD_DB } from '../../engine/cards.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { getCardImageUrl } from '../../supabase.js';
import { AutoSizeText } from '../AutoSizeText.jsx';
import { buildDraftPool, generatePack, generateLegendaryPack, getRandomFactions, assignRareSlots } from '../../draft/draftPool.js';
import { CHAMPIONS } from '../../engine/champions.js';
import { ATTR_SYMBOLS } from '../../assets/attributeSymbols.jsx';

const TOTAL_PICKS = 29; // 1 legendary + 29 main = 30 cards

// ── Faction visual config ────────────────────────────────────────────────────
const FACTION_STYLE = {
  light:  { bg: 'linear-gradient(135deg, #5a4a00, #C9A84C)', color: '#0a0a0f', label: 'Light',  subtitle: 'Formation & Aura' },
  primal: { bg: 'linear-gradient(135deg, #3a1a00, #a0522d)', color: '#f9fafb', label: 'Primal', subtitle: 'Rush & Speed' },
  mystic: { bg: 'linear-gradient(135deg, #2a0a4a, #7e3aaf)', color: '#f9fafb', label: 'Mystic', subtitle: 'Healing & Endurance' },
  dark:   { bg: 'linear-gradient(135deg, #0a0010, #3d1a5e)', color: '#f9fafb', label: 'Dark',   subtitle: 'Hidden & Power' },
};

// ── Shared styles ────────────────────────────────────────────────────────────
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
  color: '#C9A84C',
  letterSpacing: '0.15em',
  marginBottom: '4px',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function DraftScreen({ onDraftComplete }) {
  const [phase, setPhase] = useState('faction_primary');   // state machine
  const [primaryFaction, setPrimaryFaction] = useState(null);
  const [secondaryFaction, setSecondaryFaction] = useState(null);
  const [pool, setPool] = useState([]);
  const [draftedIds, setDraftedIds] = useState([]);      // card IDs in order drafted
  const [legendaryIds, setLegendaryIds] = useState([]);
  const [pickNumber, setPickNumber] = useState(1);        // 1-indexed
  const [currentPack, setCurrentPack] = useState([]);
  const [rareSlotPositions, setRareSlotPositions] = useState(null);
  const [offerCounts, setOfferCounts] = useState({});

  // Faction selection — show 2 random for primary
  const [primaryOptions] = useState(() => getRandomFactions(2));

  // ── Phase transitions ──────────────────────────────────────────────────────

  function handlePrimarySelect(faction) {
    setPrimaryFaction(faction);
    setPhase('faction_secondary');
  }

  function handleSecondarySelect(faction) {
    setSecondaryFaction(faction);
    const newPool = buildDraftPool(primaryFaction, faction);
    setPool(newPool);
    // Generate initial legendary pack
    const pack = generateLegendaryPack(primaryFaction, faction, []);
    setCurrentPack(pack);
    setPhase('legendary_pick');
  }

  function handleLegendaryPick(card) {
    const newLegIds = [card.id];
    const newDraftedIds = [card.id];
    setLegendaryIds(newLegIds);
    setDraftedIds(newDraftedIds);
    // Assign rare slots for this draft run
    const slots = assignRareSlots();
    setRareSlotPositions(slots);
    const initOfferCounts = {};
    // Generate first main-draft pack
    const pack = generatePack(pool, newDraftedIds, 1, primaryFaction, secondaryFaction, slots, initOfferCounts);
    // Track offers for first pack
    const newOfferCounts = { ...initOfferCounts };
    for (const c of pack) newOfferCounts[c.id] = (newOfferCounts[c.id] ?? 0) + 1;
    setOfferCounts(newOfferCounts);
    setCurrentPack(pack);
    setPickNumber(1);
    setPhase('main_draft');
  }

  const handleMainPick = useCallback((card) => {
    const newDraftedIds = [...draftedIds, card.id];
    setDraftedIds(newDraftedIds);

    if (pickNumber >= TOTAL_PICKS) {
      // Draft complete — 30 cards total
      setPhase('draft_complete');
    } else {
      const nextPick = pickNumber + 1;
      setPickNumber(nextPick);
      const pack = generatePack(pool, newDraftedIds, nextPick, primaryFaction, secondaryFaction, rareSlotPositions, offerCounts);
      // Track offer counts for this pack
      const newOfferCounts = { ...offerCounts };
      for (const c of pack) newOfferCounts[c.id] = (newOfferCounts[c.id] ?? 0) + 1;
      setOfferCounts(newOfferCounts);
      setCurrentPack(pack);
    }
  }, [draftedIds, pickNumber, pool, primaryFaction, secondaryFaction, rareSlotPositions, offerCounts]);

  function handleStartGauntlet() {
    onDraftComplete({
      primaryFaction,
      secondaryFaction,
      deck: draftedIds,
      legendaryIds,
    });
  }

  // ── Render phases ──────────────────────────────────────────────────────────

  if (phase === 'faction_primary') {
    return (
      <div style={screen}>
        <div style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 48 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ ...heading, fontSize: 24 }}>DRAFT</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 15 }}>
              Choose your primary faction
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
            {primaryOptions.map(faction => (
              <FactionCard
                key={faction}
                faction={faction}
                onClick={() => handlePrimarySelect(faction)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'faction_secondary') {
    const secondaryOptions = ['light', 'primal', 'mystic', 'dark'].filter(f => f !== primaryFaction);
    return (
      <div style={screen}>
        <div style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 48 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ ...heading, fontSize: 24 }}>DRAFT</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 15 }}>
              Primary: <span style={{ color: ATTRIBUTES[primaryFaction]?.color ?? '#C9A84C' }}>{FACTION_STYLE[primaryFaction]?.label}</span>
              {' '}— Choose your secondary faction
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
            {secondaryOptions.map(faction => (
              <FactionCard
                key={faction}
                faction={faction}
                onClick={() => handleSecondarySelect(faction)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'legendary_pick') {
    return (
      <div style={screen}>
        <div style={{ maxWidth: 520, width: '100%', display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ ...heading, fontSize: 20 }}>LEGENDARY PICK</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14 }}>
              Choose 1 legendary card for your deck
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {currentPack.map(card => (
              <FullCard key={card.id} card={card} onClick={() => handleLegendaryPick(card)} />
            ))}
            {currentPack.length === 0 && (
              <p style={{ color: '#6a6a8a', fontFamily: "'Crimson Text', serif" }}>
                No legendaries available for this faction pair.
              </p>
            )}
          </div>
          {currentPack.length === 0 && (
            <button
              style={btnSecondary}
              onClick={() => handleLegendaryPick({ id: '_skip', name: 'Skip' })}
            >
              Continue Without Legendary
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'main_draft') {
    const sortedDeck = getSortedDeck(draftedIds);
    const curveCounts = getCurveCounts(draftedIds);
    return (
      <div style={screen}>
        <div style={{ maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ ...heading, fontSize: 18, margin: 0 }}>DRAFT</h2>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: '#C9A84C' }}>
              Pick {pickNumber} of {TOTAL_PICKS}
            </span>
          </div>

          {/* Pack */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {currentPack.map(card => (
              <FullCard key={card.id} card={card} onClick={() => handleMainPick(card)} />
            ))}
          </div>

          {/* Mana curve */}
          <ManaCurveBar counts={curveCounts} total={draftedIds.length} />
          <CardTypeCounter ids={draftedIds} />

          {/* Current deck */}
          <div>
            <p style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#6a6a8a', letterSpacing: '0.08em', marginBottom: 8 }}>
              DECK ({draftedIds.length} / 30)
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {sortedDeck.map((card, i) => (
                <MiniCardPill key={i} card={card} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'draft_complete') {
    const sortedDeck = getSortedDeck(draftedIds);
    return (
      <div style={screen}>
        <div style={{ maxWidth: 520, width: '100%', display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ ...heading, fontSize: 22 }}>DRAFT COMPLETE</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14 }}>
              {FACTION_STYLE[primaryFaction]?.label} / {FACTION_STYLE[secondaryFaction]?.label} — 30 cards
            </p>
          </div>
          <ManaCurveBar counts={getCurveCounts(draftedIds)} total={30} />
          <CardTypeCounter ids={draftedIds} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sortedDeck.map((card, i) => (
              <DeckListRow key={i} card={card} />
            ))}
          </div>
          <button style={btnPrimary} onClick={handleStartGauntlet}>
            Start Gauntlet →
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FactionCard({ faction, onClick }) {
  const style = FACTION_STYLE[faction] ?? {};
  const champData = CHAMPIONS[faction];
  const champImageUrl = champData ? getCardImageUrl(champData.image) : null;
  const AttrSymbol = ATTR_SYMBOLS[faction] ?? null;
  const attrColor = ATTRIBUTES[faction]?.color ?? '#C9A84C';
  return (
    <button
      onClick={onClick}
      style={{
        background: '#0d0d1a',
        border: `1px solid ${attrColor}55`,
        borderTop: `3px solid ${attrColor}`,
        borderRadius: 8,
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        width: 140,
        transition: 'filter 150ms ease, transform 150ms ease, box-shadow 150ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 20px ${attrColor}44`; }}
      onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      {champImageUrl && (
        <div style={{ aspectRatio: '3 / 4', overflow: 'hidden', flexShrink: 0 }}>
          <img src={champImageUrl} alt={champData?.name ?? faction} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        </div>
      )}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {AttrSymbol && <AttrSymbol size={20} />}
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', color: attrColor }}>
            {style.label?.toUpperCase()}
          </span>
        </div>
        <span style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: 14, color: '#9a9ab0' }}>
          {style.subtitle}
        </span>
      </div>
    </button>
  );
}

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
      onMouseEnter={e => { e.currentTarget.style.borderColor = card.legendary ? 'rgba(255, 140, 0, 1)' : attrColor; if (!card.legendary) e.currentTarget.style.boxShadow = `0 0 12px ${attrColor}50`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = card.legendary ? 'rgba(255, 140, 0, 0.8)' : `${attrColor}66`; if (!card.legendary) e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
    >
      {/* Cost badge + Name */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <AutoSizeText maxFontSize={11} style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, color: '#e8e8f0', lineHeight: 1.3, flex: 1 }}>
          {card.legendary && <span style={{ color: '#C9A84C', marginRight: 2 }}>♛</span>}
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

      {/* Faction tag */}
      <span style={{ fontSize: 9, color: attrColor, fontFamily: "'Cinzel', serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {card.attribute}
      </span>
    </div>
  );
}

function MiniCardPill({ card }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  return (
    <div style={{
      background: '#0d0d1a',
      border: `1px solid ${attrColor}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 10,
      color: '#c0c0d0',
      fontFamily: "'Cinzel', serif",
      whiteSpace: 'nowrap',
      letterSpacing: '0.02em',
    }}>
      <span style={{ color: '#C9A84C', marginRight: 3 }}>{card.cost}</span>
      {card.name}
    </div>
  );
}

function DeckListRow({ card }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #1a1a2a' }}>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C9A84C', minWidth: 18, textAlign: 'right' }}>{card.cost}</span>
      <AutoSizeText maxFontSize={11} style={{ fontFamily: "'Cinzel', serif", color: '#e8e8f0', flex: 1 }}>
        {card.legendary && <span style={{ color: '#C9A84C', marginRight: 3 }}>♛</span>}
        {card.name}
      </AutoSizeText>
      <span style={{ fontSize: 9, color: attrColor, fontFamily: "'Cinzel', serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {card.type}
      </span>
    </div>
  );
}

function ManaCurveBar({ counts, total }) {
  const maxCount = Math.max(1, ...Object.values(counts));
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

// ── Utility functions ─────────────────────────────────────────────────────────

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

// ── Shared button styles ──────────────────────────────────────────────────────

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
  fontWeight: 500,
  border: '1px solid #C9A84C60',
  borderRadius: 4,
  padding: '10px 24px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
};
