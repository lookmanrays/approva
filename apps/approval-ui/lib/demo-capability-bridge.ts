'use client';

const DEMO_CAPABILITY_BRIDGE_PREFIX = 'approva_demo_capability_token_';
const LEGACY_DEMO_CAPABILITY_BRIDGE_PREFIX = 'authon_demo_capability_token_';
const DEMO_CAPABILITY_BRIDGE_TTL_MS = 5 * 60 * 1000;

type DemoCapabilityBridgeRecord = {
  token: string;
  storedAt: string;
  expiresAt: string;
};

export type DemoCapabilityBridgeState = {
  token: string | null;
  storedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
};

function getStorageKey(approvalRequestId: string) {
  return `${DEMO_CAPABILITY_BRIDGE_PREFIX}${approvalRequestId}`;
}

function getLegacyStorageKey(approvalRequestId: string) {
  return `${LEGACY_DEMO_CAPABILITY_BRIDGE_PREFIX}${approvalRequestId}`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parseRecord(value: string | null): DemoCapabilityBridgeRecord | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<DemoCapabilityBridgeRecord>;

    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.storedAt !== 'string' ||
      typeof parsed.expiresAt !== 'string'
    ) {
      return null;
    }

    return {
      token: parsed.token,
      storedAt: parsed.storedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function isExpired(record: DemoCapabilityBridgeRecord, now = Date.now()) {
  return Number.isNaN(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now;
}

export function cleanupExpiredDemoCapabilityTokens(now = Date.now()) {
  if (!canUseStorage()) {
    return;
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (
      !key ||
      (!key.startsWith(DEMO_CAPABILITY_BRIDGE_PREFIX) &&
        !key.startsWith(LEGACY_DEMO_CAPABILITY_BRIDGE_PREFIX))
    ) {
      continue;
    }

    const record = parseRecord(window.localStorage.getItem(key));

    if (!record || isExpired(record, now)) {
      window.localStorage.removeItem(key);
    }
  }
}

export function storeDemoCapabilityToken(approvalRequestId: string, token: string) {
  if (!canUseStorage()) {
    return;
  }

  cleanupExpiredDemoCapabilityTokens();

  // Demo-only bridge:
  // This localStorage handoff exists only so the AI deploy demo can move the
  // freshly issued capability token from the approval page back to the demo page
  // in the same browser. It is intentionally short-lived and must not be used
  // as a production token transport pattern.
  const storedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + DEMO_CAPABILITY_BRIDGE_TTL_MS).toISOString();

  window.localStorage.setItem(
    getStorageKey(approvalRequestId),
    JSON.stringify({
      token,
      storedAt,
      expiresAt,
    } satisfies DemoCapabilityBridgeRecord),
  );
}

export function readDemoCapabilityToken(
  approvalRequestId: string,
  now = Date.now(),
): DemoCapabilityBridgeState {
  if (!canUseStorage()) {
    return {
      token: null,
      storedAt: null,
      expiresAt: null,
      expired: false,
    };
  }

  const key = getStorageKey(approvalRequestId);
  const record =
    parseRecord(window.localStorage.getItem(key)) ??
    parseRecord(window.localStorage.getItem(getLegacyStorageKey(approvalRequestId)));

  if (!record) {
    return {
      token: null,
      storedAt: null,
      expiresAt: null,
      expired: false,
    };
  }

  if (isExpired(record, now)) {
    window.localStorage.removeItem(key);
    return {
      token: null,
      storedAt: record.storedAt,
      expiresAt: record.expiresAt,
      expired: true,
    };
  }

  return {
    token: record.token,
    storedAt: record.storedAt,
    expiresAt: record.expiresAt,
    expired: false,
  };
}

export function clearDemoCapabilityToken(approvalRequestId: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(getStorageKey(approvalRequestId));
}

export function getDemoCapabilityBridgeTtlMinutes() {
  return Math.floor(DEMO_CAPABILITY_BRIDGE_TTL_MS / 60_000);
}
