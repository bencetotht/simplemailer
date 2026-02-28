import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Counter, Gauge } from "prom-client";
import { Cron, CronExpression } from '@nestjs/schedule';
import { DbService } from "./db.service";
import { QueueService } from "./queue.service";

@Injectable()
export class PrometheusService implements OnModuleInit {
  private logger = new Logger(PrometheusService.name);
    constructor(
        @InjectMetric('mailer_concurrent_mails') private readonly concurrentMails: Counter<string>, // number of emails processed in last 5 minutes
        @InjectMetric('mailer_active_mails') private readonly activeMails: Counter<string>, // number of emails currently being processed
        @InjectMetric('mailer_send_rate') private readonly sendRate: Gauge<string>, // number of emails sent per minute
        @InjectMetric('mailer_mails_sent_total') private readonly mailsSentTotal: Gauge<string>, // number of emails sent
        @InjectMetric('mailer_health_status') private readonly healthStatus: Gauge<string>, // health status of the mailer service (1 = healthy, 0 = unhealthy)
        @InjectMetric('mailer_queue_size') private readonly queueSize: Gauge<string>, // number of emails in the queue
        @InjectMetric('mailer_mails_failed') private readonly mailsFailed: Gauge<string>, // number of emails failed
        @InjectMetric('mailer_mails_pending') private readonly mailsPending: Gauge<string>, // number of emails pending
        @InjectMetric('mailer_accounts') private readonly accounts: Gauge<string>, // number of accounts
        @InjectMetric('mailer_templates') private readonly templates: Gauge<string>, // number of templates
        private readonly dbService: DbService,
        private readonly queueService: QueueService,
    ) {}

    public async onModuleInit() {
      this.logger.log('Prometheus metrics initialized, updating metrics...');
      this.activeMails.reset();
      await this.updateMetrics();
    }

    @Cron(CronExpression.EVERY_10_SECONDS)
    public async updateMetrics() {
      this.healthStatus.set(1);
      
      const queueSize = await this.queueService.getQueueSize();
      this.queueSize.set(queueSize);
      
      // DB Metrics
      const dbMetrics = await this.dbService.getMetrics();
      this.mailsSentTotal.set(dbMetrics.sentMails);
      this.accounts.set(dbMetrics.accounts);
      this.templates.set(dbMetrics.templates);
      this.mailsFailed.set(dbMetrics.failedMails);
      this.mailsPending.set(dbMetrics.pendingMails);
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    public async resetMetrics() {
      const concurrentMails = (await this.concurrentMails.get()).values[0].value;
      const mailsPerMinute = concurrentMails / 5;
      this.sendRate.set(mailsPerMinute);
      this.concurrentMails.reset();
    }

    public async logProcessedMail() {
      this.concurrentMails.inc();
      this.activeMails.inc();
    }
}