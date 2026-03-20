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

type PolicyFormState = {
  action: string;
  resourceType: string;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  approverRoles: OrganizationMemberRole[];
};

const DEFAULT_FORM_STATE: PolicyFormState = {
  action: '*',
  resourceType: '*',
  riskLevel: 'high',
  approvalRequired: true,
  approverRoles: ['owner', 'admin', 'approver'],
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function toPolicyInput(state: PolicyFormState): CreatePolicyInput {
  return {
    action: state.action.trim() || '*',
    resourceType: state.resourceType.trim() || '*',
    riskLevel: state.riskLevel,
    approvalRequired: state.approvalRequired,
    approverRoles: state.approverRoles,
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
      const payload = toPolicyInput(form);

      if (editingPolicyId) {
        await updateConsolePolicy(editingPolicyId, payload);
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
          <form className="console-filter-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Action</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                placeholder="deployment.execute or *"
                value={form.action}
              />
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
                placeholder="service or *"
                value={form.resourceType}
              />
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
            </label>

            <label className="field checkbox-field">
              <span>Approval required</span>
              <input
                checked={form.approvalRequired}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    approvalRequired: event.target.checked,
                  }))
                }
                type="checkbox"
              />
            </label>

            <div className="field field-span-2">
              <span>Approver roles</span>
              <div className="checkbox-grid">
                {ROLE_OPTIONS.map((role) => (
                  <label className="checkbox-chip" key={role}>
                    <input
                      checked={form.approverRoles.includes(role)}
                      disabled={!form.approvalRequired}
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
              <p className="helper">
                If approval is required and no approver roles are selected, the request is
                rejected immediately.
              </p>
            </div>

            <div className="console-filter-actions">
              <button className="button primary" disabled={submitting} type="submit">
                {submitting ? 'Saving...' : title}
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
                        approvalRequired: policy.approvalRequired,
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
