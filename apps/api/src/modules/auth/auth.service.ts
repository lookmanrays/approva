import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type {
  ApproverSessionState,
  PasskeyAuthenticationFinishResponse,
  PasskeyAuthenticationStartResponse,
  PasskeyRegistrationFinishResponse,
  PasskeyRegistrationStartResponse,
} from '@approva/shared';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { Request, Response } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toApproverUser } from '../../common/utils/domain.mapper';
import {
  generateOpaqueToken,
  hashTokenValue,
} from '../../common/utils/hash.util';
import { OrganizationRbacService } from '../organizations/organization-rbac.service';

const APPROVER_SESSION_COOKIE = 'approva_approver_session';
const LEGACY_APPROVER_SESSION_COOKIE = 'authon_approver_session';

export interface AuthenticatedApproverSession {
  sessionId: string;
  approverUser: {
    id: string;
    email: string;
    displayName: string;
    status: 'active' | 'disabled';
    createdAt: Date;
    updatedAt: Date;
  };
  webauthnCredentialId: string | null;
  credentialId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationRbacService: OrganizationRbacService,
  ) {}

  async startPasskeyRegistration(
    input: {
      requestId: string;
      token: string;
      email: string;
    },
  ): Promise<PasskeyRegistrationStartResponse> {
    void input;
    throw new ForbiddenException(
      'Passkey enrollment from approval links is disabled. Sign in to the console and use Settings to manage approval passkeys.',
    );
  }

  async finishPasskeyRegistration(input: {
    requestId: string;
    token: string;
    email: string;
    response: Record<string, unknown>;
  }): Promise<PasskeyRegistrationFinishResponse> {
    void input;
    throw new ForbiddenException(
      'Passkey enrollment from approval links is disabled. Sign in to the console and use Settings to manage approval passkeys.',
    );
  }

  async startPasskeyAuthentication(
    input: {
      requestId: string;
      token: string;
      email: string;
    },
  ): Promise<PasskeyAuthenticationStartResponse> {
    const approvalContext = await this.assertApprovalScopedPasskeyAccess(
      input.requestId,
      input.token,
      input.email,
    );
    const approverUser = await this.getScopedApproverUser(
      approvalContext.organizationId,
      input.email,
      {
        credentials: true,
      },
    );

    if (approverUser.credentials.length === 0) {
      throw new ConflictException('No passkey is registered for this approver yet.');
    }

    const options = await generateAuthenticationOptions({
      rpID: this.getPasskeyRpId(),
      allowCredentials: approverUser.credentials.map((credential) => ({
        id: credential.credentialId,
        transports: this.parseCredentialTransports(credential.transportsJson),
      })),
      userVerification: 'preferred',
    });

    await this.prisma.approverUser.update({
      where: {
        id: approverUser.id,
      },
      data: {
        authenticationChallenge: options.challenge,
        authenticationChallengeExpiresAt: this.buildChallengeExpiry(),
      },
    });

    return {
      user: toApproverUser(approverUser),
      options: options as unknown as Record<string, unknown>,
    };
  }

  async finishPasskeyAuthentication(
    input: {
      requestId: string;
      token: string;
      email: string;
      response: Record<string, unknown>;
    },
    response: Response,
  ): Promise<PasskeyAuthenticationFinishResponse> {
    const approvalContext = await this.assertApprovalScopedPasskeyAccess(
      input.requestId,
      input.token,
      input.email,
    );
    const approverUser = await this.getScopedApproverUser(
      approvalContext.organizationId,
      input.email,
      {
        credentials: true,
      },
    );

    if (
      !approverUser.authenticationChallenge ||
      !approverUser.authenticationChallengeExpiresAt ||
      approverUser.authenticationChallengeExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Passkey authentication challenge is missing or expired.');
    }

    const credentialId = this.extractCredentialId(input.response);
    const dbCredential = approverUser.credentials.find(
      (credential) => credential.credentialId === credentialId,
    );

    if (!dbCredential) {
      throw new UnauthorizedException('Passkey credential is not registered for this approver.');
    }

    const verification = await verifyAuthenticationResponse({
      response: input.response as unknown as AuthenticationResponseJSON,
      expectedChallenge: approverUser.authenticationChallenge,
      expectedOrigin: this.getPasskeyExpectedOrigins(),
      expectedRPID: this.getPasskeyExpectedRpIds(),
      credential: {
        id: dbCredential.credentialId,
        publicKey: new Uint8Array(dbCredential.publicKey),
        counter: dbCredential.counter,
        transports: this.parseCredentialTransports(dbCredential.transportsJson),
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Passkey authentication could not be verified.');
    }

    const sessionToken = generateOpaqueToken({
      prefix: 'aps',
      randomLength: 32,
    });
    const expiresAt = this.buildSessionExpiry();
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.webauthnCredential.update({
        where: {
          id: dbCredential.id,
        },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date(),
          deviceType: verification.authenticationInfo.credentialDeviceType,
          backedUp: verification.authenticationInfo.credentialBackedUp,
        },
      });

      await tx.approverUser.update({
        where: {
          id: approverUser.id,
        },
        data: {
          authenticationChallenge: null,
          authenticationChallengeExpiresAt: null,
        },
      });

      await tx.approverSession.deleteMany({
        where: {
          approverUserId: approverUser.id,
          expiresAt: {
            lte: new Date(),
          },
        },
      });

      return tx.approverSession.create({
        data: {
          approverUserId: approverUser.id,
          webauthnCredentialId: dbCredential.id,
          sessionTokenHash: hashTokenValue(sessionToken),
          expiresAt,
        },
      });
    });

    this.setSessionCookie(response, sessionToken, expiresAt);

    return {
      user: toApproverUser(approverUser),
      session: {
        authenticated: true,
        user: toApproverUser(approverUser),
        expiresAt: session.expiresAt.toISOString(),
      },
    };
  }

  async getSessionState(request: Request): Promise<ApproverSessionState> {
    const session = await this.lookupAuthenticatedSession(request);

    if (!session) {
      return {
        authenticated: false,
      };
    }

    return {
      authenticated: true,
      user: {
        id: session.approverUser.id,
        email: session.approverUser.email,
        displayName: session.approverUser.displayName,
        status: session.approverUser.status,
        createdAt: session.approverUser.createdAt.toISOString(),
        updatedAt: session.approverUser.updatedAt.toISOString(),
      },
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async requireAuthenticatedSession(
    request: Request,
  ): Promise<AuthenticatedApproverSession> {
    const session = await this.lookupAuthenticatedSession(request);

    if (!session) {
      throw new UnauthorizedException(
        'A valid passkey-authenticated approver session is required.',
      );
    }

    return session;
  }

  async logout(
    request: Request,
    response: Response,
  ): Promise<ApproverSessionState> {
    const sessionToken = this.readSessionCookie(request);

    if (sessionToken) {
      await this.prisma.approverSession.deleteMany({
        where: {
          sessionTokenHash: hashTokenValue(sessionToken),
        },
      });
    }

    this.clearSessionCookie(response);

    return {
      authenticated: false,
    };
  }

  clearSessionCookie(response: Response) {
    response.clearCookie(APPROVER_SESSION_COOKIE, this.getSessionCookieOptions());
    response.clearCookie(LEGACY_APPROVER_SESSION_COOKIE, this.getSessionCookieOptions());
  }

  private async lookupAuthenticatedSession(
    request: Request,
  ): Promise<AuthenticatedApproverSession | null> {
    const sessionToken = this.readSessionCookie(request);

    if (!sessionToken) {
      return null;
    }

    const session = await this.prisma.approverSession.findUnique({
      where: {
        sessionTokenHash: hashTokenValue(sessionToken),
      },
      include: {
        approverUser: true,
        webauthnCredential: true,
      },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now() || session.approverUser.status !== 'active') {
      return null;
    }

    return {
      sessionId: session.id,
      approverUser: {
        id: session.approverUser.id,
        email: session.approverUser.email,
        displayName: session.approverUser.displayName,
        status: session.approverUser.status,
        createdAt: session.approverUser.createdAt,
        updatedAt: session.approverUser.updatedAt,
      },
      webauthnCredentialId: session.webauthnCredentialId,
      credentialId: session.webauthnCredential?.credentialId ?? null,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
  }

  private async getScopedApproverUser(
    organizationId: string,
    email: string,
    include?: {
      credentials?: boolean;
    },
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    const localUser = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        user: {
          email: normalizedEmail,
          disabledAt: null,
        },
      },
      select: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!localUser?.user.email) {
      throw new ForbiddenException(
        'Approval passkey authentication is only available for users managed in this organization.',
      );
    }

    const approverUser = await this.prisma.approverUser.upsert({
      where: {
        email: normalizedEmail,
      },
      update: {
        displayName: localUser.user.name ?? normalizedEmail,
        status: 'active',
      },
      create: {
        email: normalizedEmail,
        displayName: localUser.user.name ?? normalizedEmail,
        status: 'active',
      },
      include: {
        credentials: include?.credentials ?? false,
      },
    });

    if (!approverUser || approverUser.status !== 'active') {
      throw new NotFoundException('Active approver user not found.');
    }

    return approverUser;
  }

  private async assertApprovalScopedPasskeyAccess(
    requestId: string,
    token: string,
    email: string,
  ) {
    const approvalRequest = await this.prisma.approvalRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        expiresAt: true,
        approvalAccessTokenHash: true,
        policyResult: true,
      },
    });

    if (!approvalRequest) {
      throw new NotFoundException('Approval request not found.');
    }

    this.assertValidApprovalAccessToken(approvalRequest.approvalAccessTokenHash, token);

    if (
      approvalRequest.status !== 'pending' ||
      approvalRequest.expiresAt.getTime() <= Date.now()
    ) {
      throw new ConflictException(
        'This approval request can no longer accept passkey registration or authentication.',
      );
    }

    const authorization = await this.organizationRbacService.getApproverAuthorization(
      approvalRequest.organizationId,
      email,
      this.extractAllowedApproverRoles(approvalRequest.policyResult),
    );

    if (!authorization.authorized) {
      throw new ForbiddenException(authorization.message);
    }

    return {
      organizationId: approvalRequest.organizationId,
      approverEmail: email,
    };
  }

  private assertValidApprovalAccessToken(expectedTokenHash: string, token: string) {
    const providedHash = Buffer.from(hashTokenValue(token), 'utf8');
    const expectedHash = Buffer.from(expectedTokenHash, 'utf8');

    if (
      providedHash.length !== expectedHash.length ||
      !timingSafeEqual(providedHash, expectedHash)
    ) {
      throw new ForbiddenException('Invalid approval access token.');
    }
  }

  private extractAllowedApproverRoles(policyResult: unknown) {
    if (
      !policyResult ||
      typeof policyResult !== 'object' ||
      Array.isArray(policyResult)
    ) {
      return [] as Array<'owner' | 'admin' | 'member' | 'approver'>;
    }

    const approverRoles = (policyResult as Record<string, unknown>).approverRoles;

    if (!Array.isArray(approverRoles)) {
      return [] as Array<'owner' | 'admin' | 'member' | 'approver'>;
    }

    return approverRoles.filter(
      (value): value is 'owner' | 'admin' | 'member' | 'approver' =>
        value === 'owner' ||
        value === 'admin' ||
        value === 'member' ||
        value === 'approver',
    );
  }

  private extractCredentialId(response: Record<string, unknown>) {
    const credentialId = response.id;

    if (typeof credentialId !== 'string' || credentialId.length === 0) {
      throw new BadRequestException('Passkey authentication response is missing a credential id.');
    }

    return credentialId;
  }

  private parseCredentialTransports(value: unknown): AuthenticatorTransportFuture[] | undefined {
    const allowedTransports = new Set<AuthenticatorTransportFuture>([
      'ble',
      'cable',
      'hybrid',
      'internal',
      'nfc',
      'smart-card',
      'usb',
    ]);

    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.filter(
      (item): item is AuthenticatorTransportFuture =>
        typeof item === 'string' && allowedTransports.has(item as AuthenticatorTransportFuture),
    );
  }

  private buildChallengeExpiry() {
    const ttlMinutes = Number(process.env.PASSKEY_CHALLENGE_TTL_MINUTES ?? 5);
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  private buildSessionExpiry() {
    const ttlMinutes = Number(process.env.APPROVER_SESSION_TTL_MINUTES ?? 480);
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  private setSessionCookie(response: Response, token: string, expiresAt: Date) {
    response.cookie(APPROVER_SESSION_COOKIE, token, {
      ...this.getSessionCookieOptions(),
      expires: expiresAt,
    });
  }

  private readSessionCookie(request: Request) {
    return (request.cookies?.[APPROVER_SESSION_COOKIE] ??
      request.cookies?.[LEGACY_APPROVER_SESSION_COOKIE]) as string | undefined;
  }

  private getSessionCookieOptions() {
    const cookieDomain = this.getSessionCookieDomain();

    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.isCookieSecure(),
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
  }

  private isCookieSecure() {
    return (process.env.APPROVAL_UI_BASE_URL ?? 'http://localhost:3000').startsWith('https://');
  }

  private getSessionCookieDomain() {
    const configuredDomain = process.env.APPROVER_SESSION_COOKIE_DOMAIN?.trim();
    return configuredDomain && configuredDomain.length > 0 ? configuredDomain : undefined;
  }

  private getPasskeyRpName() {
    return process.env.PASSKEY_RP_NAME ?? 'Approva';
  }

  private getPasskeyRpId() {
    return process.env.PASSKEY_RP_ID ?? new URL(process.env.APPROVAL_UI_BASE_URL ?? 'http://localhost:3000').hostname;
  }

  private getPasskeyExpectedOrigins() {
    const configured = process.env.PASSKEY_EXPECTED_ORIGINS;

    if (configured) {
      return configured
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }

    return [process.env.APPROVAL_UI_BASE_URL ?? 'http://localhost:3000'];
  }

  private getPasskeyExpectedRpIds() {
    const configured = process.env.PASSKEY_EXPECTED_RP_IDS;

    if (configured) {
      return configured
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }

    return [this.getPasskeyRpId()];
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}
