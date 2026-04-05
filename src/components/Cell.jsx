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
  isArcherTarget,
  auraBonus = 0,
  onClick,
  onUnitClick,
  onChampionClick,
}) {
  const bgBase = isCenter ? 'bg-amber-900/40' : 'bg-gray-900';
  const highlight = isChampionMoveTile
    ? 'bg-blue-800/60 ring-1 ring-blue-400'
    : isSummonTile
    ? 'bg-green-800/60 ring-1 ring-green-400'
    : isEnemyMoveTile
    ? 'bg-red-800/60 ring-1 ring-red-400'
    : isUnitMoveTile
    ? 'bg-blue-800/60 ring-1 ring-blue-400'
    : '';

  return (
    <div
      className={`relative w-full aspect-square border border-gray-700 ${bgBase} ${highlight} transition-colors${isCenter ? ' cursor-pointer' : ''}`}
      style={{ minWidth: 0 }}
      title={isCenter ? 'Throne — click to inspect' : undefined}
      onClick={onClick}
    >
      {/* Center marker */}
      {isCenter && !unit && !champion && (
        <div className="absolute inset-0 flex items-center justify-center text-amber-500/50 text-xs font-bold pointer-events-none">
          ★
        </div>
      )}

      {/* Champion */}
      {champion && (
        <div
          className={`absolute inset-1 flex flex-col items-center justify-center rounded-full cursor-pointer select-none
            ${champion.owner === 0 ? 'bg-blue-700 ring-2 ring-blue-300' : 'bg-red-700 ring-2 ring-red-300'}`}
          onClick={e => { e.stopPropagation(); onChampionClick && onChampionClick(); }}
          title={`${champion.owner === 0 ? 'P1' : 'AI'} Champion — HP: ${champion.hp}/${champion.maxHp}`}
        >
          <span className="text-xs font-bold leading-none">♛</span>
          <span className="text-[9px]">{champion.hp}</span>
        </div>
      )}

      {/* Unit */}
      {unit && !champion && (
        <div className="absolute inset-0.5">
          <UnitToken
            unit={unit}
            auraBonus={auraBonus}
            isSelected={isSelected}
            isSpellTarget={isSpellTarget}
            isArcherTarget={isArcherTarget}
            onClick={e => { if (e.stopPropagation) e.stopPropagation(); onUnitClick && onUnitClick(); }}
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
