export interface MailJob {
  accountId: string;
  templateId: string;
  recipient: string;
  values: Record<string, unknown>;
}

export interface QueueMessage {
  pattern: string;
  data: MailJob;
}

export interface WorkerConfig {
  rabbitmqUrl: string;
  rabbitmqQueue: string;
  prefetchCount: number;
  maxRetries: number;
  templatePath: string;
  s3Endpoint?: string;
  s3Port?: number;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Bucket?: string;
  metricsPort: number;
  heartbeatInterval: number;
  workerId: string;
  workerVersion: string;
}
