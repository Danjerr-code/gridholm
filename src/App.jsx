import { useGameState } from './hooks/useGameState.js';
import StatusBar from './components/StatusBar.jsx';
import Board from './components/Board.jsx';
import Hand from './components/Hand.jsx';
import Log from './components/Log.jsx';
import PhaseTracker from './components/PhaseTracker.jsx';

const PHASE_GUIDANCE = {
  draw: 'Drawing card…',
  resource: 'Gaining resource…',
  action: 'Move your champion, play cards, and move units in any order. Click End Phase when done.',
  end: 'Click "End Turn" to pass to opponent.',
  discard: 'You have too many cards. Click a card to discard.',
};

export default function App() {
  const {
    state,
    selectedCard,
    selectedUnit,
    selectMode,
    inspectedItem,
    championMoveTiles,
    summonTiles,
    unitMoveTiles,
    spellTargetUids,
    archerShootTargets,
    handlers,
  } = useGameState();

  const isP1Turn = state.activePlayer === 0;
  const { phase, winner, pendingDiscard } = state;

  const p1 = state.players[0];
  const p2 = state.players[1];

  let guidance = isP1Turn ? (PHASE_GUIDANCE[phase] || '') : 'AI is thinking…';
  if (pendingDiscard && isP1Turn) guidance = PHASE_GUIDANCE.discard;
  if (selectMode === 'summon') guidance = 'Click a green tile to summon the unit.';
  if (selectMode === 'spell') guidance = 'Click a highlighted unit to target the spell.';
  if (selectMode === 'unit_move') guidance = 'Click a blue tile to move the unit. Or select another unit.';
  if (selectMode === 'archer_target') guidance = 'Click an enemy unit (pink highlight) for Elf Archer to shoot.';

  const selectedUnitObj = selectedUnit ? state.units.find(u => u.uid === selectedUnit) : null;
  const showArcherShoot = selectedUnitObj?.id === 'elfarcher'
    && !selectedUnitObj.moved
    && !selectedUnitObj.summoned
    && selectMode === 'unit_move'
    && phase === 'action'
    && isP1Turn;

  return (
    <div className="h-screen overflow-hidden bg-gray-950 text-white p-2 flex flex-col gap-2">
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

      {/* Middle content row: board + log (does not include bottom bar) */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left column: phase tracker + card detail */}
        <div className="flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ width: 140, minHeight: 0 }}>
          <PhaseTracker
            phase={phase}
            phaseChangeId={`${state.turn}-${state.activePlayer}-${phase}`}
          />
          <CardDetailPanel inspectedItem={inspectedItem} state={state} />
        </div>

        {/* Center: board only */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
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
            onInspectUnit={handlers.handleInspectUnit}
            onClearInspect={handlers.handleClearInspect}
            onInspectTerrain={handlers.handleInspectTerrain}
          />
        </div>

        {/* Right sidebar: game log */}
        <div className="w-48 flex-shrink-0 hidden sm:flex flex-col gap-2" style={{ minHeight: 0 }}>
          <div className="text-xs text-gray-400 mb-1 px-1">Game Log</div>
          <Log entries={state.log} />
        </div>
      </div>

      {/* Bottom bar: guidance + action buttons */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center flex-shrink-0">
        <span className="text-xs text-gray-300 sm:flex-1">{guidance}</span>

        {isP1Turn && (
          <>
            {phase === 'action' && selectMode === 'summon' && (
              <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel" variant="gray" />
            )}
            {phase === 'action' && selectMode === 'spell' && (
              <ActionBtn onClick={handlers.handleCancelSpell} label="Cancel Spell" variant="gray" />
            )}
            {phase === 'action' && showArcherShoot && (
              <ActionBtn
                onClick={() => handlers.handleArcherSelectTarget(selectedUnit)}
                label="Archer: Shoot"
                variant="pink"
              />
            )}
            {phase === 'action' && selectedUnit && (
              <ActionBtn onClick={handlers.clearSelection} label="Deselect" variant="gray" />
            )}
            {phase === 'action' && (
              <ActionBtn onClick={handlers.handleEndAction} label="End Phase →" fullWidth />
            )}

            {phase === 'end' && !pendingDiscard && (
              <ActionBtn onClick={handlers.handleEndTurn} label="End Turn ⏎" variant="green" fullWidth />
            )}
            {pendingDiscard && (
              <span className="text-xs text-yellow-400 font-semibold">Discard a card to continue</span>
            )}
          </>
        )}
      </div>

      {/* Bottom bar: P1 hand */}
      <div className={`bg-gray-800/50 border rounded-lg flex-shrink-0 ${pendingDiscard && isP1Turn ? 'border-yellow-500' : 'border-gray-700'}`}>
        <div className="text-xs text-blue-400 px-2 pt-1 font-semibold">
          {p1.name} — {p1.resources}/10 💎
          {phase === 'action' && isP1Turn ? '  (click cards to play)' : ''}
          {pendingDiscard && isP1Turn ? '  — click a card to discard' : ''}
        </div>
        <Hand
          player={p1}
          resources={p1.resources}
          isActive={true}
          canPlay={isP1Turn && phase === 'action'}
          pendingDiscard={pendingDiscard && isP1Turn}
          selectedCard={selectedCard}
          onPlayCard={handlers.handlePlayCard}
          onDiscardCard={handlers.handleDiscardCard}
          onInspectCard={handlers.handleInspectCard}
        />
      </div>
    </div>
  );
}

function CardDetailPanel({ inspectedItem, state }) {
  let content = null;

  if (inspectedItem?.type === 'unit') {
    // Look up live unit from state
    const unit = state.units.find(u => u.uid === inspectedItem.uid);
    if (unit) {
      const ownerLabel = unit.owner === 0 ? 'Friendly' : 'Enemy';
      const ownerColor = unit.owner === 0 ? 'text-blue-400' : 'text-red-400';
      content = (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-start">
            <span className="font-bold text-white text-xs leading-tight">{unit.name}</span>
            <span className={`text-[10px] ${ownerColor}`}>{ownerLabel}</span>
          </div>
          {unit.unitType && <div className="text-gray-400 text-[10px]">{unit.unitType}</div>}
          <div className="grid grid-cols-3 gap-x-1 text-[10px] mt-0.5">
            <span className="text-red-400">⚔ {unit.atk + (unit.atkBonus || 0)}</span>
            <span className="text-green-400">♥ {unit.hp}/{unit.maxHp}</span>
            <span className="text-blue-400">⚡ {unit.spd + (unit.speedBonus || 0)}</span>
          </div>
          {unit.shield > 0 && (
            <div className="text-cyan-400 text-[10px]">🛡 Shield: {unit.shield}</div>
          )}
          {unit.rules && (
            <div className="text-gray-400 text-[10px] leading-tight mt-1 border-t border-gray-700 pt-1">
              {unit.rules}
            </div>
          )}
        </div>
      );
    }
  } else if (inspectedItem?.type === 'terrain') {
    content = (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-start">
          <span className="font-bold text-white text-xs leading-tight">Throne</span>
        </div>
        <div className="text-amber-700 text-[10px] font-semibold">Terrain</div>
        <div className="text-gray-400 text-[10px] leading-tight mt-1 border-t border-gray-700 pt-1">
          End your turn with your champion here to deal 4 damage to the enemy champion.
        </div>
      </div>
    );
  } else if (inspectedItem?.type === 'card') {
    const card = inspectedItem.card;
    content = (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-start">
          <span className="font-bold text-white text-xs leading-tight">{card.name}</span>
          <span className="text-yellow-400 font-bold text-xs">{card.cost}💎</span>
        </div>
        <div className="text-gray-400 text-[10px]">
          {card.type === 'spell' ? 'Spell' : card.unitType}
        </div>
        {card.type === 'unit' && (
          <div className="grid grid-cols-3 gap-x-1 text-[10px] mt-0.5">
            <span className="text-red-400">⚔ {card.atk}</span>
            <span className="text-green-400">♥ {card.hp}</span>
            <span className="text-blue-400">⚡ {card.spd}</span>
          </div>
        )}
        {card.rules && (
          <div className="text-gray-400 text-[10px] leading-tight mt-1 border-t border-gray-700 pt-1">
            {card.rules}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="bg-gray-900 border border-gray-700 rounded-lg p-2 flex flex-col"
      style={{ flex: 1, minHeight: 0 }}
    >
      <div className="text-xs text-gray-400 mb-1.5 px-0 font-semibold">Card Detail</div>
      <div className="flex-1 overflow-y-auto">
        {content || (
          <div className="text-gray-600 text-[10px] italic leading-snug">
            Click a card or unit to inspect
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ onClick, label, variant = 'blue', fullWidth = false }) {
  const colors = {
    blue: 'bg-blue-600 hover:bg-blue-500 text-white',
    green: 'bg-green-600 hover:bg-green-500 text-white',
    gray: 'bg-gray-600 hover:bg-gray-500 text-white',
    pink: 'bg-pink-600 hover:bg-pink-500 text-white',
  };
  return (
    <button
      className={`text-xs font-semibold px-3 py-1.5 rounded ${colors[variant]} ${fullWidth ? 'w-full sm:w-auto' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
