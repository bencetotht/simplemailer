import * as path from 'path';
import * as fs from 'fs';
import type { ConfirmChannel } from 'amqplib';
import { prisma } from 'database';
import { CircuitBreaker } from './circuit-breaker';
import { resolveConfig, seedFromConfigYaml } from './config';
import { startConsumer } from './consumer';
import { deregisterWorker, registerWorker, startHeartbeatLoop } from './health';
import { createMetrics, startMetricsServer, startMetricsUpdater } from './metrics';
import { logRedactedError } from './log';
import { connectRabbitMQ, setupTopology } from './queue';
import { startEnqueueReconciler } from './reconciler';
import { createS3Client } from './s3';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForConnectionLoss(connection: { once: (event: string, cb: () => void) => void }): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    connection.once('close', done);
    connection.once('error', done);
  });
}

async function main() {
  const config = resolveConfig();
  const breaker = new CircuitBreaker();
  const s3Client = createS3Client(config);
  const metrics = createMetrics();

  let currentChannel: ConfirmChannel | null = null;
  let isReady = false;
  let shuttingDown = false;
  let shutdownResolve: (() => void) | null = null;
  const shutdownPromise = new Promise<void>((resolve) => {
    shutdownResolve = resolve;
  });

  console.log(`[worker] Starting worker ${config.workerId} v${config.workerVersion}`);

  const configPath = process.env.CONFIG_PATH || path.resolve('../../config.yaml');
  if (fs.existsSync(configPath)) {
    console.log('[worker] Seeding from config.yaml...');
    await seedFromConfigYaml(configPath);
  }

  const heartbeat = startHeartbeatLoop(config.workerId, config.heartbeatInterval);
  await registerWorker(config.workerId, config.workerVersion);
  console.log(`[worker] Registered heartbeat for ${config.workerId}`);

  const metricsServer = startMetricsServer(metrics, config.metricsPort, () => isReady);
  const metricsUpdater = startMetricsUpdater(metrics, () => currentChannel);
  const reconciler = startEnqueueReconciler(() => currentChannel, config);

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — shutting down gracefully...`);
    shutdownResolve?.();
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  let reconnectDelay = config.reconnectInitialDelayMs;

  while (!shuttingDown) {
    let connection: Awaited<ReturnType<typeof connectRabbitMQ>>['connection'] | null = null;
    let consumerStop: (() => Promise<void>) | null = null;

    try {
      console.log('[worker] Connecting to RabbitMQ...');
      const amqp = await connectRabbitMQ(config);
      connection = amqp.connection;
      currentChannel = amqp.channel;
      await setupTopology(currentChannel);
      console.log('[worker] RabbitMQ topology ready');

      connection.on('blocked', (reason) => {
        console.warn(`[worker] RabbitMQ connection blocked: ${reason}`);
      });
      connection.on('unblocked', () => {
        console.log('[worker] RabbitMQ connection unblocked');
      });

      const consumer = await startConsumer(currentChannel, {
        config,
        s3Client,
        metrics,
        breaker,
      });
      consumerStop = consumer.stop;

      isReady = true;
      reconnectDelay = config.reconnectInitialDelayMs;
      console.log(`[worker] Consuming from queue '${config.rabbitmqQueue}'`);

      await Promise.race([waitForConnectionLoss(connection), shutdownPromise]);
    } catch (err) {
      logRedactedError('worker.connection_loop', err);
    } finally {
      isReady = false;

      if (consumerStop) {
        try {
          await consumerStop();
        } catch {
          // ignored during shutdown/reconnect
        }
      }

      if (currentChannel) {
        try {
          await currentChannel.close();
        } catch {
          // ignored during shutdown/reconnect
        }
      }

      if (connection) {
        try {
          await connection.close();
        } catch {
          // ignored during shutdown/reconnect
        }
      }

      currentChannel = null;
    }

    if (!shuttingDown) {
      console.warn(`[worker] AMQP disconnected, reconnecting in ${reconnectDelay}ms...`);
      await sleep(reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, config.reconnectMaxDelayMs);
    }
  }

  reconciler.stop();
  metricsUpdater.stop();
  metricsServer.stop();

  heartbeat.stop();
  await deregisterWorker(config.workerId);
  await prisma.$disconnect();
  console.log('[worker] Shutdown complete');
  process.exit(0);
}

main().catch((err) => {
  logRedactedError('worker.fatal_startup', err);
  process.exit(1);
});
