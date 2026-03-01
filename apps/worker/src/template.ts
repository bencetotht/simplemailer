import * as fs from 'fs';
import type { Template } from 'database';
import type { WorkerConfig } from './types';
import { ValueError } from './errors';
import type * as Minio from 'minio';
import { getTemplateFromS3 } from './s3';
import Handlebars from 'handlebars';

const mjml = require('mjml').default || require('mjml');

export async function compileTemplate(
  template: Template,
  values: Record<string, unknown>,
  config: WorkerConfig,
  s3Client: Minio.Client | null,
): Promise<{ html: string }> {
  const raw = await loadTemplateSource(template, config, s3Client);

  const compiled = mjml(raw, {
    preprocessors: [
      (rawMjml: string) => {
        const filler = Handlebars.compile(rawMjml);
        return filler(values);
      },
    ],
  });

  return { html: compiled.html };
}

async function loadTemplateSource(
  template: Template,
  config: WorkerConfig,
  s3Client: Minio.Client | null,
): Promise<string> {
  if (template.storageType === 'S3') {
    if (!s3Client || !config.s3Bucket) {
      throw new ValueError('S3 client not configured — cannot load S3 template');
    }
    return getTemplateFromS3(s3Client, config.s3Bucket, template.filename);
  } else if (template.storageType === 'LOCAL') {
    const path = `${config.templatePath}/${template.filename}`;
    try {
      return fs.readFileSync(path, 'utf8');
    } catch {
      throw new ValueError(`Template file not found: ${path}`);
    }
  } else {
    throw new ValueError(`Unknown storage type: ${template.storageType}`);
  }
}
