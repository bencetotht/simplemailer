import type { Account, Template } from 'database';
import type { MailJob, WorkerConfig } from './types';
import { PermanentMailError, RetryableMailError, ValueError } from './errors';
import { compileTemplate } from './template';
import type * as Minio from 'minio';

const nodemailer = require('nodemailer').default || require('nodemailer');

type AccountCredentials = Pick<Account, 'username' | 'emailHost' | 'emailPort'> & { password: string };

type MailerLikeError = Error & {
  code?: string;
  responseCode?: number;
};

const RETRYABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNECTION',
  'EAI_AGAIN',
  'ESOCKET',
]);

const PERMANENT_CODES = new Set([
  'EAUTH',
  'EENVELOPE',
  'EADDRESS',
  'ENOTFOUND',
  'EINVAL',
]);

function classifySendError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const mailerErr = error as MailerLikeError;

  if (mailerErr.code && PERMANENT_CODES.has(mailerErr.code)) {
    return new PermanentMailError(message);
  }

  if (mailerErr.responseCode && mailerErr.responseCode >= 500) {
    return new PermanentMailError(message);
  }

  if (mailerErr.responseCode && mailerErr.responseCode >= 400 && mailerErr.responseCode < 500) {
    return new RetryableMailError(message);
  }

  if (mailerErr.code && RETRYABLE_CODES.has(mailerErr.code)) {
    return new RetryableMailError(message);
  }

  return new RetryableMailError(message);
}

export async function sendMail(
  account: AccountCredentials,
  template: Template,
  data: MailJob,
  config: WorkerConfig,
  s3Client: Minio.Client | null,
): Promise<void> {
  const compiled = await compileTemplate(template, data.values, config, s3Client);
  const port = account.emailPort ?? 587;

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: account.emailHost,
      port,
      secure: port === 465,
      auth: {
        user: account.username,
        pass: account.password,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      tls: {
        rejectUnauthorized: config.smtpRejectUnauthorized,
      },
    });
  } catch (err) {
    throw new ValueError(`Failed to initialize mailer: ${err}`);
  }

  try {
    await transporter.sendMail({
      from: account.username,
      to: data.recipient,
      subject: template.subject,
      html: compiled.html,
    });
  } catch (err) {
    throw classifySendError(err);
  }
}
