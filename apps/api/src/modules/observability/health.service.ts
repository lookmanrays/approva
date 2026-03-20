import { Injectable } from '@nestjs/common';
import {
  getApprovaApiEnvironmentIssues,
  getApprovaIntegrationEncryptionKeyMaterial,
} from '@approva/config';
import { PrismaService } from '../../common/prisma/prisma.service';

export type HealthCheckStatus = 'ok' | 'warn' | 'error' | 'skipped';
export type OverallHealthStatus = 'ok' | 'ready' | 'not_ready';

export interface HealthCheckResult {
  status: HealthCheckStatus;
  details: string;
  required: boolean;
  metadata?: Record<string, unknown>;
}

export interface OptionalProviderChecks {
  status: 'ok' | 'warn' | 'skipped';
  details: string;
  providers: {
    resend: HealthCheckResult;
    slack: HealthCheckResult;
  };
}

export interface LivenessResponse {
  status: OverallHealthStatus;
  runtimeMode: 'open-core';
  checks: {
    process: HealthCheckResult;
  };
  timestamp: string;
}

export interface ReadinessResponse {
  status: OverallHealthStatus;
  runtimeMode: 'open-core';
  checks: {
    runtimeMode: HealthCheckResult;
    config: HealthCheckResult;
    database: HealthCheckResult;
    encryption: HealthCheckResult;
    providers: OptionalProviderChecks;
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      runtimeMode: 'open-core',
      checks: {
        process: {
          status: 'ok',
          required: true,
          details: 'Approva API process is running.',
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const runtimeModeCheck = this.getRuntimeModeCheck();
    const configCheck = this.getConfigCheck();
    const databaseCheck = await this.getDatabaseCheck();
    const encryptionCheck = this.getEncryptionCheck();
    const providersCheck = this.getOptionalProviderChecks();

    const response: ReadinessResponse = {
      status:
        [runtimeModeCheck, configCheck, databaseCheck, encryptionCheck].some(
          (check) => check.status === 'error',
        )
          ? 'not_ready'
          : 'ready',
      runtimeMode: 'open-core',
      checks: {
        runtimeMode: runtimeModeCheck,
        config: configCheck,
        database: databaseCheck,
        encryption: encryptionCheck,
        providers: providersCheck,
      },
      timestamp: new Date().toISOString(),
    };

    return {
      ok: response.status === 'ready',
      body: response,
    };
  }

  private getRuntimeModeCheck(): HealthCheckResult {
    return {
      status: 'ok',
      required: true,
      details: 'Self-host runtime is active.',
      metadata: {
        resolvedRuntimeMode: 'open-core',
      },
    };
  }

  private getConfigCheck(): HealthCheckResult {
    const issues = getApprovaApiEnvironmentIssues(process.env);

    if (issues.length > 0) {
      return {
        status: 'error',
        required: true,
        details: 'API startup configuration is incomplete or invalid.',
        metadata: {
          issues,
        },
      };
    }

    return {
      status: 'ok',
      required: true,
      details: 'API startup configuration is loaded and valid.',
    };
  }

  private async getDatabaseCheck(): Promise<HealthCheckResult> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');

      return {
        status: 'ok',
        required: true,
        details: 'Database connection check succeeded.',
      };
    } catch (error) {
      return {
        status: 'error',
        required: true,
        details: 'Database connection check failed.',
        metadata: {
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : {
                  message: 'Unknown database error.',
                },
        },
      };
    }
  }

  private getEncryptionCheck(): HealthCheckResult {
    const configuredKey =
      process.env.APPROVA_INTEGRATION_ENCRYPTION_KEY?.trim() ??
      process.env.AUTHON_INTEGRATION_ENCRYPTION_KEY?.trim() ??
      null;
    const keyMaterial = getApprovaIntegrationEncryptionKeyMaterial(configuredKey);

    if (!configuredKey) {
      return {
        status: 'skipped',
        required: false,
        details: 'Integration encryption key is optional for self-host installs.',
      };
    }

    if (!keyMaterial) {
      return {
        status: 'warn',
        required: false,
        details:
          'Integration encryption key is configured but malformed. Secret-backed integrations may fail until it is corrected.',
      };
    }

    return {
      status: 'ok',
      required: false,
      details: 'Integration encryption key is configured.',
    };
  }

  private getOptionalProviderChecks(): OptionalProviderChecks {
    const resendConfigured = Boolean(
      (process.env.APPROVA_RESEND_API_KEY?.trim() ||
        process.env.AUTHON_RESEND_API_KEY?.trim()) &&
        (process.env.APPROVA_EMAIL_FROM?.trim() ||
          process.env.AUTHON_EMAIL_FROM?.trim() ||
          process.env.AUTH_EMAIL_FROM?.trim()),
    );
    const slackConfigured = Boolean(
      (process.env.APPROVA_SLACK_BOT_TOKEN?.trim() ||
        process.env.AUTHON_SLACK_BOT_TOKEN?.trim()) &&
        (process.env.APPROVA_SLACK_CHANNEL_ID?.trim() ||
          process.env.AUTHON_SLACK_CHANNEL_ID?.trim()),
    );
    const resend = this.createProviderCheck(
      resendConfigured,
      'Resend email delivery is configured.',
      'Resend is not fully configured. Email delivery will fall back to local logging or remain unavailable.',
    );
    const slack = this.createProviderCheck(
      slackConfigured,
      'Slack fallback delivery is configured.',
      'Slack fallback delivery is not configured. Organization-scoped Slack integrations may still work if configured in the product.',
    );
    const providerStatuses = [resend.status, slack.status];
    const overallStatus = providerStatuses.every((status) => status === 'skipped')
      ? 'skipped'
      : providerStatuses.some((status) => status === 'warn')
        ? 'warn'
        : 'ok';

    return {
      status: overallStatus,
      details:
        overallStatus === 'ok'
          ? 'Optional providers are configured.'
          : overallStatus === 'skipped'
            ? 'Optional providers are not configured.'
            : 'Some optional providers are not configured. Core readiness is unaffected.',
      providers: {
        resend,
        slack,
      },
    };
  }

  private createProviderCheck(
    configured: boolean,
    configuredDetails: string,
    missingDetails: string,
  ): HealthCheckResult {
    if (configured) {
      return {
        status: 'ok',
        required: false,
        details: configuredDetails,
      };
    }

    return {
      status: 'skipped',
      required: false,
      details: missingDetails,
    };
  }
}
