import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type {
  CurrentOrganizationResponse,
  UpdateCurrentOrganizationInput,
} from '@approva/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaDbClient } from '../../common/prisma/prisma.types';
import { RequestContextService } from '../../common/observability/request-context.service';

export interface OrganizationContextInput {
  organizationId?: string | null;
  organizationSlug?: string | null;
}

export interface ResolvedOrganizationContext {
  id: string;
  name: string;
  slug: string;
}

export interface SelfHostedOperatorIdentity {
  userId: string;
  email: string;
  name: string;
  role: 'owner';
}

@Injectable()
export class OrganizationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultOrganization();
  }

  async resolveOrganization(
    input: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<ResolvedOrganizationContext> {
    const organizationId = this.normalizeOptionalString(input.organizationId);
    const organizationSlug = this.normalizeOptionalString(input.organizationSlug);

    if (!organizationId && !organizationSlug) {
      return this.ensureDefaultOrganization(prisma);
    }

    const organization = organizationId
      ? await prisma.organization.findUnique({
          where: {
            id: organizationId,
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        })
      : await prisma.organization.findUnique({
          where: {
            slug: organizationSlug!,
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    if (organizationId && organizationSlug && organization.slug !== organizationSlug) {
      throw new ConflictException('Organization id and slug refer to different organizations.');
    }

    await this.ensureLocalOperatorOwnership(organization.id, prisma);
    this.requestContextService.setOrganizationId(organization.id);

    return organization;
  }

  async ensureDefaultOrganization(
    prisma: PrismaDbClient = this.prisma,
  ): Promise<ResolvedOrganizationContext> {
    const slug = this.getDefaultOrganizationSlug();
    const name = this.getDefaultOrganizationName();

    const organization = await prisma.organization.upsert({
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

    await this.ensureLocalOperatorOwnership(organization.id, prisma);
    this.requestContextService.setOrganizationId(organization.id);

    return organization;
  }

  async isDefaultOrganizationId(
    organizationId: string,
    prisma: PrismaDbClient = this.prisma,
  ) {
    const organization = await this.ensureDefaultOrganization(prisma);
    return organization.id === organizationId;
  }

  async getCurrentOrganization(
    input: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<CurrentOrganizationResponse> {
    const organization = await this.resolveOrganizationRecord(input, prisma);

    return {
      organization: this.toOrganizationRecord(organization),
    };
  }

  async updateCurrentOrganization(
    input: UpdateCurrentOrganizationInput,
    organizationInput: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<CurrentOrganizationResponse> {
    const organization = await this.resolveOrganization(organizationInput, prisma);
    const name = this.normalizeOptionalString(input.name);

    if (!name) {
      throw new BadRequestException('Organization name is required.');
    }

    const updated = await prisma.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        name,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
      },
    });

    return {
      organization: this.toOrganizationRecord(updated),
    };
  }

  private async resolveOrganizationRecord(
    input: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ) {
    const organization = await this.resolveOrganization(input, prisma);

    return prisma.organization.findUniqueOrThrow({
      where: {
        id: organization.id,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
      },
    });
  }

  private toOrganizationRecord(organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
  }) {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt.toISOString(),
    };
  }

  private getDefaultOrganizationSlug() {
    return (
      this.normalizeOptionalString(process.env.APPROVA_DEFAULT_ORGANIZATION_SLUG) ??
      this.normalizeOptionalString(process.env.AUTHON_DEFAULT_ORGANIZATION_SLUG) ??
      'default'
    );
  }

  private getDefaultOrganizationName() {
    return (
      this.normalizeOptionalString(process.env.APPROVA_DEFAULT_ORGANIZATION_NAME) ??
      this.normalizeOptionalString(process.env.AUTHON_DEFAULT_ORGANIZATION_NAME) ??
      'Default Organization'
    );
  }

  async ensureLocalOperatorOwnership(
    organizationId: string,
    prisma: PrismaDbClient,
  ): Promise<SelfHostedOperatorIdentity> {
    const email = this.getLocalOperatorEmail();
    const name = this.getLocalOperatorName();

    const user = await prisma.user.upsert({
      where: {
        email,
      },
      update: {
        name,
      },
      create: {
        email,
        name,
      },
      select: {
        id: true,
      },
    });

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
      update: {
        role: 'owner',
      },
      create: {
        organizationId,
        userId: user.id,
        role: 'owner',
      },
    });

    return {
      userId: user.id,
      email,
      name,
      role: 'owner',
    };
  }

  private normalizeOptionalString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeEmail(value?: string | null) {
    return this.normalizeOptionalString(value)?.toLowerCase() ?? null;
  }

  private getLocalOperatorEmail() {
    return (
      this.normalizeEmail(process.env.APPROVA_LOCAL_OPERATOR_EMAIL) ??
      this.normalizeEmail(process.env.AUTHON_LOCAL_OPERATOR_EMAIL) ??
      'operator@local.approva'
    );
  }

  private getLocalOperatorName() {
    return (
      this.normalizeOptionalString(process.env.APPROVA_LOCAL_OPERATOR_NAME) ??
      this.normalizeOptionalString(process.env.AUTHON_LOCAL_OPERATOR_NAME) ??
      'Local operator'
    );
  }
}
