import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiService } from './api.service';
import { Account, Bucket, Log, Template } from 'database';
import {
  AccountValidator,
  BucketValidator,
  MailJobValidator,
} from './interfaces/validator';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  // Health Check
  @Get('health')
  public async health() {
    return {
      status: 'ok',
      message: 'API is healthy',
      version: process.env.npm_package_version,
    };
  }

  // Get Jobs
  @Get('jobs')
  public async getJobs(): Promise<Record<string, any>[]> {
    return await this.apiService.getJobs();
  }

  // Get Logs
  @Get('logs')
  public async getLogs(
    @Query('limit') limit: number = 10,
  ): Promise<Partial<Log>[]> {
    return await this.apiService.getLogs(limit);
  }

  // Send Mail
  @Post('send')
  public async sendMail(@Body() data: MailJobValidator) {
    return await this.apiService.sendMail(data);
  }

  // Accounts
  @Get('account')
  public async getAccount(
    @Query('id') id: string,
  ): Promise<Partial<Account>[]> {
    return await this.apiService.getAccount(id);
  }

  @Post('account')
  public async createAccount(@Body() data: AccountValidator) {
    return await this.apiService.createAccount(data);
  }

  // Buckets
  @Get('bucket')
  public async getBucket(): Promise<Partial<Bucket>[]> {
    return await this.apiService.getBucket();
  }

  @Post('bucket')
  public async createBucket(@Body() data: BucketValidator) {
    return await this.apiService.createBucket(data);
  }

  // Templates
  @Get('template')
  public async getTemplates(): Promise<Partial<Template>[]> {
    return await this.apiService.getTemplates();
  }
  @Get('template/:id')
  public async getTemplate(
    @Param('id') id: string,
  ): Promise<{ success: string; data: string }> {
    return {
      success: 'true',
      data: await this.apiService.getTemplate(id),
    };
  }
}
