/**
 * YouTubeImporterPanel — URL input, validation, metadata preview, and video download.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { useState } from 'react';
import type { VideoMeta } from '../types/index';
import type { YouTubeImporter } from '../lib/YouTubeImporter';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface YouTubeImporterPanelProps {
  importer: YouTubeImporter;
  /** Called when the user confirms the video and the download completes. */
  onVideoReady: (meta: VideoMeta) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function YouTubeImporterPanel({ importer, onVideoReady }: YouTubeImporterPanelProps) {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUrl(e.target.value);
    // Clear errors as the user types
    setUrlError(null);
    setFetchError(null);
    setMeta(null);
    setDownloadError(null);
  }

  async function handleLoadVideo(e: React.FormEvent) {
    e.preventDefault();

    // Client-side URL validation
    const validation = importer.validateUrl(url.trim());
    if (!validation.valid) {
      setUrlError(validation.error ?? 'Invalid YouTube URL.');
      return;
    }

    setUrlError(null);
    setFetchError(null);
    setMeta(null);
    setIsFetching(true);

    try {
      const videoMeta = await importer.fetchMeta(url.trim());
      setMeta(videoMeta);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFetching(false);
    }
  }

  async function handleConfirm() {
    if (!meta) return;

    setDownloadError(null);
    setIsDownloading(true);

    try {
      await importer.downloadVideo(url.trim());
      onVideoReady(meta);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasError = urlError ?? fetchError ?? downloadError;

  return (
    <section className="panel" aria-labelledby="yt-importer-heading">
      <h2 id="yt-importer-heading">Import YouTube Video</h2>

      <form onSubmit={handleLoadVideo} noValidate>
        <div className="field">
          <label htmlFor="yt-url-input">YouTube URL</label>
          <div className="input-row">
            <input
              id="yt-url-input"
              type="url"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://www.youtube.com/watch?v=..."
              aria-describedby={urlError ? 'yt-url-error' : undefined}
              aria-invalid={urlError ? 'true' : undefined}
              disabled={isFetching || isDownloading}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={isFetching || isDownloading || url.trim().length === 0}
            >
              {isFetching ? 'Loading…' : 'Load Video'}
            </button>
          </div>

          {urlError && (
            <p id="yt-url-error" className="error-message" role="alert">
              {urlError}
            </p>
          )}
          {fetchError && (
            <p className="error-message" role="alert">
              {fetchError}
            </p>
          )}
        </div>
      </form>

      {/* Video metadata preview */}
      {meta && !hasError && (
        <div className="video-preview" aria-label="Video preview">
          <img
            src={meta.thumbnailUrl}
            alt={`Thumbnail for ${meta.title}`}
            className="video-thumbnail"
            width={160}
            height={90}
          />
          <div className="video-info">
            <p className="video-title">{meta.title}</p>
            <p className="video-duration">
              Duration: {formatDuration(meta.durationSeconds)}
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isDownloading}
              className="primary-button"
            >
              {isDownloading ? 'Downloading…' : 'Confirm & Download'}
            </button>
            {downloadError && (
              <p className="error-message" role="alert">
                {downloadError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Download progress indicator */}
      {isDownloading && (
        <p className="status-message" aria-live="polite">
          Downloading video, please wait…
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
