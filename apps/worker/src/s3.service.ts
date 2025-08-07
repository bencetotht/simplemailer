import { Injectable, Logger } from "@nestjs/common";
import { DbService } from "./db.service";
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
    private minioClient: Minio.Client;
    private logger = new Logger(S3Service.name);

    constructor(private readonly dbService: DbService) {
      if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY || !process.env.S3_BUCKET) {
        throw new Error('S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY and S3_BUCKET must be set');
      }
      this.minioClient = new Minio.Client({
        endPoint: process.env.S3_ENDPOINT,
        useSSL: false,
        accessKey: process.env.S3_ACCESS_KEY,
        secretKey: process.env.S3_SECRET_KEY,
      });
    }

    async getTemplate(templateId: string): Promise<Readable> {
      try {
        const templateName = await this.dbService.getTemplateName(templateId);
        const template = await this.minioClient.getObject(process.env.S3_BUCKET || '', templateName);
        return template;
      } catch(err) {
        this.logger.error(`Failed to get template ${templateId}: ${err}`);
        throw err;
      }
    }
}