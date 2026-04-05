export default function Card({ card, isSelected, isPlayable, onClick }) {
  const isSpell = card.type === 'spell';
  const typeBorder = card.legendary ? 'border-amber-400' : isSpell ? 'border-purple-500' : 'border-gray-500';
  const selectedStyle = isSelected ? '-translate-y-2' : '';
  const playableStyle = isPlayable && !isSelected ? 'hover:-translate-y-1 cursor-pointer' : 'cursor-pointer';
  const dimStyle = !isPlayable && !isSelected ? 'opacity-50' : '';
  const borderStyle = isSelected ? { borderColor: '#C9A84C' } : undefined;

  const artTypeChar = isSpell ? '✦' : (card.unitType ? card.unitType[0] : '?');

  return (
    <div
      className={`relative bg-gray-800 border ${typeBorder} rounded-lg text-xs select-none transition-transform
        ${selectedStyle} ${playableStyle} ${dimStyle}
        flex flex-col p-1.5 w-20
        md:w-[100px] md:h-[140px]`}
      style={borderStyle}
      onClick={onClick}
      title={card.rules || card.name}
    >
      {/* === MOBILE LAYOUT (hidden on md+) === */}
      <div className="md:hidden flex flex-col">
        <div className="flex justify-between items-start mb-0.5">
          <span className="font-bold text-white leading-tight text-[10px]">
            {card.legendary && <span className="text-amber-400 mr-0.5">♛</span>}
            {card.name}
          </span>
          <span className="text-yellow-400 font-bold leading-none">{card.cost}</span>
        </div>
        {card.type === 'unit' && (
          <>
            <div className="text-gray-400 text-[9px] mb-0.5">{card.unitType}</div>
            <div className="flex justify-between text-[9px]">
              <span className="text-red-400">⚔{card.atk}</span>
              <span className="text-green-400">♥{card.hp}</span>
              <span className="text-blue-400">⚡{card.spd}</span>
            </div>
          </>
        )}
        {card.type === 'spell' && (
          <div className="text-purple-400 text-[9px] mt-auto">Spell</div>
        )}
        {card.rules && (
          <div className="text-[8px] text-gray-400 mt-0.5 leading-tight line-clamp-2">{card.rules}</div>
        )}
      </div>

      {/* === DESKTOP LAYOUT (hidden on mobile, shown on md+) === */}
      <div className="hidden md:flex md:flex-col md:h-full">
        {/* Cost: pinned top-right */}
        <span className="absolute top-1.5 right-1.5 text-yellow-400 font-bold text-[10px] leading-none">{card.cost}</span>

        {/* Art placeholder: top 40% of card height (~56px) */}
        <div
          className="flex items-center justify-center rounded mb-1 flex-shrink-0"
          style={{ height: '56px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          data-art-slot="true"
        >
          <span className="text-gray-500 text-xs">{artTypeChar}</span>
        </div>

        {/* Card name: truncated, max-width 70% */}
        <div
          className="font-bold text-white text-[10px] leading-tight mb-0.5 overflow-hidden whitespace-nowrap"
          style={{ textOverflow: 'ellipsis', maxWidth: '70%' }}
        >
          {card.legendary && <span className="text-amber-400 mr-0.5">♛</span>}
          {card.name}
        </div>

        {/* Stats row */}
        {card.type === 'unit' && (
          <div className="flex justify-between text-[9px] mb-0.5">
            <span className="text-red-400">⚔{card.atk}</span>
            <span className="text-green-400">♥{card.hp}</span>
            <span className="text-blue-400">⚡{card.spd}</span>
          </div>
        )}
        {card.type === 'spell' && (
          <div className="text-purple-400 text-[9px] mb-0.5">Spell</div>
        )}

        {/* Rules text: 2 lines max with ellipsis */}
        {card.rules && (
          <div className="text-[8px] text-gray-400 leading-tight line-clamp-2 overflow-hidden">{card.rules}</div>
        )}

        {/* Card type label at very bottom */}
        <div className="mt-auto text-[8px] text-gray-500 capitalize">
          {card.unitType || (isSpell ? 'Spell' : '')}
        </div>
      </div>
    </div>
  );
}
