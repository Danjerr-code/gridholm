import Cell from './Cell.jsx';

export default function Board({
  state,
  selectedUnit,
  selectMode,
  championMoveTiles,
  summonTiles,
  unitMoveTiles,
  spellTargetUids,
  archerShootTargets,
  handlers,
  onInspectUnit,
  onClearInspect,
}) {
  const { phase, activePlayer, units, champions } = state;

  const isP1Turn = activePlayer === 0;

  const champMoveSet = new Set(championMoveTiles.map(([r, c]) => `${r},${c}`));
  const summonSet = new Set(summonTiles.map(([r, c]) => `${r},${c}`));
  const unitMoveSet = new Set(unitMoveTiles.map(([r, c]) => `${r},${c}`));

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
    // Clicking an empty cell clears the detail panel
    const cellUnit = units.find(u => u.row === row && u.col === col);
    const cellChamp = champions.find(c => c.row === row && c.col === col);
    if (!cellUnit && !cellChamp && onClearInspect) onClearInspect();

    if (!isP1Turn) return;
    const key = `${row},${col}`;
    if (phase === 'champion_move' && champMoveSet.has(key)) {
      handlers.handleChampionMoveTile(row, col);
    } else if (selectMode === 'summon' && summonSet.has(key)) {
      handlers.handleSummonOnTile(row, col);
    } else if (selectMode === 'unit_move' && unitMoveSet.has(key)) {
      handlers.handleMoveUnit(row, col);
    }
  }

  function handleUnitClick(unit) {
    // Always inspect the clicked unit in the detail panel
    if (onInspectUnit) onInspectUnit(unit);

    if (!isP1Turn) return;
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
    if (phase === 'unit_move') {
      // Enemy unit on a valid move tile — treat as move-to (combat)
      if (selectMode === 'unit_move' && unit.owner !== activePlayer) {
        const key = `${unit.row},${unit.col}`;
        if (unitMoveSet.has(key)) {
          handlers.handleMoveUnit(unit.row, unit.col);
          return;
        }
      }
      if (unit.owner === 0 && !unit.summoned && !unit.moved) {
        handlers.handleSelectUnit(unit.uid);
      }
    }
  }

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => {
            const key = `${row},${col}`;
            const unit = units.find(u => u.row === row && u.col === col) || null;
            const champion = champions.find(c => c.row === row && c.col === col) || null;
            const isSpellTarget = spellTargetUids.includes(unit?.uid);
            const isArcherTarget = archerShootTargets.includes(unit?.uid);

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
                isSelected={unit?.uid === selectedUnit}
                isSpellTarget={isSpellTarget}
                isArcherTarget={isArcherTarget}
                onClick={() => handleCellClick(row, col)}
                onUnitClick={() => handleUnitClick(unit)}
                onChampionClick={() => {
                  if (selectMode === 'unit_move' && champion && champion.owner !== activePlayer) {
                    const key = `${row},${col}`;
                    if (unitMoveSet.has(key)) handlers.handleMoveUnit(row, col);
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
