import { useEffect, useRef, useState } from 'react';

/**
 * TurnBanner — brief "Your Turn" / "Opponent's Turn" overlay that fires
 * whenever activePlayer changes. Slides in over 400ms, then fades over 200ms.
 * Total duration: 600ms.
 */
export default function TurnBanner({ activePlayer, myPlayerIndex }) {
  const prevActivePlayerRef = useRef(null);
  const [banner, setBanner] = useState(null); // null | { label, color, key }

  useEffect(() => {
    if (prevActivePlayerRef.current === null) {
      prevActivePlayerRef.current = activePlayer;
      return;
    }
    if (prevActivePlayerRef.current !== activePlayer) {
      prevActivePlayerRef.current = activePlayer;
      const isMyTurn = activePlayer === myPlayerIndex;
      setBanner({
        label: isMyTurn ? 'Your Turn' : "Opponent's Turn",
        color: isMyTurn ? '#4ade80' : '#f87171',
        key: Date.now(),
      });
      setTimeout(() => setBanner(null), 650);
    }
  }, [activePlayer, myPlayerIndex]);

  if (!banner) return null;

  return (
    <div
      key={banner.key}
      className="turn-banner-anim"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        zIndex: 20,
        pointerEvents: 'none',
        fontFamily: "'Cinzel', serif",
        fontSize: '18px',
        fontWeight: 700,
        color: banner.color,
        letterSpacing: '0.1em',
        textShadow: `0 0 20px ${banner.color}88`,
        whiteSpace: 'nowrap',
        background: 'rgba(0,0,0,0.75)',
        padding: '8px 20px',
        borderRadius: '4px',
        border: `1px solid ${banner.color}44`,
      }}
    >
      {banner.label}
    </div>
  );
}
