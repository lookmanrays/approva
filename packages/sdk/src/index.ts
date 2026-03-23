import type {
  ApprovalRequestResponse,
  ApproveRequestInput,
  ApiKeyScope,
  ApproverSessionState,
  CapabilityUseResult,
  CapabilityVerificationResult,
  CreateOrganizationApiKeyInput,
  CreateOrganizationApiKeyResponse,
  CreateApprovalRequestInput,
  CreateIntegrationInput,
  CreateServiceAccountInput,
  DemoDeploymentExecutionResult,
  DemoTimelineResponse,
  ExchangeCapabilityInput,
  ExchangeCapabilityResponse,
  OrganizationApiKeyListResponse,
  InternalApprovalRequestDetailResponse,
  InternalApprovalRequestFilters,
  InternalApprovalRequestListResponse,
  InternalLedgerVerificationInput,
  InternalLedgerVerificationResult,
  IntegrationListResponse,
  IntegrationRecord,
  PasskeyAuthenticationFinishInput,
  PasskeyAuthenticationFinishResponse,
  PasskeyAuthenticationStartInput,
  PasskeyAuthenticationStartResponse,
  PolicyListResponse,
  PolicyRule,
  RevokeOrganizationApiKeyResponse,
  RevokeServiceAccountResponse,
  RejectRequestInput,
  SecureDecisionInput,
  ServiceAccountListResponse,
  CreatePolicyInput,
  UpdatePolicyInput,
  DeletePolicyResponse,
  DeleteIntegrationResponse,
  VerifyCapabilityInput,
  UpdateIntegrationInput,
} from '@approva/shared';

export interface ApprovalClientOptions {
  baseUrl: string;
  apiKey?: string;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  fetcher?: typeof fetch;
}

export interface RequestApprovalOptions {
  idempotencyKey?: string;
}

export class ApprovalClient {
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;
  private readonly apiKey?: string;
  private readonly credentials?: RequestCredentials;
  private readonly fetcher: typeof fetch;

  constructor(options: ApprovalClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.headers = options.headers ?? {};
    this.credentials = options.credentials;
    this.fetcher =
      options.fetcher ??
      ((input, init) => globalThis.fetch(input, init));
  }

  requestApproval(
    input: CreateApprovalRequestInput,
    options?: RequestApprovalOptions,
  ): Promise<ApprovalRequestResponse> {
    return this.request('/v1/approval-requests', {
      method: 'POST',
      headers: options?.idempotencyKey
        ? {
            'idempotency-key': options.idempotencyKey,
          }
        : undefined,
      body: JSON.stringify(input),
    });
  }

  getApprovalRequest(id: string): Promise<ApprovalRequestResponse> {
    return this.request(`/v1/approval-requests/${id}`, {
      method: 'GET',
    });
  }

  getSecureApprovalRequest(id: string, token: string): Promise<ApprovalRequestResponse> {
    const query = new URLSearchParams({ token });

    return this.request(`/v1/approval-requests/${id}/secure-view?${query.toString()}`, {
      method: 'GET',
    });
  }

  approveRequest(id: string, input: ApproveRequestInput): Promise<ApprovalRequestResponse> {
    return this.request(`/v1/approval-requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  secureApproveRequest(
    id: string,
    token: string,
    input: SecureDecisionInput,
  ): Promise<ApprovalRequestResponse> {
    const query = new URLSearchParams({ token });

    return this.request(`/v1/approval-requests/${id}/secure-approve?${query.toString()}`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  rejectRequest(id: string, input: RejectRequestInput): Promise<ApprovalRequestResponse> {
    return this.request(`/v1/approval-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  secureRejectRequest(
    id: string,
    token: string,
    input: SecureDecisionInput,
  ): Promise<ApprovalRequestResponse> {
    const query = new URLSearchParams({ token });

    return this.request(`/v1/approval-requests/${id}/secure-reject?${query.toString()}`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  verifyCapability(input: VerifyCapabilityInput): Promise<CapabilityVerificationResult> {
    return this.request('/v1/capabilities/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  useCapability(input: VerifyCapabilityInput): Promise<CapabilityUseResult> {
    return this.request('/v1/capabilities/use', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  exchangeCapability(
    input: ExchangeCapabilityInput,
  ): Promise<ExchangeCapabilityResponse> {
    return this.request('/v1/capabilities/exchange', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  startPasskeyAuthentication(
    input: PasskeyAuthenticationStartInput,
  ): Promise<PasskeyAuthenticationStartResponse> {
    return this.request('/v1/auth/passkeys/authenticate/start', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  finishPasskeyAuthentication(
    input: PasskeyAuthenticationFinishInput,
  ): Promise<PasskeyAuthenticationFinishResponse> {
    return this.request('/v1/auth/passkeys/authenticate/finish', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getApproverSession(): Promise<ApproverSessionState> {
    return this.request('/v1/auth/session', {
      method: 'GET',
    });
  }

  logoutApproverSession(): Promise<ApproverSessionState> {
    return this.request('/v1/auth/logout', {
      method: 'POST',
    });
  }

  getAiDeployTimeline(approvalRequestId: string): Promise<DemoTimelineResponse> {
    return this.request(`/v1/demo/ai-deploy/${approvalRequestId}/timeline`, {
      method: 'GET',
    });
  }

  executeAiDeployment(
    approvalRequestId: string,
  ): Promise<DemoDeploymentExecutionResult> {
    return this.request(`/v1/demo/ai-deploy/${approvalRequestId}/execute`, {
      method: 'POST',
    });
  }

  listInternalApprovalRequests(
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

    return this.request(`/v1/internal/approval-requests${suffix}`, {
      method: 'GET',
    });
  }

  getInternalApprovalRequest(
    approvalRequestId: string,
  ): Promise<InternalApprovalRequestDetailResponse> {
    return this.request(`/v1/internal/approval-requests/${approvalRequestId}`, {
      method: 'GET',
    });
  }

  verifyInternalLedger(
    input?: InternalLedgerVerificationInput,
  ): Promise<InternalLedgerVerificationResult> {
    return this.request('/v1/internal/ledger/verify', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    });
  }

  listPolicies(): Promise<PolicyListResponse> {
    return this.request('/v1/policies', {
      method: 'GET',
    });
  }

  createPolicy(input: CreatePolicyInput): Promise<PolicyRule> {
    return this.request('/v1/policies', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updatePolicy(id: string, input: UpdatePolicyInput): Promise<PolicyRule> {
    return this.request(`/v1/policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  deletePolicy(id: string): Promise<DeletePolicyResponse> {
    return this.request(`/v1/policies/${id}`, {
      method: 'DELETE',
    });
  }

  listIntegrations(): Promise<IntegrationListResponse> {
    return this.request('/v1/integrations', {
      method: 'GET',
    });
  }

  createIntegration(input: CreateIntegrationInput): Promise<IntegrationRecord> {
    return this.request('/v1/integrations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateIntegration(id: string, input: UpdateIntegrationInput): Promise<IntegrationRecord> {
    return this.request(`/v1/integrations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  deleteIntegration(id: string): Promise<DeleteIntegrationResponse> {
    return this.request(`/v1/integrations/${id}`, {
      method: 'DELETE',
    });
  }

  listServiceAccounts(): Promise<ServiceAccountListResponse> {
    return this.request('/v1/service-accounts', {
      method: 'GET',
    });
  }

  createServiceAccount(input: CreateServiceAccountInput) {
    return this.request('/v1/service-accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  revokeServiceAccount(id: string): Promise<RevokeServiceAccountResponse> {
    return this.request(`/v1/service-accounts/${id}/revoke`, {
      method: 'POST',
    });
  }

  listApiKeys(): Promise<OrganizationApiKeyListResponse> {
    return this.request('/v1/api-keys', {
      method: 'GET',
    });
  }

  createApiKey(
    input: CreateOrganizationApiKeyInput,
  ): Promise<CreateOrganizationApiKeyResponse> {
    return this.request('/v1/api-keys', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  revokeApiKey(id: string): Promise<RevokeOrganizationApiKeyResponse> {
    return this.request(`/v1/api-keys/${id}/revoke`, {
      method: 'POST',
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      credentials: init.credentials ?? this.credentials,
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey
          ? {
              Authorization: `Bearer ${this.apiKey}`,
            }
          : {}),
        ...this.headers,
        ...init.headers,
      },
    });

    const payload = (await response.json()) as T & { error?: { message?: string | string[] } };

    if (!response.ok) {
      const message = payload && 'error' in payload ? payload.error?.message : 'Request failed';
      throw new Error(Array.isArray(message) ? message.join(', ') : message ?? 'Request failed');
    }

    return payload;
  }
}

export {
  type ApprovalRequestResponse,
  type ApproveRequestInput,
  type ApiKeyScope,
  type ApproverSessionState,
  type CapabilityUseResult,
  type CapabilityVerificationResult,
  type CreateOrganizationApiKeyInput,
  type CreateOrganizationApiKeyResponse,
  type CreateApprovalRequestInput,
  type CreateServiceAccountInput,
  type DemoDeploymentExecutionResult,
  type DemoTimelineResponse,
  type ExchangeCapabilityInput,
  type ExchangeCapabilityResponse,
  type OrganizationApiKeyRecord,
  type InternalApprovalRequestDetailResponse,
  type InternalApprovalRequestFilters,
  type InternalApprovalRequestListResponse,
  type InternalLedgerVerificationInput,
  type InternalLedgerVerificationResult,
  type OrganizationApiKeyListResponse,
  type PasskeyAuthenticationFinishInput,
  type PasskeyAuthenticationFinishResponse,
  type PasskeyAuthenticationStartInput,
  type PasskeyAuthenticationStartResponse,
  type RevokeOrganizationApiKeyResponse,
  type RevokeServiceAccountResponse,
  type RejectRequestInput,
  type SecureDecisionInput,
  type ServiceAccountListResponse,
  type ServiceAccountRecord,
  type VerifyCapabilityInput,
} from '@approva/shared';
