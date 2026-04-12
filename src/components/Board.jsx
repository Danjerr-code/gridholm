import { useRef, useState, useEffect } from 'react';
import Cell from './Cell.jsx';
import UnitToken from './UnitToken.jsx';
import {
  ANIM_SUMMON_DURATION,
  ANIM_MOVE_DURATION,
  ANIM_LUNGE_TOTAL_DURATION,
  ANIM_LUNGE_MIDPOINT,
  ANIM_DAMAGE_DURATION,
  ANIM_DEATH_DURATION,
  ANIM_HEAVY_DAMAGE_THRESHOLD,
  ANIM_HEAL_DURATION,
  ANIM_BUFF_DURATION,
  ANIM_HIDDEN_SUMMON_DURATION,
  ANIM_REVEAL_DURATION,
  ANIM_TERRAIN_DURATION,
  ANIM_RELIC_SUMMON_DURATION,
  ANIM_OMEN_SUMMON_DURATION,
  ANIM_OMEN_TICK_DURATION,
  ANIM_OMEN_DEATH_DURATION,
  ANIM_THRONE_DURATION,
} from '../engine/animationManager.js';

// Maps deckId → champion attribute for ability glow colour
const DECK_ATTRIBUTE = { human: 'light', beast: 'primal', elf: 'mystic', demon: 'dark' };

export default function Board({
  state,
  selectedUnit,
  selectMode,
  championMoveTiles,
  summonTiles,
  unitMoveTiles,
  approachTiles = [],
  terrainTargetTiles = [],
  directionTargetTiles = [],
  championSaplingTiles = [],
  spellTargetUids,
  archerShootTargets,
  sacrificeTargetUids = [],
  championAbilityTargetUids = [],
  opponentMoveTiles = new Set(),
  spellGlowTile = null,
  handlers,
  onInspectUnit,
  onClearInspect,
  onInspectTerrain,
  isMyTurn,
  myPlayerIndex = 0,
  isMobile,
  onLongPressUnit,
  onLongPressDismiss,
}) {
  const { phase, activePlayer, units, champions } = state;

  // In single-player, default to checking if it's P1's turn (local player is always P1).
  // In multiplayer, isMyTurn is passed explicitly from the parent component.
  const canInteract = isMyTurn !== undefined ? isMyTurn : activePlayer === 0;
  const commandsUsed = state.players[myPlayerIndex]?.commandsUsed ?? 0;

  const champMoveSet = new Set(championMoveTiles.map(([r, c]) => `${r},${c}`));
  const summonSet = new Set(summonTiles.map(([r, c]) => `${r},${c}`));
  const unitMoveSet = new Set(unitMoveTiles.map(([r, c]) => `${r},${c}`));
  const approachTileSet = new Set(approachTiles.map(([r, c]) => `${r},${c}`));
  const terrainTargetSet = new Set(terrainTargetTiles.map(([r, c]) => `${r},${c}`));
  const directionTargetSet = new Set(directionTargetTiles.map(([r, c]) => `${r},${c}`));
  const saplingTileSet = new Set(championSaplingTiles.map(([r, c]) => `${r},${c}`));

  const boardRef = useRef(null);
  const [dragTargetKey, setDragTargetKey] = useState(null);
  // Double-tap tracking for champion tokens on mobile (keyed by champion.owner)
  const lastChampTapRef = useRef({});
  // Double-tap tracking for unit tokens on mobile (keyed by unit uid)
  const lastUnitTapRef = useRef({});

  // Animation state
  const prevStateRef = useRef(null);
  const [unitAnimStates, setUnitAnimStates] = useState({});     // uid -> animState
  const [champAnimStates, setChampAnimStates] = useState({});   // owner -> animState
  const [dyingUnits, setDyingUnits] = useState([]);             // [{unit, id}]
  const [terrainAnimStates, setTerrainAnimStates] = useState({}); // "row,col" -> true
  const [throneAnimActive, setThroneAnimActive] = useState(false);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!prev) return;

    // Collect all timeout IDs so they can be cancelled on cleanup (unmount or next effect).
    const timeoutIds = [];

    const nextAnimStates = {};
    const nextChampAnims = {};
    const dying = [];
    const MAX_DUR = Math.max(
      ANIM_SUMMON_DURATION, ANIM_MOVE_DURATION, ANIM_LUNGE_TOTAL_DURATION, ANIM_DAMAGE_DURATION,
      ANIM_HEAL_DURATION, ANIM_BUFF_DURATION, ANIM_HIDDEN_SUMMON_DURATION, ANIM_REVEAL_DURATION,
      ANIM_RELIC_SUMMON_DURATION, ANIM_OMEN_SUMMON_DURATION,
    );

    // 1. Summon: units that didn't exist in prev state
    // Relics rise from ground, omens shimmer in, hidden units use dark smoke, normal units flash
    for (const u of state.units) {
      if (!prev.units.find(p => p.uid === u.uid)) {
        if (u.isRelic) {
          nextAnimStates[u.uid] = { type: 'relic_summon' };
        } else if (u.isOmen) {
          nextAnimStates[u.uid] = { type: 'omen_summon' };
        } else {
          nextAnimStates[u.uid] = { type: u.hidden ? 'hidden_summon' : 'summon' };
        }
      }
    }

    // 2. Death: units removed from state → keep as ghost for death animation
    for (const pu of prev.units) {
      if (!state.units.find(u => u.uid === pu.uid)) {
        dying.push({ unit: pu, id: `${pu.uid}-${Date.now()}-${Math.random()}` });
      }
    }

    // 3. Move and lunge detection
    for (const u of state.units) {
      if (nextAnimStates[u.uid]) continue; // already marked (summon)
      const pu = prev.units.find(p => p.uid === u.uid);
      if (!pu) continue;

      if (pu.row !== u.row || pu.col !== u.col) {
        // Position changed — slide from old tile to new tile
        nextAnimStates[u.uid] = {
          type: 'move',
          fromRow: pu.row, fromCol: pu.col,
          currentRow: u.row, currentCol: u.col,
        };
      } else if (!pu.moved && u.moved) {
        // Unit's moved flag turned true but position unchanged → attacked in place (lunge)
        // Find adjacent enemy that took damage or died
        const target =
          prev.units.find(pu2 => {
            if (pu2.owner === u.owner) return false;
            if (Math.abs(pu2.row - u.row) > 1 || Math.abs(pu2.col - u.col) > 1) return false;
            const nu2 = state.units.find(n => n.uid === pu2.uid);
            return !nu2 || nu2.hp < pu2.hp; // died or damaged
          }) ||
          // Also check if an adjacent enemy champion took damage
          prev.champions.find(pc => {
            if (pc.owner === u.owner) return false;
            if (Math.abs(pc.row - u.row) > 1 || Math.abs(pc.col - u.col) > 1) return false;
            const nc = state.champions.find(c => c.owner === pc.owner);
            return nc && nc.hp < pc.hp;
          });

        if (target) {
          nextAnimStates[u.uid] = {
            type: 'lunge',
            dx: target.col - u.col,
            dy: target.row - u.row,
          };
        }
      }
    }

    // 4. Damage on surviving units — delay damage on lunge targets to midpoint
    const lungeTargetUids = new Set();
    for (const [uid, anim] of Object.entries(nextAnimStates)) {
      if (anim.type !== 'lunge') continue;
      const attacker = state.units.find(u => u.uid === uid);
      if (!attacker) continue;
      const targetRow = attacker.row + anim.dy;
      const targetCol = attacker.col + anim.dx;
      const targetUnit = state.units.find(u => u.row === targetRow && u.col === targetCol && u.owner !== attacker.owner);
      if (targetUnit) {
        const prevTarget = prev.units.find(p => p.uid === targetUnit.uid);
        if (prevTarget && prevTarget.hp > targetUnit.hp) {
          const heavy = (prevTarget.hp - targetUnit.hp) >= ANIM_HEAVY_DAMAGE_THRESHOLD;
          lungeTargetUids.add(targetUnit.uid);
          // Delay damage animation to lunge midpoint
          timeoutIds.push(setTimeout(() => {
            setUnitAnimStates(cur => ({ ...cur, [targetUnit.uid]: { type: 'damage', heavy } }));
            timeoutIds.push(setTimeout(() => {
              setUnitAnimStates(cur => {
                const next = { ...cur };
                delete next[targetUnit.uid];
                return next;
              });
            }, ANIM_DAMAGE_DURATION + 50));
          }, ANIM_LUNGE_MIDPOINT));
        }
      }
    }

    for (const u of state.units) {
      if (nextAnimStates[u.uid] || lungeTargetUids.has(u.uid)) continue;
      const pu = prev.units.find(p => p.uid === u.uid);
      if (!pu) continue;
      const dmg = pu.hp - u.hp;
      if (dmg > 0) {
        nextAnimStates[u.uid] = { type: 'damage', heavy: dmg >= ANIM_HEAVY_DAMAGE_THRESHOLD };
      }
    }

    // 5. Champion damage and heal
    for (const c of state.champions) {
      const pc = prev.champions.find(p => p.owner === c.owner);
      if (!pc) continue;
      const dmg = pc.hp - c.hp;
      if (dmg > 0) {
        nextChampAnims[c.owner] = { type: 'damage', heavy: dmg >= ANIM_HEAVY_DAMAGE_THRESHOLD };
      } else if (c.hp > pc.hp) {
        nextChampAnims[c.owner] = { type: 'heal' };
      }
    }

    // 6. Champion ability activation
    for (const c of state.champions) {
      if (nextChampAnims[c.owner]) continue;
      if (!prev.championAbilityUsed?.[c.owner] && state.championAbilityUsed?.[c.owner]) {
        const attr = DECK_ATTRIBUTE[state.players[c.owner]?.deckId] ?? 'light';
        nextChampAnims[c.owner] = { type: 'ability', attribute: attr };
      }
    }

    // 7. Omen tick: omen turnsRemaining decremented but unit still alive
    for (const u of state.units) {
      if (!u.isOmen || nextAnimStates[u.uid]) continue;
      const pu = prev.units.find(p => p.uid === u.uid);
      if (!pu) continue;
      if (u.turnsRemaining < pu.turnsRemaining) {
        nextAnimStates[u.uid] = { type: 'omen_tick' };
      }
    }

    // 8. Heal: unit HP increased (restoreHP called)
    for (const u of state.units) {
      if (nextAnimStates[u.uid]) continue;
      const pu = prev.units.find(p => p.uid === u.uid);
      if (!pu) continue;
      if (u.hp > pu.hp) {
        nextAnimStates[u.uid] = { type: 'heal' };
      }
    }

    // 8. Buff: ATK bonus, turn ATK bonus, speed bonus, or shield HP bonus increased
    for (const u of state.units) {
      if (nextAnimStates[u.uid]) continue;
      const pu = prev.units.find(p => p.uid === u.uid);
      if (!pu) continue;
      if (
        (u.atkBonus || 0) > (pu.atkBonus || 0) ||
        (u.turnAtkBonus || 0) > (pu.turnAtkBonus || 0) ||
        (u.speedBonus || 0) > (pu.speedBonus || 0) ||
        (u.shieldHpBonus || 0) > (pu.shieldHpBonus || 0)
      ) {
        nextAnimStates[u.uid] = { type: 'buff' };
      }
    }

    // 9. Hidden reveal: unit was hidden, now revealed
    for (const u of state.units) {
      if (nextAnimStates[u.uid]) continue;
      const pu = prev.units.find(p => p.uid === u.uid);
      if (!pu) continue;
      if (pu.hidden && !u.hidden) {
        nextAnimStates[u.uid] = { type: 'reveal' };
      }
    }

    // Apply and auto-clear unit anims
    if (Object.keys(nextAnimStates).length > 0) {
      setUnitAnimStates(cur => ({ ...cur, ...nextAnimStates }));
      timeoutIds.push(setTimeout(() => {
        setUnitAnimStates(cur => {
          const updated = { ...cur };
          for (const uid of Object.keys(nextAnimStates)) {
            if (updated[uid] === nextAnimStates[uid]) delete updated[uid];
          }
          return updated;
        });
      }, MAX_DUR + 50));
    }

    // Apply and auto-clear champ anims
    if (Object.keys(nextChampAnims).length > 0) {
      setChampAnimStates(cur => ({ ...cur, ...nextChampAnims }));
      timeoutIds.push(setTimeout(() => {
        setChampAnimStates(cur => {
          const updated = { ...cur };
          for (const ownerId of Object.keys(nextChampAnims)) {
            if (updated[ownerId] === nextChampAnims[ownerId]) delete updated[ownerId];
          }
          return updated;
        });
      }, ANIM_DAMAGE_DURATION + 50));
    }

    // Add dying units and auto-remove after death animation
    // Omens use a longer dissolve; regular units use the standard death sink
    if (dying.length > 0) {
      setDyingUnits(cur => [...cur, ...dying]);
      // Group by duration so each batch clears at the right time
      const regularDying = dying.filter(d => !d.unit.isOmen);
      const omenDying = dying.filter(d => d.unit.isOmen);
      if (regularDying.length > 0) {
        const ids = new Set(regularDying.map(d => d.id));
        timeoutIds.push(setTimeout(() => {
          setDyingUnits(cur => cur.filter(d => !ids.has(d.id)));
        }, ANIM_DEATH_DURATION + 50));
      }
      if (omenDying.length > 0) {
        const ids = new Set(omenDying.map(d => d.id));
        timeoutIds.push(setTimeout(() => {
          setDyingUnits(cur => cur.filter(d => !ids.has(d.id)));
        }, ANIM_OMEN_DEATH_DURATION + 50));
      }
    }

    // Terrain placed: newly non-null terrain tiles
    if (prev.terrainGrid && state.terrainGrid) {
      const nextTerrainAnims = {};
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (!prev.terrainGrid[r]?.[c] && state.terrainGrid[r]?.[c]) {
            nextTerrainAnims[`${r},${c}`] = true;
          }
        }
      }
      if (Object.keys(nextTerrainAnims).length > 0) {
        setTerrainAnimStates(cur => ({ ...cur, ...nextTerrainAnims }));
        timeoutIds.push(setTimeout(() => {
          setTerrainAnimStates(cur => {
            const updated = { ...cur };
            for (const key of Object.keys(nextTerrainAnims)) delete updated[key];
            return updated;
          });
        }, ANIM_TERRAIN_DURATION + 50));
      }
    }

    // Throne shockwave: opponent champion HP dropped when the active champion was at the throne tile
    for (const pc of prev.champions) {
      const nc = state.champions.find(c => c.owner === pc.owner);
      if (!nc || nc.hp >= pc.hp) continue; // hp didn't drop for this champion
      // Check if the OTHER champion (the one dealing throne damage) was at (2,2)
      const attacker = prev.champions.find(c => c.owner !== pc.owner);
      if (attacker && attacker.row === 2 && attacker.col === 2) {
        setThroneAnimActive(true);
        timeoutIds.push(setTimeout(() => setThroneAnimActive(false), ANIM_THRONE_DURATION + 50));
        break;
      }
    }

    return () => timeoutIds.forEach(clearTimeout);
  }, [state]);

  function handleUnitDragStart(unit) {
    if (!canInteract) return;
    handlers.handleSelectUnit(unit.uid);
  }

  function handleUnitDragMove(clientX, clientY) {
    if (!boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const col = Math.floor((clientX - rect.left) / (rect.width / 5));
    const row = Math.floor((clientY - rect.top) / (rect.height / 5));
    if (row >= 0 && row < 5 && col >= 0 && col < 5) {
      setDragTargetKey(`${row},${col}`);
    } else {
      setDragTargetKey(null);
    }
  }

  function handleUnitDragEnd(clientX, clientY) {
    const key = dragTargetKey;
    setDragTargetKey(null);
    if (clientX === null || !key) {
      handlers.clearSelection();
      return;
    }
    if (unitMoveSet.has(key)) {
      const [r, c] = key.split(',').map(Number);
      handlers.handleMoveUnit(r, c);
    } else {
      handlers.clearSelection();
    }
  }

  // Enemy-occupied tiles that are valid move targets (show red)
  const enemyMoveSet = new Set(
    unitMoveTiles
      .filter(([r, c]) =>
        units.some(u => u.owner !== activePlayer && u.row === r && u.col === c) ||
        champions.some(ch => ch.owner !== activePlayer && ch.row === r && ch.col === c)
      )
      .map(([r, c]) => `${r},${c}`)
  );

  function handleCellClick(row, col) {
    const isThrone = row === 2 && col === 2;
    const cellUnit = units.find(u => u.row === row && u.col === col);
    const cellChamp = champions.find(c => c.row === row && c.col === col);
    const cellTerrain = state.terrainGrid?.[row]?.[col] ?? null;

    // Desktop: Throne tile always shows terrain detail on tap.
    // Mobile: Throne inspect is triggered by long-press (not tap), so treat tap as a normal move target.
    if (isThrone && onInspectTerrain && !isMobile) {
      onInspectTerrain(null);
    } else if (!isThrone && cellTerrain && !cellUnit && !cellChamp && onInspectTerrain && !isMobile) {
      // Terrain-only tile: clicking shows terrain detail on desktop; mobile uses long press
      onInspectTerrain(cellTerrain);
    } else if (!isThrone && cellTerrain && (cellUnit || cellChamp) && onInspectTerrain && !isMobile) {
      // Desktop: clicking tile background (unit click stops propagation) shows terrain detail
      onInspectTerrain(cellTerrain);
    } else if (!isThrone && !cellTerrain && !cellUnit && !cellChamp && onClearInspect) {
      onClearInspect();
    }

    if (!canInteract) return;
    const key = `${row},${col}`;
    if (selectMode === 'approach_select' && approachTileSet.has(key)) {
      handlers.handleApproachTileChosen(row, col);
    } else if (selectMode === 'approach_select' && !approachTileSet.has(key)) {
      handlers.clearSelection();
    } else if (selectMode === 'champion_sapling_place' && saplingTileSet.has(key)) {
      handlers.handleChampionSaplingPlace(row, col);
    } else if (selectMode === 'direction_tile_select' && directionTargetSet.has(key)) {
      handlers.handleDirectionTileSelect(row, col);
    } else if (selectMode === 'direction_tile_select' && !directionTargetSet.has(key)) {
      handlers.clearSelection();
    } else if (selectMode === 'terrain_cast' && terrainTargetSet.has(key)) {
      handlers.handleTerrainCast(row, col);
    } else if (phase === 'action' && selectMode === 'champion_move' && champMoveSet.has(key)) {
      handlers.handleChampionMoveTile(row, col);
    } else if (selectMode === 'summon' && summonSet.has(key)) {
      handlers.handleSummonOnTile(row, col);
    } else if (selectMode === 'unit_move' && unitMoveSet.has(key)) {
      handlers.handleMoveUnit(row, col);
    } else if ((selectMode === 'unit_move' || selectMode === 'champion_move') && !cellUnit && !cellChamp) {
      // Clicking an empty non-move tile deselects the current selection and clears highlights.
      handlers.clearSelection();
    }
  }

  function handleUnitClick(unit) {
    // On mobile, tap selects only — detail is shown via long-press, not tap
    if (!isMobile && onInspectUnit) onInspectUnit(unit);

    if (isMobile) {
      const now = Date.now();
      const last = lastUnitTapRef.current[unit.uid] ?? 0;
      lastUnitTapRef.current[unit.uid] = now;

      if (now - last < 300) {
        // Double tap — reset to prevent triple-tap treating as another double
        lastUnitTapRef.current[unit.uid] = 0;

        const canUseAction = (
          unit.action === true &&
          !unit.moved &&
          !unit.summoned &&
          unit.owner === myPlayerIndex &&
          canInteract &&
          phase === 'action' &&
          commandsUsed < 3
        );

        if (canUseAction && handlers.handleActionButtonClick) {
          handlers.handleActionButtonClick(unit.uid);
          return;
        }
        // No action ability or ineligible: fall through to single-tap selection
      }
    }

    if (!canInteract) return;
    if (selectMode === 'champion_ability') {
      if (championAbilityTargetUids.includes(unit.uid)) {
        handlers.handleChampionAbilityTarget(unit.uid);
      }
      return;
    }
    if (selectMode === 'fleshtithe_sacrifice') {
      if (sacrificeTargetUids.includes(unit.uid)) {
        handlers.handleFleshtitheSacrifice('yes', unit.uid);
      }
      return;
    }
    if (selectMode === 'spell') {
      if (spellTargetUids.includes(unit.uid)) {
        handlers.handleSpellTarget(unit.uid);
      }
      return;
    }
    if (selectMode === 'archer_target') {
      if (archerShootTargets.includes(unit.uid)) {
        handlers.handleArcherShoot(unit.uid);
      }
      return;
    }
    if (phase === 'action') {
      // Enemy unit on a valid move tile — treat as move-to (combat)
      if (selectMode === 'unit_move' && unit.owner !== activePlayer) {
        const key = `${unit.row},${unit.col}`;
        if (unitMoveSet.has(key)) {
          handlers.handleMoveUnit(unit.row, unit.col);
          return;
        }
      }
      // Enemy unit on a valid champion move tile — treat as champion attack
      if (selectMode === 'champion_move' && unit.owner !== activePlayer) {
        const key = `${unit.row},${unit.col}`;
        if (champMoveSet.has(key)) {
          handlers.handleChampionMoveTile(unit.row, unit.col);
          return;
        }
      }
      if (unit.owner === myPlayerIndex && !unit.summoned && !unit.moved && commandsUsed < 3) {
        if (unit.uid === selectedUnit) {
          handlers.clearSelection();
        } else {
          handlers.handleSelectUnit(unit.uid);
        }
      }
    }
  }

  function handleChampionClick(champion, row, col) {
    const cellKey = `${row},${col}`;
    const isChampSpellTarget = spellTargetUids.includes('champion' + champion.owner);

    // Priority: spell cast on champion
    if (selectMode === 'spell' && isChampSpellTarget) {
      handlers.handleSpellTarget('champion' + champion.owner);
      return;
    }
    // Champion ability mode: allow clicking own champion if it's a valid target
    if (selectMode === 'champion_ability') {
      if (champion.owner === myPlayerIndex && championAbilityTargetUids.includes('champion' + champion.owner)) {
        handlers.handleChampionAbilityTarget('champion' + champion.owner);
      }
      return;
    }
    // Unit move: enemy champion on a valid move tile = move-to (combat)
    if (selectMode === 'unit_move' && champion.owner !== activePlayer) {
      if (unitMoveSet.has(cellKey)) {
        handlers.handleMoveUnit(row, col);
        return;
      }
    }

    const isOwnChampion = champion.owner === myPlayerIndex;

    if (isMobile) {
      // Mobile: double-tap within 300ms to inspect; single tap selects own champion only
      const now = Date.now();
      const ownerKey = String(champion.owner);
      const last = lastChampTapRef.current[ownerKey] ?? 0;
      lastChampTapRef.current[ownerKey] = now;

      if (now - last < 300) {
        // Double tap: show details for any champion
        lastChampTapRef.current[ownerKey] = 0;
        if (handlers.handleInspectChampion) handlers.handleInspectChampion(champion.owner);
      } else if (isOwnChampion) {
        // Single tap on own champion: open detail panel and select for movement
        if (handlers.handleInspectChampion) handlers.handleInspectChampion(champion.owner);
        if (canInteract && phase === 'action' && handlers.handleSelectChampion) {
          handlers.handleSelectChampion();
        }
      }
      // Single tap on opponent champion: no action
      return;
    }

    // Desktop: inspect + select own champion (unchanged)
    if (handlers.handleInspectChampion) handlers.handleInspectChampion(champion.owner);
    if (!canInteract) return;
    if (phase === 'action' && isOwnChampion && handlers.handleSelectChampion) {
      handlers.handleSelectChampion();
    }
  }

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <div ref={boardRef} data-board-grid="true" className="relative grid gap-0.5" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => {
            const key = `${row},${col}`;
            const unit = units.find(u => u.row === row && u.col === col) || null;
            const champion = champions.find(c => c.row === row && c.col === col) || null;
            const isSpellTarget = spellTargetUids.includes(unit?.uid);
            const isArcherTarget = archerShootTargets.includes(unit?.uid);
            const isSacrificeTarget = sacrificeTargetUids.includes(unit?.uid);
            const isAbilityTarget = championAbilityTargetUids.includes(unit?.uid);
            const isChampionSpellTarget = champion ? spellTargetUids.includes('champion' + champion.owner) : false;
            const isChampionAbilityTarget = champion ? championAbilityTargetUids.includes('champion' + champion.owner) : false;
            const cellDyingUnits = dyingUnits.filter(d => d.unit.row === row && d.unit.col === col);
            const champAnimState = champion ? champAnimStates[champion.owner] : null;

            const terrain = state.terrainGrid?.[row]?.[col] ?? null;
            return (
              <Cell
                key={key}
                row={row}
                col={col}
                unit={unit}
                champion={champion}
                isCenter={row === 2 && col === 2}
                isChampionMoveTile={champMoveSet.has(key)}
                isSummonTile={summonSet.has(key)}
                isUnitMoveTile={unitMoveSet.has(key) && !enemyMoveSet.has(key)}
                isEnemyMoveTile={enemyMoveSet.has(key)}
                isApproachTile={approachTileSet.has(key)}
                isOpponentMoveTile={opponentMoveTiles.has(key)}
                isSpellTargetGlow={spellGlowTile ? spellGlowTile.row === row && spellGlowTile.col === col : false}
                isDragTarget={dragTargetKey === key && unitMoveSet.has(key)}
                isTerrainTarget={terrainTargetSet.has(key)}
                isDirectionTarget={directionTargetSet.has(key)}
                isChampionSaplingTile={saplingTileSet.has(key)}
                terrain={terrain}
                terrainAnimActive={!!terrainAnimStates[key]}
                isThroneShockwave={row === 2 && col === 2 && throneAnimActive}
                isSelected={unit?.uid === selectedUnit}
                isSpellTarget={isSpellTarget}
                isChampionSpellTarget={isChampionSpellTarget}
                isChampionAbilityTarget={isChampionAbilityTarget}
                isArcherTarget={isArcherTarget}
                isSacrificeTarget={isSacrificeTarget}
                isAbilityTarget={isAbilityTarget}
                unitAnimState={unit ? unitAnimStates[unit.uid] : null}
                champAnimState={champAnimState}
                dyingUnits={cellDyingUnits}
                state={state}
                myPlayerIndex={myPlayerIndex}
                isMobile={isMobile}
                onUnitLongPress={onLongPressUnit}
                onLongPressDismiss={onLongPressDismiss}
                onThroneLongPress={onInspectTerrain}
                onTerrainLongPress={isMobile && terrain && !unit && !champion && onInspectTerrain ? () => onInspectTerrain(terrain) : undefined}
                onUnitDragStart={handleUnitDragStart}
                onUnitDragMove={handleUnitDragMove}
                onUnitDragEnd={handleUnitDragEnd}
                onClick={() => handleCellClick(row, col)}
                onUnitClick={() => handleUnitClick(unit)}
                onChampionClick={() => champion && handleChampionClick(champion, row, col)}
                onChampionLongPress={champion ? () => {
                  if (handlers.handleInspectChampion) handlers.handleInspectChampion(champion.owner);
                } : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
