/**
 * App — step-based navigation for the Dance Formation App.
 *
 * Steps:
 *   url-input → timestamp-selection → processing → dancer-review
 *   → environment-confirmation → formation-viewer → export
 *
 * All shared service instances are created once here and passed down as props.
 *
 * Requirements: 1.1, 2.1, 3.5, 4.4, 5.5, 8.5, 9.1, 10.1
 */

import { useState, useCallback, useMemo } from 'react';
import './App.css';

// ---------------------------------------------------------------------------
// Services (singletons)
// ---------------------------------------------------------------------------
import { YouTubeImporter } from './lib/YouTubeImporter';
import { TimestampSelector } from './lib/TimestampSelector';
import { ProcessingOrchestrator } from './lib/ProcessingOrchestrator';
import { FormationMapper } from './lib/FormationMapper';
import { MetadataExporter } from './lib/MetadataExporter';
import { PDFExporter } from './lib/PDFExporter';
import { SessionStore } from './store/SessionStore';

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
import { YouTubeImporterPanel } from './components/YouTubeImporterPanel';
import { TimestampSelectorPanel } from './components/TimestampSelectorPanel';
import { ProcessingProgressBar } from './components/ProcessingProgressBar';
import { DancerProfileManager } from './components/DancerProfileManager';
import { EnvironmentPanel } from './components/EnvironmentPanel';
import { FormationViewer } from './components/FormationViewer';
import { SessionListPanel } from './components/SessionListPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
import type {
  VideoMeta,
  Timestamp,
  Session,
  DancerProfile,
  EnvironmentType,
  OrchestratorState,
} from './types/index';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// App step type
// ---------------------------------------------------------------------------

type AppStep =
  | 'url-input'
  | 'timestamp-selection'
  | 'processing'
  | 'dancer-review'
  | 'environment-confirmation'
  | 'formation-viewer'
  | 'export';

const STEP_LABELS: Record<AppStep, string> = {
  'url-input': 'Import Video',
  'timestamp-selection': 'Select Timestamps',
  'processing': 'Processing',
  'dancer-review': 'Review Dancers',
  'environment-confirmation': 'Environment',
  'formation-viewer': 'Formations',
  'export': 'Export',
};

const STEP_ORDER: AppStep[] = [
  'url-input',
  'timestamp-selection',
  'processing',
  'dancer-review',
  'environment-confirmation',
  'formation-viewer',
  'export',
];

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export default function App() {
  // -------------------------------------------------------------------------
  // Service instances — created once per app lifetime
  // -------------------------------------------------------------------------
  const store = useMemo(() => new SessionStore(), []);
  const mapper = useMemo(() => new FormationMapper(), []);
  const metadataExporter = useMemo(() => new MetadataExporter(), []);
  const pdfExporter = useMemo(() => new PDFExporter(store), [store]);

  // importer and orchestrator depend on store/mapper
  const importer = useMemo(() => new YouTubeImporter(store), [store]);
  const orchestrator = useMemo(
    () => new ProcessingOrchestrator(importer, mapper, store),
    [importer, mapper, store],
  );

  // timestampSelector is per-session — recreated when a new session starts
  const [timestampSelector] = useState(() => new TimestampSelector());

  // -------------------------------------------------------------------------
  // App state
  // -------------------------------------------------------------------------
  const [step, setStep] = useState<AppStep>('url-input');
  const [showSessionList, setShowSessionList] = useState(false);

  // Video / session data
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [orchestratorState, setOrchestratorState] = useState<OrchestratorState>({
    step: 'idle',
    progress: 0,
  });

  // Export state
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Step 1 → 2: video confirmed and downloaded
  // -------------------------------------------------------------------------
  const handleVideoReady = useCallback(
    async (meta: VideoMeta) => {
      setVideoMeta(meta);

      // Create a new session record in IndexedDB
      const now = new Date().toISOString();
      const newSession: Session = {
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
        youtubeUrl: `https://www.youtube.com/watch?v=${meta.videoId}`,
        videoId: meta.videoId,
        videoTitle: meta.title,
        videoDurationSeconds: meta.durationSeconds,
        thumbnailUrl: meta.thumbnailUrl,
        timestamps: [],
        dancerProfiles: [],
        environmentType: 'unknown',
        depthCalibration: {
          homographyMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
          environmentType: 'unknown',
          confidence: 0,
          frameIndex: 0,
        },
        formations: [],
        opfsVideoPath: `sessions/${meta.videoId}/video.mp4`,
      };

      await store.saveSession(newSession);
      setSession(newSession);
      setStep('timestamp-selection');
    },
    [store],
  );

  // -------------------------------------------------------------------------
  // Step 2 → 3: timestamps confirmed, start processing
  // -------------------------------------------------------------------------
  const handleTimestampsProceed = useCallback(
    async (timestamps: Timestamp[]) => {
      if (!session || !videoMeta) return;

      // Persist timestamps to the session
      const updatedSession: Session = {
        ...session,
        timestamps,
        updatedAt: new Date().toISOString(),
      };
      await store.saveSession(updatedSession);
      setSession(updatedSession);
      setStep('processing');

      // Kick off the processing pipeline
      void orchestrator.process(
        {
          sessionId: session.id,
          youtubeUrl: `https://www.youtube.com/watch?v=${videoMeta.videoId}`,
          timestamps,
          videoDurationSeconds: videoMeta.durationSeconds,
        },
        (state) => {
          setOrchestratorState(state);
          if (state.step === 'complete') {
            // Reload session from store to pick up dancer profiles + formations
            store.loadSession(session.id).then((loaded) => {
              if (loaded) setSession(loaded);
            });
            setStep('dancer-review');
          }
        },
      );
    },
    [session, videoMeta, store, orchestrator],
  );

  // -------------------------------------------------------------------------
  // Processing retry
  // -------------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    if (!session || !videoMeta) return;
    void orchestrator.process(
      {
        sessionId: session.id,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoMeta.videoId}`,
        timestamps: session.timestamps,
        videoDurationSeconds: videoMeta.durationSeconds,
      },
      (state) => {
        setOrchestratorState(state);
        if (state.step === 'complete') {
          store.loadSession(session.id).then((loaded) => {
            if (loaded) setSession(loaded);
          });
          setStep('dancer-review');
        }
      },
    );
  }, [session, videoMeta, store, orchestrator]);

  // -------------------------------------------------------------------------
  // Step 3 → 4: dancer profiles updated
  // -------------------------------------------------------------------------
  const handleProfilesChanged = useCallback((profiles: DancerProfile[]) => {
    setSession((prev) =>
      prev ? { ...prev, dancerProfiles: profiles, updatedAt: new Date().toISOString() } : prev,
    );
  }, []);

  // -------------------------------------------------------------------------
  // Step 4 → 5: proceed to environment confirmation
  // -------------------------------------------------------------------------
  const handleDancerReviewProceed = useCallback(() => {
    setStep('environment-confirmation');
  }, []);

  // -------------------------------------------------------------------------
  // Step 5 → 6: environment confirmed
  // -------------------------------------------------------------------------
  const handleEnvironmentConfirm = useCallback(
    async (environmentType: EnvironmentType) => {
      if (!session) return;
      const updatedSession: Session = {
        ...session,
        environmentType,
        depthCalibration: { ...session.depthCalibration, environmentType },
        updatedAt: new Date().toISOString(),
      };
      await store.saveSession(updatedSession);
      setSession(updatedSession);
      setStep('formation-viewer');
    },
    [session, store],
  );

  // -------------------------------------------------------------------------
  // Step 6 → 7: proceed to export
  // -------------------------------------------------------------------------
  const handleFormationViewerProceed = useCallback(() => {
    setStep('export');
  }, []);

  // -------------------------------------------------------------------------
  // Export: Download Metadata JSON
  // -------------------------------------------------------------------------
  const handleDownloadMetadata = useCallback(async () => {
    if (!session) return;
    setIsExportingJson(true);
    setExportError(null);
    try {
      const json = metadataExporter.exportSession(session);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitiseFilename(session.videoTitle)}_metadata.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExportingJson(false);
    }
  }, [session, metadataExporter]);

  // -------------------------------------------------------------------------
  // Export: Export PDF
  // -------------------------------------------------------------------------
  const handleExportPdf = useCallback(async () => {
    if (!session) return;
    setIsExportingPdf(true);
    setExportError(null);
    try {
      await pdfExporter.export(session);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExportingPdf(false);
    }
  }, [session, pdfExporter]);

  // -------------------------------------------------------------------------
  // Session list: load a saved session
  // -------------------------------------------------------------------------
  const handleLoadSession = useCallback(
    async (sessionId: string) => {
      const loaded = await store.loadSession(sessionId);
      if (!loaded) return;

      setSession(loaded);
      setVideoMeta({
        videoId: loaded.videoId,
        title: loaded.videoTitle,
        durationSeconds: loaded.videoDurationSeconds,
        thumbnailUrl: loaded.thumbnailUrl,
      });
      setShowSessionList(false);

      // Restore to the furthest meaningful step
      if (loaded.formations.length > 0) {
        setStep('export');
      } else if (loaded.dancerProfiles.length > 0) {
        setStep('dancer-review');
      } else if (loaded.timestamps.length > 0) {
        setStep('processing');
      } else {
        setStep('timestamp-selection');
      }
    },
    [store],
  );

  // -------------------------------------------------------------------------
  // Start a new session
  // -------------------------------------------------------------------------
  const handleNewSession = useCallback(() => {
    setSession(null);
    setVideoMeta(null);
    setOrchestratorState({ step: 'idle', progress: 0 });
    setExportError(null);
    setShowSessionList(false);
    setStep('url-input');
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const currentStepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="app-layout">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header className="app-header">
        <div className="app-header-inner">
          <button
            type="button"
            className="app-logo-button"
            onClick={handleNewSession}
            aria-label="Dance Formation App — start new session"
          >
            Dance Formation App
          </button>

          <nav className="app-header-actions">
            <button
              type="button"
              className="link-button"
              onClick={() => setShowSessionList((v) => !v)}
              aria-expanded={showSessionList}
              aria-controls="session-list-drawer"
            >
              {showSessionList ? 'Hide sessions' : 'Saved sessions'}
            </button>
            {session && (
              <button type="button" className="link-button" onClick={handleNewSession}>
                New session
              </button>
            )}
          </nav>
        </div>

        {/* Step progress indicator */}
        {session && (
          <ol className="step-indicator" aria-label="Progress steps">
            {STEP_ORDER.map((s, i) => (
              <li
                key={s}
                className={`step-indicator-item ${
                  i < currentStepIndex
                    ? 'step-indicator-item--done'
                    : i === currentStepIndex
                    ? 'step-indicator-item--active'
                    : 'step-indicator-item--pending'
                }`}
                aria-current={i === currentStepIndex ? 'step' : undefined}
              >
                <span className="step-indicator-dot" aria-hidden="true">
                  {i < currentStepIndex ? '✓' : i + 1}
                </span>
                <span className="step-indicator-label">{STEP_LABELS[s]}</span>
              </li>
            ))}
          </ol>
        )}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Session list drawer                                                  */}
      {/* ------------------------------------------------------------------ */}
      {showSessionList && (
        <aside id="session-list-drawer" className="session-drawer">
          <SessionListPanel
            store={store}
            onLoad={handleLoadSession}
            onDeleted={() => {/* list refreshes internally */}}
          />
        </aside>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                         */}
      {/* ------------------------------------------------------------------ */}
      <main className="app-main">

        {/* Step 1: URL input */}
        {step === 'url-input' && (
          <YouTubeImporterPanel
            importer={importer}
            onVideoReady={handleVideoReady}
          />
        )}

        {/* Step 2: Timestamp selection */}
        {step === 'timestamp-selection' && videoMeta && (
          <TimestampSelectorPanel
            selector={timestampSelector}
            videoDurationSeconds={videoMeta.durationSeconds}
            onProceed={handleTimestampsProceed}
          />
        )}

        {/* Step 3: Processing */}
        {step === 'processing' && (
          <div className="panel">
            <h2>Processing Video</h2>
            <p className="panel-description">
              Analysing your video — this may take a few minutes.
            </p>
            <ProcessingProgressBar
              state={orchestratorState}
              onRetry={handleRetry}
            />
          </div>
        )}

        {/* Step 4: Dancer review */}
        {step === 'dancer-review' && session && (
          <div>
            <DancerProfileManager
              session={session}
              store={store}
              onProfilesChanged={handleProfilesChanged}
            />
            <div className="panel-footer">
              <button
                type="button"
                className="primary-button"
                onClick={handleDancerReviewProceed}
              >
                Continue to Environment
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Environment confirmation */}
        {step === 'environment-confirmation' && session && (
          <EnvironmentPanel
            depthCalibration={session.depthCalibration}
            onConfirm={handleEnvironmentConfirm}
          />
        )}

        {/* Step 6: Formation viewer */}
        {step === 'formation-viewer' && session && (
          <div>
            <FormationViewer
              timestamps={session.timestamps}
              formations={session.formations}
              dancerProfiles={session.dancerProfiles}
              sessionId={session.id}
              store={store}
            />
            <div className="panel-footer">
              <button
                type="button"
                className="primary-button"
                onClick={handleFormationViewerProceed}
              >
                Continue to Export
              </button>
            </div>
          </div>
        )}

        {/* Step 7: Export */}
        {step === 'export' && session && (
          <section className="panel" aria-labelledby="export-heading">
            <h2 id="export-heading">Export</h2>

            {/* Session summary */}
            <div className="export-summary">
              <p className="export-video-title">{session.videoTitle}</p>
              <p className="export-meta">
                {session.timestamps.length} timestamp{session.timestamps.length !== 1 ? 's' : ''} ·{' '}
                {session.dancerProfiles.length} dancer{session.dancerProfiles.length !== 1 ? 's' : ''} ·{' '}
                {session.environmentType}
              </p>
            </div>

            {exportError && (
              <p className="error-message" role="alert">
                Export failed: {exportError}
              </p>
            )}

            <div className="export-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleDownloadMetadata}
                disabled={isExportingJson || isExportingPdf}
              >
                {isExportingJson ? 'Preparing…' : 'Download Metadata (JSON)'}
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={handleExportPdf}
                disabled={isExportingJson || isExportingPdf}
              >
                {isExportingPdf ? 'Generating PDF…' : 'Export PDF'}
              </button>
            </div>

            {/* Formation viewer embedded on export page */}
            <FormationViewer
              timestamps={session.timestamps}
              formations={session.formations}
              dancerProfiles={session.dancerProfiles}
              sessionId={session.id}
              store={store}
            />
          </section>
        )}

      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
