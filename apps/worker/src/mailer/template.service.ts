import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
const mjml = require('mjml').default || require('mjml');
import Handlebars from 'handlebars';
import { Template } from 'database';
import { DbService } from 'src/db.service';
import * as fs from 'fs';
import { ValueError } from 'src/value.error';

@Injectable()
export class TemplateService {
  constructor(private readonly dbService: DbService) {}

  createMail = async (templateId: string, values: Record<string, any>): Promise<{ html: string; json: any; errors: any[] }> => {
    const template: string = await this.getTemplate(templateId);
    const compiled = mjml(template, {
      preprocessors: [
        (rawMjml) => {
          const filler = Handlebars.compile(rawMjml);
          const filled = filler(values);
          return filled;
        },
      ],
    });
    return compiled;
  };

  getTemplate = async (templateId: string): Promise<string> => {
    const template = await this.dbService.getTemplate(templateId);
    if (template.storageType == 'S3') {
      // return await this.s3Service.getTemplate(template.filename);
      return '';
    } else if (template.storageType == 'LOCAL') {
      return fs.readFileSync(`../../templates/${template.filename}`, 'utf8'); // TODO: change to env variable
    } else {
      throw new ValueError('Invalid template storage type');
    }
  }
}