import * as fs from 'fs';
import type { Template } from 'database';
import type { WorkerConfig } from './types';
import { ValueError } from './errors';
import type { S3Client } from '@aws-sdk/client-s3';
import { getTemplateFromS3 } from './s3';
import Handlebars from 'handlebars';
import * as path from 'path';

const mjml = require('mjml').default || require('mjml');

export async function compileTemplate(
  template: Template,
  values: Record<string, unknown>,
  config: WorkerConfig,
  s3Client: S3Client | null,
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

  if (compiled.errors?.length) {
    throw new ValueError(
      `MJML validation failed: ${compiled.errors.map((error: { message: string }) => error.message).join('; ')}`,
    );
  }
  if (!compiled.html?.trim()) {
    throw new ValueError('MJML compilation produced empty HTML');
  }

  return { html: compiled.html };
}

async function loadTemplateSource(
  template: Template,
  config: WorkerConfig,
  s3Client: S3Client | null,
): Promise<string> {
  if (template.storageType === 'S3') {
    if (!s3Client || !config.s3Bucket) {
      throw new ValueError('S3 client not configured — cannot load S3 template');
    }
    return getTemplateFromS3(s3Client, config.s3Bucket, template.filename);
  } else if (template.storageType === 'LOCAL') {
    const templateRoot = path.resolve(config.templatePath);
    const filePath = path.resolve(templateRoot, template.filename);
    if (!filePath.startsWith(`${templateRoot}${path.sep}`)) {
      throw new ValueError('Template filename escapes the configured template directory');
    }
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      throw new ValueError(`Template file not found: ${filePath}`);
    }
  } else {
    throw new ValueError(`Unknown storage type: ${template.storageType}`);
  }
}
