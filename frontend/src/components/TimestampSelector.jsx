import { useState } from "react";
import { analyzeAll, extractFrames, scanFormations } from "../api";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TimestampSelector({ session, dancerCount, onFormationsReady }) {
  const { session_id, metadata } = session;
  const [timestamps, setTimestamps] = useState([]); // list of numbers (seconds)
  const [customInput, setCustomInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [preset, setPreset] = useState("balanced");

  function parseInput(val) {
    const parts = val.trim().split(":");
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    return parseFloat(val);
  }

  function addTimestamp() {
    const seconds = parseInput(customInput);
    if (!isNaN(seconds) && seconds >= 0 && !timestamps.includes(seconds)) {
      setTimestamps((prev) => [...prev, seconds].sort((a, b) => a - b));
    }
    setCustomInput("");
  }

  function removeTimestamp(ts) {
    setTimestamps((prev) => prev.filter((t) => t !== ts));
  }

  async function handleAutoScan() {
    setScanning(true);
    setError(null);
    try {
      const result = await scanFormations(session_id, preset);
      const scanned = result.auto_timestamps.map((t) => t.timestamp);
      setTimestamps((prev) => {
        const merged = [...new Set([...prev, ...scanned])].sort((a, b) => a - b);
        return merged;
      });
    } catch (err) {
      setError("Auto-scan failed. Add timestamps manually.");
    } finally {
      setScanning(false);
    }
  }

  async function handleAnalyze() {
    if (timestamps.length === 0) return;
    setAnalyzing(true);
    setError(null);
    try {
      await extractFrames(session_id, timestamps);
      const result = await analyzeAll(session_id, dancerCount);
      onFormationsReady(result.formations);
    } catch (err) {
      setError(err.response?.data?.detail || "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
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

      {/* Manual timestamp entry — primary */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Add timestamps
        </h2>
        <p className="text-xs text-gray-600 mb-3">
          Enter the time of each formation you want to map (e.g. 0:15, 1:32, 2:45)
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTimestamp()}
            placeholder="e.g. 1:23"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 font-mono text-sm"
          />
          <button
            onClick={addTimestamp}
            className="bg-violet-600 hover:bg-violet-500 px-5 py-2.5 rounded-lg text-sm font-medium transition"
          >
            Add
          </button>
        </div>
      </div>

      {/* Selected timestamps */}
      {timestamps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {timestamps.map((ts) => (
            <span
              key={ts}
              className="flex items-center gap-1.5 bg-violet-900 text-violet-200 px-3 py-1 rounded-lg text-sm font-mono"
            >
              {formatTime(ts)}
              <button
                onClick={() => removeTimestamp(ts)}
                className="text-violet-400 hover:text-white transition text-xs"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Auto-scan — secondary option */}
      <div className="border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-medium">Auto-detect formations</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Scans the full video for stable groupings (~30-60s)
            </p>
          </div>
          <button
            onClick={handleAutoScan}
            disabled={scanning}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm transition flex items-center gap-2 flex-shrink-0"
          >
            {scanning ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Scanning…
              </>
            ) : "Auto-scan"}
          </button>
        </div>
        
        {/* Detection preset selector */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Detection mode:</span>
          {["strict", "balanced", "loose"].map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-2.5 py-1 rounded transition ${
                preset === p
                  ? "bg-violet-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2">
          {preset === "strict" && "Fewer false positives, might miss quick formations"}
          {preset === "balanced" && "Good default for most practice videos"}
          {preset === "loose" && "Catches more formations, may include transitions"}
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleAnalyze}
        disabled={analyzing || timestamps.length === 0}
        className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
      >
        {analyzing ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating formation maps…
          </>
        ) : (
          `Generate ${timestamps.length} Formation Map${timestamps.length !== 1 ? "s" : ""}`
        )}
      </button>
    </div>
  );
}
