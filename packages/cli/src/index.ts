import process from 'node:process';
import {
  ApprovalClient,
  type ApprovalRequestResponse,
  type ExchangeCapabilityResponse,
  type CapabilityUseResult,
  type CapabilityVerificationResult,
  type CreateApprovalRequestInput,
  type VerifyCapabilityInput,
} from '@approva/sdk';

type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

type CommandContext = {
  json: boolean;
  client: ApprovalClient;
};

void main();

async function main() {
  try {
    const tokens = process.argv.slice(2);

    if (tokens.length === 0 || tokens.includes('--help') || tokens.includes('-h')) {
      printHelp();
      return;
    }

    const [group, command, ...rest] = tokens;

    if (group === 'approval' && command === 'request') {
      await handleApprovalRequest(rest);
      return;
    }

    if (group === 'approval' && command === 'get') {
      await handleApprovalGet(rest);
      return;
    }

    if (group === 'capability' && command === 'verify') {
      await handleCapabilityVerify(rest);
      return;
    }

    if (group === 'capability' && command === 'exchange') {
      await handleCapabilityExchange(rest);
      return;
    }

    if (group === 'capability' && command === 'use') {
      await handleCapabilityUse(rest);
      return;
    }

    throw new Error(`Unknown command: ${tokens.join(' ')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error';
    console.error(`Approva CLI error: ${message}`);
    process.exitCode = 1;
  }
}

async function handleApprovalRequest(tokens: string[]) {
  const parsed = parseArgs(tokens);
  const context = buildCommandContext(parsed.flags);
  const params = parseParamsJson(parsed.flags['params-json']);
  const reason = getOptionalStringFlag(parsed.flags, 'reason');
  const mergedParams = mergeRequestReason(params, reason);

  const input: CreateApprovalRequestInput = {
    action: requireStringFlag(parsed.flags, 'action'),
    riskLevel: requireRiskLevel(parsed.flags),
    resource: {
      type: requireStringFlag(parsed.flags, 'resource-type'),
      id: requireStringFlag(parsed.flags, 'resource-id'),
    },
    requestedBy: {
      system: getOptionalStringFlag(parsed.flags, 'requested-by-system') ?? 'approva-cli',
      actorId: getOptionalStringFlag(parsed.flags, 'requested-by-actor-id') ?? undefined,
    },
    externalRequestId: getOptionalStringFlag(parsed.flags, 'external-request-id') ?? undefined,
    callbackUrl: getOptionalStringFlag(parsed.flags, 'callback-url') ?? undefined,
    callback: buildCallbackConfig(parsed.flags),
    expiresAt: getOptionalStringFlag(parsed.flags, 'expires-at') ?? undefined,
    params: mergedParams,
  };

  const response = await context.client.requestApproval(input, {
    idempotencyKey: getOptionalStringFlag(parsed.flags, 'idempotency-key') ?? undefined,
  });

  if (context.json) {
    printJson(response);
    return;
  }

  printApprovalRequestOutput(response);
}

async function handleApprovalGet(tokens: string[]) {
  const parsed = parseArgs(tokens);
  const context = buildCommandContext(parsed.flags);
  const requestId =
    parsed.positional[0] ?? getOptionalStringFlag(parsed.flags, 'id');

  if (!requestId) {
    throw new Error('Approval request id is required. Use `approva approval get <id>`.');
  }

  const response = await context.client.getApprovalRequest(requestId);

  if (context.json) {
    printJson(response);
    return;
  }

  printApprovalRequestOutput(response);
}

async function handleCapabilityVerify(tokens: string[]) {
  const parsed = parseArgs(tokens);
  const context = buildCommandContext(parsed.flags);
  const input = buildCapabilityInput(parsed.flags);
  const response = await context.client.verifyCapability(input);

  if (context.json) {
    printJson(response);
    return;
  }

  printCapabilityVerificationOutput(response);
}

async function handleCapabilityExchange(tokens: string[]) {
  const parsed = parseArgs(tokens);
  const context = buildCommandContext(parsed.flags);
  const response = await context.client.exchangeCapability({
    exchangeToken: requireStringFlag(parsed.flags, 'exchange-token'),
  });

  if (context.json) {
    printJson(response);
    return;
  }

  printCapabilityExchangeOutput(response);
}

async function handleCapabilityUse(tokens: string[]) {
  const parsed = parseArgs(tokens);
  const context = buildCommandContext(parsed.flags);
  const input = buildCapabilityInput(parsed.flags);
  const response = await context.client.useCapability(input);

  if (context.json) {
    printJson(response);
    return;
  }

  printCapabilityUseOutput(response);
}

function buildCommandContext(flags: ParsedArgs['flags']): CommandContext {
  const baseUrl =
    getOptionalStringFlag(flags, 'base-url') ??
    process.env.APPROVA_BASE_URL ??
    process.env.AUTHON_BASE_URL ??
    'http://localhost:4000';
  const apiKey =
    getOptionalStringFlag(flags, 'api-key') ??
    process.env.APPROVA_API_KEY ??
    process.env.AUTHON_API_KEY;

  if (!apiKey) {
    throw new Error(
      'APPROVA_API_KEY or --api-key is required for machine-authenticated CLI usage. AUTHON_API_KEY is still accepted as a backward-compatible alias.',
    );
  }

  return {
    json: getBooleanFlag(flags, 'json'),
    client: new ApprovalClient({
      baseUrl,
      apiKey,
    }),
  };
}

function buildCapabilityInput(flags: ParsedArgs['flags']): VerifyCapabilityInput {
  return {
    token: requireStringFlag(flags, 'token'),
    action: requireStringFlag(flags, 'action'),
    resource: {
      type: requireStringFlag(flags, 'resource-type'),
      id: requireStringFlag(flags, 'resource-id'),
    },
    params: parseParamsJson(flags['params-json']),
  };
}

function buildCallbackConfig(flags: ParsedArgs['flags']) {
  const webhookUrl = getOptionalStringFlag(flags, 'callback-url');
  const deliverCapabilityMode = getOptionalStringFlag(flags, 'deliver-capability-mode');

  if (!webhookUrl && !deliverCapabilityMode) {
    return undefined;
  }

  if (!webhookUrl) {
    throw new Error('--callback-url is required when configuring callback delivery.');
  }

  if (
    deliverCapabilityMode &&
    deliverCapabilityMode !== 'none' &&
    deliverCapabilityMode !== 'exchange_token'
  ) {
    throw new Error('--deliver-capability-mode must be one of: none, exchange_token.');
  }

  return {
    webhookUrl,
    deliverCapabilityMode:
      (deliverCapabilityMode as 'none' | 'exchange_token' | null) ?? 'none',
  };
}

function parseArgs(tokens: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const stripped = token.slice(2);

    if (stripped.length === 0) {
      continue;
    }

    const [rawKey, inlineValue] = stripped.split('=', 2);

    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
      continue;
    }

    const next = tokens[index + 1];

    if (!next || next.startsWith('--')) {
      flags[rawKey] = true;
      continue;
    }

    flags[rawKey] = next;
    index += 1;
  }

  return {
    positional,
    flags,
  };
}

function requireStringFlag(flags: ParsedArgs['flags'], key: string) {
  const value = getOptionalStringFlag(flags, key);

  if (!value) {
    throw new Error(`Missing required flag --${key}.`);
  }

  return value;
}

function getOptionalStringFlag(flags: ParsedArgs['flags'], key: string) {
  const value = flags[key];

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getBooleanFlag(flags: ParsedArgs['flags'], key: string) {
  return flags[key] === true;
}

function requireRiskLevel(flags: ParsedArgs['flags']) {
  const value = requireStringFlag(flags, 'risk-level');

  if (
    value !== 'low' &&
    value !== 'medium' &&
    value !== 'high' &&
    value !== 'critical'
  ) {
    throw new Error('Risk level must be one of: low, medium, high, critical.');
  }

  return value;
}

function parseParamsJson(rawValue: string | boolean | undefined) {
  if (typeof rawValue !== 'string') {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as Record<string, unknown> | unknown[] | null;
  } catch {
    throw new Error('Failed to parse --params-json as valid JSON.');
  }
}

function mergeRequestReason(
  params: Record<string, unknown> | unknown[] | null | undefined,
  reason: string | null,
) {
  if (!reason) {
    return params;
  }

  if (params === undefined || params === null) {
    return {
      reason,
    };
  }

  if (Array.isArray(params)) {
    throw new Error('Cannot combine --reason with an array-valued --params-json payload.');
  }

  return {
    ...params,
    reason,
  };
}

function printApprovalRequestOutput(response: ApprovalRequestResponse) {
  const { request, approvalUrl, capability } = response;

  console.log('Approva approval request');
  console.log(`ID: ${request.id}`);
  console.log(`Status: ${request.status}`);
  console.log(`Action: ${request.action}`);
  console.log(`Resource: ${request.resource.type}/${request.resource.id}`);
  console.log(`Risk level: ${request.riskLevel}`);

  if (request.externalRequestId) {
    console.log(`External request ID: ${request.externalRequestId}`);
  }

  if (request.status === 'pending' && approvalUrl) {
    console.log(`Approval URL: ${approvalUrl}`);
  }

  if (request.latestDecision) {
    console.log(`Decision: ${request.latestDecision.decision}`);

    if (request.latestDecision.reason) {
      console.log(`Decision reason: ${request.latestDecision.reason}`);
    }
  }

  if (capability?.token) {
    console.log(`Capability token: ${capability.token}`);
  } else if (request.capability) {
    console.log(`Capability ID: ${request.capability.id}`);
  }

  if (request.capability?.expiresAt) {
    console.log(`Capability expires at: ${request.capability.expiresAt}`);
  }

  if (response.idempotentReplay) {
    console.log('Replay: existing approval request returned');
  }
}

function printCapabilityVerificationOutput(response: CapabilityVerificationResult) {
  if (!response.valid) {
    console.log('Capability verification: invalid');
    console.log(`Reason: ${response.invalidReason?.message ?? response.reason ?? 'Unknown'}`);

    if (response.approvalRequestId) {
      console.log(`Approval request ID: ${response.approvalRequestId}`);
    }

    return;
  }

  console.log('Capability verification: valid');
  console.log(`Approval request ID: ${response.approvalRequestId ?? 'Unknown'}`);

  if (response.capability) {
    console.log(`Capability ID: ${response.capability.id}`);
    console.log(`Capability expires at: ${response.capability.expiresAt}`);
  }
}

function printCapabilityUseOutput(response: CapabilityUseResult) {
  if (!response.valid) {
    console.log('Capability use: denied');
    console.log(`Reason: ${response.invalidReason?.message ?? response.reason ?? 'Unknown'}`);

    if (response.approvalRequestId) {
      console.log(`Approval request ID: ${response.approvalRequestId}`);
    }

    return;
  }

  console.log('Capability use: recorded');
  console.log(`Approval request ID: ${response.approvalRequestId ?? 'Unknown'}`);
}

function printCapabilityExchangeOutput(response: ExchangeCapabilityResponse) {
  console.log('Capability exchange: successful');
  console.log(`Capability token: ${response.capabilityToken}`);
  console.log(`Capability expires at: ${response.expiresAt}`);
  console.log(`Scope action: ${response.scope.action}`);
  console.log(
    `Scope resource: ${response.scope.resource.type}/${response.scope.resource.id}`,
  );
  console.log(`Scope params hash: ${response.scope.paramsHash}`);
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`Approva CLI

Machine-facing CLI for Approva approval requests and capability usage.

Configuration:
  APPROVA_BASE_URL  Approva API base URL (default: http://localhost:4000)
  APPROVA_API_KEY   Organization API key in the format approva_sk_...
  AUTHON_BASE_URL   Backward-compatible alias for APPROVA_BASE_URL
  AUTHON_API_KEY    Backward-compatible alias for APPROVA_API_KEY
  authon            Backward-compatible CLI alias for approva

Commands:
  approva approval request --action <action> --resource-type <type> --resource-id <id> --risk-level <level> [--reason <text>] [--params-json <json>] [--requested-by-system <name>] [--requested-by-actor-id <id>] [--idempotency-key <key>] [--json]
  approva approval get <approval-request-id> [--json]
  approva capability verify --token <capability-token> --action <action> --resource-type <type> --resource-id <id> [--params-json <json>] [--json]
  approva capability exchange --exchange-token <exchange-token> [--json]
  approva capability use --token <capability-token> --action <action> --resource-type <type> --resource-id <id> [--params-json <json>] [--json]

Examples:
  approva approval request \\
    --action deployment.execute \\
    --resource-type service \\
    --resource-id billing-api \\
    --risk-level high \\
    --reason "Deploy build 2026.03.16" \\
    --callback-url https://agent.example/approva/webhooks \\
    --deliver-capability-mode exchange_token

  approva approval get 2c7d7d6d-37aa-4f27-8c4c-4a6f3537f875

  approva capability verify \\
    --token cap_... \\
    --action deployment.execute \\
    --resource-type service \\
    --resource-id billing-api \\
    --params-json '{"environment":"production","version":"2026.03.16-demo"}'

  approva capability exchange \\
    --exchange-token cex_...

  approva capability use \\
    --token cap_... \\
    --action deployment.execute \\
    --resource-type service \\
    --resource-id billing-api \\
    --params-json '{"environment":"production","version":"2026.03.16-demo"}'
`);
}
