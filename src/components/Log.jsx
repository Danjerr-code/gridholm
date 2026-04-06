import { useEffect, useRef } from 'react';

function getEntryStyle(entry) {
  const lower = entry.toLowerCase();
  if (/damage|hits|destroyed|takes/.test(lower)) {
    return { color: '#8a3a3a' };
  }
  if (/restores|heals|gains hp/.test(lower)) {
    return { color: '#3a7a3a' };
  }
  if (/turn|begins|starts/.test(lower)) {
    return { color: '#C9A84C80', fontSize: '13px' };
  }
  if (/summons|plays|draws/.test(lower)) {
    return { color: '#3a5a8a' };
  }
  return { color: '#6a6a8a' };
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
        background: '#08080f',
        border: '1px solid #1e1e2e',
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
        fontSize: '10px',
        color: '#C9A84C',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: '6px',
        fontVariant: 'small-caps',
      }}>Log</div>
      <div>
        {entries.map((entry, i) => (
          <div
            key={i}
            className="log-entry"
            style={{
              fontSize: '12px',
              fontFamily: "'Crimson Text', serif",
              lineHeight: 1.5,
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
