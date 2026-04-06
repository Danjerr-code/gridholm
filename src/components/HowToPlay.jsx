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
        <span style={{ color: '#C9A84C', fontWeight: 700, fontSize: '15px', letterSpacing: '0.1em' }}>
          HOW TO PLAY
        </span>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Section 1 */}
        <Section title="Welcome to Gridholm">
          <p style={bodyStyle}>
            Gridholm is a tactical card game played on a 5×5 grid. You build a deck,
            summon warriors, beasts, elves, and demons onto the board, and outmaneuver
            your opponent to destroy their champion.
          </p>
          <p style={bodyStyle}>
            It is part chess, part card game, and entirely unforgiving to overconfidence.
          </p>
          <p style={bodyStyle}>
            Every card you play occupies a tile. Every unit you summon can move, attack,
            and be attacked. Positioning matters as much as the cards in your hand.
          </p>
        </Section>

        <Divider />

        {/* Section 2 */}
        <Section title="Reading a Card">
          <AnnotatedCard />
        </Section>

        <Divider />

        {/* Section 3 */}
        <Section title="Your Turn">
          <TurnFlowDiagram />
          <p style={{ ...bodyStyle, marginTop: 20 }}>
            Begin Turn and End Turn happen automatically. Your time is spent in the
            Action phase.
          </p>
          <p style={bodyStyle}>
            During your Action phase you can do any of the following in any order:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
            {[
              'Move your champion one tile in any cardinal direction',
              'Play cards from your hand if you have enough resources',
              'Move each of your units one time',
            ].map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#C9A84C', fontWeight: 700, flexShrink: 0 }}>→</span>
                <span style={{ ...bodyStyle, margin: 0 }}>{line}</span>
              </div>
            ))}
          </div>
          <p style={bodyStyle}>
            Units summoned this turn cannot move until your next turn. This is called
            summoning sickness. Some cards have <strong style={{ color: '#22C55E' }}>Rush</strong> which lets them move immediately.
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
          <p style={bodyStyle}>
            Reduce the enemy champion to 0 HP to win.
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
            champion takes 4 damage. This cannot kill them outright but it creates
            enormous pressure.
          </p>
          <p style={bodyStyle}>
            Controlling the Throne is not the only way to win but ignoring it is
            usually a mistake.
          </p>
          <ThroneGrid />
        </Section>

        <Divider />

        {/* Section 6 */}
        <Section title="Choose Your Faction">
          <FactionCards />
        </Section>

        <Divider />

        {/* Section 7 */}
        <Section title="Keywords">
          <KeywordTable />
        </Section>

        <Divider />

        {/* Section 8 */}
        <Section title="A Few Tips">
          <ol style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              'Watch the Throne. If your opponent reaches it first you are already behind. Contesting it early forces them to respond to you.',
              'Summoning sickness is not a weakness. A unit that cannot move is still a blocker. Place it between your champion and the enemy.',
              'Resources reset each turn. Unspent resources are lost. Spend them.',
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
  fontSize: 14,
  color: '#9ca3af',
  lineHeight: 1.7,
  margin: '0 0 12px 0',
};

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 8 }}>
      <h2 style={{
        fontSize: 18,
        fontWeight: 500,
        color: '#C9A84C',
        margin: '0 0 16px 0',
        letterSpacing: '0.02em',
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

function AnnotatedCard() {
  const annotations = [
    { num: 1, label: 'Cost', desc: 'Resources needed to play this card. You gain 1 more each turn up to 10.', top: '4%', right: '-130px', lineTop: '14px', lineRight: '130px' },
    { num: 2, label: 'Art', desc: 'Card illustration. Each faction has a distinct visual identity.', top: '22%', right: '-130px', lineTop: '8px', lineRight: '130px' },
    { num: 3, label: 'Name', desc: "The card's name. Legendary cards have a gold border.", top: '46%', left: '-130px', lineTop: '8px', lineLeft: '130px' },
    { num: 4, label: 'Type', desc: 'Human, Beast, Elf, or Demon. Faction matters for synergies.', top: '54%', left: '-130px', lineTop: '8px', lineLeft: '130px' },
    { num: 5, label: 'ATK', desc: 'Attack power. Damage dealt in combat.', top: '66%', right: '-130px', lineTop: '8px', lineRight: '130px' },
    { num: 6, label: 'HP', desc: 'Health points. Reduced by damage. Unit dies at 0.', top: '72%', right: '-130px', lineTop: '8px', lineRight: '130px' },
    { num: 7, label: 'SPD', desc: 'Speed. How many tiles this unit can move per turn.', top: '78%', right: '-130px', lineTop: '8px', lineRight: '130px' },
    { num: 8, label: 'Rules', desc: 'Special abilities. Keywords like Rush, Hidden, and Aura appear here.', top: '88%', left: '-130px', lineTop: '8px', lineLeft: '130px' },
  ];

  return (
    <div>
      {/* Desktop: annotated card with labels */}
      <div className="hidden sm:block" style={{ position: 'relative', margin: '24px auto 40px', width: 200, height: 280 }}>
        {/* The card */}
        <div style={{
          width: 200,
          height: 280,
          background: '#111827',
          border: '1.5px solid #3B82F6',
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 0 24px rgba(59,130,246,0.15)',
        }}>
          {/* Cost */}
          <div style={{
            position: 'absolute',
            top: 6,
            right: 8,
            background: '#1e3a5f',
            border: '1px solid #3B82F6',
            borderRadius: 20,
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: '#60a5fa',
            zIndex: 2,
          }}>
            3
          </div>
          {/* Art area */}
          <div style={{
            height: '42%',
            background: 'linear-gradient(135deg, #1e3a5f 0%, #1a1a2e 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            color: 'rgba(255,255,255,0.15)',
          }}>
            🛡
          </div>
          {/* Card body */}
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Sergeant</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>Human</div>
            <div style={{ display: 'flex', gap: 10, fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: '#ef4444' }}>⚔ 2</span>
              <span style={{ color: '#22c55e' }}>♥ 2</span>
              <span style={{ color: '#60a5fa' }}>⚡ 1</span>
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.4 }}>
              Action: The next combat unit you play this turn gains +1/+1.
            </div>
          </div>
        </div>

        {/* SVG annotation lines */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
          {/* 1: Cost - top right */}
          <line x1={180} y1={14} x2={215} y2={14} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 2: Art - right */}
          <line x1={200} y1={60} x2={215} y2={60} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 3: Name - left */}
          <line x1={0} y1={130} x2={-15} y2={130} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 4: Type - left */}
          <line x1={0} y1={152} x2={-15} y2={152} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 5: ATK - right */}
          <line x1={200} y1={186} x2={215} y2={186} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 6: HP - right */}
          <line x1={200} y1={198} x2={215} y2={198} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 7: SPD - right */}
          <line x1={200} y1={210} x2={215} y2={210} stroke="#C9A84C" strokeWidth={0.5} />
          {/* 8: Rules - left */}
          <line x1={0} y1={248} x2={-15} y2={248} stroke="#C9A84C" strokeWidth={0.5} />
        </svg>

        {/* Right labels */}
        {[
          { num: 1, text: 'Cost', top: 6 },
          { num: 2, text: 'Art', top: 52 },
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
          { num: 4, text: 'Type', top: 144 },
          { num: 8, text: 'Rules', top: 240 },
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
        <div style={{
          width: 160,
          height: 224,
          background: '#111827',
          border: '1.5px solid #3B82F6',
          borderRadius: 8,
          overflow: 'hidden',
          margin: '16px auto',
          boxShadow: '0 0 16px rgba(59,130,246,0.15)',
        }}>
          <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 11, fontWeight: 700, color: '#60a5fa' }}>3💎</div>
          <div style={{ height: '40%', background: 'linear-gradient(135deg, #1e3a5f 0%, #1a1a2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'rgba(255,255,255,0.15)' }}>🛡</div>
          <div style={{ padding: '6px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Sergeant</div>
            <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 6 }}>Human</div>
            <div style={{ display: 'flex', gap: 8, fontSize: 10, marginBottom: 6 }}>
              <span style={{ color: '#ef4444' }}>⚔ 2</span>
              <span style={{ color: '#22c55e' }}>♥ 2</span>
              <span style={{ color: '#60a5fa' }}>⚡ 1</span>
            </div>
            <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1.4 }}>Action: next unit gains +1/+1.</div>
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
      items: ['Draw a card', 'Gain resources'],
    },
    {
      label: 'Action',
      items: ['Move your champion', 'Play cards', 'Move units'],
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
      gap: 0,
      margin: '16px 0',
      flexWrap: 'wrap',
      gap: 8,
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

const FACTIONS = [
  { name: 'Humans', color: '#3B82F6', identity: 'Strength in formation.', keyword: 'Aura' },
  { name: 'Beasts', color: '#22C55E', identity: 'Strike before they\'re ready.', keyword: 'Rush' },
  { name: 'Elves', color: '#A855F7', identity: 'They cannot outlast us.', keyword: 'Restore HP' },
  { name: 'Demons', color: '#EF4444', identity: 'You never know what lurks.', keyword: 'Hidden' },
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
          <div style={{ fontSize: 15, fontWeight: 700, color: f.color, marginBottom: 4 }}>{f.name}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10, fontStyle: 'italic' }}>"{f.identity}"</div>
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
  { word: 'Rush', color: '#22C55E', def: 'This unit may move the turn it is summoned' },
  { word: 'Hidden', color: '#8B5CF6', def: 'Moves unseen on the board. Revealed by enemy contact or player choice' },
  { word: 'Action', color: '#F97316', def: 'Use instead of moving. Click the Action button when selected' },
  { word: 'Aura', color: '#3B82F6', def: 'Passive bonus to nearby friendly or debuff to nearby enemy units' },
  { word: 'Rooted', color: '#78716C', def: 'This unit cannot move from its summoned position' },
  { word: 'Legendary', color: '#EAB308', def: 'Powerful unique card. Only one copy allowed per deck' },
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
