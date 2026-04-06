import UnitToken from './UnitToken.jsx';

export default function Cell({
  row, col,
  unit, champion,
  isCenter,
  isChampionMoveTile,
  isSummonTile,
  isUnitMoveTile,
  isEnemyMoveTile,
  isSelected,
  isSpellTarget,
  isChampionSpellTarget,
  isArcherTarget,
  isSacrificeTarget,
  state,
  myPlayerIndex,
  onClick,
  onUnitClick,
  onChampionClick,
  isMobile,
  onUnitLongPress,
  onLongPressDismiss,
}) {
  let tileStyle;
  let tileClass = 'relative w-full aspect-square transition-colors';

  if (isChampionMoveTile || isUnitMoveTile) {
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
      background: '#161624',
      border: '1px solid #252538',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
    };
  }

  const isP1Champion = champion && champion.owner === 0;
  const champColor = isP1Champion ? '#185FA5' : '#993C1D';
  const isMyChampion = myPlayerIndex !== undefined && champion && champion.owner === myPlayerIndex;

  return (
    <div
      className={tileClass}
      style={{ minWidth: 0, ...tileStyle }}
      title={isCenter ? 'Throne — click to inspect' : undefined}
      onClick={onClick}
    >
      {/* Center marker */}
      {isCenter && !unit && !champion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ color: 'rgba(150,80,20,0.6)', fontSize: '12px', fontWeight: 700 }}>
          ★
        </div>
      )}

      {/* Champion */}
      {champion && (
        <div
          className="absolute inset-1 flex flex-col items-center justify-center rounded-full cursor-pointer select-none"
          style={{
            background: `radial-gradient(circle, ${champColor}66 0%, transparent 100%)`,
            border: `2px solid ${isChampionSpellTarget ? '#f97316' : champColor}`,
            boxShadow: `0 0 12px ${isChampionSpellTarget ? '#f9731660' : champColor + '60'}`,
          }}
          onClick={e => { e.stopPropagation(); onChampionClick && onChampionClick(); }}
          title={`${champion.owner === 0 ? 'P1' : 'P2'} Champion — HP: ${champion.hp}/${champion.maxHp}`}
        >
          <svg width="18" height="15" viewBox="0 0 24 20" fill="white" style={{ flexShrink: 0 }}>
            <path d="M2,18 L2,6 L8,14 L12,2 L16,14 L22,6 L22,18 Z"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
            {champion.hp}
          </span>
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
            myPlayerIndex={myPlayerIndex}
            onClick={e => { if (e.stopPropagation) e.stopPropagation(); onUnitClick && onUnitClick(); }}
            isMobile={isMobile}
            onLongPress={onUnitLongPress ? () => { onUnitLongPress(unit); } : undefined}
            onLongPressDismiss={onLongPressDismiss}
          />
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
