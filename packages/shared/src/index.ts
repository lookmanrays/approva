export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type OrganizationMemberRole = 'owner' | 'admin' | 'member' | 'approver';
export type LocalUserStatus = 'active' | 'disabled';
export type IntegrationType = 'slack' | 'webhook' | 'email';
export type OrganizationPermission =
  | 'console:view'
  | 'approvals:view'
  | 'policies:manage'
  | 'integrations:manage'
  | 'service_accounts:manage'
  | 'api_keys:manage'
  | 'organization:manage'
  | 'ledger:verify';

export type ApiKeyScope =
  | 'approval_requests:create'
  | 'approval_requests:read'
  | 'capabilities:verify'
  | 'capabilities:use'
  | 'webhooks:manage';

export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'auto_approved';

export type ApprovalDecisionType = 'approved' | 'rejected' | 'auto_approved';

export type PolicyDecision = 'auto_approve' | 'approval_required' | 'reject';

export type ImportantEventType =
  | 'approval_request.created'
  | 'approval_request.pending'
  | 'approval_request.auto_approved'
  | 'approval_request.approved'
  | 'approval_request.rejected'
  | 'approval_request.expired'
  | 'approval_request.authorization_denied'
  | 'capability.issued'
  | 'capability.exchanged'
  | 'capability.used'
  | 'deployment.executed';

export interface ApprovalResource {
  type: string;
  id: string;
}

export interface ApprovalRequester {
  system: string;
  actorId?: string | null;
}

export type CapabilityDeliveryMode = 'none' | 'exchange_token';

export interface ApprovalCallbackConfig {
  webhookUrl: string;
  deliverCapabilityMode: CapabilityDeliveryMode;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface OrganizationMembership {
  id: string;
  userId: string;
  role: OrganizationMemberRole;
  createdAt: string;
  organization: Organization;
}

export interface ConsoleUser {
  id: string;
  email: string;
  name: string | null;
}

export interface ConsoleAuthBootstrapStatusResponse {
  bootstrapRequired: boolean;
  bootstrapIdentity: {
    email: string;
    name: string;
  } | null;
}

export interface ConsoleBootstrapInput {
  password: string;
}

export interface ConsoleLoginInput {
  email: string;
  password: string;
}

export interface ConsoleSessionState {
  authenticated: boolean;
  user?: ConsoleUser | null;
  activeOrganization?: Organization | null;
  activeRole?: OrganizationMemberRole | null;
  expiresAt?: string | null;
}

export interface ConsolePasskeyDevice {
  id: string;
  credentialId: string;
  createdAt: string;
  lastUsedAt?: string | null;
  deviceType?: string | null;
  backedUp?: boolean | null;
}

export interface ConsoleProfileResponse {
  user: ConsoleUser;
  activeOrganization?: Organization | null;
  activeRole?: OrganizationMemberRole | null;
  passwordConfigured: boolean;
  passwordSetAt?: string | null;
  passkeys: ConsolePasskeyDevice[];
}

export interface UpdateConsolePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface DeleteConsolePasskeyResponse {
  deleted: true;
  credentialId: string;
}

export interface LocalUserRecord {
  id: string;
  email: string;
  name: string | null;
  role: OrganizationMemberRole;
  status: LocalUserStatus;
  isBootstrapOperator: boolean;
  createdAt: string;
  disabledAt?: string | null;
  passwordConfigured: boolean;
  passkeyCount: number;
  lastPasskeyUsedAt?: string | null;
}

export interface LocalUserListResponse {
  items: LocalUserRecord[];
}

export interface CreateLocalUserInput {
  email: string;
  name: string;
  password: string;
  role: OrganizationMemberRole;
}

export interface UpdateLocalUserInput {
  name: string;
  role: OrganizationMemberRole;
  password?: string;
}

export interface RemoveLocalUserResponse {
  removed: true;
  id: string;
}

export interface CurrentOrganizationResponse {
  organization: Organization;
}

export interface UpdateCurrentOrganizationInput {
  name: string;
}

const ORGANIZATION_PERMISSION_MAP: Record<
  OrganizationPermission,
  OrganizationMemberRole[]
> = {
  'console:view': ['owner', 'admin', 'member', 'approver'],
  'approvals:view': ['owner', 'admin', 'member', 'approver'],
  'policies:manage': ['owner', 'admin'],
  'integrations:manage': ['owner', 'admin'],
  'service_accounts:manage': ['owner', 'admin'],
  'api_keys:manage': ['owner', 'admin'],
  'organization:manage': ['owner', 'admin'],
  'ledger:verify': ['owner', 'admin'],
};

export function getAllowedRolesForPermission(
  permission: OrganizationPermission,
): OrganizationMemberRole[] {
  return ORGANIZATION_PERMISSION_MAP[permission];
}

export function hasOrganizationPermission(
  role: OrganizationMemberRole | null | undefined,
  permission: OrganizationPermission,
): boolean {
  if (!role) {
    return false;
  }

  return ORGANIZATION_PERMISSION_MAP[permission].includes(role);
}

export interface ApproverUser {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface ApproverSessionState {
  authenticated: boolean;
  user?: ApproverUser | null;
  expiresAt?: string | null;
}

export interface PolicyResult {
  decision: PolicyDecision;
  requiresApproval: boolean;
  matchedRules: string[];
  reasons: string[];
  evaluatedAt: string;
  matchedPolicyId?: string | null;
  approverRoles?: OrganizationMemberRole[];
}

export type ApproverAuthorizationCode =
  | 'authorized'
  | 'not_authenticated'
  | 'approver_email_missing'
  | 'no_allowed_roles_configured'
  | 'not_member_of_organization'
  | 'role_not_allowed';

export interface ApproverAuthorizationSummary {
  authorized: boolean;
  code: ApproverAuthorizationCode;
  message: string;
  allowedRoles: OrganizationMemberRole[];
  approverEmail?: string | null;
  approverRole?: OrganizationMemberRole | null;
}

export interface PolicyRule {
  id: string;
  organizationId: string;
  action: string;
  resourceType: string;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  approverRoles: OrganizationMemberRole[];
  createdAt: string;
}

export interface CreatePolicyInput {
  action: string;
  resourceType: string;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  approverRoles: OrganizationMemberRole[];
}

export interface UpdatePolicyInput extends CreatePolicyInput {}

export interface PolicyListResponse {
  items: PolicyRule[];
}

export interface DeletePolicyResponse {
  deleted: true;
  id: string;
}

export interface SlackIntegrationConfig {
  channelId: string;
  botToken?: string;
  botTokenConfigured?: boolean;
  botTokenMasked?: string | null;
}

export interface WebhookIntegrationConfig {
  url: string;
  secret?: string;
  secretConfigured?: boolean;
  secretMasked?: string | null;
}

export interface EmailIntegrationConfig {
  recipients: string[];
}

export type IntegrationConfig =
  | SlackIntegrationConfig
  | WebhookIntegrationConfig
  | EmailIntegrationConfig;

export interface IntegrationRecord {
  id: string;
  organizationId: string;
  type: IntegrationType;
  configJson: IntegrationConfig;
  createdAt: string;
}

export interface CreateIntegrationInput {
  type: IntegrationType;
  configJson: IntegrationConfig;
}

export interface UpdateIntegrationInput extends CreateIntegrationInput {}

export interface IntegrationListResponse {
  items: IntegrationRecord[];
}

export interface DeleteIntegrationResponse {
  deleted: true;
  id: string;
}

export interface ServiceAccountRecord {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface CreateServiceAccountInput {
  name: string;
  description?: string | null;
}

export interface ServiceAccountListResponse {
  items: ServiceAccountRecord[];
}

export interface RevokeServiceAccountResponse {
  revoked: true;
  id: string;
}

export interface OrganizationApiKeyRecord {
  id: string;
  organizationId: string;
  serviceAccountId?: string | null;
  serviceAccountName?: string | null;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface CreateOrganizationApiKeyInput {
  name: string;
  serviceAccountId?: string | null;
  scopes: ApiKeyScope[];
}

export interface CreateOrganizationApiKeyResponse {
  apiKey: OrganizationApiKeyRecord;
  rawKey: string;
}

export interface OrganizationApiKeyListResponse {
  items: OrganizationApiKeyRecord[];
}

export interface RevokeOrganizationApiKeyResponse {
  revoked: true;
  id: string;
}

export interface Capability {
  id: string;
  organizationId: string;
  approvalRequestId: string;
  action: string;
  resource: ApprovalResource;
  paramsHash: string;
  expiresAt: string;
  issuedAt: string;
  revokedAt?: string | null;
  token?: string;
}

export interface CapabilityExchangeScope {
  action: string;
  resource: ApprovalResource;
  paramsHash: string;
}

export interface ExchangeCapabilityInput {
  exchangeToken: string;
}

export interface ExchangeCapabilityResponse {
  capabilityToken: string;
  expiresAt: string;
  scope: CapabilityExchangeScope;
}

export interface ApprovalDecision {
  id: string;
  organizationId: string;
  approvalRequestId: string;
  decision: ApprovalDecisionType;
  approverId?: string | null;
  approverDisplayName?: string | null;
  reason?: string | null;
  authMethod?: string | null;
  authContext?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  externalRequestId?: string | null;
  requestedBy: ApprovalRequester;
  action: string;
  resource: ApprovalResource;
  params: Record<string, unknown> | unknown[] | null;
  paramsHash: string;
  riskLevel: RiskLevel;
  status: ApprovalRequestStatus;
  callbackUrl?: string | null;
  callback?: ApprovalCallbackConfig | null;
  policyResult: PolicyResult;
  expiresAt?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  latestDecision?: ApprovalDecision | null;
  capability?: Capability | null;
}

export interface WebhookEvent<TPayload = Record<string, unknown>> {
  id: string;
  eventType: ImportantEventType;
  approvalRequestId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface CreateApprovalRequestInput {
  externalRequestId?: string;
  requestedBy: ApprovalRequester;
  action: string;
  riskLevel: RiskLevel;
  resource: ApprovalResource;
  params?: Record<string, unknown> | unknown[] | null;
  callbackUrl?: string;
  callback?: ApprovalCallbackConfig;
  expiresAt?: string;
}

export interface ApproveRequestInput {
  approverId: string;
  approverDisplayName?: string;
  reason?: string;
  authMethod?: string;
  authContext?: Record<string, unknown>;
}

export interface RejectRequestInput {
  approverId: string;
  approverDisplayName?: string;
  reason?: string;
  authMethod?: string;
  authContext?: Record<string, unknown>;
}

export interface SecureDecisionInput {
  reason?: string;
}

export interface PasskeyRegistrationStartInput {
  requestId: string;
  token: string;
  email: string;
}

export interface PasskeyRegistrationStartResponse {
  user: ApproverUser;
  options: Record<string, unknown>;
}

export interface PasskeyRegistrationFinishInput {
  requestId: string;
  token: string;
  email: string;
  response: Record<string, unknown>;
}

export interface PasskeyRegistrationFinishResponse {
  user: ApproverUser;
  credentialId: string;
}

export interface PasskeyAuthenticationStartInput {
  requestId: string;
  token: string;
  email: string;
}

export interface PasskeyAuthenticationStartResponse {
  user: ApproverUser;
  options: Record<string, unknown>;
}

export interface PasskeyAuthenticationFinishInput {
  requestId: string;
  token: string;
  email: string;
  response: Record<string, unknown>;
}

export interface PasskeyAuthenticationFinishResponse {
  user: ApproverUser;
  session: ApproverSessionState;
}

export interface VerifyCapabilityInput {
  token: string;
  action: string;
  resource: ApprovalResource;
  params?: Record<string, unknown> | unknown[] | null;
}

export interface ApprovalRequestResponse {
  request: ApprovalRequest;
  approvalUrl?: string | null;
  capability?: Capability | null;
  idempotentReplay?: boolean;
  approverAuthorization?: ApproverAuthorizationSummary | null;
}

export type CapabilityInvalidReasonCode =
  | 'token_not_found'
  | 'token_expired'
  | 'token_revoked'
  | 'request_not_granted'
  | 'decision_missing'
  | 'action_mismatch'
  | 'resource_type_mismatch'
  | 'resource_id_mismatch'
  | 'params_mismatch';

export interface CapabilityInvalidReason {
  code: CapabilityInvalidReasonCode;
  message: string;
}

export interface CapabilityVerificationResult {
  valid: boolean;
  approvalRequestId?: string | null;
  capability?: Capability | null;
  reason?: string;
  invalidReason?: CapabilityInvalidReason;
}

export interface CapabilityUseResult {
  valid: boolean;
  approvalRequestId?: string | null;
  reason?: string;
  invalidReason?: CapabilityInvalidReason;
}

export interface ExpirationSweepResult {
  expiredCount: number;
  expiredIds: string[];
}

export interface DemoTimelineEntry {
  eventType: ImportantEventType;
  createdAt: string;
  actorType?: string | null;
  actorId?: string | null;
  payload: Record<string, unknown>;
  payloadHash?: string | null;
  ledgerSequence?: number | null;
  ledgerEntryHash?: string | null;
}

export interface DemoTimelineResponse {
  approvalRequestId: string;
  requestStatus: ApprovalRequestStatus;
  deploymentExecuted: boolean;
  timeline: DemoTimelineEntry[];
}

export interface DemoDeploymentExecutionResult {
  approvalRequestId: string;
  executed: boolean;
}

export interface InternalApprovalRequestFilters {
  status?: ApprovalRequestStatus;
  riskLevel?: RiskLevel;
  actionContains?: string;
  resourceIdContains?: string;
}

export interface InternalApprovalRequestListResponse {
  items: ApprovalRequest[];
  total: number;
  filters: InternalApprovalRequestFilters;
}

export interface InternalTimelineEntry {
  immutableEventId: string;
  eventType: string;
  createdAt: string;
  actorType?: string | null;
  actorId?: string | null;
  payload: Record<string, unknown>;
  payloadHash: string;
  ledgerSequence?: number | null;
  ledgerEntryHash?: string | null;
}

export interface OrganizationSecurityEvent {
  immutableEventId: string;
  eventType: string;
  createdAt: string;
  actorType?: string | null;
  actorId?: string | null;
  actorDisplay?: string | null;
  payload: Record<string, unknown>;
  payloadHash: string;
  ledgerSequence?: number | null;
  ledgerEntryHash?: string | null;
}

export interface OrganizationSecurityEventListResponse {
  items: OrganizationSecurityEvent[];
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface InternalWebhookDeliverySummary {
  id: string;
  eventType: string;
  callbackUrl: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  lastAttemptAt?: string | null;
  responseStatus?: number | null;
  responseBody?: string | null;
  createdAt: string;
}

export interface InternalLedgerSummary {
  totalEntries: number;
  firstSequence?: number | null;
  lastSequence?: number | null;
  latestEntryHash?: string | null;
}

export interface InternalApprovalRequestDetailResponse {
  request: ApprovalRequest;
  timeline: InternalTimelineEntry[];
  webhookDeliveries: InternalWebhookDeliverySummary[];
  capabilityUsageCount: number;
  ledgerSummary: InternalLedgerSummary;
}

export interface InternalLedgerVerificationInput {
  fromSeq?: number;
  toSeq?: number;
}

export interface InternalLedgerVerificationResult {
  valid: boolean;
  checkedEntries: number;
  firstInvalidSeq: number | null;
  reason: string | null;
}

export interface ApiErrorBody {
  code: string;
  message: string | string[];
  details?: unknown;
}

export interface ApiErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  error: ApiErrorBody;
}
