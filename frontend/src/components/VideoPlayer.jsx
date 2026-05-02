import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

const VideoPlayer = forwardRef(function VideoPlayer(
  {
    src,
    formations = [],
    onTimeUpdate,
    onFormationChange,
    sessionId,
  },
  ref
) {
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const animFrameRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const containerRef = useRef(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    seekTo(time) {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    get currentTime() {
      return videoRef.current?.currentTime ?? 0;
    },
    play() {
      videoRef.current?.play();
    },
    pause() {
      videoRef.current?.pause();
    },
  }));

  // Restore playback position from localStorage
  useEffect(() => {
    if (!sessionId || !videoRef.current) return;
    const saved = localStorage.getItem(`playback_${sessionId}`);
    if (saved) {
      const pos = parseFloat(saved);
      if (!isNaN(pos) && pos > 0) {
        videoRef.current.currentTime = pos;
      }
    }
  }, [sessionId, src]);

  // Save playback position to localStorage
  const savePosition = useCallback(
    (time) => {
      if (sessionId && time > 0) {
        localStorage.setItem(`playback_${sessionId}`, String(time));
      }
    },
    [sessionId]
  );

  // Sync engine: use requestAnimationFrame for smooth formation updates
  const lastFormationIdx = useRef(-1);

  const syncFormation = useCallback(() => {
    if (!videoRef.current || !formations.length) return;
    const t = videoRef.current.currentTime;

    // Find the most recent formation at or before current time
    let idx = -1;
    for (let i = formations.length - 1; i >= 0; i--) {
      if ((formations[i].timestamp ?? 0) <= t + 0.1) {
        idx = i;
        break;
      }
    }

    if (idx !== lastFormationIdx.current) {
      lastFormationIdx.current = idx;
      onFormationChange?.(idx >= 0 ? idx : 0);
    }
  }, [formations, onFormationChange]);

  const tick = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    onTimeUpdate?.(t);
    syncFormation();

    // Update buffered
    const buf = videoRef.current.buffered;
    if (buf.length > 0) {
      setBuffered(buf.end(buf.length - 1));
    }

    if (!videoRef.current.paused) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [onTimeUpdate, syncFormation]);

  // Start/stop animation frame loop
  useEffect(() => {
    if (playing) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, tick]);

  // Video event handlers
  function handleLoadedMetadata() {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setLoading(false);
    }
  }

  function handlePlay() {
    setPlaying(true);
  }

  function handlePause() {
    setPlaying(false);
    if (videoRef.current) {
      savePosition(videoRef.current.currentTime);
      syncFormation();
    }
  }

  function handleEnded() {
    setPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
    }
    if (sessionId) {
      localStorage.removeItem(`playback_${sessionId}`);
    }
  }

  function handleError() {
    const video = videoRef.current;
    let msg = "Failed to load video";
    if (video?.error) {
      const codes = {
        1: "Video loading aborted",
        2: "Network error while loading video",
        3: "Video format not supported or decode error",
        4: "Video format not supported",
      };
      msg = codes[video.error.code] || msg;
    }
    setError(msg);
    setLoading(false);
  }

  function handleWaiting() {
    setLoading(true);
  }

  function handleCanPlay() {
    setLoading(false);
  }

  function handleSeeked() {
    if (videoRef.current) {
      syncFormation();
      savePosition(videoRef.current.currentTime);
    }
  }

  // Controls
  function togglePlay() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }

  function handleSeek(e) {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pct * duration;
  }

  function handleTimelineDrag(e) {
    if (e.buttons !== 1) return;
    handleSeek(e);
  }

  function toggleMute() {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMuted(videoRef.current.muted);
  }

  function handleVolumeChange(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      if (v > 0 && muted) {
        videoRef.current.muted = false;
        setMuted(false);
      }
    }
  }

  function setPlaybackSpeed(s) {
    setSpeed(s);
    if (videoRef.current) {
      videoRef.current.playbackRate = s;
    }
    setShowSpeedMenu(false);
  }

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  }

  // Listen for fullscreen changes (e.g. Escape key)
  useEffect(() => {
    function onFsChange() {
      setFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      // Don't trigger when typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [duration, muted]);

  // Pause non-essential updates when tab is hidden
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      } else if (!document.hidden && playing) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [playing, tick]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div ref={containerRef} className={`flex flex-col gap-0 ${fullscreen ? "bg-black h-screen" : ""}`}>
      {/* Video element */}
      <div className="relative rounded-xl overflow-hidden bg-black border border-gray-800">
        <video
          ref={videoRef}
          src={src}
          preload="auto"
          className="w-full block"
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
          onWaiting={handleWaiting}
          onCanPlay={handleCanPlay}
          onSeeked={handleSeeked}
          onClick={togglePlay}
        />

        {/* Loading overlay */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                videoRef.current?.load();
              }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Play button overlay when paused */}
        {!playing && !loading && !error && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
              <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="px-0 pt-2">
        <div
          ref={timelineRef}
          className="relative h-6 cursor-pointer group"
          onClick={handleSeek}
          onMouseMove={handleTimelineDrag}
        >
          {/* Track background */}
          <div className="absolute top-2.5 left-0 right-0 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            {/* Buffered */}
            <div
              className="absolute top-0 left-0 h-full bg-gray-600 rounded-full"
              style={{ width: `${bufferProgress}%` }}
            />
            {/* Progress */}
            <div
              className="absolute top-0 left-0 h-full bg-violet-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Formation markers */}
          {formations.map((f, i) => {
            const pct = duration > 0 ? ((f.timestamp ?? 0) / duration) * 100 : 0;
            return (
              <div
                key={f.frame_id || i}
                className="absolute top-1 w-2 h-3 bg-amber-400 rounded-sm opacity-80 hover:opacity-100 hover:scale-125 transition-all cursor-pointer group/marker"
                style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                title={`Formation ${i + 1} — ${formatTime(f.timestamp ?? 0)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (videoRef.current) {
                    videoRef.current.currentTime = f.timestamp ?? 0;
                  }
                }}
              />
            );
          })}

          {/* Scrubber handle */}
          <div
            className="absolute top-1 w-3.5 h-3.5 bg-white rounded-full shadow-md border-2 border-violet-500 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progress}%`, transform: "translateX(-50%)" }}
          />
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-3 px-1 py-1 text-sm">
        {/* Play/Pause */}
        <button onClick={togglePlay} className="text-white hover:text-violet-400 transition p-1">
          {playing ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Time display */}
        <span className="text-xs text-gray-400 font-mono tabular-nums min-w-[80px]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* Speed control */}
        <div className="relative">
          <button
            onClick={() => setShowSpeedMenu((v) => !v)}
            className="text-xs text-gray-400 hover:text-white transition px-2 py-1 rounded bg-gray-800/50"
          >
            {speed}x
          </button>
          {showSpeedMenu && (
            <div className="absolute bottom-full mb-1 right-0 bg-gray-900 border border-gray-700 rounded-lg py-1 shadow-xl z-10">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPlaybackSpeed(s)}
                  className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-gray-800 transition ${
                    s === speed ? "text-violet-400" : "text-gray-300"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Volume */}
        <button onClick={toggleMute} className="text-white hover:text-violet-400 transition p-1">
          {muted || volume === 0 ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-16 h-1 accent-violet-500"
        />

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} className="text-white hover:text-violet-400 transition p-1">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            {fullscreen ? (
              <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
            ) : (
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            )}
          </svg>
        </button>
      </div>
    </div>
  );
});

export default VideoPlayer;
