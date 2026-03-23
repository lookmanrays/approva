import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ConsoleAuthBootstrapStatusResponse,
  ConsoleProfileResponse,
  DeleteConsolePasskeyResponse,
  PasskeyRegistrationFinishResponse,
  PasskeyRegistrationStartResponse,
  ConsoleSessionState,
} from '@approva/shared';
import type { Request, Response } from 'express';
import { BootstrapConsoleDto } from './dto/bootstrap-console.dto';
import { FinishConsolePasskeyRegistrationDto } from './dto/finish-console-passkey-registration.dto';
import { LoginConsoleDto } from './dto/login-console.dto';
import { UpdateConsolePasswordDto } from './dto/update-console-password.dto';
import { ConsoleAuthService } from './console-auth.service';

@ApiTags('console-auth')
@Controller('console-auth')
export class ConsoleAuthController {
  constructor(private readonly consoleAuthService: ConsoleAuthService) {}

  @Get('bootstrap-status')
  @ApiOperation({ summary: 'Check whether local console bootstrap is required' })
  @ApiOkResponse({ description: 'Bootstrap status retrieved.' })
  getBootstrapStatus(): Promise<ConsoleAuthBootstrapStatusResponse> {
    return this.consoleAuthService.getBootstrapStatus();
  }

  @Post('bootstrap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bootstrap the first local console owner and sign in' })
  @ApiOkResponse({ description: 'Bootstrap completed and session created.' })
  bootstrap(
    @Body() input: BootstrapConsoleDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConsoleSessionState> {
    return this.consoleAuthService.bootstrapOwner(input, response);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in to the local console' })
  @ApiOkResponse({ description: 'Console session created.' })
  login(
    @Body() input: LoginConsoleDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConsoleSessionState> {
    return this.consoleAuthService.login(input, response);
  }

  @Get('session')
  @ApiOperation({ summary: 'Get the current local console session' })
  @ApiOkResponse({ description: 'Console session state.' })
  async getSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConsoleSessionState> {
    const session = await this.consoleAuthService.getSessionState(request);

    if (!session.authenticated) {
      this.consoleAuthService.clearSessionCookie(response);
    }

    return session;
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get the current local console profile and passkey devices' })
  @ApiOkResponse({ description: 'Console profile retrieved.' })
  getProfile(@Req() request: Request): Promise<ConsoleProfileResponse> {
    return this.consoleAuthService.getProfile(request);
  }

  @Post('profile/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the current local console password' })
  @ApiOkResponse({ description: 'Console password updated.' })
  updatePassword(
    @Req() request: Request,
    @Body() input: UpdateConsolePasswordDto,
  ): Promise<ConsoleProfileResponse> {
    return this.consoleAuthService.updatePassword(request, input);
  }

  @Post('profile/passkeys/register/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start passkey registration for the signed-in local console user' })
  @ApiOkResponse({ description: 'Passkey registration options.' })
  startPasskeyRegistration(
    @Req() request: Request,
  ): Promise<PasskeyRegistrationStartResponse> {
    return this.consoleAuthService.startPasskeyRegistration(request);
  }

  @Post('profile/passkeys/register/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish passkey registration for the signed-in local console user' })
  @ApiOkResponse({ description: 'Passkey registration verification result.' })
  finishPasskeyRegistration(
    @Req() request: Request,
    @Body() input: FinishConsolePasskeyRegistrationDto,
  ): Promise<PasskeyRegistrationFinishResponse> {
    return this.consoleAuthService.finishPasskeyRegistration(request, input);
  }

  @Delete('profile/passkeys/:credentialId')
  @ApiOperation({ summary: 'Delete one registered passkey device from the signed-in local console user' })
  @ApiOkResponse({ description: 'Passkey device deleted.' })
  deletePasskey(
    @Req() request: Request,
    @Param('credentialId') credentialId: string,
  ): Promise<DeleteConsolePasskeyResponse> {
    return this.consoleAuthService.deletePasskey(request, credentialId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the current local console session' })
  @ApiOkResponse({ description: 'Console session cleared.' })
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConsoleSessionState> {
    return this.consoleAuthService.logout(request, response);
  }
}
