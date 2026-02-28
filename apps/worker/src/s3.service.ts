import { Injectable, Logger } from '@nestjs/common';
import { DbService } from './db.service';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  private minioClient?: Minio.Client;
  private logger = new Logger(S3Service.name);

  constructor(private readonly dbService: DbService) {
    const s3Endpoint = process.env.S3_ENDPOINT;
    const s3AccessKey = process.env.S3_ACCESS_KEY;
    const s3SecretKey = process.env.S3_SECRET_KEY;
    const s3Bucket = process.env.S3_BUCKET;

    const hasS3Config = !!s3Endpoint && !!s3AccessKey && !!s3SecretKey && !!s3Bucket;

    if (!hasS3Config) {
      this.logger.warn(
        'S3 config is missing. S3-backed templates will be unavailable until S3_* env vars are set.',
      );
      return;
    }

    this.minioClient = new Minio.Client({
      endPoint: s3Endpoint,
      useSSL: false,
      accessKey: s3AccessKey,
      secretKey: s3SecretKey,
    });
  }

  async getTemplate(templateId: string): Promise<Readable> {
    try {
      if (!this.minioClient || !process.env.S3_BUCKET) {
        throw new Error('S3 is not configured');
      }
      const res = await this.dbService.getTemplate(templateId);
      const templateName = res.filename;
      const template = await this.minioClient.getObject(
        process.env.S3_BUCKET,
        templateName,
      );
      return template;
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }
}
