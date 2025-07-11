import { Injectable } from "@nestjs/common";

@Injectable()
export class MailService {
    constructor() {}

    async sendMail(data: any) {
        return true;
    }
}