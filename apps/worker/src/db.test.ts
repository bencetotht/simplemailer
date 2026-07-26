import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));

vi.mock('database', () => ({
  prisma: {
    log: { updateMany: mocks.updateMany },
  },
  Status: {
    ENQUEUE_PENDING: 'ENQUEUE_PENDING',
    QUEUED: 'QUEUED',
    RETRYING: 'RETRYING',
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    DELIVERY_UNCERTAIN: 'DELIVERY_UNCERTAIN',
  },
}));

import { claimLogForProcessing, recoverExpiredProcessingLeases } from './db';

describe('processing leases', () => {
  beforeEach(() => {
    mocks.updateMany.mockReset();
  });

  test('claims ready or safely expired pre-delivery work for one owner', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(claimLogForProcessing('job-1', 'worker-1', 120_000)).resolves.toBe(true);

    const request = mocks.updateMany.mock.calls[0]?.[0];
    expect(request.where.OR).toContainEqual({
      status: 'PROCESSING',
      processingLeaseExpiresAt: { lte: expect.any(Date) },
      deliveryAttemptStartedAt: null,
    });
    expect(request.data).toMatchObject({
      status: 'PROCESSING',
      processingOwner: 'worker-1',
      processingLeaseExpiresAt: expect.any(Date),
      deliveryAttemptStartedAt: null,
    });
  });

  test('suppresses automatic retry after an expired SMTP delivery attempt', async () => {
    mocks.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 3 });

    await expect(recoverExpiredProcessingLeases()).resolves.toEqual({
      uncertain: 2,
      requeued: 3,
    });

    expect(mocks.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        status: 'PROCESSING',
        deliveryAttemptStartedAt: { not: null },
      },
      data: {
        status: 'DELIVERY_UNCERTAIN',
        failureClass: 'WORKER_LOST_DURING_SMTP_DELIVERY',
      },
    });
    expect(mocks.updateMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        status: 'PROCESSING',
        deliveryAttemptStartedAt: null,
      },
      data: {
        status: 'ENQUEUE_PENDING',
        failureClass: 'PROCESSING_LEASE_EXPIRED',
      },
    });
  });
});
