import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  DeleteIntegrationResponse,
  EmailIntegrationConfig,
  IntegrationConfig,
  IntegrationListResponse,
  IntegrationRecord,
  IntegrationType,
  SlackIntegrationConfig,
  WebhookIntegrationConfig,
} from '@approva/shared';
import type { Integration } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toPrismaJson } from '../../common/utils/prisma-json.util';
import { IntegrationSecretsService } from './integration-secrets.service';
import {
  OrganizationsService,
  type OrganizationContextInput,
} from '../organizations/organizations.service';

export interface NotificationIntegrations {
  slack: SlackIntegrationConfig | null;
  webhook: WebhookIntegrationConfig | null;
  email: EmailIntegrationConfig | null;
}

interface IntegrationWriteInput {
  type: IntegrationType;
  configJson: Record<string, unknown>;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly integrationSecretsService: IntegrationSecretsService,
  ) {}

  async listIntegrations(
    organizationInput: OrganizationContextInput = {},
  ): Promise<IntegrationListResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    const integrations = await this.prisma.integration.findMany({
      where: {
        organizationId: organization.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      items: integrations.map((integration) => this.toIntegrationRecord(integration)),
    };
  }

  async createIntegration(
    input: IntegrationWriteInput,
    organizationInput: OrganizationContextInput = {},
  ): Promise<IntegrationRecord> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    const configJson = this.buildStoredIntegrationConfig(input.type, input.configJson);

    try {
      const integration = await this.prisma.integration.create({
        data: {
          organizationId: organization.id,
          type: input.type,
          configJson: toPrismaJson(configJson),
        },
      });

      return this.toIntegrationRecord(integration);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(`An ${input.type} integration already exists for this organization.`);
      }

      throw error;
    }
  }

  async updateIntegration(
    id: string,
    input: IntegrationWriteInput,
    organizationInput: OrganizationContextInput = {},
  ): Promise<IntegrationRecord> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    const existing = await this.getOwnedIntegration(id, organization.id);
    const configJson = this.buildStoredIntegrationConfig(
      input.type,
      input.configJson,
      existing.configJson,
    );

    if (existing.type !== input.type) {
      const conflict = await this.prisma.integration.findFirst({
        where: {
          organizationId: organization.id,
          type: input.type,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });

      if (conflict) {
        throw new ConflictException(`An ${input.type} integration already exists for this organization.`);
      }
    }

    const integration = await this.prisma.integration.update({
      where: {
        id,
      },
      data: {
        type: input.type,
        configJson: toPrismaJson(configJson),
      },
    });

    return this.toIntegrationRecord(integration);
  }

  async deleteIntegration(
    id: string,
    organizationInput: OrganizationContextInput = {},
  ): Promise<DeleteIntegrationResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    await this.getOwnedIntegration(id, organization.id);

    await this.prisma.integration.delete({
      where: {
        id,
      },
    });

    return {
      deleted: true,
      id,
    };
  }

  async getNotificationIntegrations(organizationId: string): Promise<NotificationIntegrations> {
    const integrations = await this.prisma.integration.findMany({
      where: {
        organizationId,
        type: {
          in: ['slack', 'webhook', 'email'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const byType = new Map<IntegrationType, Integration>();

    for (const integration of integrations) {
      if (!byType.has(integration.type)) {
        byType.set(integration.type, integration);
      }
    }

    return {
      slack: byType.has('slack')
        ? (this.toRuntimeIntegrationConfig(
            'slack',
            byType.get('slack')!.configJson,
          ) as SlackIntegrationConfig)
        : null,
      webhook: byType.has('webhook')
        ? (this.toRuntimeIntegrationConfig(
            'webhook',
            byType.get('webhook')!.configJson,
          ) as WebhookIntegrationConfig)
        : null,
      email: byType.has('email')
        ? (this.toRuntimeIntegrationConfig(
            'email',
            byType.get('email')!.configJson,
          ) as EmailIntegrationConfig)
        : null,
    };
  }

  private async getOwnedIntegration(id: string, organizationId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found.');
    }

    return integration;
  }

  private toIntegrationRecord(integration: Integration): IntegrationRecord {
    return {
      id: integration.id,
      organizationId: integration.organizationId,
      type: integration.type,
      configJson: this.toPublicIntegrationConfig(integration.type, integration.configJson),
      createdAt: integration.createdAt.toISOString(),
    };
  }

  private buildStoredIntegrationConfig(
    type: IntegrationType,
    configJson: unknown,
    existingConfigJson?: unknown,
  ): Record<string, unknown> {
    const config = this.requireConfigObject(configJson);
    const existingConfig = existingConfigJson
      ? this.requireConfigObject(existingConfigJson)
      : undefined;

    switch (type) {
      case 'slack':
        return this.buildStoredSlackConfig(config, existingConfig);
      case 'webhook':
        return this.buildStoredWebhookConfig(config, existingConfig);
      case 'email':
        return {
          ...this.validateEmailConfig(config),
        };
    }
  }

  private toPublicIntegrationConfig(
    type: IntegrationType,
    configJson: unknown,
  ): IntegrationConfig {
    const config = this.requireConfigObject(configJson);

    switch (type) {
      case 'slack':
        return this.toPublicSlackConfig(config);
      case 'webhook':
        return this.toPublicWebhookConfig(config);
      case 'email':
        return this.validateEmailConfig(config);
    }
  }

  private toRuntimeIntegrationConfig(
    type: IntegrationType,
    configJson: unknown,
  ): IntegrationConfig {
    const config = this.requireConfigObject(configJson);

    switch (type) {
      case 'slack':
        return this.toRuntimeSlackConfig(config);
      case 'webhook':
        return this.toRuntimeWebhookConfig(config);
      case 'email':
        return this.validateEmailConfig(config);
    }
  }

  private buildStoredSlackConfig(
    config: Record<string, unknown>,
    existingConfig?: Record<string, unknown>,
  ): Record<string, unknown> {
    const channelId = this.requireNonEmptyString(
      config.channelId ?? config.channel_id,
      'Slack channel_id is required.',
    );
    const incomingBotToken = this.normalizeOptionalString(
      config.botToken ?? config.bot_token,
    );
    const existingBotToken = this.getStoredSecret(existingConfig, 'botTokenEncrypted', 'botToken');
    const botToken = incomingBotToken ?? existingBotToken;

    if (!botToken) {
      throw new BadRequestException('Slack bot_token is required.');
    }

    return {
      channelId,
      botTokenEncrypted: this.integrationSecretsService.isEncryptedSecret(botToken)
        ? botToken
        : this.integrationSecretsService.encryptSecret(botToken),
      botTokenMasked:
        incomingBotToken
          ? this.integrationSecretsService.maskSecret(incomingBotToken)
          : this.getStoredMask(existingConfig, 'botTokenMasked') ??
            this.maskStoredSecret(botToken),
    };
  }

  private toPublicSlackConfig(config: Record<string, unknown>): SlackIntegrationConfig {
    return {
      channelId: this.requireNonEmptyString(
        config.channelId ?? config.channel_id,
        'Slack channel_id is required.',
      ),
      botTokenConfigured: Boolean(
        this.getStoredSecret(config, 'botTokenEncrypted', 'botToken'),
      ),
      botTokenMasked:
        this.getStoredMask(config, 'botTokenMasked') ??
        this.maskStoredSecret(
          this.getStoredSecret(config, 'botTokenEncrypted', 'botToken'),
        ),
    };
  }

  private toRuntimeSlackConfig(config: Record<string, unknown>): SlackIntegrationConfig {
    const channelId = this.requireNonEmptyString(
      config.channelId ?? config.channel_id,
      'Slack channel_id is required.',
    );
    const storedBotToken = this.getStoredSecret(config, 'botTokenEncrypted', 'botToken');

    if (!storedBotToken) {
      throw new BadRequestException('Slack bot_token is required.');
    }

    return {
      channelId,
      botToken: this.integrationSecretsService.decryptSecret(storedBotToken),
    };
  }

  private buildStoredWebhookConfig(
    config: Record<string, unknown>,
    existingConfig?: Record<string, unknown>,
  ): Record<string, unknown> {
    const url = this.requireNonEmptyString(config.url, 'Webhook url is required.');
    const incomingSecret = this.normalizeOptionalString(config.secret);
    const existingSecret = this.getStoredSecret(existingConfig, 'secretEncrypted', 'secret');
    const secret = incomingSecret ?? existingSecret;

    if (!secret) {
      throw new BadRequestException('Webhook secret is required.');
    }

    return {
      url,
      secretEncrypted: this.integrationSecretsService.isEncryptedSecret(secret)
        ? secret
        : this.integrationSecretsService.encryptSecret(secret),
      secretMasked:
        incomingSecret
          ? this.integrationSecretsService.maskSecret(incomingSecret)
          : this.getStoredMask(existingConfig, 'secretMasked') ??
            this.maskStoredSecret(secret),
    };
  }

  private toPublicWebhookConfig(config: Record<string, unknown>): WebhookIntegrationConfig {
    return {
      url: this.requireNonEmptyString(config.url, 'Webhook url is required.'),
      secretConfigured: Boolean(
        this.getStoredSecret(config, 'secretEncrypted', 'secret'),
      ),
      secretMasked:
        this.getStoredMask(config, 'secretMasked') ??
        this.maskStoredSecret(this.getStoredSecret(config, 'secretEncrypted', 'secret')),
    };
  }

  private toRuntimeWebhookConfig(config: Record<string, unknown>): WebhookIntegrationConfig {
    const url = this.requireNonEmptyString(config.url, 'Webhook url is required.');
    const storedSecret = this.getStoredSecret(config, 'secretEncrypted', 'secret');

    if (!storedSecret) {
      throw new BadRequestException('Webhook secret is required.');
    }

    return {
      url,
      secret: this.integrationSecretsService.decryptSecret(storedSecret),
    };
  }

  private validateEmailConfig(config: Record<string, unknown>): EmailIntegrationConfig {
    const recipients = Array.isArray(config.recipients)
      ? config.recipients
      : typeof config.recipients === 'string'
        ? config.recipients
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : null;

    if (!recipients || recipients.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
      throw new BadRequestException('Email recipients must be a non-empty array of strings.');
    }

    return {
      recipients: recipients.map((value) => value.trim()),
    };
  }

  private requireConfigObject(configJson: unknown) {
    if (!configJson || typeof configJson !== 'object' || Array.isArray(configJson)) {
      throw new BadRequestException('Integration configJson must be an object.');
    }

    return configJson as Record<string, unknown>;
  }

  private requireNonEmptyString(value: unknown, message: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(message);
    }

    return value.trim();
  }

  private normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private getStoredSecret(
    config: Record<string, unknown> | undefined,
    encryptedField: string,
    legacyField: string,
  ) {
    if (!config) {
      return null;
    }

    return (
      this.normalizeOptionalString(config[encryptedField]) ??
      this.normalizeOptionalString(config[legacyField])
    );
  }

  private getStoredMask(config: Record<string, unknown> | undefined, field: string) {
    return config ? this.normalizeOptionalString(config[field]) : null;
  }

  private maskStoredSecret(value?: string | null) {
    if (!value) {
      return null;
    }

    if (this.integrationSecretsService.isEncryptedSecret(value)) {
      return 'configured';
    }

    return this.integrationSecretsService.maskSecret(value);
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
