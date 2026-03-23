import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CreateLocalUserInput,
  CurrentOrganizationResponse,
  LocalUserListResponse,
  LocalUserRecord,
  OrganizationSecurityEventListResponse,
  RemoveLocalUserResponse,
  UpdateLocalUserInput,
} from '@approva/shared';
import { OrganizationRbacService } from './organization-rbac.service';
import { CreateLocalUserDto } from './dto/create-local-user.dto';
import { UpdateCurrentOrganizationDto } from './dto/update-current-organization.dto';
import { UpdateLocalUserDto } from './dto/update-local-user.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationRbacService: OrganizationRbacService,
  ) {}

  @Get('current')
  @ApiOperation({ summary: 'Get the active organization context' })
  @ApiOkResponse({ description: 'Organization retrieved.' })
  async getCurrent(
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<CurrentOrganizationResponse> {
    await this.organizationRbacService.requirePermission(
      'console:view',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.getCurrentOrganization({
      organizationId,
      organizationSlug,
    });
  }

  @Put('current')
  @ApiOperation({ summary: 'Update the active organization' })
  @ApiOkResponse({ description: 'Organization updated.' })
  async updateCurrent(
    @Body() input: UpdateCurrentOrganizationDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<CurrentOrganizationResponse> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.updateCurrentOrganization(input, {
      organizationId,
      organizationSlug,
    });
  }

  @Get('current/members')
  @ApiOperation({ summary: 'List local users and memberships for the active organization' })
  @ApiOkResponse({ description: 'Local users retrieved.' })
  async listMembers(
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<LocalUserListResponse> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.listLocalUsers({
      organizationId,
      organizationSlug,
    });
  }

  @Get('current/security-events')
  @ApiOperation({ summary: 'List recent organization security events for the active organization' })
  @ApiOkResponse({ description: 'Organization security events retrieved.' })
  async listSecurityEvents(
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<OrganizationSecurityEventListResponse> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.listOrganizationSecurityEvents({
      organizationId,
      organizationSlug,
    });
  }

  @Post('current/members')
  @ApiOperation({ summary: 'Create a local user and membership for the active organization' })
  @ApiOkResponse({ description: 'Local user created.' })
  async createMember(
    @Body() input: CreateLocalUserDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<LocalUserRecord> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.createLocalUser(
      input as CreateLocalUserInput,
      {
        organizationId,
        organizationSlug,
      },
      dashboardUserId,
    );
  }

  @Put('current/members/:userId')
  @ApiOperation({ summary: 'Update a local user and membership for the active organization' })
  @ApiOkResponse({ description: 'Local user updated.' })
  async updateMember(
    @Param('userId') userId: string,
    @Body() input: UpdateLocalUserDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<LocalUserRecord> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.updateLocalUser(
      userId,
      input as UpdateLocalUserInput,
      {
        organizationId,
        organizationSlug,
      },
      dashboardUserId,
    );
  }

  @Post('current/members/:userId/grant-owner')
  @ApiOperation({ summary: 'Grant owner access to one local user in the active organization' })
  @ApiOkResponse({ description: 'Owner access granted.' })
  async grantOwner(
    @Param('userId') userId: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<LocalUserRecord> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.grantLocalUserOwnerAccess(
      userId,
      {
        organizationId,
        organizationSlug,
      },
      dashboardUserId,
    );
  }

  @Post('current/members/:userId/reduce-owner')
  @ApiOperation({ summary: 'Reduce one owner to admin access in the active organization' })
  @ApiOkResponse({ description: 'Owner access reduced.' })
  async reduceOwner(
    @Param('userId') userId: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<LocalUserRecord> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.reduceLocalUserOwnerAccess(
      userId,
      {
        organizationId,
        organizationSlug,
      },
      dashboardUserId,
    );
  }

  @Post('current/members/:userId/disable')
  @ApiOperation({ summary: 'Disable one local user for the active organization' })
  @ApiOkResponse({ description: 'Local user disabled.' })
  async disableMember(
    @Param('userId') userId: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<LocalUserRecord> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.disableLocalUser(
      userId,
      {
        organizationId,
        organizationSlug,
      },
      dashboardUserId,
    );
  }

  @Post('current/members/:userId/enable')
  @ApiOperation({ summary: 'Enable one local user for the active organization' })
  @ApiOkResponse({ description: 'Local user enabled.' })
  async enableMember(
    @Param('userId') userId: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<LocalUserRecord> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.enableLocalUser(
      userId,
      {
        organizationId,
        organizationSlug,
      },
      dashboardUserId,
    );
  }

  @Delete('current/members/:userId')
  @ApiOperation({ summary: 'Remove one local user from the active organization' })
  @ApiOkResponse({ description: 'Local user removed.' })
  async removeMember(
    @Param('userId') userId: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<RemoveLocalUserResponse> {
    await this.organizationRbacService.requirePermission(
      'organization:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.organizationsService.removeLocalUser(
      userId,
      {
        organizationId,
        organizationSlug,
      },
      dashboardUserId,
    );
  }
}
