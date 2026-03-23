import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePolicyInput,
  DeletePolicyResponse,
  PolicyListResponse,
  PolicyResult,
  PolicyRule,
  RiskLevel,
  UpdatePolicyInput,
} from '@approva/shared';
import { Prisma, type Policy } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationsService, type OrganizationContextInput } from '../organizations/organizations.service';

type PolicyOutcome = 'auto_approve' | 'approval_required' | 'reject';

@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async evaluate(input: {
    organizationId: string;
    action: string;
    resourceType: string;
    riskLevel: RiskLevel;
  }): Promise<PolicyResult> {
    const policies = await this.prisma.policy.findMany({
      where: {
        organizationId: input.organizationId,
        riskLevel: input.riskLevel,
        action: {
          in: [this.normalizeMatchValue(input.action), '*'],
        },
        resourceType: {
          in: [this.normalizeMatchValue(input.resourceType), '*'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (policies.length === 0) {
      return {
        decision: 'auto_approve',
        requiresApproval: false,
        matchedRules: [],
        reasons: ['No matching organization policy; request auto-approved.'],
        evaluatedAt: new Date().toISOString(),
        matchedPolicyId: null,
        approverRoles: [],
      };
    }

    const ranked = policies.map((policy) => ({
      policy,
      specificity: this.getPolicySpecificity(policy, input),
      outcome: this.resolvePolicyOutcome(policy),
    }));
    const topSpecificity = Math.max(...ranked.map((entry) => entry.specificity));
    const topMatches = ranked.filter((entry) => entry.specificity === topSpecificity);
    const outcomeSet = new Set(topMatches.map((entry) => entry.outcome));

    if (outcomeSet.size > 1) {
      return {
        decision: 'reject',
        requiresApproval: false,
        matchedRules: topMatches.map((entry) => `policy.${entry.policy.id}`),
        reasons: [
          'Conflicting organization policies matched this request at the same specificity.',
        ],
        evaluatedAt: new Date().toISOString(),
        matchedPolicyId: null,
        approverRoles: [],
      };
    }

    const selected = topMatches[0]!;
    const reasons = this.buildPolicyReasons(selected.policy, selected.outcome);

    return {
      decision: selected.outcome,
      requiresApproval: selected.outcome === 'approval_required',
      matchedRules: [`policy.${selected.policy.id}`],
      reasons,
      evaluatedAt: new Date().toISOString(),
      matchedPolicyId: selected.policy.id,
      approverRoles: selected.policy.approverRoles,
    };
  }

  async listPolicies(
    organizationInput: OrganizationContextInput = {},
  ): Promise<PolicyListResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    const policies = await this.prisma.policy.findMany({
      where: {
        organizationId: organization.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      items: policies.map((policy) => this.toPolicyRule(policy)),
    };
  }

  async createPolicy(
    input: CreatePolicyInput,
    organizationInput: OrganizationContextInput = {},
  ): Promise<PolicyRule> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    let policy: Policy;

    try {
      policy = await this.prisma.policy.create({
        data: {
          organizationId: organization.id,
          action: this.normalizeMatchValue(input.action),
          resourceType: this.normalizeMatchValue(input.resourceType),
          riskLevel: input.riskLevel,
          approvalRequired: input.approvalRequired,
          approverRoles: input.approverRoles,
        },
      });
    } catch (error) {
      this.rethrowPolicyConflict(error, input);
      throw error;
    }

    return this.toPolicyRule(policy);
  }

  async updatePolicy(
    id: string,
    input: UpdatePolicyInput,
    organizationInput: OrganizationContextInput = {},
  ): Promise<PolicyRule> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    await this.assertPolicyExists(id, organization.id);

    let policy: Policy;

    try {
      policy = await this.prisma.policy.update({
        where: {
          id,
        },
        data: {
          action: this.normalizeMatchValue(input.action),
          resourceType: this.normalizeMatchValue(input.resourceType),
          riskLevel: input.riskLevel,
          approvalRequired: input.approvalRequired,
          approverRoles: input.approverRoles,
        },
      });
    } catch (error) {
      this.rethrowPolicyConflict(error, input);
      throw error;
    }

    return this.toPolicyRule(policy);
  }

  async deletePolicy(
    id: string,
    organizationInput: OrganizationContextInput = {},
  ): Promise<DeletePolicyResponse> {
    const organization = await this.organizationsService.resolveOrganization(organizationInput);
    await this.assertPolicyExists(id, organization.id);

    await this.prisma.policy.delete({
      where: {
        id,
      },
    });

    return {
      deleted: true,
      id,
    };
  }

  private async assertPolicyExists(id: string, organizationId: string) {
    const policy = await this.prisma.policy.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!policy) {
      throw new NotFoundException('Policy not found.');
    }
  }

  private toPolicyRule(policy: Policy): PolicyRule {
    return {
      id: policy.id,
      organizationId: policy.organizationId,
      action: policy.action,
      resourceType: policy.resourceType,
      riskLevel: policy.riskLevel,
      approvalRequired: policy.approvalRequired,
      approverRoles: policy.approverRoles,
      createdAt: policy.createdAt.toISOString(),
    };
  }

  private resolvePolicyOutcome(policy: Policy): PolicyOutcome {
    if (!policy.approvalRequired) {
      return 'auto_approve';
    }

    if (policy.approverRoles.length === 0) {
      return 'reject';
    }

    return 'approval_required';
  }

  private getPolicySpecificity(
    policy: Policy,
    input: {
      action: string;
      resourceType: string;
    },
  ) {
    let specificity = 0;

    if (policy.action === this.normalizeMatchValue(input.action)) {
      specificity += 2;
    }

    if (policy.resourceType === this.normalizeMatchValue(input.resourceType)) {
      specificity += 1;
    }

    return specificity;
  }

  private buildPolicyReasons(policy: Policy, outcome: PolicyOutcome) {
    const actionLabel = policy.action === '*' ? 'any action' : `action "${policy.action}"`;
    const resourceLabel =
      policy.resourceType === '*' ? 'any resource' : `resource type "${policy.resourceType}"`;

    if (outcome === 'auto_approve') {
      return [
        `Matched policy ${policy.id}: ${actionLabel} on ${resourceLabel} at ${policy.riskLevel} risk auto-approves.`,
      ];
    }

    if (outcome === 'reject') {
      return [
        `Matched policy ${policy.id}: ${actionLabel} on ${resourceLabel} at ${policy.riskLevel} risk is rejected because no approver roles are configured.`,
      ];
    }

    const approverRolesLabel =
      policy.approverRoles.length > 0
        ? policy.approverRoles.join(', ')
        : 'no roles configured';

    return [
      `Matched policy ${policy.id}: ${actionLabel} on ${resourceLabel} at ${policy.riskLevel} risk requires approval from roles ${approverRolesLabel}.`,
    ];
  }

  private normalizeMatchValue(value: string) {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : '*';
  }

  private rethrowPolicyConflict(
    error: unknown,
    input: Pick<CreatePolicyInput, 'action' | 'resourceType' | 'riskLevel'>,
  ) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `A policy for action "${this.normalizeMatchValue(input.action)}", resource type "${this.normalizeMatchValue(input.resourceType)}", and risk level "${input.riskLevel}" already exists. Edit that rule instead of creating a duplicate.`,
      );
    }
  }
}
