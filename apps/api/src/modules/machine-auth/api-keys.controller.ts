import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CreateOrganizationApiKeyResponse,
  OrganizationApiKeyListResponse,
  RevokeOrganizationApiKeyResponse,
} from '@approva/shared';
import { OrganizationRbacService } from '../organizations/organization-rbac.service';
import { CreateOrganizationApiKeyDto } from './dto/create-organization-api-key.dto';
import { MachineAuthService } from './machine-auth.service';

@ApiTags('api-keys')
@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly machineAuthService: MachineAuthService,
    private readonly organizationRbacService: OrganizationRbacService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List organization API keys' })
  @ApiOkResponse({ description: 'API keys listed.' })
  async list(
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<OrganizationApiKeyListResponse> {
    await this.organizationRbacService.requirePermission(
      'api_keys:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.machineAuthService.listApiKeys({
      organizationId,
      organizationSlug,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create an organization API key' })
  @ApiOkResponse({ description: 'API key created and revealed once.' })
  async create(
    @Body() input: CreateOrganizationApiKeyDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<CreateOrganizationApiKeyResponse> {
    await this.organizationRbacService.requirePermission(
      'api_keys:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.machineAuthService.createApiKey(
      input,
      {
        organizationId,
        organizationSlug,
      },
    );
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke an organization API key' })
  @ApiOkResponse({ description: 'API key revoked.' })
  async revoke(
    @Param('id') id: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<RevokeOrganizationApiKeyResponse> {
    await this.organizationRbacService.requirePermission(
      'api_keys:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.machineAuthService.revokeApiKey(id, {
      organizationId,
      organizationSlug,
    });
  }
}
