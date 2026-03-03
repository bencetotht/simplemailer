import type { Account, Template } from 'database';
import type { MailJob, WorkerConfig } from './types';
import { ValueError, MailerError } from './errors';
import { compileTemplate } from './template';
import type * as Minio from 'minio';

const nodemailer = require('nodemailer').default || require('nodemailer');

type AccountCredentials = Pick<Account, 'username' | 'password' | 'emailHost' | 'emailPort'>;

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
      tls: {
        rejectUnauthorized: false,
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
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOTFOUND')) {
      // Bad host configuration — permanent failure, do not retry
      throw new ValueError(message);
    }
    throw new MailerError(message);
  }
}
