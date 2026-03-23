import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { hashTokenValue } from '../src/common/utils/hash.util';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

describe('Approva E2E', () => {
  let app: INestApplication;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set to run e2e tests.');
    }

    process.env.APPROVAL_UI_BASE_URL = 'http://localhost:3000';
    process.env.APPROVAL_ACCESS_TOKEN_SECRET = 'test-approval-access-secret';
    process.env.WEBHOOK_SIGNING_SECRET = 'test-webhook-signing-secret';
    process.env.CAPABILITY_TTL_MINUTES = '30';
    process.env.APPROVA_RATE_LIMIT_ENABLED = 'false';
    process.env.APPROVA_INTEGRATION_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response('ok', { status: 200 }));

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.use(cookieParser());

    await app.init();
  });

  afterEach(async () => {
    fetchMock.mockClear();
    await truncateAllTables();
  });

  afterAll(async () => {
    fetchMock.mockRestore();
    await app.close();
    await prisma.$disconnect();
  });

  it('creates a pending request for a high-risk action and returns a secure approval URL', async () => {
    const response = await createApprovalRequest(app, {
      externalRequestId: 'ext-high-risk',
      requestedBy: { system: 'risk-engine' },
      action: 'deploy production release',
      riskLevel: 'high',
      resource: { type: 'service', id: 'payments-worker' },
      params: { environment: 'production' },
    });

    expect(response.status).toBe(201);
    expect(response.body.request.status).toBe('pending');
    expect(response.body.approvalUrl).toContain('/approval-requests/');
    expect(response.body.approvalUrl).toContain('token=');
  });

  it('approves a pending request using the approval access token and issues a capability', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-approve',
      requestedBy: { system: 'risk-engine' },
      action: 'transfer treasury funds',
      riskLevel: 'critical',
      resource: { type: 'wallet', id: 'treasury' },
      params: { amount: 2500, currency: 'USD' },
    });

    const { requestId, token } = parseApprovalUrl(createResponse.body.approvalUrl);

    const secureView = await request(app.getHttpServer()).get(
      `/v1/approval-requests/${requestId}/secure-view?token=${encodeURIComponent(token)}`,
    );

    expect(secureView.status).toBe(200);
    expect(secureView.body.request.id).toBe(requestId);
    const approverSession = await createApproverSession({
      email: 'reviewer_001@example.com',
      displayName: 'Jordan Vale',
    });

    const approveResponse = await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-approve?token=${encodeURIComponent(token)}`)
      .set('Cookie', approverSession.cookie)
      .send({
        reason: 'Deployment checklist reviewed.',
      });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.request.status).toBe('approved');
    expect(approveResponse.body.capability.token).toMatch(/^cap_[0-9A-Za-z]{32}$/);
  });

  it('rejects a pending request', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-reject',
      requestedBy: { system: 'refund-engine' },
      action: 'refund invoice',
      riskLevel: 'high',
      resource: { type: 'invoice', id: 'inv_123' },
      params: { amount: 4999 },
    });
    const { requestId, token } = parseApprovalUrl(createResponse.body.approvalUrl);
    const approverSession = await createApproverSession({
      email: 'reviewer_002@example.com',
      displayName: 'Avery Stone',
    });

    const rejectResponse = await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-reject?token=${encodeURIComponent(token)}`)
      .set('Cookie', approverSession.cookie)
      .send({
        reason: 'Threshold exceeded.',
      });

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.request.status).toBe('rejected');
  });

  it('auto-approves a low-risk request and issues a capability', async () => {
    const response = await createApprovalRequest(app, {
      externalRequestId: 'ext-auto',
      requestedBy: { system: 'read-model-sync' },
      action: 'sync customer cache',
      riskLevel: 'low',
      resource: { type: 'cache', id: 'customer-summary' },
      params: { region: 'us-east-1' },
    });

    expect(response.status).toBe(201);
    expect(response.body.request.status).toBe('auto_approved');
    expect(response.body.capability.token).toMatch(/^cap_[0-9A-Za-z]{32}$/);
  });

  it('records capability usage in audit, immutable log, and ledger', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-capability-use',
      requestedBy: { system: 'ops-agent' },
      action: 'transfer treasury funds',
      riskLevel: 'critical',
      resource: { type: 'wallet', id: 'ops-wallet' },
      params: { amount: 500, currency: 'USD' },
    });
    const { requestId, token } = parseApprovalUrl(createResponse.body.approvalUrl);
    const approverSession = await createApproverSession({
      email: 'reviewer_use_001@example.com',
      displayName: 'Riley Chen',
    });

    const approveResponse = await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-approve?token=${encodeURIComponent(token)}`)
      .set('Cookie', approverSession.cookie)
      .send({});

    const capabilityToken = approveResponse.body.capability.token;
    expect(capabilityToken).toMatch(/^cap_[0-9A-Za-z]{32}$/);

    const useResponse = await request(app.getHttpServer())
      .post('/v1/capabilities/use')
      .send({
        token: capabilityToken,
        action: 'transfer treasury funds',
        resource: { type: 'wallet', id: 'ops-wallet' },
        params: { amount: 500, currency: 'USD' },
      });

    expect(useResponse.status).toBe(200);
    expect(useResponse.body.valid).toBe(true);
    expect(useResponse.body.approvalRequestId).toBe(requestId);

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        approvalRequestId: requestId,
        eventType: 'capability.used',
      },
    });
    expect(auditEvents).toHaveLength(1);

    const immutableEvents = await prisma.immutableEvent.findMany({
      where: {
        approvalRequestId: requestId,
        eventType: 'capability.used',
      },
    });
    expect(immutableEvents).toHaveLength(1);

    const ledgerEntry = await prisma.ledgerEntry.findUnique({
      where: {
        immutableEventId: immutableEvents[0].id,
      },
    });
    expect(ledgerEntry).not.toBeNull();
  });

  it('delivers a one-time capability exchange token and exchanges it for machine continuation', async () => {
    const machine = await createMachineAuthContext();
    const callbackUrl = 'https://example.com/hooks/exchange';
    const createResponse = await request(app.getHttpServer())
      .post('/v1/approval-requests')
      .set('Authorization', `Bearer ${machine.rawKey}`)
      .send({
        externalRequestId: 'ext-machine-exchange',
        requestedBy: {
          system: 'deploy-agent',
          actorId: 'run-machine-001',
        },
        action: 'deployment.execute',
        riskLevel: 'high',
        resource: {
          type: 'service',
          id: 'billing-api',
        },
        params: {
          environment: 'production',
          version: '2026.03.16-demo',
          region: 'eu-west-1',
        },
        callback: {
          webhookUrl: callbackUrl,
          deliverCapabilityMode: 'exchange_token',
        },
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.request.status).toBe('pending');

    const approvalRequestId = createResponse.body.request.id as string;
    const { token } = parseApprovalUrl(createResponse.body.approvalUrl);
    const approverSession = await createApproverSession({
      email: 'ops-reviewer@example.com',
      displayName: 'Ops Reviewer',
      organizationId: machine.organizationId,
    });
    const approveResponse = await request(app.getHttpServer())
      .post(
        `/v1/approval-requests/${approvalRequestId}/secure-approve?token=${encodeURIComponent(token)}`,
      )
      .set('Cookie', approverSession.cookie)
      .send({
        reason: 'Reviewed for production release.',
      });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.request.status).toBe('approved');
    expect(fetchMock).toHaveBeenCalled();

    const [, init] = fetchMock.mock.calls[0];
    const webhookBody = JSON.parse(String(init?.body)) as {
      eventType: string;
      payload: {
        capabilityExchangeToken?: string;
        capabilityExchangeExpiresAt?: string;
        capabilityId?: string;
      };
    };

    expect(webhookBody.eventType).toBe('approval_request.approved');
    expect(webhookBody.payload.capabilityId).toBeTruthy();
    expect(webhookBody.payload.capabilityExchangeToken).toMatch(/^cex_[0-9A-Za-z]{32}$/);
    expect(webhookBody.payload.capabilityExchangeExpiresAt).toBeTruthy();

    const exchangeToken = webhookBody.payload.capabilityExchangeToken as string;
    const exchangeResponse = await request(app.getHttpServer())
      .post('/v1/capabilities/exchange')
      .set('Authorization', `Bearer ${machine.rawKey}`)
      .send({
        exchangeToken,
      });

    expect(exchangeResponse.status).toBe(200);
    expect(exchangeResponse.body.capabilityToken).toMatch(/^cap_[0-9A-Za-z]{32}$/);
    expect(exchangeResponse.body.scope.action).toBe('deployment.execute');
    expect(exchangeResponse.body.scope.resource.id).toBe('billing-api');

    const secondExchangeResponse = await request(app.getHttpServer())
      .post('/v1/capabilities/exchange')
      .set('Authorization', `Bearer ${machine.rawKey}`)
      .send({
        exchangeToken,
      });

    expect(secondExchangeResponse.status).toBe(409);

    const useResponse = await request(app.getHttpServer())
      .post('/v1/capabilities/use')
      .set('Authorization', `Bearer ${machine.rawKey}`)
      .send({
        token: exchangeResponse.body.capabilityToken,
        action: 'deployment.execute',
        resource: {
          type: 'service',
          id: 'billing-api',
        },
        params: {
          environment: 'production',
          version: '2026.03.16-demo',
          region: 'eu-west-1',
        },
      });

    expect(useResponse.status).toBe(200);
    expect(useResponse.body.valid).toBe(true);

    const exchangeEvents = await prisma.auditEvent.findMany({
      where: {
        approvalRequestId,
        eventType: 'capability.exchanged',
      },
    });

    expect(exchangeEvents).toHaveLength(1);
  });

  it('deduplicates create requests by idempotency key', async () => {
    const payload = {
      externalRequestId: 'ext-idempotent',
      requestedBy: { system: 'billing-worker' },
      action: 'deploy production release',
      riskLevel: 'high',
      resource: { type: 'service', id: 'billing-api' },
      params: { version: '2026.03.15' },
    };

    const first = await createApprovalRequest(app, payload, 'idem-123');
    const second = await createApprovalRequest(app, payload, 'idem-123');

    expect(first.body.request.id).toBe(second.body.request.id);
    expect(second.body.idempotentReplay).toBe(true);
    expect(second.body.approvalUrl).toBe(first.body.approvalUrl);
  });

  it('deduplicates create requests by external_request_id and requested_by.system', async () => {
    const payload = {
      externalRequestId: 'ext-dedupe',
      requestedBy: { system: 'ops-agent' },
      action: 'execute background task',
      riskLevel: 'high',
      resource: { type: 'job', id: 'backfill' },
      params: { date: '2026-03-15' },
    };

    const first = await createApprovalRequest(app, payload);
    const second = await createApprovalRequest(app, payload);

    expect(first.body.request.id).toBe(second.body.request.id);
    expect(second.body.idempotentReplay).toBe(true);
  });

  it('rejects an invalid double approve transition', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-double-approve',
      requestedBy: { system: 'release-bot' },
      action: 'deploy production release',
      riskLevel: 'critical',
      resource: { type: 'service', id: 'api-gateway' },
      params: { release: '42' },
    });
    const { requestId, token } = parseApprovalUrl(createResponse.body.approvalUrl);
    const approverSession = await createApproverSession({
      email: 'reviewer_003@example.com',
      displayName: 'Kai Morgan',
    });

    const firstApprove = await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-approve?token=${encodeURIComponent(token)}`)
      .set('Cookie', approverSession.cookie)
      .send({});

    expect(firstApprove.status).toBe(200);

    const secondApprove = await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-approve?token=${encodeURIComponent(token)}`)
      .set('Cookie', approverSession.cookie)
      .send({});

    expect(secondApprove.status).toBe(409);
  });

  it('expires overdue pending requests via the expiration sweep endpoint', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-expire',
      requestedBy: { system: 'ops-agent' },
      action: 'delete customer data',
      riskLevel: 'high',
      resource: { type: 'customer', id: 'cust_123' },
      params: { hardDelete: true },
      callbackUrl: 'https://example.com/hooks/approval',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const { requestId } = parseApprovalUrl(createResponse.body.approvalUrl);

    const sweep = await request(app.getHttpServer()).post(
      '/v1/approval-requests/internal/expire-sweep?limit=10',
    );

    expect(sweep.status).toBe(200);
    expect(sweep.body.expiredCount).toBe(1);
    expect(sweep.body.expiredIds).toContain(requestId);

    const requestDetails = await request(app.getHttpServer()).get(
      `/v1/approval-requests/${requestId}`,
    );

    expect(requestDetails.body.request.status).toBe('expired');
  });

  it('rejects approval of an expired request', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-expired-approve',
      requestedBy: { system: 'ops-agent' },
      action: 'execute production command',
      riskLevel: 'high',
      resource: { type: 'command', id: 'cmd_123' },
      params: { dryRun: false },
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const { requestId, token } = parseApprovalUrl(createResponse.body.approvalUrl);
    const approverSession = await createApproverSession({
      email: 'reviewer_004@example.com',
      displayName: 'Morgan Reed',
    });

    await request(app.getHttpServer()).post('/v1/approval-requests/internal/expire-sweep');

    const approveResponse = await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-approve?token=${encodeURIComponent(token)}`)
      .set('Cookie', approverSession.cookie)
      .send({});

    expect(approveResponse.status).toBe(409);
  });

  it('includes webhook signature headers on delivery', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-webhook',
      requestedBy: { system: 'ops-agent' },
      action: 'transfer treasury funds',
      riskLevel: 'critical',
      resource: { type: 'wallet', id: 'ops-treasury' },
      params: { amount: 999 },
      callbackUrl: 'https://example.com/hooks/approval',
    });
    const { requestId, token } = parseApprovalUrl(createResponse.body.approvalUrl);
    const approverSession = await createApproverSession({
      email: 'reviewer_005@example.com',
      displayName: 'Parker Lee',
    });

    await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-approve?token=${encodeURIComponent(token)}`)
      .set('Cookie', approverSession.cookie)
      .send({});

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);

    expect(headers.get('x-approval-signature')).toMatch(/^v1=/);
    expect(headers.get('x-approval-timestamp')).toBeTruthy();
  });

  it('fails capability verification on action, resource, and params mismatches', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-verify',
      requestedBy: { system: 'ops-agent' },
      action: 'transfer treasury funds',
      riskLevel: 'critical',
      resource: { type: 'wallet', id: 'team-wallet' },
      params: { amount: 100, currency: 'USD' },
    });
    const { requestId, token } = parseApprovalUrl(createResponse.body.approvalUrl);
    const approverSession = await createApproverSession({
      email: 'reviewer_006@example.com',
      displayName: 'Devon Hart',
    });

    const approveResponse = await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-approve?token=${encodeURIComponent(token)}`)
      .set('Cookie', approverSession.cookie)
      .send({});

    const capabilityToken = approveResponse.body.capability.token;

    const actionMismatch = await request(app.getHttpServer())
      .post('/v1/capabilities/verify')
      .send({
        token: capabilityToken,
        action: 'transfer different funds',
        resource: { type: 'wallet', id: 'team-wallet' },
        params: { amount: 100, currency: 'USD' },
      });

    expect(actionMismatch.body.valid).toBe(false);
    expect(actionMismatch.body.invalidReason.code).toBe('action_mismatch');

    const resourceMismatch = await request(app.getHttpServer())
      .post('/v1/capabilities/verify')
      .send({
        token: capabilityToken,
        action: 'transfer treasury funds',
        resource: { type: 'wallet', id: 'different-wallet' },
        params: { amount: 100, currency: 'USD' },
      });

    expect(resourceMismatch.body.valid).toBe(false);
    expect(resourceMismatch.body.invalidReason.code).toBe('resource_id_mismatch');

    const paramsMismatch = await request(app.getHttpServer())
      .post('/v1/capabilities/verify')
      .send({
        token: capabilityToken,
        action: 'transfer treasury funds',
        resource: { type: 'wallet', id: 'team-wallet' },
        params: { amount: 101, currency: 'USD' },
      });

    expect(paramsMismatch.body.valid).toBe(false);
    expect(paramsMismatch.body.invalidReason.code).toBe('params_mismatch');
  });

  it('rejects secure approval when the approval token is present but no approver session exists', async () => {
    const createResponse = await createApprovalRequest(app, {
      externalRequestId: 'ext-no-session',
      requestedBy: { system: 'ops-agent' },
      action: 'deploy production release',
      riskLevel: 'high',
      resource: { type: 'service', id: 'edge-api' },
      params: { release: '55' },
    });
    const { requestId, token } = parseApprovalUrl(createResponse.body.approvalUrl);

    const approveResponse = await request(app.getHttpServer())
      .post(`/v1/approval-requests/${requestId}/secure-approve?token=${encodeURIComponent(token)}`)
      .send({});

    expect(approveResponse.status).toBe(401);
  });
});

async function createApprovalRequest(
  app: INestApplication,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const builder = request(app.getHttpServer());
  return idempotencyKey
    ? builder.post('/v1/approval-requests').set('Idempotency-Key', idempotencyKey).send(payload)
    : builder.post('/v1/approval-requests').send(payload);
}

function parseApprovalUrl(approvalUrl: string) {
  const parsed = new URL(approvalUrl);
  const token = parsed.searchParams.get('token');
  const requestId = parsed.pathname.split('/').pop();

  if (!token || !requestId) {
    throw new Error(`Invalid approval URL: ${approvalUrl}`);
  }

  return { requestId, token };
}

async function truncateAllTables() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "capability_exchange_tokens",
      "webhook_deliveries",
      "ledger_entries",
      "immutable_events",
      "audit_events",
      "organization_api_keys",
      "service_accounts",
      "organization_members",
      "approver_sessions",
      "webauthn_credentials",
      "approver_users",
      "capabilities",
      "approval_decisions",
      "approval_requests",
      "users",
      "organizations"
    RESTART IDENTITY CASCADE
  `);
}

async function createMachineAuthContext() {
  const slug = `org-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const organization = await prisma.organization.create({
    data: {
      name: `Org ${slug}`,
      slug,
    },
  });
  await prisma.policy.createMany({
    data: [
      {
        organizationId: organization.id,
        action: '*',
        resourceType: '*',
        riskLevel: 'high',
        approvalRequired: true,
        approverRoles: ['approver'],
      },
      {
        organizationId: organization.id,
        action: '*',
        resourceType: '*',
        riskLevel: 'critical',
        approvalRequired: true,
        approverRoles: ['approver'],
      },
    ],
  });
  const rawKey = `approva_sk_${randomUUID().replace(/-/g, '').slice(0, 32)}`;
  const apiKey = await prisma.organizationApiKey.create({
    data: {
      organizationId: organization.id,
      name: 'Machine test key',
      keyPrefix: rawKey.slice(0, 22),
      keyHash: hashTokenValue(rawKey),
      scopes: [
        'approval_requests_create',
        'approval_requests_read',
        'capabilities_verify',
        'capabilities_use',
      ],
    },
  });

  return {
    organizationId: organization.id,
    apiKeyId: apiKey.id,
    rawKey,
  };
}

async function createApproverSession(input: {
  email: string;
  displayName: string;
  organizationId?: string;
}) {
  const organizationId =
    input.organizationId ??
    (
      await prisma.organization.findFirstOrThrow({
        where: {
          slug: 'default',
        },
        select: {
          id: true,
        },
      })
    ).id;
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.displayName,
    },
  });
  await prisma.organizationMember.create({
    data: {
      organizationId,
      userId: user.id,
      role: 'approver',
    },
  });
  const approverUser = await prisma.approverUser.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      status: 'active',
    },
  });
  const credential = await prisma.webauthnCredential.create({
    data: {
      approverUserId: approverUser.id,
      credentialId: `cred_${randomUUID()}`,
      publicKey: Buffer.from('test-public-key'),
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
    },
  });
  const sessionToken = `aps_${randomUUID().replace(/-/g, '')}`;
  const session = await prisma.approverSession.create({
    data: {
      approverUserId: approverUser.id,
      webauthnCredentialId: credential.id,
      sessionTokenHash: hashTokenValue(sessionToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return {
    user: approverUser,
    session,
    cookie: [`approva_approver_session=${sessionToken}`],
  };
}
