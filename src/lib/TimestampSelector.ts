/**
 * TimestampSelector — manages the list of user-selected timestamps with validation.
 *
 * - addTimestamp: validates the value is within [0, durationSeconds], assigns a UUID,
 *   formats a HH:MM:SS label, and appends to the internal list.
 * - removeTimestamp: removes a timestamp by ID (no-op if not found).
 * - getTimestamps: returns a shallow copy of the internal list.
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7
 */

import { v4 as uuidv4 } from 'uuid';
import type { Timestamp, Result } from '../types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a non-negative number of seconds as HH:MM:SS with zero-padded components.
 *
 * Examples:
 *   0       → "00:00:00"
 *   65      → "00:01:05"
 *   3661    → "01:01:01"
 *   36000   → "10:00:00"
 */
function formatHHMMSS(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// ---------------------------------------------------------------------------
// TimestampSelector class
// ---------------------------------------------------------------------------

export class TimestampSelector {
  private timestamps: Timestamp[] = [];

  // -------------------------------------------------------------------------
  // addTimestamp
  // -------------------------------------------------------------------------

  /**
   * Validates that `valueSeconds` is within [0, durationSeconds], then creates
   * and appends a new Timestamp with a UUID id and a HH:MM:SS label.
   *
   * Returns an error result if:
   *   - valueSeconds < 0
   *   - valueSeconds > durationSeconds
   *
   * Returns a success result with the newly created Timestamp on success.
   */
  addTimestamp(valueSeconds: number, durationSeconds: number): Result<Timestamp, string> {
    if (!isFinite(valueSeconds) || !isFinite(durationSeconds)) {
      return {
        ok: false,
        error: `Timestamp value and duration must be finite numbers.`,
      };
    }

    if (valueSeconds < 0) {
      return {
        ok: false,
        error: `Timestamp value ${valueSeconds}s is negative. Value must be ≥ 0.`,
      };
    }

    if (valueSeconds > durationSeconds) {
      return {
        ok: false,
        error: `Timestamp value ${valueSeconds}s exceeds video duration of ${durationSeconds}s.`,
      };
    }

    const timestamp: Timestamp = {
      id: uuidv4(),
      valueSeconds,
      label: formatHHMMSS(valueSeconds),
    };

    this.timestamps.push(timestamp);

    return { ok: true, value: timestamp };
  }

  // -------------------------------------------------------------------------
  // removeTimestamp
  // -------------------------------------------------------------------------

  /**
   * Removes the timestamp with the given ID from the internal list.
   * No-op if the ID does not exist.
   */
  removeTimestamp(id: string): void {
    this.timestamps = this.timestamps.filter((ts) => ts.id !== id);
  }

  // -------------------------------------------------------------------------
  // getTimestamps
  // -------------------------------------------------------------------------

  /**
   * Returns a shallow copy of the internal timestamp list.
   * Callers cannot mutate the internal state by modifying the returned array.
   */
  getTimestamps(): Timestamp[] {
    return [...this.timestamps];
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const timestampSelector = new TimestampSelector();
