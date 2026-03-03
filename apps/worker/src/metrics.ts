import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { getMetrics } from './db';
import { getQueueSize } from './queue';
import type { Channel } from 'amqplib';

export interface Metrics {
  concurrentMails: Counter;
  activeMails: Counter;
  sendRate: Gauge;
  mailsSentTotal: Gauge;
  healthStatus: Gauge;
  queueSize: Gauge;
  mailsFailed: Gauge;
  mailsPending: Gauge;
  accounts: Gauge;
  templates: Gauge;
  registry: Registry;
}

export function createMetrics(): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ app: 'mailer-worker' });
  collectDefaultMetrics({ register: registry });

  return {
    concurrentMails: new Counter({
      name: 'mailer_concurrent_mails',
      help: 'Number of emails processed in the last 5 minutes',
      registers: [registry],
    }),
    activeMails: new Counter({
      name: 'mailer_active_mails',
      help: 'Total number of emails processed (lifetime)',
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
      help: 'Total pending/retrying emails (from DB)',
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
    registry,
  };
}

export function startMetricsServer(metrics: Metrics, port: number): { stop: () => void } {
  const server = Bun.serve({
    port,
    fetch: async (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/metrics') {
        const data = await metrics.registry.metrics();
        return new Response(data, {
          headers: { 'Content-Type': metrics.registry.contentType },
        });
      }
      return new Response('Not Found', { status: 404 });
    },
  });
  console.log(`[metrics] Prometheus endpoint at http://localhost:${port}/metrics`);
  return { stop: () => server.stop() };
}

export function startMetricsUpdater(
  metrics: Metrics,
  channel: Channel,
): { stop: () => void } {
  // Update DB counts and queue size every 10 seconds
  const dbInterval = setInterval(async () => {
    try {
      metrics.healthStatus.set(1);
      const [queueSz, dbMetrics] = await Promise.all([
        getQueueSize(channel),
        getMetrics(),
      ]);
      metrics.queueSize.set(queueSz);
      metrics.mailsSentTotal.set(dbMetrics.sentMails);
      metrics.accounts.set(dbMetrics.accounts);
      metrics.templates.set(dbMetrics.templates);
      metrics.mailsFailed.set(dbMetrics.failedMails);
      metrics.mailsPending.set(dbMetrics.pendingMails);
    } catch (err) {
      console.error('[metrics] Error updating DB metrics:', err);
    }
  }, 10_000);

  // Calculate send rate and reset counter every 5 minutes
  const rateInterval = setInterval(async () => {
    try {
      const snapshot = await metrics.concurrentMails.get();
      const count = snapshot.values[0]?.value ?? 0;
      metrics.sendRate.set(count / 5);
      metrics.concurrentMails.reset();
    } catch (err) {
      console.error('[metrics] Error calculating send rate:', err);
    }
  }, 5 * 60_000);

  return {
    stop: () => {
      clearInterval(dbInterval);
      clearInterval(rateInterval);
    },
  };
}
