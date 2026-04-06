import { useEffect, useRef } from 'react';

function getEntryStyle(entry) {
  const lower = entry.toLowerCase();
  if (/damage|hits|destroyed|takes/.test(lower)) {
    return { color: '#c06060' };
  }
  if (/restores|heals|gains hp/.test(lower)) {
    return { color: '#60a060' };
  }
  if (/turn|begins|starts/.test(lower)) {
    return { color: '#C9A84C', fontSize: '13px', fontWeight: 600 };
  }
  if (/summons|plays|draws/.test(lower)) {
    return { color: '#6080c0' };
  }
  return { color: '#9090b8' };
}

export default function Log({ entries }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  return (
    <div
      ref={containerRef}
      style={{
        background: '#0f0f1e',
        border: '1px solid #252538',
        borderRadius: '6px',
        padding: '8px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}
    >
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '12px',
        color: '#C9A84C',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: '6px',
        fontVariant: 'small-caps',
      }}>Game Log</div>
      <div>
        {entries.map((entry, i) => (
          <div
            key={i}
            className="log-entry"
            style={{
              fontSize: '12px',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.6,
              padding: '2px 4px',
              borderRadius: '2px',
              background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
              borderBottom: '0.5px solid #0f0f1a',
              ...getEntryStyle(entry),
            }}
          >
            {entry}
          </div>
        ))}
      </div>
    </div>
  );
}
