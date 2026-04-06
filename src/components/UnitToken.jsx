import { getEffectiveAtk, getEffectiveHp, getEffectiveMaxHp, getEffectiveSpd, getPackBonus, isAuraBuffed, isAuraDebuffed } from '../engine/statUtils.js';
import { getCardImageUrl } from '../supabase.js';

export default function UnitToken({ unit, state, isSelected, isSpellTarget, isArcherTarget, isSacrificeTarget, myPlayerIndex, onClick }) {
  const isP1 = unit.owner === 0;
  const isLegendary = !!unit.legendary;
  const isMyUnit = myPlayerIndex !== undefined && unit.owner === myPlayerIndex;
  const isOpponentHidden = unit.hidden && !isMyUnit;
  const isOwnHidden = unit.hidden && isMyUnit;

  // Opponent's hidden unit: dark face-down token
  if (isOpponentHidden) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center rounded cursor-pointer bg-gray-900 ring-1 ring-gray-600 select-none relative"
        onClick={onClick}
        title="Hidden Unit"
      >
        <div className="text-[9px] sm:text-xs font-bold leading-none text-gray-500">???</div>
        <div className="text-[8px] text-gray-600 leading-none mt-0.5 font-semibold">Hidden</div>
      </div>
    );
  }

  const border = isSelected
    ? 'ring-2 ring-yellow-400'
    : isSacrificeTarget
    ? 'ring-2 ring-amber-500 animate-pulse'
    : isSpellTarget
    ? 'ring-2 ring-orange-400'
    : isArcherTarget
    ? 'ring-2 ring-pink-400'
    : isOwnHidden
    ? 'ring-2 ring-yellow-300'
    : isLegendary
    ? 'ring-2 ring-amber-400'
    : isP1
    ? 'ring-1 ring-blue-500'
    : 'ring-1 ring-red-500';

  const auraBuffed = state && isAuraBuffed(state, unit);
  const auraDebuffed = state && isAuraDebuffed(state, unit);

  const baseBg = isP1 ? 'bg-blue-900' : 'bg-red-900';
  const auraTint = auraDebuffed ? ' bg-red-800/40' : auraBuffed ? ' bg-green-900/40' : '';
  const bg = baseBg + auraTint;

  const abbr = unit.name.split(' ').map(w => w[0]).join('').slice(0, 3);
  // Only show image when unit is visible (not hidden to opponent)
  const imageUrl = !isOpponentHidden ? getCardImageUrl(unit.image) : null;
  const effectiveAtk = state ? getEffectiveAtk(state, unit) : unit.atk + (unit.atkBonus || 0);
  const effectiveHp = state ? getEffectiveHp(state, unit) : unit.hp;
  const effectiveMaxHp = state ? getEffectiveMaxHp(state, unit) : unit.maxHp;
  const effectiveSpd = getEffectiveSpd(unit);
  const packBonus = state ? getPackBonus(state, unit) : 0;
  const hpColor = typeof effectiveHp === 'number' && effectiveHp <= effectiveMaxHp / 2 ? 'text-red-400' : 'text-gray-300';

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center rounded cursor-pointer ${bg} ${border} select-none relative${isOwnHidden ? ' shadow-[0_0_6px_2px_rgba(253,224,71,0.4)]' : ''}`}
      onClick={onClick}
      title={`${unit.name} | ATK:${effectiveAtk} HP:${effectiveHp}/${effectiveMaxHp} SPD:${effectiveSpd}${unit.hidden ? ' [Hidden]' : ''}`}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={unit.name}
          onError={(e) => { e.target.style.display = 'none'; }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: unit.hidden ? 0 : 1,
          }}
        />
      )}
      {isLegendary && (
        <span className="absolute top-0 right-0 text-[8px] leading-none text-amber-400" title="Legendary">♛</span>
      )}
      {isOwnHidden && (
        <span className="absolute top-0 left-0 text-[8px] leading-none text-yellow-300" title="Hidden">H</span>
      )}
      <div className="text-[8px] sm:text-xs font-bold leading-none">{abbr}</div>
      <div className="text-[7px] sm:text-[9px] text-gray-300 leading-none">ATK {effectiveAtk}</div>
      <div className={`text-[7px] sm:text-[9px] leading-none ${hpColor}`}>HP {effectiveHp}</div>
      <div className="flex gap-0.5 mt-0.5">
        {unit.summoned && <Badge label="S" color="yellow" title="Summoning sickness" />}
        {unit.moved && <Badge label="M" color="gray" title="Already moved" />}
        {unit.shield > 0 && <Badge label={`🛡${unit.shield}`} color="cyan" title="Shield" />}
        {(unit.atkBonus || 0) > 0 && <Badge label={`+${unit.atkBonus}A`} color="green" title="ATK bonus" />}
        {auraBuffed && <Badge label="Aura" color="teal" title="Receiving aura bonus" />}
        {auraDebuffed && <Badge label="Debuff" color="red" title="Enemy aura debuff" />}
        {(unit.speedBonus || 0) > 0 && <Badge label={`+${unit.speedBonus}S`} color="purple" title="Speed bonus" />}
        {packBonus > 0 && <Badge label={`Pack+${packBonus}`} color="amber" title={`Pack Runt bonus: +${packBonus}/+${packBonus}`} />}
        {unit.id === 'pip' && <Badge label="↑" color="amber" title="Growing each turn" />}
      </div>
    </div>
  );
}

function Badge({ label, color, title }) {
  const colors = {
    yellow: 'bg-yellow-600 text-yellow-100',
    gray: 'bg-gray-600 text-gray-200',
    cyan: 'bg-cyan-700 text-cyan-100',
    green: 'bg-green-700 text-green-100',
    purple: 'bg-purple-700 text-purple-100',
    amber: 'bg-amber-600 text-amber-100',
    teal: 'bg-teal-700 text-teal-100',
    red: 'bg-red-700 text-red-100',
  };
  return (
    <span className={`text-[8px] px-0.5 rounded leading-none ${colors[color]}`} title={title}>
      {label}
    </span>
  );
}
