import { useRef } from 'react';
import { getEffectiveAtk, getEffectiveHp, getEffectiveMaxHp, getEffectiveSpd, getPackBonus, isAuraBuffed, isAuraDebuffed } from '../engine/statUtils.js';
import { getCommandLimit, cardinalNeighbors } from '../engine/gameEngine.js';
import { getCardImageUrl } from '../supabase.js';
import useLongPress from '../hooks/useLongPress.js';
import { rulesTitle } from '../utils/rulesText.jsx';

const FACTION_COLORS = {
  Human:  { border: '#2a4a7a', text: '#4a8abf' },
  Beast:  { border: '#2a4a2a', text: '#4a8a4a' },
  Elf:    { border: '#3a2a5a', text: '#8a4abf' },
  Demon:  { border: '#4a1a1a', text: '#bf2a2a' },
};

const UNIT_TYPE_ABBR = { Human: 'H', Beast: 'B', Elf: 'E', Demon: 'D', Angel: 'A', Penguin: 'P', Spirit: 'Sp', Plant: 'Pl', Wolf: 'W', Soldier: 'So', Knight: 'Kn', Cleric: 'Cl', Paladin: 'Pa', Horror: 'Ho', Shadow: 'Sh', Wraith: 'Wr', Snake: 'Sn' };

function getFactionColors(unitType) {
  const primary = Array.isArray(unitType) ? unitType[0] : unitType;
  return FACTION_COLORS[primary] || { border: '#2a2a3a', text: '#6a6a8a' };
}

/**
 * Resolve animation class and inline style for the token wrapper.
 * animState: { type: 'summon'|'move'|'lunge'|'damage'|'death'|'heal'|'buff'|'hidden_summon'|'reveal', ... }
 */
function resolveAnimProps(animState) {
  if (!animState) return { cls: '', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
  switch (animState.type) {
    case 'summon':
      return { cls: 'unit-summon-anim', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
    case 'relic_summon':
      return { cls: 'unit-relic-summon-anim', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
    case 'omen_summon':
      return { cls: 'unit-omen-summon-anim', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
    case 'omen_tick':
      return { cls: 'omen-tick-anim', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: true };
    case 'omen_death':
      return { cls: 'unit-omen-death-anim', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
    case 'hidden_summon':
      return { cls: 'unit-hidden-summon-anim', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
    case 'reveal':
      return { cls: 'unit-reveal-anim', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
    case 'move': {
      // Offset from old tile to current tile, expressed in cell-width units (~104% per tile)
      // fromCol/fromRow are the previous position; current position comes from the unit prop
      const dx = (animState.fromCol ?? 0) - (animState.currentCol ?? 0);
      const dy = (animState.fromRow ?? 0) - (animState.currentRow ?? 0);
      return {
        cls: 'unit-move-anim',
        style: { '--move-from-x': `${dx * 104}%`, '--move-from-y': `${dy * 104}%` },
        showFlash: false, showHeal: false, showBuff: false, showOmenTick: false,
      };
    }
    case 'lunge': {
      // lunge 30% toward target (dx/dy are ±1 or 0 unit direction)
      return {
        cls: 'unit-lunge-anim',
        style: { '--lunge-x': `${(animState.dx ?? 0) * 30}%`, '--lunge-y': `${(animState.dy ?? 0) * 30}%` },
        showFlash: false, showHeal: false, showBuff: false, showOmenTick: false,
      };
    }
    case 'damage':
      return {
        cls: animState.heavy ? 'unit-damage-heavy-anim' : 'unit-damage-anim',
        style: {},
        showFlash: true, showHeal: false, showBuff: false, showOmenTick: false,
      };
    case 'death':
      return { cls: 'unit-death-anim', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
    case 'heal':
      return { cls: '', style: {}, showFlash: false, showHeal: true, showBuff: false, showOmenTick: false };
    case 'buff':
      return { cls: '', style: {}, showFlash: false, showHeal: false, showBuff: true, showOmenTick: false };
    default:
      return { cls: '', style: {}, showFlash: false, showHeal: false, showBuff: false, showOmenTick: false };
  }
}

export default function UnitToken({ unit, state, isSelected, isSpellTarget, isArcherTarget, isSacrificeTarget, isSacrificeSelected, isAbilityTarget, isVeilseerTarget, myPlayerIndex, onClick, isMobile, onLongPress, onLongPressDismiss, onDragStart, onDragMove, onDragEnd, animState }) {
  const isP1 = unit.owner === 0;
  const isLegendary = !!unit.legendary;
  const isRelic = !!unit.isRelic;
  const isOmen = !!unit.isOmen;
  const isMyUnit = myPlayerIndex !== undefined && unit.owner === myPlayerIndex;
  const isOpponentHidden = unit.hidden && !isMyUnit;
  const isOwnHidden = unit.hidden && isMyUnit;

  // Status effect flags
  const isStunned = !!unit.skipNextAction;
  const isRooted = !!unit.rooted;
  const hasShield = (unit.shield ?? 0) > 0;
  const isSpellImmune = !!unit.spellImmune;
  const hasGlitteringGift = !!unit.glitteringGift;
  const poisonStacks = unit.poison ?? 0;

  // Fortitude glow: unit is a friendly combat unit owned by a light/ascended player (Valorian)
  // and is within 2 manhattan tiles of their champion.
  const hasFortitudeGlow = !!(
    state &&
    !unit.isRelic &&
    !unit.isOmen &&
    !unit.hidden &&
    state.champions?.[unit.owner]?.attribute === 'light' &&
    state.players?.[unit.owner]?.resonance?.tier === 'ascended' &&
    (() => {
      const champ = state.champions[unit.owner];
      return Math.abs(champ.row - unit.row) + Math.abs(champ.col - unit.col) <= 2;
    })()
  );
  const tokenBorderRadius = isRelic ? '4px' : '50%';

  const factionColors = getFactionColors(unit.unitType);

  // Player 1 is always blue, Player 2 is always red — color follows owner, not viewer
  const ownerRingColor = unit.owner === 0
    ? { ring: '#3b82f6', glow: 'rgba(59,130,246,0.55)' }
    : { ring: '#ef4444', glow: 'rgba(239,68,68,0.55)' };

  // Animation props — computed once, applied to each return path
  const { cls: animCls, style: animStyle, showFlash, showHeal, showBuff, showOmenTick } = resolveAnimProps(animState);
  const animWrapClass = `w-full h-full relative${animCls ? ` ${animCls}` : ''}`;

  // Heal particles: 4 small circles that float upward with staggered delay
  const healOverlay = showHeal ? (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12, overflow: 'visible' }}>
      {[18, 35, 52, 70].map((left, i) => (
        <div key={i} className="heal-particle" style={{ left: `${left}%`, bottom: '25%', animationDelay: `${i * 75}ms` }} />
      ))}
    </div>
  ) : null;

  // Opponent's hidden unit: face-down token with hidden-art image
  if (isOpponentHidden) {
    const hiddenArtUrl = getCardImageUrl('hidden-art.webp');
    return (
      <div className={animWrapClass} style={animStyle}>
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
        {showFlash && <div className="unit-damage-flash-overlay" />}
        {showBuff && <div className="unit-buff-shimmer-overlay" />}
      </div>
      {healOverlay}
      </div>
    );
  }

  const auraBuffed = state && isAuraBuffed(state, unit);
  const auraDebuffed = state && isAuraDebuffed(state, unit);

  const abbr = (Array.isArray(unit.unitType) ? UNIT_TYPE_ABBR[unit.unitType[0]] : UNIT_TYPE_ABBR[unit.unitType]) || unit.name[0];
  const imageUrl = !isOpponentHidden ? getCardImageUrl(unit.image) : null;
  const effectiveAtk = state ? getEffectiveAtk(state, unit) : unit.atk + (unit.atkBonus || 0);
  // Own hidden units: use raw values — getEffectiveHp/getEffectiveMaxHp return '?' for all hidden units
  // to hide stats from opponents, but the controller should always see their own unit's real stats.
  const effectiveHp = isOwnHidden ? unit.hp : (state ? getEffectiveHp(state, unit) : unit.hp);
  const effectiveMaxHp = isOwnHidden ? unit.maxHp : (state ? getEffectiveMaxHp(state, unit) : unit.maxHp);
  const effectiveSpd = getEffectiveSpd(unit, state);
  const packBonus = state ? getPackBonus(state, unit) : 0;

  const teamRingShadow = `0 0 0 2px ${ownerRingColor.ring}, 0 0 10px ${ownerRingColor.glow}`;
  const dropShadow = '0 8px 16px rgba(0,0,0,0.8)';
  const metallicInset = 'inset 2px 3px 5px rgba(255,255,255,0.2), inset -2px -3px 5px rgba(0,0,0,0.75)';

  // Action glow: friendly, not sick, not stunned, not moved, commands remaining, local player's turn
  // Only glow if unit has SPD > 0 (can move/fight) or has a usable Action ability.
  // SPD 0 units with no Action (e.g. Seedling) have nothing to do on the board.
  const commandsUsed = state?.players?.[myPlayerIndex]?.commandsUsed ?? 0;
  const commandLimit = getCommandLimit(state, myPlayerIndex);
  const isMyTurn = state?.activePlayer === myPlayerIndex;
  const showActionGlow = (
    isMyUnit &&
    isMyTurn &&
    !unit.summoned &&
    !unit.skipNextAction &&
    !unit.moved &&
    commandsUsed < commandLimit &&
    (effectiveSpd > 0 || !!unit.action)
  );

  // Action pill: show on any unit/relic with an Action ability.
  // Orange when the action is currently usable; grey otherwise (including all opponent units).
  const hasAction = !!unit.action;
  const bloodAltarHasTarget = unit.id !== 'bloodaltar' || (() => {
    if (!state) return false;
    const adj = cardinalNeighbors(unit.row, unit.col);
    return state.units.some(u =>
      u.owner === unit.owner &&
      u.uid !== unit.uid &&
      !u.isRelic &&
      !u.isOmen &&
      adj.some(([r, c]) => u.row === r && u.col === c)
    );
  })();
  const actionAvailable = isMyUnit && isMyTurn && !unit.summoned && !unit.skipNextAction && !unit.moved && commandsUsed < commandLimit && bloodAltarHasTarget;

  // Long-press inspect on mobile
  const longPress = useLongPress(() => {
    if (onLongPress) onLongPress();
  });

  // Drag tracking (pointer events, works for both mouse and touch)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, pointerId: null });
  const dragJustEndedRef = useRef(false);
  const hasDrag = showActionGlow && !!onDragStart;

  const handlePointerDown = (e) => {
    if (isMobile && onLongPress) longPress.onPointerDown();
    if (hasDrag) {
      dragRef.current = { active: false, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!hasDrag || dragRef.current.pointerId === null) return;
    if (!dragRef.current.active) {
      const dx = Math.abs(e.clientX - dragRef.current.startX);
      const dy = Math.abs(e.clientY - dragRef.current.startY);
      if (dx > 6 || dy > 6) {
        dragRef.current.active = true;
        longPress.onPointerCancel();
        onDragStart(unit);
      }
    }
    if (dragRef.current.active && onDragMove) {
      onDragMove(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e) => {
    const wasDragging = dragRef.current.active;
    dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
    if (isMobile && onLongPress) {
      const fired = longPress.firedRef.current;
      longPress.onPointerUp();
      if (fired && onLongPressDismiss) onLongPressDismiss();
    }
    if (wasDragging) {
      dragJustEndedRef.current = true;
      if (onDragEnd) onDragEnd(e.clientX, e.clientY);
    }
  };

  const handlePointerCancel = () => {
    const wasDragging = dragRef.current.active;
    dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
    if (isMobile && onLongPress) longPress.onPointerCancel();
    if (wasDragging && onDragEnd) onDragEnd(null, null);
  };

  const handleClick = (e) => {
    if (longPress.firedRef.current) {
      longPress.firedRef.current = false;
      return;
    }
    if (dragJustEndedRef.current) {
      dragJustEndedRef.current = false;
      return;
    }
    if (onClick) onClick(e);
  };

  // Ring style based on selection state
  let ringStyle = {};
  if (isSelected) {
    ringStyle = { outline: '2px solid #C9A84C', boxShadow: `0 0 8px #C9A84C60, ${teamRingShadow}` };
  } else if (isSacrificeSelected) {
    ringStyle = { outline: '2px solid #ef4444', boxShadow: '0 0 10px #ef444480' };
  } else if (isSacrificeTarget) {
    ringStyle = { outline: '2px solid #d97706' };
  } else if (isVeilseerTarget) {
    ringStyle = { outline: '2px solid #06b6d4', boxShadow: '0 0 8px #06b6d480' };
  } else if (isSpellTarget || isAbilityTarget) {
    ringStyle = { outline: '2px solid #f97316' };
  } else if (isArcherTarget) {
    ringStyle = { outline: '2px solid #ec4899' };
  } else if (isOwnHidden) {
    ringStyle = { outline: '2px solid #a855f7', boxShadow: `0 0 6px rgba(168,85,247,0.4), ${teamRingShadow}` };
  }

  // Omen: glowing rune circle with turns remaining countdown
  // Exception: Dread Mirror hidden and owned by current player should show friendly-hidden styling,
  // not its omen appearance — fall through to the regular render path which handles isOwnHidden.
  if (isOmen && !(unit.id === 'dreadmirror' && isOwnHidden)) {
    // Temporal Rift command counter: show bonus command availability (1 = available, 0 = spent)
    const isTemporalRift = unit.id === 'temporalrift';
    const ownerCmdsUsed = state?.players?.[unit.owner]?.commandsUsed ?? 0;
    const ownerCmdLimit = getCommandLimit(state, unit.owner);
    const bonusCmdAvail = ownerCmdsUsed < ownerCmdLimit;

    const omenGlowColor = unit.attribute === 'dark'
      ? { ring: '#a855f7', glow: 'rgba(168,85,247,0.6)', bg: '#1a0a2e', badge: '#6d28d9' }
      : unit.attribute === 'mystic'
      ? { ring: '#22d3ee', glow: 'rgba(34,211,238,0.6)', bg: '#0a1e2e', badge: '#0e7490' }
      : { ring: '#fbbf24', glow: 'rgba(251,191,36,0.6)', bg: '#1e1a0a', badge: '#b45309' };
    return (
      <div className={animWrapClass} style={animStyle}>
      <div
        className="w-full h-full flex flex-col items-center justify-center cursor-pointer select-none relative"
        style={{
          background: omenGlowColor.bg,
          border: `2px dashed ${omenGlowColor.ring}cc`,
          borderRadius: '50%',
          boxShadow: `inset 0 0 8px ${omenGlowColor.glow}, 0 0 0 2px ${ownerRingColor.ring}88, 0 0 12px ${omenGlowColor.glow}`,
          overflow: 'hidden',
          ...ringStyle,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        title={`${unit.name} [Omen] | ${unit.turnsRemaining} turn(s) remaining — ${rulesTitle(unit.rules)}`}
      >
        {/* Card art */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt={unit.name}
            draggable={false}
            onError={(e) => { e.target.style.display = 'none'; }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%',
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: 0.75,
              WebkitTouchCallout: 'none',
              userSelect: 'none',
            }}
          />
        )}
        {/* Rune symbol (only shown when no card art) */}
        {!imageUrl && <span style={{
          fontSize: '14px',
          lineHeight: 1,
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -60%)',
          zIndex: 1,
          opacity: 0.7,
        }}>✦</span>}
        {/* Turns remaining counter — prominent */}
        <div className={showOmenTick ? 'omen-number-tick-anim' : ''} style={{
          position: 'absolute',
          bottom: '3px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: omenGlowColor.badge,
          color: '#fff',
          fontSize: '11px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: '99px',
          whiteSpace: 'nowrap',
          zIndex: 2,
          lineHeight: 1.4,
        }}>{unit.turnsRemaining}</div>
        {/* OMEN label */}
        <div style={{
          position: 'absolute',
          top: '3px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: omenGlowColor.badge,
          color: '#fff',
          fontSize: '6px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          padding: '1px 4px',
          borderRadius: '99px',
          whiteSpace: 'nowrap',
          zIndex: 2,
          letterSpacing: '0.05em',
        }}>OMEN</div>
        {/* Temporal Rift: bonus command counter — 1 = available, 0 = spent */}
        {isTemporalRift && state && (
          <div style={{
            position: 'absolute',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: bonusCmdAvail ? '#0e7490' : '#374151',
            color: bonusCmdAvail ? '#67e8f9' : '#6b7280',
            fontSize: '8px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: '99px',
            whiteSpace: 'nowrap',
            zIndex: 3,
            lineHeight: 1.4,
          }} title={bonusCmdAvail ? 'Bonus command available' : 'Bonus command spent'}>⌘{bonusCmdAvail ? 1 : 0}</div>
        )}
        {showFlash && <div className="unit-damage-flash-overlay" />}
        {showBuff && <div className="unit-buff-shimmer-overlay" />}
      </div>
      {healOverlay}
      </div>
    );
  }

  return (
    <div className={animWrapClass} style={animStyle}>
    <div
      className={`w-full h-full flex flex-col items-center justify-center cursor-pointer select-none relative unit-token-ring unit-ring${!isRelic ? ' rounded-full' : ''}${!isRelic && showActionGlow ? ' unit-action-glow' : ''}`}
      draggable={false}
      onDragStart={e => e.preventDefault()}
      style={{
        background: isRelic ? '#1a1a2e' : '#1e2d45',
        border: isRelic
          ? `2px solid ${factionColors.border}bb`
          : `5px solid ${factionColors.border}bb`,
        borderRadius: isRelic ? '4px' : undefined,
        ...(!isRelic && showActionGlow ? {
          '--team-ring': ownerRingColor.ring,
          '--team-glow': ownerRingColor.glow,
        } : (!isRelic ? {
          boxShadow: `${metallicInset}, ${teamRingShadow}, ${dropShadow}`,
        } : {
          boxShadow: `${metallicInset}, 0 0 0 2px ${ownerRingColor.ring}99, 0 0 8px ${ownerRingColor.glow}88, ${dropShadow}`,
        })),
        ...ringStyle,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      title={isRelic
        ? `${unit.name} [Relic] | HP:${effectiveHp}/${effectiveMaxHp} — ${rulesTitle(unit.rules)}`
        : `${unit.name} | ATK:${effectiveAtk} HP:${effectiveHp}/${effectiveMaxHp} SPD:${effectiveSpd}${unit.hidden ? ' [Hidden]' : ''}`}
    >
      {/* Card art fills token — container provides recessed cavity vignette */}
      {imageUrl && (
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 14px rgba(0,0,0,0.65)',
          zIndex: 0,
        }}>
          <img
            src={imageUrl}
            alt={unit.name}
            draggable={false}
            onError={(e) => { e.target.style.display = 'none'; }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              opacity: isOwnHidden ? 0.5 : 1,
              WebkitTouchCallout: 'none',
              userSelect: 'none',
            }}
          />
        </div>
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

      {/* Rooted: static green vine tendrils at bottom edge */}
      {isRooted && (
        <svg aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '40%', pointerEvents: 'none', zIndex: 1, overflow: 'visible' }} viewBox="0 0 40 16" preserveAspectRatio="xMidYMax meet">
          <path d="M4 16 Q7 10 11 12 Q14 14 16 9" stroke="#1a4a1a" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M19 16 Q22 8 26 11 Q29 13 31 7" stroke="#2d5a2d" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
          <path d="M34 16 Q36 11 39 13" stroke="#1a4a1a" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          <circle cx="11" cy="12" r="1.2" fill="#2d6a2d" opacity="0.9"/>
          <circle cx="26" cy="11" r="1.2" fill="#2d6a2d" opacity="0.9"/>
          <circle cx="16" cy="9" r="0.9" fill="#1a5a1a" opacity="0.8"/>
        </svg>
      )}

      {/* Status badges top center */}
      <div style={{ position: 'absolute', top: 1, left: '50%', transform: 'translateX(-50%)', zIndex: 2, display: 'flex', gap: 2 }}>
        {unit.summoned && <SmallPill label="S" bg="#78716c" color="#e7e5e4" title="Summoning sickness" />}
        {unit.moved && !unit.dormant && <SmallPill label="✓" bg="#374151" color="#9ca3af" title="Already moved" />}
        {unit.skipNextAction && <SmallPill label="Stunned" bg="#44403c" color="#fbbf24" title="Stunned — cannot move or use Action abilities this turn" />}
        {unit.rooted && <SmallPill label="Rooted" bg="#1e3a1e" color="#86efac" title="Rooted — cannot move this turn, can still use Action abilities and fight" />}
        {unit.dormant && <SmallPill label={`💤${unit.dormantCounter ?? 1}`} bg="#1e1b4b" color="#a5b4fc" title={`Dormant — awakens in ${unit.dormantCounter ?? 1} turn(s)`} />}
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

      {/* Relic badge */}
      {isRelic && (
        <div style={{
          position: 'absolute',
          top: '2px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#5b21b6',
          color: '#e9d5ff',
          fontSize: '7px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          padding: '1px 4px',
          borderRadius: '99px',
          whiteSpace: 'nowrap',
          zIndex: 3,
          letterSpacing: '0.05em',
        }}>◆ RELIC</div>
      )}

      {/* Gilded Cage trapped unit name */}
      {isRelic && unit.id === 'gildedcage_relic' && unit.trappedUnit && (
        <div style={{
          position: 'absolute',
          bottom: '18px',
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#fcd34d',
          fontSize: '7px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '90%',
          zIndex: 3,
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
          letterSpacing: '0.02em',
        }}>{unit.trappedUnit.name.length > 10 ? unit.trappedUnit.name.slice(0, 9) + '…' : unit.trappedUnit.name}</div>
      )}

      {/* Action pill — shown on units/relics with an Action ability */}
      {hasAction && (
        <div style={{
          position: 'absolute',
          bottom: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: actionAvailable ? '#f97316' : '#374151',
          color: actionAvailable ? '#fed7aa' : '#9ca3af',
          fontSize: '7px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          padding: '1px 3px',
          borderRadius: '99px',
          whiteSpace: 'nowrap',
          zIndex: 3,
          opacity: 0.85,
        }} title={actionAvailable ? 'Action available' : 'Action used or unavailable'}>Action</div>
      )}

      {/* Poison counter — top right, shown when unit has poison stacks */}
      {poisonStacks > 0 && (
        <div style={{
          position: 'absolute',
          top: '2px',
          right: '2px',
          background: '#14532d',
          color: '#4ADE80',
          fontSize: '8px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          padding: '1px 3px',
          borderRadius: '99px',
          whiteSpace: 'nowrap',
          zIndex: 4,
          lineHeight: 1.2,
        }} title={`Poisoned: takes ${poisonStacks} damage at end of owner's turn`}>
          ☠{poisonStacks}
        </div>
      )}

      {/* HP pill (relics) or ATK/HP pill (units) — centered bottom */}
      <div className={showBuff ? 'stat-pulse-anim' : ''} style={{
        position: 'absolute',
        bottom: '2px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(20,20,30,0.85)',
        border: '1px solid rgba(201,168,76,0.3)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.8)',
        color: '#fff',
        fontSize: '10px',
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
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
        {isRelic ? `♥${effectiveHp}` : `${effectiveAtk}/${effectiveHp}`}
      </div>
      {/* Damage flash overlay */}
      {showFlash && <div className="unit-damage-flash-overlay" />}
      {/* Buff shimmer overlay */}
      {showBuff && <div className="unit-buff-shimmer-overlay" />}
    </div>
    {/* Status effect border glows — outside inner token to escape overflow:hidden */}
    {isStunned && <div className="status-overlay-stunned" style={{ borderRadius: tokenBorderRadius }} />}
    {(hasShield || hasFortitudeGlow) && <div className="status-overlay-shield" style={{ borderRadius: tokenBorderRadius }} />}
    {isSpellImmune && <div className="status-overlay-spellimmune" style={{ borderRadius: tokenBorderRadius }} />}
    {hasGlitteringGift && <div className="status-overlay-glittering-gift" />}
    {/* Legendary CSS ring — outside inner token to escape overflow:hidden */}
    {isLegendary && !isRelic && (
      <>
        <div className="legendary-token-ring" />
        <div className="legendary-token-shimmer" />
        <div className="legendary-token-shimmer-2" />
      </>
    )}
    {healOverlay}
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
