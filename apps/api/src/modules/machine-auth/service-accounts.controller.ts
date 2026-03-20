import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  RevokeServiceAccountResponse,
  ServiceAccountListResponse,
  ServiceAccountRecord,
} from '@approva/shared';
import { OrganizationRbacService } from '../organizations/organization-rbac.service';
import { CreateServiceAccountDto } from './dto/create-service-account.dto';
import { MachineAuthService } from './machine-auth.service';

@ApiTags('service-accounts')
@Controller('service-accounts')
export class ServiceAccountsController {
  constructor(
    private readonly machineAuthService: MachineAuthService,
    private readonly organizationRbacService: OrganizationRbacService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List organization service accounts' })
  @ApiOkResponse({ description: 'Service accounts listed.' })
  async list(
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<ServiceAccountListResponse> {
    await this.organizationRbacService.requirePermission(
      'service_accounts:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.machineAuthService.listServiceAccounts({
      organizationId,
      organizationSlug,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create an organization service account' })
  @ApiOkResponse({ description: 'Service account created.' })
  async create(
    @Body() input: CreateServiceAccountDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<ServiceAccountRecord> {
    await this.organizationRbacService.requirePermission(
      'service_accounts:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.machineAuthService.createServiceAccount(
      input,
      {
        organizationId,
        organizationSlug,
      },
    );
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke an organization service account' })
  @ApiOkResponse({ description: 'Service account revoked.' })
  async revoke(
    @Param('id') id: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<RevokeServiceAccountResponse> {
    await this.organizationRbacService.requirePermission(
      'service_accounts:manage',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.machineAuthService.revokeServiceAccount(id, {
      organizationId,
      organizationSlug,
    });
  }
}
