import { useState } from "react";
import { processVideo } from "../api";

export default function VideoInput({ onProcessed }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await processVideo(url.trim());
      // go straight to timestamp selector — no scan needed
      onProcessed({ ...data, auto_timestamps: [] });
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to process video. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-3">
          Turn any dance video into a{" "}
          <span className="text-violet-400">formation map</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-xl">
          Paste a YouTube link from a practice video or showcase performance.
          FormationAI will detect every dancer and generate a top-down view of
          each formation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xl flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition"
          >
            {loading ? "Downloading…" : "Analyze"}
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-sm text-gray-400 bg-gray-900 rounded-lg px-4 py-3">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            Downloading video… (~10-15s)
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </form>

      <p className="text-xs text-gray-600">
        Works best with practice room videos — fixed camera, clear floor, good lighting.
      </p>
    </div>
  );
}
