/**
 * FormationViewer — displays extracted frame thumbnails alongside rendered
 * Formation_Image canvases for each timestamp.
 *
 * Requirements: 5.5, 6.6, 7.3, 7.4, 7.5, 7.6
 */

import { useEffect, useState } from 'react';
import type { Formation, Timestamp, DancerProfile } from '../types/index';
import type { SessionStore } from '../store/SessionStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FormationViewerProps {
  timestamps: Timestamp[];
  formations: Formation[];
  dancerProfiles: DancerProfile[];
  sessionId: string;
  store: SessionStore;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormationViewer({
  timestamps,
  formations,
  dancerProfiles,
  sessionId,
  store,
}: FormationViewerProps) {
  return (
    <section className="panel" aria-labelledby="formation-viewer-heading">
      <h2 id="formation-viewer-heading">Formation Viewer</h2>

      {timestamps.length === 0 ? (
        <p className="empty-state">No timestamps selected.</p>
      ) : (
        <ul className="formation-list" aria-label="Formations by timestamp">
          {timestamps.map((ts) => {
            const formation = formations.find((f) => f.timestampId === ts.id);
            return (
              <FormationEntry
                key={ts.id}
                timestamp={ts}
                formation={formation ?? null}
                dancerProfiles={dancerProfiles}
                sessionId={sessionId}
                store={store}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// FormationEntry sub-component
// ---------------------------------------------------------------------------

interface FormationEntryProps {
  timestamp: Timestamp;
  formation: Formation | null;
  dancerProfiles: DancerProfile[];
  sessionId: string;
  store: SessionStore;
}

function FormationEntry({
  timestamp,
  formation,
  dancerProfiles,
  sessionId,
  store,
}: FormationEntryProps) {
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [formationDataUrl, setFormationDataUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load binary images from OPFS and convert to data URLs
  useEffect(() => {
    let cancelled = false;

    async function loadImages() {
      try {
        // Load extracted frame
        const frameBuffer = await store.readFrame(sessionId, timestamp.id);
        if (!cancelled && frameBuffer) {
          setFrameDataUrl(arrayBufferToDataUrl(frameBuffer, 'image/jpeg'));
        }

        // Load formation image (if available)
        if (formation) {
          const formationBuffer = await store.readFormationImage(sessionId, timestamp.id);
          if (!cancelled && formationBuffer) {
            setFormationDataUrl(arrayBufferToDataUrl(formationBuffer, 'image/png'));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void loadImages();
    return () => { cancelled = true; };
  }, [sessionId, timestamp.id, formation, store]);

  // Dancers present in this formation
  const presentDancers = formation
    ? formation.dancerPositions.filter((dp) => !dp.absent)
    : [];

  return (
    <li className="formation-entry">
      <h3 className="formation-timestamp">{timestamp.label}</h3>

      {loadError && (
        <p className="error-message" role="alert">
          Failed to load images: {loadError}
        </p>
      )}

      <div className="formation-images">
        {/* Extracted frame with dancer overlays */}
        <div className="frame-container">
          <p className="image-label">Extracted Frame</p>
          {frameDataUrl ? (
            <div className="frame-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
              <img
                src={frameDataUrl}
                alt={`Extracted frame at ${timestamp.label}`}
                className="frame-image"
              />
              {/* Dancer identifier overlays */}
              {formation &&
                formation.dancerPositions
                  .filter((dp) => !dp.absent)
                  .map((dp) => {
                    const profile = dancerProfiles.find((p) => p.id === dp.dancerId);
                    const label = profile
                      ? (profile.customName ?? String(profile.numericLabel))
                      : dp.dancerId;
                    const [px, py] = dp.pixelCoordinate;
                    return (
                      <span
                        key={dp.dancerId}
                        className="dancer-overlay"
                        style={{
                          position: 'absolute',
                          left: `${px}px`,
                          top: `${py}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        aria-label={`Dancer ${label}`}
                      >
                        {label}
                      </span>
                    );
                  })}
            </div>
          ) : (
            <div className="image-placeholder" aria-label="Frame loading">
              {loadError ? '—' : 'Loading…'}
            </div>
          )}
        </div>

        {/* Formation image */}
        <div className="formation-container">
          <p className="image-label">Formation Diagram</p>
          {formationDataUrl ? (
            <img
              src={formationDataUrl}
              alt={`Formation diagram at ${timestamp.label}`}
              className="formation-image"
            />
          ) : formation ? (
            <div className="image-placeholder" aria-label="Formation loading">
              {loadError ? '—' : 'Loading…'}
            </div>
          ) : (
            <div className="formation-unavailable" role="status">
              Formation unavailable for this timestamp.
            </div>
          )}
        </div>
      </div>

      {/* Dancer list for this formation */}
      {presentDancers.length > 0 && (
        <div className="formation-dancer-list">
          <p className="dancer-list-label">Dancers present:</p>
          <ul aria-label={`Dancers at ${timestamp.label}`}>
            {presentDancers.map((dp) => {
              const profile = dancerProfiles.find((p) => p.id === dp.dancerId);
              const label = profile
                ? (profile.customName ?? `Dancer ${profile.numericLabel}`)
                : dp.dancerId;
              return <li key={dp.dancerId}>{label}</li>;
            })}
          </ul>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
