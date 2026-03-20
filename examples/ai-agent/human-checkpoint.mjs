#!/usr/bin/env node

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { verifyApprovaWebhookSignature } from './webhook-signature.mjs';

const APPROVA_BASE_URL = (
  process.env.APPROVA_BASE_URL ??
  process.env.AUTHON_BASE_URL ??
  'http://localhost:4000'
).replace(/\/$/, '');
const APPROVA_API_KEY = process.env.APPROVA_API_KEY ?? process.env.AUTHON_API_KEY ?? '';
const WEBHOOK_SIGNING_SECRET =
  process.env.WEBHOOK_SIGNING_SECRET ?? 'change-me-webhook';
const PORT = Number(process.env.AI_AGENT_PORT ?? 4300);
const AGENT_PUBLIC_BASE_URL =
  process.env.AI_AGENT_PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;
const WEBHOOK_TIMEOUT_MS = Number(
  process.env.APPROVA_WEBHOOK_TIMEOUT_MS ??
    process.env.AUTHON_WEBHOOK_TIMEOUT_MS ??
    15 * 60 * 1000,
);

if (!APPROVA_API_KEY) {
  console.error(
    'APPROVA_API_KEY is required. AUTHON_API_KEY is still accepted as a backward-compatible alias.',
  );
  process.exit(1);
}

const requestBody = {
  requestedBy: {
    system: 'ai-agent-example',
    actorId: 'official-agent-flow',
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
    reason: 'Deploy build 2026.03.16 through the official Approva AI-agent example.',
  },
  callback: {
    webhookUrl: new URL('/webhooks/approva', AGENT_PUBLIC_BASE_URL).toString(),
    deliverCapabilityMode: 'exchange_token',
  },
};

const headers = {
  Authorization: `Bearer ${APPROVA_API_KEY}`,
  'Content-Type': 'application/json',
};

const decisionPromise = createDecisionWaiter();
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      writeJson(response, 200, {
        ok: true,
        callbackUrl: requestBody.callback.webhookUrl,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/webhooks/approva') {
      const rawBody = await readBody(request);
      const verification = verifyApprovaWebhookSignature({
        rawBody,
        signatureHeader: headerValue(request.headers['x-approval-signature']),
        timestampHeader: headerValue(request.headers['x-approval-timestamp']),
        secret: WEBHOOK_SIGNING_SECRET,
      });

      if (!verification.valid) {
        writeJson(response, 401, {
          ok: false,
          reason: verification.reason,
        });
        return;
      }

      const event = JSON.parse(rawBody);
      decisionPromise.resolve(event);

      writeJson(response, 200, {
        ok: true,
      });
      return;
    }

    writeJson(response, 404, {
      ok: false,
      reason: 'Not found.',
    });
  } catch (error) {
    writeJson(response, 500, {
      ok: false,
      reason: error instanceof Error ? error.message : 'Unknown server error.',
    });
  }
});

await new Promise((resolve) => server.listen(PORT, resolve));

console.log('Approva AI agent example');
console.log(`API: ${APPROVA_BASE_URL}`);
console.log(`Webhook listener: ${requestBody.callback.webhookUrl}`);
console.log('');

const created = await requestJson('/v1/approval-requests', {
  method: 'POST',
  headers: {
    ...headers,
    'Idempotency-Key': `ai-agent-${randomUUID()}`,
  },
  body: JSON.stringify(requestBody),
});

console.log('Approval request created');
console.log(`Request ID: ${created.request.id}`);
console.log(`Status: ${created.request.status}`);

if (created.approvalUrl) {
  console.log(`Approval URL: ${created.approvalUrl}`);
}

if (created.request.status === 'auto_approved' && created.capability?.token) {
  console.log('Request auto-approved. Using returned capability immediately.');
  await useCapabilityAndContinue(created.capability.token);
  await shutdown(0);
}

if (created.request.status !== 'pending') {
  console.log(`Request ended immediately in status: ${created.request.status}`);
  await shutdown(0);
}

console.log('Waiting for signed Approva webhook...');

const decisionEvent = await waitForDecisionEvent();
console.log(`Received event: ${decisionEvent.eventType}`);

if (decisionEvent.eventType === 'approval_request.rejected') {
  console.log('Human approver rejected the request. Protected action will not continue.');
  await shutdown(0);
}

if (decisionEvent.eventType === 'approval_request.expired') {
  console.log('Approval request expired. Protected action will not continue.');
  await shutdown(0);
}

const exchangeToken =
  typeof decisionEvent.payload?.capabilityExchangeToken === 'string'
    ? decisionEvent.payload.capabilityExchangeToken
    : null;

if (!exchangeToken) {
  console.error(
    'Approved webhook did not include a capability exchange token. Ensure deliverCapabilityMode=exchange_token is configured.',
  );
  await shutdown(1);
}

console.log('Exchanging one-time capability delivery token...');

const exchanged = await requestJson('/v1/capabilities/exchange', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    exchangeToken,
  }),
});

console.log(`Capability expires at: ${exchanged.expiresAt}`);
await useCapabilityAndContinue(exchanged.capabilityToken);
await shutdown(0);

async function useCapabilityAndContinue(capabilityToken) {
  console.log('Using capability...');

  const useResult = await requestJson('/v1/capabilities/use', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      token: capabilityToken,
      action: requestBody.action,
      resource: requestBody.resource,
      params: requestBody.params,
    }),
  });

  if (!useResult.valid) {
    throw new Error(useResult.invalidReason ?? 'Capability use failed.');
  }

  console.log(`Capability accepted for approval request ${useResult.approvalRequestId}.`);
  console.log('Deployment executed.');
}

async function requestJson(path, init) {
  const response = await fetch(`${APPROVA_BASE_URL}${path}`, init);
  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? 'Request failed.';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return payload;
}

function createDecisionWaiter() {
  let settled = false;
  let resolveDecision;
  let rejectDecision;

  const promise = new Promise((resolve, reject) => {
    resolveDecision = resolve;
    rejectDecision = reject;
  });

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectDecision(new Error('Timed out waiting for Approva approval webhook.'));
    }
  }, WEBHOOK_TIMEOUT_MS);

  return {
    async wait() {
      try {
        return await promise;
      } finally {
        clearTimeout(timeout);
      }
    },
    resolve(event) {
      if (settled) {
        return;
      }

      settled = true;
      resolveDecision(event);
    },
  };
}

async function waitForDecisionEvent() {
  const event = await decisionPromise.wait();

  if (!event || typeof event !== 'object') {
    throw new Error('Webhook payload was empty.');
  }

  return event;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function headerValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
}

function writeJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
}

async function shutdown(exitCode) {
  await new Promise((resolve) => server.close(resolve));
  process.exit(exitCode);
}
