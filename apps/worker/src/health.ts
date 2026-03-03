import { prisma } from 'database';
import { logRedactedError } from './log';

interface HeartbeatLoopOptions {
  id: string;
  version: string;
  intervalMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  failureThreshold: number;
  staleAfterMs: number;
  onConnectivityChange?: (event: HeartbeatConnectivityEvent) => void;
}

export interface HeartbeatStatus {
  healthy: boolean;
  consecutiveFailures: number;
  inRetry: boolean;
  currentRetryAttempt: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
}

export interface HeartbeatConnectivityEvent {
  workerId: string;
  healthy: boolean;
  reason: 'startup' | 'heartbeat-ok' | 'heartbeat-failed';
  consecutiveFailures: number;
  inRetry: boolean;
  retryAttempt: number;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export interface HeartbeatLoopHandle {
  stop: () => void;
  getStatus: () => HeartbeatStatus;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function computeBackoffDelay(baseDelayMs: number, attempt: number): number {
  return Math.min(baseDelayMs * 2 ** Math.max(attempt - 1, 0), 30_000);
}

function computeHealthStatus(
  status: Omit<HeartbeatStatus, 'healthy'>,
  staleAfterMs: number,
  failureThreshold: number,
): boolean {
  const now = Date.now();
  const stale =
    !status.lastSuccessAt ||
    now - status.lastSuccessAt.getTime() > staleAfterMs;
  const failedThreshold = status.consecutiveFailures >= failureThreshold;
  return !stale && !failedThreshold;
}

export async function registerWorker(id: string, version: string): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { id },
    create: { id, version },
    update: { lastHeartbeat: new Date(), version },
  });
}

export async function sendHeartbeat(
  id: string,
  version: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { id },
    create: {
      id,
      version,
      ...(metadata ? { metadata: metadata as object } : {}),
    },
    update: {
      lastHeartbeat: new Date(),
      version,
      ...(metadata ? { metadata: metadata as object } : {}),
    },
  });
}

export async function deregisterWorker(id: string): Promise<void> {
  try {
    await prisma.workerHeartbeat.delete({ where: { id } });
  } catch {
    // Ignore if already removed
  }
}

export function startHeartbeatLoop(
  options: HeartbeatLoopOptions,
): HeartbeatLoopHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let lastAnnouncedHealthy: boolean | null = null;
  const status = {
    consecutiveFailures: 0,
    inRetry: false,
    currentRetryAttempt: 0,
    lastSuccessAt: new Date(),
    lastFailureAt: null as Date | null,
    lastError: null as string | null,
  };

  const getStatus = (): HeartbeatStatus => {
    const healthy = computeHealthStatus(
      status,
      options.staleAfterMs,
      options.failureThreshold,
    );
    return {
      healthy,
      consecutiveFailures: status.consecutiveFailures,
      inRetry: status.inRetry,
      currentRetryAttempt: status.currentRetryAttempt,
      lastSuccessAt: status.lastSuccessAt,
      lastFailureAt: status.lastFailureAt,
      lastError: status.lastError,
    };
  };

  const emitConnectivityChange = (
    reason: HeartbeatConnectivityEvent['reason'],
  ): void => {
    const snapshot = getStatus();
    if (lastAnnouncedHealthy === snapshot.healthy) {
      return;
    }

    lastAnnouncedHealthy = snapshot.healthy;
    const event: HeartbeatConnectivityEvent = {
      workerId: options.id,
      healthy: snapshot.healthy,
      reason,
      consecutiveFailures: snapshot.consecutiveFailures,
      inRetry: snapshot.inRetry,
      retryAttempt: snapshot.currentRetryAttempt,
      lastError: snapshot.lastError,
      lastSuccessAt: snapshot.lastSuccessAt
        ? snapshot.lastSuccessAt.toISOString()
        : null,
      lastFailureAt: snapshot.lastFailureAt
        ? snapshot.lastFailureAt.toISOString()
        : null,
    };

    if (options.onConnectivityChange) {
      options.onConnectivityChange(event);
      return;
    }

    if (event.healthy) {
      console.log(`[health] Connectivity healthy for ${event.workerId}`);
      return;
    }
    console.error(
      `[health] Connectivity unhealthy for ${event.workerId}: ${event.lastError ?? 'unknown error'}`,
    );
  };

  emitConnectivityChange('startup');

  const run = async (): Promise<void> => {
    if (stopped) return;

    let delivered = false;
    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt += 1) {
      if (stopped) return;

      status.currentRetryAttempt = attempt;
      status.inRetry = attempt > 1;

      try {
        await sendHeartbeat(options.id, options.version);
        status.consecutiveFailures = 0;
        status.lastSuccessAt = new Date();
        status.lastError = null;
        status.inRetry = false;
        status.currentRetryAttempt = 0;
        delivered = true;
        break;
      } catch (error) {
        status.lastFailureAt = new Date();
        status.lastError = getErrorMessage(error);

        if (attempt <= options.maxRetries) {
          const delayMs = computeBackoffDelay(options.retryBaseDelayMs, attempt);
          console.warn(
            `[health] Heartbeat failed for ${options.id} (attempt ${attempt}/${options.maxRetries + 1}), retrying in ${delayMs}ms`,
          );
          logRedactedError('worker.heartbeat.retry', error, {
            workerId: options.id,
            attempt,
            maxRetries: options.maxRetries,
            delayMs,
          });
          await sleep(delayMs);
          continue;
        }

        status.consecutiveFailures += 1;
        status.inRetry = false;
        status.currentRetryAttempt = 0;
        console.error(
          `[health] Heartbeat exhausted retries for ${options.id} (consecutive failures: ${status.consecutiveFailures})`,
        );
        logRedactedError('worker.heartbeat.exhausted', error, {
          workerId: options.id,
          consecutiveFailures: status.consecutiveFailures,
          failureThreshold: options.failureThreshold,
        });
      }
    }

    if (!stopped) {
      if (!delivered && status.consecutiveFailures >= options.failureThreshold) {
        console.error(
          `[health] Worker ${options.id} marked unhealthy after ${status.consecutiveFailures} consecutive heartbeat failures`,
        );
      }
      emitConnectivityChange(delivered ? 'heartbeat-ok' : 'heartbeat-failed');
      timer = setTimeout(() => {
        void run();
      }, options.intervalMs);
    }
  };

  timer = setTimeout(() => {
    void run();
  }, options.intervalMs);

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    },
    getStatus,
  };
}
