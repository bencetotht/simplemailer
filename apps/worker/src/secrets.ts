import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENVELOPE_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const encoded = process.env.SECRETS_MASTER_KEY;
  if (!encoded) {
    throw new Error('SECRETS_MASTER_KEY is required');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('SECRETS_MASTER_KEY must decode to 32 bytes (base64)');
  }
  return key;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(ENVELOPE_PREFIX)) return value;

  const payload = Buffer.from(value.slice(ENVELOPE_PREFIX.length), 'base64');
  if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted secret payload');
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', getMasterKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  return `${ENVELOPE_PREFIX}${payload}`;
}
