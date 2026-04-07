import Card from './Card.jsx';
import useLongPress from '../hooks/useLongPress.js';
import { hasValidTargets } from '../engine/gameEngine.js';

function CardWithLongPress({ card, isMobile, onLongPressCard, onLongPressDismiss, onClick, children }) {
  const longPress = useLongPress(() => {
    if (onLongPressCard) onLongPressCard(card);
  });

  const handlePointerUp = () => {
    const fired = longPress.firedRef.current;
    longPress.onPointerUp();
    if (fired && onLongPressDismiss) onLongPressDismiss();
  };

  const handleClick = (e) => {
    if (longPress.firedRef.current) {
      longPress.firedRef.current = false;
      return;
    }
    onClick(e);
  };

  if (!isMobile || !onLongPressCard) {
    return <div onClick={onClick}>{children}</div>;
  }

  return (
    <div
      onPointerDown={longPress.onPointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

export default function Hand({ player, resources, isActive, canPlay, gameState, playerIndex, pendingDiscard, pendingHandSelect, selectedCard, onPlayCard, onDiscardCard, onHandSelect, onInspectCard, isMobile, onMobileTap, onLongPressCard, onLongPressDismiss }) {
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

  const dimmed = !canPlay && !pendingDiscard && !pendingHandSelect;

  return (
    <div
      className={`flex flex-nowrap overflow-x-auto gap-1.5 py-2 px-1 min-h-[80px] ${dimmed ? 'opacity-60' : ''} md:justify-center`}
      style={{ WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory' }}
    >
      {player.hand.map(card => (
        <CardWithLongPress
          key={card.uid}
          card={card}
          isMobile={isMobile}
          onLongPressCard={onLongPressCard}
          onLongPressDismiss={onLongPressDismiss}
          onClick={() => {
            if (pendingHandSelect) {
              if (onHandSelect) onHandSelect(card.uid);
            } else if (pendingDiscard) {
              if (onDiscardCard) onDiscardCard(card.uid);
            } else if (isMobile && onMobileTap) {
              onMobileTap(card);
            } else {
              if (onInspectCard) onInspectCard(card);
              if (canPlay) onPlayCard(card.uid);
            }
          }}
        >
          <div className={(pendingDiscard || pendingHandSelect) ? 'relative' : ''} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
          <Card
            card={card}
            isSelected={canPlay && selectedCard === card.uid}
            isPlayable={canPlay && resources >= card.cost && (!gameState || hasValidTargets(card, gameState, playerIndex))}
          />
          {pendingDiscard && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded border-2 border-yellow-400 bg-yellow-900/20">
              <span className="text-yellow-300 text-[10px] font-bold drop-shadow">DISCARD</span>
            </div>
          )}
          {pendingHandSelect && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded border-2 border-purple-400 bg-purple-900/20">
              <span className="text-purple-300 text-[10px] font-bold drop-shadow">SELECT</span>
            </div>
          )}
          </div>
        </CardWithLongPress>
      ))}
      {player.hand.length === 0 && (
        <span className="text-gray-500 text-xs self-center">Empty hand</span>
      )}
    </div>
  );
}
