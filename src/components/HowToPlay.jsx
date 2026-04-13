import { getCardImageUrl } from '../supabase.js';

export default function HowToPlay() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#e5e7eb',
      fontFamily: 'inherit',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        background: 'rgba(10,10,15,0.95)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        padding: '12px 24px',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <button
          onClick={() => { window.location.hash = '/'; }}
          style={{
            background: 'none',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            color: '#9ca3af',
            fontSize: '13px',
            padding: '6px 12px',
            cursor: 'pointer',
          }}
          onMouseEnter={e => e.target.style.color = '#fff'}
          onMouseLeave={e => e.target.style.color = '#9ca3af'}
        >
          ← Back to Gridholm
        </button>
        <span style={{ fontFamily: "'Cinzel', serif", color: '#C9A84C', fontWeight: 600, fontSize: '14px', letterSpacing: '0.12em' }}>
          HOW TO PLAY
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { window.location.hash = '/deck-builder'; }}
            style={{
              background: 'none',
              border: '0.5px solid rgba(201,168,76,0.25)',
              borderRadius: '6px',
              color: '#9ca3af',
              fontSize: '13px',
              padding: '6px 12px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.target.style.borderColor = 'rgba(201,168,76,0.6)'; e.target.style.color = '#C9A84C'; }}
            onMouseLeave={e => { e.target.style.borderColor = 'rgba(201,168,76,0.25)'; e.target.style.color = '#9ca3af'; }}
          >
            Deck Builder →
          </button>
          <button
            onClick={() => { window.location.hash = '/tutorial'; }}
            style={{
              background: 'none',
              border: '0.5px solid rgba(201,168,76,0.35)',
              borderRadius: '6px',
              color: '#C9A84C',
              fontSize: '13px',
              padding: '6px 12px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.target.style.borderColor = '#C9A84C'}
            onMouseLeave={e => e.target.style.borderColor = 'rgba(201,168,76,0.35)'}
          >
            Tutorial →
          </button>
          <button
            onClick={() => { window.location.hash = '/card-gallery'; }}
            style={{
              background: 'none',
              border: '0.5px solid rgba(201,168,76,0.4)',
              borderRadius: '6px',
              color: '#C9A84C',
              fontSize: '13px',
              padding: '6px 12px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.target.style.borderColor = '#C9A84C'}
            onMouseLeave={e => e.target.style.borderColor = 'rgba(201,168,76,0.4)'}
          >
            Card Gallery →
          </button>
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Section 1 */}
        <Section title="Welcome to Gridholm">
          <p style={bodyStyle}>
            Gridholm is a tactical card game played on a 5×5 grid. You build a deck,
            summon powerful pieces onto the board, and outmaneuver your opponent
            to destroy their champion.
          </p>
          <p style={bodyStyle}>
            It is part chess, part card game, and every match plays out differently.
          </p>
          <p style={bodyStyle}>
            Every card you play occupies a tile. Every unit you summon can move, attack,
            and be attacked. Positioning matters as much as the cards in your hand.
            One well-placed unit can turn the entire board.
          </p>
          <p style={bodyStyle}>
            <strong style={{ color: '#e5e7eb' }}>Win condition:</strong> Reduce the opposing champion to 0 HP.
          </p>
        </Section>

        <Divider />

        {/* Section 2 */}
        <Section title="Reading a Card">
          <AnnotatedCard />
        </Section>

        <Divider />

        {/* Section 3 */}
        <Section title="Commands">
          <TurnFlowDiagram />
          <p style={{ ...bodyStyle, marginTop: 20 }}>
            Begin Turn and End Turn happen automatically. Your time is spent in the Action phase.
          </p>
          <p style={bodyStyle}>
            Each turn you have <strong style={{ color: '#C9A84C' }}>3 commands</strong> to spend.
            Commands power your unit activity for the turn:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0 16px' }}>
            {[
              { label: 'Move a unit', cost: '1 command', desc: 'Move any of your units up to its SPD in tiles.' },
              { label: 'Use an action', cost: '1 command', desc: "Activate a unit's Action ability instead of moving it." },
              { label: 'Champion move', cost: 'Free', desc: 'Your champion moves one tile per turn at no command cost.' },
              { label: 'Champion ability', cost: 'Free', desc: "Your champion's special ability costs no commands." },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.02)',
                border: '0.5px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
              }}>
                <div style={{ minWidth: 120, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{item.label}</span>
                  <div style={{
                    display: 'inline-block',
                    marginLeft: 8,
                    fontSize: 10,
                    fontWeight: 600,
                    color: item.cost === 'Free' ? '#22C55E' : '#C9A84C',
                    background: item.cost === 'Free' ? 'rgba(34,197,94,0.1)' : 'rgba(201,168,76,0.1)',
                    border: `0.5px solid ${item.cost === 'Free' ? 'rgba(34,197,94,0.3)' : 'rgba(201,168,76,0.3)'}`,
                    borderRadius: 99,
                    padding: '1px 7px',
                  }}>
                    {item.cost}
                  </div>
                </div>
                <span style={{ ...bodyStyle, margin: 0, fontSize: 13 }}>{item.desc}</span>
              </div>
            ))}
          </div>
          <p style={bodyStyle}>
            You also play cards from your hand by spending <strong style={{ color: '#e5e7eb' }}>mana</strong>.
            You gain 1 more mana each turn (up to 10). Unspent mana is lost at end of turn.
          </p>
          <p style={bodyStyle}>
            Units summoned this turn cannot use commands until your next turn — this is
            called summoning sickness. Some cards have{' '}
            <strong style={{ color: '#22C55E' }}>Rush</strong>, which lets them act immediately.
          </p>
        </Section>

        <Divider />

        {/* Section 4 */}
        <Section title="Fighting">
          <p style={bodyStyle}>
            When your unit moves into an enemy unit's tile they fight simultaneously.
            Both deal their ATK to each other at the same time. Both can die.
          </p>
          <p style={bodyStyle}>
            Surviving units keep their damage. A unit at 3 HP that takes 2 damage is
            now a unit at 1 HP. It remembers.
          </p>
          <p style={bodyStyle}>
            When your unit moves into the enemy champion's tile the champion takes
            damage equal to your unit's ATK. Your unit stays where it is. The champion
            never fights back.
          </p>
        </Section>

        <Divider />

        {/* Section 5 */}
        <Section title="Control the Throne">
          <p style={bodyStyle}>
            The center tile of the board is called the Throne. It is marked with a star.
          </p>
          <p style={bodyStyle}>
            End your turn with your champion standing on the Throne and the enemy
            champion takes <strong style={{ color: '#ef4444' }}>2 damage</strong> at end of turn.
            This cannot reduce the enemy champion below 1 HP — but it creates
            enormous pressure over time.
          </p>
          <p style={bodyStyle}>
            Controlling the Throne is not the only way to win, but ignoring it is
            usually a mistake.
          </p>
          <ThroneGrid />
        </Section>

        <Divider />

        {/* Section 6 */}
        <Section title="Card Types">
          <CardTypesTable />
        </Section>

        <Divider />

        {/* Section 7 */}
        <Section title="Choose Your Attribute">
          <FactionCards />
        </Section>

        <Divider />

        {/* Section 8 */}
        <Section title="Attunement &amp; Resonance">
          <p style={bodyStyle}>
            Every deck has an <strong style={{ color: '#C9A84C' }}>Attribute</strong> — Light, Primal, Mystic, or Dark.
            As you build your deck, each card contributes to your{' '}
            <strong style={{ color: '#C9A84C' }}>Resonance score</strong>:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0 16px' }}>
            {[
              { label: 'Primary attribute card', pts: '+2 pts', color: '#C9A84C' },
              { label: 'Friendly secondary attribute', pts: '+1 pt', color: '#22C55E' },
              { label: 'Enemy attribute card', pts: '−1 pt', color: '#ef4444' },
              { label: 'Neutral card', pts: '0 pts', color: '#6b7280' },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '7px 12px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.2)',
                borderRadius: 4,
              }}>
                <span style={{ fontSize: 13, color: '#9ca3af' }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>{row.pts}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, margin: '12px 0' }}>
            {[
              { tier: 'Attuned', score: '30+', color: '#C9A84C', desc: 'Unlocks your attribute\'s passive power.' },
              { tier: 'Ascended', score: '50+', color: '#A855F7', desc: 'Unlocks your attribute\'s strongest ability.' },
            ].map(t => (
              <div key={t.tier} style={{
                flex: 1,
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.02)',
                border: `0.5px solid ${t.color}55`,
                borderRadius: 8,
              }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 600, color: t.color, marginBottom: 4 }}>
                  {t.tier} <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280' }}>({t.score} pts)</span>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>{t.desc}</div>
              </div>
            ))}
          </div>
          <p style={bodyStyle}>
            Resonance is calculated when you save your deck. Build around a single attribute
            to unlock its full potential.
          </p>
        </Section>

        <Divider />

        {/* Section 9 */}
        <Section title="Keywords">
          <KeywordTable />
        </Section>

        <Divider />

        {/* Section 10 */}
        <Section title="A Few Tips">
          <ol style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              'Watch the Throne. If your opponent reaches it first you are already behind. Contesting it early forces them to respond to you.',
              'Summoning sickness is not a weakness. A unit that cannot move is still a blocker. Place it between your champion and the enemy.',
              'Mana resets each turn. Unspent mana is lost. Spend it.',
              "Read your opponent's Hidden units. They placed them somewhere for a reason. Do not walk your best unit into an unknown tile.",
              'Pip the Hungry does not look scary on turn one. By turn four it is everyone\'s problem.',
            ].map((tip, i) => (
              <li key={i} style={{ ...bodyStyle, margin: 0, lineHeight: 1.7 }}>{tip}</li>
            ))}
          </ol>
        </Section>

      </div>
    </div>
  );
}

const bodyStyle = {
  fontFamily: "'Crimson Text', serif",
  fontSize: 16,
  color: '#9ca3af',
  lineHeight: 1.7,
  margin: '0 0 12px 0',
};

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 8 }}>
      <h2 style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 18,
        fontWeight: 500,
        color: '#C9A84C',
        margin: '0 0 16px 0',
        letterSpacing: '0.04em',
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Divider() {
  return (
    <hr style={{
      border: 'none',
      borderTop: '0.5px solid rgba(255,255,255,0.06)',
      margin: '40px 0',
    }} />
  );
}

// Militia: cost 1, ATK 1, HP 3, SPD 1, Human, Light, no rules text
const MILITIA_IMAGE_URL = getCardImageUrl('militia.webp');

const annotations = [
  { num: 1, label: 'Cost', desc: 'Mana needed to play this card. You gain 1 more each turn up to 10.' },
  { num: 2, label: 'Art', desc: "Card illustration. Each attribute has a distinct visual identity." },
  { num: 3, label: 'Name', desc: "The card's name. Legendary cards are marked with ♛." },
  { num: 4, label: 'Type', desc: 'Unit type (Human, Beast, Elf, Demon) and attribute (Light, Primal, Mystic, Dark).' },
  { num: 5, label: 'ATK', desc: 'Attack power. Damage dealt in combat.' },
  { num: 6, label: 'HP', desc: 'Health points. Reduced by damage. Unit dies at 0.' },
  { num: 7, label: 'SPD', desc: 'Speed. How many tiles this unit can move per turn.' },
  { num: 8, label: 'Rules Text', desc: 'Special abilities and keywords. Militia has none — it is a simple, reliable unit.' },
];

function AnnotatedCard() {
  return (
    <div>
      {/* Desktop: annotated card with labels */}
      <div className="hidden sm:block" style={{ position: 'relative', margin: '24px auto 40px', width: 200, height: 280 }}>
        {/* The card */}
        <div style={{
          width: 200,
          height: 280,
          background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
          border: '1.5px solid #3B82F655',
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 0 24px rgba(59,130,246,0.12)',
        }}>
          {/* Cost */}
          <div style={{
            position: 'absolute',
            top: 6,
            right: 8,
            background: '#C9A84C',
            borderRadius: 20,
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#0a0a14',
            zIndex: 2,
          }}>
            1
          </div>
          {/* Art area */}
          <div style={{
            height: '44%',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {MILITIA_IMAGE_URL ? (
              <img
                src={MILITIA_IMAGE_URL}
                alt="Militia"
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : null}
            <div style={{
              display: MILITIA_IMAGE_URL ? 'none' : 'flex',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #1e3a5f 0%, #1a1a2e 100%)',
              fontSize: 32,
              color: 'rgba(255,255,255,0.25)',
            }}>
              🛡
            </div>
          </div>
          {/* Card body */}
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 1 }}>Militia</div>
            <div style={{ fontSize: 10, color: '#3B82F6', marginBottom: 8, fontWeight: 500 }}>Human · Light</div>
            <div style={{ display: 'flex', gap: 10, fontSize: 12, marginBottom: 10 }}>
              <span style={{ color: '#ef4444' }}>⚔ 1</span>
              <span style={{ color: '#22c55e' }}>♥ 3</span>
              <span style={{ color: '#60a5fa' }}>⚡ 1</span>
            </div>
            <div style={{ fontSize: 10, color: '#4a4a6a', lineHeight: 1.4, fontStyle: 'italic' }}>
              No special abilities.
            </div>
          </div>
        </div>

        {/* SVG annotation lines */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
          {/* 1: Cost - top right */}
          <line x1={180} y1={14} x2={215} y2={14} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 2: Art - right */}
          <line x1={200} y1={62} x2={215} y2={62} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 3: Name - left */}
          <line x1={0} y1={130} x2={-15} y2={130} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 4: Type - left */}
          <line x1={0} y1={148} x2={-15} y2={148} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 5: ATK - right */}
          <line x1={200} y1={186} x2={215} y2={186} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 6: HP - right */}
          <line x1={200} y1={198} x2={215} y2={198} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 7: SPD - right */}
          <line x1={200} y1={210} x2={215} y2={210} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 8: Rules - left */}
          <line x1={0} y1={250} x2={-15} y2={250} stroke="#C9A84C" strokeWidth={0.5} />
        </svg>

        {/* Right labels */}
        {[
          { num: 1, text: 'Cost', top: 6 },
          { num: 2, text: 'Art', top: 54 },
          { num: 5, text: 'ATK', top: 178 },
          { num: 6, text: 'HP', top: 190 },
          { num: 7, text: 'SPD', top: 202 },
        ].map(({ num, text, top }) => (
          <div key={num} style={{
            position: 'absolute',
            left: 215,
            top: top,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
          }}>
            <AnnotationBadge num={num} />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{text}</span>
          </div>
        ))}

        {/* Left labels */}
        {[
          { num: 3, text: 'Name', top: 122 },
          { num: 4, text: 'Type', top: 140 },
          { num: 8, text: 'Rules Text', top: 242 },
        ].map(({ num, text, top }) => (
          <div key={num} style={{
            position: 'absolute',
            right: 215,
            top: top,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            flexDirection: 'row-reverse',
          }}>
            <AnnotationBadge num={num} />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Mobile: card + numbered list */}
      <div className="block sm:hidden">
        <div style={{ position: 'relative', width: 160, height: 224, margin: '16px auto' }}>
          <div style={{
            width: 160,
            height: 224,
            background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
            border: '1.5px solid #3B82F655',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 0 16px rgba(59,130,246,0.12)',
          }}>
            <div style={{ position: 'absolute', top: 4, right: 6, background: '#C9A84C', color: '#0a0a14', fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '1px 5px' }}>1</div>
            <div style={{ height: '40%', overflow: 'hidden', position: 'relative' }}>
              {MILITIA_IMAGE_URL ? (
                <img src={MILITIA_IMAGE_URL} alt="Militia" onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e3a5f 0%, #1a1a2e 100%)', fontSize: 28, color: 'rgba(255,255,255,0.2)' }}>🛡</div>
              )}
            </div>
            <div style={{ padding: '6px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 1 }}>Militia</div>
              <div style={{ fontSize: 9, color: '#3B82F6', marginBottom: 6, fontWeight: 500 }}>Human · Light</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 10, marginBottom: 6 }}>
                <span style={{ color: '#ef4444' }}>⚔ 1</span>
                <span style={{ color: '#22c55e' }}>♥ 3</span>
                <span style={{ color: '#60a5fa' }}>⚡ 1</span>
              </div>
              <div style={{ fontSize: 9, color: '#4a4a6a', lineHeight: 1.4, fontStyle: 'italic' }}>No special abilities.</div>
            </div>
          </div>
        </div>
        <ol style={{ margin: '0', padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {annotations.map(a => (
            <li key={a.num} style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5 }}>
              <strong style={{ color: '#C9A84C' }}>{a.label}:</strong> {a.desc}
            </li>
          ))}
        </ol>
      </div>

      {/* Desktop annotation descriptions */}
      <div className="hidden sm:block" style={{ marginTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          {annotations.map(a => (
            <div key={a.num} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AnnotationBadge num={a.num} />
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#C9A84C' }}>{a.label}: </span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{a.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnnotationBadge({ num }) {
  return (
    <div style={{
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: '#C9A84C',
      color: '#000',
      fontSize: 10,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      {num}
    </div>
  );
}

function TurnFlowDiagram() {
  const steps = [
    {
      label: 'Begin Turn',
      items: ['Draw a card', 'Gain mana'],
    },
    {
      label: 'Action',
      items: ['Spend 3 commands', 'Play cards (mana)', 'Champion moves free'],
      highlight: true,
    },
    {
      label: 'End Turn',
      items: ['Discard to hand limit', 'Throne damage', 'Pass turn'],
    },
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      gap: 8,
      margin: '16px 0',
      flexWrap: 'wrap',
    }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            background: step.highlight ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
            border: step.highlight ? '0.5px solid #C9A84C' : '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '12px 16px',
            minWidth: 120,
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: step.highlight ? '#C9A84C' : '#d1d5db',
              marginBottom: 8,
            }}>
              {step.label}
            </div>
            {step.items.map((item, j) => (
              <div key={j} style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>{item}</div>
            ))}
          </div>
          {i < steps.length - 1 && (
            <span style={{ color: '#C9A84C', fontSize: 16, fontWeight: 700 }}>→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ThroneGrid() {
  return (
    <div style={{ margin: '20px 0', display: 'flex', justifyContent: 'flex-start' }}>
      <div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 44px)',
          gridTemplateRows: 'repeat(3, 44px)',
          gap: 3,
        }}>
          {Array.from({ length: 9 }, (_, i) => {
            const isCenter = i === 4;
            return (
              <div key={i} style={{
                width: 44,
                height: 44,
                background: isCenter ? 'rgba(146,64,14,0.3)' : 'rgba(255,255,255,0.04)',
                border: isCenter ? '1px solid #92400E' : '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isCenter ? 20 : 10,
                color: isCenter ? '#d97706' : '#374151',
              }}>
                {isCenter ? '★' : ''}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
          Center tile: the Throne
        </div>
      </div>
    </div>
  );
}

const CARD_TYPES = [
  {
    type: 'Unit',
    color: '#3B82F6',
    desc: 'A creature that occupies a tile on the board. Has ATK, HP, and SPD. Can move, fight, and use Action abilities.',
    example: 'Militia, Knight, Pip the Hungry',
  },
  {
    type: 'Spell',
    color: '#A855F7',
    desc: 'Played from hand for an immediate effect, then goes to the discard pile. Does not occupy a tile.',
    example: 'Smite, Pack Howl, Frostbolt',
  },
  {
    type: 'Terrain',
    color: '#92400E',
    desc: 'Placed onto a tile and modifies it permanently until removed. Units standing on Terrain are affected by its rules.',
    example: 'Thornwall, Lava Field',
  },
  {
    type: 'Omen',
    color: '#D97706',
    desc: 'Placed on the board like a unit but has no combat stats. Applies an ongoing effect for a set number of turns.',
    example: 'Chains of Light, Ill Omen',
  },
  {
    type: 'Relic',
    color: '#EAB308',
    desc: 'A persistent object on the board. Has HP but no ATK. Blocks movement and can be destroyed by combat.',
    example: 'Iron Vault, Gilded Cage',
  },
];

function CardTypesTable() {
  return (
    <div style={{
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      overflow: 'hidden',
      margin: '8px 0',
    }}>
      {CARD_TYPES.map((ct, i) => (
        <div key={ct.type} style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '12px 16px',
          background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.2)',
          borderBottom: i < CARD_TYPES.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
          borderLeft: `3px solid ${ct.color}`,
        }}>
          <div style={{ minWidth: 68, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: ct.color }}>{ct.type}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6, marginBottom: 3 }}>{ct.desc}</div>
            <div style={{ fontSize: 11, color: '#4b5563', fontStyle: 'italic' }}>e.g. {ct.example}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const FACTIONS = [
  { name: 'Light',   color: '#3B82F6', identity: 'Strength in formation.', keyword: 'Aura' },
  { name: 'Primal',  color: '#22C55E', identity: 'Strike before they\'re ready.', keyword: 'Rush' },
  { name: 'Mystic',  color: '#A855F7', identity: 'They cannot outlast us.', keyword: 'Restore HP' },
  { name: 'Dark',    color: '#EF4444', identity: 'You never know what lurks.', keyword: 'Hidden' },
];

function FactionCards() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 12,
      margin: '8px 0',
    }}>
      {FACTIONS.map(f => (
        <div key={f.name} style={{
          background: 'rgba(255,255,255,0.02)',
          border: '0.5px solid rgba(255,255,255,0.08)',
          borderLeft: `3px solid ${f.color}`,
          borderRadius: 8,
          padding: '14px 16px',
        }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 600, color: f.color, marginBottom: 4 }}>{f.name}</div>
          <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 13, color: '#9ca3af', marginBottom: 10, fontStyle: 'italic' }}>"{f.identity}"</div>
          <div style={{
            display: 'inline-block',
            background: `${f.color}18`,
            border: `0.5px solid ${f.color}`,
            borderRadius: 99,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 500,
            color: f.color,
          }}>
            {f.keyword}
          </div>
        </div>
      ))}
    </div>
  );
}

const KEYWORDS = [
  { word: 'Rush',       color: '#22C55E', def: 'Can move and act the turn it is summoned.' },
  { word: 'Hidden',     color: '#8B5CF6', def: 'Invisible to opponents until an enemy moves adjacent or attacks into its tile.' },
  { word: 'Aura X',     color: '#F0E6D2', def: 'Passive effect applying to units within X tiles.' },
  { word: 'Restore HP', color: '#A855F7', def: 'Effects that heal units or champions.' },
  { word: 'Flying',     color: '#38BDF8', def: 'Can move to any tile within SPD range, ignoring units and blockers in the path.' },
  { word: 'Rooted',     color: '#78716C', def: 'Cannot move; can still act and fight. Clears at start of next turn.' },
  { word: 'Stunned',    color: '#D97706', def: 'Cannot move or use actions. Clears at start of next turn.' },
];

function KeywordTable() {
  return (
    <div style={{
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      overflow: 'hidden',
      margin: '8px 0',
    }}>
      {KEYWORDS.map((kw, i) => (
        <div key={kw.word} style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '12px 16px',
          background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.2)',
          borderBottom: i < KEYWORDS.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
        }}>
          <div style={{
            minWidth: 90,
            fontSize: 12,
            fontWeight: 600,
            color: kw.color,
            paddingTop: 1,
          }}>
            {kw.word}
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>{kw.def}</div>
        </div>
      ))}
    </div>
  );
}
