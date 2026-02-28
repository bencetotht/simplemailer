import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from 'database';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private static readonly DEV_DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/mailer';

  constructor() {
    const databaseUrl =
      process.env.DATABASE_URL ?? PrismaService.DEV_DATABASE_URL;

    if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
      throw new Error(
        'DATABASE_URL is required in production environment for Prisma',
      );
    }

    if (!process.env.DATABASE_URL) {
      // Explicitly log fallback usage so local startup behavior is predictable.
      Logger.warn(
        `DATABASE_URL not set, using development fallback: ${PrismaService.DEV_DATABASE_URL}`,
        PrismaService.name,
      );
    }

    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to database');
    } catch (error) {
      this.logger.error('Failed to connect to databases:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Disconnected from database');
    } catch (error) {
      this.logger.error('Error during disconnect:', error);
    }
  }
}
