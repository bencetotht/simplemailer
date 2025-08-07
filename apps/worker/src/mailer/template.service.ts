import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import mjml from 'mjml';
import Handlebars from 'handlebars';
import { Template } from 'database';
import { S3Service } from 'src/s3.service';

@Injectable()
export class TemplateService {
  constructor(
    // private readonly s3: S3Service,
  ) {}

  createMail = async (template: Template, values: Record<string, string>): Promise<{ html: string; json: any; errors: any[] }> => {
    // // const mailFile = await this.s3.getTemplate(template.id) as unknown as string;
    // const compiled = mjml(mailFile, {
    //   preprocessors: [
    //     (rawMjml) => {
    //       const filler = Handlebars.compile(rawMjml);
    //       const filled = filler(values);
    //       return filled;
    //     },
    //   ],
    // });
    // return compiled;
    return {html: '', json: {}, errors: []};
  };
}