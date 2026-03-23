import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type {
  CreateLocalUserInput,
  CurrentOrganizationResponse,
  LocalUserListResponse,
  LocalUserRecord,
  OrganizationSecurityEvent,
  OrganizationSecurityEventListResponse,
  RemoveLocalUserResponse,
  UpdateCurrentOrganizationInput,
  UpdateLocalUserInput,
} from '@approva/shared';
import type { OrganizationMemberRole, RiskLevel } from '@prisma/client';
import { hashPassword } from '../../common/security/password.util';
import { hashCanonicalValue } from '../../common/utils/hash.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaDbClient } from '../../common/prisma/prisma.types';
import { RequestContextService } from '../../common/observability/request-context.service';
import type { EventChainService } from '../audit/event-chain.service';

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

const ORGANIZATION_SECURITY_EVENT_PREFIX = 'organization.user.';
const ORGANIZATION_SECURITY_EVENT_LIMIT = 12;

const DEFAULT_SELF_HOST_POLICIES: Array<{
  action: string;
  resourceType: string;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  approverRoles: OrganizationMemberRole[];
}> = [
  {
    action: '*',
    resourceType: '*',
    riskLevel: 'high',
    approvalRequired: true,
    approverRoles: ['owner', 'admin', 'approver'],
  },
  {
    action: '*',
    resourceType: '*',
    riskLevel: 'critical',
    approvalRequired: true,
    approverRoles: ['owner', 'admin', 'approver'],
  },
];

@Injectable()
export class OrganizationsService implements OnModuleInit {
  private eventChainService?: EventChainService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly moduleRef: ModuleRef,
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
    await this.ensureDefaultPolicies(organization.id, prisma);
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

  async listLocalUsers(
    input: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<LocalUserListResponse> {
    const organization = await this.resolveOrganization(input, prisma);
    const memberships = await prisma.organizationMember.findMany({
      where: {
        organizationId: organization.id,
      },
      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          user: {
            email: 'asc',
          },
        },
      ],
      select: {
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            disabledAt: true,
          },
        },
      },
    });

    const approverUsers = await prisma.approverUser.findMany({
      where: {
        email: {
          in: memberships
            .map((membership) => membership.user.email?.toLowerCase() ?? null)
            .filter((value): value is string => Boolean(value)),
        },
      },
      select: {
        email: true,
        status: true,
        credentials: {
          select: {
            id: true,
            lastUsedAt: true,
          },
        },
      },
    });
    const approverUserByEmail = new Map(
      approverUsers.map((approverUser) => [
        approverUser.email.toLowerCase(),
        approverUser,
      ]),
    );

    return {
      items: memberships
        .filter((membership) => membership.user.email)
        .map((membership) =>
          this.toLocalUserRecord(
            membership.user,
            membership.role,
            membership.createdAt,
            approverUserByEmail.get(membership.user.email!.toLowerCase()) ?? null,
          ),
        ),
    };
  }

  async listOrganizationSecurityEvents(
    input: OrganizationContextInput = {},
    prisma: PrismaDbClient = this.prisma,
  ): Promise<OrganizationSecurityEventListResponse> {
    const organization = await this.resolveOrganization(input, prisma);
    const immutableEvents = await prisma.immutableEvent.findMany({
      where: {
        organizationId: organization.id,
        eventType: {
          startsWith: ORGANIZATION_SECURITY_EVENT_PREFIX,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: ORGANIZATION_SECURITY_EVENT_LIMIT,
      include: {
        ledgerEntry: {
          select: {
            sequence: true,
            entryHash: true,
          },
        },
      },
    });

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        organizationId: organization.id,
        eventType: {
          startsWith: ORGANIZATION_SECURITY_EVENT_PREFIX,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: ORGANIZATION_SECURITY_EVENT_LIMIT * 2,
      select: {
        eventType: true,
        actorType: true,
        actorId: true,
        payload: true,
      },
    });

    const actorIds = auditEvents
      .map((event) => event.actorId)
      .filter((value): value is string => Boolean(value));
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: {
            id: {
              in: actorIds,
            },
          },
          select: {
            id: true,
            email: true,
            name: true,
          },
        })
      : [];
    const actorDisplayById = new Map(
      actors.map((actor) => [
        actor.id,
        actor.name?.trim()
          ? `${actor.name} (${actor.email ?? actor.id})`
          : actor.email ?? actor.id,
      ]),
    );

    return {
      items: this.buildOrganizationSecurityTimeline(
        immutableEvents,
        auditEvents,
        actorDisplayById,
      ),
    };
  }

  async createLocalUser(
    input: CreateLocalUserInput,
    organizationInput: OrganizationContextInput = {},
    actingUserId?: string | null,
    prisma: PrismaDbClient = this.prisma,
  ): Promise<LocalUserRecord> {
    const organization = await this.resolveOrganization(organizationInput, prisma);
    const email = this.normalizeEmail(input.email);
    const name = this.normalizeOptionalString(input.name);

    if (!email || !name) {
      throw new BadRequestException('Name and email are required.');
    }

    if (input.role === 'owner') {
      throw new ConflictException(
        'Create the user first, then use the dedicated grant-owner action to add owner access.',
      );
    }

    const passwordHash = await hashPassword(input.password);
    const now = new Date();
    return this.runWriteTransaction(prisma, async (tx) => {
      const user = await tx.user.upsert({
        where: {
          email,
        },
        update: {
          name,
          passwordHash,
          passwordSetAt: now,
          disabledAt: null,
        },
        create: {
          email,
          name,
          passwordHash,
          passwordSetAt: now,
        },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          disabledAt: true,
        },
      });

      const membership = await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.id,
          },
        },
        update: {
          role: input.role,
        },
        create: {
          organizationId: organization.id,
          userId: user.id,
          role: input.role,
        },
        select: {
          role: true,
          createdAt: true,
        },
      });

      const approverUser = await this.syncApproverIdentity(
        {
          email,
          name,
          status: 'active',
        },
        tx,
      );

      await this.recordLocalUserLifecycleEvent(
        {
          organizationId: organization.id,
          actingUserId,
          eventType: 'organization.user.created',
          targetUserId: user.id,
          email,
          payload: {
            targetUser: {
              id: user.id,
              email,
              name,
              role: membership.role,
              status: 'active',
            },
            passwordConfigured: true,
          },
        },
        tx,
      );

      return this.toLocalUserRecord(user, membership.role, membership.createdAt, approverUser);
    });
  }

  async updateLocalUser(
    userId: string,
    input: UpdateLocalUserInput,
    organizationInput: OrganizationContextInput = {},
    actingUserId?: string | null,
    prisma: PrismaDbClient = this.prisma,
  ): Promise<LocalUserRecord> {
    const organization = await this.resolveOrganization(organizationInput, prisma);
    const name = this.normalizeOptionalString(input.name);

    if (!name) {
      throw new BadRequestException('User name is required.');
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId,
        },
      },
      select: {
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            disabledAt: true,
          },
        },
      },
    });

    if (!membership || !membership.user.email) {
      throw new NotFoundException('Local user not found in this organization.');
    }

    const membershipEmail = membership.user.email;

    if (membership.role !== 'owner' && input.role === 'owner') {
      throw new ConflictException(
        'Use the dedicated grant-owner action when promoting a user to owner.',
      );
    }

    if (membership.role === 'owner' && input.role !== 'owner') {
      throw new ConflictException(
        'Use the dedicated reduce-owner action when removing owner access from a user.',
      );
    }

    if (membership.role === 'owner') {
      await this.assertActingUserIsOwner(organization.id, actingUserId, prisma);
    }

    if (actingUserId && actingUserId === membership.user.id && input.password) {
      throw new ConflictException(
        'Use Console Settings to rotate your own password so your current session stays controlled.',
      );
    }

    await this.assertOwnerMutationAllowed(organization.id, membership.user.id, input.role, actingUserId, prisma);

    const now = new Date();
    const nextStatus = membership.user.disabledAt ? 'disabled' : 'active';

    return this.runWriteTransaction(prisma, async (tx) => {
      const user = await tx.user.update({
        where: {
          id: membership.user.id,
        },
        data: {
          name,
          ...(input.password
            ? {
                passwordHash: await hashPassword(input.password),
                passwordSetAt: now,
              }
            : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          disabledAt: true,
        },
      });

      const updatedMembership = await tx.organizationMember.update({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: membership.user.id,
          },
        },
        data: {
          role: input.role,
        },
        select: {
          role: true,
          createdAt: true,
        },
      });

      if (input.password) {
        await tx.consoleSession.deleteMany({
          where: {
            userId: membership.user.id,
          },
        });
      }

      const approverUser = await this.syncApproverIdentity(
        {
          email: membershipEmail,
          name,
          status: nextStatus,
        },
        tx,
      );

      await this.recordLocalUserLifecycleEvent(
        {
          organizationId: organization.id,
          actingUserId,
          eventType: 'organization.user.updated',
          targetUserId: membership.user.id,
          email: membershipEmail,
          payload: {
            targetUser: {
              id: membership.user.id,
              email: membershipEmail,
            },
            before: {
              name: membership.user.name,
              role: membership.role,
              status: nextStatus,
            },
            after: {
              name,
              role: updatedMembership.role,
              status: nextStatus,
            },
            passwordRotated: Boolean(input.password),
            consoleSessionsRevoked: Boolean(input.password),
          },
        },
        tx,
      );

      return this.toLocalUserRecord(
        user,
        updatedMembership.role,
        updatedMembership.createdAt,
        approverUser,
      );
    });
  }

  async grantLocalUserOwnerAccess(
    userId: string,
    organizationInput: OrganizationContextInput = {},
    actingUserId?: string | null,
    prisma: PrismaDbClient = this.prisma,
  ): Promise<LocalUserRecord> {
    const organization = await this.resolveOrganization(organizationInput, prisma);
    const membership = await this.getLocalUserMembershipForMutation(organization.id, userId, prisma);

    await this.assertActingUserIsOwner(organization.id, actingUserId, prisma);

    if (membership.user.disabledAt) {
      throw new ConflictException('Enable this user before granting owner access.');
    }

    if (membership.role === 'owner') {
      return this.toLocalUserRecord(
        membership.user,
        membership.role,
        membership.createdAt,
        membership.approverUser,
      );
    }

    const updated = await this.runWriteTransaction(prisma, async (tx) => {
      const updatedMembership = await tx.organizationMember.update({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: membership.user.id,
          },
        },
        data: {
          role: 'owner',
        },
        select: {
          role: true,
          createdAt: true,
        },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: {
          id: membership.user.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          disabledAt: true,
        },
      });

      await this.recordLocalUserLifecycleEvent(
        {
          organizationId: organization.id,
          actingUserId,
          eventType: 'organization.user.owner_granted',
          targetUserId: membership.user.id,
          email: membership.user.email,
          payload: {
            targetUser: {
              id: membership.user.id,
              email: membership.user.email,
              name: user.name ?? membership.user.email,
            },
            before: {
              role: membership.role,
            },
            after: {
              role: 'owner',
            },
          },
        },
        tx,
      );

      return {
        user,
        updatedMembership,
      };
    });

    return this.toLocalUserRecord(
      updated.user,
      updated.updatedMembership.role,
      updated.updatedMembership.createdAt,
      membership.approverUser,
    );
  }

  async reduceLocalUserOwnerAccess(
    userId: string,
    organizationInput: OrganizationContextInput = {},
    actingUserId?: string | null,
    prisma: PrismaDbClient = this.prisma,
  ): Promise<LocalUserRecord> {
    const organization = await this.resolveOrganization(organizationInput, prisma);
    const membership = await this.getLocalUserMembershipForMutation(organization.id, userId, prisma);

    await this.assertActingUserIsOwner(organization.id, actingUserId, prisma);

    if (membership.role !== 'owner') {
      throw new ConflictException('This user does not currently have owner access.');
    }

    await this.assertOwnerMutationAllowed(
      organization.id,
      membership.user.id,
      'admin',
      actingUserId,
      prisma,
    );

    const updated = await this.runWriteTransaction(prisma, async (tx) => {
      const updatedMembership = await tx.organizationMember.update({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: membership.user.id,
          },
        },
        data: {
          role: 'admin',
        },
        select: {
          role: true,
          createdAt: true,
        },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: {
          id: membership.user.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          disabledAt: true,
        },
      });

      await this.recordLocalUserLifecycleEvent(
        {
          organizationId: organization.id,
          actingUserId,
          eventType: 'organization.user.owner_reduced',
          targetUserId: membership.user.id,
          email: membership.user.email,
          payload: {
            targetUser: {
              id: membership.user.id,
              email: membership.user.email,
              name: user.name ?? membership.user.email,
            },
            before: {
              role: 'owner',
            },
            after: {
              role: 'admin',
            },
          },
        },
        tx,
      );

      return {
        user,
        updatedMembership,
      };
    });

    return this.toLocalUserRecord(
      updated.user,
      updated.updatedMembership.role,
      updated.updatedMembership.createdAt,
      membership.approverUser,
    );
  }

  async disableLocalUser(
    userId: string,
    organizationInput: OrganizationContextInput = {},
    actingUserId?: string | null,
    prisma: PrismaDbClient = this.prisma,
  ): Promise<LocalUserRecord> {
    const organization = await this.resolveOrganization(organizationInput, prisma);
    const membership = await this.getLocalUserMembershipForMutation(organization.id, userId, prisma);

    if (membership.user.disabledAt) {
      return this.toLocalUserRecord(
        membership.user,
        membership.role,
        membership.createdAt,
        membership.approverUser,
      );
    }

    await this.assertLocalUserLifecycleAllowed(
      organization.id,
      membership.user.id,
      membership.user.email,
      membership.role,
      'disable',
      actingUserId,
      prisma,
    );

    const disabledAt = new Date();
    const updated = await this.runWriteTransaction(prisma, async (tx) => {
      const user = await tx.user.update({
        where: {
          id: membership.user.id,
        },
        data: {
          disabledAt,
        },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          disabledAt: true,
        },
      });

      await this.clearLocalUserSessions(membership.user.id, membership.user.email, tx);
      const approverUser = await this.syncApproverIdentity(
        {
          email: membership.user.email,
          name: user.name ?? membership.user.email,
          status: 'disabled',
        },
        tx,
      );

      await this.recordLocalUserLifecycleEvent(
        {
          organizationId: organization.id,
          actingUserId,
          eventType: 'organization.user.disabled',
          targetUserId: membership.user.id,
          email: membership.user.email,
          payload: {
            targetUser: {
              id: membership.user.id,
              email: membership.user.email,
              name: user.name ?? membership.user.email,
              role: membership.role,
              status: 'disabled',
            },
            disabledAt: disabledAt.toISOString(),
          },
        },
        tx,
      );

      return {
        user,
        approverUser,
      };
    });

    return this.toLocalUserRecord(
      updated.user,
      membership.role,
      membership.createdAt,
      updated.approverUser,
    );
  }

  async enableLocalUser(
    userId: string,
    organizationInput: OrganizationContextInput = {},
    actingUserId?: string | null,
    prisma: PrismaDbClient = this.prisma,
  ): Promise<LocalUserRecord> {
    const organization = await this.resolveOrganization(organizationInput, prisma);
    const membership = await this.getLocalUserMembershipForMutation(organization.id, userId, prisma);

    await this.assertLocalUserLifecycleAllowed(
      organization.id,
      membership.user.id,
      membership.user.email,
      membership.role,
      'enable',
      actingUserId,
      prisma,
    );

    const updated = await this.runWriteTransaction(prisma, async (tx) => {
      const user = await tx.user.update({
        where: {
          id: membership.user.id,
        },
        data: {
          disabledAt: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          disabledAt: true,
        },
      });

      const approverUser = await this.syncApproverIdentity(
        {
          email: membership.user.email,
          name: user.name ?? membership.user.email,
          status: 'active',
        },
        tx,
      );

      await this.recordLocalUserLifecycleEvent(
        {
          organizationId: organization.id,
          actingUserId,
          eventType: 'organization.user.enabled',
          targetUserId: membership.user.id,
          email: membership.user.email,
          payload: {
            targetUser: {
              id: membership.user.id,
              email: membership.user.email,
              name: user.name ?? membership.user.email,
              role: membership.role,
              status: 'active',
            },
          },
        },
        tx,
      );

      return {
        user,
        approverUser,
      };
    });

    return this.toLocalUserRecord(
      updated.user,
      membership.role,
      membership.createdAt,
      updated.approverUser,
    );
  }

  async removeLocalUser(
    userId: string,
    organizationInput: OrganizationContextInput = {},
    actingUserId?: string | null,
    prisma: PrismaDbClient = this.prisma,
  ): Promise<RemoveLocalUserResponse> {
    const organization = await this.resolveOrganization(organizationInput, prisma);
    const membership = await this.getLocalUserMembershipForMutation(organization.id, userId, prisma);

    await this.assertLocalUserLifecycleAllowed(
      organization.id,
      membership.user.id,
      membership.user.email,
      membership.role,
      'remove',
      actingUserId,
      prisma,
    );

    await this.runWriteTransaction(prisma, async (tx) => {
      await this.clearLocalUserSessions(membership.user.id, membership.user.email, tx);
      await tx.organizationMember.delete({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: membership.user.id,
          },
        },
      });

      if (membership.user.email) {
        await tx.approverUser.updateMany({
          where: {
            email: membership.user.email,
          },
          data: {
            status: 'disabled',
            registrationChallenge: null,
            registrationChallengeExpiresAt: null,
            authenticationChallenge: null,
            authenticationChallengeExpiresAt: null,
          },
        });
      }

      await this.recordLocalUserLifecycleEvent(
        {
          organizationId: organization.id,
          actingUserId,
          eventType: 'organization.user.removed',
          targetUserId: membership.user.id,
          email: membership.user.email,
          payload: {
            targetUser: {
              id: membership.user.id,
              email: membership.user.email,
              name: membership.user.name,
              role: membership.role,
            },
          },
        },
        tx,
      );
    });

    return {
      removed: true,
      id: membership.user.id,
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

  private toLocalUserRecord(
    user: {
      id: string;
      email: string | null;
      name: string | null;
      passwordHash?: string | null;
      disabledAt?: Date | null;
    },
    role: OrganizationMemberRole,
    createdAt: Date,
    approverUser: {
      status?: 'active' | 'disabled';
      credentials: Array<{
        lastUsedAt: Date | null;
      }>;
    } | null,
  ): LocalUserRecord {
    const lastPasskeyUsedAt =
      approverUser?.credentials
        .map((credential) => credential.lastUsedAt?.getTime() ?? 0)
        .sort((left, right) => right - left)[0] ?? 0;

    return {
      id: user.id,
      email: user.email ?? '',
      name: user.name ?? null,
      role,
      status: user.disabledAt ? 'disabled' : 'active',
      isBootstrapOperator:
        Boolean(user.email) && user.email?.toLowerCase() === this.getLocalOperatorEmail(),
      createdAt: createdAt.toISOString(),
      disabledAt: user.disabledAt?.toISOString() ?? null,
      passwordConfigured: Boolean(user.passwordHash),
      passkeyCount: approverUser?.credentials.length ?? 0,
      lastPasskeyUsedAt: lastPasskeyUsedAt > 0 ? new Date(lastPasskeyUsedAt).toISOString() : null,
    };
  }

  private async syncApproverIdentity(
    input: {
      email: string;
      name: string;
      status: 'active' | 'disabled';
    },
    prisma: PrismaDbClient,
  ) {
    return prisma.approverUser.upsert({
      where: {
        email: input.email,
      },
      update: {
        displayName: input.name,
        status: input.status,
        ...(input.status === 'disabled'
          ? {
              registrationChallenge: null,
              registrationChallengeExpiresAt: null,
              authenticationChallenge: null,
              authenticationChallengeExpiresAt: null,
            }
          : {}),
      },
      create: {
        email: input.email,
        displayName: input.name,
        status: input.status,
      },
      select: {
        status: true,
        credentials: {
          select: {
            lastUsedAt: true,
          },
        },
      },
    });
  }

  private async assertOwnerMutationAllowed(
    organizationId: string,
    targetUserId: string,
    nextRole: OrganizationMemberRole,
    actingUserId: string | null | undefined,
    prisma: PrismaDbClient,
  ) {
    const ownerCount = await prisma.organizationMember.count({
      where: {
        organizationId,
        role: 'owner',
      },
    });

    const targetMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: targetUserId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!targetMembership) {
      throw new NotFoundException('Organization membership not found.');
    }

    const targetUser = await prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        email: true,
      },
    });

    if (targetMembership.role === 'owner' && nextRole !== 'owner' && ownerCount <= 1) {
      throw new ConflictException('The last organization owner cannot be demoted.');
    }

    if (
      actingUserId &&
      actingUserId === targetUserId &&
      targetMembership.role === 'owner' &&
      nextRole !== 'owner'
    ) {
      throw new ConflictException('You cannot remove your own owner access.');
    }

    if (targetUser?.email === this.getLocalOperatorEmail() && nextRole !== 'owner') {
      throw new ConflictException('The bootstrap operator account must remain an owner.');
    }
  }

  private async getLocalUserMembershipForMutation(
    organizationId: string,
    userId: string,
    prisma: PrismaDbClient,
  ) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: {
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            disabledAt: true,
          },
        },
      },
    });

    if (!membership || !membership.user.email) {
      throw new NotFoundException('Local user not found in this organization.');
    }

    const approverUser = await prisma.approverUser.findUnique({
      where: {
        email: membership.user.email,
      },
      select: {
        status: true,
        credentials: {
          select: {
            lastUsedAt: true,
          },
        },
      },
    });

    return {
      ...membership,
      user: {
        ...membership.user,
        email: membership.user.email,
      },
      approverUser,
    };
  }

  private async assertLocalUserLifecycleAllowed(
    organizationId: string,
    targetUserId: string,
    targetEmail: string | null,
    targetRole: OrganizationMemberRole,
    action: 'disable' | 'enable' | 'remove',
    actingUserId: string | null | undefined,
    prisma: PrismaDbClient,
  ) {
    if (targetRole === 'owner') {
      await this.assertActingUserIsOwner(organizationId, actingUserId, prisma);
    }

    if (action === 'enable') {
      return;
    }

    const ownerCount = await prisma.organizationMember.count({
      where: {
        organizationId,
        role: 'owner',
      },
    });

    if (targetRole === 'owner' && ownerCount <= 1) {
      throw new ConflictException(
        `The last organization owner cannot be ${action === 'remove' ? 'removed' : 'disabled'}.`,
      );
    }

    if (actingUserId && actingUserId === targetUserId) {
      throw new ConflictException(
        `You cannot ${action === 'remove' ? 'remove' : 'disable'} your own console user.`,
      );
    }

    if (targetEmail && targetEmail === this.getLocalOperatorEmail()) {
      throw new ConflictException(
        `The bootstrap operator account cannot be ${action === 'remove' ? 'removed' : 'disabled'}.`,
      );
    }
  }

  private async assertActingUserIsOwner(
    organizationId: string,
    actingUserId: string | null | undefined,
    prisma: PrismaDbClient,
  ) {
    if (!actingUserId) {
      throw new ForbiddenException(
        'Only a current organization owner can manage owner access.',
      );
    }

    const actingMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actingUserId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!actingMembership || actingMembership.role !== 'owner') {
      throw new ForbiddenException(
        'Only a current organization owner can manage owner access.',
      );
    }
  }

  private async clearLocalUserSessions(
    userId: string,
    email: string | null,
    prisma: PrismaDbClient,
  ) {
    await prisma.consoleSession.deleteMany({
      where: {
        userId,
      },
    });

    if (!email) {
      return;
    }

    const approverUser = await prisma.approverUser.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (!approverUser) {
      return;
    }

    await prisma.approverSession.deleteMany({
      where: {
        approverUserId: approverUser.id,
      },
    });
  }

  private async recordLocalUserLifecycleEvent(
    input: {
      organizationId: string;
      actingUserId?: string | null;
      eventType: string;
      targetUserId: string;
      email: string;
      payload: Record<string, unknown>;
    },
    prisma: PrismaDbClient,
  ) {
    const eventChainService =
      this.eventChainService ?? this.resolveEventChainService();

    if (!eventChainService) {
      return;
    }

    this.eventChainService = eventChainService;

    await eventChainService.recordEvent(
      {
        organizationId: input.organizationId,
        eventType: input.eventType,
        actorType: input.actingUserId ? 'human' : 'system',
        actorId: input.actingUserId ?? undefined,
        payload: {
          ...input.payload,
          targetUserId: input.targetUserId,
          targetEmail: input.email,
        },
      },
      prisma,
    );
  }

  private resolveEventChainService() {
    const { EventChainService } =
      require('../audit/event-chain.service') as typeof import('../audit/event-chain.service');

    return this.moduleRef.get(EventChainService, { strict: false });
  }

  private runWriteTransaction<T>(
    prisma: PrismaDbClient,
    callback: (client: PrismaDbClient) => Promise<T>,
  ) {
    if ('$transaction' in prisma) {
      return prisma.$transaction(async (tx) => callback(tx));
    }

    return callback(prisma);
  }

  private buildOrganizationSecurityTimeline(
    immutableEvents: Array<{
      id: string;
      eventType: string;
      createdAt: Date;
      payload: unknown;
      payloadHash: string;
      ledgerEntry?: {
        sequence: number;
        entryHash: string;
      } | null;
    }>,
    auditEvents: Array<{
      eventType: string;
      actorType: string;
      actorId: string | null;
      payload: unknown;
    }>,
    actorDisplayById: Map<string, string>,
  ): OrganizationSecurityEvent[] {
    const auditQueues = new Map<
      string,
      Array<{
        actorType: string;
        actorId: string | null;
      }>
    >();

    for (const auditEvent of auditEvents) {
      const payload = this.normalizeEventPayload(auditEvent.payload);
      const key = this.buildEventKey(auditEvent.eventType, hashCanonicalValue(payload));
      const queue = auditQueues.get(key) ?? [];

      queue.push({
        actorType: auditEvent.actorType,
        actorId: auditEvent.actorId,
      });

      auditQueues.set(key, queue);
    }

    return immutableEvents.map((immutableEvent) => {
      const payload = this.normalizeEventPayload(immutableEvent.payload);
      const key = this.buildEventKey(immutableEvent.eventType, immutableEvent.payloadHash);
      const auditMatch = auditQueues.get(key)?.shift();

      return {
        immutableEventId: immutableEvent.id,
        eventType: immutableEvent.eventType,
        createdAt: immutableEvent.createdAt.toISOString(),
        actorType: auditMatch?.actorType ?? null,
        actorId: auditMatch?.actorId ?? null,
        actorDisplay: auditMatch?.actorId
          ? actorDisplayById.get(auditMatch.actorId) ?? auditMatch.actorId
          : null,
        payload,
        payloadHash: immutableEvent.payloadHash,
        ledgerSequence: immutableEvent.ledgerEntry?.sequence ?? null,
        ledgerEntryHash: immutableEvent.ledgerEntry?.entryHash ?? null,
      };
    });
  }

  private buildEventKey(eventType: string, payloadHash: string) {
    return `${eventType}:${payloadHash}`;
  }

  private normalizeEventPayload(payload: unknown): Record<string, unknown> {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }

    return {
      value: payload,
    };
  }

  getDefaultOrganizationSlug() {
    return (
      this.normalizeOptionalString(process.env.APPROVA_DEFAULT_ORGANIZATION_SLUG) ??
      this.normalizeOptionalString(process.env.AUTHON_DEFAULT_ORGANIZATION_SLUG) ??
      'default'
    );
  }

  getDefaultOrganizationName() {
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

  private async ensureDefaultPolicies(organizationId: string, prisma: PrismaDbClient) {
    for (const policy of DEFAULT_SELF_HOST_POLICIES) {
      await prisma.policy.upsert({
        where: {
          organizationId_action_resourceType_riskLevel: {
            organizationId,
            action: policy.action,
            resourceType: policy.resourceType,
            riskLevel: policy.riskLevel,
          },
        },
        update: {},
        create: {
          organizationId,
          action: policy.action,
          resourceType: policy.resourceType,
          riskLevel: policy.riskLevel,
          approvalRequired: policy.approvalRequired,
          approverRoles: policy.approverRoles,
        },
      });
    }
  }

  private normalizeOptionalString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeEmail(value?: string | null) {
    return this.normalizeOptionalString(value)?.toLowerCase() ?? null;
  }

  getLocalOperatorEmail() {
    return (
      this.normalizeEmail(process.env.APPROVA_LOCAL_OPERATOR_EMAIL) ??
      this.normalizeEmail(process.env.AUTHON_LOCAL_OPERATOR_EMAIL) ??
      'operator@local.approva'
    );
  }

  getLocalOperatorName() {
    return (
      this.normalizeOptionalString(process.env.APPROVA_LOCAL_OPERATOR_NAME) ??
      this.normalizeOptionalString(process.env.AUTHON_LOCAL_OPERATOR_NAME) ??
      'Local operator'
    );
  }
}
