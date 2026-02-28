import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import * as yaml from 'yaml';
import * as fs from 'fs';
import { Account, Bucket, Template } from "@prisma/client";
import { ConfigError } from "./config.error";
import { S3Service } from "./s3.service";

@Injectable()
export class ConfigParser implements OnModuleInit {
  private logger = new Logger(ConfigParser.name);

  constructor(private readonly prisma: PrismaService, private readonly s3Service: S3Service) {}

  async onModuleInit() {
    try {
      const fs = require('fs');
      // const exists = fs.existsSync(`${process.env.CONFIG_PATH}/config.yaml`);
      const exists = fs.existsSync(`../../config.yaml`);
      if (!exists) {
        this.logger.warn('config.yaml not found');
        return;
      }
      this.parseConfig(`../../config.yaml`);
    } catch (error) {
      this.logger.error('Error checking config.yaml:', error);
      return;
    }
  }

  // Parse config.yaml
  public async parseConfig(path: string): Promise<void> {
    try{
      const config = yaml.parse(fs.readFileSync(path, 'utf8'));
      
      // Add accounts to the database
      try {
        for (const account of config.accounts) {
          await this.addAccount(account);
        }
      } catch (error) {
        this.logger.error('Error adding accounts to the database:', error);
      }
      
      // Add buckets to the database
      try {
        for (const bucket of config.buckets) {
          await this.addBucket(bucket);
        }
      } catch (error) {
        this.logger.error('Error adding buckets to the database:', error);
      }
      
      // Add templates to the database
      try {
        for (const template of config.templates) {
          await this.addTemplate(template);
        }
      } catch (error) {
        this.logger.error('Error adding templates to the database:', error);
      }

      this.logger.log(`Config loaded successfully, with ${config.accounts.length} accounts, ${config.buckets.length} buckets, and ${config.templates.length} templates`);

      try {
        await this.validateTemplates();
      } catch (error) {
        this.logger.error('Error validating templates:', error);
      }
    } catch (error) {
      this.logger.error('Error parsing config.yaml: Invalid YAML format');
      return;
    }
  }

  // Add account to the database
  private async addAccount(account: Account): Promise<void> {
    try {
    const result = await this.prisma.account.findUnique({where: {username: account.username}});
      if (!result) {
        if (!account.username || !account.emailHost || !account.emailPort || !account.password) {
          throw new ConfigError('Invalid account data: missing required fields');
        }
          if (account.password.startsWith('env:')) {
          const envVar = account.password.slice(4);
          const password = process.env[envVar];
          if (!password) {
            throw new ConfigError(`Environment variable ${envVar} not found`);
          }
          account.password = password;
        }
        await this.prisma.account.create({
          data: account,
        });
      }
    } catch (error) {
      this.logger.error('Error adding account to the database:', error);
    }
  }

  // Add bucket to the database
  private async addBucket(bucket: Bucket): Promise<void> {
    try {
      const result = await this.prisma.bucket.findUnique({where: {name: bucket.name}});
      if (!result) {
        if (!bucket.name || !bucket.path || !bucket.accessKeyId || !bucket.secretAccessKey || !bucket.region) {
          throw new ConfigError('Invalid bucket data: missing required fields');
        }
        if (bucket.accessKeyId.startsWith('env:')) {
          const envVar = bucket.accessKeyId.slice(4);
          const accessKeyId = process.env[envVar];
          if (!accessKeyId) {
            throw new ConfigError(`Environment variable ${envVar} not found`);
          }
          bucket.accessKeyId = accessKeyId;
        }
        if (bucket.secretAccessKey.startsWith('env:')) {
          const envVar = bucket.secretAccessKey.slice(4);
          const secretAccessKey = process.env[envVar];
          if (!secretAccessKey) {
            throw new ConfigError(`Environment variable ${envVar} not found`);
          }
          bucket.secretAccessKey = secretAccessKey;
        }
        await this.prisma.bucket.create({
          data: bucket,
        });
      }
    } catch (error) {
      this.logger.error('Error adding bucket to the database:', error);
    }
  }

  // Add template to the database
  private async addTemplate(template: Template): Promise<void> {
    if (!template.storageType) {
      this.logger.warn(`No storage type found for template ${template.name}, defaulting to LOCAL`);
      template.storageType = "LOCAL";
    }
    try {
      const result = await this.prisma.template.findUnique({where: {name: template.name}});
      if (!result) {
        if (template.storageType == "S3") {
          if (!template.name || !template.subject || !template.filename || !template.bucketId) {
            throw new ConfigError('Invalid template data: missing required fields');
          }
          const bucket = await this.prisma.bucket.findUnique({where: {name: template.bucketId}});
          if (!bucket) {
            throw new ConfigError('Invalid template data: bucket not found');
          }
          if (!this.s3Service.getTemplate(template.filename)) {
            throw new ConfigError('Invalid template data: template not found');
          }
          await this.prisma.template.create({
            data: {
              ...template,
              bucketId: bucket.id
            },
          });
        } else if (template.storageType == "LOCAL") {
          if (!template.name || !template.subject || !template.filename) {
            throw new ConfigError('Invalid template data: missing required fields');
          }
          await this.prisma.template.create({
            data: template,
          });
        } else {
          throw new ConfigError('Invalid template data: storage type not found');
        }
      }
    } catch (error) {
      this.logger.error('Error adding template to the database:', error);
    }
  }

  // Validate templates
  private async validateTemplates(): Promise<void> {
    const tempCount = {
      local: 0,
      s3: 0,
    }
    const templates = await this.prisma.template.findMany();
    for (const template of templates) {
      if (template.storageType == "LOCAL") {
        // const file = fs.readFileSync(`${process.env.TEMPLATE_PATH}/${template.filename}`, 'utf8');
        try {
          fs.readFileSync(`../../templates/${template.filename}`, 'utf8');
        } catch (error) {
          throw new ConfigError(`Template ${template.filename} not found`);
        }
        tempCount.local++;
      }
      else if (template.storageType == "S3") {
        tempCount.s3++;
      }
    }
    this.logger.log(`Templates validated successfully with ${tempCount.local} local templates and ${tempCount.s3} S3 templates`);
  }
}