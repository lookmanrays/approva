import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  DeleteIntegrationResponse,
  IntegrationListResponse,
  IntegrationRecord,
} from '@approva/shared';
import { OrganizationRbacService } from '../organizations/organization-rbac.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly organizationRbacService: OrganizationRbacService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List integrations for the active organization' })
  @ApiOkResponse({ description: 'Integrations retrieved.' })
  async list(
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<IntegrationListResponse> {
    await this.organizationRbacService.requirePermission(
      'console:view',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.integrationsService.listIntegrations({
      organizationId,
      organizationSlug,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create an integration for the active organization' })
  @ApiOkResponse({ description: 'Integration created.' })
  async create(
    @Body() input: CreateIntegrationDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<IntegrationRecord> {
    await this.organizationRbacService.requirePermission(
      'integrations:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.integrationsService.createIntegration(input, {
      organizationId,
      organizationSlug,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an integration for the active organization' })
  @ApiOkResponse({ description: 'Integration updated.' })
  async update(
    @Param('id') id: string,
    @Body() input: UpdateIntegrationDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<IntegrationRecord> {
    await this.organizationRbacService.requirePermission(
      'integrations:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.integrationsService.updateIntegration(id, input, {
      organizationId,
      organizationSlug,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an integration for the active organization' })
  @ApiOkResponse({ description: 'Integration deleted.' })
  async remove(
    @Param('id') id: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<DeleteIntegrationResponse> {
    await this.organizationRbacService.requirePermission(
      'integrations:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.integrationsService.deleteIntegration(id, {
      organizationId,
      organizationSlug,
    });
  }
}
