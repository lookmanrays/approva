import { Body, Controller, Get, Headers, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CurrentOrganizationResponse } from '@approva/shared';
import { OrganizationRbacService } from './organization-rbac.service';
import { UpdateCurrentOrganizationDto } from './dto/update-current-organization.dto';
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
}
