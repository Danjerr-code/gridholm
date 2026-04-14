import { useState, useEffect, useRef, useCallback } from 'react';
import { PACK_TYPES, generatePack, getTotalPackCount } from '../../packs/packGenerator.js';
import { addCardsToCollection } from '../../packs/collection.js';
import { getCardImageUrl } from '../../supabase.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { usePackCredits } from '../../packs/usePackCredits.js';

// ── Sound generation via Web Audio API ────────────────────────────────────────

function getAudioContext() {
  if (!window._packAudioCtx) {
    try { window._packAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  return window._packAudioCtx;
}

function playTone(frequency, type, duration, volume = 0.15, delay = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  } catch {}
}

function playPackBreak() {
  playTone(80, 'sawtooth', 0.15, 0.2);
  playTone(160, 'square', 0.1, 0.1, 0.05);
  playTone(40, 'sine', 0.3, 0.25, 0.0);
}

function playCommonReveal() {
  playTone(523, 'sine', 0.3, 0.1);
  playTone(659, 'sine', 0.2, 0.08, 0.1);
}

function playRareReveal() {
  playTone(659, 'sine', 0.2, 0.15);
  playTone(784, 'sine', 0.25, 0.12, 0.12);
  playTone(987, 'sine', 0.3, 0.1, 0.25);
}

function playLegendaryReveal() {
  // Deep impact
  playTone(60, 'sawtooth', 0.4, 0.3);
  playTone(55, 'sine', 0.5, 0.25, 0.05);
  // Rising chime
  playTone(440, 'sine', 0.4, 0.12, 0.3);
  playTone(554, 'sine', 0.4, 0.12, 0.45);
  playTone(659, 'sine', 0.5, 0.15, 0.6);
  playTone(880, 'sine', 0.6, 0.18, 0.8);
}

function playCardSettle() {
  playTone(120, 'sine', 0.08, 0.08);
}

// ── Rarity constants ───────────────────────────────────────────────────────────

const RARITY_COLORS = { common: '#9CA3AF', rare: '#818CF8', legendary: '#F59E0B' };
const RARITY_GLOW   = { common: 'none', rare: '0 0 12px #818CF8', legendary: '0 0 20px #F59E0B, 0 0 40px #F59E0B88' };

// ── Particle effect ───────────────────────────────────────────────────────────

function Particles({ color, count = 12, active }) {
  if (!active) return null;
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360;
    const dist = 60 + Math.random() * 60;
    const size = 4 + Math.random() * 6;
    return { angle, dist, size };
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
            transform: `translate(-50%, -50%)`,
            animation: `particle-burst-${i % 4} 0.7s ease-out forwards`,
            '--angle': `${p.angle}deg`,
            '--dist': `${p.dist}px`,
          }}
        />
      ))}
    </div>
  );
}

// Global CSS for animations
const ANIMATION_STYLES = `
@keyframes pack-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}
@keyframes pack-glow-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes card-flip {
  0% { transform: rotateY(0deg); }
  50% { transform: rotateY(90deg); }
  100% { transform: rotateY(0deg); }
}
@keyframes legendary-lift {
  0% { transform: scale(1) translateY(0); z-index: 10; }
  30% { transform: scale(1.5) translateY(-20px); }
  80% { transform: scale(1.5) translateY(-20px); }
  100% { transform: scale(1) translateY(0); }
}
@keyframes screen-shake {
  0%, 100% { transform: translate(0,0); }
  20% { transform: translate(-4px, 2px); }
  40% { transform: translate(4px, -2px); }
  60% { transform: translate(-3px, 3px); }
  80% { transform: translate(3px, -1px); }
}
@keyframes particle-burst-0 {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + calc(cos(var(--angle)) * var(--dist))), calc(-50% + calc(sin(var(--angle)) * var(--dist)))) scale(0); opacity: 0; }
}
@keyframes particle-burst-1 {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + calc(cos(calc(var(--angle) + 90deg)) * var(--dist))), calc(-50% + calc(sin(calc(var(--angle) + 90deg)) * var(--dist)))) scale(0); opacity: 0; }
}
@keyframes particle-burst-2 {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + calc(cos(calc(var(--angle) + 180deg)) * var(--dist))), calc(-50% + calc(sin(calc(var(--angle) + 180deg)) * var(--dist)))) scale(0); opacity: 0; }
}
@keyframes particle-burst-3 {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + calc(cos(calc(var(--angle) + 270deg)) * var(--dist))), calc(-50% + calc(sin(calc(var(--angle) + 270deg)) * var(--dist)))) scale(0); opacity: 0; }
}
@keyframes gold-drift {
  0% { transform: translateY(0) scale(1); opacity: 0.8; }
  100% { transform: translateY(-40px) scale(0.5); opacity: 0; }
}
@keyframes flash-in {
  0% { opacity: 0; }
  20% { opacity: 0.6; }
  100% { opacity: 0; }
}
@keyframes legendary-border-pulse {
  0%, 100% { box-shadow: 0 0 20px #F59E0B, 0 0 40px #F59E0B88; }
  50% { box-shadow: 0 0 30px #F59E0B, 0 0 60px #F59E0Bcc, 0 0 80px #F59E0B44; }
}
@keyframes card-back-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}
`;

// ── CardBack component ─────────────────────────────────────────────────────────

function CardBack({ card, isFlipped, onFlip, isLast, isLegendaryCard, anticipate }) {
  const [flipping, setFlipping] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [legendaryExpanded, setLegendaryExpanded] = useState(false);

  const rarityColor = RARITY_COLORS[card.rarity] || '#9CA3AF';
  const imageUrl = getCardImageUrl(card.image);

  function handleTap() {
    if (isFlipped || flipping) return;

    if (card.rarity === 'legendary') {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      setTimeout(() => {
        setFlipping(true);
        playLegendaryReveal();
        setTimeout(() => {
          setFlipping(false);
          setLegendaryExpanded(true);
          setShowParticles(true);
          setTimeout(() => setShowParticles(false), 800);
          setTimeout(() => {
            setLegendaryExpanded(false);
            playCardSettle();
            onFlip();
          }, 2200);
        }, 600);
      }, 200);
    } else if (card.rarity === 'rare') {
      setFlipping(true);
      playRareReveal();
      setTimeout(() => {
        setFlipping(false);
        setShowParticles(true);
        setTimeout(() => setShowParticles(false), 700);
        playCardSettle();
        onFlip();
      }, 600);
    } else {
      setFlipping(true);
      playCommonReveal();
      setTimeout(() => {
        setFlipping(false);
        playCardSettle();
        onFlip();
      }, 400);
    }
  }

  const isLegendaryAndExpanded = legendaryExpanded;

  return (
    <div
      onClick={handleTap}
      style={{
        position: 'relative',
        width: 88,
        height: 128,
        cursor: isFlipped ? 'default' : 'pointer',
        flexShrink: 0,
        animation: shaking ? 'screen-shake 0.4s ease-in-out' : isLegendaryAndExpanded ? 'legendary-lift 2.2s ease-in-out' : 'none',
        zIndex: isLegendaryAndExpanded ? 20 : 1,
        transition: 'z-index 0s',
      }}
    >
      {/* Legendary flash overlay */}
      {isLegendaryAndExpanded && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(245, 158, 11, 0.15)',
          zIndex: 15,
          pointerEvents: 'none',
          animation: 'flash-in 0.5s ease-out forwards',
        }} />
      )}

      {/* Card face or back */}
      <div style={{
        width: '100%',
        height: '100%',
        borderRadius: 8,
        overflow: 'visible',
        position: 'relative',
        animation: flipping ? 'card-flip 0.4s ease-in-out' : 'none',
      }}>
        {!isFlipped && !flipping ? (
          // Card back
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: 8,
            border: `2px solid ${card.rarity === 'common' ? '#2a2a4a' : rarityColor}`,
            boxShadow: card.rarity !== 'common'
              ? `0 0 ${card.rarity === 'legendary' ? 16 : 8}px ${rarityColor}88`
              : 'none',
            overflow: 'hidden',
            position: 'relative',
          }}>
            <img
              src="/cardback.png"
              alt="Card back"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                animation: card.rarity === 'legendary' && !isFlipped ? 'card-back-pulse 1s ease-in-out infinite' : 'none',
              }}
            />
            {/* Anticipation: last card glow for guaranteed rare/legendary */}
            {anticipate && isLast && (
              <div style={{
                position: 'absolute',
                inset: -4,
                borderRadius: 10,
                border: `2px solid ${rarityColor}`,
                animation: 'card-back-pulse 0.6s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
            )}
          </div>
        ) : (
          // Card face (revealed)
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: 8,
            background: '#0f0f1e',
            border: `2px solid ${rarityColor}`,
            boxShadow: RARITY_GLOW[card.rarity],
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: card.rarity === 'legendary' && isLegendaryAndExpanded ? 'legendary-border-pulse 1s ease-in-out infinite' : 'none',
          }}>
            {imageUrl ? (
              <img src={imageUrl} alt={card.name} style={{ width: '100%', height: 70, objectFit: 'cover' }} />
            ) : (
              <div style={{
                height: 70,
                background: `${rarityColor}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                color: rarityColor,
                fontFamily: "'Cinzel', serif",
              }}>{card.type?.toUpperCase()}</div>
            )}
            <div style={{ padding: '4px 5px', flex: 1 }}>
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: isLegendaryAndExpanded ? 11 : 9,
                fontWeight: 600,
                color: rarityColor,
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{card.name}</div>
              <div style={{
                fontSize: 8,
                color: '#6a6a8a',
                fontFamily: "'Cinzel', serif",
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}>{card.rarity}</div>
            </div>
          </div>
        )}
      </div>

      {/* Particle burst */}
      {showParticles && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
          {Array.from({ length: 16 }, (_, i) => {
            const angle = (i / 16) * Math.PI * 2;
            const dist = 50 + Math.random() * 40;
            const size = 4 + Math.random() * 5;
            const duration = 0.5 + Math.random() * 0.3;
            return (
              <div key={i} style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: size,
                height: size,
                borderRadius: '50%',
                background: rarityColor,
                boxShadow: `0 0 4px ${rarityColor}`,
                transform: `translate(-50%, -50%)`,
                animation: `none`,
                transition: 'none',
                animationName: 'none',
              }}
                ref={el => {
                  if (el) {
                    el.animate([
                      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                      {
                        transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0)`,
                        opacity: 0,
                      },
                    ], { duration: duration * 1000, easing: 'ease-out', fill: 'forwards' });
                  }
                }}
              />
            );
          })}
        </div>
      )}

      {/* Gold drifting particles for legendary anticipation */}
      {!isFlipped && card.rarity === 'legendary' && anticipate && isLast && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute',
              left: `${30 + i * 20}%`,
              bottom: '10%',
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: '#F59E0B',
              animation: `gold-drift ${1 + i * 0.4}s ease-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }} />
          ))}
        </div>
      )}

      {/* Legendary name display when expanded */}
      {isLegendaryAndExpanded && (
        <div style={{
          position: 'absolute',
          bottom: -36,
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          fontFamily: "'Cinzel', serif",
          fontSize: 14,
          fontWeight: 700,
          color: '#F59E0B',
          textShadow: '0 0 12px #F59E0B',
          letterSpacing: '0.08em',
        }}>{card.name}</div>
      )}
    </div>
  );
}

// ── Phase A: Pack Selection ────────────────────────────────────────────────────

const PACK_ART = {
  light:  '/pack-light.png',
  primal: '/pack-primal.png',
  mystic: '/pack-mystic.png',
  dark:   '/pack-dark.png',
};

const PACK_SELECTION_STYLES = `
@media (min-width: 480px) {
  .pack-grid { grid-template-columns: repeat(2, 1fr) !important; }
}
`;

function PackCard({ packKey, def, count, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const disabled = count === 0;
  const artSrc = PACK_ART[packKey];

  return (
    <div
      onClick={() => !disabled && onSelect(packKey)}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.38 : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        transition: 'transform 150ms ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {/* TCG card — 2:3 aspect ratio */}
      <div style={{
        width: 130,
        height: 195,
        borderRadius: 10,
        overflow: 'hidden',
        border: `2px solid ${hovered ? def.color : def.color + '60'}`,
        boxShadow: hovered
          ? `0 0 22px ${def.color}90, 0 0 8px ${def.color}40`
          : disabled
          ? 'none'
          : `0 0 10px ${def.color}30`,
        transition: 'box-shadow 150ms ease, border-color 150ms ease',
        background: '#0a0a0f',
        flexShrink: 0,
      }}>
        <img
          src={artSrc}
          alt={def.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>

      {/* Pack name */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 13,
        fontWeight: 700,
        color: '#C9A84C',
        letterSpacing: '0.08em',
        textAlign: 'center',
      }}>{def.name}</div>

      {/* Pack count */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 12,
        color: disabled ? '#3a3a5a' : def.color,
        letterSpacing: '0.04em',
      }}>×{count} available</div>
    </div>
  );
}

function PackSelectionPhase({ inventory, onSelectPack }) {
  // Only show the four faction packs — exclude the generic mixed pack
  const factionPacks = ['light', 'primal', 'mystic', 'dark'];
  // Mixed credits are redeemable on any faction pack
  const mixedCredits = inventory.mixed || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', width: '100%' }}>
      <style>{PACK_SELECTION_STYLES}</style>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 13,
        color: '#6a6a8a',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>Select a Pack to Open</div>

      {/* 2×2 grid on desktop, single column on mobile */}
      <div
        className="pack-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '28px 24px',
          width: '100%',
          maxWidth: 340,
          justifyItems: 'center',
        }}
      >
        {factionPacks.map(key => (
          <PackCard
            key={key}
            packKey={key}
            def={PACK_TYPES[key]}
            count={(inventory[key] || 0) + mixedCredits}
            onSelect={onSelectPack}
          />
        ))}
      </div>
    </div>
  );
}

// ── Phase B: Sealed Pack animation ────────────────────────────────────────────

function SealedPackPhase({ packType, cards, onOpen }) {
  const [opening, setOpening] = useState(false);
  const [cracked, setCracked] = useState(false);
  const def = PACK_TYPES[packType];
  const hasLegendary = cards.some(c => c.rarity === 'legendary');

  function handleTap() {
    if (opening) return;
    setOpening(true);
    playPackBreak();
    setTimeout(() => { setCracked(true); }, 150);
    setTimeout(onOpen, 700);
  }

  return (
    <div
      onClick={handleTap}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
        cursor: opening ? 'default' : 'pointer',
      }}
    >
      {/* Sealed pack */}
      <div style={{
        position: 'relative',
        width: 140,
        height: 200,
        borderRadius: 12,
        background: '#0a0a0f',
        border: `2px solid ${def.color}80`,
        boxShadow: cracked
          ? `0 0 60px ${def.color}cc, 0 0 100px ${def.color}66`
          : hasLegendary
          ? `0 0 24px ${def.color}80, 0 0 8px #F59E0B60`
          : `0 0 24px ${def.color}40`,
        overflow: 'hidden',
        animation: opening ? 'none' : 'pack-float 3s ease-in-out infinite',
        transition: 'box-shadow 0.2s ease',
      }}>
        {/* Pack art image */}
        <img
          src={PACK_ART[packType]}
          alt={def.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {/* Glow pulse overlay */}
        <div style={{
          position: 'absolute',
          inset: -8,
          borderRadius: 18,
          background: `radial-gradient(ellipse, ${def.color}20, transparent 70%)`,
          animation: 'pack-glow-pulse 2s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* Legendary golden crack */}
        {hasLegendary && (
          <div style={{
            position: 'absolute',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%) rotate(-15deg)',
            width: 3,
            height: '40%',
            background: 'linear-gradient(to bottom, transparent, #F59E0B, transparent)',
            boxShadow: '0 0 8px #F59E0B',
            borderRadius: 2,
            opacity: 0.7,
            animation: 'pack-glow-pulse 1.5s ease-in-out infinite',
          }} />
        )}

        {/* Crack effect on open */}
        {cracked && (
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 12,
            background: `radial-gradient(ellipse, ${def.color}80 0%, transparent 60%)`,
            animation: 'flash-in 0.5s ease-out forwards',
          }} />
        )}
      </div>

      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 12,
        color: '#4a4a6a',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        animation: opening ? 'none' : 'pack-glow-pulse 2s ease-in-out infinite',
      }}>
        {opening ? 'Opening…' : 'Tap to Open'}
      </div>
    </div>
  );
}

// ── Phase C+D: Card Reveal ─────────────────────────────────────────────────────

function CardRevealPhase({ cards, packType, onDone, onOpenAnother, hasMorePacks }) {
  const [flippedCount, setFlippedCount] = useState(0);
  const allFlipped = flippedCount >= cards.length;
  const def = PACK_TYPES[packType];

  function handleFlip() {
    setFlippedCount(prev => prev + 1);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      {/* Card row */}
      <div style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
        padding: '20px 0 40px',
        position: 'relative',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {cards.map((card, i) => {
          const isFlipped = i < flippedCount;
          const isNext = i === flippedCount;
          const isLast = i === cards.length - 1;
          const flippedSoFar = flippedCount;
          // Anticipation: all except last flipped, and next is last card
          const anticipate = flippedSoFar >= cards.length - 2 && isNext && isLast;

          return (
            <CardBack
              key={card.id}
              card={card}
              isFlipped={isFlipped}
              onFlip={handleFlip}
              isLast={isLast}
              isLegendaryCard={card.rarity === 'legendary'}
              anticipate={anticipate}
            />
          );
        })}
      </div>

      {!allFlipped && (
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 11,
          color: '#4a4a6a',
          letterSpacing: '0.08em',
        }}>
          Tap cards to reveal
        </div>
      )}

      {/* Summary + buttons after all revealed */}
      {allFlipped && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 12,
            color: '#C9A84C',
            letterSpacing: '0.08em',
            textAlign: 'center',
            marginBottom: 4,
          }}>Cards Added to Collection</div>

          <button
            onClick={onDone}
            style={{
              background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
              color: '#0a0a0f',
              fontFamily: "'Cinzel', serif",
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              padding: '12px 24px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >Done</button>

          {hasMorePacks && (
            <button
              onClick={onOpenAnother}
              style={{
                background: `linear-gradient(135deg, ${def.color}33, ${def.color}22)`,
                color: def.color,
                fontFamily: "'Cinzel', serif",
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${def.color}60`,
                borderRadius: 6,
                padding: '10px 24px',
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >Open Another {def.name}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main PackOpeningScreen ─────────────────────────────────────────────────────

export default function PackOpeningScreen({ onBack }) {
  const { currentUser } = useAuth();
  const { inventory, loading: creditsLoading, consumeCredit, refreshInventory } = usePackCredits(currentUser);

  const [phase, setPhase] = useState('select'); // 'select' | 'sealed' | 'reveal'
  const [selectedPackType, setSelectedPackType] = useState(null);
  const [currentCards, setCurrentCards] = useState(null);
  const [shakeScreen, setShakeScreen] = useState(false);

  // First-time welcome: show if no collection yet
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      const col = localStorage.getItem('gridholm_collection');
      return !col || col === '{}' || col === 'null';
    } catch { return false; }
  });

  async function handleSelectPack(packType) {
    const cards = generatePack(packType);
    await consumeCredit(packType);
    setSelectedPackType(packType);
    setCurrentCards(cards);
    setShowWelcome(false);
    setPhase('sealed');
  }

  function handleOpenPack() {
    setPhase('reveal');
  }

  async function handleDone() {
    if (currentCards) {
      addCardsToCollection(currentCards.map(c => c.id));
    }
    setCurrentCards(null);
    setSelectedPackType(null);
    setPhase('select');
    await refreshInventory();
  }

  async function handleOpenAnother() {
    if (currentCards) {
      addCardsToCollection(currentCards.map(c => c.id));
    }
    const cards = generatePack(selectedPackType);
    await consumeCredit(selectedPackType);
    setCurrentCards(cards);
    setPhase('sealed');
  }

  const mixedCredits = inventory.mixed || 0;
  const hasMoreOfSameType = selectedPackType &&
    ((inventory[selectedPackType] || 0) + mixedCredits) > 0;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 16px',
      animation: shakeScreen ? 'screen-shake 0.4s ease-in-out' : 'none',
    }}>
      <style>{ANIMATION_STYLES}</style>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#4a4a6a',
            fontFamily: "'Cinzel', serif",
            fontSize: 13,
            cursor: 'pointer',
            padding: '4px 0',
            marginRight: 'auto',
          }}
        >← Back</button>
        <h2 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 20,
          fontWeight: 600,
          color: '#C9A84C',
          letterSpacing: '0.15em',
          margin: 0,
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
        }}>PACKS</h2>
      </div>

      {/* Welcome banner */}
      {showWelcome && phase === 'select' && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1200, #2a1e00)',
          border: '1px solid #C9A84C60',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 20,
          maxWidth: 360,
          textAlign: 'center',
          boxShadow: '0 0 20px #C9A84C20',
        }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: '#C9A84C', marginBottom: 6 }}>
            Welcome to Gridholm!
          </div>
          <div style={{ fontSize: 13, color: '#a0a0c0', lineHeight: 1.5 }}>
            You have 3 free Gridholm Packs to open. Discover cards and start building your collection!
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 420, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'select' && creditsLoading ? (
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: '#4a4a6a', letterSpacing: '0.08em' }}>
            Loading…
          </div>
        ) : phase === 'select' && (
          <PackSelectionPhase inventory={inventory} onSelectPack={handleSelectPack} />
        )}

        {phase === 'sealed' && selectedPackType && currentCards && (
          <SealedPackPhase
            packType={selectedPackType}
            cards={currentCards}
            onOpen={handleOpenPack}
          />
        )}

        {phase === 'reveal' && currentCards && selectedPackType && (
          <CardRevealPhase
            cards={currentCards}
            packType={selectedPackType}
            onDone={handleDone}
            onOpenAnother={handleOpenAnother}
            hasMorePacks={hasMoreOfSameType}
          />
        )}
      </div>
    </div>
  );
}
