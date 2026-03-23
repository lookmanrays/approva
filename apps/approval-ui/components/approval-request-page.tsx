'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useState } from 'react';
import type { ApprovalRequest, ApprovalRequestResponse } from '@approva/shared';
import { getApprovalClient } from '@/lib/api';
import {
  cleanupExpiredDemoCapabilityTokens,
  storeDemoCapabilityToken,
} from '@/lib/demo-capability-bridge';
import { useAuth } from './auth-provider';

interface ApprovalRequestPageProps {
  requestId: string;
  approvalAccessToken: string | null;
}

const DEFAULT_APPROVER_EMAIL =
  process.env.NEXT_PUBLIC_SAMPLE_APPROVER_EMAIL ?? 'approver@example.com';

function formatTimestamp(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return new Date(value).toLocaleString();
}

function readAuthContextString(
  value: Record<string, unknown> | null | undefined,
  key: string,
) {
  const candidate = value?.[key];
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function getAuthorizationGuidance(
  code: string | null | undefined,
  hasAuthenticatedSession: boolean,
) {
  switch (code) {
    case 'authorized':
      return 'This local user satisfies the policy role requirements for this request.';
    case 'not_authenticated':
      return hasAuthenticatedSession
        ? 'Your approval session is missing role information. Refresh the page or authenticate again.'
        : 'Authenticate with an existing passkey to check whether this local user can decide the request.';
    case 'approver_email_missing':
      return 'The current passkey session is missing the local user email. Authenticate again.';
    case 'no_allowed_roles_configured':
      return 'The matched policy does not allow any human approver roles, so this request cannot be manually approved.';
    case 'not_member_of_organization':
      return 'This passkey belongs to a user that is not an active member of this organization.';
    case 'role_not_allowed':
      return 'This local user is active, but their organization role is not allowed to decide this request.';
    default:
      return null;
  }
}

function getFriendlyRequestLoadError(message: string) {
  if (message.includes('Missing approval access token')) {
    return {
      title: 'Approval link incomplete',
      body: 'This page needs the full secure approval URL, including its token query parameter.',
    };
  }

  if (message.includes('Invalid approval access token')) {
    return {
      title: 'Approval link invalid',
      body: 'This secure approval token is invalid. Reopen the exact Approva approval URL returned when the request was created.',
    };
  }

  if (message.includes('Approval request not found')) {
    return {
      title: 'Approval request unavailable',
      body: 'This approval request could not be found. It may have been removed or the link may be incorrect.',
    };
  }

  return {
    title: 'Request unavailable',
    body: message,
  };
}

function getFriendlyPasskeyError(message: string) {
  if (message.includes('No passkey is registered')) {
    return 'No passkey is registered for this local user yet. Sign in to the Approva Console and add one in Settings, then return here to authenticate.';
  }

  if (message.includes('Passkey enrollment from approval links is disabled')) {
    return 'Passkey enrollment no longer happens on approval links. Sign in to the Approva Console and add the passkey under Settings first.';
  }

  if (message.includes('could not be verified')) {
    return 'Passkey authentication could not be verified. Retry the browser passkey prompt and confirm the correct account is selected.';
  }

  if (message.includes('credential is not registered')) {
    return 'This passkey is not registered for the current approver email.';
  }

  return message;
}

function getFriendlyDecisionError(message: string) {
  if (message.includes('Authenticate with a passkey before submitting a decision')) {
    return 'No active passkey-authenticated session. Authenticate before approving or rejecting.';
  }

  if (message.includes('A valid passkey-authenticated approver session is required')) {
    return 'Your passkey session is no longer active. Authenticate again before submitting a decision.';
  }

  if (message.includes('expired')) {
    return 'This request has expired and can no longer be decided.';
  }

  if (message.includes('Invalid approval request transition')) {
    return 'This request was already decided and can no longer be changed.';
  }

  if (
    message.includes('not authorized to approve this request') ||
    message.includes('not a member of this organization') ||
    message.includes('No approver roles are configured')
  ) {
    return `You are not authorized to approve this request. ${message}`;
  }

  return message;
}

function getRequestStateCallout(request: ApprovalRequest) {
  switch (request.status) {
    case 'pending':
      return {
        tone: 'info' as const,
        title: 'Approval required',
        body: 'Authenticate with a passkey, then approve or reject this request.',
      };
    case 'approved':
      return {
        tone: 'success' as const,
        title: 'Already approved',
        body: 'This request already has a recorded approval decision and no further action is required here.',
      };
    case 'auto_approved':
      return {
        tone: 'success' as const,
        title: 'Auto-approved by policy',
        body: 'Approva auto-approved this request under the current policy, so manual approval is no longer needed.',
      };
    case 'rejected':
      return {
        tone: 'warning' as const,
        title: 'Already rejected',
        body: 'This request has already been rejected and cannot be reopened from this page.',
      };
    case 'expired':
      return {
        tone: 'warning' as const,
        title: 'Request expired',
        body: 'This request expired before a decision was recorded and can no longer be approved or rejected.',
      };
  }
}

export function ApprovalRequestPage({
  requestId,
  approvalAccessToken,
}: ApprovalRequestPageProps) {
  const auth = useAuth();
  const [approverEmail, setApproverEmail] = useState(DEFAULT_APPROVER_EMAIL);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ApprovalRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    cleanupExpiredDemoCapabilityTokens();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!approvalAccessToken) {
          throw new Error('Missing approval access token in URL.');
        }

        const nextResult = await getApprovalClient().getSecureApprovalRequest(
          requestId,
          approvalAccessToken,
        );

        if (!cancelled) {
          setResult(nextResult);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : 'Failed to load request.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [approvalAccessToken, refreshNonce, requestId]);

  const handleAuthenticate = async () => {
    setAuthenticating(true);
    setError(null);
    setAuthMessage(null);

    try {
      if (!approvalAccessToken) {
        throw new Error('Missing approval access token in URL.');
      }

      const authResult = await auth.authenticate('passkey', {
        requestId,
        token: approvalAccessToken,
        email: approverEmail,
      });

      setAuthMessage(
        `Passkey authenticated for ${authResult.subject}. Review the user and role summary below before deciding.`,
      );
      setRefreshNonce((current) => current + 1);
    } catch (authError) {
      setError(
        getFriendlyPasskeyError(
          authError instanceof Error
            ? authError.message
            : 'Failed to authenticate with passkey.',
        ),
      );
    } finally {
      setAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setError(null);
    setAuthMessage(null);

    try {
      await auth.logout();
      setAuthMessage('Approver session cleared. Authenticate again before submitting a decision.');
      setRefreshNonce((current) => current + 1);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Failed to clear approver session.');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDecision = async (decision: 'approve' | 'reject') => {
    setSubmitting(true);
    setError(null);

    try {
      if (!approvalAccessToken) {
        throw new Error('Missing approval access token in URL.');
      }

      if (!auth.session?.authenticated) {
        throw new Error('Authenticate with a passkey before submitting a decision.');
      }

      const client = getApprovalClient();
      const nextResult =
        decision === 'approve'
          ? await client.secureApproveRequest(requestId, approvalAccessToken, {
              reason: reason || undefined,
            })
          : await client.secureRejectRequest(requestId, approvalAccessToken, {
              reason: reason || undefined,
            });

      if (decision === 'approve' && nextResult.capability?.token) {
        storeDemoCapabilityToken(requestId, nextResult.capability.token);
        setAuthMessage(
          'Approval recorded. For the AI deploy demo, the capability token has been bridged back to the demo page in this browser for a short time.',
        );
      }

      startTransition(() => {
        setResult(nextResult);
      });
    } catch (decisionError) {
      setError(
        getFriendlyDecisionError(
          decisionError instanceof Error
            ? decisionError.message
            : 'Failed to submit decision.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const request = result?.request;
  const isPending = request?.status === 'pending';
  const isTerminal = Boolean(request && request.status !== 'pending');
  const hasAuthenticatedSession = auth.session?.authenticated === true;
  const decisionAuthorization = result?.approverAuthorization ?? null;
  const isUnauthorizedForDecision =
    hasAuthenticatedSession && decisionAuthorization?.authorized === false;
  const loadFailure = useMemo(
    () => getFriendlyRequestLoadError(error ?? 'Request unavailable.'),
    [error],
  );
  const requestState = request ? getRequestStateCallout(request) : null;
  const latestDecisionEmail =
    (request?.latestDecision?.authContext?.approverEmail as string | undefined) ?? null;
  const latestDecisionRole = readAuthContextString(
    (request?.latestDecision?.authContext as Record<string, unknown> | null | undefined) ?? null,
    'approverRole',
  );
  const authenticatedApprover = auth.session?.user ?? null;
  const approverSessionExpiresAt = auth.session?.expiresAt ?? null;
  const authenticatedRole = decisionAuthorization?.approverRole ?? null;
  const authorizationGuidance = getAuthorizationGuidance(
    decisionAuthorization?.code,
    hasAuthenticatedSession,
  );

  return (
    <main className="shell approval-shell">
      <section className="approval-header">
        <span className="eyebrow">Human Approval</span>
        <div className="approval-header-copy">
          <h1>Review and record a human decision.</h1>
          <p>
            The approval link identifies the request. A separate passkey-authenticated session
            identifies the local user making the decision.
          </p>
        </div>
        {request ? (
          <div className="approval-header-meta">
            <span className={`status ${request.status}`}>{request.status}</span>
            <span className={`status ${request.riskLevel}`}>{request.riskLevel}</span>
          </div>
        ) : null}
      </section>

      {loading ? (
        <section className="card">
          <p>Loading secure approval request...</p>
        </section>
      ) : error && !request ? (
        <section className="card stack">
          <h2>{loadFailure.title}</h2>
          <div className="error">{loadFailure.body}</div>
        </section>
      ) : request ? (
        <section className="grid two">
          <article className="card summary approval-summary-card">
            <div className="approval-summary-header">
              <div className="stack">
                <div className="label">Approval request</div>
                <h2>{request.action}</h2>
                <p>
                  Resource <span className="mono">{request.resource.type}</span> /
                  <span className="mono"> {request.resource.id}</span>
                </p>
              </div>
              <div className="approval-summary-tags">
                <span className={`status ${request.status}`}>{request.status}</span>
                <span className={`status ${request.riskLevel}`}>{request.riskLevel}</span>
              </div>
            </div>

            <dl className="meta-grid approval-meta-grid">
              <div className="meta">
                <dt>Request id</dt>
                <dd className="mono">{request.id}</dd>
              </div>
              <div className="meta">
                <dt>Created</dt>
                <dd>{formatTimestamp(request.createdAt)}</dd>
              </div>
              <div className="meta">
                <dt>Requested by</dt>
                <dd className="mono">
                  {request.requestedBy.system}
                  {request.requestedBy.actorId ? ` · ${request.requestedBy.actorId}` : ''}
                </dd>
              </div>
              <div className="meta">
                <dt>Expires at</dt>
                <dd>{request.expiresAt ? formatTimestamp(request.expiresAt) : 'N/A'}</dd>
              </div>
            </dl>

            {requestState ? (
              <div className={`notice ${requestState.tone}`}>
                <strong>{requestState.title}</strong>
                <div>{requestState.body}</div>
              </div>
            ) : null}

            <div className="approval-section">
              <div className="label">Policy result</div>
              <dl className="approval-kv-list">
                <div>
                  <dt>Decision</dt>
                  <dd className="mono">{request.policyResult.decision}</dd>
                </div>
                <div>
                  <dt>Matched rules</dt>
                  <dd className="mono-wrap">
                    {request.policyResult.matchedRules.length > 0
                      ? request.policyResult.matchedRules.join(', ')
                      : 'none'}
                  </dd>
                </div>
                <div>
                  <dt>Allowed roles</dt>
                  <dd className="mono">
                    {request.policyResult.approverRoles?.length
                      ? request.policyResult.approverRoles.join(', ')
                      : 'none recorded'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="approval-section">
              <div className="label">Params preview</div>
              <pre className="params">{JSON.stringify(request.params, null, 2)}</pre>
            </div>

            {request.latestDecision ? (
              <div className="empty stack approval-decision-record">
                <div className="label">Decision record</div>
                <div>
                  <strong>{request.latestDecision.decision}</strong>{' '}
                  {request.latestDecision.authMethod
                    ? `via ${request.latestDecision.authMethod}`
                    : ''}
                </div>
                <div>
                  By{' '}
                  <span className="mono">
                    {request.latestDecision.approverDisplayName ??
                      latestDecisionEmail ??
                      request.latestDecision.approverId ??
                      'unknown approver'}
                  </span>
                </div>
                {latestDecisionEmail ? (
                  <div>
                    Local user{' '}
                    <span className="mono">{latestDecisionEmail}</span>
                  </div>
                ) : null}
                {latestDecisionRole ? (
                  <div>
                    Role used{' '}
                    <span className="mono">{latestDecisionRole}</span>
                  </div>
                ) : null}
                <div>Recorded at <span className="mono">{formatTimestamp(request.latestDecision.createdAt)}</span></div>
                {request.latestDecision.reason ? <div>{request.latestDecision.reason}</div> : null}
              </div>
            ) : null}

            {result.capability ? (
              <div className="approval-section">
                <div className="label">Issued capability</div>
                <div className="empty stack">
                  <div>
                    Capability expires at{' '}
                    <span className="mono">
                      {new Date(result.capability.expiresAt).toISOString()}
                    </span>
                  </div>
                  <div>Raw capability tokens are hidden in the approval browser UI.</div>
                </div>
              </div>
            ) : null}
          </article>

          <aside className="card panel stack approval-panel">
            <div>
              <div className="label">Human identity and decision</div>
              <h2>{isPending ? 'Authenticate and decide' : 'Decision complete'}</h2>
            </div>
            {isPending ? (
              <p>
                The secure approval link scopes the request. Passkey authentication identifies the
                managed local user and creates a secure, httpOnly approver session on the API
                domain.
              </p>
            ) : (
              <div className="notice success approval-readonly-state">
                <strong>No further action is available on this request.</strong>
                <div>
                  The recorded decision above is final for this approval link. This panel is now
                  read-only and kept only for identity context.
                </div>
              </div>
            )}

            <div className="session-summary">
              <div className="session-line">
                <span className="label">Session status</span>
                <span className={`status ${hasAuthenticatedSession ? 'approved' : 'pending'}`}>
                  {hasAuthenticatedSession ? 'passkey-authenticated' : 'not authenticated'}
                </span>
              </div>
              {hasAuthenticatedSession && authenticatedApprover ? (
                <div className="session-details stack">
                  <div>
                    Local user{' '}
                    <span className="mono">
                      {authenticatedApprover.displayName} ({authenticatedApprover.email})
                    </span>
                  </div>
                  <div>
                    Session expires at{' '}
                    <span className="mono">{formatTimestamp(approverSessionExpiresAt)}</span>
                  </div>
                  {decisionAuthorization ? (
                    <div>
                      Decision eligibility{' '}
                      <span
                        className={`status ${
                          decisionAuthorization.authorized ? 'approved' : 'rejected'
                        }`}
                      >
                        {decisionAuthorization.authorized ? 'eligible' : 'not eligible'}
                      </span>
                    </div>
                  ) : null}
                  <div>
                    Role for this request{' '}
                    <span className="mono">
                      {authenticatedRole ?? 'no active allowed role'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="helper">
                  No active passkey session. Authenticate with an existing passkey to make a
                  decision. First-time passkey enrollment is intentionally not offered on this
                  approval page. Add passkeys from{' '}
                  <Link href="/console/settings">Console Settings</Link> first.
                </div>
              )}
            </div>

            {decisionAuthorization ? (
              <div className={`notice ${decisionAuthorization.authorized ? 'success' : 'warning'}`}>
                <strong>
                  {decisionAuthorization.authorized
                    ? 'This local user can decide the request.'
                    : 'This local user cannot decide the request.'}
                </strong>
                <div>{authorizationGuidance ?? decisionAuthorization.message}</div>
                <div>
                  Policy allows{' '}
                  <span className="mono">
                    {decisionAuthorization.allowedRoles.length > 0
                      ? decisionAuthorization.allowedRoles.join(', ')
                      : 'no human roles'}
                  </span>
                </div>
                {decisionAuthorization.approverRole ? (
                  <div>
                    Current organization role{' '}
                    <span className="mono">{decisionAuthorization.approverRole}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isPending ? (
              <>
                {!hasAuthenticatedSession ? (
                  <label className="field">
                    <span>Approver email</span>
                    <input
                      value={approverEmail}
                      onChange={(event) => setApproverEmail(event.target.value)}
                    />
                    <span className="helper">
                      This must match an active local user that already has a passkey in Console
                      Settings.
                    </span>
                  </label>
                ) : (
                  <div className="console-detail-item">
                    <span>Authenticated user</span>
                    <strong>
                      {authenticatedApprover?.displayName ?? 'Unknown approver'} (
                      {authenticatedApprover?.email ?? 'no email'})
                    </strong>
                    <div>
                      To switch users, log out below and authenticate again with that user&apos;s
                      passkey.
                    </div>
                  </div>
                )}

                <label className="field">
                  <span>Decision note</span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Optional context for the audit record."
                  />
                </label>

                <div className="helper">
                  The link scopes access to the request. The passkey proves who is making the
                  decision.
                </div>
                <div className="helper">
                  Need to add or replace a passkey for this user? Sign in to{' '}
                  <Link href="/console/settings">Console Settings</Link>, add the passkey there,
                  then return to this approval link and authenticate.
                </div>
              </>
            ) : (
              <div className="helper approval-terminal-helper">
                This approver session can still be cleared, but the request itself can no longer be
                approved or rejected again from this page.
              </div>
            )}

            {auth.sessionLoading ? (
              <div className="empty">Checking existing approver session...</div>
            ) : null}

            {authMessage ? <div className="notice success">{authMessage}</div> : null}
            {error && request ? <div className="error">{error}</div> : null}

            {isPending && !hasAuthenticatedSession ? (
              <div className="actions">
                <button
                  className="button primary"
                  disabled={
                    auth.sessionLoading ||
                    authenticating ||
                    submitting
                  }
                  onClick={() => void handleAuthenticate()}
                  type="button"
                >
                  {authenticating ? 'Authenticating...' : 'Authenticate with passkey'}
                </button>
              </div>
            ) : null}

            {isPending && hasAuthenticatedSession ? (
              <div className="actions">
                <button
                  className="button ghost"
                  disabled={auth.sessionLoading || loggingOut}
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  {loggingOut ? 'Clearing session...' : 'Logout'}
                </button>
              </div>
            ) : null}

            {!isPending && hasAuthenticatedSession ? (
              <div className="actions actions-compact">
                <button
                  className="button ghost button-compact"
                  disabled={auth.sessionLoading || loggingOut}
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  {loggingOut ? 'Clearing session...' : 'Logout'}
                </button>
              </div>
            ) : null}

            {isPending ? (
              <div className="actions approval-decision-actions">
                <button
                  className="button primary"
                  disabled={
                    !isPending ||
                    submitting ||
                    !hasAuthenticatedSession ||
                    isUnauthorizedForDecision
                  }
                  onClick={() => void handleDecision('approve')}
                  type="button"
                >
                  {submitting ? 'Submitting...' : 'Approve'}
                </button>
                <button
                  className="button secondary"
                  disabled={
                    !isPending ||
                    submitting ||
                    !hasAuthenticatedSession ||
                    isUnauthorizedForDecision
                  }
                  onClick={() => void handleDecision('reject')}
                  type="button"
                >
                  Reject
                </button>
              </div>
            ) : null}
          </aside>
        </section>
      ) : null}
    </main>
  );
}
