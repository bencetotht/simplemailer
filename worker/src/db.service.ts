import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { MailJob } from "./interfaces/mail";
import { Log, Status } from "@prisma/client";

@Injectable()
export class DbService {
    constructor(private readonly prisma: PrismaService) {}

    async createLog(data: MailJob): Promise<Log> {
        return this.prisma.log.create({
            data: {
                ...data,
                status: Status.PENDING,
            },
        });
    }
}