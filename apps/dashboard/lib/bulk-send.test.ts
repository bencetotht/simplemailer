import { describe, expect, test } from "bun:test";
import { Status } from "database";
import {
  BULK_DEFAULT_MIN_DELAY_MS,
  BULK_MAX_MIN_DELAY_MS,
  buildScheduledSendTimes,
  clampBulkMinDelayMs,
  computeInitialScheduleStart,
  summarizeBulkItems,
  validateBulkRecipients,
} from "./bulk-send";

describe("bulk-send helpers", () => {
  test("accepts recipients that only use shared values", () => {
    const result = validateBulkRecipients(
      [{ recipient: "alice@example.com" }],
      { campaign: "launch", locale: "en" },
    );

    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toEqual([
      {
        index: 0,
        recipient: "alice@example.com",
        values: {
          campaign: "launch",
          locale: "en",
        },
      },
    ]);
  });

  test("recipient values override shared values", () => {
    const result = validateBulkRecipients(
      [{
        recipient: "alice@example.com",
        values: { locale: "de", firstName: "Alice" },
      }],
      { locale: "en", campaign: "launch" },
    );

    expect(result.accepted[0]?.values).toEqual({
      locale: "de",
      campaign: "launch",
      firstName: "Alice",
    });
  });

  test("rejects invalid recipient emails and surfaces all-invalid batches", () => {
    const result = validateBulkRecipients(
      [
        { recipient: "bad-email" },
        { recipient: "still-bad" },
      ],
      { campaign: "launch" },
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.map((item) => item.index)).toEqual([0, 1]);
  });

  test("clamps pacing delays to the supported range", () => {
    expect(clampBulkMinDelayMs()).toBe(BULK_DEFAULT_MIN_DELAY_MS);
    expect(clampBulkMinDelayMs(250)).toBe(BULK_DEFAULT_MIN_DELAY_MS);
    expect(clampBulkMinDelayMs(BULK_MAX_MIN_DELAY_MS + 5_000)).toBe(BULK_MAX_MIN_DELAY_MS);
  });

  test("builds sequential schedule slots without overlap across consecutive batches", () => {
    const firstStart = new Date("2026-03-09T10:00:00.000Z");
    const firstSchedule = buildScheduledSendTimes(firstStart, 3, 5_000);
    const nextAvailableAt = new Date(firstSchedule[2]!.getTime() + 5_000);
    const secondStart = computeInitialScheduleStart(
      new Date("2026-03-09T10:00:01.000Z"),
      nextAvailableAt,
    );
    const secondSchedule = buildScheduledSendTimes(secondStart, 2, 5_000);

    expect(firstSchedule.map((value) => value.toISOString())).toEqual([
      "2026-03-09T10:00:00.000Z",
      "2026-03-09T10:00:05.000Z",
      "2026-03-09T10:00:10.000Z",
    ]);
    expect(secondSchedule.map((value) => value.toISOString())).toEqual([
      "2026-03-09T10:00:15.000Z",
      "2026-03-09T10:00:20.000Z",
    ]);
  });

  test("summarizes mixed rejected and log-backed item states", () => {
    const summary = summarizeBulkItems([
      {
        id: "item-1",
        sequence: 0,
        recipient: "bad@example.com",
        values: {},
        validationError: "Invalid recipient",
        logId: null,
        createdAt: new Date("2026-03-09T10:00:00.000Z"),
        updatedAt: new Date("2026-03-09T10:00:00.000Z"),
        log: null,
      },
      {
        id: "item-2",
        sequence: 1,
        recipient: "queued@example.com",
        values: {},
        validationError: null,
        logId: "log-2",
        createdAt: new Date("2026-03-09T10:00:00.000Z"),
        updatedAt: new Date("2026-03-09T10:00:00.000Z"),
        log: {
          id: "log-2",
          status: Status.QUEUED,
          scheduledFor: new Date("2026-03-09T10:00:05.000Z"),
        },
      },
      {
        id: "item-3",
        sequence: 2,
        recipient: "sent@example.com",
        values: {},
        validationError: null,
        logId: "log-3",
        createdAt: new Date("2026-03-09T10:00:00.000Z"),
        updatedAt: new Date("2026-03-09T10:00:00.000Z"),
        log: {
          id: "log-3",
          status: Status.SENT,
          scheduledFor: new Date("2026-03-09T10:00:10.000Z"),
        },
      },
    ]);

    expect(summary.countsByStatus).toEqual({
      REJECTED: 1,
      QUEUED: 1,
      SENT: 1,
    });
    expect(summary.terminalAcceptedCount).toBe(1);
  });
});
