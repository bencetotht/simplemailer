import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Account, Template } from 'database';
import type { MailJob, WorkerConfig } from './types';
import { RetryableMailError } from './errors';

const mocks = vi.hoisted(() => {
  const sendMail = vi.fn();
  return {
    sendMail,
    createTransport: vi.fn(() => ({ sendMail })),
    compileTemplate: vi.fn(async () => ({ html: '<p>Hello</p>' })),
  };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
  createTransport: mocks.createTransport,
}));

vi.mock('./template', () => ({
  compileTemplate: mocks.compileTemplate,
}));

import { sendImmutableMail, sendMail } from './mail';

const account = {
  username: 'sender@example.com',
  emailHost: 'smtp.example.com',
  emailPort: 587,
  password: 'secret',
} satisfies Pick<Account, 'username' | 'emailHost' | 'emailPort'> & { password: string };

const template = {
  id: 'template-1',
  name: 'Welcome',
  subject: 'Welcome',
  filename: 'welcome.mjml',
  storageType: 'LOCAL',
  bucketId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Template;

const job = {
  accountId: 'account-1',
  templateId: 'template-1',
  recipient: 'reader@example.com',
  values: {},
} satisfies MailJob;

const config = {
  smtpRejectUnauthorized: true,
} as WorkerConfig;

describe('sendMail delivery boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendMail.mockResolvedValue({ accepted: [job.recipient] });
  });

  test('runs the delivery-start callback immediately before SMTP', async () => {
    const order: string[] = [];
    const callback = vi.fn(async () => {
      order.push('callback');
    });
    mocks.sendMail.mockImplementationOnce(async () => {
      order.push('smtp');
    });

    await sendMail(account, template, job, config, null, callback);

    expect(order).toEqual(['callback', 'smtp']);
    expect(callback).toHaveBeenCalledOnce();
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });

  test('does not call SMTP when the delivery-start callback fails', async () => {
    const callback = vi.fn(async () => {
      throw new Error('lease expired');
    });

    await expect(
      sendMail(account, template, job, config, null, callback),
    ).rejects.toBeInstanceOf(RetryableMailError);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  test('classifies an SMTP failure after the callback succeeds', async () => {
    const callback = vi.fn();
    mocks.sendMail.mockRejectedValueOnce(Object.assign(new Error('try later'), {
      code: 'ETIMEDOUT',
    }));

    await expect(
      sendMail(account, template, job, config, null, callback),
    ).rejects.toBeInstanceOf(RetryableMailError);
    expect(callback).toHaveBeenCalledOnce();
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });

  test('sends a persisted immutable snapshot without compiling a template', async () => {
    await sendImmutableMail(
      account,
      {
        recipient: 'reader@example.com',
        resolvedFrom: 'SimpleMailer <sender@example.com>',
        resolvedReplyTo: 'support@example.com',
        subject: 'Persisted subject',
        html: '<p>Persisted HTML</p>',
        text: 'Persisted text',
      },
      config,
    );

    expect(mocks.compileTemplate).not.toHaveBeenCalled();
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: 'SimpleMailer <sender@example.com>',
      replyTo: 'support@example.com',
      to: 'reader@example.com',
      subject: 'Persisted subject',
      html: '<p>Persisted HTML</p>',
      text: 'Persisted text',
    });
  });
});
