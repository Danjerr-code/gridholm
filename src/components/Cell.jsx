import { useCallback } from 'react';
import UnitToken from './UnitToken.jsx';
import useLongPress from '../hooks/useLongPress.js';
import { getChampionAtkBuff } from '../engine/gameEngine.js';

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
  isApproachTile = false,
  isOpponentMoveTile,
  isDragTarget,
  isSelected,
  isSpellTarget,
  isChampionSpellTarget,
  isChampionAbilityTarget = false,
  isArcherTarget,
  isSacrificeTarget,
  isSacrificeSelected = false,
  isAbilityTarget,
  isTerrainTarget,
  isDirectionTarget = false,
  directionArrow = null,
  isChampionSaplingTile = false,
  isSpellTargetGlow,
  terrain,
  terrainAnimActive = false,
  isThroneShockwave = false,
  unitAnimState,
  champAnimState,
  dyingUnits = [],
  state,
  myPlayerIndex,
  onClick,
  onUnitClick,
  onChampionClick,
  onChampionLongPress,
  isMobile,
  onUnitLongPress,
  onLongPressDismiss,
  onThroneLongPress,
  onTerrainLongPress,
  onUnitDragStart,
  onUnitDragMove,
  onUnitDragEnd,
}) {
  const terrainTint = terrain ? TERRAIN_TINTS[terrain.id] : null;

  let tileStyle;
  let tileClass = `relative w-full aspect-square transition-colors${isThroneShockwave ? ' throne-damage-pulse-anim' : ''}`;

  if (isChampionSaplingTile) {
    tileStyle = {
      background: '#0d2a15',
      border: '2px solid #22c55e',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(34,197,94,0.5)',
      cursor: 'pointer',
    };
  } else if (isTerrainTarget) {
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
  } else if (isApproachTile) {
    tileStyle = {
      background: '#1d1a00',
      border: '2px solid #c9a020',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(201,160,32,0.5)',
      cursor: 'pointer',
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

  // Long-press on a terrain tile (mobile only, 500ms) shows terrain detail.
  const terrainLongPressCallback = useCallback(() => {
    if (onTerrainLongPress) onTerrainLongPress();
  }, [onTerrainLongPress]);
  const terrainLongPress = useLongPress(terrainLongPressCallback, 500);
  const terrainLongPressActive = !isCenter && !!terrain && isMobile && !unit && !champion && !!onTerrainLongPress;

  // Long-press on champion token (mobile only) shows champion details.
  const champLongPressCallback = useCallback(() => {
    if (onChampionLongPress) onChampionLongPress();
  }, [onChampionLongPress]);
  const champLongPress = useLongPress(champLongPressCallback);
  const hasChampLongPress = isMobile && !!onChampionLongPress;
  const tilePointerHandlers = throneActive ? {
    onPointerDown: throneLongPress.onPointerDown,
    onPointerUp: () => {
      const fired = throneLongPress.firedRef.current;
      throneLongPress.onPointerUp();
      if (fired && onLongPressDismiss) onLongPressDismiss();
    },
    onPointerCancel: throneLongPress.onPointerCancel,
  } : terrainLongPressActive ? {
    onPointerDown: terrainLongPress.onPointerDown,
    onPointerUp: () => {
      const fired = terrainLongPress.firedRef.current;
      terrainLongPress.onPointerUp();
      if (fired && onLongPressDismiss) onLongPressDismiss();
    },
    onPointerCancel: terrainLongPress.onPointerCancel,
  } : {};
  const handleTileClick = throneActive
    ? (e) => {
        if (throneLongPress.firedRef.current) {
          throneLongPress.firedRef.current = false;
          return;
        }
        onClick && onClick(e);
      }
    : terrainLongPressActive
    ? (e) => {
        if (terrainLongPress.firedRef.current) {
          terrainLongPress.firedRef.current = false;
          return;
        }
        onClick && onClick(e);
      }
    : onClick;

  const isP1Champion = champion && champion.owner === 0;
  const champColor = isP1Champion ? '#185FA5' : '#993C1D';
  const isMyChampion = myPlayerIndex !== undefined && champion && champion.owner === myPlayerIndex;

  // Champion ability animation: attribute-coloured glow
  const ATTR_GLOW_RGBA = {
    light:  'rgba(255, 255, 220, 0.8)',
    primal: 'rgba(34,  197,  94, 0.75)',
    mystic: 'rgba(168,  85, 247, 0.75)',
    dark:   'rgba(220,  38,  38, 0.75)',
  };
  const champIsAbility = champAnimState?.type === 'ability';
  const champIsHeal    = champAnimState?.type === 'heal';
  const champAnimCls =
    champAnimState?.type === 'damage' ? (champAnimState.heavy ? ' unit-damage-heavy-anim' : ' unit-damage-anim') :
    champIsAbility ? ' unit-champ-ability-anim' :
    '';

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

      {/* Terrain placed flash — fires when terrain is first applied to a tile */}
      {terrainAnimActive && (
        <div className="terrain-placed-anim absolute inset-0 pointer-events-none" style={{ borderRadius: '4px', zIndex: 4 }} />
      )}

      {/* Throne shockwave ring — fires when Throne deals damage */}
      {isThroneShockwave && (
        <div className="throne-shockwave-ring" />
      )}

      {/* Opponent move flash overlay */}
      {isOpponentMoveTile && (
        <div className="opponent-move-flash absolute inset-0 pointer-events-none" style={{ borderRadius: '4px', zIndex: 5 }} />
      )}

      {/* Spell target glow overlay + circular pulse ring */}
      {isSpellTargetGlow && (
        <>
          <div className="spell-target-tile-glow absolute inset-0 pointer-events-none" style={{ borderRadius: '4px', zIndex: 6 }} />
          <div className="spell-cast-ring pointer-events-none" />
        </>
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
          className={`absolute inset-1 flex flex-col items-center justify-center rounded-full cursor-pointer select-none${champAnimCls}`}
          style={{
            background: `radial-gradient(circle, ${champColor}66 0%, transparent 100%)`,
            border: `2px solid ${(isChampionSpellTarget || isChampionAbilityTarget) ? '#f97316' : champColor}`,
            boxShadow: `0 0 12px ${(isChampionSpellTarget || isChampionAbilityTarget) ? '#f9731660' : champColor + '60'}`,
            ...(champIsAbility ? { '--ability-glow-color': ATTR_GLOW_RGBA[champAnimState.attribute] ?? 'rgba(255,255,255,0.8)' } : {}),
          }}
          onPointerDown={hasChampLongPress ? (e) => { e.stopPropagation(); champLongPress.onPointerDown(); } : undefined}
          onPointerUp={hasChampLongPress ? (e) => {
            const fired = champLongPress.firedRef.current;
            champLongPress.onPointerUp();
            if (fired && onLongPressDismiss) onLongPressDismiss();
          } : undefined}
          onPointerCancel={hasChampLongPress ? champLongPress.onPointerCancel : undefined}
          onClick={e => {
            e.stopPropagation();
            if (hasChampLongPress && champLongPress.firedRef.current) {
              champLongPress.firedRef.current = false;
              return;
            }
            onChampionClick && onChampionClick();
          }}
          title={`${champion.owner === 0 ? 'P1' : 'P2'} Champion — HP: ${champion.hp}/${champion.maxHp}`}
        >
          {/* Red flash overlay on damage */}
          {champAnimState?.type === 'damage' && (
            <div className="unit-damage-flash-overlay" style={{ borderRadius: '50%' }} />
          )}
          {/* Green flash overlay on heal */}
          {champIsHeal && (
            <div className="champ-heal-flash-overlay" />
          )}
          {/* Faction gem — top-center overlay */}
          {champion.attribute && (
            <img
              src={`/gem-${champion.attribute}.png`}
              alt={champion.attribute}
              draggable={false}
              style={{
                position: 'absolute',
                top: '3px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '24px',
                height: '24px',
                objectFit: 'contain',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />
          )}
          <svg width="18" height="15" viewBox="0 0 24 20" fill="white" style={{ flexShrink: 0 }}>
            <path d="M2,18 L2,6 L8,14 L12,2 L16,14 L22,6 L22,18 Z"/>
          </svg>
          <span className={champAnimState?.type === 'damage' ? 'champ-hp-flash-anim' : ''} style={{ fontFamily: 'var(--font-sans)', fontSize: champion.maxHp < 20 ? '11px' : '14px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
            {champion.maxHp < 20 ? `${champion.hp}/${champion.maxHp}` : champion.hp}
          </span>
          {state && (() => { const atkBuff = getChampionAtkBuff(state, champion); return atkBuff > 0 ? (
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, color: '#f97316', lineHeight: 1 }}>
              ⚔{atkBuff}
            </span>
          ) : null; })()}
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
            isSacrificeSelected={isSacrificeSelected}
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
            animState={{ type: d.unit.isOmen ? 'omen_death' : 'death' }}
          />
        </div>
      ))}

      {/* Direction arrow overlay — renders above unit tokens for direction selection */}
      {isDirectionTarget && directionArrow && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 20, pointerEvents: 'auto' }}
        >
          <div
            style={{
              width: '78%',
              height: '78%',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              border: '2px solid #f97316',
              boxShadow: '0 0 10px rgba(249,115,22,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg
              width="54%"
              height="54%"
              viewBox="0 0 24 24"
              fill="#f97316"
              style={{ filter: 'drop-shadow(0 0 3px rgba(249,115,22,0.9))' }}
            >
              {directionArrow === 'up'    && <polygon points="12,2 22,20 2,20" />}
              {directionArrow === 'down'  && <polygon points="12,22 22,4 2,4" />}
              {directionArrow === 'left'  && <polygon points="2,12 20,2 20,22" />}
              {directionArrow === 'right' && <polygon points="22,12 4,2 4,22" />}
            </svg>
          </div>
        </div>
      )}

      {/* Row/Col label (debug, hidden) */}
      {false && (
        <div className="absolute bottom-0 right-0 text-[7px] text-gray-600 pointer-events-none pr-0.5">
          {row},{col}
        </div>
      )}
    </div>
  );
}
