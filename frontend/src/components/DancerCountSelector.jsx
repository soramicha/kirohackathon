import { useState } from "react";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DancerCountSelector({ session, onDancerCountSet }) {
  const { metadata } = session;
  const [count, setCount] = useState(8); // default to 8 dancers
  const [customCount, setCustomCount] = useState("");

  function handlePresetClick(presetCount) {
    setCount(presetCount);
    setCustomCount("");
  }

  function handleCustomInput(e) {
    const value = e.target.value;
    setCustomCount(value);
    const num = parseInt(value);
    if (!isNaN(num) && num > 0 && num <= 50) {
      setCount(num);
    }
  }

  function handleContinue() {
    if (count > 0) {
      onDancerCountSet(count);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {/* Video info */}
      <div className="bg-gray-900 rounded-xl p-4 flex gap-4 items-center">
        {metadata.thumbnail && (
          <img src={metadata.thumbnail} alt="thumbnail" className="w-24 h-16 object-cover rounded-lg" />
        )}
        <div>
          <p className="font-medium">{metadata.title}</p>
          <p className="text-sm text-gray-400">
            {metadata.uploader} · {formatTime(metadata.duration)}
          </p>
        </div>
      </div>

      {/* Dancer count selection */}
      <div>
        <h2 className="text-lg font-semibold mb-2">How many dancers are in this performance?</h2>
        <p className="text-sm text-gray-400 mb-6">
          This helps the AI detection work better. If fewer dancers are detected than specified, 
          the missing ones will be placed in an offstage area for you to position manually.
        </p>

        {/* Preset buttons */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-300 mb-3">Common group sizes:</p>
          <div className="grid grid-cols-4 gap-2">
            {[4, 6, 8, 10, 12, 16, 20, 24].map((presetCount) => (
              <button
                key={presetCount}
                onClick={() => handlePresetClick(presetCount)}
                className={`py-3 px-4 rounded-lg text-sm font-medium transition ${
                  count === presetCount
                    ? "bg-violet-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {presetCount}
              </button>
            ))}
          </div>
        </div>

        {/* Custom input */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-300 mb-2">Or enter a custom number:</p>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              min="1"
              max="50"
              value={customCount}
              onChange={handleCustomInput}
              placeholder="Enter number..."
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500"
            />
            <span className="text-sm text-gray-400">dancers</span>
          </div>
        </div>

        {/* Current selection display */}
        <div className="bg-violet-950 border border-violet-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center text-sm font-bold">
              {count}
            </div>
            <div>
              <p className="font-medium text-violet-200">
                {count} dancer{count !== 1 ? "s" : ""} selected
              </p>
              <p className="text-xs text-violet-300">
                AI will detect up to {count} dancers per formation
              </p>
            </div>
          </div>
        </div>

        {/* Continue button */}
        <button
          onClick={handleContinue}
          disabled={!count || count <= 0}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-lg font-medium transition"
        >
          Continue to Timestamps
        </button>
      </div>
    </div>
  );
}