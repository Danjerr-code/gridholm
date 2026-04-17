/**
 * RunSummary — shown when an adventure run ends (win or loss).
 *
 * Displays: loops completed, rooms cleared, boss defeated, deck list,
 * blessings/curses, personal best, free pack reward, and navigation buttons.
 *
 * Props:
 *   run        adventure run state (or null if not available)
 *   onPlayAgain()  start a new run (champion select)
 *   onMainMenu()   return to main menu / lobby
 */

import { useState, useEffect } from 'react';
import { CARD_DB } from '../../engine/cards.js';
import { addPacks } from '../../packs/packGenerator.js';
import { BLESSINGS_POOL } from '../../adventure/encounterRewards.js';
import { FACTION_ADVENTURE_CARD_POOL, getChampionProgress } from '../../adventure/adventureState.js';

const BEST_KEY = 'gridholm_adventure_best';

function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : { roomsCleared: 0, loopCount: 0 };
  } catch {
    return { roomsCleared: 0, loopCount: 0 };
  }
}

function saveBest(roomsCleared, loopCount) {
  try {
    const prev = loadBest();
    const updated = {
      roomsCleared: Math.max(prev.roomsCleared, roomsCleared),
      loopCount: Math.max(prev.loopCount, loopCount),
    };
    localStorage.setItem(BEST_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return { roomsCleared, loopCount };
  }
}

const FACTION_LABELS = {
  light: 'Light', primal: 'Primal', mystic: 'Mystic', dark: 'Dark',
};

const RARITY_COLOR = { rare: '#C9A84C', common: '#a0a0c0', legendary: '#e040fb' };

const screen = {
  minHeight: '100vh',
  background: '#0a0a0f',
  color: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '24px 16px 40px',
  gap: '20px',
  overflowY: 'auto',
};

const card = {
  width: '100%',
  maxWidth: '520px',
  background: '#0d0d18',
  border: '1px solid #2a2a3a',
  borderRadius: '8px',
  padding: '16px',
};

function SectionTitle({ children }) {
  return (
    <div style={{
      fontFamily: "'Cinzel', serif",
      fontSize: '11px',
      letterSpacing: '0.1em',
      color: '#4a4a6a',
      textTransform: 'uppercase',
      marginBottom: '10px',
    }}>
      {children}
    </div>
  );
}

function StatRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid #1a1a2a' }}>
      <span style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#7a7a9a' }}>{label}</span>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: '16px', fontWeight: 700, color: highlight ?? '#C9A84C' }}>{value}</span>
    </div>
  );
}

export default function RunSummary({ run, onPlayAgain, onMainMenu }) {
  const [packClaimed, setPackClaimed] = useState(false);
  const [personalBest, setPersonalBest] = useState(null);
  const [isBeatRecord, setIsBeatRecord] = useState(false);
  const [tierUnlock, setTierUnlock] = useState(null); // { tier, cards }

  useEffect(() => {
    if (!run) return;
    const prev = loadBest();
    const updated = saveBest(run.roomsCleared ?? 0, run.loopCount ?? 0);
    setPersonalBest(updated);
    setIsBeatRecord(
      (run.roomsCleared ?? 0) > prev.roomsCleared ||
      (run.loopCount ?? 0) > prev.loopCount
    );

    // Detect if a new tier was reached during this run
    const newTier = run.highestTierReachedThisRun;
    if (newTier && newTier > (run.championTierAtRunStart ?? 0)) {
      const factionPool = FACTION_ADVENTURE_CARD_POOL[run.championFaction] ?? {};
      const tierCardIds = factionPool[newTier - 1] ?? []; // tier N unlocks pool index N-1
      const unlockedCardNames = tierCardIds
        .map(id => CARD_DB[id]?.name ?? id)
        .filter(Boolean);
      setTierUnlock({ tier: newTier, cards: unlockedCardNames });
    }
  }, []);

  function handleClaimPack() {
    if (packClaimed) return;
    addPacks('mixed', 1);
    setPackClaimed(true);
  }

  const blessingMap = Object.fromEntries(BLESSINGS_POOL.map(b => [b.id, b]));

  // Build unique card list with counts
  const deckCounts = {};
  for (const id of (run?.deck ?? [])) {
    deckCounts[id] = (deckCounts[id] || 0) + 1;
  }
  const deckEntries = Object.entries(deckCounts)
    .map(([id, count]) => ({ card: CARD_DB[id], count }))
    .filter(x => x.card)
    .sort((a, b) => a.card.cost - b.card.cost);

  const faction = run?.championFaction ?? 'light';
  const roomsCleared = run?.roomsCleared ?? 0;
  const loopCount = run?.loopCount ?? 0;
  const bossDefeated = run?.bossDefeated ?? false;
  const gold = run?.gold ?? 0;
  const blessings = run?.blessings ?? [];
  const curses = run?.curses ?? [];

  return (
    <div style={screen}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '26px', color: '#f87171', letterSpacing: '0.12em' }}>
          RUN ENDED
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '15px', color: '#6a6a8a', marginTop: '6px' }}>
          Your {FACTION_LABELS[faction] ?? faction} champion has fallen.
        </div>
        {isBeatRecord && (
          <div style={{
            marginTop: '10px',
            background: '#0a1a00',
            border: '1px solid #4ade8060',
            borderRadius: '4px',
            padding: '6px 16px',
            display: 'inline-block',
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            color: '#4ade80',
            letterSpacing: '0.08em',
          }}>
            ✦ NEW PERSONAL BEST
          </div>
        )}
      </div>

      {/* Champion tier unlock notification */}
      {tierUnlock && (
        <div style={{
          ...card,
          background: '#001a0a',
          border: '1px solid #4ade8080',
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#4ade80', letterSpacing: '0.12em', marginBottom: '6px' }}>
            ✦ CHAMPION UNLOCKED · TIER {tierUnlock.tier}
          </div>
          <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#a0e0a0', lineHeight: 1.5, marginBottom: '8px' }}>
            {tierUnlock.cards.length > 0
              ? tierUnlock.cards.join(', ')
              : 'New abilities unlocked!'}
          </div>
          <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '12px', color: '#4a8a60' }}>
            These cards are now available on your next run.
          </div>
        </div>
      )}

      {/* Run stats */}
      <div style={card}>
        <SectionTitle>Run Summary</SectionTitle>
        <StatRow label="Dungeons Completed (Loops)" value={loopCount} />
        <StatRow label="Rooms Cleared" value={roomsCleared} />
        <StatRow label="Boss Defeated" value={bossDefeated ? 'Yes' : 'No'} highlight={bossDefeated ? '#4ade80' : '#f87171'} />
        <StatRow label="Gold Remaining" value={`🪙 ${gold}`} highlight="#C9A84C" />
        <StatRow label="Cards in Deck" value={run?.deck?.length ?? 0} highlight="#c084fc" />
        <StatRow label="Blessings" value={blessings.length} highlight="#80e860" />
      </div>

      {/* Personal Best */}
      {personalBest && (
        <div style={card}>
          <SectionTitle>Personal Best</SectionTitle>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#4a4a6a', letterSpacing: '0.08em', marginBottom: '4px' }}>
                BEST ROOMS
              </div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', fontWeight: 700, color: '#C9A84C' }}>
                {personalBest.roomsCleared}
              </div>
              {roomsCleared >= personalBest.roomsCleared && isBeatRecord && (
                <div style={{ fontSize: '9px', color: '#4ade80', marginTop: '2px' }}>NEW</div>
              )}
            </div>
            <div style={{ width: '1px', background: '#2a2a3a' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#4a4a6a', letterSpacing: '0.08em', marginBottom: '4px' }}>
                BEST LOOPS
              </div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', fontWeight: 700, color: '#C9A84C' }}>
                {personalBest.loopCount}
              </div>
              {loopCount >= personalBest.loopCount && isBeatRecord && (
                <div style={{ fontSize: '9px', color: '#4ade80', marginTop: '2px' }}>NEW</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Blessings collected */}
      {blessings.length > 0 && (
        <div style={card}>
          <SectionTitle>Blessings Collected</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {blessings.map(id => {
              const b = blessingMap[id];
              return (
                <div key={id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#80e860', fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>✦</span>
                  <div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#80e860' }}>
                      {b?.name ?? id}
                    </div>
                    <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '11px', color: '#5a7a5a' }}>
                      {b?.desc ?? ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Curses */}
      {curses.length > 0 && (
        <div style={card}>
          <SectionTitle>Curses</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {curses.map(id => (
              <div key={id} style={{
                background: '#1a0a0a',
                border: '1px solid #f8717140',
                borderRadius: '4px',
                padding: '3px 8px',
                fontFamily: "'Cinzel', serif",
                fontSize: '9px',
                color: '#f87171',
              }}>
                {id.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final deck */}
      {deckEntries.length > 0 && (
        <div style={card}>
          <SectionTitle>Final Deck ({run?.deck?.length ?? 0} cards)</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '240px', overflowY: 'auto' }}>
            {deckEntries.map(({ card: c, count }) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#60a0ff', width: '16px', textAlign: 'right', flexShrink: 0 }}>
                  {c.cost}
                </span>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: RARITY_COLOR[c.rarity] ?? '#a0a0c0', flex: 1 }}>
                  {c.name}
                </span>
                {count > 1 && (
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#4a4a6a' }}>×{count}</span>
                )}
                <span style={{ fontFamily: "'Crimson Text', serif", fontSize: '9px', color: '#4a4a6a', flexShrink: 0 }}>
                  {c.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free pack reward */}
      <div style={{
        ...card,
        background: '#100a1a',
        border: '1px solid #A855F760',
        textAlign: 'center',
      }}>
        <SectionTitle>Run Reward</SectionTitle>
        <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '13px', color: '#6a6a8a', marginBottom: '12px' }}>
          Thanks for playing. Claim a free mixed pack.
        </div>
        {packClaimed
          ? (
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: '#4ade80', letterSpacing: '0.06em' }}>
              ✓ Pack Added — open it in the Pack Opening screen.
            </div>
          )
          : (
            <button
              onClick={handleClaimPack}
              style={{
                background: 'linear-gradient(135deg, #1a0a3a, #5a2aaf)',
                color: '#c084fc',
                fontFamily: "'Cinzel', serif",
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid #A855F780',
                borderRadius: '4px',
                padding: '10px 28px',
                cursor: 'pointer',
                letterSpacing: '0.06em',
              }}
            >
              Claim Free Pack
            </button>
          )
        }
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={onPlayAgain}
          style={{
            background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
            color: '#0a0a0f',
            fontFamily: "'Cinzel', serif",
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '4px',
            padding: '12px 28px',
            cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          Play Again
        </button>
        <button
          onClick={onMainMenu}
          style={{
            background: 'transparent',
            color: '#6a6a8a',
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            border: '1px solid #2a2a3a',
            borderRadius: '4px',
            padding: '12px 24px',
            cursor: 'pointer',
          }}
        >
          Main Menu
        </button>
      </div>
    </div>
  );
}
