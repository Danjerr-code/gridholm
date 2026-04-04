import Card from './Card.jsx';

export default function Hand({ player, resources, isActive, selectedCard, onPlayCard }) {
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

  return (
    <div className="flex flex-wrap gap-1.5 justify-center py-2 px-1 min-h-[80px]">
      {player.hand.map(card => (
        <Card
          key={card.uid}
          card={card}
          isSelected={selectedCard === card.uid}
          isPlayable={resources >= card.cost}
          onClick={() => onPlayCard(card.uid)}
        />
      ))}
      {player.hand.length === 0 && (
        <span className="text-gray-500 text-xs self-center">Empty hand</span>
      )}
    </div>
  );
}
