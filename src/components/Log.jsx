import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { CARD_DB } from '../engine/cards.js';

// Build a sorted (longest first) list of card names and a lowercase->card lookup.
const CARD_NAME_LOOKUP = Object.fromEntries(
  Object.values(CARD_DB).map(card => [card.name.toLowerCase(), card])
);
const CARD_NAMES_SORTED = Object.keys(CARD_NAME_LOOKUP).sort((a, b) => b.length - a.length);
// Escape special regex characters in card names (e.g. commas, parens).
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CARD_NAME_REGEX = new RegExp(
  `(${CARD_NAMES_SORTED.map(escapeRegex).join('|')})`,
  'gi'
);

// Normalize a log entry (string or {text, privateFor} object) to its display text.
export function entryText(entry) {
  return typeof entry === 'string' ? entry : (entry?.text ?? '');
}

export function renderLogText(text, onCardNameClick) {
  if (!onCardNameClick) return text;
  const parts = text.split(CARD_NAME_REGEX);
  return parts.map((part, i) => {
    const card = CARD_NAME_LOOKUP[part.toLowerCase()];
    if (card) {
      return (
        <span
          key={i}
          onClick={(e) => { e.stopPropagation(); onCardNameClick(card); }}
          style={{
            color: '#C9A84C',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

function getEntryStyle(entry) {
  const lower = entryText(entry).toLowerCase();
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

// myPlayerIndex: null = show all (single-player); 0 or 1 = filter private entries
export default function Log({ entries, onCardNameClick, myPlayerIndex = null }) {
  const scrollRef = useRef(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const visibleEntries = useMemo(() => {
    if (myPlayerIndex === null) return entries;
    return entries.filter(entry => {
      if (typeof entry === 'string') return true;
      return entry.privateFor === null || entry.privateFor === undefined || entry.privateFor === myPlayerIndex;
    });
  }, [entries, myPlayerIndex]);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    const t = setTimeout(checkScroll, 0);
    return () => clearTimeout(t);
  }, [visibleEntries, checkScroll]);

  const arrowStyle = {
    position: 'absolute', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(15,15,30,0.85)', color: '#6b7280', border: 'none',
    cursor: 'pointer', fontSize: '9px', lineHeight: 1, padding: '2px 8px',
    zIndex: 10,
  };

  return (
    <div
      style={{
        background: '#0f0f1e',
        border: '1px solid #252538',
        borderRadius: '6px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
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
        flexShrink: 0,
      }}>Game Log</div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {canScrollUp && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ top: -60, behavior: 'smooth' })}
            style={{ ...arrowStyle, top: 0, borderRadius: '0 0 4px 4px' }}
          >▲</button>
        )}
        <div
          ref={scrollRef}
          className="no-scrollbar"
          style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
          onScroll={checkScroll}
        >
          {visibleEntries.map((entry, i) => (
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
              {renderLogText(entryText(entry), onCardNameClick)}
            </div>
          ))}
        </div>
        {canScrollDown && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ top: 60, behavior: 'smooth' })}
            style={{ ...arrowStyle, bottom: 0, borderRadius: '4px 4px 0 0' }}
          >▼</button>
        )}
      </div>
    </div>
  );
}
