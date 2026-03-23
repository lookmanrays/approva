import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  ApproverSessionState,
  PasskeyAuthenticationFinishResponse,
  PasskeyAuthenticationStartResponse,
  PasskeyRegistrationFinishResponse,
  PasskeyRegistrationStartResponse,
} from '@approva/shared';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { PasskeyAuthenticationFinishDto } from './dto/passkey-authentication-finish.dto';
import { PasskeyAuthenticationStartDto } from './dto/passkey-authentication-start.dto';
import { PasskeyRegistrationFinishDto } from './dto/passkey-registration-finish.dto';
import { PasskeyRegistrationStartDto } from './dto/passkey-registration-start.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('passkeys/register/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approval-link passkey registration is disabled in open-core' })
  @ApiOkResponse({ description: 'Returns an error directing operators to Console Settings.' })
  startRegistration(
    @Body() input: PasskeyRegistrationStartDto,
  ): Promise<PasskeyRegistrationStartResponse> {
    return this.authService.startPasskeyRegistration(input);
  }

  @Post('passkeys/register/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approval-link passkey registration is disabled in open-core' })
  @ApiOkResponse({ description: 'Returns an error directing operators to Console Settings.' })
  finishRegistration(
    @Body() input: PasskeyRegistrationFinishDto,
  ): Promise<PasskeyRegistrationFinishResponse> {
    return this.authService.finishPasskeyRegistration(input);
  }

  @Post('passkeys/authenticate/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start passkey authentication for an approver user' })
  @ApiOkResponse({ description: 'Passkey authentication options.' })
  startAuthentication(
    @Body() input: PasskeyAuthenticationStartDto,
  ): Promise<PasskeyAuthenticationStartResponse> {
    return this.authService.startPasskeyAuthentication(input);
  }

  @Post('passkeys/authenticate/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish passkey authentication and create an approver session' })
  @ApiOkResponse({ description: 'Passkey authentication verification result.' })
  finishAuthentication(
    @Body() input: PasskeyAuthenticationFinishDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PasskeyAuthenticationFinishResponse> {
    return this.authService.finishPasskeyAuthentication(input, response);
  }

  @Get('session')
  @ApiOperation({ summary: 'Get the current approver session from the secure cookie' })
  @ApiOkResponse({ description: 'Approver session state.' })
  async getSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApproverSessionState> {
    const session = await this.authService.getSessionState(request);

    if (!session.authenticated) {
      this.authService.clearSessionCookie(response);
    }

    return session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the current approver session cookie' })
  @ApiOkResponse({ description: 'Approver session cleared.' })
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApproverSessionState> {
    return this.authService.logout(request, response);
  }
}
