'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  ApprovalDecision,
  Capability,
  InternalApprovalRequestDetailResponse,
  InternalTimelineEntry,
} from '@approva/shared';
import { getConsoleApprovalRequest } from '@/lib/console-api';

function formatTimestamp(value?: string | null) {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
}

function formatRequestedBy(system: string, actorId?: string | null) {
  if (actorId) {
    return `${system} · ${actorId}`;
  }

  return system;
}

function humanizeEventType(eventType: string) {
  return eventType
    .replaceAll('.', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function getEventPayloadObject(entry: InternalTimelineEntry) {
  return entry.payload ?? {};
}

function getFriendlyEventLabel(entry: InternalTimelineEntry) {
  const payload = getEventPayloadObject(entry);
  const authMethod =
    typeof payload.authMethod === 'string' ? payload.authMethod : null;

  switch (entry.eventType) {
    case 'approval_request.created':
      return 'Request created';
    case 'approval_request.pending':
      return 'Approval required';
    case 'approval_request.auto_approved':
      return 'Auto-approved by policy';
    case 'approval_request.approved':
      return authMethod === 'passkey' ? 'Approved with passkey' : 'Request approved';
    case 'approval_request.rejected':
      return authMethod === 'policy_engine' ? 'Rejected by policy' : 'Request rejected';
    case 'approval_request.expired':
      return 'Request expired';
    case 'approval_request.authorization_denied':
      return 'Unauthorized approval attempt denied';
    case 'capability.issued':
      return 'Capability issued';
    case 'capability.exchanged':
      return 'Capability exchanged';
    case 'capability.used':
      return 'Capability used';
    case 'deployment.executed':
      return 'Deployment executed';
    default:
      return humanizeEventType(entry.eventType);
  }
}

function getEventStory(entry: InternalTimelineEntry) {
  const payload = getEventPayloadObject(entry);
  const authContext =
    payload.authContext && typeof payload.authContext === 'object'
      ? (payload.authContext as Record<string, unknown>)
      : null;
  const approverEmail =
    typeof authContext?.approverEmail === 'string' ? authContext.approverEmail : null;
  const reason = typeof payload.reason === 'string' ? payload.reason : null;
  const requestedBySystem =
    typeof payload.requestedBySystem === 'string' ? payload.requestedBySystem : null;
  const action = typeof payload.action === 'string' ? payload.action : null;
  const capabilityId =
    typeof payload.capabilityId === 'string' ? payload.capabilityId : null;
  const authMethod = typeof payload.authMethod === 'string' ? payload.authMethod : null;

  switch (entry.eventType) {
    case 'approval_request.created':
      return requestedBySystem && action
        ? `${requestedBySystem} submitted ${action} for approval.`
        : 'An approval request was created.';
    case 'approval_request.pending':
      return 'Policy paused execution until a human records a decision.';
    case 'approval_request.auto_approved':
      return 'The request matched an organization policy that auto-approved execution.';
    case 'approval_request.approved':
      return approverEmail
        ? `${approverEmail} approved this request after passkey authentication.`
        : 'A human approver recorded an approval decision.';
    case 'approval_request.rejected':
      if (authMethod === 'policy_engine') {
        return reason
          ? `An organization policy rejected the request. Reason: ${reason}`
          : 'An organization policy rejected the request before human approval.';
      }
      return reason
        ? `The request was rejected. Reason: ${reason}`
        : 'A human approver rejected the request.';
    case 'approval_request.expired':
      return 'The request reached its expiry before a decision was made.';
    case 'approval_request.authorization_denied': {
      const authorizationMessage =
        typeof payload.authorizationMessage === 'string'
          ? payload.authorizationMessage
          : null;

      return authorizationMessage
        ? `A decision attempt was denied. ${authorizationMessage}`
        : 'A decision attempt was denied because the approver was not authorized for this request.';
    }
    case 'capability.issued':
      return capabilityId
        ? `Scoped capability ${capabilityId} was issued for this action.`
        : 'A scoped capability was issued for this request.';
    case 'capability.exchanged':
      return 'A machine client exchanged the one-time delivery token for the raw capability token.';
    case 'capability.used':
      return 'A client presented the scoped capability before continuing execution.';
    case 'deployment.executed':
      return 'The AI deploy demo recorded the production deployment as executed.';
    default:
      return 'Event recorded in the immutable event chain.';
  }
}

function getEventActorSummary(entry: InternalTimelineEntry) {
  const payload = getEventPayloadObject(entry);
  const authContext =
    payload.authContext && typeof payload.authContext === 'object'
      ? (payload.authContext as Record<string, unknown>)
      : null;
  const approverEmail =
    typeof authContext?.approverEmail === 'string' ? authContext.approverEmail : null;

  if (approverEmail) {
    return approverEmail;
  }

  if (entry.actorType && entry.actorId) {
    return `${entry.actorType} · ${entry.actorId}`;
  }

  return entry.actorId ?? null;
}

function getDecisionIdentity(decision: ApprovalDecision | null | undefined) {
  if (!decision) {
    return 'No decision recorded';
  }

  const authContext =
    decision.authContext && typeof decision.authContext === 'object'
      ? decision.authContext
      : null;
  const approverEmail =
    typeof authContext?.approverEmail === 'string' ? authContext.approverEmail : null;

  if (approverEmail && decision.approverDisplayName) {
    return `${decision.approverDisplayName} · ${approverEmail}`;
  }

  if (approverEmail) {
    return approverEmail;
  }

  if (decision.approverDisplayName) {
    return `${decision.approverDisplayName} · ${decision.approverId}`;
  }

  return decision.approverId;
}

function getCompactAuthContext(decision: ApprovalDecision | null | undefined) {
  if (!decision?.authContext || typeof decision.authContext !== 'object') {
    return 'No auth context captured';
  }

  const authContext = decision.authContext as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof authContext.approverEmail === 'string') {
    parts.push(authContext.approverEmail);
  }

  if (typeof authContext.credentialId === 'string') {
    parts.push(`credential ${authContext.credentialId}`);
  }

  if (typeof authContext.sessionId === 'string') {
    parts.push(`session ${authContext.sessionId}`);
  }

  if (typeof authContext.sessionExpiresAt === 'string') {
    parts.push(`session expires ${formatTimestamp(authContext.sessionExpiresAt)}`);
  }

  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(authContext);
}

function getCapabilityState(capability: Capability | null | undefined) {
  if (!capability) {
    return 'Not issued';
  }

  if (capability.revokedAt) {
    return 'Revoked';
  }

  if (Date.parse(capability.expiresAt) <= Date.now()) {
    return 'Expired';
  }

  return 'Issued';
}

export function ConsoleApprovalDetailPage({
  approvalRequestId,
}: {
  approvalRequestId: string;
}) {
  const [detail, setDetail] = useState<InternalApprovalRequestDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await getConsoleApprovalRequest(approvalRequestId);

        if (!cancelled) {
          setDetail(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load approval detail.');
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
  }, [approvalRequestId]);

  if (loading && !detail) {
    return (
      <main className="console-stack">
        <div className="card empty">Loading approval detail...</div>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="console-stack">
        <div className="error">{error ?? 'Approval detail is unavailable.'}</div>
      </main>
    );
  }

  const { request } = detail;
  const ledgerLink =
    detail.ledgerSummary.firstSequence && detail.ledgerSummary.lastSequence
      ? `/console/ledger?fromSeq=${detail.ledgerSummary.firstSequence}&toSeq=${detail.ledgerSummary.lastSequence}`
      : '/console/ledger';

  return (
    <main className="console-stack">
      <section className="card stack">
        <div className="console-section-header">
          <div>
            <div className="label">Approval detail</div>
            <h2>Request {request.id}</h2>
          </div>
          <div className="actions">
            <Link className="button ghost link-button" href="/console/approvals">
              Back to inbox
            </Link>
            {detail.request.latestDecision?.authMethod === 'passkey' ? (
              <Link className="button primary link-button" href={ledgerLink}>
                Verify related ledger range
              </Link>
            ) : null}
          </div>
        </div>

        <div className="console-meta-grid">
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
            <dt>Action</dt>
            <dd>{request.action}</dd>
          </div>
          <div className="meta">
            <dt>Resource</dt>
            <dd className="mono">
              {request.resource.type}/{request.resource.id}
            </dd>
          </div>
          <div className="meta">
            <dt>Requested by</dt>
            <dd>{formatRequestedBy(request.requestedBy.system, request.requestedBy.actorId)}</dd>
          </div>
          <div className="meta">
            <dt>Created at</dt>
            <dd>{formatTimestamp(request.createdAt)}</dd>
          </div>
          <div className="meta">
            <dt>Decided at</dt>
            <dd>{formatTimestamp(request.decidedAt)}</dd>
          </div>
          <div className="meta">
            <dt>Expires at</dt>
            <dd>{formatTimestamp(request.expiresAt)}</dd>
          </div>
        </div>
      </section>

      <section className="console-approval-layout">
        <article className="card stack">
          <div>
            <div className="label">Request context</div>
            <h2>Policy and payload</h2>
          </div>

          <div className="console-detail-list">
            <div className="console-detail-item">
              <span>External request id</span>
              <strong className="mono-wrap">{request.externalRequestId ?? 'Not provided'}</strong>
            </div>
            <div className="console-detail-item">
              <span>Callback URL</span>
              <strong className="mono-wrap">{request.callbackUrl ?? 'No callback configured'}</strong>
            </div>
            <div className="console-detail-item">
              <span>Capability delivery mode</span>
              <strong>{request.callback?.deliverCapabilityMode ?? 'none'}</strong>
            </div>
            <div className="console-detail-item">
              <span>Policy decision</span>
              <strong>{request.policyResult.decision}</strong>
            </div>
            <div className="console-detail-item">
              <span>Matched rules</span>
              <strong>{request.policyResult.matchedRules.join(', ') || 'None'}</strong>
            </div>
            <div className="console-detail-item">
              <span>Allowed approver roles</span>
              <strong>
                {request.policyResult.approverRoles?.length
                  ? request.policyResult.approverRoles.join(', ')
                  : 'No approver roles recorded'}
              </strong>
            </div>
          </div>

          <div className="field">
            <span>Policy reasons</span>
            <div className="empty">
              {request.policyResult.reasons.length > 0
                ? request.policyResult.reasons.join(' ')
                : 'No policy reasons recorded.'}
            </div>
          </div>

          <div className="field">
            <span>Params preview</span>
            <pre className="params">{JSON.stringify(request.params, null, 2)}</pre>
          </div>
        </article>

        <div className="console-approval-sidebar">
          <article className="card stack">
            <div>
              <div className="label">Decision and auth</div>
              <h2>Human decision summary</h2>
            </div>

            {request.latestDecision ? (
              <div className="console-detail-list">
                <div className="console-detail-item">
                  <span>Decision</span>
                  <strong>{request.latestDecision.decision}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Approver</span>
                  <strong>{getDecisionIdentity(request.latestDecision)}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Auth method</span>
                  <strong>{request.latestDecision.authMethod ?? 'Unknown'}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Decision comment</span>
                  <strong>{request.latestDecision.reason ?? 'No comment recorded'}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Auth context</span>
                  <strong className="mono-wrap">
                    {getCompactAuthContext(request.latestDecision)}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="empty">No human decision is recorded for this request.</div>
            )}
          </article>

          <article className="card stack">
            <div>
              <div className="label">Capability</div>
              <h2>Scoped permission summary</h2>
            </div>

            {request.capability ? (
              <div className="console-detail-list">
                <div className="console-detail-item">
                  <span>State</span>
                  <strong>{getCapabilityState(request.capability)}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Usage count</span>
                  <strong>{detail.capabilityUsageCount}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Expires at</span>
                  <strong>{formatTimestamp(request.capability.expiresAt)}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Revoked at</span>
                  <strong>{formatTimestamp(request.capability.revokedAt)}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Action binding</span>
                  <strong>{request.capability.action}</strong>
                </div>
                <div className="console-detail-item">
                  <span>Resource binding</span>
                  <strong className="mono">
                    {request.capability.resource.type}/{request.capability.resource.id}
                  </strong>
                </div>
                <div className="console-detail-item">
                  <span>Params hash</span>
                  <strong className="mono-wrap">{request.capability.paramsHash}</strong>
                </div>
              </div>
            ) : (
              <div className="empty">No capability has been issued for this request.</div>
            )}
          </article>

          <article className="card stack">
            <div>
              <div className="label">Ledger</div>
              <h2>Chain summary</h2>
            </div>

            <div className="console-detail-list">
              <div className="console-detail-item">
                <span>Ledger entries</span>
                <strong>{detail.ledgerSummary.totalEntries}</strong>
              </div>
              <div className="console-detail-item">
                <span>First sequence</span>
                <strong>{detail.ledgerSummary.firstSequence ?? 'N/A'}</strong>
              </div>
              <div className="console-detail-item">
                <span>Last sequence</span>
                <strong>{detail.ledgerSummary.lastSequence ?? 'N/A'}</strong>
              </div>
              <div className="console-detail-item">
                <span>Latest entry hash</span>
                <strong className="mono-wrap">
                  {detail.ledgerSummary.latestEntryHash ?? 'N/A'}
                </strong>
              </div>
            </div>

            <div className="actions">
              <Link className="button ghost link-button" href={ledgerLink}>
                Open ledger verifier
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="card stack">
        <div>
          <div className="label">Event timeline</div>
          <h2>Readable event chain</h2>
        </div>

        {detail.timeline.length === 0 ? (
          <div className="empty">No events recorded for this request yet.</div>
        ) : (
          <div className="timeline">
            {detail.timeline.map((entry) => {
              const actorSummary = getEventActorSummary(entry);

              return (
                <article className="timeline-item done" key={entry.immutableEventId}>
                  <div className="timeline-marker" />
                  <div className="timeline-details">
                    <div className="timeline-header">
                      <div>
                        <div className="timeline-story">{getFriendlyEventLabel(entry)}</div>
                        <p>{getEventStory(entry)}</p>
                      </div>
                      <div className="timeline-meta">{formatTimestamp(entry.createdAt)}</div>
                    </div>

                    {actorSummary ? (
                      <div className="timeline-meta">Actor: {actorSummary}</div>
                    ) : null}

                    <details className="timeline-details-panel">
                      <summary>Technical details</summary>
                      <div className="timeline-meta mono-wrap">
                        Immutable event id: {entry.immutableEventId}
                        <br />
                        Event type: {entry.eventType}
                        <br />
                        Payload hash: {entry.payloadHash}
                        <br />
                        Ledger seq: {entry.ledgerSequence ?? 'N/A'}
                        <br />
                        Ledger entry hash: {entry.ledgerEntryHash ?? 'N/A'}
                      </div>
                      <pre className="params timeline-payload">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card stack">
        <div>
          <div className="label">Webhooks</div>
          <h2>Delivery summary</h2>
        </div>

        {detail.webhookDeliveries.length === 0 ? (
          <div className="empty">No webhook deliveries are recorded for this request.</div>
        ) : (
          <div className="console-list compact">
            {detail.webhookDeliveries.map((delivery) => (
              <article className="console-list-card compact" key={delivery.id}>
                <div className="console-list-row">
                  <div>
                    <div className="console-card-title">{delivery.eventType}</div>
                    <div className="helper mono-wrap">{delivery.callbackUrl}</div>
                  </div>
                  <div className={`status ${delivery.status}`}>{delivery.status}</div>
                </div>

                <div className="console-meta-grid">
                  <div className="meta">
                    <dt>Attempts</dt>
                    <dd>{delivery.attemptCount}</dd>
                  </div>
                  <div className="meta">
                    <dt>Last attempt</dt>
                    <dd>{formatTimestamp(delivery.lastAttemptAt)}</dd>
                  </div>
                  <div className="meta">
                    <dt>Response status</dt>
                    <dd>{delivery.responseStatus ?? 'N/A'}</dd>
                  </div>
                  <div className="meta">
                    <dt>Created at</dt>
                    <dd>{formatTimestamp(delivery.createdAt)}</dd>
                  </div>
                </div>

                {delivery.responseBody ? (
                  <details className="timeline-details-panel">
                    <summary>Response body</summary>
                    <pre className="params timeline-payload">{delivery.responseBody}</pre>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
