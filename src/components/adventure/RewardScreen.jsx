/**
 * RewardScreen — renders post-fight rewards, treasure, shop, and rest-site UIs.
 *
 * Props:
 *   mode            'fight' | 'treasure' | 'shop' | 'rest'
 *   run             adventure run state
 *   rewardData      { gold, cardOffers, blessingOffers, type } for fight
 *                   { treasureType, gold?, cardOffers?, blessingOffers? } for treasure
 *                   [shopItems] for shop (array)
 *   restHealAmount  number (only for rest mode)
 *   onDone(rewards) callback — called with array of { type, value } reward objects
 *                   (caller applies them via applyReward)
 */

import { useState } from 'react';
import { CARD_DB } from '../../engine/cards.js';
import { getCardImageUrl } from '../../supabase.js';
import { ATTRIBUTES } from '../../engine/attributes.js';

// ── Shared style helpers ──────────────────────────────────────────────────────

const RARITY_COLOR = { rare: '#C9A84C', common: '#a0a0c0', legendary: '#e040fb' };

const screen = {
  minHeight: '100vh',
  background: '#0a0a0f',
  color: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '24px 16px',
  gap: '20px',
  overflowY: 'auto',
};

const sectionBox = {
  width: '100%',
  maxWidth: '520px',
  background: '#0d0d18',
  border: '1px solid #2a2a3a',
  borderRadius: '8px',
  padding: '16px',
};

function GoldBadge({ amount }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: '#1a1400',
      border: '1px solid #C9A84C60',
      borderRadius: '20px',
      padding: '6px 16px',
      fontFamily: "'Cinzel', serif",
      fontSize: '18px',
      fontWeight: 700,
      color: '#C9A84C',
    }}>
      🪙 {amount} gold
    </div>
  );
}

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

function PrimaryBtn({ onClick, children, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#1a1a2a' : 'linear-gradient(135deg, #8a6a00, #C9A84C)',
        color: disabled ? '#4a4a6a' : '#0a0a0f',
        fontFamily: "'Cinzel', serif",
        fontSize: '13px',
        fontWeight: 600,
        border: 'none',
        borderRadius: '4px',
        padding: '12px 32px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        color: '#6a6a8a',
        fontFamily: "'Cinzel', serif",
        fontSize: '11px',
        border: '1px solid #2a2a3a',
        borderRadius: '4px',
        padding: '8px 20px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ── Card pick item ────────────────────────────────────────────────────────────

function CardOption({ card, selected, onSelect }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  const rarityColor = RARITY_COLOR[card.rarity] ?? '#a0a0c0';
  const imageUrl = getCardImageUrl(card.image);

  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? '#1a1600' : '#10101c',
        border: `2px solid ${selected ? '#C9A84C' : attrColor + '44'}`,
        borderRadius: '8px',
        padding: '10px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        flex: '1 1 0',
        minWidth: 0,
        transition: 'border-color 100ms ease, box-shadow 100ms ease',
        boxShadow: selected ? '0 0 10px #C9A84C50' : 'none',
      }}
    >
      {/* Art */}
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '4px',
        overflow: 'hidden',
        background: '#1a1a2a',
        flexShrink: 0,
      }}>
        {imageUrl
          ? <img src={imageUrl} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🃏</div>
        }
      </div>

      {/* Name */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '10px',
        fontWeight: 600,
        color: '#e8e8f0',
        textAlign: 'center',
        lineHeight: 1.3,
        wordBreak: 'break-word',
      }}>
        {card.name}
      </div>

      {/* Cost + Rarity */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#60a0ff', fontWeight: 700 }}>
          {card.cost}✦
        </span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: rarityColor, letterSpacing: '0.05em' }}>
          {card.rarity}
        </span>
      </div>

      {/* Type + short rules */}
      {card.type === 'unit' && (
        <div style={{ fontSize: '9px', color: '#6a6a8a', textAlign: 'center' }}>
          {card.atk}/{card.hp} · {card.spd}spd
        </div>
      )}
      {card.rules && (
        <div style={{ fontSize: '8px', color: '#5a5a7a', textAlign: 'center', lineHeight: 1.4, maxWidth: '90px' }}>
          {card.rules.length > 60 ? card.rules.slice(0, 57) + '…' : card.rules}
        </div>
      )}

      {selected && (
        <div style={{ fontSize: '12px', color: '#C9A84C', fontWeight: 700 }}>✓</div>
      )}
    </div>
  );
}

// ── Blessing pick item ────────────────────────────────────────────────────────

function BlessingOption({ blessing, selected, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? '#0a1200' : '#10101c',
        border: `2px solid ${selected ? '#4ade80' : '#2a2a3a'}`,
        borderRadius: '8px',
        padding: '12px 14px',
        cursor: 'pointer',
        flex: '1 1 0',
        minWidth: 0,
        transition: 'border-color 100ms ease',
        boxShadow: selected ? '0 0 8px #4ade8040' : 'none',
      }}
    >
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '11px',
        fontWeight: 600,
        color: '#80e860',
        marginBottom: '6px',
        letterSpacing: '0.05em',
      }}>
        ✦ {blessing.name}
      </div>
      <div style={{
        fontFamily: "'Crimson Text', serif",
        fontStyle: 'italic',
        fontSize: '12px',
        color: '#7a8a7a',
        lineHeight: 1.5,
      }}>
        {blessing.desc}
      </div>
      {selected && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: '#4ade80', fontWeight: 700 }}>Chosen ✓</div>
      )}
    </div>
  );
}

// ── FIGHT reward screen ───────────────────────────────────────────────────────

function FightRewardView({ rewardData, tileType, onDone }) {
  const [selectedCard, setSelectedCard]       = useState(null); // card id or null
  const [selectedBlessing, setSelectedBlessing] = useState(null); // blessing id or null
  const [cardSkipped, setCardSkipped]          = useState(false);
  const [blessingSkipped, setBlessingSkipped]  = useState(false);

  const isBoss  = rewardData.type === 'boss' || tileType === 'boss';
  const isElite = rewardData.type === 'elite';
  const hasBlessings = isBoss || isElite;

  const title = isBoss ? 'BOSS DEFEATED' : isElite ? 'ELITE VANQUISHED' : 'VICTORY';

  const cardChosen     = cardSkipped    || selectedCard    !== null;
  const blessingChosen = !hasBlessings  || blessingSkipped || selectedBlessing !== null;
  const canContinue    = cardChosen && blessingChosen;

  function handleContinue() {
    const rewards = [{ type: 'gold', value: rewardData.gold }];
    if (selectedCard !== null) rewards.push({ type: 'card', value: selectedCard });
    if (selectedBlessing !== null) rewards.push({ type: 'blessing', value: selectedBlessing });
    onDone(rewards);
  }

  return (
    <>
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '26px', color: '#C9A84C', letterSpacing: '0.12em' }}>
          {title}
        </div>
      </div>

      {/* Gold — always awarded */}
      <div style={{ ...sectionBox, textAlign: 'center' }}>
        <SectionTitle>Gold Reward</SectionTitle>
        <GoldBadge amount={rewardData.gold} />
      </div>

      {/* Card choices */}
      {rewardData.cardOffers.length > 0 && (
        <div style={sectionBox}>
          <SectionTitle>Choose a Card {cardSkipped ? '(skipped)' : ''}</SectionTitle>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {rewardData.cardOffers.map(card => (
              <CardOption
                key={card.id}
                card={card}
                selected={selectedCard === card.id}
                onSelect={() => {
                  if (cardSkipped) return;
                  setSelectedCard(prev => prev === card.id ? null : card.id);
                }}
              />
            ))}
          </div>
          {!cardSkipped && (
            <div style={{ marginTop: '10px', textAlign: 'right' }}>
              <SecondaryBtn onClick={() => { setSelectedCard(null); setCardSkipped(true); }}>
                Skip Card
              </SecondaryBtn>
            </div>
          )}
        </div>
      )}

      {/* Blessing choices — elite/boss */}
      {hasBlessings && rewardData.blessingOffers.length > 0 && (
        <div style={sectionBox}>
          <SectionTitle>Choose a Blessing {blessingSkipped ? '(skipped)' : ''}</SectionTitle>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {rewardData.blessingOffers.map(b => (
              <BlessingOption
                key={b.id}
                blessing={b}
                selected={selectedBlessing === b.id}
                onSelect={() => {
                  if (blessingSkipped) return;
                  setSelectedBlessing(prev => prev === b.id ? null : b.id);
                }}
              />
            ))}
          </div>
          {!isBoss && !blessingSkipped && (
            <div style={{ marginTop: '10px', textAlign: 'right' }}>
              <SecondaryBtn onClick={() => { setSelectedBlessing(null); setBlessingSkipped(true); }}>
                Skip Blessing
              </SecondaryBtn>
            </div>
          )}
        </div>
      )}

      <PrimaryBtn onClick={handleContinue} disabled={!canContinue}>
        {canContinue ? 'Collect & Continue' : 'Make your choices…'}
      </PrimaryBtn>
    </>
  );
}

// ── TREASURE screen ───────────────────────────────────────────────────────────

function TreasureView({ rewardData, onDone }) {
  const [selectedCard, setSelectedCard]       = useState(null);
  const [selectedBlessing, setSelectedBlessing] = useState(null);

  const { treasureType } = rewardData;

  function handleContinue() {
    const rewards = [];
    if (treasureType === 'gold') rewards.push({ type: 'gold', value: rewardData.gold });
    if (treasureType === 'potion') rewards.push({ type: 'potion', value: 1 });
    if (treasureType === 'potion_converted') rewards.push({ type: 'gold', value: rewardData.gold });
    if (treasureType === 'card' && selectedCard !== null) rewards.push({ type: 'card', value: selectedCard });
    if (treasureType === 'blessing' && selectedBlessing !== null) rewards.push({ type: 'blessing', value: selectedBlessing });
    onDone(rewards);
  }

  const needsChoice =
    (treasureType === 'card' && selectedCard === null) ||
    (treasureType === 'blessing' && selectedBlessing === null);

  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', color: '#40a0d0', letterSpacing: '0.12em' }}>
          TREASURE FOUND
        </div>
      </div>

      <div style={{ ...sectionBox, textAlign: 'center' }}>
        {treasureType === 'gold' && (
          <>
            <SectionTitle>Gold</SectionTitle>
            <GoldBadge amount={rewardData.gold} />
          </>
        )}
        {treasureType === 'potion' && (
          <>
            <SectionTitle>Health Potion</SectionTitle>
            <div style={{ fontSize: '32px' }}>🧪</div>
            <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#60a0ff', marginTop: '6px' }}>
              +1 Potion added to your supply.
            </div>
          </>
        )}
        {treasureType === 'potion_converted' && (
          <>
            <SectionTitle>Potion (Converted)</SectionTitle>
            <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '13px', color: '#6a6a8a', marginBottom: '8px' }}>
              Potions already at max (3). Converted to gold.
            </div>
            <GoldBadge amount={rewardData.gold} />
          </>
        )}
      </div>

      {treasureType === 'card' && rewardData.cardOffers?.length > 0 && (
        <div style={sectionBox}>
          <SectionTitle>Choose a Card</SectionTitle>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {rewardData.cardOffers.map(card => (
              <CardOption
                key={card.id}
                card={card}
                selected={selectedCard === card.id}
                onSelect={() => setSelectedCard(prev => prev === card.id ? null : card.id)}
              />
            ))}
          </div>
        </div>
      )}

      {treasureType === 'blessing' && rewardData.blessingOffers?.length > 0 && (
        <div style={sectionBox}>
          <SectionTitle>Choose a Blessing</SectionTitle>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {rewardData.blessingOffers.map(b => (
              <BlessingOption
                key={b.id}
                blessing={b}
                selected={selectedBlessing === b.id}
                onSelect={() => setSelectedBlessing(prev => prev === b.id ? null : b.id)}
              />
            ))}
          </div>
        </div>
      )}

      <PrimaryBtn onClick={handleContinue} disabled={needsChoice}>
        {needsChoice ? 'Make your choice…' : 'Take Treasure'}
      </PrimaryBtn>
    </>
  );
}

// ── REST SITE screen ──────────────────────────────────────────────────────────

function RestView({ restHealAmount, onDone }) {
  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', color: '#48a868', letterSpacing: '0.12em' }}>
          REST SITE
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '15px', color: '#6a8a6a', marginTop: '8px' }}>
          You settle by a campfire and tend your wounds.
        </div>
      </div>

      <div style={{ ...sectionBox, textAlign: 'center' }}>
        <SectionTitle>HP Restored</SectionTitle>
        <div style={{ fontSize: '36px', marginBottom: '6px' }}>🔥</div>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '24px',
          fontWeight: 700,
          color: '#4ade80',
        }}>
          +{restHealAmount} HP
        </div>
      </div>

      <PrimaryBtn onClick={() => onDone([])}>
        Continue
      </PrimaryBtn>
    </>
  );
}

// ── SHOP screen ───────────────────────────────────────────────────────────────

function ShopView({ shopItems, run, onDone }) {
  const [gold, setGold]                  = useState(run.gold);
  const [bought, setBought]              = useState(new Set());       // purchased item indices
  const [removingCard, setRemovingCard]  = useState(false);
  const [selectedRemove, setSelectedRemove] = useState(null);         // card id to remove
  const [pendingRewards, setPendingRewards] = useState([]);

  function handleBuy(idx) {
    const item = shopItems[idx];
    if (bought.has(idx)) return;
    if (gold < item.price) return;

    const reward = item.itemType === 'card'
      ? { type: 'card', value: item.card.id }
      : { type: 'blessing', value: item.blessing.id };

    setGold(g => g - item.price);
    setBought(s => new Set([...s, idx]));
    setPendingRewards(r => [...r, reward]);
  }

  function handleCardRemoval(idx) {
    const item = shopItems[idx];
    if (bought.has(idx)) return;
    if (gold < item.price) return;
    setRemovingCard(true);
  }

  function confirmRemoval(cardId) {
    const removalIdx = shopItems.findIndex(i => i.itemType === 'card_removal');
    if (removalIdx === -1) return;
    const item = shopItems[removalIdx];
    setGold(g => g - item.price);
    setBought(s => new Set([...s, removalIdx]));
    setPendingRewards(r => [...r, { type: 'remove_card', value: cardId }]);
    setRemovingCard(false);
    setSelectedRemove(null);
  }

  function handleLeave() {
    // Gold difference from starting gold is tracked via pendingRewards (cards add themselves, gold was spent)
    // We pass gold spend as a negative gold reward
    const startGold = run.gold;
    const goldSpent = startGold - gold;
    const allRewards = goldSpent > 0
      ? [{ type: 'gold', value: -goldSpent }, ...pendingRewards]
      : pendingRewards;
    onDone(allRewards);
  }

  // Group deck card ids with counts for removal picker
  const deckCounts = {};
  for (const id of run.deck) {
    deckCounts[id] = (deckCounts[id] || 0) + 1;
  }
  const deckUniqueCards = Object.keys(deckCounts).map(id => ({ card: CARD_DB[id], count: deckCounts[id] })).filter(x => x.card);

  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', color: '#C9A84C', letterSpacing: '0.12em' }}>
          THE MERCHANT
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '13px', color: '#6a6a8a', marginTop: '4px' }}>
          A travelling merchant offers their wares.
        </div>
      </div>

      {/* Gold display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <GoldBadge amount={gold} />
        {gold < run.gold && (
          <span style={{ fontSize: '12px', color: '#6a6a8a', fontFamily: "'Crimson Text', serif" }}>
            (spent {run.gold - gold})
          </span>
        )}
      </div>

      {/* Shop items */}
      <div style={{ ...sectionBox, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {shopItems.map((item, idx) => {
          const isBought   = bought.has(idx);
          const canAfford  = gold >= item.price;

          if (item.itemType === 'card') {
            return (
              <ShopCardItem
                key={idx}
                item={item}
                isBought={isBought}
                canAfford={canAfford}
                onBuy={() => handleBuy(idx)}
              />
            );
          }

          if (item.itemType === 'card_removal') {
            return (
              <ShopCardRemovalItem
                key={idx}
                item={item}
                isBought={isBought}
                canAfford={canAfford}
                onBuy={() => handleCardRemoval(idx)}
              />
            );
          }

          if (item.itemType === 'blessing') {
            const alreadyOwned = run.blessings.includes(item.blessing.id);
            return (
              <ShopBlessingItem
                key={idx}
                item={item}
                isBought={isBought || alreadyOwned}
                canAfford={canAfford}
                onBuy={() => handleBuy(idx)}
              />
            );
          }

          return null;
        })}
      </div>

      {/* Card removal picker */}
      {removingCard && (
        <div style={sectionBox}>
          <SectionTitle>Select a card to remove from your deck</SectionTitle>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {deckUniqueCards.map(({ card, count }) => (
              <div
                key={card.id}
                onClick={() => setSelectedRemove(card.id)}
                style={{
                  background: selectedRemove === card.id ? '#1a1600' : '#10101c',
                  border: `2px solid ${selectedRemove === card.id ? '#C9A84C' : '#2a2a3a'}`,
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  minWidth: '70px',
                }}
              >
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#e8e8f0', textAlign: 'center' }}>
                  {card.name}
                </div>
                <div style={{ fontSize: '8px', color: RARITY_COLOR[card.rarity] }}>
                  {card.rarity} · {card.cost}✦
                </div>
                {count > 1 && (
                  <div style={{ fontSize: '8px', color: '#6a6a8a' }}>×{count}</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <PrimaryBtn onClick={() => selectedRemove && confirmRemoval(selectedRemove)} disabled={!selectedRemove}>
              Remove Card
            </PrimaryBtn>
            <SecondaryBtn onClick={() => { setRemovingCard(false); setSelectedRemove(null); }}>
              Cancel
            </SecondaryBtn>
          </div>
        </div>
      )}

      <SecondaryBtn onClick={handleLeave}>
        Leave Shop
      </SecondaryBtn>
    </>
  );
}

function ShopCardItem({ item, isBought, canAfford, onBuy }) {
  const attrColor = item.card.attribute ? (ATTRIBUTES[item.card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  const rarityColor = RARITY_COLOR[item.card.rarity] ?? '#a0a0c0';
  const imageUrl = getCardImageUrl(item.card.image);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px',
      background: isBought ? '#0d1a0d' : '#10101c',
      border: `1px solid ${isBought ? '#4ade8040' : '#2a2a3a'}`,
      borderRadius: '6px',
      opacity: isBought ? 0.7 : 1,
    }}>
      {/* Thumbnail */}
      <div style={{ width: '48px', height: '48px', borderRadius: '4px', overflow: 'hidden', background: '#1a1a2a', flexShrink: 0 }}>
        {imageUrl
          ? <img src={imageUrl} alt={item.card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🃏</div>
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, color: '#e8e8f0' }}>
          {item.card.name}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
          <span style={{ fontSize: '10px', color: '#60a0ff' }}>{item.card.cost}✦</span>
          <span style={{ fontSize: '10px', color: rarityColor }}>{item.card.rarity}</span>
          {item.card.type === 'unit' && (
            <span style={{ fontSize: '10px', color: '#6a6a8a' }}>{item.card.atk}/{item.card.hp}</span>
          )}
        </div>
        {item.card.rules && (
          <div style={{ fontSize: '9px', color: '#5a5a7a', marginTop: '2px', lineHeight: 1.4 }}>
            {item.card.rules.length > 70 ? item.card.rules.slice(0, 67) + '…' : item.card.rules}
          </div>
        )}
      </div>

      {/* Price / Buy */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 700, color: canAfford && !isBought ? '#C9A84C' : '#4a4a6a' }}>
          🪙{item.price}
        </div>
        {isBought
          ? <div style={{ fontSize: '11px', color: '#4ade80' }}>Purchased ✓</div>
          : (
            <button
              onClick={onBuy}
              disabled={!canAfford}
              style={{
                background: canAfford ? 'linear-gradient(135deg, #3a2a00, #8a6a00)' : '#1a1a2a',
                color: canAfford ? '#C9A84C' : '#3a3a5a',
                fontFamily: "'Cinzel', serif",
                fontSize: '10px',
                border: `1px solid ${canAfford ? '#C9A84C60' : '#2a2a3a'}`,
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: canAfford ? 'pointer' : 'not-allowed',
              }}
            >
              Buy
            </button>
          )
        }
      </div>
    </div>
  );
}

function ShopCardRemovalItem({ item, isBought, canAfford, onBuy }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px',
      background: isBought ? '#0d1a0d' : '#10101c',
      border: `1px solid ${isBought ? '#4ade8040' : '#2a2a3a'}`,
      borderRadius: '6px',
      opacity: isBought ? 0.7 : 1,
    }}>
      <div style={{ fontSize: '28px', flexShrink: 0 }}>✂️</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, color: '#e8e8f0' }}>
          Card Removal
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '12px', color: '#6a6a8a', marginTop: '2px' }}>
          Remove one card from your deck permanently.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 700, color: canAfford && !isBought ? '#C9A84C' : '#4a4a6a' }}>
          🪙{item.price}
        </div>
        {isBought
          ? <div style={{ fontSize: '11px', color: '#4ade80' }}>Done ✓</div>
          : (
            <button
              onClick={onBuy}
              disabled={!canAfford}
              style={{
                background: canAfford ? 'linear-gradient(135deg, #3a2a00, #8a6a00)' : '#1a1a2a',
                color: canAfford ? '#C9A84C' : '#3a3a5a',
                fontFamily: "'Cinzel', serif",
                fontSize: '10px',
                border: `1px solid ${canAfford ? '#C9A84C60' : '#2a2a3a'}`,
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: canAfford ? 'pointer' : 'not-allowed',
              }}
            >
              Select
            </button>
          )
        }
      </div>
    </div>
  );
}

function ShopBlessingItem({ item, isBought, canAfford, onBuy }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px',
      background: isBought ? '#0d1a0d' : '#10101c',
      border: `1px solid ${isBought ? '#4ade8040' : '#2a2a3a'}`,
      borderRadius: '6px',
      opacity: isBought ? 0.7 : 1,
    }}>
      <div style={{ fontSize: '24px', flexShrink: 0 }}>✦</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, color: '#80e860' }}>
          {item.blessing.name}
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '12px', color: '#6a8a6a', marginTop: '2px', lineHeight: 1.4 }}>
          {item.blessing.desc}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 700, color: canAfford && !isBought ? '#C9A84C' : '#4a4a6a' }}>
          🪙{item.price}
        </div>
        {isBought
          ? <div style={{ fontSize: '11px', color: '#4ade80' }}>Purchased ✓</div>
          : (
            <button
              onClick={onBuy}
              disabled={!canAfford}
              style={{
                background: canAfford ? 'linear-gradient(135deg, #3a2a00, #8a6a00)' : '#1a1a2a',
                color: canAfford ? '#C9A84C' : '#3a3a5a',
                fontFamily: "'Cinzel', serif",
                fontSize: '10px',
                border: `1px solid ${canAfford ? '#C9A84C60' : '#2a2a3a'}`,
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: canAfford ? 'pointer' : 'not-allowed',
              }}
            >
              Buy
            </button>
          )
        }
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function RewardScreen({ mode, run, rewardData, shopItems, restHealAmount, tileType, onDone }) {
  return (
    <div style={screen}>
      {mode === 'fight' && (
        <FightRewardView rewardData={rewardData} tileType={tileType} onDone={onDone} />
      )}
      {mode === 'treasure' && (
        <TreasureView rewardData={rewardData} onDone={onDone} />
      )}
      {mode === 'rest' && (
        <RestView restHealAmount={restHealAmount} onDone={onDone} />
      )}
      {mode === 'shop' && (
        <ShopView shopItems={shopItems} run={run} onDone={onDone} />
      )}
    </div>
  );
}
