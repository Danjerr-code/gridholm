import { useState, useEffect, useRef } from 'react';
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

/**
 * Build the list of items to display in the hand, inserting ghost cards
 * (exiting cards) back at their original indices so the remaining cards
 * shift smoothly after the ghost disappears.
 */
function buildDisplayList(hand, exitingCards) {
  if (exitingCards.length === 0) {
    return hand.map(c => ({ card: c, isGhost: false, animType: null }));
  }
  const result = hand.map(c => ({ card: c, isGhost: false, animType: null }));
  // Insert ghosts at original positions (sort ascending so offsets accumulate correctly)
  const sorted = [...exitingCards].sort((a, b) => a.originalIndex - b.originalIndex);
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const insertAt = Math.min(g.originalIndex + i, result.length);
    result.splice(insertAt, 0, { card: g.card, isGhost: true, animType: g.animType });
  }
  return result;
}

export default function Hand({ player, resources, isActive, canPlay, gameState, playerIndex, pendingDiscard, pendingHandSelect, selectedCard, onPlayCard, onDiscardCard, onHandSelect, onInspectCard, isMobile, onMobileTap, onLongPressCard, onLongPressDismiss }) {
  // ── Animation state ────────────────────────────────────────────────────
  const [animInUids, setAnimInUids] = useState(new Set());
  const [exitingCards, setExitingCards] = useState([]); // {uid, card, animType, originalIndex}

  const prevHandRef = useRef(player.hand);
  const prevSelectedRef = useRef(selectedCard);
  const prevPendingDiscardRef = useRef(pendingDiscard);

  useEffect(() => {
    const prev = prevHandRef.current;
    const prevSel = prevSelectedRef.current;
    const prevDisc = prevPendingDiscardRef.current;

    const prevUids = new Set(prev.map(c => c.uid));
    const curUids = new Set(player.hand.map(c => c.uid));

    // Newly drawn cards → draw animation
    const entered = player.hand.filter(c => !prevUids.has(c.uid));
    if (entered.length > 0) {
      const uids = entered.map(c => c.uid);
      setAnimInUids(s => new Set([...s, ...uids]));
      setTimeout(() => {
        setAnimInUids(s => { const n = new Set(s); uids.forEach(u => n.delete(u)); return n; });
      }, 350);
    }

    // Cards that left the hand → exit animation
    const left = prev.filter(c => !curUids.has(c.uid));
    if (left.length > 0) {
      const newGhosts = left.map(c => ({
        uid: c.uid,
        card: c,
        animType: prevSel === c.uid
          ? (c.type === 'spell' ? 'spell' : 'play')
          : 'discard',
        originalIndex: prev.findIndex(p => p.uid === c.uid),
      }));
      setExitingCards(g => [...g, ...newGhosts]);
      const leftUids = left.map(c => c.uid);
      setTimeout(() => {
        setExitingCards(g => g.filter(x => !leftUids.includes(x.uid)));
      }, 400);
    }

    prevHandRef.current = player.hand;
    prevSelectedRef.current = selectedCard;
    prevPendingDiscardRef.current = pendingDiscard;
  }, [player.hand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep prev refs in sync without triggering effect
  useEffect(() => { prevSelectedRef.current = selectedCard; });
  useEffect(() => { prevPendingDiscardRef.current = pendingDiscard; });

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
  const displayList = buildDisplayList(player.hand, exitingCards);

  return (
    <div
      className={`flex flex-nowrap overflow-x-auto gap-1.5 py-2 px-1 min-h-[80px] ${dimmed ? 'opacity-60' : ''} md:justify-center`}
      style={{ WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory' }}
    >
      {displayList.map((item, idx) => {
        const { card, isGhost, animType } = item;

        // Animation class for this slot
        let animClass = '';
        if (isGhost) {
          if (animType === 'discard') animClass = 'card-discard-anim';
          else if (animType === 'spell') animClass = 'card-spell-anim';
          else animClass = 'card-play-anim';
        } else if (animInUids.has(card.uid)) {
          animClass = 'card-draw-anim';
        }

        // Selected card gets a smooth lift via CSS transition on Card
        const isSelected = canPlay && selectedCard === card.uid;
        const isPlayable = canPlay && resources >= card.cost && (!gameState || hasValidTargets(card, gameState, playerIndex));

        if (isGhost) {
          return (
            <div
              key={`ghost-${card.uid}`}
              className={animClass}
              style={{ scrollSnapAlign: 'start', flexShrink: 0, pointerEvents: 'none' }}
            >
              <Card card={card} isSelected={false} isPlayable={false} />
            </div>
          );
        }

        return (
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
            <div
              className={`${(pendingDiscard || pendingHandSelect) ? 'relative' : ''} ${animClass}`}
              style={{ scrollSnapAlign: 'start', flexShrink: 0 }}
            >
              <Card
                card={card}
                isSelected={isSelected}
                isPlayable={isPlayable}
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
        );
      })}
      {player.hand.length === 0 && exitingCards.length === 0 && (
        <span className="text-gray-500 text-xs self-center">Empty hand</span>
      )}
    </div>
  );
}
