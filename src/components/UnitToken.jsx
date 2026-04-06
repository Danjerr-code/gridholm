import { getEffectiveAtk, getEffectiveHp, getEffectiveMaxHp, getEffectiveSpd, getPackBonus, isAuraBuffed, isAuraDebuffed } from '../engine/statUtils.js';
import { getCardImageUrl } from '../supabase.js';

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

export default function UnitToken({ unit, state, isSelected, isSpellTarget, isArcherTarget, isSacrificeTarget, myPlayerIndex, onClick }) {
  const isP1 = unit.owner === 0;
  const isLegendary = !!unit.legendary;
  const isMyUnit = myPlayerIndex !== undefined && unit.owner === myPlayerIndex;
  const isOpponentHidden = unit.hidden && !isMyUnit;
  const isOwnHidden = unit.hidden && isMyUnit;

  const factionColors = getFactionColors(unit.unitType);

  // Opponent's hidden unit: dark face-down token
  if (isOpponentHidden) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center rounded cursor-pointer select-none relative"
        style={{
          background: '#1a1a2e',
          border: '1px solid #3a2a5a60',
          borderRadius: '50%',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}
        onClick={onClick}
        title="Hidden Unit"
      >
        <div style={{
          position: 'absolute',
          top: '2px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#6a3abf',
          color: '#fff',
          fontSize: '8px',
          fontFamily: "'Cinzel', serif",
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
          fontWeight: 500,
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
  const effectiveHp = state ? getEffectiveHp(state, unit) : unit.hp;
  const effectiveMaxHp = state ? getEffectiveMaxHp(state, unit) : unit.maxHp;
  const effectiveSpd = getEffectiveSpd(unit);
  const packBonus = state ? getPackBonus(state, unit) : 0;

  // Ring style based on selection state
  let ringStyle = {};
  if (isSelected) {
    ringStyle = { outline: '2px solid #C9A84C', boxShadow: '0 0 8px #C9A84C60' };
  } else if (isSacrificeTarget) {
    ringStyle = { outline: '2px solid #d97706' };
  } else if (isSpellTarget) {
    ringStyle = { outline: '2px solid #f97316' };
  } else if (isArcherTarget) {
    ringStyle = { outline: '2px solid #ec4899' };
  } else if (isLegendary) {
    ringStyle = { outline: '2px solid #C9A84C80' };
  } else if (isOwnHidden) {
    ringStyle = { outline: '2px solid #a855f7', boxShadow: '0 0 6px rgba(168,85,247,0.4)' };
  }

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center rounded-full cursor-pointer select-none relative"
      style={{
        background: '#1a1a2e',
        border: `1px solid ${factionColors.border}4d`,
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        ...ringStyle,
      }}
      onClick={onClick}
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
            opacity: unit.hidden ? 0 : 1,
          }}
        />
      )}

      {/* Fallback letter when no art */}
      {!imageUrl && (
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '14px',
          fontWeight: 600,
          color: `${factionColors.text}99`,
          position: 'absolute',
          zIndex: 1,
        }}>{abbr}</span>
      )}

      {/* Status badges top center */}
      <div style={{ position: 'absolute', top: 1, left: '50%', transform: 'translateX(-50%)', zIndex: 2, display: 'flex', gap: 2 }}>
        {unit.summoned && <SmallPill label="S" bg="#78716c" color="#e7e5e4" title="Summoning sickness" />}
        {unit.moved && <SmallPill label="✓" bg="#374151" color="#9ca3af" title="Already moved" />}
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
          fontFamily: "'Cinzel', serif",
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

      {/* ATK badge bottom left */}
      <div style={{
        position: 'absolute',
        bottom: '2px',
        left: '2px',
        background: 'rgba(0,0,0,0.8)',
        color: factionColors.text,
        fontSize: '9px',
        fontFamily: "'Cinzel', serif",
        fontWeight: 600,
        padding: '1px 4px',
        borderRadius: '99px',
        zIndex: 2,
        lineHeight: 1.3,
      }}>{effectiveAtk}</div>

      {/* HP badge bottom right */}
      <div style={{
        position: 'absolute',
        bottom: '2px',
        right: '2px',
        background: 'rgba(0,0,0,0.8)',
        color: typeof effectiveHp === 'number' && effectiveHp <= effectiveMaxHp / 2 ? '#fca5a5' : '#fff',
        fontSize: '9px',
        fontFamily: "'Cinzel', serif",
        fontWeight: 600,
        padding: '1px 4px',
        borderRadius: '99px',
        zIndex: 2,
        lineHeight: 1.3,
      }}>{effectiveHp}</div>

      {/* Shield overlay */}
      {unit.shield > 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          color: '#67e8f9',
          fontSize: '9px',
          zIndex: 2,
        }}>🛡{unit.shield}</div>
      )}
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
