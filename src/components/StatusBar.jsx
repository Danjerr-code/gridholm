export default function StatusBar({ state }) {
  const p1 = state.players[0];
  const p2 = state.players[1];
  const c1 = state.champions[0];
  const c2 = state.champions[1];
  const activePlayerName = state.players[state.activePlayer].name;

  const PHASE_LABELS = {
    'begin-turn': 'Begin Turn',
    action: 'Action',
    'end-turn': 'End Turn',
  };

  return (
    <>
      {/* Mobile: compact 3-column layout */}
      <div className="sm:hidden grid grid-cols-3 items-start bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 leading-tight">
        <div className="flex flex-col gap-0.5 text-[11px] text-blue-400">
          <span className="font-bold">{p1.name} {c1.hp}/{c1.maxHp}</span>
          <span className="text-gray-300">{p1.resources}/10 res</span>
          <span className="text-gray-400">H:{p1.hand.length} D:{p1.deck.length}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 text-[11px] text-center">
          <span className="font-bold text-white">Turn {state.turn}</span>
          <span className="text-gray-300">{activePlayerName}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-[11px] text-red-400">
          <span className="font-bold">{p2.name} {c2.hp}/{c2.maxHp}</span>
          <span className="text-gray-300">{p2.resources}/10 res</span>
          <span className="text-gray-400">H:{p2.hand.length} D:{p2.deck.length}</span>
        </div>
      </div>

      {/* Desktop: full layout */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-between gap-2 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-blue-400">{p1.name}</span>
          <HpBar hp={c1.hp} maxHp={c1.maxHp} color="blue" />
          <span className="text-yellow-400">💎 {p1.resources}/10</span>
          <span className="text-gray-400 text-xs">Hand: {p1.hand.length} | Deck: {p1.deck.length}</span>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Turn {state.turn}</div>
          <div className="font-semibold text-white text-sm">{activePlayerName}'s turn</div>
          <div className="text-xs text-purple-300">{PHASE_LABELS[state.phase] || state.phase}</div>
        </div>
        <div className="flex items-center gap-3 flex-row-reverse flex-wrap">
          <span className="font-bold text-red-400">{p2.name}</span>
          <HpBar hp={c2.hp} maxHp={c2.maxHp} color="red" />
          <span className="text-yellow-400">💎 {p2.resources}/10</span>
          <span className="text-gray-400 text-xs">Hand: {p2.hand.length} | Deck: {p2.deck.length}</span>
        </div>
      </div>
    </>
  );
}

function HpBar({ hp, maxHp, color }) {
  const pct = Math.max(0, (hp / maxHp) * 100);
  const barColor = color === 'blue' ? 'bg-blue-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1">
      <div className="w-24 h-3 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-300">{hp}/{maxHp}</span>
    </div>
  );
}
