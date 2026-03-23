import type {
  CreateLocalUserInput,
  CreatePolicyInput,
  CreateOrganizationApiKeyInput,
  CreateOrganizationApiKeyResponse,
  CreateIntegrationInput,
  CreateServiceAccountInput,
  DeleteIntegrationResponse,
  DeletePolicyResponse,
  InternalApprovalRequestDetailResponse,
  InternalApprovalRequestFilters,
  InternalApprovalRequestListResponse,
  InternalLedgerVerificationInput,
  InternalLedgerVerificationResult,
  IntegrationListResponse,
  IntegrationRecord,
  LocalUserListResponse,
  LocalUserRecord,
  OrganizationSecurityEventListResponse,
  OrganizationApiKeyListResponse,
  PolicyListResponse,
  PolicyRule,
  RevokeOrganizationApiKeyResponse,
  RevokeServiceAccountResponse,
  RemoveLocalUserResponse,
  ServiceAccountListResponse,
  ServiceAccountRecord,
  UpdateLocalUserInput,
  UpdateIntegrationInput,
  UpdatePolicyInput,
} from '@approva/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const payload = (await response.json()) as T & {
    error?: { message?: string | string[] };
  };

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.assign(`/sign-in?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      throw new Error('Redirecting to sign-in...');
    }

    const message = payload.error?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message ?? 'Request failed');
  }

  return payload;
}

export function listConsoleApprovalRequests(
  filters?: InternalApprovalRequestFilters,
): Promise<InternalApprovalRequestListResponse> {
  const query = new URLSearchParams();

  if (filters?.status) {
    query.set('status', filters.status);
  }

  if (filters?.riskLevel) {
    query.set('riskLevel', filters.riskLevel);
  }

  if (filters?.actionContains) {
    query.set('actionContains', filters.actionContains);
  }

  if (filters?.resourceIdContains) {
    query.set('resourceIdContains', filters.resourceIdContains);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  return request(`/api/console/approval-requests${suffix}`, {
    method: 'GET',
  });
}

export function getConsoleApprovalRequest(
  approvalRequestId: string,
): Promise<InternalApprovalRequestDetailResponse> {
  return request(`/api/console/approval-requests/${approvalRequestId}`, {
    method: 'GET',
  });
}

export function verifyConsoleLedger(
  input?: InternalLedgerVerificationInput,
): Promise<InternalLedgerVerificationResult> {
  return request('/api/console/ledger/verify', {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  });
}

export function listConsolePolicies(): Promise<PolicyListResponse> {
  return request('/api/console/policies', {
    method: 'GET',
  });
}

export function createConsolePolicy(input: CreatePolicyInput): Promise<PolicyRule> {
  return request('/api/console/policies', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateConsolePolicy(
  id: string,
  input: UpdatePolicyInput,
): Promise<PolicyRule> {
  return request(`/api/console/policies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteConsolePolicy(id: string): Promise<DeletePolicyResponse> {
  return request(`/api/console/policies/${id}`, {
    method: 'DELETE',
  });
}

export function listConsoleIntegrations(): Promise<IntegrationListResponse> {
  return request('/api/console/integrations', {
    method: 'GET',
  });
}

export function createConsoleIntegration(
  input: CreateIntegrationInput,
): Promise<IntegrationRecord> {
  return request('/api/console/integrations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateConsoleIntegration(
  id: string,
  input: UpdateIntegrationInput,
): Promise<IntegrationRecord> {
  return request(`/api/console/integrations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteConsoleIntegration(id: string): Promise<DeleteIntegrationResponse> {
  return request(`/api/console/integrations/${id}`, {
    method: 'DELETE',
  });
}

export function listConsoleServiceAccounts(): Promise<ServiceAccountListResponse> {
  return request('/api/console/service-accounts', {
    method: 'GET',
  });
}

export function createConsoleServiceAccount(
  input: CreateServiceAccountInput,
): Promise<ServiceAccountRecord> {
  return request('/api/console/service-accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeConsoleServiceAccount(
  id: string,
): Promise<RevokeServiceAccountResponse> {
  return request(`/api/console/service-accounts/${id}/revoke`, {
    method: 'POST',
  });
}

export function listConsoleApiKeys(): Promise<OrganizationApiKeyListResponse> {
  return request('/api/console/api-keys', {
    method: 'GET',
  });
}

export function createConsoleApiKey(
  input: CreateOrganizationApiKeyInput,
): Promise<CreateOrganizationApiKeyResponse> {
  return request('/api/console/api-keys', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeConsoleApiKey(
  id: string,
): Promise<RevokeOrganizationApiKeyResponse> {
  return request(`/api/console/api-keys/${id}/revoke`, {
    method: 'POST',
  });
}

export function listConsoleLocalUsers(): Promise<LocalUserListResponse> {
  return request('/api/console/users', {
    method: 'GET',
  });
}

export function listConsoleSecurityEvents(): Promise<OrganizationSecurityEventListResponse> {
  return request('/api/console/system/security-events', {
    method: 'GET',
  });
}

export function createConsoleLocalUser(
  input: CreateLocalUserInput,
): Promise<LocalUserRecord> {
  return request('/api/console/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateConsoleLocalUser(
  userId: string,
  input: UpdateLocalUserInput,
): Promise<LocalUserRecord> {
  return request(`/api/console/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function disableConsoleLocalUser(userId: string): Promise<LocalUserRecord> {
  return request(`/api/console/users/${userId}/disable`, {
    method: 'POST',
  });
}

export function enableConsoleLocalUser(userId: string): Promise<LocalUserRecord> {
  return request(`/api/console/users/${userId}/enable`, {
    method: 'POST',
  });
}

export function grantConsoleLocalUserOwner(userId: string): Promise<LocalUserRecord> {
  return request(`/api/console/users/${userId}/grant-owner`, {
    method: 'POST',
  });
}

export function reduceConsoleLocalUserOwner(userId: string): Promise<LocalUserRecord> {
  return request(`/api/console/users/${userId}/reduce-owner`, {
    method: 'POST',
  });
}

export function removeConsoleLocalUser(
  userId: string,
): Promise<RemoveLocalUserResponse> {
  return request(`/api/console/users/${userId}`, {
    method: 'DELETE',
  });
}
