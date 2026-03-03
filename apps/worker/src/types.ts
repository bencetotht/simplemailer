export interface MailJob {
  accountId: string;
  templateId: string;
  recipient: string;
  values: Record<string, unknown>;
}

export interface QueueMessageV1 {
  pattern?: string;
  data: MailJob;
}

export interface QueueMessageV2 {
  jobId: string;
  attempt: number;
  correlationId: string;
  data: MailJob;
}

export type QueueMessage = QueueMessageV1 | QueueMessageV2;

export interface WorkerConfig {
  rabbitmqUrl: string;
  rabbitmqQueue: string;
  prefetchCount: number;
  maxRetries: number;
  publishConfirmTimeoutMs: number;
  templatePath: string;
  s3Endpoint?: string;
  s3Port?: number;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Bucket?: string;
  metricsPort: number;
  heartbeatInterval: number;
  reconnectInitialDelayMs: number;
  reconnectMaxDelayMs: number;
  enqueueReconcilerIntervalMs: number;
  smtpRejectUnauthorized: boolean;
  workerId: string;
  workerVersion: string;
}
