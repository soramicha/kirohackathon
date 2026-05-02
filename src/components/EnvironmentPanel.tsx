/**
 * EnvironmentPanel — displays detected environment type and depth calibration,
 * and allows the user to confirm or override the environment type.
 *
 * Requirements: 4.1, 4.4, 4.5, 4.6
 */

import { useState } from 'react';
import type { EnvironmentType, DepthCalibration } from '../types/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Confidence threshold below which the override prompt is shown automatically. */
const LOW_CONFIDENCE_THRESHOLD = 0.5;

const ENVIRONMENT_OPTIONS: { value: EnvironmentType; label: string }[] = [
  { value: 'stage', label: 'Stage' },
  { value: 'studio', label: 'Studio' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'manual', label: 'Manual (custom)' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnvironmentPanelProps {
  depthCalibration: DepthCalibration;
  /** Called when the user confirms (or overrides) the environment type. */
  onConfirm: (environmentType: EnvironmentType) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EnvironmentPanel({ depthCalibration, onConfirm }: EnvironmentPanelProps) {
  const isLowConfidence = depthCalibration.confidence < LOW_CONFIDENCE_THRESHOLD;

  const [selected, setSelected] = useState<EnvironmentType>(
    depthCalibration.environmentType,
  );
  const [showOverride, setShowOverride] = useState(isLowConfidence);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleConfirm() {
    onConfirm(selected);
  }

  function handleOverrideToggle() {
    setShowOverride((prev) => !prev);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const confidencePct = Math.round(depthCalibration.confidence * 100);
  const detectedLabel =
    ENVIRONMENT_OPTIONS.find((o) => o.value === depthCalibration.environmentType)?.label ??
    depthCalibration.environmentType;

  return (
    <section className="panel" aria-labelledby="env-panel-heading">
      <h2 id="env-panel-heading">Environment Analysis</h2>

      <dl className="calibration-details">
        <div className="calibration-row">
          <dt>Detected environment</dt>
          <dd>{detectedLabel}</dd>
        </div>
        <div className="calibration-row">
          <dt>Depth calibration confidence</dt>
          <dd>
            <span
              className={`confidence-badge ${isLowConfidence ? 'confidence-badge--low' : 'confidence-badge--ok'}`}
              aria-label={`Confidence: ${confidencePct}%`}
            >
              {confidencePct}%
            </span>
          </dd>
        </div>
      </dl>

      {/* Low-confidence automatic prompt */}
      {isLowConfidence && (
        <p className="warning-message" role="alert">
          Confidence is low. Please select the correct environment type below.
        </p>
      )}

      {/* Override section */}
      {!isLowConfidence && (
        <button
          type="button"
          className="link-button"
          onClick={handleOverrideToggle}
          aria-expanded={showOverride}
        >
          {showOverride ? 'Hide override' : 'Override environment type'}
        </button>
      )}

      {showOverride && (
        <div className="override-section">
          <fieldset>
            <legend>Select environment type</legend>
            {ENVIRONMENT_OPTIONS.map((opt) => (
              <label key={opt.value} className="radio-label">
                <input
                  type="radio"
                  name="environment-type"
                  value={opt.value}
                  checked={selected === opt.value}
                  onChange={() => setSelected(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      <button
        type="button"
        className="primary-button"
        onClick={handleConfirm}
      >
        Confirm Environment
      </button>
    </section>
  );
}
