import { describe, expect, test } from "bun:test";
import { isReadyForEnqueue } from "./reconciler";

describe("enqueue reconciler readiness", () => {
  test("accepts logs whose scheduled time has arrived", () => {
    const now = new Date("2026-03-09T10:00:10.000Z");
    const ready = isReadyForEnqueue(
      {
        scheduledFor: new Date("2026-03-09T10:00:05.000Z"),
        updatedAt: new Date("2026-03-09T10:00:00.000Z"),
      },
      now,
      10_000,
    );

    expect(ready).toBe(true);
  });

  test("rejects future scheduled logs", () => {
    const now = new Date("2026-03-09T10:00:10.000Z");
    const ready = isReadyForEnqueue(
      {
        scheduledFor: new Date("2026-03-09T10:00:20.000Z"),
        updatedAt: new Date("2026-03-09T10:00:00.000Z"),
      },
      now,
      10_000,
    );

    expect(ready).toBe(false);
  });

  test("falls back to stale ENQUEUE_PENDING detection for immediate jobs", () => {
    const now = new Date("2026-03-09T10:00:10.000Z");

    expect(isReadyForEnqueue(
      {
        scheduledFor: null,
        updatedAt: new Date("2026-03-09T09:59:59.000Z"),
      },
      now,
      10_000,
    )).toBe(true);

    expect(isReadyForEnqueue(
      {
        scheduledFor: null,
        updatedAt: new Date("2026-03-09T10:00:05.000Z"),
      },
      now,
      10_000,
    )).toBe(false);
  });
});
