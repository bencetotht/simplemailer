import * as Minio from "minio";

let client: Minio.Client | null = null;

function getConfig(): { client: Minio.Client; bucket: string } {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    throw new Error("S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET are required");
  }

  client ??= new Minio.Client({
    endPoint: endpoint,
    port: process.env.S3_PORT ? Number(process.env.S3_PORT) : undefined,
    useSSL: process.env.S3_USE_SSL === "true",
    accessKey,
    secretKey,
  });
  return { client, bucket };
}

async function ensureBucket(client: Minio.Client, bucket: string): Promise<void> {
  if (!(await client.bucketExists(bucket))) {
    try {
      await client.makeBucket(bucket);
    } catch (error) {
      if (!(await client.bucketExists(bucket))) throw error;
    }
  }
}

export async function putTemplate(filename: string, content: string): Promise<void> {
  const config = getConfig();
  await ensureBucket(config.client, config.bucket);
  const body = Buffer.from(content, "utf8");
  await config.client.putObject(
    config.bucket,
    filename,
    body,
    body.length,
    { "Content-Type": "application/mjml+xml; charset=utf-8" },
  );
}

export async function getTemplate(filename: string): Promise<string> {
  const { client, bucket } = getConfig();
  const stream = await client.getObject(bucket, filename);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export async function deleteTemplate(filename: string): Promise<void> {
  const { client, bucket } = getConfig();
  await client.removeObject(bucket, filename);
}
