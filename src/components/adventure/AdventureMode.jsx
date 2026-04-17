import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Card from '../Card.jsx';
import {
  createNewRun, loadRun, clearRun, saveRun,
  moveToTile, completeTile, applyReward,
  FACTION_CURATED_CARDS,
  getChampionProgress,
} from '../../adventure/adventureState.js';
import AdventureDraftScreen from './AdventureDraftScreen.jsx';
import { buildAdventureGameState } from '../../adventure/adventureFight.js';
import {
  generateFightReward, generateTreasure, generateShopOfferings,
  BLESSINGS_POOL,
} from '../../adventure/encounterRewards.js';
import { makeEventRng, getRandomEvent } from '../../adventure/eventDefinitions.js';
import DungeonMap from './DungeonMap.jsx';
import RewardScreen from './RewardScreen.jsx';
import EventScreen from './EventScreen.jsx';
import RunSummary from './RunSummary.jsx';
import App from '../../App.jsx';
import { supabase, getGuestId, getCardImageUrl } from '../../supabase.js';
import { CHAMPIONS } from '../../engine/champions.js';
import { CARD_DB } from '../../engine/cards.js';
import useIsMobile from '../../hooks/useIsMobile.js';

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

const CURSES_INFO = {
  plagued:  { name: 'Plagued',  desc: 'Lose 1 HP each time you move to a tile.' },
  weakened: { name: 'Weakened', desc: 'Your champion starts each fight with reduced ATK.' },
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

  // ── Boss entry state ──────────────────────────────────────────────────────
  // pendingBossEntry: { row, col } — boss tile the player wants to enter (not yet confirmed)
  const [pendingBossEntry, setPendingBossEntry] = useState(null);

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
    if (!tile || tile.type === 'wall') return;

    // Boss tile: award major potion on entry if not yet granted, then show boss warning
    if (tile.type === 'boss' && !tile.completed) {
      const { initialState, aiDepth, fightDifficultyLabel } = buildAdventureGameState(run, row, col, 'boss');
      setFightCtx({ initialState, aiDepth, row, col, tileType: 'boss', fightDifficultyLabel });
      setPendingBossEntry({ row, col });

      if (!run.bossGatePotionGranted) {
        const totalPotions = (run.potions || 0) + (run.majorPotions || 0);
        let newRun = run;
        if (totalPotions < 3) {
          newRun = saveRun({ ...run, majorPotions: (run.majorPotions || 0) + 1, bossGatePotionGranted: true });
        } else if (run.potions > 0) {
          newRun = saveRun({ ...run, potions: run.potions - 1, majorPotions: (run.majorPotions || 0) + 1, bossGatePotionGranted: true });
        } else {
          newRun = saveRun({ ...run, bossGatePotionGranted: true });
        }
        setRun(newRun);
        setPhase('boss_entry_potion');
        return;
      }

      setPhase('boss_warning');
      return;
    }

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
      const { initialState, aiDepth, fightDifficultyLabel } = buildAdventureGameState(newRun, row, col, tileType);
      setFightCtx({ initialState, aiDepth, row, col, tileType, fightDifficultyLabel });
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

  // Confirm entering boss room: apply movement then start fight
  function handleConfirmBossEntry() {
    if (!run || !pendingBossEntry || !fightCtx) return;
    const { row, col } = pendingBossEntry;

    // Plagued curse: subtract 1 HP on move into boss room
    let newRun = run;
    if (run.curses && run.curses.includes('plagued')) {
      const newHP = run.championHP - 1;
      if (newHP <= 0) {
        const dyingRun = { ...run, championHP: 0 };
        clearRun();
        saveAdventureRunResult(dyingRun);
        setRun(dyingRun);
        setPendingBossEntry(null);
        setFightCtx(null);
        setPhase('run_summary');
        return;
      }
      newRun = saveRun({ ...run, championHP: newHP });
    }

    newRun = moveToTile(newRun, row, col);
    setRun(newRun);
    setPendingBossEntry(null);
    // Rebuild fight state with the updated run (potion usage during warning may have changed HP)
    const { initialState, aiDepth, fightDifficultyLabel } = buildAdventureGameState(newRun, row, col, 'boss');
    setFightCtx({ initialState, aiDepth, row, col, tileType: 'boss', fightDifficultyLabel });
    setPhase('fight');
  }

  // Use a potion during the boss warning modal
  function handleUsePotionInWarning() {
    if (!run) return;
    const majorPotions = run.majorPotions || 0;
    const standardPotions = run.potions || 0;
    if (majorPotions === 0 && standardPotions === 0) return;
    if (run.championHP >= run.maxChampionHP) return;

    let newRun;
    if (majorPotions > 0) {
      const newHP = Math.min(run.maxChampionHP, run.championHP + 10);
      newRun = saveRun({ ...run, championHP: newHP, majorPotions: majorPotions - 1 });
    } else {
      const newHP = Math.min(run.maxChampionHP, run.championHP + 5);
      newRun = saveRun({ ...run, championHP: newHP, potions: standardPotions - 1 });
    }
    setRun(newRun);
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
   * Use a health potion during the map phase. Major potions (10 HP) are used first.
   */
  function handleUsePotion() {
    if (!run) return;
    const majorPotions = run.majorPotions || 0;
    const standardPotions = run.potions || 0;
    if (majorPotions === 0 && standardPotions === 0) return;
    if (run.championHP >= run.maxChampionHP) return;

    let newRun;
    if (majorPotions > 0) {
      const newHP = Math.min(run.maxChampionHP, run.championHP + 10);
      newRun = { ...run, championHP: newHP, majorPotions: majorPotions - 1 };
    } else {
      const newHP = Math.min(run.maxChampionHP, run.championHP + 5);
      newRun = { ...run, championHP: newHP, potions: standardPotions - 1 };
    }
    setRun(newRun);
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

  if (phase === 'gate_potion') {
    const majorPotions = run?.majorPotions || 0;
    return (
      <GatePotionNotification
        majorPotions={majorPotions}
        run={run}
        onContinue={() => setPhase('map')}
      />
    );
  }

  if (phase === 'boss_entry_potion') {
    const majorPotions = run?.majorPotions || 0;
    return (
      <GatePotionNotification
        majorPotions={majorPotions}
        run={run}
        isBossEntry
        onContinue={() => setPhase('boss_warning')}
      />
    );
  }

  if (phase === 'boss_warning' && fightCtx && run) {
    return (
      <BossRoomWarning
        fightCtx={fightCtx}
        run={run}
        onUsePotion={handleUsePotionInWarning}
        onEnter={handleConfirmBossEntry}
        onBack={() => {
          setPendingBossEntry(null);
          setFightCtx(null);
          setPhase('map');
        }}
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

// ── Boss Passive Intro ────────────────────────────────────────────────────────

// ── Gate Potion Notification ──────────────────────────────────────────────────

function GatePotionNotification({ run, majorPotions, isBossEntry, onContinue }) {
  const totalPotions = (run?.potions || 0) + (majorPotions || 0);
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a14',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      gap: '24px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C', letterSpacing: '0.15em', marginBottom: '8px' }}>
          {isBossEntry ? 'ENTERING THE THRONE ROOM' : 'APPROACHING THE THRONE'}
        </div>
        <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: '20px', color: '#f9fafb', margin: 0 }}>
          {isBossEntry ? 'Boss Chamber' : 'The Gate'}
        </h2>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '380px',
        background: 'linear-gradient(135deg, #0a1a0a, #0a2a10)',
        border: '1px solid #4ade8060',
        borderRadius: '8px',
        padding: '20px 24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '28px', marginBottom: '10px' }}>🧪</div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#4ade80', marginBottom: '8px' }}>
          Major Health Potion Found!
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '15px', color: '#c0e0c0', lineHeight: 1.5 }}>
          You found a Major Health Potion! Use it before facing the boss.
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#6a9a7a', marginTop: '10px' }}>
          Heals 10 HP when used · Potions: {totalPotions}/3
        </div>
      </div>

      <button
        onClick={onContinue}
        style={{
          background: 'linear-gradient(135deg, #0a2a0a, #1a5a1a)',
          color: '#4ade80',
          fontFamily: "'Cinzel', serif",
          fontSize: '13px',
          fontWeight: 600,
          border: '1px solid #4ade8060',
          borderRadius: '4px',
          padding: '12px 36px',
          cursor: 'pointer',
          letterSpacing: '0.1em',
        }}
      >
        Continue
      </button>
    </div>
  );
}

// ── Boss Room Warning ─────────────────────────────────────────────────────────

function BossRoomWarning({ fightCtx, run, onUsePotion, onEnter, onBack }) {
  const bossState  = fightCtx.initialState;
  const bossChamp  = bossState.champions[1];
  const bossUnits  = bossState.units.filter(u => u.owner === 1);
  const switches   = bossState.switchTiles || [];
  const passives   = bossState.bossPassives || [];

  const majorPotions   = run.majorPotions || 0;
  const standardPotions = run.potions || 0;
  const totalPotions   = majorPotions + standardPotions;
  const nextHeal       = majorPotions > 0 ? 10 : 5;
  const canUsePotion   = totalPotions > 0 && run.championHP < run.maxChampionHP;

  const COL_LABELS = ['A', 'B', 'C', 'D', 'E'];
  const formatPos = (row, col) => `${COL_LABELS[col]}${row + 1}`;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0005',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      gap: '20px',
      overflowY: 'auto',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C', letterSpacing: '0.15em', marginBottom: '8px' }}>
          BOSS ENCOUNTER
        </div>
        <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', color: '#f9fafb', margin: 0 }}>
          The Enthroned
        </h2>
        <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#8a7a60', marginTop: '6px', fontStyle: 'italic' }}>
          Champion HP: <span style={{ color: '#f87171', fontWeight: 600 }}>{bossChamp.hp}</span>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Boss Passive */}
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#9a7a40', letterSpacing: '0.1em', marginBottom: '2px', textAlign: 'center' }}>
          BOSS PASSIVE
        </div>
        {passives.map(p => (
          <div key={p.id} style={{
            background: 'linear-gradient(135deg, #1a1000, #120800)',
            border: '1px solid #C9A84C60',
            borderRadius: '6px',
            padding: '14px 18px',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', marginBottom: '5px' }}>
              {p.name}
              {p.id === 'royal_stasis' && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#9a8a50', marginLeft: '8px' }}>
                  (3 turns)
                </span>
              )}
            </div>
            <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#c0b090', lineHeight: 1.5 }}>
              {p.description}
            </div>
          </div>
        ))}

        {/* Starting Units */}
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#9a7a40', letterSpacing: '0.1em', marginTop: '4px', textAlign: 'center' }}>
          STARTING UNITS
        </div>
        <div style={{
          background: '#0d0d18',
          border: '1px solid #2a2a3a',
          borderRadius: '6px',
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}>
          {bossUnits.map((u, i) => (
            <div key={i} style={{
              background: '#1a1a2a',
              border: '1px solid #3a3a5a',
              borderRadius: '4px',
              padding: '4px 10px',
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              color: '#b0b0d0',
            }}>
              {u.name} <span style={{ color: '#f87171' }}>{u.atk}/{u.hp}</span>{' '}
              <span style={{ color: '#6a6a88' }}>@ {formatPos(u.row, u.col)}</span>
            </div>
          ))}
        </div>

        {/* Switch Tiles */}
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#9a7a40', letterSpacing: '0.1em', marginTop: '4px', textAlign: 'center' }}>
          SWITCH TILES
        </div>
        <div style={{
          background: '#0d0d18',
          border: '1px solid #2a2a3a',
          borderRadius: '6px',
          padding: '12px 16px',
        }}>
          <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#c0b090', lineHeight: 1.6 }}>
            Stepping on a switch displaces the occupant of the Throne (C3).
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            {switches.map((sw, i) => (
              <div key={i} style={{
                background: '#1a1a2a',
                border: '1px solid #4a4a6a',
                borderRadius: '4px',
                padding: '4px 10px',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                color: '#a0a0d0',
              }}>
                {formatPos(sw.row, sw.col)}
              </div>
            ))}
          </div>
        </div>

        {/* Player status */}
        <div style={{
          background: '#0d0d18',
          border: '1px solid #2a2a3a',
          borderRadius: '6px',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#a0a0c0' }}>
            Your HP: <span style={{ color: run.championHP / run.maxChampionHP < 0.4 ? '#f87171' : '#4ade80', fontWeight: 600 }}>
              {run.championHP}/{run.maxChampionHP}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#a0a0c0' }}>
            Potions: <span style={{ color: '#60a0ff', fontWeight: 600 }}>{totalPotions}/3</span>
            {majorPotions > 0 && <span style={{ color: '#4ade80', marginLeft: '4px' }}>({majorPotions} major)</span>}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '420px' }}>
        {canUsePotion && (
          <button
            onClick={onUsePotion}
            style={{
              background: 'linear-gradient(135deg, #0a1a3a, #1a3a7a)',
              color: '#60a0ff',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              fontWeight: 600,
              border: '1px solid #60a0ff60',
              borderRadius: '4px',
              padding: '10px 24px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            🧪 Use Potion (+{nextHeal} HP)
          </button>
        )}
        <button
          onClick={onEnter}
          style={{
            background: 'linear-gradient(135deg, #3a0a00, #6a1500)',
            color: '#f0c060',
            fontFamily: "'Cinzel', serif",
            fontSize: '13px',
            fontWeight: 600,
            border: '1px solid #C9A84C80',
            borderRadius: '4px',
            padding: '12px 36px',
            cursor: 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          Enter the Boss Room
        </button>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            color: '#6a6a88',
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            fontWeight: 600,
            border: '1px solid #3a3a5a',
            borderRadius: '4px',
            padding: '10px 24px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          Go Back
        </button>
      </div>
    </div>
  );
}

// ── Champion Selection ────────────────────────────────────────────────────────

const XP_TIER_THRESHOLDS = [50, 150, 350];

function ChampionProgressBadge({ faction }) {
  const { xp, tier } = getChampionProgress(faction);
  const nextThreshold = XP_TIER_THRESHOLDS[tier] ?? null;
  const label = nextThreshold != null
    ? `Tier ${tier} · ${xp}/${nextThreshold} XP`
    : `Tier ${tier} · ${xp} XP (max)`;
  return (
    <div style={{
      fontFamily: "'Cinzel', serif",
      fontSize: '9px',
      color: tier > 0 ? '#C9A84C' : '#4a4a6a',
      letterSpacing: '0.05em',
      marginTop: '4px',
    }}>
      {label}
    </div>
  );
}

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
                <ChampionProgressBadge faction={factionKey} />
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

function getStepsColor(tilesMoved) {
  if (tilesMoved >= 15) return '#f87171'; // red
  if (tilesMoved >= 10) return '#fb923c'; // orange
  if (tilesMoved >= 5)  return '#facc15'; // yellow
  return '#f9fafb';                       // white
}

// Build a grouped, sorted deck list from card IDs
function buildDeckGroups(deckIds) {
  const counts = {};
  for (const id of deckIds) {
    counts[id] = (counts[id] || 0) + 1;
  }
  const entries = Object.entries(counts)
    .map(([id, count]) => {
      const card = CARD_DB[id];
      return card ? { id, name: card.name, cost: card.cost, type: card.type, count } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.cost - b.cost);

  // Group by cost
  const groups = [];
  let lastCost = null;
  for (const entry of entries) {
    if (entry.cost !== lastCost) {
      groups.push({ cost: entry.cost, cards: [] });
      lastCost = entry.cost;
    }
    groups[groups.length - 1].cards.push(entry);
  }
  return groups;
}

const PANEL_BG = '#0d0d18';
const PANEL_BORDER = '1px solid #1e1e2e';

function DeckPanel({ deck }) {
  const [selectedCardId, setSelectedCardId] = useState(null);
  const groups = buildDeckGroups(deck);
  const selectedCard = selectedCardId ? CARD_DB[selectedCardId] : null;

  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '14px 12px',
        gap: '10px',
      }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          color: '#6a6a8a',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: '2px',
        }}>
          Deck · {deck.length} cards
        </div>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {groups.map(group => (
            <div key={group.cost}>
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: '9px',
                color: '#4a4a6a',
                letterSpacing: '0.06em',
                marginBottom: '4px',
                borderBottom: '1px solid #1e1e2e',
                paddingBottom: '2px',
              }}>
                Cost {group.cost}
              </div>
              {group.cards.map(card => (
                <div
                  key={card.id}
                  onClick={() => setSelectedCardId(card.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '3px 4px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#1a1a2a'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    fontFamily: "'Crimson Text', serif",
                    fontSize: '12px',
                    color: card.type === 'spell' ? '#c084fc' : card.type === 'omen' ? '#f9a8d4' : '#c0c0d8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {card.name}
                  </div>
                  {card.count > 1 && (
                    <div style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: '9px',
                      color: '#4a4a6a',
                      flexShrink: 0,
                      marginLeft: '4px',
                    }}>
                      ×{card.count}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {selectedCard && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setSelectedCardId(null)}
          onKeyDown={e => { if (e.key === 'Escape') setSelectedCardId(null); }}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}
            onClick={e => e.stopPropagation()}
          >
            <Card card={selectedCard} isPlayable={false} isSelected={false} />
            <button
              onClick={() => setSelectedCardId(null)}
              style={{
                background: 'transparent',
                color: '#6a6a8a',
                border: '1px solid #2a2a3a',
                borderRadius: '4px',
                padding: '6px 20px',
                cursor: 'pointer',
                fontFamily: "'Cinzel', serif",
                fontSize: '11px',
                letterSpacing: '0.06em',
              }}
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function RunPanel({ run, livePenalty }) {
  const blessingMap = Object.fromEntries(BLESSINGS_POOL.map(b => [b.id, b]));
  const [selectedEntry, setSelectedEntry] = useState(null); // { kind: 'blessing'|'curse', id }

  const tilesMoved = run.tilesMoved ?? 0;
  const stepsDisplay = tilesMoved >= 100 ? '100 (max)' : tilesMoved;

  const selectedBlessingInfo = selectedEntry?.kind === 'blessing'
    ? (blessingMap[selectedEntry.id] ?? { name: selectedEntry.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), desc: '' })
    : null;
  const selectedCurseInfo = selectedEntry?.kind === 'curse'
    ? (CURSES_INFO[selectedEntry.id] ?? { name: selectedEntry.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), desc: '' })
    : null;

  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '14px 12px',
        gap: '14px',
        overflowY: 'auto',
      }}>
        {/* Blessings */}
        <div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '10px',
            color: '#6a6a8a',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Blessings
          </div>
          {run.blessings && run.blessings.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {run.blessings.map(id => {
                const b = blessingMap[id];
                return (
                  <div
                    key={id}
                    onClick={() => setSelectedEntry({ kind: 'blessing', id })}
                    style={{
                      background: '#0a1200',
                      border: '1px solid #4ade8030',
                      borderRadius: '4px',
                      padding: '5px 8px',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#4ade8060'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#4ade8030'; }}
                  >
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#80e860', letterSpacing: '0.05em' }}>
                      ✦ {b?.name ?? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </div>
                    {b?.desc && (
                      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '11px', color: '#4a6a40', marginTop: '2px', lineHeight: 1.3 }}>
                        {b.desc}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '11px', color: '#3a3a5a' }}>
              No blessings
            </div>
          )}
        </div>

        {/* Curses */}
        <div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '10px',
            color: '#6a6a8a',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Curses
          </div>
          {run.curses && run.curses.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {run.curses.map(id => {
                const c = CURSES_INFO[id];
                return (
                  <div
                    key={id}
                    onClick={() => setSelectedEntry({ kind: 'curse', id })}
                    style={{
                      background: '#1a0a0a',
                      border: '1px solid #f8717130',
                      borderRadius: '4px',
                      padding: '5px 8px',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#f8717160'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#f8717130'; }}
                  >
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#f87171', letterSpacing: '0.05em' }}>
                      ✦ {c?.name ?? id.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}
                    </div>
                    {c?.desc && (
                      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '11px', color: '#6a3a3a', marginTop: '2px', lineHeight: 1.3 }}>
                        {c.desc}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '11px', color: '#3a3a5a' }}>
              No curses
            </div>
          )}
        </div>

        {/* Run stats */}
        <div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '10px',
            color: '#6a6a8a',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Run Stats
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { label: 'Fights Won',   value: run.roomsCleared },
              { label: 'Steps Taken',  value: stepsDisplay },
              { label: 'Move Penalty', value: livePenalty > 0 ? `+${livePenalty} enemy HP` : 'None', color: livePenalty > 0 ? '#f87171' : '#4a4a6a' },
              { label: 'Loop',         value: run.loopCount },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#4a4a6a', letterSpacing: '0.04em' }}>
                  {label}
                </div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: color ?? '#a0a0c0' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Blessing/Curse detail modal */}
      {selectedEntry && (selectedBlessingInfo || selectedCurseInfo) && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            style={{
              background: selectedEntry.kind === 'blessing' ? 'linear-gradient(135deg, #0a1a06, #0d1e08)' : 'linear-gradient(135deg, #1a0606, #1e0808)',
              border: `1px solid ${selectedEntry.kind === 'blessing' ? '#4ade8060' : '#f8717160'}`,
              borderRadius: '8px',
              padding: '24px 28px',
              maxWidth: '360px',
              width: '100%',
              boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '8px',
              color: selectedEntry.kind === 'blessing' ? '#4ade80' : '#f87171',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              {selectedEntry.kind === 'blessing' ? '✦ Blessing' : '✦ Curse'}
            </div>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '16px',
              color: selectedEntry.kind === 'blessing' ? '#80e860' : '#f87171',
              marginBottom: '12px',
            }}>
              {(selectedBlessingInfo ?? selectedCurseInfo).name}
            </div>
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: '15px',
              color: selectedEntry.kind === 'blessing' ? '#8ab880' : '#c08080',
              lineHeight: 1.6,
            }}>
              {(selectedBlessingInfo ?? selectedCurseInfo).desc || 'No additional details.'}
            </div>
            <button
              onClick={() => setSelectedEntry(null)}
              style={{
                marginTop: '20px',
                background: 'transparent',
                color: '#6a6a8a',
                border: '1px solid #2a2a3a',
                borderRadius: '4px',
                padding: '6px 20px',
                cursor: 'pointer',
                fontFamily: "'Cinzel', serif",
                fontSize: '11px',
                letterSpacing: '0.06em',
                width: '100%',
              }}
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const CONFIRM_MOVE_TYPES = new Set(['fight', 'elite_fight', 'shop', 'event']);

function MapScreen({ run, onTileClick, onUsePotion, onAbandon, onBack }) {
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [pendingMove, setPendingMove] = useState(null); // { row, col, tileType }
  const isMobile = useIsMobile();

  function handleMapTileClick(row, col) {
    const tile = run.dungeonLayout[row]?.[col];
    if (!tile) return;
    if (CONFIRM_MOVE_TYPES.has(tile.type) && !tile.completed) {
      setPendingMove({ row, col, tileType: tile.type });
    } else {
      onTileClick(row, col);
    }
  }

  function confirmMove() {
    if (!pendingMove) return;
    const { row, col } = pendingMove;
    setPendingMove(null);
    onTileClick(row, col);
  }
  const faction = FACTION_INFO[run.championFaction] ?? FACTION_INFO.light;
  const currentTileType = run.dungeonLayout[run.currentTile.row]?.[run.currentTile.col]?.type ?? 'start';
  const tilesMoved = run.tilesMoved ?? 0;
  const livePenalty = Math.floor(tilesMoved / 5);

  // HUD bar used in both layouts
  const hudBar = (
    <div style={{
      width: '100%',
      maxWidth: isMobile ? '500px' : undefined,
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
      <StatPill label="Gold"    value={run.gold}           color="#C9A84C" />
      <StatPill label="Potions" value={`${(run.potions || 0) + (run.majorPotions || 0)}/3`} color="#60a0ff" />
      <StatPill label="Rooms"   value={run.roomsCleared}   color="#a0a0c0" />
      <StatPill label="Cards"   value={run.deck.length}    color="#c084fc" />
      <StatPill label="Steps"   value={tilesMoved >= 100 ? '100 (max)' : tilesMoved} color={getStepsColor(tilesMoved)} />
    </div>
  );

  const penaltyBadge = livePenalty > 0 && (
    <div style={{
      width: '100%',
      maxWidth: isMobile ? '500px' : undefined,
      textAlign: 'right',
      fontFamily: "'Crimson Text', serif",
      fontStyle: 'italic',
      fontSize: '11px',
      color: '#f87171',
      marginTop: '-8px',
    }}>
      Enemy Champion +{livePenalty} HP
    </div>
  );

  const totalPotions = (run.potions || 0) + (run.majorPotions || 0);
  const nextPotionHeal = (run.majorPotions || 0) > 0 ? 10 : 5;
  const potionButton = totalPotions > 0 && (
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
      🧪 Use Potion (+{nextPotionHeal} HP) · {totalPotions}/3{(run.majorPotions || 0) > 0 ? ' ✦' : ''}
    </button>
  );

  const abandonControls = confirmAbandon ? (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <span style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#f87171' }}>Abandon run?</span>
      <button onClick={onAbandon} style={smallDangerBtn}>Yes, abandon</button>
      <button onClick={() => setConfirmAbandon(false)} style={smallCancelBtn}>Cancel</button>
    </div>
  ) : (
    <button onClick={() => setConfirmAbandon(true)} style={smallCancelBtn}>
      Abandon Run
    </button>
  );

  // ── Mobile layout (single column, unchanged) ─────────────────────────────
  if (isMobile) {
    return (
      <>
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

        {hudBar}
        {penaltyBadge}

        <DungeonMap state={run} onTileClick={handleMapTileClick} />

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

        {/* Blessings (mobile only — desktop uses right panel) */}
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

        {potionButton}
        {abandonControls}
      </div>

      {pendingMove && createPortal(
        <MoveConfirmOverlay
          tileType={pendingMove.tileType}
          onConfirm={confirmMove}
          onCancel={() => setPendingMove(null)}
        />,
        document.body
      )}
    </>
  );
  }

  // ── Desktop layout (three-panel) ──────────────────────────────────────────
  const sidePanel = {
    width: '250px',
    flexShrink: 0,
    background: PANEL_BG,
    borderRight: PANEL_BORDER,
    overflowY: 'auto',
  };

  return (
    <div style={{
      height: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* Left panel — Deck */}
      <div style={{ ...sidePanel, borderRight: PANEL_BORDER, borderLeft: 'none' }}>
        <DeckPanel deck={run.deck} />
      </div>

      {/* Center panel — Map */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 24px',
        gap: '14px',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          width: '100%',
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

        {hudBar}
        {penaltyBadge}

        <DungeonMap state={run} onTileClick={handleMapTileClick} tileSize={76} />

        <div style={{
          fontFamily: "'Crimson Text', serif",
          fontStyle: 'italic',
          fontSize: '13px',
          color: '#6a6a8a',
          textAlign: 'center',
        }}>
          You are at: <span style={{ color: '#a0a0c0' }}>{TILE_LABELS[currentTileType] ?? currentTileType}</span>
          {run.loopCount > 0 && (
            <span style={{ color: '#f87171', marginLeft: '8px' }}>· Loop scaling: +{run.loopCount}/+{run.loopCount} to all enemies</span>
          )}
        </div>

        {potionButton}
        {abandonControls}
      </div>

      {/* Right panel — Blessings / Curses / Stats */}
      <div style={{ ...sidePanel, borderLeft: PANEL_BORDER, borderRight: 'none' }}>
        <RunPanel run={run} livePenalty={livePenalty} />
      </div>

      {pendingMove && createPortal(
        <MoveConfirmOverlay
          tileType={pendingMove.tileType}
          onConfirm={confirmMove}
          onCancel={() => setPendingMove(null)}
        />,
        document.body
      )}
    </div>
  );
}


// ── Move Confirmation Overlay ─────────────────────────────────────────────────

const MOVE_CONFIRM_ICONS = {
  fight:       '⚔',
  elite_fight: '⚔⚔',
  boss:        '💀',
  shop:        '🪙',
  event:       '❓',
};

function MoveConfirmOverlay({ tileType, onConfirm, onCancel }) {
  const label = TILE_LABELS[tileType] ?? tileType;
  const icon = MOVE_CONFIRM_ICONS[tileType] ?? '?';
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #0d0d18, #141420)',
          border: '1px solid #3a3a60',
          borderRadius: '8px',
          padding: '28px 32px',
          maxWidth: '320px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 32px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '28px', marginBottom: '12px', lineHeight: 1 }}>{icon}</div>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '8px',
          color: '#6a6a8a',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}>
          Move to
        </div>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '16px',
          color: '#C9A84C',
          marginBottom: '24px',
          letterSpacing: '0.06em',
        }}>
          {label}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={onConfirm}
            style={{
              background: 'linear-gradient(135deg, #1a2a10, #2a4a18)',
              color: '#80e860',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              fontWeight: 600,
              border: '1px solid #4ade8060',
              borderRadius: '4px',
              padding: '10px 28px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            Yes
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: '#6a6a8a',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              border: '1px solid #2a2a3a',
              borderRadius: '4px',
              padding: '10px 28px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            No
          </button>
        </div>
      </div>
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
