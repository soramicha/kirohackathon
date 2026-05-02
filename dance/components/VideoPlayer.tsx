'use client';

import { useRef, useState, useEffect } from 'react';

interface VideoPlayerProps {
  videoId: string;
  onTimestampCapture: (timestamp: number) => void;
}

// Extend Window interface for YouTube API
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function VideoPlayer({ videoId, onTimestampCapture }: VideoPlayerProps) {
  const playerRef = useRef<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Load YouTube IFrame API
  useEffect(() => {
    // Check if API is already loaded
    if (window.YT && window.YT.Player) {
      setIsReady(true);
      return;
    }

    // Load YouTube IFrame API script
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    // Set up callback for when API is ready
    window.onYouTubeIframeAPIReady = () => {
      setIsReady(true);
    };
  }, []);

  // Initialize player when API is ready
  useEffect(() => {
    if (!isReady) return;

    // Create player
    playerRef.current = new window.YT.Player('youtube-player', {
      videoId: videoId,
      events: {
        onStateChange: (event: any) => {
          // YT.PlayerState: UNSTARTED (-1), ENDED (0), PLAYING (1), PAUSED (2), BUFFERING (3), CUED (5)
          setIsPlaying(event.data === 1);
        },
      },
    });

    return () => {
      // Cleanup player on unmount
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [isReady, videoId]);

  // Poll for current time - syncs with actual video position
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        try {
          const time = playerRef.current.getCurrentTime();
          setCurrentTime(time);
        } catch (error) {
          // Player not ready yet, ignore
        }
      }
    }, 100); // Update every 100ms for smooth display

    return () => clearInterval(interval);
  }, []);

  const handleCaptureTimestamp = () => {
    // Get the most up-to-date time directly from player
    if (playerRef.current && playerRef.current.getCurrentTime) {
      const exactTime = playerRef.current.getCurrentTime();
      onTimestampCapture(exactTime);
    } else {
      // Fallback to state value
      onTimestampCapture(currentTime);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-4xl">
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <div id="youtube-player" className="w-full h-full" />
      </div>
      
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Current time: <span className="font-mono font-medium">{formatTime(currentTime)}</span>
          {isPlaying && <span className="ml-2 text-green-600">▶ Playing</span>}
        </div>
        <button
          onClick={handleCaptureTimestamp}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          Capture Timestamp
        </button>
      </div>
    </div>
  );
}
