import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ApiKeyScope as SharedApiKeyScope,
  CreateOrganizationApiKeyInput,
  CreateOrganizationApiKeyResponse,
  CreateServiceAccountInput,
  OrganizationApiKeyListResponse,
  OrganizationApiKeyRecord,
  RevokeOrganizationApiKeyResponse,
  RevokeServiceAccountResponse,
  ServiceAccountListResponse,
  ServiceAccountRecord,
} from '@approva/shared';
import { ApiKeyScope as PrismaApiKeyScope } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaDbClient } from '../../common/prisma/prisma.types';
import { RequestContextService } from '../../common/observability/request-context.service';
import { generateOpaqueToken, hashTokenValue } from '../../common/utils/hash.util';
import {
  type OrganizationContextInput,
  OrganizationsService,
} from '../organizations/organizations.service';

const SHARED_TO_PRISMA_SCOPE: Record<SharedApiKeyScope, PrismaApiKeyScope> = {
  'approval_requests:create': 'approval_requests_create',
  'approval_requests:read': 'approval_requests_read',
  'capabilities:verify': 'capabilities_verify',
  'capabilities:use': 'capabilities_use',
  'webhooks:manage': 'webhooks_manage',
};

const PRISMA_TO_SHARED_SCOPE: Record<PrismaApiKeyScope, SharedApiKeyScope> = {
  approval_requests_create: 'approval_requests:create',
  approval_requests_read: 'approval_requests:read',
  capabilities_verify: 'capabilities:verify',
  capabilities_use: 'capabilities:use',
  webhooks_manage: 'webhooks:manage',
};

const PRIMARY_API_KEY_PREFIX = 'approva_sk';
const LEGACY_API_KEY_PREFIX = 'authon_sk';
const SUPPORTED_API_KEY_PREFIXES = [`${PRIMARY_API_KEY_PREFIX}_`, `${LEGACY_API_KEY_PREFIX}_`];

export interface MachineAuthPrincipal {
  organizationId: string;
  apiKeyId: string;
  apiKeyName: string;
  keyPrefix: string;
  scopes: SharedApiKeyScope[];
  serviceAccountId?: string | null;
  serviceAccountName?: string | null;
}

@Injectable()
export class MachineAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async authenticateFromAuthorizationHeader(
    authorizationHeader?: string | null,
    requiredScope?: SharedApiKeyScope,
  ): Promise<MachineAuthPrincipal | null> {
    const token = this.parseBearerToken(authorizationHeader);

    if (!token) {
      return null;
    }

    const apiKey = await this.prisma.organizationApiKey.findUnique({
      where: {
        keyHash: hashTokenValue(token),
      },
      include: {
        serviceAccount: {
          select: {
            id: true,
            name: true,
            revokedAt: true,
          },
        },
      },
    });

    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid API key.');
    }

    if (apiKey.serviceAccount?.revokedAt) {
      throw new UnauthorizedException('The linked service account has been revoked.');
    }

    const scopes = apiKey.scopes.map((scope) => PRISMA_TO_SHARED_SCOPE[scope]);

    if (requiredScope && !scopes.includes(requiredScope)) {
      throw new ForbiddenException(`API key is missing required scope ${requiredScope}.`);
    }

    await this.prisma.organizationApiKey.update({
      where: {
        id: apiKey.id,
      },
      data: {
        lastUsedAt: new Date(),
      },
    });

    const principal: MachineAuthPrincipal = {
      organizationId: apiKey.organizationId,
      apiKeyId: apiKey.id,
      apiKeyName: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes,
      serviceAccountId: apiKey.serviceAccountId,
      serviceAccountName: apiKey.serviceAccount?.name ?? null,
    };

    this.requestContextService.setContext({
      organizationId: principal.organizationId,
      userId: principal.serviceAccountId
        ? `service-account:${principal.serviceAccountId}`
        : `api-key:${principal.apiKeyId}`,
    });

    return principal;
  }

  async listServiceAccounts(
    organizationInput: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<ServiceAccountListResponse> {
    const organization = await this.organizationsService.resolveOrganization(
      organizationInput,
      prisma,
    );
    const items = await prisma.serviceAccount.findMany({
      where: {
        organizationId: organization.id,
      },
      orderBy: [
        {
          revokedAt: 'asc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });

    return {
      items: items.map((item) => this.toServiceAccountRecord(item)),
    };
  }

  async createServiceAccount(
    input: CreateServiceAccountInput,
    organizationInput: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<ServiceAccountRecord> {
    const organization = await this.organizationsService.resolveOrganization(
      organizationInput,
      prisma,
    );
    const name = this.normalizeRequiredString(input.name, 'Service account name is required.');

    const serviceAccount = await prisma.serviceAccount.create({
      data: {
        organizationId: organization.id,
        name,
        description: this.normalizeOptionalString(input.description),
      },
    });

    return this.toServiceAccountRecord(serviceAccount);
  }

  async revokeServiceAccount(
    id: string,
    organizationInput: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<RevokeServiceAccountResponse> {
    const organization = await this.organizationsService.resolveOrganization(
      organizationInput,
      prisma,
    );

    const existing = await prisma.serviceAccount.findFirst({
      where: {
        id,
        organizationId: organization.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Service account not found.');
    }

    await prisma.serviceAccount.update({
      where: {
        id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      revoked: true,
      id,
    };
  }

  async listApiKeys(
    organizationInput: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<OrganizationApiKeyListResponse> {
    const organization = await this.organizationsService.resolveOrganization(
      organizationInput,
      prisma,
    );
    const items = await prisma.organizationApiKey.findMany({
      where: {
        organizationId: organization.id,
      },
      include: {
        serviceAccount: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        {
          revokedAt: 'asc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });

    return {
      items: items.map((item) => this.toApiKeyRecord(item)),
    };
  }

  async createApiKey(
    input: CreateOrganizationApiKeyInput,
    organizationInput: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<CreateOrganizationApiKeyResponse> {
    const organization = await this.organizationsService.resolveOrganization(
      organizationInput,
      prisma,
    );
    const name = this.normalizeRequiredString(input.name, 'API key name is required.');
    const serviceAccountId = this.normalizeOptionalString(input.serviceAccountId);

    if (serviceAccountId) {
      const serviceAccount = await prisma.serviceAccount.findFirst({
        where: {
          id: serviceAccountId,
          organizationId: organization.id,
        },
        select: {
          id: true,
          revokedAt: true,
        },
      });

      if (!serviceAccount) {
        throw new NotFoundException('Service account not found.');
      }

      if (serviceAccount.revokedAt) {
        throw new ForbiddenException('Cannot create an API key for a revoked service account.');
      }
    }

    const rawKey = generateOpaqueToken({
      prefix: PRIMARY_API_KEY_PREFIX,
      randomLength: 32,
    });
    const keyRecord = await prisma.organizationApiKey.create({
      data: {
        organizationId: organization.id,
        serviceAccountId,
        name,
        keyPrefix: this.buildKeyPrefix(rawKey),
        keyHash: hashTokenValue(rawKey),
        scopes: input.scopes.map((scope) => SHARED_TO_PRISMA_SCOPE[scope]),
      },
      include: {
        serviceAccount: {
          select: {
            name: true,
          },
        },
      },
    });

    return {
      apiKey: this.toApiKeyRecord(keyRecord),
      rawKey,
    };
  }

  async revokeApiKey(
    id: string,
    organizationInput: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<RevokeOrganizationApiKeyResponse> {
    const organization = await this.organizationsService.resolveOrganization(
      organizationInput,
      prisma,
    );

    const existing = await prisma.organizationApiKey.findFirst({
      where: {
        id,
        organizationId: organization.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('API key not found.');
    }

    await prisma.organizationApiKey.update({
      where: {
        id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      revoked: true,
      id,
    };
  }

  private parseBearerToken(authorizationHeader?: string | null) {
    const header = this.normalizeOptionalString(authorizationHeader);

    if (!header) {
      return null;
    }

    const [scheme, token, extra] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
      throw new UnauthorizedException('Authorization header must use Bearer auth.');
    }

    if (!SUPPORTED_API_KEY_PREFIXES.some((prefix) => token.startsWith(prefix))) {
      throw new UnauthorizedException('Invalid API key format.');
    }

    return token;
  }

  private buildKeyPrefix(rawKey: string) {
    return rawKey.slice(0, Math.min(rawKey.length, 22));
  }

  private toServiceAccountRecord(input: {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    revokedAt: Date | null;
  }): ServiceAccountRecord {
    return {
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      createdAt: input.createdAt.toISOString(),
      revokedAt: input.revokedAt?.toISOString() ?? null,
    };
  }

  private toApiKeyRecord(input: {
    id: string;
    organizationId: string;
    serviceAccountId: string | null;
    name: string;
    keyPrefix: string;
    scopes: PrismaApiKeyScope[];
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    serviceAccount?: {
      name: string;
    } | null;
  }): OrganizationApiKeyRecord {
    return {
      id: input.id,
      organizationId: input.organizationId,
      serviceAccountId: input.serviceAccountId,
      serviceAccountName: input.serviceAccount?.name ?? null,
      name: input.name,
      keyPrefix: input.keyPrefix,
      scopes: input.scopes.map((scope) => PRISMA_TO_SHARED_SCOPE[scope]),
      lastUsedAt: input.lastUsedAt?.toISOString() ?? null,
      revokedAt: input.revokedAt?.toISOString() ?? null,
      createdAt: input.createdAt.toISOString(),
    };
  }

  private normalizeOptionalString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeRequiredString(value: string | null | undefined, message: string) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }
}
