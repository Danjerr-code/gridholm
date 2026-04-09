import { useCallback } from 'react';
import UnitToken from './UnitToken.jsx';
import useLongPress from '../hooks/useLongPress.js';

const TERRAIN_TINTS = {
  hallowed:  { bg: 'rgba(255,245,210,0.13)', border: 'rgba(255,235,150,0.35)' },
  scorched:  { bg: 'rgba(220,80,20,0.18)',   border: 'rgba(220,100,20,0.45)' },
  enchanted: { bg: 'rgba(140,60,220,0.15)',  border: 'rgba(170,90,240,0.40)' },
  cursed:    { bg: 'rgba(60,0,30,0.25)',     border: 'rgba(120,0,40,0.45)' },
};

export default function Cell({
  row, col,
  unit, champion,
  isCenter,
  isChampionMoveTile,
  isSummonTile,
  isUnitMoveTile,
  isEnemyMoveTile,
  isOpponentMoveTile,
  isDragTarget,
  isSelected,
  isSpellTarget,
  isChampionSpellTarget,
  isArcherTarget,
  isSacrificeTarget,
  isAbilityTarget,
  isTerrainTarget,
  isSpellTargetGlow,
  terrain,
  unitAnimState,
  champAnimState,
  dyingUnits = [],
  state,
  myPlayerIndex,
  onClick,
  onUnitClick,
  onChampionClick,
  isMobile,
  onUnitLongPress,
  onLongPressDismiss,
  onThroneLongPress,
  onUnitDragStart,
  onUnitDragMove,
  onUnitDragEnd,
}) {
  const terrainTint = terrain ? TERRAIN_TINTS[terrain.id] : null;

  let tileStyle;
  let tileClass = 'relative w-full aspect-square transition-colors';

  if (isTerrainTarget) {
    tileStyle = {
      background: '#0d2a1a',
      border: '2px solid #34d399',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(52,211,153,0.5)',
    };
  } else if (isDragTarget) {
    tileStyle = {
      background: '#0d2a4a',
      border: '2px solid #60a5fa',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(96,165,250,0.6)',
    };
  } else if (isChampionMoveTile || isUnitMoveTile) {
    tileStyle = {
      background: '#0d1f3a',
      border: '1px solid #2a5a9a',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
    };
  } else if (isSummonTile) {
    tileStyle = {
      background: '#0d2a0d',
      border: '1px solid #2a7a2a',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
    };
  } else if (isEnemyMoveTile) {
    tileStyle = {
      background: '#2a0d0d',
      border: '1px solid #8a2020',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
    };
  } else if (isCenter) {
    tileStyle = {
      background: 'radial-gradient(circle, #3d1f0a 0%, #1a0d00 100%)',
      border: '1px solid #7a4010',
      borderRadius: '4px',
      boxShadow: 'inset 0 0 20px rgba(150, 80, 20, 0.3), 0 0 8px rgba(150, 80, 20, 0.2)',
      cursor: 'pointer',
    };
  } else {
    tileStyle = {
      background: '#1a2236',
      border: '1px solid #2a3a5c',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
    };
  }

  // Long-press on the Throne tile (mobile only) shows terrain detail instead of tapping.
  const throneLongPressCallback = useCallback(() => {
    if (onThroneLongPress) onThroneLongPress();
  }, [onThroneLongPress]);
  const throneLongPress = useLongPress(throneLongPressCallback);
  const throneActive = isCenter && isMobile && !!onThroneLongPress;
  const tilePointerHandlers = throneActive ? {
    onPointerDown: throneLongPress.onPointerDown,
    onPointerUp: () => {
      const fired = throneLongPress.firedRef.current;
      throneLongPress.onPointerUp();
      if (fired && onLongPressDismiss) onLongPressDismiss();
    },
    onPointerCancel: throneLongPress.onPointerCancel,
  } : {};
  const handleTileClick = throneActive
    ? (e) => {
        if (throneLongPress.firedRef.current) {
          throneLongPress.firedRef.current = false;
          return;
        }
        onClick && onClick(e);
      }
    : onClick;

  const isP1Champion = champion && champion.owner === 0;
  const champColor = isP1Champion ? '#185FA5' : '#993C1D';
  const isMyChampion = myPlayerIndex !== undefined && champion && champion.owner === myPlayerIndex;

  return (
    <div
      className={tileClass}
      style={{ minWidth: 0, ...tileStyle }}
      title={isCenter ? (isMobile ? 'Throne — long press to inspect' : 'Throne — click to inspect') : undefined}
      {...tilePointerHandlers}
      onClick={handleTileClick}
    >
      {/* Terrain tint overlay — must render behind unit tokens */}
      {terrainTint && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: terrainTint.bg,
            borderRadius: '4px',
            boxShadow: `inset 0 0 0 1px ${terrainTint.border}`,
          }}
        />
      )}

      {/* Opponent move flash overlay */}
      {isOpponentMoveTile && (
        <div className="opponent-move-flash absolute inset-0 pointer-events-none" style={{ borderRadius: '4px', zIndex: 5 }} />
      )}

      {/* Spell target glow overlay */}
      {isSpellTargetGlow && (
        <div className="spell-target-tile-glow absolute inset-0 pointer-events-none" style={{ borderRadius: '4px', zIndex: 6 }} />
      )}

      {/* Center marker */}
      {isCenter && !unit && !champion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ color: 'rgba(150,80,20,0.6)', fontSize: '12px', fontWeight: 700 }}>
          ★
        </div>
      )}

      {/* Champion */}
      {champion && (
        <div
          className={`absolute inset-1 flex flex-col items-center justify-center rounded-full cursor-pointer select-none${champAnimState?.type === 'damage' ? (champAnimState.heavy ? ' unit-damage-heavy-anim' : ' unit-damage-anim') : ''}`}
          style={{
            background: `radial-gradient(circle, ${champColor}66 0%, transparent 100%)`,
            border: `2px solid ${isChampionSpellTarget ? '#f97316' : champColor}`,
            boxShadow: `0 0 12px ${isChampionSpellTarget ? '#f9731660' : champColor + '60'}`,
          }}
          onClick={e => { e.stopPropagation(); onChampionClick && onChampionClick(); }}
          title={`${champion.owner === 0 ? 'P1' : 'P2'} Champion — HP: ${champion.hp}/${champion.maxHp}`}
        >
          {/* Red flash overlay on damage */}
          {champAnimState?.type === 'damage' && (
            <div className="unit-damage-flash-overlay" style={{ borderRadius: '50%' }} />
          )}
          <svg width="18" height="15" viewBox="0 0 24 20" fill="white" style={{ flexShrink: 0 }}>
            <path d="M2,18 L2,6 L8,14 L12,2 L16,14 L22,6 L22,18 Z"/>
          </svg>
          <span className={champAnimState?.type === 'damage' ? 'champ-hp-flash-anim' : ''} style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
            {champion.hp}
          </span>
          {champion.skipNextAction && (
            <span style={{
              position: 'absolute',
              top: '-2px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#44403c',
              color: '#fbbf24',
              fontSize: '7px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              padding: '1px 4px',
              borderRadius: '99px',
              whiteSpace: 'nowrap',
              zIndex: 3,
            }} title="Stunned — cannot move or use action this turn">Stunned</span>
          )}
          {isMyChampion && (
            <span style={{
              position: 'absolute',
              bottom: '-12px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#C9A84C',
              color: '#0a0a0f',
              fontSize: '9px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: '99px',
              whiteSpace: 'nowrap',
              zIndex: 3,
            }}>YOU</span>
          )}
        </div>
      )}

      {/* Unit */}
      {unit && !champion && (
        <div className="absolute inset-0.5">
          <UnitToken
            unit={unit}
            state={state}
            isSelected={isSelected}
            isSpellTarget={isSpellTarget}
            isArcherTarget={isArcherTarget}
            isSacrificeTarget={isSacrificeTarget}
            isAbilityTarget={isAbilityTarget}
            myPlayerIndex={myPlayerIndex}
            onClick={e => { if (e.stopPropagation) e.stopPropagation(); onUnitClick && onUnitClick(); }}
            isMobile={isMobile}
            onLongPress={onUnitLongPress ? () => { onUnitLongPress(unit); } : undefined}
            onLongPressDismiss={onLongPressDismiss}
            onDragStart={onUnitDragStart}
            onDragMove={onUnitDragMove}
            onDragEnd={onUnitDragEnd}
            animState={unitAnimState}
          />
        </div>
      )}

      {/* Dying unit ghosts — rendered for death animation duration then removed */}
      {dyingUnits.map(d => (
        <div key={d.id} className="absolute inset-0.5 pointer-events-none" style={{ zIndex: 8 }}>
          <UnitToken
            unit={d.unit}
            state={null}
            myPlayerIndex={myPlayerIndex}
            animState={{ type: 'death' }}
          />
        </div>
      ))}

      {/* Row/Col label (debug, hidden) */}
      {false && (
        <div className="absolute bottom-0 right-0 text-[7px] text-gray-600 pointer-events-none pr-0.5">
          {row},{col}
        </div>
      )}
    </div>
  );
}
