export default function Log({ entries }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 overflow-y-auto flex flex-col-reverse flex-1">
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
