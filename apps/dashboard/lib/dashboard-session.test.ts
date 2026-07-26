import { describe, expect, test } from "vitest";
import { createDashboardSession, verifyDashboardSession } from "./dashboard-session";

describe("dashboard sessions", () => {
  test("accepts a valid signed, unexpired session", async () => {
    const now = Date.UTC(2026, 6, 26);
    const token = await createDashboardSession("test-session-secret", now);
    await expect(
      verifyDashboardSession(token, "test-session-secret", now + 1_000),
    ).resolves.toBe(true);
  });

  test("rejects tampering, wrong secrets, and expired sessions", async () => {
    const now = Date.UTC(2026, 6, 26);
    const token = await createDashboardSession("test-session-secret", now);
    await expect(verifyDashboardSession(`${token}x`, "test-session-secret", now)).resolves.toBe(false);
    await expect(verifyDashboardSession(token, "wrong-secret", now)).resolves.toBe(false);
    await expect(
      verifyDashboardSession(token, "test-session-secret", now + 13 * 60 * 60 * 1000),
    ).resolves.toBe(false);
  });
});
