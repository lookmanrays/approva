'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type {
  CreateLocalUserInput,
  LocalUserRecord,
  OrganizationMemberRole,
  UpdateLocalUserInput,
} from '@approva/shared';
import {
  createConsoleLocalUser,
  disableConsoleLocalUser,
  enableConsoleLocalUser,
  grantConsoleLocalUserOwner,
  listConsoleLocalUsers,
  reduceConsoleLocalUserOwner,
  removeConsoleLocalUser,
  updateConsoleLocalUser,
} from '@/lib/console-api';

const ROLE_OPTIONS: Array<{
  value: OrganizationMemberRole;
  label: string;
  description: string;
}> = [
  {
    value: 'owner',
    label: 'Owner',
    description: 'Full console control, policy changes, and organization management.',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Can manage policies, integrations, machine access, and users.',
  },
  {
    value: 'member',
    label: 'Member',
    description: 'Can sign in and inspect the console but cannot change admin settings.',
  },
  {
    value: 'approver',
    label: 'Approver',
    description: 'Can sign in and approve requests when policies allow that role.',
  },
];

const NON_OWNER_ROLE_OPTIONS = ROLE_OPTIONS.filter((option) => option.value !== 'owner');

type UserFormState = {
  email: string;
  name: string;
  password: string;
  role: OrganizationMemberRole;
};

const DEFAULT_FORM_STATE: UserFormState = {
  email: '',
  name: '',
  password: '',
  role: 'approver',
};

function formatTimestamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function getOwnerReductionBlockReason(
  user: LocalUserRecord,
  currentUserId: string | null,
  ownerCount: number,
  canGrantOwner: boolean,
) {
  if (user.role !== 'owner') {
    return null;
  }

  if (!canGrantOwner) {
    return 'Only a current owner can reduce owner access.';
  }

  if (user.id === currentUserId) {
    return 'Use another owner account if you need to reduce your own owner access.';
  }

  if (user.isBootstrapOperator) {
    return 'This is the recovery owner and must remain an owner.';
  }

  if (ownerCount <= 1) {
    return 'Add another owner before reducing the last owner.';
  }

  return null;
}

function getDisableBlockReason(
  user: LocalUserRecord,
  currentUserId: string | null,
  ownerCount: number,
  canGrantOwner: boolean,
) {
  if (user.role === 'owner' && !canGrantOwner) {
    return 'Only a current owner can disable another owner.';
  }

  if (user.id === currentUserId) {
    return 'You cannot disable your own active console user.';
  }

  if (user.isBootstrapOperator) {
    return 'The recovery owner cannot be disabled.';
  }

  if (user.role === 'owner' && ownerCount <= 1) {
    return 'Add another owner before disabling the last owner.';
  }

  return null;
}

function getRemoveBlockReason(
  user: LocalUserRecord,
  currentUserId: string | null,
  ownerCount: number,
  canGrantOwner: boolean,
) {
  if (user.role === 'owner' && !canGrantOwner) {
    return 'Only a current owner can remove another owner.';
  }

  if (user.id === currentUserId) {
    return 'You cannot remove your own active console user.';
  }

  if (user.isBootstrapOperator) {
    return 'The recovery owner cannot be removed.';
  }

  if (user.role === 'owner' && ownerCount <= 1) {
    return 'Add another owner before removing the last owner.';
  }

  return null;
}

function toCreateInput(form: UserFormState): CreateLocalUserInput {
  return {
    email: form.email.trim(),
    name: form.name.trim(),
    password: form.password,
    role: form.role,
  };
}

function toUpdateInput(form: UserFormState): UpdateLocalUserInput {
  return {
    name: form.name.trim(),
    role: form.role,
    ...(form.password.trim()
      ? {
          password: form.password,
        }
      : {}),
  };
}

export function ConsoleUsersPage({
  activeRole,
  canManageUsers,
  currentUserId,
}: {
  activeRole: OrganizationMemberRole | null;
  canManageUsers: boolean;
  currentUserId: string | null;
}) {
  const [users, setUsers] = useState<LocalUserRecord[]>([]);
  const [form, setForm] = useState<UserFormState>(DEFAULT_FORM_STATE);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(canManageUsers);
  const [submitting, setSubmitting] = useState(false);
  const [actingUserId, setActingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const ownerCount = useMemo(
    () => users.filter((user) => user.role === 'owner').length,
    [users],
  );
  const canGrantOwner = activeRole === 'owner';

  const formTitle = useMemo(
    () => (editingUserId ? 'Update local user' : 'Create local user'),
    [editingUserId],
  );
  const selectedRole = useMemo(
    () => ROLE_OPTIONS.find((option) => option.value === form.role) ?? ROLE_OPTIONS[0],
    [form.role],
  );
  const editingOwner = editingUserId !== null && form.role === 'owner';

  const loadUsers = async () => {
    if (!canManageUsers) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await listConsoleLocalUsers();
      setUsers(response.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load local users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [canManageUsers]);

  const resetForm = () => {
    setForm(DEFAULT_FORM_STATE);
    setEditingUserId(null);
    setEditingUserEmail(null);
  };

  const handleDisable = async (user: LocalUserRecord) => {
    if (
      !window.confirm(
        `Disable ${user.email}? They will immediately lose console access and approval access until re-enabled.`,
      )
    ) {
      return;
    }

    setActingUserId(user.id);
    setError(null);
    setSuccess(null);

    try {
      await disableConsoleLocalUser(user.id);
      if (editingUserId === user.id) {
        resetForm();
      }
      setSuccess(`${user.email} is now disabled and recorded in the audit chain.`);
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to disable local user.');
    } finally {
      setActingUserId(null);
    }
  };

  const handleEnable = async (user: LocalUserRecord) => {
    setActingUserId(user.id);
    setError(null);
    setSuccess(null);

    try {
      await enableConsoleLocalUser(user.id);
      setSuccess(`${user.email} is active again and the change was recorded in the audit chain.`);
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to enable local user.');
    } finally {
      setActingUserId(null);
    }
  };

  const handleGrantOwner = async (user: LocalUserRecord) => {
    if (
      !window.confirm(
        `Grant owner access to ${user.email}? Owners can manage policies, users, integrations, machine access, and other owners.`,
      )
    ) {
      return;
    }

    setActingUserId(user.id);
    setError(null);
    setSuccess(null);

    try {
      await grantConsoleLocalUserOwner(user.id);
      if (editingUserId === user.id) {
        resetForm();
      }
      setSuccess(`${user.email} is now an owner and the change was recorded in the audit chain.`);
      await loadUsers();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Failed to grant owner access.',
      );
    } finally {
      setActingUserId(null);
    }
  };

  const handleReduceOwner = async (user: LocalUserRecord) => {
    if (
      !window.confirm(
        `Reduce owner access for ${user.email}? They will keep console access as an admin, and you can make any further role changes afterward if needed.`,
      )
    ) {
      return;
    }

    setActingUserId(user.id);
    setError(null);
    setSuccess(null);

    try {
      await reduceConsoleLocalUserOwner(user.id);
      if (editingUserId === user.id) {
        resetForm();
      }
      setSuccess(
        `${user.email} is now an admin and the owner-access change was recorded in the audit chain.`,
      );
      await loadUsers();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Failed to reduce owner access.',
      );
    } finally {
      setActingUserId(null);
    }
  };

  const handleRemove = async (user: LocalUserRecord) => {
    if (
      !window.confirm(
        `Remove ${user.email} from this organization? Their console sessions will be cleared and they will disappear from the managed users list.`,
      )
    ) {
      return;
    }

    setActingUserId(user.id);
    setError(null);
    setSuccess(null);

    try {
      await removeConsoleLocalUser(user.id);
      if (editingUserId === user.id) {
        resetForm();
      }
      setSuccess(`${user.email} was removed from the organization and the change was recorded in the audit chain.`);
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to remove local user.');
    } finally {
      setActingUserId(null);
    }
  };

  const startEditing = (user: LocalUserRecord) => {
    setEditingUserId(user.id);
    setEditingUserEmail(user.email);
    setForm({
      email: user.email,
      name: user.name ?? '',
      password: '',
      role: user.role,
    });
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!form.name.trim()) {
        setError('Name is required.');
        setSubmitting(false);
        return;
      }

      if (!editingUserId && !form.email.trim()) {
        setError('Email is required.');
        setSubmitting(false);
        return;
      }

      if (!editingUserId && form.password.length < 8) {
        setError('Password must be at least 8 characters.');
        setSubmitting(false);
        return;
      }

      if (editingUserId && form.password.trim() && form.password.length < 8) {
        setError('Password must be at least 8 characters.');
        setSubmitting(false);
        return;
      }

      if (editingUserId) {
        await updateConsoleLocalUser(editingUserId, toUpdateInput(form));
        setSuccess('Local user updated and recorded in the audit chain.');
      } else {
        await createConsoleLocalUser(toCreateInput(form));
        setSuccess('Local user created and recorded in the audit chain.');
      }

      resetForm();
      await loadUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save local user.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="console-stack">
      <section className="card stack">
        <div>
          <div className="label">Organization access</div>
          <h2>Local users</h2>
        </div>
        <p>
          Create the local users that can sign in to this console. Approval passkeys are also tied
          to these local users, so an email must exist here before it can register a passkey and
          approve requests. Disabled users keep their history, but lose console and approval access
          immediately.
        </p>

        <div className="notice warning">
          <strong>Owner access is protected.</strong>
          <div>
            The bootstrap operator stays an owner so the deployment always has a recovery path.
            Grant owner access explicitly from the user list, and reduce it explicitly back to{' '}
            <span className="mono">admin</span> when you want to hand off day-to-day
            administration.
          </div>
        </div>

        {!canManageUsers ? (
          <div className="empty">
            Your role is <span className="mono">{activeRole ?? 'unknown'}</span>. Local user
            management is limited to organization owners and admins.
          </div>
        ) : (
          <div className="console-user-grid">
            <form className="card stack" onSubmit={handleSubmit}>
              <div className="console-section-header">
                <div>
                  <div className="label">Access control</div>
                  <h3>{formTitle}</h3>
                </div>
                {editingUserId ? (
                  <span className="console-meta-pill">Editing {editingUserEmail}</span>
                ) : null}
              </div>

              <div className="console-detail-item">
                <span>Selected role</span>
                <strong>{selectedRole.label}</strong>
                <div>{selectedRole.description}</div>
              </div>

              <div className="console-user-form-grid">
                <label className="field">
                  <span>Name</span>
                  <input
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Jordan Vale"
                    value={form.name}
                  />
                </label>

                {editingUserId ? (
                  <label className="field">
                    <span>Email</span>
                    <input disabled value={editingUserEmail ?? form.email} />
                    <span className="helper">Email is the stable approval identity key.</span>
                  </label>
                ) : (
                  <label className="field">
                    <span>Email</span>
                    <input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="approver@example.com"
                      type="email"
                      value={form.email}
                    />
                  </label>
                )}

                <label className="field">
                  <span>{editingUserId ? 'Reset password' : 'Password'}</span>
                  <input
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder={
                      editingUserId ? 'Leave blank to keep current password' : 'Minimum 8 characters'
                    }
                    type="password"
                    value={form.password}
                  />
                  <span className="helper">
                    {editingUserId
                      ? 'Only set this if you want to rotate the console password.'
                      : 'Used for local console sign-in. Approval decisions still require passkeys.'}
                  </span>
                </label>

                {editingOwner ? (
                  <div className="console-detail-item">
                    <span>Role</span>
                    <strong>Owner</strong>
                    <div>
                      Use the dedicated owner actions in the user list to grant or reduce owner
                      access. Regular edits here keep this user as an owner.
                    </div>
                  </div>
                ) : (
                  <label className="field">
                    <span>Role</span>
                    <select
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          role: event.target.value as OrganizationMemberRole,
                        }))
                      }
                      value={form.role}
                    >
                      {NON_OWNER_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  <span className="helper">
                    Owner access uses dedicated actions so promotion and reduction stay explicit in
                    the audit trail.
                  </span>
                </label>
              )}
              </div>

              <div className="console-detail-item">
                <span>What this enables</span>
                <strong>
                  Console sign-in uses the password above. Approval still requires a registered
                  passkey on an approval link.
                </strong>
              </div>

              <div className="empty">
                Disable keeps the identity and audit history while blocking access. Remove drops
                the organization membership entirely.
              </div>

              {editingUserId === currentUserId ? (
                <div className="notice warning">
                  <strong>Editing your own account</strong>
                  <div>
                    Use Console Settings for your own password changes. This screen is best for
                    other users and role updates.
                  </div>
                </div>
              ) : null}

              {error ? <div className="error">{error}</div> : null}
              {success ? <div className="notice success">{success}</div> : null}

              <div className="console-user-actions">
                <button className="button" disabled={submitting} type="submit">
                  {submitting ? 'Saving...' : editingUserId ? 'Save changes' : 'Create user'}
                </button>
                <button
                  className="button ghost"
                  disabled={submitting}
                  onClick={resetForm}
                  type="button"
                >
                  {editingUserId ? 'Cancel edit' : 'Clear'}
                </button>
              </div>
            </form>

            <section className="card stack">
              <div className="console-section-header">
                <div>
                  <div className="label">Managed identities</div>
                  <h3>Current local users</h3>
                </div>
                <span className="console-meta-pill">{users.length} total</span>
              </div>

              {loading ? (
                <div className="empty">Loading local users...</div>
              ) : users.length === 0 ? (
                <div className="empty">No local users exist yet.</div>
              ) : (
                <div className="console-list compact">
                  {users.map((user) => {
                    const ownerReductionBlockReason = getOwnerReductionBlockReason(
                      user,
                      currentUserId,
                      ownerCount,
                      canGrantOwner,
                    );
                    const disableBlockReason = getDisableBlockReason(
                      user,
                      currentUserId,
                      ownerCount,
                      canGrantOwner,
                    );
                    const removeBlockReason = getRemoveBlockReason(
                      user,
                      currentUserId,
                      ownerCount,
                      canGrantOwner,
                    );

                    return (
                      <article className="console-list-card compact" key={user.id}>
                      <div className="console-user-card-header">
                        <div className="stack">
                          <div className="console-card-title">{user.name ?? user.email}</div>
                          <div className="mono-wrap">{user.email}</div>
                        </div>

                        <div className="console-meta-strip">
                          <span className="console-meta-pill">
                            {user.role} · {user.status}
                          </span>
                          {user.isBootstrapOperator ? (
                            <span className="console-meta-pill">Recovery owner</span>
                          ) : null}
                          <button
                            className="button ghost"
                            onClick={() => startEditing(user)}
                            disabled={actingUserId === user.id || (user.role === 'owner' && !canGrantOwner)}
                            type="button"
                          >
                            Edit
                          </button>
                        </div>
                      </div>

                      <div className="console-meta-grid">
                        <div className="console-detail-item">
                          <span>Console password</span>
                          <strong>{user.passwordConfigured ? 'Configured' : 'Not configured'}</strong>
                        </div>
                        <div className="console-detail-item">
                          <span>Access state</span>
                          <strong>
                            {user.status === 'disabled'
                              ? `Disabled${user.disabledAt ? ` on ${formatTimestamp(user.disabledAt)}` : ''}`
                              : 'Active'}
                          </strong>
                        </div>
                        <div className="console-detail-item">
                          <span>Passkeys</span>
                          <strong>{user.passkeyCount}</strong>
                        </div>
                        <div className="console-detail-item">
                          <span>Last passkey use</span>
                          <strong>{formatTimestamp(user.lastPasskeyUsedAt)}</strong>
                        </div>
                        <div className="console-detail-item">
                          <span>Membership created</span>
                          <strong>{formatTimestamp(user.createdAt)}</strong>
                        </div>
                      </div>

                      <div className="empty">
                        {user.role === 'owner' || user.role === 'admin'
                          ? 'This user can administer the console and sign in locally.'
                          : user.role === 'approver'
                            ? 'This user can decide requests when matched policies allow the approver role.'
                            : 'This user can sign in and review console data but cannot change protected settings.'}
                      </div>

                      {user.role === 'owner' ? (
                        <div className="helper">
                          {ownerReductionBlockReason ??
                            'This user is one of multiple owners. Reduce owner access explicitly back to admin when you want to hand ownership down.'}
                        </div>
                      ) : null}

                      <div className="console-user-actions wrap">
                        {canGrantOwner && user.role !== 'owner' && user.status !== 'disabled' ? (
                          <button
                            className="button ghost"
                            disabled={actingUserId === user.id}
                            onClick={() => handleGrantOwner(user)}
                            type="button"
                          >
                            {actingUserId === user.id ? 'Working...' : 'Grant owner'}
                          </button>
                        ) : null}
                        {canGrantOwner && user.role === 'owner' ? (
                          <button
                            className="button ghost"
                            disabled={actingUserId === user.id || Boolean(ownerReductionBlockReason)}
                            onClick={() => handleReduceOwner(user)}
                            type="button"
                          >
                            {actingUserId === user.id ? 'Working...' : 'Reduce owner'}
                          </button>
                        ) : null}
                        {user.status === 'disabled' ? (
                          <button
                            className="button ghost"
                            disabled={actingUserId === user.id}
                            onClick={() => handleEnable(user)}
                            type="button"
                          >
                            {actingUserId === user.id ? 'Working...' : 'Enable'}
                          </button>
                        ) : (
                          <button
                            className="button ghost"
                            disabled={actingUserId === user.id || Boolean(disableBlockReason)}
                            onClick={() => handleDisable(user)}
                            type="button"
                          >
                            {actingUserId === user.id ? 'Working...' : 'Disable'}
                          </button>
                        )}
                        <button
                          className="button ghost"
                          disabled={actingUserId === user.id || Boolean(removeBlockReason)}
                          onClick={() => handleRemove(user)}
                          type="button"
                        >
                          {actingUserId === user.id ? 'Working...' : 'Remove'}
                        </button>
                      </div>

                      {disableBlockReason || removeBlockReason ? (
                        <div className="helper">
                          {disableBlockReason && removeBlockReason
                            ? `${disableBlockReason} ${removeBlockReason}`
                            : disableBlockReason ?? removeBlockReason}
                        </div>
                      ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
