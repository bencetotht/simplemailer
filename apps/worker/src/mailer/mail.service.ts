import { Injectable, Logger } from "@nestjs/common";
import { Account, Template } from "database";
import { MailJob } from "src/interfaces/mail";
import { TemplateService } from "./template.service";
import nodemailer, { Transporter } from "nodemailer";

@Injectable()
export class MailService {
    private logger = new Logger('MailerService');
    constructor(private readonly templateService: TemplateService) {}

    async sendMail(account: Account, template: Template, data: MailJob): Promise<boolean> {
        const transporter = await this.initMail(account);
        const compiled = await this.templateService.createMail(template, data.values);

        const mailMessage = {
            from: account.username,
            to: data.recipient, 
            subject: template.subject,
            html: compiled.html,
            attachments: [],
        }

        try {
            await transporter.sendMail(mailMessage);
            this.logger.log(`Mail sent to ${data.recipient}: ${template.subject}`)
            return true;
        }catch(err) {
            this.logger.error(`Failed sending mail to: ${data.recipient}: ${err}`)
            return false;
        }
    }

    private async initMail(account: Account): Promise<Transporter> {
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