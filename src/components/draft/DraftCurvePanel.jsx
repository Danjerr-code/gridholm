import { CARD_DB } from '../../engine/cards.js';

export function getCurveCounts(ids) {
  const counts = {};
  for (const id of ids) {
    const card = CARD_DB[id];
    if (!card) continue;
    const cost = card.cost ?? 0;
    counts[cost] = (counts[cost] ?? 0) + 1;
  }
  return counts;
}

export function getTypeCounts(ids) {
  let units = 0, spells = 0, relics = 0, omens = 0;
  for (const id of ids) {
    const card = CARD_DB[id];
    if (!card) continue;
    if (card.isRelic || card.type === 'relic') relics++;
    else if (card.isOmen || card.type === 'omen') omens++;
    else if (card.type === 'spell') spells++;
    else if (card.type === 'unit') units++;
  }
  return { units, spells, relics, omens };
}

function ManaCurveBar({ counts }) {
  const maxCount = Math.max(1, ...Object.values(counts));
  const costs = [1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <div>
      <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', margin: '0 0 6px' }}>
        MANA CURVE
      </p>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 48 }}>
        {costs.map(cost => {
          const count = counts[cost] ?? 0;
          const height = count === 0 ? 4 : Math.max(8, Math.round((count / maxCount) * 44));
          return (
            <div key={cost} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              {count > 0 && <span style={{ fontSize: 9, color: '#C9A84C', fontFamily: 'monospace', marginBottom: 2 }}>{count}</span>}
              <div style={{ width: '100%', height, background: count === 0 ? '#1a1a2a' : '#C9A84C55', borderRadius: 2, border: '1px solid #2a2a3a' }} />
              <span style={{ fontSize: 8, color: '#4a4a6a', fontFamily: 'monospace', marginTop: 2 }}>{cost}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardTypeCounter({ ids }) {
  const { units, spells, relics, omens } = getTypeCounts(ids);
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {[['Units', units], ['Spells', spells], ['Relics', relics], ['Omens', omens]].map(([label, count]) => (
        <span key={label} style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#a0a0c0', letterSpacing: '0.06em' }}>
          {label}: <span style={{ color: '#e8e8f0' }}>{count}</span>
        </span>
      ))}
    </div>
  );
}

export default function DraftCurvePanel({ draftedIds }) {
  if (!draftedIds || draftedIds.length === 0) return null;
  const curveCounts = getCurveCounts(draftedIds);
  return (
    <div style={{
      background: '#0d0d1a',
      border: '1px solid #1e1e30',
      borderRadius: 6,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <ManaCurveBar counts={curveCounts} />
      <CardTypeCounter ids={draftedIds} />
    </div>
  );
}
