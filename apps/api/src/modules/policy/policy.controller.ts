import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DeletePolicyResponse, PolicyListResponse, PolicyRule } from '@approva/shared';
import { OrganizationRbacService } from '../organizations/organization-rbac.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PolicyService } from './policy.service';

@ApiTags('policies')
@Controller('policies')
export class PolicyController {
  constructor(
    private readonly policyService: PolicyService,
    private readonly organizationRbacService: OrganizationRbacService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List policies for the active organization' })
  @ApiOkResponse({ description: 'Policies retrieved.' })
  async list(
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<PolicyListResponse> {
    await this.organizationRbacService.requirePermission(
      'console:view',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.policyService.listPolicies({
      organizationId,
      organizationSlug,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a policy for the active organization' })
  @ApiOkResponse({ description: 'Policy created.' })
  async create(
    @Body() input: CreatePolicyDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<PolicyRule> {
    await this.organizationRbacService.requirePermission(
      'policies:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.policyService.createPolicy(input, {
      organizationId,
      organizationSlug,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a policy for the active organization' })
  @ApiOkResponse({ description: 'Policy updated.' })
  async update(
    @Param('id') id: string,
    @Body() input: UpdatePolicyDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<PolicyRule> {
    await this.organizationRbacService.requirePermission(
      'policies:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.policyService.updatePolicy(id, input, {
      organizationId,
      organizationSlug,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a policy for the active organization' })
  @ApiOkResponse({ description: 'Policy deleted.' })
  async remove(
    @Param('id') id: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<DeletePolicyResponse> {
    await this.organizationRbacService.requirePermission(
      'policies:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.policyService.deletePolicy(id, {
      organizationId,
      organizationSlug,
    });
  }
}
