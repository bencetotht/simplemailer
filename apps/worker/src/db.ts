import { prisma } from 'database';
import type { Account, Log, Template } from 'database';
import { Status } from 'database';
import type { MailJob } from './types';
import { ValueError } from './errors';

export async function createLog(data: MailJob): Promise<Log> {
  return prisma.log.create({
    data: {
      accountId: data.accountId,
      recipient: data.recipient,
      templateId: data.templateId,
      values: data.values as object,
      status: Status.PENDING,
    },
  });
}

export async function updateLogStatus(id: string, status: Status): Promise<Log> {
  return prisma.log.update({ where: { id }, data: { status } });
}

export async function getCredentials(
  accountId: string,
): Promise<Pick<Account, 'username' | 'password' | 'emailHost' | 'emailPort'>> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { username: true, password: true, emailHost: true, emailPort: true },
  });
  if (!account) throw new ValueError(`Account ${accountId} not found`);
  return account;
}

export async function getTemplate(templateId: string): Promise<Template> {
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) throw new ValueError(`Template ${templateId} not found`);
  return template;
}

export async function validateAccount(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new ValueError(`Account ${accountId} not found`);
}

export async function validateTemplate(templateId: string): Promise<void> {
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) throw new ValueError(`Template ${templateId} not found`);
}

export async function getMetrics(): Promise<{
  accounts: number;
  templates: number;
  sentMails: number;
  failedMails: number;
  pendingMails: number;
}> {
  const [accounts, templates, sentMails, failedMails, pendingMails] = await Promise.all([
    prisma.account.count(),
    prisma.template.count(),
    prisma.log.count({ where: { status: Status.SENT } }),
    prisma.log.count({ where: { status: Status.FAILED } }),
    prisma.log.count({ where: { status: { in: [Status.PENDING, Status.RETRYING] } } }),
  ]);
  return { accounts, templates, sentMails, failedMails, pendingMails };
}
