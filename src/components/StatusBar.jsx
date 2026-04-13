// NEVER RENDER OPPONENT RESOURCES - game design decision

const PHASE_LABELS = {
  'begin-turn': 'Begin',
  action: 'Action',
  'end-turn': 'End Turn',
};

function pipState(i, current, maxThisTurn) {
  if (i < current) return 'available';
  if (i < maxThisTurn) return 'used';
  return 'unavailable';
}

function pipStyle(state, playerColor, size, glow) {
  if (state === 'available') {
    return {
      background: playerColor,
      border: `1px solid ${playerColor}`,
      boxShadow: glow ? `0 0 4px ${playerColor}60` : `0 0 3px ${playerColor}60`,
    };
  }
  if (state === 'used') {
    return {
      background: '#2a2a3a',
      border: '1px solid #3a3a50',
      boxShadow: 'none',
    };
  }
  return {
    background: '#0a0a0a',
    border: '1px solid #1a1a1a',
    boxShadow: 'none',
  };
}

export function ResourceDisplay({ current, max = 10, maxThisTurn, playerColor, small = false, singleRow = false }) {
  const resolvedMax = maxThisTurn ?? current;
  const size = small ? 8 : 10;

  if (singleRow) {
    const pipSize = 9;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          color: '#C9A84C',
          fontFamily: 'var(--font-sans)',
          marginRight: 4,
          whiteSpace: 'nowrap',
        }}>
          {current}/{resolvedMax}
        </div>
        {Array.from({ length: max }, (_, i) => {
          const state = pipState(i, current, resolvedMax);
          const s = pipStyle(state, playerColor, pipSize, false);
          return (
            <div key={i} style={{
              width: pipSize, height: pipSize,
              flexShrink: 0,
              transform: 'rotate(45deg)',
              ...s,
            }} />
          );
        })}
      </div>
    );
  }

  const pips = Array.from({ length: max }, (_, i) => i);
  const row1 = pips.slice(0, 5);
  const row2 = pips.slice(5, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {row1.map((i) => {
          const state = pipState(i, current, resolvedMax);
          const s = pipStyle(state, playerColor, size, true);
          return (
            <div key={i} style={{
              width: size, height: size,
              transform: 'rotate(45deg)',
              ...s,
            }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {row2.map((i) => {
          const state = pipState(i, current, resolvedMax);
          const s = pipStyle(state, playerColor, size, true);
          return (
            <div key={i} style={{
              width: size, height: size,
              transform: 'rotate(45deg)',
              ...s,
            }} />
          );
        })}
      </div>
      <div style={{
        fontSize: small ? 10 : 11,
        fontWeight: 600,
        color: '#C9A84C',
        fontFamily: 'var(--font-sans)',
        marginTop: 2,
      }}>
        {current}/{resolvedMax}
      </div>
    </div>
  );
}

function ConnectionDot({ connected }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: connected ? '#22c55e' : '#6b7280',
      boxShadow: connected ? '0 0 4px #22c55e80' : 'none',
      flexShrink: 0,
    }} />
  );
}

export default function StatusBar({ state, myPlayerIndex, commandsUsed, aiThinking, onOpenLog, opponentConnected, onViewP1Grave, onViewP2Grave }) {
  const p1 = state.players[0];
  const p2 = state.players[1];
  const c1 = state.champions[0];
  const c2 = state.champions[1];
  const activePlayerName = state.players[state.activePlayer].name;

  // When myPlayerIndex is set, hide the opponent's resources
  const hideP1Resources = myPlayerIndex !== undefined && myPlayerIndex !== 0;
  const hideP2Resources = myPlayerIndex !== undefined && myPlayerIndex !== 1;

  const desktopPhaseLabels = {
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

  // opponentConnected dot: show next to p1 if myPlayerIndex===1, p2 if myPlayerIndex===0
  const showDotOnP1 = opponentConnected !== undefined && myPlayerIndex === 1;
  const showDotOnP2 = opponentConnected !== undefined && myPlayerIndex === 0;

  return (
    <>
      {/* Mobile: compact 3-column layout — no resource display (visible in bottom panel) */}
      <div className="sm:hidden grid grid-cols-3 items-start px-2 py-1 leading-tight" style={barStyle}>
        <div className="flex flex-col gap-0.5">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 500, color: '#e8e8f0' }}>{p1.name} <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>{c1.hp}/{c1.maxHp}</span></span>
            {showDotOnP1 && <ConnectionDot connected={opponentConnected} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>H:{p1.hand.length} D:{p1.deck.length}</span>
            {onViewP1Grave && <button onClick={onViewP1Grave} style={{ fontSize: '9px', background: 'transparent', border: '1px solid #3a3a5a', borderRadius: '3px', color: '#7a5aaa', cursor: 'pointer', padding: '0px 4px', lineHeight: '14px' }}>☠</button>}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, color: '#6a6a88' }}>Turn {state.turn}</span>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C' }}>{activePlayerName}</span>
          <span style={{ fontSize: '10px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>{PHASE_LABELS[state.phase] || state.phase}</span>
          {commandsUsed !== undefined && (
            <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
              {[1, 2, 3].map(i => {
                const used = i <= commandsUsed;
                const allUsed = commandsUsed >= 3;
                return (
                  <div key={i} style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: allUsed ? '#800020' : used ? '#C9A84C' : '#0f1729',
                    border: `1px solid ${allUsed ? '#80002080' : used ? '#C9A84C80' : '#2a2a3a'}`,
                  }} />
                );
              })}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
            {showDotOnP2 && <ConnectionDot connected={opponentConnected} />}
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 500, color: '#e8e8f0' }}>{p2.name} <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>{c2.hp}/{c2.maxHp}</span></span>
          </div>
          {aiThinking && <span style={{ fontSize: '9px', color: '#C9A84C', fontFamily: 'var(--font-sans)', fontStyle: 'italic' }}>Thinking…</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
            {onViewP2Grave && <button onClick={onViewP2Grave} style={{ fontSize: '9px', background: 'transparent', border: '1px solid #3a3a5a', borderRadius: '3px', color: '#7a5aaa', cursor: 'pointer', padding: '0px 4px', lineHeight: '14px' }}>☠</button>}
            <span style={{ fontSize: '10px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>H:{p2.hand.length} D:{p2.deck.length}</span>
          </div>
          {onOpenLog && (
            <button
              onClick={onOpenLog}
              style={{
                marginTop: '2px',
                fontSize: '9px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: '#C9A84C',
                background: 'transparent',
                border: '1px solid #C9A84C60',
                borderRadius: '3px',
                padding: '1px 5px',
                cursor: 'pointer',
                lineHeight: 1.4,
              }}
            >LOG</button>
          )}
        </div>
      </div>

      {/* Desktop: full layout */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-between gap-2 px-4 py-2" style={barStyle}>
        <div className="flex items-center gap-3 flex-wrap">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 500, color: '#e8e8f0' }}>{p1.name}</span>
          <HpBar hp={c1.hp} maxHp={c1.maxHp} color="blue" />
          {showDotOnP1 && <ConnectionDot connected={opponentConnected} />}
          {!hideP1Resources && <ResourceDisplay current={p1.resources} max={10} maxThisTurn={p1.maxResourcesThisTurn} playerColor="#185FA5" small />}
          <span style={{ fontSize: '12px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>Hand: {p1.hand.length} | Deck: {p1.deck.length}</span>
          {onViewP1Grave && <button onClick={onViewP1Grave} style={{ fontSize: '10px', background: 'transparent', border: '1px solid #3a3a5a', borderRadius: '3px', color: '#7a5aaa', cursor: 'pointer', padding: '1px 6px', fontFamily: 'var(--font-sans)' }}>☠ Grave</button>}
        </div>
        <div className="text-center">
          <div style={{ fontSize: '11px', color: '#6a6a88', fontFamily: 'var(--font-sans)' }}>Turn {state.turn}</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: '#C9A84C' }}>{activePlayerName}'s turn</div>
          <div style={{ fontSize: '11px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>{desktopPhaseLabels[state.phase] || state.phase}</div>
        </div>
        <div className="flex items-center gap-3 flex-row-reverse flex-wrap">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 500, color: '#e8e8f0' }}>
            {p2.name}
            {aiThinking && <span style={{ fontSize: '10px', color: '#C9A84C', fontFamily: 'var(--font-sans)', fontStyle: 'italic', marginLeft: '6px' }}>Thinking…</span>}
          </span>
          <HpBar hp={c2.hp} maxHp={c2.maxHp} color="red" />
          {showDotOnP2 && <ConnectionDot connected={opponentConnected} />}
          {!hideP2Resources && <ResourceDisplay current={p2.resources} max={10} maxThisTurn={p2.maxResourcesThisTurn} playerColor="#993C1D" small />}
          <span style={{ fontSize: '12px', color: '#8080a0', fontFamily: 'var(--font-sans)' }}>Hand: {p2.hand.length} | Deck: {p2.deck.length}</span>
          {onViewP2Grave && <button onClick={onViewP2Grave} style={{ fontSize: '10px', background: 'transparent', border: '1px solid #3a3a5a', borderRadius: '3px', color: '#7a5aaa', cursor: 'pointer', padding: '1px 6px', fontFamily: 'var(--font-sans)' }}>☠ Grave</button>}
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
