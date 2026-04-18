import { getCardImageUrl } from '../supabase.js';

/**
 * MatchReviewBoard — read-only 5x5 board renderer for match review.
 *
 * Props:
 *   gameState  {object}  — one entry from the stateHistory array
 */
export default function MatchReviewBoard({ gameState }) {
  if (!gameState) return null;

  const { units = [], champions = [], terrainGrid, players = [] } = gameState;

  const TERRAIN_TINTS = {
    hallowed:  { bg: 'rgba(255,245,210,0.13)', border: 'rgba(255,235,150,0.35)' },
    scorched:  { bg: 'rgba(220,80,20,0.18)',   border: 'rgba(220,100,20,0.45)' },
    enchanted: { bg: 'rgba(140,60,220,0.15)',  border: 'rgba(170,90,240,0.40)' },
    cursed:    { bg: 'rgba(60,0,30,0.25)',     border: 'rgba(120,0,40,0.45)' },
  };

  return (
    <div style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '2px',
        }}
      >
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => {
            const isThrone = row === 2 && col === 2;
            const unit = units.find(u => u.row === row && u.col === col) || null;
            const champion = champions.find(c => c.row === row && c.col === col) || null;
            const terrain = terrainGrid?.[row]?.[col] ?? null;
            const terrainTint = terrain ? TERRAIN_TINTS[terrain.id] : null;

            return (
              <div
                key={`${row},${col}`}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  background: isThrone ? '#1a100a' : '#12121e',
                  border: isThrone ? '1px solid #6b3a1a' : '1px solid #1e1e2e',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                {/* Terrain tint */}
                {terrainTint && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: terrainTint.bg,
                      boxShadow: `inset 0 0 0 1px ${terrainTint.border}`,
                      borderRadius: '4px',
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {/* Throne marker */}
                {isThrone && !unit && !champion && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(150,80,20,0.6)',
                      fontSize: '12px',
                      fontWeight: 700,
                      pointerEvents: 'none',
                    }}
                  >
                    ★
                  </div>
                )}

                {/* Champion token */}
                {champion && !unit && <ChampionToken champion={champion} />}

                {/* Unit token */}
                {unit && <UnitTokenReadOnly unit={unit} />}
              </div>
            );
          })
        )}
      </div>

      {/* Player info strip */}
      <PlayerInfoStrip players={players} label="P1" playerIdx={0} />
      <PlayerInfoStrip players={players} label="P2" playerIdx={1} />
    </div>
  );
}

function ChampionToken({ champion }) {
  const isP1 = champion.owner === 0;
  const champColor = isP1 ? '#185FA5' : '#993C1D';

  return (
    <div
      style={{
        position: 'absolute',
        inset: '3px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${champColor}66 0%, transparent 100%)`,
        border: `2px solid ${champColor}`,
        boxShadow: `0 0 8px ${champColor}60`,
      }}
    >
      <svg width="14" height="12" viewBox="0 0 24 20" fill="white" style={{ flexShrink: 0 }}>
        <path d="M2,18 L2,6 L8,14 L12,2 L16,14 L22,6 L22,18 Z"/>
      </svg>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: 1.2,
        }}
      >
        {champion.hp}
      </span>
    </div>
  );
}

function UnitTokenReadOnly({ unit }) {
  const isP1 = unit.owner === 0;
  const ownerColor = isP1
    ? { ring: '#3b82f6', glow: 'rgba(59,130,246,0.45)' }
    : { ring: '#ef4444', glow: 'rgba(239,68,68,0.45)' };

  const effectiveAtk = (unit.atk ?? 0) + (unit.atkBonus ?? 0) + (unit.turnAtkBonus ?? 0);
  const effectiveSpd = (unit.spd ?? 1) + (unit.speedBonus ?? 0);
  const imageUrl = unit.image ? getCardImageUrl(unit.image) : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: '2px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        background: '#1a1a2e',
        border: `2px solid ${ownerColor.ring}`,
        boxShadow: `0 0 6px ${ownerColor.glow}`,
        overflow: 'hidden',
      }}
      title={`${unit.name} — ATK:${effectiveAtk} HP:${unit.hp} SPD:${effectiveSpd}`}
    >
      {/* Portrait */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={unit.name}
          onError={(e) => { e.target.style.display = 'none'; }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
          }}
        />
      )}
      {/* ATK top-left */}
      <span
        style={{
          position: 'absolute',
          top: '1px',
          left: '3px',
          fontFamily: 'var(--font-sans)',
          fontSize: '8px',
          fontWeight: 700,
          color: '#f97316',
          lineHeight: 1,
          zIndex: 1,
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
        }}
      >
        {effectiveAtk}
      </span>
      {/* HP bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: '2px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.80)',
          color: '#4ade80',
          fontFamily: 'var(--font-sans)',
          fontSize: '10px',
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: '99px',
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
          zIndex: 2,
        }}
      >
        {effectiveAtk}/{unit.hp}
      </div>
      {/* SPD top-right */}
      <span
        style={{
          position: 'absolute',
          top: '1px',
          right: '3px',
          fontFamily: 'var(--font-sans)',
          fontSize: '8px',
          fontWeight: 700,
          color: '#a78bfa',
          lineHeight: 1,
          zIndex: 1,
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
        }}
      >
        {effectiveSpd}
      </span>
      {/* Hidden indicator */}
      {unit.hidden && (
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#6a3abf',
            color: '#fff',
            fontFamily: 'var(--font-sans)',
            fontSize: '7px',
            fontWeight: 600,
            padding: '1px 4px',
            borderRadius: '99px',
            whiteSpace: 'nowrap',
            zIndex: 3,
          }}
        >
          H
        </span>
      )}
    </div>
  );
}

function PlayerInfoStrip({ players, label, playerIdx }) {
  const player = players[playerIdx];
  if (!player) return null;

  const isP1 = playerIdx === 0;
  const labelColor = isP1 ? '#3b82f6' : '#ef4444';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '4px 6px',
        marginTop: '4px',
        background: '#0d0d1a',
        borderRadius: '4px',
        fontSize: '11px',
        fontFamily: 'var(--font-sans)',
        color: '#9ca3af',
      }}
    >
      <span style={{ color: labelColor, fontWeight: 700, minWidth: '20px' }}>{label}</span>
      <span title="Mana">💎 {player.resources ?? 0}</span>
      <span title="Hand size">✋ {player.hand?.length ?? 0}</span>
      <span title="Deck size">📚 {player.deck?.length ?? 0}</span>
    </div>
  );
}
