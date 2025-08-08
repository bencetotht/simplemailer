import { IsNotEmpty, IsNumber, IsObject, IsString } from "class-validator";

export class MailJobValidator {
    @IsNotEmpty()
    @IsString()
    accountId: string;

    @IsNotEmpty()
    @IsString()
    templateId: string;

    @IsNotEmpty()
    @IsString()
    recipient: string;

    @IsNotEmpty()
    @IsObject()
    values: Record<string, any>;
}

export class AccountValidator {
    @IsNotEmpty()
    @IsString()
    name: string;
    
    @IsNotEmpty()
    @IsString()
    username: string;

    @IsNotEmpty()
    @IsString()
    password: string;

    @IsNotEmpty()
    @IsString()
    emailHost: string;

    @IsNotEmpty()
    @IsNumber()
    emailPort: number;
}

export class BucketValidator {
    @IsNotEmpty()
    @IsString()
    name: string;
    
    @IsNotEmpty()
    @IsString()
    path: string;

    @IsNotEmpty()
    @IsString()
    accessKeyId: string;

    @IsNotEmpty()
    @IsString()
    secretAccessKey: string;

    @IsNotEmpty()
    @IsString()
    region: string;
}