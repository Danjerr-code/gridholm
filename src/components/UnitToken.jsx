import { getEffectiveAtk, getEffectiveHp, getEffectiveMaxHp, getEffectiveSpd, getPackBonus, isAuraBuffed, isAuraDebuffed } from '../engine/statUtils.js';
import { getCardImageUrl } from '../supabase.js';
import useLongPress from '../hooks/useLongPress.js';

const FACTION_COLORS = {
  Human:  { border: '#2a4a7a', text: '#4a8abf' },
  Beast:  { border: '#2a4a2a', text: '#4a8a4a' },
  Elf:    { border: '#3a2a5a', text: '#8a4abf' },
  Demon:  { border: '#4a1a1a', text: '#bf2a2a' },
};

const UNIT_TYPE_ABBR = { Human: 'H', Beast: 'B', Elf: 'E', Demon: 'D' };

function getFactionColors(unitType) {
  return FACTION_COLORS[unitType] || { border: '#2a2a3a', text: '#6a6a8a' };
}

export default function UnitToken({ unit, state, isSelected, isSpellTarget, isArcherTarget, isSacrificeTarget, myPlayerIndex, onClick, isMobile, onLongPress, onLongPressDismiss }) {
  const isP1 = unit.owner === 0;
  const isLegendary = !!unit.legendary;
  const isMyUnit = myPlayerIndex !== undefined && unit.owner === myPlayerIndex;
  const isOpponentHidden = unit.hidden && !isMyUnit;
  const isOwnHidden = unit.hidden && isMyUnit;

  const factionColors = getFactionColors(unit.unitType);

  // Player 1 is always blue, Player 2 is always red — color follows owner, not viewer
  const ownerRingColor = unit.owner === 0
    ? { ring: '#3b82f6', glow: 'rgba(59,130,246,0.55)' }
    : { ring: '#ef4444', glow: 'rgba(239,68,68,0.55)' };

  // Opponent's hidden unit: face-down token with hidden-art image
  if (isOpponentHidden) {
    const hiddenArtUrl = getCardImageUrl('hidden-art.webp');
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center rounded cursor-pointer select-none relative"
        style={{
          background: hiddenArtUrl ? `url(${hiddenArtUrl}) center/cover no-repeat` : '#1e2d45',
          border: '1px solid #3a2a5a60',
          borderRadius: '50%',
          boxShadow: `inset 0 1px 3px rgba(0,0,0,0.5), 0 0 0 2px ${ownerRingColor.ring}, 0 0 10px ${ownerRingColor.glow}`,
        }}
        onClick={onClick}
        title="Hidden Unit"
      >
        {/* Dark overlay to fade the hidden-art image */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.45)',
          borderRadius: '50%',
          zIndex: 1,
        }} />
        <div style={{
          position: 'absolute',
          top: '2px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#6a3abf',
          color: '#fff',
          fontSize: '8px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          padding: '1px 5px',
          borderRadius: '99px',
          whiteSpace: 'nowrap',
          zIndex: 2,
        }}>Hidden</div>
        <div style={{
          position: 'absolute',
          bottom: '2px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.75)',
          color: '#fff',
          fontSize: '10px',
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          padding: '1px 6px',
          borderRadius: '99px',
          whiteSpace: 'nowrap',
          zIndex: 2,
          lineHeight: 1.4,
        }}>?/?</div>
      </div>
    );
  }

  const auraBuffed = state && isAuraBuffed(state, unit);
  const auraDebuffed = state && isAuraDebuffed(state, unit);

  const abbr = UNIT_TYPE_ABBR[unit.unitType] || unit.name[0];
  const imageUrl = !isOpponentHidden ? getCardImageUrl(unit.image) : null;
  const effectiveAtk = state ? getEffectiveAtk(state, unit) : unit.atk + (unit.atkBonus || 0);
  // Own hidden units: use raw values — getEffectiveHp/getEffectiveMaxHp return '?' for all hidden units
  // to hide stats from opponents, but the controller should always see their own unit's real stats.
  const effectiveHp = isOwnHidden ? unit.hp : (state ? getEffectiveHp(state, unit) : unit.hp);
  const effectiveMaxHp = isOwnHidden ? unit.maxHp : (state ? getEffectiveMaxHp(state, unit) : unit.maxHp);
  const effectiveSpd = getEffectiveSpd(unit);
  const packBonus = state ? getPackBonus(state, unit) : 0;

  const teamRingShadow = `0 0 0 2px ${ownerRingColor.ring}, 0 0 10px ${ownerRingColor.glow}`;

  // Long-press inspect on mobile
  const longPress = useLongPress(() => {
    if (onLongPress) onLongPress();
  });

  const longPressHandlers = isMobile && onLongPress ? {
    onPointerDown: longPress.onPointerDown,
    onPointerUp: () => {
      const fired = longPress.firedRef.current;
      longPress.onPointerUp();
      if (fired && onLongPressDismiss) onLongPressDismiss();
    },
    onPointerCancel: longPress.onPointerCancel,
  } : {};

  const handleClick = (e) => {
    if (longPress.firedRef.current) {
      longPress.firedRef.current = false;
      return;
    }
    if (onClick) onClick(e);
  };

  // Ring style based on selection state
  let ringStyle = {};
  if (isSelected) {
    ringStyle = { outline: '2px solid #C9A84C', boxShadow: `0 0 8px #C9A84C60, ${teamRingShadow}` };
  } else if (isSacrificeTarget) {
    ringStyle = { outline: '2px solid #d97706' };
  } else if (isSpellTarget) {
    ringStyle = { outline: '2px solid #f97316' };
  } else if (isArcherTarget) {
    ringStyle = { outline: '2px solid #ec4899' };
  } else if (isLegendary) {
    ringStyle = { outline: '2px solid #C9A84C80' };
  } else if (isOwnHidden) {
    ringStyle = { outline: '2px solid #a855f7', boxShadow: `0 0 6px rgba(168,85,247,0.4), ${teamRingShadow}` };
  }

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center rounded-full cursor-pointer select-none relative"
      style={{
        background: '#1e2d45',
        border: `1px solid ${factionColors.border}4d`,
        boxShadow: `inset 0 1px 3px rgba(0,0,0,0.5), ${teamRingShadow}`,
        overflow: 'hidden',
        ...ringStyle,
      }}
      {...longPressHandlers}
      onClick={handleClick}
      title={`${unit.name} | ATK:${effectiveAtk} HP:${effectiveHp}/${effectiveMaxHp} SPD:${effectiveSpd}${unit.hidden ? ' [Hidden]' : ''}`}
    >
      {/* Card art fills token */}
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
            opacity: isOwnHidden ? 0.5 : 1,
            WebkitTouchCallout: 'none',
            userSelect: 'none',
          }}
        />
      )}

      {/* Fallback letter when no art */}
      {!imageUrl && (
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          fontWeight: 600,
          color: '#8080a0',
          position: 'absolute',
          zIndex: 1,
        }}>{abbr}</span>
      )}

      {/* Status badges top center */}
      <div style={{ position: 'absolute', top: 1, left: '50%', transform: 'translateX(-50%)', zIndex: 2, display: 'flex', gap: 2 }}>
        {unit.summoned && <SmallPill label="S" bg="#78716c" color="#e7e5e4" title="Summoning sickness" />}
        {unit.moved && <SmallPill label="✓" bg="#374151" color="#9ca3af" title="Already moved" />}
        {unit.skipNextAction && <SmallPill label="Stunned" bg="#44403c" color="#fbbf24" title="Stunned — cannot move or use action this turn" />}
      </div>

      {/* Hidden badge (own hidden unit) — top center above status */}
      {isOwnHidden && (
        <div style={{
          position: 'absolute',
          top: '1px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#6a3abf',
          color: '#fff',
          fontSize: '7px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          padding: '1px 4px',
          borderRadius: '99px',
          whiteSpace: 'nowrap',
          zIndex: 3,
        }}>H</div>
      )}

      {/* Aura/bonus badges */}
      <div className="flex gap-0.5 mt-0.5" style={{ position: 'absolute', zIndex: 2, bottom: '14px' }}>
        {(unit.atkBonus || 0) > 0 && <SmallPill label={`+${unit.atkBonus}A`} bg="#166534" color="#86efac" title="ATK bonus" />}
        {auraBuffed && <SmallPill label="Aura" bg="#134e4a" color="#5eead4" title="Receiving aura bonus" />}
        {auraDebuffed && <SmallPill label="Debuff" bg="#7f1d1d" color="#fca5a5" title="Enemy aura debuff" />}
        {(unit.speedBonus || 0) > 0 && <SmallPill label={`+${unit.speedBonus}S`} bg="#4c1d95" color="#c4b5fd" title="Speed bonus" />}
        {packBonus > 0 && <SmallPill label={`Pack+${packBonus}`} bg="#78350f" color="#fcd34d" title={`Pack Runt bonus: +${packBonus} ATK`} />}
        {unit.id === 'pip' && <SmallPill label="↑" bg="#78350f" color="#fcd34d" title="Growing each turn" />}
      </div>

      {/* ATK/HP pill centered bottom */}
      <div style={{
        position: 'absolute',
        bottom: '2px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.80)',
        color: '#fff',
        fontSize: '10px',
        fontFamily: 'var(--font-sans)',
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: '99px',
        zIndex: 2,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '1px',
      }}>
        {unit.shield > 0 && <span style={{ color: '#67e8f9', fontSize: '8px' }}>🛡</span>}
        {effectiveAtk}/{effectiveHp}
      </div>
    </div>
  );
}

function SmallPill({ label, bg, color, title }) {
  return (
    <span
      style={{
        background: bg,
        color: color,
        fontSize: '7px',
        padding: '1px 3px',
        borderRadius: '99px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        fontWeight: 600,
      }}
      title={title}
    >{label}</span>
  );
}
