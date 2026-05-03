import { useState } from "react";
import { processVideo, uploadVideo } from "../api";

export default function VideoInput({ onProcessed }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadMode, setUploadMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

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

  async function handleFileUpload(e) {
    e.preventDefault();
    if (!selectedFile) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await uploadVideo(selectedFile);
      onProcessed({ ...data, auto_timestamps: [] });
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to upload video. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 500MB)
      const maxSize = 500 * 1024 * 1024;
      if (file.size > maxSize) {
        setError("File too large. Maximum size is 500MB.");
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 px-4">
      <div className="text-center max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
          Turn any dance video into a{" "}
          <span className="text-violet-400">formation map</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-xl">
          {uploadMode 
            ? "Upload a video file from your device to analyze formations."
            : "Paste a YouTube link from a practice video or showcase performance."
          }
          {" "}FormationAI will detect every dancer and generate a top-down view of
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
          Paste a YouTube link from a practice video or showcase performance.
          FormationAI will detect every dancer and generate a top-down view of
          each formation.
        </p>
      </div>

      {/* Toggle between URL and Upload */}
      <div className="flex gap-2 bg-gray-900 rounded-lg p-1">
        <button
          onClick={() => {
            setUploadMode(false);
            setSelectedFile(null);
            setError(null);
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            !uploadMode
              ? "bg-violet-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          YouTube URL
        </button>
        <button
          onClick={() => {
            setUploadMode(true);
            setUrl("");
            setError(null);
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            uploadMode
              ? "bg-violet-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Upload File
        </button>
      </div>

      {/* URL Input Form */}
      {!uploadMode && (
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
      <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition text-center md:text-left"
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
          <div className="flex items-center justify-center gap-3 text-sm text-gray-400 bg-gray-900 rounded-lg px-4 py-3">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            Downloading video… (~10-15s)
          </div>

          {loading && (
            <div className="flex items-center gap-3 text-sm text-gray-400 bg-gray-900 rounded-lg px-4 py-3">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              Downloading video… (~10-15s)
            </div>
          )}
        </form>
      )}

      {/* File Upload Form */}
      {uploadMode && (
        <form onSubmit={handleFileUpload} className="w-full max-w-xl flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="video-file"
              className="flex flex-col items-center justify-center bg-gray-900 border-2 border-dashed border-gray-700 rounded-lg px-6 py-8 cursor-pointer hover:border-violet-500 transition"
            >
              {selectedFile ? (
                <div className="text-center">
                  <div className="text-4xl mb-2">📹</div>
                  <p className="text-white font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  <p className="text-xs text-violet-400 mt-2">Click to change file</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-2">📁</div>
                  <p className="text-white font-medium">Click to select video</p>
                  <p className="text-sm text-gray-400 mt-1">
                    MP4, MOV, AVI, WebM, MKV (max 500MB)
                  </p>
                </div>
              )}
              <input
                id="video-file"
                type="file"
                accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska"
                onChange={handleFileSelect}
                className="hidden"
                disabled={loading}
              />
            </label>

            {selectedFile && (
              <button
                type="submit"
                disabled={loading}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition"
              >
                {loading ? "Uploading…" : "Upload & Analyze"}
              </button>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-3 text-sm text-gray-400 bg-gray-900 rounded-lg px-4 py-3">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              Uploading video… this may take a minute
            </div>
          )}
        </form>
      )}

      {/* Error Message */}
      {error && (
        <div className="w-full max-w-xl text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="text-center">
        <p className="text-xs text-gray-600 mb-2">
          Works best with practice room videos — fixed camera, clear floor, good lighting.
        </p>
      </div>
    </div>
  );
}
