export default function Log({ entries }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 h-64 overflow-y-auto flex flex-col-reverse">
      <div>
        {entries.slice(0, 20).map((entry, i) => (
          <div key={i} className="text-xs text-gray-300 py-0.5 border-b border-gray-800 last:border-0">
            {entry}
          </div>
        ))}
      </div>
    </div>
  );
}
