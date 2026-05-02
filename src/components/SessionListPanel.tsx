/**
 * SessionListPanel — lists stored sessions with Load and Delete controls.
 *
 * Requirements: 8.5, 8.6, 8.7
 */

import { useEffect, useState } from 'react';
import type { SessionSummary } from '../types/index';
import type { SessionStore } from '../store/SessionStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SessionListPanelProps {
  store: SessionStore;
  /** Called when the user clicks "Load" for a session. */
  onLoad: (sessionId: string) => void;
  /** Called after a session is successfully deleted. */
  onDeleted?: (sessionId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionListPanel({ store, onLoad, onDeleted }: SessionListPanelProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Load session list on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      try {
        const list = await store.listSessions();
        if (!cancelled) {
          setSessions(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void fetchSessions();
    return () => { cancelled = true; };
  }, [store]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleDeleteRequest(id: string) {
    setConfirmDeleteId(id);
    setDeleteError(null);
  }

  function handleDeleteCancel() {
    setConfirmDeleteId(null);
  }

  async function handleDeleteConfirm(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    setConfirmDeleteId(null);

    try {
      await store.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      onDeleted?.(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section className="panel" aria-labelledby="session-list-heading">
      <h2 id="session-list-heading">Saved Sessions</h2>

      {loadError && (
        <p className="error-message" role="alert">
          Failed to load sessions: {loadError}
        </p>
      )}

      {deleteError && (
        <p className="error-message" role="alert">
          Failed to delete session: {deleteError}
        </p>
      )}

      {sessions.length === 0 && !loadError ? (
        <p className="empty-state">No saved sessions found.</p>
      ) : (
        <ul className="session-list" aria-label="Saved sessions">
          {sessions.map((session) => (
            <li key={session.id} className="session-item">
              <div className="session-info">
                <p className="session-title">{session.videoTitle}</p>
                <p className="session-meta">
                  {session.timestampCount} timestamp{session.timestampCount !== 1 ? 's' : ''} ·{' '}
                  {session.dancerCount} dancer{session.dancerCount !== 1 ? 's' : ''} ·{' '}
                  {formatDate(session.updatedAt)}
                </p>
              </div>

              <div className="session-actions">
                <button
                  type="button"
                  onClick={() => onLoad(session.id)}
                  disabled={deletingId === session.id}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => handleDeleteRequest(session.id)}
                  disabled={deletingId === session.id}
                  aria-label={`Delete session: ${session.videoTitle}`}
                >
                  {deletingId === session.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>

              {/* Inline confirmation dialog */}
              {confirmDeleteId === session.id && (
                <div
                  className="confirm-dialog"
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby={`confirm-heading-${session.id}`}
                >
                  <p id={`confirm-heading-${session.id}`}>
                    Permanently delete "{session.videoTitle}"? This cannot be undone.
                  </p>
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleDeleteConfirm(session.id)}
                    >
                      Yes, delete
                    </button>
                    <button type="button" onClick={handleDeleteCancel}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
