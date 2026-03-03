import { prisma } from 'database';
import * as yaml from 'yaml';
import * as fs from 'fs';
import * as os from 'os';
import { ConfigError } from './errors';
import { encryptSecret } from './secrets';
import type { WorkerConfig } from './types';

function parseNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} must be a positive number`);
  }
  return parsed;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function validateRuntimeEnv(): void {
  if (!process.env.RABBITMQ_URL) {
    throw new ConfigError('RABBITMQ_URL is required');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.SECRETS_MASTER_KEY) {
    throw new ConfigError('SECRETS_MASTER_KEY is required in production');
  }
}

export function resolveConfig(): WorkerConfig {
  validateRuntimeEnv();

  const hostname = process.env.HOSTNAME || os.hostname();
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  const workerId = `${hostname}-${randomSuffix}`;

  return {
    rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    rabbitmqQueue: process.env.RABBITMQ_QUEUE || 'mailer',
    prefetchCount: parseNumber('PREFETCH_COUNT', 1),
    maxRetries: parseNumber('MAX_RETRIES', 8),
    publishConfirmTimeoutMs: parseNumber('PUBLISH_CONFIRM_TIMEOUT_MS', 5000),
    templatePath: process.env.TEMPLATE_PATH || '../../templates',
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Port: process.env.S3_PORT ? Number(process.env.S3_PORT) : undefined,
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
    s3Bucket: process.env.S3_BUCKET,
    metricsPort: parseNumber('METRICS_PORT', 9091),
    heartbeatInterval: parseNumber('HEARTBEAT_INTERVAL', 10_000),
    reconnectInitialDelayMs: parseNumber('RECONNECT_INITIAL_DELAY_MS', 1000),
    reconnectMaxDelayMs: parseNumber('RECONNECT_MAX_DELAY_MS', 30_000),
    enqueueReconcilerIntervalMs: parseNumber('ENQUEUE_RECONCILER_INTERVAL_MS', 15_000),
    smtpRejectUnauthorized: parseBoolean('SMTP_TLS_REJECT_UNAUTHORIZED', true),
    workerId,
    workerVersion: '2.0.0',
  };
}

export async function seedFromConfigYaml(configPath: string): Promise<void> {
  if (!fs.existsSync(configPath)) {
    console.warn(`[config] config.yaml not found at ${configPath}`);
    return;
  }

  let config: Record<string, unknown[]>;
  try {
    config = yaml.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('[config] Error parsing config.yaml:', err);
    return;
  }

  for (const account of (config.accounts ?? []) as Record<string, unknown>[]) {
    try {
      await addAccount(account);
    } catch (err) {
      console.error('[config] Error adding account:', err);
    }
  }

  for (const bucket of (config.buckets ?? []) as Record<string, unknown>[]) {
    try {
      await addBucket(bucket);
    } catch (err) {
      console.error('[config] Error adding bucket:', err);
    }
  }

  for (const template of (config.templates ?? []) as Record<string, unknown>[]) {
    try {
      await addTemplate(template);
    } catch (err) {
      console.error('[config] Error adding template:', err);
    }
  }

  console.log(
    `[config] Config loaded: ${(config.accounts ?? []).length} accounts, ` +
      `${(config.buckets ?? []).length} buckets, ${(config.templates ?? []).length} templates`,
  );
}

async function addAccount(account: Record<string, unknown>): Promise<void> {
  const { username, emailHost, emailPort, password, name } = account as Record<string, string>;
  if (!username || !emailHost || !emailPort || !password) {
    throw new ConfigError('Invalid account data: missing required fields');
  }
  const existing = await prisma.account.findUnique({ where: { username } });
  if (existing) return;

  let resolvedPassword = password;
  if (password.startsWith('env:')) {
    const envVar = password.slice(4);
    resolvedPassword = process.env[envVar] ?? '';
    if (!resolvedPassword) throw new ConfigError(`Environment variable ${envVar} not found`);
  }

  await prisma.account.create({
    data: {
      name: name || username,
      username,
      emailHost,
      emailPort: typeof emailPort === 'string' ? parseInt(emailPort, 10) : Number(emailPort),
      passwordEnc: encryptSecret(resolvedPassword),
      password: null,
    },
  });
}

async function addBucket(bucket: Record<string, unknown>): Promise<void> {
  const { name, path, accessKeyId, secretAccessKey, region } = bucket as Record<string, string>;
  if (!name || !path || !accessKeyId || !secretAccessKey || !region) {
    throw new ConfigError('Invalid bucket data: missing required fields');
  }
  const existing = await prisma.bucket.findUnique({ where: { name } });
  if (existing) return;

  let resolvedAccessKeyId = accessKeyId;
  if (accessKeyId.startsWith('env:')) {
    const envVar = accessKeyId.slice(4);
    resolvedAccessKeyId = process.env[envVar] ?? '';
    if (!resolvedAccessKeyId) throw new ConfigError(`Environment variable ${envVar} not found`);
  }

  let resolvedSecretAccessKey = secretAccessKey;
  if (secretAccessKey.startsWith('env:')) {
    const envVar = secretAccessKey.slice(4);
    resolvedSecretAccessKey = process.env[envVar] ?? '';
    if (!resolvedSecretAccessKey) throw new ConfigError(`Environment variable ${envVar} not found`);
  }

  await prisma.bucket.create({
    data: {
      name,
      path,
      region,
      accessKeyIdEnc: encryptSecret(resolvedAccessKeyId),
      secretAccessKeyEnc: encryptSecret(resolvedSecretAccessKey),
      accessKeyId: null,
      secretAccessKey: null,
    },
  });
}

async function addTemplate(template: Record<string, unknown>): Promise<void> {
  const storageType = (template.storageType as string) || 'LOCAL';
  const { name, subject, filename, bucketId } = template as Record<string, string>;

  const existing = await prisma.template.findUnique({ where: { name } });
  if (existing) return;

  if (storageType === 'S3') {
    if (!name || !subject || !filename || !bucketId) {
      throw new ConfigError('Invalid S3 template: missing required fields');
    }
    const bucket = await prisma.bucket.findUnique({ where: { name: bucketId } });
    if (!bucket) throw new ConfigError(`Bucket '${bucketId}' not found`);
    await prisma.template.create({
      data: { name, subject, filename, storageType: 'S3', bucketId: bucket.id },
    });
  } else {
    if (!name || !subject || !filename) {
      throw new ConfigError('Invalid LOCAL template: missing required fields');
    }
    await prisma.template.create({
      data: { name, subject, filename, storageType: 'LOCAL' },
    });
  }
}
