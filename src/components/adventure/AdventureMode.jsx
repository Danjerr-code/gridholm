import { useState } from 'react';
import { createNewRun, loadRun, clearRun, moveToTile, completeTile } from '../../adventure/adventureState.js';
import DungeonMap from './DungeonMap.jsx';

const FACTION_INFO = {
  light:  { label: 'Light',  color: '#e8d8a0', bg: '#1a1600', border: '#C9A84C60', desc: 'Steadfast defenders and holy warriors.' },
  primal: { label: 'Primal', color: '#80e880', bg: '#0a1400', border: '#22C55E60', desc: 'Wild beasts and nature\'s fury.' },
  mystic: { label: 'Mystic', color: '#c0a0f0', bg: '#100a1a', border: '#A855F760', desc: 'Ancient elves and arcane power.' },
  dark:   { label: 'Dark',   color: '#f08080', bg: '#1a0a0a', border: '#EF444460', desc: 'Demons and shadowy corruption.' },
};

const TILE_LABELS = {
  fight:       'Fight',
  elite_fight: 'Elite Fight',
  shop:        'Shop',
  treasure:    'Treasure',
  rest:        'Rest Site',
  event:       'Mysterious Event',
  boss:        'The Boss',
  start:       'Starting Chamber',
};

export default function AdventureMode({ onBack }) {
  const savedRun = loadRun();
  const [phase, setPhase] = useState(savedRun ? 'map' : 'champion_select');
  const [run, setRun] = useState(savedRun);

  function handleStartNewRun(faction) {
    const newRun = createNewRun(faction);
    setRun(newRun);
    setPhase('map');
  }

  function handleContinue() {
    setPhase('map');
  }

  function handleAbandon() {
    clearRun();
    setRun(null);
    setPhase('champion_select');
  }

  function handleTileClick(row, col) {
    if (!run) return;
    const tile = run.dungeonLayout[row][col];
    const newRun = moveToTile(run, row, col);
    setRun(newRun);
    // Show tile event — for now just mark as visited
    // (fight integration comes in later prompts)
    setPhase(`tile_event:${row}:${col}`);
  }

  function handleTileEventContinue(row, col, reward) {
    if (!run) return;
    let newRun = reward
      ? { ...run }  // reward apply handled by applyReward
      : run;
    newRun = completeTile(newRun, row, col);
    setRun(newRun);
    setPhase('map');
  }

  if (phase === 'champion_select') {
    return (
      <ChampionSelect
        savedRun={savedRun}
        onSelect={handleStartNewRun}
        onContinue={handleContinue}
        onBack={onBack}
      />
    );
  }

  if (phase === 'map') {
    return (
      <MapScreen
        run={run}
        onTileClick={handleTileClick}
        onAbandon={handleAbandon}
        onBack={onBack}
      />
    );
  }

  // Tile event screen (placeholder — fight/shop/etc. to be wired in later prompts)
  if (phase.startsWith('tile_event:')) {
    const [, rowStr, colStr] = phase.split(':');
    const row = parseInt(rowStr, 10);
    const col = parseInt(colStr, 10);
    const tile = run.dungeonLayout[row]?.[col];
    const tileType = tile?.type ?? 'event';

    return (
      <TileEventScreen
        run={run}
        tileType={tileType}
        row={row}
        col={col}
        onContinue={() => handleTileEventContinue(row, col, null)}
        onAbandon={handleAbandon}
      />
    );
  }

  return null;
}

// ── Champion Selection ────────────────────────────────────────────────────────

function ChampionSelect({ savedRun, onSelect, onContinue, onBack }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      gap: '24px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '28px', color: '#C9A84C', letterSpacing: '0.15em', marginBottom: '4px' }}>
          ADVENTURE MODE
        </h1>
        <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#6a6a8a', fontSize: '14px' }}>
          Choose your champion faction
        </p>
      </div>

      {savedRun && (
        <div style={{
          background: '#0d1200',
          border: '1px solid #4a7a3060',
          borderRadius: '6px',
          padding: '12px 20px',
          textAlign: 'center',
          maxWidth: '360px',
          width: '100%',
        }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#80c860', letterSpacing: '0.08em', marginBottom: '6px' }}>
            ACTIVE RUN
          </div>
          <div style={{ fontSize: '12px', color: '#a0a0c0', marginBottom: '10px' }}>
            {FACTION_INFO[savedRun.championFaction]?.label} · Loop {savedRun.loopCount} · {savedRun.roomsCleared} rooms cleared
          </div>
          <button
            onClick={onContinue}
            style={{
              background: 'linear-gradient(135deg, #1a3010, #2a5020)',
              color: '#80e860',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              fontWeight: 600,
              border: '1px solid #4a8040',
              borderRadius: '4px',
              padding: '8px 24px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              width: '100%',
            }}
          >
            Continue Run
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        maxWidth: '400px',
        width: '100%',
      }}>
        {Object.entries(FACTION_INFO).map(([factionKey, info]) => (
          <button
            key={factionKey}
            onClick={() => onSelect(factionKey)}
            style={{
              background: info.bg,
              border: `1px solid ${info.border}`,
              borderRadius: '6px',
              padding: '16px 12px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'box-shadow 150ms ease, transform 150ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = `0 0 14px ${info.border}`;
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 600, color: info.color, letterSpacing: '0.08em', marginBottom: '6px' }}>
              {info.label}
            </div>
            <div style={{ fontSize: '11px', color: '#6a6a8a', lineHeight: 1.4 }}>
              {info.desc}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onBack}
        style={{
          background: 'transparent',
          color: '#4a4a6a',
          fontFamily: "'Cinzel', serif",
          fontSize: '12px',
          border: '1px solid #2a2a3a',
          borderRadius: '4px',
          padding: '8px 24px',
          cursor: 'pointer',
        }}
      >
        ← Back to Lobby
      </button>
    </div>
  );
}

// ── Map Screen ────────────────────────────────────────────────────────────────

function MapScreen({ run, onTileClick, onAbandon, onBack }) {
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const faction = FACTION_INFO[run.championFaction] ?? FACTION_INFO.light;
  const currentTileType = run.dungeonLayout[run.currentTile.row]?.[run.currentTile.col]?.type ?? 'start';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 16px',
      gap: '16px',
    }}>
      {/* Header */}
      <div style={{
        width: '100%',
        maxWidth: '500px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: '#C9A84C', letterSpacing: '0.12em' }}>
          ADVENTURE
        </div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#4a4a6a', letterSpacing: '0.1em' }}>
          {faction.label} · Loop {run.loopCount}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        width: '100%',
        maxWidth: '500px',
        display: 'flex',
        gap: '12px',
        background: '#0d0d18',
        border: '1px solid #2a2a3a',
        borderRadius: '6px',
        padding: '10px 14px',
      }}>
        {/* HP */}
        <StatPill
          label="HP"
          value={`${run.championHP}/${run.maxChampionHP}`}
          color={run.championHP / run.maxChampionHP < 0.4 ? '#f87171' : '#4ade80'}
        />
        {/* Gold */}
        <StatPill label="Gold" value={run.gold} color="#C9A84C" />
        {/* Potions */}
        <StatPill label="Potions" value={`${run.potions}/3`} color="#60a0ff" />
        {/* Rooms */}
        <StatPill label="Rooms" value={run.roomsCleared} color="#a0a0c0" />
        {/* Deck */}
        <StatPill label="Cards" value={run.deck.length} color="#c084fc" />
      </div>

      {/* Dungeon Map */}
      <DungeonMap
        state={run}
        onTileClick={onTileClick}
      />

      {/* Current tile info */}
      <div style={{
        fontFamily: "'Crimson Text', serif",
        fontStyle: 'italic',
        fontSize: '13px',
        color: '#6a6a8a',
      }}>
        You are at: <span style={{ color: '#a0a0c0' }}>{TILE_LABELS[currentTileType] ?? currentTileType}</span>
        {run.loopCount > 0 && (
          <span style={{ color: '#f87171', marginLeft: '8px' }}>· Loop scaling: +{run.loopCount}/+{run.loopCount} to all enemies</span>
        )}
      </div>

      {/* Abandon button */}
      {confirmAbandon ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#f87171' }}>Abandon run?</span>
          <button onClick={onAbandon} style={smallDangerBtn}>Yes, abandon</button>
          <button onClick={() => setConfirmAbandon(false)} style={smallCancelBtn}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirmAbandon(true)} style={smallCancelBtn}>
          Abandon Run
        </button>
      )}
    </div>
  );
}

// ── Tile Event (placeholder) ──────────────────────────────────────────────────

function TileEventScreen({ run, tileType, row, col, onContinue, onAbandon }) {
  const descriptions = {
    fight:       'A group of enemies blocks your path. Prepare for battle!',
    elite_fight: 'A powerful elite enemy awaits. This will be a tough fight.',
    shop:        'A travelling merchant offers their wares.',
    treasure:    'You discover a hidden cache of valuable items.',
    rest:        'A quiet campfire. You may rest and recover HP.',
    event:       'Something unusual catches your eye…',
    boss:        'The dungeon lord awaits at the center of the keep.',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      gap: '20px',
      color: '#f9fafb',
    }}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '22px',
        color: '#C9A84C',
        letterSpacing: '0.12em',
      }}>
        {TILE_LABELS[tileType] ?? tileType}
      </div>
      <div style={{
        fontFamily: "'Crimson Text', serif",
        fontStyle: 'italic',
        fontSize: '15px',
        color: '#a0a0c0',
        textAlign: 'center',
        maxWidth: '300px',
        lineHeight: 1.6,
      }}>
        {descriptions[tileType] ?? 'You enter the chamber.'}
      </div>
      <div style={{ fontSize: '12px', color: '#4a4a6a', fontFamily: "'Crimson Text', serif" }}>
        (Full encounter system coming in a later update)
      </div>
      <button
        onClick={onContinue}
        style={{
          background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
          color: '#0a0a0f',
          fontFamily: "'Cinzel', serif",
          fontSize: '13px',
          fontWeight: 600,
          border: 'none',
          borderRadius: '4px',
          padding: '12px 32px',
          cursor: 'pointer',
          letterSpacing: '0.06em',
        }}
      >
        Continue
      </button>
    </div>
  );
}

// ── Shared mini-styles ────────────────────────────────────────────────────────

function StatPill({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#4a4a6a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 600, color }}>
        {value}
      </div>
    </div>
  );
}

const smallCancelBtn = {
  background: 'transparent',
  color: '#4a4a6a',
  fontFamily: "'Cinzel', serif",
  fontSize: '11px',
  border: '1px solid #2a2a3a',
  borderRadius: '4px',
  padding: '6px 14px',
  cursor: 'pointer',
};

const smallDangerBtn = {
  background: 'transparent',
  color: '#f87171',
  fontFamily: "'Cinzel', serif",
  fontSize: '11px',
  border: '1px solid #f8717160',
  borderRadius: '4px',
  padding: '6px 14px',
  cursor: 'pointer',
};
