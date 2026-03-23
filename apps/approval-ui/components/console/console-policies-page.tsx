'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  CreatePolicyInput,
  OrganizationMemberRole,
  PolicyRule,
  RiskLevel,
} from '@approva/shared';
import {
  createConsolePolicy,
  deleteConsolePolicy,
  listConsolePolicies,
  updateConsolePolicy,
} from '@/lib/console-api';

const RISK_LEVEL_OPTIONS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
const ROLE_OPTIONS: OrganizationMemberRole[] = ['owner', 'admin', 'member', 'approver'];
const ACTION_SUGGESTIONS = [
  '*',
  'deployment.execute',
  'deployment.rollback',
  'service.restart',
  'secrets.read',
  'database.migrate',
];
const RESOURCE_TYPE_SUGGESTIONS = [
  '*',
  'service',
  'deployment',
  'cluster',
  'database',
  'secret',
];
const OUTCOME_OPTIONS = [
  {
    value: 'approval_required',
    label: 'Require approval',
    description: 'Pause the request until an allowed human approver records a decision.',
  },
  {
    value: 'auto_approve',
    label: 'Auto-approve',
    description: 'Let matching requests continue immediately without human approval.',
  },
  {
    value: 'reject',
    label: 'Reject immediately',
    description: 'Deny matching requests as soon as the policy matches.',
  },
] as const;

type PolicyOutcome = (typeof OUTCOME_OPTIONS)[number]['value'];

type PolicyFormState = {
  action: string;
  resourceType: string;
  riskLevel: RiskLevel;
  outcome: PolicyOutcome;
  approverRoles: OrganizationMemberRole[];
};

const DEFAULT_FORM_STATE: PolicyFormState = {
  action: '',
  resourceType: '',
  riskLevel: 'medium',
  outcome: 'approval_required',
  approverRoles: ['owner', 'admin', 'approver'],
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function toPolicyInput(state: PolicyFormState): CreatePolicyInput {
  const outcome = state.outcome;

  return {
    action: state.action.trim() || '*',
    resourceType: state.resourceType.trim() || '*',
    riskLevel: state.riskLevel,
    approvalRequired: outcome !== 'auto_approve',
    approverRoles: outcome === 'approval_required' ? state.approverRoles : [],
  };
}

function getPolicyOutcome(policy: PolicyRule) {
  if (!policy.approvalRequired) {
    return 'Auto-approve';
  }

  if (policy.approverRoles.length === 0) {
    return 'Reject';
  }

  return 'Approval required';
}

function getEditablePolicyOutcome(policy: PolicyRule): PolicyOutcome {
  if (!policy.approvalRequired) {
    return 'auto_approve';
  }

  if (policy.approverRoles.length === 0) {
    return 'reject';
  }

  return 'approval_required';
}

export function ConsolePoliciesPage({
  activeRole,
  canManagePolicies,
}: {
  activeRole: OrganizationMemberRole | null;
  canManagePolicies: boolean;
}) {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [form, setForm] = useState<PolicyFormState>(DEFAULT_FORM_STATE);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (editingPolicyId ? 'Edit policy' : 'Create policy'),
    [editingPolicyId],
  );
  const normalizedAction = form.action.trim() || '*';
  const normalizedResourceType = form.resourceType.trim() || '*';
  const matchingPolicy = useMemo(
    () =>
      policies.find(
        (policy) =>
          policy.id !== editingPolicyId &&
          policy.action === normalizedAction &&
          policy.resourceType === normalizedResourceType &&
          policy.riskLevel === form.riskLevel,
      ) ?? null,
    [editingPolicyId, form.riskLevel, normalizedAction, normalizedResourceType, policies],
  );
  const actionSuggestions = useMemo(
    () =>
      Array.from(
        new Set([...ACTION_SUGGESTIONS, ...policies.map((policy) => policy.action)]),
      ),
    [policies],
  );
  const resourceTypeSuggestions = useMemo(
    () =>
      Array.from(
        new Set([
          ...RESOURCE_TYPE_SUGGESTIONS,
          ...policies.map((policy) => policy.resourceType),
        ]),
      ),
    [policies],
  );
  const outcomeDescription = useMemo(
    () =>
      OUTCOME_OPTIONS.find((option) => option.value === form.outcome)?.description ??
      OUTCOME_OPTIONS[0].description,
    [form.outcome],
  );

  const loadPolicies = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await listConsolePolicies();
      setPolicies(response.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load policies.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPolicies();
  }, []);

  const resetForm = () => {
    setForm(DEFAULT_FORM_STATE);
    setEditingPolicyId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (form.outcome === 'approval_required' && form.approverRoles.length === 0) {
        setError('Select at least one approver role, or choose "Reject immediately" instead.');
        setSubmitting(false);
        return;
      }

      const payload = toPolicyInput(form);

      if (editingPolicyId) {
        await updateConsolePolicy(editingPolicyId, payload);
      } else if (matchingPolicy) {
        await updateConsolePolicy(matchingPolicy.id, payload);
      } else {
        await createConsolePolicy(payload);
      }

      resetForm();
      await loadPolicies();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save policy.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="console-stack">
      <section className="card stack">
        <div>
          <div className="label">Organization policies</div>
          <h2>Policy rules</h2>
        </div>
        <p>
          Configure whether matching actions auto-approve, require human approval, or reject
          immediately. Use <span className="mono">*</span> as a wildcard for action or resource
          type.
        </p>

        {!canManagePolicies ? (
          <div className="empty">
            Your role is <span className="mono">{activeRole ?? 'unknown'}</span>. Policy editing
            is limited to organization owners and admins.
          </div>
        ) : (
          <form className="console-policy-form" onSubmit={handleSubmit}>
            <div className="console-policy-note">
              <div className="label">How matching works</div>
              <p>
                Policies compare the action, resource type, and risk level sent by approval
                requests. Action and resource type are free-form keys, so enter the exact values
                your agents or API clients send.
              </p>
            </div>

            {matchingPolicy ? (
              <div className="notice warning">
                <strong>Matching rule already exists.</strong>
                <div>
                  Saving this form will update the existing rule for{' '}
                  <span className="mono">
                    {normalizedAction} / {normalizedResourceType} / {form.riskLevel}
                  </span>{' '}
                  instead of creating a duplicate.
                </div>
              </div>
            ) : null}

            <div className="console-policy-grid">
              <label className="field">
                <span>Action</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      action: event.target.value,
                    }))
                  }
                  placeholder="deployment.execute"
                  value={form.action}
                />
                <span className="helper">
                  Example: <span className="mono">deployment.execute</span>
                </span>
                <div className="console-policy-suggestions">
                  {actionSuggestions.map((action) => (
                    <button
                      className={`console-policy-suggestion${
                        form.action === action ? ' active' : ''
                      }`}
                      key={action}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          action,
                        }))
                      }
                      type="button"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Resource type</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      resourceType: event.target.value,
                    }))
                  }
                  placeholder="service"
                  value={form.resourceType}
                />
                <span className="helper">
                  Example: <span className="mono">service</span>,{' '}
                  <span className="mono">database</span>,{' '}
                  <span className="mono">secret</span>
                </span>
                <div className="console-policy-suggestions">
                  {resourceTypeSuggestions.map((resourceType) => (
                    <button
                      className={`console-policy-suggestion${
                        form.resourceType === resourceType ? ' active' : ''
                      }`}
                      key={resourceType}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          resourceType,
                        }))
                      }
                      type="button"
                    >
                      {resourceType}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Risk level</span>
                <select
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      riskLevel: event.target.value as RiskLevel,
                    }))
                  }
                  value={form.riskLevel}
                >
                  {RISK_LEVEL_OPTIONS.map((riskLevel) => (
                    <option key={riskLevel} value={riskLevel}>
                      {riskLevel}
                    </option>
                  ))}
                </select>
                <span className="helper">Only match requests evaluated at this risk level.</span>
              </label>

              <label className="field">
                <span>Rule outcome</span>
                <select
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      outcome: event.target.value as PolicyOutcome,
                    }))
                  }
                  value={form.outcome}
                >
                  {OUTCOME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="helper">{outcomeDescription}</span>
              </label>
            </div>

            <div className="field">
              <span>Approver roles</span>
              <div className="helper">
                {form.outcome === 'approval_required'
                  ? 'Select which organization roles can approve matching requests.'
                  : form.outcome === 'reject'
                    ? 'Approver roles are not used when the rule rejects immediately.'
                    : 'Approver roles are not used when the rule auto-approves requests.'}
              </div>
              <div className="checkbox-grid">
                {ROLE_OPTIONS.map((role) => (
                  <label
                    className={`checkbox-chip${
                      form.approverRoles.includes(role) ? ' checked' : ''
                    }${form.outcome !== 'approval_required' ? ' disabled' : ''}`}
                    key={role}
                  >
                    <input
                      checked={form.approverRoles.includes(role)}
                      disabled={form.outcome !== 'approval_required'}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          approverRoles: event.target.checked
                            ? [...current.approverRoles, role]
                            : current.approverRoles.filter((value) => value !== role),
                        }))
                      }
                      type="checkbox"
                    />
                    <span>{role}</span>
                  </label>
                ))}
              </div>
              {form.outcome === 'approval_required' ? (
                <p className="helper">
                  Choose at least one role here, or switch the outcome to{' '}
                  <strong>Reject immediately</strong>.
                </p>
              ) : null}
            </div>

            <div className="console-filter-actions">
              <button className="button primary" disabled={submitting} type="submit">
                {submitting
                  ? 'Saving...'
                  : editingPolicyId || matchingPolicy
                    ? 'Save policy'
                    : title}
              </button>
              <button className="button ghost" onClick={resetForm} type="button">
                Clear
              </button>
            </div>
          </form>
        )}
      </section>

      {error ? <div className="error">{error}</div> : null}

      <section className="card stack">
        <div className="console-section-header">
          <div>
            <div className="label">Policy list</div>
            <h2>{loading ? 'Loading...' : `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'}`}</h2>
          </div>
          <p className="helper">Scoped to the active self-host organization.</p>
        </div>

        {loading ? <div className="empty">Loading policies...</div> : null}
        {!loading && policies.length === 0 ? (
          <div className="empty stack">
            <div>No policies are configured for this organization yet.</div>
            <div>
              Add a first policy so high-risk or protected actions route to the right approver
              roles instead of relying on fallback behavior.
            </div>
            <div className="actions">
              <Link className="button ghost link-button" href="/help#api-quickstart">
                Approval flow help
              </Link>
            </div>
          </div>
        ) : null}

        <div className="console-list">
          {policies.map((policy) => (
            <article className="console-list-card" key={policy.id}>
              <div className="console-list-row">
                <div>
                  <div className="console-card-title mono">{policy.id}</div>
                  <div className="helper">
                    {policy.action} · {policy.resourceType} · {policy.riskLevel}
                  </div>
                </div>
                <div className={`status ${policy.approvalRequired ? 'pending' : 'approved'}`}>
                  {getPolicyOutcome(policy)}
                </div>
              </div>

              <div className="console-meta-grid">
                <div className="meta">
                  <dt>Action</dt>
                  <dd className="mono">{policy.action}</dd>
                </div>
                <div className="meta">
                  <dt>Resource type</dt>
                  <dd className="mono">{policy.resourceType}</dd>
                </div>
                <div className="meta">
                  <dt>Risk level</dt>
                  <dd>{policy.riskLevel}</dd>
                </div>
                <div className="meta">
                  <dt>Approver roles</dt>
                  <dd>{policy.approverRoles.join(', ') || 'None'}</dd>
                </div>
                <div className="meta">
                  <dt>Created at</dt>
                  <dd>{formatTimestamp(policy.createdAt)}</dd>
                </div>
              </div>

              {canManagePolicies ? (
                <div className="actions">
                  <button
                    className="button ghost"
                    onClick={() => {
                      setEditingPolicyId(policy.id);
                      setForm({
                        action: policy.action,
                        resourceType: policy.resourceType,
                        riskLevel: policy.riskLevel,
                        outcome: getEditablePolicyOutcome(policy),
                        approverRoles: policy.approverRoles,
                      });
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="button ghost"
                    onClick={async () => {
                      setError(null);

                      try {
                        await deleteConsolePolicy(policy.id);

                        if (editingPolicyId === policy.id) {
                          resetForm();
                        }

                        await loadPolicies();
                      } catch (deleteError) {
                        setError(
                          deleteError instanceof Error
                            ? deleteError.message
                            : 'Failed to delete policy.',
                        );
                      }
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
