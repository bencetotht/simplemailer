import { describe, expect, test } from "vitest";
import { apiKeyPrefix, generateApiKey, hashApiKey, verifyApiKey } from "./api-keys";

describe("project API keys", () => {
  test("generate at least 256 bits of secret material and verify only the original key", async () => {
    const key = await generateApiKey();

    expect(key.secret).toMatch(/^sm_live_[a-f0-9]{16}\.[A-Za-z0-9_-]{43}$/);
    expect(apiKeyPrefix(key.secret)).toBe(key.prefix);
    await expect(verifyApiKey(key.secret, key.keyHash)).resolves.toBe(true);
    await expect(verifyApiKey(`${key.secret}x`, key.keyHash)).resolves.toBe(false);
  });

  test("uses a random salt for equal secrets", async () => {
    const secret = "sm_live_0123456789abcdef.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const first = await hashApiKey(secret);
    const second = await hashApiKey(secret);

    expect(first).not.toBe(second);
    await expect(verifyApiKey(secret, first)).resolves.toBe(true);
    await expect(verifyApiKey(secret, second)).resolves.toBe(true);
  });

  test("rejects malformed keys and hashes", async () => {
    expect(apiKeyPrefix("not-a-key")).toBeNull();
    await expect(verifyApiKey("anything", "invalid")).resolves.toBe(false);
  });
});
