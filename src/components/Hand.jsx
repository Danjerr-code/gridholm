import Card from './Card.jsx';

export default function Hand({ player, resources, isActive, canPlay, pendingDiscard, selectedCard, onPlayCard, onDiscardCard, onInspectCard }) {
  if (!isActive) {
    // Opponent face-down count
    return (
      <div className="flex items-center justify-center gap-1 py-2">
        {Array.from({ length: player.hand.length }, (_, i) => (
          <div key={i} className="w-10 h-14 bg-gray-700 border border-gray-600 rounded" />
        ))}
        {player.hand.length === 0 && <span className="text-gray-500 text-xs">No cards</span>}
      </div>
    );
  }

  const dimmed = !canPlay && !pendingDiscard;

  return (
    <div className={`flex flex-nowrap justify-center overflow-x-auto gap-1.5 py-2 px-1 min-h-[80px] ${dimmed ? 'opacity-60' : ''}`}>
      {player.hand.map(card => (
        <div key={card.uid} className={pendingDiscard ? 'relative' : ''}>
          <Card
            card={card}
            isSelected={canPlay && selectedCard === card.uid}
            isPlayable={canPlay && resources >= card.cost}
            onClick={() => {
              if (pendingDiscard) {
                if (onDiscardCard) onDiscardCard(card.uid);
              } else {
                if (onInspectCard) onInspectCard(card);
                if (canPlay) onPlayCard(card.uid);
              }
            }}
          />
          {pendingDiscard && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded border-2 border-yellow-400 bg-yellow-900/20">
              <span className="text-yellow-300 text-[10px] font-bold drop-shadow">DISCARD</span>
            </div>
          )}
        </div>
      ))}
      {player.hand.length === 0 && (
        <span className="text-gray-500 text-xs self-center">Empty hand</span>
      )}
    </div>
  );
}
