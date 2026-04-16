/**
 * DraftScreen — Map-based draft orchestrator (complete rewrite)
 *
 * Draft flow:
 *   1. Faction primary selection   → pick primary faction + champion (no card)
 *   2. Faction secondary selection → pick secondary faction (no card)
 *   3. Legendary pick              → pick 1 legendary from primary+secondary pool
 *   4. Map is generated and displayed (DraftMapScreen)
 *   5. For each of 29 map nodes:
 *      a. Show map with "Continue" button
 *      b. Show node interaction (DraftNodeScreen or SpecialNodeScreen)
 *      c. Update map state, record pick, advance position
 *   6. draft_complete screen
 *
 * Props:
 *   onDraftComplete({ primaryFaction, secondaryFaction, deck, legendaryIds })
 */

import { useState, useCallback } from 'react';
import { CARD_DB } from '../../engine/cards.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { getCardImageUrl } from '../../supabase.js';
import { AutoSizeText } from '../AutoSizeText.jsx';
import { CHAMPIONS } from '../../engine/champions.js';
import { ATTR_SYMBOLS } from '../../assets/attributeSymbols.jsx';
import { generateLegendaryPack, getRandomFactions } from '../../draft/draftPool.js';
import DraftCurvePanel from './DraftCurvePanel.jsx';
import { generateDraftMap, getCurrentNode, getDraftPath } from '../../draft/draftMap.js';
import {
  generateBucketOptions,
  getUnlockedKeywordBuckets,
  BUCKET_IDS,
} from '../../draft/draftBuckets.js';
import DraftMapScreen from './DraftMapScreen.jsx';
import DraftNodeScreen from './DraftNodeScreen.jsx';
import SpecialNodeScreen from './SpecialNodeScreen.jsx';

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
  marginBottom: '4px',
};

const FACTION_STYLE = {
  light:  { bg: 'linear-gradient(135deg, #5a4a00, #C9A84C)', color: '#0a0a0f', label: 'Light',  subtitle: 'Formation & Aura' },
  primal: { bg: 'linear-gradient(135deg, #3a1a00, #a0522d)', color: '#f9fafb', label: 'Primal', subtitle: 'Rush & Speed' },
  mystic: { bg: 'linear-gradient(135deg, #2a0a4a, #7e3aaf)', color: '#f9fafb', label: 'Mystic', subtitle: 'Healing & Endurance' },
  dark:   { bg: 'linear-gradient(135deg, #0a0010, #3d1a5e)', color: '#f9fafb', label: 'Dark',   subtitle: 'Hidden & Power' },
};

// ── Main component ────────────────────────────────────────────────────────────
export default function DraftScreen({ onDraftComplete }) {
  // ── Phase state machine ──────────────────────────────────────────────────────
  // 'faction_primary' → 'faction_secondary' → 'legendary_pick'
  // → 'map_view' → 'node_interact' → (repeat) → 'draft_complete'
  const [phase, setPhase] = useState('faction_primary');

  // ── Faction + deck ───────────────────────────────────────────────────────────
  const [primaryFaction, setPrimaryFaction] = useState(null);
  const [secondaryFaction, setSecondaryFaction] = useState(null);
  const [primaryOptions] = useState(() => getRandomFactions(2));
  const [draftedIds, setDraftedIds] = useState([]);
  const [legendaryIds, setLegendaryIds] = useState([]);

  // ── Legendary pick pack ──────────────────────────────────────────────────────
  const [legendaryPack, setLegendaryPack] = useState([]);

  // ── Map state ────────────────────────────────────────────────────────────────
  const [draftMap, setDraftMap] = useState(null);
  const [mapPosition, setMapPosition] = useState(0);    // 0-based node index in traversal path
  const [committedBranch, setCommittedBranch] = useState(null);
  const [nodeHistory, setNodeHistory] = useState([]);

  // ── Current node buckets (pre-generated when map view shows) ─────────────────
  const [currentBuckets, setCurrentBuckets] = useState(null);

  // ── Phase transitions ─────────────────────────────────────────────────────────

  function handlePrimarySelect(faction) {
    setPrimaryFaction(faction);
    setPhase('faction_secondary');
  }

  function handleSecondarySelect(faction) {
    setSecondaryFaction(faction);
    // Pool draws from both factions after both are known
    const pack = generateLegendaryPack(primaryFaction, faction, []);
    setLegendaryPack(pack);
    setPhase('legendary_pick');
  }

  function handleLegendaryPick(card) {
    const legId = card.id === '_skip' ? null : card.id;
    const newDraftedIds = legId ? [legId] : [];
    const newLegIds = legId ? [legId] : [];
    setDraftedIds(newDraftedIds);
    setLegendaryIds(newLegIds);
    // Generate the map now that both factions and legendary are settled
    const map = generateDraftMap(primaryFaction, secondaryFaction);
    setDraftMap(map);
    setMapPosition(0);
    setCommittedBranch(null);
    setNodeHistory([]);
    const buckets = generateBucketOptionsForNode(map.nodes['node_1'], newDraftedIds);
    setCurrentBuckets(buckets);
    setPhase('map_view');
  }

  // ── Map navigation ────────────────────────────────────────────────────────────

  function handleContinueToNode() {
    setPhase('node_interact');
  }

  function handleNodeComplete({ cardId, bucketId, committedBranch: forkBranch, removedCardId }) {
    // Update drafted IDs
    let newDraftedIds = [...draftedIds];
    let newLegIds = [...legendaryIds];

    // Handle swap removal
    if (removedCardId) {
      const idx = newDraftedIds.indexOf(removedCardId);
      if (idx !== -1) newDraftedIds.splice(idx, 1);
      if (newLegIds.includes(removedCardId)) {
        newLegIds = newLegIds.filter(id => id !== removedCardId);
      }
    }

    // Add picked card (skip sentinel = no card)
    if (cardId && cardId !== '_skip') {
      newDraftedIds.push(cardId);
      const card = CARD_DB[cardId];
      if (card?.legendary && !newLegIds.includes(cardId)) {
        newLegIds.push(cardId);
      }
    }

    // Commit branch if this was the fork node
    const resolvedBranch = forkBranch ?? committedBranch;
    if (forkBranch && !committedBranch) {
      setCommittedBranch(forkBranch);
    }

    // Record history
    const path = getDraftPath(resolvedBranch);
    const currentNodeId = path[mapPosition];
    const newHistory = [...nodeHistory, { nodeId: currentNodeId, bucketId, cardId }];

    // Advance position
    const nextPosition = mapPosition + 1;
    const isComplete = nextPosition >= 29; // 29 nodes total (0-indexed: 0..28)

    setDraftedIds(newDraftedIds);
    setLegendaryIds(newLegIds);
    setNodeHistory(newHistory);

    if (isComplete) {
      setPhase('draft_complete');
      return;
    }

    setMapPosition(nextPosition);

    // Pre-generate buckets for the next node
    const nextNodeId = getDraftPath(resolvedBranch)[nextPosition];
    const nextNode = draftMap.nodes[nextNodeId];
    const unlocked = getUnlockedKeywordBuckets(newDraftedIds);
    const nextBuckets = generateBucketOptionsForNode(nextNode, unlocked);
    setCurrentBuckets(nextBuckets);

    setPhase('map_view');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function generateBucketOptionsForNode(node, unlocked) {
    if (!node) return [];
    if (node.type === 'fork') return generateBucketOptions(unlocked, true);
    return generateBucketOptions(unlocked, false);
  }

  function getCurrentNodeObj() {
    if (!draftMap) return null;
    const path = getDraftPath(committedBranch);
    const nodeId = path[mapPosition];
    return draftMap.nodes[nodeId] ?? null;
  }

  // ── Render phases ─────────────────────────────────────────────────────────────

  if (phase === 'faction_primary') {
    return (
      <div style={scrn}>
        <div style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 48 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ ...heading, fontSize: 24 }}>DRAFT</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 15 }}>
              Choose your primary faction
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
            {primaryOptions.map(faction => (
              <FactionCard key={faction} faction={faction} onClick={() => handlePrimarySelect(faction)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'legendary_pick') {
    return (
      <div style={scrn}>
        <div style={{ maxWidth: 520, width: '100%', display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ ...heading, fontSize: 20 }}>LEGENDARY PICK</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14 }}>
              Choose 1 legendary card for your deck
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {legendaryPack.map(card => (
              <FullCard key={card.id} card={card} onClick={() => handleLegendaryPick(card)} />
            ))}
            {legendaryPack.length === 0 && (
              <p style={{ color: '#6a6a8a', fontFamily: "'Crimson Text', serif" }}>
                No legendaries available.
              </p>
            )}
          </div>
          {legendaryPack.length === 0 && (
            <button style={btnSecondary} onClick={() => handleLegendaryPick({ id: '_skip' })}>
              Continue Without Legendary
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'faction_secondary') {
    const secondaryOptions = ['light', 'primal', 'mystic', 'dark'].filter(f => f !== primaryFaction);
    return (
      <div style={scrn}>
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
              <FactionCard key={faction} faction={faction} onClick={() => handleSecondarySelect(faction)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'map_view') {
    const currentNode = getCurrentNodeObj();
    return (
      <DraftMapScreen
        draftMap={draftMap}
        mapPosition={mapPosition}
        committedBranch={committedBranch}
        primaryFaction={primaryFaction}
        secondaryFaction={secondaryFaction}
        draftedIds={draftedIds}
        nextBuckets={currentNode?.type !== 'special' ? currentBuckets : null}
        onContinue={handleContinueToNode}
      />
    );
  }

  if (phase === 'node_interact') {
    const currentNode = getCurrentNodeObj();
    if (!currentNode) return null;

    if (currentNode.type === 'special') {
      return (
        <SpecialNodeScreen
          node={currentNode}
          specialType={currentNode.specialType}
          primaryFaction={primaryFaction}
          secondaryFaction={secondaryFaction}
          deck={draftedIds}
          buckets={currentBuckets ?? []}
          onComplete={handleNodeComplete}
        />
      );
    }

    // Standard or fork node
    return (
      <DraftNodeScreen
        node={currentNode}
        buckets={currentBuckets ?? []}
        primaryFaction={primaryFaction}
        secondaryFaction={secondaryFaction}
        draftedIds={draftedIds}
        isFork={currentNode.type === 'fork'}
        branchSpecialTypes={draftMap?.branchSpecialTypes ?? {}}
        onComplete={handleNodeComplete}
      />
    );
  }

  if (phase === 'draft_complete') {
    const sortedDeck = getSortedDeck(draftedIds);
    return (
      <div style={scrn}>
        <div style={{ maxWidth: 520, width: '100%', display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ ...heading, fontSize: 22 }}>DRAFT COMPLETE</h2>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14 }}>
              {FACTION_STYLE[primaryFaction]?.label} / {FACTION_STYLE[secondaryFaction]?.label} — {draftedIds.length} cards
            </p>
          </div>
          <DraftCurvePanel draftedIds={draftedIds} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sortedDeck.map((card, i) => (
              <DeckListRow key={i} card={card} />
            ))}
          </div>
          <button
            style={btnPrimary}
            onClick={() => onDraftComplete({
              primaryFaction,
              secondaryFaction,
              deck: draftedIds,
              legendaryIds,
            })}
          >
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

// ── Utility functions ─────────────────────────────────────────────────────────

function getSortedDeck(ids) {
  return ids.map(id => CARD_DB[id]).filter(Boolean).sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
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
  fontWeight: 500,
  border: '1px solid #C9A84C60',
  borderRadius: 4,
  padding: '10px 24px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
};
