import { prisma } from 'database';

export async function registerWorker(id: string, version: string): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { id },
    create: { id, version },
    update: { lastHeartbeat: new Date() },
  });
}

export async function sendHeartbeat(
  id: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.workerHeartbeat.update({
    where: { id },
    data: {
      lastHeartbeat: new Date(),
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
  id: string,
  intervalMs = 10_000,
): { stop: () => void } {
  const timer = setInterval(async () => {
    try {
      await sendHeartbeat(id);
    } catch (err) {
      console.error('[health] Heartbeat failed:', err);
    }
  }, intervalMs);

  return { stop: () => clearInterval(timer) };
}
