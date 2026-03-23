'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  InternalApprovalRequestListResponse,
  Organization,
  OrganizationMemberRole,
  OrganizationMembership,
  OrganizationSecurityEvent,
  OrganizationSecurityEventListResponse,
} from '@approva/shared';
import {
  listConsoleApprovalRequests,
  listConsoleSecurityEvents,
} from '@/lib/console-api';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const sampleApproverEmail =
  process.env.NEXT_PUBLIC_SAMPLE_APPROVER_EMAIL ?? 'approver@example.com';
const releaseLabel =
  process.env.NEXT_PUBLIC_APPROVA_RELEASE ??
  process.env.NEXT_PUBLIC_AUTHON_RELEASE ??
  'Open Core · 2026.03';

interface OperatorIdentity {
  id?: string | null;
  name?: string | null;
  email?: string | null;
}

function formatTimestamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function getSecurityEventLabel(eventType: string) {
  switch (eventType) {
    case 'organization.user.created':
      return 'Local user created';
    case 'organization.user.updated':
      return 'Local user updated';
    case 'organization.user.disabled':
      return 'Local user disabled';
    case 'organization.user.enabled':
      return 'Local user enabled';
    case 'organization.user.owner_granted':
      return 'Owner access granted';
    case 'organization.user.owner_reduced':
      return 'Owner access reduced';
    case 'organization.user.removed':
      return 'Local user removed';
    default:
      return eventType;
  }
}

function getSecurityEventStory(entry: OrganizationSecurityEvent) {
  const targetUser = readTargetUser(entry.payload);

  if (!targetUser) {
    return 'A local-user security event was recorded for this organization.';
  }

  switch (entry.eventType) {
    case 'organization.user.created':
      return `${targetUser.email} was added as ${targetUser.role ?? 'a managed user'}.`;
    case 'organization.user.updated':
      return `${targetUser.email} had their role, profile, or password updated.`;
    case 'organization.user.disabled':
      return `${targetUser.email} lost console and approval access immediately.`;
    case 'organization.user.enabled':
      return `${targetUser.email} regained console and approval access.`;
    case 'organization.user.owner_granted':
      return `${targetUser.email} was promoted into the owner role for this organization.`;
    case 'organization.user.owner_reduced':
      return `${targetUser.email} had owner access reduced back to admin for this organization.`;
    case 'organization.user.removed':
      return `${targetUser.email} was removed from the organization membership set.`;
    default:
      return `${targetUser.email} had a security-relevant user lifecycle change recorded.`;
  }
}

function readTargetUser(payload: Record<string, unknown>) {
  const targetUser =
    payload.targetUser && typeof payload.targetUser === 'object' && !Array.isArray(payload.targetUser)
      ? (payload.targetUser as Record<string, unknown>)
      : null;

  if (!targetUser) {
    return null;
  }

  return {
    id: typeof targetUser.id === 'string' ? targetUser.id : null,
    email: typeof targetUser.email === 'string' ? targetUser.email : 'Unknown user',
    name: typeof targetUser.name === 'string' ? targetUser.name : null,
    role: typeof targetUser.role === 'string' ? targetUser.role : null,
    status: typeof targetUser.status === 'string' ? targetUser.status : null,
  };
}

function getSecurityActorSummary(entry: OrganizationSecurityEvent) {
  if (entry.actorType === 'system') {
    return 'System';
  }

  if (entry.actorDisplay) {
    return entry.actorDisplay;
  }

  return entry.actorId ?? null;
}

export function ConsoleSystemPage({
  activeRole,
  canManageOrganization,
  canManagePolicies,
  canManageIntegrations,
  canVerifyLedger,
  operatorIdentity,
  activeOrganization,
  organizationMemberships,
}: {
  activeRole: OrganizationMemberRole | null;
  canManageOrganization: boolean;
  canManagePolicies: boolean;
  canManageIntegrations: boolean;
  canVerifyLedger: boolean;
  operatorIdentity: OperatorIdentity | null;
  activeOrganization: Organization | null;
  organizationMemberships: OrganizationMembership[];
}) {
  const [approvalsSnapshot, setApprovalsSnapshot] =
    useState<InternalApprovalRequestListResponse | null>(null);
  const [securityEventsSnapshot, setSecurityEventsSnapshot] =
    useState<OrganizationSecurityEventListResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [securityEventsError, setSecurityEventsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await listConsoleApprovalRequests();

        if (!cancelled) {
          setApprovalsSnapshot(response);
          setApiError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setApiError(
            loadError instanceof Error ? loadError.message : 'API is not reachable.',
          );
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canManageOrganization) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const response = await listConsoleSecurityEvents();

        if (!cancelled) {
          setSecurityEventsSnapshot(response);
          setSecurityEventsError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setSecurityEventsError(
            loadError instanceof Error
              ? loadError.message
              : 'Security events are not reachable.',
          );
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [canManageOrganization]);

  return (
    <main className="console-stack">
      <section className="console-section-grid">
        <article className="card stack">
          <div className="console-section-header">
            <div>
              <div className="label">Getting started</div>
              <h2>First-run checklist</h2>
            </div>
            <span className="eyebrow">Self-host</span>
          </div>

          <div className="console-detail-list">
            <div className="console-detail-item">
              <span>Step 1</span>
              <strong>
                {activeOrganization
                  ? `You are operating inside ${activeOrganization.name}.`
                  : 'Open the approvals inbox directly and create a test approval through the demo or API.'}
              </strong>
            </div>
            <div className="console-detail-item">
              <span>Step 2</span>
              <strong>
                Create at least one policy so high-risk actions route to the right approver roles.
              </strong>
            </div>
            <div className="console-detail-item">
              <span>Step 3</span>
              <strong>
                Add integrations only if you need notifications. Approva can still run with env
                fallbacks during setup.
              </strong>
            </div>
          </div>

          <div className="console-link-grid">
            <Link className="button ghost link-button" href="/help">
              Open help hub
            </Link>
            <Link className="button ghost link-button" href="/help#api-quickstart">
              API quickstart
            </Link>
            <Link className="button ghost link-button" href="/help#self-host">
              Self-host guide
            </Link>
          </div>

        </article>

        <article className="card stack">
          <div>
            <div className="label">System status</div>
            <h2>Console session snapshot</h2>
          </div>

          <div className="console-detail-list">
            <div className="console-detail-item">
              <span>API reachable</span>
              <strong>{apiError ? 'No' : 'Yes'}</strong>
            </div>
            <div className="console-detail-item">
              <span>API base URL</span>
              <strong className="mono-wrap">{apiBaseUrl}</strong>
            </div>
            <div className="console-detail-item">
              <span>Known approvals</span>
              <strong>{approvalsSnapshot?.total ?? 0}</strong>
            </div>
            <div className="console-detail-item">
              <span>Deployment</span>
              <strong>Self-host default organization</strong>
            </div>
            <div className="console-detail-item">
              <span>Release marker</span>
              <strong>{releaseLabel}</strong>
            </div>
            <div className="console-detail-item">
              <span>Console access</span>
              <strong>
                Local authenticated console session, separate from approval passkeys.
              </strong>
            </div>
            <div className="console-detail-item">
              <span>Active organization</span>
              <strong>{activeOrganization?.name ?? 'No active organization'}</strong>
            </div>
            <div className="console-detail-item">
              <span>Active role</span>
              <strong>{activeRole ?? 'No active role'}</strong>
            </div>
          </div>

          {apiError ? <div className="error">{apiError}</div> : null}
        </article>

        <article className="card stack">
          <div>
            <div className="label">Operational links</div>
            <h2>Health and telemetry</h2>
          </div>

          <div className="console-link-grid">
            <a
              className="button ghost link-button"
              href={`${apiBaseUrl}/health/live`}
              rel="noreferrer"
              target="_blank"
            >
              /health/live
            </a>
            <a
              className="button ghost link-button"
              href={`${apiBaseUrl}/health/ready`}
              rel="noreferrer"
              target="_blank"
            >
              /health/ready
            </a>
            <a
              className="button ghost link-button"
              href={`${apiBaseUrl}/v1/internal/metrics`}
              rel="noreferrer"
              target="_blank"
            >
              Metrics
            </a>
            <Link className="button ghost link-button" href="/help">
              Help hub
            </Link>
          </div>

          <div className="empty">
            Use these links first after deploys or incidents. Ready should stay green, metrics
            should continue moving, and any API-level failure should have a request id in logs.
          </div>
        </article>

        <article className="card stack">
          <div>
            <div className="label">Current session</div>
            <h2>Console access context</h2>
          </div>

          <div className="session-summary">
            <div className="session-line">
              <strong>Status</strong>
              <span className="status approved">authenticated</span>
            </div>
            <div className="session-line">
              <strong>Console identity</strong>
              <span>{operatorIdentity?.email ?? 'Local self-host operator'}</span>
            </div>
            <div className="session-line">
              <strong>Display name</strong>
              <span>{operatorIdentity?.name ?? 'Local operator'}</span>
            </div>
            <div className="session-line">
              <strong>Auth domain</strong>
              <span>Default organization operator console</span>
            </div>
            <div className="session-line">
              <strong>Active org</strong>
              <span>{activeOrganization?.slug ?? 'Not selected'}</span>
            </div>
            <div className="session-line">
              <strong>Memberships</strong>
              <span>{organizationMemberships.length}</span>
            </div>
          </div>

          <div className="empty">
            Approval decisions still require the secure approval link plus a separate passkey
            approver session. Console login stays separate from approval authentication.
          </div>
        </article>

        <article className="card stack">
          <div className="console-section-header">
            <div>
              <div className="label">Security events</div>
              <h2>Recent local user access changes</h2>
            </div>
            <span className="console-meta-pill">
              {securityEventsSnapshot?.items.length ?? 0} recent
            </span>
          </div>

          {!canManageOrganization ? (
            <div className="empty">
              Only owners and admins can inspect local user access changes.
            </div>
          ) : securityEventsError ? (
            <div className="error">{securityEventsError}</div>
          ) : !securityEventsSnapshot ? (
            <div className="empty">Loading organization security events...</div>
          ) : securityEventsSnapshot.items.length === 0 ? (
            <div className="empty">
              No local user lifecycle events are recorded yet. Creating, updating, disabling,
              enabling, and removing users will appear here.
            </div>
          ) : (
            <div className="timeline">
              {securityEventsSnapshot.items.map((entry) => {
                const actorSummary = getSecurityActorSummary(entry);
                const targetUser = readTargetUser(entry.payload);

                return (
                  <article className="timeline-item done" key={entry.immutableEventId}>
                    <div className="timeline-marker" />
                    <div className="timeline-details">
                      <div className="timeline-header">
                        <div>
                          <div className="timeline-story">{getSecurityEventLabel(entry.eventType)}</div>
                          <p>{getSecurityEventStory(entry)}</p>
                        </div>
                        <div className="timeline-meta">{formatTimestamp(entry.createdAt)}</div>
                      </div>

                      <div className="timeline-meta">
                        Actor: {actorSummary ?? 'Unknown'}
                        {targetUser ? ` · Target: ${targetUser.email}` : ''}
                      </div>

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
        </article>

        <article className="card stack">
          <div>
            <div className="label">Week-one ops</div>
            <h2>What to watch</h2>
          </div>

          <div className="console-detail-list">
            <div className="console-detail-item">
              <span>Day 0</span>
              <strong>Health/readiness, first approval creation, first passkey approval, first webhook, first capability exchange.</strong>
            </div>
            <div className="console-detail-item">
              <span>Day 1</span>
              <strong>Auth failures, webhook failures, email failures, and passkey-registration issues.</strong>
            </div>
            <div className="console-detail-item">
              <span>Week 1</span>
              <strong>Approval volume, approval denials, exchange-token failures, Slack failures, unusual rate-limit spikes.</strong>
            </div>
          </div>

          <div className="console-link-grid">
            <Link className="button ghost link-button" href="/help">
              Help hub
            </Link>
            <Link className="button ghost link-button" href="/console/approvals">
              Approvals inbox
            </Link>
          </div>

          <div className="empty">
            Use the self-host and monitoring docs in this repository as the shared reference for
            day 0, day 1, and week 1 decisions.
          </div>
        </article>

        <article className="card stack">
          <div>
            <div className="label">Quick links</div>
            <h2>Useful local routes</h2>
          </div>

          <div className="console-link-grid">
            <Link className="button ghost link-button" href="/console/approvals">
              Approvals inbox
            </Link>
            <Link className="button ghost link-button" href="/help">
              Help hub
            </Link>
            <Link className="button ghost link-button" href="/console/settings">
              Settings
            </Link>
            {canVerifyLedger ? (
              <Link className="button ghost link-button" href="/console/ledger">
                Ledger verifier
              </Link>
            ) : null}
            {canManagePolicies ? (
              <Link className="button ghost link-button" href="/console/policies">
                Policies
              </Link>
            ) : null}
            {canManageOrganization ? (
              <Link className="button ghost link-button" href="/console/users">
                Users
              </Link>
            ) : null}
            {canManageIntegrations ? (
              <Link className="button ghost link-button" href="/console/integrations">
                Integrations
              </Link>
            ) : null}
            <Link className="button ghost link-button" href="/demo/ai-deploy">
              AI deploy demo
            </Link>
            <a
              className="button ghost link-button"
              href={`${apiBaseUrl}/docs`}
              rel="noreferrer"
              target="_blank"
            >
              Swagger docs
            </a>
          </div>
        </article>

        <article className="card stack">
          <div>
            <div className="label">Seeded local demo data</div>
            <h2>Approver and notes</h2>
          </div>

          <div className="console-detail-list">
            <div className="console-detail-item">
              <span>Seeded approver</span>
              <strong>Jordan Vale</strong>
            </div>
            <div className="console-detail-item">
              <span>Seeded email</span>
              <strong>{sampleApproverEmail}</strong>
            </div>
            <div className="console-detail-item">
              <span>Passkey note</span>
              <strong>Register once locally, then authenticate before secure approvals.</strong>
            </div>
            <div className="console-detail-item">
              <span>Console access</span>
              <strong>Local authenticated console session, separate from approval passkeys.</strong>
            </div>
            <div className="console-detail-item">
              <span>User management</span>
              <strong>
                Owners and admins can add managed local users who can sign in and register
                approval passkeys.
              </strong>
            </div>
          </div>

          <div className="empty">
            This page is operator-facing and meant for local demos, inspection, and debugging.
          </div>
        </article>
      </section>
    </main>
  );
}
