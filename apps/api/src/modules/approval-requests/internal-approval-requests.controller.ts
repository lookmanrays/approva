import { Controller, Get, Headers, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  InternalApprovalRequestDetailResponse,
  InternalApprovalRequestListResponse,
} from '@approva/shared';
import { OrganizationRbacService } from '../organizations/organization-rbac.service';
import { ApprovalRequestsService } from './approval-requests.service';
import { InternalApprovalRequestsQueryDto } from './dto/internal-approval-requests-query.dto';

@ApiTags('internal-approval-requests')
@Controller('internal/approval-requests')
export class InternalApprovalRequestsController {
  constructor(
    private readonly approvalRequestsService: ApprovalRequestsService,
    private readonly organizationRbacService: OrganizationRbacService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List approval requests for internal/admin inspection' })
  @ApiOkResponse({ description: 'Internal approval request inbox.' })
  async list(
    @Query() query: InternalApprovalRequestsQueryDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<InternalApprovalRequestListResponse> {
    await this.organizationRbacService.requirePermission(
      'approvals:view',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.approvalRequestsService.listInternalRequests(query, {
      organizationId,
      organizationSlug,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an internal/admin approval request detail view' })
  @ApiOkResponse({ description: 'Internal approval request detail.' })
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ): Promise<InternalApprovalRequestDetailResponse> {
    await this.organizationRbacService.requirePermission(
      'approvals:view',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.approvalRequestsService.getInternalRequestDetail(id, {
      organizationId,
      organizationSlug,
    });
  }
}
