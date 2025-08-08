export interface MailJob {
  accountId: string;
  templateId: string;
  recipient: string;
  values: Record<string, any>;
}
