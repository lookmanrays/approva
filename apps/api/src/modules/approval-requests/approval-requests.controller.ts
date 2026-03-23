import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { ApprovalRequestResponse, ExpirationSweepResult } from '@approva/shared';
import type { Request } from 'express';
import { RequestContextService } from '../../common/observability/request-context.service';
import { AuthService } from '../auth/auth.service';
import { ApprovalRequestsService } from './approval-requests.service';
import { ApprovalAccessTokenQueryDto } from './dto/approval-access-token-query.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { ExpireSweepDto } from './dto/expire-sweep.dto';
import { MachineAuthService } from '../machine-auth/machine-auth.service';
import { RejectRequestDto } from './dto/reject-request.dto';
import { SecureDecisionDto } from './dto/secure-decision.dto';

@ApiTags('approval-requests')
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(
    private readonly approvalRequestsService: ApprovalRequestsService,
    private readonly authService: AuthService,
    private readonly machineAuthService: MachineAuthService,
    private readonly requestContextService: RequestContextService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an approval request' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Optional idempotency key. Replays with the same key and same payload return the original request.',
  })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Optional machine auth bearer token in the format Bearer approva_sk_....',
  })
  @ApiCreatedResponse({ description: 'Approval request created.' })
  async create(
    @Body() input: CreateApprovalRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<ApprovalRequestResponse> {
    const machinePrincipal = await this.machineAuthService.authenticateFromAuthorizationHeader(
      authorization,
      'approval_requests:create',
    );

    return this.approvalRequestsService.createRequest(
      input,
      idempotencyKey,
      machinePrincipal
        ? {
            organizationId: machinePrincipal.organizationId,
          }
        : {
            organizationId,
            organizationSlug,
          },
      machinePrincipal,
    );
  }

  @Post('internal/expire-sweep')
  @HttpCode(200)
  @ApiOperation({ summary: 'Expire pending approval requests whose expiry has passed' })
  @ApiOkResponse({ description: 'Expiration sweep completed.' })
  expireSweep(
    @Query() query: ExpireSweepDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<ExpirationSweepResult> {
    return this.approvalRequestsService.expirePendingRequests(query.limit, {
      organizationId,
      organizationSlug,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get approval request details for system/integrator usage' })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Optional machine auth bearer token in the format Bearer approva_sk_....',
  })
  @ApiOkResponse({ description: 'Approval request details.' })
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<ApprovalRequestResponse> {
    this.requestContextService.setApprovalRequestId(id);
    const machinePrincipal = await this.machineAuthService.authenticateFromAuthorizationHeader(
      authorization,
      'approval_requests:read',
    );

    return this.approvalRequestsService.getRequestById(
      id,
      machinePrincipal
        ? {
            organizationId: machinePrincipal.organizationId,
          }
        : {
            organizationId,
            organizationSlug,
          },
    );
  }

  @Get(':id/secure-view')
  @ApiOperation({ summary: 'Get approval request details using an approval access token' })
  @ApiQuery({ name: 'token', required: true })
  @ApiOkResponse({ description: 'Secure approval request view.' })
  async getSecureView(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ApprovalAccessTokenQueryDto,
    @Req() request: Request,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<ApprovalRequestResponse> {
    this.requestContextService.setApprovalRequestId(id);
    const session = await this.authService.getSessionState(request);

    if (session.user?.id) {
      this.requestContextService.setUserId(session.user.id);
    }

    return this.approvalRequestsService.getSecureRequestById(
      id,
      query.token,
      {
        organizationId,
        organizationSlug,
      },
      session,
    );
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Legacy decision endpoint disabled; use secure-approve with passkey auth' })
  @ApiOkResponse({ description: 'Approval request approved.' })
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ApproveRequestDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<ApprovalRequestResponse> {
    this.requestContextService.setApprovalRequestId(id);
    void input;
    void organizationId;
    void organizationSlug;
    throw new ForbiddenException(
      'Passkey-authenticated secure approval is required. Use the secure approval URL and the /secure-approve endpoint.',
    );
  }

  @Post(':id/secure-approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a pending request using an approval access token' })
  @ApiQuery({ name: 'token', required: true })
  @ApiOkResponse({ description: 'Approval request approved.' })
  async secureApprove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ApprovalAccessTokenQueryDto,
    @Body() input: SecureDecisionDto,
    @Req() request: Request,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<ApprovalRequestResponse> {
    this.requestContextService.setApprovalRequestId(id);
    const session = await this.authService.requireAuthenticatedSession(request);
    this.requestContextService.setUserId(session.approverUser.id);

    return this.approvalRequestsService.approveRequestWithToken(
      id,
      query.token,
      input,
      session,
      {
        organizationId,
        organizationSlug,
      },
    );
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Legacy decision endpoint disabled; use secure-reject with passkey auth' })
  @ApiOkResponse({ description: 'Approval request rejected.' })
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: RejectRequestDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<ApprovalRequestResponse> {
    this.requestContextService.setApprovalRequestId(id);
    void input;
    void organizationId;
    void organizationSlug;
    throw new ForbiddenException(
      'Passkey-authenticated secure rejection is required. Use the secure approval URL and the /secure-reject endpoint.',
    );
  }

  @Post(':id/secure-reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a pending request using an approval access token' })
  @ApiQuery({ name: 'token', required: true })
  @ApiOkResponse({ description: 'Approval request rejected.' })
  async secureReject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ApprovalAccessTokenQueryDto,
    @Body() input: SecureDecisionDto,
    @Req() request: Request,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<ApprovalRequestResponse> {
    this.requestContextService.setApprovalRequestId(id);
    const session = await this.authService.requireAuthenticatedSession(request);
    this.requestContextService.setUserId(session.approverUser.id);

    return this.approvalRequestsService.rejectRequestWithToken(
      id,
      query.token,
      input,
      session,
      {
        organizationId,
        organizationSlug,
      },
    );
  }
}
