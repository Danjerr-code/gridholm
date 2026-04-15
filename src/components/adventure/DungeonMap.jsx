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

const TILE_SIZE = 56;
const TILE_GAP = 4;
const GRID_PADDING = 12;
const GRID_TOTAL = GRID_PADDING * 2 + 5 * TILE_SIZE + 4 * TILE_GAP; // 320px

function tileCenter(row, col) {
  return {
    x: GRID_PADDING + col * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
    y: GRID_PADDING + row * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
  };
}

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

// CSS keyframes injected once for pulsing current tile indicator
const PULSE_STYLE = `
@keyframes dungeonDotPulse {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 3px #C9A84C) drop-shadow(0 0 6px #C9A84C80); }
  50%       { opacity: 0.55; filter: drop-shadow(0 0 6px #C9A84C) drop-shadow(0 0 12px #C9A84C60); }
}
`;

/**
 * DungeonMap renders the 5x5 dungeon grid with fog of war and a movement path trail.
 *
 * Props:
 *   state       — adventure run state
 *   onTileClick — (row, col) callback when a movable tile is clicked
 */
export default function DungeonMap({ state, onTileClick }) {
  const { dungeonLayout, revealedTiles, completedTiles, currentTile, movementPath } = state;

  // Determine whether the boss room is currently locked (player not on gate tile)
  const gateTile = useMemo(() => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (dungeonLayout[r][c].isGate) return { row: r, col: c };
      }
    }
    return null;
  }, [dungeonLayout]);

  const bossLocked = !gateTile || currentTile.row !== gateTile.row || currentTile.col !== gateTile.col;

  // Pre-compute movable tiles (adjacent, revealed, non-wall, non-current, non-completed)
  const movableTiles = useMemo(() => {
    // Find the gate tile — only tile that grants access to boss (2,2)
    let gateTile = null;
    outer: for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (dungeonLayout[r][c].isGate) { gateTile = { row: r, col: c }; break outer; }
      }
    }

    const result = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const tile = dungeonLayout[r][c];
        if (tile.type === 'wall') continue;
        if (isCurrentTile(tile, currentTile)) continue;
        if (!isAdjacent(tile, currentTile)) continue;
        if (!isTileRevealed(tile, revealedTiles)) continue;
        // Boss tile only reachable from the single gate tile
        if (tile.type === 'boss') {
          if (!gateTile || currentTile.row !== gateTile.row || currentTile.col !== gateTile.col) continue;
        }
        result.push({ row: r, col: c });
      }
    }
    return result;
  }, [dungeonLayout, revealedTiles, currentTile]);

  // Build SVG path points from movementPath for the trail line
  const pathPoints = useMemo(() => {
    if (!movementPath || movementPath.length < 2) return null;
    return movementPath.map(({ row, col }) => tileCenter(row, col));
  }, [movementPath]);

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      gap: `${TILE_GAP}px`,
      padding: `${GRID_PADDING}px`,
      background: '#0a0a14',
      border: '1px solid #2a2a3a',
      borderRadius: '8px',
      position: 'relative',
    }}>
      {/* Pulse animation keyframes */}
      <style>{PULSE_STYLE}</style>

      {/* Movement path trail SVG overlay */}
      {pathPoints && (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 1,
          }}
          width={GRID_TOTAL}
          height={GRID_TOTAL}
        >
          {pathPoints.slice(1).map((pt, i) => (
            <line
              key={i}
              x1={pathPoints[i].x}
              y1={pathPoints[i].y}
              x2={pt.x}
              y2={pt.y}
              stroke="#C9A84C"
              strokeOpacity="0.5"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}

      {Array.from({ length: 5 }, (_, r) => (
        <div key={r} style={{ display: 'flex', gap: `${TILE_GAP}px` }}>
          {Array.from({ length: 5 }, (_, c) => {
            const tile = dungeonLayout[r][c];
            const revealed = isTileRevealed(tile, revealedTiles) || tile.type === 'boss';
            const completed = isTileCompleted(tile, completedTiles);
            const current = isCurrentTile(tile, currentTile);
            const movable = movableTiles.some(t => t.row === r && t.col === c);
            const locked = tile.type === 'boss' && bossLocked;
            // Non-adjacent revealed tiles are dimmed
            const dimmed = revealed && !current && !movable && tile.type !== 'wall';

            return (
              <TileCell
                key={c}
                tile={tile}
                revealed={revealed}
                completed={completed}
                current={current}
                movable={movable}
                locked={locked}
                dimmed={dimmed}
                onClick={movable ? () => onTileClick(r, c) : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TileCell({ tile, revealed, completed, current, movable, locked, dimmed, onClick }) {
  if (!revealed) {
    // Hidden tile
    return (
      <div style={{
        width: `${TILE_SIZE}px`,
        height: `${TILE_SIZE}px`,
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
        width: `${TILE_SIZE}px`,
        height: `${TILE_SIZE}px`,
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
  const isGate = tile.isGate;

  let borderColor = current ? '#C9A84C' : isGate ? '#e07818' : movable ? accentColor : '#2a2a3a';
  let borderWidth = current || isGate ? '2px' : movable ? '1px' : '1px';
  let boxShadow = current
    ? '0 0 12px #C9A84C80'
    : isGate
    ? '0 0 8px #e0781860'
    : movable
    ? `0 0 8px ${accentColor}60`
    : 'none';
  let cursor = movable ? 'pointer' : 'default';
  let background = current
    ? '#1a160a'
    : completed
    ? '#0d140d'
    : '#0d0d18';

  // Completed non-current tiles dim to 80%; non-adjacent non-current tiles dim further
  let opacity = 1;
  if (completed && !current) opacity = 0.8;
  if (dimmed && !completed) opacity = 0.75;
  if (dimmed && completed) opacity = 0.65;

  return (
    <div
      onClick={onClick}
      title={`${label}${completed ? ' (cleared)' : ''}`}
      style={{
        width: `${TILE_SIZE}px`,
        height: `${TILE_SIZE}px`,
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
        opacity,
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

      {/* Gate tile indicator — door icon in top-left corner */}
      {isGate && (
        <div style={{
          position: 'absolute',
          top: '2px',
          left: '3px',
          fontSize: '10px',
          lineHeight: 1,
        }}>
          🚪
        </div>
      )}

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

      {/* Boss locked indicator — shown when boss room is not yet accessible */}
      {locked && (
        <div style={{
          position: 'absolute',
          top: '2px',
          right: '4px',
          fontSize: '10px',
          lineHeight: 1,
          opacity: 0.7,
        }}>
          🔒
        </div>
      )}

      {/* Current player indicator — centered golden dot with pulsing glow */}
      {current && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '12px',
          color: '#C9A84C',
          lineHeight: 1,
          animation: 'dungeonDotPulse 2s ease-in-out infinite',
          pointerEvents: 'none',
        }}>
          ●
        </div>
      )}
    </div>
  );
}
