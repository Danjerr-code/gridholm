import { useMemo } from 'react';

// Unicode icons per tile type
const TILE_ICONS = {
  fight:       '⚔',
  elite_fight: '⚔⚔',
  shop:        '🪙',
  treasure:    '📦',
  rest:        '🔥',
  event:       '❓',
  boss:        '💀',
  wall:        null,  // solid block — no icon
  start:       '🚩',
};

const TILE_LABELS = {
  fight:       'Fight',
  elite_fight: 'Elite',
  shop:        'Shop',
  treasure:    'Treasure',
  rest:        'Rest',
  event:       'Event',
  boss:        'Boss',
  start:       'Start',
};

// Color accents per tile type
const TILE_COLORS = {
  fight:       '#c87040',
  elite_fight: '#d04040',
  shop:        '#C9A84C',
  treasure:    '#40a0d0',
  rest:        '#48a868',
  event:       '#8a5fba',
  boss:        '#cc2020',
  start:       '#4a9060',
  wall:        '#1a1a2a',
};

function isTileRevealed(tile, revealedTiles) {
  return revealedTiles.some(t => t.row === tile.row && t.col === tile.col);
}

function isTileCompleted(tile, completedTiles) {
  return completedTiles.some(t => t.row === tile.row && t.col === tile.col);
}

function isCurrentTile(tile, currentTile) {
  return tile.row === currentTile.row && tile.col === currentTile.col;
}

function isAdjacent(tile, currentTile) {
  const dr = Math.abs(tile.row - currentTile.row);
  const dc = Math.abs(tile.col - currentTile.col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

/**
 * DungeonMap renders the 5x5 dungeon grid with fog of war.
 *
 * Props:
 *   state       — adventure run state
 *   onTileClick — (row, col) callback when a movable tile is clicked
 */
export default function DungeonMap({ state, onTileClick }) {
  const { dungeonLayout, revealedTiles, completedTiles, currentTile } = state;

  // Pre-compute movable tiles (adjacent, revealed, non-wall, non-current, non-completed)
  const movableTiles = useMemo(() => {
    const result = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const tile = dungeonLayout[r][c];
        if (tile.type === 'wall') continue;
        if (isCurrentTile(tile, currentTile)) continue;
        if (!isAdjacent(tile, currentTile)) continue;
        if (!isTileRevealed(tile, revealedTiles)) continue;
        result.push({ row: r, col: c });
      }
    }
    return result;
  }, [dungeonLayout, revealedTiles, currentTile]);

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      gap: '4px',
      padding: '12px',
      background: '#0a0a14',
      border: '1px solid #2a2a3a',
      borderRadius: '8px',
    }}>
      {Array.from({ length: 5 }, (_, r) => (
        <div key={r} style={{ display: 'flex', gap: '4px' }}>
          {Array.from({ length: 5 }, (_, c) => {
            const tile = dungeonLayout[r][c];
            const revealed = isTileRevealed(tile, revealedTiles) || tile.type === 'boss';
            const completed = isTileCompleted(tile, completedTiles);
            const current = isCurrentTile(tile, currentTile);
            const movable = movableTiles.some(t => t.row === r && t.col === c);

            return (
              <TileCell
                key={c}
                tile={tile}
                revealed={revealed}
                completed={completed}
                current={current}
                movable={movable}
                onClick={movable ? () => onTileClick(r, c) : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TileCell({ tile, revealed, completed, current, movable, onClick }) {
  if (!revealed) {
    // Hidden tile
    return (
      <div style={{
        width: '56px',
        height: '56px',
        background: '#0d0d18',
        border: '1px solid #1a1a2a',
        borderRadius: '4px',
        flexShrink: 0,
      }} />
    );
  }

  if (tile.type === 'wall') {
    return (
      <div style={{
        width: '56px',
        height: '56px',
        background: '#111120',
        border: '1px solid #1a1a26',
        borderRadius: '4px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        color: '#1e1e30',
      }}>
        ▪
      </div>
    );
  }

  const accentColor = TILE_COLORS[tile.type] ?? '#6a6a8a';
  const icon = TILE_ICONS[tile.type];
  const label = TILE_LABELS[tile.type] ?? tile.type;

  let borderColor = current ? '#C9A84C' : movable ? accentColor : '#2a2a3a';
  let borderWidth = current ? '2px' : movable ? '1px' : '1px';
  let boxShadow = current
    ? '0 0 12px #C9A84C80'
    : movable
    ? `0 0 8px ${accentColor}60`
    : 'none';
  let cursor = movable ? 'pointer' : 'default';
  let background = current
    ? '#1a160a'
    : completed
    ? '#0d140d'
    : '#0d0d18';

  return (
    <div
      onClick={onClick}
      title={`${label}${completed ? ' (cleared)' : ''}`}
      style={{
        width: '56px',
        height: '56px',
        background,
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: '4px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor,
        position: 'relative',
        transition: 'box-shadow 120ms ease, transform 120ms ease',
        boxShadow,
        ...(movable ? { transform: 'scale(1.02)' } : {}),
      }}
    >
      {/* Icon */}
      <div style={{ fontSize: '20px', lineHeight: 1, userSelect: 'none' }}>
        {icon}
      </div>

      {/* Label */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '7px',
        letterSpacing: '0.04em',
        color: accentColor,
        marginTop: '2px',
        textTransform: 'uppercase',
        userSelect: 'none',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        maxWidth: '52px',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </div>

      {/* Completed checkmark overlay */}
      {completed && !current && (
        <div style={{
          position: 'absolute',
          top: '2px',
          right: '4px',
          fontSize: '10px',
          color: '#4ade80',
          lineHeight: 1,
        }}>
          ✓
        </div>
      )}

      {/* Current player indicator */}
      {current && (
        <div style={{
          position: 'absolute',
          bottom: '2px',
          right: '3px',
          fontSize: '9px',
          color: '#C9A84C',
          lineHeight: 1,
        }}>
          ●
        </div>
      )}
    </div>
  );
}
