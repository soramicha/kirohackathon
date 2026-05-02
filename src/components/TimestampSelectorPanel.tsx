/**
 * TimestampSelectorPanel — HH:MM:SS input, timestamp list management, and validation.
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7
 */

import { useState } from 'react';
import type { Timestamp } from '../types/index';
import type { TimestampSelector } from '../lib/TimestampSelector';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimestampSelectorPanelProps {
  selector: TimestampSelector;
  videoDurationSeconds: number;
  /** Called when the user clicks "Proceed" with at least one timestamp. */
  onProceed: (timestamps: Timestamp[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimestampSelectorPanel({
  selector,
  videoDurationSeconds,
  onProceed,
}: TimestampSelectorPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  // Mirror the selector's list in local state so the component re-renders on changes
  const [timestamps, setTimestamps] = useState<Timestamp[]>(() => selector.getTimestamps());

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    setInputError(null);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();

    const parsed = parseHHMMSS(inputValue.trim());
    if (parsed === null) {
      setInputError('Enter a valid time in HH:MM:SS format (e.g. 00:01:30).');
      return;
    }

    const result = selector.addTimestamp(parsed, videoDurationSeconds);
    if (!result.ok) {
      setInputError(result.error);
      return;
    }

    setInputError(null);
    setInputValue('');
    setTimestamps(selector.getTimestamps());
  }

  function handleRemove(id: string) {
    selector.removeTimestamp(id);
    setTimestamps(selector.getTimestamps());
  }

  function handleProceed() {
    if (timestamps.length === 0) return;
    onProceed(timestamps);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section className="panel" aria-labelledby="ts-selector-heading">
      <h2 id="ts-selector-heading">Select Timestamps</h2>
      <p className="panel-description">
        Add one or more timestamps (HH:MM:SS) to generate formation images at those moments.
      </p>

      <form onSubmit={handleAdd} noValidate>
        <div className="field">
          <label htmlFor="ts-input">Timestamp (HH:MM:SS)</label>
          <div className="input-row">
            <input
              id="ts-input"
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="00:01:30"
              pattern="\d{2}:\d{2}:\d{2}"
              aria-describedby={inputError ? 'ts-input-error' : undefined}
              aria-invalid={inputError ? 'true' : undefined}
              autoComplete="off"
            />
            <button type="submit">Add Timestamp</button>
          </div>

          {inputError && (
            <p id="ts-input-error" className="error-message" role="alert">
              {inputError}
            </p>
          )}
        </div>
      </form>

      {/* Timestamp list */}
      {timestamps.length > 0 ? (
        <ul className="timestamp-list" aria-label="Selected timestamps">
          {timestamps.map((ts) => (
            <li key={ts.id} className="timestamp-item">
              <span className="timestamp-label">{ts.label}</span>
              <button
                type="button"
                className="remove-button"
                onClick={() => handleRemove(ts.id)}
                aria-label={`Remove timestamp ${ts.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">No timestamps added yet.</p>
      )}

      <button
        type="button"
        className="primary-button"
        onClick={handleProceed}
        disabled={timestamps.length === 0}
        aria-disabled={timestamps.length === 0}
      >
        Proceed
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses a HH:MM:SS string into total seconds.
 * Returns null if the format is invalid.
 */
function parseHHMMSS(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3], 10);

  if (m >= 60 || s >= 60) return null;

  return h * 3600 + m * 60 + s;
}
