import { randomBytes } from 'node:crypto';

type EnvRecord = Record<string, string | undefined>;
const openCoreDashboardAuthSecretFallback = randomBytes(32).toString('hex');

export interface ApprovaEnvironmentValidationIssue {
  name: string;
  message: string;
}

export class ApprovaEnvironmentValidationError extends Error {
  constructor(
    readonly app: 'api' | 'approval-ui',
    readonly issues: ApprovaEnvironmentValidationIssue[],
  ) {
    super(buildValidationMessage(app, issues));
    this.name = 'ApprovaEnvironmentValidationError';
  }
}

export function getApprovaApiEnvironmentIssues(env: EnvRecord = process.env) {
  const issues: ApprovaEnvironmentValidationIssue[] = [];
  const nodeEnv = normalizeOptionalString(env.NODE_ENV);

  requireEnv(env, issues, 'DATABASE_URL', 'Database connection is required.');

  if (nodeEnv === 'production') {
    requireEnv(
      env,
      issues,
      'APPROVAL_ACCESS_TOKEN_SECRET',
      'Approval access token signing is required in production.',
    );
    requireEnv(
      env,
      issues,
      'WEBHOOK_SIGNING_SECRET',
      'Webhook signing is required in production.',
    );
  }

  const integrationEncryptionKey =
    normalizeOptionalString(env.APPROVA_INTEGRATION_ENCRYPTION_KEY) ??
    normalizeOptionalString(env.AUTHON_INTEGRATION_ENCRYPTION_KEY);

  if (integrationEncryptionKey) {
    validateEncryptionKey(
      integrationEncryptionKey,
      issues,
      'APPROVA_INTEGRATION_ENCRYPTION_KEY',
    );
  }

  return issues;
}

export function validateApprovaApiEnvironment(env: EnvRecord = process.env) {
  const issues = getApprovaApiEnvironmentIssues(env);

  if (issues.length > 0) {
    throw new ApprovaEnvironmentValidationError('api', issues);
  }

  return env;
}

export function getApprovaUiEnvironmentIssues(env: EnvRecord = process.env) {
  void env;
  return [] as ApprovaEnvironmentValidationIssue[];
}

export function validateApprovaUiEnvironment(env: EnvRecord = process.env) {
  const issues = getApprovaUiEnvironmentIssues(env);

  if (issues.length > 0) {
    throw new ApprovaEnvironmentValidationError('approval-ui', issues);
  }

  return env;
}

export function getOpenCoreDashboardAuthSecret(env: EnvRecord = process.env) {
  const configured = normalizeOptionalString(env.AUTH_SECRET);

  if (configured) {
    return configured;
  }

  return openCoreDashboardAuthSecretFallback;
}

export function getApprovaIntegrationEncryptionKeyMaterial(rawValue?: string | null) {
  const raw = normalizeOptionalString(rawValue);

  if (!raw) {
    return null;
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const base64 = tryDecodeBase64(raw);
  return base64 ?? null;
}

function requireEnv(
  env: EnvRecord,
  issues: ApprovaEnvironmentValidationIssue[],
  name: string,
  message: string,
) {
  if (!normalizeOptionalString(env[name])) {
    issues.push({
      name,
      message,
    });
  }
}

function validateEncryptionKey(
  rawValue: string | undefined,
  issues: ApprovaEnvironmentValidationIssue[],
  name: string,
) {
  if (!normalizeOptionalString(rawValue)) {
    return;
  }

  if (!getApprovaIntegrationEncryptionKeyMaterial(rawValue)) {
    issues.push({
      name,
      message: `${name} must be a 32-byte base64 or 64-character hex key.`,
    });
  }
}

function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function tryDecodeBase64(value: string) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded =
      normalized.length % 4 === 0
        ? normalized
        : normalized.padEnd(normalized.length + (4 - (normalized.length % 4)), '=');
    const decoded = Buffer.from(padded, 'base64');

    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function buildValidationMessage(
  app: 'api' | 'approval-ui',
  issues: ApprovaEnvironmentValidationIssue[],
) {
  return [
    `[Approva Config] ${app} startup validation failed.`,
    ...issues.map((issue) => `- ${issue.name}: ${issue.message}`),
  ].join('\n');
}

export {
  ApprovaEnvironmentValidationError as AuthonEnvironmentValidationError,
  getApprovaApiEnvironmentIssues as getAuthonApiEnvironmentIssues,
  getApprovaIntegrationEncryptionKeyMaterial as getAuthonIntegrationEncryptionKeyMaterial,
  getApprovaUiEnvironmentIssues as getAuthonUiEnvironmentIssues,
  validateApprovaApiEnvironment as validateAuthonApiEnvironment,
  validateApprovaUiEnvironment as validateAuthonUiEnvironment,
};

export type {
  ApprovaEnvironmentValidationIssue as AuthonEnvironmentValidationIssue,
};
