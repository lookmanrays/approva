import type {
  ConsoleAuthBootstrapStatusResponse,
  ConsoleBootstrapInput,
  ConsoleProfileResponse,
  ConsoleLoginInput,
  ConsoleSessionState,
  DeleteConsolePasskeyResponse,
  PasskeyRegistrationFinishResponse,
  PasskeyRegistrationStartResponse,
  UpdateConsolePasswordInput,
} from '@approva/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const payload = (await response.json()) as T & {
    error?: { message?: string | string[] };
  };

  if (!response.ok) {
    const message = payload.error?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message ?? 'Request failed');
  }

  return payload;
}

export function getConsoleBootstrapStatus() {
  return request<ConsoleAuthBootstrapStatusResponse>('/api/console-auth/bootstrap-status', {
    method: 'GET',
  });
}

export function getConsoleSession() {
  return request<ConsoleSessionState>('/api/console-auth/session', {
    method: 'GET',
  });
}

export function bootstrapConsole(input: ConsoleBootstrapInput) {
  return request<ConsoleSessionState>('/api/console-auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function loginConsole(input: ConsoleLoginInput) {
  return request<ConsoleSessionState>('/api/console-auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logoutConsole() {
  return request<ConsoleSessionState>('/api/console-auth/logout', {
    method: 'POST',
  });
}

export function getConsoleProfile() {
  return request<ConsoleProfileResponse>('/api/console-auth/profile', {
    method: 'GET',
  });
}

export function updateConsolePassword(input: UpdateConsolePasswordInput) {
  return request<ConsoleProfileResponse>('/api/console-auth/profile/password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function startConsolePasskeyRegistration() {
  return request<PasskeyRegistrationStartResponse>(
    '/api/console-auth/profile/passkeys/register/start',
    {
      method: 'POST',
    },
  );
}

export function finishConsolePasskeyRegistration(input: { response: Record<string, unknown> }) {
  return request<PasskeyRegistrationFinishResponse>(
    '/api/console-auth/profile/passkeys/register/finish',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function deleteConsolePasskey(credentialId: string) {
  return request<DeleteConsolePasskeyResponse>(
    `/api/console-auth/profile/passkeys/${credentialId}`,
    {
      method: 'DELETE',
    },
  );
}
