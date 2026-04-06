// NEVER RENDER OPPONENT RESOURCES - game design decision
export default function StatusBar({ state, myPlayerIndex }) {
  const p1 = state.players[0];
  const p2 = state.players[1];
  const c1 = state.champions[0];
  const c2 = state.champions[1];
  const activePlayerName = state.players[state.activePlayer].name;

  // When myPlayerIndex is set, hide the opponent's resources
  const hideP1Resources = myPlayerIndex !== undefined && myPlayerIndex !== 0;
  const hideP2Resources = myPlayerIndex !== undefined && myPlayerIndex !== 1;

  const PHASE_LABELS = {
    'begin-turn': 'Begin Turn',
    action: 'Action',
    'end-turn': 'End Turn',
  };

  const barStyle = {
    background: '#0f0f20',
    borderBottom: '1px solid #C9A84C40',
    borderRadius: '6px',
    border: '1px solid #252538',
  };

  return (
    <>
      {/* Mobile: compact 3-column layout */}
      <div className="sm:hidden grid grid-cols-3 items-start px-2 py-1 leading-tight" style={barStyle}>
        <div className="flex flex-col gap-0.5">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 500, color: '#e8e8f0' }}>{p1.name} <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>{c1.hp}/{c1.maxHp}</span></span>
          {!hideP1Resources && <ResourcePips count={p1.resources} max={10} color="#4a8abf" />}
          <span style={{ fontSize: '10px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>H:{p1.hand.length} D:{p1.deck.length}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: '#6a6a88' }}>Turn {state.turn}</span>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C' }}>{activePlayerName}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 500, color: '#e8e8f0' }}>{p2.name} <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>{c2.hp}/{c2.maxHp}</span></span>
          {!hideP2Resources && <ResourcePips count={p2.resources} max={10} color="#bf4a4a" />}
          <span style={{ fontSize: '10px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>H:{p2.hand.length} D:{p2.deck.length}</span>
        </div>
      </div>

      {/* Desktop: full layout */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-between gap-2 px-4 py-2" style={barStyle}>
        <div className="flex items-center gap-3 flex-wrap">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 500, color: '#e8e8f0' }}>{p1.name}</span>
          <HpBar hp={c1.hp} maxHp={c1.maxHp} color="blue" />
          {!hideP1Resources && <ResourcePips count={p1.resources} max={10} color="#4a8abf" />}
          <span style={{ fontSize: '12px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>Hand: {p1.hand.length} | Deck: {p1.deck.length}</span>
        </div>
        <div className="text-center">
          <div style={{ fontSize: '11px', color: '#6a6a88', fontFamily: 'var(--font-sans)' }}>Turn {state.turn}</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: '#C9A84C' }}>{activePlayerName}'s turn</div>
          <div style={{ fontSize: '11px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>{PHASE_LABELS[state.phase] || state.phase}</div>
        </div>
        <div className="flex items-center gap-3 flex-row-reverse flex-wrap">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 500, color: '#e8e8f0' }}>{p2.name}</span>
          <HpBar hp={c2.hp} maxHp={c2.maxHp} color="red" />
          {!hideP2Resources && <ResourcePips count={p2.resources} max={10} color="#bf4a4a" />}
          <span style={{ fontSize: '12px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>Hand: {p2.hand.length} | Deck: {p2.deck.length}</span>
        </div>
      </div>
    </>
  );
}

function HpBar({ hp, maxHp, color }) {
  const pct = Math.max(0, (hp / maxHp) * 100);
  const fillGradient = color === 'blue'
    ? 'linear-gradient(90deg, #60a5fa, #2563eb)'
    : 'linear-gradient(90deg, #f87171, #dc2626)';
  return (
    <div className="flex items-center gap-1">
      <div style={{
        width: '96px',
        height: '10px',
        background: '#1a1a2e',
        borderRadius: '99px',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.7)',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: fillGradient,
          borderRadius: '99px',
          transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ fontSize: '10px', color: '#e8e8f0', fontFamily: 'var(--font-sans)', fontWeight: 700 }}>{hp}/{maxHp}</span>
    </div>
  );
}

function ResourcePips({ count, max, color }) {
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flexWrap: 'wrap', maxWidth: '80px' }}>
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          style={{
            width: '7px',
            height: '7px',
            transform: 'rotate(45deg)',
            background: i < count ? color : '#1a1a2a',
            border: i < count ? 'none' : `1px solid #2a2a3a`,
            boxShadow: i < count ? `0 0 4px ${color}80` : 'none',
            borderRadius: '1px',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}
