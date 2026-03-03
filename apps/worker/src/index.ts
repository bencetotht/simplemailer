import * as path from 'path';
import * as fs from 'fs';
import { prisma } from 'database';
import { resolveConfig, seedFromConfigYaml } from './config';
import { connectRabbitMQ, setupTopology } from './queue';
import { createS3Client } from './s3';
import { createMetrics, startMetricsServer, startMetricsUpdater } from './metrics';
import { registerWorker, startHeartbeatLoop, deregisterWorker } from './health';
import { startConsumer } from './consumer';

async function main() {
  const config = resolveConfig();
  console.log(`[worker] Starting worker ${config.workerId} v${config.workerVersion}`);

  // Seed from config.yaml if it exists
  const configPath = process.env.CONFIG_PATH || path.resolve('../../config.yaml');
  if (fs.existsSync(configPath)) {
    console.log('[worker] Seeding from config.yaml...');
    await seedFromConfigYaml(configPath);
  }

  // Connect to RabbitMQ and set up topology
  console.log('[worker] Connecting to RabbitMQ...');
  const { connection, channel } = await connectRabbitMQ(config);
  await setupTopology(channel);
  console.log('[worker] RabbitMQ topology ready');

  // S3 client (optional)
  const s3Client = createS3Client(config);

  // Prometheus metrics
  const metrics = createMetrics();
  const metricsServer = startMetricsServer(metrics, config.metricsPort);
  const metricsUpdater = startMetricsUpdater(metrics, channel);

  // Worker heartbeat
  await registerWorker(config.workerId, config.workerVersion);
  const heartbeat = startHeartbeatLoop(config.workerId, config.heartbeatInterval);
  console.log(`[worker] Registered heartbeat for ${config.workerId}`);

  // Start consuming
  const consumer = await startConsumer(channel, { config, s3Client, metrics });
  console.log(`[worker] Consuming from queue '${config.rabbitmqQueue}'`);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — shutting down gracefully...`);

    // 1. Stop accepting new messages, drain in-flight (30s max)
    await consumer.stop();
    console.log('[worker] Consumer drained');

    // 2. Stop heartbeat and deregister
    heartbeat.stop();
    await deregisterWorker(config.workerId);
    console.log('[worker] Heartbeat stopped and worker deregistered');

    // 3. Stop metrics
    metricsUpdater.stop();
    metricsServer.stop();

    // 4. Close AMQP
    try {
      await channel.close();
      await connection.close();
    } catch {
      // Ignore close errors during shutdown
    }
    console.log('[worker] AMQP connection closed');

    // 5. Disconnect Prisma
    await prisma.$disconnect();
    console.log('[worker] Shutdown complete');

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] Fatal startup error:', err);
  process.exit(1);
});
