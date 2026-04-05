export default function UnitToken({ unit, isSelected, isSpellTarget, isArcherTarget, onClick }) {
  const isP1 = unit.owner === 0;
  const border = isSelected
    ? 'ring-2 ring-yellow-400'
    : isSpellTarget
    ? 'ring-2 ring-orange-400'
    : isArcherTarget
    ? 'ring-2 ring-pink-400'
    : isP1
    ? 'ring-1 ring-blue-500'
    : 'ring-1 ring-red-500';

  const bg = isP1 ? 'bg-blue-900' : 'bg-red-900';
  const abbr = unit.name.split(' ').map(w => w[0]).join('').slice(0, 3);
  const effectiveAtk = unit.atk + (unit.atkBonus || 0);
  const hpColor = unit.hp <= unit.maxHp / 2 ? 'text-red-400' : 'text-gray-300';

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center rounded cursor-pointer ${bg} ${border} select-none`}
      onClick={onClick}
      title={`${unit.name} | ATK:${effectiveAtk} HP:${unit.hp}/${unit.maxHp} SPD:${unit.spd + (unit.speedBonus || 0)}`}
    >
      <div className="text-xs font-bold leading-none">{abbr}</div>
      <div className="text-[9px] text-gray-300 leading-none">ATK {effectiveAtk}</div>
      <div className={`text-[9px] leading-none ${hpColor}`}>HP {unit.hp}</div>
      <div className="flex gap-0.5 mt-0.5">
        {unit.summoned && <Badge label="S" color="yellow" title="Summoning sickness" />}
        {unit.moved && <Badge label="M" color="gray" title="Already moved" />}
        {unit.shield > 0 && <Badge label={`🛡${unit.shield}`} color="cyan" title="Shield" />}
        {(unit.atkBonus || 0) > 0 && <Badge label={`+${unit.atkBonus}A`} color="green" title="ATK bonus" />}
        {(unit.speedBonus || 0) > 0 && <Badge label={`+${unit.speedBonus}S`} color="purple" title="Speed bonus" />}
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
  };
  return (
    <span className={`text-[8px] px-0.5 rounded leading-none ${colors[color]}`} title={title}>
      {label}
    </span>
  );
}
