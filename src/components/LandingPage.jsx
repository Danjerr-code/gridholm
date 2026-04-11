import { getCardImageUrl } from '../supabase.js';
import { CHAMPIONS } from '../engine/champions.js';
import { FACTION_INFO } from '../engine/cards.js';
import { LightSymbol, PrimalSymbol, MysticSymbol, DarkSymbol } from '../assets/attributeSymbols.jsx';

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

  .lp-btn-play:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
    box-shadow: 0 6px 20px #C9A84C50;
  }
  .lp-btn-how:hover {
    border-color: #C9A84C;
    color: #C9A84C;
  }
  .lp-btn-steam:hover {
    filter: brightness(1.2);
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

        <div style={{
          display: 'flex',
          gap: 16,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
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
      </div>
    </section>
  );
}

function WhatIsGridholm() {
  const cols = [
    {
      title: 'Build Your Deck',
      body: 'Choose your champion, select your attribute pairing, and build a 30-card deck tailored to your playstyle.',
      icon: '♟',
    },
    {
      title: 'Command the Grid',
      body: 'Summon units, move them across the 5×5 board, and control the Throne at the center of the field.',
      icon: '⚔',
    },
    {
      title: 'Destroy Their Champion',
      body: 'Reduce the enemy champion to 0 HP through superior positioning, timing, and tactical card play.',
      icon: '💀',
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
          <div key={col.title} style={{
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
              fontSize: 28,
              margin: '0 auto 20px',
              border: '1px solid #C9A84C30',
            }}>
              {col.icon}
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

function SteamSection() {
  return (
    <section style={{
      background: '#0a0a0f',
      padding: '80px 24px',
    }}>
      <div style={{
        maxWidth: 600,
        margin: '0 auto',
        textAlign: 'center',
        background: '#1b2838',
        borderRadius: 12,
        padding: '48px 32px',
        border: '1px solid #2a475e',
      }}>
        {/* Steam logo placeholder */}
        <div style={{
          width: 56,
          height: 56,
          background: '#2a475e',
          borderRadius: '50%',
          margin: '0 auto 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}>
          🎮
        </div>

        <h2 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 'clamp(20px, 4vw, 28px)',
          fontWeight: 700,
          color: '#c6d4df',
          letterSpacing: '0.08em',
          margin: '0 0 16px',
        }}>
          Coming to Steam
        </h2>

        <p style={{
          color: '#8f98a0',
          fontSize: 16,
          lineHeight: 1.6,
          margin: '0 0 28px',
        }}>
          Gridholm is coming to Steam. Wishlist now to be notified at launch.
        </p>

        <a
          href="https://store.steampowered.com"
          className="lp-btn-steam"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            background: '#1b2838',
            color: '#c6d4df',
            fontFamily: "'Cinzel', serif",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            padding: '12px 28px',
            borderRadius: 4,
            border: '1px solid #4c6b82',
            transition: 'all 150ms ease',
            cursor: 'pointer',
          }}
        >
          Wishlist on Steam
        </a>

        <p style={{
          marginTop: 20,
          color: '#4b5563',
          fontSize: 13,
        }}>
          Free to play. Card packs and cosmetic skins available at launch.
        </p>
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
        <SteamSection />
        <Footer />
      </div>
    </>
  );
}
