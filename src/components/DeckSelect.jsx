import { FACTION_INFO } from '../engine/cards.js';

const FACTIONS = Object.values(FACTION_INFO);

const FACTION_GRADIENTS = {
  human: 'linear-gradient(135deg, #74aef9, #3B82F6, #1a4b99)',
  beast: 'linear-gradient(135deg, #5edb8a, #22C55E, #0f6b30)',
  elf:   'linear-gradient(135deg, #c988fb, #A855F7, #6b1fa8)',
  demon: 'linear-gradient(135deg, #f47a7a, #EF4444, #8b1a1a)',
};

export default function DeckSelect({ onSelect, waitingForOpponent = false, selectedDeck = null, opponentSelected = false, isRematch = false }) {
  if (waitingForOpponent) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '360px' }}>
          <h1 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '28px',
            fontWeight: 600,
            color: '#C9A84C',
            letterSpacing: '0.2em',
            marginBottom: '16px',
          }}>GRIDHOLM</h1>
          {isRematch && (
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#C9A84C', marginBottom: '12px' }}>Rematch! Select your faction.</p>
          )}
          <div style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3a',
            borderRadius: '8px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <PlayerStatusRow youSelected={true} opponentSelected={opponentSelected} />
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: '16px',
                fontWeight: 600,
                color: FACTION_INFO[selectedDeck]?.color || '#C9A84C',
              }}
            >
              {FACTION_INFO[selectedDeck]?.name ?? 'Unknown'} selected
            </div>
            <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#4a4a6a', fontSize: '14px' }}>Waiting for opponent to choose their deck…</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '2px solid #C9A84C',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      gap: '24px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '32px',
          fontWeight: 600,
          color: '#C9A84C',
          letterSpacing: '0.2em',
          marginBottom: '4px',
        }}>GRIDHOLM</h1>
        {isRematch
          ? <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#C9A84C', fontSize: '15px' }}>Rematch! Select your faction.</p>
          : <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#4a4a6a', fontSize: '15px' }}>Choose your faction</p>
        }
      </div>

      {opponentSelected !== null && (
        <PlayerStatusRow youSelected={false} opponentSelected={opponentSelected} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
        {FACTIONS.map(faction => (
          <FactionCard
            key={faction.id}
            faction={faction}
            onSelect={() => onSelect(faction.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerStatusRow({ youSelected, opponentSelected }) {
  const pillStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    borderRadius: '99px',
    border: `1px solid ${active ? '#C9A84C' : '#2a2a3a'}`,
    fontFamily: "'Cinzel', serif",
    fontSize: '11px',
    color: active ? '#C9A84C' : '#4a4a6a',
  });
  return (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
      <div style={pillStyle(youSelected)}>
        {youSelected ? '✓' : '…'} You
      </div>
      <div style={pillStyle(opponentSelected)}>
        {opponentSelected ? '✓' : '…'} Opponent
      </div>
    </div>
  );
}

function FactionCard({ faction, onSelect }) {
  return (
    <div
      style={{
        background: '#0d0d1a',
        border: `1px solid ${faction.color}55`,
        borderLeft: `3px solid ${faction.color}`,
        borderRadius: '8px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'transform 0.15s, border-color 0.15s',
      }}
      onClick={onSelect}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <div>
        <h2
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '16px',
            fontWeight: 600,
            color: faction.color,
            marginBottom: '4px',
          }}
        >
          {faction.name}
        </h2>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          color: '#4a4a6a',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {faction.mechanic}
        </span>
      </div>

      <p style={{
        fontFamily: "'Crimson Text', serif",
        fontSize: '13px',
        color: '#8a8aaa',
        lineHeight: 1.6,
        flex: 1,
      }}>
        {faction.description}
      </p>

      <button
        style={{
          width: '100%',
          padding: '8px',
          borderRadius: '4px',
          fontFamily: "'Cinzel', serif",
          fontSize: '12px',
          fontWeight: 600,
          color: '#0a0a0f',
          background: FACTION_GRADIENTS[faction.id] || faction.color,
          border: 'none',
          boxShadow: `0 2px 8px ${faction.color}60`,
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        Select
      </button>
    </div>
  );
}
