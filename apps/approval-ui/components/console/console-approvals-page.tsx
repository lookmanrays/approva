'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type {
  ApprovalRequest,
  ApprovalRequestStatus,
  InternalApprovalRequestFilters,
  InternalApprovalRequestListResponse,
  RiskLevel,
} from '@approva/shared';
import { listConsoleApprovalRequests } from '@/lib/console-api';

const STATUS_OPTIONS: Array<ApprovalRequestStatus> = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'auto_approved',
];

const RISK_OPTIONS: Array<RiskLevel> = ['low', 'medium', 'high', 'critical'];

interface FilterFormState {
  status: string;
  riskLevel: string;
  actionContains: string;
  resourceIdContains: string;
}

const EMPTY_FILTERS: FilterFormState = {
  status: '',
  riskLevel: '',
  actionContains: '',
  resourceIdContains: '',
};

function formatTimestamp(value?: string | null) {
  if (!value) {
    return 'Not decided';
  }

  return new Date(value).toLocaleString();
}

function formatRequestedBy(request: ApprovalRequest) {
  if (request.requestedBy.actorId) {
    return `${request.requestedBy.system} · ${request.requestedBy.actorId}`;
  }

  return request.requestedBy.system;
}

function normalizeFilters(filters: FilterFormState): InternalApprovalRequestFilters {
  return {
    status: filters.status ? (filters.status as ApprovalRequestStatus) : undefined,
    riskLevel: filters.riskLevel ? (filters.riskLevel as RiskLevel) : undefined,
    actionContains: filters.actionContains.trim() || undefined,
    resourceIdContains: filters.resourceIdContains.trim() || undefined,
  };
}

function getFriendlyApprovalListError(message: string) {
  if (message.includes('ACTIVE_ORGANIZATION_REQUIRED')) {
    return 'The API could not resolve the self-host default organization yet. Make sure the API is running and can create the default organization.';
  }

  if (message.includes('Dashboard authentication is required')) {
    return 'The API build is stale. Restart the latest self-host API build and try again.';
  }

  return message;
}

export function ConsoleApprovalsPage() {
  const [filters, setFilters] = useState<FilterFormState>(EMPTY_FILTERS);
  const [result, setResult] = useState<InternalApprovalRequestListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = async (nextFilters: FilterFormState) => {
    setLoading(true);
    setError(null);

    try {
      const response = await listConsoleApprovalRequests(normalizeFilters(nextFilters));
      setResult(response);
    } catch (loadError) {
      setError(
        getFriendlyApprovalListError(
          loadError instanceof Error ? loadError.message : 'Failed to load approvals.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests(EMPTY_FILTERS);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadRequests(filters);
  };

  return (
    <main className="console-stack">
      <section className="card stack">
        <div className="console-section-header">
          <div>
            <div className="label">Getting started</div>
            <h2>How to use the approvals inbox</h2>
          </div>
          <span className="eyebrow">Operator Console</span>
        </div>
        <div className="console-detail-list">
          <div className="console-detail-item">
            <span>1. Create an approval</span>
            <strong>Use the AI deploy demo, CLI, SDK, or API to create an approval request.</strong>
          </div>
          <div className="console-detail-item">
            <span>2. Review and decide</span>
            <strong>A human opens the secure approval URL and authenticates with a passkey.</strong>
          </div>
          <div className="console-detail-item">
            <span>3. Continue execution</span>
            <strong>Approva issues a scoped capability and records the event chain.</strong>
          </div>
        </div>
        <div className="console-link-grid">
          <Link className="button ghost link-button" href="/demo/ai-deploy">
            Run AI deploy demo
          </Link>
          <Link className="button ghost link-button" href="/help#api-quickstart">
            API quickstart
          </Link>
          <Link className="button ghost link-button" href="/help#cli">
            CLI docs
          </Link>
          <Link className="button ghost link-button" href="/help#examples">
            Examples
          </Link>
          <Link className="button ghost link-button" href="/help">
            Help hub
          </Link>
        </div>
      </section>

      <section className="card stack">
        <div>
          <div className="label">Approvals inbox</div>
          <h2>Approval requests</h2>
        </div>
        <p>
          Filter recent approval traffic and drill into the full decision, capability, webhook,
          and ledger context for each request.
        </p>

        <form className="console-filter-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Status</span>
            <select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              value={filters.status}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Risk level</span>
            <select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  riskLevel: event.target.value,
                }))
              }
              value={filters.riskLevel}
            >
              <option value="">All risk levels</option>
              {RISK_OPTIONS.map((riskLevel) => (
                <option key={riskLevel} value={riskLevel}>
                  {riskLevel}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Action contains</span>
            <input
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  actionContains: event.target.value,
                }))
              }
              placeholder="deployment.execute"
              value={filters.actionContains}
            />
          </label>

          <label className="field">
            <span>Resource id contains</span>
            <input
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  resourceIdContains: event.target.value,
                }))
              }
              placeholder="billing-api"
              value={filters.resourceIdContains}
            />
          </label>

          <div className="console-filter-actions">
            <button className="button primary" disabled={loading} type="submit">
              {loading ? 'Loading...' : 'Apply filters'}
            </button>
            <button
              className="button ghost"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                void loadRequests(EMPTY_FILTERS);
              }}
              type="button"
            >
              Clear
            </button>
          </div>
        </form>
      </section>

      {error ? <div className="error">{error}</div> : null}

      <section className="card stack">
        <div className="console-section-header">
          <div>
            <div className="label">Results</div>
            <h2>{result ? `${result.total} request${result.total === 1 ? '' : 's'}` : 'Loading'}</h2>
          </div>
          <p className="helper">
            Internal/admin-facing read model. This page is intended for local inspection and demos.
          </p>
        </div>

        {loading && !result ? <div className="empty">Loading approval requests...</div> : null}

        {!loading && result?.items.length === 0 ? (
          <div className="empty">
            {filters.status || filters.riskLevel || filters.actionContains || filters.resourceIdContains
              ? 'No approval requests matched the current filters. Clear filters or try a broader search.'
              : 'No approval requests yet. Create one from the AI deploy demo, the CLI, or the API quickstart to start building an event chain.'}
          </div>
        ) : null}

        <div className="console-list">
          {result?.items.map((request) => (
            <article className="console-list-card" key={request.id}>
              <div className="console-list-row">
                <div>
                  <div className="console-card-title mono">{request.id}</div>
                  <div className="helper">{request.action}</div>
                </div>
                <div className={`status ${request.status}`}>{request.status}</div>
              </div>

              <div className="console-meta-grid">
                <div className="meta">
                  <dt>Resource</dt>
                  <dd className="mono">
                    {request.resource.type}/{request.resource.id}
                  </dd>
                </div>
                <div className="meta">
                  <dt>Risk</dt>
                  <dd>
                    <span className={`status ${request.riskLevel}`}>{request.riskLevel}</span>
                  </dd>
                </div>
                <div className="meta">
                  <dt>Requested by</dt>
                  <dd>{formatRequestedBy(request)}</dd>
                </div>
                <div className="meta">
                  <dt>Created at</dt>
                  <dd>{formatTimestamp(request.createdAt)}</dd>
                </div>
                <div className="meta">
                  <dt>Decided at</dt>
                  <dd>{formatTimestamp(request.decidedAt)}</dd>
                </div>
              </div>

              <div className="actions">
                <Link className="button ghost link-button" href={`/console/approvals/${request.id}`}>
                  Open detail
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
