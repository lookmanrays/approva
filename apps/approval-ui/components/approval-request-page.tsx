'use client';

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
    return 'No passkey is registered for this approver yet. Register one first, then authenticate.';
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
  const [registering, setRegistering] = useState(false);
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

  const handleRegisterPasskey = async () => {
    setRegistering(true);
    setError(null);
    setAuthMessage(null);

    try {
      if (!approvalAccessToken) {
        throw new Error('Missing approval access token in URL.');
      }

      const registration = await auth.register('passkey', {
        requestId,
        token: approvalAccessToken,
        email: approverEmail,
      });
      setAuthMessage(
        `Passkey registered for ${registration.user.email}. Authenticate with that passkey to continue.`,
      );
    } catch (registrationError) {
      setError(
        getFriendlyPasskeyError(
          registrationError instanceof Error
            ? registrationError.message
            : 'Failed to register passkey.',
        ),
      );
    } finally {
      setRegistering(false);
    }
  };

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
        `Passkey authenticated for ${authResult.subject}. You can now approve or reject this request.`,
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

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Human Approval</span>
        <h1>Review before automation crosses the line.</h1>
        <p>
          The approval access token in the URL scopes which request can be viewed.
          A separate passkey-authenticated approver session is required before a
          human can approve or reject it.
        </p>
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
          <article className="card summary">
            <div className="stack">
              <div className="label">Action summary</div>
              <h2>{request.action}</h2>
              <p>
                Resource <span className="mono">{request.resource.type}</span> /
                <span className="mono"> {request.resource.id}</span>
              </p>
            </div>

            <dl className="meta-grid">
              <div className="meta">
                <dt>Status</dt>
                <dd>
                  <span className={`status ${request.status}`}>{request.status}</span>
                </dd>
              </div>
              <div className="meta">
                <dt>Risk level</dt>
                <dd>
                  <span className={`status ${request.riskLevel}`}>{request.riskLevel}</span>
                </dd>
              </div>
              <div className="meta">
                <dt>Request id</dt>
                <dd className="mono">{request.id}</dd>
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

            <div className="stack">
              <div className="label">Policy result</div>
              <p>
                Decision <span className="mono">{request.policyResult.decision}</span> with
                matched rules{' '}
                <span className="mono">
                  {request.policyResult.matchedRules.length > 0
                    ? request.policyResult.matchedRules.join(', ')
                    : 'none'}
                </span>
              </p>
              <p>
                Allowed approver roles{' '}
                <span className="mono">
                  {request.policyResult.approverRoles?.length
                    ? request.policyResult.approverRoles.join(', ')
                    : 'none recorded'}
                </span>
              </p>
            </div>

            <div className="stack">
              <div className="label">Params preview</div>
              <pre className="params">{JSON.stringify(request.params, null, 2)}</pre>
            </div>

            {request.latestDecision ? (
              <div className="empty stack">
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
                <div>Recorded at <span className="mono">{formatTimestamp(request.latestDecision.createdAt)}</span></div>
                {request.latestDecision.reason ? <div>{request.latestDecision.reason}</div> : null}
              </div>
            ) : null}

            {result.capability ? (
              <div className="stack">
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

          <aside className="card panel stack">
            <div>
              <div className="label">Approver authentication</div>
              <h2>Approve with passkey</h2>
            </div>
            <p>
              The secure approval URL identifies the request. Passkey authentication
              identifies the human approver and creates a secure, httpOnly approver
              session cookie on the API domain.
            </p>

            <div className="session-summary">
              <div className="session-line">
                <span className="label">Session status</span>
                <span className={`status ${hasAuthenticatedSession ? 'approved' : 'pending'}`}>
                  {hasAuthenticatedSession ? 'passkey-authenticated' : 'not authenticated'}
                </span>
              </div>
              {hasAuthenticatedSession && auth.session?.user ? (
                <div className="session-details stack">
                  <div>
                    Current approver{' '}
                    <span className="mono">
                      {auth.session.user.displayName} ({auth.session.user.email})
                    </span>
                  </div>
                  <div>
                    Session expires at{' '}
                    <span className="mono">{formatTimestamp(auth.session.expiresAt)}</span>
                  </div>
                  {decisionAuthorization ? (
                    <div>
                      Authorization status{' '}
                      <span
                        className={`status ${
                          decisionAuthorization.authorized ? 'approved' : 'rejected'
                        }`}
                      >
                        {decisionAuthorization.authorized ? 'authorized' : 'not authorized'}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="helper">
                  No active passkey session. Register a passkey if needed, then authenticate before making a decision.
                </div>
              )}
            </div>

            {isUnauthorizedForDecision && decisionAuthorization ? (
              <div className="notice warning">
                <strong>You are not authorized to approve this request.</strong>
                <div>{decisionAuthorization.message}</div>
                <div>
                  Allowed roles:{' '}
                  <span className="mono">
                    {decisionAuthorization.allowedRoles.length > 0
                      ? decisionAuthorization.allowedRoles.join(', ')
                      : 'none configured'}
                  </span>
                </div>
                {decisionAuthorization.approverRole ? (
                  <div>
                    Your current organization role:{' '}
                    <span className="mono">{decisionAuthorization.approverRole}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="field">
              <span>Approver email</span>
              <input
                value={approverEmail}
                onChange={(event) => setApproverEmail(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Decision note</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Optional context for the audit record."
              />
            </label>

            <div className="helper">
              Approval token and passkey session are separate layers. The token scopes
              request access; the passkey proves who is making the decision.
            </div>

            {auth.sessionLoading ? (
              <div className="empty">Checking existing approver session...</div>
            ) : null}

            {authMessage ? <div className="notice success">{authMessage}</div> : null}
            {error && request ? <div className="error">{error}</div> : null}

            <div className="actions">
              <button
                className="button secondary"
                disabled={registering || authenticating || submitting || loggingOut}
                onClick={() => void handleRegisterPasskey()}
                type="button"
              >
                {registering ? 'Registering...' : 'Register passkey'}
              </button>
              <button
                className="button primary"
                disabled={auth.sessionLoading || authenticating || registering || submitting || loggingOut}
                onClick={() => void handleAuthenticate()}
                type="button"
              >
                {authenticating ? 'Authenticating...' : 'Authenticate with passkey'}
              </button>
              <button
                className="button ghost"
                disabled={auth.sessionLoading || loggingOut || !hasAuthenticatedSession}
                onClick={() => void handleLogout()}
                type="button"
              >
                {loggingOut ? 'Clearing session...' : 'Logout'}
              </button>
            </div>

            <div className="actions">
              <button
                className="button primary"
                disabled={
                  !isPending || submitting || !hasAuthenticatedSession || isUnauthorizedForDecision
                }
                onClick={() => void handleDecision('approve')}
                type="button"
              >
                {submitting ? 'Submitting...' : 'Approve'}
              </button>
              <button
                className="button secondary"
                disabled={
                  !isPending || submitting || !hasAuthenticatedSession || isUnauthorizedForDecision
                }
                onClick={() => void handleDecision('reject')}
                type="button"
              >
                Reject
              </button>
            </div>
          </aside>
        </section>
      ) : null}
    </main>
  );
}
