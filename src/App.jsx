import { useGameState } from './hooks/useGameState.js';
import StatusBar from './components/StatusBar.jsx';
import Board from './components/Board.jsx';
import Hand from './components/Hand.jsx';
import Log from './components/Log.jsx';
import PhaseTracker from './components/PhaseTracker.jsx';

const PHASE_GUIDANCE = {
  draw: 'Drawing card…',
  resource: 'Gaining resource…',
  champion_move: 'Move your champion (click a blue tile) or skip.',
  summon_cast: 'Play cards from your hand, then click "End Phase".',
  unit_move: 'Select a unit, then click its destination. Click "End Phase" when done.',
  end: 'Click "End Turn" to pass to opponent.',
};

export default function App() {
  const {
    state,
    selectedCard,
    selectedUnit,
    selectMode,
    championMoveTiles,
    summonTiles,
    unitMoveTiles,
    spellTargetUids,
    archerShootTargets,
    handlers,
  } = useGameState();

  const isP1Turn = state.activePlayer === 0;
  const { phase, winner } = state;

  const p1 = state.players[0];
  const p2 = state.players[1];

  let guidance = isP1Turn ? (PHASE_GUIDANCE[phase] || '') : 'AI is thinking…';
  if (selectMode === 'summon') guidance = 'Click a green tile to summon the unit.';
  if (selectMode === 'spell') guidance = 'Click a highlighted unit to target the spell.';
  if (selectMode === 'unit_move') guidance = 'Click a blue tile to move the unit. Or select another unit.';
  if (selectMode === 'archer_target') guidance = 'Click an enemy unit (pink highlight) for Elf Archer to shoot.';

  const selectedUnitObj = selectedUnit ? state.units.find(u => u.uid === selectedUnit) : null;
  const showArcherShoot = selectedUnitObj?.id === 'elfarcher'
    && !selectedUnitObj.moved
    && !selectedUnitObj.summoned
    && selectMode === 'unit_move'
    && isP1Turn;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-2 flex flex-col gap-2">
      {/* Winner overlay */}
      {winner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-yellow-500 rounded-2xl p-8 text-center shadow-2xl">
            <div className="text-4xl mb-4">🏆</div>
            <h2 className="text-2xl font-bold text-yellow-400 mb-2">{winner} wins!</h2>
            <p className="text-gray-300 mb-6">The champion has fallen.</p>
            <button
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-2 rounded-lg"
              onClick={handlers.handleNewGame}
            >
              New Game
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-bold text-amber-400 tracking-wide">GRIDHOLM</h1>
        <button
          className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-2 py-1 rounded"
          onClick={handlers.handleNewGame}
        >
          New Game
        </button>
      </div>

      {/* Status Bar */}
      <StatusBar state={state} />

      {/* Main layout */}
      <div className="flex gap-2 flex-1">
        {/* Phase tracker (far left) */}
        <PhaseTracker
          phase={phase}
          phaseChangeId={`${state.turn}-${state.activePlayer}-${phase}`}
        />

        {/* Board + hands + controls */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {/* AI hand (face down) */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
            <div className="text-xs text-red-400 px-2 pt-1 font-semibold">AI — {p2.hand.length} cards</div>
            <Hand player={p2} resources={p2.resources} isActive={false} selectedCard={null} onPlayCard={() => {}} />
          </div>

          {/* Board */}
          <Board
            state={state}
            selectedUnit={selectedUnit}
            selectMode={selectMode}
            championMoveTiles={championMoveTiles}
            summonTiles={summonTiles}
            unitMoveTiles={unitMoveTiles}
            spellTargetUids={spellTargetUids}
            archerShootTargets={archerShootTargets}
            handlers={handlers}
          />

          {/* Guidance + action buttons */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-300 flex-1">{guidance}</span>

            {isP1Turn && (
              <>
                {phase === 'champion_move' && (
                  <ActionBtn onClick={handlers.handleSkipChampionMove} label="Skip Champion Move" />
                )}

                {phase === 'summon_cast' && selectMode === 'summon' && (
                  <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="gray" />
                )}
                {phase === 'summon_cast' && selectMode === 'spell' && (
                  <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel Spell" variant="gray" />
                )}
                {phase === 'summon_cast' && (
                  <ActionBtn onClick={handlers.handleEndSummonCast} label="End Phase →" />
                )}

                {phase === 'unit_move' && showArcherShoot && (
                  <ActionBtn
                    onClick={() => handlers.handleArcherSelectTarget(selectedUnit)}
                    label="Archer: Shoot"
                    variant="pink"
                  />
                )}
                {phase === 'unit_move' && selectedUnit && (
                  <ActionBtn onClick={handlers.clearSelection} label="Deselect" variant="gray" />
                )}
                {phase === 'unit_move' && (
                  <ActionBtn onClick={handlers.handleEndUnitMove} label="End Phase →" />
                )}

                {phase === 'end' && (
                  <ActionBtn onClick={handlers.handleEndTurn} label="End Turn ⏎" variant="green" />
                )}
              </>
            )}
          </div>

          {/* P1 hand */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
            <div className="text-xs text-blue-400 px-2 pt-1 font-semibold">
              {p1.name} — {p1.resources}/10 💎
              {phase === 'summon_cast' && isP1Turn ? '  (click cards to play)' : ''}
            </div>
            <Hand
              player={p1}
              resources={p1.resources}
              isActive={true}
              canPlay={isP1Turn && phase === 'summon_cast'}
              selectedCard={selectedCard}
              onPlayCard={handlers.handlePlayCard}
            />
          </div>
        </div>

        {/* Log (hidden on small screens) */}
        <div className="w-48 flex-shrink-0 hidden sm:block">
          <div className="text-xs text-gray-400 mb-1 px-1">Game Log</div>
          <Log entries={state.log} />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ onClick, label, variant = 'blue' }) {
  const colors = {
    blue: 'bg-blue-600 hover:bg-blue-500 text-white',
    green: 'bg-green-600 hover:bg-green-500 text-white',
    gray: 'bg-gray-600 hover:bg-gray-500 text-white',
    pink: 'bg-pink-600 hover:bg-pink-500 text-white',
  };
  return (
    <button
      className={`text-xs font-semibold px-3 py-1.5 rounded ${colors[variant]}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
