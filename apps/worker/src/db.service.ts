import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { MailJob } from "./interfaces/mail";
import { Account, Log, Status } from "database";
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

    async getTemplateName(templateId: string): Promise<string> {
        try {
            const template = await this.prisma.template.findUnique({
                where: { id: templateId },
                select: { name: true },
            });

            if (!template) throw new ValueError(`Template with id ${templateId} not found`);

            return template.name;
        } catch (error) {
            throw new ValueError(`Failed to get template name for template with id ${templateId}: ${error}`);
        }
    }
}