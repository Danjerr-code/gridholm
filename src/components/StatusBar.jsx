export default function StatusBar({ state }) {
  const p1 = state.players[0];
  const p2 = state.players[1];
  const c1 = state.champions[0];
  const c2 = state.champions[1];
  const activePlayerName = state.players[state.activePlayer].name;

  const PHASE_LABELS = {
    draw: 'Draw',
    resource: 'Resource',
    champion_move: 'Champion Move',
    summon_cast: 'Summon / Cast',
    unit_move: 'Unit Move',
    end: 'End Turn',
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm">
      {/* P1 */}
      <div className="flex items-center gap-3">
        <span className="font-bold text-blue-400">{p1.name}</span>
        <HpBar hp={c1.hp} maxHp={c1.maxHp} color="blue" />
        <span className="text-yellow-400">💎 {p1.resources}/10</span>
        <span className="text-gray-400">Hand: {p1.hand.length} | Deck: {p1.deck.length}</span>
      </div>

      {/* Phase / Turn */}
      <div className="text-center">
        <div className="text-xs text-gray-400">Turn {state.turn}</div>
        <div className="font-semibold text-white">{activePlayerName}'s turn</div>
        <div className="text-xs text-purple-300">{PHASE_LABELS[state.phase] || state.phase}</div>
      </div>

      {/* P2 */}
      <div className="flex items-center gap-3 flex-row-reverse">
        <span className="font-bold text-red-400">{p2.name}</span>
        <HpBar hp={c2.hp} maxHp={c2.maxHp} color="red" />
        <span className="text-yellow-400">💎 {p2.resources}/10</span>
        <span className="text-gray-400">Hand: {p2.hand.length} | Deck: {p2.deck.length}</span>
      </div>
    </div>
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
