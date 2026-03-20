'use client';

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type {
  ApproverSessionState,
  PasskeyAuthenticationFinishResponse,
  PasskeyRegistrationFinishResponse,
} from '@approva/shared';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';
import { getApprovalClient } from '@/lib/api';

export interface AuthResult {
  methodId: string;
  verified: boolean;
  subject: string;
  context: Record<string, unknown>;
  session: ApproverSessionState;
}

export interface AuthMethod {
  id: string;
  label: string;
  isAvailable(): boolean | Promise<boolean>;
  register(input: {
    requestId: string;
    token: string;
    email: string;
  }): Promise<PasskeyRegistrationFinishResponse>;
  authenticate(input: {
    requestId: string;
    token: string;
    email: string;
  }): Promise<AuthResult>;
}

class PasskeyAuthMethod implements AuthMethod {
  readonly id = 'passkey';
  readonly label = 'Passkey';

  isAvailable() {
    return browserSupportsWebAuthn();
  }

  async register(input: { requestId: string; token: string; email: string }) {
    const client = getApprovalClient();
    const start = await client.startPasskeyRegistration({
      requestId: input.requestId,
      token: input.token,
      email: input.email,
    });
    const response = await startRegistration({
      optionsJSON:
        start.options as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'],
    });

    return client.finishPasskeyRegistration({
      requestId: input.requestId,
      token: input.token,
      email: input.email,
      response: response as unknown as Record<string, unknown>,
    });
  }

  async authenticate(
    input: { requestId: string; token: string; email: string },
  ): Promise<AuthResult> {
    const client = getApprovalClient();
    const start = await client.startPasskeyAuthentication({
      requestId: input.requestId,
      token: input.token,
      email: input.email,
    });
    const response = await startAuthentication({
      optionsJSON:
        start.options as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'],
    });
    const finish: PasskeyAuthenticationFinishResponse =
      await client.finishPasskeyAuthentication({
        requestId: input.requestId,
        token: input.token,
        email: input.email,
        response: response as unknown as Record<string, unknown>,
      });

    return {
      methodId: this.id,
      verified: finish.session.authenticated,
      subject: finish.user.email,
      context: {
        requestId: input.requestId,
        approverUserId: finish.user.id,
        approverEmail: finish.user.email,
      },
      session: finish.session,
    };
  }
}

interface AuthContextValue {
  methods: AuthMethod[];
  session: ApproverSessionState | null;
  sessionLoading: boolean;
  refreshSession(): Promise<ApproverSessionState>;
  logout(): Promise<ApproverSessionState>;
  register(
    methodId: string,
    input: { requestId: string; token: string; email: string },
  ): Promise<PasskeyRegistrationFinishResponse>;
  authenticate(
    methodId: string,
    input: { requestId: string; token: string; email: string },
  ): Promise<AuthResult>;
}

const authMethods = [new PasskeyAuthMethod()];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<ApproverSessionState | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const refreshSession = async () => {
    const nextSession = await getApprovalClient().getApproverSession();
    setSession(nextSession);
    return nextSession;
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const nextSession = await getApprovalClient().getApproverSession();

        if (!cancelled) {
          setSession(nextSession);
        }
      } catch {
        if (!cancelled) {
          setSession({
            authenticated: false,
          });
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const value: AuthContextValue = {
    methods: authMethods,
    session,
    sessionLoading,
    refreshSession,
    async logout() {
      const nextSession = await getApprovalClient().logoutApproverSession();
      setSession(nextSession);
      return nextSession;
    },
    async register(methodId, input) {
      const method = authMethods.find((candidate) => candidate.id === methodId);

      if (!method) {
        throw new Error(`Unknown auth method: ${methodId}`);
      }

      const available = await method.isAvailable();

      if (!available) {
        throw new Error(`${method.label} is not available on this device.`);
      }

      return method.register(input);
    },
    async authenticate(methodId, input) {
      const method = authMethods.find((candidate) => candidate.id === methodId);

      if (!method) {
        throw new Error(`Unknown auth method: ${methodId}`);
      }

      const available = await method.isAvailable();

      if (!available) {
        throw new Error(`${method.label} is not available on this device.`);
      }

      const result = await method.authenticate(input);
      setSession(result.session);
      return result;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
