import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { MailJob } from "./interfaces/mail";
import { Account, Log, Status, Template } from "@prisma/client";
import { ValueError } from "./value.error";

@Injectable()
export class DbService {
    constructor(private readonly prisma: PrismaService) {}

    async createLog(data: MailJob): Promise<Log> {
        return this.prisma.log.create({
            data: {
                accountId: data.accountId,
                recipient: data.recipient,
                templateId: data.templateId,
                values: data.values,
                status: Status.PENDING,
            },
        });
    }

    async updateLogStatus(id: string, status: Status): Promise<Log> {
        return this.prisma.log.update({
            where: { id },
            data: {
                status: status,
            },
        });
    }

    async getCredentials(accountId: string): Promise<Partial<Account>> {
        try {
            const account = await this.prisma.account.findUnique({
                where: { id: accountId },
                select: {
                username: true,
                password: true,
                emailHost: true,
                emailPort: true,
            },
        });

        if (!account) throw new ValueError(`Account with id ${accountId} not found`);

        return account;
    } catch (error) {
            throw new ValueError(`Failed to get credentials for account with id ${accountId}: ${error}`);
        }
    }

    async getTemplate(templateId: string): Promise<Template> {
        try {
            const template = await this.prisma.template.findUnique({
                where: { id: templateId },
            });

            if (!template) throw new ValueError(`Template with id ${templateId} not found`);

            return template;
        } catch (error) {
            throw new ValueError(`Failed to get template for template with id ${templateId}: ${error}`);
        }
    }

    async validateTemplate(templateId: string): Promise<void> {
        const template = await this.prisma.template.findUnique({
            where: { id: templateId },
        });

        if (!template) throw new ValueError(`Template with id ${templateId} not found`);
        return;
    }

    async validateAccount(accountId: string): Promise<void> {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
        });

        if (!account) throw new ValueError(`Account with id ${accountId} not found`);
        return;
    }

    async getMetrics(): Promise<{ accounts: number, templates: number, sentMails: number, failedMails: number, pendingMails: number }> {
        const accounts = await this.prisma.account.count();
        const templates = await this.prisma.template.count();
        const sentMails = await this.prisma.log.count({
            where: {
                status: Status.SENT,
            },
        });
        const failedMails = await this.prisma.log.count({
            where: {
                status: Status.FAILED,
            },
        });
        const pendingMails = await this.prisma.log.count({
            where: {
                status: {
                    in: [Status.PENDING, Status.RETRYING],
                },
            },
        });
        return { accounts, templates, sentMails, failedMails, pendingMails };
    }
}