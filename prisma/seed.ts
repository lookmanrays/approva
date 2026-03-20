import { PrismaClient } from '@prisma/client';
import {
  buildSignedToken,
  hashCanonicalValue,
  hashTokenValue,
} from '../apps/api/src/common/utils/hash.util';
import { computeLedgerEntryHash } from '../apps/api/src/common/utils/ledger-hash.util';

const prisma = new PrismaClient();
const SEED_APPROVER_EMAIL = 'approver@example.com';
const SEED_APPROVER_NAME = 'Jordan Vale';
const SEED_APPROVAL_REQUEST_ID = '00000000-0000-4000-8000-000000000001';
const SEED_EXTERNAL_REQUEST_ID = 'seed-ext-approval-request';
const SEED_REQUESTED_BY_SYSTEM = 'seed-script';
const SEED_REQUESTED_BY_ACTOR_ID = 'seed-user';
const SEED_IDEMPOTENCY_KEY = 'seed-approval-request';
const SEED_APPROVAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function main() {
  const defaultOrganizationName =
    process.env.APPROVA_DEFAULT_ORGANIZATION_NAME ??
    process.env.AUTHON_DEFAULT_ORGANIZATION_NAME ?? 'Default Organization';
  const defaultOrganizationSlug =
    process.env.APPROVA_DEFAULT_ORGANIZATION_SLUG ??
    process.env.AUTHON_DEFAULT_ORGANIZATION_SLUG ?? 'default';
  const localOperatorEmail =
    process.env.APPROVA_LOCAL_OPERATOR_EMAIL?.trim().toLowerCase() ||
    process.env.AUTHON_LOCAL_OPERATOR_EMAIL?.trim().toLowerCase() ||
    'operator@local.approva';
  const localOperatorName =
    process.env.APPROVA_LOCAL_OPERATOR_NAME?.trim() ||
    process.env.AUTHON_LOCAL_OPERATOR_NAME?.trim() ||
    'Local operator';

  const organization = await prisma.organization.upsert({
    where: {
      slug: defaultOrganizationSlug,
    },
    update: {
      name: defaultOrganizationName,
    },
    create: {
      name: defaultOrganizationName,
      slug: defaultOrganizationSlug,
    },
  });

  const localOperator = await prisma.user.upsert({
    where: {
      email: localOperatorEmail,
    },
    update: {
      name: localOperatorName,
    },
    create: {
      email: localOperatorEmail,
      name: localOperatorName,
    },
  });

  const localOperatorApprover = await prisma.approverUser.upsert({
    where: {
      email: localOperatorEmail,
    },
    update: {
      displayName: localOperatorName,
      status: 'active',
    },
    create: {
      email: localOperatorEmail,
      displayName: localOperatorName,
      status: 'active',
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: localOperator.id,
      },
    },
    update: {
      role: 'owner',
    },
    create: {
      organizationId: organization.id,
      userId: localOperator.id,
      role: 'owner',
    },
  });

  const sampleApproverUserRecord = await prisma.user.upsert({
    where: {
      email: SEED_APPROVER_EMAIL,
    },
    update: {
      name: SEED_APPROVER_NAME,
    },
    create: {
      email: SEED_APPROVER_EMAIL,
      name: SEED_APPROVER_NAME,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: sampleApproverUserRecord.id,
      },
    },
    update: {
      role: 'approver',
    },
    create: {
      organizationId: organization.id,
      userId: sampleApproverUserRecord.id,
      role: 'approver',
    },
  });

  const approverUser = await prisma.approverUser.upsert({
    where: {
      email: SEED_APPROVER_EMAIL,
    },
    update: {
      displayName: SEED_APPROVER_NAME,
      status: 'active',
    },
    create: {
      email: SEED_APPROVER_EMAIL,
      displayName: SEED_APPROVER_NAME,
      status: 'active',
    },
  });

  const defaultPolicies = [
    {
      action: '*',
      resourceType: '*',
      riskLevel: 'high' as const,
      approvalRequired: true,
      approverRoles: ['owner', 'admin', 'approver'] as const,
    },
    {
      action: '*',
      resourceType: '*',
      riskLevel: 'critical' as const,
      approvalRequired: true,
      approverRoles: ['owner', 'admin', 'approver'] as const,
    },
  ];

  for (const policy of defaultPolicies) {
    const existingPolicy = await prisma.policy.findFirst({
      where: {
        organizationId: organization.id,
        action: policy.action,
        resourceType: policy.resourceType,
        riskLevel: policy.riskLevel,
      },
      select: {
        id: true,
      },
    });

    if (existingPolicy) {
      await prisma.policy.update({
        where: {
          id: existingPolicy.id,
        },
        data: {
          approvalRequired: policy.approvalRequired,
          approverRoles: [...policy.approverRoles],
        },
      });
    } else {
      await prisma.policy.create({
        data: {
          organizationId: organization.id,
          action: policy.action,
          resourceType: policy.resourceType,
          riskLevel: policy.riskLevel,
          approvalRequired: policy.approvalRequired,
          approverRoles: [...policy.approverRoles],
        },
      });
    }
  }

  const seededApproval = await ensureSeedApprovalRequest(organization.id);

  console.log(
    `Seeded approval request: ${seededApproval.approvalRequest.id} (${seededApproval.created ? 'created' : 'existing'})`,
  );
  console.log(`Approval URL: ${seededApproval.approvalUrl}`);
  console.log(`Local operator approver: ${localOperatorApprover.email} (${localOperatorApprover.displayName})`);
  console.log(`Sample approver user: ${approverUser.email} (${approverUser.displayName})`);
  if (seededApproval.note) {
    console.log(`Seed note: ${seededApproval.note}`);
  }
  console.log(
    'Next step: open the approval URL, register a passkey for the sample approver, then approve or reject.',
  );
}

async function ensureSeedApprovalRequest(organizationId: string) {
  const params = {
    environment: 'production',
    service: 'payments-worker',
    version: '2026.03.18',
  };
  const expiresAt = new Date(Date.now() + SEED_APPROVAL_TTL_MS);
  const existingRequest = await prisma.approvalRequest.findFirst({
    where: {
      organizationId,
      requestedBySystem: SEED_REQUESTED_BY_SYSTEM,
      externalRequestId: SEED_EXTERNAL_REQUEST_ID,
    },
    select: {
      id: true,
      status: true,
      action: true,
      expiresAt: true,
    },
  });
  const approvalRequestId = existingRequest?.id ?? SEED_APPROVAL_REQUEST_ID;
  const approvalAccessToken = buildSignedToken({
    prefix: 'aat',
    subject: approvalRequestId,
    secret: getRequiredEnv('APPROVAL_ACCESS_TOKEN_SECRET'),
  });

  if (existingRequest) {
    return {
      approvalRequest: existingRequest,
      approvalUrl: buildApprovalUrl(existingRequest.id, approvalAccessToken),
      created: false,
      note: buildExistingSeedNote(existingRequest),
    };
  }

  const approvalRequest = await prisma.approvalRequest.create({
    data: {
      organizationId,
      id: approvalRequestId,
      externalRequestId: SEED_EXTERNAL_REQUEST_ID,
      requestedBySystem: SEED_REQUESTED_BY_SYSTEM,
      requestedByActorId: SEED_REQUESTED_BY_ACTOR_ID,
      idempotencyKey: SEED_IDEMPOTENCY_KEY,
      requestFingerprintHash: hashCanonicalValue({
        externalRequestId: SEED_EXTERNAL_REQUEST_ID,
        requestedBy: {
          system: SEED_REQUESTED_BY_SYSTEM,
          actorId: SEED_REQUESTED_BY_ACTOR_ID,
        },
        action: 'deploy production release',
        riskLevel: 'high',
        resource: {
          type: 'service',
          id: 'payments-worker',
        },
        params,
        callbackUrl: null,
        expiresAt: expiresAt.toISOString(),
      }),
      approvalAccessTokenHash: hashTokenValue(approvalAccessToken),
      action: 'deploy production release',
      resourceType: 'service',
      resourceId: 'payments-worker',
      params,
      paramsHash: hashCanonicalValue(params),
      riskLevel: 'high',
      status: 'pending',
      callbackUrl: null,
      policyResult: {
        decision: 'approval_required',
        requiresApproval: true,
        matchedRules: ['policy.seed-default-high-risk'],
        reasons: [
          'Risk level high requires approval.',
          'Matched the seeded default high-risk approval policy.',
        ],
        evaluatedAt: new Date().toISOString(),
        matchedPolicyId: null,
        approverRoles: ['owner', 'admin', 'approver'],
      },
      expiresAt,
    },
    select: {
      id: true,
      status: true,
      action: true,
      expiresAt: true,
    },
  });

  await appendSeedApprovalEvents(organizationId, approvalRequest.id, approvalRequest.action);

  return {
    approvalRequest,
    approvalUrl: buildApprovalUrl(approvalRequest.id, approvalAccessToken),
    created: true,
    note: null,
  };
}

async function appendSeedApprovalEvents(
  organizationId: string,
  approvalRequestId: string,
  action: string,
) {
  const createdPayload = {
    approvalRequestId,
    status: 'pending',
    action,
  };
  const pendingPayload = {
    approvalRequestId,
    status: 'pending',
    notification: 'pending_approval_stubbed',
  };
  const immutableCreated = await prisma.immutableEvent.create({
    data: {
      organizationId,
      approvalRequestId,
      eventType: 'approval_request.created',
      payload: createdPayload,
      payloadHash: hashCanonicalValue(createdPayload),
    },
  });

  await prisma.auditEvent.createMany({
    data: [
      {
        organizationId,
        approvalRequestId,
        eventType: 'approval_request.created',
        actorType: 'system',
        actorId: SEED_REQUESTED_BY_SYSTEM,
        payload: createdPayload,
      },
      {
        organizationId,
        approvalRequestId,
        eventType: 'approval_request.pending',
        actorType: 'system',
        actorId: SEED_REQUESTED_BY_SYSTEM,
        payload: pendingPayload,
      },
    ],
  });

  await appendLedgerEntry(
    organizationId,
    immutableCreated.id,
    immutableCreated.eventType,
    immutableCreated.payloadHash,
  );

  const immutablePending = await prisma.immutableEvent.create({
    data: {
      organizationId,
      approvalRequestId,
      eventType: 'approval_request.pending',
      payload: pendingPayload,
      payloadHash: hashCanonicalValue(pendingPayload),
    },
  });

  await appendLedgerEntry(
    organizationId,
    immutablePending.id,
    immutablePending.eventType,
    immutablePending.payloadHash,
  );
}

async function appendLedgerEntry(
  organizationId: string,
  immutableEventId: string,
  eventType: string,
  payloadHash: string,
) {
  const previousEntry = await prisma.ledgerEntry.findFirst({
    where: {
      organizationId,
    },
    orderBy: {
      sequence: 'desc',
    },
    select: {
      sequence: true,
      entryHash: true,
    },
  });
  const createdAt = new Date();
  const sequence = (previousEntry?.sequence ?? 0) + 1;
  const previousHash = previousEntry?.entryHash ?? null;
  const entryHash = computeLedgerEntryHash({
    previousHash,
    immutableEventSeq: sequence,
    eventType,
    payloadHash,
    createdAt,
  });

  await prisma.ledgerEntry.create({
    data: {
      organizationId,
      immutableEventId,
      sequence,
      previousHash,
      entryHash,
      createdAt,
    },
  });
}

function buildApprovalUrl(approvalRequestId: string, approvalAccessToken: string) {
  const approvalUrl = new URL(
    `/approval-requests/${approvalRequestId}`,
    process.env.APPROVAL_UI_BASE_URL ?? 'http://localhost:3000',
  );
  approvalUrl.searchParams.set('token', approvalAccessToken);

  return approvalUrl.toString();
}

function buildExistingSeedNote(input: {
  status: string;
  expiresAt: Date;
}) {
  if (input.status !== 'pending') {
    return `The sample approval request is already ${input.status}. Create a fresh request from the console if you want to walk the flow again.`;
  }

  if (input.expiresAt.getTime() <= Date.now()) {
    return 'The existing sample approval request has expired. Start a fresh request from the console if you want to test approval again.';
  }

  return 'Reused the existing sample approval request.';
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured before running prisma/seed.ts.`);
  }

  return value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
