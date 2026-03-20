import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationRbacService } from '../organizations/organization-rbac.service';
import { LedgerService } from './ledger.service';
import { VerifyLedgerDto } from './dto/verify-ledger.dto';

@ApiTags('internal-ledger')
@Controller('internal/ledger')
export class LedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly organizationRbacService: OrganizationRbacService,
  ) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the deterministic ledger chain over the full chain or a sequence range' })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        fromSeq: {
          type: 'integer',
          minimum: 1,
        },
        toSeq: {
          type: 'integer',
          minimum: 1,
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Ledger verification result.' })
  async verify(
    @Body() input?: VerifyLedgerDto,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
    @Headers('x-approva-user-id') dashboardUserId?: string,
  ) {
    if (input?.fromSeq && input?.toSeq && input.fromSeq > input.toSeq) {
      throw new BadRequestException('fromSeq must be less than or equal to toSeq.');
    }

    await this.organizationRbacService.requirePermission(
      'ledger:verify',
      { organizationId, organizationSlug },
      dashboardUserId,
    );

    return this.ledgerService.verifyLedgerRange(input, {
      organizationId,
      organizationSlug,
    });
  }
}
