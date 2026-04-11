import { getCardImageUrl } from '../supabase.js';
import { CHAMPIONS } from '../engine/champions.js';
import { FACTION_INFO } from '../engine/cards.js';
import { LightSymbol, PrimalSymbol, MysticSymbol, DarkSymbol } from '../assets/attributeSymbols.jsx';

function SteamLogoIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.497 1.009 2.455-.397.957-1.494 1.41-2.455 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.662 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z"/>
    </svg>
  );
}

function DeckIcon({ size = 32, color = '#C9A84C' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Back card */}
      <rect x="14" y="10" width="22" height="30" rx="3" fill="#0a0a0f" stroke={color} strokeWidth="1.2" opacity="0.5"/>
      {/* Middle card */}
      <rect x="10" y="7" width="22" height="30" rx="3" fill="#111827" stroke={color} strokeWidth="1.2" opacity="0.75"/>
      {/* Front card */}
      <rect x="6" y="4" width="22" height="30" rx="3" fill="#111827" stroke={color} strokeWidth="1.5"/>
      {/* Rune diamond */}
      <path d="M17 14 L22 19 L17 24 L12 19 Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
      <circle cx="17" cy="19" r="2" fill={color} opacity="0.7"/>
      {/* Bottom dots (card pips) */}
      <circle cx="12" cy="28" r="1.2" fill={color} opacity="0.5"/>
      <circle cx="17" cy="28" r="1.2" fill={color} opacity="0.5"/>
      <circle cx="22" cy="28" r="1.2" fill={color} opacity="0.5"/>
    </svg>
  );
}

function SwordsIcon({ size = 32, color = '#3b82f6' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Sword 1: top-left to bottom-right */}
      <line x1="8" y1="8" x2="38" y2="38" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      {/* Guard 1 */}
      <line x1="11" y1="20" x2="20" y2="11" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      {/* Pommel 1 */}
      <circle cx="9" cy="9" r="2.5" fill={color} opacity="0.7"/>
      {/* Sword 2: top-right to bottom-left */}
      <line x1="40" y1="8" x2="10" y2="38" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      {/* Guard 2 */}
      <line x1="28" y1="11" x2="37" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      {/* Pommel 2 */}
      <circle cx="39" cy="9" r="2.5" fill={color} opacity="0.7"/>
      {/* Center gem */}
      <circle cx="24" cy="24" r="3" fill={color} opacity="0.5" stroke={color} strokeWidth="1"/>
    </svg>
  );
}

function SkullIcon({ size = 32, color = '#ef4444' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Skull dome */}
      <path d="M24 7 C14 7 8 13.5 8 21 C8 27 11.5 31.5 17 33.5 L17 39 L31 39 L31 33.5 C36.5 31.5 40 27 40 21 C40 13.5 34 7 24 7 Z" stroke={color} strokeWidth="1.5" fill="#111827"/>
      {/* Left eye socket */}
      <ellipse cx="18" cy="21" rx="4.5" ry="4" fill={color} opacity="0.85"/>
      {/* Right eye socket */}
      <ellipse cx="30" cy="21" rx="4.5" ry="4" fill={color} opacity="0.85"/>
      {/* Nose cavity */}
      <path d="M22 27 L24 30.5 L26 27 Z" fill={color} opacity="0.5"/>
      {/* Teeth */}
      <line x1="19" y1="33.5" x2="19" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <line x1="24" y1="34" x2="24" y2="38.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <line x1="29" y1="33.5" x2="29" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      {/* Crown */}
      <path d="M14 12 L17 8 L20 12 L24 7 L28 12 L31 8 L34 12" stroke={color} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" fill="none" opacity="0.7"/>
    </svg>
  );
}

const ATTR_CRYSTALS = {
  light:  LightSymbol,
  primal: PrimalSymbol,
  mystic: MysticSymbol,
  dark:   DarkSymbol,
};

const STYLES = `
  html { scroll-behavior: smooth; }

  .lp-hero-crystals {
    display: flex;
    gap: 32px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 32px;
  }
  .lp-crystal-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .lp-crystal-label {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  @keyframes lp-pulse-gold {
    0%, 100% { filter: drop-shadow(0 0 6px #C9A84C60); }
    50%       { filter: drop-shadow(0 0 20px #C9A84CAA); }
  }
  @keyframes lp-pulse-green {
    0%, 100% { filter: drop-shadow(0 0 6px #22C55E60); }
    50%       { filter: drop-shadow(0 0 20px #22C55EAA); }
  }
  @keyframes lp-pulse-purple {
    0%, 100% { filter: drop-shadow(0 0 6px #A855F760); }
    50%       { filter: drop-shadow(0 0 20px #A855F7AA); }
  }
  @keyframes lp-pulse-red {
    0%, 100% { filter: drop-shadow(0 0 6px #EF444460); }
    50%       { filter: drop-shadow(0 0 20px #EF4444AA); }
  }
  .lp-crystal-glow-light  { animation: lp-pulse-gold   2.6s ease-in-out infinite; }
  .lp-crystal-glow-primal { animation: lp-pulse-green  2.6s ease-in-out infinite; }
  .lp-crystal-glow-mystic { animation: lp-pulse-purple 2.6s ease-in-out infinite; }
  .lp-crystal-glow-dark   { animation: lp-pulse-red    2.6s ease-in-out infinite; }

  .lp-what-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .lp-what-grid {
      grid-template-columns: 1fr;
      gap: 24px;
    }
  }

  .lp-attr-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 900px) {
    .lp-attr-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 480px) {
    .lp-attr-grid {
      grid-template-columns: 1fr;
    }
  }

  .lp-screenshot-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .lp-screenshot-grid {
      grid-template-columns: 1fr;
    }
  }

  .lp-footer-links {
    display: flex;
    gap: 24px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .lp-hero-buttons {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
  }
  @media (max-width: 480px) {
    .lp-hero-buttons {
      flex-direction: column;
      align-items: center;
    }
    .lp-hero-buttons > a {
      width: 220px;
      text-align: center;
      justify-content: center;
    }
  }

  .lp-btn-play:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
    box-shadow: 0 6px 20px #C9A84C50;
  }
  .lp-btn-how:hover {
    border-color: #C9A84C;
    color: #C9A84C;
  }
  .lp-btn-steam-hero:hover {
    background: #2a3f55;
    border-color: #6b9ab8;
  }

  .lp-what-card-gold {
    border-color: #C9A84C40 !important;
    box-shadow: 0 0 18px #C9A84C20, 0 0 2px #C9A84C10;
    transition: box-shadow 300ms ease;
  }
  .lp-what-card-gold:hover {
    box-shadow: 0 0 32px #C9A84C35, 0 0 8px #C9A84C20;
  }
  .lp-what-card-blue {
    border-color: #3b82f640 !important;
    box-shadow: 0 0 18px #3b82f620, 0 0 2px #3b82f610;
    transition: box-shadow 300ms ease;
  }
  .lp-what-card-blue:hover {
    box-shadow: 0 0 32px #3b82f635, 0 0 8px #3b82f620;
  }
  .lp-what-card-red {
    border-color: #ef444440 !important;
    box-shadow: 0 0 18px #ef444420, 0 0 2px #ef444410;
    transition: box-shadow 300ms ease;
  }
  .lp-what-card-red:hover {
    box-shadow: 0 0 32px #ef444435, 0 0 8px #ef444420;
  }

  .lp-hero-grid-bg {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(201,168,76,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(201,168,76,0.04) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
  }

`;

const ATTRIBUTE_ORDER = [
  { champKey: 'light',  factionKey: 'human'  },
  { champKey: 'primal', factionKey: 'beast'  },
  { champKey: 'mystic', factionKey: 'elf'    },
  { champKey: 'dark',   factionKey: 'demon'  },
];

function ChampionPortrait({ champion, size = 80, height = 110 }) {
  const url = getCardImageUrl(champion.image);
  if (url) {
    return (
      <img
        src={url}
        alt={champion.name}
        className="lp-hero-portrait"
        style={{ width: size, height, objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      className="lp-hero-portrait-placeholder"
      style={{ width: size, height, fontSize: size < 60 ? 9 : 11 }}
    >
      {champion.name}
    </div>
  );
}

function HeroSection() {
  return (
    <section style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '80px 24px 60px',
      background: '#0a0a0f',
      overflow: 'hidden',
    }}>
      <div className="lp-hero-grid-bg" />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 700, width: '100%' }}>
        <h1 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 'clamp(48px, 10vw, 88px)',
          fontWeight: 700,
          color: '#C9A84C',
          letterSpacing: '0.18em',
          margin: 0,
          lineHeight: 1,
          textShadow: '0 0 40px #C9A84C30',
        }}>
          GRIDHOLM
        </h1>

        <div style={{
          marginTop: 20,
          marginBottom: 36,
          maxWidth: 520,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          <p style={{
            margin: '0 0 10px',
            color: '#cbd5e1',
            fontSize: 'clamp(14px, 2vw, 16px)',
            lineHeight: 1.6,
          }}>
            A tactical card battler played on a 5×5 grid. Part Chess, Part TCG.
          </p>
          <p style={{
            margin: 0,
            color: '#e2e8f0',
            fontSize: 'clamp(17px, 3vw, 22px)',
            fontWeight: 700,
            lineHeight: 1.4,
            letterSpacing: '0.02em',
          }}>
            Command the board. Destroy their champion.
          </p>
        </div>

        <div className="lp-hero-buttons">
          <a
            href="#/lobby"
            className="lp-btn-play"
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
              color: '#0a0a0f',
              fontFamily: "'Cinzel', serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              padding: '14px 36px',
              borderRadius: 4,
              boxShadow: '0 2px 12px #C9A84C40',
              transition: 'all 150ms ease',
              cursor: 'pointer',
            }}
          >
            Play Now
          </a>
          <a
            href="#/how-to-play"
            className="lp-btn-how"
            style={{
              display: 'inline-block',
              background: 'transparent',
              color: '#e2e8f0',
              fontFamily: "'Cinzel', serif",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              padding: '13px 32px',
              borderRadius: 4,
              border: '1px solid #C9A84C50',
              transition: 'all 150ms ease',
              cursor: 'pointer',
            }}
          >
            How to Play
          </a>
        </div>

        <div className="lp-hero-crystals">
          {ATTRIBUTE_ORDER.map(({ champKey, factionKey }) => {
            const Sym = ATTR_CRYSTALS[champKey];
            const faction = FACTION_INFO[factionKey];
            const labelColor = champKey === 'light' ? '#C9A84C' : faction.color;
            return (
              <div key={champKey} className="lp-crystal-item">
                <div className={`lp-crystal-glow-${champKey}`}>
                  <Sym size={88} />
                </div>
                <span className="lp-crystal-label" style={{ color: labelColor }}>
                  {faction.name}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 60, textAlign: 'center' }}>
          <a
            href="https://store.steampowered.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lp-btn-steam-hero"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#1b2838',
              color: '#c6d4df',
              fontFamily: "'Cinzel', serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textDecoration: 'none',
              padding: '8px 16px',
              borderRadius: 4,
              border: '1px solid #4c6b82',
              transition: 'all 150ms ease',
              cursor: 'pointer',
            }}
          >
            <SteamLogoIcon size={14} />
            Wishlist on Steam
          </a>
        </div>
      </div>
    </section>
  );
}

function WhatIsGridholm() {
  const cols = [
    {
      title: 'Build Your Deck',
      body: 'Choose your champion, select your attribute pairing, and build a 30-card deck tailored to your playstyle.',
      Icon: DeckIcon,
      iconColor: '#C9A84C',
      cardClass: 'lp-what-card-gold',
      iconBorder: '#C9A84C30',
    },
    {
      title: 'Command the Grid',
      body: 'Summon units, move them across the 5×5 board, and control the Throne at the center of the field.',
      Icon: SwordsIcon,
      iconColor: '#3b82f6',
      cardClass: 'lp-what-card-blue',
      iconBorder: '#3b82f630',
    },
    {
      title: 'Destroy Their Champion',
      body: 'Reduce the enemy champion to 0 HP through superior positioning, timing, and tactical card play.',
      Icon: SkullIcon,
      iconColor: '#ef4444',
      cardClass: 'lp-what-card-red',
      iconBorder: '#ef444430',
    },
  ];

  return (
    <section style={{
      background: '#111827',
      padding: '80px 24px',
    }}>
      <h2 style={{
        textAlign: 'center',
        fontFamily: "'Cinzel', serif",
        fontSize: 'clamp(22px, 4vw, 32px)',
        fontWeight: 600,
        color: '#C9A84C',
        letterSpacing: '0.1em',
        marginTop: 0,
        marginBottom: 48,
      }}>
        What is Gridholm?
      </h2>

      <div className="lp-what-grid">
        {cols.map(col => (
          <div key={col.title} className={col.cardClass} style={{
            background: '#1f2937',
            borderRadius: 8,
            padding: '32px 24px',
            textAlign: 'center',
            border: '1px solid #374151',
          }}>
            <div style={{
              width: 64,
              height: 64,
              background: '#111827',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              border: `1px solid ${col.iconBorder}`,
            }}>
              <col.Icon size={32} color={col.iconColor} />
            </div>
            <h3 style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 16,
              fontWeight: 600,
              color: '#C9A84C',
              letterSpacing: '0.06em',
              margin: '0 0 12px',
            }}>
              {col.title}
            </h3>
            <p style={{
              color: '#9ca3af',
              fontSize: 15,
              lineHeight: 1.6,
              margin: 0,
            }}>
              {col.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FourAttributes() {
  return (
    <section style={{
      background: '#0a0a0f',
      padding: '80px 24px',
    }}>
      <h2 style={{
        textAlign: 'center',
        fontFamily: "'Cinzel', serif",
        fontSize: 'clamp(22px, 4vw, 32px)',
        fontWeight: 600,
        color: '#C9A84C',
        letterSpacing: '0.1em',
        marginTop: 0,
        marginBottom: 48,
      }}>
        Four Attributes
      </h2>

      <div className="lp-attr-grid">
        {ATTRIBUTE_ORDER.map(({ champKey, factionKey }) => {
          const champion = CHAMPIONS[champKey];
          const faction = FACTION_INFO[factionKey];
          const Sym = ATTR_CRYSTALS[champKey];
          return (
            <div key={champKey} style={{
              background: '#111827',
              borderRadius: 8,
              border: `2px solid ${faction.color}40`,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* Attribute crystal — top-right corner overlapping border */}
              <div style={{ position: 'absolute', top: -12, right: -12, zIndex: 2 }}>
                <Sym size={28} />
              </div>

              {/* Portrait */}
              <div style={{ overflow: 'hidden', borderRadius: '8px 8px 0 0' }}>
                <div style={{
                  width: '100%',
                  height: 160,
                  background: '#1f2937',
                  borderBottom: `1px solid ${faction.color}30`,
                }}>
                  <ChampionPortrait champion={champion} size="100%" height={160} />
                </div>
              </div>

              <div style={{ padding: '20px 16px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}>
                  <span style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: faction.color,
                    letterSpacing: '0.06em',
                  }}>
                    {faction.name}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: faction.color,
                    background: `${faction.color}15`,
                    border: `1px solid ${faction.color}40`,
                    borderRadius: 12,
                    padding: '2px 8px',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}>
                    {faction.mechanic}
                  </span>
                </div>
                <p style={{
                  color: '#6b7280',
                  fontSize: 13,
                  lineHeight: 1.5,
                  margin: '0 0 12px',
                }}>
                  {champion.name}
                </p>
                <p style={{
                  color: '#9ca3af',
                  fontSize: 13,
                  lineHeight: 1.5,
                  margin: 0,
                }}>
                  {faction.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Screenshots() {
  const shots = [
    { label: 'Gameplay', src: '/screenshot-gameplay.png', caption: 'Deploy units, claim the Throne, and outmaneuver your opponent on the 5×5 grid.' },
    { label: 'Card Gallery', src: '/screenshot-gallery.png', caption: 'Browse the full collection of cards across all four factions.' },
    { label: 'Deck Builder', src: '/screenshot-deckbuilder.png', caption: 'Build your 30-card deck and customize your playstyle.' },
  ];

  return (
    <section style={{
      background: '#111827',
      padding: '80px 24px',
    }}>
      <h2 style={{
        textAlign: 'center',
        fontFamily: "'Cinzel', serif",
        fontSize: 'clamp(22px, 4vw, 32px)',
        fontWeight: 600,
        color: '#C9A84C',
        letterSpacing: '0.1em',
        marginTop: 0,
        marginBottom: 48,
      }}>
        Screenshots
      </h2>

      <div className="lp-screenshot-grid">
        {shots.map(shot => (
          <div key={shot.label} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <img
              src={shot.src}
              alt={shot.label}
              style={{
                width: '100%',
                borderRadius: 8,
                border: '1px solid #374151',
                display: 'block',
              }}
            />
            <p style={{
              margin: 0,
              color: '#6b7280',
              fontSize: 13,
              lineHeight: 1.5,
              textAlign: 'center',
            }}>
              {shot.caption}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{
      background: '#0a0a0f',
      borderTop: '1px solid #1f2937',
      padding: '40px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 20,
        fontWeight: 700,
        color: '#C9A84C',
        letterSpacing: '0.2em',
        marginBottom: 20,
      }}>
        GRIDHOLM
      </div>

      <nav className="lp-footer-links">
        {[
          { label: 'Play Now', href: '#/lobby' },
          { label: 'How to Play', href: '#/how-to-play' },
          { label: 'Card Gallery', href: '#/card-gallery' },
        ].map(link => (
          <a
            key={link.href}
            href={link.href}
            style={{
              color: '#6b7280',
              textDecoration: 'none',
              fontSize: 13,
              fontFamily: "'Cinzel', serif",
              letterSpacing: '0.04em',
              transition: 'color 150ms ease',
            }}
          >
            {link.label}
          </a>
        ))}
      </nav>

      <p style={{ color: '#374151', fontSize: 13, margin: '0 0 4px' }}>
        Built by Logos Nova LLC
      </p>
      <p style={{ color: '#374151', fontSize: 12, margin: 0 }}>
        © 2026 Gridholm. All rights reserved.
      </p>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <>
      <style>{STYLES}</style>
      <div style={{ background: '#0a0a0f', color: '#f9fafb', minHeight: '100vh' }}>
        <HeroSection />
        <WhatIsGridholm />
        <FourAttributes />
        <Screenshots />
        <Footer />
      </div>
    </>
  );
}
