import { FACTION_INFO } from '../engine/cards.js';

const FACTIONS = Object.values(FACTION_INFO);

export default function DeckSelect({ onSelect, waitingForOpponent = false, selectedDeck = null, opponentSelected = false }) {
  if (waitingForOpponent) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold text-amber-400 mb-4">GRIDHOLM</h1>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 flex flex-col gap-4">
            <PlayerStatusRow youSelected={true} opponentSelected={opponentSelected} />
            <div
              className="text-lg font-bold"
              style={{ color: FACTION_INFO[selectedDeck]?.color || '#fff' }}
            >
              {FACTION_INFO[selectedDeck]?.name ?? 'Unknown'} selected
            </div>
            <p className="text-gray-400 text-sm">Waiting for opponent to choose their deck…</p>
            <div className="flex justify-center">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-amber-400 tracking-widest mb-1">GRIDHOLM</h1>
        <p className="text-gray-400 text-sm">Choose your faction</p>
      </div>

      {opponentSelected !== null && (
        <PlayerStatusRow youSelected={false} opponentSelected={opponentSelected} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
        {FACTIONS.map(faction => (
          <FactionCard
            key={faction.id}
            faction={faction}
            onSelect={() => onSelect(faction.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerStatusRow({ youSelected, opponentSelected }) {
  return (
    <div className="flex gap-3 justify-center text-xs">
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full border ${youSelected ? 'border-green-500 text-green-400' : 'border-gray-600 text-gray-400'}`}>
        {youSelected ? '✓' : '…'} You
      </div>
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full border ${opponentSelected ? 'border-green-500 text-green-400' : 'border-gray-600 text-gray-400'}`}>
        {opponentSelected ? '✓' : '…'} Opponent
      </div>
    </div>
  );
}

function FactionCard({ faction, onSelect }) {
  return (
    <div
      className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-3 hover:border-opacity-100 transition-all cursor-pointer hover:scale-[1.02]"
      style={{ '--faction-color': faction.color, borderColor: `${faction.color}55` }}
      onClick={onSelect}
    >
      {/* Color block / faction indicator */}
      <div
        className="w-full h-2 rounded-full"
        style={{ backgroundColor: faction.color }}
      />

      <div>
        <h2
          className="text-lg font-bold"
          style={{ color: faction.color }}
        >
          {faction.name}
        </h2>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {faction.mechanic}
        </span>
      </div>

      <p className="text-gray-300 text-xs leading-relaxed flex-1">
        {faction.description}
      </p>

      <button
        className="w-full py-2 rounded-lg text-sm font-bold text-black transition-opacity hover:opacity-90"
        style={{ backgroundColor: faction.color }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        Select
      </button>
    </div>
  );
}
