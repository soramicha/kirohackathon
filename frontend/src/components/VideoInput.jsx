import { useState } from "react";
import { processVideo } from "../api";
import { extractYouTubeCookies, promptUserForYouTubeSignIn } from "../utils/cookieExtractor";

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
      // Check if it's a YouTube URL
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      let cookies = null;

      if (isYouTube) {
        // Try to extract YouTube cookies first
        cookies = await extractYouTubeCookies();
        
        // If no cookies found, prompt user to sign in
        if (!cookies?.hasAuth) {
          setLoading(false);
          cookies = await promptUserForYouTubeSignIn();
          setLoading(true);
        }
      }

      const data = await processVideo(url.trim(), cookies?.cookies);
      // go straight to timestamp selector — no scan needed
      onProcessed({ ...data, auto_timestamps: [] });
    } catch (err) {
      const errorMessage = err.response?.data?.detail || err.message || "Failed to process video. Check the URL and try again.";
      
      // Check for YouTube authentication errors
      if (errorMessage.includes('bot detection') || errorMessage.includes('Sign in to confirm')) {
        setError(
          "YouTube requires authentication to download this video. Please sign into YouTube in this browser and try again. " +
          "If you're already signed in, the video might be age-restricted or private."
        );
      } else {
        setError(errorMessage);
      }
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

      <div className="text-center">
        <p className="text-xs text-gray-600 mb-2">
          Works best with practice room videos — fixed camera, clear floor, good lighting.
        </p>
        <p className="text-xs text-blue-400">
          💡 For YouTube videos: Make sure you're signed into YouTube for best results
        </p>
      </div>
    </div>
  );
}
