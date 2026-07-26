import { GetObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import type { WorkerConfig } from './types';

export function createS3Client(config: WorkerConfig): S3Client | null {
  if (!config.s3Bucket) {
    console.warn('[s3] S3_BUCKET missing — S3-backed templates will be unavailable');
    return null;
  }
  if (Boolean(config.s3AccessKey) !== Boolean(config.s3SecretKey)) {
    throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY must be configured together');
  }

  const clientConfig: S3ClientConfig = {
    region: config.s3Region,
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
    forcePathStyle: config.s3ForcePathStyle,
    ...(config.s3AccessKey && config.s3SecretKey
      ? {
          credentials: {
            accessKeyId: config.s3AccessKey,
            secretAccessKey: config.s3SecretKey,
            ...(config.s3SessionToken ? { sessionToken: config.s3SessionToken } : {}),
          },
        }
      : {}),
  };
  return new S3Client(clientConfig);
}

export async function getTemplateFromS3(
  client: S3Client,
  bucket: string,
  filename: string,
): Promise<string> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: filename }));
  if (!response.Body) throw new Error(`Template object ${filename} has no body`);
  return response.Body.transformToString('utf-8');
}
