#!/usr/bin/env tsx

import { PrismaClient, ApiKeyScope as PrismaApiKeyScope } from '@prisma/client';
import {
  generateOpaqueToken,
  hashTokenValue,
} from '../apps/api/src/common/utils/hash.util';
import { encryptApplicationValue } from '../apps/api/src/common/utils/application-encryption.util';

type BootstrapOptions = {
  organizationName?: string;
  organizationSlug?: string;
  createServiceAccount: boolean;
  serviceAccountName: string;
  serviceAccountDescription?: string;
  createApiKey: boolean;
  apiKeyName: string;
  apiKeyScopes: PrismaApiKeyScope[];
  emailRecipients: string[];
  slackChannelId?: string;
  slackBotToken?: string;
  webhookUrl?: string;
  webhookSecret?: string;
};

type BootstrapSummary = {
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  policyStatus: 'created' | 'existing' | 'skipped';
  serviceAccount: {
    id: string;
    name: string;
    created: boolean;
  } | null;
  apiKey: {
    id: string;
    name: string;
    keyPrefix: string;
    rawKey: string | null;
    created: boolean;
    note?: string;
  } | null;
  integrations: Array<{
    type: 'email' | 'slack' | 'webhook';
    status: 'created' | 'updated' | 'skipped';
    note?: string;
  }>;
  nextSteps: string[];
};

const prisma = new PrismaClient();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary: BootstrapSummary = {
    organization: null,
    policyStatus: 'skipped',
    serviceAccount: null,
    apiKey: null,
    integrations: [],
    nextSteps: [],
  };

  try {
    const organization = await resolveBootstrapOrganization(options);
    summary.organization = organization;

    await ensureDefaultPoliciesIfNoneExist(organization.id, summary);

    const serviceAccount = await maybeCreateServiceAccount(
      organization.id,
      options,
      summary,
    );

    await maybeCreateApiKey(
      organization.id,
      serviceAccount?.id ?? null,
      options,
      summary,
    );

    await maybeConfigureIntegrations(organization.id, options, summary);
    populateNextSteps(summary, options);
    printSummary(summary);
  } finally {
    await prisma.$disconnect();
  }
}

async function resolveBootstrapOrganization(options: BootstrapOptions) {
  const requestedName = normalizeOptionalString(options.organizationName);
  const slug =
    normalizeOptionalString(options.organizationSlug) ||
    slugify(requestedName ?? getDefaultOrganizationName()) ||
    getDefaultOrganizationSlug();
  const name = requestedName || getDefaultOrganizationName();

  return prisma.organization.upsert({
    where: {
      slug,
    },
    update: {
      name,
    },
    create: {
      name,
      slug,
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });
}

async function ensureDefaultPoliciesIfNoneExist(
  organizationId: string,
  summary: BootstrapSummary,
) {
  const existingCount = await prisma.policy.count({
    where: {
      organizationId,
    },
  });

  if (existingCount > 0) {
    summary.policyStatus = 'existing';
    return;
  }

  await prisma.policy.createMany({
    data: [
      {
        organizationId,
        action: '*',
        resourceType: '*',
        riskLevel: 'high',
        approvalRequired: true,
        approverRoles: ['owner', 'admin', 'approver'],
      },
      {
        organizationId,
        action: '*',
        resourceType: '*',
        riskLevel: 'critical',
        approvalRequired: true,
        approverRoles: ['owner', 'admin', 'approver'],
      },
    ],
  });

  summary.policyStatus = 'created';
}

async function maybeCreateServiceAccount(
  organizationId: string,
  options: BootstrapOptions,
  summary: BootstrapSummary,
) {
  const shouldCreate = options.createServiceAccount || options.createApiKey;

  if (!shouldCreate) {
    return null;
  }

  const existing = await prisma.serviceAccount.findFirst({
    where: {
      organizationId,
      name: options.serviceAccountName,
      revokedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (existing) {
    summary.serviceAccount = {
      id: existing.id,
      name: existing.name,
      created: false,
    };
    return existing;
  }

  const serviceAccount = await prisma.serviceAccount.create({
    data: {
      organizationId,
      name: options.serviceAccountName,
      description: normalizeOptionalString(options.serviceAccountDescription),
    },
    select: {
      id: true,
      name: true,
    },
  });

  summary.serviceAccount = {
    id: serviceAccount.id,
    name: serviceAccount.name,
    created: true,
  };

  return serviceAccount;
}

async function maybeCreateApiKey(
  organizationId: string,
  serviceAccountId: string | null,
  options: BootstrapOptions,
  summary: BootstrapSummary,
) {
  if (!options.createApiKey) {
    return;
  }

  const existing = await prisma.organizationApiKey.findFirst({
    where: {
      organizationId,
      name: options.apiKeyName,
      revokedAt: null,
    },
    select: {
      id: true,
      keyPrefix: true,
      name: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (existing) {
    summary.apiKey = {
      id: existing.id,
      name: existing.name,
      keyPrefix: existing.keyPrefix,
      rawKey: null,
      created: false,
      note:
        'An active API key with this name already exists. Approva will not reveal its raw value again.',
    };
    return;
  }

  const rawKey = generateOpaqueToken({
    prefix: 'approva_sk',
    randomLength: 32,
  });

  const apiKey = await prisma.organizationApiKey.create({
    data: {
      organizationId,
      serviceAccountId,
      name: options.apiKeyName,
      keyPrefix: rawKey.slice(0, Math.min(rawKey.length, 22)),
      keyHash: hashTokenValue(rawKey),
      scopes: options.apiKeyScopes,
    },
    select: {
      id: true,
      keyPrefix: true,
      name: true,
    },
  });

  summary.apiKey = {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    rawKey,
    created: true,
  };
}

async function maybeConfigureIntegrations(
  organizationId: string,
  options: BootstrapOptions,
  summary: BootstrapSummary,
) {
  if (options.emailRecipients.length > 0) {
    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_type: {
          organizationId,
          type: 'email',
        },
      },
      select: {
        id: true,
      },
    });

    await prisma.integration.upsert({
      where: {
        organizationId_type: {
          organizationId,
          type: 'email',
        },
      },
      update: {
        configJson: {
          recipients: options.emailRecipients,
        },
      },
      create: {
        organizationId,
        type: 'email',
        configJson: {
          recipients: options.emailRecipients,
        },
      },
    });

    summary.integrations.push({
      type: 'email',
      status: existing ? 'updated' : 'created',
    });
  } else {
    summary.integrations.push({
      type: 'email',
      status: 'skipped',
      note: 'No email recipients were provided.',
    });
  }

  if (options.slackChannelId && options.slackBotToken) {
    const encryptedToken = encryptApplicationValue(options.slackBotToken);
    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_type: {
          organizationId,
          type: 'slack',
        },
      },
      select: {
        id: true,
      },
    });

    await prisma.integration.upsert({
      where: {
        organizationId_type: {
          organizationId,
          type: 'slack',
        },
      },
      update: {
        configJson: {
          channelId: options.slackChannelId,
          botTokenEncrypted: encryptedToken,
          botTokenMasked: maskSecret(options.slackBotToken),
        },
      },
      create: {
        organizationId,
        type: 'slack',
        configJson: {
          channelId: options.slackChannelId,
          botTokenEncrypted: encryptedToken,
          botTokenMasked: maskSecret(options.slackBotToken),
        },
      },
    });

    summary.integrations.push({
      type: 'slack',
      status: existing ? 'updated' : 'created',
    });
  } else {
    summary.integrations.push({
      type: 'slack',
      status: 'skipped',
      note:
        'Slack bootstrap requires both --slack-channel-id and --slack-bot-token. No Slack integration was written.',
    });
  }

  if (options.webhookUrl && options.webhookSecret) {
    const encryptedSecret = encryptApplicationValue(options.webhookSecret);
    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_type: {
          organizationId,
          type: 'webhook',
        },
      },
      select: {
        id: true,
      },
    });

    await prisma.integration.upsert({
      where: {
        organizationId_type: {
          organizationId,
          type: 'webhook',
        },
      },
      update: {
        configJson: {
          url: options.webhookUrl,
          secretEncrypted: encryptedSecret,
          secretMasked: maskSecret(options.webhookSecret),
        },
      },
      create: {
        organizationId,
        type: 'webhook',
        configJson: {
          url: options.webhookUrl,
          secretEncrypted: encryptedSecret,
          secretMasked: maskSecret(options.webhookSecret),
        },
      },
    });

    summary.integrations.push({
      type: 'webhook',
      status: existing ? 'updated' : 'created',
    });
  } else {
    summary.integrations.push({
      type: 'webhook',
      status: 'skipped',
      note:
        'Webhook bootstrap requires both --webhook-url and --webhook-secret. No webhook integration was written.',
    });
  }
}

function populateNextSteps(summary: BootstrapSummary, options: BootstrapOptions) {
  const uiBaseUrl = getUiBaseUrl();

  summary.nextSteps.push(
    `Open ${uiBaseUrl}/console/approvals to confirm the organization console is available.`,
  );

  if (summary.policyStatus === 'created') {
    summary.nextSteps.push(
      'Open /console/policies to review the default high-risk and critical-risk approval policies.',
    );
  }

  if (!options.createApiKey) {
    summary.nextSteps.push(
      'If you want a machine-ready path immediately, rerun bootstrap with --create-service-account --create-api-key.',
    );
  }
}

function printSummary(summary: BootstrapSummary) {
  console.log('Approva bootstrap summary');
  console.log('');

  if (summary.organization) {
    console.log(`Organization: ${summary.organization.name} (${summary.organization.slug})`);
    console.log(`Organization ID: ${summary.organization.id}`);
  } else {
    console.log('Organization: not created');
  }

  console.log(`Policies: ${summary.policyStatus}`);

  if (summary.serviceAccount) {
    console.log('');
    console.log(
      `Service account: ${summary.serviceAccount.name} (${summary.serviceAccount.created ? 'created' : 'existing'})`,
    );
  }

  if (summary.apiKey) {
    console.log('');
    console.log(`API key: ${summary.apiKey.name} (${summary.apiKey.created ? 'created' : 'existing'})`);
    console.log(`API key prefix: ${summary.apiKey.keyPrefix}`);
    if (summary.apiKey.note) {
      console.log(`API key note: ${summary.apiKey.note}`);
    }
    if (summary.apiKey.rawKey) {
      console.log('');
      console.log('Raw API key');
      console.log(summary.apiKey.rawKey);
      console.log('');
      console.log('Store this now. Approva will not reveal it again.');
    }
  }

  console.log('');
  console.log('Integrations');
  for (const integration of summary.integrations) {
    const suffix = integration.note ? ` - ${integration.note}` : '';
    console.log(`- ${integration.type}: ${integration.status}${suffix}`);
  }

  if (summary.nextSteps.length > 0) {
    console.log('');
    console.log('Next steps');
    for (const step of summary.nextSteps) {
      console.log(`- ${step}`);
    }
  }
}

function parseArgs(argv: string[]): BootstrapOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const [name, inlineValue] = token.split('=', 2);

    if (inlineValue !== undefined) {
      flags.set(name, inlineValue);
      continue;
    }

    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      flags.set(name, true);
      continue;
    }

    flags.set(name, next);
    index += 1;
  }

  return {
    organizationName: readStringFlag(flags, '--organization-name'),
    organizationSlug: readStringFlag(flags, '--organization-slug'),
    createServiceAccount: Boolean(flags.get('--create-service-account')),
    serviceAccountName:
      readStringFlag(flags, '--service-account-name') ?? 'Bootstrap Agent',
    serviceAccountDescription:
      readStringFlag(flags, '--service-account-description') ??
      'Created by the Approva bootstrap script.',
    createApiKey: Boolean(flags.get('--create-api-key')),
    apiKeyName: readStringFlag(flags, '--api-key-name') ?? 'Bootstrap Agent Key',
    apiKeyScopes: parseApiKeyScopes(readStringFlag(flags, '--api-key-scopes')),
    emailRecipients: parseCsv(readStringFlag(flags, '--email-recipients')),
    slackChannelId: readStringFlag(flags, '--slack-channel-id'),
    slackBotToken: readStringFlag(flags, '--slack-bot-token'),
    webhookUrl: readStringFlag(flags, '--webhook-url'),
    webhookSecret: readStringFlag(flags, '--webhook-secret'),
  };
}

function parseApiKeyScopes(rawValue?: string) {
  const defaults: PrismaApiKeyScope[] = [
    'approval_requests_create',
    'approval_requests_read',
    'capabilities_verify',
    'capabilities_use',
  ];

  if (!rawValue) {
    return defaults;
  }

  const mapping: Record<string, PrismaApiKeyScope> = {
    'approval_requests:create': 'approval_requests_create',
    'approval_requests:read': 'approval_requests_read',
    'capabilities:verify': 'capabilities_verify',
    'capabilities:use': 'capabilities_use',
    'webhooks:manage': 'webhooks_manage',
  };

  return parseCsv(rawValue).map((scope) => {
    const mapped = mapping[scope];

    if (!mapped) {
      throw new Error(`Unsupported API key scope: ${scope}`);
    }

    return mapped;
  });
}

function printHelp() {
  console.log(`Approva bootstrap

Usage:
  pnpm bootstrap -- [options]

Options:
  --organization-name <name>         Create or target an organization by name
  --organization-slug <slug>         Target a specific organization slug
  --create-service-account           Create or reuse a bootstrap service account
  --service-account-name <name>      Service account name (default: Bootstrap Agent)
  --create-api-key                   Create or reuse a machine API key
  --api-key-name <name>              API key name (default: Bootstrap Agent Key)
  --api-key-scopes <csv>             Comma-separated scopes
  --email-recipients <csv>           Create/update email integration recipients
  --slack-channel-id <id>            Create/update Slack integration if paired with bot token
  --slack-bot-token <token>          Slack bot token to encrypt and store
  --webhook-url <url>                Create/update webhook integration if paired with secret
  --webhook-secret <secret>          Webhook secret to encrypt and store
  --help                             Show this help
`);
}

function readStringFlag(flags: Map<string, string | true>, name: string) {
  const value = flags.get(name);

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseCsv(rawValue?: string) {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getDefaultOrganizationName() {
  return (
    normalizeOptionalString(process.env.APPROVA_DEFAULT_ORGANIZATION_NAME) ||
    normalizeOptionalString(process.env.AUTHON_DEFAULT_ORGANIZATION_NAME) ||
    'Default Organization'
  );
}

function getDefaultOrganizationSlug() {
  return (
    normalizeOptionalString(process.env.APPROVA_DEFAULT_ORGANIZATION_SLUG) ||
    normalizeOptionalString(process.env.AUTHON_DEFAULT_ORGANIZATION_SLUG) ||
    'default'
  );
}

function getUiBaseUrl() {
  return (
    normalizeOptionalString(process.env.AUTH_URL) ||
    normalizeOptionalString(process.env.APPROVAL_UI_BASE_URL) ||
    'http://localhost:3000'
  );
}

function slugify(input: string) {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return normalized || 'approva-org';
}

function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function maskSecret(secret: string) {
  const normalized = secret.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 1)}***${normalized.slice(-1)}`;
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

main().catch((error) => {
  console.error(
    error instanceof Error ? `Bootstrap failed: ${error.message}` : 'Bootstrap failed.',
  );
  process.exit(1);
});
