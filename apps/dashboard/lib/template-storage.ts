import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type BucketLocationConstraint,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

let client: S3Client | null = null;

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function getConfig(): { client: S3Client; bucket: string; region: string; endpoint?: string } {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is required");

  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY must be configured together");
  }

  const region = process.env.S3_REGION || "us-east-1";
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const config: S3ClientConfig = {
    region,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE),
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
            ...(process.env.S3_SESSION_TOKEN
              ? { sessionToken: process.env.S3_SESSION_TOKEN }
              : {}),
          },
        }
      : {}),
  };

  client ??= new S3Client(config);
  return { client, bucket, region, endpoint };
}

function isMissingBucket(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" ||
    candidate.name === "NoSuchBucket" ||
    candidate.$metadata?.httpStatusCode === 404;
}

async function ensureBucket(
  s3: S3Client,
  bucket: string,
  region: string,
  endpoint?: string,
): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (error) {
    if (!isMissingBucket(error) || !parseBoolean(process.env.S3_CREATE_BUCKET)) throw error;
  }

  await s3.send(new CreateBucketCommand({
    Bucket: bucket,
    ...(!endpoint && region !== "us-east-1"
      ? { CreateBucketConfiguration: { LocationConstraint: region as BucketLocationConstraint } }
      : {}),
  }));
}

export async function putTemplate(filename: string, content: string): Promise<void> {
  const config = getConfig();
  await ensureBucket(config.client, config.bucket, config.region, config.endpoint);
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: filename,
    Body: Buffer.from(content, "utf8"),
    ContentType: "application/mjml+xml; charset=utf-8",
  }));
}

export async function getTemplate(filename: string): Promise<string> {
  const { client: s3, bucket } = getConfig();
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: filename }));
  if (!response.Body) throw new Error(`Template object ${filename} has no body`);
  return response.Body.transformToString("utf-8");
}

export async function deleteTemplate(filename: string): Promise<void> {
  const { client: s3, bucket } = getConfig();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: filename }));
}
