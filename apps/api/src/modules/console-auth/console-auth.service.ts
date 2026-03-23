import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  ConsoleAuthBootstrapStatusResponse,
  ConsoleProfileResponse,
  ConsoleSessionState,
  DeleteConsolePasskeyResponse,
  PasskeyRegistrationFinishResponse,
  PasskeyRegistrationStartResponse,
  UpdateConsolePasswordInput,
} from '@approva/shared';
import type { Request, Response } from 'express';
import { toApproverUser } from '../../common/utils/domain.mapper';
import { generateOpaqueToken, hashTokenValue } from '../../common/utils/hash.util';
import { hashPassword, verifyPassword } from '../../common/security/password.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

const CONSOLE_SESSION_COOKIE = 'approva_console_session';
const CONSOLE_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

@Injectable()
export class ConsoleAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async getBootstrapStatus(): Promise<ConsoleAuthBootstrapStatusResponse> {
    const bootstrapRequired = !(await this.hasConfiguredConsoleUser());

    return {
      bootstrapRequired,
      bootstrapIdentity: {
        email: this.organizationsService.getLocalOperatorEmail(),
        name: this.organizationsService.getLocalOperatorName(),
      },
    };
  }

  async bootstrapOwner(
    input: {
      password: string;
    },
    response: Response,
  ): Promise<ConsoleSessionState> {
    if (await this.hasConfiguredConsoleUser()) {
      throw new ConflictException('Console bootstrap is already completed.');
    }

    const organization = await this.organizationsService.ensureDefaultOrganization();
    const now = new Date();
    const passwordHash = await hashPassword(input.password);
    const email = this.organizationsService.getLocalOperatorEmail();
    const name = this.organizationsService.getLocalOperatorName();

    const user = await this.prisma.user.upsert({
      where: {
        email,
      },
      update: {
        name,
        passwordHash,
        passwordSetAt: now,
      },
      create: {
        email,
        name,
        passwordHash,
        passwordSetAt: now,
      },
      select: {
        id: true,
      },
    });

    await this.prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: {
        role: 'owner',
      },
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: 'owner',
      },
    });

    return this.createSessionForUser(user.id, response);
  }

  async login(
    input: {
      email: string;
      password: string;
    },
    response: Response,
  ): Promise<ConsoleSessionState> {
    const email = input.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        passwordHash: true,
        disabledAt: true,
        memberships: {
          select: {
            userId: true,
          },
          take: 1,
        },
      },
    });

    if (
      !user?.passwordHash ||
      user.disabledAt ||
      user.memberships.length === 0 ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    return this.createSessionForUser(user.id, response);
  }

  async getSessionState(request: Request): Promise<ConsoleSessionState> {
    const session = await this.resolveSession(request);

    if (!session) {
      return {
        authenticated: false,
      };
    }

    return {
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email ?? '',
        name: session.user.name ?? null,
      },
      activeOrganization: {
        id: session.membership.organization.id,
        name: session.membership.organization.name,
        slug: session.membership.organization.slug,
        createdAt: session.membership.organization.createdAt.toISOString(),
      },
      activeRole: session.membership.role,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async getProfile(request: Request): Promise<ConsoleProfileResponse> {
    const session = await this.requireConsoleSession(request);
    const user = await this.prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        passwordSetAt: true,
        disabledAt: true,
      },
    });

    if (!user?.email || user.disabledAt) {
      throw new NotFoundException('Local console user not found.');
    }

    const approverUser = await this.prisma.approverUser.findUnique({
      where: {
        email: user.email.toLowerCase(),
      },
      select: {
        credentials: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            id: true,
            credentialId: true,
            createdAt: true,
            lastUsedAt: true,
            deviceType: true,
            backedUp: true,
          },
        },
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
      },
      activeOrganization: {
        id: session.membership.organization.id,
        name: session.membership.organization.name,
        slug: session.membership.organization.slug,
        createdAt: session.membership.organization.createdAt.toISOString(),
      },
      activeRole: session.membership.role,
      passwordConfigured: Boolean(user.passwordHash),
      passwordSetAt: user.passwordSetAt?.toISOString() ?? null,
      passkeys:
        approverUser?.credentials.map((credential) => ({
          id: credential.id,
          credentialId: credential.credentialId,
          createdAt: credential.createdAt.toISOString(),
          lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
          deviceType: credential.deviceType ?? null,
          backedUp: credential.backedUp ?? null,
        })) ?? [],
    };
  }

  async updatePassword(
    request: Request,
    input: UpdateConsolePasswordInput,
  ): Promise<ConsoleProfileResponse> {
    const session = await this.requireConsoleSession(request);
    const user = await this.prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        passwordHash: true,
      },
    });

    if (!user?.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: session.user.id,
        },
        data: {
          passwordHash: await hashPassword(input.newPassword),
          passwordSetAt: new Date(),
        },
      });

      await tx.consoleSession.deleteMany({
        where: {
          userId: session.user.id,
          id: {
            not: session.id,
          },
        },
      });
    });

    return this.getProfile(request);
  }

  async startPasskeyRegistration(
    request: Request,
  ): Promise<PasskeyRegistrationStartResponse> {
    const session = await this.requireConsoleSession(request);
    const approverUser = await this.ensureConsoleApproverUser(session.user.id, {
      credentials: true,
    });

    const options = await generateRegistrationOptions({
      rpName: this.getPasskeyRpName(),
      rpID: this.getPasskeyRpId(),
      userName: approverUser.email,
      userID: new TextEncoder().encode(approverUser.id),
      userDisplayName: approverUser.displayName,
      attestationType: 'none',
      excludeCredentials: approverUser.credentials.map((credential) => ({
        id: credential.credentialId,
        transports: this.parseCredentialTransports(credential.transportsJson),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
      preferredAuthenticatorType: 'localDevice',
    });

    await this.prisma.approverUser.update({
      where: {
        id: approverUser.id,
      },
      data: {
        registrationChallenge: options.challenge,
        registrationChallengeExpiresAt: this.buildChallengeExpiry(),
      },
    });

    return {
      user: toApproverUser(approverUser),
      options: options as unknown as Record<string, unknown>,
    };
  }

  async finishPasskeyRegistration(
    request: Request,
    input: {
      response: Record<string, unknown>;
    },
  ): Promise<PasskeyRegistrationFinishResponse> {
    const session = await this.requireConsoleSession(request);
    const approverUser = await this.ensureConsoleApproverUser(session.user.id);

    if (
      !approverUser.registrationChallenge ||
      !approverUser.registrationChallengeExpiresAt ||
      approverUser.registrationChallengeExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Passkey registration challenge is missing or expired.');
    }

    const verification = await verifyRegistrationResponse({
      response: input.response as unknown as RegistrationResponseJSON,
      expectedChallenge: approverUser.registrationChallenge,
      expectedOrigin: this.getPasskeyExpectedOrigins(),
      expectedRPID: this.getPasskeyExpectedRpIds(),
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration could not be verified.');
    }

    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    const existingCredential = await this.prisma.webauthnCredential.findUnique({
      where: {
        credentialId: credential.id,
      },
    });

    if (existingCredential) {
      throw new ConflictException('This passkey is already registered.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.webauthnCredential.create({
        data: {
          approverUserId: approverUser.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: credential.counter,
          transportsJson: credential.transports ?? undefined,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
        },
      });

      await tx.approverUser.update({
        where: {
          id: approverUser.id,
        },
        data: {
          registrationChallenge: null,
          registrationChallengeExpiresAt: null,
        },
      });
    });

    return {
      user: toApproverUser(approverUser),
      credentialId: credential.id,
    };
  }

  async deletePasskey(
    request: Request,
    credentialId: string,
  ): Promise<DeleteConsolePasskeyResponse> {
    const session = await this.requireConsoleSession(request);
    const approverUser = await this.ensureConsoleApproverUser(session.user.id);
    const credential = await this.prisma.webauthnCredential.findFirst({
      where: {
        id: credentialId,
        approverUserId: approverUser.id,
      },
      select: {
        id: true,
      },
    });

    if (!credential) {
      throw new NotFoundException('Passkey device not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.approverSession.deleteMany({
        where: {
          webauthnCredentialId: credential.id,
        },
      });

      await tx.webauthnCredential.delete({
        where: {
          id: credential.id,
        },
      });
    });

    return {
      deleted: true,
      credentialId,
    };
  }

  async logout(request: Request, response: Response): Promise<ConsoleSessionState> {
    const token = this.readSessionToken(request);

    if (token) {
      await this.prisma.consoleSession.deleteMany({
        where: {
          sessionTokenHash: hashTokenValue(token),
        },
      });
    }

    this.clearSessionCookie(response);

    return {
      authenticated: false,
    };
  }

  async resolveSession(request: Request) {
    const token = this.readSessionToken(request);

    if (!token) {
      return null;
    }

    const session = await this.prisma.consoleSession.findUnique({
      where: {
        sessionTokenHash: hashTokenValue(token),
      },
      select: {
        id: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            disabledAt: true,
            memberships: {
              orderBy: {
                createdAt: 'asc',
              },
              select: {
                role: true,
                organization: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.consoleSession.delete({
        where: {
          id: session.id,
        },
      });
      return null;
    }

    const membership = session.user.memberships[0];

    if (!membership || !session.user.email || session.user.disabledAt) {
      await this.prisma.consoleSession.deleteMany({
        where: {
          id: session.id,
        },
      });
      return null;
    }

    await this.prisma.consoleSession.update({
      where: {
        id: session.id,
      },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return {
      id: session.id,
      expiresAt: session.expiresAt,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      membership,
    };
  }

  clearSessionCookie(response: Response) {
    response.clearCookie(CONSOLE_SESSION_COOKIE, this.buildCookieOptions());
  }

  private async createSessionForUser(userId: string, response: Response) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        disabledAt: true,
        memberships: {
          select: {
            userId: true,
          },
          take: 1,
        },
      },
    });

    if (!user || user.disabledAt || user.memberships.length === 0) {
      throw new UnauthorizedException('This local console user does not have active access.');
    }

    const sessionToken = generateOpaqueToken({
      prefix: 'csl',
      randomLength: 48,
    });
    const expiresAt = new Date(Date.now() + CONSOLE_SESSION_TTL_MS);

    await this.prisma.consoleSession.create({
      data: {
        userId,
        sessionTokenHash: hashTokenValue(sessionToken),
        expiresAt,
      },
    });

    response.cookie(CONSOLE_SESSION_COOKIE, sessionToken, {
      ...this.buildCookieOptions(),
      expires: expiresAt,
    });

    return this.getSessionState({
      headers: {
        cookie: `${CONSOLE_SESSION_COOKIE}=${sessionToken}`,
      },
    } as Request);
  }

  private async requireConsoleSession(request: Request) {
    const session = await this.resolveSession(request);

    if (!session) {
      throw new UnauthorizedException('Sign in to the local console first.');
    }

    return session;
  }

  private async ensureConsoleApproverUser(
    userId: string,
    include?: {
      credentials?: boolean;
    },
  ) {
    const localUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
        name: true,
        disabledAt: true,
        memberships: {
          select: {
            userId: true,
          },
          take: 1,
        },
      },
    });

    if (!localUser?.email || localUser.disabledAt || localUser.memberships.length === 0) {
      throw new NotFoundException('Console user is missing a managed email identity.');
    }

    return this.prisma.approverUser.upsert({
      where: {
        email: localUser.email.toLowerCase(),
      },
      update: {
        displayName: localUser.name ?? localUser.email,
        status: 'active',
      },
      create: {
        email: localUser.email.toLowerCase(),
        displayName: localUser.name ?? localUser.email,
        status: 'active',
      },
      include: {
        credentials: include?.credentials ?? false,
      },
    });
  }

  private async hasConfiguredConsoleUser() {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordHash: {
          not: null,
        },
        disabledAt: null,
      },
      select: {
        id: true,
      },
    });

    return Boolean(user);
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

  private getPasskeyRpName() {
    return process.env.PASSKEY_RP_NAME ?? 'Approva';
  }

  private getPasskeyRpId() {
    return (
      process.env.PASSKEY_RP_ID ??
      new URL(process.env.APPROVAL_UI_BASE_URL ?? 'http://localhost:3000').hostname
    );
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

  private buildCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: (process.env.NODE_ENV ?? 'development') === 'production',
      path: '/',
    };
  }

  private readSessionToken(request: Request) {
    const cookieValue =
      (typeof request.cookies?.[CONSOLE_SESSION_COOKIE] === 'string'
        ? request.cookies[CONSOLE_SESSION_COOKIE]
        : null) ?? this.readCookieHeader(request.headers.cookie, CONSOLE_SESSION_COOKIE);

    return cookieValue?.trim() || null;
  }

  private readCookieHeader(rawCookieHeader: string | string[] | undefined, name: string) {
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader[0] ?? ''
      : rawCookieHeader ?? '';

    for (const entry of cookieHeader.split(';')) {
      const [rawName, ...rest] = entry.trim().split('=');

      if (rawName === name) {
        return decodeURIComponent(rest.join('='));
      }
    }

    return null;
  }
}
