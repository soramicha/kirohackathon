'use client';

import { useState } from 'react';

interface VideoInputProps {
  onVideoLoad: (videoUrl: string, videoId: string) => void;
}

export default function VideoInput({ onVideoLoad }: VideoInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const extractVideoId = (url: string): string | null => {
    // Handle various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const videoId = extractVideoId(url);
    if (!videoId) {
      setError('Invalid YouTube URL. Please enter a valid YouTube video link.');
      return;
    }

    onVideoLoad(url, videoId);
  };

  return (
    <div className="w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="video-url" className="block text-sm font-medium mb-2">
            YouTube Video URL
          </label>
          <input
            id="video-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600"
          />
        </div>
        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Load Video
        </button>
      </form>
    </div>
  );
}
