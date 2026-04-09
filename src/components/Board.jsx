import { useRef, useState } from 'react';
import Cell from './Cell.jsx';

export default function Board({
  state,
  selectedUnit,
  selectMode,
  championMoveTiles,
  summonTiles,
  unitMoveTiles,
  terrainTargetTiles = [],
  spellTargetUids,
  archerShootTargets,
  sacrificeTargetUids = [],
  championAbilityTargetUids = [],
  opponentMoveTiles = new Set(),
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
  const terrainTargetSet = new Set(terrainTargetTiles.map(([r, c]) => `${r},${c}`));

  const boardRef = useRef(null);
  const [dragTargetKey, setDragTargetKey] = useState(null);

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

    // Desktop: Throne tile always shows terrain detail on tap.
    // Mobile: Throne inspect is triggered by long-press (not tap), so treat tap as a normal move target.
    if (isThrone && onInspectTerrain && !isMobile) {
      onInspectTerrain();
    } else if (!isThrone && !cellUnit && !cellChamp && onClearInspect) {
      onClearInspect();
    }

    if (!canInteract) return;
    const key = `${row},${col}`;
    if (selectMode === 'terrain_cast' && terrainTargetSet.has(key)) {
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
      if (unit.owner === myPlayerIndex && !unit.summoned && !unit.moved && commandsUsed < 3) {
        if (unit.uid === selectedUnit) {
          handlers.clearSelection();
        } else {
          handlers.handleSelectUnit(unit.uid);
        }
      }
    }
  }

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <div ref={boardRef} className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
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
                isOpponentMoveTile={opponentMoveTiles.has(key)}
                isDragTarget={dragTargetKey === key && unitMoveSet.has(key)}
                isTerrainTarget={terrainTargetSet.has(key)}
                terrain={terrain}
                isSelected={unit?.uid === selectedUnit}
                isSpellTarget={isSpellTarget}
                isChampionSpellTarget={isChampionSpellTarget}
                isArcherTarget={isArcherTarget}
                isSacrificeTarget={isSacrificeTarget}
                isAbilityTarget={isAbilityTarget}
                state={state}
                myPlayerIndex={myPlayerIndex}
                isMobile={isMobile}
                onUnitLongPress={onLongPressUnit}
                onLongPressDismiss={onLongPressDismiss}
                onThroneLongPress={onInspectTerrain}
                onUnitDragStart={handleUnitDragStart}
                onUnitDragMove={handleUnitDragMove}
                onUnitDragEnd={handleUnitDragEnd}
                onClick={() => handleCellClick(row, col)}
                onUnitClick={() => handleUnitClick(unit)}
                onChampionClick={() => {
                  if (selectMode === 'spell' && isChampionSpellTarget) {
                    handlers.handleSpellTarget('champion' + champion.owner);
                    return;
                  }
                  if (selectMode === 'champion_ability') {
                    return;
                  }
                  if (selectMode === 'unit_move' && champion && champion.owner !== activePlayer) {
                    const key = `${row},${col}`;
                    if (unitMoveSet.has(key)) {
                      handlers.handleMoveUnit(row, col);
                      return;
                    }
                  }
                  if (handlers.handleInspectChampion && champion) {
                    handlers.handleInspectChampion(champion.owner);
                  }
                  if (!canInteract) return;
                  if (phase === 'action' && champion && champion.owner === activePlayer && handlers.handleSelectChampion) {
                    handlers.handleSelectChampion();
                  }
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
