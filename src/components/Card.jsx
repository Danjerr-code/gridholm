export default function Card({ card, isSelected, isPlayable, onClick }) {
  const typeColor = card.legendary ? 'border-amber-400' : card.type === 'spell' ? 'border-purple-500' : 'border-gray-500';
  const selectedStyle = isSelected ? 'ring-2 ring-yellow-400 -translate-y-2' : '';
  const playableStyle = isPlayable && !isSelected ? 'hover:-translate-y-1 cursor-pointer border-opacity-100' : 'cursor-pointer';
  const dimStyle = !isPlayable && !isSelected ? 'opacity-50' : '';

  return (
    <div
      className={`relative flex flex-col bg-gray-800 border ${typeColor} rounded-lg p-1.5 text-xs select-none transition-transform
        ${selectedStyle} ${playableStyle} ${dimStyle} w-20`}
      style={{ minWidth: '80px' }}
      onClick={onClick}
      title={card.rules || card.name}
    >
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
  );
}
