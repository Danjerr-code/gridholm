import { useState, useCallback } from 'react';
import {
  createNewRun, loadRun, clearRun, saveRun,
  moveToTile, completeTile, applyReward,
  FACTION_CURATED_CARDS,
} from '../../adventure/adventureState.js';
import AdventureDraftScreen from './AdventureDraftScreen.jsx';
import { buildAdventureGameState } from '../../adventure/adventureFight.js';
import {
  generateFightReward, generateTreasure, generateShopOfferings,
} from '../../adventure/encounterRewards.js';
import { makeEventRng, getRandomEvent } from '../../adventure/eventDefinitions.js';
import DungeonMap from './DungeonMap.jsx';
import RewardScreen from './RewardScreen.jsx';
import EventScreen from './EventScreen.jsx';
import RunSummary from './RunSummary.jsx';
import App from '../../App.jsx';
import { supabase, getGuestId, getCardImageUrl } from '../../supabase.js';
import { CHAMPIONS } from '../../engine/champions.js';

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

const FIGHT_TILE_TYPES = new Set(['fight', 'elite_fight', 'boss']);

export default function AdventureMode({ onBack }) {
  const savedRun = loadRun();
  const [phase, setPhase] = useState(savedRun ? 'map' : 'champion_select');
  const [run, setRun] = useState(savedRun);
  // Holds the selected faction between champion_select and draft phases
  const [pendingFaction, setPendingFaction] = useState(null);

  // ── Fight state ──────────────────────────────────────────────────────────
  // adventureContext: { initialState, aiDepth, row, col, tileType } | null
  const [fightCtx, setFightCtx] = useState(null);

  // ── Reward state ─────────────────────────────────────────────────────────
  // Generated reward data for current reward screen
  const [fightReward, setFightReward]     = useState(null);  // fight reward offer
  const [tileReward, setTileReward]       = useState(null);  // treasure/rest/shop reward
  const [shopOfferings, setShopOfferings] = useState(null);  // shop items
  const [tileEvent, setTileEvent]         = useState(null);  // { event, rng, row, col }

  function saveAdventureRunResult(completedRun) {
    if (!completedRun) return;
    const guestId = getGuestId();
    supabase.from('match_replays').insert({
      game_mode: 'adventure_run',
      p1_faction: completedRun.championFaction ?? null,
      p2_faction: null,
      p1_deck: completedRun.deck ?? [],
      p2_deck: [],
      winner: null,
      total_turns: completedRun.roomsCleared ?? 0,
      state_history: [],
      final_state: {
        loopCount: completedRun.loopCount ?? 0,
        roomsCleared: completedRun.roomsCleared ?? 0,
        bossDefeated: completedRun.bossDefeated ?? false,
        blessings: completedRun.blessings ?? [],
        curses: completedRun.curses ?? [],
        deck: completedRun.deck ?? [],
        gold: completedRun.gold ?? 0,
        guestId,
      },
    }).then(({ error }) => {
      if (error) console.warn('[Adventure] Replay insert failed:', error.message);
    });
  }

  function handleStartNewRun(faction) {
    // Store faction and go to the draft phase; run is created after draft completes
    setPendingFaction(faction);
    setPhase('draft');
  }

  function handleDraftComplete(draftedIds) {
    // Combine 12 curated cards + 8 drafted cards into the 20-card starting deck
    const curated = FACTION_CURATED_CARDS[pendingFaction] ?? FACTION_CURATED_CARDS.light;
    const startingDeck = [...curated, ...draftedIds];
    const newRun = createNewRun(pendingFaction, startingDeck);
    setPendingFaction(null);
    setRun(newRun);
    setPhase('map');
  }

  function handleContinue() {
    setPhase('map');
  }

  function handleAbandon() {
    clearRun();
    setRun(null);
    setFightCtx(null);
    setPendingFaction(null);
    setPhase('champion_select');
  }

  function handleTileClick(row, col) {
    if (!run) return;
    const tile = run.dungeonLayout[row][col];
    if (!tile || tile.type === 'wall' || tile.type === 'start') return;

    // Plagued curse: subtract 1 HP on each move
    let newRun = run;
    if (run.curses && run.curses.includes('plagued')) {
      const newHP = run.championHP - 1;
      if (newHP <= 0) {
        // Player dies from Plagued — end run immediately
        const dyingRun = { ...run, championHP: 0 };
        clearRun();
        saveAdventureRunResult(dyingRun);
        setRun(dyingRun);
        setPhase('run_summary');
        return;
      }
      newRun = saveRun({ ...run, championHP: newHP });
    }

    newRun = moveToTile(newRun, row, col);
    setRun(newRun);

    const tileType = tile.type;
    if (FIGHT_TILE_TYPES.has(tileType) && !tile.completed) {
      // Build adventure fight context
      const { initialState, aiDepth } = buildAdventureGameState(newRun, row, col, tileType);
      setFightCtx({ initialState, aiDepth, row, col, tileType });
      setPhase('fight');
    } else if (tile.completed) {
      // Already completed — just move, no event
    } else if (tileType === 'rest') {
      // Rest: calculate heal immediately so it can be shown, apply on confirm
      const healAmt = Math.max(5, Math.ceil(newRun.maxChampionHP * 0.25));
      setTileReward({ healAmount: healAmt });
      setPhase(`rest:${row}:${col}`);
    } else if (tileType === 'treasure') {
      const treasure = generateTreasure(newRun);
      setTileReward(treasure);
      setPhase(`treasure:${row}:${col}`);
    } else if (tileType === 'shop') {
      const offerings = generateShopOfferings(newRun);
      setShopOfferings(offerings);
      setPhase(`shop:${row}:${col}`);
    } else {
      // Mysterious event
      const rng = makeEventRng(newRun.seed, row, col);
      const event = getRandomEvent(rng);
      setTileEvent({ event, rng, row, col });
      setPhase(`tile_event:${row}:${col}`);
    }
  }

  // ── Fight result handling ────────────────────────────────────────────────

  const handleFightEnd = useCallback((didWin, finalGameState) => {
    if (!run || !fightCtx) return;

    if (didWin) {
      // Carry over remaining champion HP from the fight
      const remainingHP = finalGameState?.champions?.[0]?.hp ?? run.championHP;
      let hp = Math.max(1, remainingHP);
      // Resilience: restore 2 HP after every fight victory
      if (run.blessings?.includes('resilience')) {
        hp = Math.min(run.maxChampionHP, hp + 2);
      }
      let newRun = { ...run, championHP: hp };
      // Mark tile as completed, increment roomsCleared
      newRun = completeTile(newRun, fightCtx.row, fightCtx.col, { result: 'win' });
      setRun(newRun);
      // Generate fight reward
      const reward = generateFightReward(newRun, fightCtx.tileType);
      setFightReward(reward);
      setFightCtx(null);
      setPhase(`fight_reward:${fightCtx.row}:${fightCtx.col}`);
    } else {
      // Player lost — end the adventure run
      clearRun();
      saveAdventureRunResult(run);
      setFightCtx(null);
      setPhase('run_summary');
    }
  }, [run, fightCtx]);

  const handleFightQuit = useCallback(() => {
    // Player abandoned the fight — return to map (run continues, tile not completed)
    setFightCtx(null);
    setPhase('map');
  }, []);

  function handleEventDone(rewards, extras) {
    if (!tileEvent) return;
    let newRun = run;
    for (const r of rewards) {
      newRun = applyReward(newRun, r);
    }
    if (extras?.revealAll) {
      const allTiles = [];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) allTiles.push({ row: r, col: c });
      }
      newRun = saveRun({ ...newRun, revealedTiles: allTiles });
    }
    newRun = completeTile(newRun, tileEvent.row, tileEvent.col);
    setRun(newRun);
    setTileEvent(null);
    setPhase('map');
  }

  function handleRunSummaryDone() {
    setRun(null);
    setPhase('champion_select');
  }

  /**
   * Apply an array of { type, value } rewards to the current run state,
   * complete the tile at (row, col) if provided, then return to map.
   */
  function handleRewardsDone(rewards, row, col) {
    let newRun = run;
    for (const reward of rewards) {
      newRun = applyReward(newRun, reward);
    }
    if (row !== undefined && col !== undefined) {
      newRun = completeTile(newRun, row, col);
    }
    setRun(newRun);
    setFightReward(null);
    setTileReward(null);
    setShopOfferings(null);
    setPhase('map');
  }

  /**
   * Use a health potion during the map phase.
   */
  function handleUsePotion() {
    if (!run || run.potions <= 0) return;
    const newHP = Math.min(run.maxChampionHP, run.championHP + 5);
    const newRun = { ...run, championHP: newHP, potions: run.potions - 1 };
    setRun(newRun);
    // Persist immediately
    saveRun(newRun);
  }

  // ── Phase rendering ───────────────────────────────────────────────────────

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

  if (phase === 'draft' && pendingFaction) {
    return (
      <AdventureDraftScreen
        faction={pendingFaction}
        onDraftComplete={handleDraftComplete}
        onBack={() => {
          setPendingFaction(null);
          setPhase('champion_select');
        }}
      />
    );
  }

  if (phase === 'map') {
    return (
      <MapScreen
        run={run}
        onTileClick={handleTileClick}
        onUsePotion={handleUsePotion}
        onAbandon={handleAbandon}
        onBack={onBack}
      />
    );
  }

  if (phase === 'fight' && fightCtx) {
    return (
      <App
        adventureContext={fightCtx}
        onBackToLobby={handleFightQuit}
        onGameEnd={handleFightEnd}
      />
    );
  }

  // Fight reward screen
  if (phase.startsWith('fight_reward:') && fightReward) {
    const [, rowStr, colStr] = phase.split(':');
    const row = parseInt(rowStr, 10);
    const col = parseInt(colStr, 10);
    const tileType = run?.dungeonLayout[row]?.[col]?.type ?? 'fight';
    return (
      <RewardScreen
        mode="fight"
        run={run}
        rewardData={fightReward}
        tileType={tileType}
        onDone={rewards => handleRewardsDone(rewards)}
      />
    );
  }

  // Rest site screen
  if (phase.startsWith('rest:') && tileReward) {
    const [, rowStr, colStr] = phase.split(':');
    const row = parseInt(rowStr, 10);
    const col = parseInt(colStr, 10);
    const healAmount = tileReward.healAmount;
    return (
      <RewardScreen
        mode="rest"
        run={run}
        restHealAmount={healAmount}
        onDone={() => {
          // Apply HP healing then complete tile
          const healed = applyReward(run, { type: 'hp', value: healAmount });
          const completed = completeTile(healed, row, col);
          setRun(completed);
          setTileReward(null);
          setPhase('map');
        }}
      />
    );
  }

  // Treasure screen
  if (phase.startsWith('treasure:') && tileReward) {
    const [, rowStr, colStr] = phase.split(':');
    const row = parseInt(rowStr, 10);
    const col = parseInt(colStr, 10);
    return (
      <RewardScreen
        mode="treasure"
        run={run}
        rewardData={tileReward}
        onDone={rewards => handleRewardsDone(rewards, row, col)}
      />
    );
  }

  // Shop screen
  if (phase.startsWith('shop:') && shopOfferings) {
    const [, rowStr, colStr] = phase.split(':');
    const row = parseInt(rowStr, 10);
    const col = parseInt(colStr, 10);
    return (
      <RewardScreen
        mode="shop"
        run={run}
        shopItems={shopOfferings}
        onDone={rewards => handleRewardsDone(rewards, row, col)}
      />
    );
  }

  if (phase === 'run_summary') {
    return (
      <RunSummary
        run={run}
        onPlayAgain={handleRunSummaryDone}
        onMainMenu={onBack}
      />
    );
  }

  // Mysterious event screen
  if (phase.startsWith('tile_event:') && tileEvent) {
    return (
      <EventScreen
        event={tileEvent.event}
        rng={tileEvent.rng}
        run={run}
        onDone={handleEventDone}
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
        {Object.entries(FACTION_INFO).map(([factionKey, info]) => {
          const champImage = CHAMPIONS[factionKey]?.image;
          const champImageUrl = champImage ? getCardImageUrl(champImage) : null;
          return (
            <button
              key={factionKey}
              onClick={() => onSelect(factionKey)}
              style={{
                background: info.bg,
                border: `1px solid ${info.border}`,
                borderRadius: '6px',
                padding: '0',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'box-shadow 150ms ease, transform 150ms ease',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
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
              {champImageUrl && (
                <div style={{ height: '90px', flexShrink: 0, overflow: 'hidden' }}>
                  <img
                    src={champImageUrl}
                    alt={CHAMPIONS[factionKey]?.name ?? info.label}
                    onError={e => { e.target.style.display = 'none'; }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              )}
              <div style={{ padding: '12px 12px 14px' }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: 600, color: info.color, letterSpacing: '0.08em', marginBottom: '6px' }}>
                  {info.label}
                </div>
                <div style={{ fontSize: '11px', color: '#6a6a8a', lineHeight: 1.4 }}>
                  {info.desc}
                </div>
              </div>
            </button>
          );
        })}
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

function MapScreen({ run, onTileClick, onUsePotion, onAbandon, onBack }) {
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
        <StatPill
          label="HP"
          value={`${run.championHP}/${run.maxChampionHP}`}
          color={run.championHP / run.maxChampionHP < 0.4 ? '#f87171' : '#4ade80'}
        />
        <StatPill label="Gold"    value={run.gold}             color="#C9A84C" />
        <StatPill label="Potions" value={`${run.potions}/3`}   color="#60a0ff" />
        <StatPill label="Rooms"   value={run.roomsCleared}     color="#a0a0c0" />
        <StatPill label="Cards"   value={run.deck.length}      color="#c084fc" />
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

      {/* Blessings display */}
      {run.blessings && run.blessings.length > 0 && (
        <div style={{
          width: '100%',
          maxWidth: '500px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}>
          {run.blessings.map(b => (
            <div key={b} style={{
              background: '#0a1200',
              border: '1px solid #4ade8040',
              borderRadius: '4px',
              padding: '3px 8px',
              fontFamily: "'Cinzel', serif",
              fontSize: '9px',
              color: '#80e860',
              letterSpacing: '0.05em',
            }}>
              ✦ {b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
          ))}
        </div>
      )}

      {/* Use Potion button */}
      {run.potions > 0 && (
        <button
          onClick={onUsePotion}
          disabled={run.championHP >= run.maxChampionHP}
          style={{
            background: run.championHP >= run.maxChampionHP ? '#1a1a2a' : 'linear-gradient(135deg, #0a1a3a, #1a4a8a)',
            color: run.championHP >= run.maxChampionHP ? '#3a3a5a' : '#60a0ff',
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            fontWeight: 600,
            border: `1px solid ${run.championHP >= run.maxChampionHP ? '#2a2a3a' : '#60a0ff60'}`,
            borderRadius: '4px',
            padding: '8px 20px',
            cursor: run.championHP >= run.maxChampionHP ? 'not-allowed' : 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          🧪 Use Potion (+5 HP) · {run.potions}/{3}
        </button>
      )}

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
