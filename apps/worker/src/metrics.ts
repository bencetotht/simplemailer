import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { createServer } from 'node:http';
import { getMetrics } from './db';
import { getQueueSize } from './queue';
import type { ConfirmChannel } from 'amqplib';

export interface AutoscaleSnapshot {
  autoscalePressure: number;
  queueReady: number;
  retrying: number;
  activeWorkers: number;
  inFlight: number;
}

export interface WorkerHealthSnapshot {
  healthy: boolean;
  amqpReady: boolean;
  heartbeatHealthy: boolean;
  consecutiveHeartbeatFailures: number;
  heartbeatInRetry: boolean;
  heartbeatRetryAttempt: number;
  lastHeartbeatSuccessAt: string | null;
  lastHeartbeatFailureAt: string | null;
  heartbeatLastError: string | null;
}

export interface Metrics {
  processedTotal: Counter;
  sendRate: Gauge;
  mailsSentTotal: Gauge;
  healthStatus: Gauge;
  queueSize: Gauge;
  mailsFailed: Gauge;
  mailsPending: Gauge;
  accounts: Gauge;
  templates: Gauge;
  retryBacklog: Gauge;
  queueReady: Gauge;
  workersActive: Gauge;
  inFlightJobs: Gauge;
  autoscalePressure: Gauge;
  legacyPlaintextSecrets: Gauge;
  openCircuits: Gauge;
  registry: Registry;
  autoscaleSnapshot: AutoscaleSnapshot;
  incInFlight: () => void;
  decInFlight: () => void;
  setOpenCircuits: (count: number) => void;
  getInFlight: () => number;
}

export function createMetrics(): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ app: 'mailer-worker' });
  collectDefaultMetrics({ register: registry });

  let inFlight = 0;
  const snapshot: AutoscaleSnapshot = {
    autoscalePressure: 0,
    queueReady: 0,
    retrying: 0,
    activeWorkers: 0,
    inFlight: 0,
  };

  const metrics: Metrics = {
    processedTotal: new Counter({
      name: 'mailer_processed_total',
      help: 'Total number of processed emails',
      registers: [registry],
    }),
    sendRate: new Gauge({
      name: 'mailer_send_rate',
      help: 'Emails sent per minute (5-min rolling average)',
      registers: [registry],
    }),
    mailsSentTotal: new Gauge({
      name: 'mailer_mails_sent_total',
      help: 'Total sent emails (from DB)',
      registers: [registry],
    }),
    healthStatus: new Gauge({
      name: 'mailer_health_status',
      help: 'Worker health (1 = healthy, 0 = unhealthy)',
      registers: [registry],
    }),
    queueSize: new Gauge({
      name: 'mailer_queue_size',
      help: 'Number of messages in the mailer queue',
      registers: [registry],
    }),
    mailsFailed: new Gauge({
      name: 'mailer_mails_failed',
      help: 'Total failed emails (from DB)',
      registers: [registry],
    }),
    mailsPending: new Gauge({
      name: 'mailer_mails_pending',
      help: 'Total enqueue-pending emails (from DB)',
      registers: [registry],
    }),
    accounts: new Gauge({
      name: 'mailer_accounts',
      help: 'Total configured accounts',
      registers: [registry],
    }),
    templates: new Gauge({
      name: 'mailer_templates',
      help: 'Total configured templates',
      registers: [registry],
    }),
    retryBacklog: new Gauge({
      name: 'mailer_retry_backlog',
      help: 'Current retry backlog size',
      registers: [registry],
    }),
    queueReady: new Gauge({
      name: 'mailer_queue_ready',
      help: 'Current queue ready count',
      registers: [registry],
    }),
    workersActive: new Gauge({
      name: 'mailer_workers_active',
      help: 'Currently active workers (heartbeats in last 30s)',
      registers: [registry],
    }),
    inFlightJobs: new Gauge({
      name: 'mailer_inflight_jobs',
      help: 'Messages currently in flight in this worker',
      registers: [registry],
    }),
    autoscalePressure: new Gauge({
      name: 'mailer_autoscale_pressure',
      help: 'Queue pressure per active worker for autoscaling',
      registers: [registry],
    }),
    legacyPlaintextSecrets: new Gauge({
      name: 'mailer_legacy_plaintext_secrets',
      help: 'Number of records still using legacy plaintext secrets',
      registers: [registry],
    }),
    openCircuits: new Gauge({
      name: 'mailer_circuit_breaker_open',
      help: 'Number of open SMTP circuit breakers',
      registers: [registry],
    }),
    registry,
    autoscaleSnapshot: snapshot,
    incInFlight: () => {
      inFlight += 1;
      metrics.inFlightJobs.set(inFlight);
      snapshot.inFlight = inFlight;
    },
    decInFlight: () => {
      inFlight = Math.max(0, inFlight - 1);
      metrics.inFlightJobs.set(inFlight);
      snapshot.inFlight = inFlight;
    },
    setOpenCircuits: (count: number) => {
      metrics.openCircuits.set(count);
    },
    getInFlight: () => inFlight,
  };

  return metrics;
}

export function startMetricsServer(
  metrics: Metrics,
  port: number,
  readiness: () => boolean,
  healthSnapshot: () => WorkerHealthSnapshot,
): { stop: () => void } {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const sendJson = (body: unknown, status = 200): void => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    try {
      if (pathname === '/metrics') {
        response.writeHead(200, { 'Content-Type': metrics.registry.contentType });
        response.end(await metrics.registry.metrics());
        return;
      }

      if (pathname === '/autoscale') {
        sendJson(metrics.autoscaleSnapshot);
        return;
      }

      if (pathname === '/healthz') {
        const health = healthSnapshot();
        sendJson(
          { status: health.healthy ? 'ok' : 'unhealthy', ...health },
          health.healthy ? 200 : 503,
        );
        return;
      }

      if (pathname === '/readyz') {
        const ready = readiness();
        sendJson({ ready }, ready ? 200 : 503);
        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not Found');
    } catch (error) {
      console.error('[metrics] Request failed:', error);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('Internal Server Error');
    }
  });
  server.listen(port);
  console.log(`[metrics] Metrics endpoint at http://localhost:${port}/metrics`);
  return { stop: () => server.close() };
}

export function startMetricsUpdater(
  metrics: Metrics,
  getChannel: () => ConfirmChannel | null,
  isHealthy: () => boolean,
): { stop: () => void } {
  const rateWindowSamples: number[] = [];

  const dbInterval = setInterval(async () => {
    try {
      metrics.healthStatus.set(isHealthy() ? 1 : 0);
      const channel = getChannel();
      const queueReady = channel ? await getQueueSize(channel) : 0;
      const dbMetrics = await getMetrics();
      const retrying = dbMetrics.retryingMails;
      const activeWorkers = Math.max(dbMetrics.activeWorkers, 1);
      const pressure =
        (queueReady + retrying * 0.5 + metrics.getInFlight()) / activeWorkers;

      metrics.queueSize.set(queueReady);
      metrics.queueReady.set(queueReady);
      metrics.mailsSentTotal.set(dbMetrics.sentMails);
      metrics.accounts.set(dbMetrics.accounts);
      metrics.templates.set(dbMetrics.templates);
      metrics.mailsFailed.set(dbMetrics.failedMails);
      metrics.mailsPending.set(dbMetrics.pendingMails);
      metrics.retryBacklog.set(retrying);
      metrics.workersActive.set(dbMetrics.activeWorkers);
      metrics.autoscalePressure.set(pressure);
      metrics.legacyPlaintextSecrets.set(dbMetrics.legacyPlaintextSecrets);

      metrics.autoscaleSnapshot.autoscalePressure = pressure;
      metrics.autoscaleSnapshot.queueReady = queueReady;
      metrics.autoscaleSnapshot.retrying = retrying;
      metrics.autoscaleSnapshot.activeWorkers = dbMetrics.activeWorkers;
      metrics.autoscaleSnapshot.inFlight = metrics.getInFlight();

      rateWindowSamples.push(dbMetrics.sentMails);
      if (rateWindowSamples.length > 30) {
        rateWindowSamples.shift();
      }
    } catch (err) {
      metrics.healthStatus.set(0);
      console.error('[metrics] Error updating metrics:', err);
    }
  }, 10_000);

  const rateInterval = setInterval(() => {
    if (rateWindowSamples.length < 2) {
      metrics.sendRate.set(0);
      return;
    }
    const oldest = rateWindowSamples[0] ?? 0;
    const latest = rateWindowSamples[rateWindowSamples.length - 1] ?? 0;
    const delta = Math.max(latest - oldest, 0);
    const minutes = ((rateWindowSamples.length - 1) * 10) / 60;
    metrics.sendRate.set(minutes > 0 ? delta / minutes : 0);
  }, 30_000);

  return {
    stop: () => {
      clearInterval(dbInterval);
      clearInterval(rateInterval);
    },
  };
}
