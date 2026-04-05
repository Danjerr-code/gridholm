import { useEffect, useRef } from 'react';

export default function Log({ entries }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  return (
    <div ref={containerRef} className="bg-gray-900 border border-gray-700 rounded-lg p-2 overflow-y-auto flex flex-col flex-1">
      <div>
        {entries.map((entry, i) => (
          <div key={i} className="text-xs text-gray-300 py-0.5 border-b border-gray-800 last:border-0">
            {entry}
          </div>
        ))}
      </div>
    </div>
  );
}
