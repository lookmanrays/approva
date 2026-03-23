'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import {
  browserSupportsWebAuthn,
  startRegistration,
} from '@simplewebauthn/browser';
import type { ConsoleProfileResponse } from '@approva/shared';
import {
  deleteConsolePasskey,
  finishConsolePasskeyRegistration,
  getConsoleProfile,
  startConsolePasskeyRegistration,
  updateConsolePassword,
} from '@/lib/console-auth-client';

function formatTimestamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function formatCredentialId(value: string) {
  if (value.length <= 24) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

export function ConsoleSettingsPage({
  showSetupGuide = false,
}: {
  showSetupGuide?: boolean;
}) {
  const [profile, setProfile] = useState<ConsoleProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [deletingCredentialId, setDeletingCredentialId] = useState<string | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      const nextProfile = await getConsoleProfile();
      setProfile(nextProfile);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load console settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (passwordForm.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New password confirmation does not match.');
      return;
    }

    setSavingPassword(true);

    try {
      const nextProfile = await updateConsolePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setProfile(nextProfile);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setSuccess('Console password updated.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAddPasskey = async () => {
    setError(null);
    setSuccess(null);

    if (!browserSupportsWebAuthn()) {
      setError('This browser does not support passkeys.');
      return;
    }

    setRegisteringPasskey(true);

    try {
      const start = await startConsolePasskeyRegistration();
      const response = await startRegistration({
        optionsJSON:
          start.options as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'],
      });

      const finish = await finishConsolePasskeyRegistration({
        response: response as unknown as Record<string, unknown>,
      });

      await loadProfile();
      setSuccess(`Passkey added for ${finish.user.email}.`);
    } catch (registrationError) {
      setError(
        registrationError instanceof Error
          ? registrationError.message
          : 'Failed to add passkey.',
      );
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (credentialId: string) => {
    setError(null);
    setSuccess(null);

    if (!window.confirm('Remove this passkey from your approval identity?')) {
      return;
    }

    setDeletingCredentialId(credentialId);

    try {
      await deleteConsolePasskey(credentialId);
      await loadProfile();
      setSuccess('Passkey removed.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove passkey.');
    } finally {
      setDeletingCredentialId(null);
    }
  };

  return (
    <main className="console-stack">
      <section className="card stack">
        <div>
          <div className="label">Profile and security</div>
          <h2>Console settings</h2>
        </div>
        <p>
          Use this page to manage both layers of access: the console password for sign-in and the
          passkeys used on human approval links.
        </p>

        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="notice success">{success}</div> : null}

        {loading ? (
          <div className="empty">Loading settings...</div>
        ) : profile ? (
          <>
            {showSetupGuide || profile.activeRole === 'owner' ? (
              <article className="card stack">
                <div className="console-section-header">
                  <div>
                    <div className="label">Owner checklist</div>
                    <h3>{showSetupGuide ? 'Finish first-owner setup' : 'Owner checklist'}</h3>
                  </div>
                  <span className="console-meta-pill">
                    {profile.passkeys.length === 0 ? 'Action needed' : 'Recommended'}
                  </span>
                </div>

                <div className="console-detail-list">
                  <div className="console-detail-item">
                    <span>1. Approval passkey</span>
                    <strong>{profile.passkeys.length === 0 ? 'Still needed' : 'Configured'}</strong>
                    <div>
                      Approval links only work after this local user has at least one registered
                      passkey.
                    </div>
                  </div>
                  <div className="console-detail-item">
                    <span>2. Additional owner</span>
                    <strong>Recommended</strong>
                    <div>
                      Add at least one more owner in Users so everyday administration is not tied
                      to the recovery owner alone.
                    </div>
                  </div>
                  <div className="console-detail-item">
                    <span>3. Recovery owner</span>
                    <strong>Keep protected</strong>
                    <div>
                      The bootstrap owner is your recovery path. Keep it available as the
                      last-resort administrative account.
                    </div>
                  </div>
                </div>

                <div className="actions">
                  {profile.passkeys.length === 0 ? (
                    <button
                      className="button"
                      disabled={registeringPasskey}
                      onClick={handleAddPasskey}
                      type="button"
                    >
                      {registeringPasskey ? 'Adding passkey...' : 'Add first passkey'}
                    </button>
                  ) : null}
                  {profile.activeRole === 'owner' ? (
                    <Link className="button ghost link-button" href="/console/users">
                      Open users
                    </Link>
                  ) : null}
                </div>
              </article>
            ) : null}

            {profile.passkeys.length === 0 ? (
              <div className="notice warning">
                <strong>Add a passkey to finish setup.</strong>
                <div>
                  This local account can already sign in to the console, but it still cannot
                  approve requests until at least one approval passkey is registered below.
                </div>
              </div>
            ) : null}

            <div className="console-section-grid">
            <article className="card stack">
              <div className="console-section-header">
                <div>
                  <div className="label">Current identity</div>
                  <h3>Console user</h3>
                </div>
                <span className="console-meta-pill">{profile.activeRole ?? 'no role'}</span>
              </div>

              <div className="console-detail-list">
                <div className="console-detail-item">
                  <span>Name</span>
                  <strong>{profile.user.name ?? 'No display name'}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Email</span>
                  <strong>{profile.user.email}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Organization</span>
                  <strong>{profile.activeOrganization?.name ?? 'No active organization'}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Password updated</span>
                  <strong>{formatTimestamp(profile.passwordSetAt)}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Registered passkeys</span>
                  <strong>{profile.passkeys.length}</strong>
                </div>
              </div>

              <div className="empty">
                This account can approve requests only after a passkey is registered and the
                matched policy allows its organization role.
              </div>
            </article>

            <article className="card stack">
              <div>
                <div className="label">Password</div>
                <h3>Rotate console password</h3>
              </div>

              <form className="stack" onSubmit={handlePasswordSubmit}>
                <label className="field">
                  <span>Current password</span>
                  <input
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                    type="password"
                    value={passwordForm.currentPassword}
                  />
                </label>

                <label className="field">
                  <span>New password</span>
                  <input
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        newPassword: event.target.value,
                      }))
                    }
                    placeholder="Minimum 8 characters"
                    type="password"
                    value={passwordForm.newPassword}
                  />
                </label>

                <label className="field">
                  <span>Confirm new password</span>
                  <input
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                    type="password"
                    value={passwordForm.confirmPassword}
                  />
                </label>

                <div className="console-user-actions">
                  <button className="button" disabled={savingPassword} type="submit">
                    {savingPassword ? 'Updating...' : 'Update password'}
                  </button>
                </div>
              </form>
            </article>

            <article className="card stack">
              <div className="console-section-header">
                <div>
                  <div className="label">Passkey devices</div>
                  <h3>Approval passkeys</h3>
                </div>
                <button
                  className="button"
                  disabled={registeringPasskey}
                  onClick={handleAddPasskey}
                  type="button"
                >
                  {registeringPasskey ? 'Adding passkey...' : 'Add passkey'}
                </button>
              </div>

              <div className="empty">
                Add or remove the passkeys this local user will use on approval links. Console
                sign-in still uses the password above.
              </div>

              {profile.passkeys.length === 0 ? (
                <div className="empty">
                  No passkeys are registered yet. Add one before handling approval requests that
                  require human passkey authentication.
                </div>
              ) : (
                <div className="console-list compact">
                  {profile.passkeys.map((passkey) => (
                    <article className="console-list-card compact" key={passkey.id}>
                      <div className="console-user-card-header">
                        <div className="stack">
                          <div className="console-card-title">
                            {passkey.deviceType ?? 'Passkey device'}
                          </div>
                          <div className="mono-wrap">{formatCredentialId(passkey.credentialId)}</div>
                        </div>

                        <button
                          className="button ghost"
                          disabled={deletingCredentialId === passkey.id}
                          onClick={() => handleDeletePasskey(passkey.id)}
                          type="button"
                        >
                          {deletingCredentialId === passkey.id ? 'Removing...' : 'Remove'}
                        </button>
                      </div>

                      <div className="console-meta-grid">
                        <div className="console-detail-item">
                          <span>Added</span>
                          <strong>{formatTimestamp(passkey.createdAt)}</strong>
                        </div>
                        <div className="console-detail-item">
                          <span>Last used</span>
                          <strong>{formatTimestamp(passkey.lastUsedAt)}</strong>
                        </div>
                        <div className="console-detail-item">
                          <span>Backed up</span>
                          <strong>{passkey.backedUp ? 'Yes' : 'No / unknown'}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
