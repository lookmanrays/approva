import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getApprovaIntegrationEncryptionKeyMaterial } from '@approva/config';

const ENCRYPTED_PREFIX = 'enc:v1';

export function encryptApplicationValue(value: string): string {
  const normalized = normalizeValue(value, 'Value to encrypt cannot be empty.');
  const key = getApplicationEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptApplicationValue(value: string): string {
  const normalized = normalizeValue(value, 'Stored encrypted value cannot be empty.');

  if (!isEncryptedApplicationValue(normalized)) {
    return normalized;
  }

  const parts = normalized.split(':');

  if (parts.length !== 5) {
    throw new Error('Stored encrypted value has an invalid format.');
  }

  const [, version, ivValue, tagValue, ciphertextValue] = parts;

  if (`enc:${version}` !== ENCRYPTED_PREFIX) {
    throw new Error('Stored encrypted value uses an unsupported version.');
  }

  const key = getApplicationEncryptionKey();
  const iv = Buffer.from(ivValue, 'base64url');
  const tag = Buffer.from(tagValue, 'base64url');
  const ciphertext = Buffer.from(ciphertextValue, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);

  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isEncryptedApplicationValue(value: string): boolean {
  return value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

function getApplicationEncryptionKey() {
  const key = getApprovaIntegrationEncryptionKeyMaterial(
    process.env.APPROVA_INTEGRATION_ENCRYPTION_KEY ??
      process.env.AUTHON_INTEGRATION_ENCRYPTION_KEY,
  );

  if (key) {
    return key;
  }

  if (
    !process.env.APPROVA_INTEGRATION_ENCRYPTION_KEY?.trim() &&
    !process.env.AUTHON_INTEGRATION_ENCRYPTION_KEY?.trim()
  ) {
    throw new Error(
      'APPROVA_INTEGRATION_ENCRYPTION_KEY must be configured to encrypt stored application secrets.',
    );
  }

  throw new Error(
    'APPROVA_INTEGRATION_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key.',
  );
}

function normalizeValue(value: string, message: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}
