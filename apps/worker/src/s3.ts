import * as Minio from 'minio';
import type { WorkerConfig } from './types';

export function createS3Client(config: WorkerConfig): Minio.Client | null {
  const { s3Endpoint, s3Port, s3AccessKey, s3SecretKey } = config;
  if (!s3Endpoint || !s3AccessKey || !s3SecretKey) {
    console.warn('[s3] S3 config missing — S3-backed templates will be unavailable');
    return null;
  }
  return new Minio.Client({
    endPoint: s3Endpoint,
    port: s3Port || undefined,
    useSSL: false,
    accessKey: s3AccessKey,
    secretKey: s3SecretKey,
  });
}

export async function getTemplateFromS3(
  client: Minio.Client,
  bucket: string,
  filename: string,
): Promise<string> {
  const stream = await client.getObject(bucket, filename);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}
