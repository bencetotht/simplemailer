import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const KEY_PREFIX = "sm_live_";
const SCRYPT_KEY_LENGTH = 32;

export interface GeneratedApiKey {
  secret: string;
  prefix: string;
  keyHash: string;
}

export async function hashApiKey(secret: string, salt = randomBytes(16)): Promise<string> {
  const derived = (await scrypt(secret, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyApiKey(secret: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;

  try {
    const expected = Buffer.from(hashValue, "base64url");
    const actual = (await scrypt(
      secret,
      Buffer.from(saltValue, "base64url"),
      expected.length,
    )) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function apiKeyPrefix(secret: string): string | null {
  const match = /^sm_live_([a-f0-9]{16})\.[A-Za-z0-9_-]{43}$/.exec(secret);
  return match?.[1] ?? null;
}

export async function generateApiKey(): Promise<GeneratedApiKey> {
  const prefix = randomBytes(8).toString("hex");
  const secretMaterial = randomBytes(32).toString("base64url");
  const secret = `${KEY_PREFIX}${prefix}.${secretMaterial}`;
  return { secret, prefix, keyHash: await hashApiKey(secret) };
}
