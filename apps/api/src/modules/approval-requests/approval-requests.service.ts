import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ApproverAuthorizationSummary,
  ApproverSessionState,
  ApprovalRequestResponse,
  ExpirationSweepResult,
  InternalApprovalRequestDetailResponse,
  InternalApprovalRequestFilters,
  InternalApprovalRequestListResponse,
  InternalTimelineEntry,
} from '@approva/shared';
import {
  MachinePrincipalType,
  Prisma,
  type ApprovalRequestStatus,
} from '@prisma/client';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { RequestContextService } from '../../common/observability/request-context.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaDbClient } from '../../common/prisma/prisma.types';
import { toApprovalRequest } from '../../common/utils/domain.mapper';
import {
  buildSignedToken,
  hashCanonicalValue,
  hashTokenValue,
} from '../../common/utils/hash.util';
import {
  toPrismaJson,
  toPrismaOptionalJson,
} from '../../common/utils/prisma-json.util';
import { EventChainService } from '../audit/event-chain.service';
import type { AuthenticatedApproverSession } from '../auth/auth.service';
import { CapabilityService } from '../capability/capability.service';
import { NotificationService } from '../notification/notification.service';
import { OrganizationRbacService } from '../organizations/organization-rbac.service';
import {
  type OrganizationContextInput,
  OrganizationsService,
} from '../organizations/organizations.service';
import { PolicyService } from '../policy/policy.service';
import { MetricsService } from '../observability/metrics.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { WebhookService } from '../webhook/webhook.service';
import type { MachineAuthPrincipal } from '../machine-auth/machine-auth.service';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { SecureDecisionDto } from './dto/secure-decision.dto';

const REQUEST_INCLUDE = {
  decision: true,
  capability: true,
} satisfies Prisma.ApprovalRequestInclude;

const TERMINAL_STATUSES = new Set<ApprovalRequestStatus>([
  'approved',
  'rejected',
  'expired',
  'auto_approved',
]);

type ApprovalRequestRecord = Prisma.ApprovalRequestGetPayload<{
  include: typeof REQUEST_INCLUDE;
}>;

type AuditEventRecord = Prisma.AuditEventGetPayload<{
  select: {
    eventType: true;
    actorType: true;
    actorId: true;
    payload: true;
  };
}>;

type ImmutableEventRecord = Prisma.ImmutableEventGetPayload<{
  include: {
    ledgerEntry: {
      select: {
        sequence: true;
        entryHash: true;
      };
    };
  };
}>;

type PendingDecisionInput = {
  approverId: string;
  approverDisplayName?: string;
  reason?: string;
  authMethod?: string;
  authContext?: Record<string, unknown> | null;
};

type TerminalWebhookPayload = {
  approvalRequestId: string;
  status: ApprovalRequestStatus;
  capabilityId?: string;
  capabilityExchangeToken?: string;
  capabilityExchangeExpiresAt?: string;
};

type TransitionOutcome = {
  request: ApprovalRequestRecord;
  capability: Awaited<ReturnType<CapabilityService['issueCapability']>> | null;
  webhookDeliveryId?: string;
  webhookPayload?: TerminalWebhookPayload;
  notificationEventType?:
    | 'approval_request.approved'
    | 'approval_request.rejected'
    | 'approval_request.expired';
};

type CreateRequestContext = {
  organizationId: string;
  requestedBySystem: string;
  externalRequestId: string | null;
  idempotencyKey: string | null;
  requestFingerprintHash: string;
};

type ResolvedCallbackConfiguration = {
  callbackUrl: string | null;
  deliverCapabilityMode: 'none' | 'exchange_token';
  machinePrincipalType: MachinePrincipalType | null;
  machinePrincipalId: string | null;
};

type CreateRequestOutcome = {
  request: ApprovalRequestRecord;
  capability: Awaited<ReturnType<CapabilityService['issueCapability']>> | null;
  shouldNotifyPending: boolean;
  idempotentReplay: boolean;
  webhookDeliveryId?: string;
  webhookPayload?: TerminalWebhookPayload;
  notificationEventType?:
    | 'approval_request.approved'
    | 'approval_request.rejected'
    | 'approval_request.expired';
};

class DecisionAuthorizationDeniedError extends Error {
  constructor(
    readonly details: {
      requestId: string;
      organizationId: string;
      targetStatus: 'approved' | 'rejected';
      approverId?: string | null;
      approverDisplayName?: string | null;
      authMethod?: string | null;
      authorization: ApproverAuthorizationSummary;
    },
  ) {
    super(details.authorization.message);
  }
}

@Injectable()
export class ApprovalRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
    private readonly capabilityService: CapabilityService,
    private readonly eventChainService: EventChainService,
    private readonly webhookService: WebhookService,
    private readonly notificationService: NotificationService,
    private readonly organizationsService: OrganizationsService,
    private readonly organizationRbacService: OrganizationRbacService,
    private readonly requestContextService: RequestContextService,
    private readonly metricsService: MetricsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async createRequest(
    input: CreateApprovalRequestDto,
    idempotencyKey?: string | null,
    organizationInput: OrganizationContextInput = {},
    machinePrincipal?: MachineAuthPrincipal | null,
  ): Promise<ApprovalRequestResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    this.requestContextService.setOrganizationId(organization.id);
    await this.rateLimitService.enforceOrganizationLimit({
      organizationId: organization.id,
      bucket: 'approval-request-create',
      limit: this.rateLimitService.getOrganizationApprovalCreateLimit(),
      message: 'Organization approval request creation rate limit exceeded.',
    });
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const params = input.params ?? null;
    const paramsHash = hashCanonicalValue(params);
    const callbackConfiguration = this.resolveCallbackConfiguration(
      input,
      machinePrincipal,
    );
    const policyResult = await this.policyService.evaluate({
      organizationId: organization.id,
      action: input.action,
      resourceType: input.resource.type,
      riskLevel: input.riskLevel,
    });
    const normalizedIdempotencyKey = this.normalizeOptionalString(idempotencyKey);
    const createContext = this.buildCreateContext(
      input,
      expiresAt,
      normalizedIdempotencyKey,
      organization.id,
      callbackConfiguration,
    );

    const existingReplay = await this.findExistingReplay(createContext);

    if (existingReplay) {
      return this.serializeResponse(existingReplay, {
        includeApprovalUrl: true,
        idempotentReplay: true,
      });
    }

    try {
      const outcome = await this.runSerializableTransaction(async (tx): Promise<CreateRequestOutcome> => {
        const replayInsideTransaction = await this.findExistingReplay(createContext, tx);

        if (replayInsideTransaction) {
          return {
            request: replayInsideTransaction,
            capability: null,
            shouldNotifyPending: false,
            idempotentReplay: true,
          };
        }

        const requestId = randomUUID();
        const approvalAccessToken = this.getApprovalAccessToken(requestId);
        const initialStatus =
          policyResult.decision === 'approval_required'
            ? 'pending'
            : policyResult.decision === 'reject'
              ? 'rejected'
              : 'auto_approved';
        const decidedAt = initialStatus === 'pending' ? null : new Date();

        const request = await tx.approvalRequest.create({
          data: {
            organizationId: organization.id,
            id: requestId,
            externalRequestId: createContext.externalRequestId,
            requestedBySystem: createContext.requestedBySystem,
            requestedByActorId: this.normalizeOptionalString(input.requestedBy.actorId),
            idempotencyKey: createContext.idempotencyKey,
            requestFingerprintHash: createContext.requestFingerprintHash,
            approvalAccessTokenHash: hashTokenValue(approvalAccessToken),
            action: input.action,
            resourceType: input.resource.type,
            resourceId: input.resource.id,
            params: toPrismaJson(params),
            paramsHash,
            riskLevel: input.riskLevel,
            status: initialStatus,
            callbackUrl: callbackConfiguration.callbackUrl,
            deliverCapabilityMode: callbackConfiguration.deliverCapabilityMode,
            machinePrincipalType: callbackConfiguration.machinePrincipalType,
            machinePrincipalId: callbackConfiguration.machinePrincipalId,
            policyResult: toPrismaJson(policyResult),
            expiresAt,
            decidedAt,
          },
          include: REQUEST_INCLUDE,
        });
        this.requestContextService.setApprovalRequestId(request.id);

        await this.eventChainService.recordEvent(
          {
            organizationId: organization.id,
            approvalRequestId: request.id,
            eventType: 'approval_request.created',
            actorType: machinePrincipal ? 'machine' : 'system',
            actorId: this.getMachineActorId(machinePrincipal) ?? request.requestedBySystem,
            payload: {
              approvalRequestId: request.id,
              externalRequestId: request.externalRequestId,
              requestedBySystem: request.requestedBySystem,
              status: request.status,
              action: request.action,
              riskLevel: request.riskLevel,
              policyDecision: policyResult.decision,
              machineAuth: this.buildMachineAuthMetadata(machinePrincipal),
            },
          },
          tx,
        );

        if (policyResult.decision === 'approval_required') {
          await this.eventChainService.recordEvent(
            {
              organizationId: organization.id,
              approvalRequestId: request.id,
              eventType: 'approval_request.pending',
              actorType: machinePrincipal ? 'machine' : 'system',
              actorId: this.getMachineActorId(machinePrincipal) ?? request.requestedBySystem,
              payload: {
                approvalRequestId: request.id,
                status: 'pending',
                expiresAt: request.expiresAt.toISOString(),
                machineAuth: this.buildMachineAuthMetadata(machinePrincipal),
              },
            },
            tx,
          );

          return {
            request,
            capability: null,
            shouldNotifyPending: true,
            idempotentReplay: false,
          };
        }

        const systemDecision = await tx.approvalDecision.create({
          data: {
            organizationId: organization.id,
            approvalRequestId: request.id,
            decision: initialStatus === 'rejected' ? 'rejected' : 'auto_approved',
            approverId: 'system',
            approverDisplayName: 'Policy Engine',
            reason:
              initialStatus === 'rejected'
                ? policyResult.reasons.join(' ')
                : 'Request auto-approved by configured organization policy.',
            authMethod: 'policy_engine',
            authContext: toPrismaJson({
              policyDecision: policyResult.decision,
              matchedRules: policyResult.matchedRules,
              matchedPolicyId: policyResult.matchedPolicyId ?? null,
              approverRoles: policyResult.approverRoles ?? [],
            }),
          },
        });

        await this.eventChainService.recordEvent(
          {
            organizationId: organization.id,
            approvalRequestId: request.id,
            eventType:
              initialStatus === 'rejected'
                ? 'approval_request.rejected'
                : 'approval_request.auto_approved',
            actorType: 'system',
            actorId: 'policy-engine',
            payload: {
              approvalRequestId: request.id,
              decisionId: systemDecision.id,
              status: initialStatus,
              authMethod: 'policy_engine',
              reason:
                initialStatus === 'rejected' ? policyResult.reasons.join(' ') : null,
              authContext: {
                policyDecision: policyResult.decision,
                matchedPolicyId: policyResult.matchedPolicyId ?? null,
                approverRoles: policyResult.approverRoles ?? [],
              },
            },
          },
          tx,
        );

        if (initialStatus === 'rejected') {
          const refreshedRequest = await this.getExistingRequest(request.id, organization.id, tx);
          const webhookDelivery = await this.webhookService.queueDecisionEvent(
            {
              organizationId: organization.id,
              approvalRequestId: request.id,
              callbackUrl: refreshedRequest.callbackUrl,
              eventType: 'approval_request.rejected',
            },
            tx,
          );

          return {
            request: refreshedRequest,
            capability: null,
            shouldNotifyPending: false,
            idempotentReplay: false,
            webhookDeliveryId: webhookDelivery?.id,
            webhookPayload: {
              approvalRequestId: request.id,
              status: refreshedRequest.status,
            },
            notificationEventType: 'approval_request.rejected',
          };
        }

        const capability = await this.capabilityService.issueCapability(
          {
            organizationId: organization.id,
            approvalRequestId: request.id,
            action: request.action,
            resource: {
              type: request.resourceType,
              id: request.resourceId,
            },
            paramsHash: request.paramsHash,
            expiresAt: this.resolveCapabilityExpiry(new Date()),
          },
          tx,
        );

        await this.eventChainService.recordEvent(
          {
            organizationId: organization.id,
            approvalRequestId: request.id,
            eventType: 'capability.issued',
            actorType: 'system',
            actorId: 'capability-service',
            payload: {
              approvalRequestId: request.id,
              capabilityId: capability.id,
              expiresAt: capability.expiresAt,
            },
          },
          tx,
        );

        const refreshedRequest = await this.getExistingRequest(request.id, organization.id, tx);

        return {
          request: refreshedRequest,
          capability,
          shouldNotifyPending: false,
          idempotentReplay: false,
        };
      });

      if (outcome.shouldNotifyPending) {
        this.metricsService.increment('approva_approval_requests_created_total');
        await this.notificationService.notifyPendingApproval({
          organizationId: outcome.request.organizationId,
          approvalRequestId: outcome.request.id,
          action: outcome.request.action,
          resourceType: outcome.request.resourceType,
          resourceId: outcome.request.resourceId,
          reason: this.getApprovalNotificationReason(outcome.request),
          riskLevel: outcome.request.riskLevel,
          approvalUrl: this.buildApprovalUrl(outcome.request.id),
          consoleUrl: this.buildConsoleApprovalUrl(outcome.request.id),
          requestedBy: this.buildRequestedByLabel(
            outcome.request.requestedBySystem,
            outcome.request.requestedByActorId,
          ),
        });
      }

      if (!outcome.idempotentReplay && outcome.request.status === 'auto_approved') {
        this.metricsService.increment('approva_approval_requests_created_total');
        this.metricsService.increment('approva_policy_auto_approve_total');
      }

      if (!outcome.idempotentReplay && outcome.request.status === 'rejected') {
        this.metricsService.increment('approva_approval_requests_created_total');
        this.metricsService.increment('approva_policy_reject_total');
      }

      await this.deliverWebhookIfQueued(outcome);
      await this.notifyOutcomeIfNeeded(outcome);

      return this.serializeResponse(outcome.request, {
        includeApprovalUrl: true,
        explicitCapability: outcome.capability,
        idempotentReplay: outcome.idempotentReplay,
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const replay = await this.findExistingReplay(createContext);

      if (replay) {
        return this.serializeResponse(replay, {
          includeApprovalUrl: true,
          idempotentReplay: true,
        });
      }

      throw error;
    }
  }

  async getRequestById(
    id: string,
    organizationInput: OrganizationContextInput = {},
  ): Promise<ApprovalRequestResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    const outcome = await this.runSerializableTransaction(async (tx) => {
      const request = await this.getExistingRequest(id, organization.id, tx);
      const expiration = await this.transitionToExpiredIfNeeded(request, organization.id, tx);

      return (
        expiration ?? {
          request,
          capability: null,
          webhookDeliveryId: undefined,
          webhookPayload: undefined,
        }
      );
    });

    await this.deliverWebhookIfQueued(outcome);

    return this.serializeResponse(outcome.request);
  }

  async getSecureRequestById(
    id: string,
    token: string,
    organizationInput: OrganizationContextInput = {},
    approverSession?: ApproverSessionState | null,
  ): Promise<ApprovalRequestResponse> {
    const outcome = await this.runSerializableTransaction(async (tx) => {
      const request = this.hasExplicitOrganizationContext(organizationInput)
        ? await this.getExistingRequest(
            id,
            (await this.organizationsService.resolveOrganization(organizationInput, tx)).id,
            tx,
          )
        : await this.getExistingRequestByAccessToken(id, token, tx);

      this.assertValidApprovalAccessToken(request, token);
      const expiration = await this.transitionToExpiredIfNeeded(
        request,
        request.organizationId,
        tx,
      );

      return (
        expiration ?? {
          request,
          capability: null,
          webhookDeliveryId: undefined,
          webhookPayload: undefined,
        }
      );
    });

    await this.deliverWebhookIfQueued(outcome);

    return this.serializeResponse(outcome.request, {
      approverAuthorization: await this.getApproverAuthorizationSummary(
        outcome.request,
        approverSession,
      ),
    });
  }

  async listInternalRequests(
    filters: InternalApprovalRequestFilters,
    organizationInput: OrganizationContextInput = {},
  ): Promise<InternalApprovalRequestListResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    const normalizedFilters = this.normalizeInternalFilters(filters);
    const where: Prisma.ApprovalRequestWhereInput = {
      organizationId: organization.id,
      ...(normalizedFilters.status ? { status: normalizedFilters.status } : {}),
      ...(normalizedFilters.riskLevel ? { riskLevel: normalizedFilters.riskLevel } : {}),
      ...(normalizedFilters.actionContains
        ? {
            action: {
              contains: normalizedFilters.actionContains,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(normalizedFilters.resourceIdContains
        ? {
            resourceId: {
              contains: normalizedFilters.resourceIdContains,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [requests, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return {
      items: requests.map((request) => toApprovalRequest(request)),
      total,
      filters: normalizedFilters,
    };
  }

  async getInternalRequestDetail(
    id: string,
    organizationInput: OrganizationContextInput = {},
  ): Promise<InternalApprovalRequestDetailResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    const outcome = await this.runSerializableTransaction(async (tx) => {
      const request = await this.getExistingRequest(id, organization.id, tx);
      const expiration = await this.transitionToExpiredIfNeeded(request, organization.id, tx);

      return (
        expiration ?? {
          request,
          capability: null,
          webhookDeliveryId: undefined,
          webhookPayload: undefined,
        }
      );
    });

    await this.deliverWebhookIfQueued(outcome);

    const [immutableEvents, auditEvents, webhookDeliveries] = await Promise.all([
      this.prisma.immutableEvent.findMany({
        where: {
          organizationId: organization.id,
          approvalRequestId: id,
        },
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          ledgerEntry: {
            select: {
              sequence: true,
              entryHash: true,
            },
          },
        },
      }),
      this.prisma.auditEvent.findMany({
        where: {
          organizationId: organization.id,
          approvalRequestId: id,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          eventType: true,
          actorType: true,
          actorId: true,
          payload: true,
        },
      }),
      this.prisma.webhookDelivery.findMany({
        where: {
          organizationId: organization.id,
          approvalRequestId: id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          eventType: true,
          callbackUrl: true,
          status: true,
          attemptCount: true,
          lastAttemptAt: true,
          responseStatus: true,
          responseBody: true,
          createdAt: true,
        },
      }),
    ]);

    const timeline = this.buildInternalTimeline(immutableEvents, auditEvents);
    const capabilityUsageCount = timeline.filter(
      (entry) => entry.eventType === 'capability.used',
    ).length;
    const ledgerEntries = immutableEvents
      .map((event) => event.ledgerEntry)
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const lastLedgerEntry = ledgerEntries.at(-1) ?? null;

    return {
      request: toApprovalRequest(outcome.request),
      timeline,
      webhookDeliveries: webhookDeliveries.map((delivery) => ({
        id: delivery.id,
        eventType: delivery.eventType,
        callbackUrl: delivery.callbackUrl,
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        lastAttemptAt: delivery.lastAttemptAt?.toISOString() ?? null,
        responseStatus: delivery.responseStatus,
        responseBody: delivery.responseBody,
        createdAt: delivery.createdAt.toISOString(),
      })),
      capabilityUsageCount,
      ledgerSummary: {
        totalEntries: ledgerEntries.length,
        firstSequence: ledgerEntries[0]?.sequence ?? null,
        lastSequence: lastLedgerEntry?.sequence ?? null,
        latestEntryHash: lastLedgerEntry?.entryHash ?? null,
      },
    };
  }

  async approveRequest(
    id: string,
    input: ApproveRequestDto,
    organizationInput: OrganizationContextInput = {},
  ): Promise<ApprovalRequestResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    this.requestContextService.setOrganizationId(organization.id);
    const outcome = await this.transitionPendingRequest(id, organization.id, 'approved', input);
    this.metricsService.increment('approva_approval_requests_approved_total');
    await this.deliverWebhookIfQueued(outcome);
    await this.notifyOutcomeIfNeeded(outcome);

    return this.serializeResponse(outcome.request, {
      explicitCapability: outcome.capability,
    });
  }

  async approveRequestWithToken(
    id: string,
    token: string,
    input: SecureDecisionDto,
    session: AuthenticatedApproverSession,
    organizationInput: OrganizationContextInput = {},
  ): Promise<ApprovalRequestResponse> {
    const organizationId = this.hasExplicitOrganizationContext(organizationInput)
      ? (await this.organizationsService.resolveOrganization(organizationInput)).id
      : null;
    const outcome = await this.transitionPendingRequest(
      id,
      organizationId,
      'approved',
      this.buildPasskeyDecisionInput(session, input),
      token,
    );
    this.metricsService.increment('approva_approval_requests_approved_total');
    await this.deliverWebhookIfQueued(outcome);
    await this.notifyOutcomeIfNeeded(outcome);

    return this.serializeResponse(outcome.request, {
      explicitCapability: outcome.capability,
    });
  }

  async rejectRequest(
    id: string,
    input: RejectRequestDto,
    organizationInput: OrganizationContextInput = {},
  ): Promise<ApprovalRequestResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    this.requestContextService.setOrganizationId(organization.id);
    const outcome = await this.transitionPendingRequest(id, organization.id, 'rejected', input);
    this.metricsService.increment('approva_approval_requests_denied_total');
    await this.deliverWebhookIfQueued(outcome);
    await this.notifyOutcomeIfNeeded(outcome);

    return this.serializeResponse(outcome.request);
  }

  async rejectRequestWithToken(
    id: string,
    token: string,
    input: SecureDecisionDto,
    session: AuthenticatedApproverSession,
    organizationInput: OrganizationContextInput = {},
  ): Promise<ApprovalRequestResponse> {
    const organizationId = this.hasExplicitOrganizationContext(organizationInput)
      ? (await this.organizationsService.resolveOrganization(organizationInput)).id
      : null;
    const outcome = await this.transitionPendingRequest(
      id,
      organizationId,
      'rejected',
      this.buildPasskeyDecisionInput(session, input),
      token,
    );
    this.metricsService.increment('approva_approval_requests_denied_total');
    await this.deliverWebhookIfQueued(outcome);
    await this.notifyOutcomeIfNeeded(outcome);

    return this.serializeResponse(outcome.request);
  }

  async expirePendingRequests(
    limit = 100,
    organizationInput: OrganizationContextInput = {},
  ): Promise<ExpirationSweepResult> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    const candidates = await this.prisma.approvalRequest.findMany({
      where: {
        organizationId: organization.id,
        status: 'pending',
        expiresAt: {
          lte: new Date(),
        },
      },
      orderBy: {
        expiresAt: 'asc',
      },
      take: limit,
      select: {
        id: true,
      },
    });

    const expiredIds: string[] = [];

    for (const candidate of candidates) {
      const outcome = await this.runSerializableTransaction(async (tx) => {
        const request = await this.getExistingRequest(candidate.id, organization.id, tx);
        return this.transitionToExpiredIfNeeded(request, organization.id, tx);
      });

      if (!outcome) {
        continue;
      }

      await this.deliverWebhookIfQueued(outcome);
      await this.notifyOutcomeIfNeeded(outcome);

      if (outcome.request.status === 'expired') {
        expiredIds.push(outcome.request.id);
      }
    }

    return {
      expiredCount: expiredIds.length,
      expiredIds,
    };
  }

  private async transitionPendingRequest(
    id: string,
    organizationId: string | null,
    targetStatus: 'approved' | 'rejected',
    input: PendingDecisionInput,
    approvalAccessToken?: string,
  ) {
    let outcome: TransitionOutcome;

    try {
      outcome = await this.runSerializableTransaction(async (tx) => {
        const request =
          organizationId !== null
            ? await this.getExistingRequest(id, organizationId, tx)
            : approvalAccessToken
              ? await this.getExistingRequestByAccessToken(id, approvalAccessToken, tx)
              : await this.getExistingRequest(
                  id,
                  (await this.organizationsService.ensureDefaultOrganization(tx)).id,
                  tx,
                );

        if (approvalAccessToken) {
          this.assertValidApprovalAccessToken(request, approvalAccessToken);
        }

        const requestOrganizationId = request.organizationId;
        this.requestContextService.setContext({
          organizationId: requestOrganizationId,
          approvalRequestId: request.id,
          userId: input.approverId ?? null,
        });
        const expiration = await this.transitionToExpiredIfNeeded(
          request,
          requestOrganizationId,
          tx,
        );

        if (expiration) {
          return expiration;
        }

        this.assertValidTransition(request.status, targetStatus);

        const decisionAuthorization = await this.getDecisionAuthorization(
          request,
          input,
          tx,
        );

        if (!decisionAuthorization.authorized) {
          throw new DecisionAuthorizationDeniedError({
            requestId: request.id,
            organizationId: requestOrganizationId,
            targetStatus,
            approverId: input.approverId,
            approverDisplayName: input.approverDisplayName,
            authMethod: input.authMethod ?? 'manual',
            authorization: decisionAuthorization,
          });
        }

        const decisionAuthContext = this.buildDecisionAuthContext(
          input.authContext,
          decisionAuthorization,
        );

        const decidedAt = new Date();
        const updateResult = await tx.approvalRequest.updateMany({
          where: {
            id: request.id,
            organizationId: requestOrganizationId,
            status: 'pending',
            decidedAt: null,
          },
          data: {
            status: targetStatus,
            decidedAt,
          },
        });

        if (updateResult.count !== 1) {
          throw new ConflictException('Approval request changed concurrently.');
        }

        const recordedDecision = await tx.approvalDecision.create({
          data: {
            organizationId: requestOrganizationId,
            approvalRequestId: request.id,
            decision: targetStatus,
            approverId: input.approverId,
            approverDisplayName: input.approverDisplayName,
            reason: input.reason,
            authMethod: input.authMethod ?? 'manual',
            authContext: toPrismaOptionalJson(decisionAuthContext),
          },
        });

        await this.eventChainService.recordEvent(
          {
            organizationId: requestOrganizationId,
            approvalRequestId: request.id,
            eventType:
              targetStatus === 'approved'
                ? 'approval_request.approved'
                : 'approval_request.rejected',
            actorType: 'human',
            actorId: input.approverId,
            payload:
              targetStatus === 'approved'
                ? {
                    approvalRequestId: request.id,
                    decisionId: recordedDecision.id,
                    approverId: input.approverId,
                    authMethod: input.authMethod ?? 'manual',
                    authContext: decisionAuthContext,
                    deliverCapabilityMode: request.deliverCapabilityMode,
                  }
                : {
                    approvalRequestId: request.id,
                    decisionId: recordedDecision.id,
                    approverId: input.approverId,
                    reason: input.reason ?? null,
                    authMethod: input.authMethod ?? 'manual',
                    authContext: decisionAuthContext,
                  },
          },
          tx,
        );

        let capability: Awaited<ReturnType<CapabilityService['issueCapability']>> | null = null;
        let capabilityExchangeToken:
          | {
              token: string;
              expiresAt: string;
            }
          | null = null;

        if (targetStatus === 'approved') {
          capability = await this.capabilityService.issueCapability(
            {
              organizationId: requestOrganizationId,
              approvalRequestId: request.id,
              action: request.action,
              resource: {
                type: request.resourceType,
                id: request.resourceId,
              },
              paramsHash: request.paramsHash,
              expiresAt: this.resolveCapabilityExpiry(decidedAt),
            },
            tx,
          );

          if (
            capability.token &&
            request.deliverCapabilityMode === 'exchange_token'
          ) {
            capabilityExchangeToken =
              await this.capabilityService.createCapabilityExchangeToken(
                {
                  organizationId: requestOrganizationId,
                  approvalRequestId: request.id,
                  capabilityId: capability.id,
                  capabilityToken: capability.token,
                  capabilityExpiresAt: new Date(capability.expiresAt),
                  callbackUrl: request.callbackUrl,
                  machinePrincipalBinding: this.getStoredMachinePrincipalBinding(request),
                },
                tx,
              );
          }

          await this.eventChainService.recordEvent(
            {
              organizationId: requestOrganizationId,
              approvalRequestId: request.id,
              eventType: 'capability.issued',
              actorType: 'system',
              actorId: 'capability-service',
              payload: {
                approvalRequestId: request.id,
                capabilityId: capability.id,
                expiresAt: capability.expiresAt,
              },
            },
            tx,
          );
        }

        const refreshedRequest = await this.getExistingRequest(
          request.id,
          requestOrganizationId,
          tx,
        );
        const webhookDelivery = await this.webhookService.queueDecisionEvent(
          {
            organizationId: requestOrganizationId,
            approvalRequestId: request.id,
            callbackUrl: refreshedRequest.callbackUrl,
            eventType:
              targetStatus === 'approved'
                ? 'approval_request.approved'
                : 'approval_request.rejected',
          },
          tx,
        );

        return {
          request: refreshedRequest,
          capability,
          webhookDeliveryId: webhookDelivery?.id,
          webhookPayload: {
            approvalRequestId: request.id,
            status: refreshedRequest.status,
            ...(capability ? { capabilityId: capability.id } : {}),
            ...(capabilityExchangeToken
              ? {
                  capabilityExchangeToken: capabilityExchangeToken.token,
                  capabilityExchangeExpiresAt: capabilityExchangeToken.expiresAt,
                }
              : {}),
          } satisfies TerminalWebhookPayload,
          notificationEventType:
            targetStatus === 'approved'
              ? ('approval_request.approved' as const)
              : ('approval_request.rejected' as const),
        };
      });
    } catch (error) {
      if (error instanceof DecisionAuthorizationDeniedError) {
        await this.recordDeniedDecisionAttempt(error.details);
        throw new ForbiddenException(error.details.authorization.message);
      }

      throw error;
    }

    if (outcome.request.status === 'expired') {
      throw new ConflictException(
        `Invalid approval request transition from pending to ${targetStatus} because the request has expired.`,
      );
    }

    return outcome;
  }

  private async transitionToExpiredIfNeeded(
    request: ApprovalRequestRecord,
    organizationId: string,
    prisma: PrismaDbClient,
  ) {
    if (request.status !== 'pending' || request.expiresAt.getTime() > Date.now()) {
      return null;
    }

    const decidedAt = new Date();
    const updateResult = await prisma.approvalRequest.updateMany({
      where: {
        id: request.id,
        organizationId,
        status: 'pending',
        decidedAt: null,
        expiresAt: {
          lte: decidedAt,
        },
      },
      data: {
        status: 'expired',
        decidedAt,
      },
    });

    if (updateResult.count !== 1) {
      const currentState = await this.getExistingRequest(request.id, organizationId, prisma);

      return {
        request: currentState,
        capability: null,
        webhookDeliveryId: undefined,
        webhookPayload: undefined,
      };
    }

    await this.eventChainService.recordEvent(
      {
        organizationId,
        approvalRequestId: request.id,
        eventType: 'approval_request.expired',
        actorType: 'system',
        actorId: 'expiry-sweeper',
        payload: {
          approvalRequestId: request.id,
          expiredAt: decidedAt.toISOString(),
        },
      },
      prisma,
    );

    const refreshedRequest = await this.getExistingRequest(request.id, organizationId, prisma);
    const webhookDelivery = await this.webhookService.queueDecisionEvent(
      {
        organizationId,
        approvalRequestId: request.id,
        callbackUrl: refreshedRequest.callbackUrl,
        eventType: 'approval_request.expired',
      },
      prisma,
    );

    return {
      request: refreshedRequest,
      capability: null,
      webhookDeliveryId: webhookDelivery?.id,
      webhookPayload: {
        approvalRequestId: refreshedRequest.id,
        status: refreshedRequest.status,
      } satisfies TerminalWebhookPayload,
      notificationEventType: 'approval_request.expired' as const,
    };
  }

  private async findExistingReplay(
    context: CreateRequestContext,
    prisma: PrismaDbClient = this.prisma,
  ) {
    const existingByIdempotency = context.idempotencyKey
      ? await prisma.approvalRequest.findUnique({
          where: {
            organizationId_requestedBySystem_idempotencyKey: {
              organizationId: context.organizationId,
              requestedBySystem: context.requestedBySystem,
              idempotencyKey: context.idempotencyKey,
            },
          },
          include: REQUEST_INCLUDE,
        })
      : null;

    const existingByExternalRequest = context.externalRequestId
      ? await prisma.approvalRequest.findUnique({
          where: {
            organizationId_requestedBySystem_externalRequestId: {
              organizationId: context.organizationId,
              requestedBySystem: context.requestedBySystem,
              externalRequestId: context.externalRequestId,
            },
          },
          include: REQUEST_INCLUDE,
        })
      : null;

    if (
      existingByIdempotency &&
      existingByExternalRequest &&
      existingByIdempotency.id !== existingByExternalRequest.id
    ) {
      throw new ConflictException(
        'Idempotency key and external request id refer to different approval requests.',
      );
    }

    const existing = existingByIdempotency ?? existingByExternalRequest;

    if (!existing) {
      return null;
    }

    if (existing.requestFingerprintHash !== context.requestFingerprintHash) {
      throw new ConflictException(
        'Duplicate approval request identifiers were reused with a different payload.',
      );
    }

    return existing;
  }

  private buildCreateContext(
    input: CreateApprovalRequestDto,
    expiresAt: Date,
    idempotencyKey: string | null,
    organizationId: string,
    callbackConfiguration: ResolvedCallbackConfiguration,
  ): CreateRequestContext {
    return {
      organizationId,
      requestedBySystem: input.requestedBy.system,
      externalRequestId: this.normalizeOptionalString(input.externalRequestId),
      idempotencyKey,
      requestFingerprintHash: hashCanonicalValue({
        externalRequestId: this.normalizeOptionalString(input.externalRequestId),
        requestedBy: {
          system: input.requestedBy.system,
          actorId: this.normalizeOptionalString(input.requestedBy.actorId),
        },
        action: input.action,
        riskLevel: input.riskLevel,
        resource: input.resource,
        params: input.params ?? null,
        callback: callbackConfiguration.callbackUrl
          ? {
              webhookUrl: callbackConfiguration.callbackUrl,
              deliverCapabilityMode: callbackConfiguration.deliverCapabilityMode,
            }
          : null,
        machinePrincipalBinding:
          callbackConfiguration.machinePrincipalType &&
          callbackConfiguration.machinePrincipalId
            ? {
                type: callbackConfiguration.machinePrincipalType,
                id: callbackConfiguration.machinePrincipalId,
              }
            : null,
        // Only include expiry in the replay fingerprint when the caller set it explicitly.
        expiresAt: input.expiresAt ? expiresAt.toISOString() : null,
      }),
    };
  }

  private async getExistingRequest(
    id: string,
    organizationId: string,
    prisma: PrismaDbClient = this.prisma,
  ) {
    const request = await prisma.approvalRequest.findFirst({
      where: {
        id,
        organizationId,
      },
      include: REQUEST_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException('Approval request not found.');
    }

    this.requestContextService.setContext({
      organizationId: request.organizationId,
      approvalRequestId: request.id,
    });

    return request;
  }

  private async getExistingRequestByAccessToken(
    id: string,
    token: string,
    prisma: PrismaDbClient = this.prisma,
  ) {
    const request = await prisma.approvalRequest.findFirst({
      where: {
        id,
        approvalAccessTokenHash: hashTokenValue(token),
      },
      include: REQUEST_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException('Approval request not found.');
    }

    this.requestContextService.setContext({
      organizationId: request.organizationId,
      approvalRequestId: request.id,
    });

    return request;
  }

  private serializeResponse(
    request: ApprovalRequestRecord,
    options?: {
      includeApprovalUrl?: boolean;
      explicitCapability?: Awaited<ReturnType<CapabilityService['issueCapability']>> | null;
      idempotentReplay?: boolean;
      approverAuthorization?: ApproverAuthorizationSummary | null;
    },
  ): ApprovalRequestResponse {
    const capability =
      options?.explicitCapability !== undefined
        ? options.explicitCapability
        : undefined;

    return {
      request: toApprovalRequest(request),
      approvalUrl: options?.includeApprovalUrl ? this.buildApprovalUrl(request.id) : undefined,
      capability,
      idempotentReplay: options?.idempotentReplay,
      approverAuthorization: options?.approverAuthorization,
    };
  }

  private buildApprovalUrl(requestId: string) {
    const token = this.getApprovalAccessToken(requestId);
    const baseUrl = process.env.APPROVAL_UI_BASE_URL ?? 'http://localhost:3000';
    const url = new URL(`/approval-requests/${requestId}`, baseUrl);

    url.searchParams.set('token', token);

    return url.toString();
  }

  private buildConsoleApprovalUrl(requestId: string) {
    const baseUrl = process.env.APPROVAL_UI_BASE_URL ?? 'http://localhost:3000';
    return new URL(`/console/approvals/${requestId}`, baseUrl).toString();
  }

  private getApprovalNotificationReason(request: ApprovalRequestRecord) {
    const paramsReason = this.getReasonFromParams(request.params);

    if (paramsReason) {
      return paramsReason;
    }

    const policyResult =
      request.policyResult && typeof request.policyResult === 'object'
        ? (request.policyResult as Record<string, unknown>)
        : null;

    if (policyResult && Array.isArray(policyResult.reasons)) {
      const firstReason = policyResult.reasons.find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );

      if (firstReason) {
        return firstReason;
      }
    }

    return 'Approval required for this action.';
  }

  private getReasonFromParams(params: Prisma.JsonValue) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return null;
    }

    const record = params as Record<string, unknown>;
    const candidateKeys = [
      'reason',
      'summary',
      'description',
      'justification',
      'changeSummary',
      'purpose',
    ];

    for (const key of candidateKeys) {
      const value = record[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private buildRequestedByLabel(system: string, actorId?: string | null) {
    if (actorId) {
      return `${system} · ${actorId}`;
    }

    return system;
  }

  private resolveCallbackConfiguration(
    input: CreateApprovalRequestDto,
    machinePrincipal?: MachineAuthPrincipal | null,
  ): ResolvedCallbackConfiguration {
    const legacyCallbackUrl = this.normalizeOptionalString(input.callbackUrl);
    const objectCallbackUrl = this.normalizeOptionalString(input.callback?.webhookUrl);

    if (
      legacyCallbackUrl &&
      objectCallbackUrl &&
      legacyCallbackUrl !== objectCallbackUrl
    ) {
      throw new BadRequestException(
        'callbackUrl and callback.webhookUrl must match when both are provided.',
      );
    }

    const callbackUrl = objectCallbackUrl ?? legacyCallbackUrl;
    const deliverCapabilityMode = input.callback?.deliverCapabilityMode ?? 'none';

    if (deliverCapabilityMode === 'exchange_token' && !callbackUrl) {
      throw new BadRequestException(
        'callback.webhookUrl is required when deliver_capability_mode is exchange_token.',
      );
    }

    if (deliverCapabilityMode === 'exchange_token' && !machinePrincipal) {
      throw new BadRequestException(
        'deliver_capability_mode=exchange_token requires machine-authenticated request creation.',
      );
    }

    const machineBinding =
      deliverCapabilityMode === 'exchange_token'
        ? this.resolveMachinePrincipalBinding(machinePrincipal)
        : null;

    return {
      callbackUrl,
      deliverCapabilityMode,
      machinePrincipalType: machineBinding?.type ?? null,
      machinePrincipalId: machineBinding?.id ?? null,
    };
  }

  private getMachineActorId(machinePrincipal?: MachineAuthPrincipal | null) {
    if (!machinePrincipal) {
      return null;
    }

    return machinePrincipal.serviceAccountId ?? machinePrincipal.apiKeyId;
  }

  private buildMachineAuthMetadata(machinePrincipal?: MachineAuthPrincipal | null) {
    if (!machinePrincipal) {
      return null;
    }

    return {
      apiKeyId: machinePrincipal.apiKeyId,
      apiKeyName: machinePrincipal.apiKeyName,
      keyPrefix: machinePrincipal.keyPrefix,
      serviceAccountId: machinePrincipal.serviceAccountId ?? null,
      serviceAccountName: machinePrincipal.serviceAccountName ?? null,
      scopes: machinePrincipal.scopes,
    };
  }

  private resolveMachinePrincipalBinding(machinePrincipal?: MachineAuthPrincipal | null) {
    if (!machinePrincipal) {
      return null;
    }

    if (machinePrincipal.serviceAccountId) {
      return {
        type: MachinePrincipalType.service_account,
        id: machinePrincipal.serviceAccountId,
      };
    }

    return {
      type: MachinePrincipalType.api_key,
      id: machinePrincipal.apiKeyId,
    };
  }

  private getStoredMachinePrincipalBinding(request: ApprovalRequestRecord) {
    if (!request.machinePrincipalType || !request.machinePrincipalId) {
      return null;
    }

    return {
      type: request.machinePrincipalType,
      id: request.machinePrincipalId,
    };
  }

  private async notifyOutcomeIfNeeded(outcome: TransitionOutcome) {
    if (!outcome.notificationEventType) {
      return;
    }

    const request = outcome.request;
    const requestedBy = this.buildRequestedByLabel(
      request.requestedBySystem,
      request.requestedByActorId,
    );
    const approvalUrl = this.buildApprovalUrl(request.id);
    const consoleUrl = this.buildConsoleApprovalUrl(request.id);
    const reason =
      request.status === 'expired'
        ? 'Approval request expired before a decision was recorded.'
        : request.decision?.reason?.trim() || this.getApprovalNotificationReason(request);
    const approver =
      request.decision?.approverDisplayName ||
      request.decision?.approverId ||
      null;

    if (request.status === 'approved') {
      await this.notificationService.notifyApprovalOutcome({
        organizationId: request.organizationId,
        approvalRequestId: request.id,
        outcome: 'approved',
        action: request.action,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        riskLevel: request.riskLevel,
        reason,
        approvalUrl,
        consoleUrl,
        requestedBy,
        approver,
      });
      return;
    }

    if (request.status === 'rejected') {
      await this.notificationService.notifyApprovalOutcome({
        organizationId: request.organizationId,
        approvalRequestId: request.id,
        outcome: 'rejected',
        action: request.action,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        riskLevel: request.riskLevel,
        reason,
        approvalUrl,
        consoleUrl,
        requestedBy,
        approver,
      });
      return;
    }

    if (request.status === 'expired') {
      await this.notificationService.notifyApprovalOutcome({
        organizationId: request.organizationId,
        approvalRequestId: request.id,
        outcome: 'expired',
        action: request.action,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        riskLevel: request.riskLevel,
        reason,
        approvalUrl,
        consoleUrl,
        requestedBy,
      });
    }
  }

  private getApprovalAccessToken(requestId: string) {
    const secret = process.env.APPROVAL_ACCESS_TOKEN_SECRET?.trim();

    if (!secret) {
      throw new InternalServerErrorException(
        'APPROVAL_ACCESS_TOKEN_SECRET is not configured.',
      );
    }

    return buildSignedToken({
      prefix: 'aat',
      subject: requestId,
      secret,
    });
  }

  private assertValidApprovalAccessToken(request: ApprovalRequestRecord, token: string) {
    const providedHash = Buffer.from(hashTokenValue(token), 'utf8');
    const expectedHash = Buffer.from(request.approvalAccessTokenHash, 'utf8');

    if (
      providedHash.length !== expectedHash.length ||
      !timingSafeEqual(providedHash, expectedHash)
    ) {
      throw new ForbiddenException('Invalid approval access token.');
    }
  }

  private assertValidTransition(
    currentStatus: ApprovalRequestStatus,
    targetStatus: 'approved' | 'rejected' | 'expired',
  ) {
    if (currentStatus === 'pending') {
      return;
    }

    if (TERMINAL_STATUSES.has(currentStatus)) {
      throw new ConflictException(
        `Invalid approval request transition from ${currentStatus} to ${targetStatus}.`,
      );
    }
  }

  private resolveCapabilityExpiry(referenceTime: Date): Date {
    const ttlMinutes = Number(process.env.CAPABILITY_TTL_MINUTES ?? 15);
    return new Date(referenceTime.getTime() + ttlMinutes * 60 * 1000);
  }

  private buildPasskeyDecisionInput(
    session: AuthenticatedApproverSession,
    input: SecureDecisionDto,
  ): PendingDecisionInput {
    return {
      approverId: session.approverUser.id,
      approverDisplayName: session.approverUser.displayName,
      reason: input.reason,
      authMethod: 'passkey',
      authContext: {
        approverUserId: session.approverUser.id,
        approverEmail: session.approverUser.email,
        sessionId: session.sessionId,
        sessionCreatedAt: session.createdAt.toISOString(),
        sessionExpiresAt: session.expiresAt.toISOString(),
        webauthnCredentialId: session.webauthnCredentialId,
        credentialId: session.credentialId,
      },
    };
  }

  private async getApproverAuthorizationSummary(
    request: ApprovalRequestRecord,
    approverSession?: ApproverSessionState | null,
  ): Promise<ApproverAuthorizationSummary | null> {
    if (request.status !== 'pending' || request.policyResult === null) {
      return null;
    }

    const allowedRoles = this.extractAllowedApproverRoles(request.policyResult);

    if (!approverSession?.authenticated) {
      return {
        authorized: false,
        code: 'not_authenticated',
        message:
          'Authenticate with a passkey to check whether your approver identity is authorized for this request.',
        allowedRoles,
        approverEmail: null,
        approverRole: null,
      };
    }

    return this.organizationRbacService.getApproverAuthorization(
      request.organizationId,
      approverSession.user?.email,
      allowedRoles,
    );
  }

  private async getDecisionAuthorization(
    request: ApprovalRequestRecord,
    input: PendingDecisionInput,
    prisma: PrismaDbClient,
  ): Promise<ApproverAuthorizationSummary> {
    if (input.authMethod !== 'passkey') {
      return {
        authorized: false,
        code: 'not_authenticated',
        message: 'A passkey-authenticated approval session is required to record a decision.',
        allowedRoles: this.extractAllowedApproverRoles(request.policyResult),
        approverEmail: this.extractApproverEmail(input),
        approverRole: null,
      };
    }

    return this.organizationRbacService.getApproverAuthorization(
      request.organizationId,
      this.extractApproverEmail(input),
      this.extractAllowedApproverRoles(request.policyResult),
      prisma,
    );
  }

  private async recordDeniedDecisionAttempt(input: {
    requestId: string;
    organizationId: string;
    targetStatus: 'approved' | 'rejected';
    approverId?: string | null;
    approverDisplayName?: string | null;
    authMethod?: string | null;
    authorization: ApproverAuthorizationSummary;
  }) {
    this.metricsService.increment('approva_approval_requests_denied_total');
    await this.eventChainService.recordEvent({
      organizationId: input.organizationId,
      approvalRequestId: input.requestId,
      eventType: 'approval_request.authorization_denied',
      actorType: 'human',
      actorId: input.approverId ?? undefined,
      payload: {
        approvalRequestId: input.requestId,
        attemptedDecision: input.targetStatus,
        approverId: input.approverId ?? null,
        approverDisplayName: input.approverDisplayName ?? null,
        authMethod: input.authMethod ?? null,
        authorizationCode: input.authorization.code,
        authorizationMessage: input.authorization.message,
        approverEmail: input.authorization.approverEmail ?? null,
        approverRole: input.authorization.approverRole ?? null,
        allowedApproverRoles: input.authorization.allowedRoles,
      },
    });
  }

  private extractApproverEmail(input: PendingDecisionInput) {
    if (!input.authContext || typeof input.authContext !== 'object') {
      return null;
    }

    const value = input.authContext.approverEmail;
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private buildDecisionAuthContext(
    authContext: Record<string, unknown> | null | undefined,
    authorization: ApproverAuthorizationSummary,
  ) {
    return {
      ...(authContext ?? {}),
      approverEmail: authorization.approverEmail ?? null,
      approverRole: authorization.approverRole ?? null,
      allowedApproverRoles: authorization.allowedRoles,
      authorizationCode: authorization.code,
      authorizationMessage: authorization.message,
    };
  }

  private extractAllowedApproverRoles(policyResult: Prisma.JsonValue | null) {
    if (
      !policyResult ||
      typeof policyResult !== 'object' ||
      Array.isArray(policyResult)
    ) {
      return [] as Array<'owner' | 'admin' | 'member' | 'approver'>;
    }

    const approverRoles = (policyResult as Record<string, unknown>).approverRoles;

    if (!Array.isArray(approverRoles)) {
      return [] as Array<'owner' | 'admin' | 'member' | 'approver'>;
    }

    return approverRoles.filter(
      (value): value is 'owner' | 'admin' | 'member' | 'approver' =>
        value === 'owner' ||
        value === 'admin' ||
        value === 'member' ||
        value === 'approver',
    );
  }

  private async deliverWebhookIfQueued(input: {
    webhookDeliveryId?: string;
    webhookPayload?: TerminalWebhookPayload;
  }) {
    if (!input.webhookDeliveryId || !input.webhookPayload) {
      return;
    }

    await this.webhookService.deliverQueuedDelivery(
      input.webhookDeliveryId,
      input.webhookPayload,
    );
  }

  private normalizeOptionalString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private hasExplicitOrganizationContext(input: OrganizationContextInput) {
    return Boolean(
      this.normalizeOptionalString(input.organizationId) ||
        this.normalizeOptionalString(input.organizationSlug),
    );
  }

  private normalizeInternalFilters(
    filters: InternalApprovalRequestFilters,
  ): InternalApprovalRequestFilters {
    return {
      status: filters.status,
      riskLevel: filters.riskLevel,
      actionContains: this.normalizeOptionalString(filters.actionContains) ?? undefined,
      resourceIdContains: this.normalizeOptionalString(filters.resourceIdContains) ?? undefined,
    };
  }

  private buildInternalTimeline(
    immutableEvents: ImmutableEventRecord[],
    auditEvents: AuditEventRecord[],
  ): InternalTimelineEntry[] {
    const auditQueues = new Map<
      string,
      Array<{
        actorType: string;
        actorId: string | null;
      }>
    >();

    for (const auditEvent of auditEvents) {
      const payload = this.normalizePayload(auditEvent.payload);
      const key = this.buildEventKey(auditEvent.eventType, hashCanonicalValue(payload));
      const queue = auditQueues.get(key) ?? [];

      queue.push({
        actorType: auditEvent.actorType,
        actorId: auditEvent.actorId,
      });

      auditQueues.set(key, queue);
    }

    return immutableEvents.map((immutableEvent) => {
      const payload = this.normalizePayload(immutableEvent.payload);
      const key = this.buildEventKey(immutableEvent.eventType, immutableEvent.payloadHash);
      const auditMatch = auditQueues.get(key)?.shift();

      return {
        immutableEventId: immutableEvent.id,
        eventType: immutableEvent.eventType,
        createdAt: immutableEvent.createdAt.toISOString(),
        actorType: auditMatch?.actorType ?? null,
        actorId: auditMatch?.actorId ?? null,
        payload,
        payloadHash: immutableEvent.payloadHash,
        ledgerSequence: immutableEvent.ledgerEntry?.sequence ?? null,
        ledgerEntryHash: immutableEvent.ledgerEntry?.entryHash ?? null,
      };
    });
  }

  private buildEventKey(eventType: string, payloadHash: string) {
    return `${eventType}:${payloadHash}`;
  }

  private normalizePayload(payload: unknown): Record<string, unknown> {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }

    return {
      value: payload,
    };
  }

  private async runSerializableTransaction<T>(
    operation: (prisma: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isRetryableTransactionError(error) || attempt === maxAttempts) {
          throw error;
        }
      }
    }

    throw new ConflictException('Transaction retry limit exceeded.');
  }

  private isRetryableTransactionError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2034'
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
