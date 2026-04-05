const PHASES = [
  { key: 'begin-turn', label: 'Begin Turn', auto: true  },
  { key: 'action',     label: 'Action',     auto: false },
  { key: 'end-turn',   label: 'End Turn',   auto: true  },
];

// phaseChangeId changes every time the game advances to a new phase,
// forcing the active row to remount and replay the CSS animation.
export default function PhaseTracker({ phase, phaseChangeId }) {
  return (
    <div
      className="flex flex-col justify-center gap-1 flex-shrink-0"
      style={{ width: 140 }}
    >
      <div className="text-xs text-gray-500 px-1 mb-1 font-semibold tracking-wider uppercase">
        Phase
      </div>
      {PHASES.map(({ key, label, auto }, idx) => {
        const isActive = phase === key;
        return (
          <div
            key={isActive ? `${key}-${phaseChangeId}` : key}
            className={
              isActive
                ? `flex items-center gap-1.5 px-2 py-1.5 rounded-md ${auto ? 'phase-tracker-flash' : ''}`
                : 'flex items-center gap-1.5 px-2 py-1.5 rounded-md'
            }
            style={
              isActive
                ? { backgroundColor: 'rgba(217, 119, 6, 0.25)', border: '1px solid rgba(245, 158, 11, 0.6)' }
                : { border: '1px solid transparent' }
            }
          >
            <span
              className={`text-xs font-bold w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0 ${
                isActive ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-500'
              }`}
            >
              {idx + 1}
            </span>
            <span
              className={`text-xs leading-tight ${
                isActive ? 'text-amber-300 font-semibold' : 'text-gray-600'
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
