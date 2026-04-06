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
    background: '#0d0d1a',
    borderBottom: '1px solid #C9A84C40',
    borderRadius: '6px',
    border: '1px solid #1e1e2e',
  };

  return (
    <>
      {/* Mobile: compact 3-column layout */}
      <div className="sm:hidden grid grid-cols-3 items-start px-2 py-1 leading-tight" style={barStyle}>
        <div className="flex flex-col gap-0.5">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, color: '#4a8abf' }}>{p1.name} {c1.hp}/{c1.maxHp}</span>
          {!hideP1Resources && <ResourcePips count={p1.resources} max={10} color="#4a8abf" />}
          <span style={{ fontSize: '10px', color: '#4a4a6a' }}>H:{p1.hand.length} D:{p1.deck.length}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 700, color: '#fff' }}>Turn {state.turn}</span>
          <span style={{ fontSize: '10px', color: '#8a8aaa' }}>{activePlayerName}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, color: '#bf4a4a' }}>{p2.name} {c2.hp}/{c2.maxHp}</span>
          {!hideP2Resources && <ResourcePips count={p2.resources} max={10} color="#bf4a4a" />}
          <span style={{ fontSize: '10px', color: '#4a4a6a' }}>H:{p2.hand.length} D:{p2.deck.length}</span>
        </div>
      </div>

      {/* Desktop: full layout */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-between gap-2 px-4 py-2" style={barStyle}>
        <div className="flex items-center gap-3 flex-wrap">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: '#4a8abf' }}>{p1.name}</span>
          <HpBar hp={c1.hp} maxHp={c1.maxHp} color="blue" />
          {!hideP1Resources && <ResourcePips count={p1.resources} max={10} color="#4a8abf" />}
          <span style={{ fontSize: '11px', color: '#4a4a6a' }}>Hand: {p1.hand.length} | Deck: {p1.deck.length}</span>
        </div>
        <div className="text-center">
          <div style={{ fontSize: '11px', color: '#4a4a6a' }}>Turn {state.turn}</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: '#C9A84C' }}>{activePlayerName}'s turn</div>
          <div style={{ fontSize: '11px', color: '#6a5a8a' }}>{PHASE_LABELS[state.phase] || state.phase}</div>
        </div>
        <div className="flex items-center gap-3 flex-row-reverse flex-wrap">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: '#bf4a4a' }}>{p2.name}</span>
          <HpBar hp={c2.hp} maxHp={c2.maxHp} color="red" />
          {!hideP2Resources && <ResourcePips count={p2.resources} max={10} color="#bf4a4a" />}
          <span style={{ fontSize: '11px', color: '#4a4a6a' }}>Hand: {p2.hand.length} | Deck: {p2.deck.length}</span>
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
        background: '#0a0a1a',
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
      <span style={{ fontSize: '10px', color: '#8a8aaa' }}>{hp}/{maxHp}</span>
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
