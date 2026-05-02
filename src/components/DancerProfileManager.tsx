/**
 * DancerProfileManager — displays detected dancers, allows name assignment,
 * and lets the user manually adjust the dancer count.
 *
 * Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
 */

import { useState } from 'react';
import type { DancerProfile, Session } from '../types/index';
import type { SessionStore } from '../store/SessionStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DancerProfileManagerProps {
  session: Session;
  store: SessionStore;
  /** Called after any profile or count change so the parent can re-render. */
  onProfilesChanged: (profiles: DancerProfile[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DancerProfileManager({
  session,
  store,
  onProfilesChanged,
}: DancerProfileManagerProps) {
  const [profiles, setProfiles] = useState<DancerProfile[]>(session.dancerProfiles);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [countInput, setCountInput] = useState<string>(String(session.dancerProfiles.length));
  const [countError, setCountError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Name change handler
  // -------------------------------------------------------------------------

  async function handleNameChange(id: string, newName: string) {
    const trimmed = newName.trim();
    const updated = profiles.map((p) =>
      p.id === id
        ? { ...p, customName: trimmed.length > 0 ? trimmed : undefined }
        : p
    );

    setProfiles(updated);
    setSavingId(id);
    setSaveError(null);

    try {
      const updatedSession: Session = {
        ...session,
        dancerProfiles: updated,
        updatedAt: new Date().toISOString(),
      };
      await store.saveSession(updatedSession);
      onProfilesChanged(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Manual count adjustment
  // -------------------------------------------------------------------------

  async function handleCountChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCountInput(e.target.value);
    setCountError(null);
  }

  async function handleCountApply() {
    const n = parseInt(countInput, 10);
    if (!Number.isInteger(n) || n < 0) {
      setCountError('Enter a non-negative whole number.');
      return;
    }

    let updated: DancerProfile[];

    if (n < profiles.length) {
      // Trim excess profiles
      updated = profiles.slice(0, n);
    } else if (n > profiles.length) {
      // Append placeholder profiles for the new dancers
      const extras: DancerProfile[] = Array.from(
        { length: n - profiles.length },
        (_, i) => ({
          id: `manual-${profiles.length + i + 1}-${Date.now()}`,
          numericLabel: profiles.length + i + 1,
          customName: undefined,
          visualDescription: `Dancer ${profiles.length + i + 1}`,
          thumbnailDataUrl: '',
        })
      );
      updated = [...profiles, ...extras];
    } else {
      return; // no change
    }

    setProfiles(updated);
    setCountError(null);

    try {
      const updatedSession: Session = {
        ...session,
        dancerProfiles: updated,
        updatedAt: new Date().toISOString(),
      };
      await store.saveSession(updatedSession);
      onProfilesChanged(updated);
    } catch (err) {
      setCountError(err instanceof Error ? err.message : String(err));
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section className="panel" aria-labelledby="dancer-manager-heading">
      <h2 id="dancer-manager-heading">Dancer Profiles</h2>

      <div className="dancer-count-row">
        <span>Total dancers detected: <strong>{profiles.length}</strong></span>
        <div className="count-adjust" role="group" aria-label="Manually adjust dancer count">
          <label htmlFor="dancer-count-input">Adjust count:</label>
          <input
            id="dancer-count-input"
            type="number"
            min={0}
            value={countInput}
            onChange={handleCountChange}
            aria-describedby={countError ? 'count-error' : undefined}
            aria-invalid={countError ? 'true' : undefined}
            style={{ width: '5rem' }}
          />
          <button type="button" onClick={handleCountApply}>
            Apply
          </button>
        </div>
        {countError && (
          <p id="count-error" className="error-message" role="alert">
            {countError}
          </p>
        )}
      </div>

      {saveError && (
        <p className="error-message" role="alert">
          Failed to save: {saveError}
        </p>
      )}

      {profiles.length === 0 ? (
        <p className="empty-state">No dancers detected.</p>
      ) : (
        <ul className="dancer-list" aria-label="Dancer profiles">
          {profiles.map((profile) => (
            <DancerCard
              key={profile.id}
              profile={profile}
              isSaving={savingId === profile.id}
              onNameChange={(name) => handleNameChange(profile.id, name)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// DancerCard sub-component
// ---------------------------------------------------------------------------

interface DancerCardProps {
  profile: DancerProfile;
  isSaving: boolean;
  onNameChange: (name: string) => void;
}

function DancerCard({ profile, isSaving, onNameChange }: DancerCardProps) {
  const [nameInput, setNameInput] = useState(profile.customName ?? '');

  function handleBlur() {
    onNameChange(nameInput);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  }

  const displayLabel = profile.customName ?? String(profile.numericLabel);

  return (
    <li className="dancer-card">
      {/* Thumbnail */}
      {profile.thumbnailDataUrl ? (
        <img
          src={profile.thumbnailDataUrl}
          alt={`Thumbnail for dancer ${displayLabel}`}
          className="dancer-thumbnail"
          width={64}
          height={64}
        />
      ) : (
        <div
          className="dancer-thumbnail dancer-thumbnail--placeholder"
          aria-label={`No thumbnail for dancer ${displayLabel}`}
          role="img"
        >
          {profile.numericLabel}
        </div>
      )}

      <div className="dancer-info">
        {/* Numeric label */}
        <span className="dancer-number" aria-label="Dancer number">
          #{profile.numericLabel}
        </span>

        {/* AI-generated visual description */}
        <p className="dancer-description">{profile.visualDescription}</p>

        {/* Editable name field */}
        <div className="dancer-name-field">
          <label htmlFor={`dancer-name-${profile.id}`} className="visually-hidden">
            Custom name for dancer {profile.numericLabel}
          </label>
          <input
            id={`dancer-name-${profile.id}`}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={`Dancer ${profile.numericLabel}`}
            aria-label={`Name for dancer ${profile.numericLabel}`}
            disabled={isSaving}
          />
          {isSaving && (
            <span className="saving-indicator" aria-live="polite">
              Saving…
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
