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
        background: '#0f0f1e',
        borderRight: '1px solid #252538',
        borderRadius: '6px',
        padding: '8px 4px',
      }}
    >
      <div style={{
        fontSize: '10px',
        color: '#5a5a78',
        padding: '0 8px',
        marginBottom: '4px',
        fontFamily: 'var(--font-sans)',
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
                fontFamily: 'var(--font-sans)',
                background: isActive ? '#0a0a0f' : '#1a1a2e',
                color: isActive ? '#C9A84C' : '#3a3a58',
              }}
            >
              {idx + 1}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                lineHeight: 1.2,
                color: isActive ? '#0a0a14' : '#5a5a78',
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
