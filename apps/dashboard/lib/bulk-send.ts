import { Status } from "database";
import { z } from "zod";
import { bulkMailRecipientSchema } from "@/lib/validators";

export const BULK_DEFAULT_MIN_DELAY_MS = 5_000;
export const BULK_MAX_MIN_DELAY_MS = 600_000;
export const BULK_MAX_RECIPIENTS_PER_BATCH = 1_000;
export const BULK_DUE_CHUNK_SIZE = 50;
export const BULK_REJECTED_STATUS = "REJECTED" as const;

const emailSchema = z.string().trim().email();

export interface AcceptedBulkRecipient {
  index: number;
  recipient: string;
  values: Record<string, unknown>;
}

export interface RejectedBulkRecipient {
  index: number;
  recipient: string | null;
  values: Record<string, unknown>;
  error: string;
}

export type BulkItemStatus = Status | typeof BULK_REJECTED_STATUS;

export interface BatchItemSummaryInput {
  id: string;
  sequence: number;
  recipient: string;
  values: unknown;
  validationError: string | null;
  logId: string | null;
  createdAt: Date;
  updatedAt: Date;
  log: null | {
    id: string;
    status: Status;
    scheduledFor: Date | null;
  };
}

export interface BatchItemSummary {
  id: string;
  sequence: number;
  recipient: string;
  values: unknown;
  validationError: string | null;
  logId: string | null;
  status: BulkItemStatus;
  scheduledFor: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function clampBulkMinDelayMs(value?: number): number {
  if (value === undefined) return BULK_DEFAULT_MIN_DELAY_MS;
  return Math.min(
    Math.max(Math.round(value), BULK_DEFAULT_MIN_DELAY_MS),
    BULK_MAX_MIN_DELAY_MS,
  );
}

export function mergeBulkValues(
  sharedValues: Record<string, unknown>,
  recipientValues?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...sharedValues,
    ...(recipientValues ?? {}),
  };
}

export function validateBulkRecipients(
  recipients: unknown[],
  sharedValues: Record<string, unknown>,
): {
  accepted: AcceptedBulkRecipient[];
  rejected: RejectedBulkRecipient[];
} {
  const accepted: AcceptedBulkRecipient[] = [];
  const rejected: RejectedBulkRecipient[] = [];

  recipients.forEach((entry, index) => {
    const parsed = bulkMailRecipientSchema.safeParse(entry);
    if (!parsed.success) {
      rejected.push({
        index,
        recipient: null,
        values: {},
        error: parsed.error.issues[0]?.message ?? "Invalid recipient entry",
      });
      return;
    }

    const normalizedRecipient = parsed.data.recipient.trim();
    const email = emailSchema.safeParse(normalizedRecipient);
    const mergedValues = mergeBulkValues(sharedValues, parsed.data.values);

    if (!email.success) {
      rejected.push({
        index,
        recipient: normalizedRecipient || null,
        values: mergedValues,
        error: email.error.issues[0]?.message ?? "Invalid recipient email",
      });
      return;
    }

    accepted.push({
      index,
      recipient: email.data,
      values: mergedValues,
    });
  });

  return { accepted, rejected };
}

export function buildScheduledSendTimes(
  startAt: Date,
  count: number,
  minDelayMs: number,
): Date[] {
  return Array.from({ length: count }, (_, index) => (
    new Date(startAt.getTime() + index * minDelayMs)
  ));
}

export function computeInitialScheduleStart(
  now: Date,
  nextAvailableAt: Date | null | undefined,
): Date {
  if (!nextAvailableAt) return now;
  return nextAvailableAt.getTime() > now.getTime() ? nextAvailableAt : now;
}

export function isTerminalLogStatus(status: Status): boolean {
  return status === Status.SENT || status === Status.FAILED || status === Status.DEAD;
}

export function resolveBulkItemStatus(item: BatchItemSummaryInput): BulkItemStatus {
  if (item.validationError) return BULK_REJECTED_STATUS;
  return item.log?.status ?? Status.ENQUEUE_PENDING;
}

export function summarizeBulkItems(items: BatchItemSummaryInput[]): {
  countsByStatus: Record<string, number>;
  terminalAcceptedCount: number;
  items: BatchItemSummary[];
} {
  const countsByStatus: Record<string, number> = {};
  let terminalAcceptedCount = 0;

  const normalizedItems = items.map((item) => {
    const status = resolveBulkItemStatus(item);
    countsByStatus[status] = (countsByStatus[status] ?? 0) + 1;

    if (status !== BULK_REJECTED_STATUS && isTerminalLogStatus(status)) {
      terminalAcceptedCount += 1;
    }

    return {
      id: item.id,
      sequence: item.sequence,
      recipient: item.recipient,
      values: item.values,
      validationError: item.validationError,
      logId: item.logId,
      status,
      scheduledFor: item.log?.scheduledFor ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  return {
    countsByStatus,
    terminalAcceptedCount,
    items: normalizedItems,
  };
}
