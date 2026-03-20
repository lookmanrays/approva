import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ExchangeCapabilityResponse,
  CapabilityUseResult,
  CapabilityVerificationResult,
} from '@approva/shared';
import { MachineAuthService } from '../machine-auth/machine-auth.service';
import { CapabilityService } from './capability.service';
import { ExchangeCapabilityDto } from './dto/exchange-capability.dto';
import { VerifyCapabilityDto } from './dto/verify-capability.dto';

@ApiTags('capabilities')
@Controller('capabilities')
export class CapabilityController {
  constructor(
    private readonly capabilityService: CapabilityService,
    private readonly machineAuthService: MachineAuthService,
  ) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a scoped capability token' })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Optional machine auth bearer token in the format Bearer approva_sk_....',
  })
  @ApiOkResponse({ description: 'Capability verification result.' })
  async verify(
    @Body() input: VerifyCapabilityDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<CapabilityVerificationResult> {
    const machinePrincipal = await this.machineAuthService.authenticateFromAuthorizationHeader(
      authorization,
      'capabilities:verify',
    );

    return this.capabilityService.verifyCapability(
      input,
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

  @Post('use')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and record usage of a scoped capability token' })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Optional machine auth bearer token in the format Bearer approva_sk_....',
  })
  @ApiOkResponse({ description: 'Capability usage result.' })
  async use(
    @Body() input: VerifyCapabilityDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-approva-organization-id') organizationId?: string,
    @Headers('x-approva-organization-slug') organizationSlug?: string,
  ): Promise<CapabilityUseResult> {
    const machinePrincipal = await this.machineAuthService.authenticateFromAuthorizationHeader(
      authorization,
      'capabilities:use',
    );

    return this.capabilityService.useCapability(
      input,
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

  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a one-time capability delivery token for the raw capability token',
  })
  @ApiHeader({
    name: 'Authorization',
    required: true,
    description: 'Machine auth bearer token in the format Bearer approva_sk_....',
  })
  @ApiOkResponse({ description: 'Capability exchange result.' })
  async exchange(
    @Body() input: ExchangeCapabilityDto,
    @Headers('authorization') authorization?: string,
  ): Promise<ExchangeCapabilityResponse> {
    const machinePrincipal = await this.machineAuthService.authenticateFromAuthorizationHeader(
      authorization,
      'capabilities:use',
    );

    if (!machinePrincipal) {
      throw new UnauthorizedException(
        'Machine authentication is required to exchange a capability delivery token.',
      );
    }

    return this.capabilityService.exchangeCapability(input.exchangeToken, machinePrincipal);
  }
}
