import {  Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Account, Bucket, Log, Template } from "database";
import { AccountValidator, BucketValidator, MailJobValidator } from "./interfaces/validator";
import { MailJob } from "./interfaces/mail";
import { QueueService } from "./queue.service";
import * as fs from 'fs';
import { ValueError } from "./value.error";
@Injectable()
export class ApiService {
  constructor(private readonly prisma: PrismaService, private readonly queueService: QueueService) {}

  // Jobs
  public async getJobs(): Promise<Record<string, any>[]> {
    return await this.queueService.getQueue('mailer');
  }

  // Logs
  public async getLogs(limit: number = 10): Promise<Log[]> {
    return await this.prisma.log.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  // Mail
  public async sendMail(data: MailJobValidator): Promise<{ success: boolean; message: string; }> {
    return await this.queueService.addToQueue('mailer', data);
  }

  // Accounts
  public async createAccount(data: AccountValidator): Promise<{success: boolean, message: string}> {
    try {
      const result = await this.prisma.account.create({
        data,
      });

      return {
        success: true,
        message: result.id,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  public async getAccount(id: string): Promise<Partial<Account>[]> {
    return id != undefined ? await this.prisma.account.findMany({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        emailHost: true,
        createdAt: true,
      },
    }) : await this.prisma.account.findMany({
      select: {
        id: true,
        name: true,
        username: true,
      },
    });
  }

  // Buckets
  public async createBucket(data: BucketValidator): Promise<{success: boolean, message: string}> {
    try {
      const result = await this.prisma.bucket.create({
        data,
      });

      return {
        success: true,
        message: result.id,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  public async getBucket(): Promise<Partial<Bucket>[]> {
    return await this.prisma.bucket.findMany({select: {
      id: true,
      name: true,
      path: true,
      region: true,
    }});
  }

  // Templates
  public async getTemplates(): Promise<Partial<Template>[]> {
    return await this.prisma.template.findMany({select: {
      id: true,
      name: true,
    }});
  }

 public async getTemplate(id: string): Promise<string> {
    const template = await this.prisma.template.findUnique({where: {id}});
    if (!template) {
      throw new ValueError('Template not found');
    }
    if (template.storageType == 'S3') {
      // return await this.s3Service.getTemplate(template.filename);
      return '';
    } else {
      return fs.readFileSync(`../../templates/${template.filename}`, 'utf8'); //TODO: Change to env variable
    }
  }
}