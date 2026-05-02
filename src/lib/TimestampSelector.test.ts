/**
 * Unit tests for TimestampSelector
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TimestampSelector } from './TimestampSelector';

// ---------------------------------------------------------------------------
// addTimestamp — validation
// ---------------------------------------------------------------------------

describe('TimestampSelector.addTimestamp', () => {
  let selector: TimestampSelector;

  beforeEach(() => {
    selector = new TimestampSelector();
  });

  // ---- Rejection cases ----

  it('rejects a negative timestamp value', () => {
    const result = selector.addTimestamp(-1, 300);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it('rejects a timestamp value greater than duration', () => {
    const result = selector.addTimestamp(301, 300);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it('does not add to the list when validation fails', () => {
    selector.addTimestamp(-5, 300);
    selector.addTimestamp(400, 300);
    expect(selector.getTimestamps()).toHaveLength(0);
  });

  // ---- Acceptance cases ----

  it('accepts a timestamp at exactly 0', () => {
    const result = selector.addTimestamp(0, 300);
    expect(result.ok).toBe(true);
  });

  it('accepts a timestamp equal to the duration', () => {
    const result = selector.addTimestamp(300, 300);
    expect(result.ok).toBe(true);
  });

  it('accepts a timestamp strictly within the duration', () => {
    const result = selector.addTimestamp(150, 300);
    expect(result.ok).toBe(true);
  });

  it('returns the created timestamp on success', () => {
    const result = selector.addTimestamp(65, 300);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valueSeconds).toBe(65);
      expect(result.value.id).toBeTruthy();
      expect(result.value.label).toBe('00:01:05');
    }
  });

  it('appends to the list on success', () => {
    selector.addTimestamp(10, 300);
    selector.addTimestamp(20, 300);
    expect(selector.getTimestamps()).toHaveLength(2);
  });

  it('assigns a unique UUID to each timestamp', () => {
    const r1 = selector.addTimestamp(10, 300);
    const r2 = selector.addTimestamp(20, 300);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.id).not.toBe(r2.value.id);
    }
  });

  // ---- Label formatting ----

  it('formats 0 seconds as 00:00:00', () => {
    const result = selector.addTimestamp(0, 3600);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.label).toBe('00:00:00');
  });

  it('formats 3661 seconds as 01:01:01', () => {
    const result = selector.addTimestamp(3661, 7200);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.label).toBe('01:01:01');
  });

  it('formats 36000 seconds as 10:00:00', () => {
    const result = selector.addTimestamp(36000, 40000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.label).toBe('10:00:00');
  });

  it('truncates fractional seconds when formatting the label', () => {
    const result = selector.addTimestamp(65.9, 300);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.label).toBe('00:01:05');
  });
});

// ---------------------------------------------------------------------------
// removeTimestamp
// ---------------------------------------------------------------------------

describe('TimestampSelector.removeTimestamp', () => {
  let selector: TimestampSelector;

  beforeEach(() => {
    selector = new TimestampSelector();
  });

  it('removes a timestamp by its ID', () => {
    const result = selector.addTimestamp(10, 300);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    selector.removeTimestamp(result.value.id);
    expect(selector.getTimestamps()).toHaveLength(0);
  });

  it('is a no-op when the ID does not exist', () => {
    selector.addTimestamp(10, 300);
    selector.removeTimestamp('non-existent-id');
    expect(selector.getTimestamps()).toHaveLength(1);
  });

  it('removes only the matching timestamp when multiple exist', () => {
    const r1 = selector.addTimestamp(10, 300);
    const r2 = selector.addTimestamp(20, 300);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    selector.removeTimestamp(r1.value.id);
    const remaining = selector.getTimestamps();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(r2.value.id);
  });
});

// ---------------------------------------------------------------------------
// getTimestamps — mutation safety
// ---------------------------------------------------------------------------

describe('TimestampSelector.getTimestamps', () => {
  let selector: TimestampSelector;

  beforeEach(() => {
    selector = new TimestampSelector();
  });

  it('returns an empty array when no timestamps have been added', () => {
    expect(selector.getTimestamps()).toEqual([]);
  });

  it('returns a copy — mutating the returned array does not affect internal state', () => {
    selector.addTimestamp(10, 300);
    const copy = selector.getTimestamps();
    copy.push({ id: 'fake', valueSeconds: 999, label: '00:16:39' });
    expect(selector.getTimestamps()).toHaveLength(1);
  });

  it('reflects additions in subsequent calls', () => {
    selector.addTimestamp(10, 300);
    expect(selector.getTimestamps()).toHaveLength(1);
    selector.addTimestamp(20, 300);
    expect(selector.getTimestamps()).toHaveLength(2);
  });
});
