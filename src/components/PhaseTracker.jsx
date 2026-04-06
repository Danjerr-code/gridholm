const PHASES = [
  { key: 'begin-turn', label: 'Begin Turn', auto: true  },
  { key: 'action',     label: 'Action',     auto: false },
  { key: 'end-turn',   label: 'End Turn',   auto: true  },
];

// phaseChangeId changes every time the game advances to a new phase,
// forcing the active row to remount and replay the CSS animation.
export default function PhaseTracker({ phase, phaseChangeId }) {
  return (
    <div
      className="flex flex-col justify-center gap-1 flex-shrink-0"
      style={{
        width: 140,
        background: '#0a0a14',
        borderRight: '1px solid #C9A84C30',
        borderRadius: '6px',
        padding: '8px 4px',
      }}
    >
      <div style={{
        fontSize: '10px',
        color: '#3a3a5a',
        padding: '0 8px',
        marginBottom: '4px',
        fontFamily: "'Cinzel', serif",
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        Phase
      </div>
      {PHASES.map(({ key, label, auto }, idx) => {
        const isActive = phase === key;
        return (
          <div
            key={isActive ? `${key}-${phaseChangeId}` : key}
            className={isActive && auto ? 'phase-tracker-flash' : ''}
            style={
              isActive
                ? {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#C9A84C',
                    boxShadow: '0 0 8px #C9A84C40',
                  }
                : {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                  }
            }
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                flexShrink: 0,
                background: isActive ? '#0a0a0f' : '#1a1a2e',
                color: isActive ? '#C9A84C' : '#2a2a4a',
              }}
            >
              {idx + 1}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: "'Cinzel', serif",
                lineHeight: 1.2,
                color: isActive ? '#0a0a0f' : '#2a2a3a',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
