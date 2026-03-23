import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  ApproverAuthorizationSummary,
  OrganizationMemberRole,
  OrganizationPermission,
} from '@approva/shared';
import { hasOrganizationPermission } from '@approva/shared';
import type { PrismaDbClient } from '../../common/prisma/prisma.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type OrganizationContextInput,
  OrganizationsService,
} from './organizations.service';

export interface AuthorizedOrganizationMember {
  organizationId: string;
  userId: string;
  role: OrganizationMemberRole;
}

@Injectable()
export class OrganizationRbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async requirePermission(
    permission: OrganizationPermission,
    organizationInput: OrganizationContextInput,
    dashboardUserId?: string | null,
    prisma: PrismaDbClient = this.prisma,
  ): Promise<AuthorizedOrganizationMember> {
    const userId = this.normalizeOptionalString(dashboardUserId);

    if (!userId) {
      throw new ForbiddenException(
        'Local console authentication is required before using this operator endpoint.',
      );
    }

    const organization = await this.organizationsService.resolveOrganization(
      organizationInput,
      prisma,
    );
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization and cannot use this operator endpoint.',
      );
    }

    if (!hasOrganizationPermission(membership.role, permission)) {
      throw new ForbiddenException(
        `Your role does not have the required permission for ${permission}.`,
      );
    }

    return {
      organizationId: organization.id,
      userId,
      role: membership.role,
    };
  }

  async requireApproverRole(
    organizationId: string,
    approverEmail: string,
    allowedRoles: OrganizationMemberRole[],
    prisma: PrismaDbClient = this.prisma,
  ) {
    const authorization = await this.getApproverAuthorization(
      organizationId,
      approverEmail,
      allowedRoles,
      prisma,
    );

    if (!authorization.authorized) {
      throw new ForbiddenException(authorization.message);
    }

    return {
      role: authorization.approverRole!,
      userId: authorization.userId!,
    };
  }

  async getApproverAuthorization(
    organizationId: string,
    approverEmail: string | null | undefined,
    allowedRoles: OrganizationMemberRole[],
    prisma: PrismaDbClient = this.prisma,
  ): Promise<
    ApproverAuthorizationSummary & {
      userId?: string | null;
    }
  > {
    const email = this.normalizeOptionalString(approverEmail)?.toLowerCase() ?? null;

    if (!email) {
      return {
        authorized: false,
        code: 'approver_email_missing',
        message: 'Approver email is missing from the passkey-authenticated session.',
        allowedRoles,
        approverEmail: null,
        approverRole: null,
        userId: null,
      };
    }

    if (allowedRoles.length === 0) {
      return {
        authorized: false,
        code: 'no_allowed_roles_configured',
        message: 'No approver roles are configured for the matched policy on this request.',
        allowedRoles,
        approverEmail: email,
        approverRole: null,
        userId: null,
      };
    }

    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId,
        user: {
          email,
          disabledAt: null,
        },
      },
      select: {
        role: true,
        userId: true,
      },
    });

    const fallbackAuthorization = await this.getDefaultOrganizationFallbackAuthorization(
      organizationId,
      email,
      allowedRoles,
      prisma,
    );

    if (!membership && !fallbackAuthorization) {
      return {
        authorized: false,
        code: 'not_member_of_organization',
        message:
          'You are not authorized to approve this request because your approver identity is not a member of this organization.',
        allowedRoles,
        approverEmail: email,
        approverRole: null,
        userId: null,
      };
    }

    if (membership && allowedRoles.includes(membership.role)) {
      return {
        authorized: true,
        code: 'authorized',
        message: 'This approver is authorized for the matched policy roles on this request.',
        allowedRoles,
        approverEmail: email,
        approverRole: membership.role,
        userId: membership.userId,
      };
    }

    if (fallbackAuthorization) {
      return fallbackAuthorization;
    }

    return {
      authorized: false,
      code: 'role_not_allowed',
      message: `You are not authorized to approve this request. Allowed roles: ${allowedRoles.join(', ')}.`,
      allowedRoles,
      approverEmail: email,
      approverRole: membership?.role ?? null,
      userId: membership?.userId ?? null,
    };
  }

  private normalizeOptionalString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private async getDefaultOrganizationFallbackAuthorization(
    organizationId: string,
    approverEmail: string,
    allowedRoles: OrganizationMemberRole[],
    prisma: PrismaDbClient,
  ): Promise<
    | (ApproverAuthorizationSummary & {
        userId?: string | null;
      })
    | null
  > {
    if (!(await this.organizationsService.isDefaultOrganizationId(organizationId, prisma))) {
      return null;
    }

    const operator = await this.organizationsService.ensureLocalOperatorOwnership(
      organizationId,
      prisma,
    );

    if (approverEmail === operator.email && allowedRoles.includes('owner')) {
      return {
        authorized: true,
        code: 'authorized',
        message: 'The self-host operator is authorized as the default organization owner.',
        allowedRoles,
        approverEmail,
        approverRole: 'owner',
        userId: operator.userId,
      };
    }

    return null;
  }
}
