import { Injectable, Logger } from "@nestjs/common";
import { Account, Template } from "@prisma/client";
import { MailJob } from "src/interfaces/mail";
import { TemplateService } from "./template.service";
import { Transporter } from "nodemailer";
const nodemailer = require('nodemailer').default || require('nodemailer');
import { MailerError } from "./mailer.error";
import { ValueError } from "src/value.error";

@Injectable()
export class MailService {
    private logger = new Logger('MailerService');
    constructor(private readonly templateService: TemplateService) {}

    async sendMail(account: Partial<Account>, template: Template, data: MailJob): Promise<void> {
        let transporter: Transporter;
        try {
            transporter = await this.initMail(account);
        }
        catch(err) {
            throw new ValueError(`Failed to initialize mailer: ${err}`);
        }
        const compiled = await this.templateService.createMail(template.id, data.values);

        const mailMessage = {
            from: account.username,
            to: data.recipient, 
            subject: template.subject,
            html: compiled.html,
            attachments: [],
        }

        try {
            await transporter.sendMail(mailMessage);
        }catch(err) {
            if (err.message.includes('ENOTFOUND')) { // if the base configuration is wrong, don't retry sending the mail
                throw new ValueError(err);
            }
            throw new MailerError(err); // if other problem occours, retry sending the mail
        }
    }

    private async initMail(account: Partial<Account>): Promise<Transporter> {
        return nodemailer.createTransport({
            host: account.emailHost,
            port: 465,
            secure: true,
            auth: {
                user: account.username,
                pass: account.password,
            },
            tls: {
                rejectUnauthorized: false,
            },
        });
    }
}