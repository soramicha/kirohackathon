/**
 * ProcessingProgressBar — displays the current processing step, numeric progress,
 * error state with message, and a Retry button.
 *
 * Requirements: 3.5, 5.5
 */

import type { OrchestratorState, ProcessingStep } from '../types/index';

// ---------------------------------------------------------------------------
// Step labels
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<ProcessingStep, string> = {
  idle: 'Idle',
  downloading: 'Downloading video…',
  extracting_frames: 'Extracting frames…',
  scanning_dancers: 'Scanning dancers…',
  analyzing_depth: 'Analyzing depth…',
  detecting_positions: 'Detecting positions…',
  mapping_formations: 'Mapping formations…',
  complete: 'Complete',
  error: 'Error',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProcessingProgressBarProps {
  state: OrchestratorState;
  /** Called when the user clicks the Retry button in error state. */
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProcessingProgressBar({ state, onRetry }: ProcessingProgressBarProps) {
  const { step, progress, error } = state;
  const label = STEP_LABELS[step] ?? step;
  const isError = step === 'error';
  const isComplete = step === 'complete';
  const isIdle = step === 'idle';

  if (isIdle) return null;

  return (
    <div
      className={`progress-bar-container ${isError ? 'progress-bar-container--error' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Processing progress"
    >
      <div className="progress-header">
        <span className="progress-step-label">{label}</span>
        {!isError && (
          <span className="progress-pct" aria-label={`${progress}% complete`}>
            {progress}%
          </span>
        )}
      </div>

      {/* Progress bar track */}
      {!isError && (
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        >
          <div
            className={`progress-fill ${isComplete ? 'progress-fill--complete' : ''}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Error state */}
      {isError && error && (
        <div className="progress-error">
          <p className="error-message">{error}</p>
          {onRetry && (
            <button
              type="button"
              className="primary-button"
              onClick={onRetry}
              aria-label="Retry processing"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
